// 未來幾天：一排燈號 chip，用原生 <details> 點開才看細節數字（漸進揭露、不需 client JS）。

import { RATING_HEX, ratingOf } from "@/lib/sea";
import { updatedLabel } from "@/lib/format";
import type { Condition } from "@/lib/types";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function dayHead(iso: string, i: number) {
  const d = new Date(iso + "T00:00:00");
  const head = i === 0 ? "今天" : i === 1 ? "明天" : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${head}（${WEEKDAY[d.getDay()]}）`;
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{k}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{v}</div>
    </div>
  );
}

export default function ForecastStrip({ days, startIndex = 0 }: { days: Condition[]; startIndex?: number }) {
  if (days.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-slate-500">未來預報</h2>
      <div className="space-y-2">
        {days.map((c, idx) => {
          const i = startIndex + idx;
          const col = RATING_HEX[ratingOf(c.rating)];
          return (
            <details key={c.date} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.base }} />
                <span className="flex-1 text-sm font-semibold text-slate-900">{dayHead(c.date, i)}</span>
                <span className="text-xs font-medium" style={{ color: col.text }}>
                  {col.label}
                </span>
                <span className="hidden text-xs tabular-nums text-slate-400 sm:inline">
                  浪 {c.wave_height_m ?? "—"}m · 風 {c.wind_scale ?? "—"}級
                </span>
                <svg
                  className="text-slate-400 transition-transform group-open:rotate-180"
                  width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"
                >
                  <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>

              <div className="border-t border-slate-100 px-4 py-3">
                {c.advice_text && (
                  <p className="mb-3 text-sm leading-relaxed text-slate-700">{c.advice_text}</p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Cell k="浪高" v={c.wave_height_m != null ? `${c.wave_height_m} m` : "—"} />
                  <Cell k="湧浪週期" v={c.wave_period_s != null ? `${c.wave_period_s} s` : "—"} />
                  <Cell k="風力" v={c.wind_scale != null ? `${c.wind_scale} 級` : "—"} />
                  <Cell k="風向 / 陣風" v={c.wind_dir ? `${c.wind_dir} / ${c.gust_ms ?? "—"}` : "—"} />
                  <Cell k="水溫" v={c.water_temp_c != null ? `${c.water_temp_c} °C` : "—"} />
                  <Cell k="能見度（估）" v={c.visibility_m != null ? `${c.visibility_m} m` : "—"} />
                  <Cell k="滿潮" v={c.tide_high ?? "—"} />
                  <Cell k="乾潮" v={c.tide_low ?? "—"} />
                </div>
                {c.rating_reasons.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-500">
                    {c.rating_reasons.map((r, k) => (
                      <li key={k}>· {r}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-slate-400">
                  資料來源：{c.source}
                  {updatedLabel(c.fetched_at) ? ` · 更新於 ${updatedLabel(c.fetched_at)}` : ""}
                  {c.advice_model ? ` · 建議由 ${c.advice_model} 生成` : " · 建議為系統模板"}
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
