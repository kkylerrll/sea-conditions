"use client";

// 收藏星號（docs/design/favorites.md §2）。名稱固定「收藏{地名}」，狀態用 aria-pressed。

import { useFavorites } from "@/lib/favorites";

export function StarIcon({
  on,
  tone,
  size = 20,
}: {
  on: boolean;
  tone: "light" | "dark";
  size?: number;
}) {
  const stroke = tone === "dark" ? "#FFFFFF" : on ? "#B8442B" : "#64748B";
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5Z"
        fill={on ? "#F2785C" : "none"}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FavoriteButton({
  slug,
  name,
  tone,
  withLabel = false,
  className = "",
}: {
  slug: string;
  name: string;
  tone: "light" | "dark";
  /** 顯示「收藏／已收藏」文字（地區頁 hero 桌機版） */
  withLabel?: boolean;
  className?: string;
}) {
  const { ready, has, toggle } = useFavorites();
  const on = ready && has(slug);

  const base =
    "cursor-pointer outline-none transition-opacity duration-150 motion-reduce:transition-none " +
    (ready ? "" : "opacity-0 ");
  const toneCls =
    tone === "dark"
      ? "hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
      : "hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-ocean-600";
  const shape = withLabel
    ? `inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
        tone === "dark" ? "bg-white/12 text-white ring-1 ring-white/25 backdrop-blur" : "text-ocean-700"
      }`
    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full";

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`收藏${name}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle(slug, name);
      }}
      className={`${base}${toneCls} ${shape} ${className}`}
    >
      <span className={`flex ${on ? "motion-safe:animate-[star-pop_150ms_ease-out]" : ""}`}>
        <StarIcon on={on} tone={tone} />
      </span>
      {withLabel && (
        <span>{on ? "已收藏" : "收藏"}</span>
      )}
    </button>
  );
}
