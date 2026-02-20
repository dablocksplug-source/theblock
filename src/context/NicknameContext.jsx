// src/context/NicknameContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "./WalletContext";
import { setNicknameDirect, setNicknameRelayed, getNickname } from "../utils/nicknameAPI";
import { blockswapAdapter } from "../services/blockswapAdapter";

const STORAGE_KEY = "theblock_nickname_settings_v2";
const NicknameContext = createContext(null);

function normalizeAddr(a) {
  return a ? String(a).toLowerCase() : "";
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function envBool(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function errToString(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const msg = e?.shortMessage || e?.message;
  if (msg) return String(msg);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function toChainId(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return 0;
  if (s.startsWith("0x")) {
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function getProviderChainId(provider) {
  try {
    if (provider && typeof provider.request === "function") {
      const hex = await provider.request({ method: "eth_chainId" });
      return toChainId(hex);
    }
  } catch {}
  return 0;
}

function isProbablyMobileMetaMask() {
  try {
    const ua = (navigator?.userAgent || "").toLowerCase();
    // Not perfect, but good enough for messaging.
    return ua.includes("android") || ua.includes("iphone") || ua.includes("ipad");
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, onTimeoutMessage) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(onTimeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export function NicknameProvider({ children }) {
  const {
    walletAddress,
    provider,
    isConnected,
    chainId,
    ensureChain,
  } = useWallet();

  const TARGET_CHAIN_ID = toChainId(import.meta.env.VITE_CHAIN_ID || 84532);
  const addrKey = useMemo(() => normalizeAddr(walletAddress), [walletAddress]);

  const [useNickname, setUseNickname] = useState(true);
  const [nicknamesByAddr, setNicknamesByAddr] = useState({});
  const [nickname, setNicknameState] = useState("");
  const [hasOnchainNickname, setHasOnchainNickname] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (provider && typeof provider.request === "function") {
        blockswapAdapter.setProvider(provider);
      }
    } catch {}
  }, [provider]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = safeParse(raw, null);
    if (!parsed) return;

    if (typeof parsed.useNickname === "boolean") setUseNickname(parsed.useNickname);
    if (parsed.nicknames && typeof parsed.nicknames === "object") setNicknamesByAddr(parsed.nicknames);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ useNickname, nicknames: nicknamesByAddr })
      );
    } catch (err) {
      console.error("Failed to save nickname settings:", err);
    }
  }, [useNickname, nicknamesByAddr]);

  useEffect(() => {
    setModalOpen(false);
    setLoading(false);
    setHasOnchainNickname(false);

    if (!addrKey) {
      setNicknameState("");
      return;
    }

    const localName = nicknamesByAddr?.[addrKey];
    if (typeof localName === "string" && localName.trim().length > 0) {
      setNicknameState(localName.trim());
    } else {
      setNicknameState("");
    }
  }, [addrKey, nicknamesByAddr]);

  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;

    (async () => {
      try {
        const chainName = await getNickname(walletAddress);
        const trimmed = (chainName || "").trim();
        if (cancelled) return;

        if (trimmed.length > 0) {
          setHasOnchainNickname(true);

          const key = normalizeAddr(walletAddress);
          setNicknamesByAddr((prev) => {
            const cur = prev?.[key];
            if (cur === trimmed) return prev || {};
            return { ...(prev || {}), [key]: trimmed };
          });

          setNicknameState(trimmed);
          setUseNickname(true);

          try {
            blockswapAdapter.setLabel({ walletAddress, label: trimmed });
          } catch {}

          setModalOpen(false);
          setLoading(false);
        } else {
          setHasOnchainNickname(false);
        }
      } catch (err) {
        if (!cancelled) setHasOnchainNickname(false);
        console.debug("No nickname on chain for this wallet:", errToString(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const setNickname = (val) => {
    const trimmed = (val || "").trim();
    setNicknameState(trimmed);

    if (walletAddress) {
      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));
      try {
        blockswapAdapter.setLabel({ walletAddress, label: trimmed });
      } catch {}
    }
  };

  async function ensureRightNetworkOrThrow() {
    const want = toChainId(TARGET_CHAIN_ID);
    if (!want) return;

    const ctxChain = toChainId(chainId);
    const provChain = await getProviderChainId(provider);
    const current = provChain || ctxChain;

    if (current && current === want) return;

    if (typeof ensureChain === "function") {
      await ensureChain(want);

      // re-check after switch
      const afterProv = await getProviderChainId(provider);
      const afterCtx = toChainId(chainId);
      const after = afterProv || afterCtx;

      if (after && after === want) return;
    }

    throw new Error(
      `Wrong network in wallet.\n` +
        `Expected chainId=${want}\n` +
        `Wallet chainId=${current || "unknown"}\n` +
        `Fix: switch your wallet network to match BlockSwap.`
    );
  }

  const saveNickname = async (name) => {
    const trimmed = (name || "").trim();

    if (!walletAddress || !isConnected) throw new Error("Connect your wallet first.");
    if (hasOnchainNickname) throw new Error("Nickname already set for this wallet.");

    if (!trimmed) throw new Error("Enter a nickname first.");
    if (trimmed.length < 3) throw new Error("Name too short.");
    if (trimmed.length > 24) throw new Error("Name too long (max 24).");

    setLoading(true);
    try {
      await ensureRightNetworkOrThrow();

      // If MetaMask mobile deep-link hangs, we must not freeze forever.
      const timeoutMsg =
        `Signature request timed out.\n` +
        `If you're on mobile, open the dapp inside MetaMask (MetaMask app → Browser) OR connect via WalletConnect.\n` +
        `Then try again.`;

      try {
        await withTimeout(
          setNicknameRelayed(trimmed, walletAddress, provider),
          45000,
          timeoutMsg
        );
      } catch (e) {
        const allowDirect = envBool(import.meta.env.VITE_ALLOW_DIRECT_NICKNAME);
        if (!allowDirect) {
          // Add a little extra hint for mobile users
          const extra = isProbablyMobileMetaMask()
            ? `\nMobile hint: MetaMask deep-links from Chrome sometimes don't show the confirm.\nUse MetaMask Browser or WalletConnect.`
            : "";
          throw new Error(
            `Gasless nickname failed: ${errToString(e)}${extra}\n` +
              `Fix: ensure relayer exposes POST /relay/nickname and VITE_RELAYER_URL is set.\n` +
              `Dev escape hatch: set VITE_ALLOW_DIRECT_NICKNAME=true (or 1).`
          );
        }

        await ensureRightNetworkOrThrow();
        await withTimeout(
          setNicknameDirect(trimmed, walletAddress, provider),
          45000,
          timeoutMsg
        );
      }

      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));
      setNicknameState(trimmed);
      setUseNickname(true);
      setHasOnchainNickname(true);

      try {
        blockswapAdapter.setLabel({ walletAddress, label: trimmed });
      } catch {}

      setModalOpen(false);
      return true;
    } finally {
      setLoading(false);
    }
  };

  const askForNickname = () => {
    if (!walletAddress || !isConnected) return;
    if (hasOnchainNickname) return;
    setModalOpen(true);
  };

  const value = {
    nickname,
    useNickname,
    setNickname,
    setUseNickname,
    hasOnchainNickname,
    modalOpen,
    setModalOpen,
    loading,
    saveNickname,
    askForNickname,
  };

  return <NicknameContext.Provider value={value}>{children}</NicknameContext.Provider>;
}

export function useNicknameContext() {
  const ctx = useContext(NicknameContext);
  if (!ctx) throw new Error("useNicknameContext must be used inside a NicknameProvider");
  return ctx;
}

export function useNickname() {
  return useNicknameContext();
}

export function getDisplayName({ walletAddress, nickname, useNickname }) {
  if (useNickname && nickname && nickname.trim().length > 0) return nickname.trim();
  if (!walletAddress) return "Unknown";
  const addr = String(walletAddress);
  return addr.length <= 10 ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default NicknameProvider;
