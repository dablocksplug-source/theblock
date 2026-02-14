// src/layout/LayoutWrapper.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";

import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

import WalletPanel from "../components/WalletPanel";
import NicknameModal from "../components/NicknameModal";

// ✅ Simple toast helper (no libs)
function useToast(ms = 1600) {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), ms);
    return () => clearTimeout(t);
  }, [toast, ms]);
  return { toast, setToast };
}

export default function LayoutWrapper({ children }) {
  const { walletAddress, connectWallet, disconnectWallet, isConnected } = useWallet();
  const { nickname, useNickname } = useNicknameContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, setToast } = useToast(1600);

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });

  const shortAddress =
    walletAddress && walletAddress.length > 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress || "Not connected";

  const walletButtonLabel = isConnected
    ? `${displayName} (${shortAddress}) — Disconnect`
    : "Connect Wallet";

  // ✅ Single source of truth for routes + "coming soon" gating.
  // Flip `enabled: true` when a district is ready.
  const navItems = useMemo(
    () => [
      { name: "BlockSwap", path: "/blockswap", enabled: true },

      { name: "BlockBet", path: "/blockbet", enabled: false, soon: "BlockBet is coming soon." },
      { name: "BlockPlay", path: "/blockplay", enabled: false, soon: "BlockPlay is coming soon." },
      { name: "BlockShop", path: "/blockshop", enabled: false, soon: "BlockShop is coming soon." },
      { name: "BlockMarket", path: "/blockmarket", enabled: false, soon: "BlockMarket is coming soon." },
      { name: "BlockPay", path: "/blockpay", enabled: false, soon: "BlockPay is coming soon." },
      { name: "BlockProof", path: "/blockproof", enabled: false, soon: "BlockProof is coming soon." },

      // Info routes
      { name: "Lore", path: "/lore", enabled: true },

      // ✅ IMPORTANT: Align with main.jsx (we use /alley, NOT /thealley)
      { name: "TheAlley", path: "/alley", enabled: false, soon: "TheAlley is coming soon." },
    ],
    []
  );

  // Normalize for active state (strip trailing slashes)
  const curPath = (location.pathname || "/").replace(/\/+$/, "") || "/";

  function isActive(path) {
    const p = String(path || "/").replace(/\/+$/, "") || "/";
    if (p === "/") return curPath === "/";
    return curPath === p;
  }

  function onNavClick(e, item) {
    if (item.enabled) return;

    // block navigation for disabled items
    e.preventDefault();
    setToast(item.soon || "This district is coming soon.");

    // If user is NOT already on BlockSwap, gently send them there after a moment
    if (curPath !== "/blockswap") {
      setTimeout(() => {
        try {
          navigate("/blockswap");
        } catch {}
      }, 250);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* ====== TOP BAR ====== */}
      <header className="w-full py-3 px-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <Link to="/" className="text-cyan-400 text-lg font-semibold">
          The Block
        </Link>

        <div className="text-xs text-slate-500 hidden sm:block">Building slow. Shipping steady.</div>

        <button
          onClick={isConnected ? disconnectWallet : connectWallet}
          className={`text-sm px-3 py-1.5 rounded-xl border ${
            isConnected ? "border-rose-400/30 text-rose-300" : "border-cyan-400/30 text-cyan-300"
          }`}
          type="button"
        >
          {walletButtonLabel}
        </button>

        {/* HUD panel with avatar + nickname + disconnect */}
        <WalletPanel />
      </header>

      {/* ✅ Lightweight toast */}
      {toast ? (
        <div className="sticky top-[64px] z-40 mx-auto max-w-6xl px-4 pt-2">
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {toast}
            <button
              type="button"
              className="ml-3 text-xs text-amber-100 underline underline-offset-2"
              onClick={() => {
                setToast("");
                if (curPath !== "/blockswap") navigate("/blockswap");
              }}
              title="Go to BlockSwap"
            >
              Go to BlockSwap
            </button>
          </div>
        </div>
      ) : null}

      {/* ====== DISTRICT NAV ROW ====== */}
      <nav className="bg-slate-900/60 border-b border-slate-800/40">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-6 py-3 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700/60">
            {navItems.map((item) => {
              const active = isActive(item.path);
              const base = active ? "text-cyan-300 font-semibold" : "text-slate-400 hover:text-cyan-200";

              const disabled = !item.enabled;
              const disabledCls = disabled ? "opacity-60 cursor-not-allowed" : "";

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={(e) => onNavClick(e, item)}
                  className={`${base} ${disabledCls}`}
                  title={disabled ? item.soon || "Coming soon" : item.name}
                >
                  {item.name}
                  {disabled ? <span className="ml-2 text-[10px] text-slate-500">(soon)</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ====== MAIN CONTENT ====== */}
      <main className="px-6 py-10">{children ?? <Outlet />}</main>

      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} The Block.
      </footer>

      {/* Nickname modal is self-managed */}
      <NicknameModal />
    </div>
  );
}
