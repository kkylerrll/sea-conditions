# 首頁改版交接（未完成，工作區未 commit）

這份是給下一個 session 的交接。工作全部在工作區，**沒有任何 commit**。

---

## 一、使用者要的是什麼

使用者傳了兩支 IG 風格的參考影片（分析過逐幀畫面），要首頁做成同樣的效果：

**參考效果＝把捲動當播放頭的分章式敘事。** 一個滿版 sticky 舞台，捲動不是把內容往上推，而是在章節之間過帶；左側有狀態指示、底部有時間軸進度條；深色、電影感、滿版真實照片。

使用者另外要求：**圖片從線上免費圖庫抓。**

### 兩次回饋（重要，決定了現在的架構）

1. 第一版做成五章交叉溶接之後，使用者說：

   > 但我想要的效果是持續潛水的效果 而不是往下滑只是單純的換圖片 可以多一點互動感

   → 根因是**所有東西都放在「章節」裡面**，所以每個元素都跟著章節淡入淡出，必然讀起來像換圖。修法是把連續的元素移到章節**外面**（見下方「水體層」）。

2. 使用者指定後續實作交給 Sonnet 執行，主 session 只負責討論。

---

## 二、現在的架構

### 資料流：只有一個 rAF

`ScrollScene.tsx` 掛一個 scroll listener ＋ 一個 rAF，每幀寫出：

| 寫出的東西 | 用途 |
|---|---|
| `--progress` 0→1 | 捲動進度＝深度。幾乎所有 CSS 效果都讀它 |
| `--scroll-vel` 0→1 | 捲動快慢，停手後自行衰減（衰減用的 rAF 只在速度 > 0 時存在） |
| `--pointer-x` / `--pointer-y` | 游標視差（另一個 passive pointermove listener） |
| `[data-depth-readout]` 的 `textContent` | 深度讀數。**刻意不走 React state**，這個數字每幀都變，走 state 等於每幀 re-render 整棵樹 |
| `.is-active` | 只在跨章時 toggle，不是每幀 |

**其餘全部是 CSS 讀這些變數算出來的。** 不要新增 scroll listener，不要做逐幀樣式計算，不要加套件。

### 降級（這是硬性要求，不要破壞）

所有捲動相關的 CSS 都 scope 在 `.progress-armed` 底下。這個 class 只有在「JS 有跑」**且**「`prefers-reduced-motion` 關閉」時才會掛上。

沒有它的時候：整頁退回一般垂直長頁，五章依序堆疊、全部可見可讀。

`.water-column` 和 `.depth-meter` 預設都是 `display: none`，只在 `.progress-armed` 下出現 —— 這是刻意的：一個永遠停在 0.0 的深度讀數比沒有讀數更糟。

**絕對不要讓任何內容依賴 `--progress` 有被設值**，否則沒 JS 就會整片空白。

### 圖層順序（sticky 舞台內）

```
照片 z-index:0  →  水體 1  →  章節文字 2  →  深度計／進度條 3
```

水體必須夾在照片和文字中間，文字才不會被微粒蓋住。

---

## 三、檔案

### 新增

| 檔案 | 作用 |
|---|---|
| `src/components/landing/chapters.tsx` | 五章資料（`CHAPTERS`, `CHAPTER_SPAN`） |
| `src/components/landing/ChapterMedia.tsx` | 每章的 `<picture>` ＋ scrim ＋ 暈影 |
| `src/components/landing/ChapterChrome.tsx` | 底部進度條 |
| `src/components/landing/WaterColumn.tsx` | **水體層**：光柱、懸浮微粒、氣泡、水色 |
| `src/components/landing/waterColumnField.ts` | 粒子座標 |
| `src/components/landing/DepthMeter.tsx` | 連續深度讀數 ＋ 刻度 ＋ 游標 |
| `src/components/landing/depth.ts` | `MAX_DEPTH_M = 40`、`SURFACE_PORTION = 0.45`、`depthAt()` |
| `public/landing/` | 五張照片 × (1920 / 960 / lqip) WebP，共約 988K |
| `public/landing/CREDITS.md` | 照片授權清單 |

### 修改

`src/app/page.tsx`（重寫成五章）、`src/app/globals.css`（首頁 CSS 全部換掉）、`src/components/landing/ScrollScene.tsx`（加了速度／深度／游標）、`src/components/AppChrome.tsx`（頁尾加版權標示）、`src/components/landing/InfoPoints.tsx`（`CARD` 簡化成 `"dive-info-card"`）

### 五章內容

| # | 英文 | 照片 | 標題 | 搭配 |
|---|---|---|---|---|
| 00 | THE SURFACE | surf-barrel | 海況去不去 | CTA |
| 01 | THE SWELL | surf-lineup | 同一道浪，兩種答案 | `DiveSurfContrastInfo` |
| 02 | THE WATERLINE | waterline | 全台海況，一次看完 | `CoverageInfo` |
| 03 | THE DIVE | dive-reef | 資料一天更新兩次 | `UpdateRhythmInfo` |
| 04 | THE DEEP | deep-blue | 下水前，先看今天的海況 | CTA |

原本首頁的文案內容（13 地區 / 46 下水點、潛水衝浪燈號對比、一天更新兩次）全部保留，放進對應章節。

---

## 四、動到會壞的地方

### 1. `SURFACE_PORTION = 0.45` 同時寫在三個地方

- `depth.ts` 的 `SURFACE_PORTION`
- `globals.css` 的 `.depth-cursor` 的 `top`（`(var(--progress) - 0.45) / 0.55`）
- `globals.css` 的 `.progress-armed .water-column` 的 `opacity`（門檻 `0.44`）

**改一個就要三個一起改。**

這個值被章節內容綁死：00、01 兩章是**水面上**的衝浪照片，真正破水面的是第 02 章（progress 0.5）。曾經設成 0.22，結果畫面是「水面上的衝浪照片疊著水下懸浮微粒，旁邊寫著 6.2m」，自相矛盾。

若章節有增減：`SURFACE_PORTION = (越線章索引 - 0.5) / (章節數 - 1)`。

### 2. 交叉溶接的兩條曲線

```css
--vis:  clamp(0, calc((0.75 - var(--dist)) / 0.5), 1);   /* 底圖，溶接窗較寬 */
--vis2: clamp(0, calc((0.45 - var(--dist)) / 0.25), 1);  /* 文字，收得比較早 */
```

`--vis2` 在兩章正中間是 0（兩邊都是），所以文字是「上一段先退乾淨、下一段才進來」。
**這是修過的 bug**：原本兩章的文字會同時 opacity 1，兩段字疊在一起同時可讀。

### 3. 暗化是三層疊加

`chapter-media-scrim` ＋ `chapter-media-vignette` ＋ `water-tint`。三層都吃滿的話深水段的潛水員會整個沒入黑色 —— 深度感有了，但照片等於白放。已經調過一次配比，再動要一起看。

### 4. `waterColumnField.ts` 的座標是手寫的

刻意不規則。**不要用 `Array.from` 或迴圈重新產生** —— 均勻產生的粒子場肉眼看得出行列，一看就知道是程式畫的。

### 5. 版權標示不能拿掉

照片是 CC BY / CC BY-SA，**標示作者是授權條件**。標示在 `AppChrome.tsx` 頁尾，完整清單在 `public/landing/CREDITS.md`。
BY-SA 的「相同方式分享」及於縮圖轉檔後的檔案本身，不影響專案其他部分。

照片來源：Wikimedia Commons（Unsplash / Pexels 從指令列會被 Cloudflare 擋，Commons 是唯一能穩定抓原圖的來源；注意 Commons 的 `/thumb/` 路徑會 400，要抓原圖再本地縮）。

---

## 五、驗證狀態

### 已親眼確認

- 深度讀數 0.0m → 40.0m 連續跟著捲動，游標位置與讀數一致
- 兩章之間只有一段文字可讀（先前會疊在一起，已修）
- 01 湧浪乾淨銳利、無水下霧氣（入水點修正後）
- 03 / 04 潛水員在深藍中清楚可見（暗化配比調整後）
- 02 越線破水面的敘事成立（照片最柔最霧，但霧感呼應「越線」，**Sonnet 建議不換**）
- 底部進度條填色與 active 編號正確
- 微粒拖尾機制運作（靜止 1 倍 → 全速 5.5 倍）
- 無 JS 降級：移除 `.progress-armed` 後五章文字 opacity 全為 1，水體與深度計隱藏
- `npx tsc --noEmit` 通過

### 沒驗到（誠實記錄）

- **手機寬度 390px**：`resize_window` 在這個環境沒有真的改變 viewport，只能讀 CSS 確認 `@media (max-width: 639px)` 的邏輯存在（深度計隱藏、粒子 `nth-child(2n)` 砍半）。**建議使用者自己縮視窗或用手機看。**
- **效能 / 掉幀**：自動化過程分頁會失焦（`document.hidden`），量到的 FPS 是假的。肉眼看多次截圖沒有明顯卡頓，但不等於真機測過。因為沒有實證，**沒有動粒子數**。
  - 潛在風險：24 顆微粒每幀都要重算 `scale`（因為 `--scroll-vel` 每幀在變）。`scale` 是可合成屬性，理論上留在 compositor，但沒實測。若真的掉幀，先減 `waterColumnField.ts` 的粒子數，不要拿掉效果。

---

## 六、待決事項（都還沒做，等使用者決定）

### 1. 兩章正中間的「雙重曝光」——最主要的待辦

**現象**：兩章交界（例如 00/01）時，兩張照片幾乎等透明度疊在一起，還會透出下一章資訊卡的文字，看起來像雙重曝光的錯圖，不只是「有點糊」。

**根因**：交叉溶接本身。兩張照片在中點各 50%，調時間窗只能改變糊多久，躲不掉。

**主 session 的建議（已向使用者提出，尚未回覆）**：
> 換成**中間過一層深色**，而不是讓兩張照片互相穿透 —— 上一章沉進暗處、下一章從暗處浮出來。潛水本來就會穿過一層層光線遞減的水層，所以這不只是修 bug，它本身就是下沉敘事的一部分。

替代方案：把交叉窗縮到很窄，接近硬切。乾淨但失去電影感，比較像投影片翻頁。

### 2. 上一輪的 SVG 場景檔要不要刪

`SurfHero.tsx`、`WaterlineScene.tsx`、`DiveScene.tsx`、`DeepScene.tsx`、`SceneDefs.tsx`、`wave.ts`

現在沒有任何地方引用。**在 git 裡是未追蹤狀態，刪掉救不回來**，所以一直留著沒動。等使用者決定。

---

## 七、怎麼跑

```bash
cd /Users/sdsfg/sea-conditions/frontend
npm run dev     # 3000-3002 常被佔用，實際埠號看輸出
npx tsc --noEmit
```

## 八、環境上的坑

- `ffmpeg 9` 移除了 `-vsync`，`/watch` plugin 的腳本因此跑不起來 —— 分析影片改用 ffmpeg 直接抽幀
- `ffmpeg` 沒有 `libwebp` encoder，轉 WebP 要用 `cwebp`（已隨 yt-dlp 裝進來）
- 頁面上用 `window.scrollTo` 定位不可靠，用瀏覽器工具的 scroll 動作
- 截圖偶爾會抓到整片空白的影格，那是擷取瑕疵不是頁面壞掉 —— 稍微捲動觸發重繪再截一次
