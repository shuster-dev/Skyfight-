// The HUD under pressure, on a phone both ways: a missile locked on, an enemy
// on the tail, three notes and a busy kill feed at once — nothing may overlap.
//   npm run build && node tools/hud-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/hud';
const PORT = 4800 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(2500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [name, vp] of [['landscape', { width: 844, height: 390 }], ['portrait', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.fill('#in-name', 'מאיר');
  await page.click('#btn-go');
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__sky.mode === 'air' && window.__sky.me?.alive, null, { timeout: 90000 });
  await wait(1500);
  await page.addStyleTag({ content: '#tail { display: flex !important; } .note-x, #feed div { animation: none !important; }' });
  await page.evaluate(() => {
    const S = window.__sky;
    S.warnUntil = performance.now() + 120000;
    document.querySelector('#tail-d').textContent = '180m';
    document.querySelector('#tail').dataset.side = 'l';
    const f = document.querySelector('#feed');
    for (const t of ['מאיר#1 <span class="w">טיל</span> Ghost', 'סערה <span class="w">התנגשות</span> Raven', 'Nomad <span class="w">מקלע</span> רעם']) { const d = document.createElement('div'); d.innerHTML = t; f.append(d); }
  });
  await wait(1500);
  // the notes last a few seconds: in just before the picture
  await page.evaluate(() => { const S = window.__sky; S.note('הטיל שלך הוטעה בתמרון'); S.note('הפלה +222 זהב +180 XP', 'lvl'); S.note('רצף של 3'); });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // the boxes, to check by number that none sits on another
  const boxes = await page.evaluate(() => Object.fromEntries(['#compass-box', '#alerts', '#notes', '#feed', '#score', '#menu-btn'].map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return [s, r && [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]]; })));
  console.log(name, JSON.stringify(boxes));
  await page.close();
}
await browser.close();
srv.kill();
