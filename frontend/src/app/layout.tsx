import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "海況去不去 — 台灣潛點海況",
  description: "查台灣各潛點今天適不適合下水，AI 幫你把氣象數據翻成白話建議。",
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
        <div className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-6 sm:px-6">
          <header className="mb-6 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-2xl">🌊</span>
              <span className="text-lg font-bold text-slate-900">海況去不去</span>
            </a>
            <span className="rounded-full bg-sea-50 px-2.5 py-1 text-xs font-medium text-sea-700">
              MVP · 第一層
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
