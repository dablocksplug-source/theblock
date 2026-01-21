// src/context/NicknameContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "./WalletContext";
import { setNickname as setNicknameOnChain, getNickname } from "../utils/nicknameAPI";
import { blockswapAdapter } from "../services/blockswapAdapter";

/**
 * v2: store nicknames PER WALLET (address => nickname)
 * - Prevents nickname “bleeding” across accounts in the same browser.
 * - Keeps useNickname as a global toggle (one switch for everyone).
 * - Syncs nickname into BlockSwap labels so holders table updates instantly.
 */
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

export function NicknameProvider({ children }) {
  const { walletAddress } = useWallet();
  const addrKey = useMemo(() => normalizeAddr(walletAddress), [walletAddress]);

  // global toggle
  const [useNickname, setUseNickname] = useState(true);

  // per-wallet storage
  const [nicknamesByAddr, setNicknamesByAddr] = useState({}); // { [addrLower]: "Name" }

  // current wallet's nickname (derived from nicknamesByAddr + addrKey)
  const [nickname, setNicknameState] = useState("");

  // modal + async state
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── load from localStorage once ───────────────────────────
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = safeParse(raw, null);
    if (!parsed) return;

    if (typeof parsed.useNickname === "boolean") {
      setUseNickname(parsed.useNickname);
    }

    if (parsed.nicknames && typeof parsed.nicknames === "object") {
      setNicknamesByAddr(parsed.nicknames);
    }
  }, []);

  // ── when wallet changes: set nickname from per-wallet map ──
  useEffect(() => {
    if (!addrKey) {
      setNicknameState("");
      return;
    }

    const localName = nicknamesByAddr?.[addrKey];
    if (typeof localName === "string" && localName.trim().length > 0) {
      setNicknameState(localName.trim());
    } else {
      // IMPORTANT: do not carry nickname between wallets
      setNicknameState("");
    }
  }, [addrKey, nicknamesByAddr]);

  // ── persist to localStorage whenever map / toggle changes ──
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        useNickname,
        nicknames: nicknamesByAddr,
      });
      window.localStorage.setItem(STORAGE_KEY, payload);
    } catch (err) {
      console.error("Failed to save nickname settings:", err);
    }
  }, [useNickname, nicknamesByAddr]);

  // ── on wallet change, optionally try to read on-chain nickname ───
  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;

    (async () => {
      try {
        const chainName = await getNickname(walletAddress);
        const trimmed = (chainName || "").trim();

        if (!cancelled && trimmed.length > 0) {
          const key = normalizeAddr(walletAddress);

          setNicknamesByAddr((prev) => {
            const cur = prev?.[key];
            if (cur === trimmed) return prev || {};
            return { ...(prev || {}), [key]: trimmed };
          });

          setNicknameState(trimmed);
          setUseNickname(true);

          // ✅ keep BlockSwap holders label in sync too
          try {
            blockswapAdapter.setLabel({ walletAddress, label: trimmed });
          } catch {
            // ignore if adapter isn't ready or user isn't on BlockSwap page
          }
        }
      } catch (err) {
        console.debug("No nickname on chain for this wallet:", err?.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // ── optional: react to MetaMask account changes ──
  useEffect(() => {
    if (!window?.ethereum?.on) return;

    const handler = () => {
      setModalOpen(false);
    };

    window.ethereum.on("accountsChanged", handler);
    return () => {
      try {
        window.ethereum.removeListener("accountsChanged", handler);
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ── internal helper to set nickname PER WALLET (and current state) ──
  const setNickname = (val) => {
    const trimmed = (val || "").trim();

    setNicknameState(trimmed);

    if (walletAddress) {
      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));

      // ✅ also update BlockSwap label right away
      try {
        blockswapAdapter.setLabel({ walletAddress, label: trimmed });
      } catch {
        /* ignore */
      }
    }
  };

  // ── what the modal actually calls ─────────────────────────
  const saveNickname = async (name) => {
    const trimmed = (name || "").trim();

    if (!walletAddress) throw new Error("Connect your wallet first.");
    if (!trimmed) throw new Error("Enter a nickname first.");
    if (trimmed.length < 3) throw new Error("Name too short.");

    setLoading(true);
    try {
      console.log("[NicknameContext] saving nickname:", trimmed);

      // 👉 triggers MetaMask (writes on-chain)
      // (keeping your signature exactly as you wrote it)
      await setNicknameOnChain(trimmed, walletAddress);

      // update local state PER WALLET
      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));
      setNicknameState(trimmed);
      setUseNickname(true);

      // ✅ THIS is the missing link:
      // update the BlockSwap "labels" map so holders table shows nickname immediately
      try {
        blockswapAdapter.setLabel({ walletAddress, label: trimmed });
      } catch (e) {
        console.debug("BlockSwap label sync skipped:", e?.message);
      }

      return true;
    } finally {
      setLoading(false);
    }
  };

  const askForNickname = () => {
    if (!walletAddress) {
      console.warn("No wallet connected, cannot open nickname modal");
      return;
    }
    setModalOpen(true);
  };

  const value = {
    nickname,
    useNickname,

    setNickname, // per-wallet
    setUseNickname,

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
  if (!ctx) {
    throw new Error("useNicknameContext must be used inside a NicknameProvider");
  }
  return ctx;
}

export function useNickname() {
  return useNicknameContext();
}

export function getDisplayName({ walletAddress, nickname, useNickname }) {
  if (useNickname && nickname && nickname.trim().length > 0) {
    return nickname.trim();
  }

  if (!walletAddress) return "Unknown";

  const addr = String(walletAddress);
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default NicknameProvider;
