// src/components/DiceStage.jsx
import React from "react";
import "./diceAnimations.css";

export default function DiceStage({
  die1,
  die2,
  total,
  point,
  phase,
  animating,
  tableShake,
  rollDice,
  newRound,
}) {
  return (
    <div
      className={`relative p-10 rounded-3xl green-felt-table shadow-[0_0_40px_rgba(0,0,0,0.4)]
      backdrop-blur-xl transition-all duration-300 ${
        tableShake ? "table-shake" : ""
      }`}
      style={{ width: "720px", height: "500px" }}
    >
      <div className="flex flex-col items-center">

        {/* DICE CENTERED */}
        <div
          className="flex gap-10 mb-6 mt-6"
          style={{ transform: "translateY(-10px)" }}
        >
          <DiceFace value={die1} anim={animating} />
          <DiceFace value={die2} anim={animating} />
        </div>

        {/* TOTAL + POINT BELOW DICE */}
        <div className="text-center mt-2">
          <p className="text-green-200 text-lg font-semibold">
            Total: {total}
          </p>
          {point > 0 && (
            <p className="text-yellow-300 text-sm mt-1 italic">
              Point: {point}
            </p>
          )}
        </div>

        {/* BUTTONS */}
        <div className="mt-6">
          {phase !== "RESOLUTION" ? (
            <button
              onClick={rollDice}
              disabled={animating}
              className="px-8 py-3 rounded-xl bg-green-500 text-slate-900 font-semibold shadow-lg hover:bg-green-400"
            >
              Roll
            </button>
          ) : (
            <button
              onClick={newRound}
              className="px-8 py-3 rounded-xl bg-amber-400 text-slate-900 font-semibold shadow-lg hover:bg-amber-300"
            >
              New Round
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

/* ---------------- DICE WITH PIPS ---------------- */

function DiceFace({ value, anim }) {
  return (
    <div className={`dice-cube ${anim ? "roll-throw" : ""}`}>
      {renderPips(value)}
    </div>
  );
}

function renderPips(num) {
  const pip = <span className="pip"></span>;

  const layouts = {
    1: [null, null, pip, null, null, null, null, null, null],
    2: [pip, null, null, null, null, null, null, null, pip],
    3: [pip, null, null, null, pip, null, null, null, pip],
    4: [pip, null, pip, null, null, null, pip, null, pip],
    5: [pip, null, pip, null, pip, null, pip, null, pip],
    6: [pip, null, pip, pip, null, pip, pip, null, pip],
  };

  return (
    <div className="pip-grid">
      {layouts[num].map((p, i) => (
        <div key={i} className="pip-slot">
          {p}
        </div>
      ))}
    </div>
  );
}
