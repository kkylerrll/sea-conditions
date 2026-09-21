"use client";

// 首頁專用的浮動 CTA：一離開第一屏（hero 的 #hero-sentinel 離開視窗）就出現，
// 停在跟全域 Header 同一條水平帶上，滾到任何深度都點得到「開始使用」。
// 只在首頁掛載這個元件，其他頁面的 Header 完全不受影響。
import Link from "next/link";
import { useEffect, useState } from "react";

export default function StickyLandingCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById("hero-sentinel");
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      // 沒有 IntersectionObserver 支援時，安全起見直接常駐顯示
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`sticky-landing-cta fixed right-3 z-[45] transition-all duration-300 motion-reduce:transition-none sm:right-4 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
      }`}
      style={{ top: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
    >
      <Link
        href="/explore"
        tabIndex={visible ? 0 : -1}
        className="flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-sky-700 px-4 text-sm font-semibold text-white shadow-md outline-none transition-colors hover:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2"
      >
        開始使用
      </Link>
    </div>
  );
}
