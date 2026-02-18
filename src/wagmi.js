// src/wagmi.js
import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  "";

// ✅ Canonical app URL (use www). Set this in Vercel env as VITE_APP_URL=https://www.theblock.live
const APP_URL = (import.meta.env.VITE_APP_URL || "https://www.theblock.live").replace(/\/+$/, "");

const chain =
  Number(import.meta.env.VITE_CHAIN_ID || 84532) === base.id ? base : baseSepolia;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    metaMask(),
    coinbaseWallet({ appName: "The Block" }),
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: "The Block",
              description: "BlockSwap + Rewards",
              url: APP_URL,
              // (optional but nice to have)
              // icons: ["https://www.theblock.live/favicon.ico"],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [chain.id]: http(import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0]),
  },
});
