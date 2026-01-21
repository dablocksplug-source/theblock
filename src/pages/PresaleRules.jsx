// src/pages/PresaleRules.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function PresaleRules() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                BlockSwap
              </span>
              <span className="text-xs text-slate-600">/</span>
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Early Bird Special
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Early Bird Special Rules &amp; Mechanics
            </h1>

            <p className="text-sm leading-relaxed text-slate-300">
              BlockSwap uses a fixed-supply ownership system called{" "}
              <span className="font-semibold text-slate-100">Bricks &amp; Ounces</span>.
              This page explains how the Early Bird Special works and why each rule exists.
            </p>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
              This is a controlled early distribution. No hype, no countdowns — we grow at the pace we can support.
            </div>
          </div>

          <Link
            to="/blockswap"
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
          >
            ← Back to BlockSwap
          </Link>
        </div>

        {/* Quick Summary */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Quick Summary
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-400">Ownership unit</div>
              <div className="mt-1 text-base font-semibold">Ounces</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Ownership weight is measured in ounces (not dollars). Distributions are ounce-weighted.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-400">Fixed supply</div>
              <div className="mt-1 text-base font-semibold">2,000 bricks • 72,000 ounces</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Supply is capped. No new bricks/ounces can be created by the system.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-400">Buyback protection</div>
              <div className="mt-1 text-base font-semibold text-emerald-200">Buyback Vault</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Each buy automatically funds the vault at the buyback floor per ounce. Buybacks pay from the vault only.
              </p>
            </div>

            <div className="rounded-xl border border-amber-400/20 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-400">Market integrity</div>
              <div className="mt-1 text-base font-semibold text-amber-200">
                Transfers locked (Early Bird)
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Transfers are disabled during Early Bird to prevent manipulation and premature secondary markets.
              </p>
            </div>
          </div>
        </section>

        {/* Mechanics */}
        <section className="grid gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Mechanics
          </h2>

          {/* Supply */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">1) Supply</h3>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                Fixed cap
              </span>
            </div>

            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
              <li>
                Total supply is{" "}
                <span className="font-semibold text-slate-100">1 ton</span>:{" "}
                <span className="font-semibold text-slate-100">2,000 bricks</span>.
              </li>
              <li>
                <span className="font-semibold text-slate-100">1 brick = 36 ounces</span>.
              </li>
              <li>
                Total ownership weight is{" "}
                <span className="font-semibold text-slate-100">72,000 ounces</span>.
              </li>
              <li>No new supply can be minted by the system.</li>
            </ul>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Why this rule exists
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                A hard cap prevents dilution and keeps the ownership model simple:
                the only way to increase your percentage is to own more ounces.
              </p>
            </div>
          </div>

          {/* Buybacks */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">2) Buybacks &amp; Vault Funding</h3>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                Vault-backed
              </span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              When someone buys, the system splits their payment into two buckets:
            </p>

            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                <span>
                  <span className="font-semibold text-slate-100">Buyback Vault:</span>{" "}
                  funded automatically at the buyback floor per ounce (reserved for buybacks).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                <span>
                  <span className="font-semibold text-slate-100">TheBlock:</span>{" "}
                  leftovers (sell price − buyback floor) accumulate here.
                </span>
              </li>
            </ul>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Why this rule exists
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                This creates clear separation between funds reserved for buybacks and funds
                used for operations/growth. It makes the buyback promise measurable:
                if the vault can cover it, instant buyback is possible.
              </p>
            </div>
          </div>

          {/* Transfers */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">3) Transfers (Early Bird Lock)</h3>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                Locked during Early Bird
              </span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Transfers are disabled during Early Bird. You can buy, and you can sell back (if the vault can cover),
              but you can’t transfer ownership between wallets during the Early Bird period.
            </p>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Why this rule exists
              </div>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                <li>Reduces early manipulation and wash-trading.</li>
                <li>Prevents “off-platform” secondary markets during Early Bird.</li>
                <li>Keeps accounting clean while distribution is being formed.</li>
                <li>Encourages fair access during the initial distribution window.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Marketing bullets */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            What you’re actually getting
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-semibold text-slate-100">Fixed ownership weight</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Ounces represent weight inside the capped ownership system.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-semibold text-slate-100">Transparent vault funding</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                The buyback floor portion routes to the Buyback Vault automatically on each buy.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-semibold text-slate-100">Simple rules, simple math</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Ownership % is based on ounces held ÷ circulating ounces.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm font-semibold text-slate-100">Distribution integrity</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Transfer lock prevents early chaos and keeps distribution orderly.
              </p>
            </div>
          </div>
        </section>

        {/* Notes / Disclaimer */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Important notes
          </h2>

          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>
              The Early Bird Special is a rules-based distribution of a fixed internal ownership weight
              (“Bricks &amp; Ounces”). This is not a bank account and not financial advice.
            </p>
            <p>
              Prices, phases, and buyback behavior follow the published rules and admin configuration.
              Buybacks depend on available Buyback Vault funds at the time of request.
            </p>
            <p className="text-xs text-slate-400">
              Demo mode note: in your current build, balances, labels, and vault totals are stored locally in the browser.
              When live, those values would come from on-chain contracts and/or an indexer.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
