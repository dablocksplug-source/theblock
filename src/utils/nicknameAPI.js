// src/utils/nicknameAPI.js
// DEMO MODE: per-wallet nickname storage (localStorage)
// Later, swap these functions to real on-chain reads/writes.

const KEY = "theblock_nicknames_demo_v1";

const norm = (a) => (a ? String(a).toLowerCase() : "");

function readMap() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  localStorage.setItem(KEY, JSON.stringify(map || {}));
}

/**
 * Simulates an on-chain read (per wallet).
 */
export async function getNickname(walletAddress) {
  const addr = norm(walletAddress);
  if (!addr) return "";
  const map = readMap();
  return map[addr] || "";
}

/**
 * Simulates an on-chain write (per wallet).
 * In real chain version, you'd sign a tx and the contract maps address => nickname.
 */
export async function setNickname(nickname, walletAddress) {
  const addr = norm(walletAddress);
  if (!addr) throw new Error("No wallet address provided.");
  const name = String(nickname || "").trim();
  if (!name) throw new Error("Nickname required.");

  const map = readMap();
  map[addr] = name;
  writeMap(map);
  return true;
}
