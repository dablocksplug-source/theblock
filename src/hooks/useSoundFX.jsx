// src/hooks/useSoundFX.jsx
import { useRef } from "react";

export function useSoundFX(volume = 0.15) {
  const audioRef = useRef(null);

  const play = (url) => {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => {});
    audioRef.current = audio;
  };

  return { play };
}
