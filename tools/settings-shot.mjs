// The settings sheet on a phone, upright and on its side: it fits or scrolls
// inside itself, its ✕ is always there, and a tap outside closes it.
//   npm run build && node tools/settings-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/settings';
const PORT = 4100 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let bad = 0;
const ok = (name, cond, extra) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`, cond ? '' : JSON.stringify(extra ?? '')); if (!cond) bad++; };
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.fill('#in-name', 'Ace');
  await page.$eval('#btn-go', (el) => el.click());
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  await page.$eval('#btn-settings', (el) => el.click());
  await wait(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const box = await page.$eval('#sheet-settings .card', (c) => { const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, scroll: c.scrollHeight > c.clientHeight }; });
  ok(`${name}: the card fits on the screen`, box.top >= 0 && box.bottom <= vp.height + 0.5, box);
  // scrolled to the bottom, the last button is there and the ✕ still on top
  await page.$eval('#sheet-settings .card', (c) => (c.scrollTop = c.scrollHeight));
  await wait(300);
  await page.screenshot({ path: `${OUT}/${name}-bottom.png` });
  const vis = await page.evaluate(() => {
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 0; };
    return { close: inView(document.querySelector('#btn-settings-close')), x: inView(document.querySelector('#btn-settings-x')) };
  });
  ok(`${name}: scrolled down, "סגור" and the ✕ are both in view`, vis.close && vis.x, vis);
  await page.tap('#btn-settings-x');
  await wait(300);
  ok(`${name}: the ✕ closes it`, await page.$eval('#sheet-settings', (s) => s.classList.contains('hidden')));
  await page.$eval('#btn-settings', (el) => el.click());
  await wait(300);
  await page.mouse.click(4, vp.height / 2);
  await wait(300);
  ok(`${name}: a tap outside closes it`, await page.$eval('#sheet-settings', (s) => s.classList.contains('hidden')));
  await page.close();
}
await browser.close(); srv.kill();
console.log(bad ? `${bad} failed` : 'all ok');
process.exit(bad ? 1 : 0);
