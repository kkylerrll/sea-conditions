"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useActivity } from "@/lib/useActivity";
import type { Location } from "@/lib/types";

const COLLAPSE_KEY = "sea-conditions:sidebar-collapsed";

export default function AppChrome({
  locations,
  children,
}: {
  locations: Location[];
  children: React.ReactNode;
}) {
  const [activity, setActivity] = useActivity();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  // 桌機收合狀態存 localStorage；私密瀏覽模式可能整個 throw，包 try/catch。
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // 忽略：私密瀏覽或被封鎖時就用預設（展開）
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // 忽略
      }
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // 換頁（含點側欄連結）就把手機抽屜收起來
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const showActivityToggle = pathname === "/explore" || pathname.startsWith("/spots/");
  // 首頁是唯一「捲到底部還是深色海底場景」的路由：內容區的背景與頁尾都要換成
  // 深色版本，才不會在深海場景結束後露出一大塊淺色空白。用路由判斷，不動其他頁。
  const isLanding = pathname === "/";

  // 首頁不要 Header/Sidebar：整頁滿版捲動敘事本身就是導覽，唯一常駐的導覽是
  // 頁面自己掛的 StickyLandingCta（fixed 定位、不依賴 Header 的高度或存在）。
  // 其他路由完全不受影響，兩個元件照常渲染。
  if (isLanding) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="min-h-screen bg-[#020617]">
          {children}
          {/* 首頁 3D 場景裡的潛水員與各種生物是 CC BY 4.0 授權的 Sketchfab 模型，
              授權條款要求標示作者，這一行不能省；完整清單見
              public/landing/CREDITS.md（跟 dive/models.ts 的 MODEL_REGISTRY
              對得上）。 */}
          <footer className="landing-footer mx-auto mt-12 max-w-5xl border-t pt-6 text-center text-xs">
            <p>海況資料僅供參考，下水前請以現場狀況與官方沿岸預報為準。</p>
            <p className="mt-2 opacity-70">
              首頁 3D 模型：ucdavisterc、LasquetiSpice、1shxxn、DigitalLife3D、sharkingaround、
              Abby_Holzworth1、n-（CC BY 4.0），來源 Sketchfab。
            </p>
            <p className="mt-1 opacity-70">
              海面：Ocean · WebGPU by hirakujira (CodePen, MIT)。
            </p>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        showActivityToggle={showActivityToggle}
        activity={activity}
        onActivityChange={setActivity}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onToggleMobile={toggleMobile}
        mobileTriggerRef={mobileTriggerRef}
      />
      {/* 側欄靠左貼齊視窗邊緣，內容區吃掉剩下的寬度；寬度上限改成各頁面自己決定
          （/explore 要滿版、/spots/[slug] 要維持可讀寬度），這裡不再整體置中裁切。 */}
      <div className="flex w-full flex-1">
        <Sidebar
          locations={locations}
          activity={activity}
          pathname={pathname}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={closeMobile}
          mobileTriggerRef={mobileTriggerRef}
        />
        <div className="min-w-0 flex-1">
          <div
            className="min-h-[calc(100vh-3.5rem)] px-4 pt-6 sm:px-6 lg:px-8"
            style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
          >
            {children}
            <footer className="mx-auto mt-12 max-w-5xl border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
              海況資料僅供參考，下水前請以現場狀況與官方沿岸預報為準。
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
