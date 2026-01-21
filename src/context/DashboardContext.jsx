import React, { createContext, useState, useEffect, useContext } from "react";

const DashboardContext = createContext();

export function DashboardProvider({ children }) {
  const [data, setData] = useState({
    balance: 2314,
    volume: 1.25,
    transactions: 34,
    credit: 2400,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      // simulate live updates
      setData(prev => ({
        ...prev,
        balance: +(prev.balance + (Math.random() - 0.5) * 5).toFixed(2),
        volume: +(prev.volume + (Math.random() - 0.5) * 0.05).toFixed(2),
        transactions: prev.transactions + Math.floor(Math.random() * 2),
        credit: +(prev.credit + (Math.random() - 0.5) * 10).toFixed(2),
      }));
    }, 4000); // update every 4 s

    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardContext.Provider value={data}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
