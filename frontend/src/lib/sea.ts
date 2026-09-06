// 把海況數字轉成「看得懂」的語意：防寒衣、風級描述、羅盤方位、潮汐解析。

import type { Rating } from "./types";

/* ---------- 燈號顏色 ---------- */

export const RATING_HEX: Record<Rating, { base: string; soft: string; text: string; label: string }> = {
  green: { base: "#10b981", soft: "#d1fae5", text: "#047857", label: "適合下水" },
  yellow: { base: "#f59e0b", soft: "#fef3c7", text: "#b45309", label: "勉強可下" },
  red: { base: "#f43f5e", soft: "#ffe4e6", text: "#be123c", label: "不建議" },
  unknown: { base: "#94a3b8", soft: "#f1f5f9", text: "#475569", label: "資料不足" },
};

export function ratingOf(r: Rating | null | undefined): Rating {
  return r && r in RATING_HEX ? r : "unknown";
}

/* ---------- 防寒衣建議（依水溫，潛水用） ---------- */

export function wetsuitAdvice(tempC: number | null | undefined): { suit: string; note: string } {
  if (tempC == null) return { suit: "—", note: "無水溫資料" };
  if (tempC >= 28) return { suit: "3mm 或水母衣", note: "水溫溫暖，短袖或防磨衣即可" };
  if (tempC >= 25) return { suit: "3mm 長袖", note: "多趟潛水建議 3mm 全身" };
  if (tempC >= 22) return { suit: "5mm 全身", note: "偏涼，長時間會冷" };
  return { suit: "5–7mm + 頭套", note: "冷，注意失溫" };
}

/* ---------- 風級描述（蒲福風級） ---------- */

export function windDesc(scale: number | null | undefined): string {
  if (scale == null) return "—";
  if (scale <= 1) return "幾乎無風";
  if (scale === 2) return "輕風，海面微波";
  if (scale === 3) return "微風，偶見白浪";
  if (scale === 4) return "和風，海面白浪漸多";
  if (scale === 5) return "清風，中浪、容易起流";
  if (scale === 6) return "強風，大浪、海況惡劣";
  return "疾風以上，勿下水";
}

/* ---------- 16 方位羅盤 ---------- */

const DIR_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

const DIR_ZH: Record<string, string> = {
  N: "北", NNE: "北北東", NE: "東北", ENE: "東北東", E: "東", ESE: "東南東",
  SE: "東南", SSE: "南南東", S: "南", SSW: "南南西", SW: "西南", WSW: "西南西",
  W: "西", WNW: "西北西", NW: "西北", NNW: "北北西",
};

export function windFromDeg(dir: string | null | undefined): number | null {
  if (!dir) return null;
  const key = dir.trim().toUpperCase();
  return key in DIR_DEG ? DIR_DEG[key] : null;
}

export function windDirZh(dir: string | null | undefined): string {
  if (!dir) return "—";
  const key = dir.trim().toUpperCase();
  return (DIR_ZH[key] ?? key) + "風";
}

/* ---------- 潮汐時間解析 ---------- */
// 後端給的是字串，可能是 "02:37" 或 "00:26 / 15:20"

export interface TidePoint {
  minutes: number; // 距離 00:00 的分鐘數
  label: string; // "02:37"
  kind: "high" | "low";
}

export function parseTideTimes(raw: string | null | undefined, kind: "high" | "low"): TidePoint[] {
  if (!raw) return [];
  return raw
    .split(/[\/,]/)
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s))
    .map((s) => {
      const [h, m] = s.split(":").map(Number);
      return { minutes: h * 60 + m, label: s, kind };
    });
}

/* 現在時間（台北）距離 00:00 的分鐘數 */
export function nowMinutesTaipei(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}
