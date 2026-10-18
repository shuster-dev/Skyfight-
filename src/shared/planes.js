// The hangar: what can be flown, what can be bought for it, and what a pilot
// earns by shooting the others down. Pure — the server pays and charges by
// these numbers, the client only shows them.

/**
 * The planes: ten, eighty years of Israeli fighters, from the piston
 * fighter to stealth. A ladder: each a little better than the one before,
 * and every fourth an elite (`ace`) — a big step up, prettier, and dear.
 * A plane opens at a level and is then bought once with gold; the first is
 * free. (The first five ids are the old ones: pilots' hangars are stored by
 * them.)
 *
 *   hp      how much it takes (a fight lasts seconds, not a blink)
 *   speed   cruise, m/s          boost   with the afterburner lit
 *   turn    yaw rate, rad/s      climb   pitch rate, rad/s
 *   rate    rounds per second    dmg     per round
 *   missiles  carried at once    flares  decoys carried
 *   reload  seconds a missile    fill    burner refill a second
 */
export const PLANES = {
  sparrow: {
    id: 'sparrow', he: 'סער', role: 'מטוס ראשון', era: '1948', kind: 'מטוס בוכנה', level: 1, price: 0,
    desc: 'לוחם הבוכנה של הטייסות הראשונות. כבד ויורה לאט — אבל כל שדרוג מקרב אותו לגדולים.',
    hp: 250, speed: 56, boost: 86, turn: 1.25, climb: 1.1, rate: 8, dmg: 8.7, missiles: 1, flares: 2, reload: 10, fill: 0.12,
  },
  gull: {
    id: 'gull', he: 'שחף', role: 'בוכנה כבד', era: '1952', kind: 'כנף שחף', level: 3, price: 1200,
    desc: 'כנף שבורה, מדחף ענק ושישה מקלעים. מחזיק יותר, יורה יותר.',
    hp: 300, speed: 60, boost: 92, turn: 1.3, climb: 1.15, rate: 9, dmg: 9.4, missiles: 1, flares: 2, reload: 9.5, fill: 0.13,
  },
  hornet: {
    id: 'hornet', he: 'ברק', role: 'סילון ראשון', era: '1956', kind: 'סילון כנף משוכה', level: 5, price: 2500,
    desc: 'דור הסילונים הראשון: כנף משוכה ומתכת חשופה. פוגע ובורח לפני שמספיקים להסתובב.',
    hp: 300, speed: 70, boost: 112, turn: 1.6, climb: 1.4, rate: 13, dmg: 6.5, missiles: 1, flares: 2, reload: 9, fill: 0.15,
  },
  shahak: {
    id: 'shahak', he: 'שחק', role: 'עלית', era: '1967', kind: 'כנף משולשת', level: 8, price: 7000, ace: true,
    desc: 'המיראז\' של מלחמת ששת הימים. מהיר מכל מה שלפניו, שני טילים ותותחי 30 מ"מ.',
    hp: 320, speed: 78, boost: 126, turn: 1.8, climb: 1.65, rate: 9, dmg: 11, missiles: 2, flares: 2, reload: 7.5, fill: 0.16,
  },
  skyhawk: {
    id: 'skyhawk', he: 'עיט', role: 'תקיפה', era: '1968', kind: 'מטוס תקיפה', level: 10, price: 5500,
    desc: 'קטן, עקשן וזריז. מחזיק פגיעות ונכנס לכל קרב.',
    hp: 330, speed: 70, boost: 110, turn: 1.75, climb: 1.5, rate: 10, dmg: 9.2, missiles: 2, flares: 3, reload: 8, fill: 0.14,
  },
  viper: {
    id: 'viper', he: 'כפיר', role: 'זריז', era: '1975', kind: 'כנף משולשת וכנפונים', level: 13, price: 8000,
    desc: 'כנף משולשת עם כנפונים, תוצרת הארץ. מסתובב בתוך העיגול של כל אחד אחר.',
    hp: 340, speed: 74, boost: 116, turn: 2.0, climb: 1.7, rate: 8, dmg: 11.5, missiles: 2, flares: 2, reload: 7.5, fill: 0.15,
  },
  bulldog: {
    id: 'bulldog', he: 'רעם', role: 'משוריין', era: '1976', kind: 'לוחם עליונות אווירית', level: 16, price: 11000,
    desc: 'דו־מנועי כבד עם שני זנבות ותותח רב־קני. איטי בפניות — אבל כמעט לא נופל.',
    hp: 460, speed: 68, boost: 110, turn: 1.5, climb: 1.35, rate: 16, dmg: 8.2, missiles: 2, flares: 3, reload: 7.5, fill: 0.15,
  },
  sufa: {
    id: 'sufa', he: 'סופה', role: 'עלית', era: '2004', kind: 'לוחם רב־משימתי', level: 19, price: 24000, ace: true,
    desc: 'ה־F-16I. מהירות, זריזות וארבעה טילים — קפיצה אמיתית מעל כל מה שלפניו.',
    hp: 400, speed: 84, boost: 136, turn: 2.1, climb: 1.85, rate: 14, dmg: 9.6, missiles: 3, flares: 3, reload: 6.5, fill: 0.18,
  },
  lavi: {
    id: 'lavi', he: 'לביא', role: 'מתקדם', era: '1987', kind: 'כנף משולשת מודרנית', level: 23, price: 20000,
    desc: 'המטוס שכמעט היה: כנפונים, אוויוניקה מתקדמת ופנייה חדה מכולם.',
    hp: 420, speed: 82, boost: 130, turn: 2.2, climb: 1.9, rate: 12, dmg: 10.8, missiles: 3, flares: 3, reload: 6.5, fill: 0.17,
  },
  phantom: {
    id: 'phantom', he: 'אדיר', role: 'עלית עליון', era: '2016', kind: 'חמקן', level: 27, price: 45000, ace: true,
    desc: 'ה־F-35I מהדור החמישי. הכל בו טוב יותר, וארבעה טילים.',
    hp: 480, speed: 90, boost: 146, turn: 2.25, climb: 2.0, rate: 13, dmg: 12.3, missiles: 4, flares: 4, reload: 5.5, fill: 0.2,
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

export const PLANE_ORDER = ['sparrow', 'gull', 'hornet', 'shahak', 'skyhawk', 'viper', 'bulldog', 'sufa', 'lavi', 'phantom'];
export const START_PLANE = 'sparrow';

/**
 * Upgrades: three, each plane its own — the engine, the weapons, the
 * armour. What you put into one plane stays with that plane. Five tiers each; a tier opens at a level and costs gold (a better
 * plane's tiers cost more). Every tier is a jump you feel: `per` is what one
 * tier adds to (or, for a reload, takes off) each number it touches — five
 * tiers of movement take a starter about as fast as the best plane, five of
 * guns about as deadly as the third best.
 */
export const UPGRADES = {
  engine: { id: 'engine', he: 'מנוע', desc: 'מהירות, פניות ומבער', per: { speed: 0.08, turn: 0.07, climb: 0.07, boost: 0.1, fill: 0.15 } },
  weapons: { id: 'weapons', he: 'נשק', desc: 'נזק, טווח וטעינת טילים · בדרגה 3 טיל נוסף', per: { dps: 0.12, gunRange: 0.08, reload: -0.12, mRange: 0.06 } },
  armor: { id: 'armor', he: 'שריון', desc: 'חיים ונורים · בדרגה 3 נור נוסף', per: { hp: 0.15, flareReload: -0.12 } },
};
export const UPGRADE_ORDER = ['engine', 'weapons', 'armor'];
/** The six upgrades of before, and which of the three each became. */
export const UPGRADE_WAS = { engine: 'engine', turbo: 'engine', guns: 'weapons', missiles: 'weapons', armor: 'armor', flares: 'armor' };
export const TIER_MAX = 5;
export const TIER_COST = [800, 1800, 4000, 8000, 14000];
export const TIER_LEVEL = [2, 5, 9, 14, 20];
/** A tier of a better plane costs more: the starter's are cheap. */
export const PLANE_COST = { sparrow: 0.5, gull: 0.6, hornet: 0.7, shahak: 1, skyhawk: 0.9, viper: 1, bulldog: 1.1, sufa: 1.5, lavi: 1.4, phantom: 1.8 };

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
 *   spread how far a round strays    assist  the cone (rad) the guns are
 *          off true (rad)                    helped onto a plane within
 *   ccm    a missile's head against flares and breaks: the share of them
 *          it sees through
 * Dearer is better at all of it: further, truer, more help onto the target.
 */
export const GUNS = {
  g1: { id: 'g1', he: 'נגב', level: 1, price: 0, range: 250, dmg: 1, rate: 1, spread: 0.009, assist: 0.10, desc: 'מקלע קל, מהיר לטעינה. קצר טווח.' },
  g2: { id: 'g2', he: 'מאג', level: 3, price: 900, range: 300, dmg: 1.12, rate: 1, spread: 0.007, assist: 0.12, desc: 'המקלע של צה"ל: כדור כבד יותר, טווח ארוך יותר.' },
  g3: { id: 'g3', he: 'דפ"א 30', level: 7, price: 2800, range: 350, dmg: 1.32, rate: 0.95, spread: 0.0055, assist: 0.14, desc: 'התותח של המיראז\' והכפיר: פגזים נפיצים, קצב מעט איטי.' },
  g4: { id: 'g4', he: 'וולקן', level: 12, price: 6500, range: 380, dmg: 1.05, rate: 1.45, spread: 0.0045, assist: 0.16, desc: 'רב־קני של הבז והסופה: מטר של פגזים מקרוב.' },
  g5: { id: 'g5', he: 'סערה 30', level: 18, price: 14000, range: 450, dmg: 1.35, rate: 1.3, spread: 0.0025, assist: 0.20, desc: 'תותח כבד ומהיר של אדיר: מדויק, רחוק, וכל פגיעה כואבת.' },
};
export const MISSILES = {
  m1: { id: 'm1', he: 'שפריר', level: 1, price: 0, range: 300, dmg: 72, speed: 195, turn: 3.2, ccm: 0.15, desc: 'טיל החום הראשון של התעשייה הישראלית. קצר טווח.' },
  m2: { id: 'm2', he: 'פיתון 3', level: 4, price: 1200, range: 380, dmg: 88, speed: 205, turn: 3.4, ccm: 0.25, desc: 'של רפאל: ראש קרב גדול, טווח ארוך יותר.' },
  m3: { id: 'm3', he: 'פיתון 5', level: 9, price: 3600, range: 460, dmg: 104, speed: 215, turn: 3.7, ccm: 0.35, desc: 'נועל מכל זווית. קשה מאוד להתחמק ממנו.' },
  m4: { id: 'm4', he: 'דרבי', level: 14, price: 8000, range: 550, dmg: 120, speed: 225, turn: 3.9, ccm: 0.45, desc: 'מונחה מכ"ם: נועל מרחוק ונצמד לפניות חדות.' },
  m5: { id: 'm5', he: 'סקיי סטינג', level: 20, price: 16000, range: 680, dmg: 144, speed: 240, turn: 4.2, ccm: 0.55, desc: 'הדור הבא של רפאל: מעבר לטווח הראייה, ופגיעה קטלנית.' },
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
  // a number, with each tier of the upgrade that touches it on top
  const up = (k, field, v) => v * (1 + UPGRADES[k].per[field] * t(k));
  const G = GUNS[arms.gun] || GUNS[START_GUN], M = MISSILES[arms.missile] || MISSILES[START_MISSILE];
  // the guns tier: rounds a second and damage a round rise together
  const gunK = Math.sqrt(up('weapons', 'dps', 1));
  return {
    plane: p.id,
    hp: Math.round(up('armor', 'hp', p.hp)),
    speed: up('engine', 'speed', p.speed), turn: up('engine', 'turn', p.turn), climb: up('engine', 'climb', p.climb),
    boost: up('engine', 'boost', p.boost), fill: up('engine', 'fill', p.fill),
    rate: p.rate * gunK * G.rate, dmg: p.dmg * gunK * G.dmg,
    gun: G.id, gunRange: Math.round(up('weapons', 'gunRange', G.range)),
    // the weapons tier trues the guns up too: less scatter, more help onto a target
    gunSpread: G.spread * (1 - 0.1 * t('weapons')), gunAssist: G.assist * (1 + 0.06 * t('weapons')),
    missile: M.id, mRange: Math.round(up('weapons', 'mRange', M.range)), mDmg: M.dmg, mSpeed: M.speed, mTurn: M.turn,
    mCcm: Math.min(0.8, M.ccm + 0.03 * t('weapons')),
    missiles: p.missiles + (t('weapons') >= 3 ? 1 : 0),
    reload: up('weapons', 'reload', p.reload),
    flares: p.flares + (t('armor') >= 3 ? 1 : 0),
    flareReload: up('armor', 'flareReload', FLARE_RELOAD),
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
