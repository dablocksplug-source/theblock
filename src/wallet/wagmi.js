// src/wallet/wagmi.js
import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { walletConnect, injected } from "@wagmi/connectors";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    injected(),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            metadata: {
              name: "The Block",
              description: "BlockSwap",
              url: window.location.origin,
              icons: ["https://theblock-vory.vercel.app/favicon.ico"],
            },
          }),
        ]
      : []),
  ],
});
