"use client";

// 首頁滾動敘事的容器：只做兩件事，兩件事都很便宜。
// 1) 一個 rAF 節流的 scroll listener，只寫一個 CSS 變數 --progress（0→1），
//    背景漸層、深度標記、捲動提示全部靠 CSS 的 calc()/min()/max() 吃這個變數，
//    不再另外掛 scroll listener。
// 2) 一個 IntersectionObserver，幫 [data-reveal] 區塊做一次性淡入。
// prefers-reduced-motion 開啟時兩者都不啟動：內容維持 CSS 預設的「已顯示」狀態，
// 不會有滾動位移，也不會卡在 opacity: 0（因為沒被 JS 加上任何隱藏用的 class）。
import { useEffect, useRef } from "react";

export default function ScrollScene({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) return;

    let ticking = false;
    const updateProgress = () => {
      ticking = false;
      const rect = root.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const raw = total > 0 ? -rect.top / total : 0;
      const clamped = Math.min(1, Math.max(0, raw));
      root.style.setProperty("--progress", clamped.toFixed(4));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    };

    updateProgress();
    root.classList.add("progress-armed");
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      root.classList.add("reveal-armed");
      const targets = root.querySelectorAll("[data-reveal]");
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
      );
      targets.forEach((t) => observer!.observe(t));
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <main ref={rootRef} className="landing-scene relative -mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      {children}
    </main>
  );
}
