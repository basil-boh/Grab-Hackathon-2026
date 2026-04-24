import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 23, 42, 0.14)",
      },
      colors: {
        coral: {
          600: "#df4f3f",
          700: "#c63f32",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
