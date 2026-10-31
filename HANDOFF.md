# 交接（2026-10-31）

給下一個 session。**開工前先讀 `PROBLEM_LOG.md`**（問題紀錄：症狀 → 根因 → 修法 → 以後怎麼避免）。
首頁 3D 的歷史細節在 `LANDING_HANDOFF.md`（第 1～19 輪），這份只寫**現在的狀態和接下來要做的事**。

---

## 一、現在在哪裡

| 項目 | 狀態 |
|---|---|
| 正式網站 | https://sea-conditions.vercel.app （main，已含 PR #5 海面開場／寫實生物／真實地圖／地區頁改版） |
| 正式 API | https://sea-conditions-api.onrender.com/api/locations |
| 本機主目錄 | `/Users/sdsfg/sea-conditions`，分支 **`creature-realism`**（比 main 多 10 個 commit，**還沒合併、沒上線**） |
| 排程 | GitHub Actions `daily-refresh.yml`，PR #7 改成批次請求後 13/13 地點都成功 |

### 待合併的分支 `creature-realism`：首頁生物大修

使用者在正式版上覺得「魚的比例很怪、20–40m 一大群怪魚、水母游法怪、神仙魚怪」，這個分支就是修正版。
**使用者還沒親眼確認，所以沒合併。** 下一步：使用者看過說可以 → 開 PR → CI 綠燈 → 合併。

這個分支做了什麼（commit 由舊到新）：
1. `81a206c` **真實比例**：`models.ts` 每種生物有 `bodyLengthM`，用 bbox 自動算 scale（`UNITS_PER_M` 約 0.605，以潛水員 1.8m 為基準）。另外修掉一個隱藏 bug：placeholder 的 2.5×／2× 放大沒有清掉。鮪魚群減到 10 隻，只在 15–45m。蝴蝶魚改成身體不動、只擺尾。修掉 favicon 404。
2. `3acd8f6` 水母扶正：拿掉根骨頭 `Pos_204` 的動畫 track（`stripNodeTracks`），再用 PCA 扶正。鮟鱇魚放大。
3. `4d4e1fc` 新增 `PROBLEM_LOG.md`、`CLAUDE.md`。
4. `4910a51` **深海全黑**：150–300m 平光淡到約 0，生物只靠手電筒和自體發光被看見。
5. `e78baf4` **海雪**（`marineSnow.ts`）：一次 draw call，30m 以下，越深越密。
6. `dbc30ed` **物種位置修正**：海月水母搬回 5–25m；深淵改成程序化**櫛水母**（`combJellies.ts`，彩虹櫛帶 shader）。
7. `a4e03b3` **燈籠魚**（`lanternfish.ts`）：200–600m，InstancedMesh 魚身加藍色發光點。
8. `006139d` 最後一章讓出 CTA：標題和按鈕加 `data-dive-exclude`，生物和海雪會避開。
9. `16a558a` 手電筒改由潛水員拿著；結尾改成固定構圖；開發用探針 `window.__diveProbe`（只在非 production 掛上）。
10. `f6d1ad0` 沒照到的生物融進背景色（`abyssHide.ts`），不再是黑色剪影；修好潛水員的輪廓光（three r154 把 `output_fragment` 改名成 `opaque_fragment`，以前一直沒生效）；櫛水母觸手改短並加側絲。

驗收截圖（**沒有進 git**，放在 `.claude/handoff-shots/`）：
- `before/`：修正前的正式版，8 個深度（d0008…d0900）
- `final4/`：修正後的 8 個深度，加上 `flashpair-600m/`（手電筒照到／沒照到）、`combjelly-closeup.png`、`lanternfish-400m.png`、`cta-final-1000m.png`、`cta-final-1000m-mobile.png`

### 已知還不夠好（`creature-realism` 上）
- 300–600m 的生物集中在畫面右半邊（為了避開左邊文字），有點擠。
- 手機版潛水員剛好在 CTA 正下方（原本的版面）。
- 淺水的海月水母照真實比例約 30px，偏扁。
- **沒量 FPS，沒在真機（尤其是手機）跑過。** 驗收全部是無頭 Chrome 截圖。
- 櫛水母（3×）、燈籠魚（2.5×）、鮟鱇魚（2×）是刻意放大的，程式碼有註解。

---

## 二、怎麼在本機預覽

```bash
cd frontend
pnpm install                       # 合併新分支後一定要重裝（lenis、maplibre-gl 等）
NEXT_PUBLIC_API_BASE=https://sea-conditions-api.onrender.com pnpm dev -p 3006
```
- 不加 `NEXT_PUBLIC_API_BASE` 的話，`.env.local` 會指向本機後端 `localhost:8000`；沒開後端，詳情頁就會 404。
- **dev server 開著的時候不要跑 `next build`**（兩邊都會寫 `.next/`，dev server 會壞掉）。型別檢查用 `npx tsc --noEmit`。

## 三、截圖驗收工具（`tools/dive-shots/`）

```bash
cd tools/dive-shots && npm install          # 只裝 playwright-core，用本機的 Google Chrome
node shoot.mjs http://localhost:3006/ out/run1 8,15,25,35,100,300,600,900
FRAMES=4 GAP=400 node shoot.mjs http://localhost:3006/ out/motion 600   # 連拍看動作
node flashpair.mjs http://localhost:3006/ out/flash 600 anglerfish      # 手電筒照到／沒照到對比（需要 dev 模式的 __diveProbe）
node closeup.mjs http://localhost:3006 out/close jellyfish 4 130        # ?diveDebug=<kind> 特寫
```
`shoot.mjs` 會用二分法捲到指定深度（讀 `[data-depth-readout]`），等 2.5 秒後截圖。視覺修改**一定要比對修正前後的截圖**；動作要看連拍，單張截圖看不出運動問題。

---

## 四、待辦（依優先順序）

1. **`creature-realism` 給使用者確認後合併上線**（見第一節）。合併後在主目錄 `pnpm install`。
2. **PR #6 `daytime-verdict`**（每日燈號改成依白天最佳時段）：CI 綠燈、可以合併，還在等使用者決定。只動到後端（`schemas.py`、`advice.py`、`build.py`）。
3. **排程頻率和文案不一致**：cron 是 `0 */3 * * *`，但 GitHub 實際一天只跑大約 4 次（間隔 5–7 小時），首頁卻寫「每 3 小時更新」。二選一：用外部 cron（例如 cron-job.org）觸發 `workflow_dispatch`，或修改文案。
4. **線上 AI 建議是關的**：`daily-refresh.yml` 寫死 `USE_LLM: "false"`，Secrets 也沒有 `ANTHROPIC_API_KEY`，所以都是模板句。要不要開，要先問使用者（會花錢）。
5. **CWA 潮汐解析失敗沒有被計入**：log 有出現基隆市、高雄市「沒有解析到任何資料」，但 `tide_failed` 仍然是 0，Actions 不會出現警告。
6. **清理**：`.claude/worktrees/` 底下有 4 個舊的 agent worktree（`ocean-surface`、`fix-refresh`、`live-cams` 都已合併；`daytime-verdict` 等 PR #6 處理完再刪），本機也有已合併的舊分支。
7. **README 過時**：還寫著 Fly.io、每天更新、6 個潛點，實際是 Render 加 Actions、每 3 小時排程、13 個地區。
8. 使用者提過、還沒做的方向：首頁 0–40m（使用者真正會潛的深度）做得更精緻，例如小琉球的綠蠵龜、綠島的礁岩、台灣真實的魚種。深海段要不要縮短**沒有定案**，不要自己改捲動節奏（`depth.ts`），要先問使用者。

---

## 五、跟這位使用者合作要注意的事

- 已經知道怎麼做的事，**直接依序做完、自己截圖驗收，合格才交出去**。不要做一步問一步，也不要交出「沒有 bug 但不好看」的東西。驗收標準是「懂潛水的使用者看了會滿意嗎」。
- 一般的 UI 修改不要用瀏覽器自動化幫使用者驗證（很耗 token），由使用者自己看。例外是視覺設計工作，實作者要用無頭截圖自我檢查（第三節的工具）。
- 每遇到新問題，都要在 `PROBLEM_LOG.md` 最上面加一條。
- 用繁體中文溝通；commit 訊息也用繁體中文。
