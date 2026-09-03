import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang TC"',
          '"Noto Sans TC"',
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        sea: {
          50: "#eff9ff",
          100: "#dff2ff",
          200: "#b8e6fe",
          300: "#7cd3fd",
          400: "#36bffa",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
