import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { metaMask, walletConnect, coinbaseWallet } from "wagmi/connectors";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// IMPORTANT: Don't create WalletConnect connector if projectId is missing.
// Otherwise the app can crash and you get a blank screen.
const connectors = [
  metaMask(),
  coinbaseWallet({
    appName: "The Block",
    appLogoUrl: `${window.location.origin}/favicon.ico`,
  }),
];

if (projectId) {
  connectors.unshift(
    walletConnect({
      projectId,
      metadata: {
        name: "The Block",
        description: "BlockSwap",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
    })
  );
} else {
  console.warn("⚠️ Missing VITE_WALLETCONNECT_PROJECT_ID (WalletConnect disabled locally).");
}

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors,
});
