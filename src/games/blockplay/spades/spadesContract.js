// src/games/blockplay/spades/spadesContract.js

import {
  spadesReducer,
  makeInitialState,
} from "./spadesReducer";
import {
  getPublicState,
  getPrivateStateForSeat,
} from "./stateViews";

// Canonical list of seats
export const SPADES_SEATS = ["A", "B", "C", "D"];

// Score needed to win (mirror reducer)
export const SPADES_SCORE_TO_WIN = 12;

/**
 * Context passed in by the host / server.
 *
 * seat: which seat this client is bound to (A/B/C/D) or null for server/admin
 * isServer: true if this call is coming from trusted game host / backend
 * isBot: true if this "player" is actually an automated bot
 * tableId: optional table index for logging / sharding
 */
export function makeCtx({
  seat = null,
  isServer = false,
  isBot = false,
  tableId = null,
} = {}) {
  return { seat, isServer, isBot, tableId };
}

/**
 * Shape of all legal actions.
 *
 * (Plain JS, but if you ever move to TS these become type unions.)
 */
export const SpadesActionTypes = {
  DEAL_HAND: "DEAL_HAND",
  START_NEW_GAME: "START_NEW_GAME",
  PLACE_BID: "PLACE_BID",
  PLAY_CARD: "PLAY_CARD",
  RESOLVE_TRICK: "RESOLVE_TRICK",
  END_HAND: "END_HAND",
  TICK: "TICK",
};

// ---- Action creators ----
// (optional helpers for client / tests)

export const SpadesActions = {
  dealHand(nextDealer = null, seedU32 = null) {
    return {
      type: SpadesActionTypes.DEAL_HAND,
      nextDealer,
      seedU32,
    };
  },

  startNewGame(seedU32 = null) {
    return {
      type: SpadesActionTypes.START_NEW_GAME,
      seedU32,
    };
  },

  placeBid(seat, value) {
    return {
      type: SpadesActionTypes.PLACE_BID,
      seat,
      value,
    };
  },

  playCard(seat, cardId) {
    return {
      type: SpadesActionTypes.PLAY_CARD,
      seat,
      cardId,
    };
  },

  resolveTrick() {
    return {
      type: SpadesActionTypes.RESOLVE_TRICK,
    };
  },

  endHand() {
    return {
      type: SpadesActionTypes.END_HAND,
    };
  },

  tick() {
    return {
      type: SpadesActionTypes.TICK,
    };
  },
};

// =========================
//  Core contract API
// =========================

/**
 * Create a brand-new match state.
 *
 * seedU32: optional 32-bit seed so your deals can be deterministic
 *          when you care about verifiability / replay.
 */
export function createSpadesMatch(seedU32 = null) {
  const base = makeInitialState(seedU32);
  // Optionally auto-deal the first hand; or you can keep it "idle"
  // and require the host to explicitly call DEAL_HAND.
  return base;
}

/**
 * The ONLY way to change state.
 *
 * - `state` is the authoritative match state from your host/server
 * - `action` is the intent (from client or host)
 * - `ctx` tells us who is trying to do it
 *
 * This is what you call from your eventual websocket/http handler.
 */
export function applySpadesAction(state, action, ctx = makeCtx()) {
  const safeCtx = ctx || makeCtx();

  // 1) Basic shape sanity
  if (!action || typeof action.type !== "string") {
    // ignore totally invalid actions
    return state;
  }

  const type = action.type;

  // 2) Hard gate: only allow certain actions from non-server callers
  const isServer = !!safeCtx.isServer;
  const callerSeat = safeCtx.seat;

  // ---- Server/admin-only actions ----
  const serverOnly = new Set([
    SpadesActionTypes.DEAL_HAND,
    SpadesActionTypes.START_NEW_GAME,
    SpadesActionTypes.RESOLVE_TRICK,
    SpadesActionTypes.END_HAND,
  ]);

  if (serverOnly.has(type) && !isServer) {
    // Client tried to force a deal / restart / resolve → ignore
    return state;
  }

  // ---- Seat-bound actions (must match ctx.seat) ----
  if (type === SpadesActionTypes.PLACE_BID) {
    if (!SPADES_SEATS.includes(action.seat)) return state;
    if (!isServer && callerSeat && callerSeat !== action.seat) {
      // Player A cannot send PLACE_BID for B, C, or D
      return state;
    }
  }

  if (type === SpadesActionTypes.PLAY_CARD) {
    if (!SPADES_SEATS.includes(action.seat)) return state;
    if (!isServer && callerSeat && callerSeat !== action.seat) {
      // Player A cannot send PLAY_CARD for others
      return state;
    }
  }

  // ---- Timer tick: either the host or a trusted loop should call this ----
  if (type === SpadesActionTypes.TICK && !isServer) {
    // You *could* allow this from any client and just rate-limit on server,
    // but the safest pattern is: host owns TICK completely.
    return state;
  }

  // 3) Delegate to your reducer (pure core logic)
  const nextState = spadesReducer(state, action);

  // 4) You *could* enforce invariants here if you want:
  //    e.g. ensure scores didn't jump by something insane, etc.
  //    For now we just trust the reducer.
  return nextState;
}

// =========================
//  View helpers for network
// =========================

/**
 * What you send to *everyone* at the table after a state change.
 * This hides full hands and only exposes safe public info.
 */
export function getSpadesPublicView(state) {
  return getPublicState(state);
}

/**
 * What you send to a specific seat (A/B/C/D).
 * This includes that seat's hand and whatever private info you want them to see.
 */
export function getSpadesPrivateView(state, seat) {
  if (!SPADES_SEATS.includes(seat)) {
    return { seat, myHand: [] };
  }
  return getPrivateStateForSeat(state, seat);
}
