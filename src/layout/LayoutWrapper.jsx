// src/layout/LayoutWrapper.jsx
import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";

import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

import WalletPanel from "../components/WalletPanel";
import NicknameModal from "../components/NicknameModal";

export default function LayoutWrapper({ children }) {
  const { walletAddress, connectWallet, disconnectWallet, isConnected } = useWallet();
  const { nickname, useNickname } = useNicknameContext();
  const location = useLocation();

  // ✅ DISTRICT NAV (BlockMarket added, TheAlley last)
  const navItems = [
    { name: "BlockSwap", path: "/blockswap" },
    { name: "BlockBet", path: "/blockbet" },
    { name: "BlockPlay", path: "/blockplay" },
    { name: "BlockShop", path: "/blockshop" },
    { name: "BlockMarket", path: "/blockmarket" }, // ✅ NEW
    { name: "BlockPay", path: "/blockpay" },
    { name: "BlockProof", path: "/blockproof" },
    { name: "Lore", path: "/lore" },
    { name: "TheAlley", path: "/thealley" }, // ✅ LAST
  ];

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });

  const shortAddress =
    walletAddress && walletAddress.length > 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress || "Not connected";

  const walletButtonLabel = isConnected
    ? `${displayName} (${shortAddress}) — Disconnect`
    : "Connect Wallet";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* ====== TOP BAR ====== */}
      <header className="w-full py-3 px-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <Link to="/" className="text-cyan-400 text-lg font-semibold">
          The Block
        </Link>

        <div className="text-xs text-slate-500 hidden sm:block">
          Building slow. Shipping steady.
        </div>

        <button
          onClick={isConnected ? disconnectWallet : connectWallet}
          className={`text-sm px-3 py-1.5 rounded-xl border ${
            isConnected
              ? "border-rose-400/30 text-rose-300"
              : "border-cyan-400/30 text-cyan-300"
          }`}
          type="button"
        >
          {walletButtonLabel}
        </button>

        {/* HUD panel with avatar + nickname + disconnect */}
        <WalletPanel />
      </header>

      {/* ====== DISTRICT NAV ROW ====== */}
      <nav className="bg-slate-900/60 border-b border-slate-800/40">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-6 py-3 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700/60">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={
                  location.pathname === item.path
                    ? "text-cyan-300 font-semibold"
                    : "text-slate-400 hover:text-cyan-200"
                }
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* ====== MAIN CONTENT ====== */}
      <main className="px-6 py-10">
        {children ?? <Outlet />}
      </main>

      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} The Block.
      </footer>

      {/* Nickname modal is self-managed */}
      <NicknameModal />
    </div>
  );
}
