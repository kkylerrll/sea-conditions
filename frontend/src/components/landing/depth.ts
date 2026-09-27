// 捲動進度與「深度」之間的換算。JS（深度讀數）和 CSS（游標位置、水色、光量）
// 都要用到同一條曲線，寫在這裡當單一來源，避免兩邊各自寫一次然後慢慢對不上。

/** 這次下潛的最深處。刻度與所有深度換算都以此為滿刻度。 */
export const MAX_DEPTH_M = 40;

export const DEPTH_TICKS = [0, 10, 20, 30, 40];

/**
 * 水面段佔整條捲動的比例：在這之前深度都是 0，之後才開始下沉。
 *
 * 0.45 這個值不是調出來好看的，是被章節內容綁死的：00 水面、01 湧浪兩章都是
 * 水面上的衝浪照片，真正破水面的是第 02 章「越線」（progress 0.5）。水體效果
 * （微粒、水色、光柱）和深度讀數都吃這條線，設早了就會出現「水面上的衝浪照片
 * 疊著水下懸浮微粒、旁邊還寫著 6.2m」這種自相矛盾的畫面。
 *
 * 所以章節順序若有增減，這個值要跟著重算＝(越線章的索引 - 0.5) / (章節數 - 1)。
 */
export const SURFACE_PORTION = 0.45;

export function depthAt(progress: number): number {
  const submerged = (progress - SURFACE_PORTION) / (1 - SURFACE_PORTION);
  return Math.max(0, Math.min(1, submerged)) * MAX_DEPTH_M;
}
