// 模型登記表：每個生物／潛水員一筆設定，其餘程式碼只認這份表，不要在別的地方
// 散落個別模型的路徑、縮放或角度修正——換模型、調角度都只改這裡一個地方。
//
// path 指到 `npx @gltf-transform/cli optimize` 產出的 /landing/models/<name>.glb
// （原始檔在 public/landing/models/src/，未進版控，見 .gitignore）。若某天
// 那個檔案不見了，loadCreatureModel()（見 engine.ts 的 tryLoadModel）載入
// 失敗時會 console.warn 並改用 buildPlaceholder() 產生的替代幾何頂上，
// 讓頁面在有沒有模型檔的情況下都能動——這不是理論上的 fallback，七個 glb
// 壓縮前都曾經是這樣先跑通的（四個 reefXxx 項目共用同一個 reef-school.glb,
// 實際還是七個檔案,見下面 ModelEntry.reefMeshIndex 的說明）。
//
// scale 是從每個原始 GLB 的 bbox 反推的：Sketchfab 模型各自帶著來源 DCC
// 軟體的原始單位（有些是公尺，有些明顯是公分甚至更怪的尺度），量出的數字
// 記在下面每一筆註解裡，不是憑感覺調的——所以要是使用者換了同名但不同來源
// 的模型，這個 scale 八成要重算，不能直接套用。

import * as THREE from "three";

export type ModelName =
  | "diver"
  | "reefClown"
  | "reefTang"
  | "reefMoorish"
  | "reefYellow"
  | "mackerel"
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
  /** 模型原始比例跟場景不一致時的統一縮放。 */
  scale: number;
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
    // 調好的攝影機框景，不用重調鏡頭。
    scale: 0.55,
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
  // 四個 reefXxx 都指向同一份 reef-school.glb（見上面 reefMeshIndex 的說明）
  // ——這個檔案本身是 4 個獨立 SkinnedMesh、共用一棵骨架樹、被同一條 41 秒
  // 的烘焙動畫驅動。拆成 4 個登記表項目之前,整個引擎把這個模型當「一個
  // 生物」處理：5 個實例＝5 份完整的 4 魚骨架一起複製貼上,魚自己又被那條
  // 烘焙動畫帶著繞圈／亂游（動畫本身的細節見下面「魚繞圈／倒退游根因」的
  // 說明），疊起來就是使用者回報的「魚在原地打轉、倒退游」。拆成 4 個
  // 獨立項目之後,每個只掛對應的那一個 mesh,可以各自給 travelYaw、各自
  // 算直線位移,不再整包一起動。
  //
  // 魚繞圈／倒退游根因（用 gltf-transform 等工具直接讀這個 glb 的 JSON
  // 查出來的，不是猜的）：這個骨架每條魚的「Root」骨頭本身完全沒有被
  // 動畫到（0 個 channel）；真正帶著整條魚到處跑的是 Root 正下方的
  // head／Spine_01 兩根骨頭的 translation track——換句話說，烘焙動畫把
  // 「全身移動」錄成了「第一節脊椎骨自己平移」，而不是錄在真正的根骨頭上。
  // 引擎原本又在 Object3D 層級疊了一層自己的路徑移動（pseudoNoise 漂移／
  // 群體路徑），兩層位移互相打架，才會看起來像亂轉圈。
  // 修法：把 clip 裡「所有 translation track」整批拿掉（不分是不是根骨頭,
  // 因為真正的根骨頭反而沒有 track，是它的直屬子骨頭在搬家),只留
  // rotation track——那才是「尾巴／脊椎彎動、鰭片拍動」的局部擺動,見
  // engine.ts 的 sanitizeSwimClip()。不是用程序化擺動取代,因為真的烘焙
  // 動畫在拿掉 translation 之後就是乾淨的原地游動,沒有必要捨棄。
  // round 9 實測回饋：這個 mesh 實際是 3 條小丑魚以不同角度疊在一起的
  // 一簇幾何（不是乾淨的單條魚),轉 travelYaw 怎麼調都沒辦法讓牠看起來
  // 「頭朝前」——問題在幾何本身疊疊樂，不是朝向算錯。拿掉 engine.ts
  // spawnCreatures() 正式場景的生成（count 分給 reefTang/Moorish/Yellow
  // 三種),但登記表項目保留,?diveDebug=all 跟 ?diveDebug=reefClown 還是
  // 能看到牠,之後要是找到辦法分開這簇幾何再放回生成名單即可。
  reefClown: {
    path: "/landing/models/reef-school.glb",
    reefMeshIndex: 0,
    reefKeepPrefix: "Clown1",
    sanitizeSwim: true,
    stripRotationMatch: ["head", "Spine_01"],
    scale: 1,
    rotationOffset: new THREE.Euler(0, 0, 0),
    // round 11：拿掉 head＋Spine_01 旋轉之後,量 head→Spine_End 的世界向量：
    // travelYaw=0 時 dir=+1 指向 0°、dir=-1 指向 180°（只剩 ±25° 尾部擺動）,
    // 四種 reefXxx 結論相同。先前的 Math.PI/2 是配合沒拿乾淨的轉身動畫調出來的。
    travelYaw: 0,
    depthM: 8,
    animationClip: "Animation",
    credit: {
      title: "Animated Swimming Tropical Fish School Loop",
      author: "LasquetiSpice",
      url: "https://sketchfab.com/3d-models/62ccf83b35c744d7b5ffb7be80d4ea99",
      license: "CC BY 4.0",
    },
  },
  reefTang: {
    path: "/landing/models/reef-school.glb",
    reefMeshIndex: 1,
    reefKeepPrefix: "blue_tang1",
    sanitizeSwim: true,
    stripRotationMatch: ["head", "Spine_01"],
    // round 9 回饋：8m 深度的珊瑚礁魚看起來只是小點,放大約 2.5 倍跟潛水員
    // 放在一起才讀得出「魚」的形狀——跟鯖魚／海龜／鎚頭鯊之前同樣幅度的
    // 放大是同一個理由（見下面那幾種的註解）。
    scale: 2.5,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0, // round 11：?diveDebug=all 量過,見 reefClown 的說明
    depthM: 8,
    animationClip: "Animation",
    credit: {
      title: "Animated Swimming Tropical Fish School Loop",
      author: "LasquetiSpice",
      url: "https://sketchfab.com/3d-models/62ccf83b35c744d7b5ffb7be80d4ea99",
      license: "CC BY 4.0",
    },
  },
  reefMoorish: {
    path: "/landing/models/reef-school.glb",
    reefMeshIndex: 2,
    reefKeepPrefix: "moorish1",
    sanitizeSwim: true,
    stripRotationMatch: ["head", "Spine_01"],
    scale: 2.5,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0, // round 11：?diveDebug=all 量過,見 reefClown 的說明
    depthM: 8,
    animationClip: "Animation",
    credit: {
      title: "Animated Swimming Tropical Fish School Loop",
      author: "LasquetiSpice",
      url: "https://sketchfab.com/3d-models/62ccf83b35c744d7b5ffb7be80d4ea99",
      license: "CC BY 4.0",
    },
  },
  reefYellow: {
    path: "/landing/models/reef-school.glb",
    reefMeshIndex: 3,
    reefKeepPrefix: "Yellow1",
    sanitizeSwim: true,
    stripRotationMatch: ["head", "Spine_01"],
    scale: 2.5,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0, // round 11：?diveDebug=all 量過,見 reefClown 的說明
    depthM: 8,
    animationClip: "Animation",
    credit: {
      title: "Animated Swimming Tropical Fish School Loop",
      author: "LasquetiSpice",
      url: "https://sketchfab.com/3d-models/62ccf83b35c744d7b5ffb7be80d4ea99",
      license: "CC BY 4.0",
    },
  },
  mackerel: {
    path: "/landing/models/mackerel.glb",
    // round 11：Swimming clip 量出來有 2 條 translation track 掛在非根骨頭
    // 上（跟 reefXxx 同一種「局部骨頭被烘焙成全身位移」的模式）——清掉。
    sanitizeSwim: true,
    // 原始 bbox 長邊約 143 個單位——來源檔案用的是公分尺度，不是公尺；
    // 0.01 換算回來長邊約 1.4 單位，但回饋說中層生物在畫面上讀起來像「頂端
    // 的小黑點」,縮太小——0.025（約 2.5 倍）換算後長邊約 3.5 單位，配合
    // engine.ts spawnCreatures() 把鯖魚車道拉近（-1~-8）一起看才夠明顯。
    scale: 0.025,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 20,
    animationClip: "Swimming",
    credit: {
      title: "Atlantic Mackerel (Animated and Game-ready)",
      author: "1shxxn",
      url: "https://sketchfab.com/3d-models/eca6071c26fc4013b8c94a3f37a434c7",
      license: "CC BY 4.0",
    },
  },
  turtle: {
    path: "/landing/models/turtle.glb",
    // 原始 bbox 長邊約 1.27 單位。回饋：中層生物（含海龜）在畫面上太小太暗，
    // 讀成頂端的小黑點——把 0.8 提高到 1.0（約 2.5 倍），長邊約 3.2 單位，
    // 配合 zRange 拉近一起看才夠明顯。
    scale: 1.0,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 35,
    // 來源檔案沒有真的游泳動畫（EmptyAction.001 只有 1 秒、20 個關鍵影格），
    // 靠引擎那邊的程序化擺動撐住「活著」的感覺，不是漏接動畫。
    animationClip: "EmptyAction.001",
    credit: {
      title: "Model 53A - Flatback Sea Turtle",
      author: "DigitalLife3D",
      url: "https://sketchfab.com/3d-models/442372b7f02b4730882d41d959726156",
      license: "CC BY 4.0",
    },
  },
  hammerhead: {
    path: "/landing/models/hammerhead.glb",
    // round 11：Armature|Action 量出來身體主幹骨頭（Bone.002_01 往下）帶
    // translation track——跟 reefXxx／mackerel 同一種模式，清掉比較保險。
    sanitizeSwim: true,
    // 原始 bbox 長邊約 18.9 個單位（一樣是公分尺度）。原本縮到體長約 1.6
    // 單位，但回饋說中層生物太小太暗——提高到約 4 單位（約 2.5 倍），配合
    // zRange 拉近一起看才夠明顯。
    scale: 0.21,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 35,
    animationClip: "Armature|Action",
    credit: {
      title: "Scalloped Hammerhead Juvenile (LOW POLY)",
      author: "sharkingaround",
      url: "https://sketchfab.com/3d-models/f5adc17c922b48feae76aaea98552dd4",
      license: "CC BY 4.0",
    },
  },
  anglerfish: {
    path: "/landing/models/anglerfish.glb",
    // 原始 bbox 最寬約 3.88 單位。原本縮到約 1.4 單位，但回饋說深海主角太小
    // 太暗——提高到 0.28（約 2 倍，長邊約 2.8 單位），配合 zRange 拉近一起看。
    scale: 0.28,
    rotationOffset: new THREE.Euler(0, 0, 0),
    // round 9：直線移動上線後實測，Math.PI（180 度）會讓牠正面朝攝影機——
    // 跟其他物種不一樣，牠模型的靜止朝向偏了 90 度，不是 180 度。往 +X
    // 移動時正確的疊加角是 Math.PI/2。
    travelYaw: Math.PI / 2,
    depthM: 1000,
    animationClip: "Take 001",
    credit: {
      title: "Anglerfish",
      author: "Abby_Holzworth1",
      url: "https://sketchfab.com/3d-models/5e2f4b2d2e1a4613a008b6caaf40d50c",
      license: "CC BY 4.0",
    },
  },
  jellyfish: {
    path: "/landing/models/jellyfish.glb",
    // 原始 bbox 最寬約 10.4 個單位（含觸手），縮到鐘部直徑約 0.4 單位。
    scale: 0.038,
    rotationOffset: new THREE.Euler(0, 0, 0),
    travelYaw: 0,
    depthM: 1000,
    // 來源檔案的動畫片段名稱就叫「200」（Sketchfab 匯出時沒重新命名），
    // 不是漏改成 "Pulse"。
    animationClip: "200",
    credit: {
      title: "Crystal Jellyfish (Leptomedusae)",
      author: "n-",
      url: "https://sketchfab.com/3d-models/38ac0d91213d447eb3366f615298ce8f",
      license: "CC BY 4.0",
    },
  },
};

// 七個 glb 全部壓縮後總共只有～2.6MB（MODEL_REGISTRY 現在有 10 筆項目，
// 但四個 reefXxx 共用同一個 reef-school.glb,實際網路請求／parse 只會
// 發生一次,見 engine.ts tryLoadModel 的 path 快取），第二輪回饋之後不再
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
export const CREATURE_RIM_FLOOR: Partial<Record<ModelName, { color: number; max: number }>> = {
  // 四種珊瑚礁魚共用同一組數值（以前單一 reefSchool 項目就是這組）——
  // engine.ts 的 applyLoadedModel() 每次只處理「這個 kind 自己的那個
  // mesh」，不會像拆分之前那樣整棵共用骨架一起被同一次呼叫打上標籤，
  // 四個 kind 各自獨立賦值也不會互相覆蓋。
  reefClown: { color: 0xbfe9ff, max: 0.18 },
  reefTang: { color: 0xbfe9ff, max: 0.18 },
  reefMoorish: { color: 0xbfe9ff, max: 0.18 },
  reefYellow: { color: 0xbfe9ff, max: 0.18 },
  mackerel: { color: 0xbfe9ff, max: 0.3 },
  turtle: { color: 0xbfe9ff, max: 0.08 },
  hammerhead: { color: 0xbfe9ff, max: 0.08 },
  // 鮟鱇魚真的模型檔只有一顆材質（整條魚是單一 skinned mesh,沒有獨立的
  // 「誘餌」子網格可以單獨調材質——見 engine.ts attachAnglerfishLure() 的
  // 說明),所以牠的「身體要有一點暗淡自體發光」直接沿用這份通用機制,顏色
  // 用原本就在用的生物發光綠,不用另外寫一套。
  anglerfish: { color: 0x3fd98a, max: 0.35 },
};

// 水母鐘部的生物發光脈動：base 是中心亮度,amp 是脈動幅度（上下各 amp）,
// speed 是脈動角速度（rad/s）。跟 CREATURE_RIM_FLOOR 分開——水母的發光是
// 牠的主要外觀語言，不是「深度越深才浮現」的底線,所以用固定幅度脈動,
// 不跟 environmentDarkness 掛鉤（水母本來就只出現在最深的 ABYSS_RANGE）。
export const JELLY_GLOW_BASE = 2.0;
export const JELLY_GLOW_AMP = 0.5;
export const JELLY_GLOW_SPEED = 1.1;
