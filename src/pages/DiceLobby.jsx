// src/pages/DiceLobby.jsx
import React from "react";
import { Link } from "react-router-dom";
import { diceTables } from "../data/diceTables";

// Normalise stake value the same way DiceGame does
function getStakeValue(table) {
  return table.minBet ?? table.stake ?? 1;
}

function getStakeTier(table) {
  const minBet = getStakeValue(table);
  if (minBet <= 1) return "casual";     // 1 BPlay
  if (minBet <= 5) return "low";        // 5 BPlay
  if (minBet <= 10) return "mid";       // 10 BPlay
  return "high";                        // 20+ BPlay
}

const tierLabel = {
  casual: "CASUAL",
  low: "LOW STAKES",
  mid: "MID STAKES",
  high: "HIGH STAKES",
};

const cardBgByTier = {
  casual: "bg-gradient-to-br from-emerald-800/70 to-emerald-950/90",
  low:    "bg-gradient-to-br from-sky-800/70 to-slate-950/90",
  mid:    "bg-gradient-to-br from-indigo-800/70 to-slate-950/90",
  high:   "bg-gradient-to-br from-rose-800/75 to-amber-950/90",
};

export default function DiceLobby() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Title */}
      <div className="text-center pt-10">
        <h1 className="text-4xl font-extrabold text-white drop-shadow-[0_0_8px_rgba(0,255,255,0.4)]">
          Dice Tables
        </h1>
        <p className="text-slate-400 mb-10 text-sm tracking-wide">
          2–7 Players • Real-Time Rolls • Shooter Rotation
        </p>
      </div>

      {/* Table Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-6 pb-20">
        {diceTables.map((table) => {
          const tier = getStakeTier(table);
          const bgClass = cardBgByTier[tier];
          const stakeValue = getStakeValue(table);

          return (
            <div
              key={table.id}
              className={`
                ${bgClass}
                border border-slate-800/80 
                rounded-xl 
                p-6 
                shadow-xl 
                backdrop-blur 
                hover:border-cyan-400/50 
                hover:shadow-[0_0_24px_rgba(0,255,255,0.25)] 
                transition
              `}
            >
              {/* Table Name */}
              <h2 className="text-xl font-bold text-white mb-1">
                {table.name}
              </h2>

              {/* Tier label */}
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300/80 mb-2">
                {tierLabel[tier]}
              </p>

              {/* Stakes */}
              <p className="text-slate-200 text-sm">
                Stake:{" "}
                <span className="font-semibold text-cyan-300">
                  ${stakeValue}
                </span>
              </p>

              {/* TODO: wire real player counts once we have backend / sockets */}
              <p className="text-slate-500 text-xs mt-1">
                Players: 0 / {table.maxPlayers ?? 7}
              </p>

              <p className="text-[11px] text-amber-400 italic mt-1">
                {table.status || "Waiting for players"}
              </p>

              {/* Join Button */}
              <Link
                to={`/blockplay/dice/${table.id}`}
                className="
                  inline-block 
                  mt-5 
                  w-full 
                  py-2.5 
                  bg-cyan-500 
                  text-slate-900 
                  font-bold 
                  text-sm
                  rounded-lg 
                  hover:bg-cyan-300 
                  hover:shadow-[0_0_16px_rgba(0,255,255,0.55)]
                  transition
                "
              >
                Join Table
              </Link>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <footer className="mt-10 border-t border-slate-800 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} The Block — Built on BDAG.
      </footer>
    </div>
  );
}
