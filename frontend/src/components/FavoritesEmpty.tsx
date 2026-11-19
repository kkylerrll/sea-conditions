"use client";

/** 選了「收藏」但一個都沒有（docs/design/favorites.md §5） */
export default function FavoritesEmpty({ onShowAll }: { onShowAll: () => void }) {
  return (
    <div className="card-clean p-5 text-center">
      <span className="flex justify-center">
        <svg width="32" height="32" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5Z"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="mt-2 text-base font-bold text-slate-900">還沒有收藏的地區</p>
      <p className="mt-1 text-sm text-slate-600">點地區卡片右上角的 ☆，常去的地方就會集中在這裡。</p>
      <button
        type="button"
        onClick={onShowAll}
        className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white px-4 text-sm font-semibold text-ocean-700 outline-none ring-1 ring-ocean-200 transition hover:bg-ocean-50 focus-visible:ring-2 focus-visible:ring-ocean-600"
      >
        看全部地區
      </button>
    </div>
  );
}
