import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "../context/WalletContext";

const shortAddr = (a) =>
  a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";

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

export default function WalletConnectButton({
  targetChainId = Number(import.meta.env.VITE_CHAIN_ID || 84532),
  size = "sm", // "sm" | "md"
  label = "Connect Wallet",
  onToast,
  onError,
  debug = false,
}) {
  const {
    walletAddress,
    isConnected,
    chainId,
    ensureChain,
    connectMetaMask,
    connectCoinbase,
    connectWalletConnect,
    disconnectWallet,
    availableConnectors,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const toast = (msg) => {
    if (typeof onToast === "function") onToast(msg);
  };

  const bubbleErr = (msg) => {
    const m = String(msg || "Something went wrong.");
    setLocalErr(m);
    if (typeof onError === "function") onError(m);
  };

  const wrongChain =
    isConnected &&
    Number(targetChainId) > 0 &&
    Number(chainId || 0) > 0 &&
    Number(chainId) !== Number(targetChainId);

  const buttonCls =
    size === "md"
      ? "rounded-xl px-3 py-1.5 text-sm font-semibold"
      : "rounded-lg px-3 py-1.5 text-xs font-semibold";

  const connectBtnCls =
    "border border-cyan-400/30 text-cyan-200 hover:border-cyan-300/50 bg-slate-950/30 " + buttonCls;

  const connectedBtnCls =
    "border bg-slate-950 text-slate-200 hover:border-slate-500 " + buttonCls;

  const connectedTone = wrongChain
    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
    : "border-slate-700";

  const chipLabel = useMemo(() => {
    if (!isConnected) return label;
    const addr = walletAddress ? shortAddr(walletAddress) : "—";
    return `Wallet (${addr})`;
  }, [isConnected, walletAddress, label]);

  // Detect WalletConnect presence
  const canWC = (availableConnectors || []).some((c) => {
    const s = `${c?.id || ""} ${c?.name || ""}`.toLowerCase();
    return s.includes("walletconnect");
  });

  return (
    <div ref={rootRef} className="relative">
      {localErr ? (
        <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {localErr}
        </div>
      ) : null}

      {/* MAIN BUTTON: ONLY toggles menu. Never connects automatically. */}
      <button
        type="button"
        className={!isConnected ? connectBtnCls : connectedBtnCls + " " + connectedTone}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (debug) console.log("[WalletConnectButton] toggle menu", { open: !open });
          setOpen((v) => !v);
        }}
      >
        {chipLabel}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
          {!isConnected ? (
            <>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    setLocalErr("");
                    setOpen(false);
                    if (debug) console.log("[WalletConnectButton] connect MetaMask");
                    await connectMetaMask?.();
                    toast("Connected ✅");
                  } catch (err) {
                    bubbleErr(err?.message || "MetaMask connect failed.");
                  }
                }}
              >
                MetaMask
              </button>

              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    setLocalErr("");
                    setOpen(false);
                    if (debug) console.log("[WalletConnectButton] connect Coinbase");
                    await connectCoinbase?.();
                    toast("Connected ✅");
                  } catch (err) {
                    bubbleErr(err?.message || "Coinbase connect failed.");
                  }
                }}
              >
                Coinbase Wallet
              </button>

              <button
                type="button"
                className={
                  "w-full px-4 py-2 text-left text-xs hover:bg-slate-900 " +
                  (canWC ? "text-slate-200" : "text-slate-500")
                }
                disabled={!canWC}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    setLocalErr("");
                    setOpen(false);
                    if (debug) console.log("[WalletConnectButton] connect WalletConnect");
                    await connectWalletConnect?.();
                    toast("Connected ✅");
                  } catch (err) {
                    bubbleErr(err?.message || "WalletConnect failed.");
                  }
                }}
              >
                WalletConnect {canWC ? "" : "(not configured)"}
              </button>

              <div className="border-t border-slate-800/80 px-4 py-2 text-[11px] text-slate-400">
                Pick a wallet — no auto-connect.
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const ok = await copyToClipboard(String(walletAddress || ""));
                  if (ok) toast("Copied ✅");
                  setOpen(false);
                }}
              >
                Copy address
              </button>

              {wrongChain && ensureChain ? (
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-xs text-rose-200 hover:bg-slate-900"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      setLocalErr("");
                      await ensureChain(Number(targetChainId));
                      toast("Network switched ✅");
                      setOpen(false);
                    } catch (err) {
                      bubbleErr(
                        err?.message ||
                          `Switch failed. Open your wallet and switch to chain ${targetChainId}.`
                      );
                    }
                  }}
                >
                  Switch to chain {targetChainId}
                </button>
              ) : null}

              <div className="border-t border-slate-800/80" />

              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    setLocalErr("");
                    disconnectWallet?.();
                    toast("Disconnected");
                    setOpen(false);
                  } catch (err) {
                    bubbleErr(err?.message || "Disconnect failed.");
                  }
                }}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
