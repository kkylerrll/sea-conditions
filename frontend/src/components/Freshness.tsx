// 資料新鮮度：「資料更新於 HH:MM」；超過 6 小時改成淡黃警示並提醒資料可能較舊。

import { freshness } from "@/lib/format";

export default function Freshness({
  iso,
  className = "",
  tone = "light",
}: {
  iso: string | null | undefined;
  className?: string;
  /** dark：放在深色 hero 上時用，字改白色 */
  tone?: "light" | "dark";
}) {
  const f = freshness(iso);
  if (!f) return null;
  return (
    <span
      className={`text-xs ${
        f.stale
          ? "rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800"
          : tone === "dark"
            ? "text-white/85"
            : "text-slate-600"
      } ${className}`}
    >
      資料更新於 {f.time}
      {f.stale ? " · 資料可能較舊" : ""}
    </span>
  );
}
