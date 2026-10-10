import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // One gray family, faintly green-tinted to sit with the accent.
        ink: {
          950: "#0A0B0A",
          900: "#111311",
          850: "#171A17",
          800: "#222622",
          700: "#323732",
          600: "#474D47",
          /**
           * The lightest gray still permitted to carry text.
           *
           * ink-600 measured 2.15:1 on ink-900, so every step number, sidebar
           * label and link arrow drawn in it failed WCAG AA at 4.5:1 by more
           * than half. It looked deliberate, which is what made it durable:
           * "subtle" reads as an intentional tier until someone measures it.
           *
           * Lightened along the same hue (green stays 6 above red) until it
           * clears AA on every background it is used against: 5.22 on ink-950,
           * 4.95 on ink-900, 4.65 on ink-850. Worst-case headroom +0.15.
           *
           * ink-600 is kept for non-text marks only, where 3:1 applies and
           * nothing is being read.
           */
          500: "#7F857F",
        },
        paper: "#ECEEE9",
        muted: "#959C94",
        // Phosphor green, desaturated so it reads as signal, not neon.
        moss: "#8BD99A",
        amberish: "#E8B35A",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        blink: "blink 1.1s steps(1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
