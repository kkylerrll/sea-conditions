import Link from "next/link";
import { notFound } from "next/navigation";
import ForecastStrip from "@/components/ForecastStrip";
import Freshness from "@/components/Freshness";
import HeroWaves from "@/components/HeroWaves";
import LiveCams from "@/components/LiveCams";
import { TempGauge, TideCurve, WindCompass } from "@/components/SeaVisuals";
import SlotTimeline from "@/components/SlotTimeline";
import SpotList from "@/components/SpotList";
import { getLocation } from "@/lib/api";
import { updatedLabel } from "@/lib/format";
import { directionsUrl } from "@/lib/nav";
import {
  ACTIVITY_KIND_ZH,
  type ActivityKind,
  compassZh,
  parseActivity,
  primaryActivity,
  RATING_HEX,
  ratingFor,
  reasonsFor,
  supportsActivity,
} from "@/lib/sea";

export const dynamic = "force-dynamic";

export default async function SpotPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { activity?: string };
}) {
  let location;
  try {
    location = await getLocation(params.slug);
  } catch {
    notFound();
  }
  if (!location) notFound();

  const today = location.forecast[0] ?? location.today ?? null;
  const rest = location.forecast.slice(1);
  // 主燈號跟著使用者選的活動別走；這個地區不支援該活動時才退回預設主活動，
  // 免得從衝浪地圖點進來卻看到潛水的燈號。
  const selected = parseActivity(searchParams.activity);
  const primary = supportsActivity(location.activities, selected)
    ? selected
    : primaryActivity(location.activities);
  const reasons = today ? reasonsFor(today, primary) : [];
  const col = today ? RATING_HEX[ratingFor(today, primary)] : null;
  // hero 的判定 pill：主活動排第一，另一種活動（若支援）接在後面
  const kinds: ActivityKind[] = (["dive", "surf"] as ActivityKind[])
    .filter((k) => supportsActivity(location.activities, k))
    .sort((a) => (a === primary ? -1 : 1));

  return (
    <main className="mx-auto max-w-5xl space-y-8 sm:space-y-10">
      {/* ───────── Hero：地名 + 判定 + 三塊視覺（羅盤／水溫／潮汐） ───────── */}
      <section aria-labelledby="spot-title">
        <div className="hero-ocean relative overflow-hidden rounded-[1.75rem] px-5 pb-20 pt-5 text-white shadow-lift sm:px-9 sm:pb-24 sm:pt-7">
          {/* 返回：帶著 activity 回去，否則從衝浪地圖點進來、按返回會掉回潛水模式 */}
          <Link
            href={`/explore?activity=${selected}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white/12 py-1 pl-2.5 pr-4 text-sm font-medium text-white outline-none ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            回地圖
          </Link>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-sm font-medium tracking-wide text-lagoon-300">
                {location.region}
                {location.name_en ? ` · ${location.name_en}` : ""}
              </p>
              <h1
                id="spot-title"
                className="mt-1 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl"
              >
                {location.name}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85">{location.blurb}</p>

              {today && (
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {kinds.map((k) => {
                    const c = RATING_HEX[ratingFor(today, k)];
                    return (
                      <li
                        key={k}
                        className="inline-flex items-center gap-2.5 rounded-full bg-white py-2 pl-3 pr-5 text-base font-bold shadow-lg sm:text-lg"
                        style={{ color: c.text }}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full ring-4"
                          style={{ background: c.base, ["--tw-ring-color" as string]: c.soft }}
                          aria-hidden="true"
                        />
                        <span className="text-slate-800">{ACTIVITY_KIND_ZH[k]}</span>
                        <span>{c.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <a
                  href={directionsUrl(location.lat, location.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-coral-400 px-5 py-1.5 text-sm font-bold text-white outline-none transition hover:bg-[#e66a4d] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-abyss-700"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10 2C6.7 2 4 4.7 4 8c0 4.2 5.3 9.4 5.6 9.7a.6.6 0 0 0 .8 0C10.7 17.4 16 12.2 16 8c0-3.3-2.7-6-6-6Zm0 8.2A2.2 2.2 0 1 1 10 5.8a2.2 2.2 0 0 1 0 4.4Z" />
                  </svg>
                  用 Google 地圖導航
                </a>
                {today && <Freshness iso={today.fetched_at} tone="dark" />}
              </div>
            </div>

            {/* 大浪高數字 */}
            {today && (
              <div className="rounded-2xl bg-white/10 px-6 py-4 ring-1 ring-white/20 backdrop-blur sm:min-w-[15rem]">
                <p className="text-xs font-semibold tracking-widest text-lagoon-300">今日浪高</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-7xl font-extrabold leading-none tabular-nums sm:text-8xl">
                    {today.wave_height_m == null ? "—" : today.wave_height_m.toFixed(1)}
                  </span>
                  <span className="text-xl font-semibold text-white/80">m</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/80">
                  週期 {today.wave_period_s == null ? "—" : `${Math.round(today.wave_period_s)} 秒`}
                  {today.wave_dir ? ` · 來自${compassZh(today.wave_dir)}` : ""}
                  {today.visibility_m != null && (
                    <>
                      <br />
                      能見度約 {today.visibility_m} m（由浪高推估）
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          <HeroWaves />
        </div>

        {today && (
          // 桌機三欄並排；手機左右滑動（scroll-snap），每塊約 85% 寬，露出下一塊提示可滑
          <div className="-mx-4 mt-2 overflow-x-auto px-4 pb-4 pt-3 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex snap-x snap-mandatory gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <WindCompass c={today} className="h-full w-[85%] shrink-0 snap-center sm:w-auto" />
              <TempGauge c={today} className="h-full w-[85%] shrink-0 snap-center sm:w-auto" />
              <TideCurve c={today} className="h-full w-[85%] shrink-0 snap-center sm:w-auto" />
            </div>
          </div>
        )}
      </section>

      {!today ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          目前沒有海況資料，請回首頁按「重新抓海況」。
        </div>
      ) : (
        <>
          {today.slots && today.slots.length > 0 && (
            <section aria-labelledby="slots-title">
              <h2 id="slots-title" className="section-title">
                今天白天，哪個時段最好？
              </h2>
              <div className="card-clean p-4 sm:p-6">
                <SlotTimeline c={today} activity={primary} activities={location.activities} />
              </div>
            </section>
          )}

          {today.advice_text && (
            <section>
              <h2 className="section-title">今日建議</h2>
              <div
                className="rounded-2xl border-l-[6px] bg-white p-5 shadow-soft sm:p-6"
                style={{ borderColor: col?.base ?? "#0B6FA4" }}
              >
                <p className="text-base leading-relaxed text-slate-700 sm:text-lg">{today.advice_text}</p>
                {reasons.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-ocean-100 pt-3 text-xs text-slate-600">
                    {reasons.map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          <ForecastStrip days={rest} activity={primary} activities={location.activities} />

          <SpotList spots={location.spot_list} />

          <p className="text-xs text-slate-600">
            資料來源：{today.source}
            {updatedLabel(today.fetched_at) ? ` · 更新於 ${updatedLabel(today.fetched_at)}` : ""}
            {today.advice_model ? ` · 建議由 ${today.advice_model} 生成` : " · 建議為系統模板"}
          </p>
        </>
      )}

      <LiveCams slug={params.slug} />
    </main>
  );
}
