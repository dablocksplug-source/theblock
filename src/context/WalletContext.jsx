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

// ✅ single source of truth for target chain (default mainnet)
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

function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export function WalletProvider({ children }) {
  const { address, isConnected, chainId: wagmiChainId, connector } = useAccount();
  const { connectAsync, connectors, status, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const connectInFlightRef = useRef(false);

  // ✅ active EIP-1193 provider for the CONNECTED connector
  const [provider, setProvider] = useState(null);

  // ✅ provider-truth chainId (mobile wallets can disagree w/ wagmi)
  const [effectiveChainId, setEffectiveChainId] = useState(0);

  const availableConnectors = useMemo(() => {
    return (connectors || []).map((c) => ({
      id: c?.id,
      name: c?.name,
      ready: typeof c?.ready === "boolean" ? c.ready : true,
    }));
  }, [connectors]);

  const refreshEffectiveChainId = useCallback(
    async (p, fallback) => {
      try {
        const prov = p || provider;
        if (!prov || typeof prov.request !== "function") {
          setEffectiveChainId(Number(fallback || 0));
          return Number(fallback || 0);
        }

        // some wallets won’t answer chainId until accounts are authorized
        let hex = null;
        try {
          hex = await withTimeout(
            prov.request({ method: "eth_chainId" }),
            10_000,
            "eth_chainId timeout"
          );
        } catch {}

        const cid = hexToDecChainId(hex);
        const finalId = Number(cid || fallback || 0);
        setEffectiveChainId(finalId);
        return finalId;
      } catch {
        setEffectiveChainId(Number(fallback || 0));
        return Number(fallback || 0);
      }
    },
    [provider]
  );

  // ✅ Force authorization if wallet is “connected” but not permitted yet
  const ensureProviderAuthorized = useCallback(async (p) => {
    const prov = p;
    if (!prov?.request) return;

    // If eth_accounts is empty, request accounts (this fixes “not authorized” on many mobile wallets)
    try {
      const accts = await withTimeout(
        prov.request({ method: "eth_accounts" }),
        10_000,
        "eth_accounts timeout"
      );

      if (Array.isArray(accts) && accts.length > 0) return;

      await withTimeout(
        prov.request({ method: "eth_requestAccounts" }),
        20_000,
        isMobileish()
          ? "Wallet did not respond to eth_requestAccounts (mobile). Open the wallet app/browser and try again."
          : "Wallet did not respond to eth_requestAccounts."
      );
    } catch {
      // don’t hard-fail here; some connectors handle it internally
    }
  }, []);

  const setAdapterProviderFromConnector = useCallback(
    async (c) => {
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

        // ✅ new: ensure provider is authorized (fixes Trust/Coinbase “not authorized”)
        await ensureProviderAuthorized(p || null);

        // refresh chainId from provider
        await refreshEffectiveChainId(p || null, wagmiChainId || 0);
      } catch (e) {
        console.warn("Failed to get provider from connector:", e?.message || e);
        blockswapAdapter.setProvider(null);
        setProvider(null);
        setEffectiveChainId(0);
      }
    },
    [ensureProviderAuthorized, refreshEffectiveChainId, wagmiChainId]
  );

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

  // ✅ subscribe to chainChanged / accountsChanged if wallet provides it
  useEffect(() => {
    const p = provider;
    if (!p || typeof p.on !== "function" || typeof p.removeListener !== "function") return;

    const onChainChanged = (hex) => {
      const cid = hexToDecChainId(hex);
      setEffectiveChainId(Number(cid || 0));
    };

    const onAccountsChanged = () => {
      // refresh chainId too (some wallets update both)
      refreshEffectiveChainId(p, wagmiChainId || 0).catch(() => {});
    };

    try {
      p.on("chainChanged", onChainChanged);
      p.on("accountsChanged", onAccountsChanged);
    } catch {}

    // refresh once
    refreshEffectiveChainId(p, wagmiChainId || 0).catch(() => {});

    return () => {
      try {
        p.removeListener("chainChanged", onChainChanged);
        p.removeListener("accountsChanged", onAccountsChanged);
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
        // ✅ mobile: give chainId hint
        const res = await connectAsync({ connector: c, chainId: TARGET_CHAIN_ID });

        // sync adapter provider (and force authorization)
        await setAdapterProviderFromConnector(c);

        // ✅ If user chose WalletConnect, make sure we didn't accidentally end up injected
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

      // provider truth
      const current = await refreshEffectiveChainId(provider, wagmiChainId || 0);
      if (Number(current || 0) === target) return;

      // wagmi switch
      if (switchChainAsync) {
        try {
          await switchChainAsync({ chainId: target });
        } catch (e) {}
      }

      // direct request fallback
      try {
        const p = provider;
        if (p && typeof p.request === "function") {
          await p.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x" + target.toString(16) }],
          });
        }
      } catch (e) {}

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

      // wagmi view (may be stale)
      chainId: Number(wagmiChainId || 0),

      // ✅ provider truth
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

      // ✅ expose target chain so button/pages don’t re-derive it differently
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