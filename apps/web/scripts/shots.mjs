// Visual check: scrolls the home page with the mouse wheel at 375, 768 and 1440 px, takes a
// viewport screenshot every 85% of a screen, records console errors and horizontal overflow,
// and tiles each width into one contact sheet. Needs the app running on BASE_URL.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3910";
const out = process.env.SHOTS_DIR ?? "test-results/shots";
const sizes = [[375, 812], [768, 1024], [1440, 900]];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const report = [];
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/`);
  await page.waitForTimeout(3800); // the hero plays its story once
  const files = [];
  for (let i = 0; i < 60; i++) {
    const file = `${out}/w${w}-${String(i).padStart(2, "0")}.png`;
    await page.screenshot({ path: file });
    files.push(file);
    const done = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
    if (done) break;
    await page.mouse.move(w / 2, h / 2);
    await page.mouse.wheel(0, Math.round(h * 0.85));
    await page.waitForTimeout(900);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.push({ width: w, shots: files.length, overflow, errors });
  await page.close();

  const cols = w < 1000 ? 6 : 4;
  const tiles = files.map((f) => `<img src="data:image/png;base64,${readFileSync(f).toString("base64")}">`).join("");
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  await sheet.setContent(
    `<style>body{margin:0;background:#333;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}img{width:100%;display:block}</style>${tiles}`,
  );
  await sheet.waitForTimeout(300);
  await sheet.screenshot({ path: `${out}/sheet-${w}.png`, fullPage: true });
  await sheet.close();
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
