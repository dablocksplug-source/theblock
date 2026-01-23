// src/components/PresaleGate.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PRESALE_MODE, PRESALE_ALLOWLIST } from "../config/presale.config.js";

export default function PresaleGate({ children }) {
  const location = useLocation();

  // If not in presale/under-construction mode, allow everything
  if (!PRESALE_MODE) return children;

  // normalize path (no trailing slash)
  const path = location.pathname.replace(/\/+$/, "") || "/";

  // allow exact matches + any nested routes under allowed parents
  const allowed =
    PRESALE_ALLOWLIST.has(path) ||
    Array.from(PRESALE_ALLOWLIST).some((p) => p !== "/" && path.startsWith(p + "/"));

  if (allowed) return children;

  // 🚧 Everything else goes back to BlockSwap
  return <Navigate to="/blockswap" replace />;
}
