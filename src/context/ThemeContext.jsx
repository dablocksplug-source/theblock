// src/context/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");

  // Load from localStorage safely
  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored) setTheme(stored);
    } catch (err) {
      console.warn("Theme load failed:", err);
    }
  }, []);

  // Save to localStorage safely
  useEffect(() => {
    try {
      localStorage.setItem("theme", theme);
    } catch (err) {
      console.warn("Theme save failed:", err);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);

  // Safe fallback in StrictMode first render
  if (!ctx) {
    return {
      theme: "dark",
      toggleTheme: () => {},
    };
  }

  return ctx;
}
