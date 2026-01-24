// src/context/WalletContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected, walletConnect } from "@wagmi/connectors";
import {
  connect,
  disconnect,
  getAccount,
  watchAccount,
  getChainId,
  switchChain,
} from "wagmi/actions";

const WalletContext = createContext(null);

// Base chain params for manual add (fallback if switchChain fails)
const BASE_CHAIN_PARAMS = {
  chainId: "0x2105", // 8453
  chainName: "Base",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);

  // ✅ WalletConnect requires a projectId.
  // Create one free on Reown (formerly WalletConnect Cloud) and set:
  // VITE_WC_PROJECT_ID=xxxxx in your .env
  const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID;

  const wagmiConfig = useMemo(() => {
    const connectors = [];

    // Injected (MetaMask extension / in-app browsers)
    connectors.push(injected({ shimDisconnect: true }));

    // WalletConnect for mobile Safari/Chrome (optional if projectId exists)
    if (wcProjectId) {
      connectors.push(
        walletConnect({
          projectId: wcProjectId,
          metadata: {
            name: "The Block",
            description: "BlockSwap",
            url: window.location.origin,
            icons: [`${window.location.origin}/favicon.ico`],
          },
          showQrModal: true,
        })
      );
    }

    return createConfig({
      chains: [base],
      connectors,
      transports: {
        [base.id]: http(),
      },
    });
  }, [wcProjectId]);

  useEffect(() => {
    // initial read
    const a = getAccount(wagmiConfig);
    setAccount(a?.address ?? null);

    // keep updated
    const unwatch = watchAccount(wagmiConfig, {
      onChange(next) {
        setAccount(next?.address ?? null);
      },
    });

    return () => {
      try {
        unwatch?.();
      } catch {
        /* ignore */
      }
    };
  }, [wagmiConfig]);

  const ensureBase = async () => {
    try {
      const cid = getChainId(wagmiConfig);
      if (cid === base.id) return;

      // Try wagmi switch
      await switchChain(wagmiConfig, { chainId: base.id });
    } catch (e) {
      // Fallback: ask injected provider to add/switch (mostly helps MetaMask)
      try {
        if (window.ethereum?.request) {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BASE_CHAIN_PARAMS.chainId }],
          });
        }
      } catch {
        try {
          if (window.ethereum?.request) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [BASE_CHAIN_PARAMS],
            });
          }
        } catch {
          // If still fails, user can stay on wrong chain; UI can warn later
        }
      }
    }
  };

  const connectWallet = async () => {
    // Priority:
    // 1) Injected if available
    // 2) WalletConnect if configured
    // 3) If neither: explain what to do

    const hasInjected = !!window.ethereum;
    const hasWalletConnect = !!wcProjectId;

    try {
      if (hasInjected) {
        const res = await connect(wagmiConfig, { connector: injected() });
        setAccount(res?.accounts?.[0] ?? getAccount(wagmiConfig)?.address ?? null);
        await ensureBase();
        return;
      }

      if (hasWalletConnect) {
        const res = await connect(wagmiConfig, {
          connector: walletConnect({
            projectId: wcProjectId,
            metadata: {
              name: "The Block",
              description: "BlockSwap",
              url: window.location.origin,
              icons: [`${window.location.origin}/favicon.ico`],
            },
            showQrModal: true,
          }),
        });

        setAccount(res?.accounts?.[0] ?? getAccount(wagmiConfig)?.address ?? null);
        // WalletConnect chain switching may be handled in wallet UI
        await ensureBase();
        return;
      }

      alert(
        "Wallet not found on this mobile browser.\n\nOpen this site inside MetaMask/Coinbase Wallet in-app browser, OR enable WalletConnect by setting VITE_WC_PROJECT_ID."
      );
    } catch (err) {
      console.error("Wallet connect error:", err);
      alert(err?.shortMessage || err?.message || "Wallet connect failed.");
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnect(wagmiConfig);
    } catch {
      // wagmi disconnect can fail if no active connector; still clear local
    }
    setAccount(null);
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        walletAddress: account,
        isConnected: !!account,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
