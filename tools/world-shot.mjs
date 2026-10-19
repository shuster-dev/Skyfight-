// The map's landmarks: the airfield, the port, downtown, the whole coast.
//   npm run build && node tools/world-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const PORT = 4400 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] || 'shots/world';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.addStyleTag({ content: '.screen, #corner { display: none !important }' });
// VIEWS=a,b picks some; SKY=sunset shows the evening
const ALL = {
  airfield: [[180, 70, 640], [420, 0, 880]],
  apron: [[330, 22, 820], [420, 4, 900]],
  port: [[-120, 60, -620], [120, 10, -800]],
  quay: [[30, 18, -650], [70, 20, -760]],
  downtown: [[-80, 160, -40], [380, 60, -380]],
  coast: [[-700, 260, 200], [300, 0, -200]],
};
const pick = (process.env.VIEWS || Object.keys(ALL).join()).split(',');
const views = pick.map((k) => [k, ...ALL[k]]);
if (process.env.SKY) await page.evaluate((s) => window.__sky.world.setSky?.(s), process.env.SKY);
for (const [name, p, t] of views) {
  await page.evaluate(([p, t]) => { const S = window.__sky; S.mode = 'look'; S.camera.position.set(...p); S.camera.up.set(0,1,0); S.camera.lookAt(...t); }, [p, t]);
  await wait(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log('errors', errors);
await browser.close(); srv.kill();
