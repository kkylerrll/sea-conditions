# P2 未來幾天哪天最適合（最佳出發日）：設計規格

> 對象：前端工程師。範圍：`/explore`。只用現有 API（`GET /api/locations`），不需要後端改動。

---

## 0. 先講資料限制

`GET /api/locations` 每個地區的 `forecast` 是**從今天起最多 4 天**（`backend/app/routers/locations.py` 的 `upcoming[:4]`，`refresh.py` 預設 `days=4`）。每天有：

- `ratings.dive` / `ratings.surf`：`rating`（green/yellow/red/unknown）、`score`（0–100 或 null）、`reasons`
- 舊資料相容欄位 `rating`、`rating_score`
- `slots`（白天 4 時段）、浪高、風級、水溫等

所以：
- 介面上一律寫「**未來 {N} 天**」，N＝實際有資料的天數（現在是 4）。不要寫「本週」或「7 天」。
- 設計支援 N = 2～7。後端以後改成 7 天時，前端不用改（只有 §4.4 的手機捲動規則會生效）。
- N < 2 時，週檢視顯示空狀態（§5）。

---

## 1. 入口與版面

### 1.1 檢視切換

`/explore` 加 URL 參數 `view`：`today`（預設，現有畫面）／`week`（新）。`parseView(raw)`：`raw === "week" ? "week" : "today"`。

切換元件放在 hero 下方、`HomeExplorer` 上方，靠左：

```tsx
<nav aria-label="檢視" className="inline-flex rounded-full border border-ocean-100 bg-sand-100 p-0.5">
  <Link href="/explore?activity=dive" aria-current="page" ...>今天</Link>
  <Link href="/explore?activity=dive&view=week" ...>未來 4 天</Link>
</nav>
```

- 樣式完全沿用 Header 的 `ActivityToggle`：每顆 `min-h-11 min-w-[88px] rounded-full px-4 text-sm font-semibold`，選中 `bg-white text-ocean-700 shadow-sm`，未選 `text-slate-600 hover:text-slate-800`。
- 用 `<Link>`（server 渲染），不是 radio。保留 `activity` 參數；Header 的活動切換本來就會保留 `view`（`useActivity` 複製整個 query string）。
- 標籤「未來 4 天」裡的 4 是 N。

### 1.2 Hero 在週檢視的差異

| 元素 | 今天檢視（不變） | 週檢視 |
|---|---|---|
| 日期小字 | `todayLabel()` | 同左 |
| H1 | 今天，哪裡適合潛水？ | 未來 {N} 天，哪天適合潛水？（衝浪：…哪天適合衝浪？） |
| 說明 | 現有文字 | 依每天的預報燈號排出最適合出發的日子。越後面的日子預報越不準，出發前一天再回來看一次。 |
| 右側大字摘要框 | 「N 個地區適合」 | **不渲染**（答案在下方的「最佳日」卡，那張卡會跟著區域篩選變） |
| 重新抓海況／新鮮度 | 有 | 同左 |

### 1.3 週檢視主體（取代 HomeExplorer）

由上到下：

1. 區域篩選 chip 列
2. 「最佳日」結論卡
3. 每日摘要列（N 顆日期按鈕，可選一天）
4. 地區 × 日期 燈號表（依選中那天排序）
5. 圖例＋新鮮度

---

## 2. 線框圖

### 2.1 桌機（≥ 1024px，`max-w-[88rem]`，主體限寬 `max-w-5xl`）

```
┌─ hero-ocean ─────────────────────────────────────────────────────────────┐
│ 11月19日 星期四                                                           │
│ 未來 4 天，哪天適合潛水？                                                 │
│ 依每天的預報燈號排出最適合出發的日子。越後面的日子……                      │
│ [↻ 重新抓海況]  資料更新於 14:05                                          │
└──────────────────────────────────────────────────────────────────────────┘
( 今天 )(●未來 4 天 )

[全部][收藏 2][北部][東部][南部][離島]          ← 收藏 chip 屬於 P3

┌─ card-clean，左 border-l-[6px] 綠 ───────────────────────────────────────┐
│ 全部區域・最適合潛水的一天                                                │
│ 明天 11/20（五）                                       [最佳]            │
│ 6 個地區適合、3 個勉強可下                                                │
└──────────────────────────────────────────────────────────────────────────┘

選一天看排名
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│ 今天          ││ 明天   [最佳] ││ 11/21（六）   ││ 11/22（日）   │
│ 11/19（四）   ││ 11/20（五）   ││               ││               │
│ ●3 適合 ●5 普通││ ●6 適合 ●3 普通││ ●2 適合 ●4 普通││ ●0 適合 ●2 普通│
└──────────────┘└━━━━━━━━━━━━━━┘└──────────────┘└──────────────┘
                  ↑ 選中：ring-2 ring-abyss-800

┌─ card-clean，<table> ────────────────────────────────────────────────────┐
│ 地區               今天       明天▼      11/21      11/22                 │
│                   （四）     （五）      （六）     （日）                │
│ ──────────────────────────────────────────────────────────────────────── │
│ 龍洞               ● 普通   ▐● 適合▌   ● 適合     ● 不建議              │
│ 基隆 · 新北 · 北海岸                                                      │
│ 綠島               ● 適合   ▐● 適合▌   ● 普通     ● 普通                │
│ ……                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
● 適合  ● 普通  ● 不建議  ○ 無資料   點格子看那個地區的詳情。
資料更新於 14:05
```

`▐ ▌` 表示選中那一欄的底色 `bg-ocean-50`。

### 2.2 手機（375px，內容寬 343px）

```
( 今天 )(●未來 4 天 )
[全部][收藏 2][北部][東部][南部][離島] →（橫向捲動，同現有 chip 列）

┌──────────────────────────────────┐
│ 全部區域・最適合潛水的一天         │
│ 明天 11/20（五）         [最佳]   │
│ 6 個地區適合、3 個勉強可下         │
└──────────────────────────────────┘
選一天看排名
┌───────┐┌───────┐┌───────┐┌───────┐   ← grid-cols-4，每格約 80px
│今天    ││明天    ││11/21  ││11/22  │
│（四）  ││（五）  ││（六）  ││（日）  │
│●3 ●5  ││●6 ●3  ││●2 ●4  ││●0 ●2  │
│        ││ 最佳   ││        ││        │
└───────┘└━━━━━━━┘└───────┘└───────┘
┌──────────────────────────────────┐
│ 地區     今天  明天▼ 11/21 11/22 │
│          （四）（五） （六） （日）│
│ 龍洞     ●普通 ●適合 ●適合 ●不建議│
│ 綠島     ●適合 ●適合 ●普通 ●普通  │
│ ……                               │
└──────────────────────────────────┘
```

手機欄寬（定死，`table-fixed`）：名稱欄 104px，日期欄各 59px（4 × 59 + 104 = 340 ≤ 343）。手機名稱欄只顯示地名（`truncate`），不顯示 region。

---

## 3. 計算規則（`frontend/src/lib/bestDay.ts`，純函式）

### 3.1 取值

```ts
scoreFor(c, kind) = c?.ratings?.[kind]?.score ?? (kind === "dive" ? c?.rating_score : null) ?? null
ratingFor(c, kind)  // 沿用 lib/sea.ts
```

### 3.2 範圍

- 列（地區）：`supportsActivity(loc.activities, activity)` 且符合區域篩選（`regionGroup` 從 HomeExplorer 搬到 `lib/sea.ts` 匯出；「收藏」見 favorites.md）。**不支援該活動的地區不列**（跟今天檢視不同，這裡是比較表，不放無預報列）。
- 欄（日期）：所有列的 `forecast[].date` 取聯集、`>= todayInTaipei()`、排序、取前 7 個。N = 欄數。
- 某地區某天沒有那一筆 → 該格 `unknown`。

### 3.3 每天的排名（決定「最佳」）

對每一天 d：`g` = 綠燈列數、`y` = 黃燈列數、`avg` = 該天非 null score 的平均。
排序鍵：`g` 大 → `y` 大 → `avg` 大 → 日期早。

- 該天所有格都是 unknown → 不參與排名。
- 最佳日 = 排第一的那天，但要 `g + y > 0`；否則沒有最佳日（見 §5「全部紅燈」）。

### 3.4 表格列的排序

依「選中那一天」排序：rating（green → yellow → red → unknown）→ score 大到小（null 最後）→ 地名（`localeCompare(…, "zh-Hant")`）。
預設選中的那天＝最佳日；沒有最佳日時選中今天（第一欄）。

---

## 4. 元件與樣式

新檔：`frontend/src/components/BestDays.tsx`（client，因為有區域篩選與選日狀態）。`explore/page.tsx` 在 `view === "week"` 時渲染 `<BestDays locations={locations} activity={activity} />` 取代 `<HomeExplorer>`。

外層：`<section aria-labelledby="bestday-title" className="mx-auto max-w-5xl space-y-4">`，`<h2 id="bestday-title" className="sr-only">未來 {N} 天{活動}比較</h2>`。

### 4.1 區域篩選

完全沿用 HomeExplorer 的 chip 列（同 class、`role="group" aria-label="篩選區域"`、`aria-pressed`）。選項：`全部`、`收藏`（P3）、`北部`、`東部`、`南部`、`離島`。沒有「適合」（這裡的燈號隨日期變，「適合」沒有意義）。狀態放 local state，預設 `全部`。

### 4.2 最佳日結論卡

`card-clean border-l-[6px] p-4 sm:p-6`，`style={{ borderLeftColor: RATING_HEX[g > 0 ? "green" : "yellow"].base }}`，外層 `aria-live="polite"`（區域切換時讀出新結論）。

- 第一行 `text-xs font-semibold tracking-wide text-ocean-700`：「{區域}・最適合{活動}的一天」，{區域} 為「全部區域」「收藏」「北部」等。
- 第二行 `mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900 sm:text-3xl`：「明天 11/20（五）」＋「最佳」標籤。
- 第三行 `mt-1 text-sm text-slate-700`：見 §6 文案。

「最佳」標籤：`rounded-full bg-coral-700 px-2.5 py-0.5 text-xs font-bold text-white`（coral-700 白字 ≈ 5.3:1）。

日期標題規則：今天 →「今天 {M/D}（{週}）」，明天 →「明天 {M/D}（{週}）」，其他 →「{M/D}（{週}）」。

### 4.3 每日摘要列

- 小標「選一天看排名」：`text-sm font-bold text-slate-900`，同時是 `fieldset` 的 `legend`。
- 原生 radio 組（`sr-only` input ＋ label），`grid grid-cols-4 gap-2`（N > 4 時 `flex overflow-x-auto` 加每顆 `w-[5.5rem] shrink-0`）。
- 每顆 label：`flex min-h-[4.5rem] cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-white p-2.5 text-left ring-1 ring-ocean-200 hover:bg-ocean-50 sm:p-3`；選中 `ring-2 ring-abyss-800`；焦點 `peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-600 peer-focus-visible:ring-offset-2`。
  - 第一行 `text-sm font-bold text-slate-900`：今天／明天／M/D。
  - 第二行 `text-xs text-slate-600`：（週）。桌機把第一、二行接成一行：「明天 11/20（五）」。
  - 第三行 `mt-1 flex gap-2 text-xs tabular-nums text-slate-700`：`● {g}` `● {y}`（圓點用 base 色；桌機在數字後加「適合」「普通」字，手機只有圓點＋數字，sr-only 補「{g} 個適合、{y} 個普通」）。
  - 最佳日：第一行後面接小「最佳」標籤（同 §4.2，手機放第四行）。
  - 該天全部 unknown：第三行改「無資料」，radio 仍可選。

### 4.4 燈號表

`card-clean overflow-hidden`，內部 `<table className="w-full table-fixed text-sm">`。

- `<caption className="sr-only">{區域}各地區未來 {N} 天{活動}燈號，依{選中日}排序</caption>`
- 表頭 `<th scope="col">`：`bg-sand px-2 py-2 text-left text-xs font-semibold text-slate-600`；日期欄兩行（今天／（四））。選中那欄 `aria-sort="descending"`，字色 `text-abyss-800`，後面加 `▼`（`aria-hidden`）。
- 名稱欄 `<th scope="row">`：`w-[104px] sm:w-56 px-3 py-2 text-left`；地名 `block truncate font-bold text-slate-900`；region `hidden sm:block truncate text-xs text-slate-600`。
- 日期欄 `w-[59px] sm:w-auto`。
- 每格 `<td className="p-0">` 內放 `<Link>`：`flex min-h-11 items-center gap-1 px-1.5 text-[11px] font-semibold outline-none hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ocean-600 sm:gap-1.5 sm:px-3 sm:text-sm`，`style={{ color: RATING_HEX[r].text }}`。
  - 內容：圓點 `h-2.5 w-2.5 shrink-0 rounded-full`（`background: base`；unknown 用 `border-2 border-dashed border-slate-500 bg-slate-50`，同地圖圖例）＋ 文字 `RATING_SHORT[r]`，unknown 改「無資料」。
  - `href`：`/spots/{slug}?activity={activity}`。
  - `aria-label`：「{地名}，{日期標題}，{活動}{RATING_HEX[r].label}」。
- 選中那欄的 `td` 加 `bg-ocean-50`。
- 列之間 `border-t border-ocean-100`。
- N > 4（未來後端改 7 天）時：外層 `overflow-x-auto`，table 改 `min-w-[34rem]`，名稱欄 `sticky left-0 z-10 bg-white`（選中列底色不影響名稱欄）。N ≤ 4 時不捲動。

### 4.5 圖例與新鮮度

表格下方 `flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700`：三種燈號＋虛線圈「無資料」，最後接「點格子看那個地區的詳情。」（`text-slate-600`）。下一行 `<Freshness iso={latest} />`。

---

## 5. 所有狀態

| 狀態 | 條件 | 畫面 |
|---|---|---|
| 正常 | 有最佳日 | §2 |
| 全部紅燈 | 所有天 `g + y === 0` 但有資料 | 結論卡左邊框紅色（`RATING_HEX.red.base`），不顯示「最佳」標籤；文案見 §6。表格照常、預設選今天 |
| 沒有綠燈 | 最佳日 `g === 0` | 結論卡左邊框黃色；文案見 §6 |
| 區域內沒有地區 | 篩選後 0 列 | 不渲染結論卡、摘要列、表格；改 `card-clean p-4 text-sm text-slate-600`：見 §6 |
| 收藏為空 | 選「收藏」且沒有收藏 | 見 favorites.md §5 |
| 天數不足 | N < 2 | 不渲染結論卡、摘要列、表格；改琥珀提示框（`rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800`）。切換鈕維持顯示 |
| 全部無資料 | 所有格 unknown | 同「天數不足」的琥珀框，文案不同 |
| API 錯誤 | `error` | 沿用 explore 現有紅色錯誤框（兩個檢視共用） |
| 完全沒資料 | `locations.length === 0` | 沿用現有琥珀框 |
| 載入 | 切換檢視 | 不另做骨架：Next 換頁時保留舊畫面直到新頁渲染完（跟切換活動一樣） |

---

## 6. 文案總表（{活動}＝潛水／衝浪；{區域}＝全部區域／收藏／北部…）

| 位置 | 文案 |
|---|---|
| 檢視切換 | 今天 ／ 未來 {N} 天；nav aria-label：檢視 |
| H1 | 未來 {N} 天，哪天適合{活動}？ |
| Hero 說明 | 依每天的預報燈號排出最適合出發的日子。越後面的日子預報越不準，出發前一天再回來看一次。 |
| 結論卡第一行 | {區域}・最適合{活動}的一天 |
| 結論卡第三行（有綠燈） | {g} 個地區適合、{y} 個勉強可下 |
| 結論卡第三行（只有黃燈） | 這 {N} 天沒有綠燈，這天相對最好：{y} 個勉強可下 |
| 結論卡（全部紅燈） | 第一行同上；第二行「這 {N} 天都不建議{活動}」；第三行「可以切到其他區域，或過兩天再回來看」 |
| 最佳標籤 | 最佳 |
| 摘要列小標 | 選一天看排名 |
| 摘要列數字（桌機） | ● {g} 適合 ● {y} 普通 |
| 摘要列 sr-only | {g} 個適合、{y} 個普通 |
| 摘要列無資料 | 無資料 |
| 表頭第一欄 | 地區 |
| 格子 | 適合 ／ 普通 ／ 不建議 ／ 無資料 |
| 格子 aria-label | {地名}，{日期}，{活動}{適合下水／勉強可下／不建議／資料不足} |
| 圖例 | 適合 ／ 普通 ／ 不建議 ／ 無資料 ／ 點格子看那個地區的詳情。 |
| 區域無地區 | 這個區域沒有{活動}地區，換一個區域看看。 |
| 天數不足 | 目前只有今天的預報，還沒辦法比較哪天比較好。 |
| 全部無資料 | 這幾天的預報還沒抓到，按上方「重新抓海況」試試。 |

不要寫「本週」「7 天」（除非 N 真的是 7）、不要寫「保證」「一定」。

---

## 7. 無障礙

- 檢視切換用 `<nav>`＋`<Link aria-current="page">`；日期選擇用原生 radio（方向鍵切換）；區域 chip 沿用 `aria-pressed`。
- 表格用真的 `<table>`、`<caption>`、`th scope`、`aria-sort`，讀屏可以逐欄讀。
- 每格的連結有完整 `aria-label`，不是只念「適合」。
- 點擊範圍：格子 `min-h-11`，手機寬 59px；日期按鈕 `min-h-[4.5rem]`、寬約 80px；chip `min-h-10`（沿用現有）＋ chip 間距 8px。依 WCAG 2.5.8，chip 40px 加間距可接受，但本專案要求 44px：區域 chip 在本頁改 `min-h-11`。
- 顏色永遠搭配文字（適合／普通／不建議／無資料）。格子字色用 `RATING_HEX.*.text`（白底對比皆 ≥ 4.5:1）。
- 結論卡 `aria-live="polite"`，切換區域時讀出新結論。

---

## 8. 驗收清單

1. 375px：表格不出現水平捲動，4 個日期欄都看得到。
2. 切換潛水／衝浪：`view=week` 保留；結論、表格都換成該活動。
3. 選北部：結論卡第一行變「北部・…」，最佳日照 §3.3 重算。
4. 點摘要列的某一天：表格依那天重排，表頭該欄有 ▼、底色 ocean-50。
5. 用一份全紅的 mock 資料：沒有「最佳」標籤、結論卡紅邊、文案正確。
6. 鍵盤：Tab 進日期 radio 組，方向鍵切換，表格即時重排。
7. 頁面上沒有「本週」字樣。
