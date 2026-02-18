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
  toHex,
  toBytes,
  recoverAddress,
  hashMessage,
} from "viem";
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

// --- minimal NicknameRegistry ABI ---
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

// Optional view
const NICK_RELAYER_VIEW_ABI = [
  { type: "function", name: "relayer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

// Direct write fallback (only if your contract supports it)
const NICK_DIRECT_ABI = [
  {
    type: "function",
    name: "setNickname",
    stateMutability: "nonpayable",
    inputs: [{ name: "nick", type: "string" }],
    outputs: [],
  },
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
  const nickHash = keccak256(toBytes(String(nick || "")));

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32,address,bytes32,uint256,uint256,address,uint256"),
      [tag, user, nickHash, BigInt(nonce), BigInt(deadline), registry, BigInt(chainId)]
    )
  );
}

// -------------------------------
// SIGNATURE NORMALIZATION (no crashes)
// -------------------------------
function isHexOnly(s) {
  return /^0x[0-9a-fA-F]+$/.test(String(s || "").trim());
}

function extractHexSigFromAny(raw) {
  if (raw && typeof raw === "object") {
    if (raw.signature) return extractHexSigFromAny(raw.signature);
    if (raw.result) return extractHexSigFromAny(raw.result);
    if (raw.data) return extractHexSigFromAny(raw.data);

    const r = raw.r || raw.R;
    const s = raw.s || raw.S;
    const v = raw.v ?? raw.V;
    const yParity = raw.yParity ?? raw.y_parity ?? raw.parity;

    if (r && s && (v != null || yParity != null)) {
      const hex = signatureToHex({
        r,
        s,
        ...(v != null ? { v: BigInt(Number(v)) } : {}),
        ...(v == null && yParity != null ? { yParity: Number(yParity) } : {}),
      });
      return extractHexSigFromAny(hex);
    }

    raw = JSON.stringify(raw);
  }

  const s = String(raw || "").trim().replace(/^"+|"+$/g, "");
  if (!s || s === "0x") throw new Error("Signature missing/blocked (empty). Approve the signature prompt and retry.");

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
function expandEip2098(sig64) {
  const r = sig64.slice(2, 66);
  const vs = sig64.slice(66);

  const vsFirst = parseInt(vs.slice(0, 2), 16);
  const v = (vsFirst & 0x80) ? 28 : 27;

  const sFirst = (vsFirst & 0x7f).toString(16).padStart(2, "0");
  const sFixed = sFirst + vs.slice(2);

  const vHex = v.toString(16).padStart(2, "0");
  return `0x${r}${sFixed}${vHex}`;
}

// 66-byte weird -> 65-byte
function shrink66To65(sig66) {
  const r = sig66.slice(2, 66);
  const s = sig66.slice(66, 130);
  const vRaw = parseInt(sig66.slice(132, 134), 16);
  const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw;
  const vHex = Number(v).toString(16).padStart(2, "0");
  return `0x${r}${s}${vHex}`;
}

function decode65(sig65) {
  const r = `0x${sig65.slice(2, 66)}`;
  const s = `0x${sig65.slice(66, 130)}`;
  const vRaw = parseInt(sig65.slice(130, 132), 16);
  const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw;
  return { v: Number(v), r, s };
}

function normalizeSigTo65(sigLike) {
  const extracted = extractHexSigFromAny(sigLike);

  if (extracted.length === 130) {
    const sig65 = expandEip2098(extracted);
    const { v, r, s } = decode65(sig65);
    return { signature: sig65, v, r, s };
  }

  if (extracted.length === 132) {
    const { v, r, s } = decode65(extracted);
    return { signature: extracted, v, r, s };
  }

  if (extracted.length === 134) {
    const sig65 = shrink66To65(extracted);
    const { v, r, s } = decode65(sig65);
    return { signature: sig65, v, r, s };
  }

  throw new Error(`Signature invalid length after extraction: ${extracted.length}.`);
}

// Prefer viem signMessage({ raw }) to sign bytes32
async function signRawHash({ provider, chain, account, msgHash }) {
  let lastErr = null;

  try {
    const wc = createWalletClient({ chain, transport: custom(provider) });
    const sig = await wc.signMessage({ account, message: { raw: msgHash } });
    return extractHexSigFromAny(sig);
  } catch (e) {
    lastErr = e;
  }

  try {
    const sig = await provider.request({ method: "personal_sign", params: [msgHash, account] });
    return extractHexSigFromAny(sig);
  } catch (e1) {
    lastErr = e1;
    try {
      const sig = await provider.request({ method: "personal_sign", params: [account, msgHash] });
      return extractHexSigFromAny(sig);
    } catch (e2) {
      lastErr = e2;
    }
  }

  throw new Error(lastErr?.shortMessage || lastErr?.message || "Signing failed/was blocked.");
}

async function assertSignatureMatchesUser({ user, msgHash, v, r, s }) {
  const ethSigned = hashMessage({ message: { raw: msgHash } });
  const recovered = await recoverAddress({ hash: ethSigned, signature: { v, r, s } });
  if (String(recovered).toLowerCase() !== String(user).toLowerCase()) {
    throw new Error(`Bad signature (recovered ${recovered}). Re-open wallet prompt and approve signing.`);
  }
}

// -------------------------------
// API
// -------------------------------
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
 */
export async function setNicknameRelayed(nick, walletAddress, eip1193Provider) {
  const relayerUrl = resolveRelayerUrl();
  if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL — set it in Vercel + .env.local.");

  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const trimmed = String(nick || "").trim();
  if (trimmed.length < 3 || trimmed.length > 24) throw new Error("Nickname must be 3–24 chars.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available for signing.");

  const chain = chainFromConfig();
  const rpc = resolveRpcUrl();
  const registry = await resolveRegistryAddress();

  const pc = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 20_000, retryCount: 1, retryDelay: 450 }),
  });

  // optional sanity
  try {
    await pc.readContract({ address: registry, abi: NICK_RELAYER_VIEW_ABI, functionName: "relayer" });
  } catch {}

  const nonce = await pc.readContract({
    address: registry,
    abi: NICK_ABI,
    functionName: "nonces",
    args: [user],
  });

  const deadline = Math.floor(Date.now() / 1000) + 600;

  const msgHash = nicknameMsgHash({
    user,
    nick: trimmed,
    nonce,
    deadline,
    registry,
    chainId: Number(C.CHAIN_ID),
  });

  const rawSigHex = await signRawHash({ provider, chain, account: user, msgHash });
  if (!rawSigHex || typeof rawSigHex !== "string") throw new Error("Wallet returned an empty signature.");

  const { signature, v, r, s } = normalizeSigTo65(rawSigHex);

  await assertSignatureMatchesUser({ user, msgHash, v, r, s });

  const res = await fetch(`${relayerUrl}/relay/nickname`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user, nick: trimmed, deadline, v, r, s, signature }),
  });

  const txt = await res.text();
  let j = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {}

  if (!res.ok || !j?.ok) {
    if (res.status === 404) throw new Error(`Relayer 404 at ${relayerUrl}/relay/nickname`);
    throw new Error(j?.error || `Relayer nickname failed (HTTP ${res.status}): ${txt || "(empty)"}`);
  }

  return j;
}

/**
 * Direct nickname write (wallet pays gas)
 * Only used if VITE_ALLOW_DIRECT_NICKNAME=1
 */
export async function setNicknameDirect(nick, walletAddress, eip1193Provider) {
  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const trimmed = String(nick || "").trim();
  if (trimmed.length < 3 || trimmed.length > 24) throw new Error("Nickname must be 3–24 chars.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available.");

  const chain = chainFromConfig();
  const registry = await resolveRegistryAddress();

  const wc = createWalletClient({ chain, transport: custom(provider) });

  // This requires your contract to have setNickname(string).
  // If not, you’ll get a clean revert error (not a JS crash).
  const hash = await wc.writeContract({
    account: user,
    address: registry,
    abi: NICK_DIRECT_ABI,
    functionName: "setNickname",
    args: [trimmed],
  });

  return { ok: true, hash };
}
