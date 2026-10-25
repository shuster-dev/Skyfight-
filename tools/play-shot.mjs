// Active play, as a player sees it: a phone on its side and a desktop, a few
// moments into a fight, with the renderer's counts for each view.
//   npm run build && node tools/play-shot.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots/play';
const PORT = 4600 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(2000);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const VPS = { phone: [{ width: 844, height: 390 }, true], desktop: [{ width: 1280, height: 720 }, false] };
for (const name of (process.env.VPS || 'phone,desktop').split(',')) {
  const [vp, touch] = VPS[name];
  const page = await browser.newPage({ viewport: vp, hasTouch: touch, isMobile: touch });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.fill('#in-name', 'Ace');
  await page.$eval('#btn-go', (el) => el.click());
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  await page.$eval('#btn-launch', (el) => el.click());
  await page.waitForFunction(() => window.__sky.mode === 'air' && window.__sky.me?.alive, null, { timeout: 90000 });
  // no tutorial in the way; the renderer's counts sampled through the fight
  await page.evaluate(() => {
    document.querySelector('#tut')?.classList.add('hidden');
    const r = window.__sky.renderer, S = (window.__samples = []);
    let last = performance.now();
    const tick = () => { const now = performance.now(); S.push({ calls: r.info.render.calls, tris: r.info.render.triangles, ms: now - last }); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  for (const [i, ms] of [[1, 4000], [2, 6000], [3, 6000]]) {
    // turn toward the nearest foe, so the fight is in the picture
    await page.evaluate(() => {
      const S = window.__sky; const me = S.me; if (!me) return;
      let best = null, bd = 1e9;
      for (const [k, o] of S.others || []) { if (!o.mesh) continue; const d = o.mesh.position.distanceTo(me.mesh?.position || o.mesh.position); if (d < bd) bd = d, best = o; }
      S._aim = best ? best.mesh.position.clone() : null;
    }).catch(() => {});
    await wait(ms);
    await page.screenshot({ path: `${OUT}/${name}-${i}.png` });
  }
  const info = await page.evaluate(() => {
    const r = window.__sky.renderer, I = r.info, S = window.__samples.slice(10);
    const avg = (k) => Math.round(S.reduce((a, s) => a + s[k], 0) / S.length), max = (k) => Math.max(...S.map((s) => s[k]));
    return { frames: S.length, callsAvg: avg('calls'), callsMax: max('calls'), trisAvg: avg('tris'), trisMax: max('tris'), geometries: I.memory.geometries, textures: I.memory.textures, programs: I.programs?.length, dpr: r.getPixelRatio() };
  });
  console.log(name, JSON.stringify(info), 'errors', errors.length);
  await page.close();
}
await browser.close(); srv.kill();
