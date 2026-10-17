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

| 平台     | 角色         | 免費方案限制                              |
| -------- | ------------ | ----------------------------------------- |
| Vercel   | 前端 Next.js | Hobby 無限制夠用                          |
| Render   | 後端 FastAPI | 閒置 15 分鐘休眠，下一個請求冷啟動 ~50 秒 |
| Supabase | Postgres     | 500MB、7 天完全無連線會暫停               |

---

## 進度

- [x] 步驟 1：GitHub repo — https://github.com/kkylerrll/sea-conditions
- [x] 步驟 2：Supabase 專案（連線字串已取得）
- [x] 步驟 3：後端 → Render（https://sea-conditions-api.onrender.com）
- [x] 步驟 4：前端 → Vercel（https://sea-conditions.vercel.app）
- [x] 步驟 5：接 CORS + 每日排程（GitHub Actions 綠勾）

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

| 項目                          | 費用                       |
| ----------------------------- | -------------------------- |
| Vercel Hobby                  | $0                         |
| Render Free（後端）           | $0                         |
| Supabase Free                 | $0                         |
| GitHub Actions（public repo） | $0                         |
| Open-Meteo / CWA API          | $0                         |
| **合計**                      | **$0**（不開 AI 建議的話） |

代價：Render 免費方案閒置會休眠，冷啟動 ~50 秒。要無休眠就升 Render Starter（$7/月）或改回 Fly（綁卡，~$2–4/月，`backend/fly.toml` 已備妥）。

---

## 資料庫遷移（Alembic）

schema 由 Alembic 管理，不再用 `Base.metadata.create_all`。

- 版本檔在 `backend/alembic/versions/`；基準版是 `81e1c67e1b76`（baseline schema），
  內容等同舊的 `create_all` 建出來的 `locations` / `daily_conditions` 兩張表。
- **Render 部署**：`backend/Dockerfile` 的 CMD 會在起 uvicorn 前先跑 `alembic upgrade head`，
  每次 deploy 自動套用未執行的遷移。
- **本機**：直接 `uvicorn app.main:app` / `python -m app.seed` / `python -m app.refresh`
  都會在啟動時自動 `upgrade head`（`app/migrate.py`），SQLite 一樣適用。
  手動操作：`cd backend && alembic upgrade head`、`alembic revision --autogenerate -m "..."`。

### ⚠️ 既有資料庫第一次導入：必須先 stamp（只做一次）

正式環境的 Supabase、以及任何你本機已經存在的 `sea_conditions.db`，
這兩張表**已經是 `create_all` 建好的**。若直接 `alembic upgrade head`，
baseline 會嘗試 `CREATE TABLE` 而炸掉。所以在**第一支新遷移上線之前**，
要對既有資料庫執行一次：

```bash
# 對正式 Supabase（帶正式 DATABASE_URL）跑一次即可：
cd backend
DATABASE_URL='postgresql+psycopg://...:...@...pooler.supabase.com:5432/postgres?sslmode=require' \
  alembic stamp 81e1c67e1b76
```

`stamp` 只把版本號寫進 `alembic_version` 表、不動任何資料表結構。做完之後
Render 的 `alembic upgrade head` 只會跑 baseline 之後的遷移（例如新增 `wave_dir` 欄位）。

**全新的空資料庫不需要 stamp** —— `alembic upgrade head` 會照 baseline 把表建好，
一路升到最新（本機 `python -m app.seed` 對全新 SQLite 已驗證可端到端跑通）。

---

## 🚨 修復手冊：正式後端卡在舊版（沒 stamp 造成的靜默回滾）

**症狀**：`/health` 回 200、GitHub Actions 每日排程也是綠勾，但 `/api/locations`
回來的資料是舊 schema —— `spots` 還是字串陣列而不是 `spot_list`、`today` 裡沒有
`wave_dir` 也沒有 `ratings`。代表 Render 正在跑導入 Alembic 之前的舊 image。

**成因**：Supabase 的表當初是 `create_all` 建的，沒有 `alembic_version` 表。
之後每次 deploy 的 `alembic upgrade head` 都在 baseline 的 `CREATE TABLE` 炸掉 →
容器起不來 → Render 靜默保留上一版 build 繼續服務。所以「服務活著」完全不代表
「部署成功」。

遷移鏈：`81e1c67e1b76`(baseline) → `494e5460a629`(wave_dir) →
`474f847fb5b2`(spots 表) → `97df58913f05`(ratings) → `a1c3e5f7b9d2`(slots)＝ head。

### 步驟 1：確認 Supabase 現況

Supabase → SQL Editor：

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

select * from alembic_version;   -- 報錯 = 表不存在 = 正是本症狀
```

### 步驟 2：補上 baseline 版本號（只做一次）

Render Free 方案沒有 Shell 分頁，用以下任一種：

**A. Supabase SQL Editor**（不需任何 CLI，等同 `alembic stamp`）

```sql
create table if not exists alembic_version (
  version_num varchar(32) not null,
  constraint alembic_version_pkc primary key (version_num)
);
insert into alembic_version (version_num) values ('81e1c67e1b76')
on conflict do nothing;
```

**B. 本機接正式 DB**（`backend/.venv` 已備妥 psycopg／alembic）

```bash
cd backend
export DATABASE_URL='postgresql+psycopg://postgres.<ref>:<密碼>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require'
.venv/bin/alembic current          # 應為空
.venv/bin/alembic stamp 81e1c67e1b76
.venv/bin/alembic upgrade head     # 也可以留給 Render 的 CMD 跑
.venv/bin/alembic current          # 應顯示 a1c3e5f7b9d2 (head)
```

### 步驟 3：讓 Render 重新部署

Render Dashboard → `sea-conditions-api` → **Manual Deploy → Deploy latest commit**。
**要看 build log 裡 `alembic upgrade head` 真的跑完且 uvicorn 起來**，不要只看服務有沒有回 200。

### 步驟 4：補資料（stamp 之後一定要做）

`app/main.py` 的自動 seed 只在「一筆地點都沒有」時才觸發，正式環境已有 6 筆舊地點，
所以**新的 13 個地區和子潛點不會自己長出來**，必須手動跑一次（依 slug upsert，重複執行安全）：

```bash
cd backend
DATABASE_URL='<同上>' .venv/bin/python -m app.seed
curl -X POST 'https://sea-conditions-api.onrender.com/api/refresh?wait=true'
```

### 步驟 5：驗收（用 revision-specific 欄位，不要用 /health）

```bash
curl -s https://sea-conditions-api.onrender.com/api/locations | python3 -c "
import json,sys; d=json.load(sys.stdin); x=d[0]
print('spot_list:', 'spot_list' in x, '| 數量:', len(x.get('spot_list', [])))
print('ratings :', 'ratings' in (x.get('today') or {}))
print('地區總數:', len(d))          # 應為 13
"
```

三項都對才算部署成功。`/health` 和排程綠勾在整段故障期間都是正常的，
**永遠不要拿它們當部署成功的證據**。

---

## 之後要補的（非上線必須）

- **`/api/refresh` 加保護**：現在是公開端點（只是重抓資料、上游 API 免費，風險低）。可加 `REFRESH_TOKEN`。
- **前端「重新抓海況」按鈕**：若之後 refresh 加了 token，要改走 Next.js route handler 代打。
- **Supabase 暫停**：每日 cron 會持續連線，通常不會被暫停。
