import "dotenv/config";
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  isAddress,
  decodeErrorResult,
  decodeEventLog,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import MockUSDC from "../artifacts/contracts/MockUSDC.sol/MockUSDC.json";
import OZToken from "../artifacts/contracts/OZToken.sol/OZToken.json";
import BlockSwap from "../artifacts/contracts/BlockSwap.sol/BlockSwap.json";

const FILE = "deployments.baseSepolia.json";

// -------------------------
// env / knobs
// -------------------------

// ✅ hard minimums so you don't accidentally run faster than RPC/indexing can keep up
const MIN_SLEEP_MS = 1200;
const MIN_VIS_DELAY_MS = 1200;

const SLEEP_MS = Math.max(Number(process.env.SLEEP_MS || "1800"), MIN_SLEEP_MS);

const SMOKE_LOOPS = BigInt(process.env.SMOKE_LOOPS || "50");
const MULTI_LOOPS = BigInt(process.env.MULTI_LOOPS || "250");
const MULTI = (process.env.MULTI || "true").toLowerCase() === "true";

const VIS_TRIES = Number(process.env.VIS_TRIES || "80");
const VIS_DELAY_MS = Math.max(
  Number(process.env.VIS_DELAY_MS || String(SLEEP_MS)),
  MIN_VIS_DELAY_MS
);

const USE_BLOCKTAG_READS =
  (process.env.USE_BLOCKTAG_READS || "true").toLowerCase() === "true";

const RPC_RETRIES = Number(process.env.RPC_RETRIES || "10");
const RPC_BACKOFF_MS = Number(process.env.RPC_BACKOFF_MS || "700");
const STEP_RETRIES = Number(process.env.STEP_RETRIES || "4");

// funding thresholds
const MIN_TEST_ETH = parseUnits(process.env.MIN_TEST_ETH || "0.003", 18); // 0.003 ETH
const TOPUP_TEST_ETH = parseUnits(process.env.TOPUP_TEST_ETH || "0.01", 18); // requested topup

const MIN_TEST_USDC = parseUnits(process.env.MIN_TEST_USDC || "50", 6);
const TOPUP_TEST_USDC = parseUnits(process.env.TOPUP_TEST_USDC || "5000", 6);

// ✅ relayer/gasless/feed knobs
// default to 127.0.0.1 to avoid any IPv6/localhost weirdness
const RELAYER_URL = String(
  process.env.RELAYER_URL ||
    process.env.VITE_RELAYER_URL ||
    "http://127.0.0.1:3000"
).trim();

const GASLESS_SMOKE = (process.env.GASLESS_SMOKE || "true").toLowerCase() === "true";
const GASLESS_REQUIRED =
  (process.env.GASLESS_REQUIRED || "false").toLowerCase() === "true";

const FEED_SMOKE = (process.env.FEED_SMOKE || "true").toLowerCase() === "true";
const RELAYER_SYNC_LOOKBACK = Number(process.env.RELAYER_SYNC_LOOKBACK || "800");

const RELAYER_TIMEOUT_MS = Number(process.env.RELAYER_TIMEOUT_MS || "15000");

// -------------------------
// tiny utils
// -------------------------
function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}
function optEnv(name: string) {
  return process.env[name];
}
function mustAddr(name: string, v: string): `0x${string}` {
  if (!isAddress(v)) throw new Error(`Invalid address for ${name}: ${v}`);
  return v as `0x${string}`;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function errText(e: any) {
  return (e?.shortMessage ?? e?.message ?? String(e)) as string;
}
function isRetryableRpcError(e: any) {
  const s = errText(e).toLowerCase();
  if (s.includes("requested resource not found")) return true;
  if (s.includes("429")) return true;
  if (s.includes("rate limit")) return true;
  if (s.includes("timeout")) return true;
  if (s.includes("etimedout")) return true;
  if (s.includes("failed to fetch")) return true;
  if (s.includes("network error")) return true;
  if (s.includes("could not coalesce error")) return true;
  if (s.includes("connection closed")) return true;
  if (s.includes("bad gateway")) return true;
  if (s.includes("gateway timeout")) return true;

  // if it’s a revert, do not treat as retryable RPC flake
  if (s.includes("execution reverted")) return false;
  if (s.includes("revert")) return false;

  return false;
}

async function rpcRetry<T>(label: string, fn: () => Promise<T>, tries = RPC_RETRIES) {
  let lastErr: any;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const retryable = isRetryableRpcError(e);
      if (!retryable) throw e;
      const wait = RPC_BACKOFF_MS * i;
      console.log(
        `⚠️ RPC flake on ${label} (try ${i}/${tries}): ${errText(e)} -> retry in ${wait}ms`
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function waitUntil(
  label: string,
  fn: () => Promise<boolean>,
  tries = VIS_TRIES,
  delayMs = VIS_DELAY_MS
) {
  for (let i = 1; i <= tries; i++) {
    const ok = await fn();
    console.log(`${label} check ${i}/${tries}:`, ok ? "✅" : "…");
    if (ok) return true;
    await sleep(delayMs);
  }
  return false;
}

// ✅ robust fetch helper (shows REAL error + body)
async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), RELAYER_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text().catch(() => "");
    let j: any = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {}
    return { res, j, text };
  } catch (e: any) {
    // Node fetch errors often include cause.code (ECONNRESET, UND_ERR_SOCKET, etc)
    const causeCode = e?.cause?.code ? ` cause=${e.cause.code}` : "";
    const causeMsg = e?.cause?.message ? ` causeMsg=${e.cause.message}` : "";
    const msg = e?.message || String(e);
    throw new Error(`fetch failed: ${url} :: ${msg}${causeCode}${causeMsg}`);
  } finally {
    clearTimeout(t);
  }
}

// -------------------------
// error decode ABIs
// -------------------------
const IERC20_ERRORS_ABI = [
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
] as const;

const BLOCKSWAP_ERRORS_ABI = [
  { type: "error", name: "BuyPaused", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "BadConfig", inputs: [] },
  { type: "error", name: "NotEnoughInventory", inputs: [] },
  { type: "error", name: "VaultTooLow", inputs: [] },
  { type: "error", name: "NotRelayer", inputs: [] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "BadSig", inputs: [] },
  { type: "error", name: "LiabilityUnderflow", inputs: [] },
] as const;

function tryDecodeRevert(e: any) {
  const data =
    e?.data ?? e?.cause?.data ?? e?.cause?.cause?.data ?? e?.walk?.((x: any) => x?.data)?.[0];

  if (!data || typeof data !== "string" || !data.startsWith("0x")) return null;

  const abis = [BLOCKSWAP_ERRORS_ABI, IERC20_ERRORS_ABI, BlockSwap.abi, OZToken.abi, MockUSDC.abi];

  for (const abi of abis) {
    try {
      return decodeErrorResult({ abi, data: data as `0x${string}` });
    } catch {}
  }

  return { errorName: "REVERT (undecoded)", args: [] as any[] };
}

// -------------------------
// fee helper
// -------------------------
async function withFees(publicClient: any, req: any) {
  try {
    const fees = await rpcRetry("estimateFeesPerGas", () => publicClient.estimateFeesPerGas());
    const bump = (x: bigint) => (x * 112n) / 100n;
    return {
      ...req,
      maxFeePerGas: bump(fees.maxFeePerGas),
      maxPriorityFeePerGas: bump(fees.maxPriorityFeePerGas),
    };
  } catch {
    return req;
  }
}

// -------------------------
// tx helpers
// -------------------------
async function mustConfirm(publicClient: any, hash: `0x${string}`) {
  const r = await rpcRetry("waitForTransactionReceipt", () =>
    publicClient.waitForTransactionReceipt({ hash })
  );
  if (r.status !== "success") throw new Error(`TX reverted: ${hash}`);
  return r;
}

async function safeWrite(
  publicClient: any,
  walletClient: any,
  label: string,
  req: { address: `0x${string}`; abi: any; functionName: string; args: any[] }
) {
  try {
    const sim = await rpcRetry(`${label}.simulate`, () =>
      publicClient.simulateContract({
        account: walletClient.account,
        address: req.address,
        abi: req.abi,
        functionName: req.functionName,
        args: req.args,
      })
    );

    const requestWithFees = await withFees(publicClient, sim.request);
    const hash = await rpcRetry(`${label}.write`, () => walletClient.writeContract(requestWithFees));
    const r = await mustConfirm(publicClient, hash);

    console.log(`✅ ${label} tx:`, hash, "block:", r.blockNumber?.toString());
    await sleep(SLEEP_MS);

    return { ok: true as const, hash, receipt: r };
  } catch (e: any) {
    const decoded = tryDecodeRevert(e);
    if (decoded) console.log(`❌ ${label} failed:`, decoded.errorName, decoded.args ?? []);
    else console.log(`❌ ${label} failed: ${errText(e)}`);
    return { ok: false as const, error: e };
  }
}

// -------------------------
// ERC20 reads
// -------------------------
async function erc20Balance(
  publicClient: any,
  token: `0x${string}`,
  abi: any,
  who: `0x${string}`,
  blockTag?: bigint
) {
  return await rpcRetry(`balanceOf(${token.slice(0, 6)}..${who.slice(0, 6)})`, async () => {
    const req: any = { address: token, abi, functionName: "balanceOf", args: [who] };
    if (USE_BLOCKTAG_READS && typeof blockTag === "bigint" && blockTag > 0n) req.blockNumber = blockTag;
    return (await publicClient.readContract(req)) as bigint;
  });
}

async function erc20Allowance(
  publicClient: any,
  token: `0x${string}`,
  abi: any,
  owner: `0x${string}`,
  spender: `0x${string}`
) {
  return await rpcRetry(`allowance(${token.slice(0, 6)}..${owner.slice(0, 6)})`, async () => {
    return (await publicClient.readContract({
      address: token,
      abi,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
  });
}

async function ensureAllowance(
  publicClient: any,
  walletClient: any,
  token: `0x${string}`,
  tokenAbi: any,
  owner: `0x${string}`,
  spender: `0x${string}`,
  needed: bigint,
  label: string
) {
  const current = await erc20Allowance(publicClient, token, tokenAbi, owner, spender);
  if (current >= needed) return current;

  const approveAmt = needed * 50n;
  console.log(`\n▶ ${label} allowance low. current=${current} needed=${needed} -> approving ${approveAmt}`);

  try {
    await rpcRetry(`${label}.approve.sim`, () =>
      publicClient.simulateContract({
        account: walletClient.account,
        address: token,
        abi: tokenAbi,
        functionName: "approve",
        args: [spender, approveAmt],
      })
    );
  } catch (e: any) {
    const decoded = tryDecodeRevert(e);
    const msg = decoded ? `${decoded.errorName}` : errText(e);
    throw new Error(`${label} approve simulate failed: ${msg}`);
  }

  const direct = await safeWrite(publicClient, walletClient, `${label}.approve`, {
    address: token,
    abi: tokenAbi,
    functionName: "approve",
    args: [spender, approveAmt],
  });

  if (!direct.ok) {
    console.log(`ℹ️ ${label} approve failed; trying approve(0) then approve(amount)...`);

    const z = await safeWrite(publicClient, walletClient, `${label}.approve(0)`, {
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [spender, 0n],
    });
    if (!z.ok) throw new Error(`${label} approve(0) failed`);

    const s = await safeWrite(publicClient, walletClient, `${label}.approve(set)`, {
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [spender, approveAmt],
    });
    if (!s.ok) throw new Error(`${label} approve(set) failed`);
  }

  const ok = await waitUntil(`${label} allowance visibility`, async () => {
    const a = await erc20Allowance(publicClient, token, tokenAbi, owner, spender);
    return a >= needed;
  });

  if (!ok) {
    const final = await erc20Allowance(publicClient, token, tokenAbi, owner, spender);
    throw new Error(`${label} allowance not visible after approve. final=${final}`);
  }

  return await erc20Allowance(publicClient, token, tokenAbi, owner, spender);
}

// -------------------------
// BlockSwap reads
// -------------------------
async function readSwapAddrs(publicClient: any, SWAP: `0x${string}`) {
  const USDC = (await rpcRetry("SWAP.USDC", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "USDC", args: [] })
  )) as `0x${string}`;

  const OZ = (await rpcRetry("SWAP.OZ", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "OZ", args: [] })
  )) as `0x${string}`;

  const sellPerBrick = (await rpcRetry("SWAP.sellPricePerBrick", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "sellPricePerBrick", args: [] })
  )) as bigint;

  const floorPerBrick = (await rpcRetry("SWAP.buybackFloorPerBrick", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "buybackFloorPerBrick", args: [] })
  )) as bigint;

  const treasury = (await rpcRetry("SWAP.theBlockTreasury", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "theBlockTreasury", args: [] })
  )) as `0x${string}`;

  return { USDC, OZ, sellPerBrick, floorPerBrick, treasury };
}

async function readVaultAccounting(publicClient: any, SWAP: `0x${string}`) {
  const vault = (await rpcRetry("SWAP.vaultUSDC", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "vaultUSDC", args: [] })
  )) as bigint;

  const liab = (await rpcRetry("SWAP.floorLiabilityUSDC", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "floorLiabilityUSDC", args: [] })
  )) as bigint;

  const solvent = (await rpcRetry("SWAP.isSolvent", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "isSolvent", args: [] })
  )) as boolean;

  return { vault, liab, solvent };
}

async function discoverVaultAddress(publicClient: any, SWAP: `0x${string}`) {
  const candidates = [
    "buybackVault",
    "vault",
    "vaultWallet",
    "usdcVault",
    "reserveWallet",
    "theBlockVault",
    "buybackWallet",
    "vaultAddress",
  ];
  for (const fn of candidates) {
    try {
      const v = (await rpcRetry(`discover.${fn}`, () =>
        publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: fn, args: [] })
      )) as any;
      if (typeof v === "string" && isAddress(v)) return v as `0x${string}`;
    } catch {}
  }
  return null as `0x${string}` | null;
}

// -------------------------
// events
// -------------------------
function decodeBoughtFromReceipt(receipt: any) {
  for (const log of receipt.logs || []) {
    try {
      const ev = decodeEventLog({ abi: BlockSwap.abi, data: log.data, topics: log.topics });
      if (ev.eventName === "Bought") return ev;
    } catch {}
  }
  return null;
}

const ERC20_TRANSFER_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

function decodeErc20TransfersFromReceipt(receipt: any, tokenAddr: `0x${string}`) {
  const out: Array<{ from: string; to: string; value: bigint }> = [];
  for (const log of receipt.logs || []) {
    if (!log.address) continue;
    if (log.address.toLowerCase() !== tokenAddr.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ERC20_TRANSFER_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer") {
        // @ts-ignore
        const { from, to, value } = ev.args as any;
        out.push({ from, to, value: BigInt(value) });
      }
    } catch {}
  }
  return out;
}

// -------------------------
// math
// -------------------------
function costRoundedUp(ozWei: bigint, pricePerBrick6: bigint) {
  const denom = 36n * 10n ** 18n;
  const numer = ozWei * pricePerBrick6;
  return (numer + denom - 1n) / denom;
}
function costFloor(ozWei: bigint, pricePerBrick6: bigint) {
  const denom = 36n * 10n ** 18n;
  return (ozWei * pricePerBrick6) / denom;
}

// -------------------------
// funding helpers
// -------------------------
async function ensureWalletHasUsdc(args: {
  publicClient: any;
  min: bigint;
  topup: bigint;
  USDC: `0x${string}`;
  who: `0x${string}`;
  minterWallet: any; // must be MockUSDC owner if we want to mint
  label: string;
}) {
  const { publicClient, min, topup, USDC, who, minterWallet, label } = args;

  const bal = await erc20Balance(publicClient, USDC, MockUSDC.abi, who).catch(() => 0n);
  console.log(`${label}: USDC=${formatUnits(bal, 6)}`);

  if (bal >= min) return;

  console.log(`▶ ${label}: topping up USDC (mint if possible else transfer)`);

  const mintTry = await safeWrite(publicClient, minterWallet, `USDC.mint(${label})`, {
    address: USDC,
    abi: MockUSDC.abi,
    functionName: "mint",
    args: [who, topup],
  });

  if (!mintTry.ok) {
    const minterAddr = minterWallet.account.address as `0x${string}`;
    const minterBal = await erc20Balance(publicClient, USDC, MockUSDC.abi, minterAddr).catch(() => 0n);

    console.log(`ℹ️ mint failed; trying transfer from minter. minterUSDC=${formatUnits(minterBal, 6)}`);

    if (minterBal < topup) {
      throw new Error(
        `Cannot mint AND minter doesn't have enough USDC to transfer.\n` +
          `This usually means: your SWAP.USDC is not MockUSDC, OR deployer is not owner of MockUSDC.`
      );
    }

    const t = await safeWrite(publicClient, minterWallet, `USDC.transfer(${label})`, {
      address: USDC,
      abi: MockUSDC.abi,
      functionName: "transfer",
      args: [who, topup],
    });

    if (!t.ok) throw new Error(`Failed to transfer USDC to ${label}`);
  }

  const ok = await waitUntil(`${label} USDC visibility`, async () => {
    const b = await erc20Balance(publicClient, USDC, MockUSDC.abi, who).catch(() => 0n);
    return b >= min;
  });

  if (!ok) throw new Error(`${label} USDC top-up not visible`);
}

async function ensureGasAndFunds(args: {
  publicClient: any;
  deployerWallet: any;
  testWallet: any;
  USDC: `0x${string}`;
  SWAP: `0x${string}`;
}) {
  const { publicClient, deployerWallet, testWallet, USDC, SWAP } = args;
  const deployer = deployerWallet.account.address as `0x${string}`;
  const test = testWallet.account.address as `0x${string}`;

  const depEth = await rpcRetry("getBalance(deployer)", () => publicClient.getBalance({ address: deployer }));
  const testEth = await rpcRetry("getBalance(test)", () => publicClient.getBalance({ address: test }));

  console.log(`\nPreflight: deployer ETH=${formatUnits(depEth, 18)} | test ETH=${formatUnits(testEth, 18)}`);

  // 1) ETH topup
  if (testEth < MIN_TEST_ETH) {
    const gasReserve = parseUnits("0.002", 18); // keep some ETH for deployer gas
    const maxSend = depEth > gasReserve ? depEth - gasReserve : 0n;
    const sendAmt = TOPUP_TEST_ETH <= maxSend ? TOPUP_TEST_ETH : maxSend;

    if (sendAmt <= 0n) {
      throw new Error(
        `Deployer has insufficient ETH to top up test wallet. Fund deployer on Base Sepolia.\n` +
          `deployer=${deployer} balance=${formatUnits(depEth, 18)} ETH`
      );
    }

    console.log(`▶ topping up test ETH by ${formatUnits(sendAmt, 18)} ETH`);
    const hash = await rpcRetry("sendTransaction(ETH topup)", () =>
      deployerWallet.sendTransaction({ to: test, value: sendAmt })
    );
    await mustConfirm(publicClient, hash);
    await sleep(SLEEP_MS);
  }

  // 2) USDC topup for test wallet (mint/transfer)
  await ensureWalletHasUsdc({
    publicClient,
    min: MIN_TEST_USDC,
    topup: TOPUP_TEST_USDC,
    USDC,
    who: test,
    minterWallet: deployerWallet,
    label: "testWallet",
  });

  // 3) approve simulate sanity
  console.log("Preflight: simulate USDC.approve from test wallet...");
  try {
    await rpcRetry("simulate USDC.approve(test)", () =>
      publicClient.simulateContract({
        account: testWallet.account,
        address: USDC,
        abi: MockUSDC.abi,
        functionName: "approve",
        args: [SWAP, 1n],
      })
    );
    console.log("✅ test wallet can approve USDC");
  } catch (e: any) {
    const decoded = tryDecodeRevert(e);
    throw new Error(`Test wallet cannot approve USDC at ${USDC}. ${decoded ? decoded.errorName : errText(e)}`);
  }
}

// -------------------------
// relayer/feed helpers
// -------------------------
async function relayerHealth() {
  const { res, j, text } = await fetchJson(`${RELAYER_URL.replace(/\/+$/, "")}/health`);
  if (!res.ok || !j?.ok) {
    throw new Error(`Relayer /health failed: HTTP ${res.status} body=${text}`);
  }
  return j;
}

async function relayerSync(lookbackBlocks: number) {
  const { res, j, text } = await fetchJson(`${RELAYER_URL.replace(/\/+$/, "")}/admin/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lookbackBlocks }),
  });
  if (!res.ok || !j?.ok) {
    console.log("⚠️ relayer /admin/sync failed:", res.status, j?.error || text);
    return null;
  }
  return j;
}

async function feedHasTx(txHash: string) {
  const { res, j } = await fetchJson(`${RELAYER_URL.replace(/\/+$/, "")}/feed/activity?limit=50`);
  if (!res.ok || !j?.ok) return false;
  const rows: any[] = Array.isArray(j.rows) ? j.rows : [];
  return rows.some((r) => String(r?.tx_hash || "").toLowerCase() === String(txHash).toLowerCase());
}

async function holdersHasWallet(wallet: string) {
  const { res, j } = await fetchJson(`${RELAYER_URL.replace(/\/+$/, "")}/feed/holders?limit=500`);
  if (!res.ok || !j?.ok) return false;
  const rows: any[] = Array.isArray(j.rows) ? j.rows : [];
  const w = wallet.toLowerCase();
  return rows.some((r) => String(r?.wallet || "").toLowerCase() === w);
}

// -------------------------
// permit/gasless helpers (must match your relayer/contract scheme)
// -------------------------
const BUY_TAG = keccak256(toHex("BLOCKSWAP_BUY_OZ"));

function blockswapBuyMsgHash(params: {
  buyer: `0x${string}`;
  ozWei: bigint;
  nonce: bigint;
  deadline: bigint;
  swap: `0x${string}`;
  chainId: number;
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32,address,uint256,uint256,uint256,address,uint256"),
      [BUY_TAG, params.buyer, params.ozWei, params.nonce, params.deadline, params.swap, BigInt(params.chainId)]
    )
  );
}

// ERC20 Permit reads
const ERC20_PERMIT_MIN_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

async function gaslessBuyViaRelayer(args: {
  publicClient: any;
  buyerWallet: any; // must support signMessage + signTypedData
  SWAP: `0x${string}`;
  USDC: `0x${string}`;
  ozWei: bigint;
  sellPerBrick: bigint;
}) {
  const { publicClient, buyerWallet, SWAP, USDC, ozWei, sellPerBrick } = args;

  const buyer = buyerWallet.account.address as `0x${string}`;
  const chainId = baseSepolia.id;

  const nonce = (await rpcRetry("SWAP.nonces(buyer)", () =>
    publicClient.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "nonces", args: [buyer] })
  )) as bigint;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const deadline = nowSec + 600n;

  const msgHash = blockswapBuyMsgHash({
    buyer,
    ozWei,
    nonce,
    deadline,
    swap: SWAP,
    chainId,
  });

  const buySignature = await buyerWallet.signMessage({
    account: buyer,
    message: { raw: msgHash },
  });

  const permitValue = costRoundedUp(ozWei, sellPerBrick);

  const permitNonce = (await rpcRetry("USDC.nonces(buyer)", () =>
    publicClient.readContract({ address: USDC, abi: ERC20_PERMIT_MIN_ABI, functionName: "nonces", args: [buyer] })
  )) as bigint;

  const name = (await rpcRetry("USDC.name", () =>
    publicClient.readContract({ address: USDC, abi: ERC20_PERMIT_MIN_ABI, functionName: "name", args: [] })
  )) as string;

  const version = await rpcRetry("USDC.version", async () => {
    try {
      return (await publicClient.readContract({
        address: USDC,
        abi: ERC20_PERMIT_MIN_ABI,
        functionName: "version",
        args: [],
      })) as string;
    } catch {
      return "1";
    }
  });

  const permitDeadline = deadline;

  const domain = {
    name,
    version: String(version || "1"),
    chainId,
    verifyingContract: USDC,
  } as const;

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  } as const;

  const message = {
    owner: buyer,
    spender: SWAP,
    value: permitValue,
    nonce: permitNonce,
    deadline: permitDeadline,
  } as const;

  const permitSignature = await buyerWallet.signTypedData({
    account: buyer,
    domain,
    types,
    primaryType: "Permit",
    message,
  });

  const url = `${RELAYER_URL.replace(/\/+$/, "")}/relay/buy-permit`;
  console.log(`▶ relayer POST: ${url}`);

  const payload = {
    user: buyer,
    ozWei: ozWei.toString(),
    buyDeadline: Number(deadline),
    buySignature,
    permitValue: permitValue.toString(),
    permitDeadline: Number(permitDeadline),
    permitSignature,
  };

  const { res, j, text } = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !j?.ok) {
    throw new Error(j?.error || `Relayer buy-permit failed (HTTP ${res.status}) body=${text}`);
  }

  return { hash: j.hash as `0x${string}`, msgHash, nonce, permitValue };
}

// -------------------------
// core cycle
// -------------------------
async function doBuySellCycle(args: {
  publicClient: any;
  buyerWallet: any;
  sellerWallet: any;
  SWAP: `0x${string}`;
  USDC: `0x${string}`;
  OZ: `0x${string}`;
  sellPerBrick: bigint;
  floorPerBrick: bigint;
  treasury: `0x${string}`;
  vaultAddr: `0x${string}` | null;
  ozWhole: bigint;
  labelPrefix: string;
}) {
  const {
    publicClient,
    buyerWallet,
    sellerWallet,
    SWAP,
    USDC,
    OZ,
    sellPerBrick,
    floorPerBrick,
    treasury,
    vaultAddr,
    ozWhole,
    labelPrefix,
  } = args;

  const ozWei = parseUnits(ozWhole.toString(), 18);
  const totalNeed = costRoundedUp(ozWei, sellPerBrick);
  const floorNeed = costFloor(ozWei, floorPerBrick);

  const buyer = buyerWallet.account.address as `0x${string}`;
  const seller = sellerWallet.account.address as `0x${string}`;

  await ensureAllowance(publicClient, buyerWallet, USDC, MockUSDC.abi, buyer, SWAP, totalNeed, `${labelPrefix} USDC`);
  await ensureAllowance(publicClient, sellerWallet, OZ, OZToken.abi, seller, SWAP, ozWei, `${labelPrefix} OZ`);

  const preBuyerUSDC = await erc20Balance(publicClient, USDC, MockUSDC.abi, buyer);
  const preBuyerOZ = await erc20Balance(publicClient, OZ, OZToken.abi, buyer);
  const preAcct = await readVaultAccounting(publicClient, SWAP);

  console.log(
    `\n${labelPrefix} BUY oz=${ozWhole} totalNeed=${totalNeed} floorNeed=${floorNeed}` +
      ` | buyerUSDC=${preBuyerUSDC} buyerOZ=${preBuyerOZ}` +
      ` | acct(vault=${preAcct.vault} liab=${preAcct.liab} solvent=${preAcct.solvent ? "true" : "false"})` +
      (vaultAddr ? ` | vaultAddr=${vaultAddr}` : ` | vaultAddr=(not found)`)
  );

  const buy = await safeWrite(publicClient, buyerWallet, `${labelPrefix} buyOz(${ozWhole}oz)`, {
    address: SWAP,
    abi: BlockSwap.abi,
    functionName: "buyOz",
    args: [ozWei],
  });
  if (!buy.ok) throw new Error(`${labelPrefix} BUY failed`);

  const receiptBlock = BigInt(buy.receipt.blockNumber ?? 0n);

  const boughtEv = buy.receipt ? decodeBoughtFromReceipt(buy.receipt) : null;
  const ozTransfers = buy.receipt ? decodeErc20TransfersFromReceipt(buy.receipt, OZ) : [];
  const ozToBuyerEv = ozTransfers.find((t) => t.to.toLowerCase() === buyer.toLowerCase())?.value ?? null;

  const expectedBuyerOZ = preBuyerOZ + ozWei;

  const ozVisible = await waitUntil(`${labelPrefix} buyer OZ visibility`, async () => {
    const b = await erc20Balance(publicClient, OZ, OZToken.abi, buyer, receiptBlock);
    return b >= expectedBuyerOZ;
  });

  const postBuyerUSDC = await erc20Balance(publicClient, USDC, MockUSDC.abi, buyer, receiptBlock);
  const postBuyerOZ = await erc20Balance(publicClient, OZ, OZToken.abi, buyer, receiptBlock);
  const postAcct = await readVaultAccounting(publicClient, SWAP);

  const dBuyerUSDC = preBuyerUSDC - postBuyerUSDC;
  const dBuyerOZ = postBuyerOZ - preBuyerOZ;

  let evVault = 0n;
  let evTreas = 0n;
  if (boughtEv) {
    const evArgs: any = boughtEv.args as any;
    evVault = BigInt(evArgs.usdcToVault ?? 0n);
    evTreas = BigInt(evArgs.usdcToTreasury ?? 0n);
  }

  console.log(
    `POST-BUY TRUTH:` +
      ` buyerSpent=${dBuyerUSDC}` +
      ` buyerOZ+=${dBuyerOZ}` +
      (boughtEv ? ` | event(vault=${evVault} treas=${evTreas})` : ` | event=(none)`) +
      (ozToBuyerEv !== null ? ` | ozXferToBuyer=${ozToBuyerEv}` : ``) +
      ` | acct(vault=${postAcct.vault} liab=${postAcct.liab} solvent=${postAcct.solvent ? "true" : "false"})`
  );

  if (!postAcct.solvent) throw new Error(`${labelPrefix} invariant failed: isSolvent() false`);
  if (postAcct.vault < postAcct.liab) throw new Error(`${labelPrefix} invariant failed: acct vault < liability`);
  if (boughtEv && evVault < floorNeed) throw new Error(`${labelPrefix} invariant failed: event usdcToVault < floorNeed`);

  const ozOk = (ozVisible && dBuyerOZ === ozWei) || (!ozVisible && ozToBuyerEv !== null && ozToBuyerEv === ozWei);
  if (!ozOk) throw new Error(`${labelPrefix} invariant failed: buyer OZ increase != ozWei (got ${dBuyerOZ} expected ${ozWei})`);

  if (buyer.toLowerCase() !== seller.toLowerCase()) {
    console.log(`${labelPrefix} transferring OZ ${ozWhole}oz buyer -> seller so seller can sellBack...`);
    const t = await safeWrite(publicClient, buyerWallet, `${labelPrefix} OZ.transfer(seller)`, {
      address: OZ,
      abi: OZToken.abi,
      functionName: "transfer",
      args: [seller, ozWei],
    });
    if (!t.ok) throw new Error(`${labelPrefix} OZ transfer to seller failed`);
    await sleep(SLEEP_MS);
  }

  console.log(`${labelPrefix} SELL oz=${ozWhole} (seller=${seller})`);
  const sell = await safeWrite(publicClient, sellerWallet, `${labelPrefix} sellBackOz(${ozWhole}oz)`, {
    address: SWAP,
    abi: BlockSwap.abi,
    functionName: "sellBackOz",
    args: [ozWei],
  });
  if (!sell.ok) throw new Error(`${labelPrefix} SELL failed`);

  const acct2 = await readVaultAccounting(publicClient, SWAP);
  if (!acct2.solvent) throw new Error(`${labelPrefix} invariant failed post-sell: isSolvent false`);
  if (acct2.vault < acct2.liab) throw new Error(`${labelPrefix} invariant failed post-sell: acct vault < liab`);

  await sleep(SLEEP_MS);
}

// -------------------------
// negatives
// -------------------------
async function runNegativeTests(args: { publicClient: any; walletClient: any; SWAP: `0x${string}` }) {
  const { publicClient, walletClient, SWAP } = args;

  console.log("\n====================");
  console.log("NEGATIVE TESTS");
  console.log("====================");

  try {
    await publicClient.simulateContract({
      account: walletClient.account,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "buyOz",
      args: [1n],
    });
    console.log("❌ expected revert but simulate succeeded");
  } catch (e: any) {
    const decoded = tryDecodeRevert(e);
    console.log("✅ expected revert: buyOz(non-whole ounce) ->", decoded?.errorName ?? "revert");
  }

  const paused = await safeWrite(publicClient, walletClient, "setBuyPaused(true)", {
    address: SWAP,
    abi: BlockSwap.abi,
    functionName: "setBuyPaused",
    args: [true],
  });

  if (paused.ok) {
    try {
      await publicClient.simulateContract({
        account: walletClient.account,
        address: SWAP,
        abi: BlockSwap.abi,
        functionName: "buyOz",
        args: [parseUnits("1", 18)],
      });
      console.log("❌ expected revert but simulate succeeded (paused)");
    } catch (e: any) {
      const decoded = tryDecodeRevert(e);
      console.log("✅ expected revert: buyOz while paused ->", decoded?.errorName ?? "revert");
    }

    await safeWrite(publicClient, walletClient, "setBuyPaused(false)", {
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "setBuyPaused",
      args: [false],
    });
  }

  console.log("✅ negative tests complete.");
}

// -------------------------
// step retry wrapper
// -------------------------
async function runStep(label: string, fn: () => Promise<void>) {
  let lastErr: any = null;
  for (let i = 1; i <= STEP_RETRIES; i++) {
    try {
      await fn();
      return;
    } catch (e: any) {
      lastErr = e;
      const retryable = isRetryableRpcError(e);
      console.log(
        `⚠️ Step failed: ${label} attempt ${i}/${STEP_RETRIES}: ${errText(e)}${retryable ? " (retryable)" : ""}`
      );
      if (!retryable) throw e;
      await sleep(RPC_BACKOFF_MS * i);
    }
  }
  throw lastErr;
}

// -------------------------
// main
// -------------------------
async function main() {
  // Prefer BASE_SEPOLIA_RPC if present; else VITE_RPC_URL; else fallback
  const RPC = String(process.env.BASE_SEPOLIA_RPC || process.env.VITE_RPC_URL || "https://sepolia.base.org").trim();

  const deployerPk = mustEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const deployerAcct = privateKeyToAccount(deployerPk);

  const testPkRaw = optEnv("TEST_WALLET_PRIVATE_KEY");
  const testAcct = testPkRaw ? privateKeyToAccount(testPkRaw as `0x${string}`) : null;

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const deployerWallet = createWalletClient({ chain: baseSepolia, transport: http(RPC), account: deployerAcct });
  const testWallet = testAcct ? createWalletClient({ chain: baseSepolia, transport: http(RPC), account: testAcct }) : null;

  console.log("RPC:", RPC);
  console.log("Expected chainId:", baseSepolia.id);
  console.log("Deployer:", deployerAcct.address);
  if (testAcct) console.log("Test wallet:", testAcct.address);

  const rpcChainId = await rpcRetry("getChainId", () => publicClient.getChainId());
  console.log("RPC chainId:", rpcChainId);
  if (rpcChainId !== baseSepolia.id) throw new Error(`Wrong RPC chainId. Expected ${baseSepolia.id}, got ${rpcChainId}`);

  if (!fs.existsSync(FILE)) throw new Error(`Missing ${FILE}. Make sure it exists in /contracts folder.`);
  const deployments = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const SWAP = mustAddr("BlockSwap", deployments?.contracts?.BlockSwap ?? deployments?.BlockSwap);
  console.log("\n▶ Using BlockSwap:", SWAP);

  const { USDC, OZ, sellPerBrick, floorPerBrick, treasury } = await readSwapAddrs(publicClient, SWAP);
  console.log("SWAP.USDC():", USDC);
  console.log("SWAP.OZ():  ", OZ);
  console.log("Treasury:", treasury);
  console.log("sellPricePerBrick:", sellPerBrick.toString());
  console.log("floorPerBrick:     ", floorPerBrick.toString());

  const vaultAddr = await discoverVaultAddress(publicClient, SWAP);
  console.log("Discovered vaultAddr:", vaultAddr ?? "(not found)");

  const v0 = await readVaultAccounting(publicClient, SWAP);
  const swapInv0 = await erc20Balance(publicClient, OZ, OZToken.abi, SWAP).catch(() => 0n);
  console.log(
    "\nAccounting vault/liability:",
    `vault=${v0.vault.toString()} liab=${v0.liab.toString()} solvent=${v0.solvent ? "true" : "false"}`
  );
  console.log("Swap OZ inventory:", formatUnits(swapInv0, 18));

  // ✅ relayer health + optional warm sync
  if (GASLESS_SMOKE || FEED_SMOKE) {
    console.log("\n====================");
    console.log("RELAYER HEALTH");
    console.log("====================");
    console.log("Relayer URL:", RELAYER_URL);
    console.log("Relayer timeout ms:", RELAYER_TIMEOUT_MS);

    const h = await relayerHealth();
    console.log("✅ relayer ok:", {
      chainIdEnv: h.chainIdEnv,
      chainIdRpc: h.chainIdRpc,
      relayerMatches: h.relayerMatches,
      supabase: h.supabase,
      syncEnabled: h?.sync?.enabled,
    });

    await relayerSync(RELAYER_SYNC_LOOKBACK);
  }

  // ✅ ensure deployer has USDC BEFORE loops
  await ensureWalletHasUsdc({
    publicClient,
    min: MIN_TEST_USDC,
    topup: TOPUP_TEST_USDC,
    USDC,
    who: deployerWallet.account.address as `0x${string}`,
    minterWallet: deployerWallet,
    label: "deployer",
  });

  await runNegativeTests({ publicClient, walletClient: deployerWallet, SWAP });

  // ✅ quick gasless test (one shot) BEFORE long loops
  if (GASLESS_SMOKE) {
    console.log("\n====================");
    console.log("GASLESS SMOKE (relayer + permit)");
    console.log("====================");

    try {
      const ozWei = parseUnits("1", 18);

      await ensureWalletHasUsdc({
        publicClient,
        min: MIN_TEST_USDC,
        topup: TOPUP_TEST_USDC,
        USDC,
        who: deployerWallet.account.address as `0x${string}`,
        minterWallet: deployerWallet,
        label: "deployer(gasless)",
      });

      const preOZ = await erc20Balance(publicClient, OZ, OZToken.abi, deployerWallet.account.address as `0x${string}`);
      const preAcct = await readVaultAccounting(publicClient, SWAP);

      const r = await gaslessBuyViaRelayer({ publicClient, buyerWallet: deployerWallet, SWAP, USDC, ozWei, sellPerBrick });
      console.log("✅ relayed buy tx:", r.hash);

      const rec = await mustConfirm(publicClient, r.hash);
      await sleep(SLEEP_MS);

      const postOZ = await erc20Balance(publicClient, OZ, OZToken.abi, deployerWallet.account.address as `0x${string}`);
      const postAcct = await readVaultAccounting(publicClient, SWAP);

      if (postOZ < preOZ + ozWei) throw new Error(`Gasless buy invariant failed: OZ did not increase by 1oz`);
      if (!postAcct.solvent || postAcct.vault < postAcct.liab) throw new Error(`Gasless buy invariant failed: vault/liab`);

      console.log("✅ gasless invariants ok:", {
        ozDelta: (postOZ - preOZ).toString(),
        vault: postAcct.vault.toString(),
        liab: postAcct.liab.toString(),
        solvent: postAcct.solvent,
      });

      if (FEED_SMOKE) {
        console.log("\nFeed visibility checks (activity + holders)...");
        await relayerSync(RELAYER_SYNC_LOOKBACK);

        const txSeen = await waitUntil("feed/activity tx hash", async () => feedHasTx(r.hash), 50, 1500);
        if (!txSeen) throw new Error(`Feed did not show gasless tx ${r.hash}`);

        const holderSeen = await waitUntil(
          "feed/holders includes deployer",
          async () => holdersHasWallet(deployerWallet.account.address as `0x${string}`),
          50,
          1500
        );
        if (!holderSeen) throw new Error(`Holders feed did not show deployer wallet`);
        console.log("✅ feed updated for gasless buy");
      }
    } catch (e: any) {
      const msg = errText(e);
      if (GASLESS_REQUIRED) throw e;
      console.log("\n⚠️ GASLESS SMOKE FAILED (non-fatal; continuing).");
      console.log("Reason:", msg);
      console.log("Tip: set GASLESS_REQUIRED=true to make this fail hard.");
    }
  }

  console.log("\n====================");
  console.log("SMOKE LOOPS (single wallet)");
  console.log("====================");

  for (let i = 1n; i <= SMOKE_LOOPS; i++) {
    const pick = Number(i % 5n);
    const ozWhole = [1n, 2n, 35n, 36n, 37n][pick];

    await runStep(`single S(${i})`, async () => {
      await doBuySellCycle({
        publicClient,
        buyerWallet: deployerWallet,
        sellerWallet: deployerWallet,
        SWAP,
        USDC,
        OZ,
        sellPerBrick,
        floorPerBrick,
        treasury,
        vaultAddr,
        ozWhole,
        labelPrefix: `S(${i})`,
      });
    });

    if (FEED_SMOKE && i % 10n === 0n) {
      await relayerSync(RELAYER_SYNC_LOOKBACK);
    }

    if (i % 10n === 0n) console.log(`✅ single-wallet progress ${i.toString()}/${SMOKE_LOOPS.toString()}`);
  }

  console.log("\n====================");
  console.log("MULTI-WALLET LOOPS");
  console.log("====================");

  if (!MULTI) {
    console.log("ℹ️ MULTI=false, skipping multi-wallet.");
  } else if (!testWallet) {
    console.log("ℹ️ TEST_WALLET_PRIVATE_KEY missing, skipping multi-wallet.");
  } else {
    await ensureGasAndFunds({ publicClient, deployerWallet, testWallet, USDC, SWAP });

    for (let i = 1n; i <= MULTI_LOOPS; i++) {
      const pick = Number(i % 5n);
      const ozWhole = [1n, 2n, 35n, 36n, 37n][pick];

      const buyer = i % 2n === 0n ? deployerWallet : testWallet;
      const seller = i % 2n === 0n ? testWallet : deployerWallet;

      await runStep(`multi M(${i})`, async () => {
        await doBuySellCycle({
          publicClient,
          buyerWallet: buyer,
          sellerWallet: seller,
          SWAP,
          USDC,
          OZ,
          sellPerBrick,
          floorPerBrick,
          treasury,
          vaultAddr,
          ozWhole,
          labelPrefix: `M(${i})`,
        });
      });

      if (FEED_SMOKE && i % 20n === 0n) {
        await relayerSync(RELAYER_SYNC_LOOKBACK);
      }

      if (i % 10n === 0n) console.log(`✅ multi-wallet progress ${i.toString()}/${MULTI_LOOPS.toString()}`);
    }
  }

  const vf = await readVaultAccounting(publicClient, SWAP);
  if (!vf.solvent || vf.vault < vf.liab) {
    throw new Error(`FINAL invariant failed: vault=${vf.vault} liab=${vf.liab} solvent=${vf.solvent}`);
  }

  console.log("\n✅ All tests complete.");
  console.log(`FINAL (acct): vault=${vf.vault.toString()} liab=${vf.liab.toString()} solvent=${vf.solvent ? "true" : "false"}`);
}

main().catch((err) => {
  console.error("\n❌ smokeAll failed:");
  console.error(errText(err));
  process.exitCode = 1;
});
