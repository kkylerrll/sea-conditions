// 初始頻譜 h0(k)（CPU 端產生一次）＋ CPU 端的浮標用波高取樣。
//
// 移植自 "Ocean · WebGPU" by hirakujira (CodePen, MIT) 的 INIT 段：JONSWAP 頻譜、
// 方向分佈 spread、高頻尾端從 w^-5 抬到 w^-4.75（讓小波有真的斜率）。原作在 GPU 上
// 用 compute shader 產 h0；WebGL2 沒有 compute，而且我們需要 CPU 端也知道同一份
// 頻譜（鏡頭要騎在低通過濾後的海面上、水線要對準鏡頭位置的真實波高），所以
// 改成 CPU 產生再上傳成浮點貼圖。純 TypeScript、不依賴 three，可以直接在 node 驗證。
//
// 貼圖排列：寬 3N × 高 N 的圖集，cascade c 佔 x ∈ [cN, (c+1)N)。每個 texel
// = (h0(k).re, h0(k).im, conj(h0(-k)).re, conj(h0(-k)).im)。

import {
  AMP_SCALE,
  BUOY_K0,
  BUOY_K1,
  CUTS,
  FETCH,
  G,
  LENGTHS,
  SWELL,
  SWELL_ALPHA,
  SWELL_ANGLE,
  SWELL_PEAK_W,
  SWELL_SPREAD_S,
  TAU,
  WIND,
  WIND_ANGLE,
} from "./config";

const ALPHA = 0.076 * Math.pow((G * FETCH) / (WIND * WIND), -0.22);
const PEAK_W = 22.0 * Math.pow((WIND * FETCH) / (G * G), -1.0 / 3.0);

// 原作的振幅公式（sqrt(2·S·dω/dk/k·dk²) 配上 E|gauss|²=2）算出來的實際波高方差是
// 名目 JONSWAP 方差的 8 倍（頻譜是單邊的，h0(k) 與 conj(h0(-k)) 各貢獻一份，
// 高斯亂數的期望平方模長又是 2）。原作的大浪是在這個放大下調出來的外觀；這裡
// 要的是「有效浪高 = 設定值」的可預期海況，所以除回去，再交給 AMP_SCALE 微調。
const NORM = 1 / Math.sqrt(8);

function pcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

function gauss(ix: number, iy: number, c: number, seed: number): [number, number] {
  const a = pcg(ix + pcg(iy + pcg(c + seed)));
  const u1 = Math.max(a / 4294967296.0, 1e-7);
  const u2 = pcg(a) / 4294967296.0;
  const r = Math.sqrt(-2.0 * Math.log(u1));
  return [r * Math.cos(TAU * u2), r * Math.sin(TAU * u2)];
}

function jonswap(w: number, peakW: number, alpha: number): number {
  const sigma = w <= peakW ? 0.07 : 0.09;
  const r = Math.exp((-(w - peakW) * (w - peakW)) / (2.0 * sigma * sigma * peakW * peakW));
  return ((alpha * G * G) / Math.pow(w, 5.0)) * Math.exp(-1.25 * Math.pow(peakW / w, 4.0)) * Math.pow(3.3, r);
}

function spreadNorm(s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  const s4 = s3 * s;
  if (s < 5.0) return -0.000564 * s4 + 0.00776 * s3 - 0.044 * s2 + 0.192 * s + 0.163;
  return -4.8e-8 * s4 + 1.07e-5 * s3 - 9.53e-4 * s2 + 5.9e-2 * s + 3.93e-1;
}

function directional(theta: number, w: number): number {
  const x = w / PEAK_W;
  const s =
    (w > PEAK_W ? 9.77 * Math.pow(x, -2.5) : 6.97 * Math.pow(x, 5.0)) +
    16.0 * Math.tanh(Math.min(x, 20.0)) * SWELL * SWELL;
  return spreadNorm(s) * Math.pow(Math.abs(Math.cos(0.5 * (theta - WIND_ANGLE))), 2.0 * s);
}

/** 獨立長湧浪的方向分佈（窄）。 */
function swellDirectional(theta: number): number {
  return spreadNorm(SWELL_SPREAD_S) * Math.pow(Math.abs(Math.cos(0.5 * (theta - SWELL_ANGLE))), 2.0 * SWELL_SPREAD_S);
}

export type Spectrum = {
  N: number;
  /** RGBA float，寬 3N × 高 N（見檔案頂端說明）。 */
  h0: Float32Array;
  /** CPU 浮標取樣用的分量表（只含長波）。 */
  buoy: BuoyComponents;
};

export type BuoyComponents = {
  count: number;
  kx: Float64Array;
  kz: Float64Array;
  omega: Float64Array;
  /** h0(k) 的實／虛部 */
  ar: Float64Array;
  ai: Float64Array;
  /** conj(h0(-k)) 的實／虛部 */
  br: Float64Array;
  bi: Float64Array;
  /** 這個分量所屬 cascade 的半 texel 偏移（m）：GPU 取樣點相對連續場的位移，見 evalBuoy。 */
  shift: Float64Array;
};

/** 單一波數的 (期望)振幅、未乘上高斯亂數：sqrt(2·S·(G/2ω)/k·dk²)·NORM·AMP_SCALE。 */
function ampAt(ix: number, iy: number, c: number, N: number): number {
  if (ix === N / 2 || iy === N / 2) return 0;
  const mx = ix >= N / 2 ? ix - N : ix;
  const my = iy >= N / 2 ? iy - N : iy;
  const dk = TAU / LENGTHS[c];
  const kx = mx * dk;
  const kz = my * dk;
  const kl = Math.hypot(kx, kz);
  if (kl <= CUTS[c] || kl > CUTS[c + 1]) return 0;
  const w = Math.sqrt(G * kl);
  const theta = Math.atan2(kz, kx);
  // 原作：JONSWAP 在高頻尾端 w^-5 低估短波，往 w^-4.75 抬，讓漣漪帶有真實斜率。
  let S =
    jonswap(w, PEAK_W, ALPHA) * Math.pow(Math.max(w / PEAK_W, 1.0), 0.25) * directional(theta, w) * Math.exp(-kl * kl * 0.0001);
  // 獨立長湧浪（只加在最長的 cascade 0，波長 > 100 m 只有它放得下）。
  if (c === 0) S += jonswap(w, SWELL_PEAK_W, SWELL_ALPHA) * swellDirectional(theta);
  return Math.sqrt(2.0 * S * (G / (2.0 * w)) / kl * dk * dk) * NORM * AMP_SCALE;
}

function h0At(ix: number, iy: number, c: number, N: number, seed: number): [number, number] {
  const a = ampAt(ix, iy, c, N);
  if (a === 0) return [0, 0];
  const g = gauss(ix, iy, c, seed);
  return [g[0] * a, g[1] * a];
}

export function buildSpectrum(N: number, seed = 1337): Spectrum {
  const W = 3 * N;
  const h0 = new Float32Array(W * N * 4);
  const comps: { kx: number; kz: number; w: number; a: [number, number]; b: [number, number]; shift: number }[] = [];

  const tmp = new Float32Array(N * N * 2);
  for (let c = 0; c < 3; c++) {
    const dk = TAU / LENGTHS[c];
    const kMaxBuoy = c === 0 ? BUOY_K0 : c === 1 ? BUOY_K1 : 0;
    // 先算一遍 h0(k)；conj(h0(-k)) 直接查鏡像位置，不重算（頻譜公式很貴，省一半）。
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const a = h0At(ix, iy, c, N, seed);
        tmp[(iy * N + ix) * 2] = a[0];
        tmp[(iy * N + ix) * 2 + 1] = a[1];
      }
    }
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const ai = (iy * N + ix) * 2;
        const bi = (((N - iy) % N) * N + ((N - ix) % N)) * 2;
        const a: [number, number] = [tmp[ai], tmp[ai + 1]];
        const b: [number, number] = [tmp[bi], tmp[bi + 1]];
        const o = (iy * W + c * N + ix) * 4;
        h0[o] = a[0];
        h0[o + 1] = a[1];
        h0[o + 2] = b[0];
        h0[o + 3] = -b[1];

        if (kMaxBuoy > 0 && (a[0] !== 0 || a[1] !== 0 || b[0] !== 0 || b[1] !== 0)) {
          const mx = ix >= N / 2 ? ix - N : ix;
          const my = iy >= N / 2 ? iy - N : iy;
          const kx = mx * dk;
          const kz = my * dk;
          const kl = Math.hypot(kx, kz);
          if (kl < kMaxBuoy) {
            // GPU 取樣的 uv = x / L，texel 中心在 (i + 0.5)/N，等於整個場平移了半個 texel。
            comps.push({ kx, kz, w: Math.sqrt(G * kl), a, b: [b[0], -b[1]], shift: 0.5 * (LENGTHS[c] / N) });
          }
        }
      }
    }
  }

  const n = comps.length;
  const buoy: BuoyComponents = {
    count: n,
    kx: new Float64Array(n),
    kz: new Float64Array(n),
    omega: new Float64Array(n),
    ar: new Float64Array(n),
    ai: new Float64Array(n),
    br: new Float64Array(n),
    bi: new Float64Array(n),
    shift: new Float64Array(n),
  };
  comps.forEach((c, i) => {
    buoy.kx[i] = c.kx;
    buoy.kz[i] = c.kz;
    buoy.omega[i] = c.w;
    buoy.ar[i] = c.a[0];
    buoy.ai[i] = c.a[1];
    buoy.br[i] = c.b[0];
    buoy.bi[i] = c.b[1];
    buoy.shift[i] = c.shift;
  });
  return { N, h0, buoy };
}

/**
 * CPU 端取樣低通海面：回傳高度與水平梯度（斜率），一次迴圈、每個分量一組 sin/cos。
 * 與 GPU 端同一份頻譜、同一個時間相位，所以鏡頭跟水線和畫面上看到的浪是對得上的。
 * 公式：hk = h0·e^{-iωt} + conj(h0(-k))·e^{+iωt}；高度 = Σ Re(hk·e^{ik·x'})，
 * x' = x - 半 texel（見 BuoyComponents.shift）。
 */
export function evalBuoy(b: BuoyComponents, x: number, z: number, time: number, out: { h: number; dx: number; dz: number }) {
  let h = 0;
  let dx = 0;
  let dz = 0;
  for (let i = 0; i < b.count; i++) {
    const sh = b.shift[i];
    const ph = b.kx[i] * (x - sh) + b.kz[i] * (z - sh);
    const wt = b.omega[i] * time;
    // hk = a·e^{-iwt} + b·e^{+iwt}
    const cw = Math.cos(wt);
    const sw = Math.sin(wt);
    const hr = b.ar[i] * cw + b.ai[i] * sw + (b.br[i] * cw - b.bi[i] * sw);
    const hi = b.ai[i] * cw - b.ar[i] * sw + (b.bi[i] * cw + b.br[i] * sw);
    const cp = Math.cos(ph);
    const sp = Math.sin(ph);
    // Re(hk·e^{iph}) = hr·cos - hi·sin；對 x 微分得 -k·(hr·sin + hi·cos)
    h += hr * cp - hi * sp;
    const d = -(hr * sp + hi * cp);
    dx += b.kx[i] * d;
    dz += b.kz[i] * d;
  }
  out.h = h;
  out.dx = dx;
  out.dz = dz;
}

/** 估計全頻譜的有效浪高 Hs = 4σ（期望值，不含隨機抽樣誤差）；調 WIND/FETCH/AMP_SCALE 時用。 */
export function estimateHs(N: number): { hs: number; hsWind: number; hsSwellOnly: number } {
  let varAll = 0;
  let varSwell = 0;
  for (let c = 0; c < 3; c++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const a = ampAt(ix, iy, c, N);
        // E|hk|² = E|h0(k)|² + E|h0(-k)|² = 2·E|h0|²，E|h0|² = E|g|²·a² = 2a²；總方差 = Σ|hk|²
        varAll += 4 * a * a;
      }
    }
  }
  // 湧浪單獨的方差（只在 cascade 0）：重算一次只有湧浪項。
  {
    const dk = TAU / LENGTHS[0];
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        if (ix === N / 2 || iy === N / 2) continue;
        const mx = ix >= N / 2 ? ix - N : ix;
        const my = iy >= N / 2 ? iy - N : iy;
        const kl = Math.hypot(mx * dk, my * dk);
        if (kl <= CUTS[0] || kl > CUTS[1]) continue;
        const w = Math.sqrt(G * kl);
        const S = jonswap(w, SWELL_PEAK_W, SWELL_ALPHA) * swellDirectional(Math.atan2(my, mx));
        const a = Math.sqrt(2.0 * S * (G / (2.0 * w)) / kl * dk * dk) * NORM * AMP_SCALE;
        varSwell += 4 * a * a;
      }
    }
  }
  return { hs: 4 * Math.sqrt(varAll), hsWind: 4 * Math.sqrt(Math.max(varAll - varSwell, 0)), hsSwellOnly: 4 * Math.sqrt(varSwell) };
}

export const SPECTRUM_PEAK_W = PEAK_W;
