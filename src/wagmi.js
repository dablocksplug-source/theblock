// src/wagmi.js
import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  "";

// ✅ Canonical app URL (use www). Set in Vercel env: VITE_APP_URL=https://www.theblock.live
const APP_URL = (import.meta.env.VITE_APP_URL || "https://www.theblock.live").replace(/\/+$/, "");

// ✅ nice to have for WC metadata
const ICON_URL = (import.meta.env.VITE_APP_ICON_URL || `${APP_URL}/favicon.ico`).replace(/\/+$/, "");

// ✅ IMPORTANT: default to Base mainnet (8453), not Sepolia
const DEFAULT_CHAIN_ID = base.id; // 8453
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || DEFAULT_CHAIN_ID);

// Choose chain explicitly
const chain = CHAIN_ID === base.id ? base : baseSepolia;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    // MetaMask connector (injected / SDK behavior)
    metaMask(),

    // Coinbase
    coinbaseWallet({ appName: "The Block" }),

    // WalletConnect (ONLY if projectId provided)
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,

            // 🔒 FORCE WC session to the chain your app is using (Base in prod)
            chains: [chain],

            metadata: {
              name: "The Block",
              description: "BlockSwap + Rewards",
              url: APP_URL,
              icons: [ICON_URL],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [chain.id]: http(import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0]),
  },
});