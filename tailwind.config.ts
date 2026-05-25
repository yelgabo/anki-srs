import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:           "var(--bg)",
        surface:      "var(--surface)",
        "surface-2":  "var(--surface-2)",
        border:       "var(--border)",
        "border-hi":  "var(--border-hi)",
        fg:           "var(--fg)",
        "fg-2":       "var(--fg-2)",
        "fg-3":       "var(--fg-3)",
        "fg-4":       "var(--fg-4)",
        accent:       "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-fg":  "var(--accent-fg)",
        "accent-dim": "var(--accent-dim)",
        warn:         "var(--warn)",
        danger:       "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      maxWidth: {
        column: "640px",
        wide: "768px",
      },
    },
  },
  plugins: [],
};

export default config;
