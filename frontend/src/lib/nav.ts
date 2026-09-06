// 導航深連結：桌機開 Google 地圖網頁版，手機會自動喚起原生地圖 App
// （iOS 未裝 Google Maps 就開網頁）。每個潛點都有 lat/lon，直接組標準
// Maps URL，不引入任何地圖函式庫。

/** 在地圖上標出這個座標（檢視用）。 */
export function mapPinUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

/** 從使用者目前位置導航到這個座標。 */
export function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}
