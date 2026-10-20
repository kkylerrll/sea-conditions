// GPU 端的 FFT 海面模擬（three.js / WebGL2）。
//
// 移植自 "Ocean · WebGPU" by hirakujira (CodePen, MIT)。原作每幀做：頻譜時間演化 →
// 水平＋垂直 Stockham 反向 FFT → 拆成位移／導數／泡沫 → 逐階 mipmap。WebGL2 沒有 compute
// shader，所以全部改成全螢幕 fragment pass，用浮點 render target ping-pong：
//
//   time pass     h0 圖集 → fftA（MRT×2，RGBA32F，寬 3N × 高 N，三個 cascade 並排）
//   FFT pass×2·log2(N)  fftA ⇄ fftB（每個 stage 一個 pass，水平 N 階再垂直 N 階）
//   assemble×3    fft 結果 → 各 cascade 的「位移＋泡沫」「導數」貼圖（RGBA16F，帶 mipmap）
//
// 泡沫要跨幀累積衰減，所以每個 cascade 的輸出有兩組，輪流當「這一幀」與「上一幀」。
// mipmap 由 three 在每個 render target 繪製完成後自動產生（箱型濾波，與原作相同）。
// 需要 EXT_color_buffer_float（可繪製的 RGBA32F/RGBA16F）；不支援時由呼叫端改用 Gerstner。

import * as THREE from "three";
import { FOAM_DECAY, FOAM_GAIN, FOAM_JAC } from "./config";
import { assembleFrag, BLIT_VERT, fftStageFrag, timeFrag } from "./shaders";
import { buildSpectrum, type Spectrum } from "./spectrum";

export function supportsFloatTargets(renderer: THREE.WebGLRenderer): boolean {
  return renderer.extensions.has("EXT_color_buffer_float");
}

function makeMaterial(fragment: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: BLIT_VERT,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
}

export class FFTOcean {
  readonly N: number;
  readonly spectrum: Spectrum;
  /** 這一幀各 cascade 的「位移(xyz)＋泡沫(w)」與「導數」貼圖；每幀 update() 後換成新的。 */
  readonly dispTextures: THREE.Texture[] = [];
  readonly derTextures: THREE.Texture[] = [];

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;

  private h0Tex: THREE.DataTexture;
  private fft: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private cascade: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget][] = [];
  private parity = 0;

  private timeMat: THREE.ShaderMaterial;
  private stageMat: THREE.ShaderMaterial;
  private asmMat: THREE.ShaderMaterial;
  private log2N: number;

  constructor(renderer: THREE.WebGLRenderer, N: number) {
    this.renderer = renderer;
    this.N = N;
    this.log2N = Math.round(Math.log2(N));
    this.spectrum = buildSpectrum(N);

    this.h0Tex = new THREE.DataTexture(this.spectrum.h0, 3 * N, N, THREE.RGBAFormat, THREE.FloatType);
    this.h0Tex.minFilter = THREE.NearestFilter;
    this.h0Tex.magFilter = THREE.NearestFilter;
    this.h0Tex.generateMipmaps = false;
    this.h0Tex.needsUpdate = true;

    const floatOpts = {
      count: 2,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.fft = [
      new THREE.WebGLRenderTarget(3 * N, N, floatOpts),
      new THREE.WebGLRenderTarget(3 * N, N, floatOpts),
    ];

    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const waveOpts = {
      count: 2,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      anisotropy: aniso,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
    };
    for (let c = 0; c < 3; c++) {
      this.cascade.push([
        new THREE.WebGLRenderTarget(N, N, waveOpts),
        new THREE.WebGLRenderTarget(N, N, waveOpts),
      ]);
    }

    this.timeMat = makeMaterial(timeFrag(N), { uH0: { value: this.h0Tex }, uTime: { value: 0 } });
    this.stageMat = makeMaterial(fftStageFrag(N), {
      uA: { value: null },
      uB: { value: null },
      uStage: { value: 0 },
      uVertical: { value: 0 },
    });
    this.asmMat = makeMaterial(assembleFrag(N, FOAM_JAC, FOAM_GAIN), {
      uA: { value: null },
      uB: { value: null },
      uPrev: { value: null },
      uC: { value: 0 },
      uDt: { value: 0.016 },
      uFoamDecay: { value: FOAM_DECAY },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.timeMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    // 第一幀就要有可用的貼圖參照（ocean 材質建立時會拿去綁定）。
    for (let c = 0; c < 3; c++) {
      this.dispTextures.push(this.cascade[c][0].textures[0]);
      this.derTextures.push(this.cascade[c][0].textures[1]);
    }

    // 兩組 cascade 輸出都先清成 0：第一幀的「上一幀泡沫」會被讀到，沒清的話 WebGL 對
    // 尚未配置的貼圖回傳 alpha=1，整片海第一秒會是滿的泡沫。
    const prevTarget = renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const pair of this.cascade) {
      for (const rt of pair) {
        renderer.setRenderTarget(rt);
        renderer.clear(true, false, false);
      }
    }
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** 推進一幀。time＝海面時間（秒），dt＝這一幀秒數（泡沫衰減用）。 */
  update(time: number, dt: number) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    const prevXr = r.xr.enabled;
    r.autoClear = false; // 每個 pass 都會寫滿整張貼圖，不需要清除
    r.xr.enabled = false;

    this.timeMat.uniforms.uTime.value = time;
    this.blit(this.timeMat, this.fft[0]);

    let src = 0;
    for (let vertical = 0; vertical < 2; vertical++) {
      for (let s = 0; s < this.log2N; s++) {
        const u = this.stageMat.uniforms;
        u.uA.value = this.fft[src].textures[0];
        u.uB.value = this.fft[src].textures[1];
        u.uStage.value = s;
        u.uVertical.value = vertical;
        this.blit(this.stageMat, this.fft[1 - src]);
        src = 1 - src;
      }
    }

    const cur = this.parity;
    const au = this.asmMat.uniforms;
    au.uA.value = this.fft[src].textures[0];
    au.uB.value = this.fft[src].textures[1];
    au.uDt.value = Math.min(Math.max(dt, 0), 0.05);
    for (let c = 0; c < 3; c++) {
      au.uC.value = c;
      au.uPrev.value = this.cascade[c][1 - cur].textures[0];
      this.blit(this.asmMat, this.cascade[c][cur]);
      this.dispTextures[c] = this.cascade[c][cur].textures[0];
      this.derTextures[c] = this.cascade[c][cur].textures[1];
    }
    this.parity = 1 - cur;

    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;
    r.xr.enabled = prevXr;
  }

  dispose() {
    this.h0Tex.dispose();
    this.fft.forEach((t) => t.dispose());
    this.cascade.forEach((pair) => pair.forEach((t) => t.dispose()));
    this.timeMat.dispose();
    this.stageMat.dispose();
    this.asmMat.dispose();
    this.quad.geometry.dispose();
  }
}
