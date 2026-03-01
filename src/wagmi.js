// src/wagmi.js
import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  "";

// ✅ Canonical app URL (use www). Set in Vercel env: VITE_APP_URL=https://www.theblock.live
const APP_URL = String(import.meta.env.VITE_APP_URL || "https://www.theblock.live").replace(/\/+$/, "");

// ✅ Nice to have for WC metadata
const ICON_URL = String(import.meta.env.VITE_APP_ICON_URL || `${APP_URL}/favicon.ico`).replace(/\/+$/, "");

// ✅ SAFE DEFAULT: Base Mainnet (8453)
// Only allow Base mainnet (8453) or Base Sepolia (84532)
const DEFAULT_CHAIN_ID = base.id; // 8453
const rawChainId = import.meta.env.VITE_CHAIN_ID;
const targetChainId = Number(rawChainId || DEFAULT_CHAIN_ID);

let chain;
if (targetChainId === base.id) chain = base;
else if (targetChainId === baseSepolia.id) chain = baseSepolia;
else {
  // hard fail so we never silently run on the wrong chain
  throw new Error(
    `[wagmi] Unsupported VITE_CHAIN_ID=${String(rawChainId)} (parsed=${targetChainId}). Use 8453 (Base) or 84532 (Base Sepolia).`
  );
}

const rpcUrl = String(import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0]).trim();
if (!rpcUrl) {
  throw new Error("[wagmi] Missing RPC URL. Set VITE_RPC_URL or ensure the selected chain has a default RPC.");
}

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    metaMask(),

    // Coinbase Wallet
    coinbaseWallet({
      appName: "The Block",
      // Optional but helps some wallets:
      appLogoUrl: ICON_URL,
    }),

    // WalletConnect (ONLY if projectId provided)
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
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
    [chain.id]: http(rpcUrl),
  },
});