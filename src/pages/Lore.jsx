// src/pages/Lore.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

const Lore = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-200 overflow-hidden flex items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
      {/* Background glows */}
      <div className="pointer-events-none absolute -left-24 -top-16 h-80 w-80 rounded-full bg-cyan-500/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-purple-600/12 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-1/4 bottom-[-6rem] h-72 rounded-t-full bg-sky-500/6 blur-3xl" />

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-3xl text-center">
        {/* Little label pill */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-slate-900/80 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>The Block • Origin Story</span>
        </div>

        {/* Card wrapper for the text */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 px-5 py-7 shadow-[0_0_32px_rgba(15,23,42,0.9)] sm:px-8 sm:py-9">
          <h1 className="mb-5 text-3xl font-extrabold text-cyan-400 drop-shadow-[0_0_18px_rgba(34,211,238,0.7)] sm:text-4xl md:text-5xl">
            The Lore of The Block
          </h1>

          <div className="space-y-4 text-sm leading-relaxed text-slate-300 sm:text-base">
            <p>
              It started where all real stories begin —{" "}
              <span className="font-semibold text-cyan-400">on the block</span>.
              Long before the lights and screens, it was about grind, loyalty,
              and vision. From cracked pavement to glowing code, the hustle
              never stopped — it just evolved.
            </p>

            <p>
              <span className="font-semibold text-cyan-400">The Block</span>{" "}
              rose from that spirit — a place built by the people, for the
              people who make things happen. A digital neighborhood that
              reflects where we came from, and where we’re headed. Every corner,
              every district has a story — each one shaped by grind, purpose,
              and connection.
            </p>

            <p>
              Powered by{" "}
              <span className="font-semibold text-cyan-400">TheStreets</span>, The
              Block is more than a network — it’s an ecosystem. Here, tokens
              move like money used to, and value flows through trust, creation,
              and progress. What started as a single swap has grown into an
              entire movement.
            </p>

            <p>
              And we’re not done. Over time, new districts will rise — new
              ideas, new connections, new ways to earn. The Block will expand,
              evolve, and adapt. Because this isn’t a project…{" "}
              <span className="font-semibold text-cyan-400">
                it’s a legacy in motion.
              </span>
            </p>
          </div>

          {/* Back Button */}
          <div className="mt-8">
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center rounded-full bg-cyan-500/90 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.5)] transition-all duration-200 hover:bg-cyan-400 hover:translate-y-[1px] hover:shadow-[0_0_32px_rgba(34,211,238,0.8)]"
            >
              Back to The Block
            </button>
          </div>
        </div>

        {/* Footer line */}
        <div className="mt-6 text-[10px] text-slate-500">
          Every legend starts somewhere — © 2025 The Block
        </div>
      </div>
    </div>
  );
};

export default Lore;
