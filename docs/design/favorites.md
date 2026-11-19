# P3 收藏（不用帳號）：設計規格

> 對象：前端工程師。範圍：`/spots/[slug]`、`/explore`（今天與未來 N 天兩個檢視）、詳情頁側欄。首頁 `/`（3D）不在範圍內。
> 收藏的單位是「地區」（`Location.slug`，例如龍洞、綠島），不是子潛點。

---

## 1. 資料與狀態

### 1.1 儲存

- localStorage key：`sea-conditions:favorites`
- 值：JSON 字串陣列 `["longdong", "green-island"]`（slug，加入順序）。
- 沒有數量上限（全站約 13 個地區）。
- 顯示時一律依燈號排序，不依加入順序。
- 讀到不存在的 slug（地區被下架）：顯示時忽略；下一次寫入時順便清掉。
- JSON 解析失敗：當成空陣列，下一次寫入時覆蓋。

### 1.2 Provider

新增 `frontend/src/lib/favorites.tsx`（`"use client"`）：

```ts
interface FavoritesCtx {
  ready: boolean;            // useEffect 讀完 localStorage 後才 true
  slugs: string[];
  has(slug: string): boolean;
  toggle(slug: string, name: string): void;
  persistent: boolean;       // localStorage 寫得進去嗎
}
```

- `FavoritesProvider` 包在 `AppChrome` 的非首頁分支外層（Header、Sidebar、children 都在裡面）。首頁分支不包。
- 讀寫都 try/catch（同 `AppChrome` 的 `COLLAPSE_KEY`）。
- 監聽 `window` 的 `storage` 事件（key 相同才處理），讓多個分頁同步。
- `toggle` 同時觸發 toast（§4）。

### 1.3 Hydration

- SSR 與 `ready === false` 時：星號按鈕渲染「未收藏」外觀，但加 `opacity-0`（保留位置、避免從空心閃成實心）；`ready` 後移除 `opacity-0`（`transition-opacity duration-150 motion-reduce:transition-none`）。
- 「收藏」chip 的數字在 `ready` 前不顯示。

---

## 2. 收藏按鈕 `FavoriteButton`

新檔：`frontend/src/components/FavoriteButton.tsx`。

Props：`slug`、`name`、`tone: "light" | "dark"`、`withLabel?: boolean`。

- 原生 `<button type="button" aria-pressed={on}>`。
- 無障礙名稱固定為「收藏{name}」（`aria-label`，或 `withLabel` 時由可見文字＋sr-only 地名組成），狀態由 `aria-pressed` 表達。不要在切換時換掉名稱。
- 星形 SVG 20×20，`aria-hidden`。

| 狀態 | light（白卡上） | dark（深藍 hero 上） |
|---|---|---|
| 未收藏 | 空心，`stroke` #64748B（slate-500），1.6px | 空心，`stroke` #FFFFFF |
| 已收藏 | 實心 `fill` #F2785C（coral-400），`stroke` #B8442B（coral-700） | 實心 `fill` #F2785C，`stroke` #FFFFFF |
| hover | 背景 `bg-ocean-50` | 背景 `bg-white/20` |
| focus | `focus-visible:ring-2 focus-visible:ring-ocean-600` | `focus-visible:ring-2 focus-visible:ring-white` |

尺寸：
- 只有圖示：`flex h-11 w-11 shrink-0 items-center justify-center rounded-full`。
- `withLabel`：`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold`；dark 版再加 `bg-white/12 ring-1 ring-white/25 backdrop-blur text-white`（同「回地圖」）。可見文字：未收藏「收藏」、已收藏「已收藏」。

點擊動畫：已收藏時星形 `scale-110` 150ms 後回 1，`motion-reduce` 不做。

---

## 3. 放在哪裡

### 3.1 地區頁 hero（`/spots/[slug]`）

「回地圖」那一列改成 `flex items-center justify-between`，右邊放 `FavoriteButton tone="dark"`：
- 桌機（≥ 640px）：`withLabel`（「☆ 收藏」/「★ 已收藏」）。
- 手機：只有圖示。

```
桌機
┌ hero ─────────────────────────────────────────────────────────┐
│ [‹ 回地圖]                                      [☆ 收藏]      │
│ 基隆 · 新北 · 北海岸                                           │
│ 龍洞                                                           │
└────────────────────────────────────────────────────────────────┘

手機 375
┌ hero ─────────────────────────────┐
│ [‹ 回地圖]                  [☆]   │
│ 龍洞                               │
└───────────────────────────────────┘
```

### 3.2 `/explore` 清單卡（`SpotCard`）

星號是 `li` 的直接子元素（**不能**放進現有的全卡 `<button>` 裡，按鈕不能巢狀），`absolute right-1.5 top-1.5 z-10`，`tone="light"`。原本卡片標題列（地名＋燈號 pill）加 `pr-10`，讓燈號 pill 往左讓出位置。

```
┌▌────────────────────────────────────┐
│▌ 龍洞                 (● 適合) [☆]  │
│▌ 基隆 · 新北 · 北海岸                │
│▌ 0.8 m 浪   風 3 級                  │
│▌ [早][上][下][傍]                    │
│▌────────────────────────────────────│
│▌ 查看詳情                        →  │
└─────────────────────────────────────┘
```

點星號不能觸發卡片選取：`onClick` 裡 `e.stopPropagation()`（它不在 button 裡，主要是保險）。

### 3.3 地圖預覽卡（`PreviewCard`）

關閉鈕左邊放 `FavoriteButton tone="light"`，兩顆同一列：`flex shrink-0 -mr-2 -mt-2`。

```
┌──────────────────────────────┐
│ 龍洞                [☆][✕]  │
│ 基隆 · 新北 · 北海岸          │
```

### 3.4 詳情頁側欄（`Sidebar` 的 `RegionList`）

有收藏時（`ready && 收藏數 ≥ 1`），地區清單分兩段：

```
13 個地區 · 潛水
★ 收藏
  ● 龍洞          適合下水
  ● 綠島          勉強可下
其他
  ● 墾丁          適合下水
  ……
```

- 段標：`px-3 pb-1 pt-2 text-xs font-semibold text-slate-500`，「收藏」前加 12px 實心星（coral-400，`aria-hidden`）。
- 每段是獨立的 `<ul aria-label="收藏的地區">` / `<ul aria-label="其他地區">`。
- 收合模式（窄圖示列）：不分段，收藏的排前面，中間加一條 `my-1 border-t border-slate-100` 分隔線。
- 沒有收藏：維持現狀，不顯示「收藏」段。
- 側欄不放星號按鈕（避免一列兩個點擊目標）。

---

## 4. 只看收藏

### 4.1 `/explore` 今天檢視

HomeExplorer 的 `FILTERS` 改成：`全部`、`收藏`、`適合`、`北部`、`東部`、`南部`、`離島`。

- chip 文字：`收藏`；`ready` 且數量 ≥ 1 時為 `收藏 {n}`（數字 `tabular-nums`）。
- 選「收藏」時：
  - 清單：收藏中支援目前活動的地區依燈號排序，後面接收藏中不支援目前活動的地區（沿用「無預報」樣式，跟「全部」的邏輯一致）。
  - 地圖：只留收藏的點（跟其他篩選同樣邏輯，`mapLocations` 用 `shownSlugs`）。
- 在「收藏」篩選下取消某個收藏，該卡立刻從清單消失，toast 提供「復原」（§4.3）。

記住篩選：
- key `sea-conditions:explore-filter`。選「收藏」時寫入 `"收藏"`，選其他 chip 時刪除這個 key。
- 進頁面時（`useEffect`，`ready` 之後）：key 是 `"收藏"` 且收藏數 ≥ 1 → 預設篩選設成「收藏」；否則「全部」。
- 只記「收藏」，不記其他篩選（其他篩選是一次性的瀏覽動作；只看收藏是個人偏好）。

### 4.2 `/explore` 未來 N 天檢視

區域 chip（best-day.md §4.1）裡的「收藏」：只列收藏中支援目前活動的地區，結論卡第一行的 {區域} 為「收藏」。記住篩選的規則同上，共用同一個 key。

### 4.3 Toast

`FavoritesProvider` 渲染一個 toast 區：

```tsx
<div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end"
     style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
  {toast && (
    <div className="pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-3 rounded-xl bg-abyss-800 px-4 text-sm font-semibold text-white shadow-lift">
      <span className="flex-1">{text}</span>
      {undo && <button className="min-h-11 rounded-lg px-3 font-bold text-lagoon-300 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-white">復原</button>}
    </div>
  )}
</div>
```

- 加入：「已收藏{地名}」，3 秒後消失，沒有復原。
- 取消：「已取消收藏{地名}」＋「復原」，6 秒後消失；滑鼠移入或焦點在「復原」上時暫停計時。
- 新 toast 直接取代舊的。
- 「復原」把該 slug 加回原本在陣列裡的位置，toast 改成「已復原」1.5 秒。
- 焦點不自動移到 toast（不打斷操作）；`aria-live` 會念出來。
- 對比：white on abyss-800 ≈ 11:1；lagoon-300 on abyss-800 ≈ 7:1。

---

## 5. 空狀態與錯誤

| 狀態 | 條件 | 畫面 |
|---|---|---|
| 收藏為空（今天檢視） | 選「收藏」且 0 個 | 清單位置放空狀態卡（見下）；地圖顯示全部點（不要空地圖） |
| 收藏為空（週檢視） | 同上 | 空狀態卡取代結論卡＋摘要＋表格 |
| 收藏有，但都不支援目前活動（週檢視） | 0 列 | `card-clean p-4 text-sm text-slate-600`：「你收藏的地區都沒有{活動}預報。」＋按鈕「看全部地區」 |
| 存不進去 | `setItem` throw | 收藏照樣在本次瀏覽期間生效（記在 state），第一次發生時 toast：「這個瀏覽器沒辦法記住收藏（可能開了無痕模式），關掉分頁就會不見。」8 秒，不帶復原 |
| 讀不出來 | `getItem` throw | 當成空收藏，`persistent = false`，不提示（等使用者真的去按星號時才走上一列） |

空狀態卡（`card-clean p-5 text-center`）：

```
┌──────────────────────────────────┐
│               ☆                  │  ← 32px 空心星，stroke slate-400，aria-hidden
│      還沒有收藏的地區              │  ← text-base font-bold text-slate-900
│ 點地區卡片右上角的 ☆，常去的地方   │  ← mt-1 text-sm text-slate-600
│ 就會集中在這裡。                   │
│        [ 看全部地區 ]              │  ← mt-3，次要按鈕
└──────────────────────────────────┘
```

「看全部地區」：`inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ocean-700 ring-1 ring-ocean-200 hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-ocean-600`，點了把篩選切回「全部」（並刪除記住的篩選 key），焦點移到「全部」chip。

---

## 6. 文案總表

| 位置 | 文案 |
|---|---|
| 星號 aria-label | 收藏{地名} |
| hero 可見文字 | 收藏 ／ 已收藏 |
| 篩選 chip | 收藏 ／ 收藏 {n} |
| 側欄段標 | 收藏 ／ 其他 |
| 側欄 ul aria-label | 收藏的地區 ／ 其他地區 |
| toast 加入 | 已收藏{地名} |
| toast 取消 | 已取消收藏{地名} ／ 復原 |
| toast 復原後 | 已復原 |
| toast 存不進去 | 這個瀏覽器沒辦法記住收藏（可能開了無痕模式），關掉分頁就會不見。 |
| 空狀態 | 還沒有收藏的地區 ／ 點地區卡片右上角的 ☆，常去的地方就會集中在這裡。 ／ 看全部地區 |
| 週檢視無符合 | 你收藏的地區都沒有{活動}預報。 ／ 看全部地區 |

---

## 7. 無障礙

- 星號是 `<button aria-pressed>`，名稱固定「收藏{地名}」，讀屏念「收藏龍洞，切換按鈕，已按下／未按下」。
- 點擊範圍 44×44（`h-11 w-11`）。清單卡上星號與「查看詳情」連結、卡片本體不重疊。
- 對比：未收藏 slate-500 線條對白底 ≈ 4.8:1；已收藏的 coral-700 外框對白底 ≈ 5.3:1（非文字圖形需要 ≥ 3:1）；dark 版白色外框對深藍 hero ≥ 7:1。不能只靠填色分辨，外框與 `aria-pressed` 一起表達。
- 鍵盤順序：清單卡內為「卡片本體 → 星號 → 查看詳情」（DOM 順序依此排列：button、FavoriteButton、Link）。
- Toast `aria-live="polite"`，不搶焦點；「復原」可用 Tab 到達（toast 在 DOM 中位於 `main` 之後）。
- `prefers-reduced-motion`：星號縮放、toast 進出都不做動畫。

---

## 8. 驗收清單

1. 在地區頁收藏龍洞 → 回 `/explore`，龍洞卡的星號是實心，「收藏 1」chip 出現。
2. 開兩個分頁，一邊收藏，另一邊不重新整理星號也會更新。
3. 選「收藏」→ 重新整理 → 仍是「收藏」篩選；把收藏全取消後重新整理 → 回到「全部」。
4. 在「收藏」篩選下取消一個 → 卡片消失 → 按「復原」→ 回來且排序正確。
5. Safari 無痕模式：收藏可用，出現「沒辦法記住收藏」toast 一次。
6. 首次載入（slow 3G 模擬）星號不會從空心閃成實心。
7. 375px：清單卡上的燈號 pill 與星號不重疊；hero 的「回地圖」與星號同一列。
8. 詳情頁側欄：有收藏時出現「收藏／其他」兩段。
