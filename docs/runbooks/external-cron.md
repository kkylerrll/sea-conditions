# 外部 cron：用 cron-job.org 每 3 小時觸發海況更新

## 為什麼

GitHub Actions 的 `schedule` 在免費帳號上常常延遲、甚至整點被跳過，不能保證「每 3 小時」。
改成由 cron-job.org 準時呼叫 GitHub API 的 `workflow_dispatch`，觸發 `daily-refresh.yml`。
workflow 裡原本的 `schedule` 保留當備援（外部服務掛掉時還有機會跑）。

## 你要做的事

### 1. 建 GitHub fine-grained PAT

1. GitHub → 右上頭像 → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
2. Token name：`cron-job-sea-conditions`；Expiration：選最長（1 年），到期前要換新的（在行事曆記一筆）。
3. Resource owner：`kkylerrll`。
4. Repository access：**Only select repositories** → 只選 `kkylerrll/sea-conditions`。
5. Permissions → Repository permissions → **Actions: Read and write**（其他全部維持 No access；Metadata: Read 會自動帶上）。
6. Generate token，**立刻複製**（只會顯示一次）。不要貼進聊天或 commit。

### 2. 在 cron-job.org 建排程

註冊並登入 https://cron-job.org → CREATE CRONJOB：

| 欄位 | 值 |
|---|---|
| Title | `sea-conditions refresh` |
| URL | `https://api.github.com/repos/kkylerrll/sea-conditions/actions/workflows/daily-refresh.yml/dispatches` |
| Execution schedule | Custom：每天 0、3、6、9、12、15、18、21 點（Minutes 選 0；時區選 Asia/Taipei，或在 Hours 全選上述 8 個值） |
| Request method（Advanced） | `POST` |
| Request body（Advanced） | `{"ref":"main"}` |

Headers（Advanced → Headers，逐筆新增）：

| Name | Value |
|---|---|
| `Authorization` | `Bearer <剛剛複製的 PAT>` |
| `Accept` | `application/vnd.github+json` |
| `X-GitHub-Api-Version` | `2022-11-28` |
| `Content-Type` | `application/json` |
| `User-Agent` | `cron-job.org` |

注意：GitHub API 一定要有 `User-Agent`，否則回 403。成功的回應是 **HTTP 204（沒有 body）**，
在 cron-job.org 的 Advanced 裡把 expected status 設成 204（或接受 2xx），不然會被標成失敗。
儲存後可以按「Test run」手動跑一次。

### 3. 驗證成功

觸發後等幾秒，在終端機：

```bash
gh run list --repo kkylerrll/sea-conditions --workflow daily-refresh.yml --limit 10 \
  --json databaseId,event,status,conclusion,createdAt,actor \
  --jq '.[] | [.createdAt, .event, .actor.login, .status, .conclusion] | @tsv'
```

看三件事：

- `event` 是 `workflow_dispatch`（手動／API 觸發），`actor` 是 PAT 擁有者；備援的 `schedule` 是 `schedule`。
- `createdAt` 的間隔接近 3 小時（UTC 0、3、6…21 點整，誤差幾十秒）。
- 打開最新一次 log，確認 `updated_locations / total_locations` 是滿的，不是只看綠勾。

如果沒出現新的 run：cron-job.org 的 Execution history 看回應碼。
401 = PAT 錯誤或過期；403 = 缺 `User-Agent` 或權限不是 Actions: Read and write；404 = URL 或 repo 名稱拼錯，
或 PAT 沒選到這個 repo；422 = body 的 `ref` 不對（`workflow_dispatch` 只能指到存在的分支，這裡是 `main`）。

## 維護

- PAT 到期前換新的：產生新 token → 更新 cron-job.org 的 `Authorization` header → 刪掉舊 token。
- 想暫停更新：在 cron-job.org 停用該 cronjob（備援 `schedule` 仍會跑；要完全停止還要在 Actions 頁面 disable workflow）。
