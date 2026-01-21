// src/components/NicknameModal.jsx
import React, { useState } from "react";
import { useNicknameContext } from "../context/NicknameContext";
import "./NicknameModal.css";

export default function NicknameModal() {
  const { modalOpen, setModalOpen, saveNickname, loading } = useNicknameContext();

  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!modalOpen) return null;

  const submit = async () => {
    console.log("[NicknameModal] Save button clicked with:", name);
    setError("");

    try {
      if (!name || name.trim().length < 3) {
        setError("Name must be at least 3 characters.");
        return;
      }

      await saveNickname(name.trim());
      console.log("[NicknameModal] saveNickname resolved");

      // ✅ close on success + clear input
      setName("");
      setModalOpen(false);
    } catch (err) {
      console.error("[NicknameModal] saveNickname failed", err);
      setError(err.message || "Failed to save nickname");
    }
  };

  return (
    <div className="nick-overlay">
      <div className="nick-card">
        {/* close button */}
        <button onClick={() => setModalOpen(false)} className="nick-close">
          ✖
        </button>

        <h2>Create Your Permanent Nickname</h2>
        <p>This name is locked to your wallet forever.</p>

        <input
          className="nick-input"
          placeholder="Enter nickname"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />

        {error && <div className="nick-error">{error}</div>}

        <button className="nick-submit" onClick={submit} disabled={loading}>
          {loading ? "Saving..." : "Save Name"}
        </button>
      </div>
    </div>
  );
}
