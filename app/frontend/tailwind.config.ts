import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "rgb(var(--tw-void) / <alpha-value>)",
        stage: "rgb(var(--tw-stage) / <alpha-value>)",
        elevated: "rgb(var(--tw-elevated) / <alpha-value>)",
        rim: "rgb(var(--tw-rim) / <alpha-value>)",
        hairline: "rgb(var(--tw-hairline) / <alpha-value>)",
        primary: "rgb(var(--tw-primary) / <alpha-value>)",
        muted: "rgb(var(--tw-muted) / <alpha-value>)",
        faint: "rgb(var(--tw-faint) / <alpha-value>)",
        cyan: {
          DEFAULT: "rgb(var(--tw-cyan) / <alpha-value>)",
          glow: "rgb(var(--tw-cyan-glow) / <alpha-value>)",
          deep: "rgb(var(--tw-cyan-deep) / <alpha-value>)",
        },
        amber: {
          DEFAULT: "rgb(var(--tw-amber) / <alpha-value>)",
          glow: "rgb(var(--tw-amber-glow) / <alpha-value>)",
          deep: "rgb(var(--tw-amber-deep) / <alpha-value>)",
        },
        emerald: {
          DEFAULT: "rgb(var(--tw-emerald) / <alpha-value>)",
          glow: "rgb(var(--tw-emerald-glow) / <alpha-value>)",
          deep: "rgb(var(--tw-emerald-deep) / <alpha-value>)",
        },
        rose: {
          DEFAULT: "rgb(var(--tw-rose) / <alpha-value>)",
          glow: "rgb(var(--tw-rose-glow) / <alpha-value>)",
          deep: "rgb(var(--tw-rose-deep) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": "0.6875rem",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      animation: {
        "spin-slow": "spin 24s linear infinite",
        "spin-slower": "spin 60s linear infinite",
        "pulse-glow": "pulseGlow 2.4s ease-in-out infinite",
        "shimmer": "shimmer 2.4s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "rise": "rise 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "scan": "scan 3s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.5", filter: "blur(8px)" },
          "50%": { opacity: "1", filter: "blur(16px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(34,211,238,0.35)",
        "glow-amber": "0 0 24px -4px rgba(245,158,11,0.35)",
        "glow-emerald": "0 0 24px -4px rgba(16,185,129,0.35)",
        ring: "inset 0 0 0 1px rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;