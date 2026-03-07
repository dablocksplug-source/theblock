import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

// Support BOTH naming styles so old scripts/envs still work.
const PK =
  process.env.DEPLOYER_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  "";

const BASE_MAINNET_RPC =
  process.env.BASE_MAINNET_RPC ||
  process.env.RPC_URL ||
  "https://mainnet.base.org";

const BASE_SEPOLIA_RPC =
  process.env.BASE_SEPOLIA_RPC ||
  process.env.BASE_SEPOLIA_RPC_URL ||
  process.env.RPC_URL ||
  "https://sepolia.base.org";

const config: HardhatUserConfig = {
  plugins: [hardhatViem, hardhatVerify],

  // Use the compiler version your contracts were actually deployed with.
  solidity: "0.8.28",

  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },

  networks: {
    baseSepolia: {
      type: "http",
      chainId: 84532,
      url: BASE_SEPOLIA_RPC,
      accounts: PK ? [PK] : [],
    },

    base: {
      type: "http",
      chainId: 8453,
      url: BASE_MAINNET_RPC,
      accounts: PK ? [PK] : [],
    },
  },

  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

export default config;