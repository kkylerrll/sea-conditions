"use client";

import { MAP_H, MAP_W, project, SPOT_NUDGE } from "@/lib/geo";
import { RATING_HEX, ratingOf } from "@/lib/sea";
import type { Location } from "@/lib/types";

/* ---------- 台灣輪廓：座標點 → 平滑路徑 ---------- */
// 點依經緯度用 lib/geo 的投影算出，順時針從富貴角開始。

const COAST: [number, number][] = [
  [240, 6], [289, 39], [271, 58], [275, 92], [249, 157], [236, 214],
  [223, 259], [198, 299], [182, 314], [166, 397], [150, 397], [150, 365],
  [123, 335], [104, 314], [86, 270], [86, 227], [116, 150], [129, 122],
  [171, 58], [193, 35], [225, 17],
];

function smoothClosedPath(pts: [number, number][]): string {
  const n = pts.length;
  const p = (i: number) => pts[((i % n) + n) % n];
  let d = `M ${p(0)[0]} ${p(0)[1]} `;
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]} `;
  }
  return d + "Z";
}

const TAIWAN_PATH = smoothClosedPath(COAST);

const ISLETS: { cx: number; cy: number; rx: number; ry: number; rot?: number }[] = [
  { cx: 33, cy: 205, rx: 9, ry: 14 }, // 澎湖本島
  { cx: 24, cy: 194, rx: 4, ry: 5 }, // 澎湖北
  { cx: 40, cy: 222, rx: 3, ry: 4 }, // 澎湖南
  { cx: 108, cy: 352, rx: 5, ry: 5 }, // 小琉球
  { cx: 241, cy: 310, rx: 5, ry: 6 }, // 綠島
  { cx: 246, cy: 384, rx: 6, ry: 7 }, // 蘭嶼
];

/* ---------- 元件 ---------- */

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

      {/* 陸地 */}
      <g filter="url(#landShadow)">
        <path d={TAIWAN_PATH} fill="url(#land)" stroke="#84cc16" strokeWidth="1.4" strokeOpacity="0.6" />
        {ISLETS.map((is, i) => (
          <ellipse
            key={i}
            cx={is.cx}
            cy={is.cy}
            rx={is.rx}
            ry={is.ry}
            fill="url(#land)"
            stroke="#84cc16"
            strokeWidth="1.2"
            strokeOpacity="0.6"
          />
        ))}
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
