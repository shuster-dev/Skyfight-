// שוסטר standing in the air (the hover switch on), on a phone both ways:
// where the switch sits among the buttons, and the jets of light down.
//   npm run build && node tools/hover-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/hover';
const PORT = 4870 + Math.floor(Math.random() * 40);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(2500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [name, vp] of [['landscape', { width: 844, height: 390 }], ['portrait', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('sky.coached', '9'));
  await page.fill('#in-name', 'שוסטר');
  await page.evaluate(() => { const u = document.querySelector('#in-newuser'); if (u) u.value = 'p' + Math.random().toString(36).slice(2, 10); const p = document.querySelector('#in-newpass'); if (p) p.value = 'pass1234'; });
  await page.click('#btn-go');
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  await page.fill('#gift-code', 'SHUSTER');
  await page.click('#gift-form button');
  await wait(2500);
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__sky.mode === 'air' && window.__sky.me?.alive, null, { timeout: 90000 });
  await page.waitForSelector('#btn-hover:not(.hidden)', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#btn-hover').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
  await wait(4000);
  const st = await page.evaluate(() => ({ speed: Math.round(window.__sky.me.body.speed), on: document.querySelector('#btn-hover').classList.contains('on') }));
  console.log(name, st);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
}
await browser.close();
srv.kill();
