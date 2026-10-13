// 捲動進度與「深度」之間的換算。JS（深度讀數、三.js 場景的生物／燈光／濃霧）
// 和 CSS（深度計游標）都要用到同一條曲線，寫在這裡當單一來源，避免兩邊各自寫
// 一次然後慢慢對不上。
//
// 曲線分兩段：
//   0     → 0.65  線性對應 0 → 40m。這段是「寫實潛水」，深度感要跟捲動量成比例，
//                  使用者才能用捲動速度估自己下潛的快慢。
//   0.65 → 1      非線性對應 40m → 1000m（三次方 easing）。這段是「墜入深海」，
//                  故意讓讀數在最後一小段捲動裡暴衝——40 幾乎不動、快到底時
//                  幾百公尺幾百公尺地跳，賣的就是「一腳踩空掉進深淵」的感覺。
//
// 0.65 這個切點（原本是 0.8）是第二輪回饋改的：使用者反映鮟鱇魚／水母幾乎沒
// 看到就結束了——深海段只分到 0.2 的捲動長度，生物又大多擺在很深的地方，
// 等於是在極短的捲動窗口裡衝過一大段深度，根本來不及看清楚。分給深海段更長
// 的捲動距離（0.35，幾乎是原本的兩倍），生物才有時間被看到。
//
// 拿掉的東西：舊版的 SURFACE_PORTION（0.45）。那個值只是因為章節 00、01 曾經是
// 水面上的衝浪照片才需要——現在整頁一開始就是水下，深度從 progress=0 就開始算，
// 這個理由已經不存在，全部拿掉（包含 globals.css 裡兩處讀它的地方）。

/** 寫實段（線性）結束的深度，也是墜入深海段的起點。 */
export const SHALLOW_DEPTH_M = 40;

/** 這次下潛的最深處，只在最後一小段捲動才會逼近。 */
export const MAX_DEPTH_M = 1000;

/** 寫實段佔掉的捲動比例；之後的 0.35 全部用來墜落——深海生物需要這段長度才有
    機會被看到，見上面的說明。 */
export const SHALLOW_PROGRESS = 0.65;

/** 墜落段的 easing 指數：越大，讀數在接近底部時暴衝得越明顯。 */
const PLUNGE_EXPONENT = 3;

/** 深度計刻度：前段等距（呼應線性），後段間距故意越擠越密，本身就是「加速」的視覺。 */
export const DEPTH_TICKS = [0, 10, 20, 30, 40, 100, 300, 600, 1000];

export function depthAt(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= SHALLOW_PROGRESS) {
    return (p / SHALLOW_PROGRESS) * SHALLOW_DEPTH_M;
  }
  const t = (p - SHALLOW_PROGRESS) / (1 - SHALLOW_PROGRESS);
  return SHALLOW_DEPTH_M + (MAX_DEPTH_M - SHALLOW_DEPTH_M) * Math.pow(t, PLUNGE_EXPONENT);
}

/** depthAt 的反函式，用來把深度計的刻度放到捲動軸上對應的位置。 */
export function progressAt(depthM: number): number {
  const d = Math.max(0, Math.min(MAX_DEPTH_M, depthM));
  if (d <= SHALLOW_DEPTH_M) {
    return (d / SHALLOW_DEPTH_M) * SHALLOW_PROGRESS;
  }
  const t = (d - SHALLOW_DEPTH_M) / (MAX_DEPTH_M - SHALLOW_DEPTH_M);
  return SHALLOW_PROGRESS + (1 - SHALLOW_PROGRESS) * Math.pow(t, 1 / PLUNGE_EXPONENT);
}

/**
 * 場景的「暗化程度」0→1，給三.js 的背景色／濃霧／燈光衰減用——刻意跟 depthAt()
 * 分開算，不要用 depthAt(progress) / MAX_DEPTH_M 那條曲線。
 *
 * 原因：MAX_DEPTH_M 是 1000（給最後暴衝的深海用），如果暗化程度直接跟公尺數
 * 掛鉤，00～03 章（0～40m，寫實潛水的全部範圍）換算成 0～1000 只佔 0～0.04，
 * 畫面幾乎不會變暗，使用者捲過八成的頁面都停在同一個亮度，「越潛越暗」的
 * 敘事會整個垮掉。暗化程度要跟著章節的節奏（progress）走，不是跟著深度的
 * 公尺數走——兩件事看起來像同一條曲線，實際上服務的是不同的敘事需求。
 */
export function environmentDarkness(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= SHALLOW_PROGRESS) {
    // 00～03 章：均勻暗到 0.7，留最後一段給「墜入深海」收尾用。
    return (p / SHALLOW_PROGRESS) * 0.7;
  }
  const t = (p - SHALLOW_PROGRESS) / (1 - SHALLOW_PROGRESS);
  return 0.7 + 0.3 * Math.pow(t, 2);
}
