// hero 底部的三層波浪（純 SVG + 既有 .sea-wave 動畫，吃 prefers-reduced-motion）。
// 顏色是 sand 白，讓 hero 的深海漸層自然「浮」到下方的沙白頁面上。

function wave(width: number, amp: number, wavelength: number, baseY: number): string {
  let d = `M 0 ${baseY}`;
  for (let x = 6; x <= width; x += 6) {
    d += ` L ${x} ${(baseY + amp * Math.sin((x / wavelength) * Math.PI * 2)).toFixed(1)}`;
  }
  return `${d} L ${width} 80 L 0 80 Z`;
}

export default function HeroWaves({ className = "" }: { className?: string }) {
  const W = 720; // 2 倍寬，波長整除 360 → 位移 -50% 無縫循環
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 sm:h-16 ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W / 2} 80`} preserveAspectRatio="none" className="h-full w-full">
        <g className="sea-wave" style={{ animationDuration: "19s" }}>
          <path d={wave(W, 5, 180, 36)} fill="#FBF8F3" fillOpacity="0.25" />
        </g>
        <g className="sea-wave" style={{ animationDuration: "13s" }}>
          <path d={wave(W, 4, 120, 48)} fill="#FBF8F3" fillOpacity="0.5" />
        </g>
        <g className="sea-wave" style={{ animationDuration: "9s" }}>
          <path d={wave(W, 3, 90, 62)} fill="#FBF8F3" />
        </g>
      </svg>
    </div>
  );
}
