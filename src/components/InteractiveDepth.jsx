// src/components/InteractiveDepth.jsx
import React, { useRef, useEffect } from "react";

export default function InteractiveDepth() {
  const ref = useRef(null);

  useEffect(() => {
    const layer = ref.current;
    const handleMove = (e) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 20;
      const y = (e.clientY / innerHeight - 0.5) * 20;
      layer.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`;
    };

    const handleGlow = (e) => {
      const glow = layer.querySelector(".cursor-glow");
      glow.style.left = e.clientX + "px";
      glow.style.top = e.clientY + "px";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mousemove", handleGlow);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mousemove", handleGlow);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-0 pointer-events-none z-0 transition-transform duration-500"
    >
      <div className="cursor-glow absolute w-[400px] h-[400px] rounded-full bg-cyan-400/10 blur-[120px] -translate-x-1/2 -translate-y-1/2"></div>
    </div>
  );
}
