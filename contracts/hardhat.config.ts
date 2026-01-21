console.log("✅ HARDHAT CONFIG LOADED");

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";
import "dotenv/config";

console.log("✅ VIEM PLUGIN IMPORTED");


const PK = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    baseSepolia: {
      type: "http",
      url: "https://sepolia.base.org",
      chainId: 84532,
      accounts: PK ? [PK] : [],
    },
    b3Testnet: {
      type: "http",
      url: "https://testnet-rpc.b3.fun",
      chainId: 1993,
      accounts: PK ? [PK] : [],
    },
  },
};

export default config;
