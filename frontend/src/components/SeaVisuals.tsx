// 把單日海況數字畫成圖：海面波浪、風羅盤、潮汐曲線、水溫計、能見度條。
// 全部純 SVG + CSS 動畫（globals.css），不需 client JS；動畫都吃 prefers-reduced-motion。

import {
  nowMinutesTaipei,
  parseTideTimes,
  RATING_HEX,
  ratingOf,
  wetsuitAdvice,
  windDesc,
  windDirZh,
  windFromDeg,
} from "@/lib/sea";
import type { Condition } from "@/lib/types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

/* ══════════ 1. 海面狀態 ══════════ */

function sineWavePath(width: number, amp: number, wavelength: number, baseY: number): string {
  const step = 6;
  let d = `M 0 ${baseY + amp * Math.sin(0)}`;
  for (let x = step; x <= width; x += step) {
    const y = baseY + amp * Math.sin((x / wavelength) * Math.PI * 2);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${width} 160 L 0 160 Z`;
  return d;
}

export function SeaStateHero({ c }: { c: Condition }) {
  const rk = ratingOf(c.rating);
  const col = RATING_HEX[rk];
  const h = c.wave_height_m;
  const amp = h == null ? 6 : clamp(lerp(3, 26, h / 3.5), 3, 26);
  const period = c.wave_period_s ?? 7;
  const dur = clamp(lerp(3, 9, (period - 3) / 9), 3, 9);
  const W = 720; // 畫 2 倍寬，CSS 位移 -50% 剛好一個可視寬，波長取 90/120/180 皆整除 360 → 無縫循環

  return (
    <div
      className="relative overflow-hidden rounded-3xl border shadow-sm"
      style={{ borderColor: col.base, background: col.soft }}
    >
      <div className="relative z-10 flex items-end justify-between gap-4 p-5 pb-24">
        <div>
          <p className="text-xs font-medium" style={{ color: col.text }}>
            今日海面
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-5xl font-extrabold tabular-nums text-slate-900">
              {h == null ? "—" : h.toFixed(1)}
            </span>
            <span className="text-lg font-bold text-slate-500">m</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            湧浪週期 {c.wave_period_s == null ? "—" : `約 ${Math.round(c.wave_period_s)} 秒一波`}
          </p>
        </div>
        <span
          className="mb-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
          style={{ background: "#fff", color: col.text }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: col.base }} />
          {col.label}
        </span>
      </div>

      {/* 波浪動畫層 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28">
        <svg viewBox={`0 0 ${W / 2} 160`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
          <g className="sea-wave" style={{ animationDuration: `${dur * 1.6}s` }}>
            <path d={sineWavePath(W, amp * 0.6, 90, 60)} fill={col.base} fillOpacity="0.25" />
          </g>
          <g className="sea-wave" style={{ animationDuration: `${dur * 1.15}s` }}>
            <path d={sineWavePath(W, amp * 0.85, 180, 74)} fill={col.base} fillOpacity="0.4" />
          </g>
          <g className="sea-wave" style={{ animationDuration: `${dur}s` }}>
            <path d={sineWavePath(W, amp, 120, 92)} fill={col.base} fillOpacity="0.65" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ══════════ 2. 風羅盤 ══════════ */

export function WindCompass({ c }: { c: Condition }) {
  const deg = windFromDeg(c.wind_dir); // 風「來自」的方位
  const scale = c.wind_scale;
  const arrowLen = scale == null ? 30 : clamp(lerp(24, 52, scale / 7), 24, 52);
  const arrowCol =
    scale == null ? "#94a3b8" : scale <= 3 ? "#10b981" : scale <= 4 ? "#f59e0b" : "#f43f5e";
  const R = 62;
  const cx = 80;
  const cy = 80;

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="text-xs font-medium text-slate-500">風</figcaption>
      <div className="mt-1 flex items-center gap-4">
        <svg viewBox="0 0 160 160" className="h-28 w-28 shrink-0" aria-hidden="true">
          <circle cx={cx} cy={cy} r={R} fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          {[0, 90, 180, 270].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={cx + Math.sin(rad) * (R - 8)}
                y1={cy - Math.cos(rad) * (R - 8)}
                x2={cx + Math.sin(rad) * R}
                y2={cy - Math.cos(rad) * R}
                stroke="#cbd5e1"
                strokeWidth="2"
              />
            );
          })}
          <text x={cx} y={cy - R + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="#64748b">北</text>
          <text x={cx} y={cy + R - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">南</text>
          <text x={cx + R - 5} y={cy + 4} textAnchor="middle" fontSize="11" fill="#94a3b8">東</text>
          <text x={cx - R + 5} y={cy + 4} textAnchor="middle" fontSize="11" fill="#94a3b8">西</text>

          {deg != null ? (
            <g transform={`rotate(${deg} ${cx} ${cy})`}>
              {/* 箭頭從「來向」邊緣指向中心（順風方向） */}
              <line x1={cx} y1={cy - arrowLen} x2={cx} y2={cy + arrowLen * 0.5} stroke={arrowCol} strokeWidth="4" strokeLinecap="round" />
              <path
                d={`M ${cx} ${cy + arrowLen * 0.72} L ${cx - 6} ${cy + arrowLen * 0.4} L ${cx + 6} ${cy + arrowLen * 0.4} Z`}
                fill={arrowCol}
              />
              <circle cx={cx} cy={cy} r={3.5} fill={arrowCol} />
            </g>
          ) : (
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="#94a3b8">無風向</text>
          )}
        </svg>

        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">
            {scale == null ? "—" : `${scale} 級`}
          </p>
          <p className="text-sm text-slate-600">{windDirZh(c.wind_dir)}</p>
          <p className="mt-1 text-xs text-slate-400">
            {windDesc(scale)}
            {c.gust_ms != null ? ` · 陣風 ${c.gust_ms} m/s` : ""}
          </p>
        </div>
      </div>
    </figure>
  );
}

/* ══════════ 3. 潮汐曲線 ══════════ */

export function TideCurve({ c }: { c: Condition }) {
  const highs = parseTideTimes(c.tide_high, "high");
  const lows = parseTideTimes(c.tide_low, "low");
  const ext = [...highs, ...lows].sort((a, b) => a.minutes - b.minutes);

  const W = 380;
  const H = 150;
  const PADX = 16;
  const BASE = H - 22;
  const yHigh = 34;
  const yLow = 104;
  const xOf = (min: number) => PADX + (min / 1440) * (W - 2 * PADX);

  if (ext.length === 0) {
    return (
      <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <figcaption className="text-xs font-medium text-slate-500">潮汐</figcaption>
        <p className="mt-6 text-center text-sm text-slate-400">此地無潮汐預報資料</p>
      </figure>
    );
  }

  // 頭尾補點：鏡射第一/最後一段間隔，讓曲線畫滿 24h
  const pts: { x: number; y: number }[] = ext.map((e) => ({
    x: xOf(e.minutes),
    y: e.kind === "high" ? yHigh : yLow,
  }));
  const first = ext[0];
  const last = ext[ext.length - 1];
  const gapStart = ext.length > 1 ? ext[1].minutes - ext[0].minutes : 372;
  const gapEnd = ext.length > 1 ? last.minutes - ext[ext.length - 2].minutes : 372;
  pts.unshift({ x: xOf(first.minutes - gapStart), y: first.kind === "high" ? yLow : yHigh });
  pts.push({ x: xOf(last.minutes + gapEnd), y: last.kind === "high" ? yLow : yHigh });

  // 以半餘弦連接各極值點
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const mx = (p0.x + p1.x) / 2;
    d += ` C ${mx.toFixed(1)} ${p0.y.toFixed(1)}, ${mx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const nowX = xOf(nowMinutesTaipei());

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="text-xs font-medium text-slate-500">潮汐（今日）</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto mt-1 w-full max-w-[560px]" role="img" aria-label="今日潮汐時間曲線">
        <defs>
          <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 6, 12, 18, 24].map((hr) => (
          <g key={hr}>
            <line x1={xOf(hr * 60)} y1={16} x2={xOf(hr * 60)} y2={BASE} stroke="#f1f5f9" strokeWidth="1" />
            <text x={xOf(hr * 60)} y={H - 6} textAnchor="middle" fontSize="11" fill="#cbd5e1">
              {hr}時
            </text>
          </g>
        ))}

        <path d={`${d} L ${xOf(1440)} ${BASE} L ${xOf(0)} ${BASE} Z`} fill="url(#tideFill)" />
        <path d={d} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />

        {ext.map((e, i) => (
          <g key={i} transform={`translate(${xOf(e.minutes)}, ${e.kind === "high" ? yHigh : yLow})`}>
            <circle r={4} fill="#0284c7" />
            <text
              y={e.kind === "high" ? -22 : 32}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              {e.kind === "high" ? "滿潮" : "乾潮"}
            </text>
            <text
              y={e.kind === "high" ? -8 : 18}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#0f172a"
            >
              {e.label}
            </text>
          </g>
        ))}

        {nowX >= PADX && nowX <= W - PADX && (
          <g transform={`translate(${nowX}, 0)`}>
            <line x1={0} y1={14} x2={0} y2={BASE} stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="3 3" />
            <text
              x={nowX > W - 60 ? -5 : 5}
              y={22}
              textAnchor={nowX > W - 60 ? "end" : "start"}
              fontSize="11"
              fontWeight="700"
              fill="#f43f5e"
            >
              現在
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/* ══════════ 4. 水溫計 ══════════ */

export function TempGauge({ c }: { c: Condition }) {
  const t = c.water_temp_c;
  const lo = 16;
  const hi = 32;
  const fill = t == null ? 0 : clamp((t - lo) / (hi - lo), 0, 1);
  const tubeTop = 16;
  const tubeBot = 128;
  const level = tubeBot - fill * (tubeBot - tubeTop);
  const { suit, note } = wetsuitAdvice(t);

  return (
    <figure className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <svg viewBox="0 0 56 160" className="h-32 w-12 shrink-0" aria-hidden="true">
        <rect x={20} y={tubeTop} width={16} height={tubeBot - tubeTop} rx={8} fill="#f1f5f9" />
        {t != null && (
          <rect x={20} y={level} width={16} height={tubeBot - level} rx={8} fill="#0ea5e9" />
        )}
        <circle cx={28} cy={138} r={14} fill={t == null ? "#cbd5e1" : "#0284c7"} />
        <rect x={24} y={110} width={8} height={30} fill={t == null ? "#cbd5e1" : "#0284c7"} />
      </svg>
      <div className="min-w-0">
        <figcaption className="text-xs font-medium text-slate-500">水溫</figcaption>
        <p className="text-2xl font-extrabold tabular-nums text-slate-900">
          {t == null ? "—" : `${t.toFixed(1)}°C`}
        </p>
        <p className="mt-1 text-sm font-semibold text-sky-700">建議 {suit}</p>
        <p className="text-xs text-slate-400">{note}</p>
      </div>
    </figure>
  );
}

/* ══════════ 5. 能見度條 ══════════ */

export function VisibilityBar({ c }: { c: Condition }) {
  const v = c.visibility_m;
  const pct = v == null ? 0 : clamp(v / 15, 0, 1) * 100;
  const tag = v == null ? "—" : v >= 10 ? "清澈" : v >= 6 ? "普通" : "偏濁";

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <figcaption className="text-xs font-medium text-slate-500">水下能見度（估）</figcaption>
        <span className="text-xs text-slate-400">{tag}</span>
      </div>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
        {v == null ? "—" : `${v} m`}
      </p>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-sky-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-300">
        <span>0</span>
        <span>15 m+</span>
      </div>
    </figure>
  );
}
