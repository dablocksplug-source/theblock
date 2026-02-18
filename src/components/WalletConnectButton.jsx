// src/components/WalletConnectButton.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext } from "../context/NicknameContext";

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

  // optional (but you do have it) — used for the "Set Nickname" action
  const nickCtx = (() => {
    try {
      return useNicknameContext();
    } catch {
      return null;
    }
  })();

  const [open, setOpen] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const rootRef = useRef(null);
  const isMobile = useIsMobile(640);

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

  // prevent background scroll when mobile sheet is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, isMobile]);

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
    "border border-cyan-400/30 text-cyan-200 hover:border-cyan-300/50 bg-slate-950/30 " +
    buttonCls;

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

  const MenuButton = ({ children, onClick, disabled, tone = "normal" }) => {
    const base =
      "w-full px-4 py-3 text-left text-sm sm:text-xs hover:bg-slate-900 disabled:opacity-60";
    const color =
      tone === "danger"
        ? "text-rose-200"
        : tone === "muted"
        ? "text-slate-500"
        : "text-slate-200";
    return (
      <button
        type="button"
        className={`${base} ${color}`}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  };

  const PanelChrome = ({ children }) => (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
      {children}
    </div>
  );

  const ConnectedMenu = () => (
    <>
      <MenuButton
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ok = await copyToClipboard(String(walletAddress || ""));
          if (ok) toast("Copied ✅");
          setOpen(false);
        }}
      >
        Copy address
      </MenuButton>

      {nickCtx?.askForNickname ? (
        <MenuButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              setLocalErr("");
              nickCtx.askForNickname();
              setOpen(false);
            } catch (err) {
              bubbleErr(err?.message || "Could not open nickname panel.");
            }
          }}
        >
          Set Nickname
        </MenuButton>
      ) : null}

      {wrongChain && ensureChain ? (
        <MenuButton
          tone="danger"
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
        </MenuButton>
      ) : null}

      <div className="border-t border-slate-800/80" />

      <MenuButton
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
      </MenuButton>
    </>
  );

  const DisconnectedMenu = () => (
    <>
      <MenuButton
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
      </MenuButton>

      <MenuButton
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
      </MenuButton>

      <MenuButton
        disabled={!canWC}
        tone={!canWC ? "muted" : "normal"}
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
      </MenuButton>

      <div className="border-t border-slate-800/80 px-4 py-2 text-[11px] text-slate-400">
        Pick a wallet — no auto-connect.
      </div>
    </>
  );

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

      {/* MENU */}
      {open ? (
        isMobile ? (
          // ✅ MOBILE: bottom-sheet so it NEVER covers the district header links
          <div
            className="fixed inset-0 z-[9999]"
            onMouseDown={(e) => {
              // click outside closes
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {/* dim */}
            <div className="absolute inset-0 bg-black/60" />

            {/* sheet */}
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <PanelChrome>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm font-semibold text-slate-100">
                    {isConnected ? "Wallet" : "Connect"}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-900"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="border-t border-slate-800/80" />

                <div className="max-h-[55vh] overflow-auto">
                  {!isConnected ? <DisconnectedMenu /> : <ConnectedMenu />}
                </div>

                <div className="border-t border-slate-800/80 px-4 py-2 text-[11px] text-slate-500">
                  Tip: this mobile panel opens from the bottom so it won’t block the district header.
                </div>
              </PanelChrome>
            </div>
          </div>
        ) : (
          // ✅ DESKTOP: keep your current anchored dropdown
          <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
            {!isConnected ? <DisconnectedMenu /> : <ConnectedMenu />}
          </div>
        )
      ) : null}
    </div>
  );
}
