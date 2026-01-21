// src/components/BackgroundFX.jsx
import React, { useEffect, useRef } from "react";
import { useUI } from "../context/UIContext.jsx";

export default function BackgroundFX() {
  const { isAudioOn } = useUI();
  const audioRef = useRef(null);

  // Simple ambient loop (very low, toggle via UI)
  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioOn) {
      audioRef.current.volume = 0.12;
      audioRef.current.loop = true;
      const play = audioRef.current.play();
      if (play && play.catch) play.catch(() => {});
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [isAudioOn]);

  return (
    <>
      {/* Animated gradient + subtle vignette */}
      <div
        className="
          fixed inset-0 -z-50
          bg-gradient-to-br from-slate-950 via-slate-900/95 to-sky-900/80
          overflow-hidden
        "
      >
        {/* radial glow core */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        {/* drifting orbs */}
        <div className="pointer-events-none absolute bottom-[-10%] left-[10%] h-64 w-64 rounded-full bg-sky-500/5 blur-3xl animate-orbit-slow" />
        <div className="pointer-events-none absolute top-[15%] right-[5%] h-52 w-52 rounded-full bg-teal-400/7 blur-3xl animate-orbit-slower" />
        {/* scanline / noise overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,253,0.03),transparent_60%)] mix-blend-screen opacity-70" />
        <div className="pointer-events-none scanline-overlay" />
      </div>

      {/* Tiny inline base64 synth pad (silent until toggled) */}
      <audio
        ref={audioRef}
        src="data:audio/wav;base64,UklGRjgAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
      />
    </>
  );
}
