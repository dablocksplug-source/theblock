// src/components/DiceCube.jsx
import React from "react";
import "./DiceCube.css";

export default function DiceCube({ value, rolling }) {
  // When rolling, use the tumble animation.
  // When not rolling, lock the cube to the correct face.
  const poseClass = rolling ? "rolling" : `show-${value}`;

  return (
    <div className="dice-wrapper">
      <div className={`dice3d ${poseClass}`}>
        {/* 1 */}
        <div className="face face-1">
          <span className="pip center" />
        </div>

        {/* 2 */}
        <div className="face face-2">
          <span className="pip top-left" />
          <span className="pip bottom-right" />
        </div>

        {/* 3 */}
        <div className="face face-3">
          <span className="pip top-left" />
          <span className="pip center" />
          <span className="pip bottom-right" />
        </div>

        {/* 4 */}
        <div className="face face-4">
          <span className="pip top-left" />
          <span className="pip top-right" />
          <span className="pip bottom-left" />
          <span className="pip bottom-right" />
        </div>

        {/* 5 */}
        <div className="face face-5">
          <span className="pip top-left" />
          <span className="pip top-right" />
          <span className="pip center" />
          <span className="pip bottom-left" />
          <span className="pip bottom-right" />
        </div>

        {/* 6 */}
        <div className="face face-6">
          <span className="pip mid-left" />
          <span className="pip top-left" />
          <span className="pip bottom-left" />
          <span className="pip mid-right" />
          <span className="pip top-right" />
          <span className="pip bottom-right" />
        </div>
      </div>
    </div>
  );
}
