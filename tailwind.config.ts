import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-elevated": "var(--color-surface-elevated)",
        border: "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-tertiary": "var(--color-text-tertiary)",
        "error-surface": "var(--color-error-bg)",
        "on-error-surface": "var(--color-error-text)",
        "error-container": "var(--color-error-container-bg)",
        correction: "var(--color-correction-text)",
        "accent-chip": "var(--color-chip-bg)",
        "accent-chip-border": "var(--color-chip-border)",
        "on-accent-chip": "var(--color-chip-text)",
        "accent-handle": "var(--color-accent-handle)",
        "pill-violet": "var(--color-pill-violet-text)",
        "pill-amber": "var(--color-pill-amber-text)",
        "pill-inactive-border": "var(--color-pill-not-written-border)",
        "pill-inactive": "var(--color-pill-not-written-text)",
        "pill-rank1": "var(--color-pill-rank1-bg)",
        "on-pill-rank1": "var(--color-pill-rank1-text)",
        "pill-rank2": "var(--color-pill-rank2-bg)",
        "on-pill-rank2": "var(--color-pill-rank2-text)",
      },
    },
  },
  plugins: [],
};
export default config;
