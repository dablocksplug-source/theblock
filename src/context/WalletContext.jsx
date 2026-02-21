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

function isMobileish() {
  try {
    const ua = (navigator?.userAgent || "").toLowerCase();
    return ua.includes("android") || ua.includes("iphone") || ua.includes("ipad");
  } catch {
    return false;
  }
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
  return findConnector(connectors, {
    ids: ["metamask", "metaMask", "io.metamask", "injected", "metamasksdk"],
    nameIncludes: ["metamask"],
  });
}

function pickCoinbase(connectors) {
  return findConnector(connectors, {
    ids: ["coinbasewallet", "coinbaseWallet", "coinbasewalletsdk"],
    nameIncludes: ["coinbase"],
  });
}

function pickWalletConnect(connectors) {
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

function looksInjectedProvider(p) {
  // We only want this check as a heuristic.
  // MetaMask injected provider usually has isMetaMask=true.
  // WalletConnect provider often has a session field or isWalletConnect flag.
  try {
    if (!p) return false;
    if (p.isMetaMask) return true;
    if (p.provider?.isMetaMask) return true;
    return false;
  } catch {
    return false;
  }
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
    async (c, label = "wallet", { enforceWalletConnect = false } = {}) => {
      if (!c) {
        throw new Error(
          `Connector not available for ${label}.\nAvailable: ${(availableConnectors || [])
            .map((x) => `${x.id}→${x.name}${x.ready === false ? " (not ready)" : ""}`)
            .join(", ")}`
        );
      }

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
        const res = await connectAsync({ connector: c, chainId: TARGET_CHAIN_ID });

        // sync adapter provider
        await setAdapterProviderFromConnector(c);

        // ✅ If user chose WalletConnect, make sure we didn't accidentally end up with injected provider
        if (enforceWalletConnect) {
          const p = await c.getProvider?.().catch(() => null);

          // If provider looks like MetaMask injected, it means the flow got hijacked
          if (looksInjectedProvider(p)) {
            // clean disconnect to avoid weird stuck state
            try {
              disconnect();
            } catch {}

            blockswapAdapter.setProvider(null);
            setProvider(null);

            throw new Error(
              isMobileish()
                ? "WalletConnect got routed into MetaMask injected connect.\n\nFix:\n• Use WalletConnect with a non-MetaMask wallet OR\n• Open the site inside MetaMask Browser (works best) OR\n• Temporarily disable other injected wallets in the browser.\n\nThen try WalletConnect again."
                : "WalletConnect got routed into an injected wallet connection.\nTry WalletConnect again, or disable injected wallet extensions temporarily."
            );
          }
        }

        return res;
      } catch (e) {
        if (isPendingPermissionsError(e)) {
          throw new Error(
            "Wallet request already pending.\nOpen your wallet and approve/close the existing request, then try again."
          );
        }
        throw new Error(e?.shortMessage || e?.message || String(e));
      } finally {
        connectInFlightRef.current = false;
      }
    },
    [
      connectAsync,
      setAdapterProviderFromConnector,
      availableConnectors,
      status,
      disconnect,
    ]
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
    // ✅ enforce true WC session (don’t silently fall into injected)
    return connectWith(c, "WalletConnect", { enforceWalletConnect: true });
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

  // ✅ Hard reset: useful when mobile keeps reconnecting same account/session
  const hardResetConnection = useCallback(() => {
    try {
      connectInFlightRef.current = false;
    } catch {}
    try {
      disconnect();
    } catch {}

    try {
      blockswapAdapter.setProvider(null);
    } catch {}
    setProvider(null);

    // Clear some walletconnect storage keys (best-effort; safe)
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const keys = Object.keys(window.localStorage);
        for (const k of keys) {
          if (k.toLowerCase().includes("walletconnect") || k.toLowerCase().includes("wagmi")) {
            // don’t nuke everything, only relevant keys
            window.localStorage.removeItem(k);
          }
        }
      }
    } catch {}
  }, [disconnect]);

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

      // ✅ for tough mobile cases
      hardResetConnection,

      ensureChain,
      switching,

      connectStatus: status,
      connectError: error?.message || null,
      availableConnectors,

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
      hardResetConnection,
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
