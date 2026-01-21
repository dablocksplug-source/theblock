// src/games/blockplay/dice/stateViews.js

// What everyone at the table can see
export function getPublicDiceState(state) {
  return {
    players: state.players,
    shooter: state.shooter,
    fader: state.fader,

    dice: state.dice,
    point: state.point,
    phase: state.phase,

    betting: state.betting,
    countdown: state.countdown,
    rollWindow: state.rollWindow,
    rollCountdown: state.rollCountdown,

    // side pots
    mainPot: state.mainPot,
    withShooterPot: state.withShooterPot,
    againstShooterPot: state.againstShooterPot,

    // main stake + posted flags + strikes
    mainStake: state.mainStake,
    shooterMainPosted: state.shooterMainPosted,
    faderMainPosted: state.faderMainPosted,
    shooterStrikes: state.shooterStrikes,
    faderStrikes: state.faderStrikes,
    maxStrikes: state.maxStrikes,

    activity: state.activity,
    shooterStreak: state.shooterStreak,
  };
}

// What a specific seat should see as "my" info
export function getPrivateDiceStateForSeat(state, seatIndex) {
  const players = state.players || [];
  const seatName =
    players[seatIndex] !== undefined ? players[seatIndex] : null;

  return {
    seatIndex,
    seatName,
    isShooter: seatName != null && seatName === state.shooter,
    isFader: seatName != null && seatName === state.fader,

    // sidebet HUD for this player
    lastBet: state.lastBet,
    lastSide: state.lastSide,
    roundTotalBet: state.roundTotalBet,

    // extra info if we ever personalize rules:
    mainStake: state.mainStake,
  };
}
