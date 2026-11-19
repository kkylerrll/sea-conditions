// 降級用的 Gerstner 波組（12 個解析波）：沒有浮點 render target、或手機規格時用。
// 跟 FFT 版共用同一套海面 shader（同樣的反射／次表面光／天空／Snell 窗），只是位移與
// 法線由這 12 個波解析算出，不需要任何貼圖或每幀 GPU 模擬。波長 118 m 到 0.55 m，
// 振幅表對應有效浪高約 0.4 m（與 FFT 版同一個海況）；最長那個是湧浪，方向獨立。

import { G, SWELL_ANGLE, TAU, WIND_ANGLE } from "./config";

type Wave = { lambda: number; amp: number; angle: number; phase: number };

// 方向相對風向的偏移與相位是固定的偽亂數（不要每次載入都長不一樣）。
const OFFSETS = [0, -0.35, 0.3, -0.55, 0.5, -0.2, 0.7, -0.7, 0.15, -0.45, 0.4, -0.1];
const LAMBDA = [118, 24, 17, 12, 8.5, 6, 4.2, 3, 2.1, 1.4, 0.9, 0.55];
const AMP = [0.1, 0.06, 0.055, 0.045, 0.034, 0.026, 0.018, 0.012, 0.0085, 0.0055, 0.0035, 0.0022];

export const WAVES: Wave[] = LAMBDA.map((lambda, i) => ({
  lambda,
  amp: AMP[i],
  angle: i === 0 ? SWELL_ANGLE : WIND_ANGLE + OFFSETS[i],
  phase: ((i * 2.399963) % TAU) + 0.7,
}));

/** 給 shader 的 uniform 陣列：A=(dir.x, dir.z, k, amp)、B=(omega, phase, Q, 0)。 */
export function gerstnerUniforms(): { ga: Float32Array; gb: Float32Array } {
  const ga = new Float32Array(WAVES.length * 4);
  const gb = new Float32Array(WAVES.length * 4);
  WAVES.forEach((w, i) => {
    const k = TAU / w.lambda;
    ga.set([Math.cos(w.angle), Math.sin(w.angle), k, w.amp], i * 4);
    gb.set([Math.sqrt(G * k), w.phase, 1.0, 0], i * 4);
  });
  return { ga, gb };
}

/** CPU 端波高與斜率（鏡頭浮標／水線用），不含水平位移。 */
export function evalGerstner(x: number, z: number, time: number, out: { h: number; dx: number; dz: number }) {
  let h = 0;
  let dx = 0;
  let dz = 0;
  for (const w of WAVES) {
    const k = TAU / w.lambda;
    const dirx = Math.cos(w.angle);
    const dirz = Math.sin(w.angle);
    const th = k * (dirx * x + dirz * z) - Math.sqrt(G * k) * time + w.phase;
    h += w.amp * Math.sin(th);
    const c = w.amp * k * Math.cos(th);
    dx += dirx * c;
    dz += dirz * c;
  }
  out.h = h;
  out.dx = dx;
  out.dz = dz;
}
