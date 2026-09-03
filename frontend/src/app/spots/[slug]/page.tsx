import Link from "next/link";
import { notFound } from "next/navigation";
import ConditionStat from "@/components/ConditionStat";
import StatusBadge from "@/components/StatusBadge";
import { getLocation } from "@/lib/api";
import type { Condition } from "@/lib/types";

export const dynamic = "force-dynamic";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function dateLabel(iso: string, i: number) {
  const d = new Date(iso + "T00:00:00");
  const head = i === 0 ? "今天" : i === 1 ? "明天" : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${head}（${WEEKDAY[d.getDay()]}）`;
}

function DayBlock({ c, i }: { c: Condition; i: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{dateLabel(c.date, i)}</h3>
        <StatusBadge rating={c.rating} />
      </div>

      {c.advice_text && (
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{c.advice_text}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ConditionStat label="浪高" value={c.wave_height_m} unit=" m" />
        <ConditionStat label="湧浪週期" value={c.wave_period_s} unit=" s" />
        <ConditionStat label="風力" value={c.wind_scale != null ? `${c.wind_scale} 級` : null} />
        <ConditionStat label="風向 / 陣風" value={c.wind_dir ? `${c.wind_dir} / ${c.gust_ms ?? "—"}` : null} />
        <ConditionStat label="水溫" value={c.water_temp_c} unit=" °C" />
        <ConditionStat label="能見度（估）" value={c.visibility_m} unit=" m" />
        <ConditionStat label="滿潮" value={c.tide_high} />
        <ConditionStat label="乾潮" value={c.tide_low} />
      </div>

      {c.rating_reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {c.rating_reasons.map((r, idx) => (
            <li key={idx}>· {r}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        資料來源：{c.source}
        {c.advice_model ? ` · 建議由 ${c.advice_model} 生成` : " · 建議為系統模板"}
      </p>
    </div>
  );
}

export default async function SpotPage({ params }: { params: { slug: string } }) {
  let location;
  try {
    location = await getLocation(params.slug);
  } catch {
    notFound();
  }
  if (!location) notFound();

  return (
    <main className="space-y-5">
      <Link href="/" className="text-sm text-sea-600 hover:underline">
        ← 回全部潛點
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{location.name}</h1>
            <p className="text-sm text-slate-500">
              {location.region}
              {location.name_en ? ` · ${location.name_en}` : ""}
            </p>
          </div>
          {location.today && <StatusBadge rating={location.today.rating} />}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{location.blurb}</p>
        {location.spots.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {location.spots.map((s) => (
              <span key={s} className="rounded-full bg-sea-50 px-2.5 py-1 text-xs text-sea-700">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {location.forecast.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          目前沒有海況資料，請在後端執行 <code className="font-mono">python -m app.refresh</code>。
        </div>
      )}

      {location.forecast.map((c, i) => (
        <DayBlock key={c.date} c={c} i={i} />
      ))}
    </main>
  );
}
