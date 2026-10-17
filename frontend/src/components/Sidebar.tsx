"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { ACTIVITY_KIND_ZH, type ActivityKind, RATING_HEX, ratingFor, supportsActivity } from "@/lib/sea";
import type { Location } from "@/lib/types";

interface Props {
  locations: Location[];
  activity: ActivityKind;
  pathname: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  mobileTriggerRef: RefObject<HTMLButtonElement>;
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 9.5 10 3l7 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8.5V16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7 4 3 5.5v11L7 15l6 2 4-1.5v-11L13 6 7 4Zm0 0v11m6-9v11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavRow({
  href,
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      title={collapsed ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
    </Link>
  );
}

function RegionList({
  locations,
  activity,
  pathname,
  collapsed,
  onNavigate,
}: {
  locations: Location[];
  activity: ActivityKind;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const visible = locations.filter((loc) => supportsActivity(loc.activities, activity));

  return (
    <ul className="space-y-0.5">
      {visible.map((loc) => {
        const c = RATING_HEX[ratingFor(loc.today, activity)];
        const href = `/spots/${loc.slug}`;
        const active = pathname === href;
        return (
          <li key={loc.slug}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? loc.name : undefined}
              className={`flex min-h-11 items-center gap-2.5 rounded-lg text-sm outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                collapsed ? "justify-center px-0" : "px-3"
              } ${active ? "bg-sky-50 font-semibold text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                style={{ background: c.base }}
                aria-hidden="true"
              />
              {collapsed ? (
                <span className="sr-only">
                  {loc.name}，{ACTIVITY_KIND_ZH[activity]}{c.label}
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">{loc.name}</span>
                  <span className="shrink-0 text-xs text-slate-400" style={{ color: c.text }}>
                    {c.label}
                  </span>
                </>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Sidebar({
  locations,
  activity,
  pathname,
  collapsed,
  mobileOpen,
  onCloseMobile,
  mobileTriggerRef,
}: Props) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);
  const mounted = useRef(false);

  // 開關 drawer 時搬焦點：開 → 抓到第一個可聚焦元素；關 → 還給觸發按鈕。
  // 第一次 mount（mobileOpen 一開始就是 false）不要搶焦點。
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (mobileOpen) {
      firstLinkRef.current?.focus();
    } else {
      mobileTriggerRef.current?.focus();
    }
  }, [mobileOpen, mobileTriggerRef]);

  useEffect(() => {
    if (!mobileOpen) return;
    try {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    } catch {
      return;
    }
  }, [mobileOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseMobile();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusables || focusables.length === 0) return;
      const list = Array.from(focusables);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onCloseMobile],
  );

  const navItems = (collapsedMode: boolean, onNavigate?: () => void) => (
    <>
      <nav className="space-y-0.5 px-2" aria-label="主要導覽">
        <NavRow href="/" icon={<HomeIcon />} label="首頁" active={pathname === "/"} collapsed={collapsedMode} onClick={onNavigate} />
        <NavRow
          href="/explore"
          icon={<MapIcon />}
          label="探索地圖"
          active={pathname === "/explore"}
          collapsed={collapsedMode}
          onClick={onNavigate}
        />
      </nav>
      <div className="mt-3 border-t border-slate-100 px-2 pt-3">
        {!collapsedMode && (
          <p className="px-3 pb-1.5 text-xs font-semibold text-slate-400">
            13 個地區 · {ACTIVITY_KIND_ZH[activity]}
          </p>
        )}
        <RegionList
          locations={locations}
          activity={activity}
          pathname={pathname}
          collapsed={collapsedMode}
          onNavigate={onNavigate}
        />
      </div>
    </>
  );

  return (
    <>
      {/* 桌機：常駐側欄，可收合成窄圖示列 */}
      <aside
        className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-3 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block ${
          collapsed ? "w-[4.5rem]" : "w-60"
        }`}
        aria-label="側邊選單"
      >
        {navItems(collapsed)}
      </aside>

      {/* 手機：off-canvas 抽屜 + 遮罩 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <div
        id="mobile-sidebar"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="側邊選單"
        onKeyDown={handleKeyDown}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto bg-white py-3 shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="mb-1 flex items-center justify-between px-3">
          <span className="text-sm font-bold text-slate-900">選單</span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="關閉選單"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-400 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* 讓第一個連結可以被 focus ref 抓到 */}
        <FirstLinkCapture innerRef={firstLinkRef}>{navItems(false, onCloseMobile)}</FirstLinkCapture>
      </div>
    </>
  );
}

// 把第一個渲染出來的 <a> 抓進 ref，開 drawer 時焦點移過去。
function FirstLinkCapture({
  innerRef,
  children,
}: {
  innerRef: RefObject<HTMLAnchorElement>;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const a = wrapRef.current?.querySelector<HTMLAnchorElement>("a[href]");
    (innerRef as React.MutableRefObject<HTMLAnchorElement | null>).current = a ?? null;
  });
  return <div ref={wrapRef}>{children}</div>;
}
