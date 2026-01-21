// src/components/SoundToggle.jsx
import React, { useEffect, useRef } from "react";
import { useSound } from "../context/SoundContext";


export default function SoundToggle() {
  const { soundEnabled, setSoundEnabled } = useSound();
  const audioRef = useRef(null);

  useEffect(() => {
    if (soundEnabled) {
      const audio = new Audio("/sounds/ambience.mp3");
      audio.loop = true;
      audio.volume = 0.08;
      audio.play().catch(() => {});
      audioRef.current = audio;
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [soundEnabled]);

  return (
    <button
      onClick={() => setSoundEnabled((v) => !v)}
      className={`fixed bottom-3 right-3 z-50 rounded-full border border-sky-500/30 bg-slate-900/70 px-3 py-2 text-[10px] text-sky-300 hover:bg-sky-500/10 transition ${
        soundEnabled ? "shadow-[0_0_20px_rgba(56,189,248,0.5)]" : ""
      }`}
    >
      {soundEnabled ? "🔊 Sound On" : "🔈 Sound Off"}
    </button>
  );
}
