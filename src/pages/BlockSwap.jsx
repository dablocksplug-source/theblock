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
  const n = Number.isFinite(val) ? val : 0;
  const i = Math.trunc(n);
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
    // Create once
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

    if (soundEnabled) {
      tryPlay();
    } else {
      a.pause();
      // don’t reset currentTime; makes toggle feel broken
    }

    return () => {
      a.pause();
    };
  }, [soundEnabled]);

  // Settlement stable symbol
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

  const canBuy = d.presaleActive && buyTotalOz > 0;
  const canSell = sellTotalOz > 0;

  // Build holders table from balances in state
  const holderRows = useMemo(() => {
    const balances = d.balancesOz || {};
    const labels = d.labels || {};

    const rows = Object.entries(balances)
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

    return rows;
  }, [d.balancesOz, d.labels, d.circulatingOz, ozPerBrick]);

  // ✅ Street Activity feed (buys/sells/injections/rewards/etc)
  const streetActivity = useMemo(() => {
    const raw = Array.isArray(d.activity) ? d.activity : [];
    if (!raw.length) return [];

    // newest-first
    const items = [...raw].slice().reverse();

    return items
      .map((x) => ({
        text: String(x?.text ?? ""),
        ts: String(x?.ts ?? ""),
      }))
      .filter((x) => x.text);
  }, [d.activity]);

  const handleBuy = () => {
    setErr("");
    try {
      if (!walletAddress) throw new Error("Connect wallet first.");
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

  const connectOrWarn = async () => {
    try {
      setErr("");
      await connectWallet?.();
      refresh();
    } catch (e) {
      setErr(e?.message || "Wallet connect failed.");
    }
  };

  // Balances (numbers only)
  const buybackVault = Number(d.buybackVault || 0);
  const theBlockTreasury = Number(d.theBlockTreasury || 0);
  const buybackCapacityOz = Number(d.buybackCapacityOz || 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-wide">The Block</span>

            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
              BlockSwap
            </span>

            {d.presaleActive && (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-200">
                Early Bird
              </span>
            )}

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
              {isConnected
                ? `${displayName} (${shortAddress})`
                : "Not connected"}
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

        {/* Admin Panel */}
        <BlockSwapAdminPanel
          walletAddress={walletAddress}
          d={d}
          onUpdated={(snap) => setD(snap)}
        />

        {/* Top grid: Trade + Vaults/Supply */}
        <section className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Trade */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Buy
              </h2>
              <span className="text-xs text-slate-400">
                1 brick = {ozPerBrick} oz
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* BUY */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Buy
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-xs text-slate-400">
                      Bricks
                    </label>
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
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-slate-400">
                      Ounces
                    </label>
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
                  disabled={!canBuy}
                  onClick={handleBuy}
                  type="button"
                >
                  Buy
                </button>

                {!d.presaleActive ? (
                  <p className="mt-2 text-[0.7rem] text-slate-500">
                    Early Bird is currently disabled.
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
                    <label className="mb-2 block text-xs text-slate-400">
                      Bricks
                    </label>
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
                    <label className="mb-2 block text-xs text-slate-400">
                      Ounces
                    </label>
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
                  disabled={!canSell}
                  onClick={handleSell}
                  type="button"
                >
                  Sell Back
                </button>

                <p className="mt-2 text-[0.7rem] text-emerald-200/80">
                  Pays from the Buyback Vault when wired live.
                </p>
              </div>
            </div>

            {/* ✅ Street Activity feed */}
            <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Street Activity
                </h3>
                <span className="text-[0.7rem] text-slate-500">
                  Buys • Sellbacks • Vault feeds • Rewards
                </span>
              </div>

              <ul className="mt-3 space-y-2 text-xs text-slate-300 max-h-44 overflow-y-auto pr-1">
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
                For now this updates when you Refresh / Buy / Sell / Admin changes.
              </p>
            </div>
          </div>

          {/* Right side: Vaults + Supply */}
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
                We’ll drop the live contract address right here when it’s deployed.
              </p>
            </div>

            {/* Supply */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Supply Snapshot
              </h3>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Total supply</dt>
                  <dd className="text-right font-mono text-slate-200">
                    {Number(d.totalBricks || 0).toLocaleString()} bricks
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      {Number(d.totalOz || 0).toLocaleString()} ounces total
                    </div>
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Locked by The Block</dt>
                  <dd className="text-right font-mono text-slate-200">
                    {Number(d.lockedBricks || 0).toLocaleString()} bricks
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      {Number(d.lockedOz || 0).toLocaleString()} ounces
                    </div>
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">In circulation</dt>
                  <dd className="text-right font-mono text-slate-200">
                    {Number(d.circulatingBricks || 0).toLocaleString()} bricks
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      {Number(d.circulatingOz || 0).toLocaleString()} ounces
                    </div>
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Remaining (for sale)</dt>
                  <dd className="text-right font-mono text-slate-200">
                    {Number(d.ouncesRemainingForSale || 0).toLocaleString()} oz
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      {(Number(d.ouncesRemainingForSale || 0) / ozPerBrick).toFixed(0)} bricks
                    </div>
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={refresh}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
                  type="button"
                >
                  Refresh
                </button>
              </div>

              <p className="mt-3 text-[0.75rem] text-slate-500">
                Right now it updates when you Refresh / Buy / Sell / Admin changes. Live mode will be fed by on-chain reads.
              </p>
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
                    <tr
                      key={idx}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-slate-100">
                        {h.label || shortAddr(h.address)}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-400">
                        {shortAddr(h.address)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {h.weightLabel}
                      </td>
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
            Demo mode persists locally in your browser. When wired live, this will read on-chain balances.
          </p>
        </section>
      </main>
    </div>
  );
}
