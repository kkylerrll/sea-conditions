// 資料新鮮度：「資料更新於 HH:MM」；超過 6 小時改成淡黃警示並提醒資料可能較舊。

import { freshness } from "@/lib/format";

export default function Freshness({
  iso,
  className = "",
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  const f = freshness(iso);
  if (!f) return null;
  return (
    <span
      className={`text-xs ${f.stale ? "rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800" : "text-slate-600"} ${className}`}
    >
      資料更新於 {f.time}
      {f.stale ? " · 資料可能較舊" : ""}
    </span>
  );
}
