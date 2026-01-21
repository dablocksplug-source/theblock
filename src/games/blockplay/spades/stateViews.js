// src/games/blockplay/spades/stateViews.js

const SEATS = ["A", "B", "C", "D"];

export function getPublicState(state) {
  // NEVER include full hands in public state for real multiplayer
  const handsCount = SEATS.reduce((acc, s) => {
    acc[s] = state.hands?.[s]?.length ?? 0;
    return acc;
  }, {});

  return {
    phase: state.phase,
    turn: state.turn,
    leader: state.leader,
    dealer: state.dealer,
    timer: state.timer,

    bids: state.bids,
    books: state.books,
    scores: state.scores,
    trick: state.trick,

    winnerSeat: state.winnerSeat,

    // safe counts only
    handsCount,

    // optional: for verifiability / replay
    seed: state.seed,
  };
}

export function getPrivateStateForSeat(state, seat) {
  return {
    seat,
    myHand: state.hands?.[seat] ?? [],
  };
}
