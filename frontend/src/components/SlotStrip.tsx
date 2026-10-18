"use client";

// 一天 4 個時段（早上／上午／下午／傍晚）的小條：燈號點、浪高、風力。
// 今天已結束的時段淡化，目前或下一個時段加框。沒有 slots 就什麼都不畫。

import { useEffect, useState } from "react";
import { type ActivityKind, hasBothKinds, nowMinutesTaipei, ratingOf, RATING_HEX } from "@/lib/sea";
import { todayInTaipei } from "@/lib/format";
import type { Condition } from "@/lib/types";

const KIND_SHORT: Record<ActivityKind, string> = { dive: "潛", surf: "衝" };

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
      <div className="mb-1.5 text-[11px] text-slate-500">時段預報（白天）</div>
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((s, i) => {
          const past = isToday && now != null && now >= toMin(s.end);
          const hi = i === current;
          return (
            <div
              key={s.key}
              className={`min-w-0 rounded-lg border px-1.5 py-2 text-center ${
                hi ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"
              } ${past ? "opacity-45" : ""}`}
            >
              <div className="text-xs font-semibold text-slate-800">{s.label}</div>
              <div className="text-[10px] tabular-nums text-slate-400">
                {s.start.slice(0, 2)}–{s.end.slice(0, 2)}
              </div>
              <div className="my-1.5 flex items-center justify-center gap-1.5">
                {kinds.map((k, j) => {
                  const r = ratingOf(s.ratings?.[k]?.rating);
                  return (
                    <span
                      key={k}
                      className={`flex items-center gap-0.5 ${j > 0 ? "opacity-60" : ""}`}
                      title={`${k === "dive" ? "潛水" : "衝浪"}：${RATING_HEX[r].label}`}
                    >
                      {kinds.length > 1 && (
                        <span className="text-[9px] text-slate-400">{KIND_SHORT[k]}</span>
                      )}
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: RATING_HEX[r].base }}
                      />
                    </span>
                  );
                })}
              </div>
              <div className="text-[11px] tabular-nums text-slate-600">
                浪 {s.wave_height_m != null ? s.wave_height_m.toFixed(1) : "—"}m
              </div>
              <div className="text-[11px] tabular-nums text-slate-600">
                風 {s.wind_scale ?? "—"}級
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
