"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import TaiwanMap from "@/components/TaiwanMap";
import { MiniSlots } from "@/components/SlotTimeline";
import {
  ACTIVITY_KIND_ZH,
  type ActivityKind,
  RATING_HEX,
  RATING_SHORT,
  ratingFor,
  supportsActivity,
} from "@/lib/sea";
import type { Location, Rating } from "@/lib/types";

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

const RATING_ORDER: Record<Rating, number> = { green: 0, yellow: 1, red: 2, unknown: 3 };

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
  const mapRef = useRef<HTMLDivElement | null>(null);

  // 切換活動別時，先前選的點可能沒有新活動的預報，清掉避免顯示錯的燈號。
  useEffect(() => {
    setSelected(null);
    setHovered(null);
  }, [activity]);

  const visible = useMemo(
    () => locations.filter((loc) => supportsActivity(loc.activities, activity)),
    [locations, activity],
  );

  // 清單：依燈號排序（適合 → 普通 → 不建議），同燈號維持後端順序；
  // 沒有這個活動預報的地區放最後，用「無預報」樣式，點了可看並切換活動。
  const shown = useMemo(() => {
    const rest = filter === "全部" ? locations.filter((l) => !supportsActivity(l.activities, activity)) : [];
    const main = visible.filter((loc) => {
      if (filter === "全部") return true;
      if (filter === "適合") return ratingFor(loc.today, activity) === "green";
      return regionGroup(loc.region) === filter;
    });
    const sorted = [...main].sort(
      (a, b) => RATING_ORDER[ratingFor(a.today, activity)] - RATING_ORDER[ratingFor(b.today, activity)],
    );
    return [...sorted, ...rest];
  }, [visible, locations, filter, activity]);
  const shownSlugs = new Set(shown.map((l) => l.slug));
  // 地圖：全部時維持原樣（含無預報的點）；篩選時只留符合的點
  const mapLocations = filter === "全部" ? locations : locations.filter((l) => shownSlugs.has(l.slug));

  function selectFromList(slug: string) {
    setSelected(slug);
    // 小螢幕上地圖在清單上方：選了就把地圖捲回視窗，才看得到 pin 與預覽卡
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      mapRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
      {/* 地圖面板：手機在最上面，清單接在下面 */}
      <div
        ref={mapRef}
        className="min-w-0 scroll-mt-16 rounded-[1.75rem] bg-gradient-to-b from-white to-ocean-50 p-2 shadow-lift ring-1 ring-ocean-100 sm:p-3 lg:sticky lg:top-20"
      >
        <TaiwanMap
          locations={mapLocations}
          selected={selected}
          onSelect={setSelected}
          activity={activity}
          hovered={hovered}
          onHover={setHovered}
          renderPreview={(loc, close) => <PreviewCard loc={loc} activity={activity} onClose={close} />}
        />
        <Legend activity={activity} />
      </div>

      {/* 右側欄：篩選 → 清單（依燈號排序） */}
      <div className="min-w-0 space-y-4">
        <div
          role="group"
          aria-label="篩選地點"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {FILTERS.map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f)}
                className={`min-h-10 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ocean-600 focus-visible:ring-offset-2 ${
                  on
                    ? "bg-abyss-800 text-white shadow-soft"
                    : "bg-white text-ocean-700 ring-1 ring-ocean-200 hover:bg-ocean-50"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <p className="card-clean p-4 text-sm text-slate-600">這個篩選下沒有地點，換一個看看。</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((loc) => (
              <SpotCard
                key={loc.slug}
                loc={loc}
                activity={activity}
                selected={selected === loc.slug}
                hovered={hovered === loc.slug}
                onHover={setHovered}
                onSelect={selectFromList}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 這個地點在目前活動別沒有預報時，改秀它有的那種活動 */
function effectiveKind(loc: Location, activity: ActivityKind): ActivityKind {
  if (supportsActivity(loc.activities, activity)) return activity;
  return activity === "dive" ? "surf" : "dive";
}

function Verdict({ rk, big = false }: { rk: Rating; big?: boolean }) {
  const c = RATING_HEX[rk];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold ${
        big ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
      style={{ background: c.soft, color: c.text }}
    >
      <span className={`rounded-full ${big ? "h-2.5 w-2.5" : "h-2 w-2"}`} style={{ background: c.base }} aria-hidden="true" />
      {big ? c.label : RATING_SHORT[rk]}
    </span>
  );
}

function SpotCard({
  loc,
  activity,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  loc: Location;
  activity: ActivityKind;
  selected: boolean;
  hovered: boolean;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
}) {
  const supported = supportsActivity(loc.activities, activity);
  const kind = effectiveKind(loc, activity);
  const rk = ratingFor(loc.today, kind);
  const c = RATING_HEX[rk];
  const t = loc.today;
  const active = selected || hovered;

  return (
    <li
      onMouseEnter={() => onHover(loc.slug)}
      onMouseLeave={() => onHover(null)}
      className={`lift-hover relative overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ${
        selected ? "ring-2 ring-abyss-800" : active ? "ring-ocean-600" : "ring-ocean-100"
      } ${supported ? "" : "bg-sand"}`}
    >
      {/* 左側燈號色條 */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={supported ? { background: c.base } : { background: "repeating-linear-gradient(180deg,#9AA9B8 0 6px,transparent 6px 10px)" }}
        aria-hidden="true"
      />
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(loc.slug)}
        onFocus={() => onHover(loc.slug)}
        onBlur={() => onHover(null)}
        className="block w-full cursor-pointer p-4 pb-3 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ocean-600"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{loc.name}</p>
            <p className="truncate text-xs text-slate-600">{loc.region}</p>
          </div>
          {supported ? (
            <Verdict rk={rk} />
          ) : (
            <span className="shrink-0 rounded-full border border-dashed border-slate-400 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              無{ACTIVITY_KIND_ZH[activity]}預報
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end gap-4">
          <p className="tabular-nums text-slate-900">
            <span className="text-3xl font-extrabold leading-none">{t?.wave_height_m == null ? "—" : t.wave_height_m.toFixed(1)}</span>
            <span className="ml-0.5 text-sm font-semibold text-slate-600">m 浪</span>
          </p>
          <p className="pb-0.5 text-sm tabular-nums text-slate-700">
            風 {t?.wind_scale == null ? "—" : `${t.wind_scale} 級`}
          </p>
        </div>

        <MiniSlots slots={t?.slots} kind={kind} className="mt-3" />
        {!supported && (
          <p className="mt-2 text-xs text-slate-600">這裡是{ACTIVITY_KIND_ZH[kind]}點，上方燈號為{ACTIVITY_KIND_ZH[kind]}。</p>
        )}
      </button>
      <Link
        href={`/spots/${loc.slug}?activity=${kind}`}
        className="flex min-h-11 items-center justify-between border-t border-ocean-100 px-5 text-sm font-semibold text-ocean-700 outline-none transition hover:bg-ocean-50 focus-visible:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ocean-600"
      >
        <span>查看詳情</span>
        <span aria-hidden="true">→</span>
      </Link>
    </li>
  );
}

/** 地圖上點 pin 彈出的預覽卡：燈號、浪／風／水溫、4 時段色條、前往詳情 */
function PreviewCard({
  loc,
  activity,
  onClose,
}: {
  loc: Location;
  activity: ActivityKind;
  onClose: () => void;
}) {
  const supported = supportsActivity(loc.activities, activity);
  const kind = effectiveKind(loc, activity);
  const t = loc.today;
  const rk = ratingFor(t, kind);

  return (
    <div
      role="dialog"
      aria-label={`${loc.name}預覽`}
      className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ocean-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-extrabold text-slate-900">{loc.name}</h3>
          <p className="truncate text-xs text-slate-600">{loc.region}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉預覽"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 outline-none transition hover:bg-ocean-50 hover:text-ocean-700 focus-visible:ring-2 focus-visible:ring-ocean-600"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!t ? (
        <p className="mt-2 text-sm text-slate-600">目前沒有海況資料。</p>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">{ACTIVITY_KIND_ZH[kind]}</span>
            <Verdict rk={rk} big />
          </div>
          {!supported && (
            <p className="mt-2 rounded-lg bg-sand-100 px-2.5 py-1.5 text-xs leading-snug text-slate-700">
              這裡沒有{ACTIVITY_KIND_ZH[activity]}預報，是{ACTIVITY_KIND_ZH[kind]}點，以上為{ACTIVITY_KIND_ZH[kind]}燈號。
            </p>
          )}

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["浪高", fmt(t.wave_height_m, " m")],
              ["風力", t.wind_scale == null ? "—" : `${t.wind_scale} 級`],
              ["水溫", fmt(t.water_temp_c == null ? null : Math.round(t.water_temp_c), "°C")],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-ocean-50 px-1 py-2">
                <dt className="text-[11px] text-slate-600">{k}</dt>
                <dd className="text-base font-extrabold tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>

          <MiniSlots slots={t.slots} kind={kind} className="mt-3" />
        </>
      )}

      <Link
        href={`/spots/${loc.slug}?activity=${kind}`}
        className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-abyss-800 text-sm font-bold text-white outline-none transition hover:bg-abyss-700 focus-visible:ring-2 focus-visible:ring-ocean-600 focus-visible:ring-offset-2"
      >
        查看詳情 →
      </Link>
    </div>
  );
}

/** 燈號說明：三種燈號 + 無預報（虛線空心圈，跟地圖 pin 同樣式） */
function Legend({ activity }: { activity: ActivityKind }) {
  const items: Rating[] = ["green", "yellow", "red"];

  return (
    <div className="mt-2 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-ocean-100">
      <p className="text-xs font-bold text-ocean-700">燈號說明（{ACTIVITY_KIND_ZH[activity]}）</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((r) => (
          <li key={r} className="flex items-center gap-1.5 text-xs text-slate-700">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: RATING_HEX[r].base }} aria-hidden="true" />
            <span>{RATING_SHORT[r]}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-xs text-slate-700">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-dashed border-slate-500 bg-slate-50" aria-hidden="true" />
          <span>無預報（非{ACTIVITY_KIND_ZH[activity]}點或沒資料）</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-slate-600">點標記看預覽，可滾動縮放、拖曳平移。</p>
    </div>
  );
}
