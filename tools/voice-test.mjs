// Voice in a real browser: two pilots in one sky, each with a (fake)
// microphone. They find each other, the line connects both ways, sound
// comes through, its volume follows the distance, and push-to-talk sends
// only while held.  `npm run build && node tools/voice-test.mjs`
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { voiceGain } from '../src/shared/voice.js';

const PORT = 3900 + Math.floor(Math.random() * 90);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 400)); } };
const srv = spawn(process.execPath, ['src/server/index.js'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore' });
await wait(1500);
const browser = await chromium.launch({
  executablePath: ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p)),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
async function pilot(name, mode) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, permissions: ['microphone'] });
  await ctx.addInitScript((m) => { localStorage.setItem('sky.voice', m); localStorage.setItem('sky.quality', 'low'); }, mode);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#btn-go:not([disabled])', { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const why = await page.evaluate(() => { const i = document.querySelector('#in-name'); return { ro: i.readOnly, vis: !!i.offsetParent, title: !document.querySelector('#screen-title').classList.contains('hidden'), err: document.querySelector('#title-err').textContent, btn: document.querySelector('#btn-go').textContent }; });
  if (why.ro || !why.vis) console.log('  (title:', JSON.stringify(why), ')');
  await page.$eval('#in-name', (el, v) => { el.value = v; }, name);
  // (clicked straight on the element: software rendering is too slow for a
  // moving page to ever look "stable" to the test's pointer)
  await page.$eval('#btn-go', (b) => b.click());
  await page.waitForSelector('#screen-hangar:not(.hidden)', { timeout: 60000 });
  await page.$eval('#btn-launch', (b) => b.click());
  try { await page.waitForFunction(() => window.__sky?.me?.alive === true, null, { timeout: 90000 }); } catch (e) {
    await page.screenshot({ path: `../vt-${name}.png` }).catch(() => {});
    console.log('  (', name, await page.evaluate(() => ({ mode: window.__sky.mode, notes: document.querySelector('#notes')?.innerText })).catch((x) => x.message), ')');
    throw e;
  }
  // a real tap on the page, as a player's finger would (it wakes the audio)
  await page.mouse.click(320, 380).catch(() => {});
  return page;
}
const state = (page) => page.evaluate(() => {
  const V = window.__sky.voice, me = window.__sky.me?.mesh?.position;
  return { ctx: V.ctx?.state, on: V.on, mode: V.mode, mic: !!V.stream, live: V.live, track: V.stream?.getAudioTracks()[0]?.enabled,
    peers: [...V.peers].map(([k, P]) => {
      const o = window.__sky.others.get(k);
      return { k, state: P.pc.connectionState, heard: !!P.gain, level: P.level, peak: P.peak, gain: P.gain?.gain.value, d: o && me ? Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) : null };
    }) };
});
try {
  console.log('\nvoice');
  const a = await pilot('Alpha', 'open');
  const b = await pilot('Bravo', 'open');
  const micOn = (p) => p.waitForFunction(() => window.__sky.voice.on && !!window.__sky.voice.stream, null, { timeout: 20000 }).then(() => true, () => false);
  ok('both have their microphones and voice on', await micOn(a) && await micOn(b), [await state(a), await state(b)]);
  ok('they find each other: the line connects, both ways', await Promise.all([a, b].map((p) => p.waitForFunction(() => [...window.__sky.voice.peers.values()].some((P) => P.pc.connectionState === 'connected'), null, { timeout: 90000 }).then(() => true, () => false))).then((r) => r.every(Boolean)), [await state(a), await state(b)]);
  // (the fake microphone's beep comes out of noise suppression faint; a dead
  // line reads exactly nothing)
  ok('sound comes through (the fake microphone\'s tone)', await b.waitForFunction(() => [...window.__sky.voice.peers.values()].some((P) => P.peak > 0.0005), null, { timeout: 45000 }).then(() => true, () => false), await state(b));
  await wait(1500);
  const s = await state(b), P = s.peers[0];
  ok('the volume is the distance\'s: full near, nothing past 500 m', P && P.d != null && Math.abs(P.gain - voiceGain(P.d)) < 0.12, P);
  // push to talk: quiet until held
  await a.evaluate(() => window.__sky.voice.setMode('ptt'));
  ok('push-to-talk: the line is reopened and the microphone is off until held', await a.waitForFunction(() => window.__sky.voice.on && window.__sky.voice.stream && window.__sky.voice.stream.getAudioTracks()[0].enabled === false, null, { timeout: 15000 }).then(() => true, () => false), await state(a));
  await a.evaluate(() => window.__sky.voice.talk(true));
  ok('held: on the air', (await state(a)).track === true && (await state(a)).live);
  await a.evaluate(() => window.__sky.voice.talk(false));
  ok('let go: off the air', (await state(a)).track === false);
  ok('the button shows in the air', await a.isVisible('#voice-btn'));
  // off: everything closed, and the other side lets go of the line
  await a.evaluate(() => window.__sky.voice.setMode('off'));
  ok('turned off: no lines, no microphone', await a.waitForFunction(() => !window.__sky.voice.on && !window.__sky.voice.stream && window.__sky.voice.peers.size === 0, null, { timeout: 10000 }).then(() => true, () => false));
  ok('and the other side drops the line', await b.waitForFunction(() => window.__sky.voice.peers.size === 0, null, { timeout: 10000 }).then(() => true, () => false), await state(b));
  // from off, right there in the air: the button stays, a tap opens the choice
  ok('off: the button is still there, saying so', await a.isVisible('#voice-btn') && /כבוי/.test(await a.textContent('#voice-btn')));
  await a.$eval('#voice-btn', (b) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  ok('a tap opens how to talk', await a.isVisible('#voice-menu'));
  await a.$eval('#voice-menu [data-vmode="open"]', (b) => b.click());
  ok('chosen in the air: the microphone comes on and the line is made again', await a.waitForFunction(() => window.__sky.voice.on && !!window.__sky.voice.stream, null, { timeout: 20000 }).then(() => true, () => false) && !(await a.isVisible('#voice-menu')));
  ok('and the other side hears again', await b.waitForFunction(() => [...window.__sky.voice.peers.values()].some((P) => P.pc.connectionState === 'connected'), null, { timeout: 90000 }).then(() => true, () => false), [await state(a), await state(b), await a.evaluate(() => [window.__sky.myKey, [...window.__sky.roster.values()].filter((r) => !r.bot).map((r) => r.key + ':' + r.v)])]);
  ok('no page errors', errors.length === 0, errors);
} catch (e) { fail++; console.log("  FAIL (threw)", e.message.split("\n").slice(0, 6).join(" | ")); }
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); srv.kill();
process.exit(fail ? 1 : 0);
