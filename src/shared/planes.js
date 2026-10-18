// The hangar: what can be flown, what can be bought for it, and what a pilot
// earns by shooting the others down. Pure — the server pays and charges by
// these numbers, the client only shows them.

/**
 * The planes: seventy years of fighters, from the last piston fighters to
 * stealth. Each is a different way to win: the forgiving all-rounder, the
 * early jet that runs, the heavy twin that soaks, the delta that out-turns,
 * the stealth fighter that does everything. A plane opens at a level and is
 * then bought once with gold; the first is free. (The ids are the old ones:
 * pilots' hangars are stored by them.)
 *
 *   hp      how much it takes
 *   speed   cruise, m/s          boost   with the afterburner lit
 *   turn    yaw rate, rad/s      climb   pitch rate, rad/s
 *   rate    rounds per second    dmg     per round
 *   missiles  carried at once    flares  decoys carried
 *   reload  seconds a missile    fill    burner refill a second
 */
export const PLANES = {
  sparrow: {
    id: 'sparrow', he: 'סער', role: 'מאוזן', era: '1944', kind: 'מטוס בוכנה', level: 1, price: 0,
    desc: 'לוחם הבוכנה האחרון של מלחמת העולם השנייה. כבד ויורה לאט — אבל כל שדרוג מקרב אותו לגדולים.',
    guns: 'שישה מקלעים 12.7 מ"מ', missile: 'רקטות',
    hp: 100, speed: 56, boost: 86, turn: 1.25, climb: 1.1, rate: 8, dmg: 3.2, missiles: 1, flares: 2, reload: 10, fill: 0.12,
  },
  hornet: {
    id: 'hornet', he: 'ברק', role: 'מהיר', era: '1953', kind: 'סילון כנף משוכה', level: 3, price: 1500,
    desc: 'דור הסילונים הראשון: כנף משוכה ומתכת חשופה. פוגע ובורח לפני שמספיקים להסתובב.',
    guns: 'שישה מקלעים 12.7 מ"מ', missile: 'טיל מונחה חום',
    hp: 85, speed: 70, boost: 112, turn: 1.6, climb: 1.4, rate: 13, dmg: 3.5, missiles: 1, flares: 2, reload: 9, fill: 0.15,
  },
  bulldog: {
    id: 'bulldog', he: 'רעם', role: 'משוריין', era: '1976', kind: 'לוחם עליונות אווירית', level: 6, price: 4000,
    desc: 'דו־מנועי כבד עם שני זנבות ותותח רב־קני. איטי בפניות — אבל כמעט לא נופל.',
    guns: 'תותח רב־קני 20 מ"מ', missile: 'טיל מונחה חום',
    hp: 165, speed: 54, boost: 84, turn: 1.25, climb: 1.1, rate: 16, dmg: 2.8, missiles: 1, flares: 3, reload: 8, fill: 0.13,
  },
  viper: {
    id: 'viper', he: 'כפיר', role: 'זריז', era: '1975', kind: 'כנף משולשת', level: 10, price: 9000,
    desc: 'כנף משולשת עם כנפונים. מסתובב בתוך העיגול של כל אחד אחר, ושני טילים.',
    guns: 'שני תותחים 30 מ"מ', missile: 'טיל מונחה חום',
    hp: 110, speed: 66, boost: 106, turn: 1.95, climb: 1.65, rate: 8, dmg: 6.75, missiles: 2, flares: 2, reload: 7.5, fill: 0.14,
  },
  phantom: {
    id: 'phantom', he: 'אדיר', role: 'עליון', era: '2016', kind: 'חמקן', level: 16, price: 20000,
    desc: 'מטוס חמקן מהדור החמישי. הכל בו טוב יותר, ושלושה טילים.',
    guns: 'תותח 25 מ"מ', missile: 'טיל מונחה מכ"ם',
    hp: 145, speed: 72, boost: 118, turn: 1.8, climb: 1.55, rate: 11, dmg: 5.45, missiles: 3, flares: 3, reload: 6.5, fill: 0.16,
  },
};
/**
 * Paint: bought once with gold, worn on any plane. Looks only — no paint
 * flies better than another. 'stock' is each plane's own scheme.
 */
export const PAINTS = {
  stock: { he: 'מקורי', price: 0, swatch: '#7d8a76' },
  arctic: { he: 'ארקטי', price: 2500, swatch: '#dfe4e8', top: '#dfe4e8', blot: ['#b9c2ca', '#f3f5f7'], under: '#e8ecef', metal: 0.12, rough: 0.6 },
  jungle: { he: 'ג׳ונגל', price: 2500, swatch: '#4a5a2e', top: '#4a5a2e', blot: ['#2f3a1c', '#6b6a3a'], under: '#8f9a7a', metal: 0.1, rough: 0.65 },
  night: { he: 'לילה', price: 3500, swatch: '#24272d', top: '#24272d', blot: ['#1a1c21', '#30343c'], under: '#2b2e34', metal: 0.3, rough: 0.45, splinter: true },
  sea: { he: 'כחול ים', price: 3500, swatch: '#2c4f7a', top: '#2c4f7a', blot: ['#1f3a5c', '#3d6896'], under: '#a3b8cc', metal: 0.25, rough: 0.5, splinter: true },
  fox: { he: 'שועל', price: 6000, swatch: '#b3282d', top: '#b3282d', blot: ['#d4383d'], under: '#f0f0ee', metal: 0.35, rough: 0.35, band: '#f0f0ee' },
  gold: { he: 'זהב', price: 25000, swatch: '#d2a64a', top: '#cfa14a', blot: [], under: '#b88f3c', metal: 1, rough: 0.22 },
};
export const PAINT_ORDER = ['stock', 'arctic', 'jungle', 'night', 'sea', 'fox', 'gold'];

export const PLANE_ORDER = ['sparrow', 'hornet', 'bulldog', 'viper', 'phantom'];
export const START_PLANE = 'sparrow';

/**
 * Upgrades: each plane its own. What you put into one plane stays with that
 * plane. Five tiers each; a tier opens at a level and costs gold (a better
 * plane's tiers cost more).
 *
 * Every upgrade moves a plane's numbers toward a mark, a fifth of the way a
 * tier: the engine and the turbo toward the best plane in the game — a
 * starter with the engine at five flies like the best — and the guns, the
 * armour, the missiles and the flares toward the third best, so a plane
 * that is born better stays better there. A plane already at the mark still
 * gains (`least`, at tier five).
 */
export const UPGRADES = {
  engine: { id: 'engine', he: 'תנועה', desc: 'מהירות, פניות וטיפוס', mark: 'best', least: 0.08 },
  turbo: { id: 'turbo', he: 'טורבו', desc: 'מבער מהיר יותר שמתמלא מהר יותר', mark: 'best', least: 0.1 },
  guns: { id: 'guns', he: 'ירי', desc: 'קצב אש ונזק', mark: 'third', least: 0.15 },
  armor: { id: 'armor', he: 'מיגון', desc: 'עוד חיים', mark: 'third', least: 0.25 },
  missiles: { id: 'missiles', he: 'טילים', desc: 'טעינה מהירה יותר · בדרגה 3 טיל נוסף', mark: 'third', least: 0.2 },
  flares: { id: 'flares', he: 'נורים', desc: 'טעינה מהירה יותר · בדרגה 3 נור נוסף', mark: 'third', least: 0.3 },
};
export const UPGRADE_ORDER = ['engine', 'turbo', 'guns', 'armor', 'missiles', 'flares'];
export const TIER_MAX = 5;
export const TIER_COST = [600, 1400, 3000, 6000, 11000];
export const TIER_LEVEL = [2, 5, 9, 14, 20];
/** A tier of a better plane costs more: the starter's are cheap. */
export const PLANE_COST = { sparrow: 0.5, hornet: 0.8, bulldog: 1, viper: 1.3, phantom: 1.6 };

/** The tiers a pilot has put into a plane. */
export const tiersOf = (pilot, plane) => pilot?.upgrades?.[plane] || {};

/** What the next tier of an upgrade on a plane asks for, or null at the top. */
export function nextTier(pilot, id, plane = pilot?.plane) {
  const have = tiersOf(pilot, plane)[id] || 0;
  if (have >= TIER_MAX) return null;
  return { tier: have + 1, cost: Math.round(TIER_COST[have] * (PLANE_COST[plane] || 1) / 50) * 50, level: TIER_LEVEL[have] };
}

/** The flare reload before upgrades. */
export const FLARE_RELOAD = 10;

// the marks: the best plane (the last), and the third best
const MARK = { best: PLANE_ORDER[PLANE_ORDER.length - 1], third: PLANE_ORDER[PLANE_ORDER.length - 3] };
/** From `base` toward `mark` (at least `least` better), tier t of five. More is better unless `less`. */
function toward(base, mark, least, t, less = false) {
  const end = less ? Math.min(mark, base * (1 - least)) : Math.max(mark, base * (1 + least));
  return base + (end - base) * (t / TIER_MAX);
}

/**
 * The market: guns and missiles, bought once with gold (each opens at a
 * level) and carried to whatever plane is flown. A gun sets how far its
 * rounds go before they are spent — its reach — and how hard and fast it
 * hits, on top of the plane's own guns. A missile sets how far off it can
 * lock and still get there, how hard it hits, and how fast and how hard it
 * turns. The first of each is free.
 *
 *   range  metres it is good to     dmg  per round (×) / per missile
 *   rate   rounds a second (×)      speed, turn  the missile's flight
 */
export const GUNS = {
  g1: { id: 'g1', he: 'מקלע 7.62', level: 1, price: 0, range: 300, dmg: 1, rate: 1, desc: 'קל ומהיר לטעינה. קצר טווח.' },
  g2: { id: 'g2', he: 'מקלע 12.7', level: 3, price: 900, range: 360, dmg: 1.12, rate: 1, desc: 'כדור כבד יותר, טווח ארוך יותר.' },
  g3: { id: 'g3', he: 'תותח 20 מ"מ', level: 7, price: 2800, range: 420, dmg: 1.32, rate: 0.9, desc: 'פגזים נפיצים. קצב מעט איטי.' },
  g4: { id: 'g4', he: 'וולקן 20 מ"מ', level: 12, price: 6500, range: 440, dmg: 1.02, rate: 1.45, desc: 'רב־קני: מטר של פגזים מקרוב.' },
  g5: { id: 'g5', he: 'תותח 30 מ"מ', level: 18, price: 14000, range: 540, dmg: 1.55, rate: 0.85, desc: 'כל פגיעה כואבת, ומרחוק.' },
};
export const MISSILES = {
  m1: { id: 'm1', he: 'שפריר 1', level: 1, price: 0, range: 350, dmg: 45, speed: 145, turn: 1.8, desc: 'טיל חום ראשון. קצר טווח ועצל בפניות.' },
  m2: { id: 'm2', he: 'שפריר 2', level: 4, price: 1200, range: 450, dmg: 55, speed: 150, turn: 1.95, desc: 'ראש קרב גדול יותר, טווח ארוך יותר.' },
  m3: { id: 'm3', he: 'פיתון 3', level: 9, price: 3600, range: 550, dmg: 65, speed: 158, turn: 2.1, desc: 'מהיר וזריז. קשה יותר להתחמק ממנו.' },
  m4: { id: 'm4', he: 'פיתון 5', level: 14, price: 8000, range: 650, dmg: 75, speed: 166, turn: 2.25, desc: 'נועל מרחוק ונצמד לפניות חדות.' },
  m5: { id: 'm5', he: 'דרבי', level: 20, price: 16000, range: 800, dmg: 90, speed: 175, turn: 2.35, desc: 'מונחה מכ"ם: מעבר לטווח הראייה, ופגיעה קטלנית.' },
};
export const GUN_ORDER = Object.keys(GUNS);
export const MISSILE_ORDER = Object.keys(MISSILES);
export const START_GUN = 'g1', START_MISSILE = 'm1';
/** The market's two shelves, by the name the pilot's record keeps them under. */
export const ARMS = { guns: GUNS, missiles: MISSILES };

/**
 * A plane as this pilot flies it: the plane's numbers with its upgrades on,
 * and the gun and missile it carries.
 */
export function statsOf(planeId, tiers = {}, arms = {}) {
  const p = PLANES[planeId] || PLANES[START_PLANE];
  const t = (k) => Math.max(0, Math.min(TIER_MAX, tiers[k] | 0));
  const U = UPGRADES, m = (k) => PLANES[MARK[U[k].mark]];
  const go = (k, field, less) => toward(p[field], m(k)[field], U[k].least, t(k), less);
  // the guns: rounds a second and damage a round rise together, by what it
  // takes to bring the damage a second to the mark
  const G = GUNS[arms.gun] || GUNS[START_GUN], M = MISSILES[arms.missile] || MISSILES[START_MISSILE];
  const dps = p.rate * p.dmg, gunK = Math.sqrt(toward(dps, m('guns').rate * m('guns').dmg, U.guns.least, t('guns')) / dps);
  return {
    plane: p.id,
    hp: Math.round(go('armor', 'hp')),
    speed: go('engine', 'speed'), turn: go('engine', 'turn'), climb: go('engine', 'climb'),
    boost: go('turbo', 'boost'), fill: go('turbo', 'fill'),
    rate: p.rate * gunK * G.rate, dmg: p.dmg * gunK * G.dmg,
    gun: G.id, gunRange: G.range,
    missile: M.id, mRange: M.range, mDmg: M.dmg, mSpeed: M.speed, mTurn: M.turn,
    missiles: p.missiles + (t('missiles') >= 3 ? 1 : 0),
    reload: go('missiles', 'reload', true),
    flares: p.flares + (t('flares') >= 3 ? 1 : 0),
    flareReload: FLARE_RELOAD * (1 - U.flares.least * t('flares') / TIER_MAX),
  };
}

// ---- levels ---------------------------------------------------------------

export const MAX_LEVEL = 30;
/** XP to go from `level` to the next: the first few in minutes, the last in hours. */
export const xpStep = (level) => 100 + 90 * (level - 1) + 4 * (level - 1) ** 2;
/** Gold on reaching a level: a little push toward the next purchase. */
export const levelBonus = (level) => 100 * level;
/** Total XP at which `level` starts. */
export function xpAt(level) {
  let s = 0;
  for (let l = 1; l < level; l++) s += xpStep(l);
  return s;
}
export function levelOf(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpAt(l + 1)) l++;
  return l;
}
/** How far into the current level, 0..1 (1 at the cap). */
export function levelProgress(xp) {
  const l = levelOf(xp);
  if (l >= MAX_LEVEL) return 1;
  return (xp - xpAt(l)) / xpStep(l);
}

/**
 * A kill's pay. A real pilot is worth more than a bot, a higher level more
 * than a lower, and a streak adds a tenth a kill (up to half again). Helping
 * (an assist) pays half.
 */
export function killReward(victimLevel, { bot = false, streak = 0, assist = false } = {}) {
  const lv = Math.max(1, victimLevel | 0);
  let xp = bot ? 35 + 5 * lv : 60 + 8 * lv;
  let gold = bot ? 30 + 4 * lv : 55 + 6 * lv;
  const k = 1 + Math.min(0.5, 0.1 * Math.max(0, streak));
  xp *= k; gold *= k;
  if (assist) { xp /= 2; gold /= 2; }
  return { xp: Math.round(xp), gold: Math.round(gold) };
}

/** Is this plane open to this pilot to buy or fly? */
export const planeOpen = (pilot, id) => !!PLANES[id] && (pilot.level || 1) >= PLANES[id].level;
export const planeOwned = (pilot, id) => id === START_PLANE || (pilot.planes || []).includes(id);

// ---- names ----------------------------------------------------------------

/**
 * How a pilot is shown: a saved pilot carries a number after the name, so
 * three pilots called מאיר are מאיר#1, מאיר#2 and מאיר#3. A guest has none.
 */
export const displayName = (p) => (p?.tag ? `${p.name}#${p.tag}` : p?.name || '');

/** A callsign: 2–14 letters (Hebrew or Latin), digits, spaces, _ and -. */
export function cleanCallsign(s) {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (v.length < 2 || v.length > 14) return null;
  if (!/^[\p{L}\p{N} _\-]+$/u.test(v)) return null;
  return v;
}
