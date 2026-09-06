import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "海況去不去 — 台灣潛點海況",
  description: "查台灣各潛點與衝浪點今天適不適合下水，把氣象數據畫成看得懂的海況圖。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "海況去不去", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0284c7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div
          className="mx-auto min-h-screen max-w-5xl px-4 pt-6 sm:px-6"
          style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <header className="mb-6 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 15c2 0 2-1.6 4-1.6S8 15 10 15s2-1.6 4-1.6S16 15 18 15s2-1.6 4-1.6M2 19c2 0 2-1.6 4-1.6S8 19 10 19s2-1.6 4-1.6S16 19 18 19s2-1.6 4-1.6M6 9.5C6 6 8.5 4 12 4s5.5 2.4 5.5 5.5"
                  stroke="#0284c7"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-lg font-bold text-slate-900">海況去不去</span>
            </a>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              台灣潛點 · MVP
            </span>
          </header>
          {children}
          <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
            海況資料僅供參考，下水前請以現場狀況與官方沿岸預報為準。
          </footer>
        </div>
      </body>
    </html>
  );
}
