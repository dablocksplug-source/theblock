// src/config/presale.config.js

// ✅ When true, ONLY allow the routes below (everything else redirects)
export const PRESALE_MODE = true;

// ✅ Allowed routes while the rest of The Block is under construction
export const PRESALE_ALLOWLIST = new Set([
  "/",                           // Home
  "/blockswap",                  // BlockSwap
  "/blockswap/early-bird-rules", // Rules page
  "/blockswap/presale-rules",    // Old rules URL (redirects, but allow it)
  "/lore",                       // Lore / info
  "/investor"                    // Reading / investor overview
]);
