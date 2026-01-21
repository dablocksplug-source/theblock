// src/hooks/useDiceTable.js
import { useEffect, useMemo, useRef, useState } from "react";
import { getDiceSocket } from "../net/diceClient";

export function useDiceTable({ serverUrl, tableId, minBet }) {
  const socket = useMemo(() => getDiceSocket(serverUrl), [serverUrl]);
  const [state, setState] = useState(null);
  const hbRef = useRef(null);

  useEffect(() => {
    if (!tableId) return;

    const join = () => {
      socket.emit("table:join", { tableId, minBet });
    };

    const onState = (next) => setState(next);

    // initial join
    join();

    // listen for state
    socket.on("table:state", onState);

    // if socket reconnects, re-join automatically
    socket.on("connect", join);

    // heartbeat
    hbRef.current = setInterval(() => {
      socket.emit("table:heartbeat", { tableId });
    }, 5000);

    return () => {
      socket.off("table:state", onState);
      socket.off("connect", join);
      if (hbRef.current) clearInterval(hbRef.current);
      socket.emit("seat:release", { tableId });
    };
  }, [socket, tableId, minBet]);

  const actions = useMemo(
    () => ({
      claimSeat: (seat) => socket.emit("seat:claim", { tableId, seat }),
      releaseSeat: () => socket.emit("seat:release", { tableId }),
      placeBet: ({ seat, amount, side }) =>
        socket.emit("bet:place", { tableId, seat, amount, side }),
      roll: ({ seat }) => socket.emit("roll:request", { tableId, seat }),
    }),
    [socket, tableId]
  );

  return { state, actions };
}
