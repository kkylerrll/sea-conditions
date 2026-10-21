"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { ACTIVITY_KIND_ZH, type ActivityKind } from "@/lib/sea";

interface Props {
  showActivityToggle: boolean;
  activity: ActivityKind;
  onActivityChange: (next: ActivityKind) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  mobileTriggerRef: RefObject<HTMLButtonElement>;
}

export default function Header({
  showActivityToggle,
  activity,
  onActivityChange,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onToggleMobile,
  mobileTriggerRef,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-ocean-100 bg-sand/90 backdrop-blur">
      <div
        className="flex h-14 w-full items-center gap-2 px-2 sm:px-4"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* 桌機：收合/展開側欄 */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展開側欄" : "收合側欄"}
          className="hidden h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500 lg:flex"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7.5 3.5v13" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {/* 手機：開啟側邊選單 */}
        <button
          ref={mobileTriggerRef}
          type="button"
          onClick={onToggleMobile}
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
          aria-label={mobileOpen ? "關閉選單" : "開啟選單"}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500 lg:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
            <path
              d="M2 15c2 0 2-1.6 4-1.6S8 15 10 15s2-1.6 4-1.6S16 15 18 15s2-1.6 4-1.6M2 19c2 0 2-1.6 4-1.6S8 19 10 19s2-1.6 4-1.6S16 19 18 19s2-1.6 4-1.6M6 9.5C6 6 8.5 4 12 4s5.5 2.4 5.5 5.5"
              stroke="#0B6FA4"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <span className="truncate text-base font-bold text-slate-900 sm:text-lg">海況去不去</span>
        </Link>

        <div className="ml-auto">
          {showActivityToggle && <ActivityToggle activity={activity} onChange={onActivityChange} />}
        </div>
      </div>
    </header>
  );
}

function ActivityToggle({
  activity,
  onChange,
}: {
  activity: ActivityKind;
  onChange: (next: ActivityKind) => void;
}) {
  const options: ActivityKind[] = ["dive", "surf"];

  return (
    <div
      role="radiogroup"
      aria-label="切換要看潛水還是衝浪的海況"
      className="inline-flex rounded-full border border-ocean-100 bg-sand-100 p-0.5"
    >
      {options.map((opt) => {
        const active = activity === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={`min-h-11 min-w-[64px] cursor-pointer rounded-full px-3 text-sm font-semibold outline-none transition-colors duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${
              active ? "bg-white text-ocean-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {ACTIVITY_KIND_ZH[opt]}
          </button>
        );
      })}
    </div>
  );
}
