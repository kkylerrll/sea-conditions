"use client";

// 全域潛水／衝浪切換的單一事實來源：狀態放在網址 query string (?activity=dive|surf)，
// 這樣分享連結、重新整理都會保留選的活動別。用 router.replace 而不是 push，
// 純粹切換活動不應該疊加瀏覽紀錄。
// 注意：useSearchParams 需要外層有 <Suspense>，否則 Next 14 build 會失敗。

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { parseActivity, type ActivityKind } from "./sea";

export function useActivity(): [ActivityKind, (next: ActivityKind) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const activity = parseActivity(searchParams.get("activity"));

  const setActivity = useCallback(
    (next: ActivityKind) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("activity", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  return [activity, setActivity];
}
