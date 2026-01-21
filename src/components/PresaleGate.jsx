// src/components/PresaleGate.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PRESALE_MODE, PRESALE_ALLOWLIST } from "../config/presale.config";

export default function PresaleGate({ children }) {
  const location = useLocation();

  if (!PRESALE_MODE) return children;

  // normalize path (no trailing slash)
  const path = location.pathname.replace(/\/+$/, "") || "/";

  const allowed =
    PRESALE_ALLOWLIST.has(path) ||
    Array.from(PRESALE_ALLOWLIST).some((p) => p !== "/" && path.startsWith(p + "/"));

  if (allowed) return children;

  // If muted, redirect everyone to BlockSwap (or "/" if you prefer)
  return <Navigate to="/blockswap" replace />;
}
