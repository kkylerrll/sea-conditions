"use client";

// /explore?view=week：未來 N 天哪天最適合（docs/design/best-day.md）。

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Freshness from "@/components/Freshness";
import FavoritesEmpty from "@/components/FavoritesEmpty";
import { bestDay, cellFor, collectDates, dayStats, sortRows, type DayStat } from "@/lib/bestDay";
import { favoritesFilterRemembered, rememberFavoritesFilter, useFavorites } from "@/lib/favorites";
import { relativeDayWord, shortDateLabel, todayInTaipei } from "@/lib/format";
import {
  ACTIVITY_KIND_ZH,
  type ActivityKind,
  GROUP_ORDER,
  RATING_HEX,
  RATING_SHORT,
  type RegionGroup,
  regionGroup,
  supportsActivity,
} from "@/lib/sea";
import type { Location, Rating } from "@/lib/types";

export type WeekFilter = "全部" | RegionGroup;
const FILTERS: WeekFilter[] = ["全部", ...GROUP_ORDER];

/** 「今天 11/19（四）」「明天 11/20（五）」「11/21（六）」 */
function dayTitle(date: string, today: string): string {
  const w = relativeDayWord(date, today);
  return w === "今天" || w === "明天" ? `${w} ${shortDateLabel(date)}` : shortDateLabel(date);
}

function weekdayPart(date: string): string {
  const s = shortDateLabel(date);
  return s.slice(s.indexOf("（"));
}

function dayWord(date: string, today: string): string {
  const w = relativeDayWord(date, today);
  if (w === "今天" || w === "明天") return w;
  return shortDateLabel(date).split("（")[0];
}

function BestTag() {
  return <span className="rounded-full bg-coral-700 px-2.5 py-0.5 text-xs font-bold text-white">最佳</span>;
}

function Dot({ rating, size = "h-2.5 w-2.5" }: { rating: Rating; size?: string }) {
  if (rating === "unknown") {
    return (
      <span
        className={`${size} shrink-0 rounded-full border-2 border-dashed border-slate-500 bg-slate-50`}
        aria-hidden="true"
      />
    );
  }
  return <span className={`${size} shrink-0 rounded-full`} style={{ background: RATING_HEX[rating].base }} aria-hidden="true" />;
}

export default function BestDays({
  locations,
  activity,
  latest,
}: {
  locations: Location[];
  activity: ActivityKind;
  latest: string | null | undefined;
}) {
  const today = todayInTaipei();
  const actZh = ACTIVITY_KIND_ZH[activity];
  const [filter, setFilter] = useState<WeekFilter>("全部");
  const [favOn, setFavOn] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const allChipRef = useRef<HTMLButtonElement | null>(null);
  const fav = useFavorites();

  // 跟今天檢視共用「只看收藏」的記憶
  useEffect(() => {
    if (fav.ready && favoritesFilterRemembered() && fav.slugs.length > 0) setFavOn(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fav.ready]);

  const favCount = fav.ready ? fav.slugs.length : 0;
  const favSet = useMemo(() => new Set(fav.slugs), [fav.slugs]);

  const supported = useMemo(
    () => locations.filter((l) => supportsActivity(l.activities, activity)),
    [locations, activity],
  );
  // 欄用全部支援該活動的地區來算，切換區域時欄位不跳動
  const dates = useMemo(() => collectDates(supported, today), [supported, today]);
  const n = dates.length;

  const rows = useMemo(() => {
    if (favOn) return supported.filter((l) => favSet.has(l.slug));
    if (filter === "全部") return supported;
    return supported.filter((l) => regionGroup(l.region) === filter);
  }, [supported, filter, favOn, favSet]);

  const stats = useMemo(() => dayStats(rows, dates, activity), [rows, dates, activity]);
  const best = useMemo(() => bestDay(stats), [stats]);
  const selected = picked && dates.includes(picked) ? picked : best?.date ?? dates[0];
  const sorted = useMemo(() => (selected ? sortRows(rows, selected, activity) : rows), [rows, selected, activity]);

  const regionName = favOn ? "收藏" : filter === "全部" ? "全部區域" : filter;
  const allUnknown = stats.length > 0 && stats.every((s) => s.allUnknown);

  function chooseFilter(f: WeekFilter) {
    setFilter(f);
    setFavOn(false);
    setPicked(null);
    rememberFavoritesFilter(false);
  }

  function chooseFavorites() {
    setFavOn(true);
    setPicked(null);
    rememberFavoritesFilter(true);
  }

  function showAll() {
    chooseFilter("全部");
    requestAnimationFrame(() => allChipRef.current?.focus());
  }

  const chipCls = (on: boolean) =>
    `min-h-11 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ocean-600 focus-visible:ring-offset-2 ${
      on ? "bg-abyss-800 text-white shadow-soft" : "bg-white text-ocean-700 ring-1 ring-ocean-200 hover:bg-ocean-50"
    }`;

  const chips = (
    <div
      role="group"
      aria-label="篩選區域"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {FILTERS.map((f) => {
        const on = !favOn && filter === f;
        const chip = (
          <button
            key={f}
            ref={f === "全部" ? allChipRef : undefined}
            type="button"
            aria-pressed={on}
            onClick={() => chooseFilter(f)}
            className={chipCls(on)}
          >
            {f}
          </button>
        );
        if (f !== "全部") return chip;
        // 「收藏」chip 接在「全部」後面
        return [
          chip,
          <button key="收藏" type="button" aria-pressed={favOn} onClick={chooseFavorites} className={chipCls(favOn)}>
            收藏
            {favCount > 0 && <span className="tabular-nums"> {favCount}</span>}
          </button>,
        ];
      })}
    </div>
  );

  let body: React.ReactNode;
  if (n < 2 || allUnknown) {
    body = (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {n < 2 ? "目前只有今天的預報，還沒辦法比較哪天比較好。" : "這幾天的預報還沒抓到，按上方「重新抓海況」試試。"}
      </div>
    );
  } else if (rows.length === 0) {
    body = !favOn ? (
      <p className="card-clean p-4 text-sm text-slate-600">這個區域沒有{actZh}地區，換一個區域看看。</p>
    ) : favCount === 0 ? (
      <FavoritesEmpty onShowAll={showAll} />
    ) : (
      <div className="card-clean p-4 text-sm text-slate-600">
        <p>你收藏的地區都沒有{actZh}預報。</p>
        <button
          type="button"
          onClick={showAll}
          className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white px-4 text-sm font-semibold text-ocean-700 outline-none ring-1 ring-ocean-200 transition hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-ocean-600"
        >
          看全部地區
        </button>
      </div>
    );
  } else {
    body = (
      <>
        <Conclusion
          regionName={regionName}
          actZh={actZh}
          best={best}
          n={n}
          today={today}
        />
        <DayPicker
          stats={stats}
          bestDate={best?.date ?? null}
          selected={selected}
          onPick={setPicked}
          today={today}
        />
        <Table
          rows={sorted}
          dates={dates}
          selected={selected}
          activity={activity}
          regionName={regionName}
          today={today}
        />
        <Legend />
        <Freshness iso={latest} />
      </>
    );
  }

  return (
    <section aria-labelledby="bestday-title" className="mx-auto max-w-5xl space-y-4">
      <h2 id="bestday-title" className="sr-only">
        未來 {n} 天{actZh}比較
      </h2>
      {chips}
      {body}
    </section>
  );
}

function Conclusion({
  regionName,
  actZh,
  best,
  n,
  today,
}: {
  regionName: string;
  actZh: string;
  best: DayStat | null;
  n: number;
  today: string;
}) {
  const tone: Rating = !best ? "red" : best.green > 0 ? "green" : "yellow";
  return (
    <div aria-live="polite">
      <div className="card-clean border-l-[6px] p-4 sm:p-6" style={{ borderLeftColor: RATING_HEX[tone].base }}>
        <p className="text-xs font-semibold tracking-wide text-ocean-700">
          {regionName}・最適合{actZh}的一天
        </p>
        {best ? (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
              {dayTitle(best.date, today)}
              <BestTag />
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {best.green > 0
                ? `${best.green} 個地區適合、${best.yellow} 個勉強可下`
                : `這 ${n} 天沒有綠燈，這天相對最好：${best.yellow} 個勉強可下`}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
              這 {n} 天都不建議{actZh}
            </p>
            <p className="mt-1 text-sm text-slate-700">可以切到其他區域，或過兩天再回來看</p>
          </>
        )}
      </div>
    </div>
  );
}

function DayPicker({
  stats,
  bestDate,
  selected,
  onPick,
  today,
}: {
  stats: DayStat[];
  bestDate: string | null;
  selected: string | undefined;
  onPick: (d: string) => void;
  today: string;
}) {
  const many = stats.length > 4;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-slate-900">選一天看排名</legend>
      <div className={many ? "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" : "grid grid-cols-4 gap-2"}>
        {stats.map((s) => {
          const on = s.date === selected;
          const isBest = s.date === bestDate;
          return (
            <label key={s.date} className={`relative ${many ? "w-[5.5rem] shrink-0 sm:w-auto sm:flex-1" : ""}`}>
              <input
                type="radio"
                name="bestday-pick"
                value={s.date}
                checked={on}
                onChange={() => onPick(s.date)}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-[4.5rem] cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-white p-2.5 text-left transition hover:bg-ocean-50 peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-600 peer-focus-visible:ring-offset-2 sm:p-3 ${
                  on ? "ring-2 ring-abyss-800" : "ring-1 ring-ocean-200"
                }`}
              >
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-sm font-bold text-slate-900">
                    {dayWord(s.date, today)}
                    <span className="hidden sm:inline">
                      {relativeDayWord(s.date, today) === "今天" || relativeDayWord(s.date, today) === "明天"
                        ? ` ${shortDateLabel(s.date).split("（")[0]}`
                        : ""}
                    </span>
                  </span>
                  <span className="text-xs text-slate-600 sm:text-sm sm:font-bold sm:text-slate-900">
                    {weekdayPart(s.date)}
                  </span>
                  {isBest && (
                    <span className="hidden sm:inline-flex">
                      <BestTag />
                    </span>
                  )}
                </span>
                {s.allUnknown ? (
                  <span className="mt-1 text-xs text-slate-600">無資料</span>
                ) : (
                  <span className="mt-1 flex flex-wrap gap-x-2 text-xs tabular-nums text-slate-700">
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <Dot rating="green" size="h-2 w-2" />
                      {s.green}
                      <span className="hidden sm:inline">適合</span>
                    </span>
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <Dot rating="yellow" size="h-2 w-2" />
                      {s.yellow}
                      <span className="hidden sm:inline">普通</span>
                    </span>
                    <span className="sr-only">
                      {s.green} 個適合、{s.yellow} 個普通
                    </span>
                  </span>
                )}
                {isBest && (
                  <span className="mt-1 sm:hidden">
                    <BestTag />
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Table({
  rows,
  dates,
  selected,
  activity,
  regionName,
  today,
}: {
  rows: Location[];
  dates: string[];
  selected: string | undefined;
  activity: ActivityKind;
  regionName: string;
  today: string;
}) {
  const many = dates.length > 4;
  const actZh = ACTIVITY_KIND_ZH[activity];
  return (
    <div className={`card-clean ${many ? "overflow-x-auto" : "overflow-hidden"}`}>
      <table className={`w-full table-fixed text-sm ${many ? "min-w-[34rem]" : ""}`}>
        <caption className="sr-only">
          {regionName}各地區未來 {dates.length} 天{actZh}燈號，依{selected ? dayTitle(selected, today) : ""}排序
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={`w-[104px] bg-sand px-3 py-2 text-left text-xs font-semibold text-slate-600 sm:w-56 ${
                many ? "sticky left-0 z-10" : ""
              }`}
            >
              地區
            </th>
            {dates.map((d) => {
              const on = d === selected;
              return (
                <th
                  key={d}
                  scope="col"
                  aria-sort={on ? "descending" : undefined}
                  className={`w-[59px] bg-sand px-1.5 py-2 text-left text-xs font-semibold sm:w-auto sm:px-3 ${
                    on ? "text-abyss-800" : "text-slate-600"
                  }`}
                >
                  <span className="block">
                    {dayWord(d, today)}
                    {on && <span aria-hidden="true">▼</span>}
                  </span>
                  <span className="block font-normal">{weekdayPart(d)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.slug} className="border-t border-ocean-100">
              <th
                scope="row"
                className={`px-3 py-2 text-left align-middle font-normal ${many ? "sticky left-0 z-10 bg-white" : ""}`}
              >
                <span className="block truncate font-bold text-slate-900">{l.name}</span>
                <span className="hidden truncate text-xs text-slate-600 sm:block">{l.region}</span>
              </th>
              {dates.map((d) => {
                const cell = cellFor(l, d, activity);
                const c = RATING_HEX[cell.rating];
                return (
                  <td key={d} className={`p-0 ${d === selected ? "bg-ocean-50" : ""}`}>
                    <Link
                      href={`/spots/${l.slug}?activity=${activity}`}
                      aria-label={`${l.name}，${dayTitle(d, today)}，${actZh}${c.label}`}
                      className="flex min-h-11 items-center gap-1 px-1.5 text-[11px] font-semibold outline-none hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ocean-600 sm:gap-1.5 sm:px-3 sm:text-sm"
                      style={{ color: c.text }}
                    >
                      <Dot rating={cell.rating} />
                      <span className="truncate">{cell.rating === "unknown" ? "無資料" : RATING_SHORT[cell.rating]}</span>
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  const items: Rating[] = ["green", "yellow", "red"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700">
      {items.map((r) => (
        <span key={r} className="flex items-center gap-1.5">
          <Dot rating={r} />
          {RATING_SHORT[r]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <Dot rating="unknown" />
        無資料
      </span>
      <span className="text-slate-600">點格子看那個地區的詳情。</span>
    </div>
  );
}
