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
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  hashMessage,
  recoverAddress,
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
const PORT = Number(ENV.PORT || 3000);
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

// ✅ provider-safe getLogs chunk (you set to 10 via fly secrets)
const LOGS_CHUNK_BLOCKS = BigInt(Number(ENV.LOGS_CHUNK_BLOCKS || 10));

// ✅ request timeout knobs (ms)
const SUPABASE_REQ_TIMEOUT_MS = Number(ENV.SUPABASE_REQ_TIMEOUT_MS || 7000);

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

const allow = new Set<string>(["http://localhost:5173", "http://127.0.0.1:5173"]);
if (UI_ORIGIN) allow.add(UI_ORIGIN);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allow.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST"],
  })
);

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
    if (typeof r !== "string" || !r.startsWith("0x") || r.length !== 66)
      throw new Error(`Invalid ${rKey} (expected 32-byte hex)`);
    if (typeof s !== "string" || !s.startsWith("0x") || s.length !== 66)
      throw new Error(`Invalid ${sKey} (expected 32-byte hex)`);
    return { v: vNum, r, s };
  }

  if (body?.[sigKey]) {
    const sig = hexToSignature(body[sigKey] as `0x${string}`);
    const vNum = normalizeV(Number(sig.v));
    return { v: vNum, r: sig.r, s: sig.s };
  }

  throw new Error(`Missing ${prefix || ""} signature (provide v/r/s or ${sigKey})`);
}

async function requireRelayerMatches() {
  const onchainRelayer = await publicClient.readContract({
    address: BLOCKSWAP_ADDRESS,
    abi: BLOCKSWAP_MIN_ABI,
    functionName: "relayer",
  });
  if (String(onchainRelayer).toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `Relayer mismatch. Contract relayer=${onchainRelayer}, server wallet=${account.address}.`
    );
  }
}

// ✅ Promise/thenable timeout helper (works with supabase query builders too)
async function withTimeout<T = any>(p: any, ms: number, code = "timeout"): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(code)), ms);
  });

  try {
    // Promise.resolve() will "assimilate" thenables (supabase builders)
    return await Promise.race([Promise.resolve(p), timeout]);
  } finally {
    clearTimeout(t);
  }
}

// ✅ EXACT hash scheme from your Solidity
function blockswapBuyMsgHash(params: {
  buyer: `0x${string}`;
  ozWei: bigint;
  nonce: bigint;
  deadline: bigint;
}): `0x${string}` {
  const typeHash = keccak256(
    encodeAbiParameters(parseAbiParameters("string"), ["BLOCKSWAP_BUY_OZ"])
  );

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32,address,uint256,uint256,uint256,address,uint256"),
      [
        typeHash,
        params.buyer,
        params.ozWei,
        params.nonce,
        params.deadline,
        BLOCKSWAP_ADDRESS,
        BigInt(CHAIN_ID),
      ]
    )
  );
}

async function recoverBuyerFromBuySignature(params: {
  buyer: `0x${string}`;
  ozWei: bigint;
  deadline: bigint;
  signature: `0x${string}`;
}): Promise<{
  nonce: bigint;
  msgHash: `0x${string}`;
  ethSignedHash: `0x${string}`;
  recovered: `0x${string}` | null;
  matches: boolean;
}> {
  const nonce = await publicClient.readContract({
    address: BLOCKSWAP_ADDRESS,
    abi: BLOCKSWAP_MIN_ABI,
    functionName: "nonces",
    args: [params.buyer],
  });

  const msgHash = blockswapBuyMsgHash({
    buyer: params.buyer,
    ozWei: params.ozWei,
    nonce,
    deadline: params.deadline,
  });

  const ethSignedHash = hashMessage({ raw: msgHash });

  const recovered = await recoverAddress({
    hash: ethSignedHash,
    signature: params.signature,
  }).catch(() => null);

  const matches = !!recovered && recovered.toLowerCase() === params.buyer.toLowerCase();

  return { nonce, msgHash, ethSignedHash, recovered, matches };
}

// --------------------
// Supabase upserts
// --------------------
async function supaInsertEvent(row: any) {
  if (!supabase) return;
  try {
    const { error } = await withTimeout<any>(
  supabase.from("blockswap_events").insert(row),
  SUPABASE_REQ_TIMEOUT_MS,
  "supabase_timeout"
);

    if (error) {
      const msg = String((error as any).message || "");
      if (!msg.toLowerCase().includes("duplicate")) {
        console.warn("[supa] insert event error:", (error as any).message);
      }
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

    const curOz = (cur as any)?.oz_wei ? BigInt(String((cur as any).oz_wei)) : 0n;
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
let __syncRunning = false;
let __lastSyncedToBlock = 0n;

async function syncFromChain({ lookbackBlocks }: { lookbackBlocks: number }) {
  if (!supabase) return { ok: false, skipped: true, reason: "supabase_not_configured" };
  if (__syncRunning) return { ok: false, skipped: true, reason: "sync_already_running" };

  __syncRunning = true;
  try {
    const latest = await logsClient.getBlockNumber();
    const lb = BigInt(Math.max(1, Math.min(lookbackBlocks || 1, 200_000)));

    const fromA = __lastSyncedToBlock > 0n ? __lastSyncedToBlock + 1n : 0n;
    const fromB = latest > lb ? latest - lb : 1n;
    let fromBlock = fromA > fromB ? fromA : fromB;
    if (fromBlock < 1n) fromBlock = 1n;

    const toBlock = latest;

    // ✅ provider-safe chunk
    const CHUNK = LOGS_CHUNK_BLOCKS > 0n ? LOGS_CHUNK_BLOCKS : 10n;

    let cursor = fromBlock;
    let inserted = 0;
    let updatedHolders = 0;

    while (cursor <= toBlock) {
      const end = cursor + CHUNK - 1n <= toBlock ? cursor + CHUNK - 1n : toBlock;

      const [bought, sold] = await Promise.all([
        logsClient.getLogs({
          address: BLOCKSWAP_ADDRESS,
          event: EVT_BOUGHT,
          fromBlock: cursor,
          toBlock: end,
        }),
        logsClient.getLogs({
          address: BLOCKSWAP_ADDRESS,
          event: EVT_SOLD,
          fromBlock: cursor,
          toBlock: end,
        }),
      ]);

      for (const l of bought || []) {
        const buyer = String((l as any).args?.buyer || "");
        const ozWei = BigInt((l as any).args?.ozWei ?? 0n);
        const usdcTotal = BigInt((l as any).args?.usdcTotal ?? 0n);

        const row = {
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
        };

        await supaInsertEvent(row);
        inserted += 1;

        await supaUpsertHolderDelta({ wallet: buyer, ozWeiDelta: ozWei });
        updatedHolders += 1;
      }

      for (const l of sold || []) {
        const seller = String((l as any).args?.seller || "");
        const ozWei = BigInt((l as any).args?.ozWei ?? 0n);
        const usdcPaid = BigInt((l as any).args?.usdcPaid ?? 0n);

        const row = {
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
        };

        await supaInsertEvent(row);
        inserted += 1;

        await supaUpsertHolderDelta({ wallet: seller, ozWeiDelta: -ozWei });
        updatedHolders += 1;
      }

      cursor = end + 1n;
    }

    __lastSyncedToBlock = toBlock;

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
    console.warn("[sync] failed:", e?.shortMessage || e?.message || e);
    return { ok: false, error: e?.shortMessage || e?.message || "sync_failed" };
  } finally {
    __syncRunning = false;
  }
}

// --------------------
// last request capture
// --------------------
let lastReq: any = null;

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
    relayerMatches =
      !!relayerOnchain && relayerOnchain.toLowerCase() === account.address.toLowerCase();
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
      running: __syncRunning,
      logsChunkBlocks: LOGS_CHUNK_BLOCKS.toString(),
    },
  });
});

// ✅ Supabase connectivity from Fly WITH HEADERS
app.get("/debug/supa-ping", async (_req, res) => {
  try {
    if (!SUPABASE_URL) return sendJson(res, { ok: false, error: "missing_SUPABASE_URL" }, 400);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return sendJson(res, { ok: false, error: "missing_SUPABASE_SERVICE_ROLE_KEY" }, 400);

    const r = await withTimeout(
      fetch(`${SUPABASE_URL}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }),
      7000,
      "supabase_timeout"
    );

    const text = await r.text();
    return sendJson(res, { ok: true, status: r.status, body: text.slice(0, 300) });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return sendJson(res, { ok: false, error: msg }, 400);
  }
});

app.get("/debug/last", (_req, res) => sendJson(res, { ok: true, last: lastReq }));

// --------------------
// FEED endpoints
// --------------------
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

    const { data, error } = await withTimeout<any>(p, SUPABASE_REQ_TIMEOUT_MS, "supabase_timeout");

    return sendJson(res, { ok: true, rows: data || [] });
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

    const { data, error } = await withTimeout<any>(p, SUPABASE_REQ_TIMEOUT_MS, "supabase_timeout");


    return sendJson(res, { ok: true, rows: data || [] });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === "supabase_timeout") return sendJson(res, { ok: false, error: "supabase_timeout" }, 400);
    return sendJson(res, { ok: false, error: msg || "feed holders failed" }, 400);
  }
});

// Manual sync trigger
app.post("/admin/sync", async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
    if (!hit(ip, 10, 10_000)) return sendJson(res, { ok: false, error: "Rate limited" }, 429);

    const lookback = Number(req.body?.lookbackBlocks || SYNC_LOOKBACK_BLOCKS);
    const r = await syncFromChain({ lookbackBlocks: lookback });
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
    const ip =
      req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
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
    return sendJson(res, { ok: false, error: e?.message || "Relay nickname failed" }, 400);
  }
});

app.post("/relay/buy", async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
    if (!hit(ip, 25, 10_000)) return sendJson(res, { ok: false, error: "Rate limited" }, 429);

    const body = BuySchema.parse(req.body);

    const user = mustAddress(body.user, "user");
    const ozWei = mustUint(body.ozWei, "ozWei");
    const deadline = mustUintSeconds(body.deadline, "deadline");
    if (deadline < nowSec()) throw new Error("Expired deadline");

    const { v, r, s } = parseSig(body);

    const hash = await walletClient.writeContract({
      address: BLOCKSWAP_ADDRESS,
      abi: BLOCKSWAP_MIN_ABI,
      functionName: "buyOzRelayed",
      args: [user, ozWei, deadline, v, r, s],
    });

    if (ENABLE_CHAIN_SYNC && hasSupabase()) {
      setTimeout(() => syncFromChain({ lookbackBlocks: 800 }).catch(() => {}), 2500);
    }

    return sendJson(res, { ok: true, hash });
  } catch (e: any) {
    return sendJson(res, { ok: false, error: e?.message || "Relay buy failed" }, 400);
  }
});

app.post("/relay/buy-permit", async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
    if (!hit(ip, 25, 10_000)) return sendJson(res, { ok: false, error: "Rate limited" }, 429);

    lastReq = { at: new Date().toISOString(), endpoint: "/relay/buy-permit", body: req.body };

    const body = BuyPermitSchema.parse(req.body);

    const user = mustAddress(body.user, "user");
    const ozWei = mustUint(body.ozWei, "ozWei");

    const buyDeadline = mustUintSeconds(body.buyDeadline as any, "buyDeadline");
    const permitDeadline = mustUintSeconds(body.permitDeadline as any, "permitDeadline");
    const permitValue = mustUint(body.permitValue, "permitValue");

    const now = nowSec();
    if (buyDeadline < now) throw new Error(`Expired buyDeadline (now=${now.toString()})`);
    if (permitDeadline < now) throw new Error(`Expired permitDeadline (now=${now.toString()})`);

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

    if (ENABLE_CHAIN_SYNC && hasSupabase()) {
      setTimeout(() => syncFromChain({ lookbackBlocks: 800 }).catch(() => {}), 2500);
    }

    return sendJson(res, { ok: true, hash });
  } catch (e: any) {
    return sendJson(
      res,
      { ok: false, error: e?.shortMessage || e?.message || "Relay buy-permit failed" },
      400
    );
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
  console.log(`UI_ORIGIN allowlist: ${Array.from(allow).join(", ")}`);
  console.log(`Supabase: ${hasSupabase() ? "ON" : "OFF"}`);
  console.log(`Logs RPC: ${RPC_URL_LOGS || "(using RPC_URL)"}`);
  console.log(`Logs chunk blocks: ${LOGS_CHUNK_BLOCKS.toString()}`);

  if (ENABLE_CHAIN_SYNC && hasSupabase()) {
    console.log(`[sync] ENABLED every ${SYNC_EVERY_MS}ms, lookback=${SYNC_LOOKBACK_BLOCKS} blocks`);
    setTimeout(() => {
      syncFromChain({ lookbackBlocks: SYNC_LOOKBACK_BLOCKS }).catch(() => {});
    }, 1500);

    setInterval(() => {
      syncFromChain({ lookbackBlocks: SYNC_LOOKBACK_BLOCKS }).catch(() => {});
    }, SYNC_EVERY_MS);
  } else {
    console.log(
      `[sync] DISABLED (ENABLE_CHAIN_SYNC=${ENABLE_CHAIN_SYNC ? "1" : "0"}, supabase=${hasSupabase() ? "ON" : "OFF"})`
    );
  }
});
