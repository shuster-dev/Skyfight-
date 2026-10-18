// The hangar's tabs and upgrades on a phone, upright and on its side.
//   npm run build && node tools/hangar-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/hangar';
const PORT = 4500 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.fill('#in-name', 'Ace');
  await page.click('#btn-go');
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  // a pilot well on: every plane, some gold, a few tiers in (the page only: nothing is saved)
  if (process.env.RICH) await page.evaluate(() => {
    const S = window.__sky, P = S.pilot;
    P.level = 30; P.gold = 7820; P.planes = ['sparrow', 'gull', 'hornet', 'shahak', 'phantom']; P.plane = 'phantom';
    P.upgrades.phantom = { engine: 0, weapons: 3, armor: 1 };
    S.renderHangar();
  });
  await wait(2500);
  await page.screenshot({ path: `${OUT}/${name}-planes.png` });
  await page.click('.h-tabs [data-tab="ups"]');
  await wait(2000);
  await page.screenshot({ path: `${OUT}/${name}-ups.png` });
  await page.close();
}
await browser.close();
srv.kill();
