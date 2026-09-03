import type { Rating } from "@/lib/types";

const MAP: Record<Rating, { label: string; dot: string; chip: string }> = {
  green: { label: "適合下水", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  yellow: { label: "勉強可下", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  red: { label: "不建議", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  unknown: { label: "資料不足", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

export default function StatusBadge({ rating, size = "md" }: { rating: Rating; size?: "sm" | "md" }) {
  const s = MAP[rating] ?? MAP.unknown;
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${s.chip} ${pad}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
