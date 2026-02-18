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
  return String(e?.shortMessage || e?.message || e);
}

export function NicknameProvider({ children }) {
  const { walletAddress, provider, isConnected } = useWallet();
  const addrKey = useMemo(() => normalizeAddr(walletAddress), [walletAddress]);

  const [useNickname, setUseNickname] = useState(true);
  const [nicknamesByAddr, setNicknamesByAddr] = useState({});
  const [nickname, setNicknameState] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // ensure adapter signs with the active provider
  useEffect(() => {
    try {
      if (provider && typeof provider.request === "function") {
        blockswapAdapter.setProvider(provider);
      }
    } catch {}
  }, [provider]);

  // load local
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = safeParse(raw, null);
    if (!parsed) return;

    if (typeof parsed.useNickname === "boolean") setUseNickname(parsed.useNickname);
    if (parsed.nicknames && typeof parsed.nicknames === "object") setNicknamesByAddr(parsed.nicknames);
  }, []);

  // persist local
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ useNickname, nicknames: nicknamesByAddr }));
    } catch (err) {
      console.error("Failed to save nickname settings:", err);
    }
  }, [useNickname, nicknamesByAddr]);

  // wallet change
  useEffect(() => {
    setModalOpen(false);
    setLoading(false);

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

  // read chain nickname once on connect/change
  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;

    (async () => {
      try {
        const chainName = await getNickname(walletAddress);
        const trimmed = (chainName || "").trim();
        if (cancelled || trimmed.length === 0) return;

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
      } catch (err) {
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

  const saveNickname = async (name) => {
    const trimmed = (name || "").trim();

    if (!walletAddress || !isConnected) throw new Error("Connect your wallet first.");
    if (!trimmed) throw new Error("Enter a nickname first.");
    if (trimmed.length < 3) throw new Error("Name too short.");
    if (trimmed.length > 24) throw new Error("Name too long (max 24).");

    setLoading(true);
    try {
      try {
        await setNicknameRelayed(trimmed, walletAddress, provider);
      } catch (e) {
        const allowDirect = envBool(import.meta.env.VITE_ALLOW_DIRECT_NICKNAME);
        if (!allowDirect) {
          throw new Error(
            `Gasless nickname failed: ${errToString(e)}\n` +
              `Fix: ensure relayer exposes POST /relay/nickname and VITE_RELAYER_URL is set.\n` +
              `Dev escape hatch: set VITE_ALLOW_DIRECT_NICKNAME=true (or 1).`
          );
        }
        await setNicknameDirect(trimmed, walletAddress, provider);
      }

      const key = normalizeAddr(walletAddress);
      setNicknamesByAddr((prev) => ({ ...(prev || {}), [key]: trimmed }));
      setNicknameState(trimmed);
      setUseNickname(true);

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
    setModalOpen(true);
  };

  const value = {
    nickname,
    useNickname,
    setNickname,
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
