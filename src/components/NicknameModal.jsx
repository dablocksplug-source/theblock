// src/components/NicknameModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNicknameContext } from "../context/NicknameContext";
import { useWallet } from "../context/WalletContext";

export default function NicknameModal() {
  const { isConnected } = useWallet();
  const { modalOpen, setModalOpen, loading, saveNickname, nickname } = useNicknameContext();

  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!modalOpen) {
      setErr("");
      return;
    }
    // preload current nickname when opening
    setName((nickname || "").trim());
    setErr("");
  }, [modalOpen, nickname]);

  const canSave = useMemo(() => {
    const n = (name || "").trim();
    return isConnected && !loading && n.length >= 3 && n.length <= 24;
  }, [name, isConnected, loading]);

  async function onSubmit(e) {
    e?.preventDefault?.();
    setErr("");

    try {
      await saveNickname(name); // ✅ IMPORTANT: do NOT expect a response payload here
      // saveNickname already closes modal on success, but safe:
      setModalOpen(false);
    } catch (e2) {
      // ✅ never read e2.signature / e2.response / etc
      const msg = e2?.shortMessage || e2?.message || String(e2);
      setErr(msg);
      console.error("[NicknameModal] saveNickname failed:", e2);
    }
  }

  if (!modalOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Create Your Permanent Nickname</h2>
            <p className="mt-1 text-sm text-slate-300">This name is locked to your wallet forever.</p>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter nickname"
            className="mb-3 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none focus:border-white/20"
            maxLength={24}
          />

          {err ? (
            <div className="mb-3 whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSave}
            className={`w-full rounded-xl py-3 font-semibold text-black ${
              canSave ? "bg-emerald-500 hover:bg-emerald-400" : "bg-emerald-500/40"
            }`}
          >
            {loading ? "Saving..." : "Save Name"}
          </button>

          <div className="mt-2 text-xs text-slate-400">
            Nickname must be 3–24 characters.
          </div>
        </form>
      </div>
    </div>
  );
}
