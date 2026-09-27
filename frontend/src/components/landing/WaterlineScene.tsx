import { buildWavePath, buildWaveStroke } from "./wave";

// 跨越水面的過場：從水下往上看的湧浪底面 + 透光的光柱。
// 湧浪底面一樣是多重正弦疊加（跟 SurfHero 的水面浪不同組頻率，
// 避免兩段感覺像同一條浪往下貼）；光柱是純 CSS transform 搖擺，不吃 top/left。
const W = 640;

const UNDERSIDE_FILL = buildWavePath(W, 46, 200, [
  { amp: 10, cycles: 4 },
  { amp: 4, cycles: 12, phase: 1.3 },
]);
const UNDERSIDE_RIM = buildWaveStroke(W, 46, [
  { amp: 10, cycles: 4 },
  { amp: 4, cycles: 12, phase: 1.3 },
]);

const SHAFTS = [
  { x: 12, width: 7, rotate: -8, opacity: 0.32, duration: "7.5s" },
  { x: 30, width: 10, rotate: 5, opacity: 0.22, duration: "9s" },
  { x: 52, width: 6, rotate: -4, opacity: 0.28, duration: "6.5s" },
  { x: 70, width: 9, rotate: 7, opacity: 0.18, duration: "10.5s" },
  { x: 87, width: 5, rotate: -6, opacity: 0.24, duration: "8s" },
];

export default function WaterlineScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 水中光網（caustics）：feTurbulence 產生的光絲紋理，screen 疊加在水面附近，
          跟著自己的 transform 動畫漂移，濾鏡本身靜態、不逐幀重算。手機版直接不渲染
          （比 filter:none 更省，因為連 feTurbulence 的離線光柵化成本都省了）。 */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="caustics-layer absolute inset-0 hidden sm:block"
      >
        <rect x="0" y="0" width="100" height="100" fill="#eafcff" filter="url(#landing-caustics)" />
      </svg>

      {/* 透光光柱：由水面（區塊頂端）向下延伸，越往下越淡，模擬光線穿過水面折射。
          桌機版是「多段漸層 + 雜訊當透明度遮罩 + 重度模糊」的體積光（landing-shaft-volumetric），
          手機版直接退回原本的單純 CSS 漸層，兩者用 Tailwind 斷點切換，不用 JS 判斷視窗寬度。 */}
      <div className="absolute inset-x-0 top-0 h-full">
        {SHAFTS.map((s, i) => (
          <div
            key={i}
            className="light-shaft absolute top-0 h-[85%]"
            style={
              {
                left: `${s.x}%`,
                width: `${s.width}%`,
                opacity: s.opacity,
                animationDuration: s.duration,
                "--shaft-rot": `${s.rotate}deg`,
              } as React.CSSProperties
            }
          >
            <div className="h-full w-full bg-gradient-to-b from-sky-100 to-transparent sm:hidden" />
            <svg viewBox="0 0 10 100" preserveAspectRatio="none" className="hidden h-full w-full sm:block">
              <rect x="0" y="0" width="10" height="100" fill="url(#landing-shaft-gradient)" filter="url(#landing-shaft-volumetric)" />
            </svg>
          </div>
        ))}
      </div>

      {/* 湧浪底面：從水下仰視的浪形剪影，貼齊區塊頂端。邊緣加上位移貼圖濾鏡，
          水面線不再是數學上工整的正弦曲線，看起來更像真實、不規則的水面。 */}
      <svg
        viewBox={`0 0 ${W / 2} 200`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-40 w-full sm:h-52"
      >
        <g className="wave-drift wave-edge-distort" style={{ animationDuration: "24s" }}>
          <path d={UNDERSIDE_FILL} fill="#0c4a6e" fillOpacity="0.55" />
          <path d={UNDERSIDE_RIM} fill="none" stroke="#e0f2fe" strokeWidth="1.4" strokeOpacity="0.5" />
        </g>
      </svg>

      {/* 顆粒質感：極低透明度雜訊，手機版直接關掉。 */}
      <div className="landing-grain absolute inset-0" aria-hidden="true" />
    </div>
  );
}
