// 把單日海況數字畫成圖：海面波浪、風羅盤、潮汐曲線、水溫計。
// 全部純 SVG + CSS 動畫（globals.css），不需 client JS；動畫都吃 prefers-reduced-motion。
// 註：水下能見度是「浪高的線性換算」，沒有獨立資訊，因此不做成獨立卡片，
//     只在浪高（SeaStateHero）底下附一行推估值，並註明非實測。

import {
  ACTIVITY_KIND_ZH,
  type ActivityKind,
  compassZh,
  hasBothKinds,
  nowMinutesTaipei,
  parseTideTimes,
  RATING_HEX,
  ratingFor,
  ratingOf,
  reasonsFor,
  wetsuitAdvice,
  windDesc,
  windDirZh,
  windFromDeg,
} from "@/lib/sea";
import type { Condition, Rating } from "@/lib/types";

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

export function SeaStateHero({
  c,
  rating,
  activityLabel,
}: {
  c: Condition;
  rating?: Rating;
  activityLabel?: string;
}) {
  const rk = ratingOf(rating ?? c.rating);
  const col = RATING_HEX[rk];
  const h = c.wave_height_m;
  const amp = h == null ? 6 : clamp(lerp(3, 26, h / 3.5), 3, 26);
  const period = c.wave_period_s ?? 7;
  const dur = clamp(lerp(3, 9, (period - 3) / 9), 3, 9);
  const W = 720; // 畫 2 倍寬，CSS 位移 -50% 剛好一個可視寬，波長取 90/120/180 皆整除 360 → 無縫循環

  return (
    <div
      className="card-clean relative overflow-hidden rounded-3xl"
    >
      <div className="relative z-10 flex items-end justify-between gap-4 p-5 pb-24">
        <div>
          <p className="text-xs font-semibold tracking-wide text-ocean-700">
            今日海面
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-6xl font-bold tabular-nums text-slate-800">
              {h == null ? "—" : h.toFixed(1)}
            </span>
            <span className="text-lg font-semibold text-slate-600">m</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            湧浪週期 {c.wave_period_s == null ? "—" : `約 ${Math.round(c.wave_period_s)} 秒一波`}
            {c.wave_dir ? ` · 來向 ${compassZh(c.wave_dir)}（${c.wave_dir}）` : ""}
          </p>
          {c.visibility_m != null && (
            <p className="mt-2 max-w-[15rem] text-xs leading-snug text-slate-600">
              水下能見度約 <span className="font-semibold text-slate-700">{c.visibility_m} m</span>
              <br />
              由浪高換算的粗估值，非現場觀測
            </p>
          )}
        </div>
        <span
          className="mb-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
          style={{ background: col.soft, color: col.text }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: col.base }} />
          {activityLabel ? `${activityLabel}・${col.label}` : col.label}
        </span>
      </div>

      {/* 波浪動畫層 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28">
        <svg viewBox={`0 0 ${W / 2} 160`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
          <g className="sea-wave" style={{ animationDuration: `${dur * 1.6}s` }}>
            <path d={sineWavePath(W, amp * 0.6, 90, 60)} fill="#0B6FA4" fillOpacity="0.10" />
          </g>
          <g className="sea-wave" style={{ animationDuration: `${dur * 1.15}s` }}>
            <path d={sineWavePath(W, amp * 0.85, 180, 74)} fill="#0B6FA4" fillOpacity="0.18" />
          </g>
          <g className="sea-wave" style={{ animationDuration: `${dur}s` }}>
            <path d={sineWavePath(W, amp, 120, 92)} fill="#0B6FA4" fillOpacity="0.30" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ══════════ 1b. 潛水 / 衝浪 分開的燈號 ══════════ */
// 只有同時支援潛水與衝浪的地區才顯示（同一片海，潛水怕浪、衝浪要浪，燈號常相反）。

export function ActivityRatings({
  c,
  activities,
}: {
  c: Condition;
  activities: string[];
}) {
  if (!hasBothKinds(activities)) return null;
  const kinds: ActivityKind[] = ["dive", "surf"];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {kinds.map((k) => {
        const col = RATING_HEX[ratingFor(c, k)];
        const reason = reasonsFor(c, k)[0];
        return (
          <div
            key={k}
            className="rounded-2xl border bg-white p-3 shadow-sm"
            style={{ borderColor: col.base }}
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.base }} />
              <span className="text-sm font-semibold text-slate-800">{ACTIVITY_KIND_ZH[k]}</span>
              <span className="text-xs font-semibold" style={{ color: col.text }}>
                {col.label}
              </span>
            </div>
            {reason && <p className="mt-1 text-xs leading-snug text-slate-600">{reason}</p>}
          </div>
        );
      })}
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
    <figure className="card-clean p-4">
      <figcaption className="text-xs font-semibold tracking-wide text-ocean-700">風</figcaption>
      <div className="mt-1 flex items-center gap-4">
        <svg viewBox="0 0 160 160" className="h-28 w-28 shrink-0" aria-hidden="true">
          <circle cx={cx} cy={cy} r={R} fill="#FBF8F3" stroke="#B3D6E8" strokeWidth="2" />
          {[0, 90, 180, 270].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={cx + Math.sin(rad) * (R - 8)}
                y1={cy - Math.cos(rad) * (R - 8)}
                x2={cx + Math.sin(rad) * R}
                y2={cy - Math.cos(rad) * R}
                stroke="#B3D6E8"
                strokeWidth="2"
              />
            );
          })}
          <text x={cx} y={cy - R + 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="#B8442B">北</text>
          <text x={cx} y={cy + R - 6} textAnchor="middle" fontSize="11" fill="#095A86">南</text>
          <text x={cx + R - 5} y={cy + 4} textAnchor="middle" fontSize="11" fill="#095A86">東</text>
          <text x={cx - R + 5} y={cy + 4} textAnchor="middle" fontSize="11" fill="#095A86">西</text>

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
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="#64748b">無風向</text>
          )}
        </svg>

        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums text-slate-800">
            {scale == null ? "—" : `${scale} 級`}
            {c.wind_speed_ms != null && (
              <span className="ml-1.5 text-sm font-semibold text-slate-600">{c.wind_speed_ms} m/s</span>
            )}
          </p>
          <p className="text-sm font-medium text-ocean-700">{windDirZh(c.wind_dir)}</p>
          <p className="mt-1 text-xs text-slate-600">
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
      <figure className="card-clean p-4">
        <figcaption className="text-xs font-semibold tracking-wide text-ocean-700">潮汐</figcaption>
        <p className="mt-6 text-center text-sm text-slate-500">此地無潮汐預報資料</p>
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
    <figure className="card-clean p-4">
      <figcaption className="text-xs font-semibold tracking-wide text-ocean-700">潮汐（今日）</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto mt-1 w-full max-w-[560px]" role="img" aria-label="今日潮汐時間曲線">
        <defs>
          <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B6FA4" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0B6FA4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 6, 12, 18, 24].map((hr) => (
          <g key={hr}>
            <line x1={xOf(hr * 60)} y1={16} x2={xOf(hr * 60)} y2={BASE} stroke="#D9EAF4" strokeWidth="1" />
            <text x={xOf(hr * 60)} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">
              {hr}時
            </text>
          </g>
        ))}

        <path d={`${d} L ${xOf(1440)} ${BASE} L ${xOf(0)} ${BASE} Z`} fill="url(#tideFill)" />
        <path d={d} fill="none" stroke="#0B6FA4" strokeWidth="2.5" strokeLinecap="round" />

        {ext.map((e, i) => (
          <g key={i} transform={`translate(${xOf(e.minutes)}, ${e.kind === "high" ? yHigh : yLow})`}>
            <circle r={4} fill="#0B6FA4" />
            <text
              y={e.kind === "high" ? -22 : 32}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
            >
              {e.kind === "high" ? "滿潮" : "乾潮"}
            </text>
            <text
              y={e.kind === "high" ? -8 : 18}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#1e293b"
            >
              {e.label}
            </text>
          </g>
        ))}

        {nowX >= PADX && nowX <= W - PADX && (
          <g transform={`translate(${nowX}, 0)`}>
            <line x1={0} y1={14} x2={0} y2={BASE} stroke="#F2785C" strokeWidth="1.5" strokeDasharray="3 3" />
            <text
              x={nowX > W - 60 ? -5 : 5}
              y={22}
              textAnchor={nowX > W - 60 ? "end" : "start"}
              fontSize="11"
              fontWeight="700"
              fill="#B8442B"
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
    <figure className="flex gap-4 card-clean p-4">
      <svg viewBox="0 0 64 160" className="h-32 w-14 shrink-0" aria-hidden="true">
        <rect x={20} y={tubeTop} width={16} height={tubeBot - tubeTop} rx={8} fill="#EEF6FB" />
        {t != null && (
          <rect x={20} y={level} width={16} height={tubeBot - level} rx={8} fill="#0B6FA4" />
        )}
        {[16, 24, 32].map((v) => {
          const y = tubeBot - ((v - lo) / (hi - lo)) * (tubeBot - tubeTop);
          return (
            <g key={v}>
              <line x1={38} y1={y} x2={43} y2={y} stroke="#B3D6E8" strokeWidth="1.5" />
              <text x={45} y={y + 3} fontSize="9" fill="#095A86">{v}</text>
            </g>
          );
        })}
        <circle cx={28} cy={138} r={14} fill={t == null ? "#cbd5e1" : "#0B6FA4"} />
        <rect x={24} y={110} width={8} height={30} fill={t == null ? "#cbd5e1" : "#0B6FA4"} />
      </svg>
      <div className="min-w-0">
        <figcaption className="text-xs font-semibold tracking-wide text-ocean-700">水溫</figcaption>
        <p className="text-2xl font-bold tabular-nums text-slate-800">
          {t == null ? "—" : `${t.toFixed(1)}°C`}
        </p>
        <p className="mt-1 text-sm font-semibold text-ocean-700">建議 {suit}</p>
        <p className="text-xs text-slate-600">{note}</p>
      </div>
    </figure>
  );
}
