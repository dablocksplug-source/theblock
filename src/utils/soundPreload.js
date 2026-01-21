export const soundFiles = [
  "roll.mp3",
  "craps.mp3",
  "natural.mp3",
  "point-hit.mp3",
  "point-set.mp3",
  "seven-out.mp3",
];

export function preloadSounds() {
  soundFiles.forEach((file) => {
    const audio = new Audio(`/sounds/${file}`);
    audio.volume = 0;      // silent preload
    audio.play().catch(() => {});
  });
}
