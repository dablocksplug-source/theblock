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

function addDaysMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function getEligibleTotalOz(state) {
  const balances = state.balancesOz || {};
  return Object.values(balances).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function defaultState() {
  const totalOz = C.TOTAL_BRICKS * C.OUNCES_PER_BRICK;
  const lockedOz = C.BLOCK_LOCKED_BRICKS * C.OUNCES_PER_BRICK;
  const circulatingBricks = C.TOTAL_BRICKS - C.BLOCK_LOCKED_BRICKS;
  const circulatingOz = circulatingBricks * C.OUNCES_PER_BRICK;

  return {
    // marketing + sale controls
    earlyBirdBadge: true, // marketing badge only
    buyPaused: false, // REAL buy gate

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

    // offering status
    bricksAvailableForSale: C.BRICKS_AVAILABLE_FOR_SALE,
    ouncesAvailableForSale: C.BRICKS_AVAILABLE_FOR_SALE * C.OUNCES_PER_BRICK,
    ouncesSold: 0,

    // phase
    phase: C.STARTING_PHASE,

    // balances (oz) & labels
    balancesOz: {},
    labels: {},

    // rewards (demo-mode)
    rewardRounds: [],
    rewardClaims: {}, // { [roundId]: { [addrLower]: true } }

    // activity log
    activity: [
      {
        ts: "Ready",
        text: `BlockSwap configured • ${C.BRICKS_AVAILABLE_FOR_SALE} bricks available • BuybackVault ${Number(
          C.STARTING_TREASURY || 0
        )} ${C.STABLE_SYMBOL}`,
      },
      { ts: "Rule", text: `Buys can be paused by Admin` },
      {
        ts: "Rule",
        text: `Every buy funds BuybackVault at the floor; leftovers go to TheBlock`,
      },
      { ts: "Rule", text: `Buyback requires BuybackVault funding` },
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
    activity: [{ ts: nowTag(), text }, ...(state.activity || [])].slice(0, 25),
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

      // keep the old flag name alive for UI compatibility
      presaleActive: !!s.earlyBirdBadge,

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

    // REAL gate
    if (s.buyPaused) throw new Error("Buys are currently paused.");
    if (!walletAddress) throw new Error("Connect wallet to buy.");

    const oz = clampOz(ounces);
    if (oz <= 0) throw new Error("Enter an ounce amount (must be at least 1 oz).");
    if (s.ouncesSold + oz > s.ouncesAvailableForSale) {
      throw new Error("Not enough ounces remaining for sale.");
    }

    const { ounceSellPrice, ounceBuybackFloor } = getOuncePrices(s);

    // split per ounce:
    // floor goes to BuybackVault, leftovers go to TheBlock
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

      // treasuries
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

    // pay only from BuybackVault
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

  adminSetBuyPaused({ walletAddress, paused }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const next = addActivity(
      { ...s, buyPaused: !!paused },
      `Admin: buys ${paused ? "PAUSED" : "LIVE"}`
    );
    setStateInternal(next);
    return this.getSnapshot();
  },

  // admin can fund the BuybackVault (not TheBlock)
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

  // move funds FROM TheBlock treasury INTO BuybackVault
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

  // prices can only move UP
  adminSetPrices({ walletAddress, sellPricePerBrick, buybackFloorPerBrick }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const nextSell = Number(sellPricePerBrick);
    const nextFloor = Number(buybackFloorPerBrick);

    if (!Number.isFinite(nextSell) || nextSell <= 0) throw new Error("Invalid sell price.");
    if (!Number.isFinite(nextFloor) || nextFloor <= 0)
      throw new Error("Invalid buyback floor.");

    if (nextSell < s.sellPricePerBrick) throw new Error("Sell price can only increase.");
    if (nextFloor < s.buybackFloorPerBrick)
      throw new Error("Buyback floor can only increase.");
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

  adminCreateRewardRound({ walletAddress, poolStable }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");

    const pool = Number(poolStable);
    if (!Number.isFinite(pool) || pool <= 0) throw new Error("Enter a positive pool amount.");

    const snapshotTotalEligibleOz = getEligibleTotalOz(s);
    if (snapshotTotalEligibleOz <= 0) throw new Error("No eligible holders yet.");

    const rewardPerOz = pool / snapshotTotalEligibleOz;

    const id = `R${Date.now()}`;
    const claimStartMs = Date.now();
    const claimEndMs = claimStartMs + addDaysMs(180);

    const round = {
      id,
      totalPoolStable: pool,
      rewardPerOz,
      snapshotTotalEligibleOz,
      claimStartMs,
      claimEndMs,
      snapshotBalancesOz: { ...(s.balancesOz || {}) },
    };

    const next = addActivity(
      {
        ...s,
        rewardRounds: [round, ...(s.rewardRounds || [])],
      },
      `Admin: reward round ${id} • Pool ${pool.toFixed(2)} ${C.STABLE_SYMBOL} • Per oz ${rewardPerOz.toFixed(
        6
      )} • Claim until ${new Date(claimEndMs).toLocaleDateString()}`
    );

    setStateInternal(next);
    return this.getSnapshot();
  },

  claimReward({ walletAddress, roundId }) {
    const s = getStateInternal();
    if (!walletAddress) throw new Error("Connect wallet to claim.");

    const rid = String(roundId || "").trim();
    if (!rid) throw new Error("Missing reward round.");

    const rounds = Array.isArray(s.rewardRounds) ? s.rewardRounds : [];
    const round = rounds.find((r) => r.id === rid);
    if (!round) throw new Error("Reward round not found.");

    const now = Date.now();
    if (now > Number(round.claimEndMs || 0)) throw new Error("Claim window ended.");

    const addr = String(walletAddress).toLowerCase();

    const claimsByRound = { ...(s.rewardClaims || {}) };
    const claimedMap = { ...(claimsByRound[rid] || {}) };

    if (claimedMap[addr]) throw new Error("Already claimed this round.");

    const userOz = Number(round.snapshotBalancesOz?.[addr] || 0);
    if (userOz <= 0) throw new Error("No eligible ounces in this snapshot.");

    const payout = userOz * Number(round.rewardPerOz || 0);
    if (payout <= 0) throw new Error("Nothing to claim.");

    claimedMap[addr] = true;
    claimsByRound[rid] = claimedMap;

    const next = addActivity(
      {
        ...s,
        rewardClaims: claimsByRound,
      },
      `Claim: ${addr.slice(0, 6)}... claimed ${payout.toFixed(2)} ${
        C.STABLE_SYMBOL
      } from ${rid} (${userOz} oz @ ${Number(round.rewardPerOz).toFixed(6)})`
    );

    setStateInternal(next);
    return this.getSnapshot();
  },

  adminExportStateJSON({ walletAddress }) {
    const s = getStateInternal();
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");
    // export the raw state + snapshot fields are reconstructable anyway
    return JSON.stringify(s, null, 2);
  },

  adminReset({ walletAddress }) {
    if (!isAdmin(walletAddress)) throw new Error("Admin only.");
    clearBlockswapState();
    const fresh = defaultState();
    setStateInternal(fresh);
    return this.getSnapshot();
  },
};
