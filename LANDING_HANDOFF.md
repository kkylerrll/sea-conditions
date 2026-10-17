# 首頁改版交接（3D 下潛版，第 11 輪）

給下一個 session 的交接。上一版（五張照片交叉溶接）存檔在 commit `d8def41`。
**閱讀順序：以「目前狀態」「第二節生物分布」「五之二」為準；第二、五節裡與之衝突的舊
敘述（攝影機落後、環形漂移、固定深度等）已標示作廢。**

## 目前狀態（2026-10-13）

- 全部已 commit 在分支 `landing-3d-dive`（尚未 push、未開 PR）。`tsc`、`npm run build` 通過。
- 第 11 輪修正（魚兩兩黏在一起、倒退游、海龜深度）**已在程式碼裡，但使用者還沒
  肉眼確認**。
- 授權標示已補齊（見第四節），不再是缺口。

- 第 12 輪（手電筒＋游動更自然）**已在 `engine.ts`，使用者尚未肉眼確認**：
  - 光池（手電筒已改版，不再從潛水員發光）：`flashLight` SpotLight 放在鏡頭到游標瞄準點連線上、
    離目標點 `FLASH_STANDOFF`(7)，照向游標在 z=`FLASH_PLANE_Z`(-4) 的點（`FLASH_AIM_TAU`=0.15s
    平滑）；觸控跟最後觸點，尚無輸入時停在潛水員附近緩漂。強度 `FLASH_MAX_INTENSITY`(110) ×
    smoothstep(darkness 0.35→0.75)，angle 0.5、penumbra 0.8、decay 2、distance 16。
  - 游動（"straight" 分支）：小型魚衝刺滑行 `SWIM_BURST_AMP`=0.4（週期 2~5s 各自隨機），
    大型 `SWIM_SLOW_AMP`=0.2；`mixer.timeScale` 隨速度倍率（0.6~1.8）；朝向改為追實際速度向量
    （y 起伏、z 漂移的解析導數），偏航≤15°/俯仰≤18°，`SWIM_ORIENT_TAU`=0.4s slerp，轉彎 roll
    ≤17°；`c.dir` 與前進分量不變，不會倒退。鯖魚個體加相位偏移與各自 timeScale。水母未改
    （模型動畫本身會脈動）。
  - 若光太亮/太暗先調 `FLASH_MAX_INTENSITY`；若魚擺動太誇張調 `SWIM_*` 常數。

**未結事項**
1. 使用者肉眼確認第 11 輪（成對魚、倒退游、海龜在淺水）。
2. 窄螢幕（<1024px）版面、手機降規格（`isMobileSpec()`）、FPS 都沒在實機測過。
3. 深海段沒有連續捲動檢查過是否有空窗。
4. 往上捲時潛水員頭朝上的姿態，沒有截圖確認過。
5. `reefClown` 的 mesh 是 3 條魚疊在一起，等幾何拆開才能進正式場景。
6. 使用者放行後，從 `landing-3d-dive` 開 PR 到 `main`。

---

## 一、使用者要的是什麼，以及三輪回饋

**核心要求：捲動的時候，看到的是同一個潛水員持續下潛，不同深度出現不同魚
類，最後墜入深海。** 不是換照片、不是換場景，是連續的一次下潛。

### 第一輪：五張照片交叉溶接 → 使用者否決兩次

> 但我想要的效果是持續潛水的效果 而不是往下滑只是單純的換圖片

根因：所有東西都在「章節」裡面淡入淡出，本質上還是換圖。最終定案：拿掉
照片，改成即時 3D 場景（three.js），一個真的潛水員模型＋隨深度出現的生物，
攝影機跟著往下潛，只有章節文字在換頁，3D 世界從頭到尾連續。

### 第二輪：3D 版本做出來、模型也整合進去之後 → 使用者再次否決

四個具體抱怨，對應的根因和修法：

1. **「潛水員很晚才出現」**——根因是舊版把「潛水員的畫面位置」跟「攝影機
   位置」焊死在一起（`camera.y = diverY + 0.4`），潛水員在畫面上幾乎不會動，
   加上舊版的光效（頭燈聚光燈、點光源補光）在淺水段強度接近 0，潛水員本體
   顏色又深，視覺上很不起眼。修法見下面「潛水員的畫面位置」。
2. **「魚只出現在某一層，深海魚幾乎沒看到」**——根因是每種生物只有一個固定
   深度（公尺數），深海生物又擺在很深的地方；深度換算曲線後段是非線性的
   （見 `depth.ts`），同一段捲動距離在深海對應的公尺數暴增，深海生物等於
   被塞進一個極短的捲動窗口，捲過去的時候人根本來不及看。修法：生物改成
   在「捲動進度」上均勻隨機分布（不是在公尺數上），深海段也從佔捲動長度
   0.2 加大到 0.35。見下面「生物分布」。
3. **「像在換圖，光效很假」**——根因是光柱／頭燈聚光燈／點光源補光這些「看
   得見光束本體」的效果，在使用者眼裡讀成螢幕特效而不是真的光。修法：
   全部拿掉，只留 AmbientLight／HemisphereLight 這種「平光」，顏色/強度是
   深度的連續函數（沒有依章節跳動的階梯）。鮟鱇魚的誘餌只剩 emissive 材質
   自體發光，不掛額外光源。
4. **「潛水員應該從頭滑到底，往上捲要浮起來」**——修法：潛水員在畫面上的
   垂直位置（progress 0 時貼近頂端、progress 1 時貼近底部）跟他的「真實
   深度」（決定環境變暗、生物出現時機）**拆成兩件事**分開算；朝向（頭朝下
   下潛／頭朝上上浮）跟著捲動方向平滑轉換，不是瞬間翻頭。見下面兩節。

三輪回饋都指向同一個原則：**凡是「看起來像特效／卡通」的東西都要拿掉，
凡是「敘事需要連續」的地方都不能有階梯或鎖死的畫面位置。**

---

## 二、現在的架構

### 資料流：兩個 rAF，一份共享狀態

`ScrollScene.tsx` 掛一個 scroll listener＋一個 rAF，每幀寫出：

| 寫出的東西 | 用途 |
|---|---|
| `--progress` CSS 變數 0→1 | 章節文字的交叉淡出淡入（`--vis2`）、深度計游標 |
| `--scroll-vel` CSS 變數 | 目前沒有 CSS 效果在讀（水體 DOM 粒子已經拿掉），保留給以後 |
| `diveState.progress` | 同一個 progress，寫進 `diveState.ts` 這個模組級物件 |
| `diveState.velocity` | 捲動快慢，潛水員游速、微粒流速用 |
| `diveState.direction` | 1＝往下捲，-1＝往上捲，帶滯後（10px 門檻）避免手震一直翻轉 |
| `[data-depth-readout]` textContent | 深度讀數，刻意不走 React state |
| `.scroll-dir-up` / `.is-active` | 只在方向翻轉／跨章時才動 classList |

`DiveCanvas.tsx`（three.js 場景）有自己的 rAF——場景要在使用者停手時也
繼續動（生物游動、水母漂浮），不能只在 scroll 事件裡更新，所以不能共用
ScrollScene 的 rAF，只共讀 `diveState` 這一份資料，不新增第二個 scroll
listener。

### 深度換算：`depth.ts`

```
progress 0    → 0.65   線性對應 0 → 40m（寫實潛水）
progress 0.65 → 1      三次方 easing 對應 40 → 1000m（墜入深海，故意暴衝）
```

0.65 這個切點原本是 0.8，第二輪回饋改小——深海生物需要更長的捲動距離才有
機會被看到。`environmentDarkness(progress)` 是另一條獨立的曲線，專門給
背景色／濃霧／燈光衰減用，**不要**跟 `depthAt()`／`MAX_DEPTH_M` 混用：
`MAX_DEPTH_M` 是 1000，如果暗化程度直接跟公尺數掛鉤，0～40m（寫實潛水
全部範圍）換算成 0～1000 只佔 0～0.04，畫面幾乎不會變暗。

### 潛水員的畫面位置：跟「真實深度」拆開算

`dive/engine.ts` 的 `update()` 裡，潛水員的世界座標**不是**直接等於
`depthToWorldY(depthAt(progress))`。做法：

1. 攝影機的 Y（`this.cameraY`）用指數平滑追著潛水員的真實深度跑。（**作廢**：
   原本的 `CAMERA_LAG_TAU` 秒級落後已在第 3 輪移除，現為 `CAMERA_SMOOTH_TAU`=0.12s，
   見五之二。）
2. 潛水員該出現在螢幕高度的哪個比例（`frac`，0＝頂端、1＝底部）是
   `progress` 的函式（`SCREEN_FRAC_TOP=0.3`（原 0.18）→ `SCREEN_FRAC_BOTTOM=0.78`，
   `smoothstep` 過渡)。
3. `diverWorldYForFraction()` 用攝影機的垂直視角＋潛水員到攝影機的固定距離
   反推：要讓潛水員出現在某個螢幕高度，他的世界 Y 該是多少。這是精確的
   三角函數反推，不是攝影機俯仰角的近似值——如果直接讓攝影機大幅落後
   潛水員的真實深度（深海段可以差到 300 多個單位），近似公式會整個垮掉。

好處：潛水員的螢幕位置只取決於 `progress`，跟攝影機的落後動態完全無關，
不管攝影機怎麼平滑，潛水員永遠準確落在該在的高度。

### 潛水員的朝向：跟捲動方向，不是跟深度

`this.facing`（0＝頭朝下下潛姿態，1＝頭朝上上浮姿態）用指數平滑追著
`diveState.direction` 的目標值跑（`FACING_TAU`），跟上面的「螢幕位置」是
兩個完全獨立的系統：位置只認 `progress`，朝向只認「現在往哪個方向捲」。
往上捲會慢慢轉成上浮姿態，往下捲慢慢轉回下潛姿態，轉換過程是連續的
（`Math.lerp` 內插 pitch 角度)，不會用 `if` 瞬間切換兩張姿態。

### 生物分布：以捲動進度／真實深度為準（第 11 輪狀態，取代舊區間表）

`spawnInRange(kind, motion, [progressMin, progressMax], count, laneZ)`：每隻生物
的深度是在進度區間內隨機挑一點，再換算成世界 Y。區間常數在 `dive/engine.ts` 開頭，
刻意重疊，銜接處兩種同時在畫面上：

| 常數 | 範圍 | 生物 |
|---|---|---|
| `REEF_RANGE` | progress 0.02～0.35 | 珊瑚礁魚 reefTang／reefMoorish／reefYellow（桌機各 7 條、手機各 4） |
| `TURTLE_RANGE` | `progressAt(3)`～`progressAt(25)`（3～25m） | 海龜（桌機 2、手機 1），與礁魚同場；原本 35m+ 不寫實 |
| `SCHOOL_RANGE` | 0.25～0.55 | 鯖魚群（桌機 32、手機 16） |
| `DROP_RANGE` | `progressAt(20)`～`progressAt(120)` | 鎚頭鯊（桌機 3、手機 2），對應真實活動深度 20～120m |
| `JELLY_RANGE` | `progressAt(90)`～1.0 | 水母 |
| `ANGLER_RANGE` | `progressAt(300)`～1.0 | 鮟鱇魚（桌機 5、手機 3） |

**reef-school.glb 拆成四個登記表項目**（`dive/models.ts`）：`reefClown`／`reefTang`／
`reefMoorish`／`reefYellow` 共用同一個檔案（只 fetch 一次），各用 `reefMeshIndex`
挑 mesh、`reefKeepPrefix` 只留該 mesh 內的第一條魚（解「兩條魚黏在一起」）。
`reefClown` 的 mesh 是 3 條小丑魚疊在一起，**不進正式場景的生成名單**
（`spawnCreatures` 的 `REEF_KINDS` 只有另外三種），登記項目保留，可用
`?diveDebug=all` 或 `?diveDebug=reefClown` 查看。

**動畫清理**：`sanitizeSwimClip()`（`engine.ts`）對 `sanitizeSwim: true` 的模型
（reef 四種、mackerel、hammerhead 等）拿掉所有 translation track（原檔把「全身
移動」錄成局部骨頭平移，會造成倒退／抖動）；`stripRotationMatch`（reef 四種填
`["head","Spine_01"]`）再額外拿掉名稱比對到的骨頭的 rotation track（那是整條魚
「轉身」的烘焙位移）。

**朝向**：`travelYaw` 在 reef 四種已回到 0（第 11 輪用 `?diveDebug=all` 量過，
剩下的 ±25° 是尾部擺動，先前的 `Math.PI/2` 是配合沒清乾淨的轉身動畫調的）。
anglerfish 是 `Math.PI/2`，其餘 0。

**移動種類**：`MotionKind` 現為 `"straight" | "school" | "drift"`（straight＝沿 X
軸單向直線、出邊界繞回；school＝鯖魚共用一條漂移路徑＋隊形偏移；drift＝水母原地
垂直漂浮）。生物位置是世界座標固定，是攝影機在動；**舊版的「繞自己深度帶環形漂移」
已作廢**。

**近最大深度折返**：捲到底（progress→1）鏡頭速度趨近 0，被 wrap 到視野外的深海
生物會空等。因此生物在視野外、還沒遠到被 wrap 時，會用
`SWIM_BACK_SPEED_MIN`（2.5）＋`SWIM_BACK_SPEED_RANGE`（0.5）的速度、並隨剩餘距離
（`SWIM_BACK_EASE_DISTANCE`=1.2）減速，游回視野內側。回收基準用 `trueDiverY`，
不用有平滑落後的 `cameraY`。

**除錯**：網址加 `?diveDebug=<物種名>` 只看單一生物，`?diveDebug=all` 把
`MODEL_REGISTRY` 每一項排成一列、固定速度（`DiveCanvas.tsx` 讀參數，
`engine.ts` 的 `updateDebugScene`／`setupDebugAllScene`）。

### 燈光：只剩平光，沒有看得見光束本體的東西

`this.ambient`（AmbientLight）＋`this.hemi`（HemisphereLight），顏色/強度
都是 `environmentDarkness(progress)` 的連續函數，兩者都留一個下限（不歸零）
——沒有頭燈或補光點光源頂替之後，這是潛水員跟生物在深海章節還看得見的
唯一原因。**拿掉的東西**：光柱平面（god rays）、潛水員頭燈聚光燈
（`SpotLight`）、潛水員專用點光源補光、鮟鱇魚誘餌旁邊的點光源（誘餌現在
只靠 `emissive` 材質自體發光）。這些全部是第二輪回饋要求刪掉的「看起來
像特效」的光效。

### 模型載入：全部一次載入，不分批

`dive/models.ts` 的 `ALL_MODELS`——七個模型壓縮後總共約 2.6MB，第二輪
回饋之後拿掉了「潛水員／珊瑚礁魚先載，深海生物等閒置或捲過 30% 才載」
的分批機制：體積小到不值得為了省一點點初始頻寬，犧牲深海生物準時出現。
`DiveEngine` 建構時就對七個模型全部呼叫 `tryLoadModel()`。

模型載入失敗（找不到檔案、fetch 出錯）會 `console.warn` 並維持
`buildPlaceholder()` 產生的替代幾何，讓頁面在有沒有模型檔的情況下都能動
——這不是理論上的 fallback，七個模型壓縮前都是這樣先跑通場景的。

**重要的骨架動畫陷阱**：多實例的生物（鯖魚、水母、珊瑚礁魚群）用
`SkeletonUtils.clone()`（`three/examples/jsm/utils/SkeletonUtils.js`）複製
模型，**不能**用普通的 `Object3D.clone(true)`——後者對有骨架的
`SkinnedMesh` 是壞的：只會複製 `skeleton` 的參照，不會把 `skeleton.bones`
重新指向新複製出來的骨頭節點，複製體會繼續共用原始（從未被加進場景、
`matrixWorld` 永遠不更新）的骨架，蒙皮頂點因此用一組跟複製體自身位置完全
無關的錯誤矩陣計算，畫面上會出現「模型出現在隨機位置、大小失控」的詭異
巨大生物（這是實際踩過的坑，花了不少時間排查）。

### 降級（硬性要求，不要破壞）

所有捲動相關的 CSS 都 scope 在 `.progress-armed` 底下，只有「JS 有跑」且
「`prefers-reduced-motion` 關閉」時才會掛上。沒有它的時候：整頁退回一般
垂直長頁，五章依序堆疊、全部可見可讀，背景是純 CSS 的深水漸層（見
`globals.css` 的 `.landing-scene` background）。`DiveCanvas.tsx` 自己也會
檢查 `prefers-reduced-motion` 跟 WebGL 支援度，任一個不通過就完全不建立
`DiveEngine`，canvas 維持空白透明，底下的 CSS 漸層會透出來——不會有白閃
黑閃，也不會有空的 3D 畫布卡住畫面。

### 圖層順序（sticky 舞台內）

```
DiveCanvas z-index:0 → dive-scrim z-index:1 → 章節文字 z-index:2 → 深度計／進度條 z-index:3
```

`dive-scrim` 是一層固定的暗化漸層，給文字墊底用——3D 場景的顏色是連續漸變
的，沒辦法像照片版那樣針對每一章調對比。

---

## 三、檔案

### 新增

| 檔案 | 作用 |
|---|---|
| `src/components/landing/diveState.ts` | 共享狀態：`progress`／`velocity`／`direction`，ScrollScene 寫、三.js 讀 |
| `src/components/landing/DiveCanvas.tsx` | 掛載點，動態載入 `dive/engine.ts`，管 WebGL/reduced-motion 降級 |
| `src/components/landing/dive/engine.ts` | 3D 場景主體：攝影機、生物、燈光、渲染迴圈 |
| `src/components/landing/dive/models.ts` | 模型登記表（路徑／縮放／角度修正／深度區間／授權出處） |
| `src/components/landing/dive/placeholders.ts` | 程序化替代幾何，模型檔不存在或載入失敗時頂上 |
| `public/landing/models/*.glb` | 七個壓縮後的模型（進版控） |
| `public/landing/models/src/` | 原始未壓縮模型（不進版控，見 `.gitignore`） |

### 修改

`src/app/page.tsx`（拿掉照片章節，加 `DiveCanvas`＋`dive-scrim`）、
`src/app/globals.css`（拿掉照片／水體 DOM 粒子的 CSS，加 `.dive-canvas`／
`.dive-scrim`）、`src/components/landing/ScrollScene.tsx`（寫
`diveState.direction`，拿掉沒人用的游標視差）、
`src/components/landing/depth.ts`（重寫，拿掉 `SURFACE_PORTION`，加
`environmentDarkness()`）、`src/components/landing/DepthMeter.tsx`（刻度
改用 `progressAt()` 換算非線性位置）、`src/components/landing/chapters.tsx`
（拿掉 `img`/`focus`，英文代號改成 THE SURFACE/REEF/SCHOOL/DROP/ABYSS）、
`src/components/AppChrome.tsx`（頁尾照片版權換成七個模型的作者標示）、`public/landing/CREDITS.md`（改記七個模型的出處）、`.gitignore`（加 `models/src/`）。

### 刪除

五張照片（`public/landing/*.webp`）、`ChapterMedia.tsx`、`WaterColumn.tsx`、
`waterColumnField.ts`（DOM 粒子系統，後來由 three.js 氣泡 Sprite 取代）、
六個沒人引用的舊 SVG 場景檔（`SurfHero.tsx`、`WaterlineScene.tsx`、
`DiveScene.tsx`、`DeepScene.tsx`、`SceneDefs.tsx`、`wave.ts`）——這些都在
`d8def41` 有備份。

### 章節內容

五章的中文文案、資訊卡、CTA 全部沒動，只有英文代號跟著新主題改了：

| # | 英文 | 深度 | 標題 |
|---|---|---|---|
| 00 | THE SURFACE | 0m | 海況去不去 |
| 01 | THE REEF | ～8m 附近 | 同一道浪，兩種答案 |
| 02 | THE SCHOOL | ～20m 附近 | 全台海況，一次看完 |
| 03 | THE DROP | ～35m 附近 | 資料一天更新兩次 |
| 04 | THE ABYSS | 深海（1000m） | 下水前，先看今天的海況 |

---

## 四、模型與壓縮

### 七個模型的來源、比例換算、動畫片段名稱

全部記在 `dive/models.ts` 的 `MODEL_REGISTRY` 裡，每筆都有註解說明 scale
是怎麼從原始 bbox 反推的（不同 Sketchfab 模型用的來源單位不一致，有些是
公尺、有些明顯是公分）。動畫片段名稱是實際 inspect 出來的真名，不是猜的
（例如海龜其實沒有真的游泳動畫，`EmptyAction.001` 只有 1 秒 20 個關鍵
影格，牠的「活著」感完全靠引擎的程序化擺動撐)。

### 壓縮指令

原始檔在 `public/landing/models/src/`（diver/reef-school/mackerel/turtle/
hammerhead/anglerfish/jellyfish.glb，共約 53MB）。三個用
`KHR_materials_pbrSpecularGlossiness`（diver、reef-school、turtle）的模型
**要先轉成標準 metal/rough**，不然 three.js 新版 `GLTFLoader` 不認得這個
舊擴充，材質會退化成預設灰色（花了一輪才抓到這個問題，一開始只看到灰色
無貼圖的魚）：

```bash
npx @gltf-transform/cli metalrough src/<name>.glb /tmp/<name>-mr.glb
npx @gltf-transform/cli optimize /tmp/<name>-mr.glb models/<name>.glb \
  --texture-compress webp --texture-size 512   # 小型魚用 256
```

其餘四個（mackerel／hammerhead／anglerfish／jellyfish）沒有這個擴充，
直接 `optimize` 即可。海龜跟鮟鱇魚的原始網格很密，額外加
`--simplify true --simplify-ratio 0.35~0.4 --simplify-error 0.01`。

壓縮後總大小約 **2.6MB**（遠低於 6MB 的目標）：

| 檔案 | 大小 |
|---|---|
| diver.glb | 340K |
| reef-school.glb | 1.2M |
| mackerel.glb | 88K |
| turtle.glb | 300K |
| hammerhead.glb | 56K |
| anglerfish.glb | 368K |
| jellyfish.glb | 300K |

### 授權標示狀態（已完成）

`public/landing/CREDITS.md` 與 `AppChrome.tsx` 頁尾都已列出七個模型的作者與授權
（全部 CC BY 4.0）。**來源以 `dive/models.ts` 的 `MODEL_REGISTRY[*].credit` 為準**；
新增或更換模型時，三處要一起改。

---

## 五、驗證狀態

### 已確認

- `npx tsc --noEmit` 通過
- `npm run build` 通過（production build，5 個路由都正常產生）
- 首頁 progress 0 / 0.25 / 0.5 / 0.75 / ~1.0 的截圖：深度讀數連續跟著
  捲動（0.0m → 1000.0m，後段明顯暴衝）、章節文字交叉淡出淡入正確（同一
  時間只有一段文字可讀）、七個真模型都有實際載入並顯示（不是替代幾何）
  ——珊瑚礁魚是彩色的熱帶魚、鯖魚成群、海龜與鎚頭鯊在深藍段出現、鮟鱇魚
  誘餌在深海段有微微發光
- 第二輪回饋的四點都有截圖確認：
  - 潛水員在 progress 0 時已經在畫面上方清楚可見（不用等模型泡完才出現）
  - 潛水員的螢幕位置在 progress 0 / 0.5 / 1.0 分別落在畫面上方／中央／
    下方，跟設計的 0.18→0.78 曲線一致
  - 畫面裡沒有光柱／光束／頭燈聚光燈，只有平光的漸層背景
  - 往上捲之後有觸發方向翻轉（`diveState.direction` 邏輯有被呼叫到）
- 移除 `.progress-armed` 後五章文字 opacity 全為 1，退回一般垂直長頁

### 沒驗到／驗得不完整（誠實記錄）

- **潛水員朝向翻轉的視覺確認不完整**：往上捲之後有截圖看到潛水員位置
  往上移，但因為潛水員本體較小、深度較深時顏色深，最後一次想貼近放大
  確認頭朝上的姿態時，取樣的截圖時間點沒抓到潛水員（牠在畫面上會因為
  生物環形漂移的動畫持續移動）。程式邏輯（`this.facing` 內插 pitch）
  已經 review 過，方向翻轉的訊號流（ScrollScene → diveState.direction →
  engine 的 `facingTarget`）也對照過，邏輯正確，但沒有拿到一張構圖夠好、
  清楚看到「頭朝上」姿態的截圖。
- **這個瀏覽器自動化環境本身有個怪癖，記下來省下一次 session 的除錯時間**：
  自動化的分頁 `document.hidden` 預設是 `true`（不算真的被瀏覽器丟到背景，
  但 Page Visibility API 這樣回報），而 `DiveEngine.start()` 裡的
  `if (document.hidden) return;` 會讓整支渲染迴圈跳過更新——這是刻意的
  設計（真實使用者切分頁時省電），但在這個自動化環境下代表「純粹呼叫
  JS 捲動」不會讓 3D 場景真的更新，只有呼叫截圖工具（`computer` 的
  `screenshot`／`zoom`）那一刻,瀏覽器才會真的跑一次渲染。要驗證 3D 場景
  的即時狀態,必須：`Object.defineProperty(document,'hidden',{get:()=>false})`
  ＋`dispatchEvent(new Event('visibilitychange'))`，然後每次想看最新畫面
  都要接著呼叫一次截圖工具（純粹讀 JS 屬性看不到渲染後的最新狀態）。
  這不是頁面的 bug，是這個特定自動化環境的限制。
- **手機寬度／效能／FPS**：跟第一輪交接記錄的狀況一樣，這個環境沒辦法
  真的縮視窗或量幀率，`isMobileSpec()` 的降規格邏輯只做了程式碼審查，
  沒有實機驗證。
- **深海生物「密度是否真的足夠」只驗了幾個 progress 取樣點**：`spawnInRange`
  的區間重疊與均勻分布是照邏輯設計的，但沒有連續捲動整段深海區間去確認
  中間有沒有意外的空窗（例如兩隻鮟鱇魚剛好都繞到鏡頭後方的那個瞬間）。

---

## 五之二、第三、四輪回饋之後的架構變動（取代部分第二節敘述；生物相關已再被第 11 輪更新）

使用者實測後又回饋了兩輪，改動的地方比較大，上面「二、現在的架構」有些段落
（尤其是攝影機落後、生物固定深度環繞、懸浮微粒）已經過時，這裡補正：

1. **攝影機不再刻意落後真實深度。** 上面提到的 `CAMERA_LAG_TAU=0.9s` 是
   round 2 的設計，round 3 發現這個「秒級落後」在深度暴衝段（見 depth.ts）
   永遠追不上，導致「深海生物看不到、淺水生物賴著不走」。現在攝影機只用
   一個 0.12 秒的數值平滑（`CAMERA_SMOOTH_TAU`）消除單幀跳動，幾乎等於
   直接等於真實深度。潛水員的螢幕垂直位置（progress 0→1 對應畫面
   30%→78% 高度）完全靠 `diverWorldYForFraction()` 反推攝影機視角算出來，
   不依賴攝影機的移動方式，所以拿掉落後不影響這件事。
2. **潛水員固定偏到畫面右側，文字改成左欄（CSS）。** `dive/engine.ts` 的
   `SCREEN_FRAC_X`：>=1024px（`narrowLayout` 判斷，見 `isNarrowLayout()`）
   時是 0.71（畫面偏右），窄螢幕時退回 0.5（置中）。CSS 那邊對應
   `globals.css` 的 `@media (min-width: 1024px)`，把 `.chapter-inner`
   整個挪到左欄（`margin-left: 7.5rem; width: 34rem`），這個斷點刻意跟
   `isNarrowLayout()` 的 1023px 對齊，兩邊要一起改才對得上。
3. **生物的移動方式整個重寫，不再是固定角速度繞圈。**（此段的 glide／solo 後來
   合併成 `straight`，現況見第二節「移動種類」。）見 `dive/engine.ts` 的 `MotionKind`：
   - 海龜／鎚頭鯊／鮟鱇魚是 `glide`——沿 X 軸單向緩慢移動，出邊界
     （`laneWidth`）從另一邊繞回來。
   - 鯖魚是 `school`——所有實例共用同一條用疊加正弦波做出的平滑漂移路徑
     （`pseudoNoise1D`），個體只加一個固定的隊形偏移（`formationOffset`），
     整群看起來像一起移動。
   - 珊瑚礁魚（reefSchool，模型本身已經是 4 條魚的小群組）是 `solo`——
     每個實例自己一條路徑，不用跟別的實例同步。
   - 水母是 `drift`——維持原本的環繞＋垂直漂浮，沒有明確前進方向。
   - `glide`／`school`／`solo` 都會呼叫 `orientToVelocity()`：拿當前的
     移動方向當 lookAt 目標，再疊加 `models.ts` 裡每個模型的 `travelYaw`
     （目前全部是 0，還沒有針對個別模型的朝向做過肉眼校正——見下面
     「沒驗到」）。
4. **懸浮微粒全部換成氣泡。** 舊版方形/圓點的 `THREE.Points`（marine snow）
   整個拿掉，換成 `THREE.Sprite` + canvas 畫的半透明氣泡貼圖
   （`buildBubbleTexture()`）：`ambientBubbles` 是散落在水柱裡的稀疏氣泡，
   一定往上飄、飄出視野頂端就從底部回收；`burstPool` 是潛水員規律吐氣
   （頭部位置，約 1.4~2.6 秒一次）借用的小氣泡池，重複利用不新建 Sprite。

### 第三、四輪的驗證重點

- **潛水員 progress=0 被頂端裁切**已修好：`SCREEN_FRAC_TOP` 從 0.18 提高到
  0.3。
- **潛水員螢幕位置到底有沒有到畫面下方 78%**：這件事肉眼從截圖判斷很不
  準——潛水員本體小、深海章節背景又接近全黑，光靠人眼在截圖裡目測百分比
  誤差可以到 10 幾個百分點。最後是直接在瀏覽器裡用
  `Vector3.project(camera)` 把潛水員的世界座標投影成螢幕座標算出精確值
  （見這次驗證過程），確認 progress=1 時螢幕高度落在 76~78%，跟設計值
  一致——**之後如果又懷疑這個數字不對，直接用 project() 量，不要用肉眼
  看截圖判斷**，這是這次繞了不少路才確認下來的教訓。
- 深度計時攝影機還沒完全追平真實深度前（大幅跳動捲動之後的一兩幀），
  潛水員螢幕位置仍然精準是 78%（因為算法本身就是攝影機不管在哪裡，
  diverY 都是相對攝影機算出來的），但畫面的整體「深度感」（背景色、
  濃霧、附近生物）會有一瞬間的過渡感——這是預期中的，不是 bug。
- 深海生物（鮟鱇魚／水母）在截圖裡有實際看到（含發光誘餌），但只驗了
  幾個離散的深度取樣點，沒有逐幀確認整段深海過程都不會有空窗。
- **生物朝向**：第 11 輪已量測校正（見第二節），待使用者肉眼確認；若又回報倒退游，先查物種，再調該模型 `travelYaw`（加減 `Math.PI` 或 `Math.PI/2`），不動 `orientToVelocity()`。
- 左欄排版跟潛水員置右在 >=1024px 的桌機視窗下用截圖確認過，沒有文字跟
  潛水員／魚群重疊的情況；窄視窗（<1024px）的置中退回邏輯只做了程式碼
  審查，沒有實機/縮視窗驗證（這個環境沒辦法可靠縮視窗，見第一輪交接
  就記錄過的限制）。

---

## 六、待辦

見檔案開頭「目前狀態」的未結事項。另外：改 `engine.ts` 時若加了 `window.__dive` 之類的除錯掛勾，改完要拿掉。

## 七、怎麼跑

```bash
cd /Users/sdsfg/sea-conditions/frontend
npm run dev     # 3000 常被佔用，實際埠號看輸出；用 pnpm 也可以（專案其實是 pnpm，見 pnpm-lock.yaml）
npx tsc --noEmit
npm run build
```

模型壓縮相關指令見上面「模型與壓縮」一節。

## 八、環境上的坑

- **這個專案實際上用 pnpm**（`pnpm-lock.yaml` 存在），但 `npm install` 也
  能跑、不會報錯，只是會產生一堆 `.pnpm` 路徑相關的 ERESOLVE 警告雜訊，
  而且**絕對不要在 `npm run dev` 還在跑的時候另開一個視窗跑 `npm run build`**
  ——兩者共用 `.next/` 快取目錄，同時寫入會讓 dev server 的 webpack 快取
  損毀，導致頁面回報 500（`Cannot find module './xxx.js'`）。中獎的話
  `rm -rf .next` 再重啟 dev server 就會恢復正常。
- `ffmpeg 9` 移除了 `-vsync`，`/watch` plugin 的腳本因此跑不起來——分析
  影片改用 ffmpeg 直接抽幀（這條是舊版遺留，3D 版沒再用到影片分析）
- 頁面上用 `window.scrollTo` 定位在瀏覽器自動化工具裡「設定值」是可靠的，
  但要讓 3D 場景讀到最新狀態，還要搭配上面第五節說的 `document.hidden`
  覆寫技巧＋截圖觸發，純粹呼叫 `window.scrollTo` 不夠
- 截圖偶爾會抓到整片空白或前一個狀態的影格，那是擷取瑕疵不是頁面壞掉——
  稍微等一下或多截一張再看
