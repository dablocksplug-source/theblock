// src/layout/LayoutWrapper.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";

import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

import WalletPanel from "../components/WalletPanel";
import NicknameModal from "../components/NicknameModal";

export default function LayoutWrapper({ children }) {
  const {
    walletAddress,
    isConnected,
    disconnectWallet,
    connectMetaMask,
    connectCoinbase,
    connectWalletConnect,
    connectStatus, // optional from your context (pending/idle)
  } = useWallet();

  const { nickname, useNickname } = useNicknameContext();
  const location = useLocation();

  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  // close dropdown on route change
  useEffect(() => {
    setOpen(false);
    setErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const navItems = [
    { name: "BlockSwap", path: "/blockswap" },
    { name: "BlockBet", path: "/blockbet" },
    { name: "BlockPlay", path: "/blockplay" },
    { name: "BlockShop", path: "/blockshop" },
    { name: "BlockPay", path: "/blockpay" },
    { name: "BlockProof", path: "/blockproof" },
    { name: "Lore", path: "/lore" },
  ];

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });

  const shortAddress = useMemo(() => {
    if (!walletAddress) return "Not connected";
    return walletAddress.length > 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress;
  }, [walletAddress]);

  const walletChipLabel = useMemo(() => {
    if (!isConnected) return "Connect";
    const dn = String(displayName || "").trim() || "Wallet";
    const dnShort = dn.length > 18 ? `${dn.slice(0, 18)}…` : dn;
    return `${dnShort} (${shortAddress})`;
  }, [isConnected, displayName, shortAddress]);

  const disabledConnecting = connectStatus === "pending";

  const TopConnectDropdown = () => {
    if (isConnected) {
      return (
        <button
          onClick={() => {
            setErr("");
            disconnectWallet?.();
          }}
          className="text-sm px-3 py-1.5 rounded-xl border border-rose-400/30 text-rose-300 hover:border-rose-300/50"
          type="button"
          title="Disconnect wallet"
        >
          {walletChipLabel} — Disconnect
        </button>
      );
    }

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setErr("");
            setOpen((v) => !v);
          }}
          className="text-sm px-3 py-1.5 rounded-xl border border-cyan-400/30 text-cyan-300 hover:border-cyan-300/60"
          aria-expanded={open ? "true" : "false"}
        >
          Connect Wallet
        </button>

        {open ? (
          <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl z-50">
            <button
              type="button"
              disabled={disabledConnecting}
              onClick={async () => {
                try {
                  setErr("");
                  await connectMetaMask?.();
                  setOpen(false);
                } catch (e) {
                  setErr(e?.message || "MetaMask connect failed.");
                }
              }}
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900 disabled:opacity-50"
            >
              MetaMask
            </button>

            <button
              type="button"
              disabled={disabledConnecting}
              onClick={async () => {
                try {
                  setErr("");
                  await connectCoinbase?.();
                  setOpen(false);
                } catch (e) {
                  setErr(e?.message || "Coinbase connect failed.");
                }
              }}
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900 disabled:opacity-50"
            >
              Coinbase
            </button>

            <button
              type="button"
              disabled={disabledConnecting}
              onClick={async () => {
                try {
                  setErr("");
                  await connectWalletConnect?.();
                  setOpen(false);
                } catch (e) {
                  setErr(e?.message || "WalletConnect failed. Check VITE_WC_PROJECT_ID in Vercel.");
                }
              }}
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900 disabled:opacity-50"
            >
              WalletConnect
            </button>

            <div className="border-t border-slate-800/80 px-4 py-2 text-[11px] text-slate-400">
              Tip: On mobile, use WalletConnect.
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* ====== TOP BAR ====== */}
      <header className="w-full py-3 px-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-cyan-400 text-lg font-semibold">
            The Block
          </Link>

          {/* ✅ Top header quick links (placeholders for later) */}
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <Link to="/blockmarket" className="text-slate-400 hover:text-cyan-200">
              BlockMarket
            </Link>
            <span className="text-slate-700">•</span>
            <Link to="/thealley" className="text-slate-400 hover:text-cyan-200">
              TheAlley
            </Link>
          </div>
        </div>

        <div className="text-xs text-slate-500 hidden md:block">
          Building slow. Shipping steady.
        </div>

        <div className="flex items-center gap-3">
          <TopConnectDropdown />
          {/* HUD panel with avatar + nickname + disconnect */}
          <WalletPanel />
        </div>
      </header>

      {/* optional error banner (connect errors etc) */}
      {err ? (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-6 py-2 text-xs text-rose-200">
          {err}
        </div>
      ) : null}

      {/* ====== NAV ROW ====== */}
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
      <main className="px-6 py-10">{children ?? <Outlet />}</main>

      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} The Block.
      </footer>

      {/* Nickname modal is self-managed (reads modalOpen from context) */}
      <NicknameModal />
    </div>
  );
}
