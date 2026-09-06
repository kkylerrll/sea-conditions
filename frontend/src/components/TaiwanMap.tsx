"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_H, MAP_W, project, SPOT_NUDGE } from "@/lib/geo";
import { RATING_HEX, ratingOf } from "@/lib/sea";
import {
  FULL_VIEW,
  ISLAND_BOXES,
  type IslandKey,
  TAIWAN_COAST_COARSE,
  TAIWAN_COAST_FINE,
} from "@/lib/taiwan-paths";
import type { Location } from "@/lib/types";

/* 台灣輪廓來自 src/lib/taiwan-paths.ts（Natural Earth 1:10m，public domain），
   由 scripts/gen-taiwan-paths.mjs 事先產生並 commit，執行期不做任何座標運算。
   平移 / 縮放全靠控制 SVG viewBox，沒有引入任何地圖 / 圖磚函式庫。 */

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: ViewBox = { x: 0, y: 0, w: MAP_W, h: MAP_H };
const ASPECT = MAP_H / MAP_W;

// 最小 viewBox 寬度 ≈ 島嶼層級的最大放大倍率（MAP_W / 16 ≈ 18x）
const MIN_VIEW_W = 16;
// 放大到這個倍率以上就換成高細節、真實比例的海岸線
const LOD_ZOOM = 2.2;
const ZOOM_EPS = 0.5; // 判斷「有沒有被放大」的容差

// 潛點 slug → 離島群組；本島的點不觸發 zoom-to-island
const SLUG_ISLAND: Partial<Record<string, IslandKey>> = {
  penghu: "penghu",
  lyudao: "lyudao",
  lanyu: "lanyu",
  xiaoliuqiu: "xiaoliuqiu",
};

function clampVB(vb: ViewBox): ViewBox {
  const w = Math.min(MAP_W, Math.max(MIN_VIEW_W, vb.w));
  const h = w * ASPECT;
  const x = Math.min(MAP_W - w, Math.max(0, vb.x));
  const y = Math.min(MAP_H - h, Math.max(0, vb.y));
  return { x, y, w, h };
}

function islandCenter(key: IslandKey): { x: number; y: number } {
  const b = ISLAND_BOXES[key];
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function islandTarget(key: IslandKey): ViewBox {
  const { x: cx, y: cy } = islandCenter(key);
  const b = ISLAND_BOXES[key];
  const wWanted = Math.max(MIN_VIEW_W, b.w * 2.6, b.h * 2.6 * (1 / ASPECT));
  const w = Math.min(MAP_W, wWanted);
  return clampVB({ x: cx - w / 2, y: cy - (w * ASPECT) / 2, w, h: w * ASPECT });
}

// marker 位置：離島 Location 直接放島嶼 bbox 中心（COARSE 放大顯示與
// FINE 真實比例都以真實質心為基準，所以兩種檢視都落在島上）；
// 本島 Location 用投影座標 + 微調。
function markerPos(loc: Location): { x: number; y: number } {
  const key = SLUG_ISLAND[loc.slug];
  if (key) return islandCenter(key);
  const base = project(loc.lat, loc.lon);
  const n = SPOT_NUDGE[loc.slug] ?? { dx: 0, dy: 0 };
  return { x: base.x + n.dx, y: base.y + n.dy };
}

interface Props {
  locations: Location[];
  selected: string | null;
  onSelect: (slug: string) => void;
}

export default function TaiwanMap({ locations, selected, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [vb, setVbState] = useState<ViewBox>(FULL);
  const vbRef = useRef(vb);
  const setVb = useCallback((next: ViewBox) => {
    vbRef.current = next;
    setVbState(next);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ cx0: number; cy0: number; vb0: ViewBox } | null>(null);
  const pinch = useRef<{ dist0: number; midClient: { x: number; y: number }; vb0: ViewBox } | null>(null);
  const moved = useRef(false);
  const raf = useRef<number | null>(null);
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

  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);

  const toSvg = useCallback((clientX: number, clientY: number, base: ViewBox) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: base.x + ((clientX - r.left) / r.width) * base.w,
      y: base.y + ((clientY - r.top) / r.height) * base.h,
    };
  }, []);

  const zoomAbout = useCallback(
    (clientX: number, clientY: number, factor: number, base?: ViewBox) => {
      const cur = base ?? vbRef.current;
      const p = toSvg(clientX, clientY, cur);
      const w = Math.min(MAP_W, Math.max(MIN_VIEW_W, cur.w / factor));
      const ratio = w / cur.w;
      setVb(
        clampVB({
          x: p.x - (p.x - cur.x) * ratio,
          y: p.y - (p.y - cur.y) * ratio,
          w,
          h: w * ASPECT,
        }),
      );
    },
    [setVb, toSvg],
  );

  const animateTo = useCallback(
    (target: ViewBox) => {
      const to = clampVB(target);
      if (raf.current != null) cancelAnimationFrame(raf.current);
      if (reduced.current) {
        setVb(to);
        return;
      }
      const from = { ...vbRef.current };
      const t0 = performance.now();
      const dur = 420;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        setVb({
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          w: from.w + (to.w - from.w) * e,
          h: from.h + (to.h - from.h) * e,
        });
        if (p < 1) raf.current = requestAnimationFrame(tick);
        else raf.current = null;
      };
      raf.current = requestAnimationFrame(tick);
    },
    [setVb],
  );

  // wheel zoom — needs a non-passive native listener to preventDefault
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      zoomAbout(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAbout]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    if (pointers.current.size === 1) {
      pan.current = { cx0: e.clientX, cy0: e.clientY, vb0: { ...vbRef.current } };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      pan.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        midClient: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        vb0: { ...vbRef.current },
      };
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const n = pointers.current.size;

      if (n >= 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { vb0, dist0, midClient } = pinch.current;
        // pan by pinch-midpoint drift, then zoom about the midpoint
        const r = svgRef.current!.getBoundingClientRect();
        const panned: ViewBox = clampVB({
          x: vb0.x - ((mid.x - midClient.x) / r.width) * vb0.w,
          y: vb0.y - ((mid.y - midClient.y) / r.height) * vb0.h,
          w: vb0.w,
          h: vb0.h,
        });
        zoomAbout(mid.x, mid.y, dist / dist0, panned);
        moved.current = true;
        return;
      }

      if (n === 1 && pan.current) {
        const { cx0, cy0, vb0 } = pan.current;
        const r = svgRef.current!.getBoundingClientRect();
        const dx = ((e.clientX - cx0) / r.width) * vb0.w;
        const dy = ((e.clientY - cy0) / r.height) * vb0.h;
        if (Math.hypot(e.clientX - cx0, e.clientY - cy0) > 3) moved.current = true;
        setVb(clampVB({ x: vb0.x - dx, y: vb0.y - dy, w: vb0.w, h: vb0.h }));
      }
    },
    [setVb, zoomAbout],
  );

  const endPointer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      pan.current = { cx0: only.x, cy0: only.y, vb0: { ...vbRef.current } };
    }
    if (pointers.current.size === 0) pan.current = null;
  }, []);

  const resetView = useCallback(() => {
    animateTo(FULL_VIEW);
  }, [animateTo]);

  const activate = useCallback(
    (slug: string) => {
      if (moved.current) return;
      onSelect(slug);
      const key = SLUG_ISLAND[slug];
      if (key) animateTo(islandTarget(key));
    },
    [animateTo, onSelect],
  );

  const zoom = MAP_W / vb.w;
  const inv = 1 / zoom;
  const detailed = zoom >= LOD_ZOOM;
  const isZoomed = vb.w < MAP_W - ZOOM_EPS;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="h-auto w-full max-h-[62vh] touch-none select-none sm:max-h-[70vh]"
        role="group"
        aria-label="台灣潛點分布地圖，可捲動縮放與拖曳平移"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <defs>
          <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#ecfccb" />
          </linearGradient>
          <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0c4a6e" floodOpacity="0.18" />
          </filter>
        </defs>

        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#ocean)" rx="18" />

        {/* 陸地（本島 + 澎湖 + 綠島 + 蘭嶼 + 小琉球，單一 path）；
            放大後換高細節版本，描邊維持固定粗細 */}
        <g filter="url(#landShadow)">
          <path
            d={detailed ? TAIWAN_COAST_FINE : TAIWAN_COAST_COARSE}
            fill="url(#land)"
            stroke="#84cc16"
            strokeWidth="1.4"
            strokeOpacity="0.6"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* 潛點 marker：外層用未縮放座標定位，內層 scale(1/zoom) 反向抵銷，
            所以 pin 與文字在任何縮放倍率下都保持固定螢幕大小 */}
        {locations.map((loc) => {
          const { x, y } = markerPos(loc);
          const c = RATING_HEX[ratingOf(loc.today?.rating ?? "unknown")];
          const isSel = selected === loc.slug;
          const labelLeft = x > MAP_W - 74;
          const labelBelow = y < 40;

          return (
            <g key={loc.slug} transform={`translate(${x} ${y})`}>
              <g
                transform={`scale(${inv})`}
                role="button"
                tabIndex={0}
                aria-label={`${loc.name}，今日海況${c.label}`}
                aria-pressed={isSel}
                className="cursor-pointer outline-none [&:focus-visible_.pin-focus]:opacity-100"
                onClick={() => activate(loc.slug)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activate(loc.slug);
                  }
                }}
              >
                {/* 觸控命中區 */}
                <circle cx={0} cy={0} r={20} fill="transparent" />
                <circle className="pin-focus opacity-0" cx={0} cy={0} r={13} fill="none" stroke="#0284c7" strokeWidth="2" />

                {!isSel && (
                  <circle
                    cx={0}
                    cy={0}
                    r={6}
                    fill={c.base}
                    className="origin-center animate-ping opacity-30 motion-reduce:hidden"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  />
                )}

                <circle cx={0} cy={0} r={isSel ? 8 : 6} fill={c.base} stroke="#fff" strokeWidth={isSel ? 3 : 2} />

                <g
                  transform={`translate(${labelLeft ? -10 : 10}, ${labelBelow ? 14 : -4})`}
                  textAnchor={labelLeft ? "end" : "start"}
                >
                  <text
                    x={0}
                    y={0}
                    className="font-bold"
                    fontSize="11"
                    fill="#0f172a"
                    stroke="#fff"
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {loc.name}
                  </text>
                </g>
              </g>
            </g>
          );
        })}
      </svg>

      {isZoomed && (
        <button
          type="button"
          onClick={resetView}
          className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200 backdrop-blur transition hover:bg-white hover:text-slate-900"
        >
          回全台
        </button>
      )}
    </div>
  );
}
