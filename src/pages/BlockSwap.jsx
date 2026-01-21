// src/pages/BlockSwap.jsx
import React, { useEffect, useMemo, useState } from "react";
import { blockswapAdapter } from "../services/blockswapAdapter";
import BlockSwapAdminPanel from "../components/BlockSwapAdminPanel";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";
import { Link } from "react-router-dom";

const shortAddr = (a) =>
  a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";

function bricksOzFromTotal(totalOz, ozPerBrick) {
  const b = Math.floor(totalOz / ozPerBrick);
  const o = totalOz % ozPerBrick;
  return { b, o };
}

export default function BlockSwap() {
  const { walletAddress, isConnected, connectWallet } = useWallet();
  const { nickname, useNickname } = useNicknameContext();

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
  const STABLE = d.STABLE_SYMBOL || "USDT";

  // ---- Bricks + Ounces inputs (no decimals) ----
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

  const ownershipPerBrickPct = useMemo(() => {
    return d.totalBricks ? (1 / d.totalBricks) * 100 : 0;
  }, [d.totalBricks]);

  const brickPoolPct = d.brickPoolPct || 0;

  // Build holders table from balances in state
  const holderRows = useMemo(() => {
    const balances = d.balancesOz || {};
    const labels = d.labels || {};

    const rows = Object.entries(balances)
      .map(([addrLower, ounces]) => {
        const { b, o } = bricksOzFromTotal(Number(ounces || 0), ozPerBrick);
        const pctWeightCirculating = d.circulatingOz
          ? (Number(ounces || 0) / d.circulatingOz) * 100
          : 0;

        const label = labels[addrLower] || shortAddr(addrLower);
        const isBrickHolder = Number(ounces || 0) >= ozPerBrick;

        return {
          address: addrLower,
          label,
          ounces: Number(ounces || 0),
          weightLabel: `${b} brick${b === 1 ? "" : "s"} ${o} oz`,
          pctWeightCirculating,
          isBrickHolder,
        };
      })
      .sort((a, b) => b.ounces - a.ounces);

    return rows;
  }, [d.balancesOz, d.labels, d.circulatingOz, ozPerBrick]);

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

  const transfersLocked =
    d.presaleActive && d.transfersDisabledDuringPresale;

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
                Early Bird Special
              </span>
            )}

            {transfersLocked && (
              <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
                Transfers Locked
              </span>
            )}

            {isAdmin ? (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-xs uppercase tracking-wide text-sky-200">
                Admin
              </span>
            ) : null}
          </div>

          {d.presaleActive ? (
            <Link
              to="/blockswap/early-bird-rules"
              className="ml-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-300"
            >
              Early Bird Rules
            </Link>
          ) : null}

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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        {err ? (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {err}
          </div>
        ) : null}

        {/* Admin Panel (shows only for admin wallet) */}
        <BlockSwapAdminPanel
          walletAddress={walletAddress}
          d={d}
          onUpdated={(snap) => setD(snap)}
        />

        {/* Intro */}
        <section className="mb-6 grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Bricks &amp; Ounces
            </h1>

            <p className="text-sm leading-relaxed text-slate-300">
              The Block has a fixed ownership supply of{" "}
              <span className="font-semibold">
                {Number(d.totalBricks || 0).toLocaleString()}
              </span>{" "}
              bricks <span className="text-slate-400">(1 ton)</span> ={" "}
              <span className="font-semibold">
                {Number(d.totalOz || 0).toLocaleString()}
              </span>{" "}
              ounces total. One brick equals{" "}
              <span className="font-semibold">{Number(d.ouncesPerBrick || 36)}</span>{" "}
              ounces.
              <br />
              Ownership weight is measured by ounces. When profits are{" "}
              <span className="font-semibold">being distributed</span>, payouts
              use ounce-weight. Brick Holder perks unlock at a full brick (36 oz).
            </p>

            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-slate-800 px-3 py-1">
                Phase {d.phase}: Profit Pool {Math.round(brickPoolPct * 100)}% of
                net profit
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1">
                1 brick = {ownershipPerBrickPct.toFixed(2)}% of total ownership
                weight
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1">
                Holder % = (your ounces ÷ circulating ounces) × 100
              </span>
            </div>
          </div>

          {/* Pricing cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs text-slate-400">Public sell price</div>
              <div className="mt-1 text-lg font-semibold">
                {Number(d.sellPricePerBrick || 0).toLocaleString()} {STABLE}{" "}
                <span className="text-xs text-slate-400">/ brick</span>
              </div>
              <div className="mt-1 text-sm text-slate-300">
                {Number(d.ounceSellPrice || 0).toFixed(2)} {STABLE}{" "}
                <span className="text-xs text-slate-500">/ ounce</span>
              </div>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-slate-400">
                Prices are administered by The Block and may move up over time.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-4">
              <div className="text-xs text-slate-400">Buyback floor</div>
              <div className="mt-1 text-lg font-semibold text-emerald-300">
                {Number(d.buybackFloorPerBrick || 0).toLocaleString()} {STABLE}{" "}
                <span className="text-xs text-slate-400">/ brick</span>
              </div>
              <div className="mt-1 text-sm text-emerald-200">
                {Number(d.ounceBuybackFloor || 0).toFixed(2)} {STABLE}{" "}
                <span className="text-xs text-emerald-200/70">/ ounce</span>
              </div>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-emerald-200/80">
                Instant buyback as long as the Buyback Vault can cover it.
              </p>
            </div>
          </div>
        </section>

        {/* Supply / Status row */}
        <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400">Total supply</div>
            <div className="mt-1 text-lg font-semibold">
              {Number(d.totalBricks || 0).toLocaleString()} bricks{" "}
              <span className="text-sm text-slate-400">(1 ton)</span>
            </div>
            <div className="text-sm text-slate-300">
              {Number(d.totalOz || 0).toLocaleString()} ounces
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400">Locked by The Block</div>
            <div className="mt-1 text-lg font-semibold">
              {Number(d.lockedBricks || 0).toLocaleString()} bricks
            </div>
            <div className="text-sm text-slate-300">
              {Number(d.lockedOz || 0).toLocaleString()} ounces
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400">In circulation</div>
            <div className="mt-1 text-lg font-semibold">
              {Number(d.circulatingBricks || 0).toLocaleString()} bricks
            </div>
            <div className="text-sm text-slate-300">
              {Number(d.circulatingOz || 0).toLocaleString()} ounces
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400">Available for distribution</div>
            <div className="mt-1 text-lg font-semibold">
              {(Number(d.ouncesRemainingForSale || 0) / Number(d.ouncesPerBrick || 36)).toFixed(0)} bricks
            </div>
            <div className="text-sm text-slate-300">
              {Number(d.ouncesRemainingForSale || 0).toLocaleString()} ounces
            </div>
          </div>
        </section>

        {/* Buy/Sell + Treasury */}
        <section className="mb-10 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Buy / Sell */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Early Bird Special: Buy &amp; Sell Bricks
              </h2>

              <div className="flex items-center gap-3">
                <Link to="/blockswap/early-bird-rules" className="text-xs text-sky-400 hover:underline">
                  Read Early Bird Rules
                </Link>
                <span className="text-xs text-slate-400">Settlement: {STABLE}</span>
              </div>
            </div>

            {/* Marketing bullets */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300 space-y-1">
              <div>• Fixed supply — no dilution</div>
              <div>• Buyback Vault is funded automatically at the floor on every purchase</div>
              <div>• Buybacks are paid only from the vault</div>
              <div>• Sell price and buyback floor can only move up</div>
              <div>• Transfers are locked during Early Bird</div>
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
                      value={buyBricks}
                      onChange={(e) =>
                        setBuyBricks(
                          Math.max(0, parseInt(e.target.value || "0", 10))
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-slate-400">
                      Ounces (0–35)
                    </label>
                    <select
                      value={buyOunces}
                      onChange={(e) => setBuyOunces(parseInt(e.target.value, 10))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
                    >
                      {Array.from({ length: ozPerBrick }, (_, i) => i).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>You’re buying</span>
                    <span className="font-mono text-slate-100">
                      {buyBricks} brick(s) + {buyOunces} oz ({buyTotalOz} oz)
                    </span>
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
                    Transfers are locked during Early Bird.
                  </p>
                )}
              </div>

              {/* SELLBACK */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/60 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  Sell Back (Buyback)
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
                      value={sellBricks}
                      onChange={(e) =>
                        setSellBricks(
                          Math.max(0, parseInt(e.target.value || "0", 10))
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-slate-400">
                      Ounces (0–35)
                    </label>
                    <select
                      value={sellOunces}
                      onChange={(e) => setSellOunces(parseInt(e.target.value, 10))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                    >
                      {Array.from({ length: ozPerBrick }, (_, i) => i).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>You’re selling</span>
                    <span className="font-mono text-emerald-200">
                      {sellBricks} brick(s) + {sellOunces} oz ({sellTotalOz} oz)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>You receive (floor)</span>
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
                  Instant buyback if vault can cover.
                </p>
              </div>
            </div>
          </div>

          {/* Treasury / Activity */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Treasury &amp; Distributions
              </h2>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">Buyback Vault ({STABLE})</dt>
                  <dd className="text-right font-mono text-emerald-200">
                    {Number(d.buybackVault || 0).toLocaleString()} {STABLE}
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      Funded automatically by the buyback floor on each purchase
                    </div>
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-400">TheBlock ({STABLE})</dt>
                  <dd className="text-right font-mono text-sky-300">
                    {Number(d.theBlockTreasury || 0).toLocaleString()} {STABLE}
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      Leftovers = sell price − buyback floor
                    </div>
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-slate-400">Buyback capacity (instant)</dt>
                  <dd className="text-right font-mono text-emerald-200">
                    {Number(d.buybackCapacityOz || 0).toLocaleString()} oz
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-slate-400">
                    Profit pool policy (phase {d.phase})
                  </dt>
                  <dd className="text-right font-mono text-sky-300">
                    {Math.round(brickPoolPct * 100)}%
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-slate-400">Transfers</dt>
                  <dd className="text-right font-mono">
                    {transfersLocked ? "Disabled (Early Bird)" : "Enabled"}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-[0.75rem] leading-relaxed text-slate-400">
                During Early Bird, transfers are locked. Ownership is tracked by
                ounces. Distributions use a snapshot rule (whoever holds at the
                snapshot receives that run).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Recent Activity
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-300 max-h-56 overflow-y-auto pr-1">
                {(d.activity || []).map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2"
                  >
                    <span className="leading-relaxed">{item.text}</span>
                    <span className="shrink-0 text-slate-500">{item.ts}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Holders */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Brick Holders
            </h2>
            <span className="text-xs text-slate-400">
              Total circulating weight:{" "}
              {Number(d.circulatingOz || 0).toLocaleString()} ounces
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Holder</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium text-right">Weight</th>
                  <th className="px-3 py-2 font-medium text-right">
                    % of circulating
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    Brick Holder
                  </th>
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
                      No holders yet. Buy ounces to create the first holder entry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[0.75rem] text-slate-500">
            Demo mode persists locally in your browser. On deployment, this table
            will query chain/indexer for live balances.
          </p>
        </section>

        {/* Clean, non-legal-claim disclaimer */}
        <p className="mt-8 text-xs text-slate-500 text-center">
          Early-stage system demo. Nothing here is financial advice or a guarantee.
          Participation is voluntary and subject to the published rules.
        </p>

        {/* refresh button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={refresh}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
            type="button"
          >
            Refresh
          </button>
        </div>
      </main>
    </div>
  );
}
