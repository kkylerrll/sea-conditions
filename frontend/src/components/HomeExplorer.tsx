"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Freshness from "@/components/Freshness";
import TaiwanMap from "@/components/TaiwanMap";
import { TempGauge, SeaStateHero } from "@/components/SeaVisuals";
import {
  ACTIVITY_KIND_ZH,
  type ActivityKind,
  RATING_HEX,
  RATING_SHORT,
  ratingFor,
  ratingOf,
  supportsActivity,
} from "@/lib/sea";
import type { Location } from "@/lib/types";

function fmt(v: number | null | undefined, unit: string) {
  return v == null ? "—" : `${v}${unit}`;
}

/* ---------- 地區分組 ----------
   後端 region 是「縣市 · 區域」自由字串（例：屏東 · 離島、臺東 · 東河一帶、
   基隆 · 新北 · 北海岸），沒有結構化欄位，所以用關鍵字推導。 */

type RegionGroup = "北部" | "東部" | "南部" | "離島";
const GROUP_ORDER: RegionGroup[] = ["北部", "東部", "南部", "離島"];

function regionGroup(region: string): RegionGroup | null {
  if (/離島|澎湖/.test(region)) return "離島";
  if (/基隆|新北|台北|臺北|桃園|新竹|苗栗/.test(region)) return "北部";
  if (/宜蘭|花蓮|臺東|台東/.test(region)) return "東部";
  if (/屏東|高雄|臺南|台南|嘉義/.test(region)) return "南部";
  return null;
}

type Filter = "全部" | "適合" | RegionGroup;
const FILTERS: Filter[] = ["全部", "適合", ...GROUP_ORDER];

export default function HomeExplorer({
  locations,
  activity,
}: {
  locations: Location[];
  activity: ActivityKind;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("全部");
  const sel = locations.find((l) => l.slug === selected) ?? null;

  // 切換活動別時，先前選的點可能不支援新活動，清掉避免顯示錯的燈號。
  useEffect(() => {
    setSelected(null);
    setHovered(null);
  }, [activity]);

  const visible = useMemo(
    () => locations.filter((loc) => supportsActivity(loc.activities, activity)),
    [locations, activity],
  );

  const shown = useMemo(
    () =>
      visible.filter((loc) => {
        if (filter === "全部") return true;
        if (filter === "適合") return ratingFor(loc.today, activity) === "green";
        return regionGroup(loc.region) === filter;
      }),
    [visible, filter, activity],
  );
  const shownSlugs = new Set(shown.map((l) => l.slug));
  // 地圖：全部時維持原樣（含灰階的不支援點）；篩選時只留符合的點
  const mapLocations = filter === "全部" ? locations : locations.filter((l) => shownSlugs.has(l.slug));

  const latest = locations
    .map((l) => l.today?.fetched_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_21rem] lg:items-start xl:grid-cols-[1fr_25rem] xl:gap-6">
      {/* 地圖：SVG viewBox 縮放，沒有固定像素框；手機在最上面，清單接在下面 */}
      <div className="min-w-0 rounded-3xl border border-ocean-100 bg-white p-2 shadow-[0_1px_3px_rgba(11,111,164,0.07)] sm:p-3">
        <TaiwanMap
          locations={mapLocations}
          selected={selected}
          onSelect={setSelected}
          activity={activity}
          hovered={hovered}
          onHover={setHovered}
        />
        <Legend activity={activity} latest={latest} />
      </div>

      {/* 右側欄：篩選 → 今日最佳 → 選取地區摘要 → 清單 */}
      <div className="min-w-0 space-y-4 lg:sticky lg:top-4">
        <div role="group" aria-label="篩選地點" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f)}
                className={`min-h-9 cursor-pointer rounded-full border px-3.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ocean-600 ${
                  on
                    ? "border-ocean-600 bg-ocean-600 text-white"
                    : "border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>

        <TodayBestCard locations={visible} activity={activity} />

        {sel && sel.today && (
          <SelectedCard location={sel} activity={activity} onClose={() => setSelected(null)} />
        )}

        {shown.length === 0 ? (
          <p className="card-clean p-4 text-sm text-slate-600">這個篩選下沒有地點，換一個看看。</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((loc) => (
              <SpotCard
                key={loc.slug}
                loc={loc}
                activity={activity}
                active={hovered === loc.slug || selected === loc.slug}
                onHover={setHovered}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SpotCard({
  loc,
  activity,
  active,
  onHover,
}: {
  loc: Location;
  activity: ActivityKind;
  active: boolean;
  onHover: (slug: string | null) => void;
}) {
  const rk = ratingFor(loc.today, activity);
  const c = RATING_HEX[rk];
  const t = loc.today;
  const slots = t?.slots ?? [];

  return (
    <li>
      <Link
        href={`/spots/${loc.slug}`}
        onMouseEnter={() => onHover(loc.slug)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(loc.slug)}
        onBlur={() => onHover(null)}
        className={`block rounded-2xl border bg-white p-3.5 shadow-[0_1px_3px_rgba(11,111,164,0.07)] outline-none transition focus-visible:ring-2 focus-visible:ring-ocean-600 ${
          active ? "border-ocean-600 bg-ocean-50" : "border-ocean-100 hover:border-ocean-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{loc.name}</p>
            <p className="truncate text-xs text-slate-600">{loc.region}</p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: c.soft, color: c.text }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: c.base }} aria-hidden="true" />
            {RATING_SHORT[rk]}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs tabular-nums text-slate-700">
            浪 {fmt(t?.wave_height_m, " m")} · 風 {t?.wind_scale == null ? "—" : `${t.wind_scale} 級`}
          </p>
          {slots.length > 0 && (
            <span className="flex shrink-0 items-center gap-1" aria-label="早上到傍晚四個時段的燈號">
              {slots.map((sl) => {
                const sr = ratingOf(sl.ratings?.[activity]?.rating);
                return (
                  <span
                    key={sl.key}
                    title={`${sl.label}：${RATING_SHORT[sr]}`}
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                    style={{ background: RATING_HEX[sr].base }}
                  />
                );
              })}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/** 燈號說明 + 資料更新時間 */
function Legend({ activity, latest }: { activity: ActivityKind; latest: string | null | undefined }) {
  const items: { r: "green" | "yellow" | "red"; label: string }[] = [
    { r: "green", label: RATING_SHORT.green },
    { r: "yellow", label: RATING_SHORT.yellow },
    { r: "red", label: RATING_SHORT.red },
  ];

  return (
    <div className="mt-2 rounded-2xl border border-ocean-100 bg-sand p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold text-ocean-700">燈號說明（{ACTIVITY_KIND_ZH[activity]}）</p>
        <Freshness iso={latest} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map(({ r, label }) => (
          <li key={r} className="flex items-center gap-1.5 text-xs text-slate-700">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ background: RATING_HEX[r].base }}
              aria-hidden="true"
            />
            <span>{label}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-xs text-slate-700">
          <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: "#94a3b8" }} aria-hidden="true" />
          <span>不支援{ACTIVITY_KIND_ZH[activity]}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-slate-600">點地圖上的標記看今日海況，可滾動縮放、拖曳平移。</p>
    </div>
  );
}

/** 今日最佳：綠燈地區一覽，讓人不用逐一掃 13 個 marker 就知道今天去哪。
 *  沒有綠燈就退而求其次列黃燈，並明講「沒有綠燈」；兩者都沒有也給出明確文字，
 *  絕不留一張空卡片。 */
function TodayBestCard({ locations, activity }: { locations: Location[]; activity: ActivityKind }) {
  const green = locations.filter((l) => ratingFor(l.today, activity) === "green");
  const yellow = locations.filter((l) => ratingFor(l.today, activity) === "yellow");
  const isFallback = green.length === 0 && yellow.length > 0;
  const list = green.length > 0 ? green : yellow;
  const c = RATING_HEX[green.length > 0 ? "green" : "yellow"];

  return (
    <div className="rounded-2xl border border-ocean-100 bg-white p-4 shadow-[0_1px_3px_rgba(11,111,164,0.07)]">
      <h2 className="text-sm font-bold text-slate-900">今日最佳</h2>

      {list.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          今天沒有綠燈地區，{ACTIVITY_KIND_ZH[activity]}也沒有黃燈地區，條件都不理想，建議明天再看看。
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-600">
            {isFallback
              ? `今天沒有綠燈地區，以下是勉強可下的黃燈地區`
              : `今天適合${ACTIVITY_KIND_ZH[activity]}的地區`}
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {list.map((loc) => (
              <li key={loc.slug}>
                <Link
                  href={`/spots/${loc.slug}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 outline-none transition hover:bg-ocean-50 focus-visible:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-ocean-600"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                    style={{ background: c.base }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{loc.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-medium" style={{ color: c.text }}>
                      {c.label}
                    </span>
                    <span className="block text-xs tabular-nums text-slate-600">
                      浪 {fmt(loc.today?.wave_height_m, "m")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SelectedCard({
  location,
  activity,
  onClose,
}: {
  location: Location;
  activity: ActivityKind;
  onClose: () => void;
}) {
  const t = location.today!;
  const rating = ratingFor(t, activity);

  return (
    <div className="space-y-3 rounded-2xl border border-ocean-200 bg-white p-4 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">{location.name}</h3>
          <p className="text-xs text-slate-600">{location.region}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 outline-none transition hover:bg-ocean-50 hover:text-ocean-700 focus-visible:ring-2 focus-visible:ring-ocean-600"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 重用詳細頁已有的海況視覺元件，不重寫浪高／水溫／防寒衣邏輯 */}
      <SeaStateHero c={t} rating={rating} activityLabel={ACTIVITY_KIND_ZH[activity]} />
      <TempGauge c={t} />

      {t.advice_text && <p className="text-xs leading-relaxed text-slate-600">{t.advice_text}</p>}

      <Link
        href={`/spots/${location.slug}`}
        className="block rounded-lg bg-ocean-600 py-2 text-center text-sm font-semibold text-white outline-none transition hover:bg-ocean-700 focus-visible:ring-2 focus-visible:ring-ocean-600 focus-visible:ring-offset-1"
      >
        看完整海況與未來預報 →
      </Link>
    </div>
  );
}
