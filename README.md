# 海況去不去 — 台灣潛點／浪點海況

把氣象數據翻成白話的「今天適不適合下水」，給台灣的潛水、自由潛水、浮潛和衝浪的人看。
響應式設計，手機和桌機共用同一份程式碼（PWA，可以「加入主畫面」）。

- 正式網站：https://sea-conditions.vercel.app
- 正式 API：https://sea-conditions-api.onrender.com/api/locations

## 功能

- **13 個地區、46 個子潛點**（小琉球、綠島、蘭嶼、墾丁、龍洞、北海岸、澎湖……）。
- 每個地區未來 4 天的浪高、週期、風力、陣風、水溫、潮汐，分**潛水**和**衝浪**兩套綠／黃／紅燈號。
- 白天分 4 個時段（早上、上午、下午、傍晚）各自評分，點名最適合的時段。
- 首頁是一段捲動下潛的 3D 場景（three.js），從海面一路潛到 1000m。
- `/explore` 地圖（MapLibre），`/spots/<slug>` 單一地區詳情。

## 本機開發

後端（FastAPI，預設 SQLite，零設定）：

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed                 # 建表、寫入地區與子潛點、產生 4 天示範海況
uvicorn app.main:app --reload --port 8000
python -m app.refresh              # 選用：用 Open-Meteo 抓真實海況、重算燈號
```

前端（Next.js 14，pnpm）：

```bash
cd frontend
pnpm install
cp .env.local.example .env.local   # 預設指向 http://localhost:8000
pnpm dev
# 不想開本機後端：NEXT_PUBLIC_API_BASE=https://sea-conditions-api.onrender.com pnpm dev
```

檢查（跟 CI 一樣，見 `.github/workflows/`）：

```bash
cd backend && ruff check . && mypy . --ignore-missing-imports && pytest -q
cd frontend && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build
```

也可以 `docker compose up --build` 一次起 Postgres、後端、前端（http://localhost:3000）。

本機 Python 是 3.9，正式環境是 3.12。SQLAlchemy／Pydantic 的型別註解保留 `Optional[...]`，不要改成 `X | None`（`backend/ruff.toml` 已設定）。

## 部署

細節見 [`DEPLOY.md`](./DEPLOY.md)。

| 部分 | 平台 | 怎麼觸發 |
|---|---|---|
| 前端 | Vercel | push 到 `main` 自動部署 |
| 後端 | Render（新加坡，Docker，`render.yaml`） | push 到 `main` 自動部署；啟動時跑 `alembic upgrade head` |
| 資料庫 | Supabase Postgres | — |
| 海況更新 | GitHub Actions `daily-refresh.yml` | cron 每 3 小時（GitHub 實際約 5～7 小時一次），直接寫 Supabase |

AI 白話建議目前是關的（`USE_LLM=false`），都是模板句。

## 架構

```
backend/    FastAPI + SQLAlchemy + Alembic
  app/services/marine.py   Open-Meteo（免金鑰）浪高、風、水溫，批次請求
  app/services/cwa.py      中央氣象署潮汐（需 CWA_API_KEY）
  app/services/rating.py   潛水／衝浪燈號規則
  app/services/advice.py   白話建議（模板；USE_LLM=true 時呼叫 Claude）
  app/refresh.py           排程進入點：任何地點沒更新到就非零結束
  tests/                   pytest
frontend/   Next.js 14 App Router + Tailwind
  src/components/landing/  首頁 3D 下潛（depth.ts 是捲動 → 深度的單一來源）
```

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sea_conditions.db` | 設成 `postgresql+psycopg://...` 就改用 Postgres |
| `CWA_API_KEY` | 空 | 中央氣象署開放資料金鑰（https://opendata.cwa.gov.tw），潮汐用 |
| `ANTHROPIC_API_KEY` | 空 | 有值才會呼叫 LLM |
| `USE_LLM` | `false` | `true` 時 `refresh` 會呼叫 LLM 產生建議 |
| `LLM_MODEL` | `claude-opus-5` | 正式環境 `render.yaml` 設成 `claude-sonnet-5` |
| `CORS_ORIGINS` | `http://localhost:3000` | 逗號分隔 |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | 前端打的後端網址 |
