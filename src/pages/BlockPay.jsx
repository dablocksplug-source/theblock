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
  const { walletAddress, isConnected } = useWallet();

  return (
    <div className="relative min-h-[calc(100vh-140px)] w-full flex flex-col items-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden">
      <div className="pointer-events-none absolute w-[420px] h-[420px] bg-cyan-500/18 rounded-full blur-3xl -top-16 -left-24" />
      <div className="pointer-events-none absolute w-[460px] h-[460px] bg-emerald-500/14 rounded-full blur-3xl top-40 -right-32" />

      <div className="relative z-10 w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-16 flex flex-col gap-10">
        {/* HERO */}
        <section className="relative text-center mb-2">
          <div className="pointer-events-none absolute inset-x-0 -top-8 h-28 bg-gradient-to-b from-cyan-500/30 via-emerald-500/15 to-transparent blur-3xl" />

          <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/80 border border-slate-700/70 text-[11px] sm:text-xs text-slate-300 tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>The Block • Small Business Rails</span>
          </div>

          <h1 className="relative mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold text-cyan-400 drop-shadow-[0_0_26px_rgba(34,211,238,0.9)]">
            BlockPay Merchant Hub
          </h1>

          <p className="relative mt-3 text-sm md:text-base text-slate-300 max-w-2xl mx-auto">
            Accept BDAG from the streets of The Block and get settled in stable value.
          </p>
        </section>

        {/* ... your HOW IT WORKS section stays unchanged ... */}

        {/* MERCHANT STATUS + JOIN FORM */}
        <section className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch">
          <div className="flex-1 rounded-2xl bg-slate-950/80 border border-cyan-500/25 p-4 sm:p-5 shadow-[0_0_20px_rgba(34,211,238,0.25)] text-xs sm:text-sm">
            <h2 className="text-cyan-300 font-semibold mb-2 text-sm sm:text-base">
              Merchant Status
            </h2>

            {isConnected && walletAddress ? (
              <>
                <p className="text-slate-300 mb-1 text-[11px] sm:text-xs">
                  Wallet connected. You&apos;re ready for onboarding checks.
                </p>
                <p className="font-mono text-[10px] sm:text-[11px] text-cyan-300 break-all bg-slate-900/80 rounded-lg px-3 py-2 border border-slate-700/80">
                  {walletAddress}
                </p>
                <p className="text-slate-500 text-[10px] sm:text-[11px] mt-2">
                  Final verification, payout setup, and QR assignment will be handled by The Block team.
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-300 mb-3 text-[11px] sm:text-xs">
                  Connect a wallet you intend to use for payouts and verification.
                </p>

                <button
                  type="button"
                  className="rounded-xl px-4 py-2 text-sm font-semibold border border-cyan-400/30 text-cyan-200 hover:border-cyan-300/50 bg-slate-950/30"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  title="Use the top bar Connect Wallet"
                >
                  Connect Wallet (top bar)
                </button>

                <p className="text-slate-500 text-[10px] sm:text-[11px] mt-2">
                  This is a visual demo. In production, connected wallets would be tied to your merchant profile.
                </p>
              </>
            )}
          </div>

          {/* Join form stays unchanged */}
          {/* ... keep your existing join form exactly as-is ... */}
        </section>

        {/* MERCHANT DIRECTORY stays unchanged */}
        {/* ... keep your existing directory exactly as-is ... */}
      </div>
    </div>
  );
};

export default BlockPay;
