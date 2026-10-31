# 交接（2026-10-31）

給下一個 session：**只寫現在的狀態和接下來要做的事**。讀的時候比對日期和程式碼，舊的就當假設。
開工前先讀 `PROBLEM_LOG.md`。專案規則在 `CLAUDE.md`。

## 現在狀態

| 項目 | 狀態 |
|---|---|
| 正式網站 | https://sea-conditions.vercel.app（`main`，含 PR #5 海面開場／寫實生物／真實地圖） |
| 正式 API | https://sea-conditions-api.onrender.com/api/locations |
| 排程 | `daily-refresh.yml`，PR #7 改批次請求後 13/13 地點成功 |
| 預覽 | `/Users/sdsfg/sea-conditions/frontend` 的 `pnpm dev`，http://localhost:3006（`creature-realism`）。port 3000 是別的專案（Findash） |

### 未合併的分支

**`creature-realism`**（主目錄，已 push）：首頁生物大修。真實比例（`models.ts` 的 `bodyLengthM`，以潛水員 1.8m 為基準）、
水母扶正、深海全黑只靠手電筒和自體發光、海雪、櫛水母、燈籠魚、手電筒由潛水員拿著、結尾固定構圖、
沒照到的生物融進背景（`abyssHide.ts`）。另有這次的文件整理（本檔、`CLAUDE.md`、`LANDING_HANDOFF.md` 移到 `docs/archive/`）。
**使用者還沒親眼確認，所以沒合併。** 驗收截圖在 `.claude/handoff-shots/`（沒進 git）：`before/`、`final4/`。

**`dev-kit`**（worktree `.claude/worktrees/dev-kit`，從 `main` 開，**還沒 push**）：套用 project-kit。
- CI 換成 `ci-frontend.yml`（tsc、ESLint、vitest、build）和 `ci-backend.yml`（ruff、mypy、pytest、Docker build），刪掉舊 `ci.yml`。
- 本機全部通過：ruff、mypy 0 錯誤；pytest 36 個；vitest 26 個（`landing/depth.ts`）；前端 build 通過。
  也把 `creature-realism` 的 `frontend/src` 套進去試過 lint 和 tsc，沒有新錯誤。
- `backend/ruff.toml`：保留 `Optional[...]`（本機 3.9，見 PROBLEM_LOG 2026-10-31）。前端新增 ESLint（`eslint@8`、`eslint-config-next@14.2.15`）。
- `refresh.py`：**任何地點沒更新到就 exit 1**（以前只有全失敗才紅）；CWA 潮汐「請求成功但解析不到資料」也計入失敗並列出地點。
  合併後 Actions 會開始出現基隆市、高雄市潮汐的 warning，這是預期的。
- `/health` 多回傳 `commit`（`RENDER_GIT_COMMIT` 前 7 碼），部署後用來確認新版本上線。
- README 改成現況；刪掉 `backend/fly.toml`。
- 兩個分支改到的檔案不重疊，合併順序不拘。

## 接下來（依優先順序）

1. **`creature-realism` 給使用者確認後合併**：開 PR → CI 綠燈 → 合併 → 主目錄 `pnpm install`。
2. **`dev-kit` push、開 PR**（使用者同意後）。第一次跑新 CI 時確認 Docker build 那步也綠。
3. **拆 `frontend/src/components/landing/dive/engine.ts`**（約 2,900 行），**要等 1 合併後**：
   每種生物一個共同介面（`kind`、`depthRange`、`bodyLengthM`、`create()`、`update(t, depth)`）加 registry，engine 只管迴圈和光照。
   拆之前用 `/verify-visual` 拍基準：`--probe "parseFloat(document.querySelector('[data-depth-readout]').textContent)" --targets 5,30,150,600,1000 --gpu --label before`，
   拆完拍 `--label after` 再跑 `compare.mjs`。
4. **清理**：`.claude/worktrees/` 底下 `ocean-surface`、`fix-refresh`、`live-cams` 已合併，可以刪；`daytime-verdict` 等 PR #6 決定。

## 還沒決定、要問使用者的

- **PR #6 `daytime-verdict`**（每日燈號改依白天最佳時段）：CI 綠燈，等使用者決定要不要合併。只動後端。
- **排程頻率跟文案不一致**：cron 寫每 3 小時，GitHub 實際約 5～7 小時一次，首頁卻寫「每 3 小時更新」。
  用外部 cron（例如 cron-job.org）觸發 `workflow_dispatch`，還是改文案？
- **線上 AI 建議是關的**（`USE_LLM: "false"`，也沒有 `ANTHROPIC_API_KEY` secret）。要開會花錢。
- 首頁 0～40m 做得更精緻（小琉球綠蠵龜、綠島礁岩、台灣真實魚種）；深海段要不要縮短**沒有定案**，不要自己改 `depth.ts` 的捲動節奏。

## 已知還不夠好（`creature-realism`）

- 300～600m 的生物集中在畫面右半邊（避開左邊文字），有點擠。
- 手機版潛水員剛好在 CTA 正下方。
- 淺水的海月水母照真實比例約 30px，偏扁。
- **沒量 FPS，沒在真機（尤其手機）跑過**，驗收全是無頭 Chrome 截圖。
- 櫛水母（3×）、燈籠魚（2.5×）、鮟鱇魚（2×）是刻意放大的，程式碼有註解。
