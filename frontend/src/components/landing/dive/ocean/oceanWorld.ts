// 海面世界：FFT（或 Gerstner 降級）海面網格 + 天空穹頂 + 浮標鏡頭的海面取樣。
//
// 移植自 "Ocean · WebGPU" by hirakujira (CodePen, MIT)，改寫成 three.js / WebGL2：
//   - 海面是以鏡頭為中心的極座標格網（環距隨距離指數成長，像素大小約略一致），
//     頂點 shader 取三層 cascade 的位移，fragment shader 取導數與泡沫。
//   - 天空是全螢幕穹頂，讀烘焙好的大氣貼圖＋太陽盤＋漂移的雲層。
//   - 「浮標攝影機」：鏡頭是一個阻尼彈簧，騎在低通過濾後的海面上（原作 CAMERA 段）。
//     原作在 GPU compute 裡讀貼圖；這裡在 CPU 用同一份頻譜算（spectrum.ts evalBuoy），
//     因為 JS 端也需要鏡頭位置的真實波高來決定水線。
//   - 水線：鏡頭裝在一個半徑 DOME_RADIUS_M 的防水罩裡。罩子露出水面的部分看空氣側
//     （天空＋從上往下看的海面），泡在水裡的部分看水側（水下背景＋從下往上看的水面：
//     Snell 窗與全反射）。鏡頭下沉時，水線在畫面上連續掃過，不是兩個場景切換。
//
// 座標：海面 shader 內部用公尺；世界座標＝公尺 × WORLD_UNITS_PER_METER，海平面在 y=0。

import * as THREE from "three";
import { skyAmbient, sunRadiance } from "./atmosphere";
import {
  BUOY_DAMPING,
  BUOY_STIFFNESS,
  DOME_RADIUS_M,
  FOAM_DECAY,
  LENGTHS,
  SUN_AZIMUTH,
  SUN_ELEVATION,
  TAU,
  WORLD_UNITS_PER_METER,
} from "./config";
import { FFTOcean, supportsFloatTargets } from "./fftOcean";
import { evalGerstner, gerstnerUniforms } from "./gerstner";
import { BLIT_VERT, envFrag, oceanFrag, oceanVert, skyFrag, SKY_VERT } from "./shaders";
import { evalBuoy } from "./spectrum";

export type OceanMode = "fft" | "gerstner";
export type OceanOptions = {
  /** 手機／低階裝置：一律用 Gerstner、縮小格網與大氣烘焙。 */
  mobile: boolean;
  /** 除錯／比較用：強制模式（網址 ?ocean=gerstner|fft|fft128）。 */
  force?: "fft" | "fft128" | "gerstner";
};

/** 能不能建立海面：天空烘焙至少需要可繪製的半精度浮點貼圖。 */
export function canBuildOcean(renderer: THREE.WebGLRenderer): boolean {
  return supportsFloatTargets(renderer) || renderer.extensions.has("EXT_color_buffer_half_float");
}

function buildGridGeometry(seg: number, rMax: number): THREE.BufferGeometry {
  // position.xy＝水平偏移（公尺），position.z＝該環的格距（公尺，給 mip 等級與淡出用）。
  const B = TAU / seg;
  const A = 0.04 / B;
  const rings = Math.ceil(Math.log(rMax / A + 1) / B);
  const pos = new Float32Array((rings + 1) * seg * 3);
  for (let i = 0; i <= rings; i++) {
    const r = A * (Math.exp(B * i) - 1);
    const spacing = A * B * Math.exp(B * i);
    for (let j = 0; j < seg; j++) {
      const o = (i * seg + j) * 3;
      pos[o] = r * Math.cos(j * B);
      pos[o + 1] = r * Math.sin(j * B);
      pos[o + 2] = spacing;
    }
  }
  const idx = new Uint32Array(rings * seg * 6);
  let o = 0;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      idx[o++] = a;
      idx[o++] = a + seg;
      idx[o++] = b;
      idx[o++] = b;
      idx[o++] = a + seg;
      idx[o++] = b + seg;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class OceanWorld {
  readonly mode: OceanMode;
  readonly group = new THREE.Group();

  /** 浮標（阻尼彈簧）目前的海面高度（m，相對平均海平面）與傾斜用的海面法線（已平滑）。 */
  heaveM = 0;
  readonly buoyNormal = new THREE.Vector3(0, 1, 0);
  /** 鏡頭正下方海面的真實波高（m，未經彈簧延遲），水線判斷用。 */
  waveHeightM = 0;

  private renderer: THREE.WebGLRenderer;
  private fft: FFTOcean | null = null;
  private envRT: THREE.WebGLRenderTarget;
  private oceanMesh: THREE.Mesh;
  private skyMesh: THREE.Mesh;
  private shared: Record<string, THREE.IUniform>;
  private oceanMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  private tmpTop = new THREE.Color();
  private tmpBot = new THREE.Color();
  private vel = 0;
  private buoyInit = false;
  private sample = { h: 0, dx: 0, dz: 0 };
  private time = 0;
  readonly sunDir: THREE.Vector3;

  constructor(renderer: THREE.WebGLRenderer, opts: OceanOptions) {
    this.renderer = renderer;
    const wantFft = opts.force ? opts.force !== "gerstner" : !opts.mobile;
    this.mode = wantFft && supportsFloatTargets(renderer) ? "fft" : "gerstner";
    const lowTier = opts.mobile || this.mode === "gerstner";

    // 太陽：相對鏡頭正前方（-z），SUN_AZIMUTH 為正偏左（-x）。
    const ce = Math.cos(SUN_ELEVATION);
    this.sunDir = new THREE.Vector3(-Math.sin(SUN_AZIMUTH) * ce, Math.sin(SUN_ELEVATION), -Math.cos(SUN_AZIMUTH) * ce);
    const sunV: [number, number, number] = [this.sunDir.x, this.sunDir.y, this.sunDir.z];
    const sunC = sunRadiance(sunV);
    const amb = skyAmbient(sunV);

    // ---- 天空大氣烘焙（一次）----
    const envW = lowTier ? 256 : 512;
    const envH = envW / 2;
    this.envRT = new THREE.WebGLRenderTarget(envW, envH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.bakeEnv(envW, envH, lowTier ? 32 : 64, lowTier ? 8 : 16);

    // ---- 共用 uniforms ----
    this.shared = {
      uTime: { value: 0 },
      uSunDir: { value: this.sunDir.clone() },
      uSunColor: { value: new THREE.Vector3(...sunC) },
      uAmbient: { value: new THREE.Vector3(...amb) },
      uEnv: { value: this.envRT.texture },
      uWaterTopS: { value: new THREE.Vector3(0.5, 0.88, 0.97) },
      uWaterBotS: { value: new THREE.Vector3(0.1, 0.64, 0.85) },
      uYw: { value: -50 },
      uWuM: { value: WORLD_UNITS_PER_METER },
    };

    // ---- 海面材質 ----
    const oceanUniforms: Record<string, THREE.IUniform> = {
      ...this.shared,
      uCamXZ: { value: new THREE.Vector2() },
      uNear: { value: 0 },
      uCamDepth: { value: 0 },
      uWindowGain: { value: 1 },
    };
    let N = 256;
    if (this.mode === "fft") {
      N = opts.force === "fft128" ? 128 : 256;
      this.fft = new FFTOcean(renderer, N);
      for (let c = 0; c < 3; c++) {
        oceanUniforms[`uDisp${c}`] = { value: this.fft.dispTextures[c] };
        oceanUniforms[`uDer${c}`] = { value: this.fft.derTextures[c] };
      }
    } else {
      const g = gerstnerUniforms();
      oceanUniforms.uGA = { value: g.ga };
      oceanUniforms.uGB = { value: g.gb };
    }
    this.oceanMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: oceanVert(N, this.mode),
      fragmentShader: oceanFrag(N, this.mode, lowTier ? 3 : 4),
      uniforms: oceanUniforms,
      side: THREE.DoubleSide,
    });
    const grid = lowTier ? buildGridGeometry(192, 4500) : buildGridGeometry(384, 5000);
    this.oceanMesh = new THREE.Mesh(grid, this.oceanMat);
    this.oceanMesh.frustumCulled = false;
    this.oceanMesh.renderOrder = -10;
    this.group.add(this.oceanMesh);

    // ---- 天空穹頂 ----
    this.skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: skyFrag(lowTier ? 4 : 6),
      uniforms: { ...this.shared },
      depthTest: true,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat);
    this.skyMesh.frustumCulled = false;
    // 最後畫：被海面或生物蓋住的像素會被深度測試擋掉，不浪費雲層的 fbm。
    this.skyMesh.renderOrder = 1000;
    this.group.add(this.skyMesh);
  }

  private bakeEnv(w: number, h: number, steps: number, lightSteps: number) {
    const r = this.renderer;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: BLIT_VERT,
      fragmentShader: envFrag(steps, lightSteps),
      uniforms: {
        uSunDir: { value: this.sunDir.clone() },
        uSize: { value: new THREE.Vector2(w, h) },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.envRT);
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    quad.geometry.dispose();
    mat.dispose();
  }

  /** 取樣低通海面（鏡頭位置，單位公尺）。 */
  private sampleSurface(xM: number, zM: number, t: number) {
    if (this.fft) evalBuoy(this.fft.spectrum.buoy, xM, zM, t, this.sample);
    else evalGerstner(xM, zM, t, this.sample);
  }

  /**
   * 浮標一步：鏡頭是阻尼彈簧，騎在低通海面上；回傳之後 heaveM／buoyNormal／waveHeightM 都是最新值。
   * （原作 CAMERA 段：vel += ((goal - pos)·9 - vel·4)·dt；法線以 3/s 平滑。）
   */
  stepBuoy(dt: number, time: number, camXM: number, camZM: number) {
    this.time = time;
    this.sampleSurface(camXM, camZM, time);
    const s = this.sample;
    this.waveHeightM = s.h;
    const step = Math.min(Math.max(dt, 0), 0.05);
    if (!this.buoyInit) {
      this.heaveM = s.h;
      this.vel = 0;
      this.buoyNormal.set(-s.dx, 1, -s.dz).normalize();
      this.buoyInit = true;
    }
    this.vel += ((s.h - this.heaveM) * BUOY_STIFFNESS - this.vel * BUOY_DAMPING) * step;
    this.heaveM += this.vel * step;
    const target = new THREE.Vector3(-s.dx, 1, -s.dz).normalize();
    this.buoyNormal.lerp(target, 1 - Math.exp(-3 * step)).normalize();
  }

  /**
   * 每幀更新 uniforms 並推進 FFT。camera 的位置／朝向必須已經設定好（world units）。
   * cameraYm：鏡頭高度（公尺，相對平均海平面，水上為正）。
   */
  update(opts: {
    dt: number;
    time: number;
    camera: THREE.PerspectiveCamera;
    cameraYm: number;
    darkness: number;
    waterTop: THREE.Color;
    waterBottom: THREE.Color;
  }) {
    const { dt, time, camera, cameraYm, darkness } = opts;
    const u = this.shared;
    u.uTime.value = time;

    // 水線：鏡頭相對於「鏡頭正下方真實海面」的高度 δ（m，水上為正）。
    const delta = cameraYm - this.waveHeightM;
    u.uYw.value = Math.max(-8, Math.min(8, -delta / DOME_RADIUS_M));
    const camDepth = Math.max(-delta, 0);

    this.tmpTop.copy(opts.waterTop).convertLinearToSRGB();
    this.tmpBot.copy(opts.waterBottom).convertLinearToSRGB();
    (u.uWaterTopS.value as THREE.Vector3).set(this.tmpTop.r, this.tmpTop.g, this.tmpTop.b);
    (u.uWaterBotS.value as THREE.Vector3).set(this.tmpBot.r, this.tmpBot.g, this.tmpBot.b);

    const ou = this.oceanMat.uniforms;
    ou.uCamXZ.value.set(camera.position.x / WORLD_UNITS_PER_METER, camera.position.z / WORLD_UNITS_PER_METER);
    ou.uNear.value = 1 - smooth(0, 1.5, Math.max(delta, 0));
    ou.uCamDepth.value = camDepth;
    ou.uWindowGain.value = Math.pow(Math.max(0, 1 - darkness), 2.2);

    // 太深就看不見水面了：關掉海面網格與 FFT，只留穹頂畫水下背景。
    const deep = camDepth > 80;
    this.oceanMesh.visible = !deep;
    if (this.fft && !deep) {
      this.fft.update(time, dt);
      for (let c = 0; c < 3; c++) {
        ou[`uDisp${c}`].value = this.fft.dispTextures[c];
        ou[`uDer${c}`].value = this.fft.derTextures[c];
      }
    }
  }

  /** 目前 FFT 用的陣列大小（除錯／日誌用）。 */
  describe(): string {
    return this.mode === "fft" ? `fft N=${this.fft!.N} cascades=${LENGTHS.join("/")}m foamDecay=${FOAM_DECAY}` : "gerstner x12";
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  dispose() {
    this.fft?.dispose();
    this.envRT.dispose();
    this.oceanMesh.geometry.dispose();
    this.skyMesh.geometry.dispose();
    this.oceanMat.dispose();
    this.skyMat.dispose();
  }
}
