"use client";

// 實測回報表單（設計規格 docs/design/reports.md §5、§6.2）。
// 必填只有「整體感覺」；活動、日期有預設；能見度是固定檔位；備註收起來。

import { useEffect, useRef, useState } from "react";
import { postReport } from "@/lib/api";
import { isoPlusDays, shortDateLabel, todayInTaipei } from "@/lib/format";
import { markReported } from "@/lib/reported";
import { ACTIVITY_KIND_ZH, type ActivityKind, RATING_HEX } from "@/lib/sea";
import type { ReportFeeling, ReportInput } from "@/lib/types";

type DayChoice = "today" | "yesterday";

const FEELINGS: { value: ReportFeeling; label: string; hint: string; tone: "green" | "yellow" | "red" }[] = [
  { value: "good", label: "好", hint: "值得跑一趟", tone: "green" },
  { value: "ok", label: "普通", hint: "能下，不算理想", tone: "yellow" },
  { value: "bad", label: "差", hint: "不如不來", tone: "red" },
];

const VIS_STEPS: { value: number; label: string; short: string }[] = [
  { value: 2, label: "≤2", short: "≤2" },
  { value: 5, label: "5", short: "5" },
  { value: 8, label: "8", short: "8" },
  { value: 10, label: "10", short: "10" },
  { value: 15, label: "15", short: "15" },
  { value: 20, label: "20", short: "20" },
  { value: 25, label: "25", short: "25" },
  { value: 30, label: "30 以上", short: "30+" },
];

const CHIP =
  "flex cursor-pointer items-center justify-center rounded-xl px-3 text-sm font-semibold ring-1 transition peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-600 peer-focus-visible:ring-offset-2";
const CHIP_OFF = "bg-white text-ocean-700 ring-ocean-200 hover:bg-ocean-50";
const CHIP_ON = "bg-abyss-800 text-white ring-abyss-800";

type ErrorKind = 409 | 429 | 422 | 0;

export default function ReportForm({
  slug,
  name,
  showActivity,
  defaultActivity,
  defaultDay = "today",
  onClose,
  onSuccess,
}: {
  slug: string;
  name: string;
  showActivity: boolean;
  defaultActivity: ActivityKind;
  defaultDay?: DayChoice;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [activity, setActivity] = useState<ActivityKind>(defaultActivity);
  const [day, setDay] = useState<DayChoice>(defaultDay);
  const [feeling, setFeeling] = useState<ReportFeeling | null>(null);
  const [vis, setVis] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [baseDate, setBaseDate] = useState(() => todayInTaipei());
  const [feelingError, setFeelingError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ kind: ErrorKind; day: DayChoice; activity: ActivityKind } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const firstFeelingRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const yesterday = isoPlusDays(baseDate, -1);

  function chooseActivity(next: ActivityKind) {
    setActivity(next);
    if (next !== "dive") setVis(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!feeling) {
      setFeelingError(true);
      firstFeelingRef.current?.focus();
      return;
    }
    // 送出時才換算真正的日期（表單可能跨午夜開著）
    const today = todayInTaipei();
    const date = day === "today" ? today : isoPlusDays(today, -1);
    const body: ReportInput = { date, activity, feeling };
    if (activity === "dive" && vis != null) body.visibility_m = vis;
    const trimmed = note.trim();
    if (trimmed) body.note = trimmed;

    setSubmitting(true);
    setError(null);
    const res = await postReport(slug, body);
    setSubmitting(false);

    if (res.ok) {
      markReported(slug, date);
      onSuccess();
      return;
    }
    const kind: ErrorKind =
      res.status === 409 ? 409 : res.status === 429 ? 429 : res.status === 422 ? 422 : 0;
    if (kind === 409) markReported(slug, date);
    if (kind === 422) setBaseDate(todayInTaipei());
    setError({ kind, day, activity });
  }

  const errorText = (() => {
    if (!error) return null;
    switch (error.kind) {
      case 409:
        return `你已經回報過${error.day === "today" ? "今天" : "昨天"}${name}的${ACTIVITY_KIND_ZH[error.activity]}了，同一項活動每天只能回報一次。`;
      case 429:
        return "今天的回報次數用完了（每天最多 5 則），明天再來。";
      case 422:
        return "有欄位格式不對，請確認日期是今天或昨天，再送一次。";
      default:
        return "送出失敗，可能是網路不穩。你填的內容還在，請再按一次送出。";
    }
  })();

  const limited = error?.kind === 429;

  return (
    <form
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="card-clean p-4 sm:p-6"
      aria-labelledby="report-form-title"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="report-form-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-extrabold text-slate-900 outline-none"
          >
            回報{name}的實際海況
          </h3>
          <p className="mt-1 text-sm text-slate-600">不用登入，回報會顯示在下方給其他人參考。</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉回報表單"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 outline-none transition hover:bg-ocean-50 hover:text-ocean-700 focus-visible:ring-2 focus-visible:ring-ocean-600"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {errorText && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className={`mt-4 rounded-xl border p-3 text-sm outline-none ${
            error?.kind === 409
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {errorText}
        </div>
      )}

      <div className="mt-5 space-y-5">
        {showActivity && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-900">活動</legend>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(["dive", "surf"] as ActivityKind[]).map((k) => (
                <label key={k} className="relative sm:min-w-[6rem]">
                  <input
                    type="radio"
                    name="report-activity"
                    value={k}
                    checked={activity === k}
                    onChange={() => chooseActivity(k)}
                    className="peer sr-only"
                  />
                  <span className={`${CHIP} min-h-12 ${activity === k ? CHIP_ON : CHIP_OFF}`}>
                    {ACTIVITY_KIND_ZH[k]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">哪天下水</legend>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {(
              [
                ["today", `今天 ${shortDateLabel(baseDate)}`],
                ["yesterday", `昨天 ${shortDateLabel(yesterday)}`],
              ] as [DayChoice, string][]
            ).map(([k, label]) => (
              <label key={k} className="relative sm:min-w-[6rem]">
                <input
                  type="radio"
                  name="report-day"
                  value={k}
                  checked={day === k}
                  onChange={() => setDay(k)}
                  className="peer sr-only"
                />
                <span className={`${CHIP} min-h-12 ${day === k ? CHIP_ON : CHIP_OFF}`}>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset
          aria-describedby={feelingError ? "feeling-error" : undefined}
          aria-invalid={feelingError || undefined}
        >
          <legend className="mb-2 text-sm font-bold text-slate-900">
            整體感覺
            <span className="text-rose-700" aria-hidden="true">
              {" "}
              *
            </span>
            <span className="sr-only">（必填）</span>
          </legend>
          {feelingError && (
            <p id="feeling-error" className="-mt-1 mb-2 text-sm font-semibold text-rose-700">
              請選一個整體感覺
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
            {FEELINGS.map((f, i) => {
              const on = feeling === f.value;
              const c = RATING_HEX[f.tone];
              return (
                <label key={f.value} className="relative">
                  <input
                    ref={i === 0 ? firstFeelingRef : undefined}
                    type="radio"
                    name="report-feeling"
                    value={f.value}
                    checked={on}
                    onChange={() => {
                      setFeeling(f.value);
                      setFeelingError(false);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    data-checked={on || undefined}
                    className={`flex min-h-16 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-xl p-3 text-left transition peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-600 peer-focus-visible:ring-offset-2 ${
                      on ? "ring-2" : "bg-white ring-1 ring-ocean-200 hover:bg-ocean-50"
                    }`}
                    style={on ? { background: c.soft, ["--tw-ring-color" as string]: c.base } : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.base }} aria-hidden="true" />
                      <span className="text-base font-bold" style={{ color: on ? c.text : "#0f172a" }}>
                        {f.label}
                      </span>
                    </span>
                    <span className="text-xs leading-snug text-slate-600">{f.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {activity === "dive" && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-900">水下能見度（選填）</legend>
            <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
              {VIS_STEPS.map((s) => {
                const on = vis === s.value;
                return (
                  <label key={s.value} className="relative sm:min-w-[3.5rem]">
                    <input
                      type="radio"
                      name="report-visibility"
                      value={s.value}
                      checked={on}
                      onChange={() => {}}
                      // 再點一次已選的那顆 → 取消選取
                      onClick={() => setVis((v) => (v === s.value ? null : s.value))}
                      onKeyDown={(e) => {
                        if (e.key === " " && on) {
                          e.preventDefault();
                          setVis(null);
                        }
                      }}
                      className="peer sr-only"
                    />
                    <span className={`${CHIP} min-h-11 tabular-nums ${on ? CHIP_ON : CHIP_OFF}`}>
                      <span className="sm:hidden">{s.short}</span>
                      <span className="hidden sm:inline">{s.label}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-600">單位：公尺。看不清楚就不用選。</p>
          </fieldset>
        )}

        {noteOpen ? (
          <div>
            <label htmlFor="report-note" className="sr-only">
              備註，最多 140 字
            </label>
            <textarea
              id="report-note"
              ref={noteRef}
              rows={3}
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={activity === "dive" ? "例：流有點強，北邊比較清楚" : "例：中午後轉向岸風，浪變糊"}
              className="w-full rounded-xl border border-ocean-200 bg-white p-3 text-base text-slate-800 focus:border-ocean-600 focus:outline-none focus:ring-2 focus:ring-ocean-600/30"
            />
            <p
              className={`mt-1 text-right text-xs tabular-nums ${note.length > 120 ? "text-amber-700" : "text-slate-600"}`}
            >
              {note.length}/140
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="min-h-11 cursor-pointer rounded text-sm font-semibold text-ocean-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ocean-600"
          >
            ＋ 加一句備註（選填）
          </button>
        )}
      </div>

      {!limited && (
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="mt-6 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-coral-700 px-6 text-base font-bold text-white outline-none transition hover:bg-[#a03b25] focus-visible:ring-2 focus-visible:ring-coral-700 focus-visible:ring-offset-2 disabled:cursor-wait sm:w-auto sm:min-w-[12rem]"
        >
          {submitting ? "送出中…" : "送出回報"}
        </button>
      )}
    </form>
  );
}
