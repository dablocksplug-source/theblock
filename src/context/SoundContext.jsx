import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Master sound switch for the entire app.
 * - Persists in localStorage
 * - Unlocks audio on first user gesture
 * - Provides a simple playSfx(key) API
 *
 * Put your audio files in: /public/sfx/<name>.mp3 (or .m4a/.wav)
 * Example: /public/sfx/click.mp3
 */

const SoundContext = createContext(null);

const STORAGE_KEY = "theblock_sound_enabled_v1";

function safeGetStoredBool(defaultValue = true) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

export function SoundProvider({ children }) {
  const [soundEnabled, setSoundEnabled] = useState(() => safeGetStoredBool(true));

  // Once unlocked, we can reliably call play() without it being blocked
  const unlockedRef = useRef(false);

  // Keep a cache of Audio() objects so we don’t recreate them every render/page
  const audioCacheRef = useRef(new Map());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(soundEnabled));
    } catch {
      // ignore
    }
  }, [soundEnabled]);

  // Unlock audio on first user interaction (required on many browsers)
  useEffect(() => {
    const unlock = async () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;

      try {
        const a = new Audio();
        a.src = "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA"; // tiny stub
        a.volume = 0;
        await a.play();
        a.pause();
      } catch {
        // Some browsers still block until user hits the toggle button — that’s ok.
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggleSound = () => setSoundEnabled((v) => !v);

  const ensureAudio = (key, src) => {
    const cache = audioCacheRef.current;
    if (cache.has(key)) return cache.get(key);

    const audio = new Audio(src);
    audio.preload = "auto";
    cache.set(key, audio);
    return audio;
  };

  /**
   * Play a short sound effect from /public/sfx
   * Example: playSfx("click") -> /sfx/click.mp3
   * You can override extension by passing a full path (ex: "/sounds/swapambience.m4a")
   */
  const playSfx = async (keyOrPath, opts = {}) => {
    if (!soundEnabled) return;

    const { volume = 1, reset = true } = opts;

    // keyOrPath can be "click" or "/sfx/click.mp3" or "/sounds/swapambience.m4a"
    const isPath = keyOrPath.includes("/") || keyOrPath.includes(".");
    const src = isPath ? keyOrPath : `/sfx/${keyOrPath}.mp3`;

    try {
      const audio = ensureAudio(src, src);
      audio.volume = Math.max(0, Math.min(1, volume));

      if (reset) {
        audio.currentTime = 0;
      }

      await audio.play();
    } catch {
      // swallow (autoplay block / missing file / etc.)
    }
  };

  /**
   * Optional: stop all cached sounds
   */
  const stopAll = () => {
    const cache = audioCacheRef.current;
    for (const a of cache.values()) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    }
  };

  const value = useMemo(
    () => ({
      soundEnabled,
      setSoundEnabled,
      toggleSound,
      playSfx,
      stopAll,
    }),
    [soundEnabled]
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used inside <SoundProvider />");
  return ctx;
}
