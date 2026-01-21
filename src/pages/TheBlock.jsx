import React from "react";
import { useNavigate } from "react-router-dom";

const TheBlock = () => {
  const navigate = useNavigate();

  // TODO: replace with your real FB page link
  const OFFICIAL_FACEBOOK_URL = "https://facebook.com/YOUR_PAGE_HERE";

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Subtle glowing background orbs */}
      <div className="absolute w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl top-10 left-[-10%] animate-pulse"></div>
      <div className="absolute w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl bottom-[-10%] right-[-10%] animate-pulse"></div>

      {/* Main Title Section */}
      <div className="z-10 text-center px-4">
        <h1 className="text-5xl md:text-6xl font-extrabold text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] mb-4 tracking-wide">
          Welcome to The Block
        </h1>

        <p className="text-slate-300 text-sm md:text-base max-w-lg mx-auto mb-5 leading-relaxed">
          Where hustle meets innovation. From late nights on the grind to digital domination,
          <span className="text-cyan-400 font-semibold"> The Block</span> is home for those building something real.
        </p>

        {/* Secondary "Official" strip (above-the-fold) */}
        <div className="mx-auto mb-7 w-full max-w-xl rounded-2xl bg-slate-900/55 border border-cyan-500/20 px-4 py-3 shadow-[0_0_16px_rgba(34,211,238,0.18)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-[11px] text-slate-300">
              <span className="text-cyan-300 font-semibold">Official:</span>{" "}
              News, updates & insights live here.
            </div>

            <div className="flex items-center justify-center md:justify-end gap-2 text-[11px]">
              <button
                onClick={() => navigate("/lore")}
                className="px-3 py-1.5 rounded-xl bg-slate-950/40 border border-cyan-400/25 text-cyan-300 hover:text-cyan-200 hover:border-cyan-300/45 transition"
              >
                The Lore of TheBlock
              </button>

              <button
                onClick={() => navigate("/investor")}
                className="px-3 py-1.5 rounded-xl bg-slate-950/40 border border-cyan-400/25 text-cyan-300 hover:text-cyan-200 hover:border-cyan-300/45 transition"
              >
                Inside The Hustle
              </button>

              <a
  href="https://www.facebook.com/groups/dablocksplug/"
  target="_blank"
  rel="noopener noreferrer"
  className="px-3 py-1.5 rounded-xl bg-slate-950/40 border border-cyan-400/25 text-cyan-300 hover:text-cyan-200 hover:border-cyan-300/45 transition"
  title="Private group. Official updates only."
>
  Official Updates — Private
</a>

            </div>
          </div>

          <div className="mt-2 text-[10px] text-slate-500">
            We will never DM first or ask for private keys, seed phrases, or wallet access.
          </div>
        </div>

        {/* Enter Button */}
        <button
          onClick={() => navigate("/blockswap")}
          className="bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-8 rounded-xl text-sm md:text-base shadow-[0_0_25px_rgba(34,211,238,0.6)] transition-all duration-300"
        >
          Enter The Block
        </button>

        {/* tiny scroll hint so people know there’s more */}
        <div className="mt-6 text-[10px] text-slate-500 flex items-center justify-center gap-2">
          <span className="opacity-80">Scroll for districts</span>
          <span className="text-cyan-400/70">↓</span>
        </div>
      </div>

      {/* The Districts Grid */}
      <div className="z-10 mt-12 grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl text-center px-4">
        {[
          { name: "BlockSwap", desc: "Swap B3 for BPlay, BBet & more — where moves get made." },
          { name: "BlockPlay", desc: "Games and entertainment for the community." },
          { name: "BlockBet", desc: "Wager smart, win big — no luck, just strategy." },
          { name: "BlockPay", desc: "Digital payments made easy. Fast, clean, real." },
          { name: "BlockProof", desc: "Receipts, transparency, and respect. Always verified." },
          { name: "BlockShop", desc: "Grab exclusive drops and creations from the community." },
        ].map((card) => (
          <div
            key={card.name}
            className="rounded-2xl bg-slate-900/70 border border-cyan-500/25 p-5 shadow-[0_0_16px_rgba(34,211,238,0.25)] hover:border-cyan-400/50 hover:shadow-[0_0_22px_rgba(34,211,238,0.4)] transition-all duration-300"
          >
            <h3 className="text-cyan-300 font-semibold text-sm mb-1">{card.name}</h3>
            <p className="text-slate-400 text-[11px]">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Lore Button (keep if you want, but now it’s also above-the-fold) */}
      <button
        onClick={() => navigate("/lore")}
        className="absolute bottom-6 right-6 text-[11px] md:text-xs bg-slate-900/80 text-cyan-400 border border-cyan-400/30 rounded-xl px-4 py-2 shadow-[0_0_12px_rgba(34,211,238,0.35)] hover:shadow-[0_0_18px_rgba(34,211,238,0.55)] hover:bg-slate-800/90 transition-all duration-300"
      >
        Read The Lore
      </button>

      <button
        onClick={() => navigate("/investor")}
        className="absolute bottom-6 left-6 text-[11px] md:text-xs bg-slate-900/80 text-cyan-400 border border-cyan-400/30 rounded-xl px-4 py-2 shadow-[0_0_12px_rgba(34,211,238,0.35)] hover:shadow-[0_0_18px_rgba(34,211,238,0.55)] hover:bg-slate-800/90 transition-all duration-300"
      >
        Inside The Hustle
      </button>

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-[10px] text-slate-500 z-10">
        Built by <span className="text-cyan-400 font-semibold">TheStreets</span> — Grind. Build. Elevate. © 2025
      </div>
    </div>
  );
};

export default TheBlock;
