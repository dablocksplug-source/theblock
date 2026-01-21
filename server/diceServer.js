// server/diceServer.js
// Simple in-house multiplayer dice table server (Socket.IO)
// Run:  node server/diceServer.js
// Then connect clients to: http://<HOST_LAN_IP>:4010

import http from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 4010;
const HEARTBEAT_TIMEOUT_MS = 35_000; // kick if no heartbeat
const TICK_MS = 1000;

const seatRing = [
  "Player A",
  "Player B",
  "Player C",
  "Player D",
  "Player E",
  "Player F",
  "Player G",
];

function now() {
  return Date.now();
}

function makeSeatRecord(startingStack) {
  return {
    balance: startingStack,
    withBet: 0,
    againstBet: 0,
    roundTotal: 0,
    lastBet: null,
    lastSide: null, // "shooter" | "fader"
  };
}

// ✅ NEWEST-FIRST activity feed
function appendActivity(state, text) {
  const next = [{ id: now() + Math.random(), text }, ...(state.activity || [])];
  return next.slice(0, 12);
}

/* =========================
   ✅ OCCUPIED-SEAT ROTATION (PATCH)
   - rotate shooter/fader through seated players only
   - avoids landing on empty seats during small-group tests
   ========================= */
function occupiedSeats(table) {
  return Object.keys(table.seatOwners || {});
}

function rotateShooterPairOccupied(table) {
  const occ = occupiedSeats(table);

  // nobody seated → keep defaults
  if (occ.length === 0) {
    return {
      shooter: seatRing[0],
      fader: seatRing[seatRing.length - 1],
      shooterPointStreak: 0,
    };
  }

  // one player seated → keep flow (fader = same seat for UI)
  if (occ.length === 1) {
    return { shooter: occ[0], fader: occ[0], shooterPointStreak: 0 };
  }

  const currentIdx = occ.indexOf(table.shooter);
  const baseIdx = currentIdx >= 0 ? currentIdx : 0;

  const nextShooterIdx = (baseIdx + 1) % occ.length;
  const nextShooter = occ[nextShooterIdx];

  const nextFaderIdx = (nextShooterIdx - 1 + occ.length) % occ.length;
  const nextFader = occ[nextFaderIdx];

  return { shooter: nextShooter, fader: nextFader, shooterPointStreak: 0 };
}

/* =========================
   Round helpers
   ========================= */
function resetRoundBets(state) {
  return {
    ...state,
    withShooterPot: 0,
    againstShooterPot: 0,
  };
}

function settle(state, winnerSide /* "with" | "against" */) {
  const seats = Object.keys(state.ledger);
  const totalWith = seats.reduce((s, k) => s + (state.ledger[k].withBet || 0), 0);
  const totalAgainst = seats.reduce(
    (s, k) => s + (state.ledger[k].againstBet || 0),
    0
  );
  const matched = Math.min(totalWith, totalAgainst);

  state = resetRoundBets(state);

  if (matched <= 0) {
    seats.forEach((k) => {
      const rec = state.ledger[k];
      const w = rec.withBet || 0;
      const a = rec.againstBet || 0;
      rec.balance += w + a;
      rec.withBet = 0;
      rec.againstBet = 0;
      rec.roundTotal = 0;
      rec.lastBet = null;
      rec.lastSide = null;
    });
    return state;
  }

  const winnerIsWith = winnerSide === "with";
  const totalWinner = winnerIsWith ? totalWith : totalAgainst;

  const withUnmatched = Math.max(0, totalWith - matched);
  const againstUnmatched = Math.max(0, totalAgainst - matched);

  const withRefundRate = totalWith > 0 ? withUnmatched / totalWith : 0;
  const againstRefundRate = totalAgainst > 0 ? againstUnmatched / totalAgainst : 0;

  const winnerMatchedRate = totalWinner > 0 ? matched / totalWinner : 0;

  seats.forEach((k) => {
    const rec = state.ledger[k];
    const w = rec.withBet || 0;
    const a = rec.againstBet || 0;

    const refund =
      (w > 0 ? w * withRefundRate : 0) + (a > 0 ? a * againstRefundRate : 0);

    let payout = 0;
    if (winnerIsWith && w > 0) payout = w * winnerMatchedRate * 2;
    if (!winnerIsWith && a > 0) payout = a * winnerMatchedRate * 2;

    rec.balance += refund + payout;
    rec.withBet = 0;
    rec.againstBet = 0;

    rec.roundTotal = 0;
    rec.lastBet = null;
    rec.lastSide = null;
  });

  return state;
}

function createTable(tableId, minBet = 1) {
  const startingStack = minBet * 200;

  const state = {
    tableId,
    players: [...seatRing],
    shooter: seatRing[0],
    fader: seatRing[seatRing.length - 1],

    point: null,
    dice: [1, 1],
    rolling: false,

    message: "Claim a seat, then place bets for the first come-out roll.",
    banner: null,

    withShooterPot: 0,
    againstShooterPot: 0,

    betting: true,
    countdown: 15,
    rollWindow: false,
    rollCountdown: 5,

    activity: [],
    shooterStreak: 0,
    shooterPointStreak: 0,

    seatOwners: {}, // seat -> socketId
    lastSeenBySocket: {}, // socketId -> ms

    ledger: Object.fromEntries(
      seatRing.map((s) => [s, makeSeatRecord(startingStack)])
    ),
  };

  return state;
}

const tables = new Map();

function getTable(tableId, minBet = 1) {
  if (!tables.has(tableId)) tables.set(tableId, createTable(tableId, minBet));
  return tables.get(tableId);
}

function sanitize(table) {
  const taken = {};
  for (const seat of table.players) taken[seat] = Boolean(table.seatOwners[seat]);

  return {
    tableId: table.tableId,
    players: table.players,
    shooter: table.shooter,
    fader: table.fader,
    point: table.point,
    dice: table.dice,
    rolling: table.rolling,
    message: table.message,
    banner: table.banner,
    withShooterPot: table.withShooterPot,
    againstShooterPot: table.againstShooterPot,
    betting: table.betting,
    countdown: table.countdown,
    rollWindow: table.rollWindow,
    rollCountdown: table.rollCountdown,
    activity: table.activity,
    shooterStreak: table.shooterStreak,
    shooterPointStreak: table.shooterPointStreak,
    seatTaken: taken,
    ledger: table.ledger,
  };
}

function broadcast(io, table) {
  io.to(table.tableId).emit("table:state", sanitize(table));
}

// ✅ Extracted roll logic so we can call it from auto-roll too
function performRoll(io, tableId, table) {
  if (!table) return;

  table.rolling = true;
  broadcast(io, table);

  const r1 = Math.floor(Math.random() * 6) + 1;
  const r2 = Math.floor(Math.random() * 6) + 1;
  const total = r1 + r2;

  setTimeout(() => {
    table.dice = [r1, r2];
    table.rolling = false;

    // helper: set winner banner clean
    const setWinner = (side /* "with" | "against" */, detailText) => {
      const isWith = side === "with";
      table.banner = {
        text: isWith ? "BACK WINS" : "FADE WINS",
        type: isWith ? "with" : "against",
      };
      table.message = detailText;
      table = settle(table, side);
      tables.set(tableId, table);
      return table;
    };

    // resolve game rules
    if (!table.point) {
      if (total === 7 || total === 11) {
        table.activity = appendActivity(table, `Natural ${total} — shooter wins`);
        table.shooterStreak += 1;
        table = setWinner("with", `Natural ${total}! Shooter ${table.shooter} wins.`);
      } else if ([2, 3, 12].includes(total)) {
        table.activity = appendActivity(table, `Craps ${total} — shooter loses`);
        table.shooterStreak = 0;
        table = setWinner("against", `Craps ${total}! Shooter loses, new come-out.`);
      } else {
        table.point = total;
        table.banner = { text: `POINT ${total}`, type: "point" };
        table.message = `Point is now ${total}. Shooter continues.`;
        table.shooterStreak += 1;
        table.activity = appendActivity(table, `Point set at ${total}`);
      }
    } else {
      if (total === table.point) {
        const p = table.point;
        table.point = null;
        table.activity = appendActivity(table, `Point ${p} hit — shooter wins`);
        table.shooterStreak += 1;
        table = setWinner("with", `Shooter hits point ${p}! New come-out.`);
      } else if (total === 7) {
        table.point = null;
        table.activity = appendActivity(table, "Seven-out — shooter loses");
        table.shooterStreak = 0;

        table = setWinner("against", "Seven-out! Passing dice.");

        // ✅ PATCH: rotate among occupied seats (not all 7)
        Object.assign(table, rotateShooterPairOccupied(table));

        table.activity = appendActivity(
          table,
          `Dice pass to ${table.shooter} (fader: ${table.fader}).`
        );
        tables.set(tableId, table);
      } else {
        table.message = `Rolled ${total}. No decision.`;
        table.activity = appendActivity(table, `Roll ${total} — no decision`);
      }
    }

    // reopen betting window
    table.betting = true;
    table.countdown = 15;
    table.rollWindow = false;
    table.rollCountdown = 5;

    const savedBanner = table.banner;
    broadcast(io, table);

    // clear banner after a moment (longer so it feels like a “win”)
    setTimeout(() => {
      const t = tables.get(tableId);
      if (!t) return;
      if (t.banner === savedBanner) {
        t.banner = null;
        broadcast(io, t);
      }
    }, 2500);
  }, 450);
}

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  socket.on("table:join", ({ tableId, minBet }) => {
    const table = getTable(tableId, minBet ?? 1);
    socket.join(tableId);
    table.lastSeenBySocket[socket.id] = now();
    socket.emit("table:state", sanitize(table));
  });

  socket.on("table:heartbeat", ({ tableId }) => {
    const table = tables.get(tableId);
    if (!table) return;
    table.lastSeenBySocket[socket.id] = now();
  });

  socket.on("seat:claim", ({ tableId, seat }) => {
    const table = tables.get(tableId);
    if (!table) return;

    if (table.seatOwners[seat] && table.seatOwners[seat] !== socket.id) {
      socket.emit("seat:denied", { seat });
      return;
    }

    for (const s of Object.keys(table.seatOwners)) {
      if (table.seatOwners[s] === socket.id && s !== seat) delete table.seatOwners[s];
    }

    table.seatOwners[seat] = socket.id;
    table.activity = appendActivity(table, `${seat} joined the table.`);

    // Optional: if shooter/fader are empty and we now have occupants, snap them to occupied
    // (keeps the first live seat from waiting on Player A if nobody claimed it)
    const occ = occupiedSeats(table);
    if (occ.length > 0) {
      // If shooter seat isn't owned, rotate to occupied set
      if (!table.seatOwners[table.shooter]) {
        Object.assign(table, rotateShooterPairOccupied(table));
        table.activity = appendActivity(
          table,
          `Dice align to seated players — shooter: ${table.shooter}, fader: ${table.fader}.`
        );
      }
    }

    broadcast(io, table);
  });

  socket.on("seat:release", ({ tableId }) => {
    const table = tables.get(tableId);
    if (!table) return;

    for (const s of Object.keys(table.seatOwners)) {
      if (table.seatOwners[s] === socket.id) {
        delete table.seatOwners[s];
        table.activity = appendActivity(table, `${s} left the table.`);
      }
    }

    // If shooter got released, rotate to another occupied seat
    if (!table.seatOwners[table.shooter]) {
      const prevShooter = table.shooter;
      Object.assign(table, rotateShooterPairOccupied(table));
      if (table.shooter !== prevShooter) {
        table.activity = appendActivity(
          table,
          `Shooter left — dice pass to ${table.shooter} (fader: ${table.fader}).`
        );
      }
    }

    broadcast(io, table);
  });

  socket.on("bet:place", ({ tableId, seat, amount, side }) => {
    const table = tables.get(tableId);
    if (!table) return;

    if (table.seatOwners[seat] !== socket.id) return;
    if (!table.betting) return;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;

    const isShooter = table.shooter === seat;
    const isFader = table.fader === seat;

    // If only one player seated, shooter===fader, prevent “fade” for same seat
    if (table.shooter === table.fader && side === "fader") return;

    if (isShooter && side === "fader") return;
    if (isFader && side === "shooter") return;

    const rec = table.ledger[seat];
    if (!rec || rec.balance < amt) return;

    rec.balance -= amt;
    if (side === "shooter") rec.withBet += amt;
    else rec.againstBet += amt;

    rec.roundTotal += amt;
    rec.lastBet = amt;
    rec.lastSide = side;

    if (side === "shooter") table.withShooterPot += amt;
    else table.againstShooterPot += amt;

    table.activity = appendActivity(
      table,
      `${seat} bet ${amt} ${side === "shooter" ? "BACK" : "FADE"}`
    );

    broadcast(io, table);
  });

  socket.on("roll:request", ({ tableId, seat }) => {
    const table = tables.get(tableId);
    if (!table) return;

    if (table.shooter !== seat) return;
    if (table.seatOwners[seat] !== socket.id) return;

    if (table.rolling) return;
    if (table.betting) return;
    if (!table.rollWindow) return;

    // close roll window immediately so double-clicks don’t re-enter
    table.rollWindow = false;
    table.rollCountdown = 0;

    performRoll(io, tableId, table);
  });

  socket.on("disconnect", () => {
    // cleanup happens via heartbeat timeout
  });
});

// Global tick: handle countdowns + inactivity kicks + ✅ auto-roll
setInterval(() => {
  for (const table of tables.values()) {
    // countdowns
    if (table.betting) {
      table.countdown = Math.max(0, table.countdown - 1);
      if (table.countdown === 0) {
        table.betting = false;
        table.rollWindow = true;
        table.rollCountdown = 5;
      }
    } else if (table.rollWindow) {
      table.rollCountdown = Math.max(0, table.rollCountdown - 1);

      if (table.rollCountdown === 0) {
        // ✅ AUTO-ROLL: only if shooter seat is actually occupied
        const shooterSeat = table.shooter;
        const shooterOwned = Boolean(table.seatOwners[shooterSeat]);

        table.rollWindow = false;

        if (!table.rolling && shooterOwned) {
          performRoll(io, table.tableId, table);
        } else {
          // ✅ PATCH: shooter missing → rotate to next occupied seat so table keeps flowing
          const prevShooter = table.shooter;
          Object.assign(table, rotateShooterPairOccupied(table));

          if (table.shooter !== prevShooter && table.seatOwners[table.shooter]) {
            table.activity = appendActivity(
              table,
              `Shooter absent — dice pass to ${table.shooter} (fader: ${table.fader}).`
            );
          }

          // reopen betting so table doesn’t stall
          table.betting = true;
          table.countdown = 15;
          table.rollWindow = false;
          table.rollCountdown = 5;
        }
      }
    }

    // inactivity kicks
    const cutoff = now() - HEARTBEAT_TIMEOUT_MS;
    for (const [sockId, lastSeen] of Object.entries(table.lastSeenBySocket)) {
      if (lastSeen < cutoff) {
        for (const s of Object.keys(table.seatOwners)) {
          if (table.seatOwners[s] === sockId) {
            delete table.seatOwners[s];
            table.activity = appendActivity(table, `${s} removed for inactivity.`);

            // ✅ PATCH: if shooter got removed, rotate among occupied seats
            if (table.shooter === s) {
              Object.assign(table, rotateShooterPairOccupied(table));
              table.activity = appendActivity(
                table,
                `Dice pass to ${table.shooter} (fader: ${table.fader}).`
              );
            }
          }
        }
        delete table.lastSeenBySocket[sockId];
      }
    }

    io.to(table.tableId).emit("table:state", sanitize(table));
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`✅ Dice server running on port ${PORT}`);
});
