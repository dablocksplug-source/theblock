// src/context/NicknameContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "./WalletContext";
import {
  setNicknameDirect,
  setNicknameRelayed,
  getNickname,
  prepareNicknameRelayed,
} from "../utils/nicknameAPI";
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
  const { walletAddress, provider, isConnected, chainId, ensureChain } = useWallet();

  const TARGET_CHAIN_ID = toChainId(import.meta.env.VITE_CHAIN_ID || 84532);
  const addrKey = useMemo(() => normalizeAddr(walletAddress), [walletAddress]);

  const [useNickname, setUseNickname] = useState(true);
  const [nicknamesByAddr, setNicknamesByAddr] = useState({});
  const [nickname, setNicknameState] = useState("");
  const [hasOnchainNickname, setHasOnchainNickname] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Prepared payload so “Save Name” can go straight into signing on mobile
  const [prepared, setPrepared] = useState(null);

  useEffect(() => {
    try {
      if (provider && typeof provider.request === "function") {
        blockswapAdapter.setProvider(provider);
      }
    } catch {}
  }, [provider]);

  // Load local settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = safeParse(raw, null);
    if (!parsed) return;

    if (typeof parsed.useNickname === "boolean") setUseNickname(parsed.useNickname);
    if (parsed.nicknames && typeof parsed.nicknames === "object") setNicknamesByAddr(parsed.nicknames);
  }, []);

  // Persist local settings
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

  // Wallet change: reset UI state for new wallet
  useEffect(() => {
    setModalOpen(false);
    setLoading(false);
    setHasOnchainNickname(false);
    setPrepared(null);

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

  // Read on-chain nickname once per wallet connect/change
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
          setPrepared(null);
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

  // ✅ When modal is open and nickname looks valid, precompute nonce/hash so Save is “gesture-safe”
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!modalOpen) return;
        if (!walletAddress || !isConnected) return;
        if (hasOnchainNickname) return;

        const n = String(nickname || "").trim();
        if (n.length < 3 || n.length > 24) {
          setPrepared(null);
          return;
        }

        const prep = await prepareNicknameRelayed(n, walletAddress, provider);
        if (!cancelled) setPrepared(prep);
      } catch {
        if (!cancelled) setPrepared(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modalOpen, nickname, walletAddress, isConnected, provider, hasOnchainNickname]);

  // Local-only setter
  const setNickname = (val) => {
    const trimmed = (val || "").trim();
    setNicknameState(trimmed);

    // invalidate prepared when user edits input
    setPrepared(null);

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

      const timeoutMsg =
        `Signature request timed out.\n` +
        `If you're on mobile, open the dapp inside MetaMask (MetaMask app → Browser) OR connect via WalletConnect.\n` +
        `Then try again.`;

      // ✅ ensure we have prepared data; if not, compute it now
      let prep = prepared;
      if (!prep || String(prep?.nick || "").trim() !== trimmed) {
        prep = await prepareNicknameRelayed(trimmed, walletAddress, provider);
        setPrepared(prep);
      }

      try {
        // Use prepared payload so Save click triggers signature quickly
        await withTimeout(
          setNicknameRelayed(trimmed, walletAddress, provider, prep),
          45_000,
          timeoutMsg
        );
      } catch (e) {
        const allowDirect = envBool(import.meta.env.VITE_ALLOW_DIRECT_NICKNAME);
        if (!allowDirect) {
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
          45_000,
          timeoutMsg
        );
      }

      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));
      setNicknameState(trimmed);
      setUseNickname(true);
      setHasOnchainNickname(true);
      setPrepared(null);

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
    setPrepared(null);
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
