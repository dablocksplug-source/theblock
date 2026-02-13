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

function pickInjected(connectors) {
  return findConnector(connectors, {
    ids: ["injected", "io.metamask", "metamask", "metamasksdk"],
    nameIncludes: ["metamask", "injected"],
  });
}
function pickCoinbase(connectors) {
  return findConnector(connectors, {
    ids: ["coinbasewallet", "coinbasewalletsdk"],
    nameIncludes: ["coinbase"],
  });
}
function pickWalletConnect(connectors) {
  return findConnector(connectors, {
    ids: ["walletconnect", "walletconnectv2", "walletconnectsdk"],
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
    return (connectors || []).map((c) => ({ id: c?.id, name: c?.name }));
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
      if (!c) {
        throw new Error(
          `Connector not available for ${label}. Available: ${(availableConnectors || [])
            .map((x) => `${x.id}→${x.name}`)
            .join(", ")}`
        );
      }

      if (status === "pending") {
        throw new Error("Connection already in progress. Check your wallet popup.");
      }
      if (connectInFlightRef.current) {
        throw new Error("Connection already in progress. Check your wallet popup.");
      }

      connectInFlightRef.current = true;

      try {
        const res = await connectAsync({ connector: c });
        await setAdapterProviderFromConnector(c);
        return res;
      } catch (e) {
        if (isPendingPermissionsError(e)) {
          throw new Error(
            "Wallet request already pending. Open your wallet and approve/close the existing request, then try again."
          );
        }
        throw e;
      } finally {
        connectInFlightRef.current = false;
      }
    },
    [connectAsync, setAdapterProviderFromConnector, availableConnectors, status]
  );

  const connectMetaMask = useCallback(async () => {
    const c = pickInjected(connectors);
    if (!c) {
      throw new Error("MetaMask connector not found. Install/enable MetaMask, then refresh.");
    }
    return connectWith(c, "MetaMask");
  }, [connectors, connectWith]);

  const connectCoinbase = useCallback(async () => {
    const c = pickCoinbase(connectors);
    return connectWith(c, "Coinbase");
  }, [connectors, connectWith]);

  const connectWalletConnect = useCallback(async () => {
    const c = pickWalletConnect(connectors);
    if (!c) {
      throw new Error("WalletConnect connector not found. Add WC projectId in wagmi.");
    }
    return connectWith(c, "WalletConnect");
  }, [connectors, connectWith]);

  const connectWallet = useCallback(async () => {
    const injected = pickInjected(connectors);
    const cb = pickCoinbase(connectors);
    const wc = pickWalletConnect(connectors);
    const first = (connectors || [])[0] || null;
    return connectWith(injected || cb || wc || first, "Connect Wallet");
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
