// src/components/SeatCard.jsx
import React from "react";

export default function SeatCard({ role, taken, onClick }) {
  return (
    <div
      className={`w-56 p-4 rounded-2xl border text-center cursor-pointer transition
      ${
        taken
          ? "border-green-400 bg-green-900/20 text-green-300"
          : "border-slate-600 bg-slate-800/40 text-slate-300 hover:border-cyan-300"
      }`}
      onClick={onClick}
    >
      <p className="font-bold text-lg">{role}</p>
      <p className="text-xs mt-1">{taken ? "Taken" : "Open seat"}</p>
    </div>
  );
}
