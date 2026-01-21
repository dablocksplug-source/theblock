// src/components/AdminConsole.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUI } from "../context/UIContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";

const quickLinks = [
  { label: "BlockSwap", to: "/blockswap" },
  { label: "BlockBet", to: "/blockbet" },
  { label: "BlockPlay", to: "/blockplay" },
  { label: "BlockPay", to: "/blockpay" },
  { label: "BlockShop", to: "/blockshop" },
  { label: "BlockProof", to: "/blockproof" },
  { label: "Lore", to: "/lore" },
];

export default function AdminConsole() {
  const { isAdminOpen, toggleAdmin, isAudioOn, toggleAudio } = useUI();
  const { walletAddress, isConnected, disconnectWallet } = useWallet();

  const location = useLocation();
  const navigate = useNavigate();

  if (!isAdminOpen) return null;

  const short =
    isConnected && walletAddress
      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : "not connected";

  return (
    <div
      className="
        fixed bottom-4 right-4 z-50
        w-80 rounded-2xl border border-cyan-500/40
        bg-slate-950/95 px-4 py-3
        text-xs text-slate-200 shadow-2xl backdrop-blur-xl
      "
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-cyan-400">THE BLOCK • CONTROL</span>
        <button
          onClick={toggleAdmin}
          className="rounded-full px-2 text-[10px] text-slate-500 hover:bg-slate-800/80 hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Route</span>
          <span className="truncate text-[10px] text-sky-400">
            {location.pathname || "/"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Wallet</span>
          <span
            className={
              "truncate text-[10px] " +
              (isConnected ? "text-emerald-400" : "text-rose-400")
            }
          >
            {short}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Ambient</span>
          <button
            onClick={toggleAudio}
            className={
              "rounded-full px-2 py-[2px] text-[9px] " +
              (isAudioOn
                ? "bg-cyan-500/20 text-cyan-300"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700")
            }
          >
            {isAudioOn ? "ON" : "OFF"}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1">
          {quickLinks.map((link) => (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              className="rounded-lg bg-slate-900/90 px-1.5 py-1 text-[8px] text-sky-300 hover:bg-cyan-500/15 hover:text-cyan-300"
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={() => disconnectWallet?.()}
            className="rounded-lg bg-rose-900/60 px-2 py-[3px] text-[9px] text-rose-300 hover:bg-rose-700/80"
          >
            Disconnect (local)
          </button>
          <span className="text-[8px] text-slate-500">Ctrl+Shift+D to toggle</span>
        </div>
      </div>
    </div>
  );
}
