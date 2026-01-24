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

  // Simple schema version (increment when you add major fields)
  next.__schema = Number.isFinite(next.__schema) ? next.__schema : 2;

  // ✅ LOCK settlement: always USDC for The Block
  // (Adapter reads C.STABLE_SYMBOL, but keeping this prevents old UI code from drifting.)
  next.STABLE_SYMBOL = "USDC";

  // ---- Core containers ----
  if (!Array.isArray(next.activity)) next.activity = [];
  if (!next.labels || typeof next.labels !== "object") next.labels = {};
  if (!next.balancesOz || typeof next.balancesOz !== "object") next.balancesOz = {};

  // ---- New controls (added in latest admin panel) ----
  if (typeof next.earlyBirdBadge !== "boolean") next.earlyBirdBadge = true; // marketing only
  if (typeof next.buyPaused !== "boolean") next.buyPaused = false; // real buy gate

  // ---- Rewards (demo-mode) ----
  if (!Array.isArray(next.rewardRounds)) next.rewardRounds = [];
  if (!next.rewardClaims || typeof next.rewardClaims !== "object") next.rewardClaims = {};

  // ---- Money ----
  if (!Number.isFinite(Number(next.buybackVault))) next.buybackVault = 0;
  if (!Number.isFinite(Number(next.theBlockTreasury))) next.theBlockTreasury = 0;

  // ---- Pricing ----
  if (!Number.isFinite(Number(next.sellPricePerBrick))) next.sellPricePerBrick = C.SELL_PRICE_PER_BRICK || 1000;
  if (!Number.isFinite(Number(next.buybackFloorPerBrick))) next.buybackFloorPerBrick = C.BUYBACK_FLOOR_PER_BRICK || 500;

  // ---- Supply + Offering ----
  if (!Number.isFinite(Number(next.totalBricks))) next.totalBricks = C.TOTAL_BRICKS || 2000;
  if (!Number.isFinite(Number(next.ouncesPerBrick))) next.ouncesPerBrick = C.OUNCES_PER_BRICK || 36;

  if (!Number.isFinite(Number(next.lockedBricks))) next.lockedBricks = C.BLOCK_LOCKED_BRICKS || 500;

  // Derived totals (safe recompute if missing)
  if (!Number.isFinite(Number(next.totalOz))) next.totalOz = Number(next.totalBricks) * Number(next.ouncesPerBrick);
  if (!Number.isFinite(Number(next.lockedOz))) next.lockedOz = Number(next.lockedBricks) * Number(next.ouncesPerBrick);

  if (!Number.isFinite(Number(next.circulatingBricks))) {
    next.circulatingBricks = Number(next.totalBricks) - Number(next.lockedBricks);
  }
  if (!Number.isFinite(Number(next.circulatingOz))) {
    next.circulatingOz = Number(next.circulatingBricks) * Number(next.ouncesPerBrick);
  }

  if (!Number.isFinite(Number(next.bricksAvailableForSale))) {
    next.bricksAvailableForSale = C.BRICKS_AVAILABLE_FOR_SALE || 1500;
  }
  if (!Number.isFinite(Number(next.ouncesAvailableForSale))) {
    next.ouncesAvailableForSale =
      Number(next.bricksAvailableForSale) * Number(next.ouncesPerBrick);
  }

  if (!Number.isFinite(Number(next.ouncesSold))) next.ouncesSold = 0;

  // ---- Phase ----
  if (!Number.isFinite(Number(next.phase))) next.phase = C.STARTING_PHASE || 1;

  return next;
}

export function loadBlockswapState() {
  try {
    const raw = localStorage.getItem(C.STORAGE_KEY);
    if (!raw) return null;

    const parsed = safeParse(raw);
    if (!parsed) return null;

    const migrated = migrateStateIfNeeded(parsed);

    // Persist if migration changed anything
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
