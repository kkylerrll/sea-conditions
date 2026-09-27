// 水體層的粒子分佈。抽成獨立檔案是因為這些純粹是「長相」資料，不是邏輯；
// 放在元件裡會讓元件本體被一大片座標淹沒，要調疏密也得在 JSX 之間找。
//
// 座標是手寫的、刻意不規則：用迴圈均勻產生的粒子場，人眼一看就知道是程式畫的，
// 會出現肉眼可辨的行列。寧可寫死一組看起來隨機的數字，也不要 Array.from。

export const MARINE_SNOW: {
  left: number;
  top: number;
  size: number;
  duration: string;
  delay: string;
  opacity: number;
}[] = [
  { left: 6, top: 12, size: 2, duration: "17s", delay: "0s", opacity: 0.5 },
  { left: 14, top: 62, size: 3, duration: "23s", delay: "-4s", opacity: 0.38 },
  { left: 21, top: 31, size: 2, duration: "19s", delay: "-9s", opacity: 0.46 },
  { left: 27, top: 84, size: 4, duration: "28s", delay: "-2s", opacity: 0.3 },
  { left: 33, top: 7, size: 2, duration: "21s", delay: "-13s", opacity: 0.52 },
  { left: 38, top: 47, size: 3, duration: "25s", delay: "-6s", opacity: 0.35 },
  { left: 44, top: 73, size: 2, duration: "18s", delay: "-16s", opacity: 0.48 },
  { left: 49, top: 22, size: 5, duration: "31s", delay: "-1s", opacity: 0.24 },
  { left: 55, top: 91, size: 2, duration: "20s", delay: "-11s", opacity: 0.44 },
  { left: 61, top: 38, size: 3, duration: "26s", delay: "-7s", opacity: 0.33 },
  { left: 66, top: 66, size: 2, duration: "16s", delay: "-3s", opacity: 0.55 },
  { left: 72, top: 15, size: 4, duration: "29s", delay: "-18s", opacity: 0.27 },
  { left: 78, top: 54, size: 2, duration: "22s", delay: "-5s", opacity: 0.42 },
  { left: 83, top: 79, size: 3, duration: "24s", delay: "-14s", opacity: 0.36 },
  { left: 89, top: 28, size: 2, duration: "19s", delay: "-8s", opacity: 0.5 },
  { left: 94, top: 58, size: 3, duration: "27s", delay: "-12s", opacity: 0.31 },
  { left: 3, top: 41, size: 3, duration: "30s", delay: "-15s", opacity: 0.29 },
  { left: 17, top: 95, size: 2, duration: "18s", delay: "-10s", opacity: 0.47 },
  { left: 42, top: 3, size: 3, duration: "23s", delay: "-19s", opacity: 0.34 },
  { left: 58, top: 9, size: 2, duration: "21s", delay: "-17s", opacity: 0.45 },
  { left: 69, top: 88, size: 3, duration: "26s", delay: "-4s", opacity: 0.32 },
  { left: 86, top: 44, size: 4, duration: "32s", delay: "-20s", opacity: 0.25 },
  { left: 11, top: 76, size: 2, duration: "20s", delay: "-6s", opacity: 0.49 },
  { left: 51, top: 60, size: 3, duration: "25s", delay: "-21s", opacity: 0.3 },
];

export const BUBBLES: { left: number; size: number; duration: string; delay: string }[] = [
  { left: 19, size: 5, duration: "11s", delay: "0s" },
  { left: 36, size: 8, duration: "14s", delay: "-5s" },
  { left: 47, size: 4, duration: "9s", delay: "-2s" },
  { left: 63, size: 7, duration: "13s", delay: "-8s" },
  { left: 74, size: 5, duration: "10s", delay: "-11s" },
  { left: 88, size: 6, duration: "12s", delay: "-3s" },
];

export const LIGHT_SHAFTS: { x: number; width: number; rotate: number; duration: string }[] = [
  { x: 12, width: 9, rotate: -7, duration: "13s" },
  { x: 31, width: 6, rotate: 4, duration: "17s" },
  { x: 52, width: 11, rotate: -5, duration: "11s" },
  { x: 71, width: 7, rotate: 6, duration: "15s" },
  { x: 87, width: 8, rotate: -3, duration: "19s" },
];
