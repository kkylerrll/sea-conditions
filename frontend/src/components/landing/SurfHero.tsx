import { buildWavePath } from "./wave";

// Hero 區的海：不是單一波形往同一個方向平移（那是被使用者點名嫌假的做法），
// 而是 5 層、各自「2–3 個正弦分量疊加」的波形，彼此的捲動速度、方向都不同
// （第 2、5 層刻意反向），疊出海面前後層次跟真實海況一樣「亂中有序」的感覺。
// 手機（<640px）只留 3 層（拿掉最遠跟最近兩層），效能與畫面複雜度都降下來。
const W = 720; // 2 倍寬 tile，靠 translateX(-50%) 做無縫捲動（沿用 .sea-wave 手法）

type WaveLayer = {
  id: string;
  d: string;
  heightClass: string;
  opacity: number;
  color: string;
  duration: string;
  reverse: boolean;
  mobile: boolean;
  // edgeDistort：套用 landing-edge-distort 位移貼圖濾鏡，把浪緣打散成不規則形狀
  // （只套在最顯眼的前景層，不是全部 5 層都套，濾鏡成本才划算）。
  edgeDistort?: boolean;
  // dof：景深模糊 class（dof-blur-sm/md/lg），只給最遠的背景層。
  dof?: string;
};

const LAYERS: WaveLayer[] = [
  {
    id: "l1",
    d: buildWavePath(W, 60, 140, [
      { amp: 2.5, cycles: 2 },
      { amp: 1.2, cycles: 6, phase: 1.1 },
    ]),
    heightClass: "h-16 bottom-[40%]",
    opacity: 0.22,
    color: "#bae6fd",
    duration: "46s",
    reverse: false,
    mobile: false,
    dof: "dof-blur-sm",
  },
  {
    id: "l2",
    d: buildWavePath(W, 60, 140, [
      { amp: 4, cycles: 4 },
      { amp: 1.8, cycles: 10, phase: 2.0 },
    ]),
    heightClass: "h-20 bottom-[30%]",
    opacity: 0.32,
    color: "#7dd3fc",
    duration: "31s",
    reverse: true,
    mobile: true,
  },
  {
    id: "l3",
    d: buildWavePath(W, 70, 150, [
      { amp: 6, cycles: 6, phase: 0.4 },
      { amp: 3, cycles: 14, phase: 1.5 },
    ]),
    heightClass: "h-28 bottom-[18%]",
    opacity: 0.5,
    color: "#38bdf8",
    duration: "21s",
    reverse: false,
    mobile: true,
  },
  {
    id: "l4",
    d: buildWavePath(W, 78, 160, [
      { amp: 9, cycles: 4 },
      { amp: 4, cycles: 10, phase: 2.2 },
      { amp: 2, cycles: 16, phase: 0.8 },
    ]),
    heightClass: "h-40 bottom-[6%]",
    opacity: 0.78,
    color: "#0ea5e9",
    duration: "14s",
    reverse: false,
    mobile: true,
    edgeDistort: true,
  },
  {
    id: "l5",
    d: buildWavePath(W, 80, 150, [
      { amp: 12, cycles: 2, phase: 0.5 },
      { amp: 5, cycles: 8, phase: 1.1 },
    ]),
    heightClass: "h-28 bottom-0",
    opacity: 0.92,
    color: "#e0f2fe",
    duration: "9.5s",
    reverse: true,
    mobile: false,
    edgeDistort: true,
  },
];

export default function SurfHero() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] overflow-hidden"
    >
      {LAYERS.map((layer) => (
        <div
          key={layer.id}
          className={`wave-layer absolute inset-x-0 ${layer.heightClass} ${
            layer.mobile ? "" : "hidden sm:block"
          } ${layer.dof ?? ""}`}
        >
          <svg
            viewBox={`0 0 ${W / 2} 160`}
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <g
              className={`${layer.reverse ? "wave-drift wave-drift-reverse" : "wave-drift"} ${
                layer.edgeDistort ? "wave-edge-distort" : ""
              }`}
              style={{ animationDuration: layer.duration }}
            >
              <path d={layer.d} fill={layer.color} fillOpacity={layer.opacity} />
            </g>
          </svg>
        </div>
      ))}

      {/* 衝浪者：站在第 4 層浪頭上，隨浪體輕微起伏擺動（獨立於捲動速度的環境動畫）。
          rim-lit：從上方打來的柔和邊緣光，讓剪影不再是一片死板的純色。 */}
      <div className="surfer-rider absolute bottom-[13%] left-1/2 h-16 w-14 -translate-x-1/2 text-[#0b1b2e]/90 drop-shadow-[0_2px_4px_rgba(8,20,35,0.35)] sm:h-20 sm:w-16">
        <svg viewBox="0 0 100 90" className="rim-lit h-full w-full">
          <use href="#surfer-figure" />
        </svg>
      </div>

      {/* 顆粒質感：極低透明度雜訊，破除純向量的塑膠感；手機版直接關掉。 */}
      <div className="landing-grain absolute inset-0" aria-hidden="true" />
    </div>
  );
}
