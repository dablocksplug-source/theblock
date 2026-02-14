// src/pages/BlockSwap.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";

import { blockswapAdapter } from "../services/blockswapAdapter";
import BlockSwapAdminPanel from "../components/BlockSwapAdminPanel";

import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";
import { useSound } from "../context/SoundContext";
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";

// ✅ Supabase (optional) — singleton to avoid multiple GoTrueClient instances during HMR
import { createClient } from "@supabase/supabase-js";

// ✅ Rewards claim (Merkle)
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import BlockRewardsMerkle from "../abi/BlockRewardsMerkle.json";

// ✅ Wagmi write (works for MetaMask + Coinbase + WalletConnect)
import { useWriteContract } from "wagmi";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Dev toggle (optional): show extra debug actions
const DEBUG_LOGS =
  String(import.meta.env.VITE_DEBUG_LOGS || "").trim() === "1" ||
  String(import.meta.env.VITE_DEBUG_LOGS || "").trim().toLowerCase() === "true";

function getSupabaseSingleton() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON) return null;
    const g = globalThis;
    if (g.__theblock_supabase) return g.__theblock_supabase;
    g.__theblock_supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    return g.__theblock_supabase;
  } catch {
    return null;
  }
}
const supabase = getSupabaseSingleton();

const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—");

function bricksOzFromTotal(totalOz, ozPerBrick) {
  const t = Number(totalOz || 0);
  const b = Math.floor(t / ozPerBrick);
  const o = t % ozPerBrick;
  return { b, o };
}

function clampInt(val, min, max) {
  const n = Number.isFinite(val) ? val : Number(val || 0);
  const i = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.max(min, Math.min(max, i));
}

function normalizeBricksOunces(bricks, ounces, ozPerBrick) {
  const b = clampInt(bricks, 0, 1_000_000);
  const oRaw = clampInt(ounces, 0, 1_000_000);
  const carry = Math.floor(oRaw / ozPerBrick);
  const o = oRaw % ozPerBrick;
  return { bricks: b + carry, ounces: o };
}

function chunk(arr, size) {
  const safe = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < safe.length; i += size) out.push(safe.slice(i, i + size));
  return out;
}

function prettyMaybeNumberString(v, maxFrac = 6) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "—");
  if (n > 0 && n < 0.001) return "< 0.001";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

function tsFromBlock(blockNumber) {
  const b = Number(blockNumber || 0);
  if (!b) return "";
  return `#${b.toLocaleString()}`;
}

async function fetchJson(url, { method = "GET", body, timeoutMs = 15_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store", // ✅ avoid any caching weirdness
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function copyToClipboard(text) {
  const t = String(text || "");
  if (!t) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

function fmtTimeFromUnix(unixSeconds) {
  const n = Number(unixSeconds || 0);
  if (!n) return "—";
  const d = new Date(n * 1000);
  return d.toLocaleString();
}

/**
 * Convert scientific notation strings (e.g. "1.08e+21") into a full integer string.
 * Works without using Number(), so no precision loss.
 */
function sciToIntString(s) {
  const str = String(s ?? "").trim();
  if (!str) return "0";
  // If it's already plain digits (or -digits), return as-is
  if (/^-?\d+$/.test(str)) return str;

  // Match scientific notation: [-]?\d+(\.\d+)?e[+-]?\d+
  const m = str.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) return str; // let caller handle / throw

  const sign = m[1] || "";
  const intPart = m[2] || "0";
  const fracPart = m[3] || "";
  const exp = parseInt(m[4], 10);

  // Build digits with no dot
  const digits = (intPart + fracPart).replace(/^0+/, "") || "0";
  const fracLen = fracPart.length;

  // exponent shifts decimal point right/left
  const shift = exp - fracLen;

  if (shift >= 0) {
    // append zeros
    const out = digits + "0".repeat(shift);
    return sign + (out.replace(/^0+/, "") || "0");
  }

  // negative shift would imply fraction (should not happen for oz_wei); floor to 0
  return "0";
}

/**
 * Safe BigInt from relayer JSON values.
 * Handles:
 *  - bigint
 *  - integer string
 *  - scientific notation string like "1.08e+21"
 *  - numbers (converted via String -> sciToIntString to avoid Number precision)
 */
function toBigIntSafe(v, fallback = 0n) {
  try {
    if (typeof v === "bigint") return v;
    const s0 = String(v ?? "").trim();
    if (!s0) return fallback;

    const s = /[eE]/.test(s0) ? sciToIntString(s0) : s0;

    // strip commas/spaces
    const clean = s.replace(/,/g, "");
    if (!clean) return fallback;

    return BigInt(clean);
  } catch {
    return fallback;
  }
}

/**
 * Safe decimal formatting for on-chain BigInt-ish values.
 */
function formatUnitsStr(value, decimals, maxFrac = 6) {
  try {
    const bi = toBigIntSafe(value, 0n);
    const neg = bi < 0n;
    const x = neg ? -bi : bi;

    const base = 10n ** BigInt(decimals);
    const whole = x / base;
    const frac = x % base;

    let fracStr = frac.toString().padStart(decimals, "0");
    if (maxFrac >= 0) fracStr = fracStr.slice(0, Math.min(decimals, maxFrac));
    fracStr = fracStr.replace(/0+$/, "");

    const s = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
    return neg ? `-${s}` : s;
  } catch {
    return "0";
  }
}

function formatUnitsPretty(value, decimals, maxFrac) {
  const s = formatUnitsStr(value, decimals, maxFrac);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n > 0 && n < 0.001) return "< 0.001";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

export default function BlockSwap() {
  const {
    walletAddress,
    isConnected,
    chainId,
    ensureChain,
    connectMetaMask,
    connectCoinbase,
    connectWalletConnect,
  } = useWallet();

  const { nickname, useNickname } = useNicknameContext();
  const { soundEnabled } = useSound();

  // ✅ Wagmi write (MetaMask/Coinbase/WC)
  const { writeContractAsync } = useWriteContract();

  const ambienceRef = useRef(null);
  const mountedRef = useRef(true);

  // prevent overlapping refreshes
  const refreshingRef = useRef(false);

  // ✅ StrictMode guard (prevents double interval + double initial calls in dev)
  const initOnceRef = useRef(false);

  // ✅ Street polling timer ref
  const streetTimerRef = useRef(null);

  // ✅ toast timer (auto-clear)
  const toastTimerRef = useRef(null);

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });
  const shortAddress = shortAddr(walletAddress);

  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const [snap, setSnap] = useState(null);
  const [activity, setActivity] = useState([]);
  const [holders, setHolders] = useState([]);
  const [profileMap, setProfileMap] = useState({});

  const [buyBricks, setBuyBricks] = useState(0);
  const [buyOunces, setBuyOunces] = useState(0);

  const [sellBricks, setSellBricks] = useState(0);
  const [sellOunces, setSellOunces] = useState(0);

  // ✅ diagnostic: what addresses are we actually reading?
  const [resolved, setResolved] = useState(null);

  // ✅ feed state
  const [feedLoadedOnce, setFeedLoadedOnce] = useState(false);
  const [feedErr, setFeedErr] = useState("");

  // ✅ minor UI state
  const [showContracts, setShowContracts] = useState(false);

  // ✅ last update times (for sanity)
  const [lastHoldersAt, setLastHoldersAt] = useState("");
  const [lastActivityAt, setLastActivityAt] = useState("");

  const ozPerBrick = Number(C.OUNCES_PER_BRICK || 36);
  const circulatingOz = (Number(C.BRICKS_AVAILABLE_FOR_SALE || 0) * ozPerBrick) || 0;

  // ✅ TRUE GASLESS buy + feed powered by relayer:
  const RELAYER_URL =
    (import.meta.env.VITE_RELAYER_URL || "").trim() ||
    (import.meta.env.VITE_BLOCK_RELAYER_URL || "").trim() ||
    "";

  // Tunables
  const FEED_LIMIT = 15;
  const FEED_POLL_MS = 90_000;
  const HOLDERS_LIMIT = 250;

  // -----------------------------
  // Rewards / Merkle claim state
  // -----------------------------
  const MERKLE_ABI = BlockRewardsMerkle?.abi || BlockRewardsMerkle;
  const MERKLE_MIN_ABI = useMemo(() => {
    try {
      return parseAbi([
        "function claimed(uint256,address) view returns (bool)",
        "function rounds(uint256) view returns (bytes32 merkleRoot,uint64 claimEnd,uint256 remainingUsdc)",
        "function claim(uint256 roundId,uint256 eligibleOzWei,uint256 payoutUsdc,bytes32[] proof)",
      ]);
    } catch {
      return null;
    }
  }, []);

  const rewardsAddress = useMemo(() => {
    const v = String(C.REWARDS_ADDRESS || "").trim();
    return v && v !== "0x0000000000000000000000000000000000000000" ? v : "";
  }, []);

  const rewardsRoundId = useMemo(() => Number(C.REWARDS_ROUND_ID || 1), []);
  const rewardsProofsUrl = useMemo(
    () => String(C.REWARDS_PROOFS_URL || "/rewards/round1.proofs.json"),
    []
  );

  const [rewardsErr, setRewardsErr] = useState("");
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardsMeta, setRewardsMeta] = useState(null); // { merkleRoot, claimEnd, remainingUsdc }
  const [myRewardsEntry, setMyRewardsEntry] = useState(null); // entry from proofs file
  const [myRewardsClaimed, setMyRewardsClaimed] = useState(null); // boolean
  const [rewardsTx, setRewardsTx] = useState("");

  const chainObj = useMemo(() => {
    return Number(C.CHAIN_ID || 84532) === base.id ? base : baseSepolia;
  }, []);

  const publicClient = useMemo(() => {
    const rpc = String(C.RPC_URL || "").trim();
    if (!rpc) return null;
    try {
      return createPublicClient({ chain: chainObj, transport: http(rpc) });
    } catch {
      return null;
    }
  }, [chainObj]);

  // ✅ Never print your RPC key in prod UI; show full only when DEBUG_LOGS=1
  const rpcUiLabel = useMemo(() => {
    const rpc = String(C.RPC_URL || "").trim();
    if (!rpc) return "(missing)";
    if (DEBUG_LOGS) return rpc;
    return "configured";
  }, []);

  function flashToast(msg, ms = 1200) {
    setToast(String(msg || ""));
    try {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setToast("");
      }, ms);
    } catch {}
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        clearTimeout(toastTimerRef.current);
        clearInterval(streetTimerRef.current);
      } catch {}
    };
  }, []);

  // ✅ ambience obey SoundContext
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!ambienceRef.current) {
      const a = new Audio("/sounds/swapambience.m4a");
      a.loop = true;
      a.volume = 0.25;
      ambienceRef.current = a;
    }

    const a = ambienceRef.current;

    const safePauseReset = () => {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    };

    const tryPlay = () => {
      a.play().catch(() => {
        const resume = () => {
          a.play().catch(() => {});
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("touchstart", resume);
          window.removeEventListener("click", resume);
        };
        window.addEventListener("pointerdown", resume, { once: true });
        window.addEventListener("touchstart", resume, { once: true });
        window.addEventListener("click", resume, { once: true });
      });
    };

    if (soundEnabled) tryPlay();
    else safePauseReset();

    return () => safePauseReset();
  }, [soundEnabled]);

  const isAdmin = useMemo(() => {
    if (!walletAddress) return false;
    return String(walletAddress).toLowerCase() === String(C.ADMIN_WALLET || "").toLowerCase();
  }, [walletAddress]);

  const STABLE = C.STABLE_SYMBOL || "USDC";
  const TARGET_CHAIN_ID = Number(C.CHAIN_ID || 0);

  const buyTotalOz = useMemo(
    () => buyBricks * ozPerBrick + buyOunces,
    [buyBricks, buyOunces, ozPerBrick]
  );
  const sellTotalOz = useMemo(
    () => sellBricks * ozPerBrick + sellOunces,
    [sellBricks, sellOunces, ozPerBrick]
  );

  // adapter returns: ounceSellPrice / ounceBuybackFloor
  const buyPriceOz = Number(snap?.ounceSellPrice || 0);
  const sellFloorOz = Number(snap?.ounceBuybackFloor || 0);

  const buyPriceBrick = buyPriceOz ? buyPriceOz * ozPerBrick : 0;
  const sellFloorBrick = sellFloorOz ? sellFloorOz * ozPerBrick : 0;

  const buyCost = useMemo(() => buyTotalOz * buyPriceOz, [buyTotalOz, buyPriceOz]);
  const sellProceeds = useMemo(() => sellTotalOz * sellFloorOz, [sellTotalOz, sellFloorOz]);

  const chainReady = Number(chainId) > 0;
  const wrongChain =
    isConnected &&
    Number(TARGET_CHAIN_ID) > 0 &&
    chainReady &&
    Number(chainId) !== Number(TARGET_CHAIN_ID);

  const canBuy =
    isConnected && !wrongChain && !snap?.buyPaused && buyTotalOz > 0 && !!RELAYER_URL;
  const canSell = isConnected && !wrongChain && sellTotalOz > 0;

  async function upsertMyProfile() {
    try {
      if (!supabase) return;
      if (!walletAddress) return;

      const addr = String(walletAddress).toLowerCase();
      const nick = String(nickname || "").trim();

      const payload = {
        chain_id: Number(C.CHAIN_ID || 0),
        address: addr,
        nickname: nick || null,
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "chain_id,address" });

      if (error && DEBUG_LOGS) console.warn("Supabase upsert profile error:", error?.message || error);
    } catch (e) {
      if (DEBUG_LOGS) console.warn("Supabase upsert profile exception:", e?.message || e);
    }
  }

  async function fetchProfilesForAddresses(addresses) {
    if (!supabase) return {};
    const list = (Array.isArray(addresses) ? addresses : [])
      .map((a) => String(a || "").toLowerCase())
      .filter(Boolean);

    if (!list.length) return {};

    const batches = chunk(list, 200);
    const nextMap = {};

    for (const batch of batches) {
      const { data, error } = await supabase
        .from("profiles")
        .select("address,nickname")
        .eq("chain_id", Number(C.CHAIN_ID || 0))
        .in("address", batch);

      if (error) {
        if (DEBUG_LOGS) console.warn("Supabase fetch profiles error:", error?.message || error);
        continue;
      }

      (data || []).forEach((row) => {
        if (!row?.address) return;
        nextMap[String(row.address).toLowerCase()] = { nickname: row.nickname || null };
      });
    }

    return nextMap;
  }

  // ✅ Snapshot refresh strategy (safe — no logs)
  async function refreshSnapshot({ silent = false } = {}) {
    if (!mountedRef.current) return;
    if (refreshingRef.current) return;

    refreshingRef.current = true;

    if (!silent) {
      setErr("");
      setToast("");
      setLoading(true);
    }

    try {
      const addr = await blockswapAdapter.getResolvedAddresses();
      if (mountedRef.current) setResolved(addr || null);

      const s = await blockswapAdapter.getSwapSnapshot();
      if (mountedRef.current) setSnap(s || null);
    } catch (e) {
      if (mountedRef.current) {
        setErr(e?.shortMessage || e?.message || "Failed to load BlockSwap.");
      }
    } finally {
      if (!silent && mountedRef.current) setLoading(false);
      refreshingRef.current = false;
    }
  }

  // ✅ Feed strategy: pull from relayer endpoints (not browser RPC logs)
  async function refreshFeed({ silent = true } = {}) {
    if (!RELAYER_URL) return;

    const baseUrl = RELAYER_URL.replace(/\/+$/, "");
    if (!silent) setFeedErr("");

    try {
      const bust = `&_t=${Date.now()}`;

      const [act, hol] = await Promise.all([
        fetchJson(`${baseUrl}/feed/activity?limit=${FEED_LIMIT}${bust}`, { timeoutMs: 15_000 }),
        fetchJson(`${baseUrl}/feed/holders?limit=${HOLDERS_LIMIT}${bust}`, { timeoutMs: 15_000 }),
      ]);

      const rowsA = Array.isArray(act?.rows) ? act.rows : [];
      const rowsH = Array.isArray(hol?.rows) ? hol.rows : [];

      if (!mountedRef.current) return;

      setActivity(rowsA);
      setHolders(rowsH);
      setFeedLoadedOnce(true);
      setFeedErr("");

      setLastActivityAt(new Date().toLocaleTimeString());
      setLastHoldersAt(new Date().toLocaleTimeString());

      const addrs = rowsH.map((h) => h?.wallet).filter(Boolean);
      if (addrs.length) {
        const map = await fetchProfilesForAddresses(addrs);
        if (mountedRef.current) setProfileMap((prev) => ({ ...prev, ...map }));
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setFeedLoadedOnce(true);
      setFeedErr(e?.message || "Feed unavailable.");
      if (DEBUG_LOGS) console.warn("[feed] refresh failed:", e?.message || e);
    }
  }

  function startFeedPolling() {
    if (!RELAYER_URL) return;

    // always reset interval to avoid duplicates
    if (streetTimerRef.current) {
      clearInterval(streetTimerRef.current);
      streetTimerRef.current = null;
    }

    refreshFeed({ silent: true }).catch(() => {});
    streetTimerRef.current = setInterval(() => {
      refreshFeed({ silent: true }).catch(() => {});
    }, FEED_POLL_MS);
  }

  function stopFeedPolling() {
    if (streetTimerRef.current) {
      clearInterval(streetTimerRef.current);
      streetTimerRef.current = null;
    }
  }

  // Initial snapshot polling (safe)
  useEffect(() => {
    if (initOnceRef.current) return;
    initOnceRef.current = true;

    refreshSnapshot({ silent: false }).catch(() => {});
    startFeedPolling();

    const t = setInterval(() => {
      refreshSnapshot({ silent: true }).catch(() => {});
    }, 20_000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        refreshSnapshot({ silent: true }).catch(() => {});
        refreshFeed({ silent: true }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      stopFeedPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If relayer url toggles on/off, begin/stop polling
  useEffect(() => {
    if (RELAYER_URL) startFeedPolling();
    else stopFeedPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RELAYER_URL]);

  // Supabase nickname upsert
  useEffect(() => {
    if (!isConnected) return;
    if (!walletAddress) return;
    upsertMyProfile().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, walletAddress, nickname]);

  // -----------------------------
  // Rewards loaders
  // -----------------------------
  async function loadRewardsForWallet() {
    if (!mountedRef.current) return;

    setRewardsErr("");
    setMyRewardsEntry(null);
    setMyRewardsClaimed(null);
    setRewardsMeta(null);
    setRewardsTx("");

    if (!walletAddress || !isConnected) return;

    if (!rewardsAddress) {
      setRewardsErr("Rewards contract address missing. Set VITE_REWARDS_MERKLE_ADDRESS (or VITE_REWARDS_ADDRESS).");
      return;
    }
    if (!publicClient) {
      setRewardsErr("RPC not configured. Set VITE_RPC_URL (or C.RPC_URL).");
      return;
    }

    setRewardsLoading(true);
    try {
      // 1) load proofs file
      const proofs = await fetchJson(rewardsProofsUrl, { timeoutMs: 20_000 });
      const entries = Array.isArray(proofs?.entries) ? proofs.entries : [];

      const target = String(walletAddress).toLowerCase();
      const mine = entries.find((e) => String(e?.wallet || "").toLowerCase() === target) || null;
      if (mountedRef.current) setMyRewardsEntry(mine);

      // 2) load onchain round info
      const abi = MERKLE_ABI || MERKLE_MIN_ABI;
      const rid = BigInt(rewardsRoundId);

      const [round, claimed] = await Promise.all([
        publicClient.readContract({ address: rewardsAddress, abi, functionName: "rounds", args: [rid] }),
        publicClient.readContract({ address: rewardsAddress, abi, functionName: "claimed", args: [rid, target] }),
      ]);

      const meta = { merkleRoot: round?.[0], claimEnd: round?.[1], remainingUsdc: round?.[2] };

      if (mountedRef.current) {
        setRewardsMeta(meta);
        setMyRewardsClaimed(!!claimed);
      }
    } catch (e) {
      if (mountedRef.current) setRewardsErr(e?.message || "Failed to load rewards data.");
    } finally {
      if (mountedRef.current) setRewardsLoading(false);
    }
  }

  useEffect(() => {
    loadRewardsForWallet().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, isConnected, rewardsAddress, rewardsProofsUrl]);

  // ✅ FIXED: WalletConnect-safe claim (NO window.ethereum)
  async function handleClaimRewards() {
    setRewardsErr("");
    setToast("");
    setErr("");

    try {
      if (!walletAddress) throw new Error("Connect wallet first.");
      if (!rewardsAddress) throw new Error("Rewards address missing in config/env.");
      if (!publicClient) throw new Error("RPC missing.");
      if (!myRewardsEntry) throw new Error("This wallet is not in the proofs file.");

      const abi = MERKLE_ABI || MERKLE_MIN_ABI;
      if (!abi) throw new Error("Merkle ABI missing.");

      // ✅ try to auto-switch first (WalletConnect needs this)
      if (ensureChain && TARGET_CHAIN_ID) {
        await ensureChain(TARGET_CHAIN_ID);
      }

      // After switch attempt, if still wrong, stop
      if (isConnected && TARGET_CHAIN_ID && Number(chainId || 0) && Number(chainId || 0) !== Number(TARGET_CHAIN_ID)) {
        throw new Error(`Wrong network. Switch to chain ${TARGET_CHAIN_ID}.`);
      }

      const rid = BigInt(rewardsRoundId);
      const eligibleOzWei = toBigIntSafe(myRewardsEntry.eligibleOzWei, 0n);
      const payoutUsdc6 = toBigIntSafe(myRewardsEntry.payoutUsdc6, 0n);
      const proof = Array.isArray(myRewardsEntry.proof) ? myRewardsEntry.proof : [];

      setRewardsLoading(true);

      // ✅ Uses active wagmi connector (MetaMask/Coinbase/WC)
      const hash = await writeContractAsync({
        account: walletAddress,
        address: rewardsAddress,
        abi,
        functionName: "claim",
        args: [rid, eligibleOzWei, payoutUsdc6, proof],
      });

      setRewardsTx(hash);

      await publicClient.waitForTransactionReceipt({ hash });

      flashToast("Rewards claimed ✅");
      await loadRewardsForWallet();
    } catch (e) {
      setRewardsErr(e?.shortMessage || e?.message || "Claim failed.");
    } finally {
      setRewardsLoading(false);
    }
  }

  // ✅ Gasless buy ONLY
  const handleBuy = async () => {
    setErr("");
    setToast("");
    try {
      if (!walletAddress) throw new Error("Connect wallet first.");
      if (wrongChain) throw new Error(`Wrong network. Switch to chain ${TARGET_CHAIN_ID}.`);
      if (snap?.buyPaused) throw new Error("Buys are paused right now.");
      if (buyTotalOz <= 0) throw new Error("Enter an amount to buy.");
      if (!RELAYER_URL) throw new Error("Relayer is not configured. Buys are gasless-only in this build.");

      setLoading(true);

      const res = await blockswapAdapter.buyOzGasless({
        walletAddress,
        ouncesWhole: String(buyTotalOz),
      });

      if (res?.hash) await blockswapAdapter.waitForTx(res.hash);

      flashToast("Buy confirmed ✅");
      setBuyBricks(0);
      setBuyOunces(0);

      await upsertMyProfile();
      await refreshSnapshot({ silent: true });

      // pull feed immediately after buy
      refreshFeed({ silent: true }).catch(() => {});
    } catch (e) {
      setErr(e?.shortMessage || e?.message || "Buy failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    setErr("");
    setToast("");
    try {
      if (!walletAddress) throw new Error("Connect wallet first.");
      if (wrongChain) throw new Error(`Wrong network. Switch to chain ${TARGET_CHAIN_ID}.`);
      if (sellTotalOz <= 0) throw new Error("Enter an amount to sell back.");

      setLoading(true);

      const res = await blockswapAdapter.sellBackOz({
        walletAddress,
        ouncesWhole: String(sellTotalOz),
      });

      if (res?.approveHash) await blockswapAdapter.waitForTx(res.approveHash);
      const finalHash = res?.sellHash || res?.hash;
      if (finalHash) await blockswapAdapter.waitForTx(finalHash);

      flashToast("Sell back confirmed ✅");
      setSellBricks(0);
      setSellOunces(0);

      await upsertMyProfile();
      await refreshSnapshot({ silent: true });

      refreshFeed({ silent: true }).catch(() => {});
    } catch (e) {
      setErr(e?.shortMessage || e?.message || "Sell back failed.");
    } finally {
      setLoading(false);
    }
  };

  const vault = snap?.fmt?.vault ?? snap?.fmt?.swapUsdc ?? "—";
  const treasury = snap?.fmt?.treasuryUsdc ?? snap?.fmt?.treasuryUSDC ?? snap?.fmt?.treasury ?? "—";

  const swapOzInvRaw = snap?.fmt?.ozInventory ?? snap?.fmt?.swapOz ?? "—";
  const swapOzInvPretty = swapOzInvRaw === "—" ? "—" : prettyMaybeNumberString(swapOzInvRaw, 6);

  const inventoryLooksSuspicious =
    String(swapOzInvRaw) !== "—" && Number(swapOzInvRaw) === 0 && snap?.sellPricePerBrick;

  // ✅ UI-ready street rows (BigInt-safe)
  const streetActivity = useMemo(() => {
    const rows = Array.isArray(activity) ? activity : [];
    return rows
      .map((x) => {
        const kind = String(x?.event_type || x?.kind || x?.type || "").toUpperCase();
        const who = x?.wallet || x?.who || "";
        const ozWei = x?.oz_wei ?? x?.ozWei ?? x?.oz ?? "0";
        const usdc6 = x?.usdc_6 ?? x?.usdc ?? "0";
        const blk = tsFromBlock(x?.block_number || x?.blockNumber);

        const ozLabel = formatUnitsPretty(ozWei, 18, 6);
        const usdcLabel = formatUnitsPretty(usdc6, 6, 2);

        const whoLabel = shortAddr(who);

        const text =
          kind === "BUY"
            ? `BUY • ${whoLabel} bought ${ozLabel} oz for ${usdcLabel} ${STABLE}`
            : kind === "SELLBACK"
            ? `SELLBACK • ${whoLabel} sold ${ozLabel} oz for ${usdcLabel} ${STABLE}`
            : `TX • ${whoLabel}`;

        return { text, ts: blk };
      })
      .filter((x) => x?.text);
  }, [activity, STABLE]);

  // ✅ holders (scientific-notation-safe + BigInt math)
  const holderRows = useMemo(() => {
    const raw = Array.isArray(holders) ? holders : [];

    const OZ_WEI = 10n ** 18n;
    const ozPerBrickBI = BigInt(ozPerBrick || 36);

    const normalized = raw.map((h) => {
      const address = h?.wallet || "";
      const addrLower = String(address || "").toLowerCase();
      const supaNick = profileMap?.[addrLower]?.nickname || null;

      const ozWeiBI = toBigIntSafe(h?.oz_wei ?? h?.ozWei ?? "0", 0n);

      // whole ounces (integer)
      const ouncesWholeBI = ozWeiBI / OZ_WEI;

      const bricksBI = ozPerBrickBI > 0n ? ouncesWholeBI / ozPerBrickBI : 0n;
      const remOzBI = ozPerBrickBI > 0n ? ouncesWholeBI % ozPerBrickBI : 0n;

      // for % we can safely convert to Number because totals are small (tens of thousands)
      const ouncesWholeNum = Number(ouncesWholeBI);
      const pct = circulatingOz ? (ouncesWholeNum / circulatingOz) * 100 : 0;

      const bNum = Number(bricksBI);
      const oNum = Number(remOzBI);

      return {
        address,
        display: supaNick ? `${supaNick} (${shortAddr(address)})` : shortAddr(address),
        ouncesWholeNum,
        weightLabel: `${bNum} brick${bNum === 1 ? "" : "s"} ${oNum} oz`,
        pctWeightCirculating: pct,
        isBrickHolder: ouncesWholeBI >= ozPerBrickBI,
      };
    });

    return normalized
      .filter((x) => x.address)
      .sort((a, b) => (b.ouncesWholeNum || 0) - (a.ouncesWholeNum || 0));
  }, [holders, ozPerBrick, circulatingOz, profileMap]);

  const HeaderPill = ({ children, tone = "slate", title }) => {
    const baseCls =
      "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide whitespace-nowrap";
    const tones = {
      slate: "border-slate-700/60 bg-slate-900/40 text-slate-300",
      emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
      rose: "border-rose-400/30 bg-rose-500/10 text-rose-200",
      indigo: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
      sky: "border-sky-400/30 bg-sky-500/10 text-sky-200",
      amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    };
    return (
      <span className={`${baseCls} ${tones[tone] || tones.slate}`} title={title}>
        {children}
      </span>
    );
  };

  const ConnectDropdown = () => {
    return (
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400">
          Connect
        </summary>

        <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
          <button
            onClick={async () => {
              try {
                setErr("");
                await connectMetaMask?.();
              } catch (e) {
                setErr(e?.message || "MetaMask connect failed.");
              }
            }}
            className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
            type="button"
          >
            MetaMask
          </button>
          <button
            onClick={async () => {
              try {
                setErr("");
                await connectCoinbase?.();
              } catch (e) {
                setErr(e?.message || "Coinbase connect failed.");
              }
            }}
            className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
            type="button"
          >
            Coinbase
          </button>
          <button
            onClick={async () => {
              try {
                setErr("");
                await connectWalletConnect?.();
              } catch (e) {
                setErr(e?.message || "WalletConnect failed.");
              }
            }}
            className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
            type="button"
          >
            WalletConnect
          </button>

          <div className="border-t border-slate-800/80 px-4 py-2 text-[11px] text-slate-400">
            You can switch later.
          </div>
        </div>
      </details>
    );
  };

  const ContractRow = ({ label, value }) => {
    const v = value || "";
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-slate-500">{label}</div>
          <div className="truncate font-mono text-xs text-slate-200">
            {v ? v : "—"}
            {v ? <span className="ml-2 text-slate-500">({shortAddr(v)})</span> : null}
          </div>
        </div>

        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500 disabled:opacity-50"
          disabled={!v}
          onClick={async () => {
            const ok = await copyToClipboard(v);
            if (ok) flashToast("Copied ✅");
          }}
          title="Copy address"
        >
          Copy
        </button>
      </div>
    );
  };

  const myPayoutUsdc = useMemo(() => {
    if (!myRewardsEntry?.payoutUsdc6) return null;
    try {
      const n = Number(formatUnitsStr(myRewardsEntry.payoutUsdc6, 6, 6));
      if (!Number.isFinite(n)) return null;
      return n;
    } catch {
      return null;
    }
  }, [myRewardsEntry]);

  // Wallet chip: shorten label, show full display name + address on hover
  const walletChipLabel = useMemo(() => {
    const dn = String(displayName || "").trim() || "Wallet";
    const dnShort = dn.length > 18 ? `${dn.slice(0, 18)}…` : dn;
    return `${dnShort} (${shortAddress})`;
  }, [displayName, shortAddress]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-wide">The Block</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
                BlockSwap
              </span>

              <HeaderPill tone={snap?.buyPaused ? "rose" : "emerald"} title="Buys can be paused by admin">
                Buys: {snap?.buyPaused ? "PAUSED" : "LIVE"}
              </HeaderPill>

              <HeaderPill
                tone={RELAYER_URL ? "emerald" : "rose"}
                title={RELAYER_URL ? "Relayer enabled (gasless buy + feed)" : "Relayer missing"}
              >
                Gasless: {RELAYER_URL ? "ON" : "OFF"}
              </HeaderPill>

              {isAdmin ? <HeaderPill tone="sky">Admin</HeaderPill> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <HeaderPill tone="slate" title="Settlement stablecoin">
                Settlement: {STABLE}
              </HeaderPill>

              {isConnected ? (
                <>
                  <HeaderPill
                    tone={wrongChain ? "rose" : "slate"}
                    title={`${String(displayName || "").trim() || "Wallet"} • ${String(walletAddress || "").toLowerCase()}`}
                  >
                    {walletChipLabel}
                  </HeaderPill>

                  {wrongChain && ensureChain ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setErr("");
                          await ensureChain(TARGET_CHAIN_ID);
                        } catch (e) {
                          setErr(e?.message || "Failed to switch network.");
                        }
                      }}
                      className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-rose-400"
                    >
                      Switch Network
                    </button>
                  ) : null}
                </>
              ) : (
                <ConnectDropdown />
              )}

              <button
                onClick={async () => {
                  await refreshSnapshot({ silent: false });
                  refreshFeed({ silent: true }).catch(() => {});
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
                type="button"
                title="Refresh on-chain snapshot + feed"
              >
                Refresh
              </button>

              <button
                onClick={() => setShowContracts((v) => !v)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
                type="button"
                title="Show / hide contract addresses"
              >
                {showContracts ? "Hide contracts" : "Show contracts"}
              </button>

              <Link
                to="/"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
              >
                Home
              </Link>
            </div>
          </div>

          {DEBUG_LOGS ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">
                  Nicknames: <span className="text-slate-300">{supabase ? "ON" : "OFF"}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-500">
                  RPC: <span className="text-slate-300">{rpcUiLabel}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-500">
                  ChainId: <span className="text-slate-300">{TARGET_CHAIN_ID || "—"}</span>
                </span>
              </div>

              <div className="text-slate-500">
                {RELAYER_URL ? (
                  <>
                    Activity refresh ~<span className="font-mono">{Math.round(FEED_POLL_MS / 1000)}</span>s
                  </>
                ) : (
                  <>Relayer not configured</>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        {wrongChain ? (
          <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Wallet is on the wrong network. Please switch networks in your wallet.
          </div>
        ) : null}

        {err ? (
          <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {err}
          </div>
        ) : null}

        {toast ? (
          <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {toast}
          </div>
        ) : null}

        {loading ? (
          <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
            Working… (pulling chain / feed data)
          </div>
        ) : null}

        {feedErr ? (
          <div className="mb-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Feed temporarily unavailable: <span className="text-amber-100">{feedErr}</span>
          </div>
        ) : null}

        {/* Contracts */}
        {showContracts ? (
          <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contracts</div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <ContractRow label="BlockSwap" value={resolved?.SWAP} />
              <ContractRow label="OZ token" value={resolved?.OZ} />
              <ContractRow label="USDC token" value={resolved?.USDC} />
            </div>

            {!RELAYER_URL ? (
              <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                Gasless buys + activity feed are OFF because <span className="font-mono">VITE_RELAYER_URL</span> is missing.
              </div>
            ) : null}

            {inventoryLooksSuspicious ? (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                OZ inventory reads <span className="font-mono">0</span> but pricing loaded. If RPC is flaky, balances can fail to
                load.
              </div>
            ) : null}

            {!supabase ? (
              <div className="mt-3 text-[0.75rem] text-slate-500">
                Nicknames are optional. Add <span className="font-mono">VITE_SUPABASE_URL</span> and{" "}
                <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to <span className="font-mono">.env.local</span> to
                display names in the holders list.
              </div>
            ) : (
              <div className="mt-3 text-[0.75rem] text-slate-500">
                Nicknames: <span className="font-mono">ON</span> • Users can set a display name.
              </div>
            )}
          </section>
        ) : null}

        {/* Admin panel */}
        {isAdmin ? (
          <details className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-200">
              Admin controls <span className="ml-2 text-xs font-normal text-slate-500">(only visible to admin wallet)</span>
            </summary>

            <div className="mt-4">
              <BlockSwapAdminPanel
                walletAddress={walletAddress}
                adminWallet={C.ADMIN_WALLET}
                chainId={chainId}
                targetChainId={TARGET_CHAIN_ID}
                ensureChain={ensureChain}
                stableSymbol={STABLE}
                onRefresh={(maybeSnap) => {
                  if (maybeSnap && typeof maybeSnap === "object") setSnap(maybeSnap);
                  else refreshSnapshot({ silent: true });
                }}
              />
            </div>
          </details>
        ) : null}

        {/* Main grid */}
        <section className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Left */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Trade</h2>
              <span className="text-xs text-slate-400">1 brick = {ozPerBrick} oz</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* BUY */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Buy (Gasless)</div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      (snap?.buyPaused ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200")
                    }
                  >
                    {snap?.buyPaused ? "PAUSED" : "LIVE"}
                  </span>
                </div>

                <div className="mb-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Price / oz</span>
                    <span className="font-mono text-slate-100">
                      {buyPriceOz ? buyPriceOz.toFixed(6) : "—"} {STABLE}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price / brick</span>
                    <span className="font-mono text-slate-100">
                      {buyPriceBrick ? buyPriceBrick.toFixed(2) : "—"} {STABLE}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-xs text-slate-400">Bricks</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={buyBricks}
                      onChange={(e) => {
                        const next = normalizeBricksOunces(parseInt(e.target.value || "0", 10), buyOunces, ozPerBrick);
                        setBuyBricks(next.bricks);
                        setBuyOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                      disabled={!!snap?.buyPaused || loading || wrongChain || !RELAYER_URL}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-slate-400">Ounces</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={buyOunces}
                      onChange={(e) => {
                        const next = normalizeBricksOunces(buyBricks, parseInt(e.target.value || "0", 10), ozPerBrick);
                        setBuyBricks(next.bricks);
                        setBuyOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                      disabled={!!snap?.buyPaused || loading || wrongChain || !RELAYER_URL}
                    />
                    <div className="mt-1 text-[0.65rem] text-slate-500">
                      Auto-carries into bricks (0–{ozPerBrick - 1} shown).
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Total ounces</span>
                    <span className="font-mono text-slate-100">{buyTotalOz} oz</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost</span>
                    <span className="font-mono text-slate-100">
                      {buyCost.toFixed(2)} {STABLE}
                    </span>
                  </div>
                </div>

                <button
                  className="mt-4 w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canBuy || loading}
                  onClick={handleBuy}
                  type="button"
                  title={!RELAYER_URL ? "Relayer required for gasless buy" : "Gasless buy"}
                >
                  Buy
                </button>

                {!RELAYER_URL ? (
                  <div className="mt-3 text-[0.7rem] leading-relaxed text-slate-500">
                    Gasless buy requires the relayer. (Set <span className="font-mono">VITE_RELAYER_URL</span>.)
                  </div>
                ) : null}
              </div>

              {/* SELLBACK */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Sell Back (Floor)</div>

                <div className="mb-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Floor / oz</span>
                    <span className="font-mono text-emerald-200">
                      {sellFloorOz ? sellFloorOz.toFixed(6) : "—"} {STABLE}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Floor / brick</span>
                    <span className="font-mono text-emerald-200">
                      {sellFloorBrick ? sellFloorBrick.toFixed(2) : "—"} {STABLE}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-xs text-slate-400">Bricks</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={sellBricks}
                      onChange={(e) => {
                        const next = normalizeBricksOunces(parseInt(e.target.value || "0", 10), sellOunces, ozPerBrick);
                        setSellBricks(next.bricks);
                        setSellOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                      disabled={loading || wrongChain}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-slate-400">Ounces</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={sellOunces}
                      onChange={(e) => {
                        const next = normalizeBricksOunces(sellBricks, parseInt(e.target.value || "0", 10), ozPerBrick);
                        setSellBricks(next.bricks);
                        setSellOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                      disabled={loading || wrongChain}
                    />
                    <div className="mt-1 text-[0.65rem] text-slate-500">
                      Auto-carries into bricks (0–{ozPerBrick - 1} shown).
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Total ounces</span>
                    <span className="font-mono text-emerald-200">{sellTotalOz} oz</span>
                  </div>
                  <div className="flex justify-between">
                    <span>You receive</span>
                    <span className="font-mono text-emerald-200">
                      {sellProceeds.toFixed(2)} {STABLE}
                    </span>
                  </div>
                </div>

                <button
                  className="mt-4 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!isConnected || wrongChain || sellTotalOz <= 0 || loading}
                  onClick={handleSell}
                  type="button"
                >
                  Sell Back
                </button>

                <p className="mt-3 text-[0.7rem] leading-relaxed text-slate-500">
                  Sell back uses the on-chain floor price (when available).
                </p>
              </div>
            </div>

            {/* Street Activity */}
            <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Street Activity</h3>
                <span className="text-[0.7rem] text-slate-500">
                  Last {FEED_LIMIT} events • refresh ~{Math.round(FEED_POLL_MS / 1000)}s
                  {lastActivityAt ? <span className="ml-2 text-slate-600">• updated {lastActivityAt}</span> : null}
                </span>
              </div>

              <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1 text-xs text-slate-300">
                {streetActivity.length ? (
                  streetActivity.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2"
                    >
                      <span className="leading-relaxed">{item.text}</span>
                      <span className="shrink-0 text-slate-500">{item.ts}</span>
                    </li>
                  ))
                ) : (
                  <li className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-3 text-slate-500">
                    {RELAYER_URL
                      ? feedLoadedOnce
                        ? "No recent activity yet."
                        : "Waiting for feed data…"
                      : "Relayer not configured. Activity feed is unavailable."}
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Proof of Funds</h3>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Buyback Vault ({STABLE})</dt>
                  <dd className="text-right font-mono text-emerald-200">{vault}</dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Treasury ({STABLE})</dt>
                  <dd className="text-right font-mono text-slate-200">{treasury}</dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">OZ Inventory</dt>
                  <dd className="text-right font-mono text-slate-200">{swapOzInvPretty}</dd>
                </div>
              </dl>

              <p className="mt-4 text-[0.75rem] leading-relaxed text-slate-500">
                Vault is reserved for floor sell-backs. Treasury supports operations and future districts. OZ inventory is what’s
                available to buy.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Quick Notes</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li className="text-slate-400">
                  • You’re buying <span className="text-slate-200">OZ</span> (shown as bricks + ounces for readability).
                </li>
                <li className="text-slate-400">
                  • Brick = <span className="font-mono text-slate-200">{ozPerBrick}</span> oz.
                </li>
                <li className="text-slate-400">• Sell back uses the on-chain floor price when available.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Holders */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Holders (Net Buys − SellBacks)</h2>
            <span className="text-xs text-slate-400">
              Circulating policy: {Number(circulatingOz || 0).toLocaleString()} oz
              {lastHoldersAt ? <span className="ml-2 text-slate-600">• updated {lastHoldersAt}</span> : null}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium text-right">Bricks + Oz</th>
                  <th className="px-3 py-2 font-medium text-right">% of policy circ</th>
                  <th className="px-3 py-2 font-medium text-right">Brick Holder</th>
                </tr>
              </thead>
              <tbody>
                {holderRows.length ? (
                  holderRows.map((h, idx) => (
                    <tr key={idx} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 text-xs font-mono text-slate-300">{h.display}</td>
                      <td className="px-3 py-2 text-right font-mono">{h.weightLabel}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-400">
                        {Number(h.pctWeightCirculating || 0).toFixed(3)}%
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {h.isBrickHolder ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">Yes</span>
                        ) : (
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">No</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-slate-400" colSpan={4}>
                      {RELAYER_URL
                        ? feedLoadedOnce
                          ? "No holders yet."
                          : "Waiting for holders data…"
                        : "Relayer not configured. Holders list is unavailable."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[0.75rem] text-slate-500">
            This list is built from relayer-indexed BlockSwap events. Wallet-to-wallet OZ transfers won’t show here unless you
            later index ERC20 Transfer events.
          </p>
        </section>

        {/* Rewards Claim */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Rewards Claim (Round {rewardsRoundId})</h2>

            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-50"
              onClick={() => loadRewardsForWallet()}
              disabled={rewardsLoading}
              title="Reload proofs + on-chain round data"
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <ContractRow label="Rewards (Merkle)" value={rewardsAddress || "—"} />
            <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2">
              <div className="text-[10px] uppercase text-slate-500">Proofs URL</div>
              <div className="truncate font-mono text-xs text-slate-200">{rewardsProofsUrl}</div>
            </div>
            <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2">
              <div className="text-[10px] uppercase text-slate-500">Claim Window Ends</div>
              <div className="font-mono text-xs text-slate-200">
                {rewardsMeta?.claimEnd ? fmtTimeFromUnix(rewardsMeta.claimEnd) : "—"}
              </div>
            </div>
          </div>

          {rewardsErr ? (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {rewardsErr}
            </div>
          ) : null}

          {!isConnected ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
              Connect a wallet to check eligibility and claim.
            </div>
          ) : null}

          {rewardsLoading ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
              Loading rewards data…
            </div>
          ) : null}

          {isConnected ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-500">Wallet</div>
                  <div className="font-mono text-sm text-slate-200">{String(walletAddress || "").toLowerCase()}</div>
                </div>

                <div className="flex items-center justify-between gap-2 md:justify-end">
                  {myRewardsClaimed === true ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">Claimed ✅</span>
                  ) : myRewardsClaimed === false ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">Not claimed</span>
                  ) : (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">—</span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-500">Eligible</div>
                  <div className="text-sm font-semibold text-slate-200">{myRewardsEntry ? "YES" : "NO"}</div>
                </div>

                <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-500">Payout</div>
                  <div className="text-sm font-semibold text-slate-200">
                    {myPayoutUsdc != null
                      ? `${myPayoutUsdc.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                      : "—"}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {myRewardsEntry?.payoutUsdc6 ? String(myRewardsEntry.payoutUsdc6) : ""}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-500">Remaining Pool</div>
                  <div className="text-sm font-semibold text-slate-200">
                    {rewardsMeta?.remainingUsdc != null ? `${formatUnitsPretty(rewardsMeta.remainingUsdc, 6, 6)} USDC` : "—"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="mt-4 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleClaimRewards}
                disabled={
                  rewardsLoading ||
                  !isConnected ||
                  wrongChain ||
                  !myRewardsEntry ||
                  myRewardsClaimed === true ||
                  !rewardsAddress
                }
                title={!myRewardsEntry ? "Wallet not eligible" : myRewardsClaimed ? "Already claimed" : "Claim rewards"}
              >
                {myRewardsClaimed === true ? "Already claimed" : "Claim rewards"}
              </button>

              {rewardsTx ? (
                <div className="mt-3 text-xs text-slate-400">
                  Tx: <span className="font-mono text-slate-200">{rewardsTx}</span>
                </div>
              ) : null}

              <div className="mt-3 text-[0.75rem] text-slate-500">
                Proofs are loaded from <span className="font-mono">{rewardsProofsUrl}</span>. Make sure that file exists in{" "}
                <span className="font-mono">theblock-ui/public</span> before deploying.
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
