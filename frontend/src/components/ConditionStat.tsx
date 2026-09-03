export default function ConditionStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
}) {
  const shown = value === null || value === undefined || value === "" ? "—" : `${value}${unit ?? ""}`;
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800 tabular-nums">{shown}</div>
    </div>
  );
}
