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
  decodeEventLog,
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

// ----------- events (for RPC fallback) -----------
const EVT_BOUGHT = parseAbiItem(
  "event Bought(address indexed buyer, uint256 ozWei, uint256 usdcTotal, uint256 usdcToVault, uint256 usdcToTreasury)"
);
const EVT_SOLD = parseAbiItem("event SoldBack(address indexed seller, uint256 ozWei, uint256 usdcPaid)");

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
let __pcLogsCache = { rpc: null, chainId: null, client: null };
let __wcCache = { chainId: null, provider: null, client: null };
let __rpcLogged = false;

// logs protection (RPC path only)
let __logsCooldownUntil = 0;
let __logsFailStreak = 0;
const __warnedLabels = new Set();

// activity/holders cache
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

async function calcLogRange(pc, lookbackBlocks, hardCap = 25_000) {
  const latest = await pc.getBlockNumber();
  const raw = Number(lookbackBlocks || 0);
  const capped = Math.max(1, Math.min(raw || 1, hardCap));
  const lb = BigInt(capped);

  let fromBlock = 1n;
  if (latest > lb) fromBlock = latest - lb;
  if (fromBlock < 1n) fromBlock = 1n;

  return { latest, fromBlock };
}

function isLogsFailure(e) {
  const msg = String(e?.shortMessage || e?.message || e || "");
  return (
    msg.includes("400") ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("404") ||
    msg.includes("408") ||
    msg.includes("410") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    /forbidden/i.test(msg) ||
    /rate/i.test(msg) ||
    /timeout/i.test(msg) ||
    /failed/i.test(msg) ||
    /HttpRequestError/i.test(msg) ||
    /PAYG/i.test(msg)
  );
}

function bumpLogsCooldown() {
  __logsFailStreak = Math.min(__logsFailStreak + 1, 3);
  const ms = __logsFailStreak === 1 ? 90_000 : __logsFailStreak === 2 ? 180_000 : 420_000;
  __logsCooldownUntil = nowMs() + ms;
}

function clearLogsFailStreak() {
  __logsFailStreak = 0;
}

function clampBigInt(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function toBlockHex(n) {
  if (n === "latest" || n === "pending" || n === "earliest") return n;
  let b;
  try {
    b = typeof n === "bigint" ? n : BigInt(n);
  } catch {
    throw new Error(`Bad block value for JSON-RPC: ${String(n)}`);
  }
  if (b < 0n) throw new Error(`Negative block: ${b.toString()}`);
  return `0x${b.toString(16)}`;
}

let __lastRpcFailSig = "";

async function rpcPost(url, payload, dbgLabel = "", { timeoutMs = 20_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    const text = await res.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      const sig = `${res.status}|${payload?.method}|${payload?.params?.[0]?.address || ""}|${payload?.params?.[0]?.fromBlock || ""}|${payload?.params?.[0]?.toBlock || ""}`;
      if (DEBUG_LOGS && sig !== __lastRpcFailSig) {
        __lastRpcFailSig = sig;
        console.error("[BlockSwap][RPC HTTP FAIL]", {
          status: res.status,
          dbgLabel,
          url,
          payload,
          responsePreview: String(text || "").slice(0, 500),
        });
      }

      const msg = json?.error?.message || String(text || "").slice(0, 180) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.raw = text;
      throw err;
    }

    if (json?.error) {
      const sig = `jsonerr|${payload?.method}|${json?.error?.code || ""}`;
      if (DEBUG_LOGS && sig !== __lastRpcFailSig) {
        __lastRpcFailSig = sig;
        console.error("[BlockSwap][RPC JSON ERROR]", { dbgLabel, url, payload, error: json.error });
      }
      const err = new Error(json.error.message || "RPC error");
      err.code = json.error.code;
      err.data = json.error.data;
      throw err;
    }

    return json?.result;
  } finally {
    clearTimeout(t);
  }
}

async function getLogsRaw({ rpcUrl, address, fromBlock, toBlock, topic0 }) {
  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "eth_getLogs",
    params: [
      {
        address,
        fromBlock: toBlockHex(fromBlock),
        toBlock: toBlockHex(toBlock),
        topics: topic0 ? [topic0] : [],
      },
    ],
  };

  return rpcPost(rpcUrl, payload, "eth_getLogs");
}

async function getLogsChunkedSafe(
  pc,
  { address, event, fromBlock, toBlock, label, chunkSize = 900n, maxChunks = 12, maxLogs = 400, force = false, rpcUrl = "", topic0 = "", decodeEvent = null }
) {
  if (!force && nowMs() < __logsCooldownUntil) return [];

  const from = BigInt(fromBlock);
  const to = BigInt(toBlock);
  if (to < from) return [];

  let size = chunkSize < 1n ? 1n : chunkSize;

  const out = [];
  let cursor = from;
  let chunks = 0;

  let loggedOnce = false;

  while (cursor <= to) {
    if (chunks >= maxChunks) break;
    if (out.length >= maxLogs) break;

    const end = cursor + size - 1n <= to ? cursor + size - 1n : to;

    try {
      const logs = await pc.getLogs({ address, event, fromBlock: cursor, toBlock: end });
      if (Array.isArray(logs) && logs.length) {
        out.push(...logs);
        if (out.length >= maxLogs) break;
      }
      chunks += 1;
      cursor = end + 1n;
    } catch (e) {
      const msg = String(e?.shortMessage || e?.message || e || "");

      if (label && !__warnedLabels.has(label)) {
        __warnedLabels.add(label);
        if (DEBUG_LOGS) console.warn(`[logs] ${label} failed:`, msg);
      }
      if (isLogsFailure(e)) bumpLogsCooldown();

      // raw fallback
      if (rpcUrl && topic0 && decodeEvent) {
        try {
          if (DEBUG_LOGS && !loggedOnce) {
            loggedOnce = true;
            console.warn("[logs] switching to RAW eth_getLogs fallback for:", label);
          }

          const raw = await getLogsRaw({ rpcUrl, address, fromBlock: cursor, toBlock: end, topic0 });

          if (Array.isArray(raw) && raw.length) {
            for (const r of raw) {
              try {
                const decoded = decodeEventLog({ abi: [decodeEvent], data: r.data, topics: r.topics });

                out.push({
                  args: decoded.args,
                  blockNumber: BigInt(r.blockNumber),
                  transactionHash: r.transactionHash,
                });
              } catch {}
            }
            if (out.length >= maxLogs) break;
          }

          chunks += 1;
          cursor = end + 1n;
          continue;
        } catch (rawErr) {
          const rawMsg = String(rawErr?.message || rawErr || "");
          if (DEBUG_LOGS && !loggedOnce) {
            loggedOnce = true;
            console.warn("[logs] RAW fallback failed:", rawMsg);
          }
        }
      }

      // shrink chunk and retry
      if (size > 200n) size = clampBigInt(size / 2n, 200n, 2000n);
      else return [];
      continue;
    }
  }

  clearLogsFailStreak();
  return out.slice(0, maxLogs);
}

function makeKey(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(Math.random());
  }
}

function shouldUseCache(cache, ttlMs, key) {
  const now = Date.now();
  return cache.data && cache.key === key && now - cache.atMs < ttlMs;
}

function fmtTsFromBlock(blockNumber) {
  return blockNumber ? `#${Number(blockNumber).toLocaleString()}` : "";
}

function pickNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function supaOk() {
  return !!supabase;
}

// Parse helpers used by relayer/supabase
function parseOzWeiToOz(ozWei) {
  try {
    const b = BigInt(String(ozWei || "0"));
    return pickNum(formatUnits(b, 18), 0);
  } catch {
    return 0;
  }
}
function parseUsdc6ToNum(usdc6) {
  try {
    const b = BigInt(String(usdc6 || "0"));
    return pickNum(formatUnits(b, 6), 0);
  } catch {
    return 0;
  }
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

async function getPermitDomain({ pc, usdc, chainId }) {
  const name = await safeRead(
    pc.readContract({ address: usdc, abi: ERC20_PERMIT_ABI, functionName: "name" }),
    "USDC",
    "USDC.name"
  );

  const forced = (import.meta.env?.VITE_USDC_PERMIT_VERSION || "").trim();
  if (forced) {
    return { name, version: forced, chainId: Number(chainId), verifyingContract: usdc };
  }

  const version = await safeRead(
    pc.readContract({ address: usdc, abi: ERC20_PERMIT_ABI, functionName: "version" }),
    "1",
    "USDC.version"
  );

  return { name, version: String(version || "1"), chainId: Number(chainId), verifyingContract: usdc };
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
    return { cooldownMs: left, failStreak: __logsFailStreak, supabase: supaOk(), relayer: relayerOk() };
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

    // ✅ ONLY log sensitive RPC info when DEBUG_LOGS=1
    if (DEBUG_LOGS && !__rpcLogged) {
      __rpcLogged = true;
      console.log("[BlockSwap] RPC:", rpc);
      console.log("[BlockSwap] Logs RPC:", logsRpc);
      console.log("[BlockSwap] Deployments URL:", DEPLOYMENTS_URL);
      console.log("[BlockSwap] Relayer URL:", resolveRelayerUrl() || "(not set)");
      console.log("[BlockSwap] Supabase:", supaOk() ? "ON" : "OFF");
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

  _publicLogsClient() {
    const chain = chainFromConfig();
    const rpc = resolveLogsRpcUrl();

    if (__pcLogsCache.client && __pcLogsCache.rpc === rpc && __pcLogsCache.chainId === Number(C.CHAIN_ID)) {
      return __pcLogsCache.client;
    }

    const client = createPublicClient({
      chain,
      transport: http(rpc, { retryCount: 1, retryDelay: 650, timeout: 25_000 }),
    });

    __pcLogsCache = { rpc, chainId: Number(C.CHAIN_ID), client };
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

    const floorLiabilityUSDC = await safeRead(pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "floorLiabilityUSDC" }), 0n, "floorLiabilityUSDC");

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

    const ounceSellPrice = pickNum(sellPerBrickStr, 0) / OUNCES_PER_BRICK;
    const ounceBuybackFloor = pickNum(floorPerBrickStr, 0) / OUNCES_PER_BRICK;

    let coverageDisplay = "—";
    if (floorLiabilityUSDC === 0n) coverageDisplay = "∞";
    else {
      const ratio6 = (swapUsdcBal * 1_000_000n) / floorLiabilityUSDC;
      coverageDisplay = (pickNum(formatUnits(ratio6, 6), 0) || 0).toFixed(3);
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
      ozInventory: pickNum(formatUnits(swapOzBal, 18), 0),

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

  // ===== ACTIVITY FEED =====
  async getRecentActivity({ force = false, lookbackBlocks, max, limit } = {}) {
    const take = Math.max(1, Number(limit ?? max ?? STREET_LIMIT));
    const key = makeKey({ chainId: Number(C.CHAIN_ID), take, relayer: relayerOk(), supa: supaOk() });

    const ttl = STREET_POLL_MS;
    if (!force && shouldUseCache(__activityCache, ttl, key)) return __activityCache.data;

    // 1) RELAYER FEED FIRST
    if (relayerOk()) {
      const baseUrl = resolveRelayerUrl().replace(/\/+$/, "");
      try {
        const { res, j } = await fetchJson(`${baseUrl}/feed/activity?limit=${encodeURIComponent(take)}`, { timeoutMs: 15_000 });
        if (res.ok && j?.ok && Array.isArray(j.rows)) {
          const stable = C.STABLE_SYMBOL || "USDC";
          const data = j.rows.map((r) => {
            const kind = String(r?.event_type || "").toUpperCase();
            const who = r?.wallet ? (String(r.wallet).startsWith("0x") ? r.wallet : `0x${r.wallet}`) : "";
            const whoLabel = labelOrShort(who);
            const oz = parseOzWeiToOz(r?.oz_wei);
            const usdc = parseUsdc6ToNum(r?.usdc_6);
            const ozTxt = oz.toLocaleString(undefined, { maximumFractionDigits: 6 });
            const usdcTxt = usdc.toLocaleString(undefined, { maximumFractionDigits: 2 });
            const text =
              kind === "BUY"
                ? `BUY • ${whoLabel} bought ${ozTxt} oz for ${usdcTxt} ${stable}`
                : kind === "SELLBACK"
                ? `SELLBACK • ${whoLabel} sold ${ozTxt} oz for ${usdcTxt} ${stable}`
                : `${kind || "TX"} • ${whoLabel}`;

            return {
              kind: kind === "SELLBACK" ? "SELL" : kind,
              who,
              whoLabel,
              oz,
              usdc,
              blockNumber: Number(r?.block_number || 0),
              txHash: r?.tx_hash || "",
              ts: fmtTsFromBlock(Number(r?.block_number || 0)),
              text,
            };
          });

          __activityCache = { atMs: nowMs(), key, data };
          return data;
        }
      } catch (e) {
        if (DEBUG_LOGS) console.warn("[relayer feed] activity failed:", e?.message || e);
      }
    }

    // 2) Supabase (optional)
    if (supaOk()) {
      try {
        const { data, error } = await supabase
          .from("blockswap_events")
          .select("event_type,wallet,oz_wei,usdc_6,block_number,tx_hash,created_at")
          .eq("chain_id", Number(C.CHAIN_ID))
          .order("block_number", { ascending: false })
          .limit(take);

        if (!error && Array.isArray(data)) {
          const stable = C.STABLE_SYMBOL || "USDC";
          const mapped = data.map((r) => {
            const kind = String(r?.event_type || "").toUpperCase();
            const who = r?.wallet ? (String(r.wallet).startsWith("0x") ? r.wallet : `0x${r.wallet}`) : "";
            const whoLabel = labelOrShort(who);
            const oz = parseOzWeiToOz(r?.oz_wei);
            const usdc = parseUsdc6ToNum(r?.usdc_6);
            const ozTxt = oz.toLocaleString(undefined, { maximumFractionDigits: 6 });
            const usdcTxt = usdc.toLocaleString(undefined, { maximumFractionDigits: 2 });
            const text =
              kind === "BUY"
                ? `BUY • ${whoLabel} bought ${ozTxt} oz for ${usdcTxt} ${stable}`
                : kind === "SELLBACK"
                ? `SELLBACK • ${whoLabel} sold ${ozTxt} oz for ${usdcTxt} ${stable}`
                : `${kind || "TX"} • ${whoLabel}`;

            return {
              kind: kind === "SELLBACK" ? "SELL" : kind,
              who,
              whoLabel,
              oz,
              usdc,
              blockNumber: Number(r?.block_number || 0),
              txHash: r?.tx_hash || "",
              ts: fmtTsFromBlock(Number(r?.block_number || 0)),
              text,
            };
          });

          __activityCache = { atMs: nowMs(), key, data: mapped };
          return mapped;
        }
      } catch {}
    }

    // 3) RPC fallback
    const { SWAP } = await resolveAddresses();
    const pcLogs = this._publicLogsClient();
    const logsRpcUrl = resolveLogsRpcUrl();
    const lb = Number(lookbackBlocks || STREET_RPC_LOOKBACK);

    try {
      const { latest, fromBlock } = await calcLogRange(pcLogs, lb, 25_000);

      const [boughtLogs, soldLogs] = await Promise.all([
        getLogsChunkedSafe(pcLogs, {
          address: SWAP,
          event: EVT_BOUGHT,
          fromBlock,
          toBlock: latest,
          label: "Bought logs",
          force,
          maxLogs: 600,
          maxChunks: 14,
          rpcUrl: logsRpcUrl,
          topic0: TOPIC_BOUGHT,
          decodeEvent: EVT_BOUGHT,
        }),
        getLogsChunkedSafe(pcLogs, {
          address: SWAP,
          event: EVT_SOLD,
          fromBlock,
          toBlock: latest,
          label: "SoldBack logs",
          force,
          maxLogs: 600,
          maxChunks: 14,
          rpcUrl: logsRpcUrl,
          topic0: TOPIC_SOLD,
          decodeEvent: EVT_SOLD,
        }),
      ]);

      const rows = [];

      for (const l of boughtLogs || []) {
        const who = l?.args?.buyer;
        const ozWei = BigInt(l?.args?.ozWei ?? 0n);
        const oz = pickNum(formatUnits(ozWei, 18), 0);
        const usdc = pickNum(formatUnits(BigInt(l?.args?.usdcTotal ?? 0n), 6), 0);
        rows.push({
          kind: "BUY",
          who,
          whoLabel: labelOrShort(who),
          ozWei: ozWei.toString(),
          oz,
          usdc,
          blockNumber: Number(l.blockNumber || 0),
          txHash: l.transactionHash,
        });
      }

      for (const l of soldLogs || []) {
        const who = l?.args?.seller;
        const ozWei = BigInt(l?.args?.ozWei ?? 0n);
        const oz = pickNum(formatUnits(ozWei, 18), 0);
        const usdc = pickNum(formatUnits(BigInt(l?.args?.usdcPaid ?? 0n), 6), 0);
        rows.push({
          kind: "SELL",
          who,
          whoLabel: labelOrShort(who),
          ozWei: ozWei.toString(),
          oz,
          usdc,
          blockNumber: Number(l.blockNumber || 0),
          txHash: l.transactionHash,
        });
      }

      rows.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));

      const stable = C.STABLE_SYMBOL || "USDC";
      const data = rows.slice(0, take).map((r) => {
        const ts = fmtTsFromBlock(r.blockNumber);
        const ozTxt = r.oz.toLocaleString(undefined, { maximumFractionDigits: 6 });
        const usdcTxt = r.usdc.toLocaleString(undefined, { maximumFractionDigits: 2 });

        const text =
          r.kind === "BUY"
            ? `BUY • ${r.whoLabel} bought ${ozTxt} oz for ${usdcTxt} ${stable}`
            : `SELLBACK • ${r.whoLabel} sold ${ozTxt} oz for ${usdcTxt} ${stable}`;

        return { text, ts, ...r };
      });

      __activityCache = { atMs: nowMs(), key, data };
      return data;
    } catch (e) {
      if (DEBUG_LOGS) console.warn("[activity] failed:", e?.shortMessage || e?.message || e);
      if (isLogsFailure(e)) bumpLogsCooldown();
      return [];
    }
  },

  // ===== HOLDERS TABLE =====
  async getHoldersFromEvents({ force = false, lookbackBlocks, max, limit, maxAddrs, maxRows } = {}) {
    const cap = Math.max(1, Number(limit ?? max ?? maxRows ?? maxAddrs ?? HOLDERS_LIMIT));
    const key = makeKey({ chainId: Number(C.CHAIN_ID), cap, relayer: relayerOk(), supa: supaOk() });

    const ttl = HOLDERS_POLL_MS;
    if (!force && shouldUseCache(__holdersCache, ttl, key)) return __holdersCache.data;

    // 1) RELAYER FEED FIRST
    if (relayerOk()) {
      const baseUrl = resolveRelayerUrl().replace(/\/+$/, "");
      try {
        const { res, j } = await fetchJson(`${baseUrl}/feed/holders?limit=${encodeURIComponent(cap)}`, { timeoutMs: 15_000 });
        if (res.ok && j?.ok && Array.isArray(j.rows)) {
          const data = j.rows
            .map((r) => {
              const address = r?.wallet ? (String(r.wallet).startsWith("0x") ? r.wallet : `0x${r.wallet}`) : "";
              const ozWeiStr = String(r?.oz_wei ?? "0");
              const oz = parseOzWeiToOz(ozWeiStr);
              return {
                address,
                oz,
                ozWei: ozWeiStr,
                label: labelOrShort(address),
                bricks: oz / OUNCES_PER_BRICK,
              };
            })
            .filter((x) => x.address && x.oz > 0)
            .sort((a, b) => (b.oz || 0) - (a.oz || 0))
            .slice(0, cap);

          __holdersCache = { atMs: nowMs(), key, data };
          return data;
        }
      } catch (e) {
        if (DEBUG_LOGS) console.warn("[relayer feed] holders failed:", e?.message || e);
      }
    }

    // 2) Supabase fallback
    if (supaOk()) {
      try {
        const { data, error } = await supabase
          .from("blockswap_holders")
          .select("wallet,oz_wei,updated_at")
          .eq("chain_id", Number(C.CHAIN_ID))
          .order("oz_wei", { ascending: false })
          .limit(cap);

        if (!error && Array.isArray(data)) {
          const mapped = data
            .map((r) => {
              const address = r?.wallet ? (String(r.wallet).startsWith("0x") ? r.wallet : `0x${r.wallet}`) : "";
              const ozWeiStr = String(r?.oz_wei ?? "0");
              const oz = parseOzWeiToOz(ozWeiStr);
              return {
                address,
                oz,
                ozWei: ozWeiStr,
                label: labelOrShort(address),
                bricks: oz / OUNCES_PER_BRICK,
              };
            })
            .filter((x) => x.address && x.oz > 0);

          __holdersCache = { atMs: nowMs(), key, data: mapped };
          return mapped;
        }
      } catch {}
    }

    // 3) RPC fallback
    const { SWAP } = await resolveAddresses();
    const pcLogs = this._publicLogsClient();
    const logsRpcUrl = resolveLogsRpcUrl();

    const lb = Number(lookbackBlocks || HOLDERS_RPC_LOOKBACK);

    try {
      const { latest, fromBlock } = await calcLogRange(pcLogs, lb, 25_000);

      const [boughtLogs, soldLogs] = await Promise.all([
        getLogsChunkedSafe(pcLogs, {
          address: SWAP,
          event: EVT_BOUGHT,
          fromBlock,
          toBlock: latest,
          label: "Bought logs (holders)",
          force,
          maxLogs: 1200,
          maxChunks: 18,
          rpcUrl: logsRpcUrl,
          topic0: TOPIC_BOUGHT,
          decodeEvent: EVT_BOUGHT,
        }),
        getLogsChunkedSafe(pcLogs, {
          address: SWAP,
          event: EVT_SOLD,
          fromBlock,
          toBlock: latest,
          label: "SoldBack logs (holders)",
          force,
          maxLogs: 1200,
          maxChunks: 18,
          rpcUrl: logsRpcUrl,
          topic0: TOPIC_SOLD,
          decodeEvent: EVT_SOLD,
        }),
      ]);

      const map = new Map();

      for (const l of boughtLogs || []) {
        const addr = String(l?.args?.buyer || "");
        if (!addr) continue;
        const k = addr.toLowerCase();
        const oz = BigInt(l?.args?.ozWei ?? 0n);
        const cur = map.get(k) || { address: addr, ozWei: 0n };
        cur.address = addr;
        cur.ozWei = (cur.ozWei || 0n) + oz;
        map.set(k, cur);
      }

      for (const l of soldLogs || []) {
        const addr = String(l?.args?.seller || "");
        if (!addr) continue;
        const k = addr.toLowerCase();
        const oz = BigInt(l?.args?.ozWei ?? 0n);
        const cur = map.get(k) || { address: addr, ozWei: 0n };
        cur.address = addr;
        cur.ozWei = (cur.ozWei || 0n) - oz;
        map.set(k, cur);
      }

      const data = Array.from(map.values())
        .filter((x) => (x?.ozWei || 0n) > 0n)
        .sort((a, b) => (b.ozWei > a.ozWei ? 1 : b.ozWei < a.ozWei ? -1 : 0))
        .slice(0, cap)
        .map((x) => {
          const oz = pickNum(formatUnits(x.ozWei, 18), 0);
          return {
            address: x.address,
            oz,
            ozWei: x.ozWei.toString(),
            label: labelOrShort(x.address),
            bricks: oz / OUNCES_PER_BRICK,
          };
        });

      __holdersCache = { atMs: nowMs(), key, data };
      return data;
    } catch (e) {
      if (DEBUG_LOGS) console.warn("[holders] failed:", e?.shortMessage || e?.message || e);
      if (isLogsFailure(e)) bumpLogsCooldown();
      return [];
    }
  },

  // aliases
  async getHoldersSnapshot(opts = {}) {
    return this.getHoldersFromEvents(opts);
  },
  async getRecentActivitySnapshot(opts = {}) {
    return this.getRecentActivity(opts);
  },

  // ===== ADMIN (on-chain) =====
  async adminSetBuyPaused({ walletAddress, paused }) {
    const { SWAP } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");
    const wc = this._walletClient();

    const hash = await wc.writeContract({
      account: walletAddress,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "setBuyPaused",
      args: [!!paused],
    });

    return { hash };
  },

  async adminSetPrices({ walletAddress, sellPricePerBrick, buybackFloorPerBrick }) {
    const { SWAP } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");

    const sell = toBn6(sellPricePerBrick);
    const floor = toBn6(buybackFloorPerBrick);

    const wc = this._walletClient();
    const hash = await wc.writeContract({
      account: walletAddress,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "setPrices",
      args: [sell, floor],
    });

    return { hash };
  },

  async adminSetTreasury({ walletAddress, treasury }) {
    const { SWAP } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");
    const t = mustAddr("Treasury", treasury);

    const wc = this._walletClient();
    const hash = await wc.writeContract({
      account: walletAddress,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "setTreasury",
      args: [t],
    });

    return { hash };
  },

  async adminSetRelayer({ walletAddress, relayer }) {
    const { SWAP } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");
    const r = mustAddr("Relayer", relayer);

    const wc = this._walletClient();
    const hash = await wc.writeContract({
      account: walletAddress,
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "setRelayer",
      args: [r],
    });

    return { hash };
  },

  // ===== BUY/SELL (direct) =====
  async buyOz({ walletAddress, ouncesWhole }) {
    const { SWAP, USDC, OZ } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");

    const ozWei = toBn18(ouncesWhole);

    const pc = this._publicClient();
    const wc = this._walletClient();

    const inv = await safeRead(pc.readContract({ address: OZ, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [SWAP] }), 0n, "OZ.balanceOf(SWAP) buy");

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
    if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL in the UI (.env.local).");

    const { SWAP, OZ, USDC } = await resolveAddresses();
    if (!walletAddress) throw new Error("Connect wallet.");

    const ozWei = toBn18(ouncesWhole);
    const pc = this._publicClient();

    const inv = await safeRead(pc.readContract({ address: OZ, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [SWAP] }), 0n, "OZ.balanceOf(SWAP) gasless buy");
    if (inv < ozWei) throw new Error(`Swap is out of inventory (need ${formatUnits(ozWei, 18)} oz).`);

    const sellPricePerBrick = await pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "sellPricePerBrick" });
    const permitValue = costRoundedUp(ozWei, sellPricePerBrick);

    // NOTE: This nonce is from your BlockSwap relayed-buy nonce tracker (not USDC nonce)
    const nonce = await pc.readContract({ address: SWAP, abi: BlockSwap.abi, functionName: "nonces", args: [walletAddress] });

    const nowSec = Math.floor(Date.now() / 1000);
    const buyDeadline = BigInt(nowSec + Number(deadlineSecs || 600));
    const permitDeadline = BigInt(nowSec + Number(deadlineSecs || 600));

    const msgHash = buildBuyRelayedMsgHash({
      buyer: walletAddress,
      ozWei,
      nonce,
      deadline: buyDeadline,
      swapAddress: SWAP,
      chainId: Number(C.CHAIN_ID),
    });

    const wc = this._walletClient();

    const buySignature = await wc.signMessage({
      account: walletAddress,
      message: { raw: msgHash },
    });

    let permitNonce;
    try {
      permitNonce = await pc.readContract({ address: USDC, abi: ERC20_PERMIT_ABI, functionName: "nonces", args: [walletAddress] });
    } catch {
      throw new Error(
        `USDC at ${USDC} does not look permit-capable (missing nonces()).\n` +
          `If you're using MockUSDC, make sure UI is pointed at the NEW deployments file.`
      );
    }

    const domain = await getPermitDomain({ pc, usdc: USDC, chainId: Number(C.CHAIN_ID) });

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

    const permitSignature = await wc.signTypedData({
      account: walletAddress,
      domain,
      types,
      primaryType: "Permit",
      message,
    });

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

    if (!res.ok || !j?.ok) throw new Error(j?.error || String(text || "").slice(0, 180) || `Relayer buy-permit failed (HTTP ${res.status})`);

    return { hash: j.hash };
  },
};

// DEV: console testing
try {
  if (typeof window !== "undefined") window.blockswapAdapter = blockswapAdapter;
} catch {}
