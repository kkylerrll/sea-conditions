"use client";

// 首頁的三.js 場景掛載點。這個檔案本身很薄，故意的：三.js 引擎（DiveEngine，
// 見 dive/engine.ts）是一個獨立 class,不碰 React；這裡只負責「有沒有 canvas」
// 「要不要跑」兩件事。
//
// 為什麼整支元件要用 next/dynamic(ssr:false) 掛進 page.tsx，而不是直接 import：
// three.js 建構子會摸 window / WebGL context，SSR 階段執行會直接炸掉；動態載入
// 讓五章的文字（server component）照樣是初次 HTML 就有的內容，3D 的程式碼是
// 額外的一個 chunk，不會擋住文字的首次繪製。
//
// 降級路徑：沒有 WebGL、或使用者開了 prefers-reduced-motion，就完全不建立
// DiveEngine——canvas 留空，底下 .chapter-stage 的 CSS 深水漸層背景頂著，
// 不會有任何一半渲染出來的東西卡在畫面上。
import { useEffect, useRef, useState } from "react";
import { ALL_MODELS, DEBUG_ALL_ROWS, type ModelName } from "./dive/models";

// 除錯模式：網址加 `?diveDebug=<物種>`（例如 `?diveDebug=tuna`）會讓
// DiveEngine 只放大顯示那一種生物、慢慢左右擺盪，用來肉眼確認牠朝向正確
// （見 dive/engine.ts 的 updateDebugScene）。`?diveDebug=all` 則是七種生物
// 一次排排站（見 dive/engine.ts 的 setupDebugAllScene）——單一物種模式把
// 鯖魚／鎚頭鯊縮得太小看不出朝向，排排站模式統一正規化大小才看得清楚。
// 沒有這個查詢參數、或值不是七個模型名稱之一也不是 "all" 時，完全走一般
// 首頁的邏輯——不會影響正常使用者。
function readDebugKind(): ModelName | "all" | undefined {
  if (typeof window === "undefined") return undefined;
  const v = new URLSearchParams(window.location.search).get("diveDebug");
  if (v === "all") return "all";
  return (ALL_MODELS as string[]).includes(v ?? "") ? (v as ModelName) : undefined;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function DiveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 只在掛載時讀一次（這個元件本來就只在 client 渲染,見檔案頂端
  // dynamic(ssr:false) 的說明），用來決定要不要畫除錯用的 DOM 標籤。
  const [debugKind] = useState<ModelName | "all" | undefined>(() => readDebugKind());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !supportsWebGL()) return;

    let disposed = false;
    let engineRef: import("./dive/engine").DiveEngine | null = null;

    // 引擎本體也是動態載入：three.js 加上 GLTFLoader/MeshoptDecoder 是這頁
    // 最重的一塊，跟「文字要不要等 3D」徹底分開,才不會讓 hero 的第一次繪製
    // 被這包 JS 卡住。
    import("./dive/engine").then(({ DiveEngine }) => {
      if (disposed) return;
      const engine = new DiveEngine(canvas, { debugKind });
      engineRef = engine;
      // 開發用：讓開發者在瀏覽器 console 直接摸到引擎實例做即時檢查。
      if (process.env.NODE_ENV !== "production") (window as any).__dive = engine;
      engine.start();
    });

    return () => {
      disposed = true;
      engineRef?.dispose();
    };
  }, [debugKind]);

  return (
    <>
      <canvas ref={canvasRef} className="dive-canvas" aria-hidden="true" />
      {/* 除錯排排站模式的標籤：純粹開發用的 DOM 浮水印,標出每一列是哪個
          物種。frac 跟 dive/engine.ts 的 setupDebugAllScene 共用同一份
          DEBUG_ALL_ROWS（見 dive/models.ts），兩邊才會對齊。 */}
      {debugKind === "all" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }}>
          {DEBUG_ALL_ROWS.map(({ kind, frac }) => (
            <div
              key={kind}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: `${frac * 100}%`,
                transform: "translateY(-50%)",
                padding: "0.15rem 0.55rem",
                borderRadius: "0.25rem",
                background: "rgba(0,0,0,0.6)",
                color: "#eafcff",
                font: "12px/1.2 monospace",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {kind}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
