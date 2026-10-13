// 捲動狀態的共享儲存格：ScrollScene 每幀寫，DiveCanvas 的三.js 渲染迴圈每幀讀。
//
// 故意不用 React state 或 context——這兩個值每一幀都在變，用 state 等於每次
// 捲動都讓整棵樹 re-render，而三.js 的渲染迴圈本身就是獨立的 rAF，只需要在
// 畫下一幀之前讀到最新數值，不需要「被通知」。ScrollScene 已經有一個 rAF
// 在算這兩個值（供 CSS 變數使用），這裡只是把同一份數字也寫一份給三.js 讀，
// 不新增第二個 scroll listener。
export const diveState = {
  /** 0→1，捲動進度＝這次下潛的深度比例。 */
  progress: 0,
  /** 0→1，捲動快慢，停手後由 ScrollScene 自行衰減回 0。 */
  velocity: 0,
  /** 1＝往下捲（下潛），-1＝往上捲（上浮）。帶滯後（見 ScrollScene 的
      DIRECTION_FLIP_THRESHOLD_PX），不會因為滑鼠微小回彈就一直翻轉；
      三.js 那邊拿到這個值後還會自己再做一次時間平滑，兩邊平滑各司其職，
      不要互相取代。 */
  direction: 1,
};
