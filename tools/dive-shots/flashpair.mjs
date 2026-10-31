// usage: node flashpair.mjs <url> <outdir> <depth> <kind>
// 同一個 session：先把光移開截一張，再用 __diveProbe 找到 <kind> 的螢幕位置，把光對準牠再截一張。
import { chromium } from "playwright-core";
import fs from "node:fs";
const [url, outdir, depthArg, kind] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);
const target = Number(depthArg);
const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
let lo = 0, hi = maxScroll;
for (let i = 0; i < 14; i++) {
  const mid = (lo + hi) / 2;
  await page.evaluate((y) => window.scrollTo(0, y), mid);
  await page.waitForTimeout(220);
  const d = await page.$eval("[data-depth-readout]", (e) => parseFloat(e.textContent || "0"));
  if (d < target) lo = mid; else hi = mid;
}
await page.mouse.move(200, 120, { steps: 5 });
await page.waitForTimeout(2500);
let pick = null;
for (let tries = 0; tries < 20 && !pick; tries++) {
  const list = await page.evaluate(() => window.__diveProbe ? window.__diveProbe() : []);
  pick = list.find((p) => p.kind === kind && p.x > 700 && p.x < 1380 && p.y > 120 && p.y < 800 && Math.hypot(p.x - 1040, p.y - 620) > 260) || null;
  if (!pick) await page.waitForTimeout(700);
}
if (!pick) { console.log("no", kind, "in view"); await browser.close(); process.exit(1); }
await page.screenshot({ path: `${outdir}/off.png` });
const again = await page.evaluate(() => window.__diveProbe());
const cur = again.find((p) => p.kind === kind && Math.hypot(p.x - pick.x, p.y - pick.y) < 120) || pick;
await page.mouse.move(cur.x, cur.y, { steps: 6 });
await page.waitForTimeout(900);
const now = (await page.evaluate(() => window.__diveProbe())).find((p) => p.kind === kind && Math.hypot(p.x - cur.x, p.y - cur.y) < 120) || cur;
await page.mouse.move(now.x, now.y, { steps: 2 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${outdir}/on.png` });
console.log(`${kind} at ${Math.round(now.x)},${Math.round(now.y)} → ${outdir}/off.png, on.png`);
await browser.close();
