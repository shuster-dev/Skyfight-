// A phone in the hand, upright and then on its side: the picture must fit
// both without stretching, and the radar and the board must stay out of the way.
//   npm run build && node tools/phone-shot.mjs [outDir]
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/phone';
const PORT = 4200 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.fill('#in-name', 'Phone');
await page.click('#btn-go');
await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 30000 });
await page.click('#btn-launch');
await page.waitForFunction(() => window.__sky?.me?.alive === true, null, { timeout: 30000 });
await page.waitForFunction(() => window.__sky.others.size >= 3, null, { timeout: 20000 }).catch(() => {});
const fit = () => page.evaluate(() => {
  const c = document.querySelector('canvas'), S = window.__sky;
  return { win: [innerWidth, innerHeight], css: [c.clientWidth, c.clientHeight], buf: [c.width, c.height], aspect: +S.camera.aspect.toFixed(3) };
});
let bad = 0;
for (const [name, w, h] of [['portrait', 390, 664], ['landscape', 844, 340], ['portrait-again', 390, 664]]) {
  await page.setViewportSize({ width: w, height: h });
  await wait(2500);
  const f = await fit();
  const ok = Math.abs(f.aspect - f.css[0] / f.css[1]) < 0.02 && f.css[0] === w && Math.abs(f.buf[0] / f.buf[1] - w / h) < 0.02;
  if (!ok) bad++;
  console.log(ok ? '  ok  ' : '  FAIL', name, JSON.stringify(f));
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log('errors:', errors);
await browser.close();
srv.kill();
process.exit(bad || errors.length ? 1 : 0);
