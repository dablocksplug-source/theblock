// src/components/ResidentField.jsx
import React, { useEffect, useState } from "react";

const NAMES = [
  "Architect Luna",
  "Cajun Coder",
  "Bayou Chef",
  "Pixel Mason",
  "Data Rover",
  "Starlight Moe",
  "Bit Courier",
];

export default function ResidentField() {
  const [residents, setResidents] = useState([]);

  useEffect(() => {
    const newResidents = Array.from({ length: 6 }, () => ({
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      x: Math.random() * 80 + 10,
      y: Math.random() * 60 + 20,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: Math.random() * 0.3 + 0.1,
    }));
    setResidents(newResidents);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setResidents((prev) =>
        prev.map((r) => {
          let newX = r.x + r.speed * r.dir;
          if (newX > 90 || newX < 10) r.dir *= -1;
          return { ...r, x: newX };
        })
      );
    }, 120);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
      {residents.map((r, i) => (
        <div
          key={i}
          style={{
            left: `${r.x}%`,
            top: `${r.y}%`,
            transform: `scale(${r.dir})`,
          }}
          className="absolute transition-all duration-200"
        >
          <div
            className="group relative cursor-pointer pointer-events-auto"
            title={r.name}
          >
            <div className="w-3 h-5 bg-gradient-to-t from-tealbrand to-blockgold rounded-sm shadow-md animate-bounce-slow" />
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block text-[10px] text-blockgold bg-slate-900/80 px-2 py-1 rounded-md">
              {r.name}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
