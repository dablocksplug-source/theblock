// src/utils/nicknameAPI.js
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";
import {
  createPublicClient,
  http,
  isAddress,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  signatureToHex,
  hexToSignature,
  toHex,
  toBytes,
} from "viem";
import { baseSepolia, base } from "viem/chains";

function sanitizeUrl(u) {
  return String(u || "").trim().replace(/^"+|"+$/g, "").replace(/\s+/g, "");
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

// optional
const NICK_RELAYER_VIEW_ABI = [
  { type: "function", name: "relayer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

async function resolveRegistryAddress() {
  const addr = sanitizeUrl(import.meta.env.VITE_NICKNAME_REGISTRY_ADDRESS);
  if (addr && isAddress(addr)) return addr;

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
  } catch {}

  throw new Error("Missing Nickname Registry address. Set VITE_NICKNAME_REGISTRY_ADDRESS in Vercel + .env.local.");
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
  const tag = keccak256(toHex("NICKNAME_SET"));

  // ✅ IMPORTANT: must match keccak256(bytes(nick)) in Solidity
  const nickHash = keccak256(toBytes(String(nick || "")));

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32,address,bytes32,uint256,uint256,address,uint256"),
      [tag, user, nickHash, BigInt(nonce), BigInt(deadline), registry, BigInt(chainId)]
    )
  );
}

// -------------------------------
// SIGNATURE NORMALIZATION (fixes Coinbase/WC weird outputs)
// -------------------------------
function isHexSigLike(s) {
  const t = String(s || "").trim();
  if (!t.startsWith("0x")) return false;
  if (!/^0x[0-9a-fA-F]+$/.test(t)) return false;
  // allow 64-byte compact (0x + 128 => 130 total), or 65-byte (0x + 130 => 132 total)
  return t.length === 130 || t.length === 132;
}

function normalizeSigHex(sig) {
  try {
    if (typeof sig === "string") {
      const trimmed = sig.trim();
      if (!trimmed || trimmed === "0x") throw new Error("Signature missing (wallet popup likely blocked).");
      // accept any hex-ish; enforce length later
      if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return trimmed;
      return trimmed;
    }

    if (sig && typeof sig === "object") {
      const r = sig.r || sig.R;
      const s = sig.s || sig.S;
      const v = sig.v ?? sig.V;
      const yParity = sig.yParity ?? sig.y_parity ?? sig.parity;

      if (r && s && (v != null || yParity != null)) {
        return signatureToHex({
          r,
          s,
          ...(v != null ? { v: Number(v) } : {}),
          ...(v == null && yParity != null ? { yParity: Number(yParity) } : {}),
        });
      }

      if (sig.signature) return normalizeSigHex(sig.signature);
      return String(sig);
    }

    return String(sig ?? "");
  } catch (e) {
    throw new Error(e?.message || "Signature normalization failed.");
  }
}

// Expand EIP-2098 compact signature (64 bytes) => 65 bytes
function expandCompactSig(sigHex) {
  const s0 = normalizeSigHex(sigHex);
  const s = String(s0 || "").trim();
  if (!s.startsWith("0x")) throw new Error("Signature missing (wallet popup likely blocked).");

  // 65-byte already (0x + 130 hex)
  if (s.length === 132) return s;

  // 64-byte compact (0x + 128 hex)
  if (s.length !== 130) {
    throw new Error(`Invalid signature length: ${s.length} (expected 132 or 130).`);
  }

  const r = s.slice(2, 2 + 64);
  const vs = s.slice(2 + 64); // 64 hex chars

  const vsFirstByte = parseInt(vs.slice(0, 2), 16);
  const v = (vsFirstByte & 0x80) ? 28 : 27;

  // clear highest bit of vs to get s
  const sFirstByte = (vsFirstByte & 0x7f).toString(16).padStart(2, "0");
  const sRest = vs.slice(2);
  const sFixed = sFirstByte + sRest;

  const vHex = v.toString(16).padStart(2, "0");
  return `0x${r}${sFixed}${vHex}`;
}

function assertSigLen(label, sigHex) {
  const s = expandCompactSig(sigHex);
  if (!isHexSigLike(s)) {
    throw new Error(`${label} invalid. Got ${String(s || "").length} chars; expected 130 (compact) or 132 (65-byte) total.`);
  }
  return s;
}

async function personalSign(provider, msgHash, user) {
  // Try common ordering first: [data, address]
  try {
    const sig = await provider.request({ method: "personal_sign", params: [msgHash, user] });
    return sig;
  } catch {
    // Some wallets/providers want [address, data]
    const sig = await provider.request({ method: "personal_sign", params: [user, msgHash] });
    return sig;
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
 * ✅ Accept ACTIVE EIP-1193 provider (MetaMask/Coinbase/WC) to avoid signer mismatch.
 */
export async function setNicknameRelayed(nick, walletAddress, eip1193Provider) {
  const relayerUrl = resolveRelayerUrl();
  if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL — set it in Vercel + .env.local.");

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

  // optional sanity
  try {
    await pc.readContract({
      address: registry,
      abi: NICK_RELAYER_VIEW_ABI,
      functionName: "relayer",
    });
  } catch {}

  const nonce = await pc.readContract({
    address: registry,
    abi: NICK_ABI,
    functionName: "nonces",
    args: [user],
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = nowSec + 600;

  const msgHash = nicknameMsgHash({
    user,
    nick: trimmed,
    nonce,
    deadline,
    registry,
    chainId: Number(C.CHAIN_ID),
  });

  // Sign raw 32-byte hash (contract uses toEthSignedMessageHash(msgHash))
  const rawSig = await personalSign(provider, msgHash, user);

  // ✅ normalize + expand compact signature
  const signature = assertSigLen("nicknameSignature", rawSig);

  // Relayer may verify either signature hex or v/r/s — we send BOTH (compatible either way)
  const sigObj = hexToSignature(signature);

  const res = await fetch(`${relayerUrl}/relay/nickname`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user,
      nick: trimmed,
      deadline,

      // v/r/s for old relayer paths
      v: Number(sigObj.v),
      r: sigObj.r,
      s: sigObj.s,

      // full signature for newer relayer paths
      signature,
    }),
  });

  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) {
    if (res.status === 404) throw new Error(`Relayer 404 at ${relayerUrl}/relay/nickname`);
    throw new Error(j?.error || `Relayer nickname failed (HTTP ${res.status})`);
  }

  return j;
}

export async function setNickname() {
  throw new Error("Direct nickname write not wired here.");
}
