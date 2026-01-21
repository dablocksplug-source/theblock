// src/pages/BonesLobby.jsx
import React from "react";

export default function BonesLobby() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-28 px-6 text-textlight">
      <h1 className="text-3xl font-bold mb-6 neon-text">Bones Lobby</h1>

      <p className="opacity-80 text-center max-w-xl mb-10">
        Dominoes on the block.  
        Create or join a table and slap them tiles.
      </p>

      <div className="w-full max-w-xl bg-[#0e1735aa] p-6 rounded-xl border border-primary/50">
        <h2 className="text-xl font-semibold mb-4">Open Tables</h2>

        <p className="opacity-60">No active tables yet.</p>

        <button className="mt-6 bg-primary text-black px-5 py-2 rounded-lg font-bold hover:bg-cyan-300">
          Create New Table
        </button>
      </div>
    </div>
  );
}
