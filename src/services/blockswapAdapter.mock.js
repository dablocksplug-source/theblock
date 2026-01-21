// src/services/blockswapAdapter.mock.js
import { BLOCKSWAP_CONFIG as C0 } from "../config/blockswap.config";

const STORAGE_KEY = "BLOCKSWAP_MOCK_STATE_V1";

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—");
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.max(min, Math.min(max, x));
}

function nowTs() {
  // simple UI timestamp, local
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function defaultState() {
  return {
    version: 1,
    config: deepClone(C0),

   balancesOz: {},
labels: {},

    activity: [
  { ts: "Ready", text: `Presale configured • ${C0.BRICKS_AVAILABLE_FOR_SALE} bricks available • Treasury ${C0.stableTreasury} ${C0.STABLE_SYMBOL}` },
  { ts: "Rule", text: `Transfers locked during presale` },
  { ts: "Rule", text: `Sellback requires treasury funding` },
],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    // Merge onto defaults to avoid missing fields after updates
    const base = defaultState();
    const merged = {
      ...base,
      ...parsed,
      config: { ...base.config, ...(parsed.config || {}) },
      balancesOz: parsed.balancesOz || base.balancesOz,
      labels: parsed.labels || base.labels,
      activity: parsed.activity || base.activity,
    };
    return merged;
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ---- In-memory state (backed by localStorage) ----
let S = loadState();

function derived(cfg) {
  const TOTAL_OZ = cfg.TOTAL_BRICKS * cfg.OUNCES_PER_BRICK;
  const LOCKED_OZ = cfg.BLOCK_LOCKED_BRICKS * cfg.OUNCES_PER_BRICK;
  const circulatingBricks = cfg.TOTAL_BRICKS - cfg.BLOCK_LOCKED_BRICKS;
  const circulatingOz = circulatingBricks * cfg.OUNCES_PER_BRICK;

  const ounceSellPrice = cfg.SELL_PRICE_PER_BRICK / cfg.OUNCES_PER_BRICK;
  const ounceBuybackFloor = cfg.BUYBACK_FLOOR_PER_BRICK / cfg.OUNCES_PER_BRICK;

  const trancheRemaining = Math.max(
    0,
    cfg.BRICKS_AVAILABLE_FOR_SALE - cfg.BRICKS_SOLD_SO_FAR
  );

  const brickPoolPct = cfg.BRICK_POOL_BY_PHASE?.[cfg.PHASE] ?? 0.30;

  const buybackCapacityOz =
    ounceBuybackFloor > 0 ? Math.floor((cfg.stableTreasury || 0) / ounceBuybackFloor) : 0;

  return {
    TOTAL_OZ,
    LOCKED_OZ,
    circulatingBricks,
    circulatingOz,
    ounceSellPrice,
    ounceBuybackFloor,
    trancheRemaining,
    brickPoolPct,
    buybackCapacityOz,
  };
}

function normalizeBricksOunces(cfg, bricks, ounces) {
  // Ounces: 0..35 only (no decimals)
  const b = clampInt(Number(bricks || 0), 0, 1_000_000);
  const o = clampInt(Number(ounces || 0), 0, cfg.OUNCES_PER_BRICK - 1);
  const totalOz = b * cfg.OUNCES_PER_BRICK + o;
  return { bricks: b, ounces: o, totalOz };
}

function enforcePresale(cfg) {
  assert(cfg.PRESALE_ACTIVE, "Presale is currently disabled.");
}

function enforceTransfers(cfg) {
  assert(cfg.TRANSFERS_ENABLED, "Transfers are disabled during presale.");
}

function buildHolders(cfg) {
  const d = derived(cfg);
  const denomOz = d.circulatingOz; // % of circulating supply

  return Object.entries(S.balancesOz)
    .map(([address, ounces]) => {
      const label = S.labels[address] || shortAddr(address);
      const bricksEq = ounces / cfg.OUNCES_PER_BRICK;
      const pct = denomOz > 0 ? (ounces / denomOz) * 100 : 0;
      return { address, label, ounces, bricksEq, pctWeightCirculating: pct };
    })
    .sort((a, b) => b.ounces - a.ounces);
}

function pushActivity(text) {
  S.activity = [{ ts: nowTs(), text }, ...S.activity].slice(0, 50);
  saveState(S);
}

function isAdmin(caller) {
  if (!caller) return false;
  const a = String(caller).toLowerCase();
  const admin = String(S.config.ADMIN_WALLET || "").toLowerCase();
  return a === admin;
}

function sanitizeAdminConfig(cfg) {
  // Hard safety rule: if presale active, transfers must be disabled
  if (cfg.PRESALE_ACTIVE) cfg.TRANSFERS_ENABLED = false;

  // Clamp important fields
  cfg.TOTAL_BRICKS = clampInt(Number(cfg.TOTAL_BRICKS || 0), 1, 10_000_000);
  cfg.OUNCES_PER_BRICK = clampInt(Number(cfg.OUNCES_PER_BRICK || 0), 1, 10_000);

  cfg.BLOCK_LOCKED_BRICKS = clampInt(Number(cfg.BLOCK_LOCKED_BRICKS || 0), 0, cfg.TOTAL_BRICKS);
  cfg.BRICKS_AVAILABLE_FOR_SALE = clampInt(Number(cfg.BRICKS_AVAILABLE_FOR_SALE || 0), 0, cfg.TOTAL_BRICKS);
  cfg.BRICKS_SOLD_SO_FAR = clampInt(Number(cfg.BRICKS_SOLD_SO_FAR || 0), 0, cfg.BRICKS_AVAILABLE_FOR_SALE);

  cfg.SELL_PRICE_PER_BRICK = Math.max(0, Number(cfg.SELL_PRICE_PER_BRICK || 0));
  cfg.BUYBACK_FLOOR_PER_BRICK = Math.max(0, Number(cfg.BUYBACK_FLOOR_PER_BRICK || 0));
  cfg.stableTreasury = Math.max(0, Number(cfg.stableTreasury || 0));

  cfg.PHASE = clampInt(Number(cfg.PHASE || 1), 1, 3);

  return cfg;
}

export const blockswapMock = {
  async getState() {
    const cfg = S.config;
    return {
      config: deepClone(cfg),
      derived: derived(cfg),
      holders: buildHolders(cfg),
      activity: deepClone(S.activity),
    };
  },

  async buy({ address, bricks, ounces }) {
    const cfg = S.config;
    enforcePresale(cfg);
    assert(address, "Connect wallet first.");

    const n = normalizeBricksOunces(cfg, bricks, ounces);
    assert(n.totalOz > 0, "Enter bricks and/or ounces.");

    // Tranche enforcement: count whole bricks only
    const bricksBuying = Math.floor(n.totalOz / cfg.OUNCES_PER_BRICK);
    if (bricksBuying > 0) {
      const remaining = Math.max(
        0,
        cfg.BRICKS_AVAILABLE_FOR_SALE - cfg.BRICKS_SOLD_SO_FAR
      );
      assert(bricksBuying <= remaining, "Not enough bricks remaining in this launch tranche.");
      cfg.BRICKS_SOLD_SO_FAR += bricksBuying;
    }

    S.balancesOz[address] = (S.balancesOz[address] || 0) + n.totalOz;

    // if no label exists, default to short wallet for mock
    if (!S.labels[address]) S.labels[address] = shortAddr(address);

    sanitizeAdminConfig(cfg); // keep invariants
    saveState(S);

    const d = derived(cfg);
    const cost = n.totalOz * d.ounceSellPrice;

    pushActivity(
      `BUY — ${n.bricks} brick(s) + ${n.ounces} oz (${n.totalOz} oz) • ${cost.toFixed(2)} ${cfg.STABLE_SYMBOL}`
    );

    return this.getState();
  },

  async sellBack({ address, bricks, ounces }) {
    const cfg = S.config;
    enforcePresale(cfg);
    assert(address, "Connect wallet first.");

    const n = normalizeBricksOunces(cfg, bricks, ounces);
    assert(n.totalOz > 0, "Enter bricks and/or ounces.");

    const bal = S.balancesOz[address] || 0;
    assert(bal >= n.totalOz, "You don't have enough ounces to sell back.");

    const d = derived(cfg);
    const proceeds = n.totalOz * d.ounceBuybackFloor;

    assert(cfg.stableTreasury >= proceeds, "Treasury too low for instant buyback right now.");
    cfg.stableTreasury -= proceeds;

    S.balancesOz[address] = bal - n.totalOz;

    sanitizeAdminConfig(cfg);
    saveState(S);

    pushActivity(
      `SELLBACK — ${n.bricks} brick(s) + ${n.ounces} oz (${n.totalOz} oz) • ${proceeds.toFixed(2)} ${cfg.STABLE_SYMBOL}`
    );

    return this.getState();
  },

  async transfer({ from, to, bricks, ounces }) {
    const cfg = S.config;
    enforceTransfers(cfg); // always blocked during presale
    assert(from && to, "Missing from/to.");

    const n = normalizeBricksOunces(cfg, bricks, ounces);
    assert(n.totalOz > 0, "Enter bricks and/or ounces.");

    const bal = S.balancesOz[from] || 0;
    assert(bal >= n.totalOz, "Insufficient balance.");

    S.balancesOz[from] = bal - n.totalOz;
    S.balancesOz[to] = (S.balancesOz[to] || 0) + n.totalOz;

    saveState(S);
    pushActivity(`TRANSFER — ${n.totalOz} oz • ${shortAddr(from)} → ${shortAddr(to)}`);
    return this.getState();
  },

  // ---------- ADMIN ----------
  async adminSetConfig({ caller, patch }) {
    assert(isAdmin(caller), "Admin only.");
    assert(patch && typeof patch === "object", "Invalid patch.");

    S.config = sanitizeAdminConfig({ ...S.config, ...patch });
    saveState(S);
    pushActivity(`ADMIN — Updated presale settings`);
    return this.getState();
  },

  async adminReset({ caller }) {
    assert(isAdmin(caller), "Admin only.");
    S = defaultState();
    saveState(S);
    pushActivity(`ADMIN — Reset demo state`);
    return this.getState();
  },
};
