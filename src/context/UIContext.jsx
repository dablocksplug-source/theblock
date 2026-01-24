import React, { createContext, useContext, useMemo, useState } from "react";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const value = useMemo(
    () => ({
      modalOpen,
      setModalOpen,
      drawerOpen,
      setDrawerOpen,
    }),
    [modalOpen, drawerOpen]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);

  // Safe fallback (won’t crash if someone forgets to wrap provider)
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
