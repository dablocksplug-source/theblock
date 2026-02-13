// src/wagmi.js
import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID || "";

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
          }),
        ]
      : []),
  ],

  transports: {
    [chain.id]: http(
      import.meta.env.VITE_RPC_URL ||
        chain.rpcUrls.default.http[0]
    ),
  },
});
