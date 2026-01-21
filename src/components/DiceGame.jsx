// src/components/DiceGame.jsx
import "./DiceGame.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSound } from "../context/SoundContext";
import DiceCube from "./DiceCube";
import { useParams } from "react-router-dom";
import { diceTables } from "../data/diceTables";
import { useDiceTable } from "../hooks/useDiceTable";

import { useNickname, getDisplayName } from "../context/NicknameContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";

export default function DiceGame() {
  const { soundEnabled } = useSound();
  const { tableId } = useParams();
  const { walletAddress } = useWallet();
  const { nickname, useNickname: useNicknameFlag } = useNickname();

  const table = diceTables.find((t) => t.id === tableId);
  const minStake = table?.minBet ?? 1;

  if (!table) {
    const knownIds = diceTables.map((t) => `"${t.id}"`).join(", ");
    return (
      <div className="text-center text-red-400 text-xl mt-10">
        ❌ Invalid table selected.
        <div className="mt-2 text-xs text-red-300 opacity-70">
          route tableId: "{tableId}" | known IDs: {knownIds}
        </div>
      </div>
    );
  }

  // ✅ set this to your host machine LAN IP when testing in-house
  const SERVER_URL = "http://10.0.0.34:4010";

  const MOCK_MODE = import.meta.env.VITE_DICE_MOCK === "1";

  const { state, actions } = useDiceTable({
    serverUrl: SERVER_URL,
    tableId,
    minBet: minStake,
    mock: MOCK_MODE,
  });

  const myDisplayName = getDisplayName({
    walletAddress,
    nickname,
    useNickname: useNicknameFlag,
  });

  // local-only UI fields (per laptop)
  const [betAmount, setBetAmount] = useState("");
  const [mySelectedSide, setMySelectedSide] = useState("shooter");

  // ✅ IMPORTANT: start UNSEATED (fixes “first bet” + fake seat ownership)
  const [mySeatName, setMySeatName] = useState("");
  const isSeated = Boolean(mySeatName);

  /* =========================
     ACTIVITY AUTO-SCROLL (FIX)
     - Stops the feed from "jumping" and forcing you to scroll every action.
     - Auto-scrolls only if you're already near the bottom.
     ========================= */
  const activityBodyRef = useRef(null);
  const activityEndRef = useRef(null);

  useEffect(() => {
    const el = activityBodyRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 40; // px threshold

    if (isNearBottom) {
      activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [state?.activity?.length]);

  /* =========================
     SOUND ENGINE (CACHED + AMBIENCE)
     ========================= */
  const audioCacheRef = useRef(new Map());
  const ambienceRef = useRef(null);
  const ambienceStartedRef = useRef(false);

  const getAudio = useCallback((file, { loop = false, volume = 0.9 } = {}) => {
    const key = `${file}|loop:${loop}`;
    if (audioCacheRef.current.has(key)) return audioCacheRef.current.get(key);

    const a = new Audio(`/sounds/${file}`);
    a.loop = loop;
    a.volume = volume;
    audioCacheRef.current.set(key, a);
    return a;
  }, []);

  const playOneShot = useCallback(
    (file, { volume = 0.9 } = {}) => {
      if (!soundEnabled) return;
      const a = getAudio(file, { loop: false, volume });
      try {
        a.currentTime = 0;
      } catch {}
      a.play().catch(() => {});
    },
    [soundEnabled, getAudio]
  );

  const startAmbience = useCallback(() => {
    if (!soundEnabled) return;
    const a = getAudio("ambience.m4a", { loop: true, volume: 0.48 });
    ambienceRef.current = a;
    a.play().catch(() => {});
  }, [soundEnabled, getAudio]);

  const stopAmbience = useCallback(() => {
    const a = ambienceRef.current;
    if (!a) return;
    a.pause();
    try {
      a.currentTime = 0;
    } catch {}
  }, []);

  // ✅ Start ambience once after we have state (don’t restart every tick)
  useEffect(() => {
    if (!state) return;
    if (!soundEnabled) return;

    if (!ambienceStartedRef.current) {
      startAmbience();
      ambienceStartedRef.current = true;
    }
  }, [state, soundEnabled, startAmbience]);

  // ✅ Handle sound toggle without tying to table tick spam
  useEffect(() => {
    if (!state) return;

    if (!soundEnabled) {
      stopAmbience();
      ambienceStartedRef.current = false; // allow restart when user re-enables
      return;
    }

    if (!ambienceStartedRef.current) {
      startAmbience();
      ambienceStartedRef.current = true;
    }
  }, [soundEnabled, state, startAmbience, stopAmbience]);

  // ✅ Stop ambience on unmount only
  useEffect(() => {
    return () => stopAmbience();
  }, [stopAmbience]);

  /* =========================
     STATE-DRIVEN SOUND HOOKS
     ========================= */
  const prevStateRef = useRef(null);
  const pointSetRollRef = useRef(null);

  useEffect(() => {
    if (!state) return;

    const prev = prevStateRef.current;
    const curr = state;

    if (prev) {
      // Shooter roll start
      if (!prev.rolling && curr.rolling) {
        playOneShot("rollem.mp3", { volume: 0.95 });
      }

      // Detect a completed roll
      const diceChanged =
        Array.isArray(prev.dice) &&
        Array.isArray(curr.dice) &&
        (prev.dice[0] !== curr.dice[0] || prev.dice[1] !== curr.dice[1]);

      const rollJustLanded = diceChanged && prev.rolling && !curr.rolling;

      // Point set
      if (prev.point == null && curr.point != null) {
        playOneShot("point-set.m4a", { volume: 0.92 });
        pointSetRollRef.current = (curr.dice?.[0] || 0) + (curr.dice?.[1] || 0);
      }

      // Come-out outcomes
      if (rollJustLanded && prev.point == null && curr.point == null) {
        const total = (curr.dice?.[0] || 0) + (curr.dice?.[1] || 0);
        if (total === 7 || total === 11) playOneShot("natural.m4a", { volume: 1.0 });
        else if (total === 2 || total === 3 || total === 12) playOneShot("craps.m4a", { volume: 1.0 });
      }

      // Point-established outcomes
      if (rollJustLanded && prev.point != null) {
        const total = (curr.dice?.[0] || 0) + (curr.dice?.[1] || 0);

        if (total === 7 && curr.point == null) {
          playOneShot("seven-out.m4a", { volume: 1.0 });
        }

        if (total === prev.point && curr.point == null) {
          if (pointSetRollRef.current !== total) playOneShot("point-hit.m4a", { volume: 0.98 });
          else playOneShot("point-hit.m4a", { volume: 0.98 });
        }
      }
    }

    prevStateRef.current = curr;
  }, [state, playOneShot]);

  if (!state) {
    return (
      <div className="bp-wrapper">
        <div className="bp-header-line">
          <span className="bp-header-table">{table.name}</span>
          <span className="bp-header-meta">Connecting to table…</span>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Server: {SERVER_URL}</div>
        </div>
      </div>
    );
  }

  const {
    players,
    shooter,
    fader,
    dice,
    point,
    rolling,
    message,
    banner,
    withShooterPot,
    againstShooterPot,
    betting,
    countdown,
    rollWindow,
    rollCountdown,
    activity,
    shooterStreak,
    seatTaken,
    ledger,
  } = state;

  const isShooterView = isSeated && shooter === mySeatName;
  const isFaderView = isSeated && fader === mySeatName;

  const myRoleLabel = !isSeated ? "Unseated" : isShooterView ? "Shooter" : isFaderView ? "Fader" : "Rail";
  const myRoleClass =
    !isSeated ? "role-railer" : isShooterView ? "role-shooter" : isFaderView ? "role-fader" : "role-railer";

  const myLedger =
    (isSeated && ledger?.[mySeatName]) || { balance: 0, roundTotal: 0, lastBet: null, lastSide: null };
  const balance = myLedger.balance || 0;

  const currentPhaseLabel = point ? `Point: ${point}` : "Come-out roll";

  // helper totals
  const backTotal = withShooterPot || 0;
  const fadeTotal = againstShooterPot || 0;
  const totalPlaced = backTotal + fadeTotal;
  const inAction = Math.min(backTotal, fadeTotal);
  const refundedBack = Math.max(0, backTotal - inAction);
  const refundedFade = Math.max(0, fadeTotal - inAction);

  const stakeDisplay = table.stakeLabel ?? table.minBet ?? "?";

  const canBetBase = betting && isSeated;
  const canBetBack = canBetBase && !isFaderView;
  const canBetFade = canBetBase && !isShooterView;
  const canBetAny = canBetBack || canBetFade;

  const rollLabel = betting
    ? `BETTING: ${countdown}`
    : rollWindow
    ? `ROLL NOW (${rollCountdown})`
    : rolling
    ? "ROLLING…"
    : "ROLL";

  const isRollDisabled = !isSeated || rolling || betting || !isShooterView;

  const betStatusVariant = betting ? "open" : rollWindow ? "roll" : rolling ? "rolling" : "closed";
  const betStatusMain = !isSeated
    ? "Pick a seat to join this table."
    : betting
    ? `Betting window open — ${countdown}s`
    : rollWindow
    ? `Shooter can roll — ${rollCountdown}s`
    : rolling
    ? "Dice in the air..."
    : "Waiting for next betting window.";

  const betStatusSub = !isSeated
    ? "Seats lock per device. Claim yours before betting."
    : isShooterView
    ? "You are the shooter this round."
    : isFaderView
    ? "You are the fader this round."
    : "You’re on the rail — BACK or FADE the shooter within the rules.";

  const handleClaimSeat = (seat) => {
    const taken = seatTaken?.[seat] && seat !== mySeatName;
    if (taken) return;
    setMySeatName(seat);
    actions.claimSeat(seat);
  };

  const placeBet = () => {
    if (!isSeated) return;

    const amt = parseFloat(betAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (amt < minStake) return;
    if (amt > balance) return;

    actions.placeBet({ seat: mySeatName, amount: amt, side: mySelectedSide });
    setBetAmount("");
  };

  const handleRollClick = () => {
    if (isRollDisabled) return;
    actions.roll({ seat: mySeatName });
  };

  return (
    <div className="bp-wrapper">
      {/* TABLE HEADER */}
      <div className="bp-header-line">
        <span className="bp-header-table">{table.name}</span>
        <span className="bp-header-meta">
          Stake: {stakeDisplay} · Max {table.maxPlayers ?? 7} players
        </span>
      </div>

      {/* MAIN LAYOUT: LEFT RAIL / TABLE / RIGHT RAIL */}
      <div className="bp-main">
        {/* LEFT RAIL */}
        <div className="bp-rail bp-rail-left">
          <div className="bp-activity-panel">
            <div className="bp-activity-header">
              <span className="bp-activity-title">Table Activity</span>
              <span className="bp-activity-streak">Hot hand: {shooterStreak} in a row</span>
            </div>

            {/* ✅ FIXED: no reverse; stable scroll; auto-follow only when near bottom */}
            <div className="bp-activity-body" ref={activityBodyRef}>
              {activity?.length ? (
                activity.map((item) => (
                  <div key={item.id} className="bp-activity-item">
                    {item.text}
                  </div>
                ))
              ) : (
                <div className="bp-activity-empty">No rolls this round yet.</div>
              )}
              <div ref={activityEndRef} />
            </div>
          </div>
        </div>

        {/* CENTER: TABLE + SEATS */}
        <div className="bp-center">
          <div className="bp-table-shell">
            {players.map((name, index) => {
              const role = name === shooter ? "seat-shooter" : name === fader ? "seat-fader" : "";
              const isMe = isSeated && name === mySeatName;

              const taken = seatTaken?.[name];
              const label = isMe && myDisplayName ? myDisplayName : name;

              return (
                <div key={name} className={`bp-seat seat-${index} ${role} ${isMe ? "seat-me" : ""}`}>
                  <span>{label}</span>
                  {isMe && <span className="seat-you-pill">YOU</span>}
                  {taken && !isMe && (
                    <span className="seat-you-pill" style={{ opacity: 0.7 }}>
                      TAKEN
                    </span>
                  )}
                </div>
              );
            })}

            <div className={`bp-table ${rolling ? "bp-table-rolling" : ""}`}>
              <div className="bp-dice-area">
                <DiceCube value={dice[0]} rolling={rolling} />
                <DiceCube value={dice[1]} rolling={rolling} />
              </div>

              <div className="bp-total">Total: {dice[0] + dice[1]}</div>

              <button className="bp-roll-btn" onClick={handleRollClick} disabled={isRollDisabled}>
                {rollLabel}
              </button>

              {banner && <div className={`bp-banner bp-banner-under banner-${banner.type}`}>{banner.text}</div>}
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="bp-rail bp-rail-right">
          {/* SIDE BETS */}
          <div className="bp-bet-card">
            <div className="bp-bet-title">Side Bets (Your View)</div>
            <div className="bp-bet-sub">
              {!isSeated
                ? "Claim a seat to unlock betting."
                : isShooterView
                ? "You are the SHOOTER — you may only BACK shooter."
                : isFaderView
                ? "You are the FADER — you may only FADE shooter."
                : "Choose side · Enter BPlay · Place bet"}
            </div>

            <div className={`bp-bet-status ${betStatusVariant}`}>
              <div className="bp-bet-status-main">{betStatusMain}</div>
              <div className="bp-bet-status-sub">{betStatusSub}</div>
            </div>

            <div className="bp-bet-buttons">
              <button
                className={`bet-btn shooter-btn ${mySelectedSide === "shooter" ? "active" : ""}`}
                disabled={!canBetBack}
                onClick={() => setMySelectedSide("shooter")}
              >
                BACK SHOOTER
              </button>

              <button
                className={`bet-btn fader-btn ${mySelectedSide === "fader" ? "active" : ""}`}
                disabled={!canBetFade}
                onClick={() => setMySelectedSide("fader")}
              >
                FADE SHOOTER
              </button>
            </div>

            <div className="bp-bet-row">
              <input
                type="number"
                className="bp-bet-input"
                placeholder="BPlay"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                disabled={!canBetAny}
              />
              <button className="bp-bet-submit" disabled={!canBetAny} onClick={placeBet}>
                {betting ? `BET (${countdown}s)` : "BET"}
              </button>
            </div>
          </div>

          {/* YOUR ACTIVITY */}
          <div className="bp-hud-container">
            <div className="bp-hud-block">
              <div className="bp-hud-col" style={{ width: "100%" }}>
                <div className="bp-hud-title">Your Activity</div>

                <div className={`bp-role-tag ${myRoleClass}`}>{myRoleLabel.toUpperCase()}</div>

                <div className="bp-hud-row bp-your-seat-row">
                  <span>Your seat:</span>
                  <span>{isSeated ? mySeatName : "—"}</span>
                </div>

                <div className="bp-hud-row bp-seat-select-row">
                  <span>Pick seat:</span>
                  <div className="bp-seat-select-buttons">
                    {players.map((p) => {
                      const taken = seatTaken?.[p] && p !== mySeatName;
                      return (
                        <button
                          key={p}
                          className={["bp-seat-select-btn", p === mySeatName ? "active" : ""].join(" ")}
                          disabled={taken}
                          onClick={() => handleClaimSeat(p)}
                          title={taken ? "Seat taken" : "Claim seat"}
                        >
                          {p.replace("Player ", "")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bp-hud-row">
                  <span>Balance:</span>
                  <span>{balance} BPlay</span>
                </div>

                {isSeated && myLedger.roundTotal > 0 ? (
                  <>
                    <div className="bp-hud-row">
                      <span>Total this round:</span>
                      <span>{myLedger.roundTotal} BPlay</span>
                    </div>

                    {myLedger.lastBet && (
                      <>
                        <div className="bp-hud-row">
                          <span>Last Bet:</span>
                          <span>{myLedger.lastBet} BPlay</span>
                        </div>
                        <div className="bp-hud-row">
                          <span>Side:</span>
                          <span className={myLedger.lastSide === "shooter" ? "green" : "red"}>
                            {myLedger.lastSide === "shooter" ? "BACK Shooter" : "FADE Shooter"}
                          </span>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="bp-hud-empty">{isSeated ? "No bets yet this roll." : "Claim a seat to start."}</div>
                )}
              </div>
            </div>
          </div>

          {/* P2P BOX */}
          <div className="bp-hud-container">
            <div className="bp-hud-block">
              <div className="bp-hud-col" style={{ width: "100%" }}>
                <div className="bp-hud-title">P2P Bets (No House)</div>
                <div className="bp-hud-subtitle">
                  Shooter: <span className="green">{shooter}</span> · Fader: <span className="red">{fader}</span> ·{" "}
                  {currentPhaseLabel}
                </div>

                <div className="bp-hud-row">
                  <span>Back Shooter:</span>
                  <span className="green">{backTotal}</span>
                </div>

                <div className="bp-hud-row">
                  <span>Fade Shooter:</span>
                  <span className="red">{fadeTotal}</span>
                </div>

                <div className="bp-hud-row">
                  <span>Total Placed:</span>
                  <span>{totalPlaced}</span>
                </div>

                <div className="bp-hud-row" style={{ marginTop: 10, opacity: 0.9 }}>
                  <span>In Action:</span>
                  <span>{inAction}</span>
                </div>

                <div className="bp-hud-row">
                  <span>Refunded:</span>
                  <span>
                    <span className="green">{refundedBack}</span> <span style={{ opacity: 0.7 }}> / </span>
                    <span className="red">{refundedFade}</span>
                  </span>
                </div>

                <div className="bp-hud-empty" style={{ marginTop: 10 }}>
                  Extra money on the overfilled side gets refunded pro-rata on settlement.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MESSAGE */}
      <div className="bp-message">{message}</div>
    </div>
  );
}
