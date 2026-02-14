// src/utils/nicknameAPI.js
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";
import { createPublicClient, http, isAddress, keccak256, encodeAbiParameters, parseAbiParameters, toHex } from "viem";
import { baseSepolia, base } from "viem/chains";

function sanitizeUrl(u) {
  return String(u || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, "");
}

function chainFromConfig() {
  return Number(C.CHAIN_ID) === base.id ? base : baseSepolia;
}

function resolveRpcUrl() {
  const chain = chainFromConfig();
  const rpc =
    sanitizeUrl(import.meta.env.VITE_RPC_URL) ||
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

// optional (helps you debug relayer mismatch quickly)
const NICK_RELAYER_VIEW_ABI = [
  {
    type: "function",
    name: "relayer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];

async function resolveRegistryAddress() {
  const addr = sanitizeUrl(import.meta.env.VITE_NICKNAME_REGISTRY_ADDRESS);
  if (addr && isAddress(addr)) return addr;

  // Optional deployments fallback
  const url = Number(C.CHAIN_ID) === 8453 ? "/deployments.base.json" : "/deployments.baseSepolia.json";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      const dj = d?.contracts ? d.contracts : d;
      const fromJson =
        dj?.NicknameRegistryRelayed ||
        dj?.NicknameRegistry ||
        dj?.nicknameRegistryRelayed ||
        dj?.nicknameRegistry ||
        null;

      if (fromJson && isAddress(fromJson)) return fromJson;
    }
  } catch {
    // ignore
  }

  throw new Error(
    "Missing Nickname Registry address. Set VITE_NICKNAME_REGISTRY_ADDRESS in .env.local (and restart dev server)."
  );
}

/**
 * MUST match Solidity exactly:
 * msgHash = keccak256(abi.encode(
 *   keccak256(bytes("NICKNAME_SET")),
 *   user,
 *   keccak256(bytes(nick)),
 *   nonce,
 *   deadline,
 *   address(this),
 *   chainid
 * ))
 */
function nicknameMsgHash({ user, nick, nonce, deadline, registry, chainId }) {
  const tag = keccak256(toHex("NICKNAME_SET"));
  const nickHash = keccak256(toHex(nick)); // utf-8 bytes

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32,address,bytes32,uint256,uint256,address,uint256"),
      [tag, user, nickHash, BigInt(nonce), BigInt(deadline), registry, BigInt(chainId)]
    )
  );
}

// ------------------------------
// Signature helpers (bulletproof)
// ------------------------------
function hexToBytesLen(hex) {
  const h = String(hex || "");
  if (!h.startsWith("0x")) return 0;
  return (h.length - 2) / 2;
}

function strip0x(h) {
  return String(h || "").startsWith("0x") ? String(h).slice(2) : String(h || "");
}

function pad0x(h) {
  return String(h || "").startsWith("0x") ? String(h) : `0x${h}`;
}

/**
 * Parse signature hex into { v, r, s } supporting:
 * - 65-byte signatures (r,s,v)
 * - 64-byte EIP-2098 signatures (r,vs)
 * And normalize v to 27/28.
 */
function parseSignatureFlexible(sigHex) {
  const sig = String(sigHex || "").toLowerCase();
  const nBytes = hexToBytesLen(sig);

  if (nBytes === 65) {
    const raw = strip0x(sig);
    const r = pad0x(raw.slice(0, 64));
    const s = pad0x(raw.slice(64, 128));
    let v = parseInt(raw.slice(128, 130), 16);

    // normalize v
    if (v === 0 || v === 1) v = 27 + v;
    if (v >= 35) v = 27 + (v % 2); // if someone returns EIP-155-ish v, normalize
    if (v !== 27 && v !== 28) {
      // last resort
      v = 27 + (v & 1);
    }

    return { v, r, s, signature: sig };
  }

  if (nBytes === 64) {
    // EIP-2098: r (32) + vs (32)
    const raw = strip0x(sig);
    const r = pad0x(raw.slice(0, 64));
    const vsHex = raw.slice(64, 128);
    const vs = BigInt(`0x${vsHex}`);

    // highest bit is vParity
    const vParity = Number((vs >> 255n) & 1n);
    const sMask = (1n << 255n) - 1n;
    const sBI = vs & sMask;

    const s = pad0x(sBI.toString(16).padStart(64, "0"));
    const v = 27 + vParity;

    return { v, r, s, signature: sig };
  }

  throw new Error(`Invalid signature length. Got ${String(sigHex || "").length} chars; expected 130/132 hex (0x + 128/130).`);
}

/**
 * Some wallets disagree on param order for personal_sign.
 * Try standard first: [data, address], then fallback [address, data].
 */
async function personalSign(provider, dataHex, address) {
  try {
    return await provider.request({
      method: "personal_sign",
      params: [dataHex, address],
    });
  } catch (e1) {
    try {
      return await provider.request({
        method: "personal_sign",
        params: [address, dataHex],
      });
    } catch (e2) {
      throw new Error(e2?.message || e1?.message || "personal_sign failed");
    }
  }
}

/**
 * Optional: attempt to switch chain if wallet is on wrong network.
 * Safe no-op if wallet doesn't support it.
 */
async function ensureWalletChain(provider, targetChainId) {
  if (!provider?.request || !targetChainId) return;

  let currentHex = null;
  try {
    currentHex = await provider.request({ method: "eth_chainId", params: [] });
  } catch {
    return;
  }

  const cur = Number.parseInt(String(currentHex || "0x0"), 16);
  const target = Number(targetChainId);

  if (!cur || !target || cur === target) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${target.toString(16)}` }],
    });
  } catch {
    // ignore (some connectors won't allow programmatic switching)
  }
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
 * Gasless nickname (relayer pays gas)
 * ✅ Accept CONNECTED EIP-1193 provider so it works with MetaMask/Coinbase/WC.
 * ✅ Do NOT rely on vParity-only; we normalize signature for all wallets.
 * ✅ Send both `signature` and v/r/s for backward-compatible relayers.
 */
export async function setNicknameRelayed(nick, walletAddress, eip1193Provider) {
  const relayerUrl = resolveRelayerUrl();
  if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL (UI) — set it in .env.local and restart.");

  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const trimmed = String(nick || "").trim();
  if (trimmed.length < 3 || trimmed.length > 24) throw new Error("Nickname must be 3–24 chars.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available for signing (EIP-1193 provider missing).");

  // optional chain switch attempt (helps Coinbase/WC mobile)
  await ensureWalletChain(provider, Number(C.CHAIN_ID));

  const chain = chainFromConfig();
  const rpc = resolveRpcUrl();
  const registry = await resolveRegistryAddress();

  const pc = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 20_000, retryCount: 1, retryDelay: 450 }),
  });

  // (optional) sanity check for relayer mismatch
  try {
    const onchainRelayer = await pc.readContract({
      address: registry,
      abi: NICK_RELAYER_VIEW_ABI,
      functionName: "relayer",
    });
    // keep as debug-only (won't break)
    console.log("[Nickname] registry:", registry, "onchain relayer:", onchainRelayer);
  } catch {}

  const nonce = await pc.readContract({
    address: registry,
    abi: NICK_ABI,
    functionName: "nonces",
    args: [user],
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = nowSec + 600; // 10 minutes

  const msgHash = nicknameMsgHash({
    user,
    nick: trimmed,
    nonce,
    deadline,
    registry,
    chainId: Number(C.CHAIN_ID),
  });

  // ✅ sign raw 32-byte hash (contract uses toEthSignedMessageHash(msgHash))
  const sigHex = await personalSign(provider, msgHash, user);

  // ✅ flexible parsing supports 65 + 64 bytes, and normalizes v
  const { v, r, s, signature } = parseSignatureFlexible(sigHex);

  const res = await fetch(`${relayerUrl}/relay/nickname`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      user,
      nick: trimmed,
      deadline,
      // Back-compat fields (if your relayer still expects them)
      v,
      r,
      s,
      // Preferred: let relayer normalize/verify from full signature
      signature,
    }),
  });

  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) {
    if (res.status === 404) {
      throw new Error(`Relayer 404 at ${relayerUrl}/relay/nickname (wrong URL/port or relayer not running).`);
    }
    throw new Error(j?.error || `Relayer nickname failed (HTTP ${res.status})`);
  }

  return j;
}

// Direct write optional (user pays gas) — keep your existing implementation if you have one
export async function setNickname() {
  throw new Error("Direct nickname write not wired here.");
}
