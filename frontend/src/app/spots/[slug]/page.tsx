import Link from "next/link";
import { notFound } from "next/navigation";
import ForecastStrip from "@/components/ForecastStrip";
import {
  ActivityRatings,
  SeaStateHero,
  TempGauge,
  TideCurve,
  WindCompass,
} from "@/components/SeaVisuals";
import SpotList from "@/components/SpotList";
import { getLocation } from "@/lib/api";
import { updatedLabel } from "@/lib/format";
import { directionsUrl } from "@/lib/nav";
import {
  ACTIVITY_KIND_ZH,
  primaryActivity,
  RATING_HEX,
  ratingFor,
  reasonsFor,
} from "@/lib/sea";

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
  const primary = primaryActivity(location.activities);
  const reasons = today ? reasonsFor(today, primary) : [];
  const col = today ? RATING_HEX[ratingFor(today, primary)] : null;

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
        <a
          href={directionsUrl(location.lat, location.lon)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 transition hover:bg-sky-100"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2C6.7 2 4 4.7 4 8c0 4.2 5.3 9.4 5.6 9.7a.6.6 0 0 0 .8 0C10.7 17.4 16 12.2 16 8c0-3.3-2.7-6-6-6Zm0 8.2A2.2 2.2 0 1 1 10 5.8a2.2 2.2 0 0 1 0 4.4Z" />
          </svg>
          用 Google 地圖導航
        </a>
      </header>

      {!today ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          目前沒有海況資料，請回首頁按「重新抓海況」。
        </div>
      ) : (
        <>
          <SeaStateHero
            c={today}
            rating={ratingFor(today, primary)}
            activityLabel={ACTIVITY_KIND_ZH[primary]}
          />

          <ActivityRatings c={today} activities={location.activities} />

          {today.advice_text && (
            <div
              className="rounded-2xl border bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm"
              style={{ borderColor: col?.base }}
            >
              {today.advice_text}
            </div>
          )}

          <SpotList spots={location.spot_list} />

          <div className="grid gap-3 sm:grid-cols-2">
            <WindCompass c={today} />
            <TempGauge c={today} />
          </div>

          <TideCurve c={today} />

          {reasons.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
              {reasons.map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-slate-400">
            資料來源：{today.source}
            {updatedLabel(today.fetched_at) ? ` · 更新於 ${updatedLabel(today.fetched_at)}` : ""}
            {today.advice_model ? ` · 建議由 ${today.advice_model} 生成` : " · 建議為系統模板"}
          </p>

          <ForecastStrip days={rest} activity={primary} />
        </>
      )}
    </main>
  );
}
