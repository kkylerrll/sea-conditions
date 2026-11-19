"use client";

// 地區頁「潛友實測」區塊（設計規格 docs/design/reports.md §4、§6）。
// summary 直接用 props 渲染，送出後 router.refresh() 會帶來新的 props；
// 只有「讀取失敗後按再試一次」才用 client 端抓到的值。

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReportForm from "@/components/ReportForm";
import { getReports } from "@/lib/api";
import { relativeDayWord, shortDateLabel, todayInTaipei } from "@/lib/format";
import { hasReported } from "@/lib/reported";
import { ACTIVITY_KIND_ZH, type ActivityKind, RATING_HEX, hasBothKinds, supportsActivity } from "@/lib/sea";
import type { ReportFeeling, ReportSummary } from "@/lib/types";

export const OPEN_REPORT_EVENT = "open-report-form";

const FEELING_META: Record<ReportFeeling, { label: string; tone: "green" | "yellow" | "red" }> = {
  good: { label: "好", tone: "green" },
  ok: { label: "普通", tone: "yellow" },
  bad: { label: "差", tone: "red" },
};
const FEELING_ORDER: ReportFeeling[] = ["good", "ok", "bad"];

const PRIMARY_BTN =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-abyss-800 px-5 text-sm font-bold text-white outline-none transition hover:bg-abyss-700 focus-visible:ring-2 focus-visible:ring-ocean-600 focus-visible:ring-offset-2 sm:w-auto";
const SECONDARY_BTN =
  "inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white px-4 text-sm font-semibold text-ocean-700 outline-none ring-1 ring-ocean-200 transition hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-ocean-600 disabled:cursor-wait";

export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function dayText(iso: string): string {
  const w = relativeDayWord(iso);
  return w === "今天" || w === "昨天" ? w : shortDateLabel(iso);
}

export default function ReportsSection({
  slug,
  name,
  activities,
  defaultActivity,
  summary,
  forecastVisibility,
}: {
  slug: string;
  name: string;
  activities: string[];
  defaultActivity: ActivityKind;
  summary: ReportSummary | null;
  forecastVisibility: number | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "form" | "success">("closed");
  const [formDay, setFormDay] = useState<"today" | "yesterday">("today");
  const [reportedToday, setReportedToday] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retried, setRetried] = useState<ReportSummary | null>(null);
  const [retryState, setRetryState] = useState<"idle" | "loading" | "failed">("idle");

  const sectionRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const summaryHeadingRef = useRef<HTMLParagraphElement>(null);

  const shown = retried ?? summary;
  const diveOk = supportsActivity(activities, "dive");
  const both = hasBothKinds(activities);
  const title = diveOk ? "潛友實測" : "浪友實測";

  useEffect(() => {
    setReportedToday(hasReported(slug, todayInTaipei()));
  }, [slug, mode]);

  function openForm(day: "today" | "yesterday" = "today") {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setFormDay(day);
    setMode("form");
  }

  // Hero 的「回報今天海況」透過自訂事件打開表單並捲過來
  useEffect(() => {
    function onOpen() {
      openForm("today");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sectionRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    window.addEventListener(OPEN_REPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_REPORT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (mode === "success") successRef.current?.focus();
  }, [mode]);

  function closeForm() {
    setMode("closed");
    const t = triggerRef.current;
    // 觸發按鈕在收合後可能還在（摘要卡上的按鈕會重新渲染），下一個 frame 再還焦點
    requestAnimationFrame(() => {
      if (t && document.contains(t)) t.focus();
      else summaryHeadingRef.current?.focus();
    });
  }

  async function retry() {
    setRetryState("loading");
    try {
      const s = await getReports(slug);
      setRetried(s);
      setRetryState("idle");
    } catch {
      setRetryState("failed");
    }
  }

  const reportButton =
    reportedToday && mode === "closed" ? (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 sm:mt-0">
        <p className="text-sm font-semibold text-emerald-700">✓ 你今天已經回報過這裡，謝謝！</p>
        <button
          type="button"
          onClick={() => openForm("yesterday")}
          className="min-h-11 cursor-pointer rounded text-sm font-semibold text-ocean-700 underline outline-none focus-visible:ring-2 focus-visible:ring-ocean-600"
        >
          回報昨天的？
        </button>
      </div>
    ) : mode === "closed" ? (
      <button type="button" onClick={() => openForm()} className={`${PRIMARY_BTN} mt-3 sm:mt-0`}>
        <PencilIcon />
        回報今天海況
      </button>
    ) : null;

  const subtitle = both ? "含潛水與衝浪 · 回報只供參考" : "回報只供參考";

  return (
    <section
      id="reports"
      ref={sectionRef}
      aria-labelledby="reports-title"
      className="scroll-mt-20 space-y-3"
    >
      <h2 id="reports-title" className="section-title">
        {title}
      </h2>

      {mode === "form" && (
        <ReportForm
          slug={slug}
          name={name}
          showActivity={both}
          defaultActivity={defaultActivity}
          defaultDay={formDay}
          onClose={closeForm}
          onSuccess={() => {
            setMode("success");
            setRetried(null);
            router.refresh();
          }}
        />
      )}

      {mode === "success" && (
        <div
          role="status"
          className="card-clean border-l-[6px] p-4 sm:p-6"
          style={{ borderLeftColor: RATING_HEX.green.base }}
        >
          <p ref={successRef} tabIndex={-1} className="text-base font-bold text-slate-900 outline-none">
            ✓ 謝謝！回報已收到
          </p>
          <p className="mt-1 text-sm text-slate-600">已經加進下方的近 7 天回報，其他人也看得到。</p>
          <button
            type="button"
            onClick={() => {
              setMode("closed");
              requestAnimationFrame(() => summaryHeadingRef.current?.focus());
            }}
            className={`${PRIMARY_BTN} mt-3`}
          >
            好
          </button>
        </div>
      )}

      <div className="card-clean p-4 sm:p-6">
        {!shown ? (
          <>
            <p ref={summaryHeadingRef} tabIndex={-1} className="text-sm text-slate-700 outline-none">
              {retryState === "failed" ? "還是讀不到，請稍後再試。" : "暫時讀不到實測回報。"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={retry}
                disabled={retryState === "loading"}
                aria-busy={retryState === "loading" || undefined}
                className={SECONDARY_BTN}
              >
                {retryState === "loading" ? "讀取中…" : "再試一次"}
              </button>
              {mode === "closed" && (
                <button type="button" onClick={() => openForm()} className={PRIMARY_BTN}>
                  <PencilIcon />
                  回報今天海況
                </button>
              )}
            </div>
          </>
        ) : shown.count === 0 ? (
          <>
            <p ref={summaryHeadingRef} tabIndex={-1} className="text-base font-bold text-slate-900 outline-none">
              近 7 天還沒有人回報
            </p>
            <p className="mt-1 text-sm text-slate-600">今天下過水嗎？當第一個回報的人。</p>
            {reportButton && <div className="mt-3 [&>*]:mt-0">{reportButton}</div>}
          </>
        ) : (
          <SummaryBody
            summary={shown}
            subtitle={subtitle}
            diveOk={diveOk}
            forecastVisibility={forecastVisibility}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            headingRef={summaryHeadingRef}
            action={reportButton}
          />
        )}
      </div>
    </section>
  );
}

function SummaryBody({
  summary,
  subtitle,
  diveOk,
  forecastVisibility,
  expanded,
  onToggleExpanded,
  headingRef,
  action,
}: {
  summary: ReportSummary;
  subtitle: string;
  diveOk: boolean;
  forecastVisibility: number | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  headingRef: React.RefObject<HTMLParagraphElement>;
  action: React.ReactNode;
}) {
  const { count, by_feeling, avg_visibility_m, recent } = summary;
  const list = expanded ? recent : recent.slice(0, 3);

  return (
    <>
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p ref={headingRef} tabIndex={-1} className="text-base font-bold text-slate-900 outline-none">
            近 7 天 <span className="tabular-nums">{count}</span> 則回報
          </p>
          <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
        </div>
        {action}
      </div>

      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {FEELING_ORDER.map((f) =>
          by_feeling[f] > 0 ? (
            <span
              key={f}
              style={{ width: `${(by_feeling[f] / count) * 100}%`, background: RATING_HEX[FEELING_META[f].tone].base }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
        {FEELING_ORDER.map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: RATING_HEX[FEELING_META[f].tone].base }}
              aria-hidden="true"
            />
            {FEELING_META[f].label} <span className="font-bold tabular-nums">{by_feeling[f]}</span>
          </li>
        ))}
      </ul>

      {diveOk && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className={`rounded-xl bg-ocean-50 px-3 py-2 ${forecastVisibility == null ? "col-span-2" : ""}`}>
            <p className="text-xs text-slate-600">實測平均能見度</p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">
              {avg_visibility_m == null ? "—" : Math.round(avg_visibility_m)}
              {avg_visibility_m != null && <span className="text-sm font-semibold text-slate-600"> m</span>}
            </p>
            {avg_visibility_m == null && <p className="text-xs text-slate-600">還沒有人回報能見度</p>}
          </div>
          {forecastVisibility != null && (
            <div className="rounded-xl bg-ocean-50 px-3 py-2">
              <p className="text-xs text-slate-600">預報推估（今天）</p>
              <p className="text-2xl font-extrabold tabular-nums text-slate-900">
                {Math.round(forecastVisibility)}
                <span className="text-sm font-semibold text-slate-600"> m</span>
              </p>
            </div>
          )}
        </div>
      )}

      <p className="mt-5 text-sm font-bold text-slate-900">最近回報</p>
      <ul className="mt-2 divide-y divide-ocean-100">
        {list.map((r, i) => {
          const c = RATING_HEX[FEELING_META[r.feeling].tone];
          return (
            <li key={`${r.created_at}-${i}`} className="py-3">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: c.soft, color: c.text }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.base }} aria-hidden="true" />
                  {FEELING_META[r.feeling].label}
                </span>
                <span className="font-semibold text-slate-800">{ACTIVITY_KIND_ZH[r.activity]}</span>
                <span className="text-slate-600">· {dayText(r.date)}</span>
                {r.activity === "dive" && r.visibility_m != null && (
                  <span className="tabular-nums text-slate-600">· 能見度 {r.visibility_m} m</span>
                )}
              </p>
              {r.note && <p className="mt-1 break-words text-sm leading-relaxed text-slate-700">{r.note}</p>}
            </li>
          );
        })}
      </ul>
      {recent.length > 3 && (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="min-h-11 cursor-pointer rounded text-sm font-semibold text-ocean-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ocean-600"
        >
          {expanded ? "收起" : `看全部 ${recent.length} 則`}
        </button>
      )}
      {expanded && count > recent.length && <p className="text-xs text-slate-600">只列出最近 10 則。</p>}
    </>
  );
}
