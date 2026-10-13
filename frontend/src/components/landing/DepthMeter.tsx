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
// 刻度用 progressAt() 換算成捲動軸上的位置，不是單純按深度值等比例擺放——
// 深度曲線的後段是非線性的（見 depth.ts），100/300/600/1000 這幾格理應越擠越密，
// 這正是「最後一段暴衝」的視覺線索，等比例擺放會把這個效果拉平、看不出加速。
import { DEPTH_TICKS, progressAt } from "./depth";

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
        {DEPTH_TICKS.map((d) => (
          <span key={d} className="depth-tick" style={{ top: `${progressAt(d) * 100}%` }}>
            <span className="depth-tick-mark" />
            <span className="depth-tick-label">{d}m</span>
          </span>
        ))}
        {/* 目前深度的游標：位置直接等於 --progress，跟深度計算曲線無關（曲線只管
            數字怎麼跳，游標本身還是捲動量的線性讀數）。 */}
        <span className="depth-cursor" />
      </div>
    </div>
  );
}
