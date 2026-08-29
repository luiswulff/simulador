import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Padrão TaxCo Executive — Dark Mode Premium
        ink: {
          950: "#0B0F17", // background primário
          900: "#0E1420",
          800: "#131B2E", // cards
          700: "#1E293B", // bordas
          600: "#2A3A52",
        },
        gold: {
          DEFAULT: "#D4AF37",
          soft: "#E7C765",
          deep: "#8C7223",
        },
        exec: {
          DEFAULT: "#3B82F6",
          soft: "#60A5FA",
          deep: "#1D4ED8",
        },
        emeraldx: {
          DEFAULT: "#10B981",
          soft: "#34D399",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 20px 60px -30px rgba(0,0,0,0.9)",
        glow: "0 0 0 1px rgba(212,175,55,0.35), 0 12px 40px -18px rgba(212,175,55,0.45)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
