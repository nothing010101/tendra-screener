import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0B0D08",
        panel: "#15130C",
        line: "#2A2717",
        acid: "#FFC72C",
        acid2: "#FF9F1C",
        bear: "#ff5d5d",
        ink: "#F3EED9",
        muted: "#A8A290",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,199,44,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,199,44,0.05) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
