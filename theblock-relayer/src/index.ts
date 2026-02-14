// src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  hexToSignature,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

dotenv.config();
const ENV = process.env;

// --------------------
// env
// --------------------
// ✅ Fly expects internal_port=8787. If PORT is not injected, default to 8787 (NOT 3000).
const PORT = Number(ENV.PORT || 8787);
const CHAIN_ID = Number(ENV.CHAIN_ID || 84532);

const RPC_URL = (ENV.RPC_URL || "").trim();
const RPC_URL_LOGS = (ENV.RPC_URL_LOGS || ENV.LOGS_RPC_URL || "").trim(); // optional
const RELAYER_PRIVATE_KEY = (ENV.RELAYER_PRIVATE_KEY || "").trim() as `0x${string}`;

const BLOCKSWAP_ADDRESS = (ENV.BLOCKSWAP_ADDRESS || "").trim() as `0x${string}`;
const NICKNAME_REGISTRY_ADDRESS = (ENV.NICKNAME_REGISTRY_ADDRESS || "").trim() as
  | `0x${string}`
  | "";
const UI_ORIGIN = (ENV.UI_ORIGIN || "").trim();

// Supabase (server-side)
const SUPABASE_URL = (ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (ENV.SUPABASE_SERVICE_ROLE_KEY || "").trim();

// Indexer knobs
const ENABLE_CHAIN_SYNC = String(ENV.ENABLE_CHAIN_SYNC || "1") === "1";
const SYNC_EVERY_MS = Number(ENV.SYNC_EVERY_MS || 90_000);
const SYNC_LOOKBACK_BLOCKS = Number(ENV.SYNC_LOOKBACK_BLOCKS || 4000);
const FEED_LIMIT_DEFAULT = Number(ENV.FEED_LIMIT_DEFAULT || 15);
const HOLDERS_LIMIT_DEFAULT = Number(ENV.HOLDERS_LIMIT_DEFAULT || 250);

// ✅ provider-safe getLogs chunk
const LOGS_CHUNK_BLOCKS = BigInt(Number(ENV.LOGS_CHUNK_BLOCKS || 10));

// ✅ request timeout knobs (ms)
const SUPABASE_REQ_TIMEOUT_MS = Number(ENV.SUPABASE_REQ_TIMEOUT_MS || 7000);

// ✅ sync-on-relay knobs (improves holders freshness)
const SYNC_ON_RELAY = String(ENV.SYNC_ON_RELAY || "1") === "1";
const SYNC_ON_RELAY_DELAY_MS = Number(ENV.SYNC_ON_RELAY_DELAY_MS || 2500);

if (!RPC_URL) throw new Error("Missing RPC_URL");
if (!RELAYER_PRIVATE_KEY) throw new Error("Missing RELAYER_PRIVATE_KEY");
if (!BLOCKSWAP_ADDRESS || !isAddress(BLOCKSWAP_ADDRESS)) {
  throw new Error("Missing/invalid BLOCKSWAP_ADDRESS");
}
if (NICKNAME_REGISTRY_ADDRESS && !isAddress(NICKNAME_REGISTRY_ADDRESS)) {
  throw new Error("Invalid NICKNAME_REGISTRY_ADDRESS");
}

const chain = CHAIN_ID === base.id ? base : baseSepolia;
const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
});

const logsClient = createPublicClient({
  chain,
  transport: http(RPC_URL_LOGS || RPC_URL, { timeout: 25_000, retryCount: 1, retryDelay: 650 }),
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
});

// --------------------
// Supabase
// --------------------
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function hasSupabase() {
  return !!supabase;
}

// --------------------
// ABIs (minimal)
// --------------------
const NICKNAME_MIN_ABI = [
  {
    type: "function",
    name: "setNicknameRelayed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "nick", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const BLOCKSWAP_MIN_ABI = [
  // ✅ legacy relayed buy
  {
    type: "function",
    name: "buyOzRelayed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "ozWei", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },

  // ✅ permit flow
  {
    type: "function",
    name: "buyOzRelayedWithPermit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "ozWei", type: "uint256" },
      {
        name: "buySig",
        type: "tuple",
        components: [
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      {
        name: "permitSig",
        type: "tuple",
        components: [
          { name: "value", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },

  // views
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "buyer", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "relayer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "USDC", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "sellPricePerBrick", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buyPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

// --------------------
// BlockSwap events we index
// --------------------
const EVT_BOUGHT = parseAbiItem(
  "event Bought(address indexed buyer, uint256 ozWei, uint256 usdcTotal, uint256 usdcToVault, uint256 usdcToTreasury)"
);
const EVT_SOLD = parseAbiItem("event SoldBack(address indexed seller, uint256 ozWei, uint256 usdcPaid)");

// --------------------
// app
// --------------------
const app = express();

// ✅ Safe JSON (stringify bigint)
function sendJson(res: any, obj: any, status = 200) {
  return res
    .status(status)
    .set("content-type", "application/json")
    .send(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

// --------------------
// ✅ CORS
// --------------------
const allowlist = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://theblock.live",
  "https://www.theblock.live",
  "https://theblock.vercel.app",
  "https://theblock-n2xy.vercel.app",
]);

if (UI_ORIGIN) allowlist.add(UI_ORIGIN);

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowlist.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "256kb" }));

// --------------------
// tiny rate limit
// --------------------
const bucket = new Map<string, { n: number; resetAt: number }>();
function hit(ip: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cur = bucket.get(ip);
  if (!cur || now > cur.resetAt) {
    bucket.set(ip, { n: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.n >= limit) return false;
  cur.n += 1;
  return true;
}

function getIp(req: express.Request) {
  const xf = req.headers["x-forwarded-for"];
  const s = (Array.isArray(xf) ? xf[0] : xf || "").toString();
  // take first IP if list
  const first = s.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

function zodMsg(e: any) {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  return String(e?.message || e);
}

// --------------------
// schemas
// --------------------
const NicknameSchema = z.object({
  user: z.string(),
  nick: z.string().min(3).max(24),
  deadline: z.union([z.string(), z.number()]),
  v: z.union([z.number(), z.string()]).optional(),
  r: z.string().startsWith("0x").optional(),
  s: z.string().startsWith("0x").optional(),
  signature: z.string().startsWith("0x").optional(),
});

const BuySchema = z.object({
  user: z.string(),
  ozWei: z.union([z.string(), z.number(), z.bigint()]),
  deadline: z.union([z.string(), z.number()]),
  v: z.union([z.number(), z.string()]).optional(),
  r: z.string().startsWith("0x").optional(),
  s: z.string().startsWith("0x").optional(),
  signature: z.string().startsWith("0x").optional(),
});

// ✅ buy-permit schema
const BuyPermitSchema = z.object({
  user: z.string(),
  ozWei: z.union([z.string(), z.number(), z.bigint()]),

  buyDeadline: z.union([z.string(), z.number()]),
  buyV: z.union([z.number(), z.string()]).optional(),
  buyR: z.string().startsWith("0x").optional(),
  buyS: z.string().startsWith("0x").optional(),
  buySignature: z.string().startsWith("0x").optional(),

  permitValue: z.union([z.string(), z.number(), z.bigint()]),
  permitDeadline: z.union([z.string(), z.number()]),
  permitV: z.union([z.number(), z.string()]).optional(),
  permitR: z.string().startsWith("0x").optional(),
  permitS: z.string().startsWith("0x").optional(),
  permitSignature: z.string().startsWith("0x").optional(),
});

// --------------------
// helpers
// --------------------
function mustAddress(a: string, label: string): `0x${string}` {
  if (!isAddress(a)) throw new Error(`Invalid ${label} address`);
  return a as `0x${string}`;
}
function mustUintSeconds(v: string | number, label: string): bigint {
  const n = BigInt(String(v));
  if (n <= 0n) throw new Error(`Invalid ${label}`);
  return n;
}
function mustUint(v: any, label: string): bigint {
  const n = BigInt(String(v));
  if (n <= 0n) throw new Error(`Invalid ${label}`);
  return n;
}
function nowSec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
function lower(a: string) {
  return String(a || "").toLowerCase();
}

// accept both 0/1 and 27/28
function normalizeV(v: number): number {
  if (v === 0 || v === 1) return v + 27;
  return v;
}

/**
 * ✅ KEY FIX: prevents scientific notation (1.08e+21) breaking BigInt
 */
function toIntStringSafe(v: any): string {
  if (v == null) return "0";
  if (typeof v === "bigint") return v.toString();

  const s0 = String(v).trim();
  if (!s0) return "0";
  if (/^-?\d+$/.test(s0)) return s0;

  const m = s0.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) return s0;

  const sign = m[1] || "";
  const intPart = m[2] || "0";
  const fracPart = m[3] || "";
  const exp = parseInt(m[4], 10);

  const digits = (intPart + fracPart).replace(/^0+/, "") || "0";
  const fracLen = fracPart.length;
  const shift = exp - fracLen;

  if (shift >= 0) return sign + (digits + "0".repeat(shift));
  return "0";
}

// parse v/r/s either from v+r+s OR from signature
function parseSig(body: any, prefix?: "buy" | "permit") {
  const vKey = prefix ? `${prefix}V` : "v";
  const rKey = prefix ? `${prefix}R` : "r";
  const sKey = prefix ? `${prefix}S` : "s";
  const sigKey = prefix ? `${prefix}Signature` : "signature";

  if (body?.[vKey] != null && body?.[rKey] && body?.[sKey]) {
    const vNumRaw = Number(body[vKey]);
    if (!Number.isFinite(vNumRaw)) throw new Error(`Invalid ${vKey}`);
    const vNum = normalizeV(vNumRaw);

    const r = body[rKey] as `0x${string}`;
    const s = body[sKey] as `0x${string}`;
    if (typeof r !== "string" || !r.startsWith("0x") || r.length !== 66) throw new Error(`Invalid ${rKey}`);
    if (typeof s !== "string" || !s.startsWith("0x") || s.length !== 66) throw new Error(`Invalid ${sKey}`);
    return { v: vNum, r, s };
  }

  if (body?.[sigKey]) {
    const sigHex = body[sigKey] as `0x${string}`;
    if (typeof sigHex !== "string" || !sigHex.startsWith("0x")) throw new Error(`Invalid ${sigKey}`);
    const sig = hexToSignature(sigHex);
    const vNum = normalizeV(Number(sig.v));
    return { v: vNum, r: sig.r, s: sig.s };
  }

  throw new Error(`Missing ${prefix ? prefix + " " : ""}signature`);
}

async function requireRelayerMatches() {
  const onchainRelayer = await publicClient.readContract({
    address: BLOCKSWAP_ADDRESS,
    abi: BLOCKSWAP_MIN_ABI,
    functionName: "relayer",
  });
  if (String(onchainRelayer).toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Relayer mismatch. Contract relayer=${onchainRelayer}, server wallet=${account.address}.`);
  }
}

// ✅ Promise/thenable timeout helper
async function withTimeout<T = any>(p: any, ms: number, code = "timeout"): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(code)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(p), timeout]);
  } finally {
    clearTimeout(t);
  }
}

// --------------------
// Supabase upserts
// --------------------
async function supaInsertEvent(row: any) {
  if (!supabase) return;
  try {
    const fixed = {
      ...row,
      oz_wei: toIntStringSafe(row.oz_wei),
      usdc_6: toIntStringSafe(row.usdc_6),
    };

    const { error } = await withTimeout<any>(
      supabase.from("blockswap_events").insert(fixed),
      SUPABASE_REQ_TIMEOUT_MS,
      "supabase_timeout"
    );

    if (error) {
      const msg = String((error as any).message || "");
      if (!msg.toLowerCase().includes("duplicate")) console.warn("[supa] insert event error:", (error as any).message);
    }
  } catch (e: any) {
    console.warn("[supa] insert event exception:", e?.message || e);
  }
}

async function supaUpsertHolderDelta(params: { wallet: string; ozWeiDelta: bigint }) {
  if (!supabase) return;

  const wallet = lower(params.wallet);
  const delta = params.ozWeiDelta;
  if (!wallet || wallet.length !== 42) return;

  try {
    const { data: cur, error: readErr } = await withTimeout<any>(
      supabase
        .from("blockswap_holders")
        .select("oz_wei")
        .eq("chain_id", CHAIN_ID)
        .eq("contract", lower(BLOCKSWAP_ADDRESS))
        .eq("wallet", wallet)
        .maybeSingle(),
      SUPABASE_REQ_TIMEOUT_MS,
      "supabase_timeout"
    );

    if (readErr) {
      console.warn("[supa] holders read error:", (readErr as any).message);
      return;
    }

    const curRaw = (cur as any)?.oz_wei;
    const curOz = curRaw != null ? BigInt(toIntStringSafe(curRaw)) : 0n;

    let next = curOz + delta;
    if (next < 0n) next = 0n;

    const { error: upErr } = await withTimeout<any>(
      supabase
        .from("blockswap_holders")
        .upsert(
          {
            chain_id: CHAIN_ID,
            contract: lower(BLOCKSWAP_ADDRESS),
            wallet,
            oz_wei: next.toString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "chain_id,contract,wallet" }
        ),
      SUPABASE_REQ_TIMEOUT_MS,
      "supabase_timeout"
    );

    if (upErr) console.warn("[supa] holders upsert error:", (upErr as any).message);
  } catch (e: any) {
    console.warn("[supa] holders delta exception:", e?.message || e);
  }
}

// --------------------
// Chain sync (getLogs -> Supabase)
// --------------------
let __syncInFlight = false;
let __lastSyncedToBlock = 0n;
let __syncLastRunAt: string | null = null;
let __syncLastOkAt: string | null = null;
let __syncLastError: string | null = null;

async function syncFromChain({ lookbackBlocks }: { lookbackBlocks: number }) {
  if (!supabase) return { ok: false, skipped: true, reason: "supabase_not_configured" };
  if (__syncInFlight) return { ok: false, skipped: true, reason: "sync_already_running" };

  __syncInFlight = true;
  __syncLastRunAt = new Date().toISOString();
  __syncLastError = null;

  try {
    const latest = await logsClient.getBlockNumber();
    const lb = BigInt(Math.max(1, Math.min(lookbackBlocks || 1, 200_000)));

    const fromA = __lastSyncedToBlock > 0n ? __lastSyncedToBlock + 1n : 0n;
    const fromB = latest > lb ? latest - lb : 1n;
    let fromBlock = fromA > fromB ? fromA : fromB;
    if (fromBlock < 1n) fromBlock = 1n;

    const toBlock = latest;
    const CHUNK = LOGS_CHUNK_BLOCKS > 0n ? LOGS_CHUNK_BLOCKS : 10n;

    let cursor = fromBlock;
    let inserted = 0;
    let updatedHolders = 0;

    while (cursor <= toBlock) {
      const end = cursor + CHUNK - 1n <= toBlock ? cursor + CHUNK - 1n : toBlock;

      const [bought, sold] = await Promise.all([
        logsClient.getLogs({ address: BLOCKSWAP_ADDRESS, event: EVT_BOUGHT, fromBlock: cursor, toBlock: end }),
        logsClient.getLogs({ address: BLOCKSWAP_ADDRESS, event: EVT_SOLD, fromBlock: cursor, toBlock: end }),
      ]);

      for (const l of bought || []) {
        const buyer = String((l as any).args?.buyer || "");
        const ozWei = BigInt((l as any).args?.ozWei ?? 0n);
        const usdcTotal = BigInt((l as any).args?.usdcTotal ?? 0n);

        await supaInsertEvent({
          chain_id: CHAIN_ID,
          contract: lower(BLOCKSWAP_ADDRESS),
          event_type: "BUY",
          wallet: lower(buyer),
          oz_wei: ozWei.toString(),
          usdc_6: usdcTotal.toString(),
          block_number: Number((l as any).blockNumber || 0),
          tx_hash: String((l as any).transactionHash || ""),
          log_index: Number((l as any).logIndex ?? 0),
          created_at: new Date().toISOString(),
        });
        inserted += 1;

        await supaUpsertHolderDelta({ wallet: buyer, ozWeiDelta: ozWei });
        updatedHolders += 1;
      }

      for (const l of sold || []) {
        const seller = String((l as any).args?.seller || "");
        const ozWei = BigInt((l as any).args?.ozWei ?? 0n);
        const usdcPaid = BigInt((l as any).args?.usdcPaid ?? 0n);

        await supaInsertEvent({
          chain_id: CHAIN_ID,
          contract: lower(BLOCKSWAP_ADDRESS),
          event_type: "SELLBACK",
          wallet: lower(seller),
          oz_wei: ozWei.toString(),
          usdc_6: usdcPaid.toString(),
          block_number: Number((l as any).blockNumber || 0),
          tx_hash: String((l as any).transactionHash || ""),
          log_index: Number((l as any).logIndex ?? 0),
          created_at: new Date().toISOString(),
        });
        inserted += 1;

        await supaUpsertHolderDelta({ wallet: seller, ozWeiDelta: -ozWei });
        updatedHolders += 1;
      }

      cursor = end + 1n;
    }

    __lastSyncedToBlock = toBlock;
    __syncLastOkAt = new Date().toISOString();

    return {
      ok: true,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      inserted,
      updatedHolders,
      rpcLogs: RPC_URL_LOGS || "(using RPC_URL)",
      chunkBlocks: CHUNK.toString(),
    };
  } catch (e: any) {
    const msg = e?.shortMessage || e?.message || "sync_failed";
    __syncLastError = String(msg);
    console.warn("[sync] failed:", msg);
    return { ok: false, error: String(msg) };
  } finally {
    __syncInFlight = false;
  }
}

// --------------------
// routes
// --------------------
app.get("/", (_req, res) => res.send("The Block Relayer Online"));

app.get("/health", async (_req, res) => {
  const chainIdRpc = await publicClient.getChainId().catch(() => null);

  let relayerOnchain: string | null = null;
  let usdcOnchain: string | null = null;
  let relayerMatches = false;

  try {
    relayerOnchain = await publicClient.readContract({
      address: BLOCKSWAP_ADDRESS,
      abi: BLOCKSWAP_MIN_ABI,
      functionName: "relayer",
    });
    relayerMatches = !!relayerOnchain && relayerOnchain.toLowerCase() === account.address.toLowerCase();
  } catch {}

  try {
    usdcOnchain = await publicClient.readContract({
      address: BLOCKSWAP_ADDRESS,
      abi: BLOCKSWAP_MIN_ABI,
      functionName: "USDC",
    });
  } catch {}

  return sendJson(res, {
    ok: true,
    chainIdEnv: CHAIN_ID,
    chainIdRpc,
    relayerWallet: account.address,
    rpc: RPC_URL ? "set" : "missing",
    rpcLogs: (RPC_URL_LOGS || RPC_URL) ? "set" : "missing",
    blockswap: BLOCKSWAP_ADDRESS,
    onchainRelayer: relayerOnchain,
    relayerMatches,
    onchainUSDC: usdcOnchain,
    supabase: hasSupabase() ? "ON" : "OFF",
    sync: {
      enabled: ENABLE_CHAIN_SYNC,
      everyMs: SYNC_EVERY_MS,
      lookbackBlocks: SYNC_LOOKBACK_BLOCKS,
      lastSyncedToBlock: __lastSyncedToBlock ? __lastSyncedToBlock.toString() : "0",
      inFlight: __syncInFlight,
      lastRunAt: __syncLastRunAt,
      lastOkAt: __syncLastOkAt,
      lastError: __syncLastError,
      logsChunkBlocks: LOGS_CHUNK_BLOCKS.toString(),
      syncOnRelay: SYNC_ON_RELAY,
      syncOnRelayDelayMs: SYNC_ON_RELAY_DELAY_MS,
    },
  });
});

// FEED endpoints
app.get("/feed/activity", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || FEED_LIMIT_DEFAULT)));
    if (!supabase) return sendJson(res, { ok: false, error: "Supabase not configured" }, 400);

    const p = supabase
      .from("blockswap_events")
      .select("event_type,wallet,oz_wei,usdc_6,block_number,tx_hash,created_at")
      .eq("chain_id", CHAIN_ID)
      .eq("contract", lower(BLOCKSWAP_ADDRESS))
      .order("block_number", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data } = await withTimeout<any>(p, SUPABASE_REQ_TIMEOUT_MS, "supabase_timeout");

    const rows = (data || []).map((r: any) => ({
      ...r,
      oz_wei: toIntStringSafe(r.oz_wei),
      usdc_6: toIntStringSafe(r.usdc_6),
    }));

    return sendJson(res, { ok: true, rows });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === "supabase_timeout") return sendJson(res, { ok: false, error: "supabase_timeout" }, 400);
    return sendJson(res, { ok: false, error: msg || "feed activity failed" }, 400);
  }
});

app.get("/feed/holders", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || HOLDERS_LIMIT_DEFAULT)));
    if (!supabase) return sendJson(res, { ok: false, error: "Supabase not configured" }, 400);

    const p = supabase
      .from("blockswap_holders")
      .select("wallet,oz_wei,updated_at")
      .eq("chain_id", CHAIN_ID)
      .eq("contract", lower(BLOCKSWAP_ADDRESS))
      .order("oz_wei", { ascending: false })
      .limit(limit);

    const { data } = await withTimeout<any>(p, SUPABASE_REQ_TIMEOUT_MS, "supabase_timeout");

    const rows = (data || []).map((r: any) => ({
      ...r,
      oz_wei: toIntStringSafe(r.oz_wei),
    }));

    return sendJson(res, { ok: true, rows });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === "supabase_timeout") return sendJson(res, { ok: false, error: "supabase_timeout" }, 400);
    return sendJson(res, { ok: false, error: msg || "feed holders failed" }, 400);
  }
});

// ✅ Manual sync trigger (prevents 404)
app.post("/admin/sync-now", async (_req, res) => {
  try {
    if (!ENABLE_CHAIN_SYNC) return sendJson(res, { ok: false, error: "sync_disabled" }, 400);
    const r = await syncFromChain({ lookbackBlocks: SYNC_LOOKBACK_BLOCKS });
    return sendJson(res, r, r.ok ? 200 : 400);
  } catch (e: any) {
    return sendJson(res, { ok: false, error: e?.message || "sync failed" }, 400);
  }
});

// --------------------
// relay endpoints
// --------------------
app.post("/relay/nickname", async (req, res) => {
  try {
    const ip = getIp(req);
    if (!hit(ip, 25, 10_000)) return sendJson(res, { ok: false, error: "Rate limited" }, 429);

    if (!NICKNAME_REGISTRY_ADDRESS || !isAddress(NICKNAME_REGISTRY_ADDRESS)) {
      throw new Error("Relayer missing/invalid NICKNAME_REGISTRY_ADDRESS");
    }

    const body = NicknameSchema.parse(req.body);

    const user = mustAddress(body.user, "user");
    const deadline = mustUintSeconds(body.deadline, "deadline");
    if (deadline < nowSec()) throw new Error("Expired deadline");

    const nick = String(body.nick || "").trim();
    const { v, r, s } = parseSig(body);

    const hash = await walletClient.writeContract({
      address: NICKNAME_REGISTRY_ADDRESS,
      abi: NICKNAME_MIN_ABI,
      functionName: "setNicknameRelayed",
      args: [user, nick, deadline, v, r, s],
    });

    return sendJson(res, { ok: true, hash });
  } catch (e: any) {
    return sendJson(res, { ok: false, error: zodMsg(e) || "Relay nickname failed" }, 400);
  }
});

app.post("/relay/buy", async (req, res) => {
  try {
    const ip = getIp(req);
    if (!hit(ip, 25, 10_000)) return sendJson(res, { ok: false, error: "Rate limited" }, 429);

    const body = BuySchema.parse(req.body);

    const user = mustAddress(body.user, "user");
    const ozWei = mustUint(body.ozWei, "ozWei");
    const deadline = mustUintSeconds(body.deadline, "deadline");
    if (deadline < nowSec()) throw new Error("Expired deadline");

    await requireRelayerMatches();

    const { v, r, s } = parseSig(body);

    const hash = await walletClient.writeContract({
      address: BLOCKSWAP_ADDRESS,
      abi: BLOCKSWAP_MIN_ABI,
      functionName: "buyOzRelayed",
      args: [user, ozWei, deadline, v, r, s],
    });

    if (hasSupabase()) supaUpsertHolderDelta({ wallet: user, ozWeiDelta: ozWei }).catch(() => {});
    if (ENABLE_CHAIN_SYNC && hasSupabase() && SYNC_ON_RELAY) {
      setTimeout(() => syncFromChain({ lookbackBlocks: 1200 }).catch(() => {}), SYNC_ON_RELAY_DELAY_MS);
    }

    return sendJson(res, { ok: true, hash });
  } catch (e: any) {
    return sendJson(res, { ok: false, error: zodMsg(e) || "Relay buy failed" }, 400);
  }
});

// ✅ buy-permit route
app.post("/relay/buy-permit", async (req, res) => {
  try {
    const ip = getIp(req);
    if (!hit(ip, 25, 10_000)) return sendJson(res, { ok: false, error: "Rate limited" }, 429);

    const body = BuyPermitSchema.parse(req.body);

    const user = mustAddress(body.user, "user");
    const ozWei = mustUint(body.ozWei, "ozWei");

    const buyDeadline = mustUintSeconds(body.buyDeadline as any, "buyDeadline");
    const permitDeadline = mustUintSeconds(body.permitDeadline as any, "permitDeadline");
    const permitValue = mustUint(body.permitValue, "permitValue");

    const now = nowSec();
    if (buyDeadline < now) throw new Error("Expired buyDeadline");
    if (permitDeadline < now) throw new Error("Expired permitDeadline");

    await requireRelayerMatches();

    const buySig = parseSig(body, "buy");
    const permitSig = parseSig(body, "permit");

    const hash = await walletClient.writeContract({
      address: BLOCKSWAP_ADDRESS,
      abi: BLOCKSWAP_MIN_ABI,
      functionName: "buyOzRelayedWithPermit",
      args: [
        user,
        ozWei,
        { deadline: buyDeadline, v: buySig.v, r: buySig.r, s: buySig.s },
        { value: permitValue, deadline: permitDeadline, v: permitSig.v, r: permitSig.r, s: permitSig.s },
      ],
    });

    if (hasSupabase()) supaUpsertHolderDelta({ wallet: user, ozWeiDelta: ozWei }).catch(() => {});
    if (ENABLE_CHAIN_SYNC && hasSupabase() && SYNC_ON_RELAY) {
      setTimeout(() => syncFromChain({ lookbackBlocks: 1200 }).catch(() => {}), SYNC_ON_RELAY_DELAY_MS);
    }

    return sendJson(res, { ok: true, hash });
  } catch (e: any) {
    return sendJson(res, { ok: false, error: zodMsg(e) || "Relay buy-permit failed" }, 400);
  }
});

// --------------------
// boot
// --------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Relayer running on http://0.0.0.0:${PORT}`);
  console.log(`ChainId (env): ${CHAIN_ID}`);
  console.log(`Relayer wallet: ${account.address}`);
  console.log(`BlockSwap: ${BLOCKSWAP_ADDRESS}`);
  console.log(`CORS allowlist: ${Array.from(allowlist).join(", ")}`);
  console.log(`Supabase: ${hasSupabase() ? "ON" : "OFF"}`);
  console.log(`Logs RPC: ${RPC_URL_LOGS || "(using RPC_URL)"}`);
  console.log(`Logs chunk blocks: ${LOGS_CHUNK_BLOCKS.toString()}`);

  if (ENABLE_CHAIN_SYNC && hasSupabase()) {
    console.log(`[sync] ENABLED every ${SYNC_EVERY_MS}ms, lookback=${SYNC_LOOKBACK_BLOCKS} blocks`);
    setTimeout(() => syncFromChain({ lookbackBlocks: SYNC_LOOKBACK_BLOCKS }).catch(() => {}), 1500);
    setInterval(() => syncFromChain({ lookbackBlocks: SYNC_LOOKBACK_BLOCKS }).catch(() => {}), SYNC_EVERY_MS);
  } else {
    console.log(
      `[sync] DISABLED (ENABLE_CHAIN_SYNC=${ENABLE_CHAIN_SYNC ? "1" : "0"}, supabase=${hasSupabase() ? "ON" : "OFF"})`
    );
  }
});
