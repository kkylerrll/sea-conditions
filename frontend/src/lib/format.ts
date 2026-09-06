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
