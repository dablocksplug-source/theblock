// src/components/BlockSwapAdminPanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import { blockswapAdapter } from "../services/blockswapAdapter";

export default function BlockSwapAdminPanel({ walletAddress, d, onUpdated }) {
  const [sell, setSell] = useState(String(d.sellPricePerBrick ?? 0));
  const [floor, setFloor] = useState(String(d.buybackFloorPerBrick ?? 0));
  const [fund, setFund] = useState("");
  const [phase, setPhase] = useState(String(d.phase ?? 1));
  const [rewardPool, setRewardPool] = useState("");

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // keep inputs in sync when snapshot updates
  useEffect(() => {
    setSell(String(d.sellPricePerBrick ?? 0));
    setFloor(String(d.buybackFloorPerBrick ?? 0));
    setPhase(String(d.phase ?? 1));
  }, [d.sellPricePerBrick, d.buybackFloorPerBrick, d.phase]);

  const isAdmin = useMemo(() => {
    if (!walletAddress) return false;
    return (
      String(walletAddress).toLowerCase() ===
      String(d.ADMIN_WALLET).toLowerCase()
    );
  }, [walletAddress, d.ADMIN_WALLET]);

  if (!isAdmin) return null;

  const act = (fn) => {
    try {
      setErr("");
      setMsg("");
      const snap = fn();
      onUpdated?.(snap);
    } catch (e) {
      setErr(e?.message || "Admin action failed.");
    }
  };

  // settlement (locked for you, but read from snapshot to stay consistent)
  const STABLE = d.STABLE_SYMBOL || "USDC";

  const short = (a) =>
    a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold uppercase tracking-wide text-amber-200">
          Admin Panel
        </div>
        <div className="text-xs text-amber-200/80">
          Admin: {short(d.ADMIN_WALLET)}
        </div>
      </div>

      {err ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {err}
        </div>
      ) : null}

      {msg ? (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Marketing + Pause Buys */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Controls</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {/* Early Bird badge (marketing only) */}
            <button
              type="button"
              onClick={() =>
                act(() =>
                  blockswapAdapter.adminSetEarlyBirdBadge({
                    walletAddress,
                    enabled: !d.earlyBirdBadge,
                  })
                )
              }
              className={
                "rounded-lg px-3 py-2 text-xs font-semibold " +
                (d.earlyBirdBadge
                  ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
                  : "border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500")
              }
            >
              Early Bird Badge: {d.earlyBirdBadge ? "ON" : "OFF"}
            </button>

            {/* Pause Buys (real gate) */}
            <button
              type="button"
              onClick={() =>
                act(() =>
                  blockswapAdapter.adminSetBuyPaused({
                    walletAddress,
                    paused: !d.buyPaused,
                  })
                )
              }
              className={
                "rounded-lg px-3 py-2 text-xs font-semibold " +
                (d.buyPaused
                  ? "bg-rose-500 text-slate-950 hover:bg-rose-400"
                  : "bg-emerald-500 text-slate-950 hover:bg-emerald-400")
              }
            >
              Buys: {d.buyPaused ? "PAUSED" : "LIVE"}
            </button>

            <button
              type="button"
              onClick={() => act(() => blockswapAdapter.adminReset({ walletAddress }))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500"
            >
              Reset (local)
            </button>
          </div>

          <div className="mt-2 text-[0.75rem] text-slate-400">
            Early Bird is marketing only. Buys are controlled by the Pause button.
          </div>
        </div>

        {/* Fund / Move BuybackVault */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">BuybackVault Funding</div>

          <div className="mt-2 flex gap-2">
            <input
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              placeholder={`Amount in ${STABLE}`}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
            />

            <button
              type="button"
              onClick={() =>
                act(() =>
                  blockswapAdapter.adminFundTreasury({
                    walletAddress,
                    amountStable: fund,
                  })
                )
              }
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
            >
              Deposit
            </button>

            <button
              type="button"
              onClick={() =>
                act(() =>
                  blockswapAdapter.adminMoveToBuybackVault({
                    walletAddress,
                    amountStable: fund,
                  })
                )
              }
              className="shrink-0 rounded-lg border border-amber-400/40 bg-slate-900 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-slate-800"
            >
              Move from TheBlock
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {[500, 5000, 50000].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setFund(String(x))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-400/60"
              >
                {x.toLocaleString()}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-1 text-[0.75rem] text-slate-400">
            <div>
              BuybackVault:{" "}
              <span className="text-emerald-200 font-mono">
                {Number(d.buybackVault || 0).toLocaleString()} {STABLE}
              </span>
            </div>
            <div>
              TheBlock:{" "}
              <span className="text-sky-300 font-mono">
                {Number(d.theBlockTreasury || 0).toLocaleString()} {STABLE}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[0.7rem] text-slate-500">
            Deposit = add funds to BuybackVault. Move = transfer from TheBlock → BuybackVault.
          </p>
        </div>

        {/* Prices */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Prices (can only go UP)</div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Sell / brick ({STABLE})
              <input
                value={sell}
                onChange={(e) => setSell(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
              />
            </label>

            <label className="text-xs text-slate-400">
              Buyback floor / brick ({STABLE})
              <input
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() =>
              act(() =>
                blockswapAdapter.adminSetPrices({
                  walletAddress,
                  sellPricePerBrick: sell,
                  buybackFloorPerBrick: floor,
                })
              )
            }
            className="mt-3 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
          >
            Update Prices
          </button>

          <div className="mt-2 text-[0.75rem] text-slate-400">
            Rule: sell price and buyback floor can only increase.
          </div>
        </div>

        {/* Phase */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Phase</div>

          <div className="mt-2 flex gap-2">
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
            >
              <option value="1">Phase 1 (30%)</option>
              <option value="2">Phase 2 (35%)</option>
              <option value="3">Phase 3 (40%)</option>
            </select>

            <button
              type="button"
              onClick={() =>
                act(() => blockswapAdapter.adminAdvancePhase({ walletAddress, phase }))
              }
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
            >
              Set
            </button>
          </div>

          <div className="mt-2 text-[0.75rem] text-slate-400">
            Current phase: <span className="text-slate-100">{d.phase}</span>
          </div>
        </div>

        {/* Rewards */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Rewards (claim-only, 180 days)</div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={rewardPool}
              onChange={(e) => setRewardPool(e.target.value)}
              placeholder={`Reward pool in ${STABLE} (ex: 100)`}
              className="w-64 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
            />

            <button
              type="button"
              onClick={() => {
                act(() =>
                  blockswapAdapter.adminCreateRewardRound({
                    walletAddress,
                    poolStable: rewardPool,
                  })
                );
                setRewardPool("");
              }}
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
            >
              Create Reward Round
            </button>

            <button
              type="button"
              onClick={() => {
                try {
                  setErr("");
                  setMsg("");
                  const json = blockswapAdapter.adminExportStateJSON({ walletAddress });

                  const tryClipboard = navigator.clipboard?.writeText
                    ? navigator.clipboard.writeText(json)
                    : Promise.reject(new Error("Clipboard not available"));

                  tryClipboard
                    .then(() => setMsg("Snapshot copied to clipboard ✅"))
                    .catch(() => {
                      window.prompt("Copy Snapshot JSON:", json);
                      setMsg("Snapshot opened for manual copy ✅");
                    });
                } catch (e) {
                  setErr(e?.message || "Export failed.");
                }
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500"
            >
              Copy Snapshot JSON
            </button>
          </div>

          <div className="mt-2 text-[0.75rem] text-slate-500">
            Contract version will be Merkle claim. This locks in the same round fields now.
          </div>

          {Array.isArray(d.rewardRounds) && d.rewardRounds.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Round</th>
                    <th className="py-2 pr-3 text-right">Pool</th>
                    <th className="py-2 pr-3 text-right">Per Oz</th>
                    <th className="py-2 pr-3 text-right">Eligible Oz</th>
                    <th className="py-2 pr-3">Claim End</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rewardRounds.slice(0, 5).map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/60">
                      <td className="py-2 pr-3 font-mono text-slate-200">{r.id}</td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-200">
                        {Number(r.totalPoolStable || 0).toFixed(2)} {STABLE}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-sky-300">
                        {Number(r.rewardPerOz || 0).toFixed(6)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-200">
                        {Number(r.snapshotTotalEligibleOz || 0).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">
                        {new Date(Number(r.claimEndMs || 0)).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-[0.75rem] text-slate-500">
              No reward rounds created yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
