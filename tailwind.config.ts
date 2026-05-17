import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Hanken Grotesk — humanist sans body face. Loaded in app/fonts.ts.
        // Used everywhere by default via the body selector in globals.css.
        sans: [
          'var(--font-body)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Source Serif 4 — display face for greetings + page H1s. Reach for
        // this with `font-display` only on titles where the bookish register
        // matters. Body, labels, eyebrows, buttons all stay sans.
        display: [
          'var(--font-display)',
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'serif',
        ],
      },
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
        "accent-primary": "var(--color-accent-primary)",
        "accent-primary-hover": "var(--color-accent-primary-hover)",
        "pill-violet": "var(--color-pill-violet-text)",
        "pill-amber": "var(--color-pill-amber-text)",
        "pill-inactive-border": "var(--color-pill-not-written-border)",
        "pill-inactive": "var(--color-pill-not-written-text)",
        "pill-rank1": "var(--color-pill-rank1-bg)",
        "on-pill-rank1": "var(--color-pill-rank1-text)",
        "pill-rank2": "var(--color-pill-rank2-bg)",
        "on-pill-rank2": "var(--color-pill-rank2-text)",
        "status-processing": "var(--color-status-processing)",
        "status-ready": "var(--color-status-ready)",
        "status-error": "var(--color-status-error)",
        "status-rail": "var(--color-status-rail)",
        "status-done": "var(--color-status-done)",
        "widget-cards-border": "var(--color-widget-cards-border)",
        "widget-cards-bg": "var(--color-widget-cards-bg)",
        "widget-cards-bg-hover": "var(--color-widget-cards-bg-hover)",
        "widget-cards-text": "var(--color-widget-cards-text)",
        "widget-write-border": "var(--color-widget-write-border)",
        "widget-write-bg": "var(--color-widget-write-bg)",
        "widget-write-bg-hover": "var(--color-widget-write-bg-hover)",
        "widget-write-text": "var(--color-widget-write-text)",
        "call-bg": "var(--color-call-bg)",
        "call-bg-hover": "var(--color-call-bg-hover)",
        "call-border": "var(--color-call-border)",
        "call-fill": "var(--color-call-fill)",
        "call-text": "var(--color-call-text)",
        "study-badge-bg": "var(--color-study-badge-bg)",
        "on-study-badge": "var(--color-study-badge-text)",
        scrim: "var(--color-scrim)",
      },
    },
  },
  plugins: [],
  safelist: [
    'transition-[grid-template-rows]',
  ],
};
export default config;
