// src/components/SpadesCard.jsx
import React from "react";
import "./SpadesCard.css";

export default function SpadesCard({ card, onClick, disabled, highlight }) {
  if (!card) return null;

  const { suit, rank } = card;

  const isRed = suit === "♥" || suit === "♦";

  return (
    <div
      className={`sp-card ${isRed ? "red" : "black"} 
        ${disabled ? "disabled" : ""} 
        ${highlight ? "glow" : ""}
      `}
      onClick={() => !disabled && onClick?.(card)}
    >
      <div className="sp-rank">{rank}</div>
      <div className="sp-suit">{suit}</div>
    </div>
  );
}
