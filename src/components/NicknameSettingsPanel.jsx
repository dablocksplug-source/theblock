// src/components/NicknameSettingsPanel.jsx
import React, { useMemo, useState } from "react";
import { useNicknameContext } from "../context/NicknameContext";
import { useWallet } from "../context/WalletContext";

export default function NicknameSettingsPanel() {
  const { walletAddress, isConnected } = useWallet();
  const { nickname, useNickname, setUseNickname, askForNickname } = useNicknameContext();

  const display = useMemo(() => {
    const n = (nickname || "").trim();
    if (useNickname && n) return n;
    if (!walletAddress) return "—";
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }, [nickname, useNickname, walletAddress]);

  const [localErr, setLocalErr] = useState("");

  const onToggle = () => {
    setLocalErr("");
    setUseNickname(!useNickname);
  };

  const onEdit = () => {
    setLocalErr("");
    if (!isConnected) {
      setLocalErr("Connect your wallet first.");
      return;
    }
    askForNickname();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-white/60">Display Name</div>
          <div className="text-base font-semibold text-white">{display}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            type="button"
          >
            Set Nickname
          </button>

          <button
            onClick={onToggle}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            type="button"
            title="Toggle nickname on/off"
          >
            {useNickname ? "Using Nick" : "Using Address"}
          </button>
        </div>
      </div>

      {localErr ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {localErr}
        </div>
      ) : null}
    </div>
  );
}
