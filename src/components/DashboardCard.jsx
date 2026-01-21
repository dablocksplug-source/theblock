import React from "react";

export default function DashboardCard({ title, value, subtitle, glow }) {
  return (
    <div
      className={`rounded-xl p-5 sm:p-6 bg-black/30 border border-white/10 shadow-lg backdrop-blur-md transition transform hover:scale-[1.02] ${
        glow ? "shadow-[0_0_10px_rgba(0,255,255,0.3)]" : ""
      }`}
    >
      <h3 className="text-lg font-semibold text-[var(--accent)]">{title}</h3>
      <p className="text-2xl sm:text-3xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
    </div>
  );
}
