// src/context/WalletContext.jsx
import React, { createContext, useContext } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status, error } = useConnect();
  const { disconnect } = useDisconnect();

  const connectWallet = () => {
    // Prefer WalletConnect (best for mobile), else fall back to injected
    const wc = connectors.find((c) => c.id === "walletConnect");
    const injected = connectors.find((c) => c.id === "injected");
    connect({ connector: wc || injected || connectors[0] });
  };

  return (
    <WalletContext.Provider
      value={{
        account: address,
        walletAddress: address,
        isConnected,
        connectWallet,
        disconnectWallet: disconnect,
        connectStatus: status,
        connectError: error?.message || null,
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
