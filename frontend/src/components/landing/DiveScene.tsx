// 下潛段落的背景場景：潛水員、氣泡、三群不同深度的魚、透光光柱、深度暗化。
// 潛水員的垂直位置、光柱淡出、暗化程度全部是 --progress 的「連續函式」
// （CSS calc() 每次捲動都重新算一次，不是 JS one-shot 觸發、也不是播完就停的
// keyframe）——所以使用者往上捲，潛水員會跟著往上游回去，光柱、暗化也會同步變回去。
// 氣泡本身則是環境動畫（一直往上冒，跟捲動方向無關），停止捲動時畫面也不會靜止。
const BUBBLES = [
  { left: "38%", size: 10, delay: "0s", duration: "5.2s" },
  { left: "58%", size: 7, delay: "0.9s", duration: "4.4s" },
  { left: "46%", size: 13, delay: "1.8s", duration: "6.1s" },
  { left: "64%", size: 8, delay: "2.6s", duration: "4.9s" },
  { left: "34%", size: 6, delay: "0.4s", duration: "3.8s" },
  { left: "52%", size: 9, delay: "3.3s", duration: "5.6s" },
];

type Fish = { left: string; top?: string; scale: number };
type School = {
  id: string;
  top: string;
  color: string;
  opacity: number;
  duration: string;
  reverse?: boolean;
  mobile?: boolean;
  // dof：景深模糊 class，越深的魚群越模糊，讓最前景的 school-shallow 維持銳利、
  // 越後面的 school-mid/school-deep 越糊，強化「這群在背景」的空間感。
  dof?: string;
  fish: Fish[];
};

const SCHOOLS: School[] = [
  {
    id: "school-shallow",
    top: "10%",
    color: "#38bdf8",
    opacity: 0.55,
    duration: "24s",
    mobile: true,
    fish: [
      { left: "8%", top: "0px", scale: 1 },
      { left: "16%", top: "10px", scale: 0.8 },
      { left: "22%", top: "-6px", scale: 0.65 },
      { left: "13%", top: "16px", scale: 0.5 },
    ],
  },
  {
    id: "school-mid",
    top: "40%",
    color: "#0a6a72",
    opacity: 0.42,
    duration: "32s",
    reverse: true,
    mobile: true,
    dof: "dof-blur-sm",
    fish: [
      { left: "55%", top: "0px", scale: 0.9 },
      { left: "62%", top: "12px", scale: 0.7 },
      { left: "70%", top: "-8px", scale: 0.85 },
      { left: "66%", top: "18px", scale: 0.55 },
      { left: "58%", top: "6px", scale: 0.6 },
    ],
  },
  {
    id: "school-deep",
    top: "68%",
    color: "#0b4a52",
    opacity: 0.3,
    duration: "40s",
    mobile: false,
    dof: "dof-blur-md",
    fish: [
      { left: "30%", top: "0px", scale: 0.6 },
      { left: "36%", top: "8px", scale: 0.45 },
      { left: "42%", top: "-5px", scale: 0.5 },
      { left: "33%", top: "14px", scale: 0.35 },
    ],
  },
];

const CAUSTIC_SHAFTS = [
  { x: 15, width: 8, rotate: -6, duration: "8s" },
  { x: 34, width: 6, rotate: 4, duration: "10s" },
  { x: 55, width: 9, rotate: -5, duration: "7s" },
  { x: 76, width: 7, rotate: 6, duration: "9.5s" },
];

export default function DiveScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 深度暗化：疊在漸層之上再加一層，讓「越往下越暗」的過渡更明顯，
          純粹由 --progress 算出的不透明度，捲動方向不影響結果一致性。 */}
      <div className="dive-depth-veil absolute inset-0" />

      {/* 淺水層透光光柱＋水中光網：只出現在區塊上段，隨深度（--progress）淡出。
          caustics-layer 是 feTurbulence 產生的光絲紋理（screen 疊加，手機版不渲染）；
          光柱本體桌機版是體積光（雜訊遮罩＋重度模糊），手機版退回原本的簡單漸層。 */}
      <div className="dive-caustics absolute inset-x-0 top-0 h-[60vh]">
        {/* caustics 放在光柱「之後」，不要插在 .light-shaft 陣列前面——否則會把後面
            :nth-child(n+4) 那條手機瘦身規則的算法往後推一位，多砍掉一支光柱。 */}
        {CAUSTIC_SHAFTS.map((s, i) => (
          <div
            key={i}
            className="light-shaft absolute top-0 h-full"
            style={
              {
                left: `${s.x}%`,
                width: `${s.width}%`,
                animationDuration: s.duration,
                "--shaft-rot": `${s.rotate}deg`,
              } as React.CSSProperties
            }
          >
            <div className="h-full w-full bg-gradient-to-b from-sky-100/70 to-transparent sm:hidden" />
            <svg viewBox="0 0 10 100" preserveAspectRatio="none" className="hidden h-full w-full sm:block">
              <rect x="0" y="0" width="10" height="100" fill="url(#landing-shaft-gradient)" filter="url(#landing-shaft-volumetric)" />
            </svg>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="caustics-layer absolute inset-0 hidden sm:block">
          <rect x="0" y="0" width="100" height="100" fill="#eafcff" filter="url(#landing-caustics)" />
        </svg>
      </div>

      {/* 魚群：不同深度、不同顏色（越深越霧化，色相往藍綠偏移對應光吸收）、不同漂移
          方向與速度；越深的魚群疊上景深模糊（dof-blur-*），最前景的 school-shallow
          維持銳利，這一個技巧比其他任何裝飾都更能撐出「有空間深度」的感覺。 */}
      {SCHOOLS.map((school) => (
        <div
          key={school.id}
          className={`fish-school absolute inset-x-0 ${school.mobile ? "" : "hidden sm:block"} ${
            school.reverse ? "fish-drift-reverse" : "fish-drift"
          } ${school.dof ?? ""}`}
          style={{
            top: school.top,
            color: school.color,
            opacity: school.opacity,
            animationDuration: school.duration,
          }}
        >
          {school.fish.map((f, i) => (
            <svg
              key={i}
              viewBox="-2 -8 46 28"
              className="absolute h-4 w-7 sm:h-5 sm:w-9"
              style={{ left: f.left, top: f.top, transform: `scale(${f.scale})` }}
            >
              <use href="#fish-figure" />
            </svg>
          ))}
        </div>
      ))}

      {/* 潛水員：垂直位置＝--progress 的連續函式，捲動到哪、人就在哪，
          往回捲會平滑往上游回去；內層再疊一個環境用的緩慢擺動，不靠捲動也會動。
          diver-flip 是獨立一層，只轉剪影本體（頭下腳上／頭上腳下），氣泡另外放在
          外面（不隨 180 度翻轉），這樣氣泡才會一直視覺上「往上冒」，不會因為翻轉
          變成往下沉。 */}
      <div className="dive-diver-anchor absolute left-1/2 top-[4%]">
        {/* drop-shadow 放在不會被 180 度翻轉的外層（只有 diver-drift 的 ±2deg 小擺動），
            這樣陰影方向大致穩定，不會跟著頭上腳下/頭下腳上翻面；rim-lit 的
            filter: url(...) 只套在 svg 本體，跟 drop-shadow 分屬不同元素的 filter
            屬性，兩者互不覆蓋（同一個元素上疊兩個各自宣告 filter 的 class 會互相打架，
            後宣告的整個蓋掉前面那個，而不是合併）。 */}
        <div className="dive-diver-figure h-24 w-11 text-[#e6f4ff]/90 drop-shadow-[0_2px_6px_rgba(2,10,25,0.55)] sm:h-28 sm:w-12">
          <div className="diver-flip h-full w-full">
            <svg viewBox="0 0 60 140" className="rim-lit h-full w-full">
              <use href="#diver-figure" />
            </svg>
          </div>

          {/* 氣泡：從潛水員附近持續往上冒，跟捲動方向、剪影翻轉都無關的環境動畫 */}
          <div className="pointer-events-none absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2">
            {BUBBLES.map((b, i) => (
              <svg
                key={i}
                viewBox="0 0 8 8"
                className="bubble absolute text-sky-100/70"
                style={{
                  left: b.left,
                  width: b.size,
                  height: b.size,
                  animationDelay: b.delay,
                  animationDuration: b.duration,
                }}
              >
                <use href="#bubble-dot" />
              </svg>
            ))}
          </div>
        </div>
      </div>

      {/* 顆粒質感：極低透明度雜訊，手機版直接關掉。 */}
      <div className="landing-grain absolute inset-0" aria-hidden="true" />
    </div>
  );
}
