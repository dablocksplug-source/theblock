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

function envBool(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function dbgEnabled() {
  return envBool(import.meta.env.VITE_DEBUG_NICKNAME);
}

function dlog(...args) {
  if (dbgEnabled()) console.log("[nicknameAPI]", ...args);
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

// --- NicknameRegistryRelayed ABI ---
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
  // direct write fallback (if your contract supports it)
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
  } catch {
    // ignore
  }

  throw new Error("Missing Nickname Registry address. Set VITE_NICKNAME_REGISTRY_ADDRESS.");
}

/**
 * MUST match Solidity:
 * keccak256(abi.encode(
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
// Signature normalization helpers
// Always normalize to 65-byte hex signature: 0x + 130 hex chars (length 132 total)
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
  if (!s || s === "0x") throw new Error("Signature missing/blocked (wallet returned empty).");

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

function expandEip2098(sig64_hex) {
  // 0x + 128 hex (130 chars total)
  const s = sig64_hex;
  const r = s.slice(2, 66);
  const vs = s.slice(66);

  const vsFirstByte = parseInt(vs.slice(0, 2), 16);
  const v = (vsFirstByte & 0x80) ? 28 : 27;

  const sFirstByte = (vsFirstByte & 0x7f).toString(16).padStart(2, "0");
  const sFixed = sFirstByte + vs.slice(2);

  const vHex = v.toString(16).padStart(2, "0");
  return `0x${r}${sFixed}${vHex}`; // 65-byte, length 132
}

function shrink66To65(sig66) {
  // 0x + 132 hex (134 chars total) -> take r(32) + s(32) + v(last byte)
  const hex = sig66;
  const r = hex.slice(2, 66);
  const s = hex.slice(66, 130);
  const vRaw = parseInt(hex.slice(132, 134), 16);
  const v = vRaw === 0 || vRaw === 1 ? vRaw + 27 : vRaw;
  const vHex = Number(v).toString(16).padStart(2, "0");
  return `0x${r}${s}${vHex}`; // 65-byte, length 132
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

  throw new Error(`Signature invalid length (${extracted.length}).`);
}

async function signRawHash({ provider, chain, account, msgHash }) {
  let lastErr = null;

  // Preferred: viem signMessage({ raw }) so wallet signs BYTES not "0x..." text
  try {
    const wc = createWalletClient({ chain, transport: custom(provider) });
    const sig = await wc.signMessage({ account, message: { raw: msgHash } });
    return extractHexSigFromAny(sig);
  } catch (e) {
    lastErr = e;
  }

  // Fallback: personal_sign (param order varies)
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
  // Solidity: toEthSignedMessageHash(bytes32)
  const ethSigned = hashMessage({ message: { raw: msgHash } });
  const recovered = await recoverAddress({ hash: ethSigned, signature: { v, r, s } });
  if (String(recovered).toLowerCase() !== String(user).toLowerCase()) {
    throw new Error(`Bad signature (recovered ${recovered}). Wallet signed a different payload.`);
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
 */
export async function setNicknameRelayed(nick, walletAddress, eip1193Provider) {
  const relayerUrl = resolveRelayerUrl();
  if (!relayerUrl) throw new Error("Missing VITE_RELAYER_URL.");

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

  dlog("env", { relayerUrl, registry, chainId: Number(C.CHAIN_ID) });
  dlog("hash", { nonce: String(nonce), deadline, msgHash });

  const rawSigHex = await signRawHash({ provider, chain, account: user, msgHash });
  dlog("signed", { rawSigLen: rawSigHex ? rawSigHex.length : "(empty)" });

  const { signature, v, r, s } = normalizeSigTo65(rawSigHex);
  dlog("normalized", { sigLen: signature ? signature.length : "(empty)", v, r, s });

  await assertSignatureMatchesUser({ user, msgHash, v, r, s });

  let res;
  let txt = "";
  try {
    res = await fetch(`${relayerUrl}/relay/nickname`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, nick: trimmed, deadline, v, r, s, signature }),
    });
    txt = await res.text();
  } catch (netErr) {
    throw new Error(`Relayer network error: ${netErr?.message || netErr}`);
  }

  let j = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }

  if (!res.ok || !j?.ok) {
    const serverMsg = j?.error || txt || `HTTP ${res.status}`;
    throw new Error(`Relayer nickname failed: ${serverMsg}`);
  }

  return j;
}

/**
 * Direct nickname write (fallback if VITE_ALLOW_DIRECT_NICKNAME=1)
 * Requires wallet to pay gas.
 */
export async function setNicknameDirect(nick, walletAddress, eip1193Provider) {
  const user = walletAddress;
  if (!user || !isAddress(user)) throw new Error("Connect wallet first.");

  const trimmed = String(nick || "").trim();
  if (trimmed.length < 3 || trimmed.length > 24) throw new Error("Nickname must be 3–24 chars.");

  const provider = eip1193Provider || (typeof window !== "undefined" ? window.ethereum : null);
  if (!provider?.request) throw new Error("No wallet provider available (EIP-1193 missing).");

  const chain = chainFromConfig();
  const registry = await resolveRegistryAddress();

  const wc = createWalletClient({
    chain,
    account: user,
    transport: custom(provider),
  });

  // NOTE: assumes your contract has setNickname(string)
  const hash = await wc.writeContract({
    address: registry,
    abi: NICK_ABI,
    functionName: "setNickname",
    args: [trimmed],
  });

  return { ok: true, hash };
}
