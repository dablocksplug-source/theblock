// src/pages/BlockBet.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";
import WalletConnectButton from "../components/WalletConnectButton.jsx";

const STORAGE_KEY = "theblock_blockbet_tickets_v1";

const SPORTS = ["NFL", "NBA", "College Football", "MLB", "Soccer"];

const TEAMS_BY_SPORT = {
  NFL: ["New Orleans Saints", "Dallas Cowboys", "Kansas City Chiefs", "Green Bay Packers"],
  NBA: ["New Orleans Pelicans", "Los Angeles Lakers", "Boston Celtics", "Dallas Mavericks"],
  "College Football": ["LSU Tigers", "Alabama Crimson Tide", "Georgia Bulldogs", "Ohio State Buckeyes"],
  MLB: ["Houston Astros", "New York Yankees", "Atlanta Braves", "Los Angeles Dodgers"],
  Soccer: ["New Orleans Jesters", "LA Galaxy", "Arsenal", "Barcelona"],
};

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BlockBet() {
  // ✅ unified wallet state (no connectWallet, no account alias)
  const { walletAddress, isConnected } = useWallet();

  const { nickname, useNickname } = useNicknameContext();
  const displayName = getDisplayName({ walletAddress, nickname, useNickname });

  const formatNumber = (n, digits = 2) =>
    n.toLocaleString(undefined, { maximumFractionDigits: digits });

  // ---- BBET BANK STATE / MOCK DATA (replace with on-chain reads later) ----
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [bankTab, setBankTab] = useState("deposit"); // "deposit" | "withdraw"
  const [bankAmount, setBankAmount] = useState("");

  // TODO: replace with real wallet reads
  const userBDAGBalance = 987.65;
  const userBBetBalance = 150.0;

  // TODO: replace with real pool stats
  const poolBDAG = 8450;
  const totalBBetSupply = 7800;

  const feeBps = 50; // 0.50% example fee
  const feeRate = feeBps / 10000;

  const estRateBBetPerBDAG =
    poolBDAG > 0 && totalBBetSupply > 0 ? totalBBetSupply / poolBDAG : 1;
  const estRateBDAGPerBBet =
    poolBDAG > 0 && totalBBetSupply > 0 ? poolBDAG / totalBBetSupply : 1;

  const parsedBankAmount = Number(bankAmount) || 0;

  const bankPreview = useMemo(() => {
    if (parsedBankAmount <= 0) {
      return { primary: 0, fee: 0, net: 0 };
    }

    if (bankTab === "deposit") {
      // deposit: user spends BDAG, receives BBET (approx)
      const bbetOut = parsedBankAmount * estRateBBetPerBDAG;
      const fee = parsedBankAmount * feeRate; // fee in BDAG
      return { primary: bbetOut, fee, net: bbetOut };
    } else {
      // withdraw: user burns BBET, receives BDAG slice of pool
      if (totalBBetSupply <= 0) return { primary: 0, fee: 0, net: 0 };
      const share = parsedBankAmount / totalBBetSupply;
      const bdagOut = share * poolBDAG;
      const fee = bdagOut * feeRate;
      const net = bdagOut - fee;
      return { primary: bdagOut, fee, net };
    }
  }, [
    bankTab,
    parsedBankAmount,
    estRateBBetPerBDAG,
    poolBDAG,
    totalBBetSupply,
    feeRate,
  ]);

  // ---- local state for the ticket form ----
  const [sport, setSport] = useState("NFL");
  const teams = useMemo(() => TEAMS_BY_SPORT[sport] ?? [], [sport]);

  const [homeTeam, setHomeTeam] = useState("New Orleans Saints");
  const [awayTeam, setAwayTeam] = useState("Dallas Cowboys");
  const [side, setSide] = useState("home"); // "home" | "away"
  const [useSpread, setUseSpread] = useState(false);
  const [spread, setSpread] = useState(0);
  const [wager, setWager] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // ---- ticket data (local "backend") ----
  const [tickets, setTickets] = useState([]);

  // load from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setTickets(parsed);
      }
    } catch (err) {
      console.error("Failed to load BlockBet tickets:", err);
    }
  }, []);

  // save to localStorage whenever tickets change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    } catch (err) {
      console.error("Failed to save BlockBet tickets:", err);
    }
  }, [tickets]);

  // keep home & away distinct
  const filteredAwayTeams = teams.filter((t) => t !== homeTeam);

  // recompute default teams if sport changes
  useEffect(() => {
    const sportTeams = TEAMS_BY_SPORT[sport] ?? [];
    if (sportTeams.length >= 2) {
      setHomeTeam(sportTeams[0]);
      setAwayTeam(sportTeams[1]);
    }
  }, [sport]);

  const resetForm = () => {
    setSide("home");
    setUseSpread(false);
    setSpread(0);
    setWager("");
    setNotes("");
    setFormError("");
  };

  const validateForm = () => {
    if (!isConnected || !walletAddress) {
      return "Connect your wallet first.";
    }
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) {
      return "Choose two different teams.";
    }
    const numericWager = Number(wager);
    if (!numericWager || numericWager <= 0) {
      return "Enter a positive wager amount in BBET.";
    }
    if (useSpread && Math.abs(spread) > 50) {
      return "Spread looks unrealistic. Keep it within ±50.";
    }
    return "";
  };

  const handlePostTicket = () => {
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }

    const numericWager = Number(wager);

    const ticket = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sport,
      homeTeam,
      awayTeam,
      side, // "home" or "away"
      useSpread,
      spread: useSpread ? spread : 0,
      wager: numericWager,
      notes: notes.trim(),
      createdAt: Date.now(),
      createdByAddr: walletAddress,
      createdByName: displayName,
      status: "open", // "open" | "accepted" | "settled" | "cancelled"
      acceptedByAddr: null,
      acceptedByName: null,
    };

    setTickets((prev) => [ticket, ...prev]);
    resetForm();
  };

  const handleAccept = (ticketId) => {
    if (!isConnected || !walletAddress) {
      setFormError("Connect your wallet before accepting a ticket.");
      return;
    }

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t;
        if (t.createdByAddr === walletAddress) return t; // can't accept your own
        if (t.status !== "open") return t;

        return {
          ...t,
          status: "accepted",
          acceptedByAddr: walletAddress,
          acceptedByName: displayName,
          acceptedAt: Date.now(),
        };
      })
    );
  };

  const openTicketsForSport = tickets.filter(
    (t) => t.status === "open" && t.sport === sport
  );

  const myTickets = tickets.filter(
    (t) =>
      walletAddress &&
      (t.createdByAddr === walletAddress || t.acceptedByAddr === walletAddress)
  );

  return (
    <>
      <div className="min-h-[calc(100vh-140px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
          {/* HEADER */}
          <div className="relative text-center mb-8 sm:mb-10">
            {/* soft halo behind title */}
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-32 bg-gradient-to-b from-cyan-500/15 via-emerald-500/10 to-transparent blur-3xl" />

            <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 shadow-[0_0_20px_rgba(15,23,42,0.8)] text-xs sm:text-sm text-slate-300 tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>BlockBet • P2P Sportsbook</span>
            </div>

            <h1 className="relative mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Block
              <span className="text-cyan-400 drop-shadow-[0_0_18px_rgba(56,189,248,0.7)]">
                Bet
              </span>
            </h1>

            <p className="relative mt-3 max-w-2xl mx-auto text-sm sm:text-base text-slate-400">
              Peer-to-peer sports betting for The Block. No house, no Vegas lines—just straight
              action in{" "}
              <span className="font-semibold text-cyan-300">BBET</span>{" "}
              tokens between you and whoever&apos;s bold enough to click accept.
            </p>

            <p className="relative mt-2 text-[11px] sm:text-xs text-slate-500">
              All wagers are placed in BBET token. Load BBET from the BlockBet bank using your BDAG.
            </p>
          </div>

          {/* WALLET STATUS CARD */}
          <div className="mb-8 relative">
            <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-cyan-500/10 via-emerald-500/5 to-fuchsia-500/10 blur-xl" />
            <div className="relative rounded-2xl border border-slate-800/80 bg-slate-950/80 px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Wallet status
                </div>
                {isConnected ? (
                  <>
                    <div className="text-sm sm:text-base text-emerald-300 flex items-center gap-2">
                      <span className="inline-flex w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Connected as{" "}
                      <span className="font-semibold">{displayName}</span>
                    </div>
                    <div className="mt-1 text-[11px] sm:text-xs text-slate-500">
                      You&apos;re clear to post and accept bets on this device.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm sm:text-base text-rose-300 flex items-center gap-2">
                      <span className="inline-flex w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                      Not connected
                    </div>
                    <div className="mt-1 text-[11px] sm:text-xs text-slate-500">
                      You&apos;ll need your wallet connected to post and accept bets.
                    </div>
                  </>
                )}
              </div>

              {/* ✅ Dropdown picker (MetaMask / Coinbase / WalletConnect) */}
              {!isConnected && (
                <div className="flex items-center justify-center sm:justify-end">
                  <WalletConnectButton size="md" />
                </div>
              )}
            </div>
          </div>

          {/* MAIN LAYOUT: TICKET FORM + BBET BANK */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1.3fr)] items-start">
            {/* MAIN CARD: SPORT + TICKET FORM */}
            <div className="relative">
              <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-slate-900/80 blur-2xl" />
              <div className="relative rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_0_45px_rgba(15,23,42,0.9)] overflow-hidden">
                {/* Sports row */}
                <div className="border-b border-slate-800/80 px-4 sm:px-6 py-3 flex flex-wrap gap-2 bg-slate-950/80">
                  {SPORTS.map((label) => {
                    const active = label === sport;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setSport(label)}
                        className={[
                          "px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm border transition-all",
                          active
                            ? "bg-slate-800 text-cyan-300 border-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.45)]"
                            : "bg-slate-900/60 text-slate-300 border-slate-700 hover:border-slate-500",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Ticket body */}
                <div className="px-4 sm:px-6 py-5 sm:py-6">
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-100 mb-2">
                    Drop a <span className="text-cyan-400">Ticket</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mb-5 max-w-3xl">
                    Pick your matchup, choose whether you want a spread or straight up, and name
                    your price in BBET. Your challenge hits the board until someone from the Block
                    steps up.
                  </p>

                  {/* Form error */}
                  {formError && (
                    <div className="mb-3 rounded-lg border border-rose-500/70 bg-rose-500/10 px-3 py-2 text-xs sm:text-sm text-rose-100">
                      {formError}
                    </div>
                  )}

                  {/* Form grid */}
                  <div className="space-y-5">
                    {/* Teams row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Home Team
                        </label>
                        <select
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                          value={homeTeam}
                          onChange={(e) => setHomeTeam(e.target.value)}
                        >
                          {teams.map((team) => (
                            <option key={team} value={team}>
                              {team}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Home side usually gets the noise.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Away Team
                        </label>
                        <select
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                          value={awayTeam}
                          onChange={(e) => setAwayTeam(e.target.value)}
                        >
                          {filteredAwayTeams.map((team) => (
                            <option key={team} value={team}>
                              {team}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Make sure you choose two different teams.
                        </p>
                      </div>
                    </div>

                    {/* Side, spread, wager */}
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
                      {/* Side + spread type */}
                      <div className="space-y-4">
                        {/* Side toggle */}
                        <div>
                          <div className="text-xs font-semibold text-slate-300 mb-1.5">
                            Your Side
                          </div>
                          <div className="inline-flex rounded-full bg-slate-950/80 border border-slate-700 p-1 text-xs sm:text-sm">
                            <button
                              type="button"
                              onClick={() => setSide("home")}
                              className={[
                                "px-3 sm:px-4 py-1.5 rounded-full transition-all",
                                side === "home"
                                  ? "bg-emerald-500 text-slate-950 font-semibold shadow-[0_0_18px_rgba(16,185,129,0.55)]"
                                  : "text-slate-300 hover:text-slate-100",
                              ].join(" ")}
                            >
                              Home: {homeTeam.split(" ")[0] || "Home"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSide("away")}
                              className={[
                                "px-3 sm:px-4 py-1.5 rounded-full transition-all",
                                side === "away"
                                  ? "bg-rose-500 text-slate-950 font-semibold shadow-[0_0_18px_rgba(239,68,68,0.55)]"
                                  : "text-slate-300 hover:text-slate-100",
                              ].join(" ")}
                            >
                              Away: {awayTeam.split(" ")[0] || "Away"}
                            </button>
                          </div>
                        </div>

                        {/* Spread vs straight up */}
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 items-end">
                          {/* Spread controls */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                              Point Spread (optional)
                            </label>

                            <div className="flex items-center gap-2 relative">
                              {/* minus */}
                              <button
                                type="button"
                                onClick={() => setSpread((s) => Math.max(-50, s - 0.5))}
                                className={[
                                  "relative z-10 w-8 h-8 rounded-lg border flex items-center justify-center text-lg leading-none transition-colors",
                                  useSpread
                                    ? "bg-purple-500/30 border-purple-400/60"
                                    : "bg-slate-950/80 border-slate-700 hover:border-slate-500",
                                ].join(" ")}
                                disabled={!useSpread}
                              >
                                –
                              </button>

                              {/* input */}
                              <input
                                type="number"
                                step="0.5"
                                disabled={!useSpread}
                                className={[
                                  "w-20 sm:w-24 bg-slate-950/80 border rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none",
                                  useSpread
                                    ? "border-slate-700 focus:ring-2 focus:ring-cyan-400/70"
                                    : "border-slate-800 text-slate-500 cursor-not-allowed",
                                ].join(" ")}
                                value={spread}
                                onChange={(e) => setSpread(parseFloat(e.target.value) || 0)}
                              />

                              {/* plus */}
                              <button
                                type="button"
                                onClick={() => setSpread((s) => Math.min(50, s + 0.5))}
                                className={[
                                  "relative z-10 w-8 h-8 rounded-lg border flex items-center justify-center text-lg leading-none transition-colors",
                                  useSpread
                                    ? "bg-purple-500/30 border-purple-400/60"
                                    : "bg-slate-950/80 border-slate-700 hover:border-slate-500",
                                ].join(" ")}
                                disabled={!useSpread}
                              >
                                +
                              </button>
                            </div>

                            <p className="mt-1 text-[11px] text-slate-500">
                              Turn spread off to bet straight up. Later, ties (pushes) will refund
                              both sides automatically.
                            </p>
                          </div>

                          {/* Bet type */}
                          <div className="mt-6 lg:mt-0">
                            <label className="sr-only">Bet Type</label>
                            <div className="inline-flex rounded-full bg-slate-950/80 border border-slate-700 p-1 text-xs sm:text-sm">
                              {/* Straight Up Button */}
                              <button
                                type="button"
                                onClick={() => setUseSpread(false)}
                                className={[
                                  "px-3 sm:px-4 py-1.5 rounded-full transition-all",
                                  !useSpread
                                    ? "bg-cyan-500 text-slate-950 font-semibold shadow-[0_0_20px_rgba(34,211,238,0.45)]"
                                    : "text-slate-300 hover:text-slate-100",
                                ].join(" ")}
                              >
                                Straight up
                              </button>

                              {/* Use Spread Button */}
                              <button
                                type="button"
                                onClick={() => setUseSpread(true)}
                                className={[
                                  "px-3 sm:px-4 py-1.5 rounded-full transition-all",
                                  useSpread
                                    ? "bg-purple-500 text-slate-950 font-semibold shadow-[0_0_20px_rgba(168,85,247,0.45)]"
                                    : "text-slate-300 hover:text-slate-100",
                                ].join(" ")}
                              >
                                Use spread
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Wager */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Wager (BBET)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                            placeholder="Amount in BBET"
                            value={wager}
                            onChange={(e) => setWager(e.target.value)}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          This BBET amount will be matched 1:1 by whoever accepts.
                        </p>
                      </div>
                    </div>

                    {/* Divider between controls and notes */}
                    <hr className="my-4 border-slate-800/70" />

                    {/* Notes + button */}
                    <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Notes (trash talk optional)
                        </label>
                        <textarea
                          rows={2}
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70 resize-none"
                          placeholder={`Example: "Saints at home, dome loud, I like our chances."`}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handlePostTicket}
                        className="whitespace-nowrap inline-flex items-center justify-center px-5 sm:px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-slate-950 shadow-[0_0_35px_rgba(16,185,129,0.65)] transition-colors"
                      >
                        Post Bet Ticket
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BBET GAME BANK */}
            <div className="space-y-4">
              <div className="relative">
                <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-b from-sky-500/25 via-slate-900/0 to-slate-900/0 blur-3xl" />
                <div className="relative rounded-2xl border border-slate-800 bg-slate-950/90 p-5 shadow-[0_0_40px_rgba(8,47,73,0.45)]">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
                        Betting Bank — BBET
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Load BDAG into BBET to post and accept tickets.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] text-slate-300 border border-slate-700">
                      BlockBet Pool
                    </span>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-400">Your BDAG</span>
                      <span className="font-mono text-slate-100">
                        {formatNumber(userBDAGBalance)} BDAG
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-400">Your BBET</span>
                      <span className="font-mono text-slate-100">
                        {formatNumber(userBBetBalance)} BBET
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span>Pool BDAG</span>
                      <span className="font-mono text-slate-200">
                        {formatNumber(poolBDAG, 0)} BDAG
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span>Total BBET supply</span>
                      <span className="font-mono text-slate-200">
                        {formatNumber(totalBBetSupply, 0)} BBET
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span>Est. 1 BBET ≈</span>
                      <span className="font-mono text-sky-300">
                        {formatNumber(estRateBDAGPerBBet, 4)} BDAG
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setBankAmount("");
                      setBankTab("deposit");
                      setIsBankOpen(true);
                    }}
                    className="mt-5 w-full rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:from-sky-400 hover:to-cyan-300 shadow-[0_0_30px_rgba(56,189,248,0.65)] transition-colors"
                  >
                    Manage BBET
                  </button>

                  <p className="mt-2 text-[0.7rem] text-slate-500">
                    This panel is a UI preview. On-chain integration will route BDAG ↔ BBET through
                    the BlockBet pool contract using peer-to-peer liquidity.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* LOWER SECTIONS: OPEN TICKETS + YOUR ACTION */}
          <div className="mt-8 space-y-6">
            {/* OPEN TICKETS */}
            <section>
              <h3 className="text-sm sm:text-base font-semibold text-slate-100 mb-1">
                Open <span className="text-cyan-400">Tickets</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mb-3">
                These are live challenges for {sport}. Find a game you like, back a side, and let
                the scoreboard decide.
              </p>

              {openTicketsForSport.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/60 px-4 py-4 text-xs sm:text-sm text-slate-400">
                  No open tickets for this sport yet. Be the first to put one on the board.
                </div>
              ) : (
                <div className="space-y-3">
                  {openTicketsForSport.map((t) => {
                    const youCreated = walletAddress && t.createdByAddr === walletAddress;
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs sm:text-sm"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-slate-100">{t.sport}</span>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-200">
                              {t.homeTeam} vs {t.awayTeam}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-400 flex flex-wrap items-center gap-2">
                            <span>
                              Side:{" "}
                              <span className="font-semibold">
                                {t.side === "home" ? t.homeTeam : t.awayTeam}
                              </span>
                            </span>
                            {t.useSpread && (
                              <span>
                                • Spread:{" "}
                                <span className="font-semibold">
                                  {t.side === "home" ? "-" : "+"}
                                  {Math.abs(t.spread)}
                                </span>
                              </span>
                            )}
                            <span>
                              • Wager:{" "}
                              <span className="font-semibold text-emerald-300">
                                {t.wager.toFixed(2)} BBET
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-2">
                            <span>Posted by {t.createdByName}</span>
                            <span>•</span>
                            <span>{formatDate(t.createdAt)}</span>
                            {t.notes && (
                              <>
                                <span>•</span>
                                <span className="italic">&ldquo;{t.notes}&rdquo;</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {youCreated ? (
                            <span className="text-[11px] text-slate-500">
                              You posted this ticket.
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAccept(t.id)}
                              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-xs sm:text-sm font-semibold text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.55)] transition-colors"
                            >
                              Accept Ticket
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* YOUR ACTION */}
            <section>
              <h3 className="text-sm sm:text-base font-semibold text-slate-100 mb-1">
                Your <span className="text-cyan-400">Action</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mb-3">
                Bets you&apos;ve accepted or created. Later we&apos;ll wire this into game results,
                push logic (ties refund both), and automatic payouts from the contract.
              </p>

              {!walletAddress ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-xs sm:text-sm text-slate-400">
                  Connect your wallet to see tickets tied to your address.
                </div>
              ) : myTickets.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-xs sm:text-sm text-slate-400">
                  No history yet. Once you start betting, this section will show your active and
                  past tickets.
                </div>
              ) : (
                <div className="space-y-3">
                  {myTickets.map((t) => {
                    const youCreated = t.createdByAddr === walletAddress;
                    const youAccepted = t.acceptedByAddr === walletAddress;
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs sm:text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-slate-100">{t.sport}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-200">
                            {t.homeTeam} vs {t.awayTeam}
                          </span>
                        </div>

                        <div className="mt-1 text-slate-400 flex flex-wrap items-center gap-2">
                          <span>
                            Side you&apos;re on:{" "}
                            <span className="font-semibold">
                              {t.side === "home" ? t.homeTeam : t.awayTeam}
                            </span>
                          </span>
                          {t.useSpread && (
                            <span>
                              • Spread:{" "}
                              <span className="font-semibold">
                                {t.side === "home" ? "-" : "+"}
                                {Math.abs(t.spread)}
                              </span>
                            </span>
                          )}
                          <span>
                            • Wager:{" "}
                            <span className="font-semibold text-emerald-300">
                              {t.wager.toFixed(2)} BBET
                            </span>
                          </span>
                        </div>

                        <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-2">
                          <span>
                            Role:{" "}
                            {youCreated && youAccepted
                              ? "you posted & accepted (test only)"
                              : youCreated
                              ? "creator"
                              : "challenger"}
                          </span>
                          <span>•</span>
                          <span>Status: {t.status}</span>
                          <span>•</span>
                          <span>Posted {formatDate(t.createdAt)}</span>
                          {t.acceptedByName && (
                            <>
                              <span>•</span>
                              <span>
                                Accepted by {t.acceptedByName}{" "}
                                {t.acceptedAt && `@ ${formatDate(t.acceptedAt)}`}
                              </span>
                            </>
                          )}
                        </div>

                        {t.notes && (
                          <div className="mt-1 text-[11px] text-slate-400 italic">
                            &ldquo;{t.notes}&rdquo;
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* MANAGE BBET MODAL */}
      {isBankOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Manage BBET</h3>
                <p className="text-[11px] text-slate-400">
                  Swap between BDAG and BBET through the BlockBet pool.
                </p>
              </div>
              <button
                onClick={() => setIsBankOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pt-4 pb-5 space-y-4">
              {/* Tabs */}
              <div className="inline-flex rounded-full bg-slate-900 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setBankTab("deposit");
                    setBankAmount("");
                  }}
                  className={[
                    "px-3 py-1.5 rounded-full transition-colors",
                    bankTab === "deposit"
                      ? "bg-sky-500 text-slate-950 font-semibold shadow-[0_0_16px_rgba(56,189,248,0.6)]"
                      : "text-slate-300 hover:text-slate-50",
                  ].join(" ")}
                >
                  Deposit (BDAG → BBET)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBankTab("withdraw");
                    setBankAmount("");
                  }}
                  className={[
                    "px-3 py-1.5 rounded-full transition-colors",
                    bankTab === "withdraw"
                      ? "bg-emerald-500 text-slate-950 font-semibold shadow-[0_0_16px_rgba(16,185,129,0.6)]"
                      : "text-slate-300 hover:text-slate-50",
                  ].join(" ")}
                >
                  Withdraw (BBET → BDAG)
                </button>
              </div>

              {/* Balances */}
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                  <div className="flex items-center justify-between">
                    <span>BDAG balance</span>
                    <span className="font-mono text-slate-100">
                      {formatNumber(userBDAGBalance)}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                  <div className="flex items-center justify-between">
                    <span>BBET balance</span>
                    <span className="font-mono text-slate-100">
                      {formatNumber(userBBetBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {bankTab === "deposit"
                      ? "Amount to deposit (BDAG)"
                      : "Amount to withdraw (BBET)"}
                  </span>
                  <button
                    type="button"
                    className="text-[11px] text-sky-400 hover:text-sky-300"
                    onClick={() =>
                      setBankAmount(
                        bankTab === "deposit"
                          ? String(userBDAGBalance)
                          : String(userBBetBalance)
                      )
                    }
                  >
                    Max
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={bankAmount}
                  onChange={(e) => setBankAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                  placeholder="0.0"
                />
              </div>

              {/* Preview */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs text-slate-300">
                {bankTab === "deposit" ? (
                  <>
                    <div className="flex justify-between">
                      <span>Est. BBET received</span>
                      <span className="font-mono">
                        {formatNumber(bankPreview.primary)} BBET
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Fee (taken in BDAG)</span>
                      <span className="font-mono">
                        {formatNumber(bankPreview.fee)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Current est. rate</span>
                      <span className="font-mono">
                        1 BDAG ≈ {formatNumber(estRateBBetPerBDAG, 4)} BBET
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Est. BDAG before fee</span>
                      <span className="font-mono">
                        {formatNumber(bankPreview.primary)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Fee</span>
                      <span className="font-mono">
                        {formatNumber(bankPreview.fee)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-200">Net BDAG received</span>
                      <span className="font-mono text-emerald-300">
                        {formatNumber(bankPreview.net)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Current est. rate</span>
                      <span className="font-mono">
                        1 BBET ≈ {formatNumber(estRateBDAGPerBBet, 4)} BDAG
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Action button */}
              <button
                type="button"
                disabled={parsedBankAmount <= 0}
                className={[
                  "w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  parsedBankAmount <= 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : bankTab === "deposit"
                    ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                ].join(" ")}
              >
                {bankTab === "deposit"
                  ? "Confirm Deposit (preview)"
                  : "Confirm Withdraw (preview)"}
              </button>

              <p className="text-[0.7rem] text-slate-500">
                This is a front-end preview. Final amounts will be determined by the BlockBet pool
                contract at transaction time, based on your share of the BDAG pool and current
                liquidity.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
