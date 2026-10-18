// The living city, close up: a street, a corner, from above.
//   npm run build && node tools/city-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const PORT = 4400 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || 'shots/city';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.addStyleTag({ content: '.screen, #corner { display: none !important }' });
const views = [['street', [190, 6, -560], [186, 2, -470]], ['corner', [214, 26, -420], [184, 0, -460]], ['above', [120, 120, -760], [276, 0, -560]]];
for (const [name, p, t] of views) {
  await page.evaluate(([p, t]) => { const S = window.__sky; S.mode = 'look'; S.camera.position.set(...p); S.camera.up.set(0,1,0); S.camera.lookAt(...t); }, [p, t]);
  await wait(2500);
  await page.screenshot({ path: `${OUT}/city-${name}.png` });
}
console.log('errors', errors);
await browser.close(); srv.kill();
