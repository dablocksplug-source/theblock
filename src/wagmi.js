// src/wagmi.js
import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

// Accept BOTH env styles (so Vercel can't "break" WC by name mismatch)
const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  "";

// Helps WalletConnect identify your app properly
const APP_URL =
  import.meta.env.VITE_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost");

// Decide chain from env
const chain =
  Number(import.meta.env.VITE_CHAIN_ID || 84532) === base.id
    ? base
    : baseSepolia;

export const wagmiConfig = createConfig({
  chains: [chain],

  connectors: [
    metaMask(),

    coinbaseWallet({
      appName: "The Block",
    }),

    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: "The Block",
              description: "BlockSwap + Rewards",
              url: APP_URL,
              icons: [`${APP_URL}/icons/icon-512.png`],
            },
          }),
        ]
      : []),
  ],

  transports: {
    [chain.id]: http(
      import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0]
    ),
  },
});
