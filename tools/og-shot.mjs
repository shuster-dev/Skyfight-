// The link's picture (og:image): the title over three planes in formation,
// 1200x630, written to src/client/og.jpg. `npm run build && node tools/og-shot.mjs`
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 3900 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])');
await page.addStyleTag({ content: '#title-form, #corner { display: none !important } .screen.shade { background: radial-gradient(ellipse at center, rgba(8,16,30,0), rgba(8,16,30,.45)) } .logo { width: 520px } .tag { font-size: 24px } #screen-title { justify-content: flex-start; padding-top: 34px }' });
// a set piece: three generations in formation, the bridge and downtown behind
await page.evaluate(() => {
  const S = window.__sky;
  S.mode = 'look';
  for (const p of S.preview || []) p.mesh.visible = false;
  const put = (id, x, y, z, yaw, roll) => { const m = S.buildPlane(id); m.position.set(x, y, z); m.rotation.set(0.04, yaw, roll, 'YXZ'); S.scene.add(m); };
  // close in front of the camera, crossing from left to right, banking
  const cam = [60, 98, 190], d = [0.79, -0.05, -0.61], r = [0.61, 0, 0.79];
  const at = (k, side, up) => [cam[0] + d[0] * k + r[0] * side, cam[1] + d[1] * k + up, cam[2] + d[2] * k + r[2] * side];
  put('phantom', ...at(30, 6, -6), -2.25, -0.35);
  put('viper', ...at(40, -6, -2), -2.25, -0.3);
  put('sparrow', ...at(48, -16, -7), -2.25, -0.3);
  S.camera.position.set(60, 98, 190);
  S.camera.up.set(0, 1, 0);
  S.camera.lookAt(330, 70, -20);
});
await wait(Number(process.env.AT || 5000));
await page.screenshot({ path: 'src/client/og.jpg', type: 'jpeg', quality: 86 });
await browser.close();
srv.kill();
console.log('src/client/og.jpg');
