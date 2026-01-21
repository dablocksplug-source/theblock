// src/config/presale.config.js
export const PRESALE_MODE = false; // <-- flip to true when you're ready to mute the rest

// Allowed routes during presale
export const PRESALE_ALLOWLIST = new Set([
  "/",          // TheBlock page (home)
  "/blockswap", // presale
  "/lore",      // optional (leave if you want read-only pages)
  "/blockproof" // optional
]);
