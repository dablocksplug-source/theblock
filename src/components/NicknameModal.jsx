// src/components/NicknameModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNicknameContext } from "../context/NicknameContext";

function errToString(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  return String(e?.shortMessage || e?.message || e);
}

function isMobileish() {
  try {
    const ua = (navigator?.userAgent || "").toLowerCase();
    return ua.includes("android") || ua.includes("iphone") || ua.includes("ipad");
  } catch {
    return false;
  }
}

export default function NicknameModal() {
  const {
    modalOpen,
    setModalOpen,
    loading,
    saveNickname,
    nickname,
    hasOnchainNickname,
  } = useNicknameContext();

  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const mobile = isMobileish();

  // ✅ If nickname already exists on-chain, never show this modal (safety net)
  useEffect(() => {
    if (modalOpen && hasOnchainNickname) {
      setModalOpen(false);
    }
  }, [modalOpen, hasOnchainNickname, setModalOpen]);

  // ✅ When opening: always start blank (create-only, no edits)
  useEffect(() => {
    if (!modalOpen) return;
    setErr("");
    setName("");
  }, [modalOpen]);

  const trimmed = useMemo(() => String(name || "").trim(), [name]);

  const helper = useMemo(() => {
    if (hasOnchainNickname) return "Nickname already set for this wallet.";
    if (!trimmed) return "Nickname must be 3–24 characters.";
    if (trimmed.length < 3) return "Nickname must be 3–24 characters.";
    if (trimmed.length > 24) return "Nickname must be 3–24 characters.";
    return "This name is locked to your wallet forever.";
  }, [trimmed, hasOnchainNickname]);

  const canSave = !loading && !hasOnchainNickname && trimmed.length >= 3 && trimmed.length <= 24;

  const close = () => {
    setErr("");
    setModalOpen(false);
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setErr("");

    try {
      await saveNickname(trimmed);
    } catch (ex) {
      setErr(errToString(ex));
    }
  };

  if (!modalOpen || hasOnchainNickname) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="text-lg font-semibold text-white">
            Create Your Permanent Nickname
          </div>
          <button
            onClick={close}
            className="rounded-md px-3 py-1 text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6 pt-4">
          <div className="text-sm text-white/70 mb-3">{helper}</div>

          {/* ✅ Mobile UX hint (this is the “user-friendly” win) */}
          {mobile ? (
            <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <div className="font-semibold text-amber-100 mb-1">Mobile tip</div>
              If you opened the site in Chrome/Safari and it kicked you into MetaMask,
              the “Sign” prompt can fail to appear.
              <div className="mt-2 text-amber-200/90">
                Best fix: open the site inside <b>MetaMask → Browser</b> or connect using{" "}
                <b>WalletConnect</b>.
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter nickname"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/25"
              maxLength={24}
              autoComplete="off"
              autoFocus
            />

            {err ? (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap">
                {err}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSave}
              className={`mt-5 w-full rounded-xl py-3 font-semibold transition ${
                canSave
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "bg-emerald-500/40 text-black/40"
              }`}
            >
              {loading ? "Saving..." : "Save Name"}
            </button>

            <div className="mt-3 text-xs text-white/50">
              Nickname must be 3–24 characters. One-time set per wallet.
            </div>

            {nickname ? (
              <div className="mt-2 text-[11px] text-white/35">
                Current cached name:{" "}
                <span className="text-white/50">{String(nickname)}</span>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
