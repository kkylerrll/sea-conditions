# 即時影像研究紀錄

驗證日期：2026-10-17。影像來源可能隨時失效或更換直播 ID，請定期複查（`liveCams.ts` 為唯一設定來源）。

## 驗證方式

- YouTube：`youtube.com/oembed?url=<watch url>&format=json` 回 200（可嵌入）；抓 watch 頁確認 `isLiveNow:true`、`playableInEmbed:true`；頻道層級嵌入（`embed/live_stream?channel=`）以 `youtube.com/channel/<id>/live` 確認目前正在直播且可嵌入。
- 所有影片 ID / 頻道 ID 都取自「官方單位自己網站上的嵌入碼」或官方 YouTube 頻道的 `/live`，不是第三方轉貼。
- 來源皆為交通部觀光署所屬國家風景區管理處（政府機關）官方頻道，且官方網站本身就以 iframe 嵌入同一支直播，因此使用官方提供的嵌入方式，不抓取原始串流。

## 採用清單

| 地區 slug | 名稱 | 類型 | 識別碼 | 來源單位 | 來源頁 | 驗證 |
|---|---|---|---|---|---|---|
| xiaoliuqiu | 花瓶岩 | youtube（頻道） | UCCsRoeyhuazn1-CT7b3HWfg | 大鵬灣國家風景區管理處 | dbnsa.gov.tw/zh-TW/attraction/articles?a=402 | 官網嵌入碼；channel/live isLive、playableInEmbed |
| xiaoliuqiu | 大福西 | youtube（頻道） | UCZ49MfjybAmcO2sjhZ934QA | 同上 | …?a=530 | 同上；頁面說明位於小琉球大福漁港西側 |
| xiaoliuqiu | 望海亭 | youtube（頻道） | UCILSLdGCcdnXpkTbkSDHGUw | 同上 | …?a=563 | 同上；頁面描述裙礁海岸、海龜、可遠眺高雄港，判斷為小琉球（頁面未明寫島名） |
| kenting-houbihu | 船帆石沙灘（4K） | youtube（影片） | 7WOJMh_eSfY | 墾丁國家公園管理處 | youtube.com/@ktnpworld | oembed 200；@ktnpworld/live 正在直播且可嵌入 |
| longdong | 龍洞灣觀景台 | youtube（影片） | q7wy94TiBBw | 東北角及宜蘭海岸國家風景區管理處 | necoast-nsa.gov.tw Live-Streaming-Content.aspx?a=3725 | 官網嵌入碼；oembed 200；isLiveNow |
| longdong | 鼻頭服務區 | youtube（影片） | HpJS5o4FZuA | 同上 | a=3297 | 同上 |
| longdong | 福隆海水浴場 | youtube（影片） | CWkEgrjBas0 | 同上 | a=3299 | 同上 |
| yilan | 外澳沙灘 | youtube（影片） | F_fv8VTt6L8 | 同上 | a=3298 | 同上 |
| yilan | 永鎮濱海驛站 | youtube（影片） | x6-BG6MTFUQ | 同上 | a=3739 | 同上 |
| beihaian | 中角灣（4K） | youtube（影片） | CJ8FA10bg3E | 北海岸及觀音山國家風景區管理處 | northguan-nsa.gov.tw | oembed 200；頻道 /live 正在直播且可嵌入 |
| penghu | 內垵遊憩區（西嶼） | youtube（影片） | T9QS6Y4i-9k | 澎湖國家風景區管理處 | penghu-nsa.gov.tw | oembed 200；頻道 /live 正在直播且可嵌入 |
| taitung | 東海岸即時影像清單 | link | eastcoast-nsa.gov.tw/zh-tw/service/live-camera-list/ | 東部海岸國家風景區管理處 | 同左 | 頁面 HTTP 200；官方稱有 10 支 4K 鏡頭（都歷、三仙台、加路蘭、綠島等）。清單由前端 JS 動態載入、API 需 session，無法取得各鏡頭的直播 ID，故僅連結 |
| lyudao | 同上 | link | 同上 | 同上 | 同上 | 同上（含綠島帆船鼻、南寮漁港、柴口浮潛區） |

說明：

- 影片 ID 型（非頻道型）的直播若被來源單位重開，ID 會變；屆時嵌入會顯示無法播放，需回官方頁面更新 ID。大鵬灣的頻道型嵌入不受影響。
- 東北角各鏡頭每支一個影片 ID（同頻道多路直播），無法用頻道層級嵌入。
- 營運時間：以上皆標示 24 小時直播，夜間畫面可能偏暗。

## 沒有鏡頭的地區

蘭嶼、澎湖南方四島、苗栗·竹南、台南·漁光島、高雄·旗津：找不到合適、可驗證的公開海邊即時影像（見下）。

## 剔除的候選

- 墾丁大街（牌樓）即時影像（墾管處，l0MykkrTvo4）：可嵌入且為直播，但拍的是街景，不是海，剔除。
- 北寮奎壁山摩西分海（澎管處，zgPJbQzlQmw）：嵌入 `UNPLAYABLE`、非直播中（應為潮汐時段限定），剔除。
- 大鵬灣：濱灣碼頭、遊一區遊客中心、潮口平台等：位於大鵬灣潟湖／賽車場，不是小琉球或外海，剔除。
- 東北角：馬崗哨所、舊草嶺自行車隧道南口：與海況關聯較弱，已達每地區上限，未採用。
- tw.live、twipcam、taiwanok、doitwell 等監視器聚合網站（綠島帆船鼻、蘭嶼開元港、綠島南寮漁港等）：為第三方轉貼，不得嵌入／盜連，剔除；蘭嶼若要補，需向東管處／台東縣取得官方嵌入。
- 公路局／TDX CCTV（台2線、台11線、台26線）：TDX 需要金鑰，無法在免金鑰、可直連圖片的條件下驗證，未採用。
- 墾丁南灣珊瑚礁水下直播（2016）、墾丁珊瑚產卵直播：季節性／活動限定，非常態影像。
- 衝浪店雪況／浪況攝影機（金樽、東河、蜜月灣、雙獅、烏石港）：未找到可驗證的官方公開直播或嵌入授權，不採用私人網站串流。

## 法律／授權備註

- 政府機關自己的 YouTube 直播並以 iframe 嵌入，符合 YouTube 嵌入條款；`youtube-nocookie.com` 僅減少追蹤 cookie。
- 未找到各直播的明確開放授權聲明（政府資料開放授權條款適用於開放資料集，不一定涵蓋影像串流），因此採「嵌入＋標示來源＋連到來源頁」，不下載、不重新散布。
- 東管處清單頁僅連結，不嵌入。
