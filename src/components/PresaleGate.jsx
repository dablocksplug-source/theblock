import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PRESALE_MODE, PRESALE_ALLOWLIST } from "../config/presale.config";

export default function PresaleGate({ children }) {
  const location = useLocation();

  if (!PRESALE_MODE) return children;

  // normalize path (no trailing slash)
  const path = location.pathname.replace(/\/+$/, "") || "/";

  // ✅ Always allow BlockSwap (otherwise you redirect to yourself forever)
  if (path === "/blockswap") return children;

  const allowed =
    PRESALE_ALLOWLIST.has(path) ||
    Array.from(PRESALE_ALLOWLIST).some((p) => p !== "/" && path.startsWith(p + "/"));

  if (allowed) return children;

  return <Navigate to="/blockswap" replace />;
}
