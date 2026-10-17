// Pictures of the world from fixed places, to judge how it looks:
//   npm run build && node tools/look.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/look';
const PORT = 4100 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.addStyleTag({ content: '.screen, #corner { display: none !important }' });
const views = {
  bridge: [[180, 70, 330], [330, 40, 30]],
  under: [[250, 22, 30], [420, 25, 30]],
  city: [[120, 160, -650], [420, 40, -300]],
  coast: [[-500, 240, 500], [300, 0, -100]],
  mountains: [[400, 200, 600], [1050, 150, 0]],
  sea: [[-300, 60, -200], [-900, 0, -500]],
};
for (const [name, [from, to]] of Object.entries(views)) {
  await page.evaluate(([f, t]) => {
    const S = window.__sky;
    S.mode = 'look';
    for (const p of S.preview || []) p.mesh.visible = false;
    S.camera.position.set(...f);
    S.camera.up.set(0, 1, 0);
    S.camera.lookAt(...t);
  }, [from, to]);
  await wait(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${OUT}/${name}.png`);
}
console.log('errors:', errors);
await browser.close();
srv.kill();
