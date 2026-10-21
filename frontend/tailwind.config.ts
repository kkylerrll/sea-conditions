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
        // 「清爽海灘」：沙白底、深海藍主色、珊瑚橘只做點綴
        sand: { DEFAULT: "#FBF8F3", 100: "#F4EFE6" },
        ocean: {
          50: "#EEF6FB",
          100: "#D9EAF4",
          200: "#B3D6E8",
          600: "#0B6FA4",
          700: "#095A86",
        },
        coral: { 400: "#F2785C", 700: "#B8442B" },
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
