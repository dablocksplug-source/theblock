// src/pages/BlockShop.jsx
import React from "react";

const PRODUCTS = [
  {
    id: "hoodie",
    name: "The Block Hoodie",
    tagline: "Rep the block — warm, clean, certified hustle.",
    priceUsd: 45,
    approxBDAG: 10_714.286,
    badge: "Best seller",
    colors: ["Black", "Charcoal", "Block Navy"],
  },
  {
    id: "tee",
    name: "The Block Tee",
    tagline: "Keep it real. Keep it Block.",
    priceUsd: 25,
    approxBDAG: 5_952.381,
    badge: "Everyday fit",
    colors: ["Black", "White", "Block Blue"],
  },
  {
    id: "snapback",
    name: "BlockSnapback",
    tagline: "Stay sharp from the block to the booth.",
    priceUsd: 30,
    approxBDAG: 7_142.857,
    badge: "Limited run",
    colors: ["Black/Teal", "Black/Gold"],
  },
];

function formatNumber(n, digits = 3) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function BlockShop() {
  return (
    <div className="min-h-[calc(100vh-140px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex items-center">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-18">
        {/* TOP HEADER */}
        <div className="relative text-center mb-10 sm:mb-12">
          {/* halo */}
          <div className="pointer-events-none absolute inset-x-0 -top-10 h-32 bg-gradient-to-b from-sky-500/20 via-emerald-500/10 to-transparent blur-3xl" />

          <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/70 border border-slate-700/70 text-xs sm:text-sm text-slate-300 tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>The Block • Merch Drop</span>
          </div>

          <h1 className="relative mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Block<span className="text-sky-400 drop-shadow-[0_0_18px_rgba(56,189,248,0.7)]">Shop</span>
          </h1>

          <p className="relative mt-3 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
            Real ones rock The Block. Cop the gear, rep your turf, and show the
            world where the grind started.
          </p>
        </div>

        {/* PRODUCT GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
          {PRODUCTS.map((item) => (
            <article
              key={item.id}
              className={[
                "relative rounded-2xl border border-slate-800/80 bg-slate-950/80",
                "shadow-[0_0_40px_rgba(15,23,42,0.9)]",
                "hover:border-sky-500/70 hover:shadow-[0_0_45px_rgba(56,189,248,0.6)]",
                "transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.01]",
                "flex flex-col",
              ].join(" ")}
            >
              {/* subtle outer glow */}
              <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-b from-sky-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative p-5 sm:p-6 flex flex-col h-full">
                {/* IMAGE AREA */}
                <div className="mb-4">
                  <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 aspect-[4/3] flex items-center justify-center">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.25),_transparent_55%)]" />
                    <div className="relative text-center text-[11px] sm:text-xs text-slate-400">
                      <div className="mb-1 font-semibold text-slate-200">
                        Product art coming soon
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-slate-500">
                        Drop mockups here once we lock designs.
                      </div>
                    </div>
                  </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h2 className="text-base sm:text-lg font-semibold">
                      {item.name}
                    </h2>
                    <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                      {item.badge}
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-slate-400 mb-3">
                    {item.tagline}
                  </p>

                  <div className="mb-3">
                    <div className="text-sm sm:text-base font-semibold text-sky-400">
                      ${item.priceUsd.toFixed(2)} USD
                    </div>
                    <div className="text-[11px] sm:text-xs text-slate-500">
                      ≈ {formatNumber(item.approxBDAG)} BDAG
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-[11px] sm:text-xs font-semibold text-slate-300 mb-1">
                      Select Size
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose Size
                      </option>
                      <option value="S">Small</option>
                      <option value="M">Medium</option>
                      <option value="L">Large</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </div>

                  <div className="mb-4 text-[11px] sm:text-xs text-slate-500">
                    <span className="font-semibold text-slate-300">
                      Colors:
                    </span>{" "}
                    {item.colors.join(" • ")}
                  </div>

                  {/* BUTTON */}
                  <button
                    type="button"
                    className="mt-auto inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(56,189,248,0.65)] hover:from-sky-400 hover:to-cyan-300 transition-colors"
                  >
                    Add to Cart (local only)
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* FOOTER NOTE */}
        <p className="mt-8 sm:mt-10 text-center text-[10px] sm:text-[11px] text-slate-500">
          Cart &amp; full checkout coming soon — for now, items are tracked
          locally and pricing is for preview only. Final BDAG rates will follow
          live BlockDAG pricing at launch.
        </p>
      </div>
    </div>
  );
}
