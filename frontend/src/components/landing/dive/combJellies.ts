// round 21：深淵的「水母」改成櫛水母（ctenophore，例如球櫛水母 Pleurobrachia）——不用模型，
// 整隻是程序化的：
//   身體  LatheGeometry 蛋形，幾乎透明，只有 fresnel 邊緣一圈淡藍
//   櫛板  8 條從頂端（反口端）到口端的經線櫛帶，shader 讓彩虹色帶沿著櫛帶流動，
//         再疊一層「節律波」（櫛板依序拍動的 metachronal wave），一節一節亮過去
//   觸手  兩條細長、會擺動的觸手（THREE.Line，每幀改頂點，不配置新記憶體）
// 櫛水母的彩虹其實是櫛板繞射光，不是生物發光——所以底色只留一點點亮度，被手電筒
// 光錐照到時（uLit）才整條炸開成彩虹；手電筒外仍隱約看得到，不會整隻消失。
//
// 位置跟海雪一樣「包」在鏡頭周圍：每隻記住自己在畫面上的水平比例 fx、離鏡頭的距離 dist、
// 一個世界 Y 基準；鏡頭往下沉時牠們在畫面上往上飄、從頂端出去再從底部回來。

import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vLit;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform float uFlashCos;
uniform float uFlashK;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vec3 toP = wp.xyz - uFlashPos;
  float lp = length(toP);
  float cone = smoothstep(uFlashCos - 0.03, uFlashCos + 0.1, dot(toP / max(lp, 1e-4), uFlashDir));
  vLit = cone * uFlashK / (1.0 + lp * lp * 0.012);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying float vLit;
uniform float uTime;
uniform float uPhase;
uniform float uFade;
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
void main() {
  float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  // 身體：幾乎透明，邊緣一圈冷藍，中央極淡的內光
  vec3 body = vec3(0.45, 0.68, 0.9) * (0.025 + 0.32 * pow(fres, 3.0)) + vec3(0.3, 0.5, 0.85) * 0.03 * (1.0 - fres);
  // 8 條經線櫛帶：uv.x 是繞軸角度（0~1），uv.y 是沿身體的位置（0＝口端、1＝反口端）
  float az = vUv.x * 8.0;
  float row = floor(az + 0.5);
  float f = abs(fract(az + 0.5) - 0.5);
  float rowMask = smoothstep(0.1, 0.03, f) * smoothstep(0.1, 0.2, vUv.y) * smoothstep(0.93, 0.82, vUv.y);
  // 一片一片的櫛板
  float plates = smoothstep(0.15, 0.45, fract(vUv.y * 24.0)) * smoothstep(0.95, 0.7, fract(vUv.y * 24.0));
  // 節律波：從口端往反口端一節一節亮過去，各條櫛帶相位稍微錯開
  float wave = pow(0.5 + 0.5 * sin(vUv.y * 20.0 - uTime * 6.0 + row * 0.8 + uPhase), 3.0);
  float hue = fract(vUv.y * 1.6 - uTime * 0.3 + row * 0.125 + fres * 0.35 + uPhase * 0.1);
  vec3 rainbow = hsv2rgb(vec3(hue, 0.85, 1.0));
  float lit = 0.65 + clamp(vLit, 0.0, 1.5) * 3.0;
  vec3 combs = rainbow * rowMask * plates * (0.3 + 0.7 * wave) * lit;
  vec3 col = (body * (1.0 + vLit * 2.0) + combs) * uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

// round 21 第二輪回饋：「觸手像氣球的繩子」——原本兩條細線拖到 3.2 倍體長、粗細亮度從頭到尾
// 一樣。球櫛水母的觸手實際上是：從身體兩側的觸手鞘伸出、長度跟身體差不多、往末端漸細漸淡，
// 上面一路長著細短的側絲（tentilla），末端會捲起來；而且常常整條縮回鞘裡。所以：
//   - 只有一半的個體伸出觸手（其他的縮著）
//   - 主觸手長 1.1~1.5 倍體長，頂點色沿長度淡出（加法混合下顏色變暗＝變透明）
//   - 每條主觸手掛 TENTILLA 條側絲（LineSegments），一樣往外淡出，跟著主觸手擺動
const TENTACLE_POINTS = 18;
const TENTILLA = 6;
const TENT_COLOR = new THREE.Color(0xbfe6ff);
type Comb = {
  group: THREE.Group;
  mat: THREE.ShaderMaterial;
  tentacles: THREE.Line[];
  tentilla: THREE.LineSegments[];
  tentMat: THREE.LineBasicMaterial;
  tentLen: number;
  fx: number;
  dist: number;
  baseY: number;
  phase: number;
  spin: number;
  size: number;
};

// ⑤ 最後一章留下的 2 隻櫛水母的構圖位置（視窗比例 fx, fy）：桌機在右半邊、避開潛水員
// （約 0.68~0.76, 0.45~0.55）；窄螢幕標題到 CTA 佔掉視窗約 17%~41%、潛水員在 0.42~0.5，
// 放在左上角跟 CTA 下方那段空白。
const FINALE_SLOTS: [number, number][][] = [
  [
    [0.6, 0.25],
    [0.86, 0.62],
  ],
  [
    [0.18, 0.08],
    [0.22, 0.62],
  ],
];
const narrowSlot = (narrow: boolean) => (narrow ? 1 : 0);

export type ScreenExclusion = { x0: number; y0: number; x1: number; y1: number } | null;

export class CombJellies {
  readonly group = new THREE.Group();
  private combs: Comb[] = [];
  private ndc = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private narrow: boolean;

  /**
   * count：數量；unitsPerM：引擎的世界單位／公尺；boost：深淵放大倍率；
   * narrow：窄螢幕（文字置中，可用滿版寬度）。
   */
  constructor(count: number, unitsPerM: number, boost: number, narrow: boolean) {
    this.narrow = narrow;
    const geo = CombJellies.buildBody();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: Math.random() * 6.28 },
          uFade: { value: 0 },
          uFlashPos: { value: new THREE.Vector3() },
          uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
          uFlashCos: { value: Math.cos(0.5) },
          uFlashK: { value: 0 },
        },
      });
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo, mat);
      g.add(body);
      const tentMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const tentacles: THREE.Line[] = [];
      const tentilla: THREE.LineSegments[] = [];
      // 一半的個體伸出觸手（第 0、2、4… 隻）；最後一章留下的第 0 隻有、第 1 隻沒有
      if (i % 2 === 0) {
        for (let k = 0; k < 2; k++) {
          const tg = new THREE.BufferGeometry();
          tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TENTACLE_POINTS * 3), 3));
          const tc = new Float32Array(TENTACLE_POINTS * 3);
          for (let j = 0; j < TENTACLE_POINTS; j++) {
            const f = Math.pow(1 - j / (TENTACLE_POINTS - 1), 1.6);
            tc[j * 3] = TENT_COLOR.r * f;
            tc[j * 3 + 1] = TENT_COLOR.g * f;
            tc[j * 3 + 2] = TENT_COLOR.b * f;
          }
          tg.setAttribute("color", new THREE.BufferAttribute(tc, 3));
          const line = new THREE.Line(tg, tentMat);
          line.frustumCulled = false;
          g.add(line);
          tentacles.push(line);
          // 側絲：每條 2 個頂點（根部接在主觸手上、末端往外下方），根部亮、末端淡
          const sg = new THREE.BufferGeometry();
          sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TENTILLA * 2 * 3), 3));
          const sc = new Float32Array(TENTILLA * 2 * 3);
          for (let j = 0; j < TENTILLA; j++) {
            const along = 0.2 + (j / TENTILLA) * 0.75;
            const f = Math.pow(1 - along, 1.6) * 0.8;
            sc.set([TENT_COLOR.r * f, TENT_COLOR.g * f, TENT_COLOR.b * f, 0, 0, 0], j * 6);
          }
          sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
          const seg = new THREE.LineSegments(sg, tentMat);
          seg.frustumCulled = false;
          g.add(seg);
          tentilla.push(seg);
        }
      }
      // 體長 15~22 cm（球櫛水母的真實尺寸）× 深淵放大倍率
      const size = (0.15 + Math.random() * 0.07) * unitsPerM * boost;
      g.scale.setScalar(size);
      this.group.add(g);
      this.combs.push({
        group: g,
        mat,
        tentacles,
        tentilla,
        tentMat,
        tentLen: 1.1 + Math.random() * 0.4,
        // 桌機只用右側（標題字到約 44% 寬），窄螢幕文字置中可以滿版
        fx: narrow ? 0.08 + Math.random() * 0.84 : 0.5 + Math.random() * 0.45,
        dist: 2.8 + Math.random() * 3.7,
        baseY: Math.random(),
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.15),
        size,
      });
    }
    this.group.visible = false;
  }

  /** 蛋形身體：沿 y 軸，長度 1，最寬處直徑約 0.8，口端略尖。 */
  private static buildBody(): THREE.LatheGeometry {
    const pts: THREE.Vector2[] = [];
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const v = i / n;
      const r = 0.4 * Math.pow(Math.sin(Math.PI * v), 0.8) * (0.9 + 0.1 * v);
      pts.push(new THREE.Vector2(Math.max(r, 0.001), v - 0.5));
    }
    return new THREE.LatheGeometry(pts, 64);
  }

  update(
    time: number,
    camera: THREE.PerspectiveCamera,
    depthM: number,
    flash: { pos: THREE.Vector3; target: THREE.Vector3; angle: number; k: number },
    exclusion: ScreenExclusion,
    finale: number,
    vpTop = 0,
    vpScale = 1,
  ) {
    // 300m 開始出現，到底（1000m）都在
    const fadeIn = THREE.MathUtils.smoothstep(depthM, 280, 330);
    this.group.visible = fadeIn > 0.001;
    if (!this.group.visible) return;
    this.dir.copy(flash.target).sub(flash.pos).normalize();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    for (let i = 0; i < this.combs.length; i++) {
      const c = this.combs[i];
      const h = 2 * c.dist * tanHalf;
      const w = h * camera.aspect;
      const boxH = h * 1.35;
      // 包在鏡頭周圍的 Y：鏡頭往下沉 → 在畫面上往上飄；自身再極慢地上浮＋微微上下
      const rel = c.baseY * boxH - camera.position.y + time * 0.04;
      const wrapped = ((rel % boxH) + boxH) % boxH - boxH / 2;
      let y = camera.position.y + wrapped + Math.sin(time * 0.35 + c.phase) * 0.08;
      let x = camera.position.x + (c.fx - 0.5) * w + Math.sin(time * 0.12 + c.phase) * 0.15;
      // ⑤ 最後一章：留下的 2 隻慢慢漂到固定的構圖位置（畫面右側上／下），不再靠隨機位置碰運氣
      // ——不這樣做，捲到底停住時牠們常常剛好繞在畫面外，結尾畫面空空的。
      if (i < 2 && finale > 0) {
        const slot = FINALE_SLOTS[narrowSlot(this.narrow)][i];
        const sx = camera.position.x + (slot[0] - 0.5) * w + Math.sin(time * 0.12 + c.phase) * 0.12;
        // slot 是視窗比例，換成 canvas 比例（捲到底時頁尾把舞台往上推）
        const fy = vpTop + slot[1] * vpScale;
        const sy = camera.position.y + (0.5 - fy) * h + Math.sin(time * 0.35 + c.phase) * 0.08;
        const k = finale * finale * (3 - 2 * finale);
        x = THREE.MathUtils.lerp(x, sx, k);
        y = THREE.MathUtils.lerp(y, sy, k);
      }
      const z = camera.position.z - c.dist;
      c.group.position.set(x, y, z);
      // 慢慢自轉（櫛帶在畫面上流過）＋輕微傾斜
      c.group.rotation.set(Math.sin(time * 0.2 + c.phase) * 0.22, time * c.spin + c.phase, Math.sin(time * 0.17 + c.phase * 1.3) * 0.18);

      // 進出包圍盒邊緣時淡出，不要在畫面上突然跳；CTA 排除區（⑤）內也淡掉
      const edge0 = 1 - THREE.MathUtils.smoothstep(Math.abs(wrapped), boxH * 0.38, boxH * 0.5);
      const edge = i < 2 ? THREE.MathUtils.lerp(edge0, 1, finale) : edge0;
      let excl = 1;
      if (exclusion) {
        this.ndc.copy(c.group.position).project(camera);
        const sx = (this.ndc.x + 1) / 2;
        const sy = (1 - this.ndc.y) / 2;
        const pad = 0.06;
        const inX = THREE.MathUtils.smoothstep(sx, exclusion.x0 - pad, exclusion.x0) * (1 - THREE.MathUtils.smoothstep(sx, exclusion.x1, exclusion.x1 + pad));
        const inY = THREE.MathUtils.smoothstep(sy, exclusion.y0 - pad, exclusion.y0) * (1 - THREE.MathUtils.smoothstep(sy, exclusion.y1, exclusion.y1 + pad));
        excl = 1 - inX * inY;
      }
      // ⑤ 最後一章只留前 2 隻
      const keep = i < 2 ? 1 : 1 - finale;
      const fade = fadeIn * edge * excl * keep;
      const u = c.mat.uniforms;
      u.uTime.value = time;
      u.uFade.value = fade;
      u.uFlashPos.value.copy(flash.pos);
      u.uFlashDir.value.copy(this.dir);
      u.uFlashCos.value = Math.cos(flash.angle);
      u.uFlashK.value = flash.k;

      // 觸手：從身體兩側中段偏口端的觸手鞘伸出，往下拖、末端捲起，側絲跟著主觸手擺
      if (c.tentacles.length) {
        c.tentMat.opacity = 0.55 * fade;
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? -1 : 1;
          const arr = (c.tentacles[k].geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
          for (let j = 0; j < TENTACLE_POINTS; j++) {
            const s = j / (TENTACLE_POINTS - 1);
            // 末端捲：越往末端彎得越多（角度隨 s² 增加），加上緩慢擺動
            const curl = s * s * 1.2 + Math.sin(time * 0.8 + c.phase + k * 1.9) * 0.35 * s;
            const r = c.tentLen * s;
            arr[j * 3] = side * (0.34 + Math.sin(curl) * r * 0.45);
            arr[j * 3 + 1] = -0.12 - Math.cos(curl) * r * 0.9;
            arr[j * 3 + 2] = Math.sin(time * 0.7 - s * 3 + c.phase + k) * 0.18 * s;
          }
          c.tentacles[k].geometry.getAttribute("position").needsUpdate = true;
          // 側絲：沿主觸手均勻分布，往外、往下斜伸出，長度約 0.1~0.16 體長，輕輕擺動
          const sarr = (c.tentilla[k].geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
          for (let j = 0; j < TENTILLA; j++) {
            const along = 0.2 + (j / TENTILLA) * 0.75;
            const fj = along * (TENTACLE_POINTS - 1);
            const j0 = Math.floor(fj);
            const j1 = Math.min(j0 + 1, TENTACLE_POINTS - 1);
            const tt = fj - j0;
            const bx = arr[j0 * 3] + (arr[j1 * 3] - arr[j0 * 3]) * tt;
            const by = arr[j0 * 3 + 1] + (arr[j1 * 3 + 1] - arr[j0 * 3 + 1]) * tt;
            const bz = arr[j0 * 3 + 2] + (arr[j1 * 3 + 2] - arr[j0 * 3 + 2]) * tt;
            const len = 0.1 + 0.06 * Math.sin(j * 2.3 + c.phase);
            const wob = Math.sin(time * 1.3 + j * 1.7 + c.phase) * 0.35;
            const alt = j % 2 === 0 ? 1 : -1;
            sarr.set([bx, by, bz, bx + side * alt * Math.cos(0.6 + wob) * len, by - Math.sin(0.6 + wob) * len, bz + alt * 0.04], j * 6);
          }
          c.tentilla[k].geometry.getAttribute("position").needsUpdate = true;
        }
      }
    }
  }
}
