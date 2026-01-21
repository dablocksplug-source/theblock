// src/context/UIContext.jsx
import React, { createContext, useContext, useState } from "react";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const value = {
    modalOpen,
    setModalOpen,
    drawerOpen,
    setDrawerOpen,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);

  // Prevent crashes during StrictMode early renders
  if (!ctx) {
    return {
      modalOpen: false,
      setModalOpen: () => {},
      drawerOpen: false,
      setDrawerOpen: () => {},
    };
  }

  return ctx;
}
