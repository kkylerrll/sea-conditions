// 產生「多個正弦波疊加」的海浪路徑，避免單一正弦重複到肉眼可辨的程度。
// 做法：同一條路徑由 2–3 個不同頻率（cycles）/振幅（amp）/相位（phase）的正弦分量加總，
// 峰谷的高低錯落就不會是規律的單一波形；配合外層多層、不同速度、不同方向的捲動動畫，
// 各層之間的疊加還會再打散一次視覺上的重複感。
//
// 為了能用 CSS `translateX(0) -> translateX(-50%)` 做到無縫循環捲動（沿用專案既有的
// .sea-wave 手法），每個分量的週期都刻意選成可以整除 360（半個 tile 寬度）的數字，
// 這樣路徑本身雖然數學上仍是週期函式，但因為是多個頻率相加，單一 tile（0–360）內
// 看不出「同一個波形被複製貼上」的痕跡。這是 CSS-only（不能用 canvas/WebGL）情境下
// 「無縫捲動」與「不規律外觀」兩個需求的務實折衷。

export type SineComponent = { amp: number; cycles: number; phase?: number };

/**
 * @param width   路徑總寬度（tile 寬度的 2 倍，因為要靠 translateX(-50%) 做無縫捲動）
 * @param baseY   波浪中線的 y 座標
 * @param floorY  路徑收尾要拉到的 y 座標（通常是可視區塊底部，填滿海面以下）
 * @param components 疊加的正弦分量；cycles 建議取能整除 360 的整數（如 2/3/4/6/8）
 */
export function buildWavePath(
  width: number,
  baseY: number,
  floorY: number,
  components: SineComponent[],
): string {
  const step = 8;
  const y = (x: number) =>
    components.reduce(
      (sum, c) => sum + c.amp * Math.sin((x / width) * Math.PI * 2 * c.cycles + (c.phase ?? 0)),
      baseY,
    );
  let d = `M 0 ${y(0).toFixed(1)}`;
  for (let x = step; x <= width; x += step) {
    d += ` L ${x.toFixed(1)} ${y(x).toFixed(1)}`;
  }
  d += ` L ${width} ${floorY} L 0 ${floorY} Z`;
  return d;
}

// 波浪外框線（不填滿，只描邊）：用在水面下段做「湧浪背面」的輪廓線。
export function buildWaveStroke(
  width: number,
  baseY: number,
  components: SineComponent[],
): string {
  const step = 8;
  const y = (x: number) =>
    components.reduce(
      (sum, c) => sum + c.amp * Math.sin((x / width) * Math.PI * 2 * c.cycles + (c.phase ?? 0)),
      baseY,
    );
  let d = `M 0 ${y(0).toFixed(1)}`;
  for (let x = step; x <= width; x += step) {
    d += ` L ${x.toFixed(1)} ${y(x).toFixed(1)}`;
  }
  return d;
}
