// src/pages/BlockPay.jsx
import React from "react";
import { useWallet } from "../context/WalletContext.jsx";

const MERCHANTS = [
  { name: "Downtown Market Co.", status: "Live" },
  { name: "City Brew Coffee", status: "Live" },
  { name: "Riverside Streetwear", status: "Live" },
  { name: "Metro Tech Repair", status: "Coming Soon" },
  { name: "Skyline Fitness Studio", status: "Live" },
  { name: "Harbor Grill & Bar", status: "Coming Soon" },
  { name: "Cornerstone Print Shop", status: "Live" },
  { name: "Neon Nights Lounge", status: "Coming Soon" },
];

const BlockPay = () => {
  const { account, connectWallet } = useWallet();

  return (
    <div className="relative min-h-[calc(100vh-140px)] w-full flex flex-col items-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden">
      {/* Background glows */}
      <div className="pointer-events-none absolute w-[420px] h-[420px] bg-cyan-500/18 rounded-full blur-3xl -top-16 -left-24" />
      <div className="pointer-events-none absolute w-[460px] h-[460px] bg-emerald-500/14 rounded-full blur-3xl top-40 -right-32" />

      <div className="relative z-10 w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-16 flex flex-col gap-10">
        {/* HERO */}
        <section className="relative text-center mb-2">
          {/* halo behind title */}
          <div className="pointer-events-none absolute inset-x-0 -top-8 h-28 bg-gradient-to-b from-cyan-500/30 via-emerald-500/15 to-transparent blur-3xl" />

          <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/80 border border-slate-700/70 text-[11px] sm:text-xs text-slate-300 tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>The Block • Small Business Rails</span>
          </div>

          <h1 className="relative mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold text-cyan-400 drop-shadow-[0_0_26px_rgba(34,211,238,0.9)]">
            BlockPay Merchant Hub
          </h1>

          <p className="relative mt-3 text-sm md:text-base text-slate-300 max-w-2xl mx-auto">
            Accept BDAG from the streets of The Block and get settled in stable
            value. Fast, clean, and verified. Built for real businesses, not
            hype.
          </p>
        </section>

        {/* HOW IT WORKS + FEE */}
        <section className="grid md:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-4 md:gap-6 text-xs sm:text-sm">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-950/80 border border-cyan-500/25 p-4 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <h3 className="text-cyan-300 font-semibold mb-1 text-sm sm:text-base">
                1. Sign Up
              </h3>
              <p className="text-slate-400 text-[11px] sm:text-xs">
                Share your business details. We set you up with a BlockPay
                profile and payout preferences.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950/80 border border-cyan-500/25 p-4 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <h3 className="text-cyan-300 font-semibold mb-1 text-sm sm:text-base">
                2. Get Your QR
              </h3>
              <p className="text-slate-400 text-[11px] sm:text-xs">
                Receive a unique QR/payment link your customers scan to pay in
                BDAG at the counter, table, or truck.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950/80 border border-cyan-500/25 p-4 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <h3 className="text-cyan-300 font-semibold mb-1 text-sm sm:text-base">
                3. Settle Clean
              </h3>
              <p className="text-slate-400 text-[11px] sm:text-xs">
                BDAG in, USDT out — through The Block&apos;s swap rails — keeping
                your books stable and your day-to-day simple.
              </p>
            </div>
          </div>

          {/* Fee card */}
          <div className="rounded-2xl bg-slate-950/90 border border-emerald-400/30 p-4 sm:p-5 flex flex-col justify-center shadow-[0_0_26px_rgba(16,185,129,0.45)]">
            <h3 className="text-emerald-300 font-semibold mb-2 text-sm sm:text-base">
              Network Fee
            </h3>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl sm:text-4xl font-extrabold text-emerald-400">
                2.8%
              </span>
              <span className="text-slate-300 text-xs sm:text-sm">
                per transaction
              </span>
            </div>
            <p className="text-slate-300 text-[11px] sm:text-xs">
              Covers gas, BDAG → USDT conversion, security, and keeps BlockPay
              running tight — still often under typical card fees.
            </p>
            <p className="text-slate-500 text-[10px] mt-2">
              No monthly minimums, no hidden add-ons. You pay when customers
              actually tap in.
            </p>
          </div>
        </section>

        {/* MERCHANT STATUS + JOIN FORM */}
        <section className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch">
          {/* Status */}
          <div className="flex-1 rounded-2xl bg-slate-950/80 border border-cyan-500/25 p-4 sm:p-5 shadow-[0_0_20px_rgba(34,211,238,0.25)] text-xs sm:text-sm">
            <h2 className="text-cyan-300 font-semibold mb-2 text-sm sm:text-base">
              Merchant Status
            </h2>
            {account ? (
              <>
                <p className="text-slate-300 mb-1 text-[11px] sm:text-xs">
                  Wallet connected. You&apos;re ready for onboarding checks.
                </p>
                <p className="font-mono text-[10px] sm:text-[11px] text-cyan-300 break-all bg-slate-900/80 rounded-lg px-3 py-2 border border-slate-700/80">
                  {account}
                </p>
                <p className="text-slate-500 text-[10px] sm:text-[11px] mt-2">
                  Final verification, payout setup, and QR assignment will be
                  handled by The Block team when this goes live.
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-300 mb-3 text-[11px] sm:text-xs">
                  Connect a wallet you intend to use for payouts and
                  verification.
                </p>
                <button
                  onClick={connectWallet}
                  className="bg-cyan-500/95 hover:bg-cyan-400 text-slate-950 font-semibold py-2 px-5 rounded-xl shadow-[0_0_22px_rgba(34,211,238,0.7)] transition-all duration-300 text-xs sm:text-sm"
                >
                  Connect Wallet
                </button>
                <p className="text-slate-500 text-[10px] sm:text-[11px] mt-2">
                  This is a visual demo. In production, connected wallets would
                  be tied to your merchant profile.
                </p>
              </>
            )}
          </div>

          {/* Join form */}
          <div className="flex-1 rounded-2xl bg-slate-950/85 border border-cyan-500/25 p-4 sm:p-5 shadow-[0_0_22px_rgba(34,211,238,0.35)] text-xs sm:text-sm">
            <h2 className="text-cyan-300 font-semibold mb-2 text-sm sm:text-base">
              Join BlockPay
            </h2>
            <p className="text-slate-400 mb-3 text-[10px] sm:text-[11px]">
              Drop your info below. When the backend is live, this will submit
              directly to The Block team for onboarding.
            </p>
            <div className="space-y-2.5">
              <input
                type="text"
                placeholder="Business name"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <input
                type="text"
                placeholder="Contact email"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <input
                type="text"
                placeholder="Business type (e.g. retail, food, services)"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button
                className="w-full mt-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-semibold text-[11px] sm:text-xs shadow-[0_0_22px_rgba(34,211,238,0.7)] transition-all duration-300"
              >
                Submit Interest (Demo Only)
              </button>
            </div>
            <p className="mt-3 text-[9px] sm:text-[10px] text-slate-500">
              For direct support or early onboarding, contact:{" "}
              <span className="text-cyan-400">support@blockpay.example</span>
            </p>
          </div>
        </section>

        {/* MERCHANT DIRECTORY */}
        <section className="pb-2">
          <h2 className="text-sm sm:text-base font-semibold text-cyan-300 mb-2">
            Businesses on BlockPay (Preview)
          </h2>
          <div className="max-h-56 sm:max-h-64 overflow-y-auto space-y-2 pr-1 text-[10px] sm:text-[11px]">
            {MERCHANTS.map((m, i) => (
              <div
                key={`${m.name}-${i}`}
                className="flex items-center justify-between rounded-2xl bg-slate-950/90 border border-cyan-500/18 px-4 py-2 shadow-[0_0_14px_rgba(34,211,238,0.22)]"
              >
                <div className="mr-3">
                  <div className="font-semibold text-slate-100">
                    {m.name}
                  </div>
                  <div className="text-slate-500 text-[9px] sm:text-[10px]">
                    Verified merchant • The Block Network
                  </div>
                </div>
                <div
                  className={`px-2.5 py-[4px] rounded-full text-[9px] sm:text-[10px] whitespace-nowrap ${
                    m.status === "Live"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/40"
                      : "bg-yellow-500/10 text-yellow-300 border border-yellow-400/35"
                  }`}
                >
                  {m.status}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[9px] sm:text-[10px] text-slate-500">
            This list is illustrative. In production, it will update automatically
            as merchants onboard into BlockPay.
          </p>
        </section>
      </div>
    </div>
  );
};

export default BlockPay;
