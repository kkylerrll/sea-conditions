// 捲動進度與「深度」之間的換算。JS（深度讀數、三.js 場景的生物／燈光／濃霧）
// 和 CSS（深度計游標）都要用到同一條曲線，寫在這裡當單一來源，避免兩邊各自寫
// 一次然後慢慢對不上。
//
// 第 13 輪重做：首頁一開始是「站在海面上」，往下捲才慢慢沉進水裡。曲線分三段，
// 接縫處位置與速度都連續（C1），沒有任何一個捲動位置會讓畫面「跳」一下：
//
//   0 → SURFACE_HOLD        浮標段。鏡頭漂在海面（離海平面 EYE_HEIGHT_M），深度恆為負的眼高，
//                           不動。（章節 00 的文字在這裡。）
//   SURFACE_HOLD → SURFACE_END   下沉段。三次 Hermite：起點速度 0（慢慢開始往下）、
//                           終點速度與下一段起點相同，穿過水面（深度 0）到 SURFACE_END_DEPTH_M。
//   SURFACE_END → 1         下潛段。指數曲線 5m → 1000m：每單位捲動量讓「深度的對數」
//                           等速增加——也就是每捲一下，畫面上感受到的變化（水色變暗、
//                           生物種類交替）大致一樣多，不再有舊版最後 35% 的三次方暴衝。
//
// 這個檔案的 depth 一律指「鏡頭在平均海平面下幾公尺」。水上為負值（cameraDepthAt），
// 給讀數、水色、生物區間用的 depthAt() 則夾在 ≥ 0。
//
// 另外提供 remapLegacyProgress()：生物區間原本是用「舊捲動進度」寫的（REEF_RANGE =
// [0.02, 0.35] 之類），重映射到新的下潛段，不用逐一手改每個區間。

import { EYE_HEIGHT_M } from "./dive/ocean/config";

/** 這次下潛的最深處。 */
export const MAX_DEPTH_M = 1000;

/** 浮標段結束（開始下沉）的捲動進度。0.06 之前鏡頭只隨波浮動。 */
export const SURFACE_HOLD = 0.06;

/** 下沉完成的捲動進度：此時鏡頭在 SURFACE_END_DEPTH_M 深，水面在頭頂。 */
export const SURFACE_END = 0.22;

/** 下沉完成時的深度（m）。要夠深，潛水員才能整個人在水面下（見 engine.ts 的潛水員入場）。 */
export const SURFACE_END_DEPTH_M = 5;

/** 下潛段指數的陡度：越大，淺水停留越久、最後越快。5 → 40m 約在下潛段的 36%、
    100m 約 54%、300m 約 76%。 */
const DEEP_K = 5;

/** 浮標段的鏡頭「深度」（負＝在海平面之上）。 */
export const SURFACE_DEPTH_M = -EYE_HEIGHT_M;

const DEEP_SPAN = 1 - SURFACE_END;
const DEEP_NORM = Math.exp(DEEP_K) - 1;

function deepDepth(t: number): number {
  return SURFACE_END_DEPTH_M + (MAX_DEPTH_M - SURFACE_END_DEPTH_M) * ((Math.exp(DEEP_K * t) - 1) / DEEP_NORM);
}

// 下潛段起點的速度（m / 單位捲動進度），下沉段的終點速度必須與它相等。
const DEEP_SLOPE_AT_START = ((MAX_DEPTH_M - SURFACE_END_DEPTH_M) * DEEP_K) / DEEP_NORM / DEEP_SPAN;

const SINK_SPAN = SURFACE_END - SURFACE_HOLD;

/** 下沉段：三次 Hermite，u∈[0,1]。起點 (0, SURFACE_DEPTH_M) 速度 0，終點 (1, SURFACE_END_DEPTH_M) 速度 DEEP_SLOPE。 */
function sinkDepth(u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * SURFACE_DEPTH_M + h10 * 0 + h01 * SURFACE_END_DEPTH_M + h11 * DEEP_SLOPE_AT_START * SINK_SPAN;
}

/** 鏡頭在平均海平面下幾公尺（水上為負）。單調遞增、C1 連續。 */
export function cameraDepthAt(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= SURFACE_HOLD) return SURFACE_DEPTH_M;
  if (p <= SURFACE_END) return sinkDepth((p - SURFACE_HOLD) / SINK_SPAN);
  return deepDepth((p - SURFACE_END) / DEEP_SPAN);
}

/** 讀數／水色／燈光用的深度（≥ 0）。 */
export function depthAt(progress: number): number {
  return Math.max(0, cameraDepthAt(progress));
}

/** depthAt 的反函式（深度 m → 捲動進度），深度計刻度與生物區間用。depthM ≤ 0 回傳剛好穿過水面的進度。 */
export function progressAt(depthM: number): number {
  const d = Math.max(0, Math.min(MAX_DEPTH_M, depthM));
  if (d >= SURFACE_END_DEPTH_M) {
    const t = Math.log(1 + ((d - SURFACE_END_DEPTH_M) / (MAX_DEPTH_M - SURFACE_END_DEPTH_M)) * DEEP_NORM) / DEEP_K;
    return SURFACE_END + t * DEEP_SPAN;
  }
  // 下沉段沒有封閉解：二分搜尋（單調）。
  let lo = SURFACE_HOLD;
  let hi = SURFACE_END;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cameraDepthAt(mid) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 深度計刻度。 */
export const DEPTH_TICKS = [0, 10, 20, 40, 100, 300, 600, 1000];

/** 生物不能出現在水面之上，也不要在鏡頭剛沒入水時就貼著水面：最淺的出現深度。 */
export const MIN_CREATURE_DEPTH_M = 4;

/**
 * 把舊版「進度區間」的端點（0..1，第 12 輪以前整段捲動都在水下）換成新曲線的進度。
 * 舊版整段 0..1 都是下潛；現在前面 SURFACE_END 是水面段，下潛只佔後面 (1 - SURFACE_END)，
 * 所以做線性重映射：new = SURFACE_END + old × (1 - SURFACE_END)。這樣每種生物仍然落在
 * 原本設計的「第幾章」附近（礁魚在 01、魚群在 02……），不用逐一手改區間。
 * 下緣另外夾在 MIN_CREATURE_DEPTH_M 之後：鏡頭沒入水之前不會有任何生物。端點 1.0 維持 1.0。
 */
export function remapLegacyProgress(legacyProgress: number): number {
  if (legacyProgress >= 1) return 1;
  return Math.max(SURFACE_END + legacyProgress * (1 - SURFACE_END), progressAt(MIN_CREATURE_DEPTH_M));
}

/**
 * 場景的「暗化程度」0→1，給三.js 的背景色／濃霧／燈光衰減用——刻意跟 depthAt() 的線性
 * 公尺數分開算，不要用 depthAt(progress) / MAX_DEPTH_M：MAX_DEPTH_M 是 1000，淺水段
 * （0～40m）換算成 0～1000 只佔 0～0.04，畫面幾乎不會變暗。
 *
 * 這裡是兩個指數衰減相加（淺水快、深處慢），整條曲線平滑沒有轉折：
 *   5m≈0.07、20m≈0.25、40m≈0.41、100m≈0.66、300m≈0.85、1000m=1。
 * 水上（深度 0）為 0。
 */
const DARK_A = 0.62;
const DARK_TAU_A = 45;
const DARK_TAU_B = 400;
const DARK_RAW_MAX = 1 - DARK_A * Math.exp(-MAX_DEPTH_M / DARK_TAU_A) - (1 - DARK_A) * Math.exp(-MAX_DEPTH_M / DARK_TAU_B);

export function environmentDarkness(progress: number): number {
  const d = depthAt(progress);
  const raw = 1 - DARK_A * Math.exp(-d / DARK_TAU_A) - (1 - DARK_A) * Math.exp(-d / DARK_TAU_B);
  return Math.min(1, raw / DARK_RAW_MAX);
}
