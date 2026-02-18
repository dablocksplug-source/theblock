// src/components/WalletConnectButton.jsx
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

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpointPx;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpointPx]);

  return isMobile;
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

  const isMobile = useIsMobile(640);

  const [open, setOpen] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const rootRef = useRef(null);

  // ✅ NEW: ref to force the scroll container to top on open
  const sheetScrollRef = useRef(null);

  const toast = (msg) => typeof onToast === "function" && onToast(msg);

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

  const chipLabel = useMemo(() => {
    if (!isConnected) return label;
    const addr = walletAddress ? shortAddr(walletAddress) : "—";
    return `Wallet (${addr})`;
  }, [isConnected, walletAddress, label]);

  const canWC = (availableConnectors || []).some((c) => {
    const s = `${c?.id || ""} ${c?.name || ""}`.toLowerCase();
    return s.includes("walletconnect");
  });

  // Close on outside click/tap (mobile-safe)
  useEffect(() => {
    function onDocPointerDown(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onDocPointerDown, { passive: true });
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // Optional: lock scroll ONLY while sheet is open (mobile only)
  useEffect(() => {
    if (!isMobile) return;
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    // ✅ helps on some mobile browsers so gestures don’t get weird
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [open, isMobile]);

  // ✅ NEW: force sheet content to top whenever it opens (mobile only)
  useEffect(() => {
    if (!isMobile) return;
    if (!open) return;

    // wait one paint so the element exists + layout finished
    requestAnimationFrame(() => {
      try {
        if (sheetScrollRef.current) {
          sheetScrollRef.current.scrollTop = 0;
          sheetScrollRef.current.scrollTo?.({ top: 0, behavior: "auto" });
        }
      } catch {}
    });
  }, [open, isMobile]);

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

  async function safeConnect(fn, failMsg) {
    try {
      setLocalErr("");
      setOpen(false);
      await fn?.();
      toast("Connected ✅");
    } catch (err) {
      bubbleErr(err?.message || failMsg);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {localErr ? (
        <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {localErr}
        </div>
      ) : null}

      {/* MAIN BUTTON */}
      <button
        type="button"
        className={!isConnected ? connectBtnCls : connectedBtnCls + " " + connectedTone}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (debug) console.log("[WalletConnectButton] toggle menu", { open: !open, isMobile });
          setOpen((v) => !v);
        }}
      >
        {chipLabel}
      </button>

      {/* ===== MOBILE: bottom sheet (never off-screen) ===== */}
      {open && isMobile ? (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[60] bg-black/55" onClick={() => setOpen(false)} />

          {/* Sheet */}
          <div className="fixed left-0 right-0 bottom-0 z-[61] rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-semibold text-slate-100">
                {isConnected ? "Wallet" : "Connect"}
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            {/* ✅ FIX: make this area reliably scrollable on phones */}
            <div
              ref={sheetScrollRef}
              className="max-h-[70vh] overflow-y-auto border-t border-slate-800/70"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
              }}
            >
              {!isConnected ? (
                <>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                    onClick={() => safeConnect(connectMetaMask, "MetaMask connect failed.")}
                  >
                    MetaMask
                  </button>

                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                    onClick={() => safeConnect(connectCoinbase, "Coinbase connect failed.")}
                  >
                    Coinbase Wallet
                  </button>

                  <button
                    type="button"
                    className={
                      "w-full px-4 py-3 text-left text-sm hover:bg-slate-900 " +
                      (canWC ? "text-slate-200" : "text-slate-500")
                    }
                    disabled={!canWC}
                    onClick={() => safeConnect(connectWalletConnect, "WalletConnect failed.")}
                  >
                    WalletConnect {canWC ? "" : "(not configured)"}
                  </button>

                  <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-800/70">
                    Pick a wallet — no auto-connect.
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                    onClick={async () => {
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
                      className="w-full px-4 py-3 text-left text-sm text-rose-200 hover:bg-slate-900"
                      onClick={async () => {
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

                  <div className="border-t border-slate-800/70" />

                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                    onClick={() => {
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
          </div>
        </>
      ) : null}

      {/* ===== DESKTOP: normal dropdown ===== */}
      {open && !isMobile ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
          {!isConnected ? (
            <>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                onClick={() => safeConnect(connectMetaMask, "MetaMask connect failed.")}
              >
                MetaMask
              </button>

              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                onClick={() => safeConnect(connectCoinbase, "Coinbase connect failed.")}
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
                onClick={() => safeConnect(connectWalletConnect, "WalletConnect failed.")}
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
                onClick={async () => {
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
                  onClick={async () => {
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
                onClick={() => {
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

