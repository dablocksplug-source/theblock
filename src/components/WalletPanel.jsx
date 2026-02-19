// src/components/WalletPanel.jsx
import React, { useMemo } from "react";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

export default function WalletPanel() {
  const { walletAddress, disconnectWallet, isConnected } = useWallet();
  const { nickname, useNickname, askForNickname } = useNicknameContext();

  if (!isConnected || !walletAddress) return null;

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });

  const shortAddress =
    walletAddress.length > 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress;

  // stable seed
  const avatarSeed = useMemo(() => String(walletAddress || "").toLowerCase(), [walletAddress]);

  // ✅ modern dicebear endpoint
  const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
    avatarSeed
  )}`;

  return (
    // ✅ Desktop-only HUD. On mobile it causes overlap with nav + header.
    <div className="hidden sm:block fixed top-4 right-4 z-30">
      <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4 text-cyan-200 backdrop-blur-lg shadow-[0_0_20px_rgba(56,189,248,0.2)]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border border-cyan-400/40 bg-slate-950"
            style={{
              backgroundImage: `url(${avatarUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />

          <div className="flex flex-col min-w-[160px]">
            <span className="text-sm font-semibold leading-tight">{displayName}</span>
            <span className="text-[11px] text-slate-400">{shortAddress}</span>

            {!nickname ? (
              <button
                type="button"
                onClick={() => askForNickname?.()}
                className="text-xs text-emerald-400 hover:text-emerald-200 mt-1 text-left"
              >
                Set Nickname
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => disconnectWallet?.()}
              className="text-xs text-rose-400 hover:text-rose-300 mt-1 text-left"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
