// 本機記住「哪個地區哪天回報過」，只用來調整按鈕顯示、少撞 409；真正判斷重複的是伺服器。
// 讀寫都包 try/catch：私密瀏覽或被封鎖時當作沒有紀錄。

import { isoPlusDays, todayInTaipei } from "./format";

const KEY = "sea-conditions:reported";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function hasReported(slug: string, date: string): boolean {
  return read().includes(`${slug}:${date}`);
}

export function markReported(slug: string, date: string): void {
  const cutoff = isoPlusDays(todayInTaipei(), -14);
  const kept = read().filter((k) => (k.split(":").pop() ?? "") >= cutoff);
  const key = `${slug}:${date}`;
  if (!kept.includes(key)) kept.push(key);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // 忽略
  }
}
