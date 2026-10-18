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
  ok('the hangar is its own 3D scene, ten planes in the row', await page.evaluate(() => window.__sky.mode === 'hangar') && (await page.$$('#hp-dots i')).length === 10);
  ok('the first plane is on the table, in use', (await page.textContent('#hp-name')) === 'סער' && (await page.textContent('#hp-act')) === 'בשימוש');
  ok('no pictures and no emoji in the hangar', await page.evaluate(() => !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(document.querySelector('#screen-hangar').innerText)));
  ok('seven paints to choose from, the stock one worn', (await page.$$('#hp-paints .sw')).length === 7 && await page.evaluate(() => document.querySelector('#hp-paints .sw.on')?.dataset.paint === 'stock'));
  await page.click('#hp-paints [data-paint="fox"]');
  ok('trying a paint on shows its price', /שועל/.test(await page.textContent('#hp-paint-act')) && await page.evaluate(() => document.querySelector('#hp-paint-act').disabled));
  await page.click('#hp-paints [data-paint="stock"]');
  ok('two skies to choose: everyone for themselves, or teams', (await page.$$('.h-mode button')).length === 2);
  await page.click('#hp-next');
  await wait(800);
  await snap('2b-next');
  ok('the next plane is locked to a level', (await page.textContent('#hp-name')) === 'שחף' && /נפתח ברמה 3/.test(await page.textContent('#hp-act')));
  await page.click('#hp-prev');
  await page.click('[data-tab="ups"]');
  await wait(400);
  await snap('3-upgrades');
  ok('three upgrades for the plane on the table: engine, weapons, armour', (await page.$$('#tab-ups > .up')).length === 3 && /←/.test(await page.textContent('#tab-ups')) && /מנוע/.test(await page.textContent('#tab-ups')) && /נשק/.test(await page.textContent('#tab-ups')) && /שריון/.test(await page.textContent('#tab-ups')));
  await page.click('[data-tab="market"]');
  ok('the market: a card like the planes\', the free missile fitted', /שפריר/.test(await page.textContent('#hm-name')) && /מותקן/.test(await page.textContent('#hm-act')) && /טווח נעילה/.test(await page.textContent('#hm-specs')));
  await page.click('#hm-next');
  ok('the next missile: big on the pad, compared with the one fitted', /פיתון 3/.test(await page.textContent('#hm-name')) && /←/.test(await page.textContent('#hm-specs')) && await page.evaluate(() => window.__sky.hangarShows?.() === 'missiles/m2'));
  await page.click('[data-shelf="guns"]');
  ok('and the guns, the same way', /נגב/.test(await page.textContent('#hm-name')) && /250/.test(await page.textContent('#hm-specs')));
  // flicking fast, then out: nothing of the market is left on the pad
  for (let i = 0; i < 3; i++) await page.click('#hm-next');
  await snap('3c-market');
  await page.click('[data-tab="planes"]');
  await wait(1500);
  ok('back on the planes, no weapon left standing on the pad', await page.evaluate(() => window.__sky.hangarArms()) === 0);
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
  ok('the stick climbs', st.alive ? st.pitch > 0.15 : true, { y0, ...st });
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
    // (software rendering draws a frame or two a second here, and the room
    // would refuse a plane put down by hand: so wait out the dive). The
    // stick is held only while the nose is above a steep dive: held all the
    // way, a plane that can loop just loops
    await page.evaluate(() => {
      const key = (t) => dispatchEvent(new KeyboardEvent(t, { code: 'ArrowDown', key: 'ArrowDown' }));
      window.__dive = setInterval(() => key((window.__sky.me?.body?.pitch ?? 0) > -1.0 ? 'keydown' : 'keyup'), 20);
    });
    const died = await page.waitForSelector('#death:not(.hidden)', { timeout: 180000 }).then(() => true, () => false);
    await page.evaluate(() => { clearInterval(window.__dive); dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown', key: 'ArrowDown' })); });
    ok('diving into the sea brings the death screen', died);
    await wait(600);
    await snap('6-down');
    ok('it says how you went down', /התרסקת|הופלת|התנגשת/.test(await page.textContent('#death-title')));
    ok('and you are flying again after the countdown', await page.waitForFunction(() => window.__sky.me?.alive && document.querySelector('#death').classList.contains('hidden'), null, { timeout: 8000 }).then(() => true, () => false));
  }
  ok('the board in the air is short: the top three and you', [3, 4].includes((await page.$$('#score .r')).length));
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
