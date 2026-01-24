// src/pages/BlockSwap.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";

import { blockswapAdapter } from "../services/blockswapAdapter";
import BlockSwapAdminPanel from "../components/BlockSwapAdminPanel";

import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";
import { useSound } from "../context/SoundContext";

const shortAddr = (a) =>
  a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";

function bricksOzFromTotal(totalOz, ozPerBrick) {
  const b = Math.floor(totalOz / ozPerBrick);
  const o = totalOz % ozPerBrick;
  return { b, o };
}

function clampInt(val, min, max) {
  const n = Number.isFinite(val) ? val : Number(val || 0);
  const i = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.max(min, Math.min(max, i));
}

// ✅ Takes (bricks, ounces) and normalizes ounces into bricks if ounces >= ozPerBrick
function normalizeBricksOunces(bricks, ounces, ozPerBrick) {
  const b = clampInt(bricks, 0, 1_000_000);
  const oRaw = clampInt(ounces, 0, 1_000_000);

  const carry = Math.floor(oRaw / ozPerBrick);
  const o = oRaw % ozPerBrick;

  return { bricks: b + carry, ounces: o };
}

export default function BlockSwap() {
  const { walletAddress, isConnected, connectWallet } = useWallet();
  const { nickname, useNickname } = useNicknameContext();
  const { soundEnabled } = useSound();

  const ambienceRef = useRef(null);

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });
  const shortAddress = shortAddr(walletAddress);

  const [err, setErr] = useState("");
  const [d, setD] = useState(() => blockswapAdapter.getSnapshot());

  // claim UI
  const [claimRoundId, setClaimRoundId] = useState("");
  const [claimMsg, setClaimMsg] = useState("");

  // keep snapshot fresh on mount
  useEffect(() => {
    try {
      setD(blockswapAdapter.getSnapshot());
    } catch (e) {
      setErr(e?.message || "Failed to load BlockSwap.");
    }
  }, []);

  const refresh = () => {
    setErr("");
    setClaimMsg("");
    try {
      setD(blockswapAdapter.getSnapshot());
    } catch (e) {
      setErr(e?.message || "Failed to refresh BlockSwap.");
    }
  };

  const isAdmin = useMemo(() => {
    if (!walletAddress) return false;
    return (
      String(walletAddress).toLowerCase() ===
      String(d.ADMIN_WALLET).toLowerCase()
    );
  }, [walletAddress, d.ADMIN_WALLET]);

  const ozPerBrick = d.ouncesPerBrick || 36;

  // ✅ BLOCKSWAP AMBIENCE — obey master SoundContext toggle
  useEffect(() => {
    if (!ambienceRef.current) {
      const a = new Audio("/sounds/swapambience.m4a");
      a.loop = true;
      a.volume = 0.25;
      ambienceRef.current = a;
    }

    const a = ambienceRef.current;

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
    else a.pause();

    return () => a.pause();
  }, [soundEnabled]);

  // Settlement stable symbol (locked to USDC in config/store, but read from snapshot)
  const STABLE = d.STABLE_SYMBOL || "USDC";

  // ---- Inputs (integers only) ----
  const [buyBricks, setBuyBricks] = useState(0);
  const [buyOunces, setBuyOunces] = useState(0);

  const [sellBricks, setSellBricks] = useState(0);
  const [sellOunces, setSellOunces] = useState(0);

  const buyTotalOz = useMemo(
    () => buyBricks * ozPerBrick + buyOunces,
    [buyBricks, buyOunces, ozPerBrick]
  );

  const sellTotalOz = useMemo(
    () => sellBricks * ozPerBrick + sellOunces,
    [sellBricks, sellOunces, ozPerBrick]
  );

  const buyCost = useMemo(
    () => (d ? buyTotalOz * (d.ounceSellPrice || 0) : 0),
    [buyTotalOz, d]
  );

  const sellProceeds = useMemo(
    () => (d ? sellTotalOz * (d.ounceBuybackFloor || 0) : 0),
    [sellTotalOz, d]
  );

  // ✅ new rules:
  // - EarlyBird badge is marketing ONLY (d.earlyBirdBadge)
  // - Buys can be paused (d.buyPaused) => real gate
  const canBuy = !d.buyPaused && buyTotalOz > 0;
  const canSell = sellTotalOz > 0;

  // Build holders table from balances in state
  const holderRows = useMemo(() => {
    const balances = d.balancesOz || {};
    const labels = d.labels || {};

    return Object.entries(balances)
      .map(([addrLower, ounces]) => {
        const ouncesNum = Number(ounces || 0);
        const { b, o } = bricksOzFromTotal(ouncesNum, ozPerBrick);

        const pctWeightCirculating = d.circulatingOz
          ? (ouncesNum / d.circulatingOz) * 100
          : 0;

        const label = labels[addrLower] || shortAddr(addrLower);
        const isBrickHolder = ouncesNum >= ozPerBrick;

        return {
          address: addrLower,
          label,
          ounces: ouncesNum,
          weightLabel: `${b} brick${b === 1 ? "" : "s"} ${o} oz`,
          pctWeightCirculating,
          isBrickHolder,
        };
      })
      .sort((a, b) => b.ounces - a.ounces);
  }, [d.balancesOz, d.labels, d.circulatingOz, ozPerBrick]);

  // ✅ Street Activity feed (newest first)
  const streetActivity = useMemo(() => {
    const raw = Array.isArray(d.activity) ? d.activity : [];
    return raw
      .map((x) => ({
        text: String(x?.text ?? ""),
        ts: String(x?.ts ?? ""),
      }))
      .filter((x) => x.text);
  }, [d.activity]);

  // Rewards helpers
  const myAddr = String(walletAddress || "").toLowerCase();
  const myOz = Number((d.balancesOz || {})[myAddr] || 0);
  const myClaimedTotal = Number((d.claimedRewardsStable || {})[myAddr] || 0);

  const rewardRounds = useMemo(() => {
    const rounds = Array.isArray(d.rewardRounds) ? d.rewardRounds : [];
    return rounds.slice(); // newest-first already
  }, [d.rewardRounds]);

  const connectOrWarn = async () => {
    try {
      setErr("");
      await connectWallet?.();
      refresh();
    } catch (e) {
      setErr(e?.message || "Wallet connect failed.");
    }
  };

  const handleBuy = () => {
    setErr("");
    setClaimMsg("");
    try {
      if (!walletAddress) throw new Error("Connect wallet first.");
      if (d.buyPaused) throw new Error("Buys are paused by admin right now.");

      const label = getDisplayName({ walletAddress, nickname, useNickname });

      const snap = blockswapAdapter.buy({
        walletAddress,
        ounces: buyTotalOz,
        label,
      });

      setD(snap);
      setBuyBricks(0);
      setBuyOunces(0);
    } catch (e) {
      setErr(e?.message || "Buy failed.");
    }
  };

  const handleSell = () => {
    setErr("");
    setClaimMsg("");
    try {
      if (!walletAddress) throw new Error("Connect wallet first.");

      const snap = blockswapAdapter.sellBack({
        walletAddress,
        ounces: sellTotalOz,
      });

      setD(snap);
      setSellBricks(0);
      setSellOunces(0);
    } catch (e) {
      setErr(e?.message || "Sell back failed.");
    }
  };

  const handleClaim = (rid) => {
    setErr("");
    setClaimMsg("");
    try {
      if (!walletAddress) throw new Error("Connect wallet to claim.");
      const snap = blockswapAdapter.claimReward({
        walletAddress,
        roundId: rid,
      });
      setD(snap);
      setClaimMsg(`Claim submitted ✅ Round #${rid}`);
    } catch (e) {
      setErr(e?.message || "Claim failed.");
    }
  };

  const buybackVault = Number(d.buybackVault || 0);
  const theBlockTreasury = Number(d.theBlockTreasury || 0);
  const buybackCapacityOz = Number(d.buybackCapacityOz || 0);

  const buyStatusLabel = d.buyPaused ? "PAUSED" : "LIVE";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-wide">The Block</span>

            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
              BlockSwap
            </span>

            {d.earlyBirdBadge ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-200">
                Early Bird
              </span>
            ) : null}

            <span
              className={
                "rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide " +
                (d.buyPaused
                  ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                  : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200")
              }
              title="Buys are controlled by admin pause"
            >
              Buys: {buyStatusLabel}
            </span>

            {isAdmin ? (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-xs uppercase tracking-wide text-sky-200">
                Admin
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium">
              Settlement: {STABLE}
            </span>

            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs">
              {isConnected ? `${displayName} (${shortAddress})` : "Not connected"}
            </span>

            {!isConnected ? (
              <button
                onClick={connectOrWarn}
                className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                type="button"
              >
                Connect Wallet
              </button>
            ) : null}

            <Link
              to="/"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Home
            </Link>

            <Link
              to="/investor"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Inside the Hustle
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        {err ? (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {err}
          </div>
        ) : null}

        {claimMsg ? (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {claimMsg}
          </div>
        ) : null}

        {/* Admin Panel */}
        <BlockSwapAdminPanel
          walletAddress={walletAddress}
          d={d}
          onUpdated={(snap) => setD(snap)}
        />

        {/* Trade + Right column */}
        <section className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Trade */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Trade
              </h2>
              <span className="text-xs text-slate-400">1 brick = {ozPerBrick} oz</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* BUY */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Buy
                  </div>

                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      (d.buyPaused
                        ? "bg-rose-500/15 text-rose-200"
                        : "bg-emerald-500/15 text-emerald-200")
                    }
                  >
                    {d.buyPaused ? "PAUSED" : "LIVE"}
                  </span>
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
                        const next = normalizeBricksOunces(
                          parseInt(e.target.value || "0", 10),
                          buyOunces,
                          ozPerBrick
                        );
                        setBuyBricks(next.bricks);
                        setBuyOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                      disabled={d.buyPaused}
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
                        const next = normalizeBricksOunces(
                          buyBricks,
                          parseInt(e.target.value || "0", 10),
                          ozPerBrick
                        );
                        setBuyBricks(next.bricks);
                        setBuyOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                      disabled={d.buyPaused}
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
                  disabled={!canBuy || !isConnected}
                  onClick={handleBuy}
                  type="button"
                >
                  Buy
                </button>

                {!isConnected ? (
                  <p className="mt-2 text-[0.7rem] text-slate-500">
                    Connect your wallet to buy.
                  </p>
                ) : d.buyPaused ? (
                  <p className="mt-2 text-[0.7rem] text-rose-200/80">
                    Buys are paused by admin right now.
                  </p>
                ) : (
                  <p className="mt-2 text-[0.7rem] text-slate-500">
                    Demo mode now — contract wiring comes next.
                  </p>
                )}
              </div>

              {/* SELLBACK */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  Sell Back
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
                        const next = normalizeBricksOunces(
                          parseInt(e.target.value || "0", 10),
                          sellOunces,
                          ozPerBrick
                        );
                        setSellBricks(next.bricks);
                        setSellOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
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
                        const next = normalizeBricksOunces(
                          sellBricks,
                          parseInt(e.target.value || "0", 10),
                          ozPerBrick
                        );
                        setSellBricks(next.bricks);
                        setSellOunces(next.ounces);
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
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
                  disabled={!canSell || !isConnected}
                  onClick={handleSell}
                  type="button"
                >
                  Sell Back
                </button>

                {!isConnected ? (
                  <p className="mt-2 text-[0.7rem] text-slate-500">
                    Connect your wallet to sell back.
                  </p>
                ) : (
                  <p className="mt-2 text-[0.7rem] text-emerald-200/80">
                    Sellback stays available (limited by vault funds).
                  </p>
                )}
              </div>
            </div>

            {/* Street Activity */}
            <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Street Activity
                </h3>
                <span className="text-[0.7rem] text-slate-500">
                  Buys • Sellbacks • Vault feeds • Rewards
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
                    No activity yet. First buys / sells will show up here.
                  </li>
                )}
              </ul>

              <p className="mt-2 text-[0.7rem] text-slate-500">
                Demo mode updates on Refresh / Buy / Sell / Admin changes.
              </p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Vaults */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Vaults & Contract
              </h3>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Buyback Vault</dt>
                  <dd className="text-right font-mono text-emerald-200">
                    {buybackVault.toLocaleString()} {STABLE}
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      Instant capacity: {buybackCapacityOz.toLocaleString()} oz
                    </div>
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">TheBlock Treasury</dt>
                  <dd className="text-right font-mono text-sky-300">
                    {theBlockTreasury.toLocaleString()} {STABLE}
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      Ops + growth + milestones
                    </div>
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Contract</dt>
                  <dd className="text-right text-slate-300">
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs">
                      coming soon
                    </span>
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-[0.75rem] leading-relaxed text-slate-500">
                We’ll drop the live contract address right here when it’s deployed on Base.
              </p>
            </div>

            {/* Rewards Claim */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Rewards / Claims
              </h3>

              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Your balance</span>
                  <span className="font-mono text-slate-200">{myOz.toLocaleString()} oz</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">Claimed total</span>
                  <span className="font-mono text-emerald-200">
                    {myClaimedTotal.toFixed(2)} {STABLE}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={claimRoundId}
                  onChange={(e) => setClaimRoundId(e.target.value)}
                  placeholder="Round # (ex: 1)"
                  className="w-44 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                />

                <button
                  type="button"
                  onClick={() => handleClaim(claimRoundId)}
                  disabled={!isConnected || !String(claimRoundId).trim()}
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Claim
                </button>

                <button
                  onClick={refresh}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
                  type="button"
                >
                  Refresh
                </button>
              </div>

              <p className="mt-3 text-[0.75rem] text-slate-500">
                Demo mode: claims update local state. On-chain version will be Merkle claim with a 180-day window.
              </p>

              {/* Recent rounds */}
              <div className="mt-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                  Recent rounds
                </div>

                {rewardRounds.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="py-2 pr-3">Round</th>
                          <th className="py-2 pr-3 text-right">Pool</th>
                          <th className="py-2 pr-3 text-right">Per Oz</th>
                          <th className="py-2 pr-3 text-right">Eligible Oz</th>
                          <th className="py-2 pr-3">Claim End</th>
                          <th className="py-2 pr-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rewardRounds.slice(0, 5).map((r) => {
                          const rid = Number(r?.id || 0);
                          const claimEndMs = Number(r?.claimEndMs || 0);
                          const ended = Date.now() > claimEndMs;

                          const snapshot = r?.snapshotBalancesOz || {};
                          const eligibleOz = Number(snapshot[myAddr] || 0);
                          const already = !!(r?.claimed && r.claimed[myAddr]);

                          const can =
                            isConnected && !ended && eligibleOz > 0 && !already;

                          return (
                            <tr key={rid} className="border-b border-slate-800/60">
                              <td className="py-2 pr-3 font-mono text-slate-200">#{rid}</td>
                              <td className="py-2 pr-3 text-right font-mono text-slate-200">
                                {Number(r?.totalPoolStable || 0).toFixed(2)} {STABLE}
                              </td>
                              <td className="py-2 pr-3 text-right font-mono text-sky-300">
                                {Number(r?.rewardPerOz || 0).toFixed(6)}
                              </td>
                              <td className="py-2 pr-3 text-right font-mono text-slate-200">
                                {Number(r?.snapshotTotalEligibleOz || 0).toLocaleString()}
                              </td>
                              <td className="py-2 pr-3 text-slate-400">
                                {claimEndMs ? new Date(claimEndMs).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {already ? (
                                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                                    Claimed
                                  </span>
                                ) : ended ? (
                                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                                    Ended
                                  </span>
                                ) : eligibleOz <= 0 ? (
                                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                                    Not eligible
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleClaim(rid)}
                                    disabled={!can}
                                    className="rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                                  >
                                    Claim
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-[0.75rem] text-slate-500">
                    No reward rounds created yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Holders */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Holders (Weight)
            </h2>
            <span className="text-xs text-slate-400">
              Circulating weight: {Number(d.circulatingOz || 0).toLocaleString()} oz
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Holder</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium text-right">Bricks + Oz</th>
                  <th className="px-3 py-2 font-medium text-right">% of circ</th>
                  <th className="px-3 py-2 font-medium text-right">Brick Holder</th>
                </tr>
              </thead>
              <tbody>
                {holderRows.length ? (
                  holderRows.map((h, idx) => (
                    <tr key={idx} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 text-slate-100">
                        {h.label || shortAddr(h.address)}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-400">
                        {shortAddr(h.address)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{h.weightLabel}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-400">
                        {Number(h.pctWeightCirculating || 0).toFixed(3)}%
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {h.isBrickHolder ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                            Yes
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-slate-400" colSpan={5}>
                      No holders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[0.75rem] text-slate-500">
            Demo mode persists locally in your browser. On-chain will read OZ balances from Base.
          </p>
        </section>
      </main>
    </div>
  );
}
