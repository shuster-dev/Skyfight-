// A gift code in the hangar (ALFASI, or CODES=SHUSTER,NEON), the helicopter on the table, and the
// banner the whole sky sees when it takes off. On a phone, upright.
//   npm run build && node tools/gift-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/gift';
const PORT = 4700 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(2500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.fill('#in-name', 'מאיר');
await page.click('#btn-go');
await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
await wait(1500);
// CODES=SHUSTER,NEON for others; the first is typed on camera
const codes = (process.env.CODES || 'alfasi').split(',');
// the gift code is in the settings
await page.click('#btn-settings2');
await page.fill('#gift-code', codes[0]);
await page.screenshot({ path: `${OUT}/1-code.png` });
for (const code of codes) {
  await page.fill('#gift-code', code);
  await page.click('#gift-form button');
  await wait(2500);
}
await page.click('#btn-settings-close');
await page.screenshot({ path: `${OUT}/2-heli.png` });
// (software rendering is slow: hold the banner still so the picture catches it)
await page.addStyleTag({ content: '#royal { animation: none !important; }' });
await page.evaluate(() => new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
  // keep the banner up for the picture: a copy that stays
  if (n.id === 'royal' && !window.__royal) { window.__royal = n.textContent; const c = n.cloneNode(true); c.id = 'royal-copy'; c.style.cssText = getComputedStyle(n).cssText; document.body.appendChild(c); }
}))).observe(document.body, { childList: true }));
await page.click('#btn-launch');
await page.waitForFunction(() => window.__royal, null, { timeout: 60000 }).catch(() => {});
console.log('banner:', await page.evaluate(() => window.__royal));
await page.screenshot({ path: `${OUT}/3-royal.png` });
console.log('errors:', errors);
await browser.close();
srv.kill();
