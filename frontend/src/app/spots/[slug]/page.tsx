import Link from "next/link";
import { notFound } from "next/navigation";
import ForecastStrip from "@/components/ForecastStrip";
import {
  SeaStateHero,
  TempGauge,
  TideCurve,
  VisibilityBar,
  WindCompass,
} from "@/components/SeaVisuals";
import { getLocation } from "@/lib/api";
import { updatedLabel } from "@/lib/format";
import { RATING_HEX, ratingOf } from "@/lib/sea";

export const dynamic = "force-dynamic";

export default async function SpotPage({ params }: { params: { slug: string } }) {
  let location;
  try {
    location = await getLocation(params.slug);
  } catch {
    notFound();
  }
  if (!location) notFound();

  const today = location.forecast[0] ?? location.today ?? null;
  const rest = location.forecast.slice(1);
  const col = today ? RATING_HEX[ratingOf(today.rating)] : null;

  return (
    <main className="space-y-5">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-sky-600 hover:underline">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        回地圖
      </Link>

      {/* 標題 */}
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{location.name}</h1>
        <p className="text-sm text-slate-500">
          {location.region}
          {location.name_en ? ` · ${location.name_en}` : ""}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{location.blurb}</p>
        {location.spots.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {location.spots.map((s) => (
              <span key={s} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700">
                {s}
              </span>
            ))}
          </div>
        )}
      </header>

      {!today ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          目前沒有海況資料，請回首頁按「重新抓海況」。
        </div>
      ) : (
        <>
          <SeaStateHero c={today} />

          {today.advice_text && (
            <div
              className="rounded-2xl border bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm"
              style={{ borderColor: col?.base }}
            >
              {today.advice_text}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <WindCompass c={today} />
            <TempGauge c={today} />
          </div>

          <TideCurve c={today} />
          <VisibilityBar c={today} />

          {today.rating_reasons.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
              {today.rating_reasons.map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-slate-400">
            資料來源：{today.source}
            {updatedLabel(today.fetched_at) ? ` · 更新於 ${updatedLabel(today.fetched_at)}` : ""}
            {today.advice_model ? ` · 建議由 ${today.advice_model} 生成` : " · 建議為系統模板"}
          </p>

          <ForecastStrip days={rest} startIndex={1} />
        </>
      )}
    </main>
  );
}
