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
import { base, baseSepolia } from "wagmi/chains";

import { blockswapAdapter } from "../services/blockswapAdapter";

const WalletContext = createContext(null);

// ✅ SAFE DEFAULT: Base Mainnet (8453)
// Only allow Base mainnet (8453) or Base Sepolia (84532)
const DEFAULT_CHAIN_ID = base.id; // 8453
const RAW_TARGET_CHAIN_ID = import.meta.env.VITE_CHAIN_ID;
const PARSED_TARGET_CHAIN_ID = Number(RAW_TARGET_CHAIN_ID || DEFAULT_CHAIN_ID);

if (![base.id, baseSepolia.id].includes(PARSED_TARGET_CHAIN_ID)) {
  throw new Error(
    `[WalletContext] Unsupported VITE_CHAIN_ID=${String(RAW_TARGET_CHAIN_ID)} (parsed=${PARSED_TARGET_CHAIN_ID}). Use 8453 (Base) or 84532 (Base Sepolia).`
  );
}

const TARGET_CHAIN_ID = PARSED_TARGET_CHAIN_ID;

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function normalizeChainId(x) {
  if (x == null) return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const s = String(x).trim();
  if (!s) return 0;
  if (s.startsWith("0x")) {
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function chainName(chainId) {
  const id = normalizeChainId(chainId);
  if (id === base.id) return "Base";
  if (id === baseSepolia.id) return "Base Sepolia";
  return `Chain ${id || "?"}`;
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

function isUserRejected(e) {
  const msg = String(e?.message || e || "");
  return (
    e?.code === 4001 ||
    /user rejected/i.test(msg) ||
    /rejected/i.test(msg)
  );
}

function isUnrecognizedChain(e) {
  const msg = String(e?.message || e || "");
  // 4902 is common for "unknown chain" in injected wallets
  return e?.code === 4902 || /unrecognized chain/i.test(msg) || /unknown chain/i.test(msg);
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
      const target = normalizeChainId(targetChainId || TARGET_CHAIN_ID);
      if (!target) return;

      const current = normalizeChainId(chainId);

      // already good
      if (current === target) return;

      if (!switchChainAsync) {
        throw new Error(
          `This wallet connection can't switch networks automatically.\n\nYou're on ${chainName(
            current
          )}. Please switch to ${chainName(target)} inside your wallet, then reconnect.`
        );
      }

      try {
        await switchChainAsync({ chainId: target });
      } catch (e) {
        // WalletConnect/TrustWallet often needs a reconnect if the session is stuck on the old chain
        if (isUserRejected(e)) {
          throw new Error("Network switch was rejected in the wallet.");
        }
        if (isUnrecognizedChain(e)) {
          throw new Error(
            `Your wallet doesn't recognize ${chainName(target)}.\n\nFix:\n• Add/switch to Base in the wallet\n• Then disconnect + reconnect your session`
          );
        }

        const msg = String(e?.shortMessage || e?.message || e || "");
        throw new Error(
          `Couldn't switch network automatically.\n\nYou're on ${chainName(current)} but need ${chainName(
            target
          )}.\n\nIf you're using Trust Wallet via WalletConnect:\n• Disconnect from the site\n• In Trust Wallet, disconnect the WalletConnect session\n• Reconnect while already on ${chainName(target)}\n\nDetails: ${msg}`
        );
      }
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

      // NOTE: keep it numeric and normalized
      chainId: normalizeChainId(chainId),

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
      targetChainName: chainName(TARGET_CHAIN_ID),
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