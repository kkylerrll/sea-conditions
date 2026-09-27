// 深度計：把捲動條改寫成潛水電腦錶的讀數。
//
// 這是把「翻頁」讀成「下沉」最關鍵的一個改動。原本左側是章節刻度（00/01/02…），
// 那是一份目錄，看的人自然把頁面理解成五個分開的段落；改成連續的公尺數之後，
// 同樣的捲動被讀成同一次下潛的深度變化，中間不存在「換到下一張」這件事。
//
// 數字由 ScrollScene 在既有的 rAF 裡直接寫進 textContent（見該檔的 depthEl），
// 不經過 React state：深度每一幀都在變，走 state 會每幀觸發一次 re-render，
// 而這裡要更新的其實只有一個文字節點。
//
// 刻度是靜態的 DOM，目前深度落在哪一段由 CSS 讀 --progress 算出來，不需要 JS
// 逐幀比對是第幾格。
import { DEPTH_TICKS, MAX_DEPTH_M } from "./depth";

export default function DepthMeter() {
  return (
    <div className="depth-meter" aria-hidden="true">
      <div className="depth-readout">
        {/* 初始值就是水面，沒有 JS 時這個讀數會停在 0.0，不會是空白或 NaN */}
        <span className="depth-value" data-depth-readout>
          0.0
        </span>
        <span className="depth-unit">m</span>
      </div>

      <div className="depth-scale">
        <span className="depth-scale-line" />
        {/* 刻度沿著整條軸依深度比例擺放，所以格與格的間距反映真實的深度差 */}
        {DEPTH_TICKS.map((d) => (
          <span key={d} className="depth-tick" style={{ top: `${(d / MAX_DEPTH_M) * 100}%` }}>
            <span className="depth-tick-mark" />
            <span className="depth-tick-label">{d}m</span>
          </span>
        ))}
        {/* 目前深度的游標：位置是 --progress 的連續函式，跟著捲動一路滑下去 */}
        <span className="depth-cursor" />
      </div>
    </div>
  );
}
