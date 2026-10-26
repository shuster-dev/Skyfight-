// The app's icon: a fighter on the apron at dusk, the arched hangar behind,
// framed close and low. Writes src/client/icon.png (512) and
// apple-touch-icon.png (180) — the picture a phone shows on its home screen.
//   npm run build && node tools/icon-shot.mjs [plane]
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';

const KIND = process.argv[2] || 'phantom';
const PORT = 4000 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.fill('#in-name', 'Icon');
await page.$eval('#btn-go', (el) => el.click());
await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
await page.evaluate((kind) => {
  const S = window.__sky, H = S.hangar;
  if (!S.pilot.planes.includes(kind)) S.pilot.planes.push(kind);
  S.renderHangar();
  document.querySelector(`#hp-strip [data-plane="${kind}"]`)?.click();
  // the camera ours: low off the nose, the plane filling the square
  const tick = H.tick.bind(H);
  H.tick = (...a) => {
    tick(...a);
    if (H.plane) H.plane.rotation.y = Math.PI + 0.7;
    H.camera.fov = 27; H.camera.aspect = 1; H.camera.updateProjectionMatrix();
    H.camera.position.set(8.5, 2.2, 18.5);
    H.camera.lookAt(1.3, 2.4, 0);
  };
}, KIND);
await page.addStyleTag({ content: 'body > *:not(canvas):not(#game) { visibility: hidden !important } #screen-hangar, #screen-hangar * { visibility: hidden !important }' });
await wait(4000);
await page.screenshot({ path: 'src/client/icon.png' });
await browser.close(); srv.kill();
execFileSync('python3', ['-c', "from PIL import Image; Image.open('src/client/icon.png').convert('RGB').resize((180,180), Image.LANCZOS).save('src/client/apple-touch-icon.png')"]);
console.log('icon.png, apple-touch-icon.png');
