// src/components/AuraBackground.jsx
import React, { useEffect, useState } from "react";

export default function AuraBackground() {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const handleMove = (e) => {
      setPos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  const bgStyle = {
    background: `
      radial-gradient(
        circle at ${pos.x * 100}% ${pos.y * 100}%,
        rgba(56,189,248,0.25),
        transparent 45%
      ),
      radial-gradient(circle at bottom right, rgba(14,165,233,0.08), transparent 60%),
      radial-gradient(circle at top left, rgba(14,165,233,0.05), transparent 50%)
    `,
    transition: "background 0.6s ease",
  };

  return (
    <div
      className="fixed inset-0 -z-10 animate-[colorflow_30s_linear_infinite]"
      style={bgStyle}
    />
  );
}
