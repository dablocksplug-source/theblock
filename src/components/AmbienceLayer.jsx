// src/components/AmbienceLayer.jsx
import React, { useEffect, useState } from "react";

export default function AmbienceLayer() {
  const [phase, setPhase] = useState("dusk");
  const [residents, setResidents] = useState(128);

  // cycle ambience
  useEffect(() => {
    const phases = ["dusk", "night", "dawn"];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % phases.length;
      setPhase(phases[i]);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // mock “residents online”
  useEffect(() => {
    const t = setInterval(() => {
      setResidents((r) => r + (Math.random() > 0.5 ? 1 : -1));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const colors = {
    dusk: "from-slate-800 via-tealbrand/30 to-slate-900",
    night: "from-slate-900 via-black to-indigo-950",
    dawn: "from-blue-800 via-rose-500/20 to-amber-300/10",
  };

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div
        className={`absolute inset-0 bg-gradient-to-b ${colors[phase]} transition-all duration-[8000ms]`}
      />
      <div className="absolute top-4 right-6 text-xs text-blockgold/70 bg-blockslate/50 px-3 py-1 rounded-full backdrop-blur-md border border-blockgold/10 shadow-sm">
        🟢 {residents} Residents Online
      </div>

      {/* street-lamp dots */}
      <div className="absolute bottom-10 left-16 h-2 w-2 bg-blockgold/50 rounded-full blur-[3px] animate-pulse" />
      <div className="absolute bottom-10 right-16 h-2 w-2 bg-blockgold/50 rounded-full blur-[3px] animate-pulse delay-200" />
    </div>
  );
}
