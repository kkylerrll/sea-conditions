// 共用的「剪影素材庫」＋濾鏡庫：潛水員、魚、衝浪者、光柱漸層、濾鏡全部只定義一次，
// 後面全部用 <use href="#id"> / filter="url(#id)" 重複引用（不同位置/大小/顏色），
// 避免整頁塞進幾十條手繪路徑或重複的濾鏡定義，SVG 節點數維持在可控範圍。
//
// ============ 寫實化重繪說明（第三版修正）============
// 前兩版被打回票的原因是「純色塊填色」：形狀畫得再對，只要是 flat fill 看起來就是
// 業餘等級的向量圖。這一版的做法：
//   1. 人物剪影改成真正的解剖結構（頭罩＋呼吸管、氣瓶、四肢、蛙鞋／衝浪板），
//      而不是膠囊堆疊，並加上 landing-rim-light 濾鏡做「從上方打來的邊緣光」。
//   2. 所有「光」「水」相關的濾鏡都用程序雜訊（feTurbulence）生成，不是純色形狀：
//      - landing-edge-distort：位移貼圖，把數學上工整的浪緣/水面線打亂成不規則形狀。
//      - landing-caustics：低頻雜訊 threshold 成光網光絲，screen 疊加。
//      - landing-shaft-volumetric：雜訊當透明度遮罩＋模糊，讓光柱沿長度方向濃淡不均。
//      - landing-grain：極低透明度全域顆粒，破除純向量的塑膠感。
//   3. 全部濾鏡的參數都是靜態值，動畫只動外層 DOM 的 transform/opacity——絕對不會
//      每一幀重新計算 feTurbulence（那會慢到卡頓）。濾鏡各自有獨立、不會撞名的 id
//      （統一 "landing-" 前綴），避免跟其他頁面（例如 TaiwanMap 的 #landShadow）衝突。
//   4. 手機版（<640px）由呼叫端用 CSS media query 直接關掉這些濾鏡（filter: none）
//      或整層不渲染，退回沒有濾鏡的簡化版本，維持中階手機的流暢度。
export default function SceneDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        {/* ---------- 剪影符號 ---------- */}

        {/* 潛水員剪影：面鏡＋呼吸管、背後氣瓶、四肢、蛙鞋。用「自然直立、頭上腳下」
            的姿勢畫（等同上升時的正確姿勢），下潛時的「頭下腳上」由 CSS 對外層容器
            旋轉 180 度做到，見 globals.css 的 .diver-flip。 */}
        <symbol id="diver-figure" viewBox="0 0 60 140">
          {/* 頭部與面鏡 */}
          <circle cx="30" cy="15" r="9" fill="currentColor" />
          <path d="M23,12 Q30,8 37,12 L36,20 Q30,23.5 24,20 Z" fill="#0b2338" fillOpacity="0.55" />
          <path d="M25,13.5 Q30,11.5 34,13.5" stroke="#dff2ff" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6" />
          {/* 呼吸管軟管：面罩到氣瓶 */}
          <path d="M23.5,19 Q17,23 19,30" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />

          {/* 氣瓶（背在軀幹後方，畫在軀幹之前會被部分遮住，露出瓶頭與瓶身兩側） */}
          <rect x="24" y="25" width="12" height="35" rx="5" fill="currentColor" fillOpacity="0.82" />
          <rect x="27" y="21" width="6" height="6" rx="1.5" fill="currentColor" fillOpacity="0.82" />

          {/* 軀幹：肩到臀，微收腰的潛水衣輪廓 */}
          <path d="M20,26 Q30,22 40,26 L42,58 Q30,66 18,58 Z" fill="currentColor" />

          {/* 手臂：向前微彎，符合下潛的自然姿勢 */}
          <path d="M20,30 Q10,38 12,52" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M40,30 Q50,38 48,52" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />

          {/* 腿：臀到踝，膝蓋微彎的踢水姿勢 */}
          <path d="M24,58 Q20,80 22,102" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M36,58 Q40,80 38,102" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />

          {/* 蛙鞋：長葉片狀＋中線與腳跟帶，這是讓剪影一眼認出「潛水員」的關鍵細節 */}
          <path d="M22,100 Q14,104 10,116 Q9,126 16,132 Q22,128 24,116 Q25,106 22,100 Z" fill="currentColor" />
          <path d="M38,100 Q46,104 50,116 Q51,126 44,132 Q38,128 36,116 Q35,106 38,100 Z" fill="currentColor" />
          <path d="M17,109 L19,123" stroke="#0b2338" strokeWidth="1" strokeOpacity="0.35" strokeLinecap="round" />
          <path d="M43,109 L41,123" stroke="#0b2338" strokeWidth="1" strokeOpacity="0.35" strokeLinecap="round" />
        </symbol>

        {/* 魚剪影：前寬後窄的漸尖身體＋分叉尾鰭＋背鰭＋胸鰭，不是單純的橢圓＋三角形 */}
        <symbol id="fish-figure" viewBox="-2 -8 46 28">
          <path d="M30,6 L42,-6 L34,6 L42,18 Z" fill="currentColor" />
          <path d="M2,6 Q6,-3 16,-3 Q28,-3 32,6 Q28,15 16,15 Q6,15 2,6 Z" fill="currentColor" />
          <path d="M13,-3 L17,-8 L21,-3 Z" fill="currentColor" />
          <path d="M14,9 L10,15 L18,11 Z" fill="currentColor" fillOpacity="0.85" />
          <circle cx="8" cy="4" r="1.3" fill="#04121f" fillOpacity="0.45" />
        </symbol>

        {/* 衝浪者剪影：蹲姿站在板上，前腳彎曲承重、後腳輕彎，雙臂張開平衡，板子看得見翹頭與尾鰭 */}
        <symbol id="surfer-figure" viewBox="0 0 100 90">
          <path d="M6,76 Q50,66 94,74 Q88,79 50,81 Q20,81 6,76 Z" fill="currentColor" />
          <path d="M78,76 L86,84 L80,85 Z" fill="currentColor" fillOpacity="0.8" />

          <path d="M62,58 L70,73" stroke="currentColor" strokeWidth="6.5" fill="none" strokeLinecap="round" />
          <path
            d="M48,58 L38,68 L32,75"
            stroke="currentColor"
            strokeWidth="6.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path d="M52,32 Q60,44 56,58" stroke="currentColor" strokeWidth="10" fill="none" strokeLinecap="round" />
          <circle cx="49" cy="24" r="6.5" fill="currentColor" />

          <path
            d="M55,36 L40,42 L28,48"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M55,34 L68,30 L78,34"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>

        {/* 氣泡 / 懸浮微粒：同一個圓形，氣泡用描邊、marine snow 用實心 */}
        <symbol id="bubble-dot" viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </symbol>
        <symbol id="snow-dot" viewBox="0 0 6 6">
          <circle cx="3" cy="3" r="1.6" fill="currentColor" />
        </symbol>

        {/* ---------- 共用漸層 ---------- */}

        {/* 光柱本體：沿長度方向多段淡出，不是單一線性漸層——頂端最亮帶一點暖白，
            中段快速衰減，尾段幾乎透明，讓光柱讀起來像穿過水體的光而不是一塊色塊 */}
        <linearGradient id="landing-shaft-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbfeff" stopOpacity="0.9" />
          <stop offset="16%" stopColor="#eaf7ff" stopOpacity="0.6" />
          <stop offset="42%" stopColor="#d7efff" stopOpacity="0.3" />
          <stop offset="72%" stopColor="#bfe6ff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#bfe6ff" stopOpacity="0" />
        </linearGradient>

        {/* ---------- 濾鏡 ---------- */}

        {/* 顆粒質感：極低透明度雜訊，疊在整個場景上破除純向量的塑膠感。
            純靜態（不逐幀重算），效能成本只有「畫一次」。 */}
        <filter id="landing-grain" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="11"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0.05 0"
          />
        </filter>

        {/* 邊緣不規則化：位移貼圖把數學上工整的浪緣/水面線打散，不再是滑順曲線 */}
        <filter
          id="landing-edge-distort"
          x="-10%"
          y="-40%"
          width="120%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.045" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* 體積光：用雜訊當透明度遮罩「摳」出光柱本體的濃淡變化，再重度模糊，
            讓光柱看起來像懸浮微粒中的光，而不是一塊乾淨的漸層矩形。
            濾鏡參數固定，動畫只動外層 div 的 transform/opacity（見 globals.css）。 */}
        <filter
          id="landing-shaft-volumetric"
          x="-60%"
          y="-15%"
          width="220%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.09" numOctaves="2" seed="9" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0.55 0.55 0.55 0 -0.05"
            result="noiseAlpha"
          />
          <feComposite in="SourceGraphic" in2="noiseAlpha" operator="in" result="patchy" />
          <feGaussianBlur in="patchy" stdDeviation="4.5" />
        </filter>

        {/* 水中光網（caustics）：低頻雜訊推過 threshold 變成一絲絲亮紋，
            呼叫端用 CSS mix-blend-mode: screen 疊加，並用 transform 做位移/縮放動畫。 */}
        <filter id="landing-caustics" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.035" numOctaves="2" seed="21" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    1.4 1.4 1.4 0 -1.75"
            result="filaments"
          />
          <feGaussianBlur in="filaments" stdDeviation="0.5" result="soft" />
          <feComponentTransfer in="soft">
            <feFuncA type="linear" slope="1.6" intercept="0" />
          </feComponentTransfer>
        </filter>

        {/* 邊緣光：把剪影往上偏移一點、跟原本的剪影做差集，留下一道只在「上緣」
            出現的弧形，模糊、上色後疊回原圖上方——模擬光線從上方打下來的輪廓光，
            而不是四面都均勻發光的廉價外光暈。 */}
        <filter
          id="landing-rim-light"
          x="-30%"
          y="-45%"
          width="160%"
          height="190%"
          colorInterpolationFilters="sRGB"
        >
          <feOffset in="SourceAlpha" dx="0" dy="-2.4" result="shifted" />
          <feComposite in="shifted" in2="SourceAlpha" operator="out" result="rimAlpha" />
          <feGaussianBlur in="rimAlpha" stdDeviation="1" result="rimSoft" />
          <feFlood floodColor="#f0f9ff" floodOpacity="0.95" result="rimColor" />
          <feComposite in="rimColor" in2="rimSoft" operator="in" result="rim" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="rim" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
