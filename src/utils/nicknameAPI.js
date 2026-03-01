// src/utils/nicknameAPI.js
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  toBytes,
  getAddress,
} from "viem";
import { baseSepolia, base } from "viem/chains";

function envBool(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const DBG = envBool(import.meta.env.VITE_DEBUG_NICKNAME);

function dlog(...args) {
  if (DBG) console.log("[nicknameAPI]", ...args);
}

function sanitizeUrl(u) {
  return String(u || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, "");
}

function chainFromConfig() {
  return Number(C.CHAIN_ID) === base.id ? base : baseSepolia;
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
    sanitizeUrl(import.meta.env.VITE_BASE_MAINNET_RPC) ||
    sanitizeUrl(import.meta.env.VITE_BASE_SEPOLIA_RPC) ||
    chain?.rpcUrls?.default?.http?.[0] ||
    chain?.rpcUrls?.public?.http?.[0];

  if (!rpc) throw new Error("Missing RPC URL. Set VITE_RPC_URL.");
  return rpc;
}

function resolveRelayerUrl() {
  return (
    sanitizeUrl(import.meta.env.VITE_RELAYER_URL) ||
    sanitizeUrl(import.meta.env.VITE_BLOCK_RELAYER_URL) ||
    ""
  ).replace(/\/+$/, "");
}

function isProbablyMobile() {
  try {
    const ua = (navigator?.userAgent || "").toLowerCase();
    return ua.includes("android") || ua.includes("iphone") || ua.includes("ipad");
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function toChainId(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return 0;
  if (s.startsWith("0x")) {
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function mustAddr(label, v) {
  const s = String(v || "").trim();
  try {
    return getAddress(s);
  } catch {
    if (!isAddress(s)) throw new Error(`Bad ${label} address: ${v}`);
    throw new Error(`Bad ${label} address (checksum): ${v}`);
  }
}

// --- minimal NicknameRegistryRelayed ABI ---
const NICK_ABI = [
  {
    type: "function",
    name: "nicknameOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

// Optional direct set (if your registry supports it)
const NICK_DIRECT_ABI = [
  {
    type: "function",
    name: "setNickname",
    stateMutability: "nonpayable",
    inputs: [{ name: "nick", type: "string" }],
    outputs: [],
  },
];

// ✅ Align with BlockSwap adapter deployments naming
const DEPLOYMENTS_URL =
  Number(C.CHAIN_ID) === 8453 ? "/deployments.baseMainnet.json" : "/deployments.baseSepolia.json";

async function resolveRegistryAddress() {
  // 1) explicit env wins
  const addr = sanitizeUrl(import.meta.env.VITE_NICKNAME_REGISTRY_ADDRESS);
  if (addr && isAddress(addr)) return mustAddr("NicknameRegistry", addr);

  // 2) deployments file fallback
  try {
    const res = await fetch(DEPLOYMENTS_URL, { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      const dj = d?.contracts ? d.contracts : d;

      const fromJson =
        dj?.NicknameRegistryRelayed ||
        dj?.NicknameRegistry ||
        dj?.nicknameRegistryRelayed ||
        dj?.nicknameRegistry ||
        null;

      if (fromJson && isAddress(fromJson)) return mustAddr("NicknameRegistry", fromJson);
    }
  } catch {}

  throw new Error(
    "Missing Nickname Registry address. Set VITE_NICKNAME_REGISTRY_ADDRESS (local .env.local + Vercel env) " +
      `or ensure ${DEPLOYMENTS_URL} contains NicknameRegistryRelayed.`
  );
}

async function getWalletChainId(provider) {
  const hex = await withTimeout(
    provider.request({ method: "eth_chainId", params: [] }),
    12_000,
    "Wallet did not respond to eth_chainId (timeout). Open your wallet app and try again."
  );
  const n = toChainId(hex);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Could not read wallet chainId.");
  return n;
}

/**
 * MUST match Solidity exactly:
 * msgHash = keccak256(abi.encode(
 *   keccak256("NICKNAME_SET"),
 *   user,
 *   keccak256(bytes(nick)),
 *   nonce,
 *   deadline,
 *   address(this),
 *   chainid
 * ))
 */
function nicknameMsgHash({ user, nick, nonce, deadline, registry, chainId }) {
  const tag = keccak256(toBytes("NICKNAME_SET"));
  const nickHash = keccak256(toBytes(String(nick || "")));

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32,address,bytes32,uint256,uint256,address,uint256"),
      [tag, user, nickHash, BigInt(nonce), BigInt(deadline), registry, BigInt(chainId)]
    )
  );
}

// -------------------------------
// Signature normalization
// -------------------------------
function isHexOnly(s) {
  return /^0x[0-9a-fA-F]+$/.test(String(s || "").trim());
}

function extractHexSigFromAny(raw) {
  if (raw && typeof raw === "object") {
    if (raw.signature) return extractHexSigFromAny(raw.signature);
    if (raw.result) return extractHexSigFromAny(raw.result);
    if (raw.data) return extractHexSigFromAny(raw.data);
    raw = JSON.stringify(raw);
  }

  const s = String(raw || "").trim().replace(/^"+|"+$/g, "");
  if (!s || s === "0x") {
    throw new Error("Signature missing/blocked (empty). Approve the wallet prompt and try again.");
  }

  if (isHexOnly(s) && (s.length === 130 || s.length === 132 || s.length === 134)) return s;

  const m66 = s.match(/0x[0-9a-fA-F]{132}/);
  if (m66?.[0]) return m66[0];
  const m65 = s.match(/0x[0-9a-fA-F]{130}/);
  if (m65?.[0]) return m65[0];
  const m64 = s.match(/0x[0-9a-fA-F]{128}/);
  if (m64?.[0]) return m64[0];

  const mAny = s.match(/0x[0-9a-fA-F]{128,}/);
  if (mAny?.[0]) {
    const h = mAny[0];
    if (h.length >= 134) return h.slice(0, 134);
    if (h.length >= 132) return h.slice(0, 132);
    if (h.length >= 130) return h.slice(0, 130);
  }

  throw new Error(`Signature invalid. Could not extract 64/65/66-byte hex signature (len=${s.length}).`);
}

// 64-byte compact EIP-2098 -> 65-byte
function expandEip2098(sig64_hex) {
  const s = sig64_hex; // 0x + 128 hex
  const r = s.slice(2, 66);
  const vs = s.slice(66);

  const vsFirstByte = parseInt(vs.slice(0, 2), 16);
  const v = (vsFirstByte & 0x80) ? 28 : 27;

  const sFirstByte = (vsFirstByte & 0x7f).toString(16).padStart(2, "0");
  const sFixed = sFirstByte + vs.slice(2);

  const vHex = v.toString(16).padStart(2, "0");
  return `0x${r}${sFixed}${vHex}`;
}

// 66-byte weird -> 65-byte
function shrink66To65(sig66) {
  const hex = sig66;
  const r = hex.slice(2, 66);
  const s = hex.slice(66, 130);
  const vRaw = parseInt(hex.slice(132, 134), 16);
  const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw;
  const vHex = Number(v).toString(16).padStart(2, "0");
  return `0x${r}${s}${vHex}`;
}

function decode65(sig65) {
  const hex = sig65;
  const r = `0x${hex.slice(2, 66)}`;
  const s = `0x${hex.slice(66, 130)}`;
  const vRaw = parseInt(hex.slice(130, 132), 16);
  const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw;
  return { v: Number(v), r, s };
}

function normalizeSigTo65(sigLike) {
  const extracted = extractHexSigFromAny(sigLike);
  const hex = extracted.trim();
  const len = hex.length;

  if (len === 130) {
    const sig65 = expandEip2098(hex);
    const { v, r, s } = decode65(sig65);
    return { signature: sig65, v, r, s };
  }
  if (len === 132) {
    const { v, r, s } = decode65(hex);
    return { signature: hex, v, r, s };
  }
  if (len === 134) {
    const sig65 = shrink66To65(hex);
    const { v, r, s } = decode65(sig65);
    return { signature: sig65, v, r, s };
  }

  throw new Error(`Signature invalid length (${len}).`);
}

// Always return a signature HEX STRING or throw
async function signRawHash({ provider, chain, account, msgHash }) {
  let lastErr = null;

  // wake wallet / ensure account is authorized (helps MetaMask Mobile)
  try {
    await withTimeout(
      provider.request({ method: "eth_requestAccounts", params: [] }),
      15_000,
      "Wallet did not respond to eth_requestAccounts (timeout). Open your wallet app and try again."
    );
  } catch (e) {
    lastErr = e;
  }

  // preferred: viem signMessage raw bytes32
  try {
    const wc = createWalletClient({ chain, transport: custom(provider) });
    const sig = await withTimeout(
      wc.signMessage({ account, message: { raw: msgHash } }),
      45_000,
      isProbablyMobile()
        ? "Signature request timed out (mobile). Open the dapp inside MetaMask Browser or use WalletConnect, then try again."
        : "Signature request timed out. Check your wallet popup and try again."
    );
    return extractHexSigFromAny(sig);
  } catch (e) {
    lastErr = e;
  }

  // fallback: personal_sign (order varies)
  try {
    const sig = await withTimeout(
      provider.request({ method: "personal_sign", params: [msgHash, account] }),
      45_000,
      isProbablyMobile()
        ? "personal_sign timed out (mobile). Use MetaMask Browser or WalletConnect."
        : "personal_sign timed out."
    );
    return extractHexSigFromAny(sig);
  } catch (e1) {
    lastErr = e1;
    try {
      const sig = await withTimeout(
        provider.request({ method: "personal_sign", params: [account, msgHash] }),
        45_000,
        isProbablyMobile()
          ? "personal_sign timed out (mobile). Use MetaMask Browser or WalletConnect."
          : "personal_sign timed out."
      );
      return extractHexSigFromAny(sig);
    } catch (e2) {
      lastErr = e2;
    }
  }

  // fallback: eth_sign
  try {
    const sig = await withTimeout(
      provider.request({ method: "eth_sign", params: [account, msgHash] }),
      45_000,
      isProbablyMobile()
        ? "eth_sign timed out (mobile). Use MetaMask Browser or WalletConnect."
        : "eth_sign timed out."
    );
    return extractHexSigFromAny(sig);
  } catch (e3) {
    lastErr = e3;
  }

  const base = lastErr?.shortMessage || lastErr?.message || "Signing failed/was blocked.";

  if (isProbablyMobile()) {
    throw new Error(
      `${base}\n\nMobile tip: If you opened the dapp in Chrome/Safari and it kicked you into MetaMask, the confirm can fail to appear.\n` +
        `Fix: open the dapp INSIDE MetaMask app (MetaMask → Browser) OR connect using WalletConnect.`
    );
  }

  throw new Error(base);
}

export async function getNickname(walletAddress) {
  if (!walletAddress || !isAddress(walletAddress)) return "";

  const chain = chainFromConfig();
  const rpc = resolveRpcUrl();
  const registry = await resolveRegistryAddress();

  const pc = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 20_000, retryCount: 1, retryDelay: 450 }),
  });

  const name = await pc.readContract({
    address: registry,
    abi: NICK_ABI,
    functionName: "nicknameOf",
    args: [walletAddress],
  });

  return String(name || "");
}

/**
 * ✅ PREPARE gasless nickname:
 * Do RPC reads BEFORE the user taps “Save Name”.
 */
export async function prepareNicknameRelayed(nick, walletAddress, eip1193Provider) {
  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const trimmed = String(nick || "").trim();
  if (trimmed.length < 3 || trimmed.length > 24) throw new Error("Nickname must be 3–24 chars.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available for signing (EIP-1193 missing).");

  const chain = chainFromConfig();
  const rpc = resolveRpcUrl();
  const registry = await resolveRegistryAddress();

  const pc = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 20_000, retryCount: 1, retryDelay: 450 }),
  });

  const rpcChainId = await withTimeout(
    pc.getChainId().catch(() => Number(C.CHAIN_ID)),
    12_000,
    "RPC chainId lookup timed out. Check VITE_RPC_URL."
  );

  const walletChainId = await getWalletChainId(provider);

  if (Number(walletChainId) !== Number(rpcChainId)) {
    throw new Error(
      `Wrong network in wallet.\n` +
        `Wallet chainId=${walletChainId}, expected=${rpcChainId}.\n` +
        `Fix: switch your wallet network to match BlockSwap (target chainId=${rpcChainId}).`
    );
  }

  const nonce = await withTimeout(
    pc.readContract({
      address: registry,
      abi: NICK_ABI,
      functionName: "nonces",
      args: [user],
    }),
    15_000,
    "Nonce read timed out (RPC). Try again."
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = nowSec + 600;

  const msgHash = nicknameMsgHash({
    user,
    nick: trimmed,
    nonce,
    deadline,
    registry,
    chainId: rpcChainId,
  });

  dlog("prepare", { registry, rpcChainId, walletChainId, deadline, nonce: nonce?.toString?.() ?? String(nonce) });

  return {
    user,
    nick: trimmed,
    registry,
    rpcChainId,
    walletChainId,
    nonce,
    deadline,
    msgHash,
  };
}

/**
 * Gasless nickname (relayer pays gas)
 * If `prepared` is provided, we skip all pre-work and go straight to signing.
 */
export async function setNicknameRelayed(nick, walletAddress, eip1193Provider, prepared) {
  const relayerUrl = resolveRelayerUrl();
  if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL (local .env.local + Vercel env).");

  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available for signing (EIP-1193 missing).");

  const chain = chainFromConfig();
  const prep = prepared || (await prepareNicknameRelayed(nick, walletAddress, provider));
  const trimmed = String(prep?.nick || "").trim();

  if (!trimmed || trimmed.length < 3 || trimmed.length > 24) {
    throw new Error("Nickname must be 3–24 chars.");
  }

  dlog("hash", { deadline: prep.deadline, msgHash: prep.msgHash });

  const rawSigHex = await signRawHash({
    provider,
    chain,
    account: user,
    msgHash: prep.msgHash,
  });

  const { signature, v, r, s } = normalizeSigTo65(rawSigHex);
  dlog("normalized", { sigLen: signature?.length, v, r, s });

  const res = await withTimeout(
    fetch(`${relayerUrl}/relay/nickname`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user,
        nick: trimmed,
        deadline: prep.deadline,
        v,
        r,
        s,
        signature,
      }),
    }),
    20_000,
    "Relayer request timed out. Check VITE_RELAYER_URL and Fly.io status."
  );

  const txt = await res.text();
  let j = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {}

  if (!res.ok || !j?.ok) {
    if (res.status === 403) throw new Error(j?.error || "CORS blocked (origin not allowed).");
    if (res.status === 404) throw new Error(`Relayer 404 at ${relayerUrl}/relay/nickname`);
    throw new Error(j?.error || `Relayer nickname failed (HTTP ${res.status}): ${txt || "(empty)"}`);
  }

  return j;
}

/**
 * Direct on-chain nickname write (only if you flip VITE_ALLOW_DIRECT_NICKNAME=1)
 */
export async function setNicknameDirect(nick, walletAddress, eip1193Provider) {
  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const trimmed = String(nick || "").trim();
  if (trimmed.length < 3 || trimmed.length > 24) throw new Error("Nickname must be 3–24 chars.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available (EIP-1193 missing).");

  const registry = await resolveRegistryAddress();
  const chain = chainFromConfig();

  const wc = createWalletClient({ chain, transport: custom(provider) });

  try {
    await withTimeout(
      provider.request({ method: "eth_requestAccounts", params: [] }),
      15_000,
      "Wallet did not respond to eth_requestAccounts (timeout)."
    );
  } catch {}

  return await wc.writeContract({
    address: registry,
    abi: NICK_DIRECT_ABI,
    functionName: "setNickname",
    args: [trimmed],
    account: user,
  });
}