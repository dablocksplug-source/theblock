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

// normalize chainId inputs like: 84532, "84532", "0x14a84"
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
  } catch {
    // ignore
  }
  return 0;
}

export function NicknameProvider({ children }) {
  const {
    walletAddress,
    provider,
    isConnected,
    chainId,        // from wallet context (may be string/number depending on connector)
    ensureChain,    // should switch networks if supported
  } = useWallet();

  const TARGET_CHAIN_ID = toChainId(import.meta.env.VITE_CHAIN_ID || 84532);
  const addrKey = useMemo(() => normalizeAddr(walletAddress), [walletAddress]);

  const [useNickname, setUseNickname] = useState(true);
  const [nicknamesByAddr, setNicknamesByAddr] = useState({});
  const [nickname, setNicknameState] = useState("");

  // ✅ One nickname per wallet: once detected or saved on-chain, block edits forever
  const [hasOnchainNickname, setHasOnchainNickname] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Ensure adapter signs with the active provider
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

  // Local-only setter (used while typing in modal)
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

    // 1) check context chainId
    const ctxChain = toChainId(chainId);

    // 2) also check provider eth_chainId (mobile weirdness)
    const provChain = await getProviderChainId(provider);

    const current = provChain || ctxChain;

    if (current && current === want) return;

    // If we can switch, try it
    if (typeof ensureChain === "function") {
      try {
        await ensureChain(want);
      } catch (e) {
        throw new Error(
          `Wrong network in wallet.\n` +
            `Expected chainId=${want}\n` +
            `Wallet chainId=${current || "unknown"}\n` +
            `Switch network in your wallet and try again.\n` +
            `Details: ${errToString(e)}`
        );
      }

      // re-check after switching
      const afterProv = await getProviderChainId(provider);
      const afterCtx = toChainId(chainId);
      const after = afterProv || afterCtx;

      if (after && after === want) return;
    }

    throw new Error(
      `Wrong network in wallet.\n` +
        `Expected chainId=${want}\n` +
        `Wallet chainId=${current || "unknown"}\n` +
        `Fix: switch your wallet network to match BlockSwap (target chainId=${want}).`
    );
  }

  const saveNickname = async (name) => {
    const trimmed = (name || "").trim();

    if (!walletAddress || !isConnected) throw new Error("Connect your wallet first.");

    // ✅ Hard stop: one nickname per wallet, forever
    if (hasOnchainNickname) throw new Error("Nickname already set for this wallet.");

    if (!trimmed) throw new Error("Enter a nickname first.");
    if (trimmed.length < 3) throw new Error("Name too short.");
    if (trimmed.length > 24) throw new Error("Name too long (max 24).");

    setLoading(true);
    try {
      // ✅ Enforce chain BEFORE relay attempt (mobile MetaMask / deep-link edge cases)
      await ensureRightNetworkOrThrow();

      try {
        await setNicknameRelayed(trimmed, walletAddress, provider);
      } catch (e) {
        const allowDirect = envBool(import.meta.env.VITE_ALLOW_DIRECT_NICKNAME);
        if (!allowDirect) {
          throw new Error(
            `Gasless nickname failed: ${errToString(e)}\n` +
              `Wallet chain must be ${TARGET_CHAIN_ID}.\n` +
              `Fix: ensure relayer exposes POST /relay/nickname and VITE_RELAYER_URL is set.\n` +
              `Dev escape hatch: set VITE_ALLOW_DIRECT_NICKNAME=true (or 1).`
          );
        }

        // Also enforce chain before direct
        await ensureRightNetworkOrThrow();
        await setNicknameDirect(trimmed, walletAddress, provider);
      }

      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));
      setNicknameState(trimmed);
      setUseNickname(true);

      // ✅ Once saved, lock it
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
