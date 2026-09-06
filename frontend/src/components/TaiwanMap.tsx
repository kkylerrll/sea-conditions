"use client";

import { MAP_H, MAP_W, project, SPOT_NUDGE } from "@/lib/geo";
import { RATING_HEX, ratingOf } from "@/lib/sea";
import { TAIWAN_COAST_COARSE } from "@/lib/taiwan-paths";
import type { Location } from "@/lib/types";

/* 台灣輪廓來自 src/lib/taiwan-paths.ts（Natural Earth 1:10m，public domain），
   由 scripts/gen-taiwan-paths.mjs 事先產生並 commit 進 repo，執行期不做任何運算。
   投影與 lib/geo.ts 完全一致，marker 才會落在對的位置。 */

interface Props {
  locations: Location[];
  selected: string | null;
  onSelect: (slug: string) => void;
}

export default function TaiwanMap({ locations, selected, onSelect }: Props) {
  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className="h-auto w-full max-h-[62vh] select-none sm:max-h-[70vh]"
      role="group"
      aria-label="台灣潛點分布地圖"
    >
      <defs>
        <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#bae6fd" />
        </linearGradient>
        <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#ecfccb" />
        </linearGradient>
        <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0c4a6e" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#ocean)" rx="18" />

      {/* 陸地（本島 + 澎湖 + 綠島 + 蘭嶼 + 小琉球，單一 path） */}
      <g filter="url(#landShadow)">
        <path
          d={TAIWAN_COAST_COARSE}
          fill="url(#land)"
          fillRule="evenodd"
          stroke="#84cc16"
          strokeWidth="1.4"
          strokeOpacity="0.6"
          strokeLinejoin="round"
        />
      </g>

      {/* 潛點 marker */}
      {locations.map((loc) => {
        const base = project(loc.lat, loc.lon);
        const nudge = SPOT_NUDGE[loc.slug] ?? { dx: 0, dy: 0 };
        const x = base.x + nudge.dx;
        const y = base.y + nudge.dy;
        const r = ratingOf(loc.today?.rating ?? "unknown");
        const c = RATING_HEX[r];
        const isSel = selected === loc.slug;
        // label 放右邊，靠近右緣的點放左邊
        const labelLeft = x > MAP_W - 74;
        const labelBelow = y < 40;

        return (
          <g
            key={loc.slug}
            role="button"
            tabIndex={0}
            aria-label={`${loc.name}，今日海況${c.label}`}
            aria-pressed={isSel}
            className="cursor-pointer outline-none [&:focus-visible_.pin-focus]:opacity-100"
            onClick={() => onSelect(loc.slug)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(loc.slug);
              }
            }}
          >
            {/* 觸控命中區 */}
            <circle cx={x} cy={y} r={20} fill="transparent" />
            <circle className="pin-focus opacity-0" cx={x} cy={y} r={13} fill="none" stroke="#0284c7" strokeWidth="2" />

            {!isSel && (
              <circle
                cx={x}
                cy={y}
                r={6}
                fill={c.base}
                className="origin-center animate-ping opacity-30 motion-reduce:hidden"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            )}

            <circle
              cx={x}
              cy={y}
              r={isSel ? 8 : 6}
              fill={c.base}
              stroke="#fff"
              strokeWidth={isSel ? 3 : 2}
            />

            <g
              transform={`translate(${labelLeft ? x - 10 : x + 10}, ${labelBelow ? y + 14 : y - 4})`}
              textAnchor={labelLeft ? "end" : "start"}
            >
              <text
                x={0}
                y={0}
                className="font-bold"
                fontSize="11"
                fill="#0f172a"
                stroke="#fff"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {loc.name}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
