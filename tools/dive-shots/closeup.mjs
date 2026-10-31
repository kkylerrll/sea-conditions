// ?diveDebug=<kind> 的中央特寫，N 張、間隔 gap ms
import { chromium } from "playwright-core";
const [base, outdir, kind, n = "4", gap = "130"] = process.argv.slice(2);
import fs from "node:fs"; fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal","--enable-gpu","--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(`${base}/?diveDebug=${kind}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);
const dist = Number(process.env.DIST || 0.7);
await page.evaluate((dist) => {
  const e = window.__diveEngine; const orig = e.updateDebugScene.bind(e);
  e.updateDebugScene = (dt) => { orig(dt); const c = e.creatures[0]; const p = c.root.position; e.camera.position.set(p.x, p.y, p.z + dist); e.camera.lookAt(p.x, p.y, p.z); };
}, dist);
await page.waitForTimeout(500);
for (let i = 0; i < Number(n); i++) {
  await page.screenshot({ path: `${outdir}/${kind}-${i}.png`, clip: { x: 300, y: 200, width: 600, height: 400 } });
  await page.waitForTimeout(Number(gap));
}
await browser.close();
