// src/components/WalletPanel.jsx
import React from "react";
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

  const avatarSeed = walletAddress.slice(2, 8);
  const hasNickname = String(nickname || "").trim().length > 0;

  return (
    <div
      className="
        fixed right-3 z-[80]
        top-[72px] sm:top-4
        bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4
        text-cyan-200 backdrop-blur-lg shadow-[0_0_20px_rgba(56,189,248,0.2)]
      "
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border border-cyan-400/40"
          style={{
            backgroundImage: `url(https://avatars.dicebear.com/api/identicon/${avatarSeed}.svg)`,
            backgroundSize: "cover",
          }}
        />

        <div className="flex flex-col">
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="text-[11px] text-slate-400">{shortAddress}</span>

          {!hasNickname ? (
            <button
              type="button"
              onClick={askForNickname}
              className="text-xs text-emerald-300 hover:text-emerald-200 mt-1"
            >
              Set Nickname
            </button>
          ) : null}

          <button
            type="button"
            onClick={disconnectWallet}
            className="text-xs text-red-400 hover:text-red-300 mt-1"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
