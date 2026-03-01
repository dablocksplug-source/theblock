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

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 8453);

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
  try {
    if (!p) return false;
    if (p.isMetaMask) return true;
    if (p.provider?.isMetaMask) return true;
    return false;
  } catch {
    return false;
  }
}

function hexToDecChainId(hex) {
  try {
    const s = String(hex || "");
    if (!s) return 0;
    if (s.startsWith("0x")) {
      const n = parseInt(s, 16);
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function WalletProvider({ children }) {
  const { address, isConnected, chainId: wagmiChainId, connector } = useAccount();
  const { connectAsync, connectors, status, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const connectInFlightRef = useRef(false);

  // ✅ active EIP-1193 provider for the CONNECTED connector
  const [provider, setProvider] = useState(null);

  // ✅ real chainId from provider (WalletConnect/Trust/Coinbase can disagree with wagmi state)
  const [effectiveChainId, setEffectiveChainId] = useState(0);

  const availableConnectors = useMemo(() => {
    return (connectors || []).map((c) => ({
      id: c?.id,
      name: c?.name,
      ready: typeof c?.ready === "boolean" ? c.ready : true,
    }));
  }, [connectors]);

  const refreshEffectiveChainId = useCallback(async (p, fallback) => {
    try {
      const prov = p || provider;
      if (!prov || typeof prov.request !== "function") {
        setEffectiveChainId(Number(fallback || 0));
        return Number(fallback || 0);
      }
      const hex = await prov.request({ method: "eth_chainId" });
      const cid = hexToDecChainId(hex);
      setEffectiveChainId(Number(cid || fallback || 0));
      return Number(cid || fallback || 0);
    } catch {
      setEffectiveChainId(Number(fallback || 0));
      return Number(fallback || 0);
    }
  }, [provider]);

  const setAdapterProviderFromConnector = useCallback(async (c) => {
    try {
      if (!c) {
        blockswapAdapter.setProvider(null);
        setProvider(null);
        setEffectiveChainId(0);
        return;
      }
      const p = await c.getProvider?.();
      blockswapAdapter.setProvider(p || null);
      setProvider(p || null);

      // immediately refresh chainId from provider
      await refreshEffectiveChainId(p || null, wagmiChainId || 0);
    } catch (e) {
      console.warn("Failed to get provider from connector:", e?.message || e);
      blockswapAdapter.setProvider(null);
      setProvider(null);
      setEffectiveChainId(0);
    }
  }, [refreshEffectiveChainId, wagmiChainId]);

  // ✅ keep provider in sync with wagmi active connector (including on refresh)
  useEffect(() => {
    if (!isConnected || !connector) {
      blockswapAdapter.setProvider(null);
      setProvider(null);
      setEffectiveChainId(0);
      return;
    }
    setAdapterProviderFromConnector(connector).catch(() => {});
  }, [isConnected, connector, setAdapterProviderFromConnector]);

  // ✅ subscribe to chainChanged if wallet provides it
  useEffect(() => {
    const p = provider;
    if (!p || typeof p.on !== "function" || typeof p.removeListener !== "function") return;

    const onChainChanged = (hex) => {
      const cid = hexToDecChainId(hex);
      setEffectiveChainId(Number(cid || 0));
    };

    try {
      p.on("chainChanged", onChainChanged);
    } catch {}

    // also refresh once (some wallets don’t emit immediately)
    refreshEffectiveChainId(p, wagmiChainId || 0).catch(() => {});

    return () => {
      try {
        p.removeListener("chainChanged", onChainChanged);
      } catch {}
    };
  }, [provider, wagmiChainId, refreshEffectiveChainId]);

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

          if (looksInjectedProvider(p)) {
            try {
              disconnect();
            } catch {}

            blockswapAdapter.setProvider(null);
            setProvider(null);
            setEffectiveChainId(0);

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

      // quick success path (provider truth)
      const current = await refreshEffectiveChainId(provider, wagmiChainId || 0);
      if (Number(current || 0) === target) return;

      // wagmi switch (preferred)
      if (switchChainAsync) {
        try {
          await switchChainAsync({ chainId: target });
        } catch (e) {
          // fall through to direct request
        }
      }

      // direct request fallback (helps Trust/Coinbase/WC)
      try {
        const p = provider;
        if (p && typeof p.request === "function") {
          await p.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x" + target.toString(16) }],
          });
        }
      } catch (e) {
        // don't throw yet; re-check and throw if still wrong
      }

      const after = await refreshEffectiveChainId(provider, wagmiChainId || 0);
      if (Number(after || 0) !== target) {
        throw new Error(`Wrong network. Switch to chain ${target}.`);
      }
    },
    [provider, wagmiChainId, switchChainAsync, refreshEffectiveChainId]
  );

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
    setEffectiveChainId(0);

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const keys = Object.keys(window.localStorage);
        for (const k of keys) {
          if (k.toLowerCase().includes("walletconnect") || k.toLowerCase().includes("wagmi")) {
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
      setEffectiveChainId(0);
    }
  }, [disconnect]);

  const effectiveWrongChain =
    isConnected &&
    Number(TARGET_CHAIN_ID) > 0 &&
    Number(effectiveChainId || 0) > 0 &&
    Number(effectiveChainId) !== Number(TARGET_CHAIN_ID);

  const value = useMemo(
    () => ({
      account: address,
      walletAddress: address,
      isConnected,

      // wagmi view (may be stale on some mobile wallets)
      chainId: Number(wagmiChainId || 0),

      // ✅ provider-truth view
      effectiveChainId: Number(effectiveChainId || 0),
      effectiveWrongChain,

      provider,

      connectWallet,
      connectMetaMask,
      connectCoinbase,
      connectWalletConnect,
      disconnectWallet,

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
      wagmiChainId,
      effectiveChainId,
      effectiveWrongChain,
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