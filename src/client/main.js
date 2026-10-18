// Skyfight in the browser: the front door, the hangar, and the sky.
import { Euler, Vector3, MathUtils, Quaternion } from 'three';
import { Net } from './net.js';
import { Controls } from './controls.js';
import { sound } from './audio.js';
import { makeRenderer, makeWorld, inCloud, makePads } from './gfx/scene.js';
import { buildPlane, buildBomber, animatePlane } from './gfx/planes.js';
import { Fx } from './gfx/fx.js';
import { Hangar } from './gfx/hangar.js';
import { ARMS, GUNS, GUN_ORDER, MISSILES, MISSILE_ORDER, PAINTS, PAINT_ORDER, PLANES, PLANE_ORDER, GIFT_PLANES, UPGRADES, UPGRADE_ORDER, TIER_MAX, nextTier, statsOf, tiersOf, levelProgress, planeOpen, planeOwned, cleanCallsign, displayName } from '../shared/planes.js';
import { ARENA, BRIDGE, HEAL, HEALS, groundAt, underBridge } from '../shared/arena.js';
import { flyQ, forward, newBodyQ, drawnQ, Q as QQ } from '../shared/flight.js';
import { DODGE, FLARE, GUN, MISSILE, RESPAWN, aimDir, gunTarget, leadPoint, offNose, pickTarget } from '../shared/combat.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const show = (el, on = true) => (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERR = {
  offline: 'אין חיבור לשרת — בדקו את האינטרנט', bad_name: 'שם בין 2 ל־14 תווים, אותיות ומספרים בלבד', bad_login: 'שם משתמש או סיסמה שגויים',
  username_taken: 'השם הזה כבר תפוס', invalid_username: 'שם משתמש: 3–16 אותיות אנגלית קטנות ומספרים', invalid_password: 'סיסמה: לפחות 4 תווים',
  bad_code: 'כותבים שם#מספר, כמו מאיר#1', no_such_pilot: 'אין טייס כזה — בדקו את השם והמספר', self: 'אי אפשר להוסיף את עצמכם',
  already_friends: 'כבר חברים', friends_full: 'רשימת החברים מלאה',
  no_such_gift: 'אין קוד כזה', gift_used: 'כבר מימשת את הקוד הזה', gift_only: 'המטוס הזה רק בקוד מתנה',
  not_admin: 'רק לאדמין', bad_gold: 'כמות זהב לא תקינה', bad_level: 'רמה בין 1 ל־30', no_such_plane: 'אין מטוס כזה', nothing_to_do: 'לא נבחר שינוי',
  gold: 'אין מספיק זהב', level: 'צריך רמה גבוהה יותר', too_many_requests: 'יותר מדי ניסיונות — חכו רגע', no_pilot: 'קודם בוחרים שם',
};
const err = (e) => ERR[e?.code] || 'משהו השתבש — נסו שוב';

const net = new Net();
const controls = new Controls();
const renderer = makeRenderer($('#game'));
const world = makeWorld(renderer);
const { scene, camera } = world;
const pads = makePads(scene, HEALS, HEAL);
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
S.hangarShows = () => hangar.armKey;
S.renderHangar = () => renderHangar();
// how many weapons stand on the pad (for the tests: none, out of the market)
S.hangarArms = () => hangar.scene.children.filter((c) => c.children[0]?.userData?.model).length;
S.note = (t, c) => toast(t, c);
S.world = world; S.camera = camera; S.buildPlane = buildPlane; S.buildBomber = buildBomber; S.scene = scene;
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
  pickQuality(Q.pick);
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
  S.account = { guest: !!me.guest, username: me.username || '', admin: !!me.admin };
  show('.h-tabs [data-tab="admin"]', S.account.admin);
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
  $('#set-quality').value = Q.pick;
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

let tab = 'planes', viewing = '', paintView = '';
// which sky: everyone for themselves, or blue against red; and an invite, if the link carried one
S.gameMode = (() => { try { return localStorage.getItem('sky.mode') || 'ffa'; } catch { return 'ffa'; } })();
S.invite = new URLSearchParams(location.search).get('room') || '';
const paintMode = () => $$('.h-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.gameMode));
$$('.h-mode button').forEach((b) => b.addEventListener('click', () => {
  S.gameMode = b.dataset.mode;
  try { localStorage.setItem('sky.mode', S.gameMode); } catch {}
  paintMode();
}));
function showHangar() {
  S.mode = 'hangar';
  mView.missiles = mView.guns = ''; // the market opens on what is fitted
  ['#screen-title', '#hud', '#death'].forEach((s) => show(s, false));
  show('#screen-hangar');
  show('#corner', false);
  controls.enabled = false;
  sound.engine(false);
  sound.seeker('off');
  clearPreview();
  viewing = S.pilot.plane;
  paintView = '';
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
  show('#h-invite', !!S.invite);
  paintMode();
  show('#tab-planes', tab === 'planes');
  show('#tab-ups', tab === 'ups');
  show('#tab-board', tab === 'board');
  show('#tab-market', tab === 'market');
  show('#tab-friends', tab === 'friends');
  show('#tab-admin', tab === 'admin');
  // fight mode is chosen with the plane: it only gets in the way of the panels
  show('.h-mode', tab === 'planes');
  if (tab !== 'market') hangar.show(viewing || p.plane, paintView || paintOf(viewing || p.plane), loadOf(viewing || p.plane));
  if (tab === 'planes') renderPlanes();
  if (tab === 'ups') renderUps();
  if (tab === 'board') renderBoard();
  if (tab === 'market') renderMarket();
  if (tab === 'friends') renderFriends();
  if (tab === 'admin') renderAdmin();
  $('#btn-launch').textContent = `המראה · ${PLANES[p.plane].he}`;
}

/** The planes on the table, in order: the ladder, then any gift ones the pilot has. */
const rowOf = (p) => [...PLANE_ORDER, ...GIFT_PLANES.filter((k) => planeOwned(p, k))];

/** The plane on the table: its name, its era, and what can be done with it. */
function renderPlanes() {
  const p = S.pilot, k = viewing || p.plane, d = PLANES[k];
  const own = planeOwned(p, k), open = planeOpen(p, k), sel = p.plane === k;
  const row = rowOf(p);
  $('#hp-era').innerHTML = `${d.gift ? '' : `${PLANE_ORDER.indexOf(k) + 1}/${PLANE_ORDER.length} · `}${esc(d.era)} · ${esc(d.kind)}${d.gift ? ' <span class="ace">מתנה</span>' : d.ace ? ' <span class="ace">עלית</span>' : ''}`;
  $('#hp-name').textContent = d.he;
  $('#hp-name').classList.toggle('ace', !!d.ace);
  $('#hp-role').textContent = d.role;
  $('#hp-dots').innerHTML = row.map((id) => `<i class="${id === k ? 'on' : ''} ${planeOwned(p, id) ? 'own' : ''} ${PLANES[id].gift ? 'gift' : PLANES[id].ace ? 'ace' : ''}"></i>`).join('');
  const act = $('#hp-act');
  act.className = 'h-act';
  act.disabled = false;
  delete act.dataset.pick; delete act.dataset.buy;
  if (sel) { act.textContent = 'בשימוש'; act.classList.add('ok'); act.disabled = true; }
  else if (own) { act.textContent = 'בחר'; act.dataset.pick = k; }
  else if (open) { act.innerHTML = `קנה · <span class="num">${fmt(d.price)}</span>`; act.classList.add('buy'); act.dataset.buy = k; act.disabled = p.gold < d.price; }
  else { act.textContent = `נפתח ברמה ${d.level}`; act.disabled = true; }
  // what this plane carries, as it was left: its own weapons and paint
  const lo = loadOf(k);
  $('#hp-load').innerHTML = own ? `<span>${esc(GUNS[lo.gun]?.he || '')}</span><span>${esc(MISSILES[lo.missile]?.he || '')}</span><span>${esc(PAINTS[paintOf(k)]?.he || '')}</span>` : '';
  // the paint: a row of colours, the one tried on is the one on the table
  const worn = paintOf(k), pv = paintView || worn;
  $('#hp-paints').innerHTML = PAINT_ORDER.map((id) => `<button type="button" class="sw ${id === pv ? 'on' : ''} ${p.paints.includes(id) ? 'own' : ''}" data-paint="${id}" style="--c:${PAINTS[id].swatch}" aria-label="${PAINTS[id].he}"></button>`).join('');
  const pa = $('#hp-paint-act'), P = PAINTS[pv];
  pa.className = 'h-act small';
  pa.disabled = false;
  delete pa.dataset.wear; delete pa.dataset.buy;
  if (pv === worn) { pa.textContent = `צבע: ${P.he}`; pa.disabled = true; }
  else if (!own) { pa.textContent = `צבע ${P.he} · ניסיון`; pa.disabled = true; }
  else if (p.paints.includes(pv)) { pa.textContent = `צבע ${P.he} · החל`; pa.dataset.wear = pv; }
  else { pa.innerHTML = `צבע ${P.he} · <span class="num">${fmt(P.price)}</span>`; pa.classList.add('buy'); pa.dataset.buy = pv; pa.disabled = p.gold < P.price; }
}
$('#hp-paints').addEventListener('click', (e) => {
  const id = e.target.closest('[data-paint]')?.dataset.paint;
  if (!id) return;
  paintView = id;
  hangar.show(viewing || S.pilot.plane, id, loadOf(viewing || S.pilot.plane));
  renderPlanes();
});
$('#hp-paint-act').addEventListener('click', async (e) => {
  const b = e.currentTarget, wear = b.dataset.wear, buy = b.dataset.buy;
  if (!wear && !buy) return;
  try {
    const r = await net.api(buy ? '/api/pilot/buy-paint' : '/api/pilot/paint', { paint: wear || buy, plane: viewing || S.pilot.plane });
    S.pilot = r.pilot;
    paintView = '';
    if (buy) sound.coin(), toast(`צבע ${PAINTS[buy].he} שלך`);
    renderHangar();
  } catch (x) { toast(err(x), 'bad'); }
});

// a gift code: typed in, and whatever it gives is on the table at once
$('#gift-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#gift-code').value.trim();
  if (!code) return;
  try {
    const r = await net.api('/api/pilot/gift', { code });
    S.pilot = r.pilot;
    $('#gift-code').value = '';
    sound.coin();
    toast(`מתנה! ${r.gift.he}`, 'lvl');
    if (r.gift.plane) viewing = r.gift.plane;
    renderHangar();
  } catch (x) { toast(err(x), 'bad'); }
});

const step = (dir) => {
  const row = rowOf(S.pilot), i = row.indexOf(viewing || S.pilot.plane);
  viewing = row[(i + dir + row.length) % row.length];
  paintView = '';
  hangar.show(viewing, paintOf(viewing), loadOf(viewing));
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
    paintView = '';
    if (buy) sound.coin(), toast(`${PLANES[buy].he} בהאנגר שלך`);
    renderHangar();
  } catch (x) { toast(err(x), 'bad'); }
});

/** What an upgrade does, in the numbers a pilot reads: now, and after the next tier. */
const KMH = (v) => Math.round(v * 3.6 * 4);
/**
 * A plane's numbers as a pilot reads them, each with how to show it and
 * which way is better: speed in km/h, turn in degrees a second, a reload in
 * seconds (less is better), ranges in metres.
 */
const STAT = {
  speed: { he: 'מהירות', val: (st) => KMH(st.speed), unit: 'קמ"ש' },
  turn: { he: 'פנייה', val: (st) => Math.round((st.turn * 180) / Math.PI), unit: '°/ש׳' },
  boost: { he: 'מבער', val: (st) => KMH(st.boost), unit: 'קמ"ש' },
  refill: { he: 'מילוי מבער', val: (st) => +(1 / st.fill).toFixed(1), unit: 'ש׳', less: true },
  dps: { he: 'נזק לשנייה', val: (st) => Math.round(st.rate * st.dmg) },
  gunRange: { he: 'טווח ירי', val: (st) => st.gunRange, unit: "מ'" },
  hp: { he: 'חיים', val: (st) => st.hp },
  reload: { he: 'טעינת טיל', val: (st) => +st.reload.toFixed(1), unit: 'ש׳', less: true },
  mRange: { he: 'טווח נעילה', val: (st) => st.mRange, unit: "מ'" },
  missiles: { he: 'טילים', val: (st) => st.missiles },
  flareReload: { he: 'טעינת נור', val: (st) => +st.flareReload.toFixed(1), unit: 'ש׳', less: true },
  flares: { he: 'נורים', val: (st) => st.flares },
  rate: { he: 'קצב אש', val: (st) => +st.rate.toFixed(1), unit: 'לש׳' },
  mDmg: { he: 'נזק · מהחיים', val: (st) => Math.round((st.mDmg / MISSILE.ref) * 100), unit: '%' },
  mSpeed: { he: 'מהירות טיל', val: (st) => KMH(st.mSpeed), unit: 'קמ"ש' },
  assist: { he: 'עזרת כיוון', val: (st) => +((st.gunAssist * 180) / Math.PI).toFixed(1), unit: '°' },
  ccm: { he: 'עמידות לנורים', val: (st) => Math.round(st.mCcm * 100), unit: '%' },
};
/** What each upgrade moves, in that order: the first is the one its card names. */
const UP_STATS = {
  engine: ['speed', 'turn', 'boost'],
  weapons: ['dps', 'gunRange', 'reload'],
  armor: ['hp', 'flareReload'],
};
/** In a word or two, what a tier of each upgrade gives. */
const UP_GIVES = { engine: 'מהיר וחד יותר', weapons: 'יורה חזק ורחוק יותר', armor: 'שורד יותר פגיעות' };
/** An icon for each upgrade, drawn in the line of the tabs. */
const UP_ICON = {
  engine: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  weapons: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  armor: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
};
/** The bars over the cards: the plane's numbers, each against the best anyone can have. */
const BARS = ['speed', 'turn', 'dps', 'gunRange', 'hp'];
const BAR_MAX = (() => {
  const top = { engine: TIER_MAX, weapons: TIER_MAX, armor: TIER_MAX };
  const all = PLANE_ORDER.map((k) => statsOf(k, top, { gun: GUN_ORDER.at(-1), missile: MISSILE_ORDER.at(-1) }));
  return Object.fromEntries(BARS.map((key) => [key, Math.max(...all.map((st) => STAT[key].val(st)))]));
})();
/** The card picked on the upgrades tab: its next tier is what the bars preview. */
let upPick = '';

/**
 * One number, and what it becomes: "806 ← 870 קמ"ש", the new number green
 * when better (red when worse). Unchanged, just the number.
 */
function delta(key, now, next) {
  const S_ = STAT[key], a = S_.val(now), b = next ? S_.val(next) : a, unit = S_.unit ? ` <u>${S_.unit}</u>` : '';
  if (a === b) return `<span class="dl"><span>${S_.he}</span><b>${a}${unit}</b></span>`;
  const good = S_.less ? b < a : b > a;
  return `<span class="dl"><span>${S_.he}</span><b class="was">${a}</b><i>←</i><b class="${good ? 'up' : 'dn'}">${b}${unit}</b></span>`;
}

/**
 * The upgrades of the plane on the table, each plane upgraded on its own:
 * its numbers as bars, and three cards under them. Pick a card and the bars
 * show in green what its next tier adds; the gold button buys it.
 */
function renderUps() {
  const p = S.pilot, k0 = viewing || p.plane, d = PLANES[k0];
  if (!planeOwned(p, k0)) {
    $('#tab-ups').innerHTML = `<div class="up-head"><b>${d.he}</b></div><div class="note">קנו את ה${d.he} כדי לשדרג אותו — או בחרו מטוס שלכם בלשונית המטוסים.</div>`;
    return;
  }
  const tiers = tiersOf(p, k0), now = statsOf(k0, tiers, loadOf(k0));
  if (!UPGRADES[upPick]) upPick = UPGRADE_ORDER.find((k) => nextTier(p, k, k0)) || UPGRADE_ORDER[0];
  const n = nextTier(p, upPick, k0), after = n ? statsOf(k0, { ...tiers, [upPick]: n.tier }, loadOf(k0)) : null;
  const bars = BARS.map((key) => {
    const S_ = STAT[key], a = S_.val(now), b = after ? S_.val(after) : a, max = BAR_MAX[key];
    const pa = Math.min(100, (a / max) * 100), pb = Math.min(100, (b / max) * 100);
    return `<div class="bar ${b !== a ? 'gain' : ''}"><span class="k">${key === 'dps' ? 'כוח אש' : S_.he}</span><span class="track"><i class="now" style="width:${pa}%"></i><i class="next" style="right:${pa}%;width:${Math.max(0, pb - pa)}%"></i></span>`
      + `<span class="v"><b>${a}</b>${b !== a ? `<em>+${b - a}</em>` : ''}</span></div>`;
  }).join('');
  const cards = UPGRADE_ORDER.map((k) => {
    const u = UPGRADES[k], have = tiers[k] || 0, nt = nextTier(p, k, k0);
    const pips = Array.from({ length: TIER_MAX }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
    const btn = !nt ? '<button class="buy" disabled>מקסימום</button>'
      : p.level < nt.level ? `<button class="buy" disabled>נפתח ברמה ${nt.level}</button>`
        : `<button class="buy" data-up="${k}" ${p.gold < nt.cost ? 'disabled' : ''}><span class="num">${fmt(nt.cost)}</span><span class="coin"></span></button>`;
    return `<div class="ucard ${k === upPick ? 'on' : ''} ${!nt ? 'full' : ''}" data-pick="${k}"><span class="up-ic">${UP_ICON[k]}</span><b>${u.he}</b><small>${UP_GIVES[k]}</small><div class="pips">${pips}</div>${btn}</div>`;
  }).join('');
  const u = UPGRADES[upPick];
  $('#tab-ups').innerHTML = `<div class="up-head"><b>${d.he}</b><small>${n ? `${u.he} · דרגה ${n.tier} מוסיפה את הירוק` : `${u.he} בדרגה המלאה`}</small></div>`
    + `<div class="bars">${bars}</div><div class="ucards">${cards}</div><div class="note">${u.desc}</div>`;
}

$('#tab-ups').addEventListener('click', async (e) => {
  const k = e.target.closest('[data-up]')?.dataset.up;
  const pick = e.target.closest('[data-pick]')?.dataset.pick;
  if (pick && pick !== upPick) { upPick = pick; renderUps(); if (!k) return; }
  if (!k) return;
  try {
    const plane = viewing || S.pilot.plane;
    const r = await net.api('/api/pilot/upgrade', { upgrade: k, plane });
    S.pilot = r.pilot;
    sound.coin();
    toast(`${PLANES[plane].he} · ${UPGRADES[k].he} · דרגה ${r.tier}`);
    renderHangar();
  } catch (x) { toast(err(x), 'bad'); }
});

// ---- the market ------------------------------------------------------------------
// Guns and missiles, one at a time on a card like the planes': a name, what
// it does on the plane flown beside what is fitted now, and the weapon
// itself big on the pad. Bought once with gold (opened by level), then put
// on any plane: each plane keeps its own load.
let shelf = 'missiles';
const mView = { missiles: '', guns: '' };
const loadOf = (plane) => S.pilot?.loadout?.[plane] || { gun: 'g1', missile: 'm1' };
/** The paint a plane wears (each its own; one never painted wears what the pilot had on). */
function paintOf(plane) { return S.pilot?.paintOf?.[plane] || S.pilot?.paint || 'stock'; }
// the market's card starts on what the plane flown carries: a new plane, a fresh look
let mPlane = '';
const SPEC_MAX = {
  missiles: { range: Math.max(...MISSILE_ORDER.map((k) => MISSILES[k].range)), dmg: Math.max(...MISSILE_ORDER.map((k) => MISSILES[k].dmg)), speed: Math.max(...MISSILE_ORDER.map((k) => MISSILES[k].speed)) },
  guns: { range: Math.max(...GUN_ORDER.map((k) => GUNS[k].range)) },
};
function renderMarket() {
  const p = S.pilot, plane = p.plane, order = shelf === 'guns' ? GUN_ORDER : MISSILE_ORDER, items = ARMS[shelf];
  if (mPlane !== plane) mPlane = plane, mView.missiles = mView.guns = '';
  const on = loadOf(plane)[shelf === 'guns' ? 'gun' : 'missile'];
  const k = (mView[shelf] ||= on), w = items[k], own = p.arms[shelf].includes(k);
  $$('.shelves button').forEach((b) => b.classList.toggle('on', b.dataset.shelf === shelf));
  $('#hm-era').textContent = `${shelf === 'guns' ? 'מכונת ירייה' : 'טיל'} · רמה ${w.level}`;
  $('#hm-name').textContent = w.he;
  $('#hm-role').textContent = w.desc;
  // what it does on the plane flown (its upgrades on), beside what is fitted now
  const t = tiersOf(p, plane), fitted = loadOf(plane);
  const was = statsOf(plane, t, fitted), will = statsOf(plane, t, { ...fitted, [shelf === 'guns' ? 'gun' : 'missile']: k });
  const keys = shelf === 'guns' ? ['gunRange', 'dps', 'assist'] : ['mRange', 'mDmg', 'ccm'];
  $('#hm-specs').innerHTML = keys.map((key) => delta(key, was, will)).join('')
    + (k === on ? '' : `<small class="vs">לעומת ה${ARMS[shelf][on].he} שמותקן עכשיו</small>`);
  $('#hm-dots').innerHTML = order.map((id) => `<i class="${id === k ? 'on' : ''} ${p.arms[shelf].includes(id) ? 'own' : ''}"></i>`).join('');
  const act = $('#hm-act');
  act.className = 'h-act';
  act.disabled = false;
  delete act.dataset.equip; delete act.dataset.buy;
  if (k === on) { act.textContent = `מותקן על ה${PLANES[plane].he}`; act.classList.add('ok'); act.disabled = true; }
  else if (own) { act.textContent = 'הלבש על המטוס'; act.dataset.equip = k; }
  else if (p.level >= w.level) { act.innerHTML = `קנה והלבש · <span class="num">${fmt(w.price)}</span>`; act.classList.add('buy'); act.dataset.buy = k; act.disabled = p.gold < w.price; }
  else { act.textContent = `נפתח ברמה ${w.level}`; act.disabled = true; }
  hangar.showArm(shelf, k);
}
$$('.shelves button').forEach((b) => b.addEventListener('click', () => { shelf = b.dataset.shelf; renderMarket(); }));
const mStep = (dir) => {
  const order = shelf === 'guns' ? GUN_ORDER : MISSILE_ORDER, i = order.indexOf(mView[shelf]);
  mView[shelf] = order[(i + dir + order.length) % order.length];
  sound.tick?.();
  renderMarket();
};
$('#hm-prev').addEventListener('click', () => mStep(-1));
$('#hm-next').addEventListener('click', () => mStep(1));
$('#hm-act').addEventListener('click', async (e) => {
  const b = e.currentTarget, buy = b.dataset.buy, equip = b.dataset.equip;
  if (!buy && !equip) return;
  try {
    const r = await net.api(buy ? '/api/pilot/buy-arm' : '/api/pilot/arm', { kind: shelf, id: buy || equip, plane: S.pilot.plane });
    S.pilot = r.pilot;
    if (buy) sound.coin();
    toast(`${ARMS[shelf][buy || equip].he} הותקן על ה${PLANES[S.pilot.plane].he}`);
    renderHangar();
  } catch (x) { toast(err(x), 'bad'); }
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

// ---- friends ------------------------------------------------------------------
// ---- the admin's desk --------------------------------------------------------
// Only for the codes the server names as admins: look a pilot up (or pick
// one from the list), then set or add gold, give planes, set the level.
let adminCode = '';
async function renderAdmin() {
  if (!S.account.admin) return;
  const list = $('#ad-list');
  try {
    const { rows } = await net.api('/api/admin/pilots');
    list.innerHTML = '<div class="ad-sub">שחקנים</div>' + rows.map((r) => `<button type="button" class="f-row ad-pick" data-code="${esc(r.code)}"><div class="t"><b dir="auto">${esc(r.code)}</b><small>רמה ${r.level} · ${r.kills} הפלות · ${esc(PLANES[r.plane]?.he || '')}</small></div></button>`).join('');
  } catch (x) { list.innerHTML = `<div class="note">${err(x)}</div>`; }
  if (!adminCode && S.pilot.tag) adminCode = `${S.pilot.name}#${S.pilot.tag}`;
  if (adminCode) adminLoad(adminCode);
}
async function adminLoad(code) {
  adminCode = code;
  $('#ad-code').value = code;
  const card = $('#ad-card');
  try {
    const { pilot: a } = await net.api(`/api/admin/pilot?code=${encodeURIComponent(code)}`);
    paintAdmin(a);
  } catch (x) { card.innerHTML = `<div class="note">${err(x)}</div>`; }
}
function paintAdmin(a) {
  const missing = [...PLANE_ORDER, ...GIFT_PLANES].filter((k) => !a.planes.includes(k));
  $('#ad-card').innerHTML = `<div class="ad-card">
    <div class="ad-who"><b dir="auto">${esc(a.code)}</b><span>רמה ${a.level} · <span class="num">${fmt(a.gold)}</span> זהב · ${a.planes.length}/${PLANE_ORDER.length} מטוסים</span></div>
    <div class="ad-row"><span class="k">זהב</span><input id="ad-gold" type="number" inputmode="numeric" min="0" placeholder="${a.gold}">
      <button type="button" data-ad="set-gold">קבע</button><button type="button" data-ad="add-gold">הוסף</button></div>
    <div class="ad-row ad-quick">${[1000, 10000, 100000].map((g) => `<button type="button" data-add="${g}">+${fmt(g)}</button>`).join('')}<button type="button" data-add="-${a.gold}">אפס</button></div>
    <div class="ad-row"><span class="k">מטוס</span><select id="ad-plane">${missing.map((k) => `<option value="${k}">${esc(PLANES[k].he)} · רמה ${PLANES[k].level}</option>`).join('') || '<option value="">יש לו את כולם</option>'}</select>
      <button type="button" data-ad="plane" ${missing.length ? '' : 'disabled'}>תן</button><button type="button" data-ad="all" ${missing.length ? '' : 'disabled'}>תן הכול</button></div>
    <div class="ad-row"><span class="k">רמה</span><input id="ad-level" type="number" inputmode="numeric" min="1" max="30" placeholder="${a.level}"><button type="button" data-ad="level">קבע רמה</button></div>
  </div>`;
}
async function adminEdit(body) {
  try {
    const { pilot: a } = await net.api('/api/admin/edit', { code: adminCode, ...body });
    paintAdmin(a);
    sound.coin();
    toast(`${a.code} · עודכן`);
    // my own record changed: the hangar shows it now
    if (S.pilot.tag && a.code === `${S.pilot.name}#${S.pilot.tag}`) took(await net.api('/api/me')), renderHangar();
  } catch (x) { toast(err(x), 'bad'); }
}
$('#ad-find').addEventListener('submit', (e) => { e.preventDefault(); const c = $('#ad-code').value.trim(); c && adminLoad(c); });
$('#ad-list').addEventListener('click', (e) => { const c = e.target.closest('[data-code]')?.dataset.code; c && adminLoad(c); });
$('#ad-card').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]')?.dataset.add;
  if (add) return adminEdit({ addGold: Number(add) });
  const op = e.target.closest('[data-ad]')?.dataset.ad;
  const gold = Number($('#ad-gold')?.value);
  if (op === 'set-gold' && $('#ad-gold').value !== '') adminEdit({ gold });
  if (op === 'add-gold' && $('#ad-gold').value !== '') adminEdit({ addGold: gold });
  if (op === 'plane' && $('#ad-plane').value) adminEdit({ plane: $('#ad-plane').value });
  if (op === 'all') adminEdit({ plane: 'all' });
  if (op === 'level' && $('#ad-level').value !== '') adminEdit({ level: Number($('#ad-level').value) });
});

// Who is flying now, and a button that puts you in the same sky as them.
const MODE_HE = { ffa: 'כולם נגד כולם', teams: 'קבוצות' };
let friendsT = 0;
async function renderFriends(quiet = false) {
  clearTimeout(friendsT);
  const list = $('#f-list');
  if (!quiet) list.innerHTML = '<div class="note">טוען…</div>';
  try {
    const { me, rows } = await net.api('/api/friends');
    $('#f-me').innerHTML = me
      ? `<span>הקוד שלך <b dir="auto">${esc(me)}</b></span><button type="button" id="f-copy">העתק</button>`
      : '<span>שמרו את ההתקדמות כדי לקבל קוד משלכם — כך חברים יוכלו להוסיף אתכם</span>';
    list.innerHTML = rows.map((r) => `<div class="f-row ${r.state}">
        <i class="dot"></i>
        <div class="t"><b dir="auto">${esc(r.code)}</b><small>רמה ${r.level} · ${r.state === 'air' ? `בקרב · ${MODE_HE[r.mode] || ''}` : r.state === 'hangar' ? 'בהאנגר' : 'לא מחובר'}</small></div>
        ${r.state === 'air' ? `<button class="join" type="button" data-room="${esc(r.room)}" data-mode="${esc(r.mode)}" data-code="${esc(r.code)}">הצטרף</button>` : ''}
        <button class="rm" type="button" data-rm="${esc(r.code)}" aria-label="הסר">×</button>
      </div>`).join('') || '<div class="note">עוד אין חברים. הוסיפו חבר לפי השם והמספר שלו — ותוכלו להצטרף אליו לקרב בלחיצה.</div>';
  } catch (x) { if (!quiet) list.innerHTML = `<div class="note">${err(x)}</div>`; }
  // while the list is open, it keeps up with who takes off and lands
  if (S.mode === 'hangar' && tab === 'friends') friendsT = setTimeout(() => S.mode === 'hangar' && tab === 'friends' && renderFriends(true), 6000);
}
$('#f-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#f-code').value.trim();
  if (!code) return;
  try {
    const r = await net.api('/api/friends/add', { code });
    $('#f-code').value = '';
    toast(`${r.friend.code} נוסף לחברים`);
    renderFriends(true);
  } catch (x) { toast(err(x), 'bad'); }
});
$('#tab-friends').addEventListener('click', async (e) => {
  if (e.target.id === 'f-copy') {
    const code = $('#f-me b')?.textContent || '';
    try { await navigator.clipboard.writeText(code); toast('הקוד הועתק'); } catch { prompt('הקוד שלך:', code); }
    return;
  }
  const j = e.target.closest('.join');
  if (j) {
    // straight into their room (or, if it has filled up, the same kind of sky)
    S.gameMode = j.dataset.mode === 'teams' ? 'teams' : 'ffa';
    S.invite = j.dataset.room;
    sound.unlock();
    toast(`מצטרפים ל־${j.dataset.code}`);
    return launch();
  }
  const rm = e.target.closest('[data-rm]');
  if (rm && confirm(`להסיר את ${rm.dataset.rm} מהחברים?`)) {
    try { await net.api('/api/friends/remove', { code: rm.dataset.rm }); renderFriends(true); } catch (x) { toast(err(x), 'bad'); }
  }
});

$('#btn-save').addEventListener('click', () => openLogin('register'));
$('#btn-launch').addEventListener('click', () => { sound.unlock(); launch(); });

// ---- into the air -----------------------------------------------------------

async function launch() {
  const btn = $('#btn-launch');
  btn.disabled = true;
  btn.textContent = 'ממריא…';
  try {
    const room = await net.join(S.gameMode, S.invite);
    if (S.invite) S.invite = '', history.replaceState(null, '', location.pathname), show('#h-invite', false);
    S.room = room;
    S.leaving = false;
    S.others.clear(); S.roster.clear(); S.missiles = [];
    hook(room);
    room.send('hello');
    S.mode = 'air';
    hangar.clear();
    clearPreview();
    ['#screen-hangar', '#screen-title', '#death'].forEach((s) => show(s, false));
    show('#hud');
    show('#touch', controls.touch);
    show('#keys-help', !controls.touch);
    controls.enabled = true;
    $('#feed').innerHTML = '';
  } catch (x) {
    toast(err(x), 'bad');
  } finally { btn.disabled = false; renderHangar(); }
}

function hook(room) {
  room.onMessage('welcome', (m) => {
    S.myKey = m.key;
    S.teams = m.mode === 'teams'; S.myTeam = m.team || ''; S.roomId = m.room || room.roomId;
    paintTeams(m.score);
    (m.pads || []).forEach((t, i) => pads.spend(i, t));
    S.pilot = m.pilot;
    sound.setPlane(S.pilot.plane);
    for (const r of m.roster) S.roster.set(r.key, r);
    const mesh = buildPlane(S.pilot.plane, S.pilot.paint, { gun: m.stats.gun, missile: m.stats.missile });
    scene.add(mesh);
    S.me = { stats: m.stats, alive: false, hp: m.stats.hp, ammo: m.stats.missiles, shieldUntil: 0, gunT: 0, gun: 0, mesh, body: null, reloadT: 0 };
    $('#hud-name').textContent = displayName(S.pilot);
    paintScore();
  });
  room.onMessage('spawn', (m) => {
    const me = S.me;
    if (!me) return;
    me.body = newBodyQ(m, me.stats);
    S.camUp = new Vector3(0, 1, 0);
    me.alive = true; me.hp = m.hp; me.ammo = m.ammo; me.reloadT = 0; me.crashed = false; me.flares = m.flares ?? me.stats.flares; me.flareT = 0;
    me.shieldUntil = performance.now() + m.shield * 1000;
    coach();
    me.mesh.visible = true;
    // the camera starts behind, not wherever the last life ended
    const f = forward(me.body.yaw, 0);
    camera.position.set(me.body.x - f.x * 22, me.body.y + 7, me.body.z - f.z * 22);
    show('#death', false);
    show('#hud');
  });
  room.onMessage('fix', (m) => { if (S.me?.body) Object.assign(S.me.body, m), (S.me.body.q = QQ.euler(m.yaw, m.pitch, 0)); });
  room.onMessage('s', onSnapshot);
  room.onMessage('score', (sc) => paintTeams(sc));
  room.onMessage('royal', (m) => {
    $('#royal')?.remove();
    const el = document.createElement('div');
    el.id = 'royal';
    el.innerHTML = `<b>${esc(m.text)}</b><small dir="auto">${esc(m.name)}</small>`;
    document.body.appendChild(el);
    sound.coin();
    setTimeout(() => el.remove(), 4600);
  });
  room.onMessage('friendIn', (m) => toast(`${m.name} הצטרף אליך`, 'lvl'));
  room.onMessage('roster', (list) => {
    S.roster = new Map(list.map((r) => [r.key, r]));
    paintScore();
  });
  room.onMessage('hit', (m) => {
    S.hitFlash = 0.12;
    sound.hit();
    const o = m.v === 'boss' ? S.boss : S.others.get(m.v);
    o && fx.spark(o.mesh.position);
    // its health as the room has it now, not a snapshot later: the bar drops as the rounds land
    if (o && m.hp != null && m.v !== 'boss') o.hp = m.hp, o.hitAt = performance.now();
  });
  room.onMessage('hurt', (m) => {
    if (!S.me) return;
    S.me.hp = m.hp;
    const big = m.how === 'missile' || m.how === 'collision';
    S.shake = Math.min(1, S.shake + (big ? 0.9 : 0.25));
    $('#vig').style.opacity = big ? 1 : 0.6;
    setTimeout(() => ($('#vig').style.opacity = 0), 160);
    sound.hurt();
    hitFrom(m.by);
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
  // a repair pad: one is spent (by anyone), and it was me who flew through
  room.onMessage('pad', (m) => pads.spend(m.i, m.s));
  room.onMessage('healed', (m) => {
    if (S.me) S.me.hp = m.hp, S.me.ammo = m.ammo ?? S.me.ammo, S.me.flares = m.flares ?? S.me.flares, S.me.reloadT = 0;
    toast(m.gain > 0 ? `תיקון ותחמושת מלאה · +${m.gain} חיים` : 'תחמושת מלאה', 'lvl');
    sound.coin();
    $('#heal-flash').classList.remove('on'); void $('#heal-flash').offsetWidth; $('#heal-flash').classList.add('on');
  });
  room.onMessage('incoming', () => { S.warnUntil = performance.now() + 3500; sound.warn(); });
  // out-flown: it goes on past, blind
  room.onMessage('dodged', () => { S.warnUntil = 0; toast('התחמקת מהטיל!', 'lvl'); sound.whoosh(); });
  room.onMessage('missed', () => toast('הטיל שלך הוטעה בתמרון'));
  // two planes met: sparks, a burst, and a jolt if one of them was us
  room.onMessage('ram', (m) => {
    const p = new Vector3(m.at[0] / 10, m.at[1] / 10, m.at[2] / 10);
    fx.pop(p, 1.2);
    for (let i = 0; i < 6; i++) fx.spark(p.clone().add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6)));
    sound.boom(near(p) * 0.7);
    if (m.a === S.myKey || m.b === S.myKey) toast('התנגשות', 'bad');
  });
  // the bomber: it comes, its gunners fire, it goes down (or away)
  room.onMessage('bossStart', () => { toast('מפציץ מעל העיר — הפילו אותו יחד', 'lvl'); sound.warn(); });
  room.onMessage('bt', (a) => {
    MZ.set(a[0] / 10, a[1] / 10, a[2] / 10);
    DIR.set(a[3] / 1000, a[4] / 1000, a[5] / 1000);
    fx.tracer(MZ, DIR, GUN.speed);
  });
  room.onMessage('bossDown', (m) => {
    const p = new Vector3(m.at[0] / 10, m.at[1] / 10, m.at[2] / 10);
    fx.explode(p, 3); fx.explode(p.clone().add(new Vector3(12, 0, 0)), 2); fx.explode(p.clone().add(new Vector3(-12, 0, 0)), 2);
    sound.boom(1);
    const top = m.top?.[0];
    feed(`<span class="w">המפציץ הופל</span>${top ? ` ${esc(top.name)} · ${top.pct}%` : ''}`, m.top?.some((r) => r.key === S.myKey));
    clearBoss();
  });
  room.onMessage('bossGone', () => { toast('המפציץ ברח'); clearBoss(); });
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
    const [key, x, y, z, yaw, pitch, roll, hp, flags, spd, qx, qy, qz, qw] = a;
    seen.add(key);
    if (key === S.myKey) {
      if (S.me) S.me.serverHp = hp;
      continue;
    }
    let o = S.others.get(key);
    const r = S.roster.get(key);
    if (!o) {
      o = { key, kind: r?.plane || 'sparrow', paint: r?.paint || 'stock', mesh: buildPlane(r?.plane || 'sparrow', r?.paint, { gun: r?.gun, missile: r?.missile }), buf: [], fireT: 0, gun: 0, smokeT: 0, tag: null };
      scene.add(o.mesh);
      S.others.set(key, o);
    }
    if (r && (r.plane !== o.kind || (r.paint || 'stock') !== o.paint)) {
      // a different plane under the same key (it changed in the hangar)
      scene.remove(o.mesh); o.mesh = buildPlane(r.plane, r.paint, { gun: r.gun, missile: r.missile }); o.kind = r.plane; o.paint = r.paint || 'stock'; scene.add(o.mesh);
    }
    // the attitude as a quaternion when the room sends one (any way up), else from the angles
    const qa = qw !== undefined ? new Quaternion(qx / 1000, qy / 1000, qz / 1000, qw / 1000).normalize() : new Quaternion().setFromEuler(new Euler(pitch / 1000, yaw / 1000, roll / 1000, 'YXZ'));
    o.buf.push({ t: now, x: x / 10, y: y / 10, z: z / 10, q: qa, speed: spd / 10 });
    if (o.buf.length > 8) o.buf.shift();
    o.hp = hp; o.alive = !!(flags & 1); o.firing = !!(flags & 2); o.boost = !!(flags & 4); o.shield = !!(flags & 8);
  }
  for (const [k, o] of S.others) if (!seen.has(k)) { scene.remove(o.mesh); o.tag?.remove(); S.others.delete(k); }
  S.missiles = s.m.map(([id, x, y, z, yaw, pitch, target, speed]) => ({ id, x: x / 10, y: y / 10, z: z / 10, yaw: yaw / 1000, pitch: pitch / 1000, target, speed }));
  S.mAt = performance.now();
  bossSnap(s.b, now);
  if (S.missiles.some((m) => m.target === S.myKey)) S.warnUntil = Math.max(S.warnUntil, now + 300);
}

/** The bomber on screen: built when it first appears, moved between snapshots. */
function bossSnap(b, now) {
  if (!b) { if (S.boss) clearBoss(); return; }
  if (!S.boss) {
    const mesh = buildBomber();
    scene.add(mesh);
    S.boss = { key: 'boss', alive: true, mesh, x: b[0] / 10, y: b[1] / 10, z: b[2] / 10, yaw: b[3] / 1000, pitch: 0, vel: { x: 0, y: 0, z: 0 }, to: null };
    mesh.position.set(S.boss.x, S.boss.y, S.boss.z);
  }
  const B = S.boss, nx = b[0] / 10, ny = b[1] / 10, nz = b[2] / 10;
  if (B.at) B.vel = { x: (nx - B.tx) / ((now - B.at) / 1000 || 1), y: (ny - B.ty) / ((now - B.at) / 1000 || 1), z: (nz - B.tz) / ((now - B.at) / 1000 || 1) };
  B.tx = nx; B.ty = ny; B.tz = nz; B.tyaw = b[3] / 1000; B.at = now;
  B.hp = b[4] / 10; B.left = b[5];
}
function clearBoss() {
  if (!S.boss) return;
  scene.remove(S.boss.mesh);
  S.boss = null;
  show('#bossbar', false);
}
/** Per frame: glide toward the latest snapshot, props turning; and its bar. */
function tickBoss(dt, time) {
  const B = S.boss;
  if (!B) return;
  const k = Math.min(1, dt * 6);
  B.x += (B.tx - B.x) * k; B.y += (B.ty - B.y) * k; B.z += (B.tz - B.z) * k;
  B.yaw += Math.atan2(Math.sin(B.tyaw - B.yaw), Math.cos(B.tyaw - B.yaw)) * k;
  B.mesh.position.set(B.x, B.y, B.z);
  B.mesh.rotation.set(0, B.yaw, Math.sin(time * 0.4) * 0.03, 'YXZ');
  animatePlane(B.mesh, dt, { speed: 40, time });
  if (B.hp < 35) smoke(B, dt, B.mesh.position);
  show('#bossbar');
  $('#bb-hp').style.width = `${B.hp}%`;
  $('#bb-left').textContent = `${Math.floor(B.left / 60)}:${String(B.left % 60).padStart(2, '0')}`;
}
/** What my guns and missiles may go for: foes, and the bomber. */
const aimables = () => (S.boss ? [...foes(), S.boss] : foes());

function nameOf(key) { return key === 'boss' ? 'המפציץ' : S.roster.get(key)?.name || '?'; }

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
    S.killcam = m.k && S.others.has(m.k) ? { key: m.k, until: performance.now() + 2600 } : null;
    sound.engine(false);
    sound.seeker('off');
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
  toast(m.boss ? `המפציץ · ${m.share}% מהנזק  +${m.xp} XP  +${m.gold} זהב` : `${m.assist ? 'סיוע' : 'הפלה'}  +${m.xp} XP  +${m.gold} זהב`);
  if (m.boss && m.top) setTimeout(() => toast('הכי הרבה נזק למפציץ', 'lvl'), 900);
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
  // nothing more goes out on a socket that is closing; the room is told we
  // are going, but nobody waits for it to answer
  const room = S.room;
  S.room = null;
  S.mode = 'leaving';
  controls.enabled = false;
  room?.leave().catch(() => {});
  if (S.me) scene.remove(S.me.mesh);
  S.me = null;
  for (const o of S.others.values()) scene.remove(o.mesh), o.tag?.remove();
  S.others.clear();
  clearBoss();
  fx.syncMissiles([], 0);
  for (const t of tagEls) t.d.style.display = 'none';
  // the hangar at once, with what we know; the pilot as the server has them
  // (the pay is in) fills in a moment later
  showHangar();
  why && toast(why);
  try { took(await net.api('/api/me')); if (S.mode === 'hangar') renderHangar(); } catch {}
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
  if (S.mode === 'air') air(dt, time), watchFrames(t);
  else if (S.mode !== 'look') showcase(time, dt, wide); // 'look': a tool holds the camera
  fx.syncMissiles(S.missiles, dt, Math.min(0.3, (performance.now() - (S.mAt || 0)) / 1000));
  fx.tick(dt, camera);
  world.tick(time, dt);
  pads.tick(dt, time);
  renderer.render(scene, camera);
}

function air(dt, time) {
  tickBoss(dt, time);
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
    o.mesh.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
    o.mesh.quaternion.slerpQuaternions(a.q, c.q, Math.min(1, k));
    o.mesh.visible = o.alive;
    o.x = o.mesh.position.x; o.y = o.mesh.position.y; o.z = o.mesh.position.z;
    const fv = tmpV.set(0, 0, -1).applyQuaternion(o.mesh.quaternion);
    o.yaw = Math.atan2(-fv.x, -fv.z); o.pitch = Math.asin(MathUtils.clamp(fv.y, -1, 1)); o.speed = c.speed;
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
    const res = me.crashed ? '' : flyQ(me.body, input, me.stats, dt);
    const b = me.body;
    me.mesh.position.set(b.x, b.y, b.z);
    const dq = drawnQ(b);
    me.mesh.quaternion.set(dq.x, dq.y, dq.z, dq.w);
    me.mesh.visible = now > me.shieldUntil || Math.floor(time * 8) % 2 === 0;
    animatePlane(me.mesh, dt, { boost: b.boosting, speed: b.speed, time, ammo: me.ammo, ammoMax: me.stats.missiles });
    $('#btn-brake').classList.toggle('on', !!b.braking);
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
      S.room?.send('pose', [r2(b.x), r2(b.y), r2(b.z), r3(b.yaw), r3(b.pitch), r3(b.roll), r2(b.speed), (input.fire ? 1 : 0) | (b.boosting ? 2 : 0), r3(dq.x), r3(dq.y), r3(dq.z), r3(dq.w)]);
      // stopped against something: say so with every pose until the room calls
      // it (its own check wants the plane inside the thing, and one stopped on
      // a roof sits a metre above it)
      if (me.crashed) S.room?.send('crash');
    }
    sound.engine(true, b.speed, b.boosting);
    chase(b, dt, input);
  } else if (me) {
    // down: first the one who did it — the camera rides beside them for a
    // couple of seconds — then back to watch the wreck burn
    const k = S.killcam && now < S.killcam.until ? S.others.get(S.killcam.key) : null;
    if (k && k.alive) {
      const f = forward(k.yaw, 0), side = tmpV.set(Math.cos(k.yaw), 0, -Math.sin(k.yaw));
      camPos.set(k.x - f.x * 26 + side.x * 14, k.y + 7, k.z - f.z * 26 + side.z * 14);
      camera.position.lerp(camPos, Math.min(1, dt * 3));
      camera.up.set(0, 1, 0);
      camera.lookAt(k.x, k.y, k.z);
    } else if (S.wreck) {
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
const QF = new Quaternion(), QL = new Quaternion(), V1 = new Vector3(), V2 = new Vector3(), V3 = new Vector3();
/**
 * The chase camera: behind and above the plane in the plane's own frame, so
 * it follows through a loop; its up eases toward the plane's up rather than
 * snapping, and leans a little with the bank. Wider on the burner.
 */
function chase(b, dt, input) {
  const look = controls.settleLook(dt);
  const lk = Math.min(1, Math.abs(look.yaw) * 1.5 + Math.abs(look.pitch) * 1.5);
  QF.set(b.q.x, b.q.y, b.q.z, b.q.w);
  const fwd = V1.set(0, 0, -1).applyQuaternion(QF), up = V2.set(0, 1, 0).applyQuaternion(QF);
  S.camUp.lerp(up, Math.min(1, dt * 3)).normalize();
  // free look (controls.js): swing the camera round the plane's up and wings
  const back = V3.copy(fwd).negate();
  if (lk) {
    QL.setFromAxisAngle(S.camUp, look.yaw); back.applyQuaternion(QL);
    const side = tmpV.crossVectors(S.camUp, back).normalize();
    QL.setFromAxisAngle(side, look.pitch); back.applyQuaternion(QL);
  }
  const narrow = camera.aspect < 1 ? 1.75 : 1;
  const dist = (19 + (b.boosting ? 4 : 0)) * narrow, h = 5.6 * narrow;
  camPos.copy(back).multiplyScalar(dist).addScaledVector(S.camUp, h).add(tmpV.set(b.x, b.y, b.z));
  const g = groundAt(camPos.x, camPos.z) + 3;
  if (camPos.y < g) camPos.y = g;
  camera.position.lerp(camPos, Math.min(1, dt * 7));
  camLook.set(b.x, b.y, b.z).addScaledVector(fwd, 40 * (1 - lk)).addScaledVector(S.camUp, 2.5 - lk);
  if (S.shake > 0) {
    camLook.x += (Math.random() - 0.5) * S.shake * 3; camLook.y += (Math.random() - 0.5) * S.shake * 3;
    S.shake = Math.max(0, S.shake - dt * 2.5);
  }
  // lean a little with the bank
  QL.setFromAxisAngle(fwd, -b.roll * 0.3 * (1 - lk));
  camera.up.copy(S.camUp).applyQuaternion(QL);
  camera.lookAt(camLook);
  // the burner widens the view, the brake draws it in a little
  const fov = b.boosting ? 72 : b.braking ? 58 : 62;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

// cannons thump; machine guns rattle
/** Tracers from the muzzles of whoever is firing, at their rate. */
const MZ = new Vector3(), DIR = new Vector3();
function guns(o, mesh, rate, dt, mine) {
  const every = 1 / rate, holder = mine ? o._me : o;
  holder.gunT = (holder.gunT || 0) + dt;
  const muzzles = mesh.userData.guns;
  while (holder.gunT >= every) {
    holder.gunT -= every;
    const m = muzzles[(holder.gun = (holder.gun || 0) + 1) % muzzles.length];
    MZ.copy(m).applyQuaternion(mesh.quaternion).add(mesh.position);
    // the room leads the guns at a target near the nose: so does the tracer
    const target = mine ? gunTarget(o, aimables(), S.me.stats.gunAssist || GUN.assistCone, S.me.stats.gunRange) : null;
    const d = aimDir(o, target);
    const f = forward(o.yaw, o.pitch);
    DIR.set(d.x * GUN.speed + f.x * (o.speed || 60), d.y * GUN.speed + f.y * (o.speed || 60), d.z * GUN.speed + f.z * (o.speed || 60));
    const sp = DIR.length();
    // one round in two of someone else's is a tracer, as on a real belt:
    // enough to see where they shoot, not a screen full of streaks
    // a round goes only as far as its gun reaches
    const reach = mine ? S.me.stats.gunRange : (GUNS[S.roster.get(o.key)?.gun] || GUNS.g1).range;
    if (mine || (holder.gun >> 1) % 2) fx.tracer(MZ, DIR.normalize(), sp, reach / GUN.speed), fx.muzzle(MZ);
    if (mine) sound.shot(S.me.stats.gun);
  }
}

/** A badly hurt plane burns: flame at the engine, a trail of black smoke. */
function smoke(o, dt, pos) {
  o.smokeT = (o.smokeT || 0) + dt;
  if (o.smokeT < 0.05) return;
  o.smokeT = 0;
  const p = pos || o.mesh.position;
  fx.puff(p, { color: 0x2a2a2e, size: 1.6, grow: 6, life: 2.2, rise: 1 });
  fx.fire(p);
}

/**
 * Where the shots came from: a red arc at the edge of the screen, turned
 * toward the one who fired (or the bomber), fading in a second.
 */
function hitFrom(key) {
  const src = key === 'boss' ? S.boss : S.others.get(key);
  if (!src || src.x === undefined) return;
  const v = tmpV.set(src.x, src.y, src.z).applyMatrix4(camera.matrixWorldInverse);
  const ang = Math.atan2(v.x, -v.z); // 0 ahead, + to the right
  const box = $('#hitdir');
  const el = document.createElement('i');
  el.style.transform = `rotate(${ang}rad)`;
  box.append(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 1200);
}

// ---- the head-up display ------------------------------------------------------

const P = new Vector3();
/**
 * A missile on your tail: a red ring round it on screen (an arrow at the
 * edge when it is behind), how far it is, a beep that quickens as it
 * closes — and, when it is close enough that a hard break could shake it,
 * the word to break.
 */
function threat(dt) {
  const me = S.me, el = $('#threat');
  const b = me?.alive && me.body;
  // any missile tearing past close, whoever it was for: the rush of it
  if (b) for (const x of S.missiles) {
    if (Math.hypot(x.x - b.x, x.y - b.y, x.z - b.z) < 30 && !(S.whooshed ||= new Set()).has(x.id)) S.whooshed.add(x.id), sound.whoosh();
    if (S.whooshed?.size > 200) S.whooshed.clear();
  }
  let m = null, d = Infinity;
  if (b) for (const x of S.missiles) {
    if (x.target !== S.myKey) continue;
    const dd = Math.hypot(x.x - b.x, x.y - b.y, x.z - b.z);
    if (dd < d) d = dd, m = x;
  }
  // the badge under the compass and the red edges: a lock, then the missile itself
  const locked = !!b && (!!m || performance.now() < S.warnUntil), inWindow = !!m && d <= DODGE.far && d >= DODGE.near;
  show('#al-missile', locked); show('#alarm', locked);
  $('#al-missile').classList.toggle('now', inWindow); $('#alarm').classList.toggle('now', inWindow);
  $('#al-m-t').textContent = inWindow ? 'שבור!' : 'טיל';
  $('#al-m-d').textContent = m ? `${Math.round(d / 10) * 10}m` : '';
  if (!m) { show(el, false); S.beepT = 0; return; }
  show(el);
  $('#threat-d').textContent = `${Math.round(d)}m`;
  // on screen: a ring on it. Behind: an arrow on the edge, pointing the way
  P.set(m.x, m.y, m.z).project(camera);
  const W = innerWidth, H = innerHeight, behind = P.z > 1;
  let sx = (P.x * 0.5 + 0.5) * W, sy = (-P.y * 0.5 + 0.5) * H;
  const onScreen = !behind && sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30;
  if (!onScreen) {
    let dx = sx - W / 2, dy = sy - H / 2;
    if (behind) dx = -dx, dy = -dy;
    const k = Math.min((W / 2 - 44) / Math.abs(dx || 1e-6), (H / 2 - 44) / Math.abs(dy || 1e-6));
    sx = W / 2 + dx * k; sy = H / 2 + dy * k;
    el.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
  }
  el.classList.toggle('edge', !onScreen);
  el.style.left = `${sx}px`; el.style.top = `${sy}px`;
  // the beep: slow far off, a buzz up close
  S.beepT = (S.beepT || 0) - dt;
  if (S.beepT <= 0) { sound.beep(inWindow); S.beepT = Math.max(0.07, Math.min(0.8, d / 700)); }
}

/**
 * Someone on my tail: an enemy behind me (more than 110° off my nose),
 * inside the reach of its guns, with its nose on me. A red mark over the
 * crosshair says so — how far, and which side — with a low tone now and then:
 * time to break, or to brake and let it overshoot.
 */
/** The first two sorties: a legend of what each button does, for a few seconds. */
function coach() {
  let n = 0;
  try { n = Number(localStorage.getItem('sky.coached')) || 0; localStorage.setItem('sky.coached', String(n + 1)); } catch {}
  if (n >= 2) return;
  show('#coach');
  clearTimeout(coach.t);
  coach.t = setTimeout(() => show('#coach', false), 7000);
}

function tail(dt) {
  const el = $('#tail'), b = S.me?.alive && S.me.body;
  let worst = null;
  if (b) {
    const f = forward(b.yaw, b.pitch);
    for (const o of foes()) {
      if (!o.alive || o.x === undefined || o.yaw === undefined) continue;
      const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z, d = Math.hypot(dx, dy, dz);
      const reach = ((GUNS[S.roster.get(o.key)?.gun] || GUNS.g1).range) * 1.15;
      if (d > reach || d < 1) continue;
      const behind = (f.x * dx + f.y * dy + f.z * dz) / d < -0.34;
      if (behind && offNose(o, o.yaw, o.pitch, b) < 0.22 && (!worst || d < worst.d)) worst = { d, side: f.x * dz - f.z * dx };
    }
  }
  show(el, !!worst);
  if (!worst) { S.tailT = 0; return; }
  $('#tail-d').textContent = `${Math.round(worst.d / 10) * 10}m`;
  el.dataset.side = worst.side > 4 ? 'r' : worst.side < -4 ? 'l' : '';
  S.tailT = (S.tailT || 0) - dt;
  if (S.tailT <= 0) sound.tail(), S.tailT = 1.4;
}

function hud(dt, now) {
  const me = S.me;
  // the crosshair kicks when a round lands
  S.hitFlash = Math.max(0, S.hitFlash - dt);
  $('#cross').classList.toggle('hit', S.hitFlash > 0);
  show('#cross', !!me?.alive);
  threat(dt);
  tail(dt);
  tags();
  compass();
  if (me?.body) {
    const b = me.body;
    show('#edge', Math.hypot(b.x, b.z) > ARENA.radius - 30 && me.alive);
    // through a cloud the world goes white
    const c = inCloud(world.clouds, b.x, b.y, b.z);
    $('#white').style.opacity = me.alive ? Math.min(0.5, c * 1.2) : 0;
    // the lock: what a missile would go after now
    const t = me.alive ? pickTarget({ ...b, alive: true }, aimables().filter((o) => o.alive && !o.shield), MISSILE.lockCone, me.stats.mRange) : null;
    // shown only with a missile on the rail, gliding rather than jumping
    // from one plane to the next
    const lock = $('#lock');
    if (t && me.ammo > 0 && project(P.set(t.x, t.y, t.z))) {
      const same = S.lockOn === t.key, k = same ? Math.min(1, dt * 18) : 1;
      S.lockOn = t.key;
      S.lockX = (S.lockX ?? P.x) + (P.x - S.lockX) * k; S.lockY = (S.lockY ?? P.y) + (P.y - S.lockY) * k;
      show(lock);
      lock.style.left = `${S.lockX}px`; lock.style.top = `${S.lockY}px`;
      // tight on it once it has been held a moment
      S.lockT = same ? (S.lockT || 0) + dt : 0;
      lock.classList.toggle('ready', S.lockT > 0.4);
      // in the headset: the growl while it looks, the tone once it holds
      sound.seeker(S.lockT > 0.4 ? 'lock' : 'search');
    } else show(lock, false), S.lockOn = '', S.lockT = 0, sound.seeker('off');
    // the crosshair where the guns point: 300 m down the nose
    const f = forward(b.yaw, b.pitch), cross = $('#cross');
    if (project(P.set(b.x + f.x * 300, b.y + f.y * 300, b.z + f.z * 300))) cross.style.left = `${P.x}px`, cross.style.top = `${P.y}px`;
    // the aim pip: where the nearest plane ahead will be when the rounds get
    // there. Crosshair on it and the guns are helped onto it (shared/combat.js)
    const g = me.alive ? gunTarget({ ...b, alive: true }, aimables().filter((o) => o.alive), 0.35, me.stats.gunRange + 100) : null;
    const lead = $('#lead');
    if (g) {
      const d = Math.hypot(g.x - b.x, g.y - b.y, g.z - b.z), L = leadPoint(b, g), reach = d < me.stats.gunRange;
      if (project(P.set(L.x, L.y, L.z))) { show(lead); lead.style.left = `${P.x}px`; lead.style.top = `${P.y}px`; } else show(lead, false);
      // faint while it is out of reach; the crosshair lights once the guns will be helped onto it
      lead.classList.toggle('far', !reach);
      cross.classList.toggle('on', reach && gunTarget({ ...b, alive: true }, [g], me.stats.gunAssist || GUN.assistCone, me.stats.gunRange) === g);
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
/**
 * Over the planes in view: a small mark each, and words (name, distance,
 * health) only on the two nearest — the compass has the rest. No arrows at the
 * edges any more: the compass says where everyone is.
 */
/**
 * Over each plane in sight, a dot — and over the nearest two, the name and
 * how far. Every frame, where the plane is drawn (not where the room last
 * said it was), on elements kept from frame to frame.
 */
const tagEls = [];
function tagEl(i) {
  if (!tagEls[i]) { const d = document.createElement('div'); $('#tags').appendChild(d); tagEls[i] = { d, cls: '', html: '' }; }
  return tagEls[i];
}
function setTag(i, cls, html, x, y) {
  const t = tagEl(i);
  if (t.cls !== cls) t.d.className = t.cls = cls;
  if (t.html !== html) t.d.innerHTML = t.html = html;
  t.d.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${cls.startsWith('tagp') ? ' translate(-50%, -100%)' : ''}`;
  t.d.style.display = '';
}
function tags() {
  const me = S.me?.mesh?.position;
  let n = 0;
  if (me && S.me.alive) {
    const list = [];
    for (const o of S.others.values()) if (o.alive) list.push({ o, d: o.mesh.position.distanceTo(me) });
    list.sort((a, b) => a.d - b.d);
    let named = 0;
    for (const { o, d } of list) {
      if (d > 1600) break;
      P.copy(o.mesh.position); P.y += 3.5;
      if (P.clone().project(camera).z > 1 || !project(P)) continue;
      const r = S.roster.get(o.key);
      const side = S.teams ? (r?.team === S.myTeam ? ' mate' : ' foe') : '';
      if (named < 2 && d < 900) {
        named++;
        // the plane under fire: a bigger bar, and the bit just shot off flashing white
        const hot = o.hitAt && performance.now() - o.hitAt < 2500;
        const bar = o.hp < 100 || hot ? `<div class="mini${hot ? ' hot' : ''}"><i style="width:${o.hp}%"></i></div>` : '';
        setTag(n++, `tagp${side}`, `${esc(r?.name || '')} · <span class="num">${Math.round(d / 10) * 10}</span>${bar}`, P.x, P.y);
      } else setTag(n++, `tagdot${side}`, '', P.x, P.y);
    }
    const B = S.boss;
    if (B?.mesh) {
      P.copy(B.mesh.position); P.y += 9;
      if (P.clone().project(camera).z <= 1 && project(P)) setTag(n++, 'tagp boss', `מפציץ · <span class="num">${Math.round(B.mesh.position.distanceTo(me) / 10) * 10}</span>`, P.x, P.y);
    }
  }
  for (let i = n; i < tagEls.length; i++) if (tagEls[i].d.style.display !== 'none') tagEls[i].d.style.display = 'none';
}

/**
 * The compass tape: the heading under a caret in the middle, 120° of it
 * across the strip, ticks every 5° and the cardinal points named. On it,
 * by their bearing from the nose: red the enemies (the nearest with its
 * range), blue the side, gold the bomber, white a missile coming for me,
 * green a repair pad that is ready. One beyond the strip waits at its edge,
 * dimmed, pointing the way. A tip up or down: well above or below me.
 */
const COMPASS = { span: 120, range: 1800 };
const deg = (r) => (r * 180) / Math.PI;
const wrap = (a) => ((a + 540) % 360) - 180;
function compass() {
  const cv = $('#compass'), me = S.me?.body;
  if (!cv || !me) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) cv.width = Math.round(W * dpr), cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const head = ((deg(-me.yaw) % 360) + 360) % 360, px = W / COMPASS.span, mid = W / 2, base = 22;
  const xOf = (rel) => mid + rel * px;
  // the glass behind it, fading out at both ends
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, 'rgba(6,14,22,0)'); bg.addColorStop(0.15, 'rgba(6,14,22,0.5)'); bg.addColorStop(0.85, 'rgba(6,14,22,0.5)'); bg.addColorStop(1, 'rgba(6,14,22,0)');
  g.fillStyle = bg; g.fillRect(0, 4, W, base);
  const line = g.createLinearGradient(0, 0, W, 0);
  line.addColorStop(0, 'rgba(111,230,255,0)'); line.addColorStop(0.5, 'rgba(111,230,255,0.8)'); line.addColorStop(1, 'rgba(111,230,255,0)');
  g.fillStyle = line; g.fillRect(0, base + 4, W, 1);
  // ticks and names
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const first = Math.ceil((head - COMPASS.span / 2) / 5) * 5;
  for (let a = first; a <= head + COMPASS.span / 2; a += 5) {
    const x = xOf(a - head), fade = 1 - Math.abs(a - head) / (COMPASS.span / 2);
    const n = ((a % 360) + 360) % 360, big = n % 15 === 0;
    g.fillStyle = `rgba(200,240,255,${0.25 + 0.6 * fade})`;
    g.fillRect(x - 0.5, base + 4 - (big ? 7 : 4), 1, big ? 7 : 4);
    if (n % 30 === 0) {
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n];
      g.font = `${name ? 800 : 600} ${name ? 12 : 9}px Orbitron, Rubik, sans-serif`;
      g.fillStyle = name ? `rgba(111,230,255,${0.4 + 0.6 * fade})` : `rgba(220,240,250,${0.25 + 0.5 * fade})`;
      g.fillText(name || String(n).padStart(3, '0'), x, 12);
    }
  }
  // the heading itself, under a caret
  g.fillStyle = '#6fe6ff';
  g.beginPath(); g.moveTo(mid - 5, base + 5); g.lineTo(mid + 5, base + 5); g.lineTo(mid, base + 10); g.closePath(); g.fill();
  // the marks
  const mark = (x, y, z, color, size, opts = {}) => {
    const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, y - me.y, dz);
    if (opts.range && d > opts.range) return null;
    const rel = wrap(deg(Math.atan2(dx, -dz)) - head), out = Math.abs(rel) > COMPASS.span / 2 - 3;
    const sx = xOf(Math.max(-COMPASS.span / 2 + 3, Math.min(COMPASS.span / 2 - 3, rel))), sy = base + 17;
    g.globalAlpha = out ? 0.45 : 1;
    g.fillStyle = color; g.shadowColor = color; g.shadowBlur = out ? 0 : 6;
    g.beginPath();
    if (out) {
      // at the edge, pointing the way round
      const s = rel > 0 ? 1 : -1;
      g.moveTo(sx + s * size, sy); g.lineTo(sx - s * size * 0.6, sy - size); g.lineTo(sx - s * size * 0.6, sy + size);
    } else if (opts.cross) {
      g.rect(sx - size, sy - size * 0.3, size * 2, size * 0.6); g.rect(sx - size * 0.3, sy - size, size * 0.6, size * 2);
    } else {
      const dy = y - me.y;
      if (dy > 60) { g.moveTo(sx, sy - size); g.lineTo(sx + size, sy + size * 0.7); g.lineTo(sx - size, sy + size * 0.7); }
      else if (dy < -60) { g.moveTo(sx, sy + size); g.lineTo(sx + size, sy - size * 0.7); g.lineTo(sx - size, sy - size * 0.7); }
      else { g.moveTo(sx, sy - size); g.lineTo(sx + size, sy); g.lineTo(sx, sy + size); g.lineTo(sx - size, sy); }
    }
    g.fill();
    g.shadowBlur = 0; g.globalAlpha = 1;
    return { sx, sy, d, out };
  };
  HEALS.forEach((h, i) => pads.ready(i) && mark(h.x, h.y, h.z, '#4dff9a', 3.2, { cross: true, range: COMPASS.range }));
  let near = null;
  for (const o of S.others.values()) {
    if (!o.alive || o.x === undefined) continue;
    const mate = S.teams && S.roster.get(o.key)?.team === S.myTeam;
    const m = mark(o.x, o.y, o.z, mate ? '#6aa8ff' : '#ff4d5a', 4.5);
    if (!mate && m && (!near || m.d < near.d)) near = m;
  }
  if (S.boss) mark(S.boss.x, S.boss.y, S.boss.z, '#ffd27a', 6.5);
  if (Math.floor(performance.now() / 150) % 2) for (const m of S.missiles) if (m.target === S.myKey) mark(m.x, m.y, m.z, '#ffffff', 4);
  // the nearest enemy's range, under its mark
  if (near) {
    g.font = '700 9px Orbitron, Rubik, sans-serif';
    g.fillStyle = '#ff9aa2';
    g.fillText(`${Math.round(near.d / 10) * 10}m`, Math.max(16, Math.min(W - 16, near.sx)), near.sy + 12);
  }
}

/** Who I may shoot at: everyone, or in teams the other side. */
function foes() {
  const all = [...S.others.values()];
  return S.teams ? all.filter((o) => S.roster.get(o.key)?.team !== S.myTeam) : all;
}

/** The team score at the top, blue against red. */
function paintTeams(sc) {
  show('#teamscore', !!S.teams);
  if (!S.teams || !sc) return;
  $('#ts-b').textContent = sc.b; $('#ts-r').textContent = sc.r;
  $('#teamscore').dataset.mine = S.myTeam;
}

/** A link that brings a friend into this very room. */
async function invite() {
  if (!S.roomId) return;
  const url = `${location.origin}/?room=${encodeURIComponent(S.roomId)}`;
  const text = `בוא לטוס איתי ב־Skyfight${S.teams ? ' (קבוצות)' : ''}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Skyfight', text, url });
  } catch { return; }
  try { await navigator.clipboard.writeText(url); toast('הקישור הועתק — שלחו לחבר'); } catch { prompt('הקישור לזירה:', url); }
}
$('#invite-btn').addEventListener('click', invite);
$('#btn-invite2').addEventListener('click', invite);

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

/**
 * A game event on screen: a card in the stack at the top, in for about
 * three seconds. The same words again only keep their card up longer; four
 * at most, the oldest leaving first. `cls`: 'lvl' good news, 'bad' bad.
 */
const NOTE = { hold: 2800, max: 3 };
function toast(text, cls = '') {
  const box = $('#notes');
  for (const c of box.children) if (c.dataset.text === text && !c.classList.contains('gone')) return void keep(c);
  const c = document.createElement('div');
  c.className = 'note-c';
  c.dataset.text = text;
  const x = document.createElement('div');
  x.className = `note-x ${cls === 'lvl' ? 'lvl' : cls === 'bad' ? 'bad' : ''}`;
  x.textContent = text;
  c.append(Object.assign(document.createElement('div'), {}));
  c.firstChild.append(x);
  box.append(c);
  const live = [...box.children].filter((n) => !n.classList.contains('gone'));
  if (live.length > NOTE.max) drop(live[0]);
  keep(c);
  sound.note(cls === 'lvl');
}
function keep(c) { clearTimeout(c._t); c._t = setTimeout(() => drop(c), NOTE.hold); }
function drop(c) {
  if (c.classList.contains('gone')) return;
  clearTimeout(c._t);
  c.querySelector('.note-x').classList.add('out');
  setTimeout(() => c.classList.add('gone'), 300);
  setTimeout(() => c.remove(), 700);
}

// ---- how much to draw ------------------------------------------------------
//
// Three levels; 'auto' starts from what the device probably manages and
// steps down by itself when the frames slow, back up when they have room.
const QUALITY = { low: 1, med: 1.35, high: Math.min(devicePixelRatio || 1, 2) };
const LEVELS = ['low', 'med', 'high'];
const Q = {
  pick: (() => { try { return localStorage.getItem('sky.quality') || 'auto'; } catch { return 'auto'; } })(),
  level: '', frames: 0, since: 0, slow: 0, fast: 0, hold: 0,
};
function setLevel(level) {
  if (Q.level === level) return;
  Q.level = level;
  renderer.setPixelRatio(Math.min(QUALITY[level], devicePixelRatio || 1));
  world.setQuality(level);
  resize();
}
function pickQuality(v) {
  Q.pick = v;
  try { localStorage.setItem('sky.quality', v); } catch {}
  setLevel(v === 'auto' ? (controls.touch ? 'med' : 'high') : v);
}
/** Per frame, in the air: count frames; every 3 s, judge. */
function watchFrames(now) {
  if (Q.pick !== 'auto') return;
  Q.frames++;
  if (!Q.since) Q.since = now;
  if (now - Q.since < 3000) return;
  const fps = Q.frames * 1000 / (now - Q.since);
  Q.frames = 0; Q.since = now;
  const i = LEVELS.indexOf(Q.level);
  if (fps < 38) { Q.fast = 0; if (++Q.slow >= 2 && i > 0) setLevel(LEVELS[i - 1]), Q.slow = 0, Q.hold = now + 60000; }
  else if (fps > 57) { Q.slow = 0; if (++Q.fast >= 3 && i < 2 && now > Q.hold) setLevel(LEVELS[i + 1]), Q.fast = 0; }
  else Q.slow = Q.fast = 0;
  S.fps = Math.round(fps);
}
$('#set-quality').addEventListener('change', (e) => pickQuality(e.target.value));

/**
 * Fit the picture to the screen as it is now. A phone turned on its side
 * reports its new size late, and not always with a 'resize': so the canvas's
 * own box is watched, and the turn is followed up a few times as it settles.
 * Drawn at the old proportions on the new screen is what "stretched" was.
 */
function resize() {
  const cv = renderer.domElement;
  const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hangar.resize(w / h);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => [50, 200, 450, 900].forEach((ms) => setTimeout(resize, ms)));
visualViewport?.addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(renderer.domElement);
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.engine(false), sound.seeker('off'); });

boot();
