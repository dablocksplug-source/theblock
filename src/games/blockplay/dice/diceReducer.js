// src/games/blockplay/dice/diceReducer.js

// Build the initial dice game state from a players array
export function createInitialDiceState(players) {
  // fallback if someone passes null/empty
  const safePlayers =
    Array.isArray(players) && players.length > 0
      ? players
      : [
          "Player A",
          "Player B",
          "Player C",
          "Player D",
          "Player E",
          "Player F",
          "Player G",
        ];

  const shooter = safePlayers[0];
  const fader = safePlayers[safePlayers.length - 1];

  return {
    // seat / identity
    players: safePlayers,
    shooter,
    fader,
    localSeat: safePlayers[0],

    // core dice state
    dice: [1, 1],
    point: null,
    rolling: false,

    // phase (optional)
    phase: "BETTING",

    // table messaging + banner
    message: "Place your bets for the first come-out roll.",
    banner: null, // { text, type } | null

    // betting UI
    selectedSide: "shooter", // "shooter" | "fader"
    betAmount: "",
    lastBet: null,
    lastSide: null,
    roundTotalBet: 0,

    // table totals (P2P)
    withShooterPot: 0,
    againstShooterPot: 0,

    // timers
    betting: true,
    countdown: 15,
    rollWindow: false,
    rollCountdown: 5,

    // table activity + streaks
    activity: [],
    shooterStreak: 0,
    shooterPointStreak: 0,
  };
}

// helper: append activity, keep newest at bottom, max 10 lines
function appendActivity(state, text) {
  const next = [
    ...(state.activity || []),
    { id: Date.now() + Math.random(), text },
  ];
  return next.slice(-10);
}

// rotate shooter clockwise, fader is seat just behind shooter
function rotateShooterPair(state) {
  const { players, shooter } = state;
  const currentIdx = players.indexOf(shooter);
  const nextShooterIdx = (currentIdx + 1) % players.length;
  const nextShooter = players[nextShooterIdx];
  const nextFaderIdx = (nextShooterIdx - 1 + players.length) % players.length;
  const nextFader = players[nextFaderIdx];

  return {
    shooter: nextShooter,
    fader: nextFader,
    shooterPointStreak: 0,
  };
}

function resetRoundBets(state) {
  return {
    ...state,
    withShooterPot: 0,
    againstShooterPot: 0,
    roundTotalBet: 0,
    lastBet: null,
    lastSide: null,
    betAmount: "",
  };
}

export function diceReducer(state, action) {
  switch (action.type) {
    case "UPDATE":
      return { ...state, ...action.payload };

    case "SET_LOCAL_SEAT":
      return { ...state, localSeat: action.seat };

    case "ADD_ACTIVITY":
      return { ...state, activity: appendActivity(state, action.text) };

    case "OPEN_BETTING": {
      const seconds = action.seconds ?? 15;
      return {
        ...state,
        betting: true,
        countdown: seconds,
        rollWindow: false,
        rollCountdown: 5,
        phase: "BETTING",
        message: "Place your side bets. Shooter is coming out.",
      };
    }

    case "TICK_BETTING":
      return { ...state, countdown: Math.max(0, state.countdown - 1) };

    case "OPEN_ROLL_WINDOW": {
      const seconds = action.seconds ?? 5;
      return {
        ...state,
        betting: false,
        rollWindow: true,
        rollCountdown: seconds,
        phase: "ROLLING",
        message: "Locking in bets – shooter getting ready to roll.",
      };
    }

    case "TICK_ROLL_WINDOW":
      return { ...state, rollCountdown: Math.max(0, state.rollCountdown - 1) };

    case "RESET_ROUND_BETS":
      return resetRoundBets(state);

    case "ROTATE_SHOOTER": {
      const pair = rotateShooterPair(state);
      const activity = appendActivity(
        state,
        `Dice pass to ${pair.shooter} (fader: ${pair.fader}).`
      );
      return { ...state, ...pair, activity };
    }

    case "SET_SELECTED_SIDE":
      return { ...state, selectedSide: action.side }; // "shooter" | "fader"

    case "APPLY_BET": {
      const { amount, side } = action.payload;
      const isBack = side === "shooter"; // back shooter
      return {
        ...state,
        withShooterPot: isBack ? state.withShooterPot + amount : state.withShooterPot,
        againstShooterPot: !isBack ? state.againstShooterPot + amount : state.againstShooterPot,
        roundTotalBet: state.roundTotalBet + amount,
        lastBet: amount,
        lastSide: side,
      };
    }

    default:
      return state;
  }
}
