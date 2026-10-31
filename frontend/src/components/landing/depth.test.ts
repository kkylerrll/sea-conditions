import { describe, expect, it } from "vitest";

import {
  MAX_DEPTH_M,
  MIN_CREATURE_DEPTH_M,
  SURFACE_DEPTH_M,
  SURFACE_END,
  SURFACE_END_DEPTH_M,
  SURFACE_HOLD,
  cameraDepthAt,
  depthAt,
  environmentDarkness,
  progressAt,
  remapLegacyProgress,
} from "./depth";

const grid = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/** 數值微分（中央差分）。 */
const slope = (f: (p: number) => number, p: number, h = 1e-6) => (f(p + h) - f(p - h)) / (2 * h);

describe("cameraDepthAt", () => {
  it("端點：海面上浮動、下沉段結束在 5m、最後到 1000m", () => {
    expect(cameraDepthAt(0)).toBe(SURFACE_DEPTH_M);
    expect(cameraDepthAt(SURFACE_HOLD)).toBe(SURFACE_DEPTH_M);
    expect(cameraDepthAt(SURFACE_END)).toBeCloseTo(SURFACE_END_DEPTH_M, 9);
    expect(cameraDepthAt(1)).toBeCloseTo(MAX_DEPTH_M, 9);
  });

  it("超出 0..1 的進度會被夾住", () => {
    expect(cameraDepthAt(-0.5)).toBe(cameraDepthAt(0));
    expect(cameraDepthAt(1.5)).toBe(cameraDepthAt(1));
  });

  it("單調遞增：沒有任何捲動位置會讓深度倒退", () => {
    const ps = grid(4000);
    for (let i = 1; i < ps.length; i++) {
      expect(cameraDepthAt(ps[i])).toBeGreaterThanOrEqual(cameraDepthAt(ps[i - 1]));
    }
  });

  it("接縫處速度連續（C1），畫面不會跳", () => {
    // 浮標段 → 下沉段：起點速度 0
    expect(slope(cameraDepthAt, SURFACE_HOLD + 1e-4)).toBeLessThan(1);
    // 下沉段 → 下潛段：兩側速度相同
    const before = (cameraDepthAt(SURFACE_END) - cameraDepthAt(SURFACE_END - 1e-6)) / 1e-6;
    const after = (cameraDepthAt(SURFACE_END + 1e-6) - cameraDepthAt(SURFACE_END)) / 1e-6;
    expect(after).toBeCloseTo(before, 1);
  });

  it("在下沉段中穿過水面", () => {
    expect(cameraDepthAt((SURFACE_HOLD + SURFACE_END) / 2)).toBeGreaterThan(SURFACE_DEPTH_M);
    expect(cameraDepthAt((SURFACE_HOLD + SURFACE_END) / 2)).toBeLessThan(SURFACE_END_DEPTH_M);
  });
});

describe("depthAt", () => {
  it("水上一律為 0", () => {
    expect(depthAt(0)).toBe(0);
    expect(depthAt(SURFACE_HOLD)).toBe(0);
  });

  it("註解寫的里程碑：40m 約在下潛段 36%、100m 約 54%、300m 約 76%", () => {
    const deepFraction = (d: number) => (progressAt(d) - SURFACE_END) / (1 - SURFACE_END);
    expect(deepFraction(40)).toBeCloseTo(0.36, 1);
    expect(deepFraction(100)).toBeCloseTo(0.54, 1);
    expect(deepFraction(300)).toBeCloseTo(0.76, 1);
  });
});

describe("progressAt", () => {
  it.each([0.5, 1, 3, SURFACE_END_DEPTH_M, 10, 40, 100, 300, 600, MAX_DEPTH_M])(
    "是 depthAt 的反函式（%s m）",
    (d) => {
      expect(depthAt(progressAt(d))).toBeCloseTo(d, 4);
    },
  );

  it("夾在 0..MAX_DEPTH_M", () => {
    expect(progressAt(5000)).toBeCloseTo(1, 9);
    expect(depthAt(progressAt(-10))).toBeCloseTo(0, 4);
  });
});

describe("remapLegacyProgress", () => {
  it("1 維持 1，0 不會比最淺的生物深度還淺", () => {
    expect(remapLegacyProgress(1)).toBe(1);
    expect(depthAt(remapLegacyProgress(0))).toBeGreaterThanOrEqual(MIN_CREATURE_DEPTH_M - 1e-6);
  });

  it("單調不遞減，而且都落在水下段", () => {
    const ps = grid(200);
    for (let i = 1; i < ps.length; i++) {
      expect(remapLegacyProgress(ps[i])).toBeGreaterThanOrEqual(remapLegacyProgress(ps[i - 1]));
      expect(remapLegacyProgress(ps[i])).toBeGreaterThan(SURFACE_HOLD);
    }
  });
});

describe("environmentDarkness", () => {
  it.each([
    [5, 0.07],
    [20, 0.25],
    [40, 0.41],
    [100, 0.66],
    [300, 0.85],
  ])("%s m 約為 %s（註解裡的數值）", (d, expected) => {
    expect(environmentDarkness(progressAt(d))).toBeCloseTo(expected, 1);
  });

  it("海面為 0、最深為 1", () => {
    expect(environmentDarkness(0)).toBe(0);
    expect(environmentDarkness(1)).toBeCloseTo(1, 9);
  });
});
