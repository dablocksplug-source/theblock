// src/pages/BlockBet.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

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
    if (parsedBankAmount <= 0) return { primary: 0, fee: 0, net: 0 };

    if (bankTab === "deposit") {
      const bbetOut = parsedBankAmount * estRateBBetPerBDAG;
      const fee = parsedBankAmount * feeRate; // fee in BDAG
      return { primary: bbetOut, fee, net: bbetOut };
    } else {
      if (totalBBetSupply <= 0) return { primary: 0, fee: 0, net: 0 };
      const share = parsedBankAmount / totalBBetSupply;
      const bdagOut = share * poolBDAG;
      const fee = bdagOut * feeRate;
      const net = bdagOut - fee;
      return { primary: bdagOut, fee, net };
    }
  }, [bankTab, parsedBankAmount, estRateBBetPerBDAG, poolBDAG, totalBBetSupply, feeRate]);

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

  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setTickets(parsed);
    } catch (err) {
      console.error("Failed to load BlockBet tickets:", err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    } catch (err) {
      console.error("Failed to save BlockBet tickets:", err);
    }
  }, [tickets]);

  const filteredAwayTeams = teams.filter((t) => t !== homeTeam);

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
    if (!isConnected || !walletAddress) return "Connect your wallet first.";
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) return "Choose two different teams.";
    const numericWager = Number(wager);
    if (!numericWager || numericWager <= 0) return "Enter a positive wager amount in BBET.";
    if (useSpread && Math.abs(spread) > 50) return "Spread looks unrealistic. Keep it within ±50.";
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
      side,
      useSpread,
      spread: useSpread ? spread : 0,
      wager: numericWager,
      notes: notes.trim(),
      createdAt: Date.now(),
      createdByAddr: walletAddress,
      createdByName: displayName,
      status: "open",
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
        if (t.createdByAddr === walletAddress) return t;
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

  const openTicketsForSport = tickets.filter((t) => t.status === "open" && t.sport === sport);

  const myTickets = tickets.filter(
    (t) => walletAddress && (t.createdByAddr === walletAddress || t.acceptedByAddr === walletAddress)
  );

  return (
    <>
      <div className="min-h-[calc(100vh-140px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
          {/* HEADER */}
          <div className="relative text-center mb-8 sm:mb-10">
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-32 bg-gradient-to-b from-cyan-500/15 via-emerald-500/10 to-transparent blur-3xl" />

            <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 shadow-[0_0_20px_rgba(15,23,42,0.8)] text-xs sm:text-sm text-slate-300 tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>BlockBet • P2P Sportsbook</span>
            </div>

            <h1 className="relative mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Block
              <span className="text-cyan-400 drop-shadow-[0_0_18px_rgba(56,189,248,0.7)]">Bet</span>
            </h1>

            <p className="relative mt-3 max-w-2xl mx-auto text-sm sm:text-base text-slate-400">
              Peer-to-peer sports betting for The Block. No house, no Vegas lines—just straight
              action in <span className="font-semibold text-cyan-300">BBET</span> tokens.
            </p>

            <p className="relative mt-2 text-[11px] sm:text-xs text-slate-500">
              Load BBET from the BlockBet bank using your BDAG.
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
                      Connected as <span className="font-semibold">{displayName}</span>
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
                      Use the top bar “Connect Wallet” button.
                    </div>
                  </>
                )}
              </div>

              {!isConnected ? (
                <div className="flex items-center justify-center sm:justify-end">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 text-sm font-semibold border border-cyan-400/30 text-cyan-200 hover:border-cyan-300/50 bg-slate-950/30"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    title="Use the top bar Connect Wallet"
                  >
                    Connect Wallet (top bar)
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* ...rest of your file stays EXACTLY THE SAME from here down... */}
          {/* MAIN LAYOUT: TICKET FORM + BBET BANK */}
          {/* (No further wallet UI mounts anywhere in this file) */}

          {/* KEEP ALL YOUR EXISTING CONTENT BELOW UNCHANGED */}
          {/* ↓↓↓ (your existing JSX continues) ↓↓↓ */}

          {/* MAIN LAYOUT: TICKET FORM + BBET BANK */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1.3fr)] items-start">
            {/* ... unchanged content ... */}
            {/* (I’m not re-pasting the remaining ~700 lines to avoid accidental edits.
                Keep everything after the wallet card exactly as you already have it.) */}
          </div>

          {/* ... unchanged remainder ... */}
        </div>
      </div>

      {/* ... unchanged remainder ... */}
    </>
  );
}
