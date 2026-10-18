// 各地區的即時影像（靜態設定，不經後端）。
// 來源與驗證紀錄見 LIVE_CAMS_RESEARCH.md；影像來源可能失效，請定期複查。

export type LiveCamKind = "youtube" | "image" | "link";

interface LiveCamBase {
  /** 顯示名稱，例如「外澳沙灘」 */
  name: string;
  /** 影像擁有者，顯示為「影像來源：<owner>」 */
  owner: string;
  /** 來源頁（官方頁面），點「影像來源」會開啟 */
  sourceUrl: string;
}

export interface YoutubeCam extends LiveCamBase {
  kind: "youtube";
  /** 單一直播影片 ID；與 channelId 擇一 */
  videoId?: string;
  /** 頻道層級直播（頻道只跑一路直播時用，直播重啟後仍有效） */
  channelId?: string;
}

export interface ImageCam extends LiveCamBase {
  kind: "image";
  /** 靜態截圖網址，前端每 60 秒加快取參數重抓 */
  url: string;
}

export interface LinkCam extends LiveCamBase {
  kind: "link";
  /** 對外連結（新分頁開啟） */
  url: string;
}

export type LiveCam = YoutubeCam | ImageCam | LinkCam;

const NECOAST = "交通部觀光署東北角及宜蘭海岸國家風景區管理處";
const DBNSA = "交通部觀光署大鵬灣國家風景區管理處";
const EAST = "交通部觀光署東部海岸國家風景區管理處";
const necoast = (id: number) =>
  `https://www.necoast-nsa.gov.tw/Live-Streaming-Content.aspx?a=${id}&l=1`;
const dbnsa = (id: number) => `https://www.dbnsa.gov.tw/zh-TW/attraction/articles?a=${id}`;

const EAST_LIST_URL = "https://www.eastcoast-nsa.gov.tw/zh-tw/service/live-camera-list/";

export const LIVE_CAMS: Record<string, LiveCam[]> = {
  xiaoliuqiu: [
    { kind: "youtube", name: "花瓶岩", channelId: "UCCsRoeyhuazn1-CT7b3HWfg", owner: DBNSA, sourceUrl: dbnsa(402) },
    { kind: "youtube", name: "大福西", channelId: "UCZ49MfjybAmcO2sjhZ934QA", owner: DBNSA, sourceUrl: dbnsa(530) },
    { kind: "youtube", name: "望海亭", channelId: "UCILSLdGCcdnXpkTbkSDHGUw", owner: DBNSA, sourceUrl: dbnsa(563) },
  ],
  "kenting-houbihu": [
    {
      kind: "youtube",
      name: "船帆石沙灘（4K）",
      videoId: "7WOJMh_eSfY",
      owner: "交通部觀光署墾丁國家公園管理處",
      sourceUrl: "https://www.youtube.com/@ktnpworld",
    },
  ],
  longdong: [
    { kind: "youtube", name: "龍洞灣觀景台", videoId: "q7wy94TiBBw", owner: NECOAST, sourceUrl: necoast(3725) },
    { kind: "youtube", name: "鼻頭服務區", videoId: "HpJS5o4FZuA", owner: NECOAST, sourceUrl: necoast(3297) },
    { kind: "youtube", name: "福隆海水浴場", videoId: "CWkEgrjBas0", owner: NECOAST, sourceUrl: necoast(3299) },
  ],
  beihaian: [
    {
      kind: "youtube",
      name: "中角灣（4K）",
      videoId: "CJ8FA10bg3E",
      owner: "交通部觀光署北海岸及觀音山國家風景區管理處",
      sourceUrl: "https://www.northguan-nsa.gov.tw/",
    },
  ],
  penghu: [
    {
      kind: "youtube",
      name: "內垵遊憩區（西嶼）",
      videoId: "T9QS6Y4i-9k",
      owner: "交通部觀光署澎湖國家風景區管理處",
      sourceUrl: "https://www.penghu-nsa.gov.tw/",
    },
  ],
  yilan: [
    { kind: "youtube", name: "外澳沙灘", videoId: "F_fv8VTt6L8", owner: NECOAST, sourceUrl: necoast(3298) },
    { kind: "youtube", name: "永鎮濱海驛站", videoId: "x6-BG6MTFUQ", owner: NECOAST, sourceUrl: necoast(3739) },
  ],
  taitung: [
    {
      kind: "link",
      name: "東海岸即時影像（金樽、都歷、三仙台等）",
      url: EAST_LIST_URL,
      owner: EAST,
      sourceUrl: EAST_LIST_URL,
    },
  ],
  lyudao: [
    {
      kind: "link",
      name: "東海岸即時影像（含綠島帆船鼻、南寮漁港）",
      url: EAST_LIST_URL,
      owner: EAST,
      sourceUrl: EAST_LIST_URL,
    },
  ],
};
