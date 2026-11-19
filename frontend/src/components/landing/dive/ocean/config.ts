// 海面模組的集中常數。調海況（浪大浪小、天氣、取景）只需要改這個檔案。
//
// 本模組移植自 "Ocean · WebGPU" by hirakujira (CodePen, MIT)：
//   https://codepen.io/hirakujira/pen/EaWLEEB
// 原作是 WebGPU compute 版 FFT 海洋；這裡改寫成 three.js 的 WebGL2 版（fragment
// shader 做 FFT、ping-pong 浮點 render target），頻譜、三層 cascade、泡沫、
// 天空大氣、雲層、ACES 色調映射、「浮標攝影機」的做法都沿用原作，常數沒特別
// 註明的都是原作數值。授權標示見 public/landing/CREDITS.md 與頁尾。

/** 世界單位／公尺：1 公尺深度＝這麼多 three.js 單位（與 engine.ts 的深度換算同一個值）。
    海面 shader 內部全部用公尺計算，只在最後一步乘上這個係數變成世界座標。 */
export const WORLD_UNITS_PER_METER = 0.35;

export const G = 9.81;
export const TAU = Math.PI * 2;

/** 三層 FFT cascade 的邊長（公尺）。非整數倍關係是原作用來掩蓋重複貼磚的。 */
export const LENGTHS: [number, number, number] = [400, 67, 11];

/** 各層頻譜的波數上下限（rad/m）：第 c 層只收 CUTS[c] < |k| <= CUTS[c+1] 的波。 */
export const CUTS: [number, number, number, number] = [0.0001, (TAU / 67) * 6, (TAU / 11) * 6, 1e9];

/** 水平位移（chop）係數：越大浪尖越尖、越容易出泡沫。原作 0.8。 */
export const CHOP = 0.8;

// ---- 海況（calm sea）----
// 使用者要求：首頁一開始是「更平靜的海」——微風、長風區、有效浪高約 0.3–0.5 m，
// 外加一個緩慢的長湧浪；泡沫只出現在偶爾的浪尖。
// 原作是風速 9 m/s、風區 150 km 的大浪。
/** 風速（m/s）。 */
export const WIND = 3.5;
/** 風區長度（m）。風速這麼小時，用原作的 150 km 會讓 JONSWAP 峰頻掉到
    「比完全成長還低」的不合理值，這裡取到剛好接近完全成長海況的 12 km。 */
export const FETCH = 12000;
/** 風向（rad，xz 平面，0 = +x，π/2 = +z）。浪朝 +z 走＝迎著鏡頭而來，浪脊橫過畫面。 */
export const WIND_ANGLE = Math.PI / 2 - 0.35;
/** 原作的 SWELL 係數（方向分佈裡的湧浪成分，非下面的獨立湧浪頻譜）。 */
export const SWELL = 0.25;
/** 整體振幅微調（校準到目標有效浪高用，見 spectrum.ts 的 estimateHs）。 */
export const AMP_SCALE = 1.0;

/** 泡沫：雅可比行列式低於 FOAM_JAC 才起泡，強度 = (FOAM_JAC - jac) × FOAM_GAIN；
    FOAM_DECAY 是泡沫消散速率（1/s）。原作是 0.6／2.5／0.6（大浪）；這片海很平靜，
    實測 jac 最低約 0.75，所以門檻放寬到 0.88，只有偶爾的浪脊會有淡淡一層泡沫。 */
export const FOAM_JAC = 0.88;
export const FOAM_GAIN = 3.5;
export const FOAM_DECAY = 0.6;

/** 獨立的長湧浪：峰值角頻率（rad/s）、能量、方向（rad）。0.72 rad/s ≈ 波長 118 m。 */
export const SWELL_PEAK_W = 0.72;
export const SWELL_ALPHA = 0.00006;
export const SWELL_ANGLE = Math.PI / 2 + 0.25;
export const SWELL_SPREAD_S = 30;

// ---- 大氣與太陽 ----
export const RE = 6360e3;
export const RA = 6420e3;
export const BR: [number, number, number] = [5.8e-6, 13.5e-6, 33.1e-6];
export const BM = 21e-6;
export const SUN_I = 20.0;
/** 原作曝光 0.5；本模組的 shader 自己做 ACES（原作的 Narkowicz 擬合），輸出時
    不再讓 three 套 tone mapping（水下色已經是顯示用的顏色，不能被再壓一次）。 */
export const EXPOSURE = 0.5;
/** 太陽仰角／方位（rad）。方位相對鏡頭正前方（-z），正值＝偏左（-x）。
    仰角 26°：比原作的 14° 高（白天），但還夠低，海面的太陽反光帶會落在畫面下緣。 */
export const SUN_ELEVATION = (26 * Math.PI) / 180;
export const SUN_AZIMUTH = 0.5;
/** 雲層高度（m）與覆蓋範圍（smoothstep 下／上限，越大雲越少）。 */
export const CLOUD_ALTITUDE = 2200;
export const CLOUD_LO = 0.6;
export const CLOUD_HI = 0.86;

// ---- 浮標鏡頭 ----
/** 鏡頭離海平面的高度（m）。 */
export const EYE_HEIGHT_M = 0.9;
/** 彈簧／阻尼（原作 9 與 4）。 */
export const BUOY_STIFFNESS = 9;
export const BUOY_DAMPING = 4;
/** 浮標傾斜跟隨海面法線的比例（原作 0.3）。 */
export const BUOY_TILT = 0.3;
/** 鏡頭的半球形防水罩半徑（m）：水線掃過畫面所需的下潛距離約為 2×這個值。 */
export const DOME_RADIUS_M = 0.18;

/** CPU 端浮標只取長波：cascade 0 取 |k| < K0、cascade 1 取 |k| < K1（rad/m）。 */
export const BUOY_K0 = 0.5;
export const BUOY_K1 = 0.8;
