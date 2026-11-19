"use client";

// 地區頁 hero 裡的回報入口（docs/design/reports.md §1 A、§4.2）。
// 按鈕是 <a href="#reports">：有 JS 時改發事件讓下方區塊展開表單；沒 JS 時退回錨點跳轉。

import { OPEN_REPORT_EVENT, PencilIcon } from "@/components/ReportsSection";

export function ReportHeroButton() {
  return (
    <a
      href="#reports"
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(OPEN_REPORT_EVENT));
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/12 px-5 py-1.5 text-sm font-bold text-white outline-none ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
    >
      <PencilIcon />
      回報今天海況
    </a>
  );
}

export function ReportHeroCount({ count }: { count: number }) {
  return (
    <a
      href="#reports"
      className="inline-flex min-h-11 basis-full items-center rounded text-sm font-semibold text-lagoon-300 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white"
    >
      近 7 天 {count} 則實測回報
      <span aria-hidden="true">&nbsp;↓</span>
    </a>
  );
}
