// 下潛段落的三個重點：每個重點都配一個「一眼看懂」的小視覺，
// 文字只負責補一句話，不是文字自己撐整個卡片。
// 全部是 server component（純 SVG + CSS），JS 沒執行也完整可讀。
import { MAP_H, MAP_W } from "@/lib/geo";
import { RATING_HEX } from "@/lib/sea";
import { TAIWAN_COAST_COARSE } from "@/lib/taiwan-paths";

const CARD = "dive-info-card";

// 沿海岸線大致分布的示意點（裝飾用，不對應真實座標精度）——
// 用來讓「13 個地區」讀起來像一張涵蓋地圖，而不是單純報數字。
const COVERAGE_DOTS: { x: number; y: number }[] = [
  { x: 200, y: 42 }, // 東北角
  { x: 268, y: 118 }, // 花蓮
  { x: 246, y: 232 }, // 台東
  { x: 165, y: 388 }, // 墾丁
  { x: 118, y: 330 }, // 西南沿海
  { x: 96, y: 210 }, // 西部沿海
  { x: 27, y: 202 }, // 澎湖
  { x: 233, y: 310 }, // 綠島
  { x: 240, y: 380 }, // 蘭嶼
  { x: 114, y: 347 }, // 小琉球
];

export function CoverageInfo() {
  return (
    <div data-reveal className={CARD}>
      <div className="flex items-center justify-center gap-5">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="h-24 w-auto shrink-0 text-sky-200/70 sm:h-28"
          aria-hidden="true"
        >
          <path d={TAIWAN_COAST_COARSE} fill="currentColor" />
          {COVERAGE_DOTS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={7} fill="#38bdf8" stroke="#f0f9ff" strokeWidth="1.5" />
          ))}
        </svg>
        <div className="text-left">
          <p className="text-3xl font-extrabold tabular-nums text-white sm:text-4xl">
            13<span className="ml-1 text-sm font-semibold text-sky-200">地區</span>
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-white sm:text-4xl">
            46<span className="ml-1 text-sm font-semibold text-sky-200">下水點</span>
          </p>
        </div>
      </div>
      <h3 className="mt-4 text-lg font-bold text-white sm:text-xl">全台海況，一次看完</h3>
      <p className="mt-1 text-sm leading-relaxed text-sky-100/90">
        從北海岸到墾丁，離島也在內，不用自己一個個查。
      </p>
    </div>
  );
}

export function DiveSurfContrastInfo() {
  const surf = RATING_HEX.green;
  const dive = RATING_HEX.red;
  return (
    <div data-reveal className={CARD}>
      <svg viewBox="0 0 200 34" className="mx-auto h-6 w-40 text-sky-200/70" aria-hidden="true">
        <path
          d="M0 17 Q17 4 34 17 T68 17 T102 17 T136 17 T170 17 T204 17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="mt-1 text-xs font-medium text-sky-200/80">同一道浪，浪高 2.2m</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div
          className="rounded-2xl border px-3 py-3"
          style={{ borderColor: dive.base, background: "rgba(244,63,94,0.12)" }}
        >
          <p className="text-xs font-semibold text-rose-100">潛水</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold" style={{ color: "#ffd7dd" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: dive.base }} aria-hidden="true" />
            不建議
          </p>
        </div>
        <div
          className="rounded-2xl border px-3 py-3"
          style={{ borderColor: surf.base, background: "rgba(16,185,129,0.14)" }}
        >
          <p className="text-xs font-semibold text-emerald-100">衝浪</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold" style={{ color: "#c9fbe8" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: surf.base }} aria-hidden="true" />
            適合下水
          </p>
        </div>
      </div>
      <h3 className="mt-4 text-lg font-bold text-white sm:text-xl">潛水與衝浪，看的不是同一件事</h3>
      <p className="mt-1 text-sm leading-relaxed text-sky-100/90">
        浪大對潛水是壞消息，對衝浪常常是好消息。
      </p>
    </div>
  );
}

// 24 小時錶面；台灣時間 02、05、08…23 點各更新一次（每 3 小時，共 8 次）
const CLOCK_TICKS = Array.from({ length: 24 }, (_, i) => i);
const UPDATE_TICKS = CLOCK_TICKS.filter((h) => (h - 2) % 3 === 0);

export function UpdateRhythmInfo() {
  return (
    <div data-reveal className={CARD}>
      <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20 sm:h-24 sm:w-24" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" stroke="#7dd3fc" strokeOpacity="0.35" strokeWidth="2" />
        {CLOCK_TICKS.map((h) => {
          const isUpdate = UPDATE_TICKS.includes(h);
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const r1 = isUpdate ? 34 : 38;
          const x1 = 50 + Math.cos(a) * r1;
          const y1 = 50 + Math.sin(a) * r1;
          const x2 = 50 + Math.cos(a) * 44;
          const y2 = 50 + Math.sin(a) * 44;
          return (
            <line
              key={h}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isUpdate ? "#7dd3fc" : "#7dd3fc"}
              strokeOpacity={isUpdate ? 0.95 : 0.3}
              strokeWidth={isUpdate ? 3 : 1.2}
              strokeLinecap="round"
            />
          );
        })}
        {UPDATE_TICKS.map((h) => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const cx = 50 + Math.cos(a) * 44;
          const cy = 50 + Math.sin(a) * 44;
          return (
            <g key={h} transform={`translate(${cx} ${cy})`}>
              <circle r="6" fill="none" stroke="#7dd3fc" strokeWidth="1.5" className="update-pulse" />
              <circle r="3" fill="#e0f2fe" />
            </g>
          );
        })}
        <circle cx="50" cy="50" r="2.5" fill="#e0f2fe" />
      </svg>
      <h3 className="mt-3 text-lg font-bold text-white sm:text-xl">逐時預報，每 3 小時更新</h3>
      <p className="mt-1 text-sm leading-relaxed text-sky-100/90">
        早上就看得到下午的浪和風，出發前再看一次最新版。
      </p>
    </div>
  );
}
