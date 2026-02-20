// src/components/WalletConnectButton.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

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

/**
 * ✅ Mobile-ish detection
 * Goal: if this returns true, we ONLY show the bottom sheet (never dropdown).
 * This intentionally treats iPad/tablet + touch laptops as "mobile-ish" to avoid dropdown being "in the way".
 */
function useIsMobileish() {
  const get = () => {
    if (typeof window === "undefined") return false;

    const ua = navigator?.userAgent || "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports as Mac; detect touch-enabled Mac UA
      (ua.includes("Mac") && navigator?.maxTouchPoints > 1);

    const mqSmall = window.matchMedia?.("(max-width: 640px)")?.matches ?? false;
    const mqCoarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const touchCapable =
      (navigator?.maxTouchPoints || 0) > 0 ||
      "ontouchstart" in window ||
      mqCoarse;

    // Treat iOS/iPadOS as mobile-ish always (prevents dropdown on iPad Safari)
    if (isIOS) return true;

    // Otherwise: small screens OR touch-capable devices are mobile-ish
    return mqSmall || touchCapable;
  };

  const [isMobileish, setIsMobileish] = useState(get);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => setIsMobileish(get());

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (vv) vv.removeEventListener("resize", update);
    };
  }, []);

  return isMobileish;
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

  const {
    nickname,
    useNickname,
    setUseNickname,
    askForNickname,
    hasOnchainNickname,
  } = useNicknameContext();

  const isMobileish = useIsMobileish();

  const [open, setOpen] = useState(false);
  const [localErr, setLocalErr] = useState("");

  const rootRef = useRef(null);
  const sheetRef = useRef(null);

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

  const hasNickname = useMemo(
    () => String(nickname || "").trim().length > 0,
    [nickname]
  );

  const displayName = useMemo(() => {
    return getDisplayName({ walletAddress, nickname, useNickname });
  }, [walletAddress, nickname, useNickname]);

  const chipLabel = useMemo(() => {
    if (!isConnected) return label;
    const addr = walletAddress ? shortAddr(walletAddress) : "—";
    const shown = useNickname && hasNickname ? String(nickname).trim() : addr;
    return `Wallet (${shown})`;
  }, [isConnected, walletAddress, label, useNickname, hasNickname, nickname]);

  const canWC = (availableConnectors || []).some((c) => {
    const s = `${c?.id || ""} ${c?.name || ""}`.toLowerCase();
    return s.includes("walletconnect");
  });

  // ✅ Close on outside click/tap only while open (prevents random closures)
  useEffect(() => {
    if (!open) return;

    function onDocPointerDown(e) {
      const t = e.target;
      const inRoot = rootRef.current && rootRef.current.contains(t);
      const inSheet = sheetRef.current && sheetRef.current.contains(t);
      if (inRoot || inSheet) return;
      setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // ✅ If mobile-ish flips while menu is open, close it
  useEffect(() => {
    if (!open) return;
    setOpen(false);
  }, [isMobileish, open]);

  // ✅ Lock page scroll ONLY while mobile sheet is open
  useEffect(() => {
    if (!isMobileish) return;
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isMobileish]);

  const buttonCls =
    size === "md"
      ? "rounded-xl px-3 py-1.5 text-sm font-semibold"
      : "rounded-lg px-3 py-1.5 text-xs font-semibold";

  const connectBtnCls =
    "border border-cyan-400/30 text-cyan-200 hover:border-cyan-300/50 bg-slate-950/30 " +
    buttonCls;

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

  const doSetNickname = useCallback(() => {
    try {
      setLocalErr("");
      setOpen(false);
      askForNickname?.();
    } catch (e) {
      bubbleErr(e?.message || "Could not open nickname modal.");
    }
  }, [askForNickname]);

  const doToggleNick = useCallback(() => {
    try {
      setLocalErr("");
      setUseNickname?.(!useNickname);
      toast(!useNickname ? "Nickname ON" : "Address ON");
    } catch (e) {
      bubbleErr(e?.message || "Toggle failed.");
    }
  }, [setUseNickname, useNickname]);

  // ✅ One-time nickname: show only when connected AND no nickname AND not locked on-chain
  const canSetNickname = isConnected && !hasNickname && !hasOnchainNickname;

  // =========================
  // MOBILE SHEET (portal)
  // =========================
  const mobileSheet =
    open && isMobileish && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/55"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
            />

            <div
              ref={sheetRef}
              className="fixed left-0 right-0 bottom-0 z-[9999] rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl"
              onPointerDown={(e) => e.stopPropagation()}
            >
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

              <div
                className="max-h-[70vh] overflow-y-auto border-t border-slate-800/70"
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
              >
                {!isConnected ? (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-4 text-left text-base text-slate-200 hover:bg-slate-900"
                      onClick={() => safeConnect(connectMetaMask, "MetaMask connect failed.")}
                    >
                      MetaMask
                    </button>

                    <button
                      type="button"
                      className="w-full px-4 py-4 text-left text-base text-slate-200 hover:bg-slate-900"
                      onClick={() => safeConnect(connectCoinbase, "Coinbase connect failed.")}
                    >
                      Coinbase Wallet
                    </button>

                    <button
                      type="button"
                      className={
                        "w-full px-4 py-4 text-left text-base hover:bg-slate-900 " +
                        (canWC ? "text-slate-200" : "text-slate-500")
                      }
                      disabled={!canWC}
                      onClick={() => safeConnect(connectWalletConnect, "WalletConnect failed.")}
                    >
                      WalletConnect {canWC ? "" : "(not configured)"}
                    </button>

                    <div className="px-4 py-4 text-sm text-slate-400 border-t border-slate-800/70">
                      Pick a wallet — no auto-connect.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-4 pt-4 pb-2 text-sm text-slate-300">
                      Connected as{" "}
                      <span className="font-semibold text-slate-100">
                        {displayName || shortAddr(walletAddress)}
                      </span>
                    </div>

                    {canSetNickname ? (
                      <button
                        type="button"
                        className="w-full px-4 py-4 text-left text-base text-emerald-200 hover:bg-slate-900"
                        onClick={doSetNickname}
                      >
                        Set Nickname
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="w-full px-4 py-4 text-left text-base text-slate-200 hover:bg-slate-900"
                      onClick={doToggleNick}
                    >
                      {useNickname ? "Show Address Instead" : "Show Nickname Instead"}
                    </button>

                    <button
                      type="button"
                      className="w-full px-4 py-4 text-left text-base text-slate-200 hover:bg-slate-900"
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
                        className="w-full px-4 py-4 text-left text-base text-rose-200 hover:bg-slate-900"
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
                        Switch network
                      </button>
                    ) : null}

                    <div className="border-t border-slate-800/70" />

                    <button
                      type="button"
                      className="w-full px-4 py-4 text-left text-base text-slate-200 hover:bg-slate-900"
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
          </>,
          document.body
        )
      : null;

  // =========================
  // DESKTOP DROPDOWN
  // =========================
  const desktopDropdown =
    open && !isMobileish ? (
      <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
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
            <div className="px-4 py-2 text-[11px] text-slate-400">
              Connected as{" "}
              <span className="text-slate-200 font-semibold">
                {displayName || shortAddr(walletAddress)}
              </span>
            </div>

            {canSetNickname ? (
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-xs text-emerald-200 hover:bg-slate-900"
                onClick={doSetNickname}
              >
                Set Nickname
              </button>
            ) : null}

            <button
              type="button"
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
              onClick={doToggleNick}
            >
              {useNickname ? "Show Address Instead" : "Show Nickname Instead"}
            </button>

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
                Switch network
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
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      {localErr ? (
        <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {localErr}
        </div>
      ) : null}

      <button
        type="button"
        className={!isConnected ? connectBtnCls : connectedBtnCls + " " + connectedTone}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (debug) console.log("[WalletConnectButton] toggle", { open: !open, isMobileish });
          setOpen((v) => !v);
        }}
      >
        {chipLabel}
      </button>

      {/* ✅ Mobile sheet ONLY on mobile-ish */}
      {mobileSheet}

      {/* ✅ Dropdown ONLY on true desktop */}
      {desktopDropdown}
    </div>
  );
}
