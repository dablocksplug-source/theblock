// src/layout/LayoutWrapper.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";

import { useWallet } from "../context/WalletContext";
import NicknameModal from "../components/NicknameModal";
import WalletConnectButton from "../components/WalletConnectButton";

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
  const { isConnected, chainId } = useWallet();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, setToast } = useToast(1600);

  // ✅ SAFETY: default to Base MAINNET if env missing
  const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 8453);

  const wrongChain =
    isConnected &&
    Number(TARGET_CHAIN_ID) > 0 &&
    Number(chainId || 0) > 0 &&
    Number(chainId) !== Number(TARGET_CHAIN_ID);

  // ✅ Single source of truth for routes + "coming soon" gating.
  const navItems = useMemo(
    () => [
      { name: "BlockSwap", path: "/blockswap", enabled: true },

      { name: "BlockBet", path: "/blockbet", enabled: false, soon: "BlockBet is coming soon." },
      { name: "BlockPlay", path: "/blockplay", enabled: false, soon: "BlockPlay is coming soon." },
      { name: "BlockShop", path: "/blockshop", enabled: false, soon: "BlockShop is coming soon." },
      { name: "BlockMarket", path: "/blockmarket", enabled: false, soon: "BlockMarket is coming soon." },
      { name: "BlockPay", path: "/blockpay", enabled: false, soon: "BlockPay is coming soon." },
      { name: "BlockProof", path: "/blockproof", enabled: false, soon: "BlockProof is coming soon." },

      { name: "Lore", path: "/lore", enabled: true },
      { name: "TheAlley", path: "/alley", enabled: false, soon: "TheAlley is coming soon." },
    ],
    []
  );

  const curPath = (location.pathname || "/").replace(/\/+$/, "") || "/";

  function isActive(path) {
    const p = String(path || "/").replace(/\/+$/, "") || "/";
    if (p === "/") return curPath === "/";
    return curPath === p;
  }

  function onNavClick(e, item) {
    if (item.enabled) return;

    e.preventDefault();
    setToast(item.soon || "This district is coming soon.");

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
      {/* ====== TOP BAR (SINGLE SOURCE OF TRUTH) ====== */}
      <header className="w-full py-3 px-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <Link to="/" className="text-cyan-400 text-lg font-semibold">
          The Block
        </Link>

        <div className="text-xs text-slate-500 hidden sm:block">Building slow. Shipping steady.</div>

        <div className="flex items-center gap-2">
          {wrongChain ? (
            <div className="hidden sm:block text-[11px] text-rose-200/90 border border-rose-500/20 bg-rose-500/10 px-2 py-1 rounded-lg">
              Wrong network
            </div>
          ) : null}

          {/* ✅ ONLY wallet UI */}
          <WalletConnectButton
            targetChainId={TARGET_CHAIN_ID}
            size="md"
            label="Connect Wallet"
            onToast={(m) => setToast(String(m || ""))}
            onError={(m) => setToast(String(m || ""))}
          />
        </div>
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

      {/* ✅ Nickname modal is global */}
      <NicknameModal />
    </div>
  );
}