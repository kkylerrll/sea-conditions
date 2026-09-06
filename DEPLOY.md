# 部署上線指南

```
        ┌─────────────┐         ┌──────────────────┐         ┌────────────────┐
瀏覽器 → │  Vercel     │  fetch  │  Render (新加坡)  │  SQL    │  Supabase      │
手機   → │  前端 Next  │ ──────► │  後端 FastAPI     │ ──────► │  Postgres      │
        └─────────────┘         └──────────────────┘         └────────────────┘
                                        ▲
                                        │ 每天 POST /api/refresh
                                ┌───────────────────┐
                                │ GitHub Actions cron│
                                └───────────────────┘
```

三個平台都有免費方案、都不需信用卡（原本規劃的 Fly 需綁卡，改用 Render）。

| 平台 | 角色 | 免費方案限制 |
|---|---|---|
| Vercel | 前端 Next.js | Hobby 無限制夠用 |
| Render | 後端 FastAPI | 閒置 15 分鐘休眠，下一個請求冷啟動 ~50 秒 |
| Supabase | Postgres | 500MB、7 天完全無連線會暫停 |

---

## 進度

- [x] 步驟 1：GitHub repo — https://github.com/kkylerrll/sea-conditions
- [x] 步驟 2：Supabase 專案（連線字串已取得）
- [ ] 步驟 3：後端 → Render
- [ ] 步驟 4：前端 → Vercel
- [ ] 步驟 5：接 CORS + 每日排程

`DATABASE_URL`（後端格式）：
```
postgresql+psycopg://postgres.<project_ref>:<你的密碼>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require
```
（`<...>` 換成實際值。**別 commit 這串。**）

---

## 步驟 3：後端 → Render（你操作，約 5 分鐘）

`render.yaml`（repo 根目錄）已寫好，Render 會照它自動建立服務。

1. https://render.com → **Get Started** → 用 **GitHub** 登入 → 授權 Render 讀取 `sea-conditions` repo
2. Dashboard → **New +** → **Blueprint**
3. 選 `sea-conditions` repo → Render 讀到 `render.yaml` → 顯示要建立 `sea-conditions-api`（web, docker, free, singapore）
4. 它會列出 3 個要你填的環境變數：
   - `DATABASE_URL` = 上面那串 Supabase 連線字串（`postgresql+psycopg://...?sslmode=require`）
   - `CWA_API_KEY` = 你的中央氣象署金鑰（`CWA-...`）
   - `CORS_ORIGINS` = 先填 `https://placeholder`（步驟 5 再改成 Vercel 網址）
5. **Apply** → Render 開始 build（Docker，第一次約 3–5 分鐘）
6. 完成後服務網址是 `https://sea-conditions-api.onrender.com`（若名稱被佔用會是 `-xxxx` 後綴，以 Render 顯示為準）

### 驗證後端

```bash
curl https://sea-conditions-api.onrender.com/health
# → {"status":"ok","llm":false,"db":"postgresql"}

# 第一次啟動會自動建表 + seed 6 個潛點。再抓一次真實海況：
curl -X POST 'https://sea-conditions-api.onrender.com/api/refresh?wait=true'
# （冷啟動時第一發可能要等 ~60 秒，正常）
```

> 之後要開 AI 建議：Render 服務 → Environment → 加 `ANTHROPIC_API_KEY`、把 `USE_LLM` 改 `true`、
> `LLM_MODEL` 設 `claude-sonnet-5`，存檔會自動重部署。

---

## 步驟 4：前端 → Vercel（你操作，約 3 分鐘）

1. https://vercel.com → 用 **GitHub** 登入 → **Add New → Project** → 選 `sea-conditions`
2. **Root Directory** 設為 `frontend`（重要，這是 monorepo）
3. Framework 自動偵測 Next.js，Build/Output 用預設
4. **Environment Variables** 加一個：
   - `NEXT_PUBLIC_API_BASE` = `https://sea-conditions-api.onrender.com`（步驟 3 的後端網址）
5. **Deploy** → 完成後拿到前端網址，例如 `https://sea-conditions.vercel.app`

---

## 步驟 5：把三邊接起來

1. **後端 CORS 放行前端網址**：
   Render → `sea-conditions-api` → **Environment** → 把 `CORS_ORIGINS` 改成你的 Vercel 網址
   （例：`https://sea-conditions.vercel.app`）→ 存檔（會自動重部署）

2. **每日自動更新**：
   GitHub repo → **Settings → Secrets and variables → Actions → Variables 分頁 → New repository variable**
   - Name：`API_BASE`
   - Value：`https://sea-conditions-api.onrender.com`

   （workflow `.github/workflows/daily-refresh.yml` 已在 repo 裡，每天台灣時間 05:30 / 12:30 跑，
   順便讓 Render 服務保持喚醒。）

---

## 步驟 6：驗收

- 開 `https://<你的>.vercel.app` → 6 張潛點卡片有真實浪高/風力/水溫（首開若卡一下是 Render 冷啟動）
- 點任一潛點 → 未來 4 天、潮汐時間有值
- 手機開同一個網址 → 單欄排版；Safari「加入主畫面」變 app icon
- GitHub → Actions → 手動觸發一次「每日更新海況」→ 綠勾

---

## 每月成本

| 項目 | 費用 |
|---|---|
| Vercel Hobby | $0 |
| Render Free（後端）| $0 |
| Supabase Free | $0 |
| GitHub Actions（public repo）| $0 |
| Open-Meteo / CWA API | $0 |
| **合計** | **$0**（不開 AI 建議的話）|

代價：Render 免費方案閒置會休眠，冷啟動 ~50 秒。要無休眠就升 Render Starter（$7/月）或改回 Fly（綁卡，~$2–4/月，`backend/fly.toml` 已備妥）。

---

## 之後要補的（非上線必須）

- **Alembic migration**：目前靠 `Base.metadata.create_all` 建表，改 schema 不會自動遷移。
- **`/api/refresh` 加保護**：現在是公開端點（只是重抓資料、上游 API 免費，風險低）。可加 `REFRESH_TOKEN`。
- **前端「重新抓海況」按鈕**：若之後 refresh 加了 token，要改走 Next.js route handler 代打。
- **Supabase 暫停**：每日 cron 會持續連線，通常不會被暫停。
