// src/context/WalletContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { blockswapAdapter } from "../services/blockswapAdapter";

const WalletContext = createContext(null);

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 84532);

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function findConnector(connectors, { ids = [], nameIncludes = [] } = {}) {
  const list = Array.isArray(connectors) ? connectors : [];

  for (const wantId of ids) {
    const hit = list.find((c) => norm(c?.id) === norm(wantId));
    if (hit) return hit;
  }
  for (const frag of nameIncludes) {
    const hit = list.find((c) => norm(c?.name).includes(norm(frag)));
    if (hit) return hit;
  }
  return null;
}

function pickMetaMask(connectors) {
  // wagmi v2 metaMask() connector id is typically "metaMask"
  return findConnector(connectors, {
    ids: ["metamask", "metaMask", "io.metamask", "injected", "metamasksdk"],
    nameIncludes: ["metamask"],
  });
}

function pickCoinbase(connectors) {
  // wagmi v2 coinbaseWallet() id is typically "coinbaseWallet"
  return findConnector(connectors, {
    ids: ["coinbasewallet", "coinbaseWallet", "coinbasewalletsdk"],
    nameIncludes: ["coinbase"],
  });
}

function pickWalletConnect(connectors) {
  // wagmi v2 walletConnect() id is typically "walletConnect"
  return findConnector(connectors, {
    ids: ["walletconnect", "walletConnect", "walletconnectv2", "walletconnectsdk"],
    nameIncludes: ["walletconnect"],
  });
}

function isPendingPermissionsError(e) {
  const msg = String(e?.message || e || "");
  return (
    e?.code === -32002 ||
    /already pending/i.test(msg) ||
    /wallet_requestpermissions/i.test(msg)
  );
}

export function WalletProvider({ children }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectAsync, connectors, status, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const connectInFlightRef = useRef(false);

  // ✅ active EIP-1193 provider for the CONNECTED connector
  const [provider, setProvider] = useState(null);

  const availableConnectors = useMemo(() => {
    // include "ready" if present (wagmi v2 connectors usually expose it)
    return (connectors || []).map((c) => ({
      id: c?.id,
      name: c?.name,
      ready: typeof c?.ready === "boolean" ? c.ready : true,
    }));
  }, [connectors]);

  const setAdapterProviderFromConnector = useCallback(async (c) => {
    try {
      if (!c) {
        blockswapAdapter.setProvider(null);
        setProvider(null);
        return;
      }
      const p = await c.getProvider?.();
      blockswapAdapter.setProvider(p || null);
      setProvider(p || null);
    } catch (e) {
      console.warn("Failed to get provider from connector:", e?.message || e);
      blockswapAdapter.setProvider(null);
      setProvider(null);
    }
  }, []);

  // ✅ keep provider in sync with wagmi active connector (including on refresh)
  useEffect(() => {
    if (!isConnected || !connector) {
      blockswapAdapter.setProvider(null);
      setProvider(null);
      return;
    }
    setAdapterProviderFromConnector(connector).catch(() => {});
  }, [isConnected, connector, setAdapterProviderFromConnector]);

  const connectWith = useCallback(
    async (c, label = "wallet") => {
      const list = Array.isArray(connectors) ? connectors : [];

      if (!c) {
        throw new Error(
          `Connector not available for ${label}.\nAvailable: ${(availableConnectors || [])
            .map((x) => `${x.id}→${x.name}${x.ready === false ? " (not ready)" : ""}`)
            .join(", ")}`
        );
      }

      // If connector exposes "ready" and it's false, block with a clear message
      if (typeof c?.ready === "boolean" && c.ready === false) {
        throw new Error(
          `${label} connector is not ready on this device/browser.\nTry a different wallet option or open the site inside the wallet browser.`
        );
      }

      if (status === "pending") {
        throw new Error("Connection already in progress. Check your wallet popup/app.");
      }
      if (connectInFlightRef.current) {
        throw new Error("Connection already in progress. Check your wallet popup/app.");
      }

      connectInFlightRef.current = true;

      try {
        // ✅ IMPORTANT FOR MOBILE: pass chainId hint
        // Many mobile wallets behave better when chainId is supplied.
        const res = await connectAsync({ connector: c, chainId: TARGET_CHAIN_ID });

        // sync adapter provider
        await setAdapterProviderFromConnector(c);

        return res;
      } catch (e) {
        if (isPendingPermissionsError(e)) {
          throw new Error(
            "Wallet request already pending.\nOpen your wallet and approve/close the existing request, then try again."
          );
        }
        // Some wallets throw vague errors — surface as much as we can
        throw new Error(e?.shortMessage || e?.message || String(e));
      } finally {
        connectInFlightRef.current = false;
      }
    },
    [connectAsync, setAdapterProviderFromConnector, availableConnectors, status, connectors]
  );

  const connectMetaMask = useCallback(async () => {
    const c = pickMetaMask(connectors);
    if (!c) {
      throw new Error(
        "MetaMask connector not found.\nIf you're on mobile Safari/Chrome, try opening theblock.live inside the MetaMask app browser."
      );
    }
    return connectWith(c, "MetaMask");
  }, [connectors, connectWith]);

  const connectCoinbase = useCallback(async () => {
    const c = pickCoinbase(connectors);
    if (!c) {
      throw new Error(
        "Coinbase Wallet connector not found.\nTry opening the site inside Coinbase Wallet’s in-app browser."
      );
    }
    return connectWith(c, "Coinbase Wallet");
  }, [connectors, connectWith]);

  const connectWalletConnect = useCallback(async () => {
    const c = pickWalletConnect(connectors);
    if (!c) {
      throw new Error(
        "WalletConnect connector not found.\nMake sure VITE_WC_PROJECT_ID is set in Vercel + local env."
      );
    }
    return connectWith(c, "WalletConnect");
  }, [connectors, connectWith]);

  const connectWallet = useCallback(async () => {
    const mm = pickMetaMask(connectors);
    const cb = pickCoinbase(connectors);
    const wc = pickWalletConnect(connectors);
    const first = (connectors || [])[0] || null;
    return connectWith(mm || cb || wc || first, "Connect Wallet");
  }, [connectors, connectWith]);

  const ensureChain = useCallback(
    async (targetChainId) => {
      const target = Number(targetChainId || 0);
      if (!target) return;

      if (!switchChainAsync) throw new Error("switchChainAsync not available.");
      if (Number(chainId || 0) === target) return;

      await switchChainAsync({ chainId: target });
    },
    [switchChainAsync, chainId]
  );

  const disconnectWallet = useCallback(() => {
    try {
      blockswapAdapter.setProvider(null);
    } catch {}
    try {
      connectInFlightRef.current = false;
    } catch {}

    try {
      disconnect();
    } catch (e) {
      console.warn("disconnect() failed:", e?.message || e);
    } finally {
      setProvider(null);
    }
  }, [disconnect]);

  const value = useMemo(
    () => ({
      account: address,
      walletAddress: address,
      isConnected,
      chainId: Number(chainId || 0),

      // ✅ expose active signer provider (MetaMask/Coinbase/WC)
      provider,

      connectWallet,
      connectMetaMask,
      connectCoinbase,
      connectWalletConnect,
      disconnectWallet,

      ensureChain,
      switching,

      connectStatus: status,
      connectError: error?.message || null,
      availableConnectors,

      // handy for debugging UI if needed
      targetChainId: TARGET_CHAIN_ID,
    }),
    [
      address,
      isConnected,
      chainId,
      provider,
      connectWallet,
      connectMetaMask,
      connectCoinbase,
      connectWalletConnect,
      disconnectWallet,
      ensureChain,
      switching,
      status,
      error,
      availableConnectors,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
