// src/components/ConstructionGate.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";

// ✅ Only these routes are allowed in production right now
const ALLOWLIST = new Set(["/", "/blockswap"]);

export default function ConstructionGate({ children }) {
  const location = useLocation();

  // normalize (remove trailing slash)
  const path = location.pathname.replace(/\/+$/, "") || "/";

  // allow exact matches + subroutes under /blockswap if you ever add them
  const allowed =
    ALLOWLIST.has(path) ||
    Array.from(ALLOWLIST).some((p) => p !== "/" && path.startsWith(p + "/"));

  if (allowed) return children;

  // everything else goes to BlockSwap (or "/" if you prefer)
  return <Navigate to="/blockswap" replace />;
}
