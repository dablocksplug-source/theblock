// src/services/blockswapAdapter.js
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";
import {
  loadBlockswapState,
  saveBlockswapState,
  clearBlockswapState,
} from "./blockswapStore";

function nowTag() {
  return new Date().toLocaleString();
}
function nowMs() {
  return Date.now();
}

function clampInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

function clampOz(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

function isAdmin(walletAddress) {
  if (!walletAddress) return false;
  return (
    String(walletAddress).toLowerCase() === String(C.ADMIN_WALLET).toLowerCase()
  );
}

function defaultState() {
  const totalOz = C.TOTAL_BRICKS * C.OUNCES_PER_BRICK;
  const lockedOz = C.BLOCK_LOCKED_BRICKS * C.OUNCES_PER_BRICK;
  const circulatingBricks = C.TOTAL_BRICKS - C.BLOCK_LOCKED_BRICKS;
  const circulatingOz = circulatingBricks * C.OUNCES_PER_BRICK;

  return {
    // ✅ Early Bird = marketing badge only
    earlyBirdBadge: !!C.EARLY_BIRD_BADGE_DEFAULT,

    // ✅ ONLY buy gate
    buyPaused: !!C.BUY_PAUSED_DEFAULT,

    // pricing
    sellPricePerBrick: C.SELL_PRICE_PER_BRICK,
    buybackFloorPerBrick: C.BUYBACK_FLOOR_PER_BRICK,

    // Treasuries (stable coin)
    buybackVault: Number(C.STARTING_TREASURY || 0),
    theBlockTreasury: 0,

    // supply
    totalBricks: C.TOTAL_BRICKS,
    ouncesPerBrick: C.OUNCES_PER_BRICK,
    totalOz,
    lockedBricks: C.BLOCK_LOCKED_BRICKS,
    lockedOz,
    circulatingBricks,
    circulatingOz,

    // offering cap
    bricksAvailableForSale: C.BRICKS_AVAILABLE_FOR_SALE,
    ouncesAvailableForSale: C.BRICKS_AVAILABLE_FOR_SALE * C.OUNCES_PER_BRICK,
    ouncesSold: 0,

    // phase
    phase: C.STARTING_PHASE,

    // balances (oz) & labels
    balancesOz: {},
    labels: {},

    // ✅ Rewards rounds (claim-based shape for contracts later)
    // rounds: [{ id, createdAtMs, claimEndMs, totalPoolStable, rewardPerOz, snapshotTotalEligibleOz, snapshotBalancesOz, claimedBy: {addr: true} }]
    rewardRounds: [],

    // activity log
    activity: [
      {
        ts: "Ready",
        text: `BlockSwap configured • ${C.BRICKS_AVAILABLE_FOR_SALE} bricks available • BuybackVault ${Number(
          C.STARTING_TREASURY || 0
        )} ${C.STABLE_SYMBOL}`,
      },
      {
        ts: "Rule",
        text: `Buys can be paused by admin. Sellback always allowed if vault has funds.`,
      },
      {
        ts: "Rule",
        text: `Each buy funds BuybackVault at the floor; leftovers go to TheBlock.`,
      },
      {
        ts: "Rule",
        text: `Rewards are claim-based and expire after 180 days.`,
      },
    ],
  };
}

function getStateInternal() {
  const loaded = loadBlockswapState();
  if (loaded) return loaded;
  const fresh = defaultState();
  saveBlockswapState(fresh);
  return fresh;
}

function setStateInternal(next) {
  saveBlockswapState(next);
  return next;
}

function addActivity(state, text) {
  return {
    ...state,
    activity: [{ ts: nowTag(), text }, ...state.activity].slice(0, 25),
  };
}

function getOuncePrices(state) {
  return {
    ounceSellPrice: state.sellPricePerBrick / state.ouncesPerBrick,
    ounceBuybackFloor: state.buybackFloorPerBrick / state.ouncesPerBrick,
  };
}

function getBrickPoolPct(state) {
  return C.BRICK_POOL_BY_PHASE?.[state.phase] ?? 0.30;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeSnapshot(state) {
  const balances = state.balancesOz || {};
  const snapshotBalancesOz = deepClone(balances);

  const snapshotTotalEligibleOz = Object.values(snapshotBalancesOz).reduce(
    (sum, v) => sum + Number(v || 0),
    0
  );

  return { snapshotBalancesOz, snapshotTotalEligibleOz };
}

// ===== public API =====
export const blockswapAdapter = {
  // read-only derived snapshot for UI
  getSnapshot() {
    const s = getStateInternal();
    const { ounceSellPrice, ounceBuybackFloor } = getOuncePrices(s);

    const brickPoolPct = getBrickPoolPct(s);

    const buybackCapacityOz = Math.floor(
      (Number(s.buybackVault || 0) / s.buybackFloorPerBrick) * s.ouncesPerBrick
    );

    return {
      ...s,
      STABLE_SYMBOL: C.STABLE_SYMBOL,
      ADMIN_WALLET: C.ADMIN_WALLET,

      brickPoolPct,
      ounceSellPrice,
      ounceBuybackFloor,
      buybackCapacityOz,
      ouncesRemainingForSale: Math.max(0, s.ouncesAvailableForSale - s.ouncesSold),
      bricksSoldEq: s.ouncesSold / s.ouncesPerBrick,
    };
  },

  // ===== user actions =====
  buy({ walletAddress, ounces, label }) {
    const s = getStateInternal();

    if (s.buyPaused) throw new Error("Buys are paused right now.");
    if (!walletAddress) throw new Error("Connect wallet to buy.");

    const oz = clampOz(ounces);
    if (oz <= 0) throw new Error("Enter an ounce amount (must be at least 1 oz).");
    if (s.ouncesSold + oz > s.ouncesAvailableForSale) {
      throw new Error("Not enough ounces remaining for sale.");
    }

    const { ounceSellPrice, ounceBuybackFloor } = getOuncePrices(s);

    // floor goes to BuybackVault, leftovers to TheBlock
    const floorIn = oz * ounceBuybackFloor;
    const totalIn = oz * ounceSellPrice;
    const theBlockIn = Math.max(0, totalIn - floorIn);

    const addr = String(walletAddress).toLowerCase();
    const prev = s.balancesOz[addr] ?? 0;

    // label rules: set only if empty
    const nextLabels = { ...(s.labels || {}) };
    const incomingLabel = (label || "").trim();
    const existingLabel = (nextLabels[addr] || "").trim();
    if (incomingLabel && !existingLabel) nextLabels[addr] = incomingLabel;

    const next = {
      ...s,
      ouncesSold: s.ouncesSold + oz,
      balancesOz: { ...s.balancesOz, [addr]: prev + oz },
      labels: nextLabels,

      buybackVault: Number(s.buybackVault || 0) + floorIn,
      theBlockTreasury: Number(s.theBlockTreasury || 0) + theBlockIn,
    };

    const prettyBricks = (oz / s.ouncesPerBrick).toFixed(4);

    const next2 = addActivity(
      next,
      `Buy ${oz} oz (${prettyBricks} brick eq) • Paid ${totalIn.toFixed(2)} ${
        C.STABLE_SYMBOL
      } → Vault +${floorIn.toFixed(2)} / TheBlock +${theBlockIn.toFixed(2)}`
    );

    setStateInternal(next2);
    return this.getSnapshot();
  },

  sellBack({ walletAddress, ounces }) {
    const s = getStateInternal();
    if (!walletAddress) throw new Error("Connect wallet to sell back.");

    const oz = clampOz(ounces);
    if (oz <= 0) throw new Error("Enter an ounce amount to sell back.");

    const addr = String(walletAddress).toLowerCase();
    const owned = s.balancesOz[addr] ?? 0;
    if (oz > owned) throw new Error("You don’t have that many ounces.");

    const { ounceBuybackFloor } = getOuncePrices(s);
    const proceeds = oz * ounceBuybackFloor;

    if (proceeds > Number(s.buybackVault || 0)) {
      throw new Error("BuybackVault too low for instant buyback right now.");
    }

    const nextOwned = owned - oz;

    const next = {
      ...s,
      buybackVault: Number(s.buybackVault || 0) - proceeds,
      balancesOz: { ...s.balancesOz, [addr]: nextOwned },
    };

    const prettyBricks = (oz / s.ouncesPerBrick).toFixed(4);
    const next2 = addActivity(
      next,
      `Sell back ${oz} oz (${prettyBricks} brick eq) • Receive ${proceeds.toFixed(
        2
      )} ${C.STABLE_SYMBOL} from Vault`
    );

    setStateInternal(next2);
    return this.getSnapshot();
  },

  setLabel({ walletAddress, label }) {
    const s = getStateInternal();
    if (!walletAddress) throw new Error("Connect wallet first.");

    const addr = String(walletAddress).toLowerCase();
    const next = {
      ...s,
      labels: { ...s.labels, [addr]: String(label || "").trim() },
    };

    setStateInternal(next);
    return this.getSnapshot();
  },

  // ===== admin actions =====

  // marketing only
  adminSetEarlyBirdBadge({ walletAddress, enabled }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const next = addActivity(
      { ...s, earlyBirdBadge: !!enabled },
      `Admin: Early Bird badge ${enabled ? "ON" : "OFF"} (marketing)`
    );
    setStateInternal(next);
    return this.getSnapshot();
  },

  // the ONLY buy gate
  adminSetBuyPaused({ walletAddress, paused }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const next = addActivity(
      { ...s, buyPaused: !!paused },
      `Admin: Buys ${paused ? "PAUSED" : "RESUMED"}`
    );
    setStateInternal(next);
    return this.getSnapshot();
  },

  adminFundTreasury({ walletAddress, amountStable }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const amt = Number(amountStable);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a positive amount.");

    const next = addActivity(
      { ...s, buybackVault: Number(s.buybackVault || 0) + amt },
      `Admin: BuybackVault funded +${amt.toFixed(2)} ${C.STABLE_SYMBOL}`
    );
    setStateInternal(next);
    return this.getSnapshot();
  },

  adminMoveToBuybackVault({ walletAddress, amountStable }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const amt = Number(amountStable);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a positive amount.");

    const curBlock = Number(s.theBlockTreasury || 0);
    if (amt > curBlock) throw new Error("TheBlock treasury too low for that move.");

    const next = addActivity(
      {
        ...s,
        theBlockTreasury: curBlock - amt,
        buybackVault: Number(s.buybackVault || 0) + amt,
      },
      `Admin: moved ${amt.toFixed(2)} ${C.STABLE_SYMBOL} from TheBlock → BuybackVault`
    );

    setStateInternal(next);
    return this.getSnapshot();
  },

  adminSetPrices({ walletAddress, sellPricePerBrick, buybackFloorPerBrick }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const nextSell = Number(sellPricePerBrick);
    const nextFloor = Number(buybackFloorPerBrick);

    if (!Number.isFinite(nextSell) || nextSell <= 0) throw new Error("Invalid sell price.");
    if (!Number.isFinite(nextFloor) || nextFloor <= 0) throw new Error("Invalid buyback floor.");

    if (nextSell < s.sellPricePerBrick) throw new Error("Sell price can only increase.");
    if (nextFloor < s.buybackFloorPerBrick) throw new Error("Buyback floor can only increase.");
    if (nextSell < nextFloor) throw new Error("Sell price must be ≥ buyback floor.");

    const next = addActivity(
      { ...s, sellPricePerBrick: nextSell, buybackFloorPerBrick: nextFloor },
      `Admin: prices updated • Sell ${nextSell} / Buyback ${nextFloor} ${C.STABLE_SYMBOL} per brick`
    );
    setStateInternal(next);
    return this.getSnapshot();
  },

  adminAdvancePhase({ walletAddress, phase }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const p = clampInt(phase);
    if (![1, 2, 3].includes(p)) throw new Error("Phase must be 1, 2, or 3.");

    const next = addActivity({ ...s, phase: p }, `Admin: phase set to ${p}`);
    setStateInternal(next);
    return this.getSnapshot();
  },

  // ✅ rewards + export
  adminExportStateJSON({ walletAddress }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");
    return JSON.stringify(this.getSnapshot(), null, 2);
  },

  adminGetHoldersSnapshot({ walletAddress }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");
    const snap = makeSnapshot(s);
    return { ...snap, ts: nowTag(), atMs: nowMs(), stable: C.STABLE_SYMBOL };
  },

  // Create a claim round (180 days)
  adminCreateRewardRound({ walletAddress, poolStable }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const pool = Number(poolStable);
    if (!Number.isFinite(pool) || pool <= 0) throw new Error("Enter a positive reward pool amount.");

    const { snapshotBalancesOz, snapshotTotalEligibleOz } = makeSnapshot(s);
    if (snapshotTotalEligibleOz <= 0) throw new Error("No eligible holders (0 oz total).");

    const rewardPerOz = pool / snapshotTotalEligibleOz;

    const createdAtMs = nowMs();
    const claimEndMs = createdAtMs + 180 * 24 * 60 * 60 * 1000; // 180 days
    const id = `${createdAtMs}`;

    const round = {
      id,
      createdAtMs,
      claimEndMs,
      totalPoolStable: pool,
      rewardPerOz,
      snapshotTotalEligibleOz,
      snapshotBalancesOz,
      claimedBy: {},
      stableSymbol: C.STABLE_SYMBOL,
    };

    const next = addActivity(
      { ...s, rewardRounds: [round, ...(s.rewardRounds || [])] },
      `Admin: Reward round ${id} created • Pool ${pool.toFixed(2)} ${
        C.STABLE_SYMBOL
      } • ${rewardPerOz.toFixed(6)} ${C.STABLE_SYMBOL}/oz • Claim window 180d`
    );

    setStateInternal(next);
    return this.getSnapshot();
  },

  // demo-only claim (contract later = Merkle claim)
  claimReward({ walletAddress, roundId }) {
    const s = getStateInternal();
    if (!walletAddress) throw new Error("Connect wallet to claim.");

    const addr = String(walletAddress).toLowerCase();
    const rounds = Array.isArray(s.rewardRounds) ? s.rewardRounds : [];
    const r = rounds.find((x) => String(x.id) === String(roundId));
    if (!r) throw new Error("Reward round not found.");

    if (nowMs() > Number(r.claimEndMs || 0)) throw new Error("Claim window ended.");
    if (r.claimedBy?.[addr]) throw new Error("Already claimed.");

    const oz = Number(r.snapshotBalancesOz?.[addr] || 0);
    if (oz <= 0) throw new Error("No eligible ounces in snapshot.");

    const claimAmt = oz * Number(r.rewardPerOz || 0);

    const nextRounds = rounds.map((x) => {
      if (String(x.id) !== String(roundId)) return x;
      return { ...x, claimedBy: { ...(x.claimedBy || {}), [addr]: true } };
    });

    const next = addActivity(
      { ...s, rewardRounds: nextRounds },
      `Claim: ${addr.slice(0, 6)}… claimed ${claimAmt.toFixed(2)} ${
        C.STABLE_SYMBOL
      } from round ${roundId}`
    );

    setStateInternal(next);
    return this.getSnapshot();
  },

  adminReset({ walletAddress }) {
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");
    clearBlockswapState();
    const fresh = defaultState();
    setStateInternal(fresh);
    return this.getSnapshot();
  },
};
