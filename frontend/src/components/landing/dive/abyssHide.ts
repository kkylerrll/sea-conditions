// round 21 第二輪回饋：深海裡沒被照到的生物變成「黑色剪影」——在真正的黑暗裡，沒被照到的
// 動物是看不見的，不是一個比背景更黑的洞。原因：背景是深藍漸層（ocean/shaders.ts 的 waterBg），
// 生物沒有光照時 shading 趨近 0（純黑），比背景還暗，於是整隻反而變成剪影。
//
// 做法：在生物材質的 fragment shader 最後（tone mapping 之後、轉 sRGB 之前）依「這個像素被
// 直接光照到多少」把顏色混向「這個像素位置的背景色」。直接光＝手電筒（SpotLight）跟潛水燈
// （PointLight）——ambient／hemisphere 算間接光，不算「被照到」。背景色用跟 waterBg 一模一樣的
// 算法（視線方向的 y → 上下兩色在 sRGB 空間內插再轉線性），所以完全沒被照到的部分會跟背景
// 融成一片，被照到的部分照常顯示。uHide 由引擎依 abyssFactor 給（150m 以淺 0：完全不影響）。
//
// 不套用的：潛水員（主角，有自己的輪廓光＋潛水燈）、水母／櫛水母（加法混合，本來就是光）、
// 誘餌、發光器（userData.noAbyssHide）。

import * as THREE from "three";

export type AbyssHideUniforms = {
  uAhHide: { value: number };
  uAhTopS: { value: THREE.Color };
  uAhBotS: { value: THREE.Color };
  uAhCamRot: { value: THREE.Matrix3 };
  uAhTanHalf: { value: number };
  uAhAspect: { value: number };
  uAhViewport: { value: THREE.Vector2 };
};

export function createAbyssHideUniforms(): AbyssHideUniforms {
  return {
    uAhHide: { value: 0 },
    uAhTopS: { value: new THREE.Color() },
    uAhBotS: { value: new THREE.Color() },
    uAhCamRot: { value: new THREE.Matrix3() },
    uAhTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(27.5)) },
    uAhAspect: { value: 1 },
    uAhViewport: { value: new THREE.Vector2(1, 1) },
  };
}

const DECL = /* glsl */ `
uniform float uAhHide;
uniform vec3 uAhTopS;
uniform vec3 uAhBotS;
uniform mat3 uAhCamRot;
uniform float uAhTanHalf;
uniform float uAhAspect;
uniform vec2 uAhViewport;
vec3 ahSrgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
`;

const BLEND = /* glsl */ `
  if (uAhHide > 0.0) {
    vec3 ahLit = reflectedLight.directDiffuse + reflectedLight.directSpecular;
    float ahLitAmt = smoothstep(0.0, 0.22, dot(ahLit, vec3(0.3333)));
    vec2 ahNdc = gl_FragCoord.xy / uAhViewport * 2.0 - 1.0;
    vec3 ahDir = normalize(uAhCamRot * vec3(ahNdc.x * uAhTanHalf * uAhAspect, ahNdc.y * uAhTanHalf, -1.0));
    // 跟 ocean/shaders.ts 的 waterBg() 同一條公式
    float ahT = clamp(0.5 - 1.08 * ahDir.y, 0.0, 1.0);
    vec3 ahBg = ahSrgbToLinear(mix(uAhTopS, uAhBotS, ahT));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, ahBg, uAhHide * (1.0 - ahLitAmt));
  }
`;

// 已注入過的材質。不用 userData 當旗標：鮟鱇魚／水母每隻複製材質時共用同一個 userData 參照
// （engine.ts applyLoadedModel），用 userData 會讓第二隻以後全部被跳過。
const done = new WeakSet<THREE.Material>();

/** 對一棵子樹裡的 MeshStandard／Physical 材質注入深海隱身（同一顆材質只注入一次）。 */
export function applyAbyssHide(root: THREE.Object3D, uniforms: AbyssHideUniforms) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (done.has(m) || m.userData.noAbyssHide || m.userData.diverRim) continue;
      done.add(m);
      const prev = m.onBeforeCompile;
      const prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = (shader, renderer) => {
        prev.call(m, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\n${DECL}`)
          .replace("#include <tonemapping_fragment>", `#include <tonemapping_fragment>\n${BLEND}`);
      };
      m.customProgramCacheKey = () => `${prevKey.call(m)}|abyssHide`;
      m.needsUpdate = true;
    }
  });
}
