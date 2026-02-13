import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, formatUnits, parseUnits, isAddress } from "viem";
import { baseSepolia } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- helpers ----------
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function mustEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function mustAddr(label, v) {
  const s = String(v || "").trim();
  if (!isAddress(s)) throw new Error(`Bad ${label} address: ${s}`);
  return s;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function tryReadJson(p) {
  try {
    if (!p) return null;
    if (!fs.existsSync(p)) return null;
    return readJson(p);
  } catch {
    return null;
  }
}

function pickContractsObj(j) {
  if (!j) return null;
  return j.contracts ? j.contracts : j;
}

function findFile(relFromContractsCwd) {
  const cwd = process.cwd();
  const p = path.resolve(cwd, relFromContractsCwd);
  return fs.existsSync(p) ? p : null;
}

// ---------- ABIs ----------
const ERC20_MIN_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }, // optional
];

const BLOCKSWAP_MIN_ABI = [
  { type: "function", name: "sellPricePerBrick", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buyPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "theBlockTreasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

// ---------- math (matches adapter) ----------
const OUNCES_PER_BRICK = BigInt(process.env.OUNCES_PER_BRICK || "36");
const OZ_WEI = 10n ** 18n;

function costRoundedUp(ozWei, pricePerBrick6) {
  const denom = OUNCES_PER_BRICK * OZ_WEI;
  const numer = ozWei * pricePerBrick6;
  return (numer + denom - 1n) / denom;
}

async function bytecodeLen(pc, addr) {
  try {
    const code = await pc.getBytecode({ address: addr });
    if (!code) return 0;
    // "0x" counts as 2 chars; each byte is 2 hex chars
    return Math.max(0, (code.length - 2) / 2);
  } catch {
    return 0;
  }
}

async function readSwapState(pc, swapAddr) {
  const [paused, sell, treasury] = await Promise.all([
    pc.readContract({ address: swapAddr, abi: BLOCKSWAP_MIN_ABI, functionName: "buyPaused" }),
    pc.readContract({ address: swapAddr, abi: BLOCKSWAP_MIN_ABI, functionName: "sellPricePerBrick" }),
    pc.readContract({ address: swapAddr, abi: BLOCKSWAP_MIN_ABI, functionName: "theBlockTreasury" }),
  ]);
  return { paused, sell, treasury };
}

async function main() {
  const RPC = (process.env.BASE_SEPOLIA_RPC || process.env.RPC_URL || "").trim();
  if (!RPC) throw new Error("Missing BASE_SEPOLIA_RPC (or RPC_URL)");

  const BUYER = mustAddr("BUYER", mustEnv("BUYER"));

  // inputs
  const bricksStr = argValue("--bricks");
  const ozStr = argValue("--oz");
  const swapCli = argValue("--swap");
  const dump = hasFlag("--dump");

  let ozWhole;
  if (bricksStr != null) ozWhole = BigInt(bricksStr) * OUNCES_PER_BRICK;
  else if (ozStr != null) ozWhole = BigInt(ozStr);
  else ozWhole = 36n;

  const ozWei = parseUnits(ozWhole.toString(), 18);

  // deployments: contracts + public (relative to contracts cwd)
  const depContractsPath =
    process.env.DEPLOYMENTS_FILE?.trim() ||
    findFile("deployments.baseSepolia.json") ||
    path.resolve(__dirname, "..", "deployments.baseSepolia.json");

  const depPublicPath =
    process.env.DEPLOYMENTS_PUBLIC_FILE?.trim() ||
    findFile("..\\public\\deployments.baseSepolia.json") ||
    path.resolve(__dirname, "..", "..", "public", "deployments.baseSepolia.json");

  const depContracts = tryReadJson(depContractsPath);
  const depPublic = tryReadJson(depPublicPath);

  const djC = pickContractsObj(depContracts);
  const djP = pickContractsObj(depPublic);

  const depSwapC = djC?.BlockSwap || djC?.Blockswap || djC?.BLOCKSWAP || null;
  const depUsdcC = djC?.MockUSDC || djC?.USDC || djC?.MockUsdc || null;

  const depSwapP = djP?.BlockSwap || djP?.Blockswap || djP?.BLOCKSWAP || null;
  const depUsdcP = djP?.MockUSDC || djP?.USDC || djP?.MockUsdc || null;

  // ENV overrides (dangerous because they cause exactly the confusion you're seeing)
  const envSwap = process.env.BLOCKSWAP || process.env.BLOCKSWAP_ADDRESS || "";
  const envUsdc = process.env.USDC || process.env.USDC_ADDRESS || "";

  // final selection:
  // priority: --swap > ENV override > contracts deployment > public deployment
  const SWAP = mustAddr(
    "SWAP/BlockSwap",
    swapCli || envSwap || depSwapC || depSwapP
  );

  const USDC = mustAddr(
    "USDC",
    envUsdc || depUsdcC || depUsdcP
  );

  const pc = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC, { timeout: 15_000, retryCount: 2, retryDelay: 350 }),
  });

  const chainId = await pc.getChainId();
  if (chainId !== baseSepolia.id) throw new Error(`Wrong chainId. Expected ${baseSepolia.id}, got ${chainId}`);

  // token meta
  const usdcDecimals = await pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "decimals" }).catch(() => 6);
  const usdcSymbol = await pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "symbol" }).catch(() => "USDC");

  // final swap state
  const codeLenSwap = await bytecodeLen(pc, SWAP);
  const codeLenUsdc = await bytecodeLen(pc, USDC);

  const { paused: buyPaused, sell: sellPricePerBrick, treasury } = await readSwapState(pc, SWAP);
  const permitValue = costRoundedUp(ozWei, sellPricePerBrick);

  const [bal, allowance, swapNonce, permitNonce] = await Promise.all([
    pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [BUYER] }),
    pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "allowance", args: [BUYER, SWAP] }),
    pc.readContract({ address: SWAP, abi: BLOCKSWAP_MIN_ABI, functionName: "nonces", args: [BUYER] }),
    pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "nonces", args: [BUYER] }).catch(() => null),
  ]);

  if (dump) {
    console.log("\n=== SOURCES (RAW) ===");
    console.log("CWD:", process.cwd());
    console.log("DEPLOYMENTS_FILE:", depContractsPath);
    console.log("DEPLOYMENTS_PUBLIC_FILE:", depPublicPath);
    console.log("DEP swap (contracts):", depSwapC);
    console.log("DEP usdc (contracts):", depUsdcC);
    console.log("DEP swap (public):", depSwapP);
    console.log("DEP usdc (public):", depUsdcP);
    console.log("ENV swap:", envSwap || "(none)");
    console.log("ENV usdc:", envUsdc || "(none)");
    console.log("CLI --swap:", swapCli || "(none)");
  }

  console.log("\n=== NETWORK ===");
  console.log("RPC:", RPC);
  console.log("chainId:", chainId);

  console.log("\n=== ADDRESSES (FINAL) ===");
  console.log("BUYER:", BUYER);
  console.log("SWAP :", SWAP, `(bytecode bytes: ${codeLenSwap})`);
  console.log("USDC :", USDC, `(bytecode bytes: ${codeLenUsdc})`);
  console.log("Treasury:", treasury);

  console.log("\n=== SWAP STATE ===");
  console.log("buyPaused:", buyPaused);
  console.log("sellPricePerBrick RAW:", sellPricePerBrick.toString());
  console.log("sellPricePerBrick:", `${formatUnits(sellPricePerBrick, 6)} ${usdcSymbol}`);

  console.log("\n=== INTENT ===");
  console.log("ounces:", ozWhole.toString(), "(whole oz)");
  console.log("ozWei :", ozWei.toString());
  console.log("permitValue RAW:", permitValue.toString());
  console.log("permitValue:", `${formatUnits(permitValue, 6)} ${usdcSymbol}`);

  console.log("\n=== BUYER USDC ===");
  console.log("balance :", `${formatUnits(bal, usdcDecimals)} ${usdcSymbol}`);
  console.log("allowance to SWAP:", `${formatUnits(allowance, usdcDecimals)} ${usdcSymbol}`);
  console.log("swapNonce (buy sig):", swapNonce.toString());
  console.log("permitNonce:", permitNonce == null ? "(token may not support permit/nonces)" : permitNonce.toString());

  console.log("\n=== QUICK CHECKS ===");
  if (codeLenSwap === 0) console.log("❌ SWAP address has NO bytecode (wrong address / wrong chain)");
  if (codeLenUsdc === 0) console.log("❌ USDC address has NO bytecode (wrong address / wrong chain)");
  if (buyPaused) console.log("❌ buys are paused on-chain");
  if (bal < permitValue) console.log("❌ buyer USDC balance is LESS than permitValue needed");
  if (ozWhole % OUNCES_PER_BRICK !== 0n) console.log("⚠️ ounces not multiple of 36 — bricks/ounces mismatch");
  console.log("✅ If FINAL SWAP matches your UI SWAP and sellPrice matches, you’re pointed at the right contract.");

  // extra: if deployments have a *different* swap, show what THAT one returns
  const depSwapAny = depSwapC || depSwapP;
  if (depSwapAny && isAddress(depSwapAny) && depSwapAny.toLowerCase() !== SWAP.toLowerCase()) {
    const depSwap = depSwapAny;
    const depCodeLen = await bytecodeLen(pc, depSwap);
    console.log("\n=== EXTRA (DEPLOYMENTS SWAP DIFFERENT) ===");
    console.log("DEP SWAP:", depSwap, `(bytecode bytes: ${depCodeLen})`);
    if (depCodeLen > 0) {
      const st = await readSwapState(pc, depSwap);
      console.log("DEP sellPricePerBrick:", `${formatUnits(st.sell, 6)} ${usdcSymbol}`);
      console.log("DEP buyPaused:", st.paused);
      console.log("DEP treasury:", st.treasury);
    }
  }
}

main().catch((e) => {
  console.error("\nERROR:", e?.shortMessage || e?.message || e);
  process.exit(1);
});
