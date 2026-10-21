import HomeExplorer from "@/components/HomeExplorer";
import RefreshButton from "@/components/RefreshButton";
import { getLocations } from "@/lib/api";
import { parseActivity } from "@/lib/sea";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

const HEADING_ZH = {
  dive: "今天，哪裡適合潛水？",
  surf: "今天，哪裡適合衝浪？",
} as const;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { activity?: string };
}) {
  const activity = parseActivity(searchParams.activity);

  let locations: Location[] = [];
  let error: string | null = null;

  try {
    locations = await getLocations();
  } catch (e) {
    error = e instanceof Error ? e.message : "無法連線到後端";
  }

  return (
    <main>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{HEADING_ZH[activity]}</h1>
          <p className="mt-1 text-sm text-slate-600">
            台灣潛點與衝浪點的今日海況燈號，點地圖看細節。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          載入失敗：{error}
          <div className="mt-1 text-rose-600/80">請稍後再試，或按上方「重新抓海況」。</div>
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          目前沒有海況資料，按上方「重新抓海況」抓一次。
        </div>
      ) : (
        <HomeExplorer locations={locations} activity={activity} />
      )}
    </main>
  );
}
