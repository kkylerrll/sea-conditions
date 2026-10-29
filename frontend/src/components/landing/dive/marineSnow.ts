// round 21：海雪（marine snow）——深海影片最有「正在下沉」臨場感的東西：
// 成千上萬顆往上飄過鏡頭的小白點（其實是有機碎屑緩慢下沉，鏡頭沉得更快）。
//
// 做法：一個 THREE.Points（一次 draw call）。每顆粒子有固定的世界座標＋緩慢的
// 自身漂移，vertex shader 用 mod() 把它「包」在鏡頭周圍一個盒子裡——鏡頭往下
// 沉，粒子在畫面上自然就往上飄，速度跟下潛速度成正比，不用另外算捲動速度；
// 快速捲動時另外把點拉長一點（uStreak），看得出「衝下去」。
// 被手電筒光錐照到的粒子變亮（散射），這就是不畫光柱幾何也看得出光束的方式
// ——round 2 使用者拒絕過可見光柱，這裡完全沒有光束 mesh。

import * as THREE from "three";

const VERT = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uTime;
uniform float uPx;
uniform float uStreak;
attribute float aSeed;
varying float vAlpha;
varying float vLit;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform float uFlashCos;
uniform float uFlashK;
uniform float uDensity;
void main() {
  // 自身漂移：很慢的亂流，每顆相位不同
  vec3 p = position;
  p.x += sin(uTime * 0.13 + aSeed * 17.0) * 0.35;
  p.y += sin(uTime * 0.09 + aSeed * 29.0) * 0.25 - uTime * 0.03;
  p.z += cos(uTime * 0.11 + aSeed * 11.0) * 0.3;
  // 包在鏡頭周圍：盒子中心略偏鏡頭前方（-z）
  vec3 c = uCam + vec3(0.0, 0.0, -uBox.z * 0.42);
  vec3 w = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float dist = -mv.z;
  // 只出現一部分粒子：uDensity 0~1 決定可見比例（淺一點的深度比較稀疏）
  float on = step(aSeed, uDensity);
  // 景深：太近（< 1.2）的放大但變淡，太遠的被霧吃掉
  float near = smoothstep(0.4, 1.6, dist);
  float far = 1.0 - smoothstep(14.0, 24.0, dist);
  // 手電筒：粒子在光錐內、而且離光源不太遠就亮起來
  vec3 toP = w - uFlashPos;
  float lp = length(toP);
  float cosA = dot(toP / max(lp, 1e-4), uFlashDir);
  float cone = smoothstep(uFlashCos - 0.02, uFlashCos + 0.12, cosA);
  float atten = 1.0 / (1.0 + lp * lp * 0.012);
  vLit = cone * atten * uFlashK;
  vAlpha = on * near * far * (0.18 + 0.5 * fract(aSeed * 7.31));
  // 約 8% 是比較大、比較模糊的雪片（大塊碎屑／離焦），其餘是細小微粒
  float big = step(0.92, fract(aSeed * 13.1));
  float size = (0.025 + 0.035 * fract(aSeed * 3.7)) * (1.0 + big * 1.6) * (1.0 + uStreak * 0.6);
  vAlpha *= 1.0 - big * 0.45;
  gl_PointSize = on * uPx * size * (900.0 / max(dist, 0.3)) * (1.0 + (1.0 - near) * 1.5);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uBright;
varying float vAlpha;
varying float vLit;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float soft = smoothstep(0.5, 0.0, r);
  float a = vAlpha * soft * (uBright + vLit * 6.0);
  if (a < 0.003) discard;
  vec3 col = mix(vec3(0.72, 0.82, 0.88), vec3(1.0, 0.96, 0.86), clamp(vLit, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}
`;

export class MarineSnow {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private dirTmp = new THREE.Vector3();

  constructor(count: number, pixelRatio: number) {
    // 盒子：寬 22 × 高 16 × 深 26 世界單位，蓋過整個可視範圍（生物車道 -8~+3）
    const box = new THREE.Vector3(22, 16, 26);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * box.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uBox: { value: box },
        uTime: { value: 0 },
        uPx: { value: pixelRatio },
        uStreak: { value: 0 },
        uFlashPos: { value: new THREE.Vector3() },
        uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
        uFlashCos: { value: Math.cos(0.5) },
        uFlashK: { value: 0 },
        uDensity: { value: 0 },
        uBright: { value: 0 },
      },
    });
    this.points = new THREE.Points(geo, this.mat);
    // 包在鏡頭周圍的粒子沒有固定包圍盒，關掉視錐剔除
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /**
   * depthM：鏡頭深度（公尺）；speed：捲動速度（0~1 左右，越快拉長越多）；
   * flash：手電筒（光源、目標、錐角、0~1 強度）。
   */
  update(
    time: number,
    camera: THREE.Camera,
    depthM: number,
    speed: number,
    flash: { pos: THREE.Vector3; target: THREE.Vector3; angle: number; k: number },
  ) {
    const u = this.mat.uniforms;
    // 30m 開始出現，300m 達到最密最亮；淺水被陽光沖淡，幾乎看不到
    const t = THREE.MathUtils.clamp((depthM - 30) / 270, 0, 1);
    const ramp = t * t * (3 - 2 * t);
    u.uDensity.value = 0.15 + 0.85 * ramp;
    u.uBright.value = depthM < 30 ? 0 : 0.25 + 0.75 * ramp;
    this.points.visible = depthM >= 30;
    u.uTime.value = time;
    u.uCam.value.copy(camera.position);
    u.uStreak.value = THREE.MathUtils.clamp(speed, 0, 1);
    u.uFlashPos.value.copy(flash.pos);
    this.dirTmp.copy(flash.target).sub(flash.pos).normalize();
    u.uFlashDir.value.copy(this.dirTmp);
    u.uFlashCos.value = Math.cos(flash.angle);
    u.uFlashK.value = flash.k;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
