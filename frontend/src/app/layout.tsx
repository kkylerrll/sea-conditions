import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AppChrome from "@/components/AppChrome";
import { getLocations } from "@/lib/api";
import type { Location } from "@/lib/types";
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

// 側欄要用到地區清單（連結 + 當日燈號），在這裡（server component）抓一次
// 往下傳給 client 的 AppChrome／Sidebar，側欄本身不再自己發 client fetch。
// 跟 /explore、/spots/[slug] 各自的 fetch 是同一支 API，Next 在同一次
// render 內會自動去重，不會真的打兩次後端。
async function fetchSidebarLocations(): Promise<Location[]> {
  try {
    return await getLocations();
  } catch {
    return [];
  }
}

function ChromeFallback({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen px-4 pt-6 sm:px-6"
      style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locations = await fetchSidebarLocations();

  return (
    <html lang="zh-Hant">
      <body>
        {/* AppChrome 用 useSearchParams 讀 ?activity=，Next 14 要求外層要有 Suspense */}
        <Suspense fallback={<ChromeFallback>{children}</ChromeFallback>}>
          <AppChrome locations={locations}>{children}</AppChrome>
        </Suspense>
      </body>
    </html>
  );
}
