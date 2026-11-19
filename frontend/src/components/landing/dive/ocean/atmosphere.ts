// 大氣單次散射的 CPU 版（只在初始化時算幾次）：太陽到地面的輻射度、天空環境光平均。
// 與 shaders.ts 的 envFrag 是同一套公式（移植自 "Ocean · WebGPU" by hirakujira, MIT）。
// GPU 上烘焙的天空貼圖負責畫面；這裡的數字給海面的高光／次表面光當光源顏色，
// 避免從 GPU 讀回貼圖。

import { BM, BR, RA, RE, SUN_I } from "./config";

type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rayExit(ro: V3, rd: V3, r: number): number {
  const b = dot(ro, rd);
  return -b + Math.sqrt(Math.max(b * b - dot(ro, ro) + r * r, 0));
}

function density(p: V3): [number, number] {
  const h = Math.max(Math.hypot(p[0], p[1], p[2]) - RE, 0);
  return [Math.exp(-h / 8000), Math.exp(-h / 1200)];
}

function opticalDepth(ro: V3, rd: V3, steps: number): [number, number] {
  const tMax = rayExit(ro, rd, RA);
  let o0 = 0;
  let o1 = 0;
  for (let i = 0; i < steps; i++) {
    const x = (i + 0.5) / steps;
    const t = tMax * x * x;
    const d = density([ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t]);
    const w = (tMax * 2 * x) / steps;
    o0 += d[0] * w;
    o1 += d[1] * w;
  }
  return [o0, o1];
}

function extinction(od: [number, number]): V3 {
  return [0, 1, 2].map((i) => Math.exp(-(BR[i] * od[0] + BM * 1.1 * od[1]))) as V3;
}

/** 太陽到達海面的輻射度 = SUN_I × 大氣消光。 */
export function sunRadiance(sunDir: V3): V3 {
  const ex = extinction(opticalDepth([0, RE + 2, 0], sunDir, 32));
  return [SUN_I * ex[0], SUN_I * ex[1], SUN_I * ex[2]];
}

function atmosphere(rd: V3, L: V3): V3 {
  const ro: V3 = [0, RE + 2, 0];
  const tMax = rayExit(ro, rd, RA);
  const N = 64;
  let od0 = 0;
  let od1 = 0;
  const sumR: V3 = [0, 0, 0];
  const sumM: V3 = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N;
    const t = tMax * x * x;
    const p: V3 = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const d = density(p);
    const w = (tMax * 2 * x) / N;
    const d0 = d[0] * w;
    const d1 = d[1] * w;
    od0 += d0;
    od1 += d1;
    const ol = opticalDepth(p, L, 16);
    const tr = extinction([od0 + ol[0], od1 + ol[1]]);
    for (let c = 0; c < 3; c++) {
      sumR[c] += tr[c] * d0;
      sumM[c] += tr[c] * d1;
    }
  }
  const mu = dot(rd, L);
  const g = 0.76;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM = ((3 / (8 * Math.PI)) * (1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  return [0, 1, 2].map((c) => SUN_I * (sumR[c] * BR[c] * pR + sumM[c] * BM * pM)) as V3;
}

/** 天頂＋六個仰角 30° 方向的平均天空輻射度（原作 CAMERA 段算 ambient 的做法）。 */
export function skyAmbient(sunDir: V3): V3 {
  const dirs: V3[] = [[0, 1, 0]];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    dirs.push([Math.cos(a) * 0.866, 0.5, Math.sin(a) * 0.866]);
  }
  const acc: V3 = [0, 0, 0];
  for (const d of dirs) {
    const s = atmosphere(d, sunDir);
    acc[0] += s[0];
    acc[1] += s[1];
    acc[2] += s[2];
  }
  return [acc[0] / dirs.length, acc[1] / dirs.length, acc[2] / dirs.length];
}
