// src/config/blockswap.config.js
// Vite ONLY exposes env vars prefixed with VITE_
// You MUST restart `npm run dev` after changing .env.local.

const ENV = import.meta.env || {};

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ✅ SAFETY: default to Base MAINNET if env is missing/mis-set
// This prevents silent fallback to Sepolia (84532) in production builds.
const CHAIN_ID = num(ENV.VITE_CHAIN_ID, 8453);

// Only Base mainnet (8453) and Base Sepolia (84532) are supported in BlockSwap config.
const IS_MAINNET = CHAIN_ID === 8453;
const IS_SEPOLIA = CHAIN_ID === 84532;

if (!IS_MAINNET && !IS_SEPOLIA) {
  // Fail fast (especially helpful for avoiding “B3 accidentally set” breaking BlockSwap)
  throw new Error(
    `[BlockSwap] Unsupported VITE_CHAIN_ID=${CHAIN_ID}. BlockSwap supports 8453 (Base mainnet) or 84532 (Base Sepolia).`
  );
}

// Prefer explicit RPC per network, then fallback to VITE_RPC_URL
const RPC_FROM_ENV = (
  (IS_MAINNET ? ENV.VITE_BASE_MAINNET_RPC : ENV.VITE_BASE_SEPOLIA_RPC) ||
  ENV.VITE_RPC_URL ||
  ""
).trim();

function mustRpc() {
  if (!RPC_FROM_ENV) {
    // Warn in dev only (keep prod console clean)
    if (ENV.MODE !== "production") {
      console.warn(
        "[BlockSwap] Missing RPC URL. Set VITE_BASE_MAINNET_RPC (mainnet) or VITE_BASE_SEPOLIA_RPC (testnet) or VITE_RPC_URL in theblock-ui/.env.local and restart `npm run dev`."
      );
    }
  }
  return RPC_FROM_ENV;
}

export const BLOCKSWAP_CONFIG = {
  STORAGE_KEY: "theblock:blockswap:v1",

  STABLE_SYMBOL: "USDC",
  STABLE_DECIMALS: 6,
  OZ_DECIMALS: 18,

  TOTAL_BRICKS: 2000,
  OUNCES_PER_BRICK: 36,

  BLOCK_LOCKED_BRICKS: 500,
  BRICKS_AVAILABLE_FOR_SALE: 1500,

  SELL_PRICE_PER_BRICK: 1000,
  BUYBACK_FLOOR_PER_BRICK: 500,

  STARTING_TREASURY: 0,

  STARTING_PHASE: 1,
  BRICK_POOL_BY_PHASE: { 1: 0.3, 2: 0.35, 3: 0.4 },

  // Admin wallet (used for UI gating)
  // Set this to your MAINNET admin wallet when VITE_CHAIN_ID=8453
  ADMIN_WALLET:
    (ENV.VITE_ADMIN_WALLET || "").trim() ||
    (IS_MAINNET
      ? "0xbC157B646Bc0230d22D5AdD7d02a5F224Cb27D61"
      : "0x5CA7541E7E7EA07DC0114D64090Df3f39AF5623c"),

  EARLY_BIRD_BADGE_DEFAULT: true,
  BUY_PAUSED_DEFAULT: true, // safer default; on-chain is source of truth anyway

  // ===========================
  // Chain
  // ===========================
  CHAIN: IS_MAINNET ? "base" : "baseSepolia",
  CHAIN_ID,

  RPC_URL: mustRpc(),

  // ✅ Addresses are FALLBACK ONLY.
  // Your adapters/pages prefer deployments JSON in /public:
  //  - mainnet: /deployments.base.json
  //  - testnet: /deployments.baseSepolia.json
  // If that file is stale, you'll hit old contracts / mismatched ABIs.
  USDC_ADDRESS: (ENV.VITE_USDC_ADDRESS || "0x0000000000000000000000000000000000000000").trim(),
  OZ_ADDRESS: (ENV.VITE_OZ_ADDRESS || "0x0000000000000000000000000000000000000000").trim(),
  BLOCKSWAP_ADDRESS: (ENV.VITE_BLOCKSWAP_ADDRESS || "0x0000000000000000000000000000000000000000").trim(),

  // Rewards (Merkle)
  // Prefer deployments file if you are writing it (recommended).
  // Only set env override if you intentionally want to bypass deployments.
  REWARDS_ADDRESS:
    (ENV.VITE_REWARDS_ADDRESS || ENV.VITE_REWARDS_MERKLE_ADDRESS || "0x0000000000000000000000000000000000000000").trim(),
  REWARDS_ROUND_ID: Number(ENV.VITE_REWARDS_ROUND_ID || 1),
  REWARDS_PROOFS_URL: (ENV.VITE_REWARDS_PROOFS_URL || "/rewards/round1.proofs.json").trim(),
};