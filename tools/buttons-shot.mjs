// The touch buttons on a phone, on its side and upright, on a first flight
// (with the legend of what each is for) and after.
//   npm run build && node tools/buttons-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/buttons';
const PORT = 4900 + Math.floor(Math.random() * 50);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(2500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [name, vp] of [['landscape', { width: 844, height: 390 }], ['portrait', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.fill('#in-name', 'טייס');
  await page.click('#btn-go');
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__sky.mode === 'air' && window.__sky.me?.alive, null, { timeout: 90000 });
  await page.waitForSelector('#coach:not(.hidden)', { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}-first.png` });
  await page.evaluate(() => document.querySelector('#coach').classList.add('hidden'));
  await wait(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
}
await browser.close();
srv.kill();
