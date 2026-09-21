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
