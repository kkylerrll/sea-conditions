// 台灣地圖投影：把經緯度線性對應到 SVG 座標。
// 手繪的台灣輪廓 (components/TaiwanMap) 用的是同一組常數，marker 才會落在對的位置。

export const MAP_W = 300;
export const MAP_H = 420;

const LON_MIN = 119.3;
const LON_MAX = 122.1;
const LAT_MIN = 21.7;
const LAT_MAX = 25.35;

export function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_H;
  return { x, y };
}

// 離島 marker 微調：真實座標投影後可能壓在輪廓線上，往外海推一點更好看。
// 現在離島輪廓改用 taiwan-paths.ts 的真實幾何（全台檢視時放大顯示），
// pin 落在島的中心即可，微調量比手繪橢圓時期小。
export const SPOT_NUDGE: Record<string, { dx: number; dy: number }> = {
  xiaoliuqiu: { dx: 0, dy: 0 },
  penghu: { dx: -2, dy: 0 },
  lyudao: { dx: 2, dy: 0 },
  lanyu: { dx: 2, dy: 2 },
  longdong: { dx: 4, dy: -4 },
  "kenting-houbihu": { dx: 0, dy: 6 },
};
