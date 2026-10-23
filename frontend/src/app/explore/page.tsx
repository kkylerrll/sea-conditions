import HeroWaves from "@/components/HeroWaves";
import HomeExplorer from "@/components/HomeExplorer";
import Freshness from "@/components/Freshness";
import RefreshButton from "@/components/RefreshButton";
import { getLocations } from "@/lib/api";
import { ACTIVITY_KIND_ZH, parseActivity, ratingFor, supportsActivity } from "@/lib/sea";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

const HEADING_ZH = {
  dive: "今天，哪裡適合潛水？",
  surf: "今天，哪裡適合衝浪？",
} as const;

function todayLabel(): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { activity?: string };
}) {
  const activity = parseActivity(searchParams.activity);

  let locations: Location[] = [];
  let error: string | null = null;

  try {
    locations = await getLocations();
  } catch (e) {
    error = e instanceof Error ? e.message : "無法連線到後端";
  }

  const rel = locations.filter((l) => supportsActivity(l.activities, activity));
  const count = (r: string) => rel.filter((l) => ratingFor(l.today, activity) === r).length;
  const green = count("green");
  const yellow = count("yellow");
  const red = count("red");
  const latest = locations
    .map((l) => l.today?.fetched_at)
    .filter((v): v is string => !!v)
    .sort()
    .pop();

  return (
    <main className="mx-auto max-w-[88rem] space-y-6">
      {/* 頁首：日期 + 大標 + 今日摘要大字 */}
      <header className="hero-ocean relative overflow-hidden rounded-[1.75rem] px-5 pb-16 pt-6 text-white shadow-lift sm:px-9 sm:pb-20 sm:pt-8">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-lagoon-300">{todayLabel()}</p>
            <h1 className="mt-1.5 text-[1.85rem] font-extrabold leading-tight tracking-tight min-[400px]:text-4xl sm:text-5xl lg:text-6xl">
              {HEADING_ZH[activity]}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">
              台灣潛點與衝浪點的今日海況燈號。點地圖上的標記看預覽，再點一次直接進詳情；也可以從清單挑一個。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <RefreshButton tone="dark" />
              <Freshness iso={latest} tone="dark" />
            </div>
          </div>

          {!error && rel.length > 0 && (
            <div className="rounded-2xl bg-white/10 px-6 py-4 ring-1 ring-white/20 backdrop-blur md:min-w-[17rem]">
              <p className="flex items-baseline gap-2">
                <span className="text-7xl font-extrabold leading-none tabular-nums sm:text-8xl">{green}</span>
                <span className="text-lg font-bold">個地區適合</span>
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/90">
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" aria-hidden="true" />
                  {yellow} 個勉強可下
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f43f5e]" aria-hidden="true" />
                  {red} 個不建議
                </li>
              </ul>
              {green === 0 && (
                <p className="mt-2 text-xs text-white/80">
                  今天沒有綠燈{ACTIVITY_KIND_ZH[activity]}地區，建議挑黃燈或改天。
                </p>
              )}
            </div>
          )}
        </div>
        <HeroWaves />
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          載入失敗：{error}
          <div className="mt-1 text-rose-600/80">請稍後再試，或按上方「重新抓海況」。</div>
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          目前沒有海況資料，按上方「重新抓海況」抓一次。
        </div>
      ) : (
        <HomeExplorer locations={locations} activity={activity} />
      )}
    </main>
  );
}
