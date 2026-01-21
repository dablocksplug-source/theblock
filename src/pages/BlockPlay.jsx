// src/pages/BlockPlay.jsx
import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";

function DominoIcon() {
  // Simple domino tile with pips so it's not just a blue square
  return (
    <div className="relative w-8 h-11 sm:w-9 sm:h-12 rounded-lg bg-gradient-to-br from-slate-50 to-slate-200 border border-slate-400 shadow-[0_4px_12px_rgba(15,23,42,0.45)] flex items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px bg-slate-400/80" />
      <div className="grid grid-cols-2 gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
      </div>
    </div>
  );
}

export default function BlockPlay() {
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("deposit"); // "deposit" | "withdraw"
  const [amountInput, setAmountInput] = useState("");

  // ----- Mock balances / pool state (replace with on-chain reads later) -----
  const userBDAGBalance = 1234.56;
  const userBPlayBalance = 420.0;

  const poolBDAG = 12_450; // BDAG in BlockPlay pool
  const totalBPlaySupply = 11_980; // total BPLAY minted

  const feeBps = 50; // 0.50% fee as example
  const feeRate = feeBps / 10_000;

  // Derived est. rate + preview calc
  const estRateBPlayPerBDAG =
    poolBDAG > 0 && totalBPlaySupply > 0 ? totalBPlaySupply / poolBDAG : 1;

  const estRateBDAGPerBPlay =
    poolBDAG > 0 && totalBPlaySupply > 0 ? poolBDAG / totalBPlaySupply : 1;

  const parsedAmount = Number(amountInput) || 0;

  const preview = useMemo(() => {
    if (parsedAmount <= 0) {
      return {
        primary: 0,
        fee: 0,
        net: 0,
      };
    }

    if (activeTab === "deposit") {
      // User is spending BDAG to receive BPLAY (rough estimate)
      const bplayOut = parsedAmount * estRateBPlayPerBDAG;
      const fee = parsedAmount * feeRate;
      const netBPlay = bplayOut; // fee taken in BDAG, not BPLAY in this example
      return {
        primary: bplayOut,
        fee,
        net: netBPlay,
      };
    } else {
      // withdraw: user burns BPLAY to receive BDAG slice of the pool
      if (totalBPlaySupply <= 0) return { primary: 0, fee: 0, net: 0 };
      const share = parsedAmount / totalBPlaySupply;
      const bdagOut = share * poolBDAG;
      const fee = bdagOut * feeRate;
      const netBDAG = bdagOut - fee;
      return {
        primary: bdagOut,
        fee,
        net: netBDAG,
      };
    }
  }, [
    activeTab,
    parsedAmount,
    estRateBPlayPerBDAG,
    poolBDAG,
    totalBPlaySupply,
    feeRate,
  ]);

  const games = [
    {
      id: "dice",
      title: "Street Dice",
      subtitle: "Fast street action.",
      description: "2–7 players. Roll or get rolled.",
      emoji: "🎲",
      href: "/blockplay/dice", // goes to DiceLobby
      accentRing: "ring-cyan-400/60",
      accentGlow: "shadow-[0_0_40px_rgba(34,211,238,0.45)]",
    },
    {
      id: "spades",
      title: "Cutthroat Spades",
      subtitle: "No teams. No mercy.",
      description: "Cut throats, take books.",
      emoji: "♠️",
      href: "/blockplay/spades", // goes to SpadesLobby
      accentRing: "ring-violet-400/60",
      accentGlow: "shadow-[0_0_40px_rgba(167,139,250,0.45)]",
    },
    {
      id: "bones",
      title: "Bones (Dominoes)",
      subtitle: "Classic block vibes.",
      description: "Slap down your tiles.",
      emoji: "domino", // handled specially
      href: "/blockplay/bones", // adjust if your route is different
      accentRing: "ring-amber-400/60",
      accentGlow: "shadow-[0_0_40px_rgba(251,191,36,0.45)]",
    },
  ];

  const formatNumber = (n, digits = 2) =>
    n.toLocaleString(undefined, { maximumFractionDigits: digits });

  return (
    <>
      <div className="min-h-[calc(100vh-140px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex items-center">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-18">
          {/* Top label + title */}
          <div className="relative text-center mb-10 sm:mb-12">
            {/* soft halo behind header */}
            <div className="pointer-events-none absolute inset-x-0 -top-10 h-32 bg-gradient-to-b from-cyan-500/15 via-emerald-500/10 to-transparent blur-3xl" />

            <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/70 border border-slate-700/70 text-xs sm:text-sm text-slate-300 tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>BlockPlay Lobby</span>
            </div>

            <h1 className="relative mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Block<span className="text-cyan-400 drop-shadow-[0_0_18px_rgba(56,189,248,0.7)]">Play</span>
            </h1>

            <p className="relative mt-3 text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              Where the real action lives. Pick your game and jump into the
              neighborhood tables.
            </p>
          </div>

          {/* Main content: games + BPlay bank */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1.3fr)] items-start">
            {/* Game cards */}
            <div>
              <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((game) => (
                  <Link
                    key={game.id}
                    to={game.href}
                    className={[
                      "group relative overflow-hidden rounded-2xl border border-slate-800/80",
                      "bg-slate-900/70 hover:bg-slate-900",
                      "transition-all duration-200 ease-out",
                      "hover:-translate-y-1 hover:scale-[1.02]",
                      "hover:border-slate-600/80 hover:shadow-xl",
                    ].join(" ")}
                  >
                    {/* Soft background glow */}
                    <div
                      className={[
                        "pointer-events-none absolute -inset-20 opacity-0",
                        "bg-radial from-white/8 via-transparent to-transparent",
                        "group-hover:opacity-100 transition-opacity duration-300",
                      ].join(" ")}
                    />

                    <div className="relative p-6 sm:p-7 flex flex-col h-full">
                      {/* Icon circle */}
                      <div className="mb-4 flex items-center justify-between">
                        <div
                          className={[
                            "inline-flex items-center justify-center rounded-2xl w-12 h-12 sm:w-14 sm:h-14",
                            "bg-slate-900/80 ring-2",
                            game.accentRing,
                            "backdrop-blur",
                            game.accentGlow,
                          ].join(" ")}
                        >
                          {game.id === "bones" ? (
                            <DominoIcon />
                          ) : (
                            <span className="text-2xl sm:text-3xl">{game.emoji}</span>
                          )}
                        </div>

                        <span className="text-[10px] sm:text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                          Real-time tables
                        </span>
                      </div>

                      {/* Text content */}
                      <div className="flex-1">
                        <h2 className="text-lg sm:text-xl font-semibold tracking-tight mb-1">
                          {game.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-300 mb-1">
                          {game.subtitle}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400">
                          {game.description}
                        </p>
                      </div>

                      {/* Footer row */}
                      <div className="mt-5 flex items-center justify-between text-xs sm:text-sm text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 group-hover:bg-emerald-400 transition-colors" />
                          <span className="text-[11px] sm:text-xs uppercase tracking-wide">
                            Tap to enter lobby
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1 text-cyan-300 group-hover:text-emerald-300 transition-colors">
                          Play now
                          <span className="translate-y-[1px] group-hover:translate-x-0.5 transition-transform">
                            →
                          </span>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Bottom helper text */}
              <p className="mt-10 text-center text-[11px] sm:text-xs text-slate-500">
                More games coming soon — all powered by BDAG and The Block.
              </p>
            </div>

            {/* BPlay game bank */}
            <div className="space-y-4">
              <div className="relative">
                {/* glow behind card */}
                <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-b from-sky-500/25 via-slate-900/0 to-slate-900/0 blur-3xl" />
                <div className="relative rounded-2xl border border-slate-800 bg-slate-950/90 p-5 shadow-[0_0_40px_rgba(8,47,73,0.45)]">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
                        Game Bank — BPlay
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Load BDAG into BPlay to join BlockPlay tables.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] text-slate-300 border border-slate-700">
                      BlockPlay Pool
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
                      <span className="text-slate-400">Your BPlay</span>
                      <span className="font-mono text-slate-100">
                        {formatNumber(userBPlayBalance)} BPLAY
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
                      <span>Total BPlay supply</span>
                      <span className="font-mono text-slate-200">
                        {formatNumber(totalBPlaySupply, 0)} BPLAY
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span>Est. 1 BPlay ≈</span>
                      <span className="font-mono text-sky-300">
                        {formatNumber(estRateBDAGPerBPlay, 4)} BDAG
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setAmountInput("");
                      setActiveTab("deposit");
                      setIsManageOpen(true);
                    }}
                    className="mt-5 w-full rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:from-sky-400 hover:to-cyan-300 shadow-[0_0_30px_rgba(56,189,248,0.65)] transition-colors"
                  >
                    Manage BPlay
                  </button>

                  <p className="mt-2 text-[0.7rem] text-slate-500">
                    This panel is a UI preview. On-chain integration will route
                    BDAG ↔ BPLAY through the BlockPlay pool contract using
                    peer-to-peer liquidity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manage BPlay Modal */}
      {isManageOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Manage BPlay
                </h3>
                <p className="text-[11px] text-slate-400">
                  Swap between BDAG and BPlay through the BlockPlay pool.
                </p>
              </div>
              <button
                onClick={() => setIsManageOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pt-4 pb-5 space-y-4">
              {/* Tabs */}
              <div className="inline-flex rounded-full bg-slate-900 p-1 text-xs">
                <button
                  onClick={() => {
                    setActiveTab("deposit");
                    setAmountInput("");
                  }}
                  className={[
                    "px-3 py-1.5 rounded-full transition-colors",
                    activeTab === "deposit"
                      ? "bg-sky-500 text-slate-950 font-semibold shadow-[0_0_16px_rgba(56,189,248,0.6)]"
                      : "text-slate-300 hover:text-slate-50",
                  ].join(" ")}
                >
                  Deposit (BDAG → BPlay)
                </button>
                <button
                  onClick={() => {
                    setActiveTab("withdraw");
                    setAmountInput("");
                  }}
                  className={[
                    "px-3 py-1.5 rounded-full transition-colors",
                    activeTab === "withdraw"
                      ? "bg-emerald-500 text-slate-950 font-semibold shadow-[0_0_16px_rgba(16,185,129,0.6)]"
                      : "text-slate-300 hover:text-slate-50",
                  ].join(" ")}
                >
                  Withdraw (BPlay → BDAG)
                </button>
              </div>

              {/* Balances */}
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <span>BDAG balance</span>
                    <span className="font-mono text-slate-100">
                      {formatNumber(userBDAGBalance)}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <span>BPlay balance</span>
                    <span className="font-mono text-slate-100">
                      {formatNumber(userBPlayBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {activeTab === "deposit"
                      ? "Amount to deposit (BDAG)"
                      : "Amount to withdraw (BPlay)"}
                  </span>
                  <button
                    className="text-[11px] text-sky-400 hover:text-sky-300"
                    onClick={() =>
                      setAmountInput(
                        activeTab === "deposit"
                          ? String(userBDAGBalance)
                          : String(userBPlayBalance)
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
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                  placeholder="0.0"
                />
              </div>

              {/* Preview */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
                {activeTab === "deposit" ? (
                  <>
                    <div className="flex justify-between">
                      <span>Est. BPlay received</span>
                      <span className="font-mono">
                        {formatNumber(preview.primary)} BPLAY
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Fee (taken in BDAG)</span>
                      <span className="font-mono">
                        {formatNumber(preview.fee)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Current est. rate</span>
                      <span className="font-mono">
                        1 BDAG ≈ {formatNumber(estRateBPlayPerBDAG, 4)} BPLAY
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Est. BDAG before fee</span>
                      <span className="font-mono">
                        {formatNumber(preview.primary)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Fee</span>
                      <span className="font-mono">
                        {formatNumber(preview.fee)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-200">Net BDAG received</span>
                      <span className="font-mono text-emerald-300">
                        {formatNumber(preview.net)} BDAG
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Current est. rate</span>
                      <span className="font-mono">
                        1 BPlay ≈ {formatNumber(estRateBDAGPerBPlay, 4)} BDAG
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Action button */}
              <button
                disabled={parsedAmount <= 0}
                className={[
                  "w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  parsedAmount <= 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : activeTab === "deposit"
                    ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                ].join(" ")}
              >
                {activeTab === "deposit"
                  ? "Confirm Deposit (preview)"
                  : "Confirm Withdraw (preview)"}
              </button>

              <p className="text-[0.7rem] text-slate-500">
                This is a front-end preview. Final amounts will be determined by
                the BlockPlay pool contract at transaction time, based on your
                share of the BDAG pool and current liquidity.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
