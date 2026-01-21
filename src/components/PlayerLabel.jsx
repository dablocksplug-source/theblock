// src/components/PlayerLabel.jsx
import React from "react";
import clsx from "clsx";

export default function PlayerLabel({ name, position, isTurn }) {
  return (
    <div
      className={clsx(
        "absolute text-white font-semibold tracking-wide",
        isTurn && "text-green-400 drop-shadow-[0_0_6px_rgba(0,255,0,0.9)]",
        position === "top" && "top-4 left-1/2 -translate-x-1/2",
        position === "bottom" && "bottom-4 left-1/2 -translate-x-1/2",
        position === "left" && "left-4 top-1/2 -translate-y-1/2 -rotate-90",
        position === "right" && "right-4 top-1/2 -translate-y-1/2 rotate-90"
      )}
    >
      {name}
    </div>
  );
}
