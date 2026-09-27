import Link from "next/link";
import ScrollScene from "@/components/landing/ScrollScene";
import StickyLandingCta from "@/components/landing/StickyLandingCta";
import ChapterMedia from "@/components/landing/ChapterMedia";
import WaterColumn from "@/components/landing/WaterColumn";
import DepthMeter from "@/components/landing/DepthMeter";
import { ChapterScrubber } from "@/components/landing/ChapterChrome";
import { CHAPTERS, CHAPTER_SPAN } from "@/components/landing/chapters";
import { CoverageInfo, DiveSurfContrastInfo, UpdateRhythmInfo } from "@/components/landing/InfoPoints";

// 首頁＝一支五章的短片。整頁只有一個滿版舞台（sticky），捲動不是把內容往上推，
// 而是在章節之間過帶：底圖交叉溶接、文字上浮換頁、左側刻度軸與底部進度條跟著走。
//
// 這個檔案是 server component，五章的文字在初次 HTML 就全部渲染出來。捲動效果
// 完全由 CSS 讀 ScrollScene 寫的單一 --progress 變數驅動，JS 沒跑或使用者關掉動態
// 效果時，.progress-armed 不存在，整頁自動退回一般的垂直長頁：五章依序堆疊、
// 每張照片配自己的文字、全部可見可讀，不會有任何內容卡在 opacity: 0。
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
            <h2 className="chapter-title">資料一天更新兩次</h2>
            <p className="chapter-body">早晚各一次，出發前看到的都是最新的那一版。</p>
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

          {/* 水體與深度計都掛在章節外面：章節會交叉溶接，這兩者不會——這正是整頁
              讀起來像一次連續下潛、而不是五張輪播圖的原因。 */}
          <WaterColumn />
          <DepthMeter />
          <ChapterScrubber />
        </div>
      </div>
    </ScrollScene>
  );
}

// 單一章節的外框：--at 同時餵給 CSS 算「離目前進度多遠」（--pos / --vis），
// data-chapter-at 則讓 ScrollScene 在切章時掛上 .is-active——只有作用中的章節
// 吃得到滑鼠事件，底下疊著的其他四章不會攔截到 CTA 的點擊。
function Chapter({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <section
      data-chapter-at={at}
      style={{ "--at": at } as React.CSSProperties}
      className={`chapter${at === 0 ? " is-active" : ""}`}
    >
      <ChapterMedia at={at} />
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
