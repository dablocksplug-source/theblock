// src/components/NicknameModal.jsx
import React, { useEffect, useState } from "react";
import { useNicknameContext } from "../context/NicknameContext";
import "./NicknameModal.css";

export default function NicknameModal() {
  const { modalOpen, setModalOpen, saveNickname, loading } = useNicknameContext();

  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // ✅ reset when opening
  useEffect(() => {
    if (modalOpen) {
      setName("");
      setError("");
    }
  }, [modalOpen]);

  if (!modalOpen) return null;

  const submit = async () => {
    setError("");

    const trimmed = String(name || "").trim();
    if (trimmed.length < 3) {
      setError("Name must be at least 3 characters.");
      return;
    }

    try {
      await saveNickname(trimmed);
      setName("");
      setModalOpen(false);
    } catch (err) {
      console.error("[NicknameModal] saveNickname failed", err);
      setError(err?.message || "Failed to save nickname");
    }
  };

  return (
    <div className="nick-overlay">
      <div className="nick-card">
        <button
          onClick={() => setModalOpen(false)}
          className="nick-close"
          disabled={loading}
          aria-label="Close"
        >
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
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={loading}
        />

        {error && <div className="nick-error">{error}</div>}

        <button className="nick-submit" onClick={submit} disabled={loading}>
          {loading ? "Saving..." : "Save Name"}
        </button>
      </div>
    </div>
  );
}
