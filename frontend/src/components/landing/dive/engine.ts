// 首頁 3D 場景的核心：一支持續下潛的潛水員、隨深度出現的生物、隨深度變化的
// 光線與濃霧。這支檔案不是 React 元件——是一個普通的 class，故意設計成
// 「畫布給我、我自己管理渲染迴圈」，讓 DiveCanvas.tsx 那邊只剩掛載/卸載兩件事。
//
// 資料來源只有 diveState（見 diveState.ts）：progress（捲動進度＝深度）、
// velocity（捲動快慢）、direction（往下潛或往上浮）。這三個值是 ScrollScene
// 每幀寫的，這裡只讀，不新增任何 scroll listener——三.js 要有自己的 rAF 是
// 因為場景要在使用者停手時也繼續動（生物游動、水母漂浮），不能只在 scroll
// 事件裡更新。
//
// 三輪使用者回饋累積下來的重點，直接寫在這裡讓之後改的人知道為什麼：
//   1.（round 2）潛水員的「螢幕位置」跟牠的「真實深度」是兩件分開算的事——
//      真實深度只用來算環境變暗、生物該不該出現，潛水員在畫面上的位置改成
//      直接用攝影機的視野角度反推（見 diverWorldYForFraction()），才能保證
//      他「一路往下滑到底部」而不是被鎖死在畫面中間同一個點。
//   2.（round 2）所有光效收斂成「平光」：只剩 AmbientLight/HemisphereLight，
//      兩者的顏色/強度都是深度的連續函數，沒有光柱、頭燈聚光燈、點光源。
//   3.（round 2→3）生物的深度改成「在捲動進度上均勻分布」，不是「在公尺數上
//      均勻分布」；round 3 進一步發現攝影機不能刻意落後真實深度太多（見
//      cameraY 欄位宣告處的說明），不然深海生物永遠追不到、淺水生物賴著不走。
//   4.（round 3）潛水員的螢幕位置下限（頂端）要留夠邊界不被裁切，水平位置
//      桌機要偏移，避免疊在文字欄上；深海章節的平光要留視覺下限，深海生物
//      材質要加一點 emissive 讓牠們在近黑背景前讀得出來。
//   5.（round 4）進一步把潛水員固定挪到畫面右側、文字改成左欄（CSS 那邊，
//      見 globals.css），兩者從結構上分開,不再需要靠暗化墊底硬解。
//   6.（round 4）生物的朝向要跟著移動方向走（見 orientToVelocity()），魚群
//      要用平滑流動的路徑移動（見 updateSchoolMotion()／updateGlideMotion()），
//      不能用固定角速度繞圈這種看起來像「倒退游」或「單純轉圈」的舊寫法。
//      懸浮微粒全部換成氣泡（見 Bubbles 區塊），不再用方形/圓點的 Points。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { diveState } from "../diveState";
import { depthAt, environmentDarkness, progressAt, MAX_DEPTH_M } from "../depth";
import {
  MODEL_REGISTRY,
  ALL_MODELS,
  DEBUG_ALL_ROWS,
  CREATURE_RIM_FLOOR,
  JELLY_GLOW_BASE,
  JELLY_GLOW_AMP,
  JELLY_GLOW_SPEED,
  type ModelName,
} from "./models";
import { buildPlaceholder, addDiverRimShader } from "./placeholders";

// 世界座標與「公尺深度」的比例：1 個深度公尺＝這麼多三.js 單位。拉開一點
// （而不是 1:1）是因為 1000m 全部塞進 1:1 的世界座標，遠裁面／濃霧密度會
// 很難調；縮小比例讓整條下潛路徑仍然是連續的一條線，只是單位比較好算。
const WORLD_UNITS_PER_METER = 0.35;

function depthToWorldY(depthM: number) {
  return -depthM * WORLD_UNITS_PER_METER;
}

// round 9（淺水配色）：使用者要 0~10m 讀起來是「陽光藍」（像墾丁／綠島），
// 不是原本那種灰撲撲的青綠（0x1c6e7a）。這張色票是深度（公尺）→上／下
// 兩色的對應表，深度淺的地方間距密（0/5/10/20m）、深的地方間距疏
// （40/100/300/1000m）——疏密本身已經是「log-ish」的視覺壓縮,中間用
// sampleDepthGradient() 分段線性內插就夠,不需要額外對公尺數取 log。
const DEPTH_GRADIENT_STOPS: { depthM: number; top: THREE.Color; bottom: THREE.Color }[] = [
  { depthM: 0, top: new THREE.Color(0x7fe0f7), bottom: new THREE.Color(0x1aa3d9) },
  { depthM: 5, top: new THREE.Color(0x4fcdf0), bottom: new THREE.Color(0x1592cc) },
  { depthM: 10, top: new THREE.Color(0x2bb3e6), bottom: new THREE.Color(0x0d7cbf) },
  { depthM: 20, top: new THREE.Color(0x178bcc), bottom: new THREE.Color(0x0a5f9e) },
  { depthM: 40, top: new THREE.Color(0x0d5f9e), bottom: new THREE.Color(0x063a6b) },
  { depthM: 100, top: new THREE.Color(0x073a66), bottom: new THREE.Color(0x03213f) },
  { depthM: 300, top: new THREE.Color(0x031a33), bottom: new THREE.Color(0x020d1c) },
  { depthM: 1000, top: new THREE.Color(0x020812), bottom: new THREE.Color(0x010307) },
];

/** 用 DEPTH_GRADIENT_STOPS 在兩個相鄰深度點之間線性內插出「這個深度的
    上／下兩色」——注意這裡吃的是公尺數（depthM），不是 progress,跟
    environmentDarkness() 刻意分開一條曲線的理由一樣（見 depth.ts）：
    MAX_DEPTH_M 是 1000,如果顏色直接跟 progress 掛鉤,0~40m（寫實潛水
    全部範圍）換算成 0~1000 只佔很小一段,顏色幾乎不會變,「越潛越藍→
    越深越暗」的漸層會整個垮掉。回傳新的 Color 物件,呼叫端可以直接
    Mutate 不會污染 DEPTH_GRADIENT_STOPS 裡的原始顏色。 */
function sampleDepthGradient(depthM: number): { top: THREE.Color; bottom: THREE.Color } {
  const maxStop = DEPTH_GRADIENT_STOPS[DEPTH_GRADIENT_STOPS.length - 1];
  const d = Math.max(0, Math.min(maxStop.depthM, depthM));
  let i = 0;
  while (i < DEPTH_GRADIENT_STOPS.length - 2 && d > DEPTH_GRADIENT_STOPS[i + 1].depthM) i++;
  const a = DEPTH_GRADIENT_STOPS[i];
  const b = DEPTH_GRADIENT_STOPS[i + 1];
  const t = b.depthM === a.depthM ? 0 : (d - a.depthM) / (b.depthM - a.depthM);
  return { top: a.top.clone().lerp(b.top, t), bottom: a.bottom.clone().lerp(b.bottom, t) };
}

// 除錯模式 `?diveDebug=all`（見 setupDebugAllScene）：每個模型依自己的
// bbox 最長邊正規化到這個世界單位長度——不用 models.ts 裡那份給正式場景
// 調好的 scale（那份是配合攝影機景深/車道距離算的，七種生物刻意大小不一），
// 除錯排排站要讓大家「看起來差不多大」才方便一次比較朝向。
const DEBUG_ALL_TARGET_SIZE = 1.6;
// 除錯排排站：所有生物固定速度從左往右移動（不套用 sin 波來回，見使用者
// 要求的「no sine reversal」），單位是世界單位/秒。
const DEBUG_ALL_SPEED = 0.6;

// 潛水員的 fresnel 輪廓光（見 placeholders.ts 的 addDiverRimShader）：
// uRimStrength 這個 uniform 的最大值，實際套用的強度＝depthFrac（即
// environmentDarkness(progress)）× 這個常數——淺水 depthFrac≈0 時完全是 0，
// 只有深海才慢慢浮現，見 update() 最後怎麼把這個值寫進每顆材質的
// userData.rimUniforms。
const DIVER_RIM_MAX_STRENGTH = 1.3;

// 每種生物「大概會被捲到」的捲動進度區間（不是深度區間！）。刻意重疊
// （珊瑚礁魚跟鯖魚重疊、鯖魚跟海龜/鎚頭鯊重疊、深海兩種互相重疊也跟
// 海龜/鎚頭鯊的尾端重疊）,銜接處才會有兩種生物同時在畫面上,不是一種
// 消失、下一種才出現的硬切。
const REEF_RANGE: [number, number] = [0.02, 0.35];
const SCHOOL_RANGE: [number, number] = [0.25, 0.55];
// 原本上緣停在 0.7（約 43m），水母要等到 progressAt(90)（約 0.78）才上場——
// 中間 43~90m 這段捲動區間沒有任何生物的 band 覆蓋到,畫面會整個空掉。
// 上緣延到 progressAt(120)，跟水母新的下緣（progressAt(90)）重疊一段，
// 補上這個洞，銜接處維持「兩種生物同時在畫面上」的重疊慣例。
// round 11 回饋：鎚頭鯊（scalloped hammerhead）真實活動深度是 20~120m，
// 原本的下緣 0.45（約 28m）只是憑感覺猜的數字——改用 progressAt(20) 精確
// 對齊。海龜移到淺水的 TURTLE_RANGE（見下面），這個區間現在只剩鎚頭鯊。
const DROP_RANGE: [number, number] = [progressAt(20), progressAt(120)];
// round 11 回饋：海龜在 35m+ 出現不寫實——真的海龜活動在陽光照得到的淺水
// （大約 3~25m），改成自己獨立的淺水區間，跟 REEF_RANGE 的珊瑚礁魚同場。
const TURTLE_RANGE: [number, number] = [progressAt(3), progressAt(25)];
// round 7 回饋：鮟鱇魚原本的區間（0.62~1.0）對應到深度只有 92m 就出現,
// 跟文字搶畫面——牠該是「真正深淵」的主角，不是中層就出現的過場。用
// progressAt()（見 depth.ts）反推「深度 ≥ 300m／90m」對應的捲動進度，
// 不要用猜的 progress 數字,深度曲線（depth.ts 的 PLUNGE_EXPONENT）以後
// 調整時這裡也會自動跟著對。上緣都留在 1.0——捲到底時兩種都還在畫面上。
// 範圍刻意比原本窄很多,同樣數量的生物集中在更短的捲動距離裡,密度自然
// 提高,這也是「500~1000m 幾乎是空的」回饋的另一半解法（另一半是把
// 車道寬度收緊,見 spawnCreatures 裡鮟鱇魚那段）。水母下緣原本是
// progressAt(150)，跟 DROP_RANGE 原本的上緣（0.7）之間有一段 43~150m
// 完全沒有生物的空窗——改成 progressAt(90) 跟海龜/鎚頭鯊延長後的上緣
// 重疊，捲動過程才會一直有東西經過。
const ANGLER_RANGE: [number, number] = [progressAt(300), 1.0];
const JELLY_RANGE: [number, number] = [progressAt(90), 1.0];

// round 8：鯖魚群是唯一的「school」物種——整群共用一個代表深度去算水平
// 車道的可視寬度（見 DiveEngine.groupLaneHalfWidth／updateCreatures 的
// "school" 分支），不是每個成員各自的 laneZ。數字落在 spawnCreatures 給
// 鯖魚的 zRange（[-8,-1]）中點附近即可，不需要跟每個成員的 laneZ 對齊
// ——那個 laneZ 只用來算 recycleGroupY 的 viewHalf 跟景深（視覺上的遠近
// 分散），跟這裡的水平位置是兩件事。
const MACKEREL_Z = -4.5;

const UP = new THREE.Vector3(0, 1, 0);
// round 11（真實游動姿態）：疊在固定朝向（quatTarget）之上的小幅度抬頭/
// 低頭、海龜額外的 roll 搖擺——都是繞世界軸轉（見 updateCreatures 的
// "straight" 分支說明），不是碰 yaw,絕對不會變成「轉身」。
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const TURTLE_WOBBLE_RAD = THREE.MathUtils.degToRad(3);

// round 12（游動更自然）：
// 小型礁魚「衝刺－滑行」：速度倍率 1±SWIM_BURST_AMP，週期每隻隨機 2~5 秒。
// 大型（海龜／鎚頭鯊／鮟鱇魚）只做緩慢的小幅變速（SWIM_SLOW_AMP,沿用每隻
// 各自的 speedFreqHz 當頻率）。
const SWIM_BURST_AMP = 0.4;
const SWIM_SLOW_AMP = 0.2;
const SWIM_BURST_PERIOD_MIN = 2;
const SWIM_BURST_PERIOD_RANGE = 3;
// 尾鰭動畫速度跟著當下速度倍率走（mixer.timeScale），夾在這個範圍。
const SWIM_TIMESCALE_MIN = 0.6;
const SWIM_TIMESCALE_MAX = 1.8;
// 朝向跟隨「實際速度向量」的平滑時間常數（秒），以及偏航／俯仰上限（rad，
// 約 15°／18°）；z 方向漂移振幅＝glideSpeed × SWIM_Z_DRIFT_RATIO，讓偏航角
// 與魚的速度成比例（慢魚不會因為同樣的 z 位移而大幅轉向）。
const SWIM_ORIENT_TAU = 0.4;
const SWIM_YAW_MAX_RAD = THREE.MathUtils.degToRad(15);
const SWIM_PITCH_MAX_RAD = THREE.MathUtils.degToRad(18);
const SWIM_Z_DRIFT_RATIO = 0.8;
// 轉彎時的傾斜（roll）：偏航角變化率 × 係數，上限約 17°。
const SWIM_BANK_GAIN = 1.2;
const SWIM_BANK_MAX_RAD = THREE.MathUtils.degToRad(17);
// 鯖魚個體 timeScale 的基準範圍與波動（各自相位，不同步擺尾）。
const SCHOOL_TIMESCALE_BASE_MIN = 0.85;
const SCHOOL_TIMESCALE_BASE_RANGE = 0.3;
const SCHOOL_TIMESCALE_AMP = 0.25;

// round 12：潛水員手電筒。SpotLight 不投影、不畫任何光束幾何（round 2 使用者
// 拒絕過可見光柱），只是讓材質算光照時多一個方向光源。
// 強度由 environmentDarkness 在 FLASH_DARK_START~FLASH_DARK_END 之間
// smoothstep 淡入；decay=2 為物理衰減，FLASH_DISTANCE 以外截斷。
const FLASH_MAX_INTENSITY = 140;
const FLASH_ANGLE = 0.45;
const FLASH_PENUMBRA = 0.6;
const FLASH_DECAY = 2;
const FLASH_DISTANCE = 30;
const FLASH_DARK_START = 0.35;
const FLASH_DARK_END = 0.75;
const FLASH_COLOR = 0xfff1d6;
// 游標對應的目標點落在這個 z 平面（生物車道大約 -1~-8 的中段）。
const FLASH_PLANE_Z = -4;
// 目標點指數平滑時間常數（秒）。
const FLASH_AIM_TAU = 0.15;

// 手機（窄螢幕或粗指標，例如觸控）降規格：devicePixelRatio 上限、實例數量
// 都減半，跟 globals.css 裡舊版 DOM 粒子的手機降規格是同一個判斷準則延續下來。
// 這個門檻只管「效能」，跟下面 narrowLayout（管「排版」）刻意分開,兩者
// 觸發的螢幕寬度不一樣（639 vs 1024），混在一起會兩件事互相牽制。
function isMobileSpec() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 639px), (pointer: coarse)").matches;
}

// 排版斷點跟 globals.css 的 `@media (min-width: 1024px)` 對齊——那個斷點
// 以上文字欄改成左側固定欄（見 globals.css 該處說明），潛水員才需要偏到
// 右側；窄於這個斷點時文字退回置中，潛水員也要跟著置中,不然沒有文字欄
// 分流,潛水員偏一邊反而更容易被裁到畫面外。
function isNarrowLayout() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(max-width: 1023px)").matches;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** 0→1 的三次平滑曲線，兩端切線為 0——用在「不要用線性、但也不需要彈簧」的地方。 */
function smoothstep(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

type RimFloorTag = { color: THREE.Color; max: number };
type BioGlowTag = { base: number; amp: number; speed: number };

/** 收集一棵子樹裡標了 userData.rimFloor／userData.bioGlow 的材質（見
    models.ts 的 CREATURE_RIM_FLOOR／JELLY_GLOW_*，跟 placeholders.ts 怎麼
    標記 tag）——不管生物身上裝的是 placeholder 還是真模型，每次內容被換掉
    （makeCreature 建立 placeholder、applyLoadedModel 換上真模型）都要重新
    收集一次，才不會抓到舊的材質參照。跟潛水員自己的 collectDiverMaterials()
    是分開的兩套機制（diverRim tag vs. rimFloor／bioGlow tag）。 */
function collectTaggedMaterials(root: THREE.Object3D) {
  const rimFloor: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] = [];
  const bioGlow: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial)) continue;
      if (m.userData.rimFloor) rimFloor.push(m);
      if (m.userData.bioGlow) bioGlow.push(m);
    }
  });
  return { rimFloor, bioGlow };
}

/** reef-school.glb 這一個檔案在 scene 最上層放了「一棵共用骨架根」＋「4 個
    獨立 SkinnedMesh」（見 models.ts 的 ModelEntry.reefMeshIndex 說明）——
    GLTFLoader 把沒有 mesh/skin 的節點通常 parse 成 Group/Object3D，有
    mesh+skin 的節點則直接是 THREE.SkinnedMesh。用 instanceof 篩選比死記
    「children[0] 是骨架、children[1..4] 是魚」這種位置假設更不怕以後
    glTF 匯出順序變動。 */
function getReefSpeciesNodes(scene: THREE.Object3D): { boneRoot: THREE.Object3D | undefined; meshes: THREE.Object3D[] } {
  const meshes: THREE.Object3D[] = [];
  let boneRoot: THREE.Object3D | undefined;
  for (const child of scene.children) {
    if (child instanceof THREE.SkinnedMesh) meshes.push(child);
    else if (!boneRoot) boneRoot = child;
  }
  return { boneRoot, meshes };
}

/** 把 cloneSkeleton(scene) 複製出來的「完整一份」（骨架根＋reef-school 的
    全部 4 個 mesh）修剪成「只留這個 kind 自己要用的那一個 mesh」——4 個
    mesh 共用同一棵骨架,所以骨架根本身要整棵留著（SkinnedMesh.skeleton.bones
    的綁定需要完整骨架才正確),只移除跟這個 kind 無關的另外 3 個 mesh,
    避免同一個位置疊出不該出現的魚、也省掉不必要的頂點蒙皮運算。 */
function pruneReefInstance(instance: THREE.Object3D, keepMeshIndex: number) {
  const { meshes } = getReefSpeciesNodes(instance);
  meshes.forEach((mesh, i) => {
    if (i !== keepMeshIndex) instance.remove(mesh);
  });
}

/**
 * round 8 查「魚會轉圈／倒退游」的根因（直接讀 reef-school.glb 的 glTF
 * JSON 查出來的，不是猜的）：這個骨架每條魚自己的「Root」骨頭完全沒有被
 * 動畫到（0 個 channel）；真正帶著整條魚到處跑的，是 Root 正下方的
 * head／Spine_01 這幾根骨頭上的 translation track——烘焙動畫把「全身
 * 移動」錄成了「第一節骨頭自己平移」，而不是錄在真正的根骨頭上。引擎
 * 原本又在 Object3D 層級疊了一層自己的路徑移動（pseudoNoise 漂移／群體
 * 路徑，round 8 已拿掉，見上面 MotionKind 的說明），兩層位移疊加,才會
 * 看起來像亂轉圈、或朝向跟移動方向對不上（倒退游）。
 *
 * 修法：把 clip 裡「所有 translation track」整批拿掉（不只是真正的 Root
 * 骨頭——它反而沒有 track；是它的直屬子骨頭在搬家),只留 rotation
 * track——那才是「尾巴／脊椎彎動、鰭片拍動」的局部擺動，魚游動時應該
 * 有的擺動全部是 rotation，不是 translation。拿掉 translation 之後剩下
 * 的 rotation track 實測就是乾淨的原地游動，不需要整個放棄烘焙動畫、
 * 退回程序化擺動。回傳新的 AnimationClip、不修改原始 clip——原始 clip
 * 是 GLTFLoader parse 出來、四個 reefXxx 分支共用的同一份物件，就地改
 * 會讓後面還沒處理的分支也被動影響。
 */
// round 11：stripRotationMatch 讓這支函式可以額外拿掉「名稱比對到的骨頭」
// 的 rotation track——reefXxx 的 head 骨頭正是這種情況（見 models.ts 的
// ModelEntry.stripRotationMatch 說明）：那根骨頭的 rotation track 其實是
// 整條魚「轉身」的烘焙位移，不是局部擺動，是使用者回報「魚有時正游有時
// 倒退游」的真正根因。預設空陣列＝跟以前行為一樣,只拿掉 translation。
//
// 比對用「關鍵字＋後面緊接一個數字」的正規表示式,不是單純子字串——
// GLTFLoader 把節點名稱的 ":"/"." 都拿掉了（見 models.ts 的
// ModelEntry.reefKeepPrefix 說明),track 節點路徑長得像
// "Clown1head6_10"（head 後面緊接數字）跟 "Clown1head_End7_11"（head
// 後面接的是 "_"）——單純 includes("head") 會兩個都命中,比對到數字
// 才精準排除掉 head_End。
function sanitizeSwimClip(clip: THREE.AnimationClip, stripRotationMatch: string[] = []): THREE.AnimationClip {
  const rotationStripPatterns = stripRotationMatch.map((m) => new RegExp(`${m}\\d`));
  const tracks = clip.tracks.filter((track) => {
    const lastDot = track.name.lastIndexOf(".");
    const nodePath = lastDot >= 0 ? track.name.slice(0, lastDot) : track.name;
    const prop = lastDot >= 0 ? track.name.slice(lastDot + 1) : "";
    if (/Root\d/.test(nodePath)) return false; // 防禦性保留：這個模型目前沒有任何 channel 命中這條
    if (prop === "position") return false;
    if (prop === "quaternion" && rotationStripPatterns.some((re) => re.test(nodePath))) return false;
    return true;
  });
  return new THREE.AnimationClip(`${clip.name}__swimInPlace`, clip.duration, tracks, clip.blendMode);
}

/**
 * round 11（「兩條魚黏在一起」的根因，用 inspect 這個 glb 的 glTF JSON
 * 查出來的）：reefTang/Moorish/Yellow 這三個 mesh 各自其實是兩條魚
 * （<species>1、<species>2）共用同一份蒙皮幾何、reefClown 則是三條
 * （Clown1/2/3）——不是乾淨的單條魚。每個頂點的 skinIndex/skinWeight
 * 最大權重對應哪根骨頭，決定它屬於哪條魚：只留三個頂點的最大權重骨頭
 * 名稱都以 keepPrefix 開頭的三角形，重建一份新的 index buffer。一定要
 * 先 geometry.clone()——4 個 reefXxx 項目共用同一份原始 geometry（見
 * tryLoadModel 的 path 快取），直接改索引會把其他還沒處理的 instance
 * 也一起改壞。回傳被留下來的頂點 id（給 recenter 用,不用再篩一次)。
 */
function keepOnlyFirstReefFish(mesh: THREE.SkinnedMesh, keepPrefix: string): number[] {
  const geometry = mesh.geometry.clone();
  mesh.geometry = geometry;
  const skinIndexAttr = geometry.getAttribute("skinIndex");
  const skinWeightAttr = geometry.getAttribute("skinWeight");
  const indexAttr = geometry.getIndex();
  const bones = mesh.skeleton.bones;
  if (!skinIndexAttr || !skinWeightAttr || !indexAttr) return [];

  const dominantJointName = (vertexIndex: number): string => {
    let bestJoint = 0;
    let bestWeight = -1;
    for (let k = 0; k < skinWeightAttr.itemSize; k++) {
      const w = skinWeightAttr.getComponent(vertexIndex, k);
      if (w > bestWeight) {
        bestWeight = w;
        bestJoint = skinIndexAttr.getComponent(vertexIndex, k);
      }
    }
    return bones[bestJoint]?.name ?? "";
  };

  const keptVertices = new Set<number>();
  const newIndices: number[] = [];
  for (let i = 0; i < indexAttr.count; i += 3) {
    const a = indexAttr.getX(i);
    const b = indexAttr.getX(i + 1);
    const c = indexAttr.getX(i + 2);
    if (
      dominantJointName(a).startsWith(keepPrefix) &&
      dominantJointName(b).startsWith(keepPrefix) &&
      dominantJointName(c).startsWith(keepPrefix)
    ) {
      newIndices.push(a, b, c);
      keptVertices.add(a);
      keptVertices.add(b);
      keptVertices.add(c);
    }
  }
  geometry.setIndex(newIndices);
  return Array.from(keptVertices);
}

// round 8 回饋：「魚會轉圈／倒退游」——徹底拿掉 glide/school/solo 三種各自
// 的路徑（sin 擺動／pseudoNoise 漂移／群體彎曲路徑）,全部收斂成一種模型：
// 水平直線移動,出畫面從另一邊進來,方向固定不變,朝向瞬間鎖定、不再 slerp。
// 生物的移動方式現在只分兩種：
//   straight 所有「有前進方向」的生物（四種珊瑚礁魚／鯖魚個體／海龜／
//            鎚頭鯊／鮟鱇魚）共用同一套水平直線位移＋出界換邊的邏輯
//            （見 updateCreatures 的 advanceStraight()）。
//   school   鯖魚是唯一仍然需要「群體」概念的物種——整群共用同一個方向／
//            速度／X 座標（見 this.groupX),個體只疊一個固定的隊形偏移,
//            本身也是「直線移動」,只是位移量從群體算,不是各自獨立算。
//   drift    水母——沒有前進方向,維持原地的垂直漂浮＋小幅度搖擺,不再
//            繞圈。
type MotionKind = "straight" | "school" | "drift";

type Creature = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  kind: ModelName;
  isPlaceholder: boolean;
  motion: MotionKind;
  // round 5：拿掉固定的 baseDepthM（在世界座標裡釘死一個深度），改成「捲動
  // 進度區間」（bandMin/bandMax）＋每幀動態維護的螢幕內 Y 座標（posY）。
  // 舊寫法的問題：深海段全長 336 個世界單位，視野在那個距離只看得到
  // 5～11 個單位高，生物釘死在區間裡隨機一個深度，大部分時間根本不在
  // 攝影機視野範圍內——這是使用者回報「140m／1000m 完全看不到深海生物」
  // 的根因。現在的作法：只要目前捲動進度落在這個物種的區間內，就想辦法
  // 讓牠一直待在攝影機視野附近（見 recyclePosY／recycleGroupY）；離開
  // 視野頂/底就從另一邊送回來,離開區間就直接隱藏,不再回收。這一段 round 8
  // 完全沒有動：垂直方向（跟著深度）的回收邏輯跟水平方向的直線移動是兩件
  // 互相獨立的事,只換水平（X）跟朝向那一半。
  bandMin: number;
  bandMax: number;
  posY: number;
  initialized: boolean;
  // 游回視野用（見 recyclePosY）：鏡頭停下來時,被回收到視野外緣的生物
  // 不能只靠 sin 擺動（振幅只有 0.6~0.8，游不回視野內）——swimBackActive
  // 為 true 時,每幀用 swimBackSpeed 朝 swimTargetY 緩慢靠近,直到進入
  // 視野內側 70% 範圍。
  swimBackActive: boolean;
  swimTargetY: number;
  swimBackSpeed: number;
  phase: number;
  seed: number;
  // round 8 直線移動專用：
  //   dir         前進方向，+1＝往 +X（畫面右）、-1＝往 -X——spawnInRange
  //               呼叫端用索引交替指定（見 spawnCreatures），讓同一批生物
  //               裡左右方向大致各半,不是每個實例各自丟硬幣。這個值從建立
  //               之後就不再變,所以朝向也只需要算一次（見下面 quatTarget）。
  //   posX        沿車道的位置（車道中心為原點），每幀用 dir*glideSpeed*dt
  //               累加,超出 laneWidth/2 就直接從另一邊的邊界減回來——是
  //               「直線穿越＋換邊」,不是等 x/z 雜訊自己飄。
  //   xInitialized 跟 posY 的 initialized 是分開兩個旗標：這個物種「剛進入
  //               活躍區間」時只決定一次 posX 的起點（畫面內隨機一點，不是
  //               每次都從車道最左邊開始),離開區間（active=false）要重置,
  //               下次重新進入才會重新抽一次起點。
  dir: 1 | -1;
  posX: number;
  xInitialized: boolean;
  glideSpeed: number;
  // round 11：真魚不是定速——glideSpeed 疊一個 ±25% 的 sin 波動（見
  // updateCreatures 的 "straight" 分支），這個欄位是每隻各自隨機的波動
  // 頻率（0.3~0.6Hz），同一批魚才不會看起來「同步變速」。
  speedFreqHz: number;
  // round 12：衝刺－滑行的角頻率（rad/s，週期 2~5 秒）、z 方向漂移的角頻率、
  // 上一幀偏航角（算 roll 用）、鯖魚 timeScale 基準。
  burstOmega: number;
  zFreq: number;
  prevYaw: number;
  scaleBase: number;
  // laneCenterX：車道中心點的水平偏移（預設 0＝置中）——round 7 回饋：
  // 鮟鱇魚放大後桌機版會疊在左側固定文字欄上面,讓牠的車道整個偏到畫面
  // 右側（見 spawnCreatures 怎麼算這個值),不是靠「隨機剛好沒疊到」。
  laneWidth: number;
  laneCenterX: number;
  laneZ: number;
  // school 專用：隊形偏移（相對於群體共用座標的固定位移,見 this.groupX）。
  formationOffset: THREE.Vector3;
  // drift 專用（水母）：radius 當搖擺／脈動的幅度基準,speed 當脈動角速度,
  // 不再是繞圈半徑／角速度——round 8 拿掉水母的環繞路徑,改成原地垂直
  // 漂浮＋小幅度搖擺,這兩個欄位名稱沿用、意義稍微變了,見 updateCreatures
  // 的 "drift" 分支。
  radius: number;
  speed: number;
  // round 8：直線移動的朝向是「瞬間鎖定、不隨時間變」的——dir 一旦決定,
  // 朝向就只需要算這一次（見 setFixedTravelOrientation()），不需要每幀
  // slerp。這個欄位改成存「算好之後的最終朝向」,給 setFixedTravelOrientation
  // 內部暫存用,production 的 straight/school 分支本身不會每幀重算。
  // orientToVelocity()（debug 模式還在用,見 updateDebugScene／
  // updateDebugAllScene)仍然需要一個「上一幀朝向」來 slerp,所以這個欄位
  // 繼續保留、繼續共用,不是兩套機制。
  quatTarget: THREE.Quaternion;
  // 見 collectTaggedMaterials()：rimMaterials 是「深度越深、底色越亮」的
  // 通用材質（CREATURE_RIM_FLOOR），bioGlowMaterials 是會脈動的生物發光
  // 材質（目前只有水母鐘部，JELLY_GLOW_*）。每次 root 內容被換掉都要重收集。
  rimMaterials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[];
  bioGlowMaterials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[];
};

type Bubble = {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  wobbleFreq: number;
  wobblePhase: number;
  isBurst: boolean;
  life: number; // 只有 isBurst 用得到；<=0 代表可以被下一次噴氣回收
  active: boolean;
};

export class DiveEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  // 手動算經過時間，不用 THREE.Clock——新版 three.js 把它標成 deprecated
  // （改推 Timer），但我們只需要「經過秒數」跟「這幀秒數」兩個數字，
  // 用 performance.now() 自己算兩行就好，不需要多引入一個 API。
  private clockStart = performance.now();
  private lastFrameTime = this.clockStart;
  private rafId: number | null = null;
  private disposed = false;
  private mobile = isMobileSpec();
  private narrowLayout = isNarrowLayout();

  private diver: Creature | null = null;
  private creatures: Creature[] = [];
  // school 群體（目前只有鯖魚）共用的 Y 座標狀態，用 kind 當 key——
  // 見 recycleGroupY()，一個群體只算一次，不是每個成員各自回收。
  private groupY = new Map<
    ModelName,
    { y: number; initialized: boolean; swimBackActive: boolean; swimTargetY: number; swimBackSpeed: number }
  >();
  // round 8：鯖魚群「整群共用一個方向／速度」的水平位置狀態——跟 groupY
  // 是分開兩條軸：groupY 管「垂直方向有沒有在攝影機視野附近」（round 5
  // 就有的機制，round 8 完全沒動），groupX 管「整群沿水平方向走到哪裡
  // 了」（round 8 新增）。只會在 updateCreatures() 的主迴圈之前整群推進
  // 一次（見那邊的說明），不是每條魚各自累加,否則群體會被推進 N 倍速。
  private groupX = new Map<ModelName, { x: number; dir: 1 | -1; speed: number; initialized: boolean }>();

  // 氣泡：見檔案頂端第 6 點。ambientBubbles 是散落在水柱裡的稀疏氣泡，
  // burstPool 是潛水員規律吐氣用的小氣泡池（重複利用，不是每次吐氣都
  // 新建 Sprite）。
  private bubbleTexture: THREE.Texture;
  private ambientBubbles: Bubble[] = [];
  private burstPool: Bubble[] = [];
  private nextBurstAt = 1.5;

  // 平光：只剩這兩種，顏色/強度都是深度的連續函數，沒有聚光燈、沒有點光源、
  // 沒有看得見光束本體的平面——見檔案頂端的說明。round 9 加了 sunLight
  // （見下面)，是一般的方向光,不是聚光燈/光束,不違背這條原則。
  // round 12 另加潛水員手電筒 SpotLight（flashLight）：只照亮材質、無光束幾何,
  // 使用者已同意（深海太黑的回饋）。
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  // round 9：淺水「陽光從上方灑下來」的柔和方向光,強度隨深度衰減到 0
  // （40m 以下完全沒有，見 update()）。target 也要加進 scene 才會跟著
  // position 一起正確更新 matrixWorld。
  private sunLight: THREE.DirectionalLight;
  // round 12：潛水員手電筒（SpotLight，不投影、無可見光束幾何），瞄向游標
  // 在 FLASH_PLANE_Z 平面上的對應點；沒有游標（觸控／尚未移動）時朝前下方
  // 慢慢掃動。flashAim 是平滑後的目標點，flashPointerNdc 為 null 代表沒游標。
  private flashLight: THREE.SpotLight;
  private flashAim = new THREE.Vector3(0, -2, FLASH_PLANE_Z);
  // 潛水員頭部骨頭（真模型載入後由 findDiverHeadBone 找到並快取）與暫存向量。
  private diverHeadBone: THREE.Object3D | null = null;
  private headTmp = new THREE.Vector3();
  private flashPointerNdc: THREE.Vector2 | null = null;
  private flashRay = new THREE.Raycaster();
  private flashTmp = new THREE.Vector3();
  private flashHasHover = typeof window !== "undefined" && !window.matchMedia("(hover: none)").matches;

  // round 9：淺水漸層背景——用 CanvasTexture 當 scene.background,每幀
  // 用目前深度對應的顏色重畫這張小畫布（見 paintBackgroundGradient()）。
  private bgCanvas: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private bgTexture: THREE.CanvasTexture;

  // 攝影機的深度：緊跟著「真實深度」（depthAt(progress)），只留極小的平滑
  // 常數消除單幀跳動,不是有意義的物理落後。
  //
  // round 3 踩到的坑：這裡原本用一個「秒級」的指數平滑常數（0.9s）讓攝影機
  // 刻意落後潛水員的真實深度，理由是想做出「生物持續往上流過去」的體感。
  // 但深度曲線後段（見 depth.ts）在很短的捲動距離內暴衝到 -350 個世界單位，
  // 這個「落後」在暴衝段等於永遠追不上——使用者捲到 1000m，攝影機可能還
  // 停在 100 多公尺對應的世界座標，這時候：(a) 生物是用絕對世界座標固定
  // 擺放的（見 spawnInRange），攝影機沒真的到那裡，深海生物自然「看不到」；
  // (b) 淺水生物（例如珊瑚礁魚）因為攝影機還沒離開牠們的世界座標附近，
  // 會一路跟著捲到很深的章節都還在畫面上。這正是使用者回報的「魚只在
  // 一層」「深海是空的黑畫面」的根因，不是模型沒載入或生物沒生成
  // （console 沒有任何錯誤，七個模型都正常載入）。潛水員的螢幕位置已經
  // 靠 diverWorldYForFraction() 獨立算好，不需要攝影機刻意落後也能做出
  // 「他在往下滑」的效果，所以這裡直接拿掉落後，只留數值平滑。
  private cameraY = 0;
  private cameraX = 0;
  // round 10：記住上一幀的「真實深度」世界 Y（update() 裡的 trueDiverY)，
  // 用來算鏡頭目前的垂直移動速度（世界單位/秒）——recyclePosY／
  // recycleGroupY 要知道「鏡頭是不是快到足以自己把生物帶進畫面」,不能只
  // 看 swimBackSpeed 本身,見那兩個方法怎麼用這個值決定 wrap 到視野外緣
  // 還是直接空降到視野內。
  private lastRefY = 0;

  // 潛水員的朝向：0＝下潛姿態（頭朝下），1＝上浮姿態（頭朝上）。跟著
  // diveState.direction 的目標值用時間平滑地追過去，不是瞬間翻轉。
  private facing = 0;

  private resizeObserver: ResizeObserver | null = null;

  // 除錯模式：`?diveDebug=<kind>` 觸發（見 DiveCanvas.tsx 怎麼讀這個參數），
  // 只用來讓開發者肉眼確認單一物種是不是頭朝前游——不是給使用者看的。
  // 沒有這個查詢參數時完全不會進到這條分支，production 行為不受影響。
  // `"all"` 是另一種除錯模式（見 setupDebugAllScene）：七種生物一次排排站，
  // 單一物種模式把鯖魚／鎚頭鯊縮得太小看不出朝向，排排站模式統一正規化
  // 大小才看得清楚。
  private debugKind: ModelName | "all" | null = null;

  // 潛水員 fresnel 輪廓光材質快取（見 DIVER_RIM_MAX_STRENGTH 常數跟 update()
  // 裡怎麼用 depthFrac 驅動每顆材質的 uRimStrength）——不管潛水員身上裝的是
  // placeholder 還是真模型，只收集標了 userData.diverRim 的材質（見
  // placeholders.ts 的 addDiverRimShader()／本檔 applyLoadedModel 怎麼標記），
  // 排除「面鏡反光」那種刻意固定亮度的材質。
  private diverMaterials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] = [];

  constructor(canvas: HTMLCanvasElement, opts?: { debugKind?: ModelName | "all" }) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true, // 首幀渲染前讓 CSS 的深水漸層透出來，不會白閃或黑閃
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // round 9（淺水配色）：使用者要「陽光藍」讀起來通透漂亮，不是灰撲撲——
    // 沒有 tone mapping 時 three.js 的線性顏色輸出偏平、偏灰。ACES 是業界
    // 常見的電影級 tone mapping,高光不死白、顏色過渡自然,exposure 1.1
    // 比預設的 1.0 再亮一點點,幫忙「生物顏色要跳出來」這個要求,但不到
    // 過曝的程度。
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1c6e7a, 4, 40);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);
    this.camera.position.set(0, 0, 6);

    // 平光：AmbientLight 給全場一致的底，HemisphereLight 加一點天／海底
    // 兩端顏色的漸層感,兩者都不會投出方向性的光束或陰影,深度越深越暗但
    // 留一個下限,不然潛水員跟生物會整個沒入全黑。數值在 update() 裡隨
    // depthFrac 動態調整（round 9 把淺水的上限從 0.8/0.9 調高，見那邊）。
    this.ambient = new THREE.AmbientLight(0x8fd8ff, 0.9);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xbfe9ff, 0x03121f, 0.8);
    this.scene.add(this.hemi);
    // round 9：0~20m 要「陽光灑下來」的感覺——加一顆從上方打下來的柔和
    // DirectionalLight,不掛陰影、不做任何可見的光束幾何,純粹是材質算
    // 光照時多一個方向性的亮暗層次（跟使用者明確拒絕過的「光柱／聚光燈
    // 錐／發光平面」是兩件事——那些是『看得到形狀的光束特效』,這顆只是
    // 一般的方向光,跟 AmbientLight/HemisphereLight 一樣不會畫出任何
    // 幾何)。強度隨深度在 update() 裡衰減到 0（40m 以下完全沒有）。
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 0);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.flashLight = new THREE.SpotLight(FLASH_COLOR, 0, FLASH_DISTANCE, FLASH_ANGLE, FLASH_PENUMBRA, FLASH_DECAY);
    this.flashLight.castShadow = false;
    this.scene.add(this.flashLight);
    this.scene.add(this.flashLight.target);
    if (this.flashHasHover) window.addEventListener("pointermove", this.handlePointerMove, { passive: true });

    // round 9：淺水的「陽光藍」漸層背景——用一張小畫布畫垂直漸層當
    // scene.background（Texture），不是固定色。比另外加一個包住攝影機的
    // 大球／shader mesh 簡單、不用擔心 far plane 裁切半徑算錯——
    // scene.background 本身就是 renderer 最先畫、不寫入深度的那一層,
    // 效果跟「全螢幕四邊形、depthTest false、最先渲染」完全一樣。見
    // paintBackgroundGradient()／update() 怎麼每幀用 sampleDepthGradient()
    // 重畫這張畫布。
    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.width = 2;
    this.bgCanvas.height = 256;
    this.bgCtx = this.bgCanvas.getContext("2d")!;
    this.bgTexture = new THREE.CanvasTexture(this.bgCanvas);
    // colorSpace 一定要宣告成 SRGBColorSpace——這張畫布畫的 CSS hex 顏色
    // 本來就是 sRGB 編碼的位元組,宣告之後 three.js 才知道「畫面上看到的
    // 這組數字要先解碼成線性空間再算光照」,也才會因此自動把這個背景從
    // tone mapping 排除（見 three 原始碼 WebGLBackground.js：
    // material.toneMapped = getTransfer(background.colorSpace) !== SRGBTransfer
    // ——宣告成 SRGBColorSpace 時這個條件是 false,背景不會被 ACES 壓過,
    // 顏色才會跟 DEPTH_GRADIENT_STOPS 寫的色票數字一致,不會看起來灰濛濛)。
    // 不宣告的話預設是 NoColorSpace（視為已經是線性值），canvas 裡其實是
    // sRGB 位元組卻被當線性值用，再疊一次 sRGB 編碼輸出,顏色會整個偏白、
    // 偏灰——這正是「milky/washed out」的根因。
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    // 畫布只有 2 像素寬、拿來畫垂直漸層——不需要 mipmap（更不需要 WebGL
    // 幫忙內插出來的中間層級,那些中間層級對一張本來就極簡單的漸層毫無
    // 意義,只會多一層不必要的重取樣),關掉可以避免任何意外的取樣模糊
    // 疊加在顏色上。
    this.bgTexture.generateMipmaps = false;
    this.bgTexture.minFilter = THREE.LinearFilter;
    this.bgTexture.magFilter = THREE.LinearFilter;
    this.scene.background = this.bgTexture;

    // 氣泡貼圖不管是不是除錯模式都先建好（TS 需要這個欄位在每條建構路徑都
    // 有值），除錯模式只是不會呼叫 buildBubbles() 生實際的氣泡 sprite。
    this.bubbleTexture = this.buildBubbleTexture();

    this.debugKind = opts?.debugKind ?? null;
    const debugKind = this.debugKind;
    if (debugKind === "all") {
      this.setupDebugAllScene();
      return;
    }
    if (debugKind) {
      // 除錯模式：只放一隻放大、靠近攝影機的生物，慢慢左右移動，見
      // updateDebugScene()。不建立潛水員、不建立氣泡、不載入其他六個模型
      // ——單純為了肉眼確認朝向,其他東西都是雜訊。
      // motion 欄位這裡傳什麼其實不影響這個除錯模式——updateDebugScene()
      // 是獨立一條更新路徑,自己算 sin 擺動的位置,不會去讀 c.motion 分支,
      // 純粹只是 TS 的型別需要一個合法值。
      const c = this.makeCreature(debugKind, "straight", [0, 1], 0);
      c.laneZ = 2; // 比正常車道（-3~-16）更靠近攝影機，畫面上看起來比較大
      c.laneWidth = 6;
      c.glideSpeed = 0.25;
      this.creatures.push(c);
      this.scene.add(c.root);
      // applyLoadedModel() 對 name==="diver" 有特殊處理，會去找 this.diver
      // 而不是在 this.creatures 裡用 kind 篩——除錯模式沒有建立 this.diver
      // （一般路徑才會建），漏了這行會讓 applyLoadedModel 對著 null 存取
      // .root 噴例外，被 GLTFLoader 接住當成「載入失敗」，還以為模型檔
      // 有問題,其實是這裡的參照沒接上。
      if (debugKind === "diver") {
        this.diver = c;
        this.collectDiverMaterials();
      }
      this.tryLoadModel(debugKind);
      this.handleResize();
      this.update(0);
      return;
    }

    // 潛水員先放 placeholder，真模型載入完成後 applyLoadedModel() 換掉這個
    // group 底下的內容，其餘程式碼一直只認 this.diver.root，不管裡面裝的是
    // 哪一種——這也是「潛水員從第一幀就看得到」的關鍵：不等模型載完才顯示。
    this.diver = this.makeCreature("diver", "drift", [0, 1], 0);
    this.scene.add(this.diver.root);
    this.collectDiverMaterials();

    this.buildBubbles();

    this.handleResize();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    window.addEventListener("resize", this.handleResize);

    this.spawnCreatures();
    // 七個模型全部壓縮後只有～2.6MB，不分批、不等待閒置或捲動進度——
    // 見 models.ts 的 ALL_MODELS 註解，分批載入省下的頻寬完全不值得
    // 「深海生物準時出現」這件事被犧牲掉。
    for (const name of ALL_MODELS) this.tryLoadModel(name);

    // 讓第一幀渲染之前，攝影機／潛水員的位置就已經算過一次——不然使用者
    // 會在真正的 rAF 跑起來之前看到潛水員停在建構子給的預設位置。
    this.update(0);
  }

  /**
   * 除錯模式 `?diveDebug=all`：MODEL_REGISTRY 裡每個登記表項目一次排排站,
   * 一列一種，由上到下跟 DEBUG_ALL_ROWS（見 models.ts）同順序同位置——
   * round 8 把 reefSchool 拆成 reefClown/reefTang/reefMoorish/reefYellow
   * 四個獨立項目之後，這裡會自動多出四列（DEBUG_ALL_ROWS 是從 ALL_MODELS
   * 直接 map 出來的，不用另外改這支函式），剛好符合使用者「要能分別看到
   * 四種珊瑚礁魚」的要求。跟單一物種的除錯模式（updateDebugScene）分開
   * 一支獨立的設置/更新路徑，因為排排站要的行為完全不一樣：固定大小
   * 正規化、固定從左到右等速移動不來回、全部模型都要載、背景/燈光也要
   * 换成「看得清楚材質」而不是重現正式場景的深度氛圍。
   */
  private setupDebugAllScene() {
    this.scene.fog = null; // 使用者要求「no fog」，排排站只看朝向跟材質
    for (const { kind, frac } of DEBUG_ALL_ROWS) {
      const c = this.makeCreature(kind, "straight", [0, 1], Math.random() * Math.PI * 2);
      c.laneZ = 0; // 跟 normalize 的度量基準（z=0）對齊
      // frac=0 貼畫面頂端、frac=1 貼畫面底部，跟潛水員在正式場景用的同一條
      // 換算公式（diverWorldYForFraction）一樣,只是這裡攝影機固定在原點
      // （cameraY 恆為 0,見 updateDebugAllScene),直接展開算不需要再呼叫它。
      c.posY = -(frac - 0.5) * this.visibleHeightAt(6);
      c.dir = 1;
      this.creatures.push(c);
      this.scene.add(c.root);
      // 跟單一物種除錯模式一樣：this.diver 沒接上的話 applyLoadedModel()
      // 對 name==="diver" 的特殊處理會對著 null 存取 .root 噴例外。
      if (kind === "diver") {
        this.diver = c;
        this.collectDiverMaterials();
      }
    }
    for (const name of ALL_MODELS) this.tryLoadModel(name);

    this.handleResize();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    window.addEventListener("resize", this.handleResize);

    this.update(0);
  }

  /** 收集潛水員目前身上（placeholder 或真模型）標了 userData.diverRim 的
      材質，給 update() 每幀依深度調整 fresnel 輪廓光強度用（見
      DIVER_RIM_MAX_STRENGTH 常數／placeholders.ts 的 addDiverRimShader）。
      只抓有標記的材質——潛水員 placeholder 的「面鏡反光」那片材質刻意不
      標記，它的高亮度是固定的,不該被深度插值蓋掉。 */
  private collectDiverMaterials() {
    this.diverMaterials = [];
    if (!this.diver) return;
    this.diver.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (
          (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) &&
          m.userData.diverRim
        ) {
          this.diverMaterials.push(m);
        }
      }
    });
  }

  private makeCreature(kind: ModelName, motion: MotionKind, band: [number, number], phase: number): Creature {
    const root = buildPlaceholder(kind);
    const tagged = collectTaggedMaterials(root);
    return {
      root,
      rimMaterials: tagged.rimFloor,
      bioGlowMaterials: tagged.bioGlow,
      mixer: null,
      kind,
      isPlaceholder: true,
      motion,
      bandMin: band[0],
      bandMax: band[1],
      posY: 0,
      initialized: false,
      swimBackActive: false,
      swimTargetY: 0,
      swimBackSpeed: 0.65,
      phase,
      seed: Math.random() * 100,
      // 預設先隨機給一個方向——debug 模式（updateDebugScene／
      // updateDebugAllScene）不會呼叫 spawnInRange，直接用這個隨機預設值
      // 也無妨（debug 模式本來就不是為了驗證「左右各半」）。正式場景一律
      // 由 spawnInRange 交替覆蓋,見那邊的註解。
      dir: Math.random() < 0.5 ? 1 : -1,
      posX: 0,
      xInitialized: false,
      glideSpeed: 1,
      speedFreqHz: 0.3 + Math.random() * 0.3,
      burstOmega: (Math.PI * 2) / (SWIM_BURST_PERIOD_MIN + Math.random() * SWIM_BURST_PERIOD_RANGE),
      zFreq: 0.25 + Math.random() * 0.25,
      prevYaw: 0,
      scaleBase: SCHOOL_TIMESCALE_BASE_MIN + Math.random() * SCHOOL_TIMESCALE_BASE_RANGE,
      laneWidth: 20,
      laneCenterX: 0,
      laneZ: -4,
      formationOffset: new THREE.Vector3(0, 0, 0),
      radius: 1,
      speed: 1,
      quatTarget: new THREE.Quaternion(),
    };
  }

  private loader = (() => {
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    return l;
  })();

  // 四個 reefXxx 登記表項目的 path 都指向同一個 reef-school.glb（見
  // models.ts 的 ModelEntry.reefMeshIndex 說明）——用 path 當 key 快取
  // 載入的 Promise，四次 tryLoadModel 呼叫只會真的 fetch/parse 一次,其餘
  // 三次直接拿同一份已經 parse 好的 GLTF 結果,applyLoadedModel 會各自從
  // 裡面切出自己要的那個 mesh（見 pruneReefInstance），不會互相干擾。
  private gltfCache = new Map<string, Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>>();
  // round 11：keepOnlyFirstReefFish 篩完之後,留下來的那條魚在整個共用
  // 骨架裡的靜止位置（bbox 中心）跟這個 instance 的原點不一定重合——同一個
  // kind 的每個 instance 靜止姿態都一樣,只要量一次就好,見 applyLoadedModel
  // 怎麼用這個快取。
  private reefRecenterCache = new Map<ModelName, THREE.Vector3>();
  // round 11：疊加在固定朝向之上的抬頭/低頭、海龜 roll 搖擺用的暫存
  // Quaternion——每幀重複使用,不要在 updateCreatures 的迴圈裡新配置物件。
  private pitchQuat = new THREE.Quaternion();
  private wobbleQuat = new THREE.Quaternion();
  private yawQuat = new THREE.Quaternion();
  private rollQuat = new THREE.Quaternion();
  private orientTarget = new THREE.Quaternion();

  private loadGltf(path: string): Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF> {
    let p = this.gltfCache.get(path);
    if (!p) {
      p = new Promise((resolve, reject) => {
        this.loader.load(path, resolve, undefined, reject);
      });
      this.gltfCache.set(path, p);
    }
    return p;
  }

  private tryLoadModel(name: ModelName) {
    const entry = MODEL_REGISTRY[name];
    this.loadGltf(entry.path).then(
      (gltf) => {
        if (this.disposed) return;
        this.applyLoadedModel(name, gltf);
      },
      () => {
        // 檔案不存在或載入失敗都會走到這裡——這是預期中的正常路徑（使用者
        // 還沒把模型放進 models/src/），不是要修的 bug，維持 placeholder 即可。
        console.warn(`[landing] 找不到模型「${name}」（${entry.path}），使用替代幾何`);
      },
    );
  }

  private applyLoadedModel(name: ModelName, gltf: import("three/examples/jsm/loaders/GLTFLoader.js").GLTF) {
    const entry = MODEL_REGISTRY[name];
    const scene = gltf.scene;
    scene.rotation.copy(entry.rotationOffset);
    if (this.debugKind === "all") {
      // 除錯排排站：不用正式場景那份配合攝影機景深調的 scale（各物種
      // 刻意大小不一），改成量出每個模型目前的 bbox 最長邊，反推一個讓
      // 大家都正規化到 DEBUG_ALL_TARGET_SIZE 的縮放值——這樣排排站時每隻
      // 生物看起來差不多大，才方便一次比較朝向。scale 先設回 1 再量
      // （rotation 已經套用，量到的是「修正朝向後」的 bbox），量完才把
      // 真正要用的縮放值設上去。
      //
      // reefXxx 四個項目共用同一個 scene（四個 mesh 都在裡面)——量整個
      // scene 的 bbox 會量到「四種魚疊在一起」的大小，四個 kind 因此會算
      // 出同一個（太小的）縮放值，排排站時完全看不出來是四種不同的魚。
      // 只量這個 kind 自己要用的那一個 mesh（見 getReefSpeciesNodes）。
      scene.scale.setScalar(1);
      const measureRoot =
        entry.reefMeshIndex !== undefined
          ? getReefSpeciesNodes(scene).meshes[entry.reefMeshIndex] ?? scene
          : scene;
      const box = new THREE.Box3().setFromObject(measureRoot);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
      scene.scale.setScalar(DEBUG_ALL_TARGET_SIZE / maxDim);
    } else {
      scene.scale.setScalar(entry.scale);
    }
    // 中層生物（珊瑚礁魚／鯖魚／海龜／鎚頭鯊）跟鮟鱇魚的「身體」統一用同一套
    // 通用 rim floor（見 models.ts 的 CREATURE_RIM_FLOOR）——深度越深、材質
    // 底色越亮，保證牠們不會整個沒入背景。只是「標記」，實際每幀套用在
    // updateCreatures()。四個 reefXxx 目前共用一樣的 rimFloor 數值（見
    // models.ts），這裡雖然每次都對整個共用 scene（四個 mesh）打標籤、
    // 不只打標在這個 kind 自己的 mesh 上，也不會有問題——反正四次打上去
    // 的值都一樣。要是以後四種珊瑚礁魚想要不同的 rim 顏色，這裡要改成只
    // 對 getReefSpeciesNodes(scene).meshes[entry.reefMeshIndex] 打標籤。
    const rimFloor = CREATURE_RIM_FLOOR[name];
    if (rimFloor) {
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
            m.userData.rimFloor = { color: new THREE.Color(rimFloor.color), max: rimFloor.max };
          }
        }
      });
    }
    // 水母：鐘部（材質名稱帶 "bell"）要讀成「會脈動的生物發光」——半透明＋
    // 加法混合＋depthWrite:false（見 JELLY_GLOW_* 常數跟 updateCreatures()
    // 怎麼用它們驅動脈動），不是固定不動的一塊亮色；觸手維持半透明但不脈動。
    // 回饋：水母原本讀起來像「深色橢圓形」，不夠「生物發光」。
    if (name === "jellyfish") {
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial)) continue;
          const isBell = m.name.toLowerCase().includes("bell");
          m.transparent = true;
          m.depthWrite = false;
          if (isBell) {
            m.blending = THREE.AdditiveBlending;
            m.opacity = 0.55;
            m.emissive = new THREE.Color(0x8ff5ff);
            m.emissiveIntensity = JELLY_GLOW_BASE;
            m.userData.bioGlow = { base: JELLY_GLOW_BASE, amp: JELLY_GLOW_AMP, speed: JELLY_GLOW_SPEED };
          } else {
            m.opacity = 0.35;
            m.emissive = new THREE.Color(0x6fe0ff);
            m.emissiveIntensity = 0.3;
          }
        }
      });
    }
    // 潛水員真的模型也要有輪廓光（理由跟 placeholders.ts 的
    // buildDiverPlaceholder 一樣，那邊是替代幾何的版本，這裡是真模型載入後
    // 換掉替代幾何時要補回同一個效果）——見 addDiverRimShader() 的說明。
    if (name === "diver") {
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
            addDiverRimShader(m);
          }
        }
      });
    }

    let clip = gltf.animations.find((a) => a.name === entry.animationClip) ?? gltf.animations[0];
    // round 8→11：reefXxx／mackerel／hammerhead 的烘焙動畫都混了「局部
    // 游動擺動（該留）」跟「意外的全身位移／轉身（translation 全拿掉、
    // 部分 rotation 也要拿掉，見 sanitizeSwimClip()／models.ts 的
    // ModelEntry.sanitizeSwim／stripRotationMatch 說明)」——改成讀欄位
    // 判斷,不要只認 reefMeshIndex,以後新模型有同樣問題也能直接在
    // models.ts 開關。
    if (entry.sanitizeSwim && clip) clip = sanitizeSwimClip(clip, entry.stripRotationMatch ?? []);
    const mixer = clip ? new THREE.AnimationMixer(scene) : null;
    if (mixer && clip) mixer.clipAction(clip).play();

    const targets = name === "diver" ? [this.diver!] : this.creatures.filter((c) => c.kind === name);
    for (const target of targets) {
      // 一般的 Object3D.clone(true) 對有骨架動畫的模型是壞的：SkinnedMesh.clone()
      // 只會複製 skeleton 的參照，不會把 skeleton.bones 重新指向新複製出來的骨頭
      // 節點——複製體會繼續共用原始（從未被加進場景、matrixWorld 永遠不更新）的
      // 骨架，蒙皮頂點因此用一組跟複製體自身位置完全無關的錯誤矩陣計算，畫面上
      // 看起來就是「模型出現在隨機位置、大小失控」。SkeletonUtils.clone() 才會
      // 正確地把骨架跟著整棵樹一起複製並重新綁定。
      const instance = target === this.diver ? scene : cloneSkeleton(scene);
      // reefXxx：複製出來的 instance 這時候還是「完整一份」（骨架根＋
      // reef-school 全部 4 個 mesh）——修剪成只留這個 kind 自己的那一個
      // mesh，骨架根整棵留著（見 pruneReefInstance 的說明）。只對非
      // diver 的 clone 做，diver 永遠不會是 reef 系列。
      if (entry.reefMeshIndex !== undefined && target !== this.diver) {
        pruneReefInstance(instance, entry.reefMeshIndex);
      }
      const old = target.root;
      // 保留原 placeholder 的 position/rotation（生物的位置是引擎算的，跟模型
      // 本身無關），只換裡面裝的內容。
      instance.position.set(0, 0, 0);
      // round 11（「兩條魚黏在一起」的修復）：reefKeepPrefix 有填的 kind
      // 才需要篩——先拿掉另一條魚的三角形,再把留下來的那條魚對齊 root
      // 原點（不然牠在原始魚群裡的隊形偏移會讓直線移動／轉向繞著一個
      // 偏掉的軸轉）。同一個 kind 的靜止姿態都一樣,offset 只量一次。
      if (entry.reefKeepPrefix && target !== this.diver) {
        const kept = getReefSpeciesNodes(instance).meshes[0];
        if (kept instanceof THREE.SkinnedMesh) {
          const vertices = keepOnlyFirstReefFish(kept, entry.reefKeepPrefix);
          let offset = this.reefRecenterCache.get(name);
          if (!offset) {
            offset = this.computeReefRecenterOffset(kept, vertices);
            this.reefRecenterCache.set(name, offset);
          }
          instance.position.sub(offset);
        }
      }
      old.clear();
      old.add(instance);
      target.mixer = mixer && target === this.diver ? mixer : mixer ? new THREE.AnimationMixer(instance) : null;
      if (target.mixer && clip && target !== this.diver) target.mixer.clipAction(clip).play();
      if (name === "anglerfish") this.attachAnglerfishLure(instance);
      target.isPlaceholder = false;
      if (target !== this.diver) {
        const tagged = collectTaggedMaterials(instance);
        target.rimMaterials = tagged.rimFloor;
        target.bioGlowMaterials = tagged.bioGlow;
      }
    }
    // 潛水員的實際材質（上面迴圈換掉的 mesh）到這裡才真的接上 this.diver.root
    // ——collectDiverMaterials() 要重新收集一次，不然 update() 每幀還在對著
    // placeholder 的舊材質參照調 emissive，真模型載入後輪廓底線就失效了。
    if (name === "diver") {
      this.diverHeadBone = null; // 換成真模型後重找頭部骨頭
      this.collectDiverMaterials();
    }
  }

  /**
   * 鮟鱇魚真的模型檔只有一個 mesh／一個材質（整條魚是單一 skinned mesh），
   * 「誘餌」只是骨架裡的一串骨頭（Esca1_01…Esca7_07，esca 是鮟鱇魚誘餌在
   * 生物學上的正式稱呼），不是獨立的子網格——材質層級沒辦法把誘餌跟身體
   * 分開處理。解法：把一顆小的 emissive-only 球體掛在誘餌最末端的骨頭節點
   * 上（Esca7_07）當子物件——Bone 本身是 Object3D 的子類，子物件會跟著骨架
   * 動畫的 matrixWorld 更新自動移動，不需要自己算誘餌在動畫裡的位置。跟
   * placeholders.ts 的 buildAnglerfishPlaceholder() 是同一個設計語言（固定
   * 很亮、emissive-only 的小球），只是這裡掛的是真骨架而不是手擺的位置。
   */
  private attachAnglerfishLure(instance: THREE.Object3D) {
    const tip = instance.getObjectByName("Esca7_07");
    if (!tip) return;
    const lure = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfffe0, emissive: 0x6dffb8, emissiveIntensity: 2.2, roughness: 0.4 }),
    );
    // 骨頭節點本身已經被模型原始的內部縮放跟 entry.scale 層層縮小，球體的
    // 半徑要除掉這個累積縮放，世界空間看起來才會是固定大小，不會因為骨架
    // 縮放跟著變成一個看不見的小點。
    instance.updateMatrixWorld(true);
    const worldScale = new THREE.Vector3();
    tip.getWorldScale(worldScale);
    const desiredWorldRadius = 0.07;
    lure.scale.setScalar(desiredWorldRadius / Math.max(worldScale.x, 1e-6));
    tip.add(lure);
  }

  /** round 11：keepOnlyFirstReefFish 篩完之後,算這條魚留下來的頂點的 bbox
      中心——直接讀幾何的原始（未蒙皮）position attribute,不透過
      SkinnedMesh.getVertexPosition()／applyBoneTransform()。試過蒙皮版本,
      量出來的位移大了兩個數量級（bindMatrix 只在 .bind() 當下設一次、
      不會跟著之後的 scene.scale.setScalar(entry.scale) 更新,但
      bindMatrixInverse 會在每次 updateMatrixWorld() 自動跟最新的
      matrixWorld 同步——兩者對不起來,算出來的世界座標整個跑掉)。原始
      position 本來就是蒙皮的「bind pose」基準,這條魚現在的骨架姿態（見
      sanitizeSwimClip,只剩尾巴/鰭片的小幅度 rotation 擺動）本來就接近
      bind pose,用原始頂點夠準,也完全不用管 bindMatrix 這個坑。量出來的點
      還要再乘一次 mesh.matrix——這個 mesh 節點自己相對 instance 還有一層
      本地縮放（reef-school.glb 原始匯出的單位換算,約 0.00063 倍,量過才
      知道),不是只有 instance 本身的 entry.scale 這一層。 */
  private computeReefRecenterOffset(mesh: THREE.SkinnedMesh, vertices: number[]): THREE.Vector3 {
    const posAttr = mesh.geometry.getAttribute("position");
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const idx of vertices) {
      tmp.fromBufferAttribute(posAttr, idx);
      tmp.applyMatrix4(mesh.matrix);
      box.expandByPoint(tmp);
    }
    return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  }

  // ---- 生物擺放 ----

  private spawnInRange(
    kind: ModelName,
    motion: MotionKind,
    range: [number, number],
    count: number,
    // Z 車道：有些貼近攝影機、有些遠一點,給「有的魚游得很近、有的很遠」的
    // 景深感,不是所有生物都疊在同一個 Z 距離上。預設是淺水／深海生物原本
    // 用的範圍（-16~-3）；回饋說中層生物（鯖魚／海龜/鎚頭鯊）跟深海兩種
    // 讀起來太小太暗,拉近車道（呼叫端傳更近的 zRange)是其中一個解法——
    // 範圍跟 fog.far（見 update() 環境那段）要對得上,不然遠車道的生物會
    // 被霧吃掉。
    zRange: [number, number] = [-16, -3],
  ) {
    const created: Creature[] = [];
    const [zMin, zMax] = zRange;
    // round 8：「大約一半往右、一半往左」——用索引交替指定方向，不是每個
    // 實例各自丟硬幣（丟硬幣在小樣本時很容易一個方向明顯偏多）。flip 決定
    // 「哪個奇偶性」對應哪個方向，不要每次呼叫都讓偶數索引固定往右,不然
    // 看久了會發現「這一批全部同時換邊」這種不自然的同步感。
    const flip = Math.random() < 0.5;
    for (let i = 0; i < count; i++) {
      const c = this.makeCreature(kind, motion, range, Math.random() * Math.PI * 2);
      c.laneZ = zMin + Math.random() * (zMax - zMin);
      c.dir = (i % 2 === 0) === flip ? 1 : -1;
      // 車道寬度預設用「這隻生物自己的車道距離換算出的可視寬度＋一點
      // 邊界」——比憑感覺手調的固定寬度（舊版 turtle=26／hammerhead=30）
      // 更準,window resize／攝影機距離變動時也會自動對,呼叫端仍然可以
      // 在 spawnInRange 回傳之後覆寫（鮟鱇魚就是這麼做,見下面)。
      c.laneWidth = this.visibleWidthAt(6 - c.laneZ) + 2;
      // 朝向只需要算這一次——dir 之後不會再變（見 Creature 型別定義處的
      // 說明），不用放進每幀的 update 迴圈。
      this.setFixedTravelOrientation(c);
      this.creatures.push(c);
      this.scene.add(c.root);
      created.push(c);
    }
    return created;
  }

  private spawnCreatures() {
    // round 8：珊瑚礁魚從「一個 reefSchool 模型、每個實例各自亂飄
    // （solo)」拆成「獨立物種、每個都走直線（straight)」——reef-school
    // 這個 glb 本身仍然只需要一次網路請求（見 tryLoadModel 的 path 快取），
    // 但畫面上現在是各自獨立移動的魚,不是一份「小群組」被複製 N 份。
    // round 9 回饋：reefClown 那個 mesh 實際是 3 條小丑魚以不同角度疊在
    // 一起的一簇幾何,不是乾淨的單條魚,轉 travelYaw 救不回來——從正式場景
    // 的生成名單拿掉（登記表項目還留著,?diveDebug 看得到,見 models.ts
    // reefClown 的註解),數量分給剩下三種。使用者要求 0~20m 要「數量夠多」
    // （桌機 18~24 條、混合種類）——桌機三種各 7 條＝21 條,手機三種各 4
    // 條＝12 條。
    const REEF_KINDS: ModelName[] = ["reefTang", "reefMoorish", "reefYellow"];
    const reefCountPerKind = this.mobile ? 4 : 7;
    for (const kind of REEF_KINDS) {
      const reef = this.spawnInRange(kind, "straight", REEF_RANGE, reefCountPerKind, [-10, -4]);
      for (const c of reef) {
        c.glideSpeed = 0.35 + Math.random() * 0.25;
      }
    }

    // 鯖魚是一大群同一個模型的實例，代表「一群魚」而不是各自獨立的魚——
    // 整群共用同一個方向／速度／X 座標（見 this.groupX，用 kind 當 key)、
    // 同一個群體 Y 座標（見 update() 裡的 recycleGroupY），個體只在隊形裡
    // 有一個固定的小偏移。回饋：魚群要「明顯變大」，桌機 25~40 條、手機
    // 減半，車道拉近到 -1~-8。
    const mackerelCount = this.mobile ? 16 : 32;
    const mackerel = this.spawnInRange("mackerel", "school", SCHOOL_RANGE, mackerelCount, [-8, -1]);
    const mackerelDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const mackerelSpeed = 0.5 + Math.random() * 0.2;
    this.groupX.set("mackerel", { x: 0, dir: mackerelDir, speed: mackerelSpeed, initialized: false });
    for (const c of mackerel) {
      // spawnInRange 裡已經對每個實例各自算過一次朝向（用它暫時隨機分配
      // 的 dir）——鯖魚是群體,全部要共用同一個 mackerelDir,這裡覆寫 dir
      // 之後要重算一次朝向,不然朝向會停在剛剛那個被覆寫掉的隨機方向上。
      c.dir = mackerelDir; // 只給 setFixedTravelOrientation 算朝向用，位移本身讀 this.groupX
      this.setFixedTravelOrientation(c);
      // 隊形偏移：一個扁平、比畫面寬的橢圓分布,不是擠成一小球。
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      c.formationOffset.set(Math.cos(a) * r * 6, (Math.random() - 0.5) * 1.6, Math.sin(a) * r * 3);
    }

    // round 11 回饋：海龜在 35m+ 出現不寫實——改放到淺水 TURTLE_RANGE
    // （跟珊瑚礁魚同場，見該常數的說明），鎚頭鯊留在 DROP_RANGE（20~120m，
    // 真的鎚頭鯊活動深度）自己一種,數量補到桌機 3／手機 2 彌補海龜搬走。
    // laneWidth 用 spawnInRange 算好的預設值（依各自 laneZ 反推的可視寬度），
    // 不用再手動寫 26／30 這種固定數字。
    const turtle = this.spawnInRange("turtle", "straight", TURTLE_RANGE, this.mobile ? 1 : 2, [-8, -1]);
    for (const c of turtle) {
      // round 11：海龜是慢速滑行的生物,不是衝刺——降到 0.3~0.4。
      c.glideSpeed = 0.3 + Math.random() * 0.1;
    }
    const hammerhead = this.spawnInRange("hammerhead", "straight", DROP_RANGE, this.mobile ? 2 : 3, [-8, -1]);
    for (const c of hammerhead) {
      c.glideSpeed = 0.35 + Math.random() * 0.15;
    }
    // 深海兩種是使用者點名的主角，範圍限制在真正的深淵（見 ANGLER_RANGE／
    // JELLY_RANGE 的說明）,數量給足才會在整段深潛過程持續有東西經過。
    const angler = this.spawnInRange("anglerfish", "straight", ANGLER_RANGE, this.mobile ? 3 : 5, [-7, -1]);
    for (const c of angler) {
      // round 11：鮟鱇魚是伏擊型掠食者,真實行為是「幾乎不動、原地等」,
      // 不是巡游——glideSpeed 降到接近 0,只留一點漂移感。放慢不影響
      // round 7 修的「1000m 仍要看得到」：那個修法管的是 Y 軸（深度）的
      // 回收範圍,跟這裡的 X 軸車道速度是分開兩件事，游更慢反而在車道內
      // 停留更久、更容易被看到。
      c.glideSpeed = 0.05 + Math.random() * 0.03;
      // round 7 回饋：車道固定寬度（22）比牠靠近攝影機之後的實際可視寬度
      // 寬太多,大部分時間其實游在畫面外,這才是「500~1000m 幾乎是空的」
      // 的真正原因——改成用這隻鮟鱇魚自己的車道距離反推當下的可視寬度，
      // 車道窄到貼近可視範圍,離開畫面的時間自然大幅縮短。桌機另外限制在
      // 畫面右三分之二（laneCenterX 把車道中心往右推),不要大魚整隻疊在
      // 左側固定文字欄上面（見 globals.css 的文字欄斷點）；窄螢幕文字退回
      // 置中,不需要讓牠閃開,直接用滿版寬度。這裡覆寫 spawnInRange 給的
      // 預設 laneWidth,因為鮟鱇魚需要「2/3 寬度＋往右偏」這個特殊規則。
      const distance = 6 - c.laneZ;
      const visW = this.visibleWidthAt(distance);
      if (this.narrowLayout) {
        c.laneWidth = visW + 2;
        c.laneCenterX = 0;
      } else {
        c.laneWidth = (visW * 2) / 3 + 2;
        c.laneCenterX = visW / 6;
      }
    }
    // 水母沒有明確的前進方向，維持原地垂直漂浮＋小幅度搖擺（drift，見
    // updateCreatures 的說明——round 8 拿掉了舊版的環繞路徑)。
    const jellyCount = this.mobile ? 7 : 13;
    const jelly = this.spawnInRange("jellyfish", "drift", JELLY_RANGE, jellyCount, [-7, -1]);
    for (const c of jelly) {
      c.radius = 0.6 + Math.random() * 0.8;
      c.speed = 0.3 + Math.random() * 0.3;
    }
  }

  // ---- 氣泡：round 4 拿掉方形/圓點的懸浮微粒，全部換成半透明氣泡 sprite ----

  /** 在 canvas 上畫一顆有亮邊、中心偏透明的氣泡貼圖,只需要畫一次,所有氣泡
      共用同一張材質。 */
  private buildBubbleTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    const body = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    body.addColorStop(0, "rgba(210,240,255,0.05)");
    body.addColorStop(0.6, "rgba(210,240,255,0.1)");
    body.addColorStop(0.82, "rgba(225,247,255,0.42)");
    body.addColorStop(0.94, "rgba(255,255,255,0.7)");
    body.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 左上角一小塊高光，模擬氣泡表面反光。
    const highlight = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.34, 0, cx - r * 0.32, cy - r * 0.34, r * 0.28);
    highlight.addColorStop(0, "rgba(255,255,255,0.85)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private makeBubbleSprite(size: number): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      map: this.bubbleTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    return sprite;
  }

  private buildBubbles() {
    // 環境氣泡：稀疏地灑在攝影機附近的水柱裡，持續往上飄，飄出視野頂端就
    // 從底部一個新的隨機位置回收重生——跟舊版懸浮微粒的資源回收邏輯一樣，
    // 只是外觀跟物理（一定往上、不受捲動方向影響）換了。
    const ambientCount = this.mobile ? 26 : 48;
    for (let i = 0; i < ambientCount; i++) {
      const size = 0.06 + Math.random() * 0.14;
      const sprite = this.makeBubbleSprite(size);
      sprite.position.set((Math.random() - 0.5) * 16, Math.random() * 40 - 20, -(1 + Math.random() * 14));
      this.scene.add(sprite);
      this.ambientBubbles.push({
        sprite,
        vx: 0,
        vy: 0.25 + Math.random() * 0.35,
        wobbleFreq: 0.6 + Math.random() * 0.8,
        wobblePhase: Math.random() * Math.PI * 2,
        isBurst: false,
        life: 0,
        active: true,
      });
    }

    // 吐氣氣泡池：潛水員規律「噴氣」時借用的一批小氣泡，噴完、飄出生命
    // 週期就收回（縮到 0、標記 active=false），下次噴氣重新取用,不必每次
    // 噴氣都新建 Sprite。
    const burstPoolSize = this.mobile ? 16 : 28;
    for (let i = 0; i < burstPoolSize; i++) {
      const sprite = this.makeBubbleSprite(0.05);
      sprite.visible = false;
      this.scene.add(sprite);
      this.burstPool.push({
        sprite,
        vx: 0,
        vy: 0,
        wobbleFreq: 1 + Math.random(),
        wobblePhase: Math.random() * Math.PI * 2,
        isBurst: true,
        life: 0,
        active: false,
      });
    }
  }

  private spawnBubbleBurst(originX: number, originY: number, originZ: number) {
    const n = 4 + Math.floor(Math.random() * 4);
    let spawned = 0;
    for (const b of this.burstPool) {
      if (b.active) continue;
      b.active = true;
      b.sprite.visible = true;
      const size = 0.04 + Math.random() * 0.07;
      b.sprite.scale.setScalar(size);
      b.sprite.position.set(originX + (Math.random() - 0.5) * 0.15, originY, originZ + (Math.random() - 0.5) * 0.15);
      b.vx = (Math.random() - 0.5) * 0.3;
      b.vy = 0.6 + Math.random() * 0.5;
      b.life = 1.6 + Math.random() * 1.2;
      (b.sprite.material as THREE.SpriteMaterial).opacity = 0.85;
      spawned += 1;
      if (spawned >= n) break;
    }
  }

  // ---- 每幀更新 ----

  private handleResize = () => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.mobile = isMobileSpec();
    this.narrowLayout = isNarrowLayout();
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    if (!this.flashPointerNdc) this.flashPointerNdc = new THREE.Vector2();
    this.flashPointerNdc.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
  };

  /** 潛水員頭部的世界座標（手電筒光源與吐氣氣泡共用）。真模型：讀 head 骨頭
      （diver.glb 的 "head_016"，排除 head_End 這類末端骨）；沒有骨頭
      （placeholder）時，從 root 原點沿「潛水員自己的頭頂方向」（local +Y 套用
      目前 root 旋轉，俯衝／仰角都會跟著變）偏移約半個身長。 */
  private getDiverHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    const diver = this.diver;
    if (!diver) return out.set(0, 0, 0);
    diver.root.updateMatrixWorld(true);
    if (!this.diverHeadBone) {
      diver.root.traverse((o) => {
        if (!this.diverHeadBone && (o as THREE.Bone).isBone && /^head/i.test(o.name) && !/end/i.test(o.name)) {
          this.diverHeadBone = o;
        }
      });
    }
    if (this.diverHeadBone) return this.diverHeadBone.getWorldPosition(out);
    out.set(0, 0.4, 0).applyQuaternion(diver.root.quaternion);
    return out.add(diver.root.position);
  }

  /** 手電筒：位置跟著潛水員（略往鏡頭、往上偏，避免光源陷在模型裡），強度隨
      darkness 淡入，目標點平滑追游標（或無游標時的緩慢掃動）。 */
  private updateFlashlight(t: number, dt: number, darkness: number, diverX: number, diverY: number, diverZ: number) {
    const k = THREE.MathUtils.clamp((darkness - FLASH_DARK_START) / (FLASH_DARK_END - FLASH_DARK_START), 0, 1);
    this.flashLight.intensity = FLASH_MAX_INTENSITY * k * k * (3 - 2 * k);
    this.flashLight.visible = k > 0.001;
    if (!this.flashLight.visible) return;
    // 光源在頭部（骨頭世界座標），再朝目前瞄準點方向前推一小段，像頭燈、
    // 避免陷在頭部網格裡。光源與 target 都是 scene 的直接子物件，沒有父層
    // 變換，不會重複套用。
    const head = this.getDiverHeadWorld(this.headTmp);
    this.flashLight.position.copy(head);
    const fwd = this.flashTmp.copy(this.flashAim).sub(head);
    if (fwd.lengthSq() > 1e-6) this.flashLight.position.addScaledVector(fwd.normalize(), 0.15);

    const goal = this.flashTmp;
    if (this.flashPointerNdc) {
      this.flashRay.setFromCamera(this.flashPointerNdc, this.camera);
      const r = this.flashRay.ray;
      const s = r.direction.z !== 0 ? (FLASH_PLANE_Z - r.origin.z) / r.direction.z : 0;
      goal.copy(r.origin).addScaledVector(r.direction, Math.max(0, s));
    } else {
      // 無游標：朝前（-z）偏下，左右慢慢掃動。
      goal.set(diverX + Math.sin(t * 0.35) * 3, diverY - 2.5 + Math.sin(t * 0.23) * 0.8, FLASH_PLANE_Z);
    }
    this.flashAim.lerp(goal, 1 - Math.exp(-dt / FLASH_AIM_TAU));
    this.flashLight.target.position.copy(this.flashAim);
  }

  start() {
    const tick = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(tick);
      if (document.hidden) return; // 分頁不可見時整支迴圈暫停，省電也避免背景掉幀累積
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * 算潛水員在畫面上該出現的世界座標，讓他「看起來」落在螢幕高度的某個比例
   * （0＝頂端，1＝底部）。作法：已知攝影機的垂直視角與潛水員到攝影機的固定
   * 距離，直接反推「要讓一個東西出現在畫面某個高度，它的世界 Y 要偏移攝影機
   * 幾個單位」，而不是去動攝影機的俯仰角——固定攝影機朝向、只挪動潛水員的
   * 世界位置，數學是精確的，不會因為攝影機大幅落後潛水員的真實深度而算出
   * 離譜的角度。
   */
  private diverWorldYForFraction(frac: number, distanceFromCamera: number): number {
    const visibleHeightAtDistance = this.visibleHeightAt(distanceFromCamera);
    // frac 0.5＝畫面正中央＝跟攝影機同高；frac 越小（越靠頂端）潛水員的世界
    // Y 要越高於攝影機，所以是減去 (frac-0.5)。
    return this.cameraY - (frac - 0.5) * visibleHeightAtDistance;
  }

  /** 給定距離攝影機的深度，回傳當下視野在該深度的可視寬度（世界單位）——
      拿來讓生物的活動範圍「撐滿整個畫面寬度」，而不是一個跟螢幕比例無關、
      憑感覺給的固定半徑。 */
  private visibleWidthAt(distance: number): number {
    return this.visibleHeightAt(distance) * this.camera.aspect;
  }

  /** 給定距離攝影機的深度，回傳當下視野在該距離的可視高度（世界單位）——
      round 5 拿來讓生物「一直待在攝影機視野附近」（見 recyclePosY／
      recycleGroupY），不是只給潛水員用。 */
  private visibleHeightAt(distance: number): number {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    return 2 * distance * Math.tan(vFov / 2);
  }

  /** 用「移動方向」算出朝向，再疊加模型自己的朝向修正角，最後用 slerp 平滑
      地轉過去——這是「魚要面向牠前進的方向」的核心：不是套用某個固定公式
      算旋轉角度，是先算出速度向量，再拿速度向量當 lookAt 的目標。 */
  private orientToVelocity(c: Creature, velocity: THREE.Vector3, dt: number, tau: number) {
    if (velocity.lengthSq() < 1e-8) return;
    const dir = velocity.clone().normalize();
    const lookTarget = c.root.position.clone().add(dir);
    // round 5 抓到的 bug：Matrix4.lookAt(eye, target, up) 是「攝影機慣例」——
    // 讓 -Z 指向 target，這是給攝影機用的（攝影機看向哪裡，-Z 就對著哪裡）。
    // 但 glTF 模型的正面通常是 +Z，如果用攝影機慣例算朝向，魚會面朝移動方向
    // 的「反方向」，變成倒退游。THREE.Object3D.prototype.lookAt() 對非攝影機
    // /光源物件內部其實是把參數對調呼叫 _m1.lookAt(target, this.position, up)
    // ——第一個參數當「眼睛」、第二個當「目標」對調，讓 +Z 指向 target。這裡
    // 手動照同一個對調方式呼叫，不能直接抄攝影機的寫法。
    const m = new THREE.Matrix4().lookAt(lookTarget, c.root.position, UP);
    c.quatTarget.setFromRotationMatrix(m);
    const yaw = MODEL_REGISTRY[c.kind].travelYaw;
    if (yaw !== 0) c.quatTarget.multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    const alpha = 1 - Math.exp(-dt / tau);
    c.root.quaternion.slerp(c.quatTarget, alpha);
  }

  /**
   * round 8：直線移動的生物，方向從建立那一刻就固定不變（見 spawnInRange
   * 怎麼指定 c.dir），朝向不需要每幀 slerp 追一個會變動的目標——跟
   * orientToVelocity() 算的是同一個數學式（Matrix4.lookAt(eye,target,up)
   * 對調參數讓 +Z 指向移動方向，疊加 MODEL_REGISTRY 的 travelYaw），只是
   * 直接 .copy() 瞬間鎖定、不走 slerp。這個「跟 orientToVelocity 同一套
   * 慣例」是使用者明確要求的——鯖魚／鎚頭鯊／海龜已經用 travelYaw=0 校正
   * 好、鮟鱇魚用 Math.PI 校正好,沿用同一個公式才不會讓這些校正全部作廢。
   * 呼叫時機：只在 c.dir 第一次決定、或（理論上)之後若真的改變方向時
   * 呼叫一次即可，不需要放進每幀的 update 迴圈。
   */
  private setFixedTravelOrientation(c: Creature) {
    const lookTarget = new THREE.Vector3(c.dir, 0, 0);
    const m = new THREE.Matrix4().lookAt(lookTarget, new THREE.Vector3(0, 0, 0), UP);
    c.quatTarget.setFromRotationMatrix(m);
    const yaw = MODEL_REGISTRY[c.kind].travelYaw;
    if (yaw !== 0) c.quatTarget.multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    c.root.quaternion.copy(c.quatTarget);
  }

  /** 用目前深度對應的上／下兩色重畫 this.bgCanvas,並標記 bgTexture 需要
      重新上傳——scene.background 讀的就是這張 texture,每幀呼叫這個方法
      等於「重畫一次漸層背景」。畫布只有 2x256,重畫成本很低,不需要為了
      省這個把顏色變化節流。 */
  private paintBackgroundGradient(top: THREE.Color, bottom: THREE.Color) {
    const h = this.bgCanvas.height;
    const grad = this.bgCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${bottom.getHexString()}`);
    this.bgCtx.fillStyle = grad;
    this.bgCtx.fillRect(0, 0, this.bgCanvas.width, h);
    this.bgTexture.needsUpdate = true;
  }

  private update(dt: number) {
    if (this.debugKind === "all") {
      this.updateDebugAllScene(dt);
      return;
    }
    if (this.debugKind) {
      this.updateDebugScene(dt);
      return;
    }
    const now = performance.now();
    const t = (now - this.clockStart) / 1000;
    const progress = diveState.progress;
    const velocity = diveState.velocity;
    const depthM = depthAt(progress);
    // 環境的暗化程度跟捲動進度走，不是跟公尺數走——見 depth.ts 的 environmentDarkness()
    // 註解：MAX_DEPTH_M 是 1000，公尺數直接換算的話 0～40m 幾乎不會變暗。
    const depthFrac = environmentDarkness(progress);

    // ---- 攝影機：直接等於真實深度，只做極短的數值平滑（見欄位宣告處說明） ----
    const trueDiverY = depthToWorldY(depthM);
    const CAMERA_SMOOTH_TAU = 0.12;
    const camLerpAlpha = 1 - Math.exp(-dt / CAMERA_SMOOTH_TAU);
    this.cameraY += (trueDiverY - this.cameraY) * camLerpAlpha;
    this.cameraX = Math.sin(t * 0.05) * 0.15;

    this.camera.position.set(this.cameraX, this.cameraY, 6);
    // 攝影機朝向固定（水平略帶一點點下傾），不隨深度或潛水員位置擺動——
    // 潛水員在畫面上的高度完全由下面的 diverWorldYForFraction() 決定，兩件
    // 事分開算，攝影機的姿態只負責「看起來平穩」。
    this.camera.lookAt(this.cameraX, this.cameraY - 0.15, -6);

    // ---- 潛水員的螢幕位置：progress 0 時貼近頂端（但整個人都在畫面內），
    // progress 1 時貼近底部 ----
    const SCREEN_FRAC_TOP = 0.3;
    const SCREEN_FRAC_BOTTOM = 0.78;
    const DIVER_DISTANCE = 5;
    const frac = lerp(SCREEN_FRAC_TOP, SCREEN_FRAC_BOTTOM, smoothstep(progress));
    const diverY = this.diverWorldYForFraction(frac, DIVER_DISTANCE);

    // ---- 潛水員的水平位置：>=1024px（跟 globals.css 的文字左欄斷點對齊）
    // 偏到畫面右側，窄螢幕置中（那時候文字也退回置中，見 globals.css）。
    const SCREEN_FRAC_X = this.narrowLayout ? 0.5 : 0.71;
    const visibleWidthAtDiver = this.visibleWidthAt(DIVER_DISTANCE);
    const diverX = this.cameraX + (SCREEN_FRAC_X - 0.5) * visibleWidthAtDiver;

    // ---- 潛水員的朝向：跟著捲動方向平滑翻轉,不是瞬間打頭 ----
    const facingTarget = diveState.direction < 0 ? 1 : 0;
    const FACING_TAU = 0.5;
    this.facing += (facingTarget - this.facing) * (1 - Math.exp(-dt / FACING_TAU));

    if (this.diver) {
      this.diver.root.position.set(diverX, diverY, 6 - DIVER_DISTANCE);
      // 俯衝角（下潛）跟仰角（上浮）之間用 this.facing 內插，中間值就是接近
      // 水平的過渡姿態——「轉身」本身也要是連續的動作，不是兩個姿態互相切換。
      const pitch = lerp(-0.55, 0.5, this.facing);
      this.diver.root.rotation.set(
        pitch + Math.sin(t * 0.4) * 0.03,
        Math.PI + Math.sin(t * 0.15) * 0.05,
        Math.sin(t * 0.3) * 0.04,
      );
      const swimSpeed = 1 + velocity * 3.5; // 捲動越快，游得越用力
      if (this.diver.mixer) this.diver.mixer.update(dt * swimSpeed);
      else this.animatePlaceholderLimbs(this.diver, t, swimSpeed);

      // 潛水員規律吐氣：每隔一段時間在頭部位置噴一小串氣泡。時間間隔本身
      // 也隨機（1.4~2.6 秒），不然固定週期看久了會很假。
      this.nextBurstAt -= dt;
      if (this.nextBurstAt <= 0) {
        this.nextBurstAt = 1.4 + Math.random() * 1.2;
        // 與手電筒共用 getDiverHeadWorld()：真模型讀頭部骨頭，placeholder 則
        // 沿潛水員自己的頭頂方向偏移，兩者位置一致。
        const head = this.getDiverHeadWorld(this.headTmp);
        this.spawnBubbleBurst(head.x, head.y, head.z + 0.1);
      }
    }

    // round 10：鏡頭目前的垂直移動速度（世界單位/秒）——用「這一幀的真實
    // 深度」跟「上一幀」的差,不是用 velocity（捲動快慢,單位不一樣,也不是
    // 直接對應世界座標的移動量）。dt 接近 0（例如分頁剛恢復可見）時跳過,
    // 避免除以極小值暴衝出一個虛假的高速度。
    const cameraSpeed = dt > 1e-4 ? Math.abs(trueDiverY - this.lastRefY) / dt : 0;
    this.lastRefY = trueDiverY;

    this.updateCreatures(t, dt, progress, depthFrac, trueDiverY, cameraSpeed);
    this.updateBubbles(t, dt);

    // ---- 環境：背景漸層／濃霧／燈光是深度（公尺數,不是 progress）的連續
    // 函數,沒有任何依章節而跳動的階梯——round 9：背景從「單一顏色隨
    // depthFrac 插值」換成「DEPTH_GRADIENT_STOPS 這份陽光藍色票,用真實
    // 深度公尺數內插」,理由見 sampleDepthGradient() 的說明。 ----
    const { top: gradTop, bottom: gradBottom } = sampleDepthGradient(depthM);
    this.paintBackgroundGradient(gradTop, gradBottom);
    // 霧色＝漸層的「中間色」（上下兩色各半）——跟使用者的要求對齊，也讓
    // 遠方被霧吞掉的生物跟背景融合得自然,不會看起來像兩種不同的顏色系統。
    // gradTop/gradBottom 跟這裡的 gradMid 是同一次 sampleDepthGradient()
    // 呼叫算出來的同一組 THREE.Color——背景（paintBackgroundGradient）
    // 跟濃霧（這裡）走的是同一份色彩管理機制（THREE.ColorManagement，
    // 跟 ambient/hemi 用的是同一套),不是分別手刻兩套色彩轉換,不會出現
    // 「霧跟背景數字一樣、畫面上看起來卻是兩種顏色」的落差。
    const gradMid = gradTop.clone().lerp(gradBottom, 0.5);
    this.scene.fog!.color.copy(gradMid);
    (this.scene.fog as THREE.Fog).near = 2;
    // round 5 抓到的 bug：這裡原本讓 far 隨深度一路縮到 8 左右，但生物的 Z
    // 車道（laneZ）散在攝影機前方 3～16 個單位（距離攝影機 9～22 個單位），
    // far=8 等於把牠們整批霧到跟背景融在一起,深海生物「看不到」的另一個
    // 根因（不只是密度不夠，霧本身就先把牠們蓋掉了）。far 現在固定留在
    // 生物最遠車道距離（22）之上還有餘裕，「越深越暗」完全交給背景色跟
    // 平光的強度負責，霧只用來讓遠處的東西融入背景,不是拿來當暗化的手段。
    (this.scene.fog as THREE.Fog).far = 34;

    // 平光的強度／顏色留一個下限，不隨深度歸零——沒有頭燈或補光點光源頂替
    // 之後，這是潛水員跟生物在深海章節還能被看見的唯一原因。round 9：
    // 淺水上限從 0.9/0.8 提高到 1.0/1.2（使用者要求「亮一點,魚的顏色要
    // 跳出來」),深海那端的下限（0.4／0.32）完全沒動——「保留既有的深海
    // 地板／輪廓光／發光邏輯」。
    this.ambient.intensity = Math.max(0.4, 1.0 - depthFrac * 0.6);
    this.hemi.intensity = Math.max(0.32, 1.2 - depthFrac * 0.88);
    // 天空色改用「暖白偏青」當淺水基準（使用者原話：warm-white cyan），
    // 隨 depthFrac 往深海的漸層中間色過渡,不是固定不變。
    this.hemi.color.set(0xeafffb).lerp(gradMid, depthFrac);
    this.hemi.groundColor.copy(gradMid).multiplyScalar(0.4);

    // round 9：0~20m 的「陽光從上方灑下來」——柔和方向光,強度在真實深度
    // 40m 時正好歸零（不是跟著 depthFrac／progress 走,因為這個效果的
    // 要求是「公尺數」：40m 以下就應該完全沒有,跟 environmentDarkness()
    // 的章節節奏是兩件事）。target 固定對準攝影機正下方一點,方向感不隨
    // cameraX 的左右搖晃劇烈改變。
    this.sunLight.intensity = Math.max(0, 1 - depthM / 40);
    this.sunLight.position.set(this.cameraX, this.cameraY + 20, 10);
    this.sunLight.target.position.set(this.cameraX, this.cameraY - 4, 0);
    this.updateFlashlight(t, dt, depthFrac, diverX, diverY, 6 - DIVER_DISTANCE);

    // ---- 潛水員材質：fresnel 輪廓光的強度隨深度增強（回饋：progress≈1／
    // 深度 1000m 時潛水員幾乎融進近黑背景；round 6 用「整片材質固定 emissive」
    // 做這件事會讓他變成一塊扁平純色剪影,看起來很假,改成只在貼著輪廓邊緣
    // 的地方疊一點冷色光,中間的面照舊正常 PBR 光照——見 placeholders.ts 的
    // addDiverRimShader()）。只調整材質的 uniform,不新增任何燈光／光束／
    // 光暈——使用者明確拒絕過那類方案（見檔案頂端 round 2 的說明）。淺水段
    // depthFrac≈0 時強度是 0,完全沒有這個效果;只有深海段才慢慢浮現。 ----
    if (this.diverMaterials.length) {
      const rimStrength = depthFrac * DIVER_RIM_MAX_STRENGTH;
      for (const m of this.diverMaterials) {
        const uniforms = m.userData.rimUniforms as { uRimStrength: { value: number } } | undefined;
        if (uniforms) uniforms.uRimStrength.value = rimStrength;
      }
    }
  }

  // 「游回視野」的速度範圍（世界單位/秒）——round 10 回饋：1000m 捲到底時
  // 深海生物被 wrap 到視野外緣之後,靠原本 0.5~0.8 的游回速度要等 5~10
  // 秒才會真的進到畫面裡,使用者會先看到好幾秒的空畫面。提高到 2.5~3，
  // 配合 easeTowards() 的減速——速度上限變快，但接近終點那一小段還是會
  // 自然放慢，不是定速衝到底才瞬間停下。
  private static readonly SWIM_BACK_SPEED_MIN = 2.5;
  private static readonly SWIM_BACK_SPEED_RANGE = 0.5;
  // 「游回視野」最後這一段開始減速的距離——比這個距離更近時，速度跟
  // 剩餘距離成比例地往下降，不是維持 SWIM_BACK_SPEED_* 定速衝到終點。
  private static readonly SWIM_BACK_EASE_DISTANCE = 1.2;

  /** 朝 target 移動一步：離 target 還遠（超過 SWIM_BACK_EASE_DISTANCE）時
      用 maxSpeed 定速前進，進入這段距離之後速度跟剩餘距離線性遞減——這是
      「eased so it slows near the target」的實作，不是算完直接 snap，也
      不是维持定速衝到終點才瞬間停下。回傳新位置跟「這一步有沒有直接到達
      終點」。 */
  private easeTowards(current: number, target: number, maxSpeed: number, dt: number): { value: number; done: boolean } {
    const delta = target - current;
    const dist = Math.abs(delta);
    if (dist < 0.02) return { value: target, done: true };
    const eased = maxSpeed * Math.min(1, dist / DiveEngine.SWIM_BACK_EASE_DISTANCE);
    const speed = Math.max(eased, 0.05); // 避免剩一點點距離時速度趨近 0、卡住不動
    const maxStep = speed * dt;
    if (dist <= maxStep) return { value: target, done: true };
    return { value: current + Math.sign(delta) * maxStep, done: false };
  }

  /**
   * 維護單一生物的「螢幕內 Y 座標」：只要牠所屬的物種目前在捲動進度的活躍
   * 區間內，就讓它一直待在攝影機視野附近——離開視野頂端或底端（超出
   * viewHalf+margin）就從另一邊送回來；不在活躍區間內就直接隱藏、重置
   * 「已初始化」旗標,下次進到區間會重新在視野內隨機一個位置出現（不是從
   * 上次離開的地方接著跑，那樣會讓生物「憑空出現在奇怪的地方」）。
   *
   * refY 要傳「真實深度」（update() 裡的 trueDiverY），不能傳 this.cameraY——
   * this.cameraY 是有 0.12s 平滑的落後值,在接近 progress=1.0 的最後一小段
   * （depth.ts 的三次方墜落曲線讓深度在這裡暴衝）平滑會落後真實深度一大段。
   * ANGLER_RANGE／JELLY_RANGE 的上緣剛好卡在 1.0,使用者捲到底停住的那一刻
   * 剛好就是這個落後最大的時候——如果拿 this.cameraY 當回收基準,生物會被
   * 回收到「鏡頭還沒追到」的位置,使用者停在底部時畫面就會是空的,要等
   * cameraY 自己追上才會補回來(攝影機本身看起來是對的,只是生物沒跟著
   * 真實深度走)。用 trueDiverY 當基準就不會有這個落後。
   *
   * 修過 refY 之後還是會空：wrap 把離開視野的生物送到「視野外緣再過去
   * margin*0.5」的地方（refY ± (viewHalf+margin*0.5)），本意是等鏡頭繼續
   * 往那個方向移動時剛好把牠帶進畫面——這段「視野外緣到真的回到視野內」
   * 的距離，原本完全只靠鏡頭自己的移動補上。捲到底最後一小段是整趟下潛
   * 最快的一段（depth.ts 的三次方曲線），幾乎所有深海生物這時都剛被 wrap
   * 到視野外，鏡頭卻在這個瞬間停住——生物自己只有 sin 擺動（±0.6~0.8），
   * 擺不回視野內，畫面就一直空著。所以這裡加一段「游回視野」：只要生物
   * 人在視野外、又還沒遠到會被 wrap（也就是卡在 viewHalf 到
   * viewHalf+margin 這一小段），就不等鏡頭，自己用 SWIM_BACK_SPEED_*
   * 朝視野內側 70% 範圍裡隨機挑的一點慢慢游過去；鏡頭持續移動、速度比游速
   * 快的時候，wrap 的判斷式先觸發，行為跟原本一樣不會變。
   *
   * round 10 補充：上面這段「鏡頭速度比游速快」的假設在 1000m 捲到底時
   * 不成立——那一刻使用者剛好停手，鏡頭速度趨近 0，但 wrap 仍然把生物
   * 送到「視野外緣再過去 margin*0.5」，等於每次都要再等一次遊回視野的
   * 時間。cameraSpeed 是這一幀量出來的鏡頭垂直移動速度（見 update()
   * 怎麼算)：鏡頭比生物自己的游回速度還慢時，wrap 直接把生物空降到視野
   * 內側 70% 範圍（跟 !initialized 那段用同一個公式），不走「外緣→游
   * 回來」這兩步；鏡頭還在快速移動時維持原本的 wrap 行為，讓鏡頭自己的
   * 移動把生物帶進畫面，不會「还没靠近就被強制塞進畫面」。 */
  private recyclePosY(
    c: Creature,
    active: boolean,
    viewHalf: number,
    margin: number,
    refY: number,
    dt: number,
    cameraSpeed: number,
  ) {
    if (!active) {
      c.initialized = false;
      c.swimBackActive = false;
      c.root.visible = false;
      return;
    }
    c.root.visible = true;
    if (!c.initialized) {
      // 第一次進入活躍區間：直接出現在視野內隨機一點，不用等牠「游進來」，
      // 不然剛進區間的前幾秒畫面會是空的。
      c.posY = refY + (Math.random() * 2 - 1) * viewHalf * 0.7;
      c.initialized = true;
      c.swimBackActive = false;
      return;
    }
    if (c.posY > refY + viewHalf + margin || c.posY < refY - viewHalf - margin) {
      if (cameraSpeed < DiveEngine.SWIM_BACK_SPEED_MIN) {
        c.posY = refY + (Math.random() * 2 - 1) * viewHalf * 0.7;
      } else {
        c.posY = c.posY > refY ? refY - viewHalf - margin * 0.5 : refY + viewHalf + margin * 0.5;
      }
      c.swimBackActive = false;
      return;
    }
    if (c.posY > refY + viewHalf || c.posY < refY - viewHalf) {
      if (!c.swimBackActive) {
        c.swimTargetY = refY + (Math.random() * 2 - 1) * viewHalf * 0.7;
        c.swimBackSpeed = DiveEngine.SWIM_BACK_SPEED_MIN + Math.random() * DiveEngine.SWIM_BACK_SPEED_RANGE;
        c.swimBackActive = true;
      }
      const result = this.easeTowards(c.posY, c.swimTargetY, c.swimBackSpeed, dt);
      c.posY = result.value;
      if (result.done) c.swimBackActive = false;
    } else {
      c.swimBackActive = false;
    }
  }

  /** 跟 recyclePosY 邏輯一樣（含游回視野那段），但整個物種（例如鯖魚）
      共用一個 Y——群體要一起消失、一起在視野內重新出現，不是每條魚各自
      隨機跳位置。refY 的理由同 recyclePosY——要用真實深度，不能用落後的
      this.cameraY。 */
  private recycleGroupY(
    kind: ModelName,
    active: boolean,
    viewHalf: number,
    margin: number,
    refY: number,
    dt: number,
    cameraSpeed: number,
  ): number {
    let g = this.groupY.get(kind);
    if (!g) {
      g = {
        y: refY,
        initialized: false,
        swimBackActive: false,
        swimTargetY: refY,
        swimBackSpeed: DiveEngine.SWIM_BACK_SPEED_MIN,
      };
      this.groupY.set(kind, g);
    }
    if (!active) {
      g.initialized = false;
      g.swimBackActive = false;
      return g.y;
    }
    if (!g.initialized) {
      g.y = refY + (Math.random() * 2 - 1) * viewHalf * 0.5;
      g.initialized = true;
      g.swimBackActive = false;
      return g.y;
    }
    if (g.y > refY + viewHalf + margin || g.y < refY - viewHalf - margin) {
      // round 10：跟 recyclePosY 同一個理由——鏡頭太慢／停住時不要走
      // 「外緣→游回來」兩步,直接空降到視野內側（這裡用 0.5,跟
      // !initialized 那段用同一個比例，群體本來就用比個體窄一點的範圍）。
      if (cameraSpeed < DiveEngine.SWIM_BACK_SPEED_MIN) {
        g.y = refY + (Math.random() * 2 - 1) * viewHalf * 0.5;
      } else {
        g.y = g.y > refY ? refY - viewHalf - margin * 0.5 : refY + viewHalf + margin * 0.5;
      }
      g.swimBackActive = false;
      return g.y;
    }
    if (g.y > refY + viewHalf || g.y < refY - viewHalf) {
      if (!g.swimBackActive) {
        g.swimTargetY = refY + (Math.random() * 2 - 1) * viewHalf * 0.5;
        g.swimBackSpeed = DiveEngine.SWIM_BACK_SPEED_MIN + Math.random() * DiveEngine.SWIM_BACK_SPEED_RANGE;
        g.swimBackActive = true;
      }
      const result = this.easeTowards(g.y, g.swimTargetY, g.swimBackSpeed, dt);
      g.y = result.value;
      if (result.done) g.swimBackActive = false;
    } else {
      g.swimBackActive = false;
    }
    return g.y;
  }

  /** 除錯模式的每幀更新：固定攝影機、固定亮度，一隻生物在畫面中央慢慢
      左右擺盪（sin 波,不是真的單向 wrap,因為除錯只需要看清楚朝向,不需要
      重現正式場景的行進方式）。方向反轉的瞬間（sin 波峰/谷）朝向會跟著
      平滑轉過去，剛好也順便測到 orientToVelocity() 對速度方向變化的反應。 */
  private updateDebugScene(dt: number) {
    const now = performance.now();
    const t = (now - this.clockStart) / 1000;
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, 0, 0);
    this.ambient.intensity = 1.1;
    this.hemi.intensity = 1.1;
    this.hemi.color.set(0xffffff);
    this.hemi.groundColor.set(0x335566);
    this.scene.background = new THREE.Color(0x0c2331);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).far = 60;

    const c = this.creatures[0];
    if (!c) return;
    const speed = 0.05;
    const amp = 2.2;
    const x = Math.sin(t * speed) * amp;
    c.root.position.set(x, 0, 0);
    const vx = Math.cos(t * speed) * speed * amp;
    const vel = new THREE.Vector3(vx, 0, 0);
    this.orientToVelocity(c, vel, dt, 0.15);
    if (c.mixer) c.mixer.update(dt);
    else this.animatePlaceholderLimbs(c, t, 1);
  }

  /** 除錯模式 `?diveDebug=all` 的每幀更新：七種生物一人一列，全部固定速度
      從左往右移動、出邊界從另一邊繞回來（不是 sin 波來回）——目的是讓開發
      者一次比較七種生物的朝向跟材質是否正確，所以用明亮平光＋中灰藍背景
      （不重現正式場景的深度氛圍），而且不套濃霧。 */
  private updateDebugAllScene(dt: number) {
    const now = performance.now();
    const t = (now - this.clockStart) / 1000;
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, 0, 0);
    this.ambient.intensity = 1.3;
    this.hemi.intensity = 1.1;
    this.hemi.color.set(0xffffff);
    this.hemi.groundColor.set(0x8fa6b5);
    this.scene.background = new THREE.Color(0x5b7486);

    const distance = 6; // 攝影機固定 z=6，生物固定 z=0（正規化尺寸的度量基準）
    // 車道寬度比可視寬度再寬一點，生物要完全離開畫面才從另一側繞回來，
    // 不會在畫面邊緣就看到瞬間跳位置。
    const laneWidth = this.visibleWidthAt(distance) + 2;
    const vel = new THREE.Vector3(DEBUG_ALL_SPEED, 0, 0);
    for (const c of this.creatures) {
      const raw = (t * DEBUG_ALL_SPEED + c.seed * 3) % laneWidth;
      const x = ((raw + laneWidth) % laneWidth) - laneWidth / 2;
      c.root.position.set(x, c.posY, 0);
      this.orientToVelocity(c, vel, dt, 0.25);
      if (c.mixer) c.mixer.update(dt);
      else this.animatePlaceholderLimbs(c, t, 1);
    }
  }

  /** school 群體（目前只有鯖魚）的水平車道半寬——群體共用一個代表深度
      （MACKEREL_Z），不是每個成員各自的 laneZ,所以算法跟 straight 分支
      的「每個實例自己的 laneZ」分開寫。 */
  private groupLaneHalfWidth(representativeZ: number): number {
    return this.visibleWidthAt(6 - representativeZ) / 2 + 2;
  }

  private updateCreatures(
    t: number,
    dt: number,
    progress: number,
    depthFrac: number,
    refY: number,
    cameraSpeed: number,
  ) {
    const RECYCLE_MARGIN = 2;

    // school 群體的水平位置只能整群推進一次——放在下面「每個成員」的
    // 迴圈裡會被同一群的 N 個成員各自推進一次,變成 N 倍速。這裡先掃一遍
    // this.groupX,每個 kind 只前進/換邊一次,下面主迴圈裡的 "school"
    // 分支只負責「讀」這個已經算好的群體座標。
    for (const [kind, g] of this.groupX) {
      const rep = this.creatures.find((c) => c.kind === kind);
      const active = !!rep && progress >= rep.bandMin && progress <= rep.bandMax;
      const half = this.groupLaneHalfWidth(MACKEREL_Z);
      if (!active) {
        g.initialized = false;
        continue;
      }
      if (!g.initialized) {
        g.x = (Math.random() * 2 - 1) * half;
        g.initialized = true;
      } else {
        g.x += g.dir * g.speed * dt;
        if (g.x > half) g.x -= half * 2;
        else if (g.x < -half) g.x += half * 2;
      }
    }

    for (const c of this.creatures) {
      const active = progress >= c.bandMin && progress <= c.bandMax;
      const distance = 6 - c.laneZ; // 攝影機固定在 z=6
      const viewHalf = this.visibleHeightAt(distance) / 2;

      switch (c.motion) {
        case "straight": {
          // round 8：水平直線穿越畫面，出邊界從另一邊進來，方向（c.dir）
          // 建立時就固定,朝向也早就鎖定好（見 setFixedTravelOrientation），
          // 這裡只管位移,不碰朝向。posX 是「沿車道的位置」,每幀用
          // dir*speed*dt 累加、超出車道半寬就從另一邊減回來——不是 sin
          // 擺動也不是 pseudoNoise 漂移,是真的直線位移。c.dir 全程不變,
          // 這是「絕不中途回頭」的不變量,下面疊加的速度波動／抬頭低頭都
          // 不碰它。
          this.recyclePosY(c, active, viewHalf, RECYCLE_MARGIN, refY, dt, cameraSpeed);
          if (!active) {
            c.xInitialized = false;
            break;
          }
          const half = c.laneWidth / 2;
          if (!c.xInitialized) {
            // 剛進入活躍區間：直接出現在車道內隨機一點，不用等牠「游進來」。
            c.posX = (Math.random() * 2 - 1) * half;
            c.xInitialized = true;
          }
          // round 12：變速依體型分兩種——小型礁魚「衝刺－滑行」（週期每隻
          // 2~5 秒、相位各自隨機），大型（海龜／鎚頭鯊／鮟鱇魚）只做緩慢小
          // 幅變速。方向 c.dir 與前進分量永遠 > 0，所以不可能倒退。
          const big = c.kind === "turtle" || c.kind === "hammerhead" || c.kind === "anglerfish";
          const speedMul = big
            ? 1 + SWIM_SLOW_AMP * Math.sin(t * c.speedFreqHz + c.phase)
            : 1 + SWIM_BURST_AMP * Math.sin(t * c.burstOmega + c.phase);
          const vx = c.glideSpeed * speedMul; // 前進速率（>0）
          c.posX += c.dir * vx * dt;
          if (c.posX > half) c.posX -= half * 2;
          else if (c.posX < -half) c.posX += half * 2;
          // 垂直起伏（±0.3）與 z 方向的緩慢漂移（振幅正比於速度）：兩者的
          // 解析導數就是速度向量的 y／z 分量，朝向追著這個向量走。
          const bobFreq = 0.6;
          const bobAmp = 0.3;
          const bob = Math.sin(t * bobFreq + c.phase) * bobAmp;
          const vy = Math.cos(t * bobFreq + c.phase) * bobAmp * bobFreq;
          const zAmp = c.glideSpeed * SWIM_Z_DRIFT_RATIO;
          const zOff = Math.sin(t * c.zFreq + c.phase * 1.7) * zAmp;
          const vz = Math.cos(t * c.zFreq + c.phase * 1.7) * zAmp * c.zFreq;
          c.root.position.set(c.posX + c.laneCenterX, c.posY + bob, c.laneZ + zOff);

          // 目標朝向 = 固定朝向（quatTarget，含 travelYaw）之上疊世界軸旋轉：
          //   偏航 δ（繞 Y）與俯仰 φ（繞 Z，乘 dir 讓左右游的魚抬頭方向一致）
          //   由實際速度向量 (vx, vy, vz) 算出並夾在上限內，roll（繞 X）
          //   依偏航角變化率傾斜。再以 SWIM_ORIENT_TAU 對目前朝向做 slerp。
          const yaw = THREE.MathUtils.clamp(Math.atan2(-c.dir * vz, vx), -SWIM_YAW_MAX_RAD, SWIM_YAW_MAX_RAD);
          const pitch = THREE.MathUtils.clamp(Math.atan2(vy, vx), -SWIM_PITCH_MAX_RAD, SWIM_PITCH_MAX_RAD);
          let bank = 0;
          if (dt > 1e-4) {
            bank = THREE.MathUtils.clamp(((yaw - c.prevYaw) / dt) * SWIM_BANK_GAIN * c.dir, -SWIM_BANK_MAX_RAD, SWIM_BANK_MAX_RAD);
          }
          c.prevYaw = yaw;
          this.pitchQuat.setFromAxisAngle(Z_AXIS, pitch * c.dir);
          this.yawQuat.setFromAxisAngle(UP, yaw);
          this.rollQuat.setFromAxisAngle(X_AXIS, bank);
          this.orientTarget.copy(this.yawQuat).multiply(this.pitchQuat).multiply(c.quatTarget);
          this.orientTarget.premultiply(this.rollQuat);
          // 海龜的烘焙動畫幾乎靜止，額外疊 roll 搖擺（±3°）。
          if (c.kind === "turtle") {
            this.wobbleQuat.setFromAxisAngle(X_AXIS, Math.sin(t * 0.25 + c.phase) * TURTLE_WOBBLE_RAD);
            this.orientTarget.premultiply(this.wobbleQuat);
          }
          c.root.quaternion.slerp(this.orientTarget, 1 - Math.exp(-dt / SWIM_ORIENT_TAU));
          // 尾鰭擺動速度跟著當下速度倍率走：衝刺時拍得快、滑行時慢。
          if (c.mixer) c.mixer.timeScale = THREE.MathUtils.clamp(speedMul, SWIM_TIMESCALE_MIN, SWIM_TIMESCALE_MAX);
          break;
        }
        case "school": {
          // 整群共用 this.groupX 算好的水平座標＋同一個群體 Y
          // （recycleGroupY），個體只疊一個固定的隊形偏移——隊形偏移本身
          // 不隨時間變化（跟 round 8 之前的差異：之前是整條共用路徑的中心
          // 點本身在用 pseudoNoise 漂移,現在中心點是真的直線位移）。
          const groupY = this.recycleGroupY(c.kind, active, viewHalf, RECYCLE_MARGIN, refY, dt, cameraSpeed);
          if (!active) {
            c.root.visible = false;
            break;
          }
          c.root.visible = true;
          const g = this.groupX.get(c.kind);
          const gx = g ? g.x : 0;
          const bob = Math.sin(t * 0.4 + c.phase) * 0.15;
          // round 12：隊形偏移加上各自相位的小幅漂移，成員不再同步移動。
          c.root.position.set(
            gx + c.formationOffset.x + Math.sin(t * 0.5 + c.phase) * 0.15,
            groupY + c.formationOffset.y + bob,
            MACKEREL_Z + c.formationOffset.z + Math.sin(t * 0.37 + c.phase * 1.3) * 0.1,
          );
          if (c.mixer) {
            const ts = c.scaleBase * (1 + SCHOOL_TIMESCALE_AMP * Math.sin(t * 0.9 + c.phase * 2.1));
            c.mixer.timeScale = THREE.MathUtils.clamp(ts, SWIM_TIMESCALE_MIN, SWIM_TIMESCALE_MAX);
          }
          break;
        }
        case "drift":
        default: {
          // 水母：沒有前進方向,原地垂直漂浮（bob）＋一點輕微左右搖擺
          // （sway)——不再繞圈（cos/sin 畫圓本身就是使用者說的「horizontal
          // circling」）。radius／speed 兩個欄位沿用舊名稱,意義變成
          // 「搖擺幅度基準」跟「脈動角速度」,不是繞圈半徑／角速度。
          this.recyclePosY(c, active, viewHalf, RECYCLE_MARGIN, refY, dt, cameraSpeed);
          if (!active) break;
          const sway = Math.sin(t * c.speed * 0.3 + c.phase) * (c.radius * 0.4);
          const bob = Math.sin(t * c.speed + c.phase) * 0.6;
          c.root.position.set(sway, c.posY + bob, c.laneZ);
          c.root.rotation.y = Math.sin(t * 0.15 + c.phase) * 0.3;
          break;
        }
      }
      if (!c.root.visible) continue;

      // 通用 rim floor（見 models.ts 的 CREATURE_RIM_FLOOR）：深度越深,
      // 材質底色越亮,保證牠不會整個沒入背景——跟潛水員的 fresnel 輪廓光
      // 是不同機制（生物不需要「只有邊緣」那種效果,整片材質一起淡入淡出
      // 就夠)。
      if (c.rimMaterials.length) {
        for (const m of c.rimMaterials) {
          const floor = m.userData.rimFloor as RimFloorTag;
          m.emissive.copy(floor.color);
          m.emissiveIntensity = floor.max * depthFrac;
        }
      }
      // 生物發光脈動（目前只有水母鐘部，見 JELLY_GLOW_*）：用這隻生物自己
      // 的 c.phase 當相位偏移,同一批水母才不會一起同步閃爍。
      if (c.bioGlowMaterials.length) {
        for (const m of c.bioGlowMaterials) {
          const glow = m.userData.bioGlow as BioGlowTag;
          m.emissiveIntensity = glow.base + Math.sin(t * glow.speed + c.phase) * glow.amp;
        }
      }

      if (c.mixer) c.mixer.update(dt);
      else this.animatePlaceholderLimbs(c, t, 1);
    }
  }

  private updateBubbles(t: number, dt: number) {
    // 環境氣泡：一定往上飄（世界座標，跟捲動方向無關），飄出視野頂端就從
    // 攝影機下方一個新的隨機位置回收重生。
    const topMargin = 22;
    const bottomSpawnSpan = 40;
    for (const b of this.ambientBubbles) {
      b.sprite.position.y += b.vy * dt;
      b.sprite.position.x += Math.sin(t * b.wobbleFreq + b.wobblePhase) * 0.15 * dt;
      if (b.sprite.position.y > this.cameraY + topMargin) {
        b.sprite.position.y -= bottomSpawnSpan;
        b.sprite.position.x = (Math.random() - 0.5) * 16;
        b.sprite.position.z = -(1 + Math.random() * 14);
      }
    }

    // 吐氣氣泡：有限壽命，飄出壽命就收回（隱藏＋標記可回收），並隨著壽命
    // 消耗慢慢淡出，不是直接消失。
    for (const b of this.burstPool) {
      if (!b.active) continue;
      b.life -= dt;
      b.sprite.position.y += b.vy * dt;
      b.sprite.position.x += b.vx * dt + Math.sin(t * b.wobbleFreq + b.wobblePhase) * 0.08 * dt;
      const mat = b.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, Math.min(0.85, b.life * 0.6));
      if (b.life <= 0) {
        b.active = false;
        b.sprite.visible = false;
      }
    }
  }

  private animatePlaceholderLimbs(c: Creature, t: number, speedMul: number) {
    const pivots = (c.root.userData.finPivots as THREE.Object3D[]) ?? [];
    const wiggle = Math.sin(t * 6 * speedMul + c.phase) * 0.35;
    for (const p of pivots) p.rotation.y = wiggle;
    const lure = c.root.userData.lure as THREE.Object3D | undefined;
    if (lure) lure.position.y = 0.5 + Math.sin(t * 1.4) * 0.03;
  }

  dispose() {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handlePointerMove);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m?.dispose();
      }
    });
    this.bubbleTexture.dispose();
    this.renderer.dispose();
  }
}
