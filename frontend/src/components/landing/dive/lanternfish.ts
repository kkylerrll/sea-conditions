// round 21：暮光帶（約 200~600m）的燈籠魚群（Myctophidae）——地球上數量最多的脊椎動物之一，
// 白天就待在這個深度。外觀：小小一條、深色帶銀光的身體、大眼睛，腹側跟體側有一排排藍色
// 發光器（photophore）。在全黑的水裡，第一眼看到的其實是「一群會移動的藍色小光點」，
// 手電筒照過去才看得到魚身。
//
// 做法：魚身是一個 InstancedMesh（一次 draw call，程序化幾何：拉長的橢球＋分叉尾鰭），
// 發光器是一個 Points（一次 draw call），每幀用魚的矩陣把每條魚自己的那幾顆光點轉到世界
// 座標——預先配置好的 Float32Array，不在每幀配置新記憶體。
// 群體：整群共用一個中心、一個前進方向，碰到可用範圍的邊界就慢慢轉身；個體在隊形裡有固定
// 偏移＋各自的小幅亂動與擺尾。位置跟櫛水母一樣包在鏡頭周圍，鏡頭往下沉時魚群往上飄過。

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// 每條魚身上的發光器（魚的局部座標，體長 1、頭朝 +x）：腹側一排、體側一排，左右兩側都有。
// 位置算在魚身橢球（半軸 0.5／0.13／0.07）表面再往外推 12%——放在表面以內會被魚身自己的
// 深度擋掉（round 21 第一版就是這樣，整群魚只剩黑影、看不到任何光點）。
const BODY_A = [0.5, 0.13, 0.07];
function onBody(x: number, y: number, side: number): [number, number, number] {
  const k = 1 - (x / BODY_A[0]) ** 2 - (y / BODY_A[1]) ** 2;
  const z = BODY_A[2] * Math.sqrt(Math.max(k, 0.02));
  return [x * 1.02, y * 1.12, side * z * 1.12 + side * 0.004];
}
const PHOTOPHORES: [number, number, number][] = [];
for (const side of [-1, 1]) {
  for (let i = 0; i < 7; i++) PHOTOPHORES.push(onBody(0.3 - i * 0.09, -0.105, side));
  for (let i = 0; i < 4; i++) PHOTOPHORES.push(onBody(0.12 - i * 0.12, -0.045, side));
  PHOTOPHORES.push(onBody(0.36, -0.06, side));
}
const PH = PHOTOPHORES.length;

const DOT_VERT = /* glsl */ `
attribute float aFade;
varying float vFade;
uniform float uPx;
void main() {
  vFade = aFade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPx * 72.0 / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}
`;
const DOT_FRAG = /* glsl */ `
varying float vFade;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.12, 0.0, r);
  float halo = pow(smoothstep(0.5, 0.0, r), 2.2) * 0.55;
  float a = (core + halo) * vFade;
  if (a < 0.004) discard;
  // 燈籠魚的發光器是偏青的藍（約 470~490 nm），中心近白
  gl_FragColor = vec4(vec3(0.2, 0.62, 1.0) * halo * vFade * 1.6 + vec3(0.75, 0.93, 1.0) * core * vFade, a);
}
`;

type Fish = {
  offset: THREE.Vector3;
  phase: number;
  wiggle: number;
  scale: number;
};

export class LanternfishSchool {
  readonly group = new THREE.Group();
  private fish: Fish[] = [];
  private mesh: THREE.InstancedMesh;
  private dots: THREE.Points;
  private dotPos: Float32Array;
  private dotFade: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private ndc = new THREE.Vector3();
  // 群體狀態
  private cx = 0;
  private heading = 1; // 平滑後的朝向（-1~1，畫面左右）
  private headingGoal = 1;
  private baseY = Math.random();
  private narrow: boolean;
  private dist = 5.2;

  constructor(count: number, unitsPerM: number, boost: number, narrow: boolean, pixelRatio: number) {
    this.narrow = narrow;
    // 魚身：體長 1 的局部尺寸，實例矩陣再縮放成真實大小
    const body = new THREE.SphereGeometry(0.5, 14, 8);
    body.scale(1, 0.26, 0.14);
    const head = new THREE.SphereGeometry(0.16, 10, 8);
    head.scale(1, 1, 0.8);
    head.translate(0.3, 0.01, 0);
    const tail = new THREE.ConeGeometry(0.13, 0.26, 4, 1);
    tail.rotateZ(Math.PI / 2);
    tail.scale(1, 1, 0.25);
    tail.translate(-0.58, 0, 0);
    const geo = mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), tail.toNonIndexed()]);
    // 深色帶銀光：手電筒外幾乎看不到，照到時反出一點金屬光
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a5563, metalness: 0.6, roughness: 0.35, transparent: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    for (let i = 0; i < count; i++) {
      // 隊形：扁平的橢球團，比較密
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      this.fish.push({
        offset: new THREE.Vector3(Math.cos(a) * r * 1.5, (Math.random() - 0.5) * 0.9, Math.sin(a) * r * 1.0),
        phase: Math.random() * Math.PI * 2,
        wiggle: 7 + Math.random() * 4,
        // 體長 7~12 cm × 放大倍率
        scale: (0.07 + Math.random() * 0.05) * unitsPerM * boost,
      });
    }

    this.dotPos = new Float32Array(count * PH * 3);
    this.dotFade = new Float32Array(count * PH);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(this.dotPos, 3));
    dg.setAttribute("aFade", new THREE.BufferAttribute(this.dotFade, 1));
    this.dots = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        vertexShader: DOT_VERT,
        fragmentShader: DOT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uPx: { value: pixelRatio } },
      }),
    );
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
    this.group.visible = false;
  }

  update(time: number, dt: number, camera: THREE.PerspectiveCamera, depthM: number) {
    // 200m 淡入、600m 淡出
    const fade = THREE.MathUtils.smoothstep(depthM, 190, 240) * (1 - THREE.MathUtils.smoothstep(depthM, 560, 640));
    this.group.visible = fade > 0.001;
    if (!this.group.visible) return;

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const h = 2 * this.dist * tanHalf;
    const w = h * camera.aspect;
    // 可用的水平範圍（相對鏡頭）：桌機只用畫面右側 52%~92%，窄螢幕 10%~90%
    const minX = (this.narrow ? 0.1 : 0.52) * w - w / 2 + 1.0;
    const maxX = (this.narrow ? 0.9 : 0.92) * w - w / 2 - 1.0;
    // 群體前進：碰到邊界就把目標朝向翻過來，實際朝向慢慢轉（約 1.5 秒）
    this.cx += this.heading * 0.32 * dt;
    if (this.cx > maxX) this.headingGoal = -1;
    else if (this.cx < minX) this.headingGoal = 1;
    this.heading += (this.headingGoal - this.heading) * (1 - Math.exp(-dt / 0.6));
    // 垂直：包在鏡頭周圍（鏡頭下沉 → 魚群往上飄）
    // 包圍盒只比可視高度高一點：魚群大部分時間都在畫面裡，只在換圈時短暫淡出
    const boxH = h * 1.15;
    const rel = this.baseY * boxH - camera.position.y;
    const wrapped = ((rel % boxH) + boxH) % boxH - boxH / 2;
    const gy = camera.position.y + wrapped + Math.sin(time * 0.3) * 0.15;
    const edge = 1 - THREE.MathUtils.smoothstep(Math.abs(wrapped), boxH * 0.42, boxH * 0.5);
    const gx = camera.position.x + this.cx;
    const gz = camera.position.z - this.dist;
    // 轉身時身體朝向：heading 1 → 頭朝 +x（yaw 0），-1 → 頭朝 -x（yaw π）；轉身途中看到正面／背面
    const yawBase = Math.acos(THREE.MathUtils.clamp(this.heading, -1, 1));

    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      this.p.set(
        gx + f.offset.x + Math.sin(time * 0.7 + f.phase) * 0.12,
        gy + f.offset.y + Math.sin(time * 0.9 + f.phase * 1.7) * 0.06,
        gz + f.offset.z + Math.cos(time * 0.6 + f.phase) * 0.1,
      );
      // 擺尾（整條小魚左右快速擺）＋個體朝向的小誤差
      this.e.set(0, yawBase + Math.sin(time * f.wiggle + f.phase) * 0.18 + Math.sin(f.phase) * 0.12, Math.sin(time * 0.5 + f.phase) * 0.06);
      this.q.setFromEuler(this.e);
      this.s.setScalar(f.scale);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);

      // 桌機：游進左側文字欄就淡掉
      let fishFade = fade * edge;
      if (!this.narrow) {
        this.ndc.copy(this.p).project(camera);
        const sx = (this.ndc.x + 1) / 2;
        fishFade *= THREE.MathUtils.smoothstep(sx, 0.44, 0.5);
      }
      for (let k = 0; k < PH; k++) {
        const o = PHOTOPHORES[k];
        this.v.set(o[0], o[1], o[2]).applyMatrix4(this.m);
        const j = (i * PH + k) * 3;
        this.dotPos[j] = this.v.x;
        this.dotPos[j + 1] = this.v.y;
        this.dotPos[j + 2] = this.v.z;
        // 發光器各自微微閃爍
        this.dotFade[i * PH + k] = fishFade * (0.75 + 0.25 * Math.sin(time * 2.3 + f.phase + k));
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dots.geometry.getAttribute("position").needsUpdate = true;
    this.dots.geometry.getAttribute("aFade").needsUpdate = true;
    // 魚身不支援逐實例透明，整群一起淡入淡出（文字欄淡出只套在發光點上；魚身本來就暗）
    (this.mesh.material as THREE.MeshStandardMaterial).opacity = fade * edge;
  }
}
