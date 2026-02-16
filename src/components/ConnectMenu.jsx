import React, { useMemo, useState } from "react";
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

export default function ConnectMenu({
  targetChainId = 0,
  displayName = "",
  onToast,
  onError,
  size = "sm", // "sm" | "md"
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
  } = useWallet();

  const [localErr, setLocalErr] = useState("");

  const wrongChain =
    isConnected &&
    Number(targetChainId) > 0 &&
    Number(chainId || 0) > 0 &&
    Number(chainId) !== Number(targetChainId);

  const toast = (msg) => {
    if (typeof onToast === "function") onToast(msg);
  };

  const bubbleErr = (msg) => {
    const m = String(msg || "Something went wrong.");
    setLocalErr(m);
    if (typeof onError === "function") onError(m);
  };

  const buttonCls =
    size === "md"
      ? "rounded-lg px-4 py-2 text-sm font-semibold"
      : "rounded-lg px-3 py-1.5 text-xs font-semibold";

  const connectBtnCls =
    "bg-sky-500 text-slate-950 hover:bg-sky-400 " + buttonCls;

  const connectedBtnCls =
    "border bg-slate-950 text-slate-200 hover:border-slate-500 " + buttonCls;

  const connectedTone = wrongChain
    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
    : "border-slate-700";

  const walletChipLabel = useMemo(() => {
    const dn = String(displayName || "").trim() || "Wallet";
    const dnShort = dn.length > 18 ? `${dn.slice(0, 18)}…` : dn;
    return walletAddress ? `${dnShort} (${shortAddr(walletAddress)})` : dnShort;
  }, [displayName, walletAddress]);

  return (
    <div className="relative">
      {localErr ? (
        <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {localErr}
        </div>
      ) : null}

      {!isConnected ? (
        <details className="relative">
          <summary className={"cursor-pointer list-none " + connectBtnCls}>
            Connect Wallet
          </summary>

          <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
              onClick={async () => {
                try {
                  setLocalErr("");
                  await connectMetaMask?.();
                  toast("Connected ✅");
                } catch (e) {
                  bubbleErr(e?.message || "MetaMask connect failed.");
                }
              }}
            >
              MetaMask
            </button>

            <button
              type="button"
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
              onClick={async () => {
                try {
                  setLocalErr("");
                  await connectCoinbase?.();
                  toast("Connected ✅");
                } catch (e) {
                  bubbleErr(e?.message || "Coinbase connect failed.");
                }
              }}
            >
              Coinbase
            </button>

            <button
              type="button"
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
              onClick={async () => {
                try {
                  setLocalErr("");
                  await connectWalletConnect?.();
                  toast("Connected ✅");
                } catch (e) {
                  bubbleErr(e?.message || "WalletConnect failed.");
                }
              }}
            >
              WalletConnect
            </button>

            <div className="border-t border-slate-800/80 px-4 py-2 text-[11px] text-slate-400">
              You can switch later.
            </div>
          </div>
        </details>
      ) : (
        <details className="relative">
          <summary className={"cursor-pointer list-none " + connectedBtnCls + " " + connectedTone}>
            {walletChipLabel}
          </summary>

          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
              onClick={async () => {
                const ok = await copyToClipboard(String(walletAddress || ""));
                if (ok) toast("Copied ✅");
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
                  } catch (e) {
                    // WalletConnect mobile may not support programmatic switch
                    bubbleErr(
                      e?.message ||
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
                } catch (e) {
                  bubbleErr(e?.message || "Disconnect failed.");
                }
              }}
            >
              Disconnect
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
