// src/context/WalletContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);

  useEffect(() => {
    if (!window.ethereum) return;

    // On load, if already authorized, read current account
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => setAccount(accounts?.[0] || null))
      .catch(() => {});

    const handleAccountsChanged = (accounts) => {
      setAccount(accounts?.[0] || null);
    };

    const handleChainChanged = () => {
      // safest: reload app state when chain changes
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      try {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not found in this browser.");
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      setAccount(accounts?.[0] || null);
    } catch (err) {
      console.error("MetaMask connect error:", err);
    }
  };

  const disconnectWallet = () => {
    // MetaMask cannot be “disconnected” programmatically.
    // This clears local app state only.
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
