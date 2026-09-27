// 單一章節的底圖層。照片放在章節「裡面」而不是另外疊一整落圖，是為了讓沒有 JS
// 的版本自動成立：一般文件流下，每一章就是「一張滿版照片配自己的文字」；捲動效果
// 啟用後，五章被絕對定位疊在同一格，同一份結構就變成交叉溶接的舞台。
//
// 照片上固定疊兩層純 CSS 漸層：一層由下往上收深、讓白字在任何一張照片上都讀得到，
// 一層四角壓暗的暈影把視線收回中央。深度色偏（越後面的章節越藍越暗）由 .chapter-track
// 上的共用水色層負責，不必每張圖各疊一次。
import { CHAPTERS } from "./chapters";

export default function ChapterMedia({ at }: { at: number }) {
  const c = CHAPTERS[at];
  return (
    <div className="chapter-media" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet={`/landing/${c.img}-960.webp`} type="image/webp" />
        <img
          src={`/landing/${c.img}-1920.webp`}
          alt=""
          // 第一章是 LCP，要最早開始下載。其餘四章在捲動舞台裡一開始就落在視窗範圍內，
          // 標 lazy 只是讓瀏覽器把它們排在第一張之後，不會真的延後到捲動才抓。
          loading={at === 0 ? "eager" : "lazy"}
          fetchPriority={at === 0 ? "high" : "low"}
          decoding="async"
          className="chapter-media-img"
          style={{ objectPosition: c.focus }}
        />
      </picture>
      <div className="chapter-media-scrim" />
      <div className="chapter-media-vignette" />
    </div>
  );
}
