// src/net/diceClient.js
import { io } from "socket.io-client";

let socket;
let currentUrl;

export function getDiceSocket(serverUrl) {
  // If URL changes, fully reset socket
  if (socket && currentUrl && currentUrl !== serverUrl) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }

  if (!socket) {
    currentUrl = serverUrl;

    socket = io(serverUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 8000,
    });

    // helpful logs
    socket.on("connect", () => console.log("✅ dice socket connected", socket.id));
    socket.on("disconnect", (r) => console.log("⚠️ dice socket disconnected", r));
    socket.on("connect_error", (e) => console.log("❌ dice socket connect_error", e?.message || e));
    socket.on("reconnect_attempt", (n) => console.log("↻ dice socket reconnect_attempt", n));
  }

  return socket;
}
