// 底部的橫向進度條，等於整頁的播放頭：填色寬度直接吃 --progress。
//
// 左側原本還有一條章節刻度軸，已經被 DepthMeter（連續的深度讀數）取代——
// 章節刻度會把頁面讀成一份目錄，深度讀數才會讀成同一次下潛。
//
// 這只是狀態指示，真正的導覽是 CTA 按鈕與章節文字，所以整層 aria-hidden；
// 沒有 JS 時 .progress-armed 不存在，整條不顯示，不會留下一條永遠停在 0% 的假進度條。
import { CHAPTERS } from "./chapters";

export function ChapterScrubber() {
  return (
    <div className="chapter-scrubber" aria-hidden="true">
      <div className="chapter-scrubber-track">
        <div className="chapter-scrubber-fill" />
      </div>
      <div className="chapter-scrubber-marks">
        {CHAPTERS.map((c) => (
          <span key={c.at} data-rail-at={c.at} className="chapter-scrubber-mark">
            {c.num}
          </span>
        ))}
      </div>
    </div>
  );
}
