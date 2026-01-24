import React from "react";
import { useSound } from "../context/SoundContext";

export default function SoundToggle({ className = "" }) {
  const { soundEnabled, toggleSound, playSfx } = useSound();

  const onClick = async () => {
    // If sound is currently OFF, user is turning it ON:
    // enable first, then play click so the click confirms audio is working.
    if (!soundEnabled) {
      toggleSound();
      // tiny delay ensures state flips + browser gesture is captured
      setTimeout(() => playSfx("click", { volume: 0.8 }), 0);
      return;
    }

    // If sound is currently ON, user is turning it OFF:
    // play click first, then disable.
    await playSfx("click", { volume: 0.8 });
    toggleSound();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
        "border border-white/15 bg-black/30 backdrop-blur",
        "text-sm font-semibold text-white hover:bg-black/45",
        "transition",
        className,
      ].join(" ")}
      aria-label={soundEnabled ? "Sound on" : "Sound off"}
      title={soundEnabled ? "Sound: ON" : "Sound: OFF"}
    >
      <span
        className={[
          "h-2.5 w-2.5 rounded-full",
          soundEnabled ? "bg-emerald-400" : "bg-red-400",
        ].join(" ")}
      />
      <span>{soundEnabled ? "Sound On" : "Sound Off"}</span>
    </button>
  );
}
