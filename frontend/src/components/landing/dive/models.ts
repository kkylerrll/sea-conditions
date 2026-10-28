// 模型登記表：每個生物／潛水員一筆設定，其餘程式碼只認這份表，不要在別的地方
// 散落個別模型的路徑、縮放或角度修正——換模型、調角度都只改這裡一個地方。
//
// path 指到 `npx @gltf-transform/cli optimize` 產出的 /landing/models/<name>.glb
// （原始檔在 public/landing/models/src/，未進版控，見 .gitignore）。若某天
// 那個檔案不見了，loadCreatureModel()（見 engine.ts 的 tryLoadModel）載入
// 失敗時會 console.warn 並改用 buildPlaceholder() 產生的替代幾何頂上，
// 讓頁面在有沒有模型檔的情況下都能動——這不是理論上的 fallback，每個 glb
// 壓縮前都曾經是這樣先跑通的。
//
// round 20 回饋：「魚的大小比例很奇怪」——舊版每個模型各自手調一個 scale
// （海龜 1.7、鮪魚 0.6、鎚頭鯊 0.105……），每次換模型就憑眼睛重猜一次，結果
// 海龜比潛水員大好幾倍、小丑魚跟潛水員上半身一樣大、鎚頭鯊反而比蝴蝶魚小。
// 現在改成登記「真實體長」（bodyLengthM，公尺），engine.ts 載入時量模型自己的
// bbox，反推出「體長 × UNITS_PER_M」需要的縮放值——Sketchfab 模型各自帶著來源
// DCC 軟體的原始單位（公尺、公分、更怪的尺度都有）也不用再管，換同名不同來源
// 的模型時不必重算任何數字。

import * as THREE from "three";
import type { ProceduralSwim } from "./swim";

/**
 * 世界單位／公尺。以潛水員當尺：潛水員模型 bbox 高約 1.98 × scale 0.55 ≈ 1.09
 * 單位，對應真人約 1.8 m，所以 1 m ≈ 0.6 單位。所有生物的大小都從這個比例算，
 * 跟潛水員之間的比例才會是真的。
 */
export const UNITS_PER_M = (1.98 * 0.55) / 1.8;

/**
 * 小型礁魚的「看得清楚」放大倍率。真實比例下 11 cm 的小丑魚在鏡頭 3~7 公尺外
 * 只剩十幾個像素，所以允許最多 1.6 倍——是明確寫出來的可讀性折衷，不是把體長
 * 偷偷灌水；只套用在有填 legibilityBoost 的小魚上。
 */
export const SMALL_FISH_LEGIBILITY_BOOST = 1.6;

export type ModelName =
  | "diver"
  | "clownfish"
  | "butterflyfish"
  | "barramundi"
  | "tuna"
  | "turtle"
  | "hammerhead"
  | "anglerfish"
  | "jellyfish";

export type ModelEntry = {
  /** 壓縮後的 glb 路徑，相對 /public。 */
  path: string;
  /**
   * 只有四個 reef* 物種會填這個欄位：reef-school.glb 這一個檔案本身是
   * 「4 個獨立的 SkinnedMesh scene node（Object_0..3），共用同一棵骨架樹」
   * ——不是一個 mesh 裡裝全部魚,也不是 4 個各自獨立的 glb。四個 reef*
   * 項目的 path 都指向同一個檔案（engine.ts 的 tryLoadModel 會用 path 當
   * cache key,只真的 fetch/parse 一次,四個 kind 各自從同一份結果裡切出
   * 自己的那個 mesh），這裡的數字就是「切出第幾個 mesh」（0-based，對應
   * glTF 的 scene.children 裡骨架樹之後的第幾個 mesh node）。
   *
   * 物種名稱（Clown/Tang/Moorish/Yellow）是從 inspect 這個 glb 時看到的
   * 骨頭命名（Clown1/2/3:*、blue_tang1/2:*、moorish1/2:*、Yellow1/2:*）
   * 反推的——四個 mesh 的宣告順序跟這四組骨頭命名的宣告順序一致，所以
   * 「推測」mesh0=小丑魚、mesh1=藍倒吊、mesh2=角蝴蝶魚、mesh3=黃色系，
   * 但沒有真的在畫面上逐一核對過,如果用 ?diveDebug=all 看到名字跟實際
   * 長相兑不起來,只要調整這個數字跟下面哪一組 travelYaw/credit 對應即可,
   * 不影響其他邏輯。
   */
  reefMeshIndex?: number;
  /**
   * round 11（「兩條魚黏在一起」的根因）：reefTang/Moorish/Yellow 這三個
   * mesh 實際上各自是兩條魚（<species>1、<species>2）共用一份蒙皮幾何，
   * reefClown 的 mesh 則是三條（Clown1/2/3）疊在一起——這裡填「只留哪個
   * 骨頭字首」，engine.ts 的 keepOnlyFirstReefFish() 會依每個頂點權重最大
   * 的骨頭名稱篩掉不是這個字首的三角形，只剩乾淨的單條魚。
   *
   * 注意：填不含冒號／句點的版本（例如 "blue_tang1" 不是 "blue_tang1:"）
   * ——glTF JSON 裡的原始骨頭名稱雖然是 "blue_tang1:Spine_01.56_60" 這種
   * 帶冒號/句點的寫法,但 three.js 的 GLTFLoader 會把 ":" 跟 "." 都從
   * node.name 拿掉（這兩個字元是動畫 track 路徑的分隔符,會跟 property
   * binding 衝突),實際進到 skeleton.bones[i].name 的是
   * "blue_tang1Spine_0156_60" 這種沒有分隔符的字串,照抄 JSON 原文件會
   * 比對不到任何東西（round 11 第一次寫完直接量到 0 個三角形,就是栽在
   * 這裡,用 ?diveDebug=all 搭配 console 讀 skeleton.bones 名稱才抓到）。
   */
  reefKeepPrefix?: string;
  /**
   * 要不要用 engine.ts 的 sanitizeSwimClip() 清理這個模型的烘焙動畫——不是
   * 只有 reefXxx 會把「全身移動」錄成「局部骨頭平移」，mackerel／hammerhead
   * 的動畫各自也至少有一根非根骨頭帶 translation track，一律清掉比用
   * reefMeshIndex!==undefined 當判斷式更準確，也比較容易擴充到以後新模型。
   */
  sanitizeSwim?: boolean;
  /**
   * sanitizeSwimClip() 除了一律拿掉 translation track，還要連帶拿掉的
   * rotation track——用「節點名稱關鍵字＋後面緊跟一個數字」比對（見
   * engine.ts 怎麼組出 `${m}\\d` 的正規表示式),不是單純子字串比對。
   * 例如 "head" 只會比對到 "Clown1head6_10"（head 後面緊接數字),不會
   * 誤比對到 "Clown1head_End7_11"（head 後面接的是 "_"）——同一個理由
   * 見 reefKeepPrefix 的說明：GLTFLoader 把原始名稱的 ":"/"." 都拿掉了,
   * track 節點路徑長這樣沒有分隔符,"head" 真正要排除的是 "head_End"。
   * reefXxx 的 head 骨頭上那個 rotation track 其實是整條魚「轉身」的烘焙位移，
   * 不是局部擺動，這才是使用者回報「魚有時正游有時倒退游」的真正根因。
   * Spine_01 也要拿掉：它跟 head 一樣直接掛在 Root 底下,帶著整條脊椎轉向
   * （實測只拿 head 時,身體軸線仍在 -100°～140° 之間亂轉）。
   */
  stripRotationMatch?: string[];
  /**
   * 靜態（沒骨架、沒動畫片段）的寫實模型用的程序化游動，見 swim.ts：
   * 載入時對每個實例的材質注入頂點彎曲 shader，ω 跟著引擎當下速度倍率走。
   * 有填這個欄位的模型不需要 animationClip（沒有片段時引擎不建 mixer）。
   * 長軸省略時由 geometry bbox 自動量；headSign 看不出來時用 ?diveDebug=<kind> 確認。
   */
  proceduralSwim?: ProceduralSwim;
  /**
   * 真實體長（公尺）：沿 lengthAxis（省略時用 proceduralSwim.axis，再省略就取
   * bbox 最長的水平軸）量。水母填的是鐘部直徑。engine.ts 的 applyLoadedModel()
   * 用它跟 UNITS_PER_M 反推縮放值，見 computeModelScale()。
   */
  bodyLengthM: number;
  /** 量體長用的軸；海龜展開的前鰭比體長寬，要指定 z，不能讓「最長水平軸」量到翼展。 */
  lengthAxis?: "x" | "z";
  /** 小型礁魚才填 true：套用 SMALL_FISH_LEGIBILITY_BOOST（見該常數的說明）。 */
  legibilityBoost?: boolean;
  /**
   * 固定縮放（覆寫 bodyLengthM 的換算）。只有潛水員用——UNITS_PER_M 本身就是
   * 從潛水員的 0.55 推出來的，潛水員不能再反過來用體長算自己。
   */
  fixedScale?: number;
  /** 模型原始朝向跟「往下潛、面朝畫面前方」不一致時的修正角度（弧度）。 */
  rotationOffset: THREE.Euler;
  /**
   * 生物游動朝向的修正角（繞 Y 軸，弧度）。引擎會用「移動方向」算出一個
   * lookAt 朝向（見 engine.ts 的 orientToVelocity），前提是模型的靜止姿態
   * 面朝 -Z；但 Sketchfab 模型的實際朝向五花八門，直接套用常常變成「魚在
   * 倒退游」或「側著身體游」。這個欄位是 lookAt 算完之後再疊加的修正，
   * 每個模型第一次接上真的動起來時憑肉眼觀察調（0＝不用修正，Math.PI＝
   * 模型面朝 +Z、整個轉 180 度，±Math.PI/2＝模型面朝 X 軸）。
   */
  travelYaw: number;
  /** 這個生物平時活動的深度（公尺），世界座標 Y 會落在 -depthM 附近。 */
  depthM: number;
  /** GLTF 動畫片段名稱；不確定的先留常見猜測，載入後會用 inspect 驗證再修正。 */
  animationClip: string;
  /** Sketchfab 出處，履行 CC BY 4.0 的標示義務——只有真的隨頁面出貨的模型才會
      出現在 CREDITS.md／頁尾，這裡先登記好，出貨時直接抄。 */
  credit: { title: string; author: string; url: string; license: string };
};

export const MODEL_REGISTRY: Record<ModelName, ModelEntry> = {
  diver: {
    path: "/landing/models/diver.glb",
    // 原始 bbox 高約 1.98 單位（接近真人比例），縮到 0.55 對齊先前用 placeholder
    // 調好的攝影機框景，不用重調鏡頭。UNITS_PER_M 就是從這個數字推出來的。
    fixedScale: 0.55,
    bodyLengthM: 1.8,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 0,
    animationClip: "Take 001",
    credit: {
      title: "Diver",
      author: "ucdavisterc",
      url: "https://sketchfab.com/3d-models/9a415258dec4449c9faf28f11a5b6831",
      license: "CC BY 4.0",
    },
  },
  // round 19：寫實替換（Sketchfab CC BY 4.0，下載後用 gltf-transform optimize 壓成 webp＋meshopt）。
  // 舊的 reef-school.glb（LasquetiSpice，四種卡通礁魚共用一棵骨架）已移除。
  // 小丑魚：zixisun02 的靜態模型（zbrush＋Substance，1.6k 面，PBR 貼圖），沒有骨架
  // 也沒有動畫，靠 proceduralSwim 擺尾。原始 bbox 長軸 z（-1~1，頭朝 +z 待截圖確認）。
  clownfish: {
    path: "/landing/models/clownfish.glb",
    // 眼斑雙鋸魚成魚約 11 cm。
    bodyLengthM: 0.11,
    legibilityBoost: true,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 8,
    animationClip: "",
    proceduralSwim: { headSign: 1, amp: 0.06, wavelength: 1.0, style: "subcarangiform" },
    credit: {
      title: "Clownfish",
      author: "zixisun02",
      url: "https://sketchfab.com/3d-models/47ba2679d91a4f14b3fc0bf8e3805af5",
      license: "CC BY 4.0",
    },
  },
  // 蝴蝶魚：Dsanchez13 的 Copperband Butterflyfish（Substance 手繪貼圖，3.7k 面）。
  // 靜態，原始 bbox 長軸 x（-1~1），靠 proceduralSwim。
  butterflyfish: {
    path: "/landing/models/butterflyfish.glb",
    // 三間火箭（copperband）成魚約 18 cm。
    bodyLengthM: 0.18,
    legibilityBoost: true,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: Math.PI / 2,
    depthM: 8,
    animationClip: "",
    // round 20 回饋：「神仙魚很怪」——側扁的圓盤形魚套 subcarangiform（e0 0.25，接近
    // 全身擺）會讓整片身體像果凍一樣晃。真的蝶魚身體幾乎是硬的，靠胸鰭划水＋尾柄
    // 小幅擺動前進：改成只有後段彎的 carangiform，振幅壓到 0.025，頻率也放慢。
    proceduralSwim: { axis: "x", headSign: -1, amp: 0.025, wavelength: 1.3, style: "carangiform", omega: 6 },
    credit: {
      title: "Copperband Butterflyfish",
      author: "Dsanchez13",
      url: "https://sketchfab.com/3d-models/f96d04dc6ccb4fe4861622ea24fae361",
      license: "CC BY 4.0",
    },
  },
  // round 17：Khronos glTF-Sample-Assets 的 BarramundiFish（Microsoft，CC0）——
  // 目前找到唯一「寫實、PBR、免登入可下載」的魚：魚鱗法線貼圖＋AO＋粗糙度，
  // 2.2k 頂點／3.9k 三角形，原檔 12.5MB（三張 2048 PNG）→ 1024 webp＋meshopt 後 ~310KB。
  // 亞洲鱸（金目鱸），台灣沿岸也有。沒有骨架也沒有動畫，靠 proceduralSwim 擺尾。
  // 原始 bbox：x -0.069~0.074、y 0~0.287、z -0.325~0.318（單位公尺，體長 0.64），
  // 長軸 z、頭朝 +z（引擎的 lookAt 讓模型 +Z 對準前進方向，所以 travelYaw=0）。
  // 尖吻鱸在礁區常見 60~120 cm，取 0.9 m（round 20 以前 scale 3.4 → 2.2 單位，等於 3.6 m）。
  barramundi: {
    path: "/landing/models/barramundi.glb",
    bodyLengthM: 0.9,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 8,
    animationClip: "",
    proceduralSwim: { headSign: 1, amp: 0.05, wavelength: 1.1, style: "subcarangiform" },
    credit: {
      title: "BarramundiFish (glTF Sample Assets)",
      author: "Microsoft / Khronos Group",
      url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish",
      license: "CC0 1.0",
    },
  },
  // 鮪魚：GoldenZtuff 的 Tuna Fish（黃鰭鮪，4k PBR 貼圖壓成 512 webp，7.9k 面，
  // 骨架＋「Swim」動畫 1 秒迴圈）。
  tuna: {
    path: "/landing/models/tuna.glb",
    sanitizeSwim: true,
    // 黃鰭鮪成群洄游的個體約 1~1.8 m，取 1.6 m。
    bodyLengthM: 1.6,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 20,
    animationClip: "Swim",
    credit: {
      title: "Tuna Fish",
      author: "GoldenZtuff",
      url: "https://sketchfab.com/3d-models/642c6515d893474a8fc8f129491efcac",
      license: "CC BY 4.0",
    },
  },
  // round 19：alvaniLa 的 GREEN TURTLE (PENYU HIJAU)——掃描感的靜態綠蠵龜（原 56k 面，
  // simplify 後約 25k、1024 webp、specGloss 已轉 metalrough）。沒有骨架／動畫，長軸 z、
  // 頭朝 +z（bbox z≈1.87、x≈2.0 是展開的前鰭），靠 flap 風格程序化拍鰭。綠蠵龜成龜
  // 體長約 1.1 m——沿 z 量，不能讓最長水平軸量到 x 的翼展（round 20 以前 scale 1.7
  // → 3.2 單位，等於 5 m 的海龜）。
  turtle: {
    path: "/landing/models/turtle.glb",
    bodyLengthM: 1.1,
    lengthAxis: "z",
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 35,
    animationClip: "",
    proceduralSwim: { axis: "z", headSign: 1, amp: 0.08, wavelength: 1, style: "flap", omega: 4 },
    credit: {
      title: "GREEN TURTLE (PENYU HIJAU)",
      author: "alvaniLa",
      url: "https://sketchfab.com/3d-models/7465453867064871af799795277c7e3e",
      license: "CC BY 4.0",
    },
  },
  // round 19：kenchoo 的 Hammerhead Shark（6.8k 面、白肚灰背 countershading、1024 webp，
  // 骨架＋「Animation」迴圈）。烘焙動畫的根脊椎骨（IK_Back_Bone_01）旋轉 track 跟綁定
  // 姿勢差約 90°，不拿掉整隻鯊魚會翻成肚皮朝鏡頭，所以 stripRotationMatch 拿掉它；
  // 其餘骨頭的 translation 也清掉（sanitizeSwim）。長軸 x、頭在 -x，因此 travelYaw=π/2。
  // 路氏雙髻鯊成魚約 3 m。
  hammerhead: {
    path: "/landing/models/hammerhead.glb",
    sanitizeSwim: true,
    stripRotationMatch: ["IK_Back_Bone_01_jnt_"],
    bodyLengthM: 3.0,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: Math.PI / 2,
    depthM: 35,
    animationClip: "Animation",
    credit: {
      title: "Hammerhead Shark",
      author: "kenchoo",
      url: "https://sketchfab.com/3d-models/1bb18da3050843f687de6753fb31b7c5",
      license: "CC BY 4.0",
    },
  },
  // round 19：Poshel 的 Anglerfish（14k 面、掃描感皮膚＋利齒，貼圖 512 webp）。單一 mesh＋
  // morph 權重動畫（沒有骨架），誘餌是幾何的一部分——engine.ts attachAnglerfishLure()
  // 會在最高頂點（誘餌球泡）掛一顆 emissive 小球。體長取 0.6 m（大型深海鮟鱇的
  // 上限；round 20 以前 scale 0.2 → 3.5 單位，等於 5.8 m）。
  // 模型朝向：嘴朝 +x 時 travelYaw=π/2（沿用舊模型的結論，截圖確認嘴朝前進方向）。
  anglerfish: {
    path: "/landing/models/anglerfish.glb",
    bodyLengthM: 0.6,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: Math.PI / 2,
    depthM: 1000,
    animationClip: "GltfAnimation 0",
    credit: {
      title: "Anglerfish",
      author: "Poshel",
      url: "https://sketchfab.com/3d-models/802018f776bf4313a3b620b1d6d34ff7",
      license: "CC BY 4.0",
    },
  },
  // round 19：n- 的 Simple Moon Jellyfish (Baked Animation)（Aurelia，台灣近海常見；5.4k 面）。
  // 原檔場景裡有一個 84 面的 Cube_0 道具（縮圖上飄的方塊）——已用 gltf-transform 腳本
  // 刪掉再 optimize，glb 裡沒有方塊。海月水母鐘部直徑約 35 cm（bodyLengthM 填的是
  // 鐘部直徑，最長水平軸量到的就是鐘緣）。
  jellyfish: {
    path: "/landing/models/jellyfish.glb",
    bodyLengthM: 0.35,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 1000,
    animationClip: "Loop-400",
    credit: {
      title: "Simple Moon Jellyfish (Baked Animation)",
      author: "n-",
      url: "https://sketchfab.com/3d-models/3d911c511f2744ec9bfb99d46d2d6e14",
      license: "CC BY 4.0",
    },
  },
};

// 九個 glb 壓縮後總共約 2.9MB（round 19，每個模型各一個檔案；engine.ts
// tryLoadModel 仍以 path 當快取 key），第二輪回饋之後不再
// 分批載入：分批（潛水員／珊瑚礁魚先載，深海生物等閒置或捲過 30% 才載）
// 造成的實際後果是深海生物要嘛還沒載完、要嘛載完也已經被使用者捲過去了
// ——體積小到不值得為了「省一點點初始頻寬」犧牲「深海生物準時出現」。
// 全部在建構時一次載入。
export const ALL_MODELS: ModelName[] = Object.keys(MODEL_REGISTRY) as ModelName[];

// 除錯用：`?diveDebug=all` 把七種生物排成一列一列（見 engine.ts 的
// setupDebugAllScene），這裡定義「第幾列對應哪個物種、落在畫面垂直方向的
// 第幾分位（0＝頂端，1＝底部）」——DiveCanvas.tsx 畫 DOM 標籤跟 engine.ts
// 擺放生物都要讀同一份順序/位置，不然標籤跟生物對不齊。frac 從 0.1 到 0.9
// 平均分布，留一點上下邊界不要貼死畫面邊緣。
export type DebugAllRow = { kind: ModelName; frac: number };
export const DEBUG_ALL_ROWS: DebugAllRow[] = ALL_MODELS.map((kind, i) => ({
  kind,
  frac: ALL_MODELS.length > 1 ? 0.1 + (i * 0.8) / (ALL_MODELS.length - 1) : 0.5,
}));

// 「非潛水員生物」材質的最低亮度（emissive rim floor）：隨 environmentDarkness
// (progress) 從 0 升到這裡列出的 max,保證牠們在越來越暗的背景前不會整個
// 沒入黑色——是材質本身的 emissive,不是燈光,跟潛水員的 fresnel 輪廓光
// （見 placeholders.ts 的 addDiverRimShader）是兩套獨立機制（生物不需要
// fresnel 那種邊緣效果,整片材質一起淡入淡出就夠)。engine.ts 的
// collectRimFloorMaterials()／updateCreatures() 負責每幀套用。
//
// 只列出需要這個效果的物種；水母的「鐘部」有自己專門、會脈動的生物發光
// 處理（見下面 JELLY_GLOW_* 常數跟 engine.ts applyLoadedModel 的 jellyfish
// 分支),不套用這份通用的深度淡出下限,不然兩種效果的顏色會打架。
export const CREATURE_RIM_FLOOR: Partial<Record<ModelName, { color: number; max: number; useSkinMap?: boolean }>> = {
  // 四種珊瑚礁魚共用同一組數值（以前單一 reefSchool 項目就是這組）——
  // engine.ts 的 applyLoadedModel() 每次只處理「這個 kind 自己的那個
  // mesh」，不會像拆分之前那樣整棵共用骨架一起被同一次呼叫打上標籤，
  // 四個 kind 各自獨立賦值也不會互相覆蓋。
  clownfish: { color: 0xbfe9ff, max: 0.18 },
  butterflyfish: { color: 0xbfe9ff, max: 0.18 },
  barramundi: { color: 0xbfe9ff, max: 0.18 },
  tuna: { color: 0xbfe9ff, max: 0.3 },
  turtle: { color: 0xbfe9ff, max: 0.08 },
  hammerhead: { color: 0xbfe9ff, max: 0.08 },
  // 鮟鱇魚真的模型檔只有一顆材質（整條魚是單一 skinned mesh,沒有獨立的
  // 「誘餌」子網格可以單獨調材質——見 engine.ts attachAnglerfishLure() 的
  // 說明),所以牠的「身體要有一點暗淡自體發光」直接沿用這份通用機制,顏色
  // 用原本就在用的生物發光綠,不用另外寫一套。
  // round 20 回饋：鮟鱇魚在畫面上變成「一整塊螢光綠」——0x3fd98a × 0.35 的平塗
  // emissive 沒有貼圖，直接把皮膚、利齒全部蓋掉。改成淡青灰，並且讓 emissive 走
  // 皮膚貼圖（見 engine.ts applyLoadedModel 的 emissiveMap）：發光乘上紋理，亮的
  // 是皮膚本身的花紋，不是一塊色板；真正亮的只留誘餌。
  anglerfish: { color: 0x9fcfc8, max: 0.55, useSkinMap: true },
};

// 水母鐘部的生物發光脈動：base 是中心亮度,amp 是脈動幅度（上下各 amp）,
// speed 是脈動角速度（rad/s）。跟 CREATURE_RIM_FLOOR 分開——水母的發光是
// 牠的主要外觀語言，不是「深度越深才浮現」的底線,所以用固定幅度脈動,
// 不跟 environmentDarkness 掛鉤（水母本來就只出現在最深的 ABYSS_RANGE）。
// round 20：這組數值現在是「輻管」（Canal*）的亮度；鐘體乘上 JELLY_BELL_GLOW_RATIO，只是
// 一層很淡的冷光（見 engine.ts applyLoadedModel 的 jellyfish 分支）。脈動幅度加大，收縮時
// 亮、放鬆時暗，才看得出「一縮一放」。
export const JELLY_GLOW_BASE = 0.9;
export const JELLY_GLOW_AMP = 0.35;
export const JELLY_BELL_GLOW_RATIO = 0.35;
export const JELLY_GLOW_SPEED = 1.1;
