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
      boxShadow: {
        // 分層柔和陰影：近處一層細、遠處一層大而淡
        soft: "0 1px 2px rgba(9,90,134,0.06), 0 4px 12px rgba(9,90,134,0.07), 0 12px 32px rgba(9,90,134,0.06)",
        lift: "0 2px 4px rgba(9,90,134,0.08), 0 10px 24px rgba(9,90,134,0.12), 0 24px 48px rgba(9,90,134,0.12)",
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
        // 深海藍：hero 與地圖面板用
        abyss: { 700: "#0A4A73", 800: "#073B5E", 900: "#052A45" },
        lagoon: { 300: "#6FD0E6", 400: "#38BCD9", 500: "#1AA3C6" },
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
