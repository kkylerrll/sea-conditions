/** 台北此刻的日期，格式 YYYY-MM-DD（en-CA 就是這個格式）。
 *  後端的資料列是用台北日期當 key，前端要判斷「今天／明天」也得用同一時區，
 *  不能用瀏覽器本機時區、更不能用陣列 index。 */
export function todayInTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

/** 以 YYYY-MM-DD 為基準往後推 n 天，回傳同格式字串。 */
export function isoPlusDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function updatedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 資料新鮮度：time = 更新時間（台北，當天只顯示 HH:MM，跨日加月/日）；stale = 超過 6 小時。 */
export function freshness(iso: string | null | undefined): { time: string; stale: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return null;
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, ...o });
  const hhmm = fmt({ hour: "2-digit", minute: "2-digit" });
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d) === todayInTaipei();
  return {
    time: sameDay ? hhmm : `${fmt({ month: "numeric", day: "numeric" })} ${hhmm}`,
    stale: Date.now() - d.getTime() > 6 * 3600 * 1000,
  };
}

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/** YYYY-MM-DD → 「11/16（一）」。日期字串本身就是台灣日期，不做時區換算。 */
export function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}（${WEEKDAY_ZH[wd]}）`;
}

/** 相對今天（台灣）：「今天」「昨天」「明天」，其他回 null。 */
export function relativeDayWord(iso: string, today: string = todayInTaipei()): string | null {
  if (iso === today) return "今天";
  if (iso === isoPlusDays(today, -1)) return "昨天";
  if (iso === isoPlusDays(today, 1)) return "明天";
  return null;
}

/** ISO 時間轉台灣時間 HH:mm；解析不了回空字串。 */
export function timeInTaipei(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
