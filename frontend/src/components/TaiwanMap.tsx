"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { MAP_H, MAP_W, project, SPOT_NUDGE } from "@/lib/geo";
import { ACTIVITY_KIND_ZH, type ActivityKind, RATING_HEX, ratingFor, supportsActivity } from "@/lib/sea";
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
  /** 傳 null 代表取消選取（點空白處、按 Esc、關閉預覽卡） */
  onSelect: (slug: string | null) => void;
  activity: ActivityKind;
  /** 清單 hover 的地點 slug（與 marker hover 雙向同步） */
  hovered?: string | null;
  onHover?: (slug: string | null) => void;
  /** 選取某個 pin 後，浮在 pin 旁（手機為底部卡）的預覽卡內容 */
  renderPreview?: (loc: Location, close: () => void) => ReactNode;
}

/* 標籤方向：全台縮放時 13 個點很擠，逐一指定往哪邊長，避免互相壓住
   （例：蘭嶼與墾丁、東北角與宜蘭）。l/r = 左右，t/b = 上下置中。 */
const LABEL_SIDE: Record<string, "l" | "r" | "t" | "b"> = {
  beihaian: "l",
  longdong: "b",
  yilan: "r",
  miaoli: "l",
  tainan: "l",
  kaohsiung: "l",
  taitung: "r",
  lyudao: "r",
  lanyu: "r",
  "kenting-houbihu": "l",
  xiaoliuqiu: "l",
  penghu: "r",
  "penghu-south": "r",
};

const LABEL_POS = {
  l: { x: -17, y: 4, anchor: "end" },
  r: { x: 17, y: 4, anchor: "start" },
  t: { x: 0, y: -19, anchor: "middle" },
  b: { x: 0, y: 27, anchor: "middle" },
} as const;

// 活動小圖示（24x24 座標、白色線條）：潛水面鏡／衝浪板
function ActivityGlyph({ kind }: { kind: ActivityKind }) {
  return kind === "dive" ? (
    <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4h-2l-1.5-2h-3L9 15H7a4 4 0 0 1-4-4Z" />
    </g>
  ) : (
    <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19C3.5 11 11 3.5 20 4c.5 9-7 16.5-15 15Z" />
      <path d="M8.5 15.5 15.5 8.5" />
    </g>
  );
}

export default function TaiwanMap({
  locations,
  selected,
  onSelect,
  activity,
  hovered = null,
  onHover,
  renderPreview,
}: Props) {
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
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // 容器實際像素寬：pin／標籤要維持固定「螢幕像素」大小，要用它換算 viewBox 單位
  const [cw, setCw] = useState(560);
  const locsRef = useRef(locations);
  locsRef.current = locations;

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
    const el = wrapRef.current;
    if (!el) return;
    setCw(el.getBoundingClientRect().width || 560);
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width || 560));
    ro.observe(el);
    return () => ro.disconnect();
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
      const dur = 460;
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

  // 選取變動（點 pin 或點清單卡）→ 把該點平移到預覽卡看得到的位置。
  // 離島走原本的 zoom-to-island；本島放大到約 1.7 倍。手機預覽卡蓋在底部，
  // 所以 pin 要放在畫面偏上（30%），桌機放正中。
  useEffect(() => {
    if (!selected) return;
    const loc = locsRef.current.find((l) => l.slug === selected);
    if (!loc) return;
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    const key = SLUG_ISLAND[selected];
    const p = markerPos(loc);
    // 桌機：pin 放偏左（36%），預覽卡往右展開；手機：置中偏上
    const ry = mobile ? 0.3 : 0.5;
    const rx = mobile ? 0.5 : 0.36;
    const w = key ? Math.max(islandTarget(key).w, 60) : MAP_W / 1.7;
    const h = w * ASPECT;
    animateTo({ x: p.x - rx * w, y: p.y - ry * h, w, h });
  }, [selected, animateTo]);

  // Esc 關閉預覽卡
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onSelect]);

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
    },
    [onSelect],
  );

  const zoom = MAP_W / vb.w;
  const inv = vb.w / cw; // 1 個 viewBox 單位 = cw / vb.w 像素，反過來縮放 → 1 單位 = 1px
  const detailed = zoom >= LOD_ZOOM;
  const isZoomed = vb.w < MAP_W - ZOOM_EPS;
  const coast = detailed ? TAIWAN_COAST_FINE : TAIWAN_COAST_COARSE;

  const selLoc = selected ? locations.find((l) => l.slug === selected) ?? null : null;
  const selPos = selLoc ? markerPos(selLoc) : null;
  const selPct = selPos
    ? { x: ((selPos.x - vb.x) / vb.w) * 100, y: ((selPos.y - vb.y) / vb.h) * 100 }
    : null;

  return (
    // 容器固定 300:420，svg 填滿 → viewBox 座標與百分比定位一一對應，預覽卡才抓得準
    <div
      ref={wrapRef}
      className="relative mx-auto aspect-[300/420] w-full"
      style={{ maxWidth: "min(100%, calc(76vh * 300 / 420))" }}
    >
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="block h-full w-full touch-none select-none overflow-hidden rounded-[1.25rem]"
        role="group"
        aria-label="台灣潛點分布地圖，可捲動縮放與拖曳平移"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClick={(e) => {
          // 點到空白處（不是 pin、也不是拖曳）→ 關閉預覽卡
          if (!moved.current && !(e.target as Element).closest("[data-pin]")) onSelect(null);
        }}
      >
        <defs>
          <linearGradient id="ocean" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#CBE7F5" />
            <stop offset="55%" stopColor="#9CCDE6" />
            <stop offset="100%" stopColor="#6FB2D6" />
          </linearGradient>
          <radialGradient id="seaGlow" cx="0.3" cy="0.35" r="0.8">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFCF5" />
            <stop offset="100%" stopColor="#F2E9D6" />
          </linearGradient>
          <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#073B5E" floodOpacity="0.28" />
          </filter>
          <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#052A45" floodOpacity="0.45" />
          </filter>
        </defs>

        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#ocean)" />
        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#seaGlow)" />

        {/* 淺水暈：同一條海岸線疊兩層寬描邊，做出由岸邊往外海漸深的層次 */}
        <path d={coast} fill="none" stroke="#E4F4FB" strokeOpacity="0.55" strokeWidth="16" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={coast} fill="none" stroke="#E4F4FB" strokeOpacity="0.7" strokeWidth="7" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {/* 陸地（本島 + 澎湖 + 綠島 + 蘭嶼 + 小琉球，單一 path）；放大後換高細節版本 */}
        <g filter="url(#landShadow)">
          <path
            d={coast}
            fill="url(#land)"
            stroke="#5FA3C7"
            strokeWidth="1.4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* 潛點 marker：外層用未縮放座標定位，內層 scale(1/zoom) 反向抵銷，
            所以 pin 與文字在任何縮放倍率下都保持固定螢幕大小。
            選取的點最後畫，才不會被別的 pin 蓋住。 */}
        {[...locations].sort((a, b) => Number(a.slug === selected) - Number(b.slug === selected)).map((loc) => {
          const { x, y } = markerPos(loc);
          const supported = supportsActivity(loc.activities, activity);
          const rk = ratingFor(loc.today, activity);
          const c = RATING_HEX[rk];
          // 「無預報」：這個活動不支援，或支援但沒資料。用虛線空心圈，跟有燈號的實心 pin 一眼可分。
          const noRating = !supported || rk === "unknown";
          const isSel = selected === loc.slug;
          const isHov = hovered === loc.slug;
          const lp = LABEL_POS[LABEL_SIDE[loc.slug] ?? "r"];
          const showLabel = isSel || isHov;
          const label = supported
            ? `${loc.name}，今日${ACTIVITY_KIND_ZH[activity]}海況${c.label}`
            : `${loc.name}，沒有${ACTIVITY_KIND_ZH[activity]}預報`;

          return (
            <g key={loc.slug} transform={`translate(${x} ${y})`}>
              <g
                data-pin
                transform={`scale(${inv})`}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={isSel}
                className="cursor-pointer outline-none [&:focus-visible_.pin-focus]:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  activate(loc.slug);
                }}
                onPointerEnter={() => onHover?.(loc.slug)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(loc.slug)}
                onBlur={() => onHover?.(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activate(loc.slug);
                  }
                }}
              >
                {/* 觸控命中區 */}
                <circle cx={0} cy={0} r={22} fill="transparent" />
                <circle className="pin-focus opacity-0" cx={0} cy={0} r={19} fill="none" stroke="#0B6FA4" strokeWidth="2.5" strokeDasharray="4 3" />

                {isSel && <circle cx={0} cy={0} r={21} fill="#fff" fillOpacity="0.55" stroke="#073B5E" strokeWidth="2" />}

                {!noRating && !isSel && rk === "green" && (
                  <circle
                    cx={0}
                    cy={0}
                    r={13}
                    fill={c.base}
                    className="animate-ping opacity-30 motion-reduce:hidden"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  />
                )}

                <g
                  style={{
                    transform: `scale(${isSel ? 1.2 : isHov ? 1.15 : 1})`,
                    transition: "transform 160ms ease-out",
                  }}
                  filter="url(#pinShadow)"
                >
                  {noRating ? (
                    <>
                      <circle cx={0} cy={0} r={10} fill="#F4F7FA" fillOpacity="0.95" stroke="#7C8DA0" strokeWidth={2} strokeDasharray="3.2 2.6" />
                      <path d="M-4 0h8" stroke="#7C8DA0" strokeWidth="2.2" strokeLinecap="round" />
                    </>
                  ) : (
                    <>
                      <circle cx={0} cy={0} r={12} fill={c.base} stroke="#fff" strokeWidth={3} />
                      <g transform="translate(-7 -7) scale(0.58)">
                        <ActivityGlyph kind={activity} />
                      </g>
                    </>
                  )}
                </g>

                {/* 標籤：桌機常駐（各點已指定方向避免互壓），手機只在 hover／選取時顯示 */}
                <g
                  transform={`translate(${lp.x} ${lp.y})`}
                  textAnchor={lp.anchor}
                  className={showLabel ? undefined : "max-sm:hidden"}
                  pointerEvents="none"
                >
                  <text
                    x={0}
                    y={0}
                    fontSize="13"
                    fontWeight={noRating ? 500 : 700}
                    fill={noRating ? "#4B6178" : "#052A45"}
                    stroke="#fff"
                    strokeWidth="3.5"
                    strokeLinejoin="round"
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
          className="absolute right-2.5 top-2.5 min-h-9 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-ocean-700 shadow-soft ring-1 ring-ocean-200 backdrop-blur transition hover:bg-white hover:text-slate-900"
        >
          回全台
        </button>
      )}

      {selLoc && selPct && renderPreview && (
        <div
          key={selLoc.slug}
          className="map-pop"
          data-side={selPct.x < 52 ? "r" : "l"}
          style={{ ["--px" as string]: `${selPct.x}%`, ["--py" as string]: `${selPct.y}%` }}
        >
          {renderPreview(selLoc, () => onSelect(null))}
        </div>
      )}
    </div>
  );
}
