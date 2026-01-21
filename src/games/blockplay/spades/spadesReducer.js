// src/games/blockplay/spades/spadesReducer.js

// =========================
// Constants / helpers
// =========================

const SEATS = ["A", "B", "C", "D"];
const SCORE_TO_WIN = 12;

// Highest → lowest importance for trick callouts
const TRICK_EVENT_PRIORITY = [
  "ACE_KILLER",
  "JACK_WIN",
  // later we can add: "BOSTON", "SET", etc.
];


// Suit / rank helpers
function getSuit(card) {
  if (!card || !card.value) return "";
  const s = card.value.slice(-1);
  if (s === "♠") return "S";
  if (s === "♥") return "H";
  if (s === "♦") return "D";
  if (s === "♣") return "C";
  return "";
}

function getRank(card) {
  if (!card || !card.value) return 0;
  const v = card.value.slice(0, -1);
  const order = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    "10": 10,
    "9": 9,
    "8": 8,
    "7": 7,
    "6": 6,
    "5": 5,
    "4": 4,
    "3": 3,
    "2": 2,
  };
  return order[v] ?? 0;
}

function mustFollowSuit(hand, leadSuit) {
  if (!leadSuit) return false;
  return hand.some((c) => getSuit(c) === leadSuit);
}

function nextPlayer(seat) {
  if (seat === "A") return "B";
  if (seat === "B") return "C";
  if (seat === "C") return "D";
  return "A";
}

// score per hand: +bid if books >= bid, else -bid
function scoreForPlayer(bid, books) {
  if (bid == null) return 0;
  return books >= bid ? bid : -bid;
}

// deck helpers
function buildDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  const raw = [];
  ranks.forEach((r) => suits.forEach((s) => raw.push(r + s)));
  return raw.map((value, index) => ({ id: index, value }));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// trick winner: any spades? highest spade wins; else highest of lead suit
function determineTrickWinner(trickSnap) {
  if (!trickSnap || !trickSnap.length) return "A";
  const leadSuit = getSuit(trickSnap[0].card);

  const spades = trickSnap.filter((t) => getSuit(t.card) === "S");
  if (spades.length) {
    return spades.reduce((best, cur) =>
      getRank(cur.card) > getRank(best.card) ? cur : best
    ).player;
  }

  const leads = trickSnap.filter((t) => getSuit(t.card) === leadSuit);
  return leads.reduce((best, cur) =>
    getRank(cur.card) > getRank(best.card) ? cur : best
  ).player;
}

// =========================
// Match / log helpers
// =========================

function appendLog(state, entry) {
  const step = (state.step ?? 0);
  return {
    ...state,
    step: step + 1,
    log: [
      ...(state.log ?? []),
      {
        step,
        phase: state.phase,
        turn: state.turn,
        handIndex: state.handIndex ?? 0,
        ...entry,
      },
    ],
  };
}

// =========================
// Initial state
// =========================

// src/games/blockplay/spades/spadesReducer.js

// ...everything above stays the same...

export function makeInitialState(seedU32 = null) {
  const seed = (seedU32 ?? Date.now()) >>> 0;

  return {
    phase: "idle", // "idle" | "bidding" | "playing" | "gameover"
    turn: "A",
    leader: "A",
    dealer: "D",
    timer: 0,

    hands: { A: [], B: [], C: [], D: [] },
    bids: { A: null, B: null, C: null, D: null },
    books: { A: 0, B: 0, C: 0, D: 0 },
    scores: { A: 0, B: 0, C: 0, D: 0 },
    trick: [],

    winnerSeat: null,
    handRecap: null,
    nextDealerToDeal: null,
     // 🔹 NEW: metadata about the last resolved trick for sound/UX
    lastTrickMeta: null,


    // 🔹 timestamp of last deal (for animations)
    dealStamp: 0,

    // blockchain prep
    matchSeed: seed,
    handIndex: 0,
    step: 0,
    log: [],

    seed,
    rngState: seed,
  };
}

function dealHand(state, nextDealer = null, seedU32Override = null) {
  const deckSeed = (seedU32Override ?? state.seed ?? Date.now()) >>> 0;
  const deck = shuffle(buildDeck());

  const hands = {
    A: deck.slice(0, 13),
    B: deck.slice(13, 26),
    C: deck.slice(26, 39),
    D: deck.slice(39, 52),
  };

  const dealerSeat =
    nextDealer && SEATS.includes(nextDealer)
      ? nextDealer
      : state.dealer && SEATS.includes(state.dealer)
      ? state.dealer
      : SEATS[Math.floor(Math.random() * SEATS.length)];

  const firstLeader = nextPlayer(dealerSeat);

  const after = {
    ...state,
    phase: "bidding",
    timer: 15, // bidding timer
    dealer: dealerSeat,
    leader: firstLeader,
    turn: firstLeader,

    hands,
    bids: { A: null, B: null, C: null, D: null },
    books: { A: 0, B: 0, C: 0, D: 0 },
    trick: [],
    handRecap: null,
    nextDealerToDeal: null,

    handIndex: (state.handIndex ?? 0) + 1,
    rngState: deckSeed,

    // 🔹 mark when this deal happened
    dealStamp: Date.now(),
  };

  return appendLog(after, {
    type: "DEAL",
    dealer: dealerSeat,
    leader: firstLeader,
    handIndex: after.handIndex,
    seed: deckSeed,
  });
}

// ...rest of reducer unchanged...


// place a bid from a seat (used by both player and bots)
function placeBidInternal(state, seat, value) {
  if (state.phase !== "bidding") return state;
  if (!SEATS.includes(seat)) return state;
  if (state.turn !== seat) return state;
  if (state.bids[seat] != null) return state;

  const bids = { ...state.bids, [seat]: value };

  const allBidsIn = SEATS.every((s) => bids[s] != null);

  if (allBidsIn) {
    // move to playing
    return {
      ...state,
      bids,
      phase: "playing",
      turn: state.leader,
      timer: 12, // playing timer
    };
  }

  // rotate to next seat for bidding
  const nextTurn = nextPlayer(seat);

  return {
    ...state,
    bids,
    turn: nextTurn,
    timer: 15,
  };
}

// play a card from seat by cardId
function playCardInternal(state, seat, cardId) {
  if (state.phase !== "playing") return state;
  if (!SEATS.includes(seat)) return state;
  if (state.turn !== seat) return state;

  const hand = state.hands[seat] || [];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return state;

  // already played in this trick?
  if (state.trick.some((t) => t.player === seat)) return state;

  const leadSuit = state.trick.length > 0 ? getSuit(state.trick[0].card) : "";
  const cardSuit = getSuit(card);

  // must follow suit if possible
  if (leadSuit && cardSuit !== leadSuit && mustFollowSuit(hand, leadSuit)) {
    return state;
  }

  const newHand = hand.filter((c) => c.id !== cardId);
  const hands = { ...state.hands, [seat]: newHand };

  const trick = [...state.trick, { player: seat, card }];

  // less than 4 unique players => continue trick, advance turn
  const uniq = new Set(trick.map((t) => t.player));
  const nextTurn = uniq.size < 4 ? nextPlayer(seat) : nextPlayer(seat); // will be ignored by TICK while trick has 4

  return {
    ...state,
    hands,
    trick,
    turn: nextTurn,
    // timer gets set by TICK or caller
  };
}

// resolve current trick after 4 unique cards
function resolveTrick(state) {
  if (state.phase !== "playing") return state;
  if (!state.trick || state.trick.length < 1) return state;

  const uniq = new Set(state.trick.map((t) => t.player));
  if (uniq.size < 1) return state;

  const winner = determineTrickWinner(state.trick);
  const winningEntry = state.trick.find((t) => t.player === winner);
  const winningCard = winningEntry?.card || null;

  const books = {
    ...state.books,
    [winner]: (state.books[winner] || 0) + 1,
  };

  // 🔹 did a Jack win this book?
  const jackWon =
    winningCard && getRank(winningCard) === 11; // J = 11 in getRank

  // 🔹 did any Ace get played but *not* win?
  const anyAceInTrick = state.trick.some(
    (t) => getRank(t.card) === 14 // A = 14
  );
  const aceLost =
    anyAceInTrick && (!winningCard || getRank(winningCard) !== 14);

  // 🔹 build an event list for this trick
  const trickEvents = [];
  if (aceLost) trickEvents.push("ACE_KILLER");
  if (jackWon) trickEvents.push("JACK_WIN");

  // 🔹 pick exactly one "chosen" event using priority
  const chosenEvent =
    TRICK_EVENT_PRIORITY.find((ev) => trickEvents.includes(ev)) || null;

  // 🔹 bump an id so the UI knows this is a new trick
  const trickId = (state.lastTrickMeta?.id ?? 0) + 1;

  return {
    ...state,
    books,
    leader: winner,
    turn: winner,
    trick: [],
    timer: 12,
    lastTrickMeta: {
      id: trickId,
      winnerSeat: winner,
      winningCard,
      jackWon,
      aceLost,
      events: trickEvents,
      chosenEvent, // 👈 UI uses this to decide sound/banner
    },
  };
}


// end-of-hand scoring + recap + winner / next dealer
function endHand(state) {
  const seats = SEATS;

  const delta = {
    A: scoreForPlayer(state.bids.A, state.books.A),
    B: scoreForPlayer(state.bids.B, state.books.B),
    C: scoreForPlayer(state.bids.C, state.books.C),
    D: scoreForPlayer(state.bids.D, state.books.D),
  };

  const nextScores = {
    A: state.scores.A + delta.A,
    B: state.scores.B + delta.B,
    C: state.scores.C + delta.C,
    D: state.scores.D + delta.D,
  };

  const rows = seats.map((s) => ({
    seat: s,
    bid: state.bids[s],
    books: state.books[s],
    delta: delta[s],
    totalBefore: state.scores[s],
    totalAfter: nextScores[s],
  }));

  const mostBooks = Math.max(
    state.books.A || 0,
    state.books.B || 0,
    state.books.C || 0,
    state.books.D || 0
  );

  const mostBooksSeats = seats.filter(
    (s) => (state.books[s] || 0) === mostBooks
  );

  const win = seats.find((s) => nextScores[s] >= SCORE_TO_WIN) ?? null;

  if (win) {
    // FINAL HAND: recap + winner, no auto-deal
    const withScores = {
      ...state,
      scores: nextScores,
      handRecap: {
        rows,
        highlight: { mostBooksSeats, mostBooks },
        dealerNext: null,
      },
      winnerSeat: win,
      phase: "gameover",
      nextDealerToDeal: null,
    };

    return appendLog(withScores, {
      type: "END_HAND",
      final: true,
      winnerSeat: win,
    });
  }

  // normal hand end: recap + mark next dealer
  const nextDealer = nextPlayer(state.dealer);
  const withScores = {
    ...state,
    scores: nextScores,
    handRecap: {
      rows,
      highlight: { mostBooksSeats, mostBooks },
      dealerNext: nextDealer,
    },
    nextDealerToDeal: nextDealer,
  };

  return appendLog(withScores, {
    type: "END_HAND",
    final: false,
    nextDealer,
  });
}

// =========================
// Bots (for timer auto actions)
// =========================

function autoBidForSeat(state, seat) {
  if (state.phase !== "bidding") return state;
  if (state.bids[seat] != null) return state;

  const value = Math.floor(Math.random() * 6) + 3; // 3–8
  const next = placeBidInternal(state, seat, value);

  // if nothing changed, just return original
  if (next === state) return state;

  return appendLog(next, {
    type: "BID",
    seat,
    value,
    auto: true,
  });
}

function autoPlayForSeat(state, seat) {
  if (state.phase !== "playing") return state;

  const hand = state.hands[seat] || [];
  if (!hand.length) return state;

  // basic legality check: mirror isValidPlayState logic
  const trick = state.trick || [];
  const leadSuit = trick.length ? getSuit(trick[0].card) : "";

  const legal = hand.filter((card) => {
    // already played?
    if (trick.some((t) => t.player === seat)) return false;

    if (!leadSuit) return true;
    const cardSuit = getSuit(card);
    if (cardSuit === leadSuit) return true;
    return !mustFollowSuit(hand, leadSuit);
  });

  const choice = legal[0] ?? hand[0];
  if (!choice) return state;

  const next = playCardInternal(state, seat, choice.id);
  if (next === state) return state;

  return appendLog(next, {
    type: "PLAY",
    seat,
    cardId: choice.id,
    auto: true,
  });
}

// =========================
// isValidPlayState (for UI)
// =========================

export function isValidPlayState(state, seat, card) {
  if (!state || !card) return false;
  if (state.phase !== "playing") return false;
  if (state.turn !== seat) return false;

  const hand = state.hands?.[seat] || [];
  if (!hand.some((c) => c.id === card.id)) return false;

  // already played in this trick
  if (state.trick.some((t) => t.player === seat)) return false;

  if (!state.trick.length) return true; // lead anything

  const leadSuit = getSuit(state.trick[0].card);
  const cardSuit = getSuit(card);

  if (cardSuit === leadSuit) return true;

  // only allowed to break if you cannot follow suit
  return !mustFollowSuit(hand, leadSuit);
}

// =========================
// Main reducer
// =========================

export function spadesReducer(state, action) {
  switch (action.type) {
    case "DEAL_HAND": {
      return dealHand(state, action.nextDealer ?? null, action.seedU32 ?? null);
    }

    case "START_NEW_GAME": {
      // expect a fresh seed from UI if you want; for now reuse matchSeed
      const base = makeInitialState(action.seedU32 ?? state.matchSeed ?? Date.now());
      // preserve nothing but scores reset
      return dealHand(
        {
          ...base,
          scores: { A: 0, B: 0, C: 0, D: 0 },
        },
        null,
        base.matchSeed
      );
    }

    case "PLACE_BID": {
      const next = placeBidInternal(state, action.seat, action.value);
      if (next === state) return state;

      return appendLog(next, {
        type: "BID",
        seat: action.seat,
        value: action.value,
        auto: false,
      });
    }

    case "PLAY_CARD": {
  const coreNext = playCardInternal(state, action.seat, action.cardId);
  if (coreNext === state) return state;

  // ✅ give the NEXT player a fresh clock after any manual play
  const next = {
    ...coreNext,
    timer: coreNext.phase === "playing" ? 12 : coreNext.timer, // 12s like your TICK logic
  };

  return appendLog(next, {
    type: "PLAY",
    seat: action.seat,
    cardId: action.cardId,
    auto: false,
  });
}


    case "RESOLVE_TRICK": {
      const next = resolveTrick(state);
      if (next === state) return state;

      return appendLog(next, {
        type: "RESOLVE_TRICK",
        leader: next.leader,
      });
    }

    case "END_HAND": {
      return endHand(state);
    }

    case "TICK": {
      if (state.phase === "gameover") return state;
      // freeze while recap is on-screen & nextDealerToDeal is set
      if (state.handRecap && state.nextDealerToDeal) return state;

      if (state.timer > 1) {
        return { ...state, timer: state.timer - 1 };
      }

      // timer just hit 0 => enforce action
      if (state.phase === "bidding") {
        const t = state.turn;
        if (state.bids[t] == null) return autoBidForSeat(state, t);
        // if somehow already bid, just reset timer
        return { ...state, timer: 15 };
      }

      if (state.phase === "playing") {
        const t = state.turn;
        // if this seat hasn't played yet in the current trick, auto-play
        if (!state.trick.some((x) => x.player === t)) {
          const after = autoPlayForSeat(state, t);
          if (after === state) {
            return { ...state, timer: 12 };
          }
          return { ...after, timer: 12 };
        }
        return { ...state, timer: 12 };
      }

      return state;
    }

    default:
      return state;
  }
}
