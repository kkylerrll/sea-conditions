"use client";

import Link from "next/link";
import { useState } from "react";
import TaiwanMap from "@/components/TaiwanMap";
import { RATING_HEX, ratingOf } from "@/lib/sea";
import type { Location } from "@/lib/types";

function fmt(v: number | null | undefined, unit: string) {
  return v == null ? "—" : `${v}${unit}`;
}

export default function HomeExplorer({ locations }: { locations: Location[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sel = locations.find((l) => l.slug === selected) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
      {/* 地圖 */}
      <div className="rounded-3xl border border-sky-100 bg-white/70 p-3 shadow-sm backdrop-blur sm:p-4">
        <TaiwanMap locations={locations} selected={selected} onSelect={setSelected} />
        <p className="mt-1 px-1 text-center text-xs text-slate-400">
          點地圖上的燈號看今日海況 · 綠＝適合 黃＝勉強 紅＝不建議
        </p>
      </div>

      {/* 右側：選取的點 + 全部清單 */}
      <div className="space-y-4 lg:sticky lg:top-4">
        {sel && sel.today && (
          <SelectedCard location={sel} onClose={() => setSelected(null)} />
        )}

        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {locations.map((loc) => {
            const c = RATING_HEX[ratingOf(loc.today?.rating ?? "unknown")];
            return (
              <li key={loc.slug}>
                <Link
                  href={`/spots/${loc.slug}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-sky-50/70"
                  onMouseEnter={() => setSelected(loc.slug)}
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

function SelectedCard({ location, onClose }: { location: Location; onClose: () => void }) {
  const t = location.today!;
  const c = RATING_HEX[ratingOf(t.rating)];

  return (
    <div className="rounded-2xl border-2 bg-white p-4 shadow-md" style={{ borderColor: c.base }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">{location.name}</h3>
          <p className="text-xs text-slate-400">{location.region}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="關閉"
          className="-m-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: c.soft, color: c.text }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: c.base }} />
        今日{c.label}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["浪高", fmt(t.wave_height_m, " m")],
          ["風力", t.wind_scale != null ? `${t.wind_scale} 級` : "—"],
          ["水溫", fmt(t.water_temp_c, "°")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 py-1.5">
            <div className="text-[11px] text-slate-500">{k}</div>
            <div className="text-sm font-semibold tabular-nums text-slate-800">{v}</div>
          </div>
        ))}
      </div>

      {t.advice_text && (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">{t.advice_text}</p>
      )}

      <Link
        href={`/spots/${location.slug}`}
        className="mt-3 block rounded-lg bg-sky-600 py-2 text-center text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        看完整海況與未來預報 →
      </Link>
    </div>
  );
}
