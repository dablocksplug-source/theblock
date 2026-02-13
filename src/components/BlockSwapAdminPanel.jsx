// src/components/BlockSwapAdminPanel.jsx
import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { blockswapAdapter } from "../services/blockswapAdapter";

const short = (a) =>
  a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";

const isAddrLike = (v) => /^0x[a-fA-F0-9]{40}$/.test(String(v || "").trim());

function isNumberish(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return Number.isFinite(Number(s));
}

export default function BlockSwapAdminPanel({
  walletAddress,
  adminWallet,
  onRefresh,
  chainId, // current wallet chain id (wagmi)
  targetChainId, // expected chain id (from config passed by page)
  ensureChain, // WalletContext.ensureChain
  stableSymbol = "USDC",
}) {
  const mountedRef = useRef(true);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [snap, setSnap] = useState(null);
  const [sell, setSell] = useState("");
  const [floor, setFloor] = useState("");

  const [treasuryAddr, setTreasuryAddr] = useState("");
  const [relayerAddr, setRelayerAddr] = useState("");

  // prevent overlap + spam
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const lastSnapSigRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isAdmin = useMemo(() => {
    if (!walletAddress || !adminWallet) return false;
    return String(walletAddress).toLowerCase() === String(adminWallet).toLowerCase();
  }, [walletAddress, adminWallet]);

  const target = Number(targetChainId || 0);
  const current = Number(chainId || 0);
  const chainReady = current > 0;

  const isConnected = !!walletAddress;
  const wrongChain = isConnected && target > 0 && chainReady && current !== target;

  const STABLE = String(stableSymbol || "USDC");

  function snapSignature(s) {
    try {
      const sellPerBrick = String(s?.fmt?.sellPerBrick ?? "");
      const floorPerBrick = String(s?.fmt?.floorPerBrick ?? "");
      const vault = String(s?.fmt?.vault ?? "");
      const liability = String(s?.fmt?.liability ?? "");
      const buyPaused = String(!!s?.buyPaused);
      const chain = String(s?.chainId ?? "");
      return [chain, sellPerBrick, floorPerBrick, vault, liability, buyPaused].join("|");
    } catch {
      return "";
    }
  }

  const refresh = useCallback(
    async ({ force = false, notifyParent = true } = {}) => {
      if (!mountedRef.current) return;
      if (!isAdmin) return;

      if (refreshInFlightRef.current) return;

      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < 2500) return;

      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;

      setErr("");

      try {
        const s = await blockswapAdapter.getSwapSnapshot();
        if (!mountedRef.current) return;

        setSnap(s || null);

        // Use formatted strings (brick prices) from snapshot
        setSell(String(s?.fmt?.sellPerBrick ?? ""));
        setFloor(String(s?.fmt?.floorPerBrick ?? ""));

        if (notifyParent && typeof onRefresh === "function") {
          const sig = snapSignature(s);
          if (force || sig !== lastSnapSigRef.current) {
            lastSnapSigRef.current = sig;
            onRefresh(s || null);
          }
        }
      } catch (e) {
        if (!mountedRef.current) return;
        setErr(e?.shortMessage || e?.message || "Failed to refresh admin snapshot.");
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [isAdmin, onRefresh]
  );

  useEffect(() => {
    if (!isAdmin) return;
    refresh({ force: true, notifyParent: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return null;

  async function act(label, fn) {
    try {
      setErr("");
      setMsg("");
      setBusy(true);

      if (wrongChain) {
        if (ensureChain && target) {
          await ensureChain(target);
        } else {
          throw new Error(
            `Wrong network. Switch wallet to chain ${target}. (Base Sepolia is 84532)`
          );
        }
      }

      const res = await fn();
      if (!mountedRef.current) return res;

      setMsg(`${label} sent ✅`);
      await refresh({ force: true, notifyParent: true });

      return res;
    } catch (e) {
      if (!mountedRef.current) return null;
      setErr(e?.shortMessage || e?.message || "Admin action failed.");
      return null;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  const canTogglePause = !busy;
  const canUpdatePrices = !busy && isNumberish(sell) && isNumberish(floor);
  const canUpdateTreasury = !busy && isAddrLike(treasuryAddr);
  const canUpdateRelayer = !busy && isAddrLike(relayerAddr);

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold uppercase tracking-wide text-amber-200">
          Admin Panel (On-chain)
        </div>
        <div className="text-xs text-amber-200/80">Admin: {short(adminWallet)}</div>
      </div>

      {wrongChain ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Wrong network (current: {current || "?"}, target: {target}).
          {ensureChain ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  setErr("");
                  await ensureChain(target);
                } catch (e) {
                  setErr(e?.message || "Failed to switch network.");
                }
              }}
              className="ml-2 rounded-md bg-rose-500 px-2 py-1 text-[10px] font-semibold text-slate-950 hover:bg-rose-400 disabled:opacity-60"
            >
              Switch Network
            </button>
          ) : null}
        </div>
      ) : null}

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

      {busy ? (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
          Working… (sending tx)
        </div>
      ) : null}

      {/* On-chain status */}
      <div className="mb-4 grid gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4 lg:grid-cols-3">
        <div className="text-xs text-slate-400">
          Vault ({STABLE})
          <div className="mt-1 font-mono text-slate-100">{snap?.fmt?.vault ?? "—"}</div>
        </div>
        <div className="text-xs text-slate-400">
          Floor Liability ({STABLE})
          <div className="mt-1 font-mono text-slate-100">{snap?.fmt?.liability ?? "—"}</div>
        </div>
        <div className="text-xs text-slate-400">
          Solvent?
          <div className={"mt-1 font-mono " + (snap?.isSolvent ? "text-emerald-300" : "text-rose-300")}>
            {snap?.isSolvent ? "true" : "false"}
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Coverage (vault/liability)
          <div className="mt-1 font-mono text-slate-100">{snap?.fmt?.coverage ?? "—"}</div>
        </div>
        <div className="text-xs text-slate-400">
          Swap OZ Inventory
          <div className="mt-1 font-mono text-slate-100">{snap?.fmt?.swapOz ?? "—"}</div>
        </div>
        <div className="text-xs text-slate-400">
          Buys
          <div className={"mt-1 font-mono " + (snap?.buyPaused ? "text-rose-300" : "text-emerald-300")}>
            {snap?.buyPaused ? "PAUSED" : "LIVE"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pause */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Controls</div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canTogglePause}
              onClick={() =>
                act("Set pause", () =>
                  blockswapAdapter.adminSetBuyPaused({
                    walletAddress,
                    paused: !snap?.buyPaused,
                  })
                )
              }
              className={
                "rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 " +
                (snap?.buyPaused
                  ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "bg-rose-500 text-slate-950 hover:bg-rose-400")
              }
            >
              {snap?.buyPaused ? "Unpause Buys" : "Pause Buys"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => refresh({ force: true, notifyParent: true })}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          <div className="mt-2 text-[0.75rem] text-slate-400">
            Toggles <span className="font-mono">buyPaused</span> on-chain. SellBack remains available.
          </div>
        </div>

        {/* Prices */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Prices (on-chain, can only go UP)</div>

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
            disabled={!canUpdatePrices}
            onClick={() =>
              act("Update prices", () =>
                blockswapAdapter.adminSetPrices({
                  walletAddress,
                  sellPricePerBrick: String(sell).trim(),
                  buybackFloorPerBrick: String(floor).trim(),
                })
              )
            }
            className="mt-3 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            title={!canUpdatePrices ? "Enter valid numeric values for sell and floor." : ""}
          >
            Update Prices
          </button>

          <div className="mt-2 text-[0.75rem] text-slate-400">
            Rule: sell and floor can only increase; sell must be ≥ floor.
          </div>
        </div>

        {/* Advanced */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-400">Advanced (optional)</div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Set Treasury Address
              <input
                value={treasuryAddr}
                onChange={(e) => setTreasuryAddr(e.target.value)}
                placeholder="0x..."
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
              />
              <button
                type="button"
                disabled={!canUpdateTreasury}
                onClick={() =>
                  act("Set treasury", () =>
                    blockswapAdapter.adminSetTreasury({
                      walletAddress,
                      treasury: String(treasuryAddr).trim(),
                    })
                  )
                }
                className="mt-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500 disabled:opacity-60"
              >
                Update Treasury
              </button>
            </label>

            <label className="text-xs text-slate-400">
              Set Relayer Address
              <input
                value={relayerAddr}
                onChange={(e) => setRelayerAddr(e.target.value)}
                placeholder="0x..."
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400"
              />
              <button
                type="button"
                disabled={!canUpdateRelayer}
                onClick={() =>
                  act("Set relayer", () =>
                    blockswapAdapter.adminSetRelayer({
                      walletAddress,
                      relayer: String(relayerAddr).trim(),
                    })
                  )
                }
                className="mt-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500 disabled:opacity-60"
              >
                Update Relayer
              </button>
            </label>
          </div>

          <div className="mt-2 text-[0.75rem] text-slate-500">
            Only use these if you intend to rotate treasury/relayer on-chain.
          </div>
        </div>
      </div>
    </div>
  );
}
