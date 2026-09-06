// 台灣地圖投影：把經緯度線性對應到 SVG 座標。
// scripts/gen-taiwan-paths.mjs 產生 taiwan-paths.ts 時用的是同一組常數，
// 海岸線 path 與 marker 才會落在同一個座標系。

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

// 本島潛點的 marker 微調：這些點的實際下水位置在岸邊甚至離岸一點，
// 投影座標會壓在海岸線上，往外海推幾單位比較好看。
// 離島（澎湖 / 綠島 / 蘭嶼 / 小琉球）不在這裡 —— 那幾個 marker 由
// TaiwanMap 直接放在 taiwan-paths.ts 的島嶼 bounding box 中心，
// 全台放大顯示與島嶼層級真實比例兩種檢視下都會落在島上。
export const SPOT_NUDGE: Record<string, { dx: number; dy: number }> = {
  longdong: { dx: 4, dy: -4 },
  "kenting-houbihu": { dx: 0, dy: 6 },
};
