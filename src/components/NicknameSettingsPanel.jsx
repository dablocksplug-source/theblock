// src/components/NicknameSettingsPanel.jsx
  import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext } from "../context/NicknameContext";
import {
  setNickname as setNicknameOnChain,
  getNickname as getNicknameFromChain,
} from "../utils/nicknameAPI";
                         

// Optional: if your modal passes an onClose prop
const NicknameSettingsPanel = ({ onClose }) => {
  const { walletAddress } = useWallet();
const {
  nickname,
  useNickname,
  setNickname,
  setUseNickname,
} = useNicknameContext();


  const [inputValue, setInputValue] = useState(nickname || "");
  const [status, setStatus] = useState(null);   // { type: "ok" | "err", msg: string }
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setStatus(null);

    if (!walletAddress) {
      setStatus({ type: "err", msg: "Connect your wallet first." });
      return;
    }

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setStatus({ type: "err", msg: "Enter a nickname first." });
      return;
    }

    try {
      setLoading(true);

      // 1) write to chain
      await setNicknameOnChain(trimmed);

      // 2) read back from chain to confirm
      let chainName;
      try {
        chainName = await getNicknameFromChain(walletAddress);
      } catch {
        chainName = trimmed;
      }

      // 3) update context & enable nickname usage
      setNickname(chainName || trimmed);
      setUseNickname(true);

      setStatus({
        type: "ok",
        msg: `Nickname set to "${chainName || trimmed}".`,
      });
    } catch (err) {
      console.error("Nickname save error:", err);
      setStatus({
        type: "err",
        msg: err.message || "Failed to set nickname on-chain.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nickname-panel">
      <div className="nickname-panel-header">
        <h2 className="nickname-panel-title">Nickname Settings</h2>
        {onClose && (
          <button
            type="button"
            className="nickname-panel-close"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>

      <div className="nickname-panel-body">
        <div className="nickname-wallet-line">
          <span className="nickname-label">Wallet:</span>
          <span className="nickname-wallet">
            {walletAddress || "Not connected"}
          </span>
        </div>

        <label className="nickname-label" style={{ marginTop: 10 }}>
          Nickname (stored on-chain)
        </label>
        <input
          type="text"
          className="nickname-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="ex: CajunShooter"
        />

        <label className="nickname-toggle-row">
          <input
            type="checkbox"
            checked={useNickname}
            onChange={(e) => setUseNickname(e.target.checked)}
          />
          <span>Use nickname instead of wallet across The Block</span>
        </label>

        <button
          type="button"
          className="nickname-save-btn"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? "Saving…" : "Set Nickname"}
        </button>

        {status && (
          <div
            className={
              status.type === "ok"
                ? "nickname-status nickname-status-ok"
                : "nickname-status nickname-status-err"
            }
          >
            {status.msg}
          </div>
        )}
      </div>
    </div>
  );
};

export default NicknameSettingsPanel;
