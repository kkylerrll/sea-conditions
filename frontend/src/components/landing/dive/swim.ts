// 靜態模型的「程序化游動」：沒有骨架、沒有動畫片段的寫實靜態魚／海龜，
// 靠 MeshStandardMaterial.onBeforeCompile 注入頂點位移，在 GPU 上彎曲網格。
//
// 兩種風格：
//   carangiform／subcarangiform  魚體沿「長軸」做行進波——
//       側向位移 = A(s)·sin(k·s − φ)，s 為 0（頭）到 1（尾）的體長比例；
//       A(s) = amp·(e0 + (1−e0)·s^p)：頭部幾乎不動、振幅往尾端放大。
//       carangiform（鮪／鯖／鰺）e0 小、p 大，只有後半身擺；
//       subcarangiform（多數礁魚、鱸）e0 大、p 小，接近全身擺動。
//   flap  海龜：沒有拆開的鰭肢網格也沒有骨架，用「離中線越遠、上下位移越
//       大」近似前鰭拍動（翼梢最大、軀幹幾乎不動），側向完全不彎。
//
// 法線：位移是 s 的函數，沿長軸的導數 dlat/dlong 近似成切面傾斜，
// 把法線的長軸分量往側向旋轉一點，光影才跟著彎曲——不是精確的法線重算，
// 但幅度小（amp ≤ 0.1）時肉眼看不出差別。
//
// 相位由引擎每幀累加（見 advanceProceduralSwim）：ω 跟著當下速度倍率變，
// 直接用 sin(ω·t) 會在 ω 改變的瞬間相位跳動，累加才平順。

import * as THREE from "three";

export type SwimStyle = "carangiform" | "subcarangiform" | "flap";

export type ProceduralSwim = {
  /** 長軸；省略＝載入時由 geometry bbox 量出最長的水平軸（x 或 z）。 */
  axis?: "x" | "z";
  /** +1＝頭在長軸正向端、-1＝頭在負向端。看不出來時用 ?diveDebug=<kind> 肉眼確認。 */
  headSign: 1 | -1;
  /** 尾端側向振幅（佔體長比例），0.04~0.1 之間。flap 是翼梢上下振幅。 */
  amp: number;
  /** 行進波長（佔體長比例）；越小身體上同時看到的彎曲越多。flap 忽略。 */
  wavelength: number;
  style: SwimStyle;
  /** 基礎角頻率（rad/s，速度倍率 1 時）；省略用 SWIM_BASE_OMEGA。 */
  omega?: number;
};

/** 速度倍率 = 1 時的角頻率：約 1.3 Hz 的擺尾。 */
export const SWIM_BASE_OMEGA = 8;

export type SwimRuntime = {
  cfg: ProceduralSwim;
  uniforms: { uPhase: { value: number } };
  /** 累加後的相位（不含個體相位偏移）。 */
  phase: number;
  /** 個體相位偏移，讓同一批魚不同步擺。 */
  offset: number;
};

/** 量出 root 底下所有 mesh 的「geometry 本地座標」bbox（shader 吃的是 position 屬性，
    不是世界座標，所以不能用 Box3.setFromObject）。 */
export function measureLocalBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  });
  return box;
}

const STYLE_PARAMS: Record<SwimStyle, { e0: number; p: number }> = {
  carangiform: { e0: 0.04, p: 2.6 },
  subcarangiform: { e0: 0.25, p: 1.6 },
  flap: { e0: 0, p: 1 },
};

/**
 * 對 root 底下每個 MeshStandardMaterial 複製一份並注入彎曲 shader（每個實例各自一份，
 * 才有各自的 uPhase uniform；SkeletonUtils.clone 本身是共用材質的）。
 * 回傳 runtime 讓引擎每幀推進相位；找不到任何可修改的材質回傳 null。
 */
export function applyProceduralSwim(
  root: THREE.Object3D,
  cfg: ProceduralSwim,
  offset: number,
): SwimRuntime | null {
  const box = measureLocalBox(root);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const axis = cfg.axis ?? (size.x >= size.z ? "x" : "z");
  const lenAxis = axis === "x" ? "x" : "z";
  const latAxis = axis === "x" ? "z" : "x";
  const len = Math.max(axis === "x" ? size.x : size.z, 1e-6);
  const halfLat = Math.max((axis === "x" ? size.z : size.x) / 2, 1e-6);
  const min = axis === "x" ? box.min.x : box.min.z;
  const max = axis === "x" ? box.max.x : box.max.z;
  const latCenter = axis === "x" ? (box.min.z + box.max.z) / 2 : (box.min.x + box.max.x) / 2;
  const { e0, p } = STYLE_PARAMS[cfg.style];
  const uniforms = { uPhase: { value: 0 } };
  const rt: SwimRuntime = { cfg, uniforms, phase: 0, offset };
  let patched = 0;

  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.SkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return m;
      const mm = m.clone();
      mm.userData = m.userData; // clone 會把 userData 做 JSON 深拷貝（Color 會變樣），標記（rimFloor 等）直接共用參照
      patched++;
      mm.onBeforeCompile = (shader) => {
        shader.uniforms.uPhase = uniforms.uPhase;
        shader.vertexShader =
          `uniform float uPhase;\n` +
          shader.vertexShader
            .replace(
              "#include <beginnormal_vertex>",
              `#include <beginnormal_vertex>
  // 體長比例 s：0＝頭、1＝尾；lat＝側向位移；dLat＝lat 對長軸座標的導數
  float swS = clamp(${cfg.headSign > 0 ? `(${max.toFixed(5)} - position.${lenAxis})` : `(position.${lenAxis} - ${min.toFixed(5)})`} / ${len.toFixed(5)}, 0.0, 1.0);
  float swK = 6.2831853 / ${Math.max(cfg.wavelength, 0.05).toFixed(4)};
  float swEnv = ${cfg.amp.toFixed(4)} * ${len.toFixed(5)} * (${e0.toFixed(3)} + (1.0 - ${e0.toFixed(3)}) * pow(swS, ${p.toFixed(2)}));
  float swArg = swK * swS - uPhase;
  float swLat = swEnv * sin(swArg);
  float swDLatDS = swEnv * swK * cos(swArg) + ${cfg.amp.toFixed(4)} * ${len.toFixed(5)} * (1.0 - ${e0.toFixed(3)}) * ${p.toFixed(2)} * pow(swS, ${(p - 1).toFixed(2)}) * sin(swArg);
  float swSlope = swDLatDS / ${len.toFixed(5)} * ${(cfg.headSign > 0 ? -1 : 1).toFixed(1)};
  ${
    cfg.style === "flap"
      ? `// flap：離中線越遠上下位移越大
  float swSide = clamp(abs(position.${latAxis} - ${latCenter.toFixed(5)}) / ${halfLat.toFixed(5)}, 0.0, 1.0);
  float swFlap = ${cfg.amp.toFixed(4)} * ${len.toFixed(5)} * swSide * swSide * sin(uPhase);
  float swFlapSlope = ${cfg.amp.toFixed(4)} * ${len.toFixed(5)} * 2.0 * swSide * sin(uPhase) / ${halfLat.toFixed(5)} * sign(position.${latAxis} - ${latCenter.toFixed(5)});
  objectNormal.${latAxis} += swFlapSlope * 0.5 * objectNormal.y;
  objectNormal.y -= swFlapSlope * 0.5 * objectNormal.${latAxis};
  objectNormal = normalize(objectNormal);`
      : `objectNormal.${latAxis} -= swSlope * objectNormal.${lenAxis};
  objectNormal = normalize(objectNormal);`
  }`,
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
  ${cfg.style === "flap" ? `transformed.y += swFlap;` : `transformed.${latAxis} += swLat;`}`,
            );
      };
      // 同一份設定共用 program（uniform 各自帶），不同設定要分開快取。
      mm.customProgramCacheKey = () =>
        `swim:${cfg.style}:${axis}:${cfg.headSign}:${cfg.amp}:${cfg.wavelength}:${min.toFixed(3)}:${max.toFixed(3)}`;
      return mm;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });

  return patched > 0 ? rt : null;
}

/** 每幀推進相位：speedMul 是引擎當下的速度倍率（衝刺時拍得快、滑行時慢）。 */
export function advanceProceduralSwim(rt: SwimRuntime, dt: number, speedMul: number) {
  const omega = (rt.cfg.omega ?? SWIM_BASE_OMEGA) * Math.max(speedMul, 0.2);
  rt.phase += omega * dt;
  rt.uniforms.uPhase.value = rt.phase + rt.offset;
}
