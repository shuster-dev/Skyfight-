// Skyfight in the browser: the front door, the hangar, and the sky.
import { Euler, Vector3, MathUtils } from 'three';
import { Net } from './net.js';
import { Controls } from './controls.js';
import { sound } from './audio.js';
import { makeRenderer, makeWorld, inCloud } from './gfx/scene.js';
import { buildPlane, animatePlane } from './gfx/planes.js';
import { Fx } from './gfx/fx.js';
import { Hangar } from './gfx/hangar.js';
import { PLANES, PLANE_ORDER, UPGRADES, UPGRADE_ORDER, TIER_MAX, nextTier, statsOf, levelProgress, planeOpen, planeOwned, cleanCallsign, displayName } from '../shared/planes.js';
import { ARENA, BRIDGE, groundAt, underBridge } from '../shared/arena.js';
import { fly, forward, newBody } from '../shared/flight.js';
import { FLARE, GUN, MISSILE, RESPAWN, aimDir, offNose, pickTarget } from '../shared/combat.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const show = (el, on = true) => (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERR = {
  offline: 'אין חיבור לשרת — בדקו את האינטרנט', bad_name: 'שם בין 2 ל־14 תווים, אותיות ומספרים בלבד', bad_login: 'שם משתמש או סיסמה שגויים',
  username_taken: 'השם הזה כבר תפוס', invalid_username: 'שם משתמש: 3–16 אותיות אנגלית קטנות ומספרים', invalid_password: 'סיסמה: לפחות 4 תווים',
  gold: 'אין מספיק זהב', level: 'צריך רמה גבוהה יותר', too_many_requests: 'יותר מדי ניסיונות — חכו רגע', no_pilot: 'קודם בוחרים שם',
};
const err = (e) => ERR[e?.code] || 'משהו השתבש — נסו שוב';

const net = new Net();
const controls = new Controls();
const renderer = makeRenderer($('#game'));
const world = makeWorld(renderer);
const { scene, camera } = world;
const fx = new Fx(scene);
const hangar = new Hangar(renderer);

const S = {
  mode: 'boot', pilot: null, account: { guest: true, username: '' },
  room: null, myKey: '', leaving: false,
  me: null,       // { body, stats, alive, hp, ammo, shieldUntil, gunT, gun, mesh }
  others: new Map(),
  roster: new Map(),
  missiles: [],
  sendT: 0, hudT: 0, shake: 0, hitFlash: 0, warnUntil: 0, deadAt: 0, killer: null,
  preview: [], previewKind: '',
};
window.__sky = S; // the browser tests look in here
S.world = world; S.camera = camera; S.buildPlane = buildPlane; S.scene = scene;
S.look = controls.look;

// ---- the camera's rig, and the showcase behind the menus ------------------

const camPos = new Vector3(0, 300, 600), camLook = new Vector3(), tmpV = new Vector3(), tmpE = new Euler(0, 0, 0, 'YXZ');

function setPreview(kinds) {
  const key = kinds.join(',');
  if (S.previewKind === key) return;
  for (const p of S.preview) scene.remove(p.mesh);
  S.previewKind = key;
  S.preview = kinds.map((k, i) => {
    const mesh = buildPlane(k);
    scene.add(mesh);
    return { mesh, kind: k, slot: i };
  });
}
function clearPreview() { for (const p of S.preview) scene.remove(p.mesh); S.preview = []; S.previewKind = ''; }

/** Planes flying a slow circle over the islands, the camera beside them. */
function showcase(t, dt, wide) {
  // round the bridge and the city, low enough to see them
  const R = 380, w = 0.07, a = t * w, ox = BRIDGE.x - 60, oz = BRIDGE.cz;
  const lead = S.preview[0];
  if (!lead) return;
  const slots = [[0, 0, 0], [-34, -6, 34], [34, -10, 40]];
  for (const p of S.preview) {
    const [sx, sy, sz] = slots[p.slot] || [0, 0, 0];
    // along the circle; the formation offset is in the plane's own frame
    const yaw = -a; // flying counter-clockwise, nose along the tangent
    const cx = ox + Math.cos(a) * R, cz = oz + Math.sin(a) * R;
    const fx_ = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    p.mesh.position.set(cx + rx * sx - fx_ * sz, 215 + sy + Math.sin(t * 0.9 + p.slot) * 1.5, cz + rz * sx - fz * sz);
    p.mesh.rotation.set(Math.sin(t * 0.5 + p.slot) * 0.04, yaw, -0.18 + Math.sin(t * 0.7 + p.slot) * 0.05, 'YXZ');
    animatePlane(p.mesh, dt, { speed: 60, time: t });
  }
  // the camera off the plane's front quarter, slowly drifting round it
  const m = lead.mesh, yaw = m.rotation.y;
  const orbit = yaw + 2.4 + Math.sin(t * 0.12) * 0.5, dist = wide ? 34 : 34;
  camPos.set(m.position.x - Math.sin(orbit) * dist, m.position.y + 6, m.position.z - Math.cos(orbit) * dist);
  camera.position.lerp(camPos, Math.min(1, dt * 3));
  // portrait: the plane sits a little above the middle, clear of the cards
  // portrait: the plane above the middle (over the logo on the title, over
  // the cards in the hangar); wide: beside the middle
  camLook.copy(m.position).add(tmpV.set(0, wide ? -1 : S.mode === 'title' ? -11 : -7, 0));
  // wide: the title's logo is in the middle, so the planes go to its side
  if (wide && S.mode === 'title') camLook.addScaledVector(tmpV.subVectors(camLook, camera.position).cross(camera.up).normalize(), 15);
  camera.lookAt(camLook);
}

// ---- boot -----------------------------------------------------------------

async function boot() {
  resize();
  requestAnimationFrame(frame);
  setPreview(['sparrow', 'hornet', 'viper']);
  show('#boot', false);
  showTitle();
  try {
    const me = await net.session((i) => { $('#btn-go').textContent = i < 2 ? 'מתחבר…' : 'השרת מתעורר — עוד רגע…'; });
    took(me);
    const btn = $('#btn-go');
    btn.disabled = false;
    btn.textContent = S.pilot.name ? 'להאנגר' : 'המראה';
    if (S.pilot.name) $('#in-name').value = S.pilot.name;
  } catch (e) {
    $('#title-err').textContent = err(e);
    $('#btn-go').textContent = 'נסו לרענן את הדף';
  }
}

function took(me) {
  S.pilot = me.pilot;
  S.account = { guest: !!me.guest, username: me.username || '' };
}

// ---- the front door -------------------------------------------------------

function showTitle() {
  S.mode = 'title';
  ['#screen-hangar', '#hud', '#death'].forEach((s) => show(s, false));
  show('#screen-title');
  show('#corner');
  setPreview(['sparrow', 'hornet', 'viper']);
}

$('#title-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  sound.unlock();
  const name = cleanCallsign($('#in-name').value);
  $('#title-err').textContent = '';
  if (!name) return ($('#title-err').textContent = ERR.bad_name);
  const btn = $('#btn-go');
  btn.disabled = true;
  try {
    if (name !== S.pilot.name) S.pilot = (await net.api('/api/pilot/name', { name })).pilot;
    showHangar();
  } catch (x) {
    $('#title-err').textContent = err(x);
  } finally { btn.disabled = false; }
});
$('#btn-have').addEventListener('click', () => openLogin('login'));

// ---- logging in and saving ------------------------------------------------

let loginMode = 'login';
function openLogin(mode) {
  loginMode = mode;
  $('#login-title').textContent = mode === 'login' ? 'התחברות לטייס שמור' : 'שמירת ההתקדמות';
  $('#btn-login').textContent = mode === 'login' ? 'התחבר' : 'שמור';
  $('#in-pass').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  $('#login-note').textContent = mode === 'login'
    ? 'אחרי ההתחברות תמשיכו בדיוק מאיפה שעצרתם.'
    : 'בוחרים שם משתמש וסיסמה — וההתקדמות נשמרת. כך אפשר להמשיך מכל מכשיר.';
  $('#login-err').textContent = '';
  show('#sheet-login');
  setTimeout(() => $('#in-user').focus(), 50);
}
$('#btn-login-close').addEventListener('click', () => show('#sheet-login', false));
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { username: $('#in-user').value.trim().toLowerCase(), password: $('#in-pass').value };
  try {
    const me = await net.api(loginMode === 'login' ? '/api/login' : '/api/register', body);
    took(me);
    show('#sheet-login', false);
    $('#in-pass').value = '';
    if (S.mode === 'title') {
      if (S.pilot.name) $('#in-name').value = S.pilot.name, showHangar();
      else $('#btn-go').textContent = 'המראה';
    } else renderHangar(), toast(loginMode === 'login' ? 'מחובר!' : 'נשמר! ✔');
  } catch (x) { $('#login-err').textContent = err(x); }
});

// ---- settings -------------------------------------------------------------

function openSettings() {
  $('#set-sound').checked = !sound.muted;
  $('#set-invert').checked = controls.invert;
  $('#set-account').textContent = S.account.guest ? 'הטייס עדיין לא שמור — שמרו אותו בהאנגר.' : `מחובר כ־${S.account.username}`;
  show('#btn-logout', !S.account.guest);
  show('#sheet-settings');
}
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-settings2').addEventListener('click', openSettings);
$('#btn-settings-close').addEventListener('click', () => show('#sheet-settings', false));
$('#set-sound').addEventListener('change', (e) => { sound.setMuted(!e.target.checked); paintSoundBtn(); });
$('#set-invert').addEventListener('change', (e) => controls.setInvert(e.target.checked));
$('#btn-sound').addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); paintSoundBtn(); });
// muted: the speaker crossed out
const paintSoundBtn = () => $('#btn-sound').classList.toggle('muted', sound.muted);
paintSoundBtn();
$('#btn-logout').addEventListener('click', () => { net.logout(); location.reload(); });

// ---- the hangar -----------------------------------------------------------

let tab = 'planes', viewing = '';
function showHangar() {
  S.mode = 'hangar';
  ['#screen-title', '#hud', '#death'].forEach((s) => show(s, false));
  show('#screen-hangar');
  show('#corner', false);
  controls.enabled = false;
  sound.engine(false);
  clearPreview();
  viewing = S.pilot.plane;
  renderHangar();
}

$$('.h-tabs button').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  $$('.h-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  renderHangar();
}));

function renderHangar() {
  const p = S.pilot;
  $('#h-name').textContent = displayName(p);
  $('#h-level').textContent = p.level;
  $('#h-gold').textContent = fmt(p.gold);
  $('#h-xp').style.width = `${levelProgress(p.xp) * 100}%`;
  show('#btn-save', S.account.guest);
  show('#tab-planes', tab === 'planes');
  show('#tab-ups', tab === 'ups');
  show('#tab-board', tab === 'board');
  hangar.show(viewing || p.plane);
  if (tab === 'planes') renderPlanes();
  if (tab === 'ups') renderUps();
  if (tab === 'board') renderBoard();
  $('#btn-launch').textContent = `המראה · ${PLANES[p.plane].he}`;
}

/** The plane on the table: its name, its era, and what can be done with it. */
function renderPlanes() {
  const p = S.pilot, k = viewing || p.plane, d = PLANES[k];
  const own = planeOwned(p, k), open = planeOpen(p, k), sel = p.plane === k;
  $('#hp-era').textContent = `${d.era} · ${d.kind}`;
  $('#hp-name').textContent = d.he;
  $('#hp-role').textContent = d.role;
  $('#hp-dots').innerHTML = PLANE_ORDER.map((id) => `<i class="${id === k ? 'on' : ''} ${planeOwned(p, id) ? 'own' : ''}"></i>`).join('');
  const act = $('#hp-act');
  act.className = 'h-act';
  act.disabled = false;
  delete act.dataset.pick; delete act.dataset.buy;
  if (sel) { act.textContent = 'בשימוש'; act.classList.add('ok'); act.disabled = true; }
  else if (own) { act.textContent = 'בחר'; act.dataset.pick = k; }
  else if (open) { act.innerHTML = `קנה · <span class="num">${fmt(d.price)}</span>`; act.classList.add('buy'); act.dataset.buy = k; act.disabled = p.gold < d.price; }
  else { act.textContent = `נפתח ברמה ${d.level}`; act.disabled = true; }
}

const step = (dir) => {
  const i = PLANE_ORDER.indexOf(viewing || S.pilot.plane);
  viewing = PLANE_ORDER[(i + dir + PLANE_ORDER.length) % PLANE_ORDER.length];
  hangar.show(viewing);
  renderPlanes();
};
// in a right-to-left page the arrow on the right goes back
$('#hp-prev').addEventListener('click', () => step(-1));
$('#hp-next').addEventListener('click', () => step(1));
// a swipe across the hangar turns the table
{
  let sx = null;
  const scr = $('#screen-hangar');
  scr.addEventListener('pointerdown', (e) => { if (!e.target.closest('button, .h-panel')) sx = e.clientX; });
  scr.addEventListener('pointermove', (e) => { if (sx !== null) hangar.turn(e.clientX - sx), sx = e.clientX; });
  addEventListener('pointerup', () => (sx = null));
}

$('#hp-act').addEventListener('click', async (e) => {
  const b = e.currentTarget, pick = b.dataset.pick, buy = b.dataset.buy;
  if (!pick && !buy) return;
  sound.unlock();
  try {
    const r = await net.api(buy ? '/api/pilot/buy-plane' : '/api/pilot/plane', { plane: pick || buy });
    S.pilot = r.pilot;
    viewing = S.pilot.plane;
    if (buy) sound.coin(), toast(`${PLANES[buy].he} בהאנגר שלך`);
    renderHangar();
  } catch (x) { toast(err(x)); }
});

function renderUps() {
  const p = S.pilot;
  $('#tab-ups').innerHTML = UPGRADE_ORDER.map((k) => {
    const u = UPGRADES[k], have = p.upgrades[k] || 0, n = nextTier(p, k);
    const segs = Array.from({ length: TIER_MAX }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
    const btn = !n ? '<button disabled>מלא</button>'
      : p.level < n.level ? `<button disabled>רמה ${n.level}</button>`
        : `<button data-up="${k}" ${p.gold < n.cost ? 'disabled' : ''}><span class="num">${fmt(n.cost)}</span><span class="coin"></span></button>`;
    return `<div class="up"><div class="t"><b>${u.he}</b><small>${u.desc}</small><div class="segs">${segs}</div></div>${btn}</div>`;
  }).join('') + '<div class="note" style="text-align:right">השדרוגים עוברים איתך לכל מטוס. זהב מרוויחים על כל הפלה.</div>';
}

$('#tab-ups').addEventListener('click', async (e) => {
  const k = e.target.closest('[data-up]')?.dataset.up;
  if (!k) return;
  try {
    const r = await net.api('/api/pilot/upgrade', { upgrade: k });
    S.pilot = r.pilot;
    sound.coin();
    toast(`${UPGRADES[k].he} · דרגה ${r.tier}`);
    renderHangar();
  } catch (x) { toast(err(x)); }
});

async function renderBoard() {
  const el = $('#tab-board');
  el.innerHTML = '<div class="note">טוען…</div>';
  try {
    const { rows } = await net.api('/api/leaderboard');
    const mine = displayName(S.pilot);
    // only saved pilots are on the board: a guest is told how to get there
    const hint = S.account.guest ? '<div class="note" style="text-align:right">רק טייסים שמורים מופיעים בדירוג. שמרו את ההתקדמות כדי להיכנס אליו — עם מספר משלכם, כמו מאיר#1.</div>' : '';
    el.innerHTML = hint + `<table>${rows.map((r) => `<tr class="${r.name === mine ? 'me' : ''}"><td class="num">${r.rank}</td><td>${esc(r.name)}</td><td>רמה <span class="num">${r.level}</span></td><td><span class="num">${r.kills}</span> הפלות</td></tr>`).join('') || '<tr><td>עוד אין אף אחד — תהיו הראשונים</td></tr>'}</table>`;
  } catch (x) { el.innerHTML = `<div class="note">${err(x)}</div>`; }
}

$('#btn-save').addEventListener('click', () => openLogin('register'));
$('#btn-launch').addEventListener('click', () => { sound.unlock(); launch(); });

// ---- into the air -----------------------------------------------------------

async function launch() {
  const btn = $('#btn-launch');
  btn.disabled = true;
  btn.textContent = 'ממריא…';
  try {
    const room = await net.join();
    S.room = room;
    S.leaving = false;
    S.others.clear(); S.roster.clear(); S.missiles = [];
    hook(room);
    room.send('hello');
    S.mode = 'air';
    clearPreview();
    ['#screen-hangar', '#screen-title', '#death'].forEach((s) => show(s, false));
    show('#hud');
    show('#touch', controls.touch);
    show('#keys-help', !controls.touch);
    controls.enabled = true;
    $('#feed').innerHTML = '';
  } catch (x) {
    toast(err(x));
  } finally { btn.disabled = false; renderHangar(); }
}

function hook(room) {
  room.onMessage('welcome', (m) => {
    S.myKey = m.key;
    S.pilot = m.pilot;
    for (const r of m.roster) S.roster.set(r.key, r);
    const mesh = buildPlane(S.pilot.plane);
    scene.add(mesh);
    S.me = { stats: m.stats, alive: false, hp: m.stats.hp, ammo: m.stats.missiles, shieldUntil: 0, gunT: 0, gun: 0, mesh, body: null, reloadT: 0 };
    $('#hud-name').textContent = displayName(S.pilot);
    paintScore();
  });
  room.onMessage('spawn', (m) => {
    const me = S.me;
    if (!me) return;
    me.body = newBody(m, me.stats);
    me.alive = true; me.hp = m.hp; me.ammo = m.ammo; me.reloadT = 0; me.crashed = false; me.flares = m.flares ?? me.stats.flares; me.flareT = 0;
    me.shieldUntil = performance.now() + m.shield * 1000;
    me.mesh.visible = true;
    // the camera starts behind, not wherever the last life ended
    const f = forward(me.body.yaw, 0);
    camera.position.set(me.body.x - f.x * 22, me.body.y + 7, me.body.z - f.z * 22);
    show('#death', false);
    show('#hud');
  });
  room.onMessage('fix', (m) => { if (S.me?.body) Object.assign(S.me.body, m); });
  room.onMessage('s', onSnapshot);
  room.onMessage('roster', (list) => {
    S.roster = new Map(list.map((r) => [r.key, r]));
    paintScore();
  });
  room.onMessage('hit', (m) => {
    S.hitFlash = 0.12;
    sound.hit();
    const o = S.others.get(m.v);
    o && fx.spark(o.mesh.position);
  });
  room.onMessage('hurt', (m) => {
    if (!S.me) return;
    S.me.hp = m.hp;
    const big = m.how === 'missile' || m.how === 'collision';
    S.shake = Math.min(1, S.shake + (big ? 0.9 : 0.25));
    $('#vig').style.opacity = big ? 1 : 0.6;
    setTimeout(() => ($('#vig').style.opacity = 0), 160);
    sound.hurt();
  });
  room.onMessage('fired', (m) => { if (S.me) S.me.ammo = m.ammo; sound.launch(); });
  room.onMessage('flared', (m) => {
    if (S.me) S.me.flares = m.flares;
    if (m.pulled) S.warnUntil = 0, toast('הטיל הוטעה');
  });
  room.onMessage('flare', (m) => {
    const p = m.k === S.myKey ? S.me?.mesh : S.others.get(m.k)?.mesh;
    if (p) fx.flares(p.position, p.rotation), sound.flare();
  });
  room.onMessage('incoming', () => { S.warnUntil = performance.now() + 3500; sound.warn(); });
  // two planes met: sparks, a burst, and a jolt if one of them was us
  room.onMessage('ram', (m) => {
    const p = new Vector3(m.at[0] / 10, m.at[1] / 10, m.at[2] / 10);
    fx.pop(p, 1.2);
    for (let i = 0; i < 6; i++) fx.spark(p.clone().add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6)));
    sound.boom(near(p) * 0.7);
    if (m.a === S.myKey || m.b === S.myKey) toast('התנגשות');
  });
  room.onMessage('boom', (b) => {
    const p = new Vector3(b[0] / 10, b[1] / 10, b[2] / 10);
    fx.pop(p, 1.4);
    sound.boom(near(p));
  });
  room.onMessage('down', onDown);
  room.onMessage('reward', onReward);
  room.onLeave((code) => {
    const why = code === 4002 ? 'נותקת מהזירה כי לא טסת זמן מה' : code === 4000 ? 'נכנסת מחלון אחר' : '';
    leaveSky(S.leaving ? '' : why || (code > 1000 ? 'החיבור לשרת נפל' : ''));
  });
}

const near = (p) => Math.max(0.15, 1 - camera.position.distanceTo(p) / 900);

function onSnapshot(s) {
  const now = performance.now(), seen = new Set();
  for (const a of s.p) {
    const [key, x, y, z, yaw, pitch, roll, hp, flags, spd] = a;
    seen.add(key);
    if (key === S.myKey) {
      if (S.me) S.me.serverHp = hp;
      continue;
    }
    let o = S.others.get(key);
    const r = S.roster.get(key);
    if (!o) {
      o = { key, kind: r?.plane || 'sparrow', mesh: buildPlane(r?.plane || 'sparrow'), buf: [], fireT: 0, gun: 0, smokeT: 0, tag: null };
      scene.add(o.mesh);
      S.others.set(key, o);
    }
    if (r && r.plane !== o.kind) {
      // a different plane under the same key (it changed in the hangar)
      scene.remove(o.mesh); o.mesh = buildPlane(r.plane); o.kind = r.plane; scene.add(o.mesh);
    }
    o.buf.push({ t: now, x: x / 10, y: y / 10, z: z / 10, yaw: yaw / 1000, pitch: pitch / 1000, roll: roll / 1000, speed: spd / 10 });
    if (o.buf.length > 8) o.buf.shift();
    o.hp = hp; o.alive = !!(flags & 1); o.firing = !!(flags & 2); o.boost = !!(flags & 4); o.shield = !!(flags & 8);
  }
  for (const [k, o] of S.others) if (!seen.has(k)) { scene.remove(o.mesh); o.tag?.remove(); S.others.delete(k); }
  S.missiles = s.m.map(([id, x, y, z, yaw, pitch, target]) => ({ id, x: x / 10, y: y / 10, z: z / 10, yaw: yaw / 1000, pitch: pitch / 1000, target }));
  if (S.missiles.some((m) => m.target === S.myKey)) S.warnUntil = Math.max(S.warnUntil, now + 300);
}

function nameOf(key) { return S.roster.get(key)?.name || '?'; }

function onDown(m) {
  const p = new Vector3(m.x / 10, m.y / 10, m.z / 10);
  fx.explode(p, 1);
  sound.boom(near(p) + 0.3);
  const mine = m.k === S.myKey, me = m.v === S.myKey;
  const how = m.how === 'missile' ? 'טיל' : m.how === 'crash' ? 'התרסקות' : m.how === 'collision' ? 'התנגשות' : 'תותח';
  feed(m.k ? `${esc(nameOf(m.k))} <span class="w">${how}</span> ${esc(nameOf(m.v))}` : `${esc(nameOf(m.v))} <span class="w">${m.how === 'collision' ? 'התנגש' : 'התרסק'}</span>`, mine || me);
  if (me && S.me) {
    S.me.alive = false;
    S.me.mesh.visible = false;
    S.deadAt = performance.now();
    S.wreck = { from: p.clone(), back: tmpV.subVectors(camera.position, p).setY(0).normalize().clone() };
    S.killer = m.k ? { name: nameOf(m.k), how: m.how } : null;
    sound.engine(false);
    show('#death');
    $('#death-title').textContent = m.how === 'collision' ? 'התנגשת' : m.how === 'crash' && !m.k ? 'התרסקת' : 'הופלת';
    $('#death-by').innerHTML = S.killer ? `על ידי <b>${esc(S.killer.name)}</b> · ${how}` : m.into === 'building' ? 'לתוך בניין' : m.into === 'bridge' ? 'לתוך הגשר' : 'שימו לב לגובה';
  }
  const o = S.others.get(m.v);
  if (o) o.mesh.visible = false;
}

function onReward(m) {
  const before = S.pilot.level;
  S.pilot = m.pilot;
  toast(`${m.assist ? 'סיוע' : 'הפלה'}  +${m.xp} XP  +${m.gold} זהב`);
  sound.coin();
  if (m.streak >= 3 && !m.assist) toast(`רצף של ${m.streak}`);
  if (m.up || S.pilot.level > before) {
    setTimeout(() => toast(`רמה ${S.pilot.level}`, 'lvl'), 500);
    sound.level();
  }
}

async function leaveSky(why) {
  if (S.mode !== 'air') return;
  S.leaving = true;
  // nothing more goes out on a socket that is closing
  const room = S.room;
  S.room = null;
  S.mode = 'leaving';
  controls.enabled = false;
  try { await room?.leave(); } catch {}
  if (S.me) scene.remove(S.me.mesh);
  S.me = null;
  for (const o of S.others.values()) scene.remove(o.mesh), o.tag?.remove();
  S.others.clear();
  fx.syncMissiles([], 0);
  $('#tags').innerHTML = '';
  // the pilot as the server has them now (the pay is in)
  try { took(await net.api('/api/me')); } catch {}
  showHangar();
  why && toast(why);
}
$('#menu-btn').addEventListener('click', () => leaveSky());
$('#btn-to-hangar').addEventListener('click', () => leaveSky());

// ---- every frame ------------------------------------------------------------

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const time = t / 1000;
  const wide = innerWidth > innerHeight;
  // the hangar is a scene of its own
  if (S.mode === 'hangar') {
    hangar.tick(dt);
    renderer.render(hangar.scene, hangar.camera);
    return;
  }
  if (S.mode === 'air') air(dt, time);
  else if (S.mode !== 'look') showcase(time, dt, wide); // 'look': a tool holds the camera
  fx.syncMissiles(S.missiles, dt);
  fx.tick(dt, camera);
  world.tick(time, dt);
  renderer.render(scene, camera);
}

function air(dt, time) {
  const me = S.me;
  const now = performance.now();
  // others: drawn a tenth of a second in the past, between two snapshots
  const rt = now - 110;
  for (const o of S.others.values()) {
    const b = o.buf;
    if (!b.length) continue;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > rt) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    const k = c.t === a.t ? 1 : MathUtils.clamp((rt - a.t) / (c.t - a.t), 0, 1.2);
    const lerpA = (x, y) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * k;
    o.mesh.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
    o.mesh.rotation.set(lerpA(a.pitch, c.pitch), lerpA(a.yaw, c.yaw), lerpA(a.roll, c.roll), 'YXZ');
    o.mesh.visible = o.alive;
    o.x = o.mesh.position.x; o.y = o.mesh.position.y; o.z = o.mesh.position.z;
    o.yaw = o.mesh.rotation.y; o.pitch = o.mesh.rotation.x; o.speed = c.speed;
    const f = forward(o.yaw, o.pitch);
    o.vel = { x: f.x * c.speed, y: f.y * c.speed, z: f.z * c.speed };
    animatePlane(o.mesh, dt, { boost: o.boost, speed: c.speed, time });
    if (o.alive && o.firing) guns(o, o.mesh, PLANES[o.kind].rate, dt, false);
    if (o.alive && o.hp < 35) smoke(o, dt);
    // the shield after a respawn: a blink
    if (o.shield) o.mesh.visible = o.alive && Math.floor(time * 8) % 2 === 0;
  }

  if (me?.body && me.alive) {
    const input = controls.read();
    const res = me.crashed ? '' : fly(me.body, input, me.stats, dt);
    const b = me.body;
    me.mesh.position.set(b.x, b.y, b.z);
    me.mesh.rotation.set(b.pitch, b.yaw, b.roll, 'YXZ');
    me.mesh.visible = now > me.shieldUntil || Math.floor(time * 8) % 2 === 0;
    animatePlane(me.mesh, dt, { boost: b.boosting, speed: b.speed, time, ammo: me.ammo, ammoMax: me.stats.missiles });
    if (input.missile && me.ammo > 0) S.room?.send('missile');
    if (input.flare && me.flares > 0) S.room?.send('flare');
    if (me.flares < me.stats.flares) { me.flareT += dt; if (me.flareT >= me.stats.flareReload) me.flares++, me.flareT = 0; }
    if (me.ammo < me.stats.missiles) { me.reloadT += dt; if (me.reloadT >= me.stats.reload) me.ammo++, me.reloadT = 0; }
    me.firing = input.fire;
    if (input.fire) guns({ ...b, key: S.myKey, alive: true, _me: me }, me.mesh, me.stats.rate, dt, true);
    else me.gunT = Math.min(1 / me.stats.rate, me.gunT + dt);
    if (me.hp < me.stats.hp * 0.35) smoke(me, dt, me.mesh.position);
    if (res === 'crash') {
      // the room needs to see it in the thing it hit to call it: into the
      // ground (or the sea) it goes below the surface; into a building or
      // the bridge it stays where it struck. Then it stops there.
      if (b.hit === 'ground' || b.hit === 'sea') b.y = groundAt(b.x, b.z) + 0.3;
      S.sendT = 1;
      me.crashed = true;
    }
    // under the bridge: a cheer (once per pass)
    const under = underBridge(b.x, b.y, b.z);
    if (under && !me.under) toast('מתחת לגשר');
    me.under = under;
    S.sendT += dt;
    if (S.sendT >= 0.05) {
      S.sendT = 0;
      S.room?.send('pose', [r2(b.x), r2(b.y), r2(b.z), r3(b.yaw), r3(b.pitch), r3(b.roll), r2(b.speed), (input.fire ? 1 : 0) | (b.boosting ? 2 : 0)]);
    }
    sound.engine(true, b.speed, b.boosting);
    chase(b, dt, input);
  } else if (me) {
    // down: the camera pulls back and up, and watches the wreck burn
    if (S.wreck) {
      camPos.copy(S.wreck.from).add(tmpV.set(0, 28, 0)).addScaledVector(S.wreck.back, 70);
      camera.position.lerp(camPos, Math.min(1, dt * 1.6));
      camera.up.set(0, 1, 0);
      camera.lookAt(S.wreck.from);
    }
    const left = Math.max(0, RESPAWN.delay - (now - S.deadAt) / 1000);
    $('#death-count').textContent = left > 0.05 ? `חוזרים לשמיים בעוד ${left.toFixed(1)}…` : 'ממריאים…';
  }
  hud(dt, now);
}
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

/** The chase camera: behind and above, leaning into turns, wider on the burner. */
function chase(b, dt, input) {
  // free look (controls.js): the camera swung round the plane by the
  // right thumb, looking at the plane instead of ahead of it
  const look = controls.settleLook(dt);
  const lk = Math.min(1, Math.abs(look.yaw) * 1.5 + Math.abs(look.pitch) * 1.5);
  const f = forward(b.yaw + look.yaw, b.pitch * 0.6 * (1 - lk) - look.pitch);
  const ahead = forward(b.yaw, b.pitch * 0.6);
  // a phone held upright sees a narrow slice: stand further back
  const narrow = camera.aspect < 1 ? 1.75 : 1;
  const dist = (19 + (b.boosting ? 4 : 0)) * narrow, up = 5.6 * narrow;
  camPos.set(b.x - f.x * dist, b.y - f.y * dist + up, b.z - f.z * dist);
  const g = groundAt(camPos.x, camPos.z) + 3;
  if (camPos.y < g) camPos.y = g;
  camera.position.lerp(camPos, Math.min(1, dt * 7));
  camLook.set(b.x + ahead.x * 40 * (1 - lk), b.y + ahead.y * 40 * (1 - lk) + 2.5 - lk, b.z + ahead.z * 40 * (1 - lk));
  if (S.shake > 0) {
    camLook.x += (Math.random() - 0.5) * S.shake * 3; camLook.y += (Math.random() - 0.5) * S.shake * 3;
    S.shake = Math.max(0, S.shake - dt * 2.5);
  }
  // the up vector leans with the bank, in the plane's own frame
  tmpE.set(0, b.yaw, b.roll * 0.3 * (1 - lk));
  camera.up.set(0, 1, 0).applyEuler(tmpE);
  camera.lookAt(camLook);
  const fov = b.boosting ? 72 : 62;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

// cannons thump; machine guns rattle
const HEAVY = new Set(['bulldog', 'viper', 'phantom']);
/** Tracers from the muzzles of whoever is firing, at their rate. */
const MZ = new Vector3(), DIR = new Vector3();
function guns(o, mesh, rate, dt, mine) {
  const every = 1 / rate, holder = mine ? o._me : o;
  holder.gunT = (holder.gunT || 0) + dt;
  const muzzles = mesh.userData.guns;
  while (holder.gunT >= every) {
    holder.gunT -= every;
    const m = muzzles[(holder.gun = (holder.gun || 0) + 1) % muzzles.length];
    MZ.copy(m).applyEuler(mesh.rotation).add(mesh.position);
    // the room leads the guns at a target near the nose: so does the tracer
    const target = mine ? pickTarget(o, [...S.others.values()], GUN.assistCone, GUN.assistRange) : null;
    const d = aimDir(o, target);
    const f = forward(o.yaw, o.pitch);
    DIR.set(d.x * GUN.speed + f.x * (o.speed || 60), d.y * GUN.speed + f.y * (o.speed || 60), d.z * GUN.speed + f.z * (o.speed || 60));
    const sp = DIR.length();
    fx.tracer(MZ, DIR.normalize(), sp);
    fx.muzzle(MZ);
    if (mine) sound.shot(HEAVY.has(S.pilot.plane));
  }
}

function smoke(o, dt, pos) {
  o.smokeT = (o.smokeT || 0) + dt;
  if (o.smokeT < 0.06) return;
  o.smokeT = 0;
  fx.puff(pos || o.mesh.position, { color: 0x333338, size: 1.4, grow: 5, life: 1.6, rise: 1 });
}

// ---- the head-up display ------------------------------------------------------

const P = new Vector3();
function hud(dt, now) {
  const me = S.me;
  // the crosshair kicks when a round lands
  S.hitFlash = Math.max(0, S.hitFlash - dt);
  $('#cross').classList.toggle('hit', S.hitFlash > 0);
  show('#cross', !!me?.alive);
  show('#warn', now < S.warnUntil && !!me?.alive);
  if (me?.body) {
    const b = me.body;
    show('#edge', Math.hypot(b.x, b.z) > ARENA.radius - 30 && me.alive);
    // through a cloud the world goes white
    const c = inCloud(world.clouds, b.x, b.y, b.z);
    $('#white').style.opacity = me.alive ? Math.min(0.85, c * 1.6) : 0;
    // the lock: what a missile would go after now
    const t = me.alive ? pickTarget({ ...b, alive: true }, [...S.others.values()].filter((o) => o.alive && !o.shield), MISSILE.lockCone, MISSILE.lockRange) : null;
    const lock = $('#lock');
    if (t && project(P.set(t.x, t.y, t.z))) {
      show(lock);
      lock.style.left = `${P.x}px`; lock.style.top = `${P.y}px`;
      lock.classList.toggle('ready', me.ammo > 0);
    } else show(lock, false);
    // the crosshair where the guns point: 300 m down the nose
    const f = forward(b.yaw, b.pitch), cross = $('#cross');
    if (project(P.set(b.x + f.x * 300, b.y + f.y * 300, b.z + f.z * 300))) cross.style.left = `${P.x}px`, cross.style.top = `${P.y}px`;
    // the aim pip: where the nearest plane ahead will be when the rounds get
    // there. Crosshair on it and the guns are helped onto it (shared/combat.js)
    const g = me.alive ? pickTarget({ ...b, alive: true }, [...S.others.values()].filter((o) => o.alive), 0.5, GUN.assistRange + 150) : null;
    const lead = $('#lead');
    if (g) {
      const d = Math.hypot(g.x - b.x, g.y - b.y, g.z - b.z), tt = d / (GUN.speed + b.speed), v = g.vel || { x: 0, y: 0, z: 0 };
      if (project(P.set(g.x + v.x * tt, g.y + v.y * tt, g.z + v.z * tt))) { show(lead); lead.style.left = `${P.x}px`; lead.style.top = `${P.y}px`; } else show(lead, false);
      cross.classList.toggle('on', offNose(b, b.yaw, b.pitch, g) < GUN.assistCone && d < GUN.assistRange);
    } else { show(lead, false); cross.classList.remove('on'); }
  }
  S.hudT += dt;
  if (S.hudT < 0.1 || !me) return;
  S.hudT = 0;
  const hp = Math.max(0, me.hp) / me.stats.hp;
  $('#hud-hp').style.width = `${hp * 100}%`;
  $('#hud-hpbar').classList.toggle('low', hp < 0.35);
  $('#hud-level').textContent = S.pilot.level;
  $('#hud-xp').style.width = `${levelProgress(S.pilot.xp) * 100}%`;
  if (me.body) {
    $('#hud-speed').textContent = Math.round(me.body.speed * 3.6 * 4);
    $('#hud-fuel').style.width = `${me.body.fuel * 100}%`;
  }
  $('#hud-msl').innerHTML = Array.from({ length: me.stats.missiles }, (_, i) => `<i class="${i < me.ammo ? 'on' : ''}"></i>`).join('');
  $('#hud-flr').innerHTML = Array.from({ length: me.stats.flares }, (_, i) => `<i class="${i < (me.flares ?? 0) ? 'on' : ''}"></i>`).join('');
  tags();
}

/** Screen position of a world point; false when behind the camera. */
function project(v) {
  v.project(camera);
  if (v.z > 1) return false;
  v.x = (v.x * 0.5 + 0.5) * innerWidth;
  v.y = (-v.y * 0.5 + 0.5) * innerHeight;
  return v.x > -50 && v.x < innerWidth + 50 && v.y > -50 && v.y < innerHeight + 50;
}

/** Names over the planes in view, and arrows at the edge for the nearest ones out of it. */
function tags() {
  const box = $('#tags');
  const me = S.me?.body;
  if (!me) return;
  const list = [...S.others.values()].filter((o) => o.alive).map((o) => ({ o, d: Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) })).sort((a, b) => a.d - b.d);
  let html = '';
  let arrows = 0;
  for (const { o, d } of list) {
    if (d > 1400) break;
    const r = S.roster.get(o.key);
    P.set(o.x, o.y + 4, o.z);
    const behind = P.clone().project(camera).z > 1;
    if (!behind && project(P)) {
      const bar = o.hp < 100 ? `<div class="mini"><i style="width:${o.hp}%"></i></div>` : '';
      html += `<div class="tagp" style="left:${P.x}px;top:${P.y}px">${esc(r?.name || '')} <span style="opacity:.7">${r?.level || ''}</span>${d < 900 ? ` · <span class="num">${Math.round(d)}m</span>` : ''}${bar}</div>`;
    } else if (arrows < 3) {
      arrows++;
      // where it is, folded onto the edge of the screen
      const v = new Vector3(o.x, o.y, o.z).applyMatrix4(camera.matrixWorldInverse);
      const ang = Math.atan2(v.x, v.y);
      const cx = innerWidth / 2, cy = innerHeight / 2, R = Math.min(cx, cy) - 40;
      html += `<div class="arrow" style="left:${cx + Math.sin(ang) * R - 9}px;top:${cy - Math.cos(ang) * R - 8}px;transform:rotate(${ang}rad)"></div>`;
    }
  }
  box.innerHTML = html;
}

function paintScore() {
  const rows = [...S.roster.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const mine = rows.findIndex((r) => r.key === S.myKey);
  // the top three and you: the rest is in the hangar's board
  const top = rows.slice(0, 3);
  if (mine >= 3) top.push(rows[mine]);
  $('#score').innerHTML = top.map((r) => `<div class="r ${r.key === S.myKey ? 'me' : ''}"><span class="num">${rows.indexOf(r) + 1}</span><span class="n">${esc(r.name)}${r.bot ? ' <span class="bot">·</span>' : ''}</span><span class="num">${r.kills}</span></div>`).join('');
}

function feed(html, mine) {
  const f = $('#feed');
  const d = document.createElement('div');
  d.innerHTML = html;
  mine && d.classList.add('mine');
  f.prepend(d);
  while (f.children.length > 4) f.lastChild.remove();
  setTimeout(() => d.remove(), 4600);
}

function toast(text, cls = '') {
  const t = document.createElement('div');
  t.textContent = text;
  cls && t.classList.add(cls);
  // over the hangar too
  const host = S.mode === 'air' ? $('#toast') : document.body;
  if (host === document.body) Object.assign(t.style, { position: 'fixed', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 60, pointerEvents: 'none', fontSize: '20px', fontWeight: 900, color: '#eaf6ff', letterSpacing: '1px', textShadow: '0 2px 10px rgba(0,0,0,.8)', animation: 'rise 1.8s forwards', textAlign: 'center' });
  host.append(t);
  setTimeout(() => t.remove(), 1900);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  hangar.resize(innerWidth / innerHeight);
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.engine(false); });

boot();
