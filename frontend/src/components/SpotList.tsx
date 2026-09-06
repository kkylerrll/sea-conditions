// 地區內頁的「潛點 / 浪點細分」清單。海況數據是地區層級的，這裡列出各下水點的
// 靜態特性（底質、朝向、程度、深度…），之後會依 facing_deg 給每個點各自的燈號。

import {
  ACTIVITY_ZH,
  BOTTOM_ZH,
  depthLabel,
  ENTRY_ZH,
  LEVEL_ZH,
  SHELTER_ZH,
} from "@/lib/sea";
import type { Spot } from "@/lib/types";

const LEVEL_COLOR: Record<string, string> = {
  beginner: "bg-emerald-50 text-emerald-700",
  intermediate: "bg-amber-50 text-amber-700",
  advanced: "bg-rose-50 text-rose-700",
};

function SpotRow({ spot }: { spot: Spot }) {
  const meta = [
    spot.bottom ? BOTTOM_ZH[spot.bottom] ?? spot.bottom : null,
    spot.entry ? ENTRY_ZH[spot.entry] ?? spot.entry : null,
    depthLabel(spot.depth_min_m, spot.depth_max_m),
    spot.shelter && spot.shelter !== "semi" ? SHELTER_ZH[spot.shelter] ?? spot.shelter : null,
  ].filter(Boolean);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm font-bold text-slate-900">{spot.name}</h3>
        {spot.name_en && <span className="text-[11px] text-slate-400">{spot.name_en}</span>}
        {spot.level && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_COLOR[spot.level] ?? "bg-slate-100 text-slate-600"}`}>
            {LEVEL_ZH[spot.level] ?? spot.level}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {spot.activities.map((a) => (
          <span key={a} className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">
            {ACTIVITY_ZH[a] ?? a}
          </span>
        ))}
      </div>

      {meta.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">{meta.join(" · ")}</p>
      )}

      {spot.blurb && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{spot.blurb}</p>}

      {spot.coord_approx && (
        <p className="mt-1.5 text-[11px] text-slate-400">※ 座標為約略位置，尚待校正</p>
      )}
    </li>
  );
}

export default function SpotList({ spots }: { spots: Spot[] }) {
  if (spots.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-slate-500">
        這個地區的下水點（{spots.length}）
      </h2>
      <ul className="space-y-2">
        {spots.map((s) => (
          <SpotRow key={s.slug} spot={s} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">
        上方海況為整個地區的預報；各點實際浪況會因朝向與遮蔽而不同，之後會分別標示。
      </p>
    </section>
  );
}
