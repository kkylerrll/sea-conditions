"use client";

import { useEffect, useRef, useState } from "react";
import { LIVE_CAMS, type ImageCam, type LinkCam, type LiveCam, type YoutubeCam } from "@/data/liveCams";

const REFRESH_MS = 60_000;

function CamFooter({ cam }: { cam: LiveCam }) {
  return (
    <p className="text-[11px] leading-relaxed text-slate-500">
      影像來源：
      <a
        href={cam.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-600 hover:underline"
      >
        {cam.owner}
      </a>
    </p>
  );
}

function YoutubeCard({ cam }: { cam: YoutubeCam }) {
  // 點擊後才掛 iframe，避免頁面載入時一次拉多路串流
  const [playing, setPlaying] = useState(false);
  const src = cam.channelId
    ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${cam.channelId}&autoplay=1&mute=1`
    : `https://www.youtube-nocookie.com/embed/${cam.videoId}?autoplay=1&mute=1`;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
      {playing ? (
        <iframe
          src={src}
          title={`${cam.name} 即時影像`}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-sky-900 to-slate-900 px-4 text-center text-white transition hover:from-sky-800"
        >
          <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1.5 4.7 5 3.3-5 3.3V6.7Z" />
          </svg>
          <span className="text-sm font-semibold">{cam.name}</span>
          <span className="text-xs text-sky-200">{cam.owner}</span>
          <span className="rounded-full bg-white/15 px-3 py-0.5 text-xs">點擊播放</span>
        </button>
      )}
    </div>
  );
}

function ImageCard({ cam }: { cam: ImageCam }) {
  const [tick, setTick] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 只在畫面可見時每 60 秒換一張，加時間參數避開快取
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, [visible]);

  const sep = cam.url.includes("?") ? "&" : "?";
  return (
    <div ref={ref} className="aspect-video w-full overflow-hidden rounded-xl bg-slate-100">
      {failed ? (
        <a
          href={cam.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-slate-600 hover:bg-slate-200"
        >
          <span>影像暫時無法載入</span>
          <span className="text-xs text-sky-600">前往來源頁觀看</span>
        </a>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${cam.url}${sep}_=${tick}`}
          alt={`${cam.name} 即時影像截圖`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function LinkCard({ cam }: { cam: LinkCam }) {
  return (
    <a
      href={cam.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-center text-sky-800 transition hover:bg-sky-100"
    >
      <span className="text-sm font-semibold">{cam.name}</span>
      <span className="text-xs">到官方網站觀看即時影像 ↗</span>
    </a>
  );
}

export default function LiveCams({ slug }: { slug: string }) {
  const cams = LIVE_CAMS[slug];
  if (!cams || cams.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-bold text-slate-900">即時影像</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cams.map((cam) => (
          <div key={`${cam.kind}-${cam.name}`} className="min-w-0 space-y-1.5">
            <h3 className="truncate text-sm font-medium text-slate-700">{cam.name}</h3>
            {cam.kind === "youtube" && <YoutubeCard cam={cam} />}
            {cam.kind === "image" && <ImageCard cam={cam} />}
            {cam.kind === "link" && <LinkCard cam={cam} />}
            <CamFooter cam={cam} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">影像由第三方提供，可能延遲或暫停</p>
    </section>
  );
}
