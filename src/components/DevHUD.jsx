// src/components/DevHUD.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext.jsx";

export default function DevHUD() {
  const { isConnected, address, chainId } = useWallet();
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let raf;

    const loop = (time) => {
      frame++;
      const diff = time - last;
      if (diff >= 500) {
        setFps(Math.round((frame / diff) * 1000));
        frame = 0;
        last = time;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed bottom-3 left-3 z-40 rounded-xl bg-slate-950/70 px-3 py-2 text-[9px] text-sky-400/70 border border-sky-500/20 backdrop-blur-md pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
        <span>{isConnected ? "Wallet: connected" : "Wallet: none"}</span>
      </div>
      {isConnected && (
        <>
          <div className="truncate max-w-[160px]">
            {address?.slice(0, 10)}...
          </div>
          <div>Chain: {chainId}</div>
        </>
      )}
      <div>FPS~{fps}</div>
    </div>
  );
}
