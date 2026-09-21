import Link from "next/link";
import ScrollScene from "@/components/landing/ScrollScene";
import StickyLandingCta from "@/components/landing/StickyLandingCta";

// 首頁：一條從水面到深海的垂直敘事。捲動時背景漸層從天空、經過水面、
// 一路沉到近乎全黑的深海，潛水往下、衝浪往上，這條軸線就是頁面本身。
//
// 這個檔案本身是 server component，所有文字內容都在初次 HTML 就渲染出來，
// 不吃 JS 也看得到、讀得懂；捲動時的漸入/漸層效果由 ScrollScene（client）
// 疊加上去，JS 沒執行或使用者關閉動態效果時，內容維持在「已顯示」的最終樣子。
export default function HomePage() {
  return (
    <ScrollScene>
      <StickyLandingCta />

      {/* ===== 1. Hero：水面上 ===== */}
      <section className="relative flex min-h-[100vh] flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <p className="text-sm font-semibold tracking-wide text-sky-700">台灣海況預報</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          海況去不去
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-700 sm:text-lg">
          今天能不能下水，潛水和衝浪分開判讀，一眼看懂。
        </p>
        <Link
          href="/explore"
          className="mt-8 flex min-h-11 min-w-[11rem] cursor-pointer items-center justify-center rounded-full bg-sky-700 px-6 text-base font-semibold text-white shadow-lg shadow-sky-900/10 outline-none transition-colors hover:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          開始使用
        </Link>

        {/* 給 StickyLandingCta 觀察用：離開視窗代表 hero 已經捲過去了 */}
        <div id="hero-sentinel" aria-hidden="true" className="absolute bottom-0 h-px w-full" />

        <div className="scroll-cue pointer-events-none absolute bottom-8 flex flex-col items-center gap-1 text-slate-700">
          <span className="text-xs">往下看看</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="scroll-cue-arrow"
          >
            <path
              d="M5 8l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      {/* ===== 2. 水面：跨越點 ===== */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 sm:min-h-[80vh] sm:px-6">
        <WaveDivider />
        <div
          data-reveal
          className="max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-center shadow-xl backdrop-blur-sm sm:p-8"
        >
          <h2 className="text-2xl font-bold text-white sm:text-3xl">今天到底能不能下水？</h2>
          <p className="mt-3 text-sm leading-relaxed text-sky-100 sm:text-base">
            同一片海，潛水和衝浪要的浪不一樣，浪大浪小，答案常常相反。
          </p>
        </div>
      </section>

      {/* ===== 3. 下潛：三個重點，深度標記一路往下 ===== */}
      <section className="relative flex min-h-[220vh] flex-col items-center gap-24 px-4 py-24 sm:px-6">
        <DepthMarker at={1} label="5m" />
        <PointCard
          heading="13 個地區、46 個下水點"
          body="從北海岸到墾丁，每天看當地實際的海況數字，不用自己一個個查。"
        />
        <DepthMarker at={2} label="18m" />
        <PointCard
          heading="潛水與衝浪分開判讀"
          body="浪大對潛水是壞消息，對衝浪是好消息，同一片海給兩種答案。"
        />
        <DepthMarker at={3} label="30m" />
        <PointCard
          heading="資料每天自動更新兩次"
          body="海況來自 Open-Meteo 海象預報，不用自己盯氣象圖。"
        />
      </section>

      {/* ===== 4. 深海：最終 CTA ===== */}
      <section className="relative flex min-h-[100vh] flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <div data-reveal className="max-w-md">
          <p className="text-sm font-medium text-sky-300">深海</p>
          <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
            下水前，先看今天的海況。
          </h2>
          <Link
            href="/explore"
            className="mt-8 inline-flex min-h-11 min-w-[11rem] cursor-pointer items-center justify-center rounded-full bg-sky-400 px-6 text-base font-semibold text-slate-950 shadow-lg outline-none transition-colors hover:bg-sky-300 focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            開始使用
          </Link>
        </div>
      </section>
    </ScrollScene>
  );
}

function PointCard({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      data-reveal
      className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-center shadow-xl backdrop-blur-sm sm:p-8"
    >
      <h3 className="text-xl font-bold text-white sm:text-2xl">{heading}</h3>
      <p className="mt-2 text-sm leading-relaxed text-sky-100 sm:text-base">{body}</p>
    </div>
  );
}

function DepthMarker({ at, label }: { at: 1 | 2 | 3; label: string }) {
  return (
    <div
      data-at={at}
      aria-hidden="true"
      className="depth-marker flex items-center gap-3 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
    >
      <span className="h-px w-10 bg-white/40" />
      <span className="text-xs font-semibold tracking-widest">{label}</span>
      <span className="h-px w-10 bg-white/40" />
    </div>
  );
}

// 水面分隔線：跟 SeaVisuals 同一套手繪波浪語言（.sea-wave 已處理 reduced-motion）。
function WaveDivider() {
  return (
    <svg
      viewBox="0 0 360 60"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-14 w-full opacity-70"
    >
      <g className="sea-wave" style={{ animationDuration: "9s" }}>
        <path
          d="M0 30 Q 30 10 60 30 T 120 30 T 180 30 T 240 30 T 300 30 T 360 30 L360 60 L0 60 Z"
          fill="#e0f2fe"
          fillOpacity="0.5"
        />
      </g>
    </svg>
  );
}
