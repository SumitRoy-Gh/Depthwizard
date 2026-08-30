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
        void: "#05060A",
        stage: "#0B0E14",
        elevated: "#11151F",
        rim: "#1F2530",
        hairline: "#1A1F2A",
        primary: "#F4F6FA",
        muted: "#9AA3B2",
        faint: "#5A6478",
        cyan: {
          DEFAULT: "#22D3EE",
          glow: "#67E8F9",
          deep: "#0891B2",
        },
        amber: {
          DEFAULT: "#F59E0B",
          glow: "#FCD34D",
          deep: "#B45309",
        },
        emerald: {
          DEFAULT: "#10B981",
          glow: "#6EE7B7",
          deep: "#047857",
        },
        rose: {
          DEFAULT: "#F43F5E",
          glow: "#FB7185",
          deep: "#BE123C",
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