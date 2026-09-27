"use client";

// 首頁滾動敘事的容器。整頁的動態全部由這裡寫出的少數幾個值驅動，CSS 讀這些值算
// 出所有位移與透明度——只有一個 scroll listener、一個 rAF，沒有逐幀的樣式計算。
//
// 每一幀寫出的東西：
//   --progress    0→1 的捲動進度，等於這次下潛的深度。
//   --scroll-vel  0→1 的捲動快慢，停下來會自己衰減回 0。水體微粒靠它決定要被拉多長，
//                 這是「畫面回應了我的動作」唯一的來源——沒有它，微粒只是在自顧自地飄。
//   --pointer-x/y 游標相對畫面中心的位移（-1→1），讓場景有極輕微的視差。
//   深度讀數      直接寫進 textContent，不走 React state：這個數字每幀都在變，
//                 走 state 等於每幀 re-render 整棵樹，而實際要改的只有一個文字節點。
//   .scroll-dir-up / .is-active  只在「方向翻轉」「跨章」時才動 classList。
//
// prefers-reduced-motion 開啟或 JS 沒跑時，.progress-armed 不會掛上去，上面所有東西
// 都不生效，版面退回一般的垂直長頁，內容全部可見——不會有任何東西卡在 opacity: 0。
import { useEffect, useRef } from "react";
import { depthAt } from "./depth";

// 捲動方向判斷的「防手震」門檻：單一 rAF frame 內位移小於這個值不算數，
// 避免滑鼠滾輪或觸控板的微小回彈讓潛水員姿勢一直閃爍翻轉。方向只在「淨位移」
// 累積超過門檻時才會真的切換一次，門檻內的抖動完全不會碰 classList。
const DIRECTION_FLIP_THRESHOLD_PX = 10;

// 捲動速度換算成 0→1 時，幾 px/frame 算「全速」。抓 55px 大約是滾輪滑一下的速度，
// 再快就一律當成全速，免得甩一下觸控板就把微粒拉成誇張的長條。
const FULL_SPEED_PX_PER_FRAME = 55;

// 停止捲動後速度的衰減率。每幀乘這個值，約 0.2 秒收斂回靜止；衰減而不是直接歸零，
// 微粒才會「慢慢停下來」而不是瞬間僵住。
const VELOCITY_DECAY = 0.86;

export default function ScrollScene({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) return;

    // 目前作用中的章節。章節之間的交叉溶接純靠 CSS 讀 --progress，不需要知道
    // 「現在是第幾章」；這個索引只為了兩件 CSS 算不出來的事：讓疊在底下、透明度
    // 已經歸零的章節不要攔截到 CTA 的點擊，以及讓左側刻度軸與底部編號標出目前
    // 這一章。只有真的跨章時才會動到 classList，捲動中大多數的 frame 什麼都不做。
    const chapterEls = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter-at]"));
    const railEls = Array.from(root.querySelectorAll<HTMLElement>("[data-rail-at]"));
    const span = Math.max(1, chapterEls.length - 1);
    let activeChapter = -1;

    const setActiveChapter = (next: number) => {
      if (next === activeChapter) return;
      for (const el of chapterEls) el.classList.toggle("is-active", Number(el.dataset.chapterAt) === next);
      for (const el of railEls) el.classList.toggle("is-active", Number(el.dataset.railAt) === next);
      activeChapter = next;
    };

    // 深度讀數的文字節點。找不到（例如未來把深度計拿掉）就維持 null，其餘照跑。
    const depthEl = root.querySelector<HTMLElement>("[data-depth-readout]");

    let ticking = false;
    // lastCommittedY：只有在方向真的翻轉時才更新，門檻內的抖動不會移動這個基準點，
    // 這樣下一次判斷用的還是「上一次確定方向」時的位置，等於是有記憶的滯後判斷。
    let lastCommittedY = window.scrollY;
    let scrollingUp = false;

    // 捲動速度。scroll 事件停了之後還要繼續衰減，所以需要一個會自己接著跑的 rAF——
    // 只在速度還沒收斂到 0 之前存在，靜止時完全不佔用任何 frame。
    let velocity = 0;
    let lastVelocityY = window.scrollY;
    let decaying = false;

    const writeVelocity = () => root.style.setProperty("--scroll-vel", velocity.toFixed(3));

    const decay = () => {
      velocity *= VELOCITY_DECAY;
      if (velocity < 0.005) {
        velocity = 0;
        decaying = false;
      }
      writeVelocity();
      if (decaying) requestAnimationFrame(decay);
    };

    const updateProgress = () => {
      ticking = false;
      const rect = root.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const raw = total > 0 ? -rect.top / total : 0;
      const clamped = Math.min(1, Math.max(0, raw));
      root.style.setProperty("--progress", clamped.toFixed(4));
      setActiveChapter(Math.round(clamped * span));

      if (depthEl) depthEl.textContent = depthAt(clamped).toFixed(1);

      const currentY = window.scrollY;

      // 這一幀移動了多少，換算成 0→1。取 max 而不是直接覆寫：衰減中又繼續捲時，
      // 速度只會被推高、不會被一個剛好很小的幀差硬拉下來，微粒的反應才不會忽快忽慢。
      const speed = Math.min(1, Math.abs(currentY - lastVelocityY) / FULL_SPEED_PX_PER_FRAME);
      lastVelocityY = currentY;
      if (speed > velocity) {
        velocity = speed;
        writeVelocity();
      }
      if (!decaying && velocity > 0) {
        decaying = true;
        requestAnimationFrame(decay);
      }

      const delta = currentY - lastCommittedY;
      if (Math.abs(delta) >= DIRECTION_FLIP_THRESHOLD_PX) {
        const nextScrollingUp = delta < 0;
        if (nextScrollingUp !== scrollingUp) {
          scrollingUp = nextScrollingUp;
          root.classList.toggle("scroll-dir-up", scrollingUp);
        }
        lastCommittedY = currentY;
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    };

    // 游標視差：位移量很小（CSS 端只放大到幾 px），目的是讓畫面對「人在看它」有反應，
    // 不是真的要做 3D。用 pointermove 一併涵蓋滑鼠與觸控筆；手機沒有游標，自然不會觸發。
    let pointerTicking = false;
    let pointerX = 0;
    let pointerY = 0;
    const applyPointer = () => {
      pointerTicking = false;
      root.style.setProperty("--pointer-x", pointerX.toFixed(3));
      root.style.setProperty("--pointer-y", pointerY.toFixed(3));
    };
    const onPointerMove = (e: PointerEvent) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = (e.clientY / window.innerHeight) * 2 - 1;
      if (pointerTicking) return;
      pointerTicking = true;
      requestAnimationFrame(applyPointer);
    };

    updateProgress();
    root.classList.add("progress-armed");
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });

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
      window.removeEventListener("pointermove", onPointerMove);
      // 讓還在跑的衰減 rAF 在下一幀自己結束，不然元件卸載後它會繼續對著
      // 已經脫離文件的節點寫樣式。
      decaying = false;
      observer?.disconnect();
    };
  }, []);

  // 首頁沒有 Header/Sidebar，AppChrome 也不再包一層有 padding 的容器，所以這裡
  // 不需要（也不能再用）負 margin 去抵銷外層 padding——整頁本來就是滿版無邊界。
  return (
    <main ref={rootRef} className="landing-scene relative">
      {children}
    </main>
  );
}
