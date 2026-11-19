"use client";

// 白天 4 個時段（06–18）的粗色條：每段一整塊燈號色，文字永遠跟顏色並列。
// 今天已過的時段淡化，並用小三角標出「現在」。同時支援潛水與衝浪的地區疊兩條。
// 另外匯出 MiniSlots：地圖預覽卡與清單卡用的小版，不需要時間邏輯。

import { useEffect, useState } from "react";
import { todayInTaipei } from "@/lib/format";
import {
  type ActivityKind,
  hasBothKinds,
  nowMinutesTaipei,
  ratingOf,
  RATING_HEX,
  RATING_SHORT,
} from "@/lib/sea";
import type { Condition, Slot } from "@/lib/types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

// 色條上的字色：深色，確保在綠／黃／紅上都有 4.5:1 以上對比
const BAR_TEXT: Record<string, string> = {
  green: "#022c22",
  yellow: "#451a03",
  red: "#3b0212",
  unknown: "#1e293b",
};

export default function SlotTimeline({
  c,
  activity,
  activities,
}: {
  c: Condition;
  activity: ActivityKind;
  activities?: string[];
}) {
  // 時間只在 client 掛載後才取，避免 SSR 與瀏覽器時間不同造成 hydration 差異
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(nowMinutesTaipei());
    const t = setInterval(() => setNow(nowMinutesTaipei()), 60_000);
    return () => clearInterval(t);
  }, []);

  const slots = c.slots;
  if (!slots || slots.length === 0) return null;

  const isToday = c.date === todayInTaipei();
  const kinds: ActivityKind[] = hasBothKinds(activities)
    ? activity === "dive"
      ? ["dive", "surf"]
      : ["surf", "dive"]
    : [activity];
  const currentIdx = isToday && now != null ? slots.findIndex((s) => now >= toMin(s.start) && now < toMin(s.end)) : -1;
  const upcomingIdx = isToday && now != null ? slots.findIndex((s) => now < toMin(s.start)) : -1;
  const focusIdx = currentIdx >= 0 ? currentIdx : upcomingIdx;

  return (
    <div>
      {/* 時段標題 + 波浪／風數字 */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {slots.map((s, i) => {
          const past = isToday && now != null && now >= toMin(s.end);
          return (
            <div key={s.key} className={`min-w-0 ${past ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-sm font-bold text-slate-800 sm:text-base">{s.label}</span>
                <span className="hidden text-xs tabular-nums text-slate-600 min-[420px]:inline">
                  {s.start.slice(0, 2)}–{s.end.slice(0, 2)}
                </span>
              </div>
              <div className="h-4 text-[11px] font-semibold text-ocean-700">
                {i === focusIdx ? (currentIdx >= 0 ? "進行中" : "下一時段") : past ? "已過" : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {kinds.map((k) => (
          <div key={k}>
            {kinds.length > 1 && (
              <div className="mb-1 text-xs font-semibold text-slate-600">{k === "dive" ? "潛水" : "衝浪"}</div>
            )}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {slots.map((s, i) => {
                const r = ratingOf(s.ratings?.[k]?.rating);
                const past = isToday && now != null && now >= toMin(s.end);
                const hi = i === focusIdx;
                return (
                  <div
                    key={s.key}
                    className={`flex h-14 items-center justify-center rounded-xl px-1 text-center text-sm font-bold leading-tight shadow-[inset_0_-3px_0_rgba(0,0,0,0.08)] sm:h-16 sm:text-lg ${
                      past ? "opacity-70" : ""
                    } ${hi ? "ring-2 ring-ocean-700 ring-offset-2 ring-offset-white" : ""}`}
                    style={{ background: RATING_HEX[r].base, color: BAR_TEXT[r] }}
                  >
                    {RATING_SHORT[r]}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 數字列 */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
        {slots.map((s) => {
          const past = isToday && now != null && now >= toMin(s.end);
          return (
            <div key={s.key} className={`text-xs tabular-nums text-slate-700 sm:text-sm ${past ? "opacity-60" : ""}`}>
              <div>浪 <span className="font-semibold">{s.wave_height_m != null ? s.wave_height_m.toFixed(1) : "—"}</span> m</div>
              <div>風 <span className="font-semibold">{s.wind_scale ?? "—"}</span> 級</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 小版 4 時段色條（無數字），預覽卡與清單卡用。 */
export function MiniSlots({
  slots,
  kind,
  className = "",
}: {
  slots: Slot[] | null | undefined;
  kind: ActivityKind;
  className?: string;
}) {
  if (!slots || slots.length === 0) return null;
  return (
    <div className={className} role="img" aria-label={`白天四個時段燈號：${slots
      .map((s) => `${s.label}${RATING_SHORT[ratingOf(s.ratings?.[kind]?.rating)]}`)
      .join("、")}`}>
      <div className="flex gap-1">
        {slots.map((s) => {
          const r = ratingOf(s.ratings?.[kind]?.rating);
          return (
            <div key={s.key} className="min-w-0 flex-1">
              <div className="h-2 rounded-full" style={{ background: RATING_HEX[r].base }} />
              <div className="mt-1 truncate text-center text-[10px] leading-none text-slate-600">
                {s.label.slice(0, 2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
