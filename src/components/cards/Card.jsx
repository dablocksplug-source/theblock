import React from "react";
import "../../styles/Card.css";

export default function Card({ v, size = "md" }) {
  const value = typeof v === "string" ? v : v.card;
  if (!value) return null;

  const rank = value.slice(0, value.length - 1);
  const suit = value.slice(-1);
  const isRed = suit === "♥" || suit === "♦";

  return (
    <div className={`card card-${size}`}>
      <div className="corner" style={{ color: isRed ? "red" : "black" }}>
        {rank}{suit}
      </div>

      <div className="suit" style={{ color: isRed ? "red" : "black" }}>
        {suit}
      </div>

      <div className="corner bot" style={{ color: isRed ? "red" : "black" }}>
        {rank}{suit}
      </div>
    </div>
  );
}
