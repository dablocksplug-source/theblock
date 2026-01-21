import React from "react";

export default function BackgroundAura() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#050816] via-[#0a1b2a] to-[#02101a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,255,0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(0,0,255,0.15),transparent_50%)]" />
    </div>
  );
}
