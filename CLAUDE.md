# sea-conditions

只放這個專案才有的事。個人工作習慣在 `~/.claude/CLAUDE.md`，這裡不要重複。上限約 40 行。

## 怎麼跑
- 前端：`cd frontend && pnpm install && NEXT_PUBLIC_API_BASE=https://sea-conditions-api.onrender.com pnpm dev -p 3006`
  （不設的話打本機後端 `localhost:8000`）。dev server 開著時不要在同一個目錄跑 production build。
- 後端：`cd backend && source .venv/bin/activate && python -m app.seed && uvicorn app.main:app --reload`。
  本機 Python 是 3.9：SQLAlchemy／Pydantic 的註解保留 `Optional[...]`。
- 測試 / 型別檢查：跟 CI 一樣（`.github/workflows/ci-frontend.yml`、`ci-backend.yml`）。
- 首頁 3D 截圖驗收：一般深度截圖用 `/verify-visual --probe`；`tools/dive-shots/` 只放專案專用的（`flashpair.mjs`、`closeup.mjs` 需要 dev 模式的 `window.__diveProbe`）。

## 部署
- 前端 Vercel、後端 Render（`render.yaml`，Docker），都是 push 到 `main` 自動部署。
  海況資料由 GitHub Actions `daily-refresh.yml` 直接寫 Supabase。
- 確認新版本上線：
  - 後端：`curl -s https://sea-conditions-api.onrender.com/health` 的 `commit` 要等於 `git rev-parse --short=7 origin/main`
    （Render 免費方案會休眠，第一次可能要等約 50 秒）。
  - 前端：`curl -s https://sea-conditions.vercel.app/ | grep <只有新版才有的字串>`，不要只看首頁有沒有開。
  - 排程：看 Actions log 裡的 `updated_locations / total_locations`，不是只看綠勾。

## 地雷
- 見 `PROBLEM_LOG.md` 的「避免」欄（SessionStart 會自動載入）。
- 首頁降級是硬性要求：捲動相關 CSS 都 scope 在 `.progress-armed` 底下；`prefers-reduced-motion` 或沒有 WebGL 時不建立 `DiveEngine`，退回純 CSS 漸層長頁。
- 首頁捲動節奏（`landing/depth.ts`）和深海段長度沒有定案，要改先問使用者。
- 相關的跨專案教訓（做到時才讀）：`~/.claude/lessons/3d-webgl.md`（首頁 3D）、
  `frontend-css.md`（版面）、`ops-scheduled.md`（排程與資料新鮮度）。
- 模型來源、壓縮指令、首頁 3D 早期的架構紀錄：`docs/archive/LANDING_HANDOFF.md`。

## 這個專案的驗收標準
- 「懂潛水的使用者看了會滿意嗎」：生物的比例、深度、游法要對；深海要測手電筒照到／沒照到的對比。
- UI 上的新鮮度承諾（「每 3 小時更新」）要跟實際執行紀錄對過才寫。

## 文件維護
- 改到啟動方式、部署平台、對外功能時，同一個 commit 更新 `README.md`。
- 每輪工作結束更新 `HANDOFF.md`；每個新問題加進 `PROBLEM_LOG.md`。
