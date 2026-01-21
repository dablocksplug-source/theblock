// src/components/ActivityBar.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext.jsx";

export default function ActivityBar() {
  const { isConnected, account } = useWallet();
  const [users, setUsers] = useState(0);

  useEffect(() => {
    const interval = setInterval(
      () => setUsers(1200 + Math.floor(Math.random() * 300)),
      4000
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-6 rounded-full bg-slate-900/80 border border-slate-700/60 px-5 py-2 text-xs text-slate-300 backdrop-blur-md shadow-[0_0_15px_rgba(56,189,248,0.15)]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse"></span>
          {isConnected
            ? `Connected: ${account?.slice(0, 6)}...${account?.slice(-4)}`
            : "Wallet Disconnected"}
        </span>
        <span className="text-slate-500">|</span>
        <span>Online users: {users.toLocaleString()}</span>
        <span className="text-slate-500">|</span>
        <span>Network: SimNet v0.2</span>
      </div>
    </div>
  );
}
