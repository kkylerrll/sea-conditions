// 第 13 輪：鏡頭俯仰角與潛水員入場，隨（平滑後的）捲動進度連續變化。
// 全部是進度的純函式——沒有任何「到了某個進度就切換」的分支，往回捲時原路倒帶。

import { SURFACE_END, SURFACE_HOLD } from "../depth";

/** 水下正常取景的俯仰角（rad，略微下傾）。沿用舊版 lookAt(…, y-0.15, z-12) 的角度。 */
export const LEVEL_PITCH = -0.0125;

// 俯仰角關鍵影格（捲動進度, rad）。劇本：
//   浮標段    略微下傾，看向地平線
//   開始下沉  慢慢低頭，看著水面逼近
//   剛沒入水  抬頭，回望剛才離開的水面（可以看到 Snell 窗與窗外的全反射）
//   之後      慢慢轉回水平，面向礁岩
const PITCH_KEYS: [number, number][] = [
  [0, -0.05],
  [SURFACE_HOLD, -0.05],
  [SURFACE_HOLD + (SURFACE_END - SURFACE_HOLD) * 0.38, -0.2],
  [SURFACE_HOLD + (SURFACE_END - SURFACE_HOLD) * 0.88, 0.3],
  [SURFACE_END + 0.04, 0.1],
  [SURFACE_END + 0.12, LEVEL_PITCH],
  [1, LEVEL_PITCH],
];

/** Catmull-Rom（非均勻間距用有限差分切線），單調區段外不會出現尖角，也不會每個關鍵影格停一下。 */
function catmull(keys: [number, number][], x: number): number {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i];
  const [x1, y1] = keys[i + 1];
  const h = x1 - x0;
  const tangent = (j: number) => {
    const a = keys[Math.max(j - 1, 0)];
    const b = keys[Math.min(j + 1, n - 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const m0 = tangent(i) * h;
  const m1 = tangent(i + 1) * h;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
}

export function cameraPitchAt(progress: number): number {
  return catmull(PITCH_KEYS, Math.max(0, Math.min(1, progress)));
}

/** 潛水員入場進度 0→1：鏡頭沉入水中、抬頭回望水面的動作結束之後，他才從側邊上方游進畫面。 */
export const DIVER_INTRO_START = SURFACE_END - 0.03;
export const DIVER_INTRO_END = SURFACE_END + 0.07;
