// The ten planes, one by one over the sea, from the front quarter and from above.
//   npm run build && node tools/planes-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/planes';
const PORT = 4300 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
await page.addStyleTag({ content: '.screen, #corner { display: none !important }' });
for (const id of (process.env.ONLY || 'sparrow,gull,hornet,shahak,skyhawk,viper,bulldog,sufa,lavi,phantom').split(',')) {
  for (const [view, cam] of [['front', [-7, 2.5, -9]], ['side', [11, 1.5, 1.5]], ['top', [2, 13, 3]]]) {
    await page.evaluate(([id, cam, paint]) => {
      const S = window.__sky;
      S.mode = 'look';
      for (const p of S.preview || []) p.mesh.visible = false;
      S.shotPlane && S.scene.remove(S.shotPlane);
      const m = id === 'bomber' ? S.buildBomber() : S.buildPlane(id, paint);
      if (id === 'bomber') m.scale.setScalar(0.45);
      m.position.set(-300, 140, -200);
      m.rotation.set(0.05, 0.6, -0.12, 'YXZ');
      S.scene.add(m);
      S.shotPlane = m;
      S.camera.position.set(-300 + cam[0], 140 + cam[1], -200 + cam[2]);
      S.camera.up.set(0, 1, 0);
      S.camera.lookAt(-300, 140, -200);
    }, [id, cam, process.env.PAINT || 'stock']);
    await wait(1200);
    await page.screenshot({ path: `${OUT}/${id}-${view}.png` });
  }
  console.log(' ', id);
}
console.log('errors:', errors);
await browser.close();
srv.kill();
