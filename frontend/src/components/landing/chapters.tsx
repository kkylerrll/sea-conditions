// 首頁的章節定義：整個首頁就是這五章，捲動等於在章節之間過帶。
// 章節是資料不是版面——ChapterChrome／ChapterScrubber 都從這份陣列長出來，
// 要增刪一章只改這裡就會對齊。
//
// 這一版拿掉了 img/focus：章節底下不再是各自一張照片，而是連續的三.js 場景
// （見 DiveCanvas），文字換章只是同一片水域裡的敘事推進，不是換頁。

export type Chapter = {
  /** 章節索引，同時是 CSS 算 --pos 用的 --at */
  at: number;
  /** 顯示在標題上方的兩位數編號 */
  num: string;
  /** 章節英文代號，排在編號後面——這一版改成呼應深度／生物的敘事，不再是海況主題 */
  en: string;
};

export const CHAPTERS: Chapter[] = [
  { at: 0, num: "00", en: "THE SURFACE" },
  { at: 1, num: "01", en: "THE REEF" },
  { at: 2, num: "02", en: "THE SCHOOL" },
  { at: 3, num: "03", en: "THE DROP" },
  { at: 4, num: "04", en: "THE ABYSS" },
];

/** 捲動進度 0→1 要跨過的章節間距數，比章節數少一（第一章在 0、最後一章在 1）。 */
export const CHAPTER_SPAN = CHAPTERS.length - 1;
