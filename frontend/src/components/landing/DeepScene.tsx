// 深海段落的背景：懸浮微粒（marine snow）＋ 遠遠變小、變淡的潛水員回聲，
// 呼應「潛水員在虛空中很小」的畫面要求。潛水員位置一樣是 --progress 的連續函式。
const SNOW = [
  { left: "12%", top: "8%", size: 3, delay: "0s", duration: "9s" },
  { left: "28%", top: "22%", size: 2, delay: "1.4s", duration: "11s" },
  { left: "44%", top: "5%", size: 4, delay: "2.1s", duration: "8s" },
  { left: "62%", top: "16%", size: 2.5, delay: "0.6s", duration: "10.5s" },
  { left: "78%", top: "28%", size: 3.5, delay: "3.2s", duration: "9.5s" },
  { left: "20%", top: "45%", size: 2, delay: "1.8s", duration: "12s" },
  { left: "55%", top: "52%", size: 3, delay: "2.6s", duration: "8.5s" },
  { left: "85%", top: "48%", size: 2.5, delay: "0.9s", duration: "10s" },
  { left: "35%", top: "68%", size: 3.5, delay: "3.6s", duration: "9s" },
  { left: "68%", top: "72%", size: 2, delay: "1.1s", duration: "11.5s" },
  { left: "10%", top: "80%", size: 3, delay: "2.9s", duration: "8.8s" },
  { left: "92%", top: "65%", size: 2.5, delay: "0.3s", duration: "10.8s" },
];

export default function DeepScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 遠方的潛水員回聲：極小、極淡，再疊一層景深模糊（dof-blur-lg）強調「在虛空中
          很遠」；跟主場景的潛水員共用同一個 diver-flip 翻轉邏輯，方向翻轉時兩個潛水員
          會同步轉向，不會一個頭下一個頭上看起來像 bug。 */}
      <div className="deep-diver-anchor dof-blur-lg absolute left-1/2 top-[6%] h-14 w-6 text-[#cfe8ff]/50 sm:h-16 sm:w-7">
        <div className="diver-flip h-full w-full">
          <svg viewBox="0 0 60 140" className="h-full w-full">
            <use href="#diver-figure" />
          </svg>
        </div>
      </div>

      {SNOW.map((p, i) => (
        <svg
          key={i}
          viewBox="0 0 6 6"
          className={`marine-snow absolute text-sky-100/60 ${i >= 7 ? "hidden sm:block" : ""} ${
            p.size <= 2.5 ? "dof-blur-sm" : ""
          }`}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        >
          <use href="#snow-dot" />
        </svg>
      ))}

      {/* 顆粒質感：極低透明度雜訊，手機版直接關掉。 */}
      <div className="landing-grain absolute inset-0" aria-hidden="true" />
    </div>
  );
}
