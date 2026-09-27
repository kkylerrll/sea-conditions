// 貫穿整個舞台的「水體」。這一層是整頁看起來像持續下沉、而不是單純換圖的關鍵：
// 它掛在章節**外面**，所以五張照片在底下交叉溶接時，水體本身從頭到尾都不中斷——
// 微粒一路往上飄、光從上方一路減弱、水色一路變深，形成一根連續的水柱，照片只是
// 這根水柱上的幾個停留點。
//
// 三層都只吃兩個由 ScrollScene 寫的變數，沒有逐幀 JS：
//   --progress    0→1，等於深度。決定水色、光量、微粒整體的掃過位移。
//   --scroll-vel  0→1，捲動快慢。決定微粒被拉長多少——停下來時微粒緩緩浮動，
//                 捲快時拉成細長的流線，這是「我正在移動」最直接的體感回饋。
import { BUBBLES, MARINE_SNOW, LIGHT_SHAFTS } from "./waterColumnField";

export default function WaterColumn() {
  return (
    <div className="water-column" aria-hidden="true">
      {/* 1. 上方來的光：越深越弱，模擬陽光被水吸收。 */}
      <div className="water-surface-glow" />
      <div className="water-shafts">
        {LIGHT_SHAFTS.map((s, i) => (
          <span
            key={i}
            className="water-shaft"
            style={
              {
                left: `${s.x}%`,
                width: `${s.width}%`,
                "--shaft-rotate": `${s.rotate}deg`,
                "--shaft-duration": s.duration,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* 2. 懸浮微粒（marine snow）：往上飄＝你正在往下沉，這是最強的下沉線索。
          整片微粒場有兩種運動疊加：一是永不停止的環境漂浮（CSS keyframes，
          停止捲動畫面也不會死掉），二是跟著 --progress 整體往上掃過去——後者
          讓捲動和微粒真的連動，而不是各動各的。 */}
      <div className="water-snow-field">
        {MARINE_SNOW.map((p, i) => (
          <span
            key={i}
            className="water-snow"
            style={
              {
                left: `${p.left}%`,
                top: `${p.top}%`,
                "--snow-size": `${p.size}px`,
                "--snow-duration": p.duration,
                "--snow-delay": p.delay,
                "--snow-opacity": p.opacity,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* 3. 氣泡：比微粒大、上升快、只在水下出現，補一點「有人在這裡呼吸」的生氣。 */}
      <div className="water-bubble-field">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="water-bubble"
            style={
              {
                left: `${b.left}%`,
                "--bubble-size": `${b.size}px`,
                "--bubble-duration": b.duration,
                "--bubble-delay": b.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* 4. 水色：疊在照片之上的連續色偏，越深越藍越暗。五張照片的色溫本來各不
          相同，這一層把它們統一收進同一根水柱的色階裡。 */}
      <div className="water-tint" />
    </div>
  );
}
