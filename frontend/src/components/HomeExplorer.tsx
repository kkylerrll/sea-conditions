"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TaiwanMap from "@/components/TaiwanMap";
import { TempGauge, SeaStateHero } from "@/components/SeaVisuals";
import {
  ACTIVITY_KIND_ZH,
  type ActivityKind,
  RATING_HEX,
  ratingFor,
  supportsActivity,
} from "@/lib/sea";
import type { Location } from "@/lib/types";

function fmt(v: number | null | undefined, unit: string) {
  return v == null ? "—" : `${v}${unit}`;
}

export default function HomeExplorer({
  locations,
  activity,
}: {
  locations: Location[];
  activity: ActivityKind;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const sel = locations.find((l) => l.slug === selected) ?? null;

  // 切換活動別時，先前選的點可能不支援新活動，清掉避免顯示錯的燈號。
  useEffect(() => {
    setSelected(null);
  }, [activity]);

  const visible = locations.filter((loc) => supportsActivity(loc.activities, activity));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start xl:grid-cols-[1fr_24rem] xl:gap-6">
      {/* 地圖：中央主要區塊，寬度會隨可用空間放大（SVG viewBox 縮放，沒有固定像素框） */}
      <div className="rounded-3xl border border-sky-100 bg-white/70 p-3 shadow-sm backdrop-blur sm:p-4">
        <TaiwanMap locations={locations} selected={selected} onSelect={setSelected} activity={activity} />
        <Legend activity={activity} />
      </div>

      {/* 右側欄：今日最佳 → 選取地區摘要 → 完整清單 */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <TodayBestCard locations={visible} activity={activity} />

        {sel && sel.today && (
          <SelectedCard location={sel} activity={activity} onClose={() => setSelected(null)} />
        )}

        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visible.map((loc) => {
            const c = RATING_HEX[ratingFor(loc.today, activity)];
            return (
              <li key={loc.slug}>
                <Link
                  href={`/spots/${loc.slug}`}
                  className="flex items-center gap-3 px-4 py-3 outline-none transition hover:bg-sky-50/70 focus-visible:bg-sky-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.base }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{loc.name}</span>
                    <span className="block truncate text-xs text-slate-400">{loc.region}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-medium" style={{ color: c.text }}>
                      {c.label}
                    </span>
                    <span className="block text-xs tabular-nums text-slate-400">
                      浪 {fmt(loc.today?.wave_height_m, "m")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** 燈號說明：原本是地圖下方一行小字，改成獨立可讀的小面板。 */
function Legend({ activity }: { activity: ActivityKind }) {
  const items: { r: "green" | "yellow" | "red"; label: string }[] = [
    { r: "green", label: RATING_HEX.green.label },
    { r: "yellow", label: RATING_HEX.yellow.label },
    { r: "red", label: RATING_HEX.red.label },
  ];

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">燈號說明</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {items.map(({ r, label }) => (
          <li key={r} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
              style={{ background: RATING_HEX[r].base }}
              aria-hidden="true"
            />
            <span>{label}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
            style={{ background: "#94a3b8" }}
            aria-hidden="true"
          />
          <span>不支援{ACTIVITY_KIND_ZH[activity]}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">點地圖上的燈號看今日海況，可滾動縮放、拖曳平移。</p>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">今日最佳</h2>

      {list.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          今天沒有綠燈地區，{ACTIVITY_KIND_ZH[activity]}也沒有黃燈地區，條件都不理想，建議明天再看看。
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-400">
            {isFallback
              ? `今天沒有綠燈地區，以下是勉強可下的黃燈地區`
              : `今天適合${ACTIVITY_KIND_ZH[activity]}的地區`}
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {list.map((loc) => (
              <li key={loc.slug}>
                <Link
                  href={`/spots/${loc.slug}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 outline-none transition hover:bg-sky-50/70 focus-visible:bg-sky-50/70 focus-visible:ring-2 focus-visible:ring-sky-500"
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
                    <span className="block text-xs tabular-nums text-slate-400">
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
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">{location.name}</h3>
          <p className="text-xs text-slate-400">{location.region}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 outline-none transition hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-500"
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
        className="block rounded-lg bg-sky-600 py-2 text-center text-sm font-semibold text-white outline-none transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
      >
        看完整海況與未來預報 →
      </Link>
    </div>
  );
}
