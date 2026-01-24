// src/config/blockswap.config.js
export const BLOCKSWAP_CONFIG = {
  STORAGE_KEY: "theblock:blockswap:v1",

  // ===== settlement =====
  STABLE_SYMBOL: "USDC",

  // ===== supply model =====
  TOTAL_BRICKS: 2000, // 1 ton
  OUNCES_PER_BRICK: 36,

  // locked forever
  BLOCK_LOCKED_BRICKS: 500,

  // offering cap
  BRICKS_AVAILABLE_FOR_SALE: 1500,

  // starting prices
  SELL_PRICE_PER_BRICK: 1000,
  BUYBACK_FLOOR_PER_BRICK: 500,

  // treasury starts at 0
  STARTING_TREASURY: 0,

  // phase-up rule (policy)
  STARTING_PHASE: 1,
  BRICK_POOL_BY_PHASE: {
    1: 0.30,
    2: 0.35,
    3: 0.40,
  },

  // admin
  ADMIN_WALLET: "0x5CA7541E7E7EA07DC0114D64090Df3f39AF5623c",

  // ✅ marketing + control defaults
  EARLY_BIRD_BADGE_DEFAULT: true, // marketing only
  BUY_PAUSED_DEFAULT: false,      // ONLY buy gate
};
