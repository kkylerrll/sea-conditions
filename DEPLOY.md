# 部署上線指南

```
        ┌─────────────┐         ┌──────────────────┐         ┌────────────────┐
瀏覽器 → │  Vercel     │  fetch  │   Fly.io (東京)   │  SQL    │  Supabase      │
手機   → │  前端 Next  │ ──────► │   後端 FastAPI    │ ──────► │  Postgres      │
        └─────────────┘         └──────────────────┘         └────────────────┘
                                        ▲
                                        │ 每天 POST /api/refresh
                                ┌───────────────────┐
                                │ GitHub Actions cron│
                                └───────────────────┘
```

分三個平台的原因：前端是靜態 + SSR，Vercel 對 Next.js 最省事且免費；後端是長駐 Python
服務，放 Fly（你已有帳號）；DB 用 Supabase 是因為第二層社群功能會用到它的 Auth 與 Storage，
現在先只用它的 Postgres。

---

## 需要你動手的 3 件事（都要瀏覽器登入，我無法代勞）

| 步驟 | 你做 | 完成後給我 |
|---|---|---|
| 1. GitHub repo | 建一個 **public** repo | repo 的 SSH 或 HTTPS URL |
| 2. Supabase | 建 project、複製連線字串 | 格式化後的 `DATABASE_URL`（機密，用安全管道給我，或自己設 `fly secrets`）|
| 4. Vercel | 匯入 repo、設一個環境變數 | 部署後的網址（例：`https://xxx.vercel.app`）|

步驟 3（Fly 後端部署）我可以直接做——你的 `fly` CLI 已登入。

---

## 步驟 1：GitHub repo（你）

在 https://github.com/new 建立：

- Repository name：`sea-conditions`（或你喜歡的）
- 選 **Public**
- **不要**勾 "Add a README / .gitignore / license"（本機已經有了）

建完後把 URL 給我，我執行：

```bash
git remote add origin <你的-repo-url>
git branch -M main
git push -u origin main
```

（或你自己跑這三行也行。）

---

## 步驟 2：Supabase Postgres（你）

1. https://supabase.com → 用 GitHub 登入 → **New project**
   - Name：`sea-conditions`
   - Database Password：**自己設一個強密碼並記下來**（等下會用到）
   - Region：**Southeast Asia (Singapore)**（離台灣最近的選項）
   - Plan：Free
2. 專案建好後（約 2 分鐘），左下 **Project Settings → Database**
3. 找到 **Connection string → 選 `Session pooler`**（不是 Transaction pooler）
   - 會長這樣：
     `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
4. 改成後端能用的格式：把開頭的 `postgresql://` 換成 `postgresql+psycopg://`，
   `[YOUR-PASSWORD]` 換成你剛設的密碼，結尾加上 `?sslmode=require`：
   ```
   postgresql+psycopg://postgres.abcdefgh:你的密碼@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```
   這就是 `DATABASE_URL`。

> 為什麼用 Session pooler 而不是 Transaction pooler / 直連：
> - 直連（`db.xxx.supabase.co:5432`）只給 IPv6，Fly 走 IPv4 會連不到。
> - Transaction pooler（6543 埠）不支援 SQLAlchemy 會用到的 prepared statements。
> - Session pooler（pooler 主機的 5432 埠）走 IPv4、行為跟直連一樣，最穩。

**這串是機密**，不要貼進聊天或 commit。給我的話請用安全管道，或你自己在步驟 3 執行
`fly secrets set`（我把指令列在下面）。

---

## 步驟 3：後端 → Fly.io

設定檔 `backend/fly.toml` 已寫好（app 名稱 `sea-conditions-api`、東京、512MB、含 /health 健康檢查）。

```bash
cd backend

# 3-1 建立 app（名稱要全域唯一，被佔用就換一個，並同步改 fly.toml 的 app = "...")
fly apps create sea-conditions-api

# 3-2 設定機密（DATABASE_URL 來自步驟 2；CORS_ORIGINS 先放佔位，步驟 5 再更新）
fly secrets set \
  DATABASE_URL='postgresql+psycopg://...?sslmode=require' \
  CWA_API_KEY='CWA-你的金鑰' \
  CORS_ORIGINS='https://placeholder.vercel.app'

# 3-3 部署
fly deploy

# 3-4 確認
curl https://sea-conditions-api.fly.dev/health
# → {"status":"ok","llm":false,"db":"postgresql"}
```

後端第一次啟動會自動建表 + seed 6 個潛點與示範海況（`app/main.py` 的 startup 事件）。
接著跑一次真實資料：

```bash
curl -X POST 'https://sea-conditions-api.fly.dev/api/refresh?wait=true'
```

> 之後要開 AI 建議：`fly secrets set ANTHROPIC_API_KEY='sk-ant-...' USE_LLM=true LLM_MODEL=claude-sonnet-5`

---

## 步驟 4：前端 → Vercel（你）

1. https://vercel.com → 用 GitHub 登入 → **Add New → Project** → 選 `sea-conditions` repo
2. **Root Directory** 設為 `frontend`（重要，repo 是 monorepo）
3. Framework 會自動偵測為 Next.js，Build/Output 用預設
4. **Environment Variables** 加一個：
   - `NEXT_PUBLIC_API_BASE` = `https://sea-conditions-api.fly.dev`（步驟 3 的後端網址）
5. **Deploy**

完成後拿到前端網址，例如 `https://sea-conditions.vercel.app`。

---

## 步驟 5：把三邊接起來

```bash
# 5-1 後端 CORS 放行前端網址
cd backend
fly secrets set CORS_ORIGINS='https://sea-conditions.vercel.app'
# （fly secrets set 會自動重啟）

# 5-2 每日自動更新：到 GitHub repo →
#     Settings → Secrets and variables → Actions → Variables 分頁 → New repository variable
#     Name: API_BASE   Value: https://sea-conditions-api.fly.dev
#     （workflow 檔 .github/workflows/daily-refresh.yml 已經在 repo 裡，會每天台灣時間 05:30 / 12:30 跑）
```

---

## 步驟 6：驗收

- 開 `https://<你的>.vercel.app` → 6 張潛點卡片有真實浪高/風力/水溫
- 點任一潛點 → 未來 4 天、潮汐時間有值
- 手機開同一個網址 → 單欄排版；Safari「加入主畫面」會變 app icon
- GitHub → Actions → 手動觸發一次 `每日更新海況`，看有沒有綠勾

---

## 每月成本概估

| 項目 | 費用 |
|---|---|
| Vercel（Hobby）| $0 |
| Supabase（Free：500MB DB、暫停於 7 天無活動）| $0 |
| Fly.io 後端（1×shared-cpu-1x 512MB 常駐）| 約 $2–4 |
| GitHub Actions（public repo）| $0 |
| Open-Meteo / CWA API | $0 |
| **合計** | **約 $2–4／月**（不開 AI 建議的話）|

想再省：`fly.toml` 把 `min_machines_running` 改 `0`，沒人用時機器休眠，月費趨近 $0，
代價是第一個訪客要等 2–3 秒冷啟動。

---

## 之後要補的（非上線必須）

- **Alembic migration**：目前靠 `Base.metadata.create_all` 建表，改 schema 不會自動遷移。
  加欄位時要嘛手動改 DB，要嘛導入 Alembic。
- **`/api/refresh` 加保護**：現在是公開端點（雖然只是重抓資料、上游 API 都免費）。
  可加一個 `REFRESH_TOKEN` 環境變數 + query 檢查，GitHub Actions 用 secret 帶入。
- **前端「重新抓海況」按鈕**：若之後 refresh 加了 token，這顆按鈕要改走 Next.js route handler 代打。
- **Supabase 暫停**：Free 方案 7 天無連線會暫停 DB。每日 refresh 的 cron 會持續連線，所以通常不會被暫停。
