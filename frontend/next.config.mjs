/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 可用 NEXT_DIST_DIR 指定別的輸出目錄，讓 build 不去動 dev server 正在用的 .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
