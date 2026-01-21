// src/pages/NicknameTestPage.jsx
import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useNickname } from "../context/NicknameContext";
import {
  setNickname as setNicknameOnChain,
  getNickname as getNicknameFromChain,
} from "../utils/nicknameAPI";

export default function NicknameTestPage() {
  const { walletAddress } = useWallet();

  // 💡 rename the `useNickname` boolean from context
  const {
    nickname,
    useNickname: useNicknameFlag,   // <-- rename here
    setNickname,
    setUseNickname,
  } = useNickname();

  const [inputValue, setInputValue] = useState(nickname || "");
  const [status, setStatus] = useState(null); // { type: "ok" | "err", msg: string }

  const handleSetClick = async () => {
    console.log("✅ Set nickname button CLICKED");
    alert("Set Nickname clicked (test)");

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
      setStatus({ type: "ok", msg: "Calling setNicknameOnChain…" });
      console.log("calling setNicknameOnChain with:", trimmed);

      await setNicknameOnChain(trimmed);

      // update local context so the rest of the app sees it
      setNickname(trimmed);
      setUseNickname(true);

      setStatus({ type: "ok", msg: "Nickname saved on chain ✔" });
    } catch (err) {
      console.error("Nickname set error:", err);
      setStatus({
        type: "err",
        msg: err.message || "Failed to set nickname.",
      });
    }
  };

  return (
    <div style={{ padding: "2rem", color: "#e5e7eb" }}>
      <h1>Nickname Test Page</h1>

      <p>Wallet: {walletAddress || "Not connected"}</p>
      <p>Current nickname in context: {nickname || "(none)"} </p>
      <p>useNickname flag: {useNicknameFlag ? "ON" : "OFF"}</p>

      <div style={{ marginTop: "1rem" }}>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="New nickname"
          style={{ padding: "0.25rem 0.5rem", marginRight: "0.5rem" }}
        />
        <button onClick={handleSetClick}>Set Nickname (TEST)</button>
      </div>

      {status && (
        <div
          style={{
            marginTop: "0.75rem",
            color: status.type === "err" ? "#fca5a5" : "#bbf7d0",
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
