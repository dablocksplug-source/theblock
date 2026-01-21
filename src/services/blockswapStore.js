// src/services/blockswapStore.js
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Ensures old localStorage snapshots don't poison new config.
 * - Forces USDC (your permanent standard)
 * - Backfills missing fields if you add new ones later
 * - Leaves balances/labels intact
 */
function migrateStateIfNeeded(state) {
  if (!state || typeof state !== "object") return state;

  const next = { ...state };

  // Track a simple schema version in case you need it later
  next.__schema = Number.isFinite(next.__schema) ? next.__schema : 1;

  // ✅ LOCK settlement: always USDC for The Block
  next.STABLE_SYMBOL = "USDC";

  // Backfill common fields (safe defaults)
  if (!Array.isArray(next.activity)) next.activity = [];
  if (!next.labels || typeof next.labels !== "object") next.labels = {};
  if (!next.balancesOz || typeof next.balancesOz !== "object") next.balancesOz = {};

  if (!Number.isFinite(Number(next.buybackVault))) next.buybackVault = 0;
  if (!Number.isFinite(Number(next.theBlockTreasury))) next.theBlockTreasury = 0;

  if (!Number.isFinite(Number(next.ouncesSold))) next.ouncesSold = 0;
  if (!Number.isFinite(Number(next.ouncesAvailableForSale))) {
    next.ouncesAvailableForSale = (C.BRICKS_AVAILABLE_FOR_SALE || 0) * (C.OUNCES_PER_BRICK || 36);
  }

  // Ensure ouncesPerBrick can't be missing
  if (!Number.isFinite(Number(next.ouncesPerBrick))) next.ouncesPerBrick = C.OUNCES_PER_BRICK || 36;

  return next;
}

export function loadBlockswapState() {
  try {
    const raw = localStorage.getItem(C.STORAGE_KEY);
    if (!raw) return null;

    const parsed = safeParse(raw);
    if (!parsed) return null;

    const migrated = migrateStateIfNeeded(parsed);

    // If migration changed anything, persist it back
    // (Cheap check: stringify both)
    const before = JSON.stringify(parsed);
    const after = JSON.stringify(migrated);
    if (before !== after) {
      localStorage.setItem(C.STORAGE_KEY, after);
    }

    return migrated;
  } catch (e) {
    console.warn("Failed to load blockswap state:", e);
    return null;
  }
}

export function saveBlockswapState(state) {
  try {
    const next = migrateStateIfNeeded(state);
    localStorage.setItem(C.STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Failed to save blockswap state:", e);
  }
}

export function clearBlockswapState() {
  try {
    localStorage.removeItem(C.STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear blockswap state:", e);
  }
}
