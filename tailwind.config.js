/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#020617",   // dark navy
        card: "#0f172a",         // slightly lighter
        accent: "#00eaff",       // neon cyan
        textlight: "#e2e8f0",    // light text
      },
    },
  },
  plugins: [],
};
