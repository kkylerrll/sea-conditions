"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Map as MlMap, Marker as MlMarker, Popup as MlPopup } from "maplibre-gl";
import { ACTIVITY_KIND_ZH, type ActivityKind, RATING_HEX, ratingFor, supportsActivity } from "@/lib/sea";
import type { Location } from "@/lib/types";

/* 真實地圖：MapLibre GL JS + OpenFreeMap（OSM 資料，免金鑰、可商用）。
   maplibre-gl 只在瀏覽器端用動態 import 載入（不進 SSR）。
   標記是 HTML <button>，沿用原本 SVG 地圖的 pin 設計（燈號色、白框、面鏡／衝浪板、
   無預報＝虛線空心圈）。 */

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
// 涵蓋本島 + 澎湖 + 蘭嶼 + 綠島 + 小琉球
const TAIWAN_BOUNDS: [[number, number], [number, number]] = [
  [119.2, 21.8],
  [122.3, 25.45],
];
const ISLAND_SLUGS = new Set(["penghu", "penghu-south", "lyudao", "lanyu", "xiaoliuqiu"]);

const GLYPH: Record<ActivityKind, string> = {
  dive: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4h-2l-1.5-2h-3L9 15H7a4 4 0 0 1-4-4Z"/>',
  surf: '<path d="M5 19C3.5 11 11 3.5 20 4c.5 9-7 16.5-15 15Z"/><path d="M8.5 15.5 15.5 8.5"/>',
};

function pinHtml(loc: Location, activity: ActivityKind): { html: string; label: string; noRating: boolean } {
  const supported = supportsActivity(loc.activities, activity);
  const rk = ratingFor(loc.today, activity);
  const c = RATING_HEX[rk];
  const noRating = !supported || rk === "unknown";
  const label = supported
    ? `${loc.name}，今日${ACTIVITY_KIND_ZH[activity]}海況${c.label}`
    : `${loc.name}，沒有${ACTIVITY_KIND_ZH[activity]}預報`;
  const icon = noRating
    ? `<svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10" fill="#F4F7FA" fill-opacity=".95" stroke="#7C8DA0" stroke-width="2" stroke-dasharray="3.2 2.6"/><path d="M-4 0h8" stroke="#7C8DA0" stroke-width="2.2" stroke-linecap="round"/></svg>`
    : `<svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true"><circle r="12" fill="${c.base}" stroke="#fff" stroke-width="3"/><g transform="translate(-7 -7) scale(.58)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH[activity]}</g></svg>`;
  const pulse = !noRating && rk === "green" ? `<span class="sea-pin-pulse" style="background:${c.base}"></span>` : "";
  const html = `${pulse}<span class="sea-pin-body${noRating ? " is-empty" : ""}">${icon}</span><span class="sea-pin-label${noRating ? " is-empty" : ""}"></span>`;
  return { html, label, noRating };
}

interface Props {
  locations: Location[];
  selected: string | null;
  /** 傳 null 代表取消選取（點空白處、按 Esc、關閉預覽卡） */
  onSelect: (slug: string | null) => void;
  activity: ActivityKind;
  hovered?: string | null;
  onHover?: (slug: string | null) => void;
  /** 選取某個 pin 後的預覽卡內容（桌機為 pin 旁的 Popup，手機為底部卡） */
  renderPreview?: (loc: Location, close: () => void) => ReactNode;
}

export default function LiveMap({
  locations,
  selected,
  onSelect,
  activity,
  hovered = null,
  onHover,
  renderPreview,
}: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(new Map<string, { marker: MlMarker; el: HTMLButtonElement }>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [hint, setHint] = useState(false);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  // 最新值放 ref，讓只建立一次的原生事件處理器讀得到
  const selectedRef = useRef(selected);
  const mobileRef = useRef(mobile);
  const locsRef = useRef(locations);
  const activityRef = useRef(activity);
  const cb = useRef({ onSelect, onHover, push: router.push });
  selectedRef.current = selected;
  mobileRef.current = mobile;
  locsRef.current = locations;
  activityRef.current = activity;
  cb.current = { onSelect, onHover, push: router.push };

  const reduced = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduced.current = mq.matches;
    };
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const fitAll = useCallback((animate: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(TAIWAN_BOUNDS, { padding: 24, duration: animate && !reduced.current ? 700 : 0 });
  }, []);

  // 建立地圖（只跑一次，動態載入 maplibre-gl）
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    let onWheel: ((e: WheelEvent) => void) | null = null;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const el = wrapRef.current;

    (async () => {
      try {
        const lib = await import("maplibre-gl");
        if (cancelled || !el) return;
        libRef.current = lib;
        map = new lib.Map({
          container: el,
          style: STYLE_URL,
          bounds: TAIWAN_BOUNDS,
          fitBoundsOptions: { padding: 24 },
          minZoom: 5,
          maxZoom: 16,
          dragRotate: false,
          pitchWithRotate: false,
          attributionControl: { compact: false },
          cooperativeGestures: false,
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.scrollZoom.disable(); // 預設不接管滾輪，免得頁面捲不動
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;

        // 滾輪：按住 Ctrl / ⌘（觸控板雙指縮放也帶 ctrlKey）或點過地圖後才縮放
        let armed = false;
        map.on("mousedown", () => {
          armed = true;
        });
        el.addEventListener("mouseleave", () => {
          armed = false;
        });
        onWheel = (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey || armed) {
            map!.scrollZoom.enable();
          } else {
            map!.scrollZoom.disable();
            setHint(true);
            clearTimeout(hintTimer);
            hintTimer = setTimeout(() => setHint(false), 1400);
          }
        };
        el.addEventListener("wheel", onWheel, { capture: true, passive: true });

        map.on("click", (ev) => {
          const t = ev.originalEvent?.target as Element | null;
          // 點到標記或預覽卡不算「點空白處」
          if (t?.closest?.(".sea-pin, .maplibregl-popup")) return;
          cb.current.onSelect(null);
        });
        let initZoom = 0;
        map.on("zoomend", () => {
          const z = map!.getZoom();
          el.classList.toggle("sea-map-detail", z >= 8.5);
          setZoomed(z > initZoom + 0.3);
        });
        map.once("load", () => {
          initZoom = map!.getZoom();
          if (!cancelled) setReady(true);
        });
        map.on("error", (e) => {
          // 圖磚偶發失敗不致命；只有整個 style 載不到才顯示錯誤
          if (!map!.isStyleLoaded() && /style|404|Failed to fetch/i.test(String(e?.error?.message ?? ""))) {
            if (!cancelled) setFailed(true);
          }
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      if (onWheel && el) el.removeEventListener("wheel", onWheel, { capture: true });
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // 標記：地點清單 / 活動別變動時重建
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    markers.current.forEach(({ marker }) => marker.remove());
    markers.current.clear();

    for (const loc of locations) {
      const { html, label } = pinHtml(loc, activity);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "sea-pin";
      el.dataset.pin = loc.slug;
      el.setAttribute("aria-label", label);
      el.setAttribute("aria-pressed", "false");
      el.innerHTML = html;
      (el.querySelector(".sea-pin-label") as HTMLElement).textContent = loc.name;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (selectedRef.current === loc.slug && !mobileRef.current) {
          // 桌機：再點一次已選取的 pin 直接進詳情頁
          const kind = supportsActivity(loc.activities, activityRef.current)
            ? activityRef.current
            : activityRef.current === "dive"
              ? "surf"
              : "dive";
          cb.current.push(`/spots/${loc.slug}?activity=${kind}`);
        } else {
          cb.current.onSelect(loc.slug);
        }
      });
      el.addEventListener("mouseenter", () => cb.current.onHover?.(loc.slug));
      el.addEventListener("mouseleave", () => cb.current.onHover?.(null));
      el.addEventListener("focus", () => cb.current.onHover?.(loc.slug));
      el.addEventListener("blur", () => cb.current.onHover?.(null));

      const marker = new lib.Marker({ element: el, anchor: "center" }).setLngLat([loc.lon, loc.lat]).addTo(map);
      markers.current.set(loc.slug, { marker, el });
    }
  }, [ready, locations, activity]);

  // 選取 / hover 樣式
  useEffect(() => {
    markers.current.forEach(({ el }, slug) => {
      const sel = slug === selected;
      el.classList.toggle("is-selected", sel);
      el.classList.toggle("is-hovered", slug === hovered);
      el.setAttribute("aria-pressed", String(sel));
      el.style.zIndex = sel ? "3" : slug === hovered ? "2" : "";
    });
  }, [selected, hovered, ready, locations, activity]);

  // 選取 → 飛過去（reduced-motion 用 jumpTo）；Esc 關閉
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selected) return;
    const loc = locsRef.current.find((l) => l.slug === selected);
    if (!loc) return;
    const target = ISLAND_SLUGS.has(selected) ? 11 : 9.5;
    const opts = {
      center: [loc.lon, loc.lat] as [number, number],
      zoom: Math.max(map.getZoom(), target),
      // 桌機：pin 偏左，預覽卡往右展開；手機：pin 偏上，底部卡蓋住下半
      offset: (mobileRef.current ? [0, -90] : [-130, 0]) as [number, number],
    };
    if (reduced.current) map.jumpTo(opts);
    else map.flyTo({ ...opts, duration: 800, essential: false });
  }, [selected, ready]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onSelect]);

  // 桌機預覽卡：maplibre Popup，內容用 React portal 渲染（<Link> 才是真的 Next Link）
  const selLoc = selected ? locations.find((l) => l.slug === selected) ?? null : null;
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib || !selLoc || mobile || !renderPreview) {
      setPopupEl(null);
      return;
    }
    const box = document.createElement("div");
    const popup: MlPopup = new lib.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      maxWidth: "19rem",
      offset: 26,
      className: "sea-popup",
    })
      .setLngLat([selLoc.lon, selLoc.lat])
      .setDOMContent(box)
      .addTo(map);
    setPopupEl(box);
    return () => {
      popup.remove();
      setPopupEl(null);
    };
    // renderPreview 每次 render 都是新函式，內容更新交給 portal；這裡只在換點時重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selLoc?.slug, mobile]);

  const close = useCallback(() => onSelect(null), [onSelect]);

  return (
    <div className="relative h-[62vh] min-h-[26rem] w-full overflow-hidden rounded-[1.25rem] bg-ocean-50 shadow-soft ring-1 ring-ocean-100 lg:h-[70vh]">
      <div ref={wrapRef} className="sea-map h-full w-full" role="region" aria-label="台灣潛點與衝浪點地圖，可拖曳平移；按住 Ctrl 或 ⌘ 滾動縮放" />

      {!ready && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-ocean-700">
          地圖載入中…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-ocean-50 p-6 text-center text-sm text-slate-700">
          地圖圖磚暫時載入不了，請重新整理；也可以直接從清單挑地點。
        </div>
      )}

      {zoomed && (
        <button
          type="button"
          onClick={() => fitAll(true)}
          className="absolute left-2.5 top-2.5 z-10 min-h-9 cursor-pointer rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-ocean-700 shadow-soft ring-1 ring-ocean-200 backdrop-blur transition hover:bg-white hover:text-slate-900"
        >
          回全台
        </button>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-3 z-10 mx-auto w-fit rounded-full bg-abyss-800/85 px-4 py-1.5 text-xs font-semibold text-white shadow-soft transition-opacity duration-200 ${
          hint ? "opacity-100" : "opacity-0"
        }`}
      >
        按住 Ctrl／⌘ 並滾動來縮放地圖
      </div>

      {/* 桌機 popup 內容（portal 進 maplibre Popup） */}
      {popupEl && selLoc && renderPreview && createPortal(renderPreview(selLoc, close), popupEl)}

      {/* 手機底部卡 */}
      {mobile && selLoc && renderPreview && (
        <div key={selLoc.slug} className="map-pop">
          {renderPreview(selLoc, close)}
        </div>
      )}
    </div>
  );
}
