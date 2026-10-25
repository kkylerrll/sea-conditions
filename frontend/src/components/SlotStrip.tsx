"use client";

// 一天 4 個時段（早上／上午／下午／傍晚）的小條：燈號點、浪高、風力。
// 今天已結束的時段淡化，目前或下一個時段加框。沒有 slots 就什麼都不畫。

import { useEffect, useState } from "react";
import { type ActivityKind, hasBothKinds, nowMinutesTaipei, ratingOf, RATING_HEX, RATING_SHORT } from "@/lib/sea";
import { todayInTaipei } from "@/lib/format";
import type { Condition } from "@/lib/types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export default function SlotStrip({
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
  // 目前所在時段，或（還沒開始時）下一個時段
  const current =
    isToday && now != null ? slots.findIndex((s) => now < toMin(s.end)) : -1;

  return (
    <div>
      <div className="mb-2 text-xs font-semibold tracking-wide text-ocean-700">時段預報（白天）</div>
      <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
        {slots.map((s, i) => {
          const past = isToday && now != null && now >= toMin(s.end);
          const hi = i === current;
          const started = now != null && now >= toMin(s.start);
          return (
            <div
              key={s.key}
              className={`min-w-0 rounded-xl border px-2.5 py-2.5 ${
                hi
                  ? "border-2 border-ocean-600 bg-white"
                  : past
                    ? "border-ocean-100 bg-sand-100"
                    : "border-ocean-100 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className={`text-sm font-semibold ${past ? "text-slate-600" : "text-slate-800"}`}>
                  {s.label}
                </span>
                <span className="text-xs tabular-nums text-slate-600">
                  {s.start.slice(0, 2)}–{s.end.slice(0, 2)}
                </span>
              </div>
              {hi && (
                <div className="text-[11px] font-semibold text-ocean-700">
                  {started ? "進行中" : "下一時段"}
                </div>
              )}
              {past && <div className="text-[11px] text-slate-600">已過</div>}
              <ul className={`my-2 space-y-1 ${past ? "opacity-70" : ""}`}>
                {kinds.map((k) => {
                  const r = ratingOf(s.ratings?.[k]?.rating);
                  return (
                    <li key={k} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: RATING_HEX[r].base }}
                        aria-hidden="true"
                      />
                      <span className="text-slate-600">{k === "dive" ? "潛水" : "衝浪"}</span>
                      <span className="font-semibold" style={{ color: RATING_HEX[r].text }}>
                        {RATING_SHORT[r]}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className={`text-xs tabular-nums text-slate-700 ${past ? "opacity-80" : ""}`}>
                浪 {s.wave_height_m != null ? s.wave_height_m.toFixed(1) : "—"} m
              </div>
              <div className={`text-xs tabular-nums text-slate-700 ${past ? "opacity-80" : ""}`}>
                風 {s.wind_scale ?? "—"} 級
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
