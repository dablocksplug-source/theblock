// src/pages/blockplay/SpadesLobby.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function SpadesLobby() {
  const navigate = useNavigate();

  const tables = [
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

  // Group by stake so we can label + color them
  const groups = [
    { label: "$3 Tables", min: 3 },
    { label: "$5 Tables", min: 5 },
    { label: "$10 Tables", min: 10 },
    { label: "$20 Tables", min: 20 },
  ];

  function getStakeTier(min) {
    if (min <= 3) return "low";
    if (min === 5) return "mid";
    if (min === 10) return "high";
    return "elite"; // 20+
  }

  const stakeStyles = {
    low: {
      badge: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40",
      button:
        "bg-emerald-500 text-slate-900 hover:bg-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.6)]",
      cardBorder: "border-emerald-600/40 hover:border-emerald-400/70",
    },
    mid: {
      badge: "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40",
      button:
        "bg-cyan-500 text-slate-900 hover:bg-cyan-400 hover:shadow-[0_0_16px_rgba(34,211,238,0.6)]",
      cardBorder: "border-cyan-600/40 hover:border-cyan-400/70",
    },
    high: {
      badge: "bg-amber-500/20 text-amber-300 border border-amber-400/40",
      button:
        "bg-amber-500 text-slate-900 hover:bg-amber-400 hover:shadow-[0_0_16px_rgba(245,158,11,0.6)]",
      cardBorder: "border-amber-600/40 hover:border-amber-400/70",
    },
    elite: {
      badge: "bg-rose-500/20 text-rose-300 border border-rose-400/40",
      button:
        "bg-rose-500 text-slate-900 hover:bg-rose-400 hover:shadow-[0_0_16px_rgba(244,63,94,0.6)]",
      cardBorder: "border-rose-600/40 hover:border-rose-400/70",
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="w-full border-b border-slate-800/80 bg-black/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-4 gap-3">
          <div className="text-center sm:text-left">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-[0_0_8px_rgba(0,255,255,0.35)] tracking-tight">
              Spades Tables
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm tracking-wide mt-1">
              4-Player • Auto-Seat • Minimum Bid:{" "}
              <span className="text-white font-semibold">3 Books</span>
            </p>
          </div>

          {/* Small legend for stake colors */}
          <div className="flex flex-wrap justify-center sm:justify-end gap-2 text-[10px] sm:text-xs">
            <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
              Low Stakes ($3)
            </span>
            <span className="px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/40">
              Mid Stakes ($5)
            </span>
            <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/40">
              High Stakes ($10)
            </span>
            <span className="px-2 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/40">
              Elite ($20)
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 pt-6 space-y-10">
          {groups.map((group) => {
            const groupTables = tables.filter((t) => t.min === group.min);
            if (groupTables.length === 0) return null;

            const tier = getStakeTier(group.min);
            const style = stakeStyles[tier];

            return (
              <section key={group.label}>
                {/* Group header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
                    {group.label}
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${style.badge}`}
                    >
                      {tier === "low"
                        ? "Casual"
                        : tier === "mid"
                        ? "Standard"
                        : tier === "high"
                        ? "Competitive"
                        : "High Rollers"}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500 hidden sm:block">
                    Same stake, different vibes — pick your favorite table name.
                  </p>
                </div>

                {/* Table grid for this stake group */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groupTables.map((table) => {
                    const tier = getStakeTier(table.min);
                    const style = stakeStyles[tier];

                    return (
                      <div
                        key={table.id}
                        className={`
                          bg-slate-900/70
                          border
                          rounded-xl
                          p-5
                          shadow-lg
                          backdrop-blur
                          transition
                          ${style.cardBorder}
                          hover:shadow-[0_0_24px_rgba(0,0,0,0.75)]
                        `}
                      >
                        {/* Table header */}
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-xl font-bold text-white">
                            {table.name}
                          </h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${style.badge}`}
                          >
                            ${table.min} Table
                          </span>
                        </div>

                        {/* Stakes / meta */}
                        <p className="text-slate-300 text-xs sm:text-sm">
                          Min Buy-In:{" "}
                          <span className="font-semibold text-slate-50">
                            ${table.min}
                          </span>
                        </p>
                        <p className="text-slate-500 text-[11px] mt-1">
                          Players: <span className="text-slate-300">0 / 4</span> •
                          Cutthroat • First to 12
                        </p>

                        {/* Join button */}
                        <button
                          onClick={() => navigate(`/blockplay/spades/${table.id}`)}
                          className={`
                            mt-4
                            w-full
                            py-2.5
                            rounded-lg
                            font-bold
                            text-xs sm:text-sm
                            uppercase
                            tracking-wide
                            ${style.button}
                            transition
                          `}
                        >
                          Join Table
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-4 text-center text-[11px] text-slate-600 px-4">
        © {new Date().getFullYear()} The Block — Built on BDAG. Spades • Cutthroat • No mercy.
      </footer>
    </div>
  );
}
