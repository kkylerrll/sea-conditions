"use client";

// 收藏（不用帳號，存 localStorage）。docs/design/favorites.md §1、§4.3。
// 讀寫都包 try/catch：私密瀏覽或被封鎖時，收藏只在這次瀏覽期間有效。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const KEY = "sea-conditions:favorites";
export const FILTER_KEY = "sea-conditions:explore-filter";

interface Toast {
  id: number;
  text: string;
  undo?: { slug: string; index: number; name: string };
  ms: number;
}

interface FavoritesCtx {
  ready: boolean;
  slugs: string[];
  has: (slug: string) => boolean;
  toggle: (slug: string, name: string) => void;
  persistent: boolean;
}

const Ctx = createContext<FavoritesCtx | null>(null);

function parse(raw: string | null): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 記住「只看收藏」篩選；選其他篩選時清掉。 */
export function rememberFavoritesFilter(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(FILTER_KEY, "收藏");
    else window.localStorage.removeItem(FILTER_KEY);
  } catch {
    // 忽略
  }
}

export function favoritesFilterRemembered(): boolean {
  try {
    return window.localStorage.getItem(FILTER_KEY) === "收藏";
  } catch {
    return false;
  }
}

export function FavoritesProvider({
  validSlugs,
  children,
}: {
  /** 目前存在的地區；收藏裡不存在的 slug 顯示時忽略、下次寫入時清掉 */
  validSlugs: string[];
  children: React.ReactNode;
}) {
  const [stored, setStored] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const warnedRef = useRef(false);
  const toastSeq = useRef(0);

  const valid = useMemo(() => new Set(validSlugs), [validSlugs]);
  const slugs = useMemo(() => stored.filter((s) => valid.has(s)), [stored, valid]);

  useEffect(() => {
    try {
      setStored(parse(window.localStorage.getItem(KEY)));
    } catch {
      setPersistent(false);
    }
    setReady(true);

    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setStored(parse(e.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const showToast = useCallback((t: Omit<Toast, "id">) => {
    toastSeq.current += 1;
    setToast({ ...t, id: toastSeq.current });
  }, []);

  const write = useCallback(
    (next: string[]) => {
      const cleaned = next.filter((s) => valid.has(s));
      setStored(cleaned);
      // 收藏清空時，「只看收藏」的記憶也一起刪掉，避免下次進來停在空的收藏
      if (cleaned.length === 0) rememberFavoritesFilter(false);
      // 回傳 false 表示這次已經顯示了「存不進去」的提示，呼叫端不要再蓋掉它
      try {
        window.localStorage.setItem(KEY, JSON.stringify(cleaned));
        return true;
      } catch {
        setPersistent(false);
        if (!warnedRef.current) {
          warnedRef.current = true;
          showToast({ text: "這個瀏覽器沒辦法記住收藏（可能開了無痕模式），關掉分頁就會不見。", ms: 8000 });
          return false;
        }
        return true;
      }
    },
    [valid, showToast],
  );

  const toggle = useCallback(
    (slug: string, name: string) => {
      const index = stored.indexOf(slug);
      if (index >= 0) {
        const saved = write(stored.filter((s) => s !== slug));
        if (saved) showToast({ text: `已取消收藏${name}`, undo: { slug, index, name }, ms: 6000 });
      } else {
        const saved = write([...stored, slug]);
        if (saved) showToast({ text: `已收藏${name}`, ms: 3000 });
      }
    },
    [stored, write, showToast],
  );

  const undo = useCallback(
    (u: NonNullable<Toast["undo"]>) => {
      if (!stored.includes(u.slug)) {
        const next = [...stored];
        next.splice(Math.min(u.index, next.length), 0, u.slug);
        write(next);
      }
      showToast({ text: "已復原", ms: 1500 });
    },
    [stored, write, showToast],
  );

  const value = useMemo<FavoritesCtx>(
    () => ({ ready, slugs, has: (s) => slugs.includes(s), toggle, persistent }),
    [ready, slugs, toggle, persistent],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastArea toast={toast} onDone={() => setToast(null)} onUndo={undo} />
    </Ctx.Provider>
  );
}

export function useFavorites(): FavoritesCtx {
  const v = useContext(Ctx);
  // 沒有 Provider（例如首頁）時當作沒有收藏、永遠沒準備好
  return v ?? { ready: false, slugs: [], has: () => false, toggle: () => {}, persistent: false };
}

function ToastArea({
  toast,
  onDone,
  onUndo,
}: {
  toast: Toast | null;
  onDone: () => void;
  onUndo: (u: NonNullable<Toast["undo"]>) => void;
}) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(false);
  }, [toast?.id]);

  useEffect(() => {
    if (!toast || paused) return;
    const t = window.setTimeout(onDone, toast.ms);
    return () => window.clearTimeout(t);
  }, [toast, paused, onDone]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      {toast && (
        <div
          key={toast.id}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-3 rounded-xl bg-abyss-800 px-4 text-sm font-semibold text-white shadow-lift"
        >
          <span className="flex-1 py-2">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onClick={() => toast.undo && onUndo(toast.undo)}
              className="min-h-11 cursor-pointer rounded-lg px-3 font-bold text-lagoon-300 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white"
            >
              復原
            </button>
          )}
        </div>
      )}
    </div>
  );
}
