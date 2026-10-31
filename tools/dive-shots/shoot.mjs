// usage: node shoot.mjs <url> <outdir> <depth1,depth2,...>
import { chromium } from "playwright-core";
import fs from "node:fs";

const [url, outdir, depthsArg] = process.argv.slice(2);
const depths = depthsArg.split(",").map(Number);
fs.mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text().slice(0, 200)); });
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);

const readDepth = () => page.$eval("[data-depth-readout]", (e) => parseFloat(e.textContent || "0")).catch(() => NaN);
const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

for (const target of depths) {
  // 二分找捲動位置（深度對捲動單調遞增）
  let lo = 0, hi = maxScroll, d = NaN;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    await page.evaluate((y) => window.scrollTo(0, y), mid);
    await page.waitForTimeout(250);
    d = await readDepth();
    if (d < target) lo = mid; else hi = mid;
  }
  await page.waitForTimeout(2500); // 讓生物游進畫面、動畫跑一下
  d = await readDepth();
  const f = `${outdir}/d${String(target).padStart(4, "0")}.png`;
  await page.screenshot({ path: f });
  console.log(`target ${target}m → readout ${d}m → ${f}`);
  if (process.env.FRAMES) {
    for (let k = 1; k < Number(process.env.FRAMES); k++) {
      await page.waitForTimeout(Number(process.env.GAP || 600));
      const g = f.replace(".png", `-${k}.png`);
      await page.screenshot({ path: g, clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : undefined });
      console.log("  +", g);
    }
  }
}
await browser.close();
