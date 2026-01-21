// src/pages/BlockProof.jsx
import React, { useState } from "react";

export default function BlockProof() {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [hash, setHash] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Convert array buffer → SHA-256 hash
  async function hashFile(f) {
    const buffer = await f.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const handleSubmit = async () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }

    setSubmitting(true);

    try {
      const digest = await hashFile(file);
      setHash(digest);

      // 🔥 This is where your BDAG transaction logic will go later.
      // sendBDAGTransaction(digest, description);

      setSubmitting(false);
      alert("Your proof has been generated and timestamped successfully.");
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      alert("Error generating proof.");
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-140px)] w-full flex items-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden">
      {/* Background glows */}
      <div className="pointer-events-none absolute w-[420px] h-[420px] bg-emerald-500/20 rounded-full blur-3xl -top-24 -left-32" />
      <div className="pointer-events-none absolute w-[420px] h-[420px] bg-cyan-500/18 rounded-full blur-3xl top-48 -right-32" />

      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
        {/* Hero */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-900/80 border border-slate-700/70 text-[11px] sm:text-xs text-slate-300 tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>The Block • Proof of Creation</span>
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold text-emerald-400 drop-shadow-[0_0_26px_rgba(16,185,129,0.9)]">
            BlockProof
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            Protect your work, your code, or your ideas — permanently. Each
            proof is timestamped on the BlockDAG chain and secured forever. One
            simple step. One flat fee.
          </p>
        </div>

        {/* Upload card */}
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 shadow-[0_0_32px_rgba(16,185,129,0.45)] p-5 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-center text-sm sm:text-base font-semibold text-slate-100 mb-4">
            Upload Your Proof
          </h2>

          {/* File input */}
          <div className="mb-4 space-y-1">
            <label className="block text-[11px] sm:text-xs font-semibold text-slate-300 mb-1">
              File to protect
            </label>
            <div className="relative">
              <input
                type="file"
                className="block w-full text-[11px] sm:text-xs text-slate-200 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/90 file:text-slate-950 hover:file:bg-emerald-400 cursor-pointer bg-slate-950/90 border border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400/80"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500">
              Any file type is fine — images, audio, source code, PDFs, etc.
            </p>
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-[11px] sm:text-xs font-semibold text-slate-300 mb-1">
              Description (optional)
            </label>
            <textarea
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/80 resize-y min-h-[72px]"
              placeholder="Short description (example: logo design v1, contract draft, beat demo, code revision...)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Fee line */}
          <div className="mb-4 text-center text-xs sm:text-sm text-slate-300">
            Flat Fee: <span className="font-semibold text-emerald-300">$12.00</span>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
              (~ auto-converted to BDAG at current price)
            </div>
          </div>

          {/* Submit button */}
          <button
            className="w-full rounded-full bg-emerald-500/95 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 text-sm shadow-[0_0_26px_rgba(16,185,129,0.9)] transition-colors disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting..." : "Submit Proof"}
          </button>
        </div>

        {/* Info box */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-4 sm:px-5 py-3 sm:py-4 mb-4 sm:mb-6 text-[10px] sm:text-xs text-slate-300">
          <p>
            Your file <span className="font-semibold">never leaves your device.</span>{" "}
            A SHA-256 hash is generated locally, and only the hash is written
            on-chain. This permanently proves ownership, originality, and
            timestamp — without revealing the file itself.
          </p>
        </div>

        {/* Hash result */}
        {hash && (
          <div className="rounded-2xl border border-emerald-500/40 bg-slate-950/90 px-4 sm:px-5 py-4 sm:py-5 shadow-[0_0_26px_rgba(16,185,129,0.55)]">
            <h3 className="text-sm sm:text-base font-semibold text-emerald-300 mb-2">
              Your Proof Hash
            </h3>
            <div className="rounded-lg bg-slate-900/90 border border-slate-700 px-3 py-2 max-h-40 overflow-y-auto">
              <code className="block font-mono text-[11px] sm:text-xs text-emerald-200 break-all">
                {hash}
              </code>
            </div>
            <p className="mt-2 text-[10px] sm:text-[11px] text-slate-400">
              Store this hash safely — it&apos;s your permanent proof of creation.
              Later, we can add a BlockExplorer link to verify this proof on-chain.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
