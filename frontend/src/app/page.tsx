import RefreshButton from "@/components/RefreshButton";
import SpotCard from "@/components/SpotCard";
import { getLocations } from "@/lib/api";
import { updatedLabel } from "@/lib/format";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let locations: Location[] = [];
  let error: string | null = null;

  try {
    locations = await getLocations();
  } catch (e) {
    error = e instanceof Error ? e.message : "無法連線到後端";
  }

  const latest = locations
    .map((l) => l.today?.fetched_at)
    .filter(Boolean)
    .sort()
    .pop();
  const updated = updatedLabel(latest);

  return (
    <main>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">今天，哪裡適合下水？</h1>
          <p className="mt-1 text-sm text-slate-500">
            台灣熱門潛點今日海況燈號。點卡片看未來 3 天與 AI 白話建議。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updated && <span className="text-xs text-slate-400">更新於 {updated}</span>}
          <RefreshButton />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          載入失敗：{error}
          <div className="mt-1 text-rose-600/80">
            請確認後端已啟動（<code className="font-mono">uvicorn app.main:app --reload</code>）。
          </div>
        </div>
      )}

      {!error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <SpotCard key={loc.slug} location={loc} />
          ))}
        </div>
      )}
    </main>
  );
}
