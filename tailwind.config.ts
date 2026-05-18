import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        "tid-green": "var(--green)",
        "tid-red": "var(--red)",
        "card": "var(--bg-secondary)",
        "border-subtle": "var(--border)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "grid-pattern": "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
      },
      animation: {
        "slide-in": "slide-in 0.35s cubic-bezier(.21,1.02,.73,1) both",
        "shrink": "shrink 8s linear forwards",
        "fade-in": "fade-in 0.3s ease both",
        "live-pulse": "live-pulse 2s ease-in-out infinite",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
