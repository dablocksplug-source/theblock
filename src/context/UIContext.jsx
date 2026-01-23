// src/context/UIContext.jsx
import React, { createContext, useContext, useMemo, useState } from "react";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // AdminConsole expects these:
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);

  const value = useMemo(
    () => ({
      // existing
      modalOpen,
      setModalOpen,
      drawerOpen,
      setDrawerOpen,

      // admin console
      isAdminOpen,
      toggleAdmin: () => setIsAdminOpen((v) => !v),

      // audio toggle
      isAudioOn,
      toggleAudio: () => setIsAudioOn((v) => !v),
      setIsAudioOn,
    }),
    [modalOpen, drawerOpen, isAdminOpen, isAudioOn]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
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

      isAdminOpen: false,
      toggleAdmin: () => {},

      isAudioOn: false,
      toggleAudio: () => {},
      setIsAudioOn: () => {},
    };
  }

  return ctx;
}
