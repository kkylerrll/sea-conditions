// GLSL ES 3.0 shader 字串。全部用 three 的 ShaderMaterial + glslVersion: GLSL3 載入
// （three 會自己補 `#version 300 es`、precision 與 projectionMatrix/viewMatrix/cameraPosition
// 的宣告，所以這裡的字串不能有 #version，輸出變數要自己宣告）。
//
// 移植自 "Ocean · WebGPU" by hirakujira (CodePen, MIT) 的 WGSL：INIT/TIME/FFT/ASSEMBLE/ENV/
// OCEAN/SKY 各段逐段對照改寫，差異只在三處：
//   1. WebGL2 沒有 compute／storage texture，FFT 改成一個 stage 一次 fragment pass；
//   2. 海面與天空除了「在水上看」之外，還要能「在水下看」（Snell 窗、全反射、水線），
//      這是原作沒有的，見 oceanFragment 的 shadeUnder 與 waterline 邏輯；
//   3. 輸出前自己做 ACES，不用 three 的 tone mapping（水下色是顯示用顏色）。

import { BM, BR, CHOP, CLOUD_ALTITUDE, CLOUD_HI, CLOUD_LO, EXPOSURE, G, LENGTHS, RA, RE, SUN_I, TAU } from "./config";

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const v3 = (a: number[]) => `vec3(${a.map(f).join(", ")})`;

// ---------------------------------------------------------------------------
// FFT 管線（全螢幕 pass）
// ---------------------------------------------------------------------------

export const BLIT_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 動畫化頻譜並把 8 個實場打包成 4 個複數場（原作 TIME 段）。輸入 h0 圖集，輸出 MRT×2。 */
export const timeFrag = (N: number) => /* glsl */ `
#define N ${N}
const float G_ = ${f(G)};
const float TAU_ = ${f(TAU)};
const vec3 LENGTHS_ = ${v3(LENGTHS)};
uniform sampler2D uH0;
uniform float uTime;
layout(location = 0) out highp vec4 oA;
layout(location = 1) out highp vec4 oB;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cpack(vec2 a, vec2 b) { return vec2(a.x - b.y, a.y + b.x); }

void main() {
  ivec2 id = ivec2(gl_FragCoord.xy);
  int c = id.x / N;
  ivec2 q = ivec2(id.x - c * N, id.y);
  vec4 h = texelFetch(uH0, id, 0);
  ivec2 m = q - ivec2(q.x >= N / 2 ? N : 0, q.y >= N / 2 ? N : 0);
  vec2 k = vec2(m) * (TAU_ / LENGTHS_[c]);
  float kl = max(length(k), 1e-6);
  // 相位先對 2π 取餘再丟進 cos/sin，避免時間很大時大引數三角函數失準。
  float ph = sqrt(G_ * kl) * uTime;
  ph -= TAU_ * floor(ph / TAU_);
  vec2 e = vec2(cos(ph), sin(ph));
  vec2 hk = cmul(h.xy, vec2(e.x, -e.y)) + cmul(h.zw, e);
  vec2 ih = vec2(-hk.y, hk.x);
  vec2 dx = ih * (k.x / kl);
  vec2 dz = ih * (k.y / kl);
  vec2 dxz = -hk * (k.x * k.y / kl);
  vec2 dxx = -hk * (k.x * k.x / kl);
  vec2 dzz = -hk * (k.y * k.y / kl);
  oA = vec4(cpack(dx, dz), cpack(hk, dxz));
  oB = vec4(cpack(ih * k.x, ih * k.y), cpack(dxx, dzz));
}
`;

/** Stockham 反向 FFT 的一個 stage（原作的共享記憶體迴圈，每個 stage 拆成一個 pass）。
    每個輸出 texel 從上一個 stage 的 j 與 j+N/2 兩點蝴蝶運算而來。 */
export const fftStageFrag = (N: number) => /* glsl */ `
#define N ${N}
const float PI_ = 3.14159265;
uniform sampler2D uA;
uniform sampler2D uB;
uniform int uStage;     // 0 .. log2(N)-1
uniform int uVertical;  // 0＝沿 x 做、1＝沿 y 做
layout(location = 0) out highp vec4 oA;
layout(location = 1) out highp vec4 oB;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int c = p.x / N;
  int lx = p.x - c * N;
  int ns = 1 << uStage;
  int o = (uVertical == 0) ? lx : p.y;
  int sub = o & ns;
  int k = o & (ns - 1);
  int o0 = o ^ sub;
  int j = ((o0 - k) >> 1) + k;
  int h = N / 2;
  ivec2 p0, p1;
  if (uVertical == 0) {
    p0 = ivec2(c * N + j, p.y);
    p1 = ivec2(c * N + j + h, p.y);
  } else {
    p0 = ivec2(c * N + lx, j);
    p1 = ivec2(c * N + lx, j + h);
  }
  float ang = PI_ * float(k) / float(ns);
  vec2 w = vec2(cos(ang), sin(ang));
  float sg = (sub != 0) ? -1.0 : 1.0;
  vec4 a0 = texelFetch(uA, p0, 0);
  vec4 a1 = texelFetch(uA, p1, 0);
  vec4 b0 = texelFetch(uB, p0, 0);
  vec4 b1 = texelFetch(uB, p1, 0);
  oA = a0 + sg * vec4(cmul(a1.xy, w), cmul(a1.zw, w));
  oB = b0 + sg * vec4(cmul(b1.xy, w), cmul(b1.zw, w));
}
`;

/** 把 FFT 結果拆成位移＋泡沫（RGBA16F）與導數（RGBA16F）；泡沫讀上一幀的值做衰減。
    每個 cascade 一個 draw（輸出是各自獨立、帶 mipmap 的貼圖）。 */
export const assembleFrag = (N: number, foamJac: number, foamGain: number) => /* glsl */ `
#define N ${N}
const float CHOP_ = ${f(CHOP)};
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uPrev;   // 上一幀這個 cascade 的位移貼圖（取 .w 當舊泡沫）
uniform int uC;
uniform float uDt;
uniform float uFoamDecay;
layout(location = 0) out highp vec4 oDisp;
layout(location = 1) out highp vec4 oDer;

void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uA, ivec2(q.x + uC * N, q.y), 0);
  vec4 b = texelFetch(uB, ivec2(q.x + uC * N, q.y), 0);
  float dxx = CHOP_ * b.z;
  float dzz = CHOP_ * b.w;
  float dxz = CHOP_ * a.w;
  float jac = (1.0 + dxx) * (1.0 + dzz) - dxz * dxz;
  float prevFoam = texelFetch(uPrev, q, 0).w;
  // 浪脊壓縮處才起泡；最小的那層（漣漪）不破碎。
  float born = (uC == 2) ? 0.0 : clamp((${f(foamJac)} - jac) * ${f(foamGain)}, 0.0, 1.0);
  float foam = max(prevFoam * exp(-uFoamDecay * uDt), born);
  oDisp = vec4(CHOP_ * a.x, a.z, CHOP_ * a.y, foam);
  oDer = vec4(b.xy, dxx, dzz);
}
`;

// ---------------------------------------------------------------------------
// 大氣、天空、色調映射（共用）
// ---------------------------------------------------------------------------

const ATMO_CONSTS = /* glsl */ `
const float PI = 3.14159265;
const float TAU = ${f(TAU)};
const float RE = ${f(RE)};
const float RA = ${f(RA)};
const vec3 BR = ${v3(BR)};
const float BM = ${f(BM)};
const float SUN_I = ${f(SUN_I)};
`;

/** 單次散射大氣烘焙（原作 ENV 段）：輸出等距圓柱投影的天空輻射度。 */
export const envFrag = (steps: number, lightSteps: number) => /* glsl */ `
${ATMO_CONSTS}
uniform vec3 uSunDir;
layout(location = 0) out highp vec4 fragColor;

float rayExit(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  return -b + sqrt(max(b * b - dot(ro, ro) + r * r, 0.0));
}
vec2 density(vec3 p) {
  float h = max(length(p) - RE, 0.0);
  return exp(-h / vec2(8000.0, 1200.0));
}
// 二次方步距：取樣集中在地面附近（空氣濃的地方）。
vec2 opticalDepth(vec3 ro, vec3 rd, int steps) {
  float tMax = rayExit(ro, rd, RA);
  vec2 od = vec2(0.0);
  for (int i = 0; i < steps; i++) {
    float x = (float(i) + 0.5) / float(steps);
    od += density(ro + rd * (tMax * x * x)) * (tMax * 2.0 * x / float(steps));
  }
  return od;
}
vec3 extinction(vec2 od) { return exp(-(BR * od.x + BM * 1.1 * od.y)); }

vec3 atmosphere(vec3 rd, vec3 L) {
  vec3 ro = vec3(0.0, RE + 2.0, 0.0);
  float tMax = rayExit(ro, rd, RA);
  vec2 od = vec2(0.0);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  for (int i = 0; i < ${steps}; i++) {
    float x = (float(i) + 0.5) / ${f(steps)};
    vec3 p = ro + rd * (tMax * x * x);
    vec2 d = density(p) * (tMax * 2.0 * x / ${f(steps)});
    od += d;
    vec3 t = extinction(od + opticalDepth(p, L, ${lightSteps}));
    sumR += t * d.x;
    sumM += t * d.y;
  }
  float mu = dot(rd, L);
  float g = 0.76;
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float pM = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return SUN_I * (sumR * BR * pR + sumM * BM * pM);
}

uniform vec2 uSize;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float phi = (uv.x - 0.5) * TAU;
  float th = min(uv.y * PI, PI * 0.5);  // 地平線以下沿用地平線那一列
  fragColor = vec4(atmosphere(vec3(sin(th) * cos(phi), cos(th), sin(th) * sin(phi)), uSunDir), 1.0);
}
`;

/** 天空／雲／ACES／水下色等所有在 fragment 端共用的函式。 */
export const SKY_COMMON = /* glsl */ `
${ATMO_CONSTS}
uniform sampler2D uEnv;
uniform vec3 uSunDir;
uniform vec3 uSunColor;   // 太陽到達地面的輻射度（SUN_I × 消光）
uniform vec3 uAmbient;    // 天空環境光平均
uniform float uTime;

// 水下顏色（顯示用，sRGB 空間，跟舊版 DEPTH_GRADIENT_STOPS 畫的漸層同一組）
uniform vec3 uWaterTopS;
uniform vec3 uWaterBotS;

vec2 envUV(vec3 d) { return vec2(atan(d.z, d.x) / TAU + 0.5, acos(clamp(d.y, -1.0, 1.0)) / PI); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  vec2 s = u * u * (3.0 - 2.0 * u);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), s.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), s.x), s.y);
}
float fbm(vec2 p, int oct) {
  float a = 0.5;
  float v = 0.0;
  for (int i = 0; i < oct; i++) {
    v += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return v;
}

// 天空輻射度：預算大氣 + 太陽盤 + 高空漂移的雲層。
vec3 skyRadiance(vec3 d, float time, int oct, float sunDisk) {
  vec3 base = textureLod(uEnv, envUV(d), 0.0).rgb;
  float mu = dot(d, uSunDir);
  vec3 c = base + sunDisk * uSunColor * 14700.0 * smoothstep(0.99998, 0.999992, mu);
  if (d.y > 0.0) {
    float t = ${f(CLOUD_ALTITUDE)} / d.y;
    vec2 p = (d.xz * t + vec2(7.0, 2.5) * time) / 2500.0;
    float dens = smoothstep(${f(CLOUD_LO)}, ${f(CLOUD_HI)}, fbm(p, oct)) * smoothstep(0.0, 0.15, d.y);
    if (dens > 0.0) {
      float shade = exp(-1.4 * smoothstep(0.5, 0.9, fbm(p + normalize(uSunDir.xz + 1e-4) * 0.08, oct)));
      vec3 cc = uSunColor * 0.1 * shade * (0.7 + 2.0 * pow(max(mu, 0.0), 12.0)) + uAmbient * 1.3;
      cc = mix(cc, base, 1.0 - exp(-t * 4e-5));
      c = mix(c, cc, dens);
    }
  }
  return c;
}

// ACES（Narkowicz 擬合，原作做法）。輸入是 HDR 輻射度，輸出是 0..1 的線性顯示值。
vec3 aces(vec3 c) {
  vec3 x = c * ${f(EXPOSURE)};
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

// 水下背景：依視線方向 y 分量取上下兩色之間的漸層（y=+0.46 約是畫面頂端、-0.46 是底端，
// 跟舊版「畫面頂→底」的漸層在鏡頭水平時對得上）。回傳線性顯示值。
vec3 waterBg(float y) {
  float t = clamp(0.5 - 1.08 * y, 0.0, 1.0);
  return srgbToLinear(mix(uWaterTopS, uWaterBotS, t));
}

// 水線（防水罩半水半空的分界）：uYw 是分界線的視線 y 分量，水面在鏡頭上方多少就在
// 畫面上方多少。加一點隨方位角起伏的小擾動，水線才不會像一條尺畫出來的直線。
uniform float uYw;
float waterlineAt(vec3 d) {
  float az = atan(d.x, d.z);
  return uYw + 0.010 * sin(7.0 * az + uTime * 1.7) + 0.006 * sin(13.0 * az - uTime * 2.3);
}
float meniscus(float dy, float ywp) {
  float x = (dy - ywp) / 0.0045;
  return exp(-x * x);
}
vec3 meniscusColor() { return vec3(0.62, 0.80, 0.88); }
`;

// ---------------------------------------------------------------------------
// 天空穹頂（全螢幕）：水線以上畫天空，以下畫水下背景
// ---------------------------------------------------------------------------

export const SKY_VERT = /* glsl */ `
out vec3 vDir;
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
  vec4 p = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
  vec3 viewDir = p.xyz / p.w;
  vDir = transpose(mat3(viewMatrix)) * viewDir;
}
`;

export const skyFrag = (cloudOct: number) => /* glsl */ `
${SKY_COMMON}
in vec3 vDir;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 d = normalize(vDir);
  float ywp = waterlineAt(d);
  vec3 col;
  if (d.y > ywp) {
    col = aces(skyRadiance(d, uTime, ${cloudOct}, 1.0));
  } else {
    col = waterBg(d.y);
  }
  col = mix(col, meniscusColor(), 0.55 * meniscus(d.y, ywp));
  fragColor = linearToOutputTexel(vec4(col, 1.0));
  fragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

// ---------------------------------------------------------------------------
// 海面
// ---------------------------------------------------------------------------

/** 共用 varying 與頂點端工具。mode: FFT 用三層貼圖位移；Gerstner 用解析波。 */
export const oceanVert = (N: number, mode: "fft" | "gerstner") => /* glsl */ `
#define N ${N}
const float RE = ${f(RE)};
uniform vec2 uCamXZ;     // 鏡頭水平位置（公尺），格網以它為中心
uniform float uWuM;      // 世界單位 / 公尺
uniform float uTime;
out vec3 vWorldM;        // 位移後的位置（公尺）
out vec2 vXZ;            // 未位移的水平座標（公尺）
${
  mode === "fft"
    ? `
const vec3 LENGTHS_ = ${v3(LENGTHS)};
uniform sampler2D uDisp0;
uniform sampler2D uDisp1;
uniform sampler2D uDisp2;
vec3 surfaceDisp(vec2 xz, float spacing) {
  vec3 d = textureLod(uDisp0, xz / LENGTHS_.x, log2(max(spacing * float(N) / LENGTHS_.x, 1.0))).xyz;
  d += textureLod(uDisp1, xz / LENGTHS_.y, log2(max(spacing * float(N) / LENGTHS_.y, 1.0))).xyz;
  d += textureLod(uDisp2, xz / LENGTHS_.z, log2(max(spacing * float(N) / LENGTHS_.z, 1.0))).xyz;
  return d;
}`
    : `
uniform vec4 uGA[12];   // (dir.x, dir.z, k, amp)
uniform vec4 uGB[12];   // (omega, phase, Q, 0)
vec3 surfaceDisp(vec2 xz, float spacing) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float k = uGA[i].z;
    // 格點間距容不下的短波直接淡出，避免遠處幾何閃爍。
    float fade = smoothstep(2.0, 6.0, ${f(TAU)} / (k * spacing));
    float th = k * dot(uGA[i].xy, xz) - uGB[i].x * uTime + uGB[i].y;
    float a = uGA[i].w * fade;
    d.xz += uGB[i].z * a * uGA[i].xy * cos(th);
    d.y += a * sin(th);
  }
  return d;
}`
}

void main() {
  // position.xy＝以鏡頭為中心的極座標格網（公尺），position.z＝該環的格距（公尺）。
  vec2 xz = uCamXZ + position.xy;
  vec3 w = vec3(xz.x, 0.0, xz.y) + surfaceDisp(xz, position.z);
  w.y -= dot(position.xy, position.xy) / (2.0 * RE);   // 地球曲率決定真實的地平線距離
  vWorldM = w;
  vXZ = xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(w * uWuM, 1.0);
}
`;

export const oceanFrag = (N: number, mode: "fft" | "gerstner", cloudOct: number) => /* glsl */ `
#define N ${N}
${SKY_COMMON}
in vec3 vWorldM;
in vec2 vXZ;
layout(location = 0) out highp vec4 fragColor;

uniform float uWuM;
uniform float uNear;        // 鏡頭貼近水面時，近處的水體顏色往水下色靠
uniform float uCamDepth;    // 鏡頭在海平面下幾公尺（水上為 0）
uniform float uWindowGain;  // 水下看 Snell 窗的亮度（隨暗化程度衰減）
const vec3 SCATTER = vec3(0.0014, 0.0050, 0.0090);
const vec3 WATER_ABSORB = vec3(0.25, 0.06, 0.02);   // 每公尺吸收（紅光最先被吸掉）
${
  mode === "fft"
    ? `
const vec3 LENGTHS_ = ${v3(LENGTHS)};
uniform sampler2D uDisp0;
uniform sampler2D uDisp1;
uniform sampler2D uDisp2;
uniform sampler2D uDer0;
uniform sampler2D uDer1;
uniform sampler2D uDer2;
void surfaceState(vec2 xz, float footprint, out vec3 nrm, out float foam) {
  vec4 der = texture(uDer0, xz / LENGTHS_.x) + texture(uDer1, xz / LENGTHS_.y) + texture(uDer2, xz / LENGTHS_.z);
  foam = texture(uDisp0, xz / LENGTHS_.x).w + texture(uDisp1, xz / LENGTHS_.y).w + texture(uDisp2, xz / LENGTHS_.z).w;
  vec2 slope = der.xy / max(1.0 + der.zw, vec2(0.2));
  nrm = normalize(vec3(-slope.x, 1.0, -slope.y));
}`
    : `
uniform vec4 uGA[12];
uniform vec4 uGB[12];
void surfaceState(vec2 xz, float footprint, out vec3 nrm, out float foam) {
  vec2 g = vec2(0.0);
  float comp = 0.0;
  for (int i = 0; i < 12; i++) {
    float k = uGA[i].z;
    float fade = smoothstep(2.0, 6.0, ${f(TAU)} / (k * footprint));
    float th = k * dot(uGA[i].xy, xz) - uGB[i].x * uTime + uGB[i].y;
    float s = k * uGA[i].w * fade;
    g += uGA[i].xy * (s * cos(th));
    comp += uGB[i].z * s * sin(th);
  }
  foam = 0.0;
  nrm = normalize(vec3(-g.x, max(1.0 - comp, 0.3), -g.y));
}`
}

// 水面之上看：GGX 太陽高光＋菲涅爾天空反射＋次表面散射＋泡沫。
vec3 shadeTop(vec3 Nn, vec3 V, float dist, float footprint, float foam) {
  vec3 L = uSunDir;
  float NdotV = max(dot(Nn, V), 0.0);
  float NdotL = max(dot(Nn, L), 0.0);
  vec3 sunC = uSunColor;
  vec3 amb = uAmbient;

  // 小於一個像素的波仍然會讓表面傾斜：頻譜尾端每個 octave 增加斜率變異。
  float a = sqrt(2.0 * (0.006 + 0.004 * log2(max(footprint / 0.04, 1.0))));
  float a2 = a * a;
  vec3 H = normalize(L + V);
  float NdotH = max(dot(Nn, H), 0.0);
  float dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float k = a * 0.5;
  float vis = 1.0 / (4.0 * (NdotL * (1.0 - k) + k) * (NdotV * (1.0 - k) + k));
  float fH = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = sunC * (a2 / (PI * dd * dd)) * vis * fH * NdotL;

  vec3 R = reflect(-V, Nn);
  R.y = abs(R.y);
  vec3 refl = skyRadiance(R, uTime, 4, 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

  // 次表面光：背光浪脊的透光＋面向視線的散射＋面向太陽的散射。
  float k1 = 4.0 * max(vWorldM.y, 0.0) * pow(max(dot(L, -V), 0.0), 4.0) * pow(0.5 - 0.5 * dot(L, Nn), 3.0);
  vec3 body = SCATTER * ((k1 + NdotV * NdotV + 0.5 * NdotL) * sunC + 2.0 * amb);

  vec3 col = (1.0 - F) * body + F * refl + spec;
  // 泡沫變薄時碎成蕾絲狀；雜訊跟著未位移座標，隨水流動。
  float lace = mix(fbm(vXZ * 1.3, 4), 0.5, clamp(footprint * 2.0, 0.0, 1.0));
  col = mix(col, 0.85 * (sunC * NdotL / PI + amb), smoothstep(0.0, 0.5, foam * 1.2 - (1.0 - lace)));
  vec3 fogCol = textureLod(uEnv, envUV(vec3(-V.x, 0.0, -V.z)), 0.0).rgb;
  col = mix(col, fogCol, 1.0 - exp(-dist * 1.2e-4));
  return col;
}

// 水面之下看：Snell 窗（折射出去的天空）＋窗外全反射（映出下方的水）。
// d＝從鏡頭射向水面的視線（朝上），Nup＝水面法線（朝上）。回傳顯示用線性色。
vec3 shadeUnder(vec3 Nup, vec3 d, float dist) {
  vec3 n = -Nup;                              // 面向鏡頭那一側（朝下）
  vec3 under = waterBg(reflect(d, n).y);      // 反射／全反射看到的是下方的水
  vec3 T = refract(d, n, 1.333);              // 水 → 空氣
  vec3 col = under;
  if (dot(T, T) > 1e-6) {
    T = normalize(T);
    float cosT = max(dot(T, Nup), 0.0);
    float F = 0.0204 + 0.9796 * pow(1.0 - cosT, 5.0);   // 臨界角附近 F → 1，和全反射連續
    float pathLen = min(uCamDepth / max(d.y, 0.1), 80.0);
    vec3 tint = exp(-WATER_ABSORB * pathLen);
    vec3 win = aces(skyRadiance(T, uTime, 4, 1.0)) * tint * uWindowGain;
    col = mix(win, under, F);
  }
  // 遠處的水面沉進水下霧色（跟 waterBg 地平線那一列同色，與背景無縫）。
  return mix(col, waterBg(0.0), 1.0 - exp(-dist * 0.02));
}

void main() {
  vec3 eye = cameraPosition / uWuM;
  vec3 toF = vWorldM - eye;
  float dist = length(toF);
  vec3 d = toF / dist;
  float ywp = waterlineAt(d);
  // 防水罩模型：視線 y 分量在水線之上走「空氣側」（從上往下看水面），之下走「水側」
  // （只有朝上的視線會碰到水面的底面；朝下的由背景與水下生物負責，所以捨棄）。
  bool top = d.y > ywp;
  if (!top && d.y <= 0.0) discard;

  float footprint = length(fwidth(vXZ));
  vec3 Nn;
  float foam;
  surfaceState(vXZ, footprint, Nn, foam);

  vec3 col;
  if (top) {
    vec3 hdr = shadeTop(Nn, -d, dist, footprint, foam);
    col = aces(hdr);
    // 鏡頭貼近水面時，近處的水往水下色過渡，水線掃過畫面時上下兩側才接得起來。
    float k = uNear * exp(-dist / 3.0);
    col = mix(col, waterBg(d.y), k);
  } else {
    col = shadeUnder(Nn, d, dist);
  }
  col = mix(col, meniscusColor(), 0.55 * meniscus(d.y, ywp));
  fragColor = linearToOutputTexel(vec4(col, 1.0));
  fragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;
