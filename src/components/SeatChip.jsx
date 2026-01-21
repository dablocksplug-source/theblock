// src/components/SeatChip.jsx
import React from "react";

export default function SeatChip({ label, taken, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer px-6 py-2 rounded-full border text-sm transition
      ${
        taken
          ? "border-green-400 text-green-300 bg-green-900/20"
          : "border-slate-600 text-slate-400 hover:border-cyan-300"
      }`}
    >
      {label} — {taken ? "In" : "Join"}
    </div>
  );
}
