// 首頁的章節定義：整個首頁就是這五章，捲動等於在章節之間過帶。
// 章節是資料不是版面——ChapterMedia／ChapterRail／ChapterScrubber 三個元件
// 都從這份陣列長出來，要增刪一章只改這裡，三個地方會自己對齊。

export type Chapter = {
  /** 章節索引，同時是 CSS 算 --pos 用的 --at */
  at: number;
  /** 顯示在標題上方的兩位數編號 */
  num: string;
  /** 章節英文代號，排在編號後面 */
  en: string;
  /** public/landing/ 底下的圖檔基底名 */
  img: string;
  /** 這張照片在畫面上的對焦位置（object-position） */
  focus: string;
};

export const CHAPTERS: Chapter[] = [
  {
    at: 0,
    num: "00",
    en: "THE SURFACE",
    img: "surf-barrel",
    focus: "50% 45%",
  },
  {
    at: 1,
    num: "01",
    en: "THE SWELL",
    img: "surf-lineup",
    focus: "50% 50%",
  },
  {
    at: 2,
    num: "02",
    en: "THE WATERLINE",
    img: "waterline",
    focus: "50% 40%",
  },
  {
    at: 3,
    num: "03",
    en: "THE DIVE",
    img: "dive-reef",
    focus: "50% 50%",
  },
  {
    at: 4,
    num: "04",
    en: "THE DEEP",
    img: "deep-blue",
    focus: "50% 50%",
  },
];

/** 捲動進度 0→1 要跨過的章節間距數，比章節數少一（第一章在 0、最後一章在 1）。 */
export const CHAPTER_SPAN = CHAPTERS.length - 1;
