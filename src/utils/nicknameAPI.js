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
// SIGNATURE NORMALIZATION (COINBASE MOBILE SAFE)
// Coinbase mobile sometimes returns a long string / wrapped payload.
// We extract the first valid 64/65-byte hex signature from ANY response.
// Accepts:
// - 0x + 128 hex (64-byte compact)
// - 0x + 130 hex (65-byte)
// If a longer payload contains a signature inside, we pull it out.
// -------------------------------
function isHexOnly(s) {
  return /^0x[0-9a-fA-F]+$/.test(String(s || "").trim());
}

function extractHexSigFromAny(raw) {
  // If object, unwrap common fields first
  if (raw && typeof raw === "object") {
    if (raw.signature) return extractHexSigFromAny(raw.signature);
    if (raw.result) return extractHexSigFromAny(raw.result);
    if (raw.data) return extractHexSigFromAny(raw.data);

    // r/s/v style
    const r = raw.r || raw.R;
    const s = raw.s || raw.S;
    const v = raw.v ?? raw.V;
    const yParity = raw.yParity ?? raw.y_parity ?? raw.parity;
    if (r && s && (v != null || yParity != null)) {
      const hex = signatureToHex({
        r,
        s,
        ...(v != null ? { v: Number(v) } : {}),
        ...(v == null && yParity != null ? { yParity: Number(yParity) } : {}),
      });
      return extractHexSigFromAny(hex);
    }

    // fallback stringify
    raw = JSON.stringify(raw);
  }

  const s = String(raw || "").trim().replace(/^"+|"+$/g, "");
  if (!s || s === "0x") throw new Error("Signature missing/blocked (empty).");

  // If it's already clean hex and near the right size, keep it.
  if (isHexOnly(s) && (s.length === 130 || s.length === 132)) return s;

  // Otherwise: find embedded signatures inside the payload.
  // Prefer 65-byte (130 hex chars after 0x) first, then compact 64-byte.
  const m65 = s.match(/0x[0-9a-fA-F]{130}/);
  if (m65?.[0]) return m65[0];

  const m64 = s.match(/0x[0-9a-fA-F]{128}/);
  if (m64?.[0]) return m64[0];

  // Some wallets include a longer hex blob; try to carve from it.
  const mAny = s.match(/0x[0-9a-fA-F]{128,}/);
  if (mAny?.[0]) {
    const h = mAny[0];
    // if it contains enough for 65-byte, slice it
    if (h.length >= 132) return h.slice(0, 132);
    if (h.length >= 130) return h.slice(0, 130);
  }

  throw new Error(`Signature invalid. Could not extract 64/65-byte hex signature from response (len=${s.length}).`);
}

// Expand EIP-2098 compact signature (64 bytes) => 65 bytes
function expandCompactSig(sigLike) {
  const s = extractHexSigFromAny(sigLike);

  // 65-byte (0x + 130 hex)
  if (s.length === 132) return s;

  // 64-byte compact (0x + 128 hex)
  if (s.length !== 130) {
    throw new Error(`Invalid signature length: ${s.length} (expected 130 compact or 132 full).`);
  }

  const r = s.slice(2, 66);
  const vs = s.slice(66);

  const vsFirstByte = parseInt(vs.slice(0, 2), 16);
  const v = (vsFirstByte & 0x80) ? 28 : 27;

  const sFirstByte = (vsFirstByte & 0x7f).toString(16).padStart(2, "0");
  const sFixed = sFirstByte + vs.slice(2);

  const vHex = v.toString(16).padStart(2, "0");
  return `0x${r}${sFixed}${vHex}`;
}

function assertSig(label, sigLike) {
  const full = expandCompactSig(sigLike);
  if (!isHexOnly(full) || full.length !== 132) {
    throw new Error(`${label} invalid after normalization (len=${String(full || "").length}).`);
  }
  return full;
}

// -------------------------------
// ✅ Coinbase mobile fix:
// Prefer viem signMessage({ raw }) so wallets sign BYTES, not "0x..." TEXT.
// Fallback to personal_sign if needed.
// -------------------------------
async function signRawHash({ provider, chain, account, msgHash }) {
  // 1) best path: walletClient.signMessage(raw)
  try {
    const wc = createWalletClient({ chain, transport: custom(provider) });
    const sig = await wc.signMessage({
      account,
      message: { raw: msgHash },
    });
    return sig;
  } catch {
    // 2) fallback: personal_sign (different param orderings)
    try {
      return await provider.request({ method: "personal_sign", params: [msgHash, account] });
    } catch {
      return await provider.request({ method: "personal_sign", params: [account, msgHash] });
    }
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
 * ✅ Accept ACTIVE EIP-1193 provider (MetaMask/Coinbase/WC).
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

  // ✅ Sign raw 32-byte hash (Coinbase mobile-safe)
  const rawSig = await signRawHash({ provider, chain, account: user, msgHash });

  // ✅ STRICT normalize + expand compact signature
 const signature = assertSig("nicknameSignature", rawSig);


  // Relayer may verify either signature hex or v/r/s — we send BOTH
  const sigObj = hexToSignature(signature);

  const res = await fetch(`${relayerUrl}/relay/nickname`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user,
      nick: trimmed,
      deadline,

      v: Number(sigObj.v),
      r: sigObj.r,
      s: sigObj.s,

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
