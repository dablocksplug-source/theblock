// src/services/blockswapAdapter.js
// On-chain adapter for BlockSwap (USDC settlement, OZ weight UI)
// RELAYER FEED FIRST (recommended), Supabase optional, RPC logs fallback.

import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  parseUnits,
  isAddress,
  parseAbiItem,
  keccak256,
  encodeAbiParameters,
  toHex,
  signatureToHex,
} from "viem";
import { baseSepolia, base } from "viem/chains";

import { createClient } from "@supabase/supabase-js";

import BlockSwap from "../abi/BlockSwap.json";
// kept for future use
import BlockRewardsMerkle from "../abi/BlockRewardsMerkle.json"; // eslint-disable-line no-unused-vars

// ---------- ERC20 minimal ----------
const ERC20_MIN_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
];

// ---------- ERC20Permit minimal ----------
const ERC20_PERMIT_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];

// ----------- events (for RPC fallback; kept for later) -----------
const EVT_BOUGHT = parseAbiItem(
  "event Bought(address indexed buyer, uint256 ozWei, uint256 usdcTotal, uint256 usdcToVault, uint256 usdcToTreasury)"
);
const EVT_SOLD = parseAbiItem("event SoldBack(address indexed seller, uint256 ozWei, uint256 usdcPaid)");

// Topics (kept for later)
const TOPIC_BOUGHT = keccak256(toHex("Bought(address,uint256,uint256,uint256,uint256)"));
const TOPIC_SOLD = keccak256(toHex("SoldBack(address,uint256,uint256)"));

function chainFromConfig() {
  if (Number(C.CHAIN_ID) === base.id) return base;
  return baseSepolia;
}

function mustAddr(label, v) {
  if (!isAddress(v)) throw new Error(`Bad ${label} address: ${v}`);
  return v;
}

let __overrideProvider = null;

// caches
let __pcCache = { rpc: null, chainId: null, client: null };
let __wcCache = { chainId: null, provider: null, client: null };
let __rpcLogged = false;

// logs protection (RPC path only; kept for later)
let __logsCooldownUntil = 0;
let __logsFailStreak = 0;
const __warnedLabels = new Set();

// activity/holders cache (kept for later)
let __activityCache = { atMs: 0, key: "", data: [] };
let __holdersCache = { atMs: 0, key: "", data: [] };

// label cache (wallet -> nickname label)
let __labels = {}; // { [addrLower]: "Nick" }

// deployments loader
let __deploymentsCache = { atMs: 0, data: null };
const DEPLOYMENTS_URL = Number(C.CHAIN_ID) === 8453 ? "/deployments.base.json" : "/deployments.baseSepolia.json";

// -------------------------------
// DEBUG SWITCH
// -------------------------------
const DEBUG_LOGS =
  String(import.meta.env.VITE_DEBUG_LOGS || "").trim() === "1" ||
  String(import.meta.env.VITE_DEBUG_LOGS || "").trim().toLowerCase() === "true";

// -------------------------------
// Supabase (UI-side, anon key only) - OPTIONAL
// -------------------------------
function sanitizeUrl(u) {
  return String(u || "").trim().replace(/^"+|"+$/g, "").replace(/\s+/g, "");
}

const SUPABASE_URL = sanitizeUrl(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON = sanitizeUrl(import.meta.env.VITE_SUPABASE_ANON_KEY);

const SUPA_ENABLED =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON &&
  !["0", "false", "off"].includes(String(import.meta.env.VITE_SUPABASE_ENABLED || "1").toLowerCase().trim());

// singleton supabase client (prevents multiple GoTrue clients in dev/hmr)
function getSupabaseSingleton() {
  try {
    if (!SUPA_ENABLED) return null;
    const g = globalThis;
    if (g.__theblock_supabase_ui) return g.__theblock_supabase_ui;
    g.__theblock_supabase_ui = createClient(SUPABASE_URL, SUPABASE_ANON);
    return g.__theblock_supabase_ui;
  } catch {
    return null;
  }
}
const supabase = getSupabaseSingleton();

// -------------------------------
// Relayer feed (RECOMMENDED)
// -------------------------------
function resolveRelayerUrl() {
  return sanitizeUrl(import.meta.env.VITE_RELAYER_URL) || sanitizeUrl(import.meta.env.VITE_BLOCK_RELAYER_URL) || "";
}
function relayerOk() {
  return !!resolveRelayerUrl();
}

async function fetchJson(url, { method = "GET", body, timeoutMs = 15_000, noStore = true } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: noStore ? "no-store" : "default",
      signal: ctrl.signal,
    });

    const text = await res.text();
    let j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {
      j = null;
    }
    return { res, j, text };
  } finally {
    clearTimeout(t);
  }
}

// -------- knobs --------
const STREET_LIMIT = Number(import.meta.env.VITE_STREET_LIMIT || 15);
const STREET_POLL_MS = Number(import.meta.env.VITE_STREET_POLL_MS || 90_000); // cache TTL for street
const STREET_RPC_LOOKBACK = Number(import.meta.env.VITE_STREET_RPC_LOOKBACK || 900); // used only when supa+relayer off

const HOLDERS_LIMIT = Number(import.meta.env.VITE_HOLDERS_LIMIT || 250);
const HOLDERS_POLL_MS = Number(import.meta.env.VITE_HOLDERS_POLL_MS || 90_000); // cache TTL for holders
const HOLDERS_RPC_LOOKBACK = Number(import.meta.env.VITE_HOLDERS_RPC_LOOKBACK || 2500); // used only when supa+relayer off

// -------------------------------
// Small helpers
// -------------------------------
async function loadDeployments({ ttlMs = 4000 } = {}) {
  const now = Date.now();
  if (__deploymentsCache.data && now - __deploymentsCache.atMs < ttlMs) return __deploymentsCache.data;

  try {
    const res = await fetch(DEPLOYMENTS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    __deploymentsCache = { atMs: now, data: j };
    return j;
  } catch {
    return null;
  }
}

async function resolveAddresses() {
  const d = await loadDeployments();
  const dj = d?.contracts ? d.contracts : d;

  const swapFromJson = dj?.BlockSwap || dj?.Blockswap || dj?.BLOCKSWAP;
  const ozFromJson = dj?.OZToken || dj?.OZ || dj?.OZTOKEN;
  const usdcFromJson = dj?.MockUSDC || dj?.USDC || dj?.MockUsdc;

  const SWAP = mustAddr("BlockSwap", swapFromJson || C.BLOCKSWAP_ADDRESS);
  const OZ = mustAddr("OZ", ozFromJson || C.OZ_ADDRESS);
  const USDC = mustAddr("USDC", usdcFromJson || C.USDC_ADDRESS);

  return { SWAP, OZ, USDC, deployments: d || null };
}

function setOverrideProvider(p) {
  if (p && typeof p.request === "function") __overrideProvider = p;
}
function clearOverrideProvider() {
  __overrideProvider = null;
  __wcCache = { chainId: null, provider: null, client: null };
}

function pickEip1193Provider() {
  // ✅ prefer the ACTIVE connector provider passed from WalletContext
  if (__overrideProvider && typeof __overrideProvider.request === "function") return __overrideProvider;

  const eth = window?.ethereum;
  if (!eth) return null;

  const providers = Array.isArray(eth.providers) ? eth.providers : null;
  if (providers?.length) {
    const mm = providers.find((p) => p?.isMetaMask && typeof p?.request === "function");
    if (mm) return mm;

    const cb = providers.find((p) => p?.isCoinbaseWallet && typeof p?.request === "function");
    if (cb) return cb;

    const any = providers.find((p) => typeof p?.request === "function");
    if (any) return any;

    return eth;
  }

  if (typeof eth.request === "function") return eth;
  return null;
}

function mustProvider() {
  const p = pickEip1193Provider();
  if (!p) throw new Error("No wallet provider found. Install/enable MetaMask (or wallet).");
  return p;
}

function nowMs() {
  return Date.now();
}

function toBn6(amountStr) {
  return parseUnits(String(amountStr || "0"), 6);
}
function toBn18(amountStr) {
  return parseUnits(String(amountStr || "0"), 18);
}

const OUNCES_PER_BRICK = Number(C.OUNCES_PER_BRICK || 36);
const OZ_WEI = 10n ** 18n;

function costRoundedUp(ozWei, pricePerBrick6) {
  const denom = BigInt(OUNCES_PER_BRICK) * OZ_WEI;
  const numer = ozWei * pricePerBrick6;
  return (numer + denom - 1n) / denom;
}

function shortAddr(a) {
  return a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";
}

function labelOrShort(addr) {
  if (!addr) return "—";
  const k = String(addr).toLowerCase();
  const lbl = __labels?.[k];
  if (lbl && String(lbl).trim()) return String(lbl).trim();
  return shortAddr(addr);
}

async function safeRead(promise, fallback, label) {
  try {
    const v = await promise;
    return v ?? fallback;
  } catch (e) {
    if (label && !__warnedLabels.has(label)) {
      __warnedLabels.add(label);
      if (DEBUG_LOGS) console.warn(`[safeRead] ${label} failed:`, e?.shortMessage || e?.message || e);
    }
    return fallback;
  }
}

function looksLikeAlchemyMissingKey(url) {
  const u = sanitizeUrl(url);
  return !!u && /alchemy\.com\/v2\/?$/.test(u);
}

function resolveRpcUrl() {
  const chain = chainFromConfig();
  const rpc =
    sanitizeUrl(C.RPC_URL) ||
    sanitizeUrl(import.meta.env.VITE_RPC_URL) ||
    sanitizeUrl(import.meta.env.VITE_BASE_SEPOLIA_RPC) ||
    chain?.rpcUrls?.default?.http?.[0] ||
    chain?.rpcUrls?.public?.http?.[0];

  if (!rpc) throw new Error("Missing RPC URL. Set VITE_RPC_URL.");
  return rpc;
}

function resolveLogsRpcUrl() {
  const logs = sanitizeUrl(import.meta.env.VITE_RPC_URL_LOGS) || sanitizeUrl(import.meta.env.VITE_LOGS_RPC_URL);
  if (!logs || looksLikeAlchemyMissingKey(logs)) return resolveRpcUrl();
  return logs;
}

// -------------------------------
// Permit helpers (gasless buy)
// -------------------------------
function buildBuyRelayedMsgHash({ buyer, ozWei, nonce, deadline, swapAddress, chainId }) {
  const TAG = keccak256(toHex("BLOCKSWAP_BUY_OZ"));
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
      ],
      [TAG, buyer, ozWei, nonce, deadline, swapAddress, BigInt(chainId)]
    )
  );
}

// -------------------------------
// SIGNATURE NORMALIZATION (STRICT)
// - Rejects non-hex (prevents 450/1986 char garbage)
// - Accepts 64/65/66 byte formats (130/132/134 chars)
// -------------------------------
function isHexOnly(s) {
  return /^0x[0-9a-fA-F]+$/.test(String(s || "").trim());
}

function normalizeSigHexStrict(sig) {
  if (typeof sig === "string") {
    const t = sig.trim().replace(/^"+|"+$/g, "");
    if (!t || t === "0x") throw new Error("Signature missing/blocked (empty).");
    if (!t.startsWith("0x")) throw new Error("Signature is not hex (missing 0x).");
    if (!isHexOnly(t)) throw new Error("Signature is not valid hex.");
    return t;
  }

  if (sig && typeof sig === "object") {
    if (sig.signature) return normalizeSigHexStrict(sig.signature);

    const r = sig.r || sig.R;
    const s = sig.s || sig.S;
    const v = sig.v ?? sig.V;
    const yParity = sig.yParity ?? sig.y_parity ?? sig.parity;

    if (r && s && (v != null || yParity != null)) {
      const hex = signatureToHex({
        r,
        s,
        ...(v != null ? { v: Number(v) } : {}),
        ...(v == null && yParity != null ? { yParity: Number(yParity) } : {}),
      });
      return normalizeSigHexStrict(hex);
    }
  }

  throw new Error("Signature returned in an unsupported format.");
}

function expandCompactSig(sigHex) {
  const s = normalizeSigHexStrict(sigHex);

  // 65-byte
  if (s.length === 132) return s;
  // 66-byte (some providers)
  if (s.length === 134) return s;
  // 64-byte compact
  if (s.length !== 130) throw new Error(`Invalid signature length: ${s.length} (expected 130/132/134).`);

  const r = s.slice(2, 66);
  const vs = s.slice(66);

  const vsFirstByte = parseInt(vs.slice(0, 2), 16);
  const v = (vsFirstByte & 0x80) ? 28 : 27;

  const sFirstByte = (vsFirstByte & 0x7f).toString(16).padStart(2, "0");
  const sRest = vs.slice(2);
  const sFixed = sFirstByte + sRest;

  const vHex = v.toString(16).padStart(2, "0");
  return `0x${r}${sFixed}${vHex}`;
}

function assertSigLen(label, sig) {
  const s = expandCompactSig(sig);
  if (!isHexOnly(s)) throw new Error(`${label} invalid hex.`);
  if (s.length !== 130 && s.length !== 132 && s.length !== 134) {
    throw new Error(`${label} invalid length: ${s.length} (expected 130/132/134).`);
  }
  return s;
}

// -------------------------------
// ✅ Coinbase mobile fix:
// Prefer walletClient.signMessage({ raw }) so it signs BYTES not "0x..." TEXT.
// Fallback to personal_sign if needed.
// -------------------------------
async function signRawHash({ provider, chain, account, msgHash }) {
  try {
    const wc = createWalletClient({ chain, transport: custom(provider) });
    return await wc.signMessage({ account, message: { raw: msgHash } });
  } catch {
    try {
      return await provider.request({ method: "personal_sign", params: [msgHash, account] });
    } catch {
      return await provider.request({ method: "personal_sign", params: [account, msgHash] });
    }
  }
}

// personal_sign helper (kept for compatibility; used only as fallback path)
async function personalSign(provider, msgHash, user) {
  try {
    return await provider.request({ method: "personal_sign", params: [msgHash, user] });
  } catch {
    return await provider.request({ method: "personal_sign", params: [user, msgHash] });
  }
}

// -------------------------------
// Exported adapter
// -------------------------------
export const blockswapAdapter = {
  setProvider(p) {
    setOverrideProvider(p);
  },
  setWalletProvider(p) {
    setOverrideProvider(p);
  },
  clearProvider() {
    clearOverrideProvider();
  },

  setLabel({ walletAddress, label }) {
    if (!walletAddress) return;
    const k = String(walletAddress).toLowerCase();
    const v = String(label || "").trim();
    if (!v) return;
    __labels[k] = v;
  },
  getLabel(walletAddress) {
    if (!walletAddress) return "";
    return __labels?.[String(walletAddress).toLowerCase()] || "";
  },

  logsStatus() {
    const left = Math.max(0, __logsCooldownUntil - nowMs());
    return { cooldownMs: left, failStreak: __logsFailStreak, supabase: !!supabase, relayer: relayerOk() };
  },
  resetLogsCooldown() {
    __logsCooldownUntil = 0;
    __logsFailStreak = 0;
    __activityCache = { atMs: 0, key: "", data: [] };
    __holdersCache = { atMs: 0, key: "", data: [] };
  },

  _publicClient() {
    const chain = chainFromConfig();
    const rpc = resolveRpcUrl();
    const logsRpc = resolveLogsRpcUrl();

    if (DEBUG_LOGS && !__rpcLogged) {
      __rpcLogged = true;
      console.log("[BlockSwap] RPC:", rpc);
      console.log("[BlockSwap] Logs RPC:", logsRpc);
      console.log("[BlockSwap] Deployments URL:", DEPLOYMENTS_URL);
      console.log("[BlockSwap] Relayer URL:", resolveRelayerUrl() || "(not set)");
      console.log("[BlockSwap] Supabase:", supabase ? "ON" : "OFF");
      if (looksLikeAlchemyMissingKey(import.meta.env.VITE_RPC_URL_LOGS)) {
        console.warn("[BlockSwap] VITE_RPC_URL_LOGS looks like missing an Alchemy key; reusing VITE_RPC_URL.");
      }
    }

    if (__pcCache.client && __pcCache.rpc === rpc && __pcCache.chainId === Number(C.CHAIN_ID)) {
      return __pcCache.client;
    }

    const client = createPublicClient({
      chain,
      transport: http(rpc, { retryCount: 2, retryDelay: 350, timeout: 20_000 }),
    });

    __pcCache = { rpc, chainId: Number(C.CHAIN_ID), client };
    return client;
  },

  _walletClient() {
    const chain = chainFromConfig();
    const provider = mustProvider();

    if (__wcCache.client && __wcCache.chainId === Number(C.CHAIN_ID) && __wcCache.provider === provider) {
      return __wcCache.client;
    }

    const client = createWalletClient({ chain, transport: custom(provider) });
    __wcCache = { chainId: Number(C.CHAIN_ID), provider, client };
    return client;
  },

  async waitForTx(hash) {
    const pc = this._publicClient();
    return pc.waitForTransactionReceipt({ hash });
  },

  async getResolvedAddresses() {
    return resolveAddresses();
  },

  async getSwapSnapshot() {
    const { SWAP, USDC, OZ } = await resolveAddresses();
    const pc = this._publicClient();

    const sellPricePerBrick = await pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "sellPricePerBrick" });
    const buybackFloorPerBrick = await pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "buybackFloorPerBrick" });
    const buyPaused = await pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "buyPaused" });

    const floorLiabilityUSDC = await safeRead(
      pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "floorLiabilityUSDC" }),
      0n,
      "floorLiabilityUSDC"
    );

    const treasuryAddr = await safeRead(
      pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "theBlockTreasury" }),
      "0x0000000000000000000000000000000000000000",
      "theBlockTreasury"
    );

    const swapOzBal = await safeRead(pc.readContract({ address: OZ, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [SWAP] }), 0n, "OZ.balanceOf(SWAP)");
    const swapUsdcBal = await safeRead(pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [SWAP] }), 0n, "USDC.balanceOf(SWAP)");

    const treasuryAddrIsZero = !treasuryAddr || String(treasuryAddr).toLowerCase() === "0x0000000000000000000000000000000000000000";

    const treasuryUsdcBal = await safeRead(
      !treasuryAddrIsZero
        ? pc.readContract({ address: USDC, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [treasuryAddr] })
        : Promise.resolve(0n),
      0n,
      "USDC.balanceOf(treasury)"
    );

    const sellPerBrickStr = formatUnits(sellPricePerBrick, 6);
    const floorPerBrickStr = formatUnits(buybackFloorPerBrick, 6);

    const ounceSellPrice = Number(sellPerBrickStr || 0) / OUNCES_PER_BRICK;
    const ounceBuybackFloor = Number(floorPerBrickStr || 0) / OUNCES_PER_BRICK;

    let coverageDisplay = "—";
    if (floorLiabilityUSDC === 0n) coverageDisplay = "∞";
    else {
      const ratio6 = (swapUsdcBal * 1_000_000n) / floorLiabilityUSDC;
      coverageDisplay = (Number(formatUnits(ratio6, 6)) || 0).toFixed(3);
    }

    return {
      ts: nowMs(),
      chainId: Number(C.CHAIN_ID),
      STABLE_SYMBOL: C.STABLE_SYMBOL || "USDC",
      OUNCES_PER_BRICK,

      sellPricePerBrick,
      buybackFloorPerBrick,
      buyPaused,

      floorLiabilityUSDC,
      vaultUSDC: swapUsdcBal,

      treasuryAddr,
      treasuryUsdcBal,

      swapOzBal,
      swapUsdcBal,

      ozInventoryWei: swapOzBal,
      ozInventory: Number(formatUnits(swapOzBal, 18)) || 0,

      ounceSellPrice,
      ounceBuybackFloor,

      fmt: {
        sellPerBrick: sellPerBrickStr,
        floorPerBrick: floorPerBrickStr,
        liability: formatUnits(floorLiabilityUSDC, 6),
        vault: formatUnits(swapUsdcBal, 6),
        treasuryUsdc: formatUnits(treasuryUsdcBal, 6),
        treasuryUSDC: formatUnits(treasuryUsdcBal, 6),
        treasury: formatUnits(treasuryUsdcBal, 6),
        coverage: coverageDisplay,
        swapOz: formatUnits(swapOzBal, 18),
        swapUsdc: formatUnits(swapUsdcBal, 6),
        ozInventory: formatUnits(swapOzBal, 18),
      },
    };
  },

  // ===== BUY/SELL (direct) =====
  async buyOz({ walletAddress, ouncesWhole }) {
    const { SWAP, USDC, OZ } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");

    const ozWei = toBn18(ouncesWhole);

    const pc = this._publicClient();
    const wc = this._walletClient();

    const inv = await safeRead(
      pc.readContract({ address: OZ, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [SWAP] }),
      0n,
      "OZ.balanceOf(SWAP) buy"
    );

    if (inv < ozWei) {
      throw new Error(`Swap is out of inventory. OZ in contract: ${formatUnits(inv, 18)} (need ${formatUnits(ozWei, 18)}).`);
    }

    const sellPricePerBrick = await pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "sellPricePerBrick" });
    const totalIn = costRoundedUp(ozWei, sellPricePerBrick);

    const allowance = await pc.readContract({
      address: USDC,
      abi: ERC20_MIN_ABI,
      functionName: "allowance",
      args: [walletAddress, SWAP],
    });

    if (allowance < totalIn) {
      const approveHash = await wc.writeContract({
        account: walletAddress,
        address: USDC,
        abi: ERC20_MIN_ABI,
        functionName: "approve",
        args: [SWAP, totalIn],
      });

      const buyHash = await wc.writeContract({
        account: walletAddress,
        address: SWAP,
        abi: BlockSwap.abi,
        functionName: "buyOz",
        args: [ozWei],
      });

      return { approveHash, buyHash };
    }

    const hash = await wc.writeContract({
      account: walletAddress,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "buyOz",
      args: [ozWei],
    });

    return { hash };
  },

  async sellBackOz({ walletAddress, ouncesWhole }) {
    const { SWAP, OZ } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");

    const ozWei = toBn18(ouncesWhole);

    const wc = this._walletClient();
    const pc = this._publicClient();

    const allowance = await pc.readContract({
      address: OZ,
      abi: ERC20_MIN_ABI,
      functionName: "allowance",
      args: [walletAddress, SWAP],
    });

    if (allowance < ozWei) {
      const approveHash = await wc.writeContract({
        account: walletAddress,
        address: OZ,
        abi: ERC20_MIN_ABI,
        functionName: "approve",
        args: [SWAP, ozWei],
      });

      const sellHash = await wc.writeContract({
        account: walletAddress,
        address: SWAP,
        abi: BlockSwap.abi,
        functionName: "sellBackOz",
        args: [ozWei],
      });

      return { approveHash, sellHash };
    }

    const hash = await wc.writeContract({
      account: walletAddress,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "sellBackOz",
      args: [ozWei],
    });

    return { hash };
  },

  // ===== GASLESS BUY (permit + relayed buy) =====
  async buyOzGasless({ walletAddress, ouncesWhole, deadlineSecs = 600 }) {
    const relayerUrl = resolveRelayerUrl();
    if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL in the UI (.env.local / Vercel env).");

    const { SWAP, OZ, USDC } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");

    const ozWei = toBn18(ouncesWhole);
    const pc = this._publicClient();

    const nowSec = Math.floor(Date.now() / 1000);
    const buyDeadline = BigInt(nowSec + Number(deadlineSecs || 600));
    const permitDeadline = BigInt(nowSec + Number(deadlineSecs || 600));

    const [inv, sellPricePerBrick, nonce, permitNonce, usdcName, usdcVersion] = await Promise.all([
      safeRead(pc.readContract({ address: OZ, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [SWAP] }), 0n, "OZ.balanceOf(SWAP) gasless buy"),
      pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "sellPricePerBrick" }),
      pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "nonces", args: [walletAddress] }),
      (async () => {
        try {
          return await pc.readContract({ address: USDC, abi: ERC20_PERMIT_ABI, functionName: "nonces", args: [walletAddress] });
        } catch {
          throw new Error(
            `USDC at ${USDC} does not look permit-capable (missing nonces()).\n` +
              `If you're using MockUSDC, make sure UI is pointed at the NEW deployments file.`
          );
        }
      })(),
      safeRead(pc.readContract({ address: USDC, abi: ERC20_PERMIT_ABI, functionName: "name" }), "USDC", "USDC.name"),
      safeRead(pc.readContract({ address: USDC, abi: ERC20_PERMIT_ABI, functionName: "version" }), "1", "USDC.version"),
    ]);

    if (inv < ozWei) throw new Error(`Swap is out of inventory (need ${formatUnits(ozWei, 18)} oz).`);

    const permitValue = costRoundedUp(ozWei, sellPricePerBrick);

    const msgHash = buildBuyRelayedMsgHash({
      buyer: walletAddress,
      ozWei,
      nonce,
      deadline: buyDeadline,
      swapAddress: SWAP,
      chainId: Number(C.CHAIN_ID),
    });

    // ✅ Coinbase mobile-safe buy signature:
    // Prefer walletClient.signMessage({ raw }) first.
    const chain = chainFromConfig();
    const eip1193 = mustProvider();
    const wc = this._walletClient();

    let rawBuySig;
    try {
      rawBuySig = await wc.signMessage({
        account: walletAddress,
        message: { raw: msgHash },
      });
    } catch {
      rawBuySig = await personalSign(eip1193, msgHash, walletAddress);
    }

    const forced = (import.meta.env?.VITE_USDC_PERMIT_VERSION || "").trim();
    const domain = {
      name: usdcName,
      version: forced || String(usdcVersion || "1"),
      chainId: Number(C.CHAIN_ID),
      verifyingContract: USDC,
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      owner: walletAddress,
      spender: SWAP,
      value: permitValue,
      nonce: permitNonce,
      deadline: permitDeadline,
    };

    const rawPermitSig = await wc.signTypedData({
      account: walletAddress,
      domain,
      types,
      primaryType: "Permit",
      message,
    });

    // ✅ STRICT normalize + expand compact signatures BEFORE posting
    const buySignature = assertSigLen("buySignature", rawBuySig);
    const permitSignature = assertSigLen("permitSignature", rawPermitSig);

    const endpoint = `${relayerUrl.replace(/\/+$/, "")}/relay/buy-permit`;

    const { res, j, text } = await fetchJson(endpoint, {
      method: "POST",
      body: {
        user: walletAddress,
        ozWei: ozWei.toString(),
        buyDeadline: Number(buyDeadline),
        buySignature,

        permitValue: permitValue.toString(),
        permitDeadline: Number(permitDeadline),
        permitSignature,
      },
      timeoutMs: 25_000,
      noStore: true,
    });

    if (!res.ok || !j?.ok) {
      throw new Error(j?.error || String(text || "").slice(0, 180) || `Relayer buy-permit failed (HTTP ${res.status})`);
    }

    return { hash: j.hash };
  },
};

// DEV: console testing
try {
  if (typeof window !== "undefined") window.blockswapAdapter = blockswapAdapter;
} catch {}
