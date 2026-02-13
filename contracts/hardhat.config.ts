import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";

const PK = process.env.DEPLOYER_PRIVATE_KEY || "";
const RPC = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";

const config: HardhatUserConfig = {
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
      url: RPC,
      accounts: PK ? [PK] : [],
    },
  },
};

export default config;
