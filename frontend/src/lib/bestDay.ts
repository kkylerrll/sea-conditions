// 「未來 N 天哪天最適合」的計算（docs/design/best-day.md §3）。純函式，不碰 DOM，方便測試。

import { type ActivityKind, ratingFor } from "./sea";
import type { Condition, Location, Rating } from "./types";

export const MAX_DAYS = 7;

/** 某活動的分數；舊資料沒有 ratings 時，潛水退回相容欄位 rating_score。 */
export function scoreFor(c: Condition | null | undefined, kind: ActivityKind): number | null {
  const s = c?.ratings?.[kind]?.score;
  if (s != null) return s;
  if (kind === "dive" && c?.rating_score != null) return c.rating_score;
  return null;
}

/** 欄：所有地區 forecast 日期的聯集，>= 今天，排序後取前 7 個。 */
export function collectDates(locs: Location[], today: string): string[] {
  const set = new Set<string>();
  for (const l of locs) for (const c of l.forecast ?? []) if (c.date >= today) set.add(c.date);
  return Array.from(set).sort().slice(0, MAX_DAYS);
}

export interface Cell {
  rating: Rating;
  score: number | null;
}

export function cellFor(loc: Location, date: string, kind: ActivityKind): Cell {
  const c = (loc.forecast ?? []).find((f) => f.date === date) ?? null;
  if (!c) return { rating: "unknown", score: null };
  return { rating: ratingFor(c, kind), score: scoreFor(c, kind) };
}

export interface DayStat {
  date: string;
  green: number;
  yellow: number;
  avg: number | null;
  allUnknown: boolean;
}

export function dayStats(locs: Location[], dates: string[], kind: ActivityKind): DayStat[] {
  return dates.map((date) => {
    const cells = locs.map((l) => cellFor(l, date, kind));
    const scores = cells.map((c) => c.score).filter((v): v is number => v != null);
    return {
      date,
      green: cells.filter((c) => c.rating === "green").length,
      yellow: cells.filter((c) => c.rating === "yellow").length,
      avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      allUnknown: cells.every((c) => c.rating === "unknown"),
    };
  });
}

/** 台灣時間幾點後，「今天」不再參與最佳日排名（太晚了，來不及下水）。 */
export const TODAY_CUTOFF_HOUR = 18;

/** 台灣現在的小時（0–23）。 */
function taipeiHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(h) % 24;
}

/** 台灣時間 18:00 以後回傳 today（要排除的日期），否則 null。now 由呼叫端傳入，方便測試。 */
export function excludedToday(now: Date, today: string): string | null {
  return taipeiHour(now) >= TODAY_CUTOFF_HOUR ? today : null;
}

/** 依 綠燈數 → 黃燈數 → 平均分數 → 日期早 排序；全部 unknown 的天不參與。 */
export function rankDays(stats: DayStat[], exclude: string | null = null): DayStat[] {
  return stats
    .filter((s) => !s.allUnknown && s.date !== exclude)
    .sort(
      (a, b) =>
        b.green - a.green ||
        b.yellow - a.yellow ||
        (b.avg ?? -1) - (a.avg ?? -1) ||
        a.date.localeCompare(b.date),
    );
}

/** 最佳日：排第一且至少有一個綠燈或黃燈；否則 null。exclude 的那天不參與（仍可顯示在表格）。 */
export function bestDay(stats: DayStat[], exclude: string | null = null): DayStat | null {
  const top = rankDays(stats, exclude)[0];
  return top && top.green + top.yellow > 0 ? top : null;
}

const RATING_RANK: Record<Rating, number> = { green: 0, yellow: 1, red: 2, unknown: 3 };

/** 表格列：依選中那天的燈號 → 分數（大到小，null 最後）→ 地名。 */
export function sortRows(locs: Location[], date: string, kind: ActivityKind): Location[] {
  return [...locs].sort((a, b) => {
    const ca = cellFor(a, date, kind);
    const cb = cellFor(b, date, kind);
    return (
      RATING_RANK[ca.rating] - RATING_RANK[cb.rating] ||
      (cb.score ?? -1) - (ca.score ?? -1) ||
      a.name.localeCompare(b.name, "zh-Hant")
    );
  });
}
