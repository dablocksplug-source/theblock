// src/pages/blockplay/spades/SpadesTable.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
  useCallback,
  useLayoutEffect,
} from "react";
import { useParams } from "react-router-dom";
import "../../../styles/spades.css";
import Card from "../../../components/cards/Card";

import {
  spadesReducer,
  makeInitialState,
  isValidPlayState,
} from "../../../games/blockplay/spades/spadesReducer.js";
import {
  getPublicState,
  getPrivateStateForSeat,
} from "../../../games/blockplay/spades/stateViews.js";

// nickname + wallet hooks
import { useNickname, getDisplayName } from "../../../context/NicknameContext";
import { useWallet } from "../../../context/WalletContext";
// sound toggle (same context used by dice)
import { useSound } from "../../../context/SoundContext";

// Preload-able sound list
const preloadSounds = [
  "cardslap.m4a",
  "jackwin.m4a",
  "acekiller.m4a",
  "playerset.m4a",
  "cut.m4a",
  "spadesambience.m4a",
];

/** Table metadata – mirrors the lobby */
const SPADE_TABLES = [
  { id: 1, name: "Magnolia", min: 3 },
  { id: 2, name: "Bayou", min: 3 },
  { id: 3, name: "Cypress", min: 3 },
  { id: 4, name: "Pelican", min: 3 },
  { id: 5, name: "Bourbon", min: 3 },
  { id: 6, name: "Parish", min: 3 },
  { id: 7, name: "Riverwalk", min: 3 },
  { id: 8, name: "Gator", min: 5 },
  { id: 9, name: "Mardi Gras", min: 5 },
  { id: 10, name: "Roulette", min: 5 },
  { id: 11, name: "Creole", min: 10 },
  { id: 12, name: "Voodoo", min: 20 },
];

/** Seat arc configs (arc shape only) */
const HAND_CFG = {
  C: {
    radius: 360,
    startAngle: 160,
    endAngle: 20,
    pivotX: 0,
    pivotY: 0,
    size: "sm",
    dir: 1,
  },
  B: {
    radius: 360,
    startAngle: 140,
    endAngle: 40,
    pivotX: -210,
    pivotY: 0,
    size: "sm",
    dir: 1,
  },
  D: {
    radius: 360,
    startAngle: 140,
    endAngle: 40,
    pivotX: 210,
    pivotY: 0,
    size: "sm",
    dir: 1,
  },
  A: {
    radius: 460,
    startAngle: 210,
    endAngle: 330,
    pivotX: 0,
    pivotY: 0,
    size: "md",
    dir: 1,
  },
};

const SEAT_ANCHORS = {
  A: { x: 0.5, y: 0.9 },
  B: { x: 0.2, y: 0.08 },
  C: { x: 0.5, y: -0.03 },
  D: { x: 0.82, y: 0.1 },
};

const SEAT_OFFSET = {
  A: { x: 0, y: 180 },
  B: { x: -40, y: -5 },
  C: { x: 0, y: -10 },
  D: { x: 40, y: 10 },
};

const HAND_AIM = { A: 15, C: -25, B: -58, D: 25 };

const TABLE_CENTER = { x: 0.5, y: 0.5 };
const EDGE_PUSH = 150;

// NOTE: A is "Unknown" because scorecard A will be overridden with nickname/wallet
const PLAYER_NAMES = {
  A: "Unknown",
  B: "Player B",
  C: "Player C",
  D: "Player D",
};
const SEATS = ["A", "B", "C", "D"];
const FELT_W = 1700;
const FELT_H = 900;

/* ===== helpers ===== */

function edgePullPx(anchorXNorm, anchorYNorm) {
  const vx = anchorXNorm - TABLE_CENTER.x;
  const vy = anchorYNorm - TABLE_CENTER.y;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  return { x: ux * EDGE_PUSH, y: uy * EDGE_PUSH };
}

function nextPlayer(p) {
  if (p === "A") return "B";
  if (p === "B") return "C";
  if (p === "C") return "D";
  return "A";
}

function getSuit(card) {
  if (!card) return "";
  const suit = card.value.slice(-1);
  if (suit === "♠") return "S";
  if (suit === "♥") return "H";
  if (suit === "♦") return "D";
  if (suit === "♣") return "C";
  return "";
}

function seatFacingRotation(seat) {
  return seat === "A" ? 0 : 180;
}

/* For bottom-hand reorder view */
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER = {
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

function getRankValueFromCard(card) {
  if (!card || !card.value) return 0;
  const v = card.value.slice(0, -1);
  return RANK_ORDER[v] ?? 0;
}

/* =========================
   Main Component
   ========================= */

export default function SpadesTable() {
  // which lobby table are we on?
  const { tableId } = useParams();
  const numericId = Number(tableId) || 0;

  const tableMeta =
    SPADE_TABLES.find((t) => t.id === numericId) ||
    { id: 0, name: "Dev Table", min: 0 };

  const matchDisplayId = `SPADES – ${tableMeta.name.toUpperCase()}`;
  const stakeBdagDisplay =
    tableMeta.min > 0 ? `$${tableMeta.min} (play)` : "No stake (dev)";
  const headerLabel = `${matchDisplayId} ${stakeBdagDisplay}`;
  const tableTypeDisplay = `${tableMeta.name} • 4-Player Cutthroat`;

  const [state, dispatch] = useReducer(
    spadesReducer,
    undefined,
    () => makeInitialState()
  );

  // nickname + wallet
  const { walletAddress } = useWallet();
  const nicknameCtx = useNickname();
  const displayNameA = getDisplayName({
    walletAddress,
    nickname: nicknameCtx.nickname,
    useNickname: nicknameCtx.useNickname,
  });

  // 🔹 helper: always resolve a seat to the correct display label
  const seatLabel = useCallback(
    (seat) => (seat === "A" ? displayNameA : PLAYER_NAMES[seat]),
    [displayNameA]
  );

  // sound context
  const { soundEnabled } = useSound();

  // rules + reorder UI
  const [showRules, setShowRules] = useState(false);
  const [sortedView, setSortedView] = useState(false);

  // ====== SHARED AUDIO CACHE ======
  const audioCacheRef = useRef({});

  useEffect(() => {
    const cache = {};
    preloadSounds.forEach((file) => {
      const audio = new Audio(`/sounds/${file}`);
      audio.preload = "auto";
      cache[file] = audio;
    });
    audioCacheRef.current = cache;
  }, []);

  const playSound = useCallback(
    (file, volume = 0.9) => {
      if (!soundEnabled || !file) return;
      const cache = audioCacheRef.current || {};
      let audio = cache[file];

      if (!audio) {
        const created = new Audio(`/sounds/${file}`);
        created.preload = "auto";
        cache[file] = created;
        audioCacheRef.current = cache;
        audio = created;
      }

      try {
        audio.pause();
        audio.currentTime = 0.5;
      } catch {}
      audio.volume = volume;
      audio.play().catch(() => {});
    },
    [soundEnabled]
  );

  // ambience loop
  const ambienceRef = useRef(null);
  useEffect(() => {
    if (!ambienceRef.current) {
      const audio = new Audio("/sounds/spadesambience.m4a");
      audio.loop = true;
      audio.volume = 0.25;
      ambienceRef.current = audio;
    }

    if (soundEnabled) {
      ambienceRef.current.play().catch(() => {});
    } else if (ambienceRef.current) {
      ambienceRef.current.pause();
    }

    return () => {
      if (ambienceRef.current) {
        ambienceRef.current.pause();
        ambienceRef.current.currentTime = 0;
      }
    };
  }, [soundEnabled]);

  // Deal a hand whenever table changes (or on first mount)
  useEffect(() => {
    dispatch({ type: "DEAL_HAND" });
  }, [numericId]);

  // scale + refs
  const [scale, setScale] = useState(1);
  const tableRef = useRef(null);
  const feltRef = useRef(null);
  const trickZoneRef = useRef(null);

  // drag + selection UI
  const [dragging, setDragging] = useState(null);
  const dragPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);

  const [selectedId, setSelectedId] = useState(null);

  // deal animation state: first frame after a new deal
  const [dealStarting, setDealStarting] = useState(false);

  // book winner UX
  const [bookToast, setBookToast] = useState(null);
  const [winningCardId, setWinningCardId] = useState(null);

  // resolve trick delay guard
  const resolvingRef = useRef(false);

  // active UI link (glow + scorecard row)
  const activeSeat = state.phase === "gameover" ? null : state.turn;
  const dimOthers = activeSeat != null;

  // lead suit indicator
  const leadSuit = state.trick.length > 0 ? getSuit(state.trick[0].card) : null;
  const leadSuitPretty =
    leadSuit === "S"
      ? "♠ Spades"
      : leadSuit === "H"
      ? "♥ Hearts"
      : leadSuit === "D"
      ? "♦ Diamonds"
      : leadSuit === "C"
      ? "♣ Clubs"
      : null;

  let leadSuitClass = "";
  if (leadSuit === "S") leadSuitClass = "lead-suit-spades";
  else if (leadSuit === "H") leadSuitClass = "lead-suit-hearts";
  else if (leadSuit === "D") leadSuitClass = "lead-suit-diamonds";
  else if (leadSuit === "C") leadSuitClass = "lead-suit-clubs";

  // trick progress
  const tricksPlayed =
    (state.books.A || 0) +
    (state.books.B || 0) +
    (state.books.C || 0) +
    (state.books.D || 0);
  const currentTrickNumber =
    tricksPlayed + (state.trick.length > 0 ? 1 : 0);
  const trickLabel =
    currentTrickNumber === 0
      ? "No tricks yet · 13 total"
      : `Trick ${currentTrickNumber} of 13`;

  // fresh-deal flag: used to animate cards when a new hand is just dealt
  const isFreshDeal =
    state.phase === "bidding" &&
    state.trick.length === 0 &&
    (state.books.A || 0) === 0 &&
    (state.books.B || 0) === 0 &&
    (state.books.C || 0) === 0 &&
    (state.books.D || 0) === 0;

  // timer “heat” for toast
  const timerLevel =
    state.timer <= 3 ? "danger" : state.timer <= 7 ? "warn" : "normal";

  // bottom-hand reorder view
  const bottomHandRaw = state.hands?.A || [];
  const displayedBottomHand = useMemo(() => {
    if (!sortedView) return bottomHandRaw;

    // sort by suit (S, H, D, C), then rank high → low
    return [...bottomHandRaw].sort((a, b) => {
      const sa = getSuit(a);
      const sb = getSuit(b);
      if (sa !== sb) {
        return (SUIT_ORDER[sa] ?? 99) - (SUIT_ORDER[sb] ?? 99);
      }
      const ra = getRankValueFromCard(a);
      const rb = getRankValueFromCard(b);
      return rb - ra;
    });
  }, [bottomHandRaw, sortedView]);

  // selection helpers
  const selectedCard = useMemo(() => {
    if (selectedId == null) return null;
    return bottomHandRaw.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, bottomHandRaw]);

  function tryPlaySelected() {
    if (state.phase !== "playing") return;
    if (state.turn !== "A") return;
    if (selectedId == null) return;

    // instant slap for your play via button / click in trick box
    playSound("cardslap.m4a", 0.8);

    dispatch({ type: "PLAY_CARD", seat: "A", cardId: selectedId });
    setSelectedId(null);
  }

  // clear selection when not your turn
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== "A") setSelectedId(null);
  }, [state.phase, state.turn]);

  // responsive scale
  useEffect(() => {
    function handleResize() {
      const baseWidth = 1700;
      const baseHeight = 900;
      const padding = 40;
      const navHeight = 120;

      const availableWidth = window.innerWidth - padding;
      const availableHeight = window.innerHeight - navHeight;

      const s = Math.min(
        availableWidth / baseWidth,
        availableHeight / baseHeight,
        1
      );
      setScale(s);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // timer enforcement
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, []);

  // deal animation trigger: put cards in "down" pose, then let them fly in
  useEffect(() => {
    if (!state.dealStamp) return;

    // first render after deal → cards start lowered & invisible
    setDealStarting(true);

    // next animation frame → flip to final pose, CSS transitions handle the rest
    const id = requestAnimationFrame(() => {
      setDealStarting(false);
    });

    return () => cancelAnimationFrame(id);
  }, [state.dealStamp]);

  // ====== SOUND HOOKS ======

  // card slap + cut call when a new card hits the trick
  const prevTrickLenRef = useRef(state.trick.length);

  useLayoutEffect(() => {
    const prevLen = prevTrickLenRef.current;
    const currLen = state.trick.length;

    if (!soundEnabled) {
      prevTrickLenRef.current = currLen;
      return;
    }

    // only care when a new card appears in the trick
    if (currLen > prevLen) {
      const lastPlay = state.trick[state.trick.length - 1];
      const firstPlay = state.trick[0];

      if (lastPlay && firstPlay) {
        const leadSuitLocal = getSuit(firstPlay.card);
        const lastSuit = getSuit(lastPlay.card);

        // 💥 always slap when ANY non-A seat plays into the trick
        if (lastPlay.player !== "A") {
          playSound("cardslap.m4a", 0.8);
        }

        // ✂ CUT: spade played into a non-spade lead, not on the very first card
        const isCut =
          currLen > 1 &&
          leadSuitLocal !== "S" &&
          lastSuit === "S";

        if (isCut) {
          // slight offset so it rides on top of the slap instead of masking it
          setTimeout(() => {
            playSound("cut.m4a", 0.95);
          }, 120);
        }
      }
    }

    prevTrickLenRef.current = currLen;
  }, [state.trick, soundEnabled, playSound]);

  // jack win / ace killer from lastTrickMeta (with priority chosenEvent)
  const lastTrickMetaIdRef = useRef(0);
  useEffect(() => {
    const meta = state.lastTrickMeta;
    if (!meta || meta.id === lastTrickMetaIdRef.current) return;

    if (soundEnabled && meta.chosenEvent) {
      switch (meta.chosenEvent) {
        case "ACE_KILLER":
          playSound("acekiller.m4a", 0.95);
          break;
        case "JACK_WIN":
          playSound("jackwin.m4a", 0.95);
          break;
        default:
          break;
      }
    }

    lastTrickMetaIdRef.current = meta.id;
  }, [state.lastTrickMeta, playSound, soundEnabled]);

  // player set: after hand recap shows, small delay
  const lastRecapRef = useRef(null);
  const playerSetTimeoutRef = useRef(null);
  useEffect(() => {
    const recap = state.handRecap;
    if (!recap || recap === lastRecapRef.current) return;

    if (playerSetTimeoutRef.current) {
      clearTimeout(playerSetTimeoutRef.current);
      playerSetTimeoutRef.current = null;
    }

    if (soundEnabled) {
      const rows = recap.rows || [];
      const anySet = rows.some(
        (r) => r.bid != null && r.books < r.bid
      );
      if (anySet) {
        // speak this slightly *into* the recap
        playerSetTimeoutRef.current = setTimeout(() => {
          playSound("playerset.m4a", 0.95);
        }, 1500);
      }
    }

    lastRecapRef.current = recap;

    return () => {
      if (playerSetTimeoutRef.current) {
        clearTimeout(playerSetTimeoutRef.current);
        playerSetTimeoutRef.current = null;
      }
    };
  }, [state.handRecap, playSound, soundEnabled]);

  // ===========================

  // resolve trick with winner glow + book toast
  useEffect(() => {
    if (state.phase !== "playing") return;
    if (resolvingRef.current) return;

    const trick = state.trick || [];
    if (trick.length < 4) {
      // fewer than 4 cards: no winner yet
      setWinningCardId(null);
      return;
    }

    const uniq = new Set(trick.map((t) => t.player));
    if (uniq.size !== 4) return;

    // --- compute winner from current trick snapshot ---
    const leadSuitLocal = getSuit(trick[0].card);
    const spades = trick.filter((t) => getSuit(t.card) === "S");

    let winnerEntry;
    if (spades.length) {
      // highest spade wins
      winnerEntry = spades.reduce((best, cur) =>
        getRankValueFromCard(cur.card) > getRankValueFromCard(best.card)
          ? cur
          : best
      );
    } else {
      // otherwise highest of lead suit
      const leads = trick.filter((t) => getSuit(t.card) === leadSuitLocal);
      winnerEntry = leads.reduce((best, cur) =>
        getRankValueFromCard(cur.card) > getRankValueFromCard(best.card)
          ? cur
          : best
      );
    }

    const winnerSeatLocal = winnerEntry ? winnerEntry.player : null;

const winnerCardIdLocal = (
  winnerEntry && winnerEntry.card ? winnerEntry.card.id : null
);

if (winnerCardIdLocal != null) {
  setWinningCardId(winnerCardIdLocal);
}

if (winnerSeatLocal) {
  const seatName =
    winnerSeatLocal === "A" ? displayNameA : PLAYER_NAMES[winnerSeatLocal];

  setBookToast(
    winnerSeatLocal === "A"
      ? "You took the book."
      : `${seatName} took the book.`
  );
}


    resolvingRef.current = true;
    const id = setTimeout(() => {
      dispatch({ type: "RESOLVE_TRICK" });
      resolvingRef.current = false;
      setWinningCardId(null);
    }, 1500); // same delay, but now with glow + toast during it

    return () => clearTimeout(id);
  }, [state.phase, state.trick, displayNameA]);

  // auto-hide book toast after a moment
  useEffect(() => {
    if (!bookToast) return;
    const id = setTimeout(() => setBookToast(null), 2500);
    return () => clearTimeout(id);
  }, [bookToast]);

  // End-of-hand detection
  useEffect(() => {
    if (state.phase !== "playing") return;
    if (resolvingRef.current) return;
    if (state.trick.length !== 0) return;

    const totalLeft =
      (state.hands.A?.length || 0) +
      (state.hands.B?.length || 0) +
      (state.hands.C?.length || 0) +
      (state.hands.D?.length || 0);

    if (totalLeft === 0) {
      dispatch({ type: "END_HAND" });
    }
  }, [state.phase, state.trick.length, state.hands]);

  // schedule next deal after recap – extended duration
  useEffect(() => {
    if (!state.nextDealerToDeal) return;
    if (!state.handRecap) return;
    if (state.phase === "gameover") return;

    const id = setTimeout(() => {
      dispatch({ type: "DEAL_HAND", nextDealer: state.nextDealerToDeal });
    }, 7000); // recap stays up a few seconds longer

    return () => clearTimeout(id);
  }, [state.nextDealerToDeal, state.handRecap, state.phase]);

  /* ===== FELT coords ===== */
  function clientToFelt(clientX, clientY) {
    const feltEl = feltRef.current;
    if (!feltEl) return { x: 0, y: 0 };
    const r = feltEl.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  function isPointInTrickZone(feltX, feltY) {
    const feltEl = feltRef.current;
    const zoneEl = trickZoneRef.current;
    if (!feltEl || !zoneEl) return false;

    const fr = feltEl.getBoundingClientRect();
    const zr = zoneEl.getBoundingClientRect();

    const left = (zr.left - fr.left) / scale;
    const right = (zr.right - fr.left) / scale;
    const top = (zr.top - fr.top) / scale;
    const bottom = (zr.bottom - fr.top) / scale;

    return (
      feltX >= left && feltX <= right && feltY >= top && feltY <= bottom
    );
  }

  /* ===== reorder helpers ===== */
  function computeSeatPositions(seat, cards) {
    const cfg = HAND_CFG?.[seat];
    if (!cfg || !cards?.length) return [];

    const base = SEAT_ANCHORS[seat] || { x: 0.5, y: 0.5 };
    const off = SEAT_OFFSET?.[seat] || { x: 0, y: 0 };

    let anchorX = base.x * FELT_W + (cfg.pivotX || 0) + off.x;
    let anchorY = base.y * FELT_H + (cfg.pivotY || 0) + off.y;

    const pull = edgePullPx(base.x, base.y);
    anchorX += pull.x;
    anchorY += pull.y;

    const count = cards.length;
    const TIGHT = seat === "A" ? 0.75 : 0.6;
    const step =
      count > 1 ? ((cfg.endAngle - cfg.startAngle) / (count - 1)) * TIGHT : 0;

    const aimDeg = HAND_AIM?.[seat] ?? 0;
    const aimRad = (aimDeg * Math.PI) / 180;

    return cards.map((card, i) => {
      const angleDeg = cfg.startAngle + step * i * (cfg.dir ?? 1);
      const angleRad = (angleDeg * Math.PI) / 180;

      const x = anchorX + Math.cos(angleRad) * cfg.radius;
      const y = anchorY + Math.sin(angleRad) * cfg.radius;

      const dx = x - anchorX;
      const dy = y - anchorY;

      const rx = anchorX + (dx * Math.cos(aimRad) - dy * Math.sin(aimRad));
      const ry = anchorY + (dx * Math.sin(aimRad) + dy * Math.cos(aimRad));

      return { id: card.id, rx, ry };
    });
  }

  function reorderBottomHand(draggedId, dropFeltX) {
    const hand = bottomHandRaw;
    if (!hand.length) return;

    const dragged = hand.find((c) => c.id === draggedId);
    if (!dragged) return;

    const remaining = hand.filter((c) => c.id !== draggedId);

    const pos = computeSeatPositions("A", remaining);
    const sorted = remaining.map((c) => {
      const p = pos.find((pp) => pp.id === c.id);
      return { card: c, x: p ? p.rx : 0 };
    });

    let insertAt = sorted.findIndex((o) => dropFeltX < o.x);
    if (insertAt === -1) insertAt = remaining.length;

    const next = [...remaining];
    next.splice(insertAt, 0, dragged);

    // NOTE: this was wired for a local-only UX action.
    // For now we ignore this dispatch in the reducer, so no state change.
    dispatch({ type: "REORDER_BOTTOM_HAND_LOCAL", nextHand: next });
  }

  // Wrap dispatch for drag play
  const dispatchSafe = (action) => {
    if (action?.type === "REORDER_BOTTOM_HAND_LOCAL") {
      return;
    }
    dispatch(action);
  };

  /* ===== Drag handlers ===== */
  function startRaf() {
    if (rafRef.current) return;
    const tick = () => {
      rafRef.current = null;
      setDragging((prev) => {
        if (!prev) return prev;
        return { ...prev, x: dragPosRef.current.x, y: dragPosRef.current.y };
      });
      startRaf();
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function onCardPointerDown(e, seat, card, rx, ry) {
    if (seat !== "A") return;
    if (state.phase === "gameover") return;

    const { x: fx, y: fy } = clientToFelt(e.clientX, e.clientY);
    const grabDx = fx - rx;
    const grabDy = fy - ry;

    dragPosRef.current = { x: fx, y: fy };
    setDragging({ id: card.id, seat, x: fx, y: fy, grabDx, grabDy });
    startRaf();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }

  function onCardPointerMove(e) {
    if (!dragging) return;
    const { x: fx, y: fy } = clientToFelt(e.clientX, e.clientY);
    dragPosRef.current = { x: fx, y: fy };
  }

  function onCardPointerUp(e) {
    if (!dragging) return;

    const { x: fx, y: fy } = clientToFelt(e.clientX, e.clientY);
    const draggedId = dragging.id;
    const dropInZone = isPointInTrickZone(fx, fy);

    if (state.phase === "playing" && state.turn === "A" && dropInZone) {
      // instant slap for your drag-drop play
      playSound("cardslap.m4a", 0.8);

      dispatchSafe({ type: "PLAY_CARD", seat: "A", cardId: draggedId });
      setSelectedId(null);
      setDragging(null);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    // reorder UX (currently visual-intent only; real order is via sortedView toggle)
    reorderBottomHand(draggedId, fx);

    setDragging(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  /* ===== Hand render ===== */
  function renderHandArc(seat) {
    const cfg = HAND_CFG?.[seat];
    const cards =
      seat === "A"
        ? displayedBottomHand
        : state.hands?.[seat] || [];
    if (!cfg || cards.length === 0) return null;

    const base = SEAT_ANCHORS[seat] || { x: 0.5, y: 0.5 };
    const off = SEAT_OFFSET?.[seat] || { x: 0, y: 0 };

    let anchorX = base.x * FELT_W + (cfg.pivotX || 0) + off.x;
    let anchorY = base.y * FELT_H + (cfg.pivotY || 0) + off.y;

    const pull = edgePullPx(base.x, base.y);
    anchorX += pull.x;
    anchorY += pull.y;

    const count = cards.length;
    const TIGHT = seat === "A" ? 0.75 : 0.6;
    const step =
      count > 1 ? ((cfg.endAngle - cfg.startAngle) / (count - 1)) * TIGHT : 0;

    const aimDeg = HAND_AIM?.[seat] ?? 0;
    const aimRad = (aimDeg * Math.PI) / 180;

    const bottomScale = seat === "A" ? 1.7 : 1.0;
    const isSeatActive = activeSeat === seat;
    const shouldDim = dimOthers && activeSeat != null && !isSeatActive;

    return cards.map((card, i) => {
      const angleDeg = cfg.startAngle + step * i * (cfg.dir ?? 1);
      const angleRad = (angleDeg * Math.PI) / 180;

      const x = anchorX + Math.cos(angleRad) * cfg.radius;
      const y = anchorY + Math.sin(angleRad) * cfg.radius;

      const dx = x - anchorX;
      const dy = y - anchorY;

      const rx = anchorX + (dx * Math.cos(aimRad) - dy * Math.sin(aimRad));
      const ry = anchorY + (dx * Math.sin(aimRad) + dy * Math.cos(aimRad));

      const rotateDeg = angleDeg + 90 + seatFacingRotation(seat) + aimDeg;

      const isDraggingThis =
        dragging && dragging.id === card.id && seat === "A";
      let drawX = rx;
      let drawY = ry;
      let z = 1;

      if (isDraggingThis) {
        drawX = dragging.x - dragging.grabDx;
        drawY = dragging.y - dragging.grabDy;
        z = 999;
      }

      const playable =
        seat === "A" &&
        state.turn === "A" &&
        state.phase === "playing" &&
        isValidPlayState(state, "A", card);
      const isSelected = seat === "A" && selectedId === card.id;

      // ===== DEAL ANIMATION TIMING (fade-in) =====
      // seat order for dealing: B → C → D → A (you last)
      const seatDealOrder = { B: 0, C: 1, D: 2, A: 3 };
      const baseDelay = (seatDealOrder[seat] ?? 0) * 300; // between seats
      const perCardDelay = i * 80; // across the fan for that seat
      const dealDelay = baseDelay + perCardDelay;

      const dealStyle = {
        opacity: 1,
        transform: `translate(-50%, -50%) rotate(${rotateDeg}deg) scale(${bottomScale})`,
        // fade-in only when it's a fresh deal
        animation: isFreshDeal ? "spadesDealIn 600ms ease-out forwards" : "none",
        animationDelay: isFreshDeal ? `${dealDelay}ms` : "0ms",
      };

      return (
        <div
          key={card.id}
          className={[
            "card-wrapper",
            `seat-${seat}`,
            playable ? "playable" : "",
            isSeatActive ? "seat-active" : "",
            shouldDim ? "seat-dim" : "",
            isSelected ? "card-selected" : "",
          ].join(" ")}
          style={{
            position: "absolute",
            left: `${drawX}px`,
            top: `${drawY}px`,
            pointerEvents: seat === "A" ? "auto" : "none",
            zIndex: z,
            touchAction: "none",
            transition: isDraggingThis
              ? "none"
              : `opacity 260ms ease-out ${dealDelay}ms, transform 260ms ease-out ${dealDelay}ms, filter 160ms ease-out`,
            ...dealStyle,
          }}
          onClick={() => {
            if (seat !== "A") return;
            if (state.phase === "gameover") return;

            const canSelect =
              (state.phase === "bidding" && state.turn === "A") ||
              (state.phase === "playing" && state.turn === "A");

            if (!canSelect) return;
            setSelectedId((prev) => (prev === card.id ? null : card.id));
          }}
          onPointerDown={(e) => onCardPointerDown(e, seat, card, rx, ry)}
          onPointerMove={seat === "A" ? onCardPointerMove : undefined}
          onPointerUp={seat === "A" ? onCardPointerUp : undefined}
          onDoubleClick={() => {
            if (seat !== "A") return;
            if (state.phase !== "playing") return;
            if (!isValidPlayState(state, "A", card)) return;

            // instant slap for your double-click play
            playSound("cardslap.m4a", 0.8);

            setSelectedId(null);
            dispatchSafe({ type: "PLAY_CARD", seat: "A", cardId: card.id });
          }}
        >
          <div className="card-inner">
            <Card v={card.value} size={cfg.size} />
          </div>
        </div>
      );
    });
  }

  const TRICK_POS = useMemo(
    () => ({
      C: { x: 0, y: -80 },
      B: { x: -110, y: 0 },
      A: { x: 0, y: 80 },
      D: { x: 110, y: 0 },
    }),
    []
  );

  const statusLine =
    state.phase === "bidding"
      ? `Bidding • Turn: ${seatLabel(state.turn)}`
      : state.phase === "playing"
      ? `Playing • Turn: ${seatLabel(state.turn)}`
      : `Game Over`;

  // Turn pill text (always derived, no extra state)
  let turnTitle = "";
  let turnSubtitle = "";

  if (state.phase === "bidding") {
    if (state.turn === "A") {
      turnTitle = "Your turn to bid";
      turnSubtitle = "Pick a number on the scorecard.";
    } else {
      turnTitle = `Waiting on ${seatLabel(state.turn)}…`;
      turnSubtitle = "Bidding in progress.";
    }
  } else if (state.phase === "playing") {
    if (state.turn === "A") {
      turnTitle = "Your turn to play";
      turnSubtitle = "Drag a card or select one to play.";
    } else {
      turnTitle = `Waiting on ${seatLabel(state.turn)}…`;
      turnSubtitle = "Cards are being played.";
    }
  }

  const totalBids =
    (state.bids.A ?? 0) +
    (state.bids.B ?? 0) +
    (state.bids.C ?? 0) +
    (state.bids.D ?? 0);

  // blockchain-ready views (not used yet, but wired)
  const publicState = useMemo(() => getPublicState(state), [state]);
  const privateA = useMemo(
    () => getPrivateStateForSeat(state, "A"),
    [state]
  );
  // console.log(publicState, privateA);

  const winnerSeat = state.winnerSeat;
  const isYouWinner = winnerSeat === "A";
  const winnerName =
    winnerSeat === "A" ? displayNameA : PLAYER_NAMES[winnerSeat];

  return (
    <div className="spades-root">
      <div
        ref={tableRef}
        className="spades-scale"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {/* HEADER ABOVE TABLE (Dice-style) */}
        <div className="sp-header-line">
          <div className="sp-header-pill">{headerLabel}</div>
        </div>

        {/* TABLE FELT */}
        <div
          ref={feltRef}
          className="felt"
          style={{ position: "relative", overflow: "visible" }}
        >
          {/* top-left table label */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 16,
              fontSize: 12,
              opacity: 0.8,
              zIndex: 20,
            }}
          >
            {tableTypeDisplay}
          </div>

          {/* Rules / Reorder controls */}
          <div
            className="spades-top-controls"
            style={{
              position: "absolute",
              top: 10,
              right: 16,
              display: "flex",
              gap: 8,
              zIndex: 20,
            }}
          >
            <button
              className="rules-btn"
              onClick={() => setShowRules((v) => !v)}
            >
              Cutthroat Rules
            </button>
          </div>

          {/* Rules panel */}
          {showRules && (
            <div
              className="rules-panel"
              style={{
                position: "absolute",
                top: 44,
                right: 16,
                width: 280,
                maxHeight: 320,
                padding: 12,
                borderRadius: 12,
                fontSize: 12,
                overflowY: "auto",
                zIndex: 25,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                Cutthroat Spades – Block Rules
              </div>
              <ul style={{ paddingLeft: 16, lineHeight: 1.4 }}>
                <li>4 players. No teams. All against all.</li>
                <li>Bid your hand – call how many books you’re taking.</li>
                <li>Make your bid, you get the points. Miss it, you pay it.</li>
                <li>First to 12 points wins the table.</li>
                <li>Spades are live and can be led any time.</li>
                <li>
                  Tip: set the high man when you can. Don’t let the big hand
                  run wild.
                </li>
              </ul>
              <div style={{ marginTop: 8, opacity: 0.8 }}>
                Full story mode / table talk will live on The Block’s rules page
                later.
              </div>
            </div>
          )}

          {/* Turn banner - always visible while game is active */}
          {state.phase !== "gameover" && (
            <div className="turn-toast">
              <div className="turn-toast-main">
                <div className="turn-toast-title">{turnTitle}</div>
                <div className="turn-toast-sub">{turnSubtitle}</div>
              </div>
              <div className={`turn-toast-timer timer-${timerLevel}`}>
                {state.timer}s
              </div>
            </div>
          )}

          {/* End-of-hand recap overlay */}
          {state.handRecap && state.phase !== "gameover" && (
            <div className="hand-recap">
              <div className="hand-recap-title">Hand Complete</div>
              <div className="hand-recap-sub">
                Most books:{" "}
                {state.handRecap.highlight.mostBooksSeats
                  .map((s) =>
                    s === "A" ? displayNameA : PLAYER_NAMES[s]
                  )
                  .join(", ")}{" "}
                ({state.handRecap.highlight.mostBooks})
                {state.handRecap.dealerNext && (
                  <span style={{ marginLeft: 10, opacity: 0.8 }}>
                    • Next dealer:{" "}
                    {state.handRecap.dealerNext === "A"
                      ? displayNameA
                      : PLAYER_NAMES[state.handRecap.dealerNext]}
                  </span>
                )}
              </div>

              <div className="hand-recap-grid">
                {state.handRecap.rows.map((r) => (
                  <div key={r.seat} className="hand-recap-row">
                    <div className="hand-recap-name">
                      {r.seat === "A"
                        ? displayNameA
                        : PLAYER_NAMES[r.seat]}
                    </div>
                    <div className="hand-recap-stats">
                      <span>Bid: {r.bid ?? "-"}</span>
                      <span>Books: {r.books}</span>
                      <span
                        className={`hand-recap-delta ${
                          r.delta >= 0 ? "pos" : "neg"
                        }`}
                      >
                        {r.delta >= 0 ? `+${r.delta}` : r.delta}
                      </span>
                      <span className="hand-recap-total">
                        Total: {r.totalAfter ?? r.totalBefore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Game Over overlay */}
          {state.phase === "gameover" && state.winnerSeat && (
            <div className="gameover-banner">
              <div className="gameover-title">Table Closed</div>
              <div className="gameover-name">
                {isYouWinner
                  ? "You ran the table on The Block."
                  : `${winnerName} takes the block this time.`}
              </div>

              <div className="gameover-scores">
                {SEATS.map((s) => (
                  <div
                    key={s}
                    className={[
                      "gameover-score-row",
                      state.winnerSeat === s
                        ? "gameover-score-row-winner"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="gameover-score-name">
                      {s === "A" ? displayNameA : PLAYER_NAMES[s]}
                    </span>
                    <span className="gameover-score-value">
                      {state.scores[s]}
                    </span>
                  </div>
                ))}
              </div>

              <button
                className="gameover-btn"
                onClick={() =>
                  dispatch({ type: "START_NEW_GAME" })
                }
              >
                Run it back
              </button>
            </div>
          )}

          {/* Hands */}
          {renderHandArc("C")}
          {renderHandArc("B")}
          {renderHandArc("D")}
          {renderHandArc("A")}

          {/* Play Selected */}
          {state.phase === "playing" &&
            state.turn === "A" &&
            selectedCard && (
              <button
                className="play-selected-btn"
                onClick={tryPlaySelected}
              >
                Play Selected
              </button>
            )}

          {/* Reorder Hand toggle near your cards */}
          <div
            className="reorder-hand-floating"
            style={{
              position: "absolute",
              bottom: 110,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
            }}
          >
            <button
              className="reorder-btn"
              onClick={() => setSortedView((v) => !v)}
            >
              {sortedView ? "Original Order" : "Reorder Hand"}
            </button>
          </div>

          {/* Right-side info stack: Lead + book toast */}
          <div className="right-info-stack">
            {/* Slot 1: Lead pill */}
            <div className="right-info-row">
              {leadSuitPretty && (
                <div className={`lead-suit-indicator ${leadSuitClass}`}>
                  Lead: {leadSuitPretty}
                </div>
              )}
            </div>

            {/* Slot 2: Book winner pill */}
            <div className="right-info-row">
              {bookToast && (
                <div className="book-toast">
                  {bookToast}
                </div>
              )}
            </div>
          </div>

          {/* Trick zone + progress */}
          <div
            ref={trickZoneRef}
            className="trick-zone"
            onClick={() => {
              if (
                state.phase === "playing" &&
                state.turn === "A" &&
                selectedId != null
              ) {
                tryPlaySelected();
              }
            }}
            style={{
              cursor:
                state.phase === "playing" &&
                state.turn === "A" &&
                selectedCard
                  ? "pointer"
                  : "default",
            }}
          >
            {state.trick.length === 0 ? (
              <span className="trick-wait">Waiting for cards...</span>
            ) : (
              state.trick.map((t) => {
                const pos = TRICK_POS[t.player] || { x: 0, y: 0 };
                const isWinnerCard = winningCardId === t.card.id;

                return (
                  <div
                    key={`${t.player}-${t.card.id}`}
                    className="trick-card"
                    style={{
                      transform: `translate(${pos.x}px, ${pos.y}px) scale(${
                        isWinnerCard ? 1.08 : 1
                      })`,
                      boxShadow: isWinnerCard
                        ? "0 0 22px rgba(45, 212, 191, 0.95)"
                        : "none",
                      borderRadius: 12,
                      border: isWinnerCard
                        ? "2px solid rgba(248, 250, 252, 0.9)"
                        : "none",
                    }}
                  >
                    <Card v={t.card.value} size="md" />
                  </div>
                );
              })
            )}

            {/* Trick progress pill */}
            <div className="trick-progress-pill">{trickLabel}</div>
          </div>

          {/* Seat pills around table */}
          <div className="seat-pill-container">
            {SEATS.map((seat) => {
              const isYou = seat === "A";
              const isActive = activeSeat === seat;
              const isDealer = state.dealer === seat;
              const baseName = isYou ? displayNameA : PLAYER_NAMES[seat];

              return (
                <div
                  key={seat}
                  className={[
                    "seat-pill",
                    `seat-pill-${seat}`,
                    isYou ? "seat-pill-you" : "",
                    isActive ? "seat-pill-active" : "",
                    isDealer ? "seat-pill-dealer" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="seat-pill-name">{baseName}</span>
                  {isYou && (
                    <span className="seat-pill-tag">YOU</span>
                  )}
                  {isDealer && (
                    <span className="seat-pill-dealer-dot">D</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* SCORECARD */}
          <div className="scorecard">
            <div className="scorecard-header">
              <span className="scorecard-title">SCORECARD</span>
              <span className="scorecard-phase">
                {state.phase === "bidding"
                  ? "Bidding"
                  : state.phase === "playing"
                  ? "Playing"
                  : "Game Over"}
              </span>
            </div>

            <div className="scorecard-status">
              <span>{statusLine}</span>
              <span className="scorecard-timer">{state.timer}s</span>
            </div>

            {/* YOU (seat A) – nickname or wallet here */}
            <div
              className={[
                "scorecard-row",
                "scorecard-row-you",
                activeSeat === "A" ? "row-active" : "",
              ].join(" ")}
            >
              <div className="scorecard-name">
                {displayNameA}
                <div className="scorecard-name-sub">
                  You · Seat A
                </div>
              </div>
              <div className="scorecard-stats">
                <span>Bid: {state.bids.A ?? "-"}</span>
                <span>Books: {state.books.A}</span>
                <span>
                  Cards: {state.hands.A?.length ?? 0}
                </span>
                <span className="scorecard-total">
                  Total: {state.scores.A}
                </span>
              </div>
            </div>

            {state.phase === "bidding" && state.turn === "A" && (
              <div className="scorecard-bidpad">
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <button
                    key={n}
                    className="bid-btn"
                    onClick={() =>
                      dispatch({
                        type: "PLACE_BID",
                        seat: "A",
                        value: n,
                      })
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {["B", "C", "D"].map((p) => (
              <div
                key={p}
                className={[
                  "scorecard-row",
                  activeSeat === p ? "row-active" : "",
                ].join(" ")}
              >
                <div className="scorecard-name">
                  {PLAYER_NAMES[p]}
                </div>
                <div className="scorecard-stats">
                  <span>Bid: {state.bids[p] ?? "-"}</span>
                  <span>Books: {state.books[p]}</span>
                  <span>
                    Cards: {state.hands[p]?.length ?? 0}
                  </span>
                  <span className="scorecard-total">
                    Total: {state.scores[p]}
                  </span>
                </div>
              </div>
            ))}

            <div className="scorecard-footer">
              <span>Total bids: {totalBids || "-"}</span>
              <span>
                Dealer:{" "}
                {state.dealer === "A"
                  ? displayNameA
                  : PLAYER_NAMES[state.dealer]}
              </span>
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                opacity: 0.75,
              }}
            >
              First to 12 wins
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
