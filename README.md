# 海況去不去 — 台灣潛點/浪點海況社群平台

用 AI 把氣象數據翻譯成白話的「今天適不適合下水」，服務台灣的潛水／自由潛水／衝浪愛好者。

> Vibe coding 專案。目前完成 **第一層 MVP**：固定潛點清單 + 每日海況燈號 + AI 白話建議。
> 響應式設計，手機與桌機共用同一份程式碼（PWA，可「加入主畫面」）。

## 架構

```
sea-conditions/
├── backend/     FastAPI + SQLAlchemy。預設 SQLite（零設定），Docker 下用 PostgreSQL
│   └── app/
│       ├── models.py        locations / daily_conditions 兩張表
│       ├── seed_data.py      6 個潛點的固定清單
│       ├── services/
│       │   ├── marine.py     Open-Meteo Marine/Forecast（免金鑰）抓浪高、風力、水溫
│       │   ├── cwa.py        中央氣象署開放資料（需金鑰，用於潮汐與官方沿岸預報）
│       │   ├── rating.py     綠/黃/紅 燈號規則
│       │   └── advice.py     LLM 生成白話建議（無金鑰時退回模板句）
│       └── routers/          /api/locations、/api/locations/{slug}、/api/refresh
└── frontend/    Next.js 14 App Router + Tailwind。6 張潛點卡片 + 單一潛點詳情頁
```

## 快速開始（不用 Docker，最快看到畫面）

### 1. 後端

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed            # 建表 + 寫入 6 個潛點 + 產生今天起 4 天的示範海況
uvicorn app.main:app --reload --port 8000
```

打開 http://localhost:8000/docs 可看 API。資料存在 `backend/sea_conditions.db`（SQLite）。

### 2. 前端

```bash
cd frontend
pnpm install
cp .env.local.example .env.local     # 已預設指向 http://localhost:8000
pnpm dev
```

打開 http://localhost:3000 就會看到 6 張潛點卡片。

### 3. 抓真實海況 + AI 建議（可選）

```bash
cd backend && source .venv/bin/activate
python -m app.refresh                 # 用 Open-Meteo 抓真實浪高/風力，重算燈號
# 若要 AI 建議：先設定金鑰再跑
export ANTHROPIC_API_KEY=sk-ant-...   # 或已用 `ant auth login` 登入 profile 也可
export USE_LLM=true
python -m app.refresh
```

也可以打 `POST http://localhost:8000/api/refresh` 觸發同樣的更新。

## 部署上線

見 [`DEPLOY.md`](./DEPLOY.md)：前端 Vercel、後端 Fly.io（東京）、DB Supabase Postgres，
GitHub Actions 每天自動更新海況。

## 用 Docker（之後正式開發環境）

```bash
docker compose up --build
# 前端 http://localhost:3000  後端 http://localhost:8000
```

`docker-compose.yml` 會起 Postgres 15、後端、前端三個服務，並自動 seed。

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sea_conditions.db` | 設為 `postgresql+psycopg://...` 即切換到 Postgres |
| `CWA_API_KEY` | 空 | 中央氣象署開放資料平台金鑰（https://opendata.cwa.gov.tw）。用於潮汐 |
| `ANTHROPIC_API_KEY` | 空 | 有值（或有 `ant` profile）才會呼叫 LLM 產生白話建議 |
| `USE_LLM` | `false` | `true` 時 `refresh` 會呼叫 LLM |
| `LLM_MODEL` | `claude-opus-5` | 想省成本可改 `claude-sonnet-5` 或 `claude-haiku-4-5` |
| `CORS_ORIGINS` | `http://localhost:3000` | 逗號分隔 |

## 資料模型（第一層）

- **locations** — 潛點基本資料（slug、名稱、地區、熱門潛點、經緯度、資料源提示）
- **daily_conditions** — 每個地點每天一筆海況快照：浪高、風力/風級、水溫、潮汐、燈號、AI 建議文字、原始 payload

第二層（使用者新增地點、留言、海況回報）已在 schema 與程式結構預留位置，本次不實作。
