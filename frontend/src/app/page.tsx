import Link from "next/link";
import dynamic from "next/dynamic";
import ScrollScene from "@/components/landing/ScrollScene";
import StickyLandingCta from "@/components/landing/StickyLandingCta";
import DepthMeter from "@/components/landing/DepthMeter";
import { ChapterScrubber } from "@/components/landing/ChapterChrome";
import { CHAPTERS, CHAPTER_SPAN } from "@/components/landing/chapters";
import { CoverageInfo, DiveSurfContrastInfo, UpdateRhythmInfo } from "@/components/landing/InfoPoints";

// 三.js 場景整支動態載入、關掉 SSR：建構子會摸 window/WebGL，伺服器端執行會
// 直接炸掉；動態載入也讓這包最重的 JS 跟五章文字（下面全是 server component）
// 分開成不同的 chunk，文字的首次繪製不需要等它。詳細降級路徑見 DiveCanvas.tsx。
const DiveCanvas = dynamic(() => import("@/components/landing/DiveCanvas"), { ssr: false });

// 首頁＝一次持續的下潛。整頁只有一個滿版舞台（sticky），捲動不是把內容往上推，
// 而是把同一個潛水員往下推：三.js 場景從頭到尾連續運作（一個潛水員、隨深度
// 出現的生物、隨深度變化的光線與濃霧），只有章節文字會交叉淡出淡入——這正是
// 「持續下潛」跟「單純換圖」的差別，也是這一版重做的整個理由。
//
// 這個檔案是 server component，五章的文字在初次 HTML 就全部渲染出來。文字的
// 交叉淡出完全由 CSS 讀 ScrollScene 寫的單一 --progress 變數驅動；JS 沒跑或
// 使用者關掉動態效果時，.progress-armed 不存在，整頁自動退回一般的垂直長頁：
// 五章依序堆疊、全部可見可讀，背景是純 CSS 的深水漸層，不會有任何內容卡在
// opacity: 0，也不會出現空白的 3D 畫布。
export default function HomePage() {
  return (
    <ScrollScene>
      <StickyLandingCta />

      <div
        className="chapter-track"
        style={{ "--chapters": CHAPTERS.length, "--span": CHAPTER_SPAN } as React.CSSProperties}
      >
        {/* 捲過第一屏就讓浮動 CTA 出現；sticky 舞台本身不會離開視窗，所以哨兵
            要獨立放在捲動軌道上的第一屏底部，而不是放在 hero 裡面。 */}
        <div id="hero-sentinel" aria-hidden="true" className="chapter-sentinel" />

        <div className="chapter-stage">
          <Chapter at={0}>
            <p className="chapter-kicker">台灣海況預報</p>
            <h1 className="chapter-title">海況去不去</h1>
            <p className="chapter-body">今天能不能下水，潛水和衝浪分開判讀，一眼看懂。</p>
            <Link href="/explore" className="chapter-cta">
              開始使用
            </Link>
            <div className="scroll-cue">
              <span className="text-xs">往下看看</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="scroll-cue-arrow">
                <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </Chapter>

          <Chapter at={1}>
            <h2 className="chapter-title">同一道浪，兩種答案</h2>
            <p className="chapter-body">浪大對潛水是壞消息，對衝浪常常是好消息，所以兩邊分開算。</p>
            <div className="chapter-figure">
              <DiveSurfContrastInfo />
            </div>
          </Chapter>

          <Chapter at={2}>
            <h2 className="chapter-title">全台海況，一次看完</h2>
            <p className="chapter-body">從北海岸到墾丁，離島也在內，不用自己一個一個查。</p>
            <div className="chapter-figure">
              <CoverageInfo />
            </div>
          </Chapter>

          <Chapter at={3}>
            <h2 className="chapter-title">逐時預報，每 3 小時更新</h2>
            <p className="chapter-body">早上就看得到下午的浪和風，出發前再看一次最新版。</p>
            <div className="chapter-figure">
              <UpdateRhythmInfo />
            </div>
          </Chapter>

          <Chapter at={4}>
            <h2 className="chapter-title">下水前，先看今天的海況</h2>
            <p className="chapter-body">選一個下水點，潛水和衝浪的燈號會分開告訴你答案。</p>
            <Link href="/explore" className="chapter-cta chapter-cta-light">
              開始使用
            </Link>
          </Chapter>

          {/* 3D 場景掛在章節外面、z-index 最底層：章節文字會交叉淡出淡入，
              場景本身從頭到尾不中斷——這正是整頁讀起來像一次連續下潛、而不是
              五張輪播圖的原因。scrim 是給文字墊底的暗化漸層，同樣不隨章節切換。 */}
          <DiveCanvas />
          <div className="dive-scrim" aria-hidden="true" />
          <DepthMeter />
          <ChapterScrubber />
        </div>
      </div>
    </ScrollScene>
  );
}

// 單一章節的外框：--at 同時餵給 CSS 算「離目前進度多遠」（--pos / --vis2），
// data-chapter-at 則讓 ScrollScene 在切章時掛上 .is-active——只有作用中的章節
// 吃得到滑鼠事件，底下疊著的其他四章不會攔截到 CTA 的點擊。這一版章節底下
// 沒有照片了（3D 場景在章節外面、從頭到尾不中斷），.chapter 本身只剩文字。
function Chapter({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <section
      data-chapter-at={at}
      style={{ "--at": at } as React.CSSProperties}
      className={`chapter${at === 0 ? " is-active" : ""}`}
    >
      <div className="chapter-inner">
        <p className="chapter-index" aria-hidden="true">
          <span className="chapter-index-num">{CHAPTERS[at].num}</span>
          <span className="chapter-index-en">{CHAPTERS[at].en}</span>
        </p>
        {children}
      </div>
    </section>
  );
}
