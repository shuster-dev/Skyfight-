// The game in a real browser, the way a player meets it: the front door, a
// name, the hangar, the launch, a few seconds of flying and shooting — on a
// phone held upright and on a computer. Screenshots in shots/, and no console
// errors allowed. `npm run test:browser`
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 3100 + Math.floor(Math.random() * 300);
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = process.env.SHOTS || 'shots';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 300)); }
};

const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 100 && !log.includes('listening'); i++) await wait(100);

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function run(label, viewport, mobile) {
  console.log(`\n${label}`);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  const snap = (n) => page.screenshot({ path: `${OUT}/${label}-${n}.png` });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#btn-go:not([disabled])');
  await wait(1500);
  await snap('1-title');
  ok('the front door asks for a name', await page.isVisible('#in-name'));
  await page.fill('#in-name', 'x');
  await page.click('#btn-go');
  ok('a one-letter name is refused', (await page.textContent('#title-err')).length > 0);
  await page.fill('#in-name', label === 'phone' ? 'טייס' : 'Ace');
  await page.click('#btn-go');
  await page.waitForSelector('#screen-hangar:not(.hidden)');
  await wait(1200);
  await snap('2-hangar');
  ok('the hangar shows five planes', (await page.$$('.pcard')).length === 5);
  ok('the first is chosen, the rest locked', await page.evaluate(() => document.querySelector('.pcard.sel h3')?.textContent.includes('סער') && document.querySelectorAll('.pcard.locked').length === 4));
  await page.click('[data-tab="ups"]');
  await wait(400);
  await snap('3-upgrades');
  ok('four upgrades', (await page.$$('.up')).length === 4);
  await page.click('[data-tab="planes"]');
  ok('a guest is offered to save', await page.isVisible('#btn-save'));
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__sky?.me?.alive === true, null, { timeout: 20000 });
  ok('in the air', true);
  ok('bots fill the sky', await page.waitForFunction(() => window.__sky.others.size >= 5, null, { timeout: 10000 }).then(() => true, () => false));
  await wait(1500);
  await snap('4-air');
  // the bots may shoot us down mid-test: wait to be flying, then measure
  await page.waitForFunction(() => window.__sky.me?.alive, null, { timeout: 8000 }).catch(() => {});
  const y0 = await page.evaluate(() => window.__sky.me.body.y);
  if (mobile) {
    // the stick, dragged up: climb
    const pad = await page.$('#touch-pad');
    const bx = await pad.boundingBox();
    const sx = bx.x + bx.width / 2, sy = bx.y + bx.height / 2;
    await page.touchscreen.tap(sx, sy).catch(() => {});
    await page.evaluate(([x, y]) => {
      const el = document.querySelector('#touch-pad');
      const ev = (t, X, Y) => el.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: X, clientY: Y, bubbles: true, pointerType: 'touch' }));
      ev('pointerdown', x, y); ev('pointermove', x, y - 50);
    }, [sx, sy]);
    await page.evaluate(() => document.querySelector('#btn-fire').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, bubbles: true, pointerType: 'touch' })));
  } else {
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');
  }
  await wait(1200);
  await snap('5-firing');
  const st = await page.evaluate(() => ({ y: window.__sky.me.body.y, pitch: window.__sky.me.body.pitch, alive: window.__sky.me.alive }));
  // the nose up (or, if a bot got us in that second, at least we were up when it did)
  ok('the stick climbs', st.alive ? st.y > y0 + 5 && st.pitch > 0.3 : true, { y0, ...st });
  if (!mobile) { await page.keyboard.up('ArrowUp'); await page.keyboard.up('Space'); }
  ok('the HUD is up', await page.isVisible('#hud') && await page.isVisible('#score'));
  if (mobile) {
    // the right thumb drags the camera round; let go and it comes back
    const lp = await (await page.$('#look-pad')).boundingBox();
    const lx = lp.x + lp.width * 0.3, ly = lp.y + 40;
    await page.evaluate(([x, y]) => {
      const el = document.querySelector('#look-pad');
      const ev = (t, X, Y) => el.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: X, clientY: Y, bubbles: true, pointerType: 'touch' }));
      ev('pointerdown', x, y); ev('pointermove', x - 160, y + 30);
    }, [lx, ly]);
    await wait(700);
    const turned = await page.evaluate(() => window.__sky.look.yaw);
    await snap('5b-look');
    ok('dragging on the right turns the camera', Math.abs(turned) > 0.5, turned);
    await page.evaluate(() => document.querySelector('#look-pad').dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true, pointerType: 'touch' })));
    // (slowly here: software rendering draws a few frames a second)
    ok('let go, and it settles back behind', await page.waitForFunction(() => window.__sky.look.yaw === 0, null, { timeout: 15000 }).then(() => true, () => false), await page.evaluate(() => window.__sky.look));
  }
  if (!mobile) {
    // nose down into the sea: the death screen, then back in the air
    await page.keyboard.down('ArrowDown');
    const died = await page.waitForSelector('#death:not(.hidden)', { timeout: 25000 }).then(() => true, () => false);
    await page.keyboard.up('ArrowDown');
    ok('diving into the sea brings the death screen', died);
    await wait(600);
    await snap('6-down');
    ok('it says you crashed', /התרסקת|הופלת/.test(await page.textContent('#death-title')));
    ok('and you are flying again after the countdown', await page.waitForFunction(() => window.__sky.me?.alive && document.querySelector('#death').classList.contains('hidden'), null, { timeout: 8000 }).then(() => true, () => false));
  }
  ok('the scoreboard lists the pilots', (await page.$$('#score .r')).length >= 5);
  // back to the hangar
  await page.click('#menu-btn');
  await page.waitForSelector('#screen-hangar:not(.hidden)');
  ok('back in the hangar', true);
  ok('no console errors', errors.length === 0, errors);
  await ctx.close();
}

try {
  await run('phone', { width: 400, height: 860 }, true);
  await run('desktop', { width: 1280, height: 720 }, false);
} catch (e) {
  fail++;
  console.log('  FAIL (threw)', e.message);
} finally {
  await browser.close();
  srv.kill('SIGTERM');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
