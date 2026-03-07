// src/App.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";

import SoundToggle from "./components/SoundToggle";
import LayoutWrapper from "./layout/LayoutWrapper.jsx";

import { ThemeProvider } from "./context/ThemeContext.jsx";
import { UIProvider } from "./context/UIContext.jsx";

import PresaleGate from "./components/PresaleGate";

export default function App() {
  return (
    <ThemeProvider>
      <UIProvider>
        <LayoutWrapper>
          <SoundToggle />
          <PresaleGate>
            <Outlet />
          </PresaleGate>
          <Analytics />
        </LayoutWrapper>
      </UIProvider>
    </ThemeProvider>
  );
}
