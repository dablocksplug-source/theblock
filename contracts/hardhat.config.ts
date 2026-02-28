import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";

// Support BOTH naming styles so old scripts/envs still work.
const PK =
  process.env.DEPLOYER_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  "";

const BASE_MAINNET_RPC =
  process.env.BASE_MAINNET_RPC ||
  process.env.RPC_URL || // your new style
  "https://mainnet.base.org"; // fallback (rate-limited)

const BASE_SEPOLIA_RPC =
  process.env.BASE_SEPOLIA_RPC ||
  process.env.BASE_SEPOLIA_RPC_URL ||
  process.env.RPC_URL ||
  "https://sepolia.base.org";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  networks: {
    // ✅ Base Sepolia (testnet)
    baseSepolia: {
      type: "http",
      chainId: 84532,
      url: BASE_SEPOLIA_RPC,
      accounts: PK ? [PK] : [],
    },

    // ✅ Base Mainnet
    base: {
      type: "http",
      chainId: 8453,
      url: BASE_MAINNET_RPC,
      accounts: PK ? [PK] : [],
    },
  },
};

export default config;