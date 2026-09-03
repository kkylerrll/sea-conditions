import Link from "next/link";
import type { Location } from "@/lib/types";
import StatusBadge from "./StatusBadge";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY[d.getDay()]}）`;
}

const RATING_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  unknown: "bg-slate-300",
};

export default function SpotCard({ location }: { location: Location }) {
  const today = location.today;
  const rest = location.forecast.slice(1, 4);

  return (
    <Link
      href={`/spots/${location.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sea-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{location.name}</h2>
          <p className="text-xs text-slate-500">{location.region}</p>
        </div>
        {today ? <StatusBadge rating={today.rating} /> : <StatusBadge rating="unknown" />}
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">
        {today?.advice_text ?? location.blurb}
      </p>

      {today && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 py-1.5">
            <div className="text-[11px] text-slate-500">浪高</div>
            <div className="text-sm font-semibold tabular-nums">
              {today.wave_height_m != null ? `${today.wave_height_m} m` : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 py-1.5">
            <div className="text-[11px] text-slate-500">風力</div>
            <div className="text-sm font-semibold tabular-nums">
              {today.wind_scale != null ? `${today.wind_scale} 級` : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 py-1.5">
            <div className="text-[11px] text-slate-500">水溫</div>
            <div className="text-sm font-semibold tabular-nums">
              {today.water_temp_c != null ? `${today.water_temp_c}°` : "—"}
            </div>
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3">
          {rest.map((c) => (
            <div key={c.date} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${RATING_DOT[c.rating] ?? RATING_DOT.unknown}`} />
              {shortDate(c.date)}
            </div>
          ))}
        </div>
      )}

      <span className="mt-4 text-sm font-medium text-sea-600 group-hover:underline">看詳情與未來 3 天 →</span>
    </Link>
  );
}
