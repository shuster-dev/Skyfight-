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
 */
export const PLANES = {
  sparrow: {
    id: 'sparrow', he: 'סער', role: 'מאוזן', era: '1944', kind: 'מטוס בוכנה', level: 1, price: 0,
    desc: 'לוחם הבוכנה האחרון של מלחמת העולם השנייה. סולח על טעויות — מושלם לטיסה הראשונה.',
    guns: 'שישה מקלעים 12.7 מ"מ', missile: 'רקטות',
    hp: 100, speed: 60, boost: 92, turn: 1.5, climb: 1.3, rate: 12, dmg: 3.2, missiles: 1, flares: 2,
  },
  hornet: {
    id: 'hornet', he: 'ברק', role: 'מהיר', era: '1953', kind: 'סילון כנף משוכה', level: 3, price: 1500,
    desc: 'דור הסילונים הראשון: כנף משוכה ומתכת חשופה. פוגע ובורח לפני שמספיקים להסתובב.',
    guns: 'שישה מקלעים 12.7 מ"מ', missile: 'טיל מונחה חום',
    hp: 85, speed: 70, boost: 112, turn: 1.6, climb: 1.4, rate: 13, dmg: 3.5, missiles: 1, flares: 2,
  },
  bulldog: {
    id: 'bulldog', he: 'רעם', role: 'משוריין', era: '1976', kind: 'לוחם עליונות אווירית', level: 6, price: 4000,
    desc: 'דו־מנועי כבד עם שני זנבות ותותח רב־קני. איטי בפניות — אבל כמעט לא נופל.',
    guns: 'תותח רב־קני 20 מ"מ', missile: 'טיל מונחה חום',
    hp: 165, speed: 54, boost: 84, turn: 1.25, climb: 1.1, rate: 16, dmg: 2.8, missiles: 1, flares: 3,
  },
  viper: {
    id: 'viper', he: 'כפיר', role: 'זריז', era: '1975', kind: 'כנף משולשת', level: 10, price: 9000,
    desc: 'כנף משולשת עם כנפונים. מסתובב בתוך העיגול של כל אחד אחר, ושני טילים.',
    guns: 'שני תותחים 30 מ"מ', missile: 'טיל מונחה חום',
    hp: 110, speed: 66, boost: 106, turn: 1.95, climb: 1.65, rate: 8, dmg: 6.75, missiles: 2, flares: 2,
  },
  phantom: {
    id: 'phantom', he: 'אדיר', role: 'עליון', era: '2016', kind: 'חמקן', level: 16, price: 20000,
    desc: 'מטוס חמקן מהדור החמישי. הכל בו טוב יותר, ושלושה טילים.',
    guns: 'תותח 25 מ"מ', missile: 'טיל מונחה מכ"ם',
    hp: 145, speed: 72, boost: 118, turn: 1.8, climb: 1.55, rate: 11, dmg: 5.45, missiles: 3, flares: 3,
  },
};
export const PLANE_ORDER = ['sparrow', 'hornet', 'bulldog', 'viper', 'phantom'];
export const START_PLANE = 'sparrow';

/**
 * Upgrades: the pilot's, not the plane's — what you bought goes with you to
 * every plane you fly. Each has five tiers; a tier opens at a level and costs
 * gold. `per` is what one tier adds (a fraction of the plane's own number).
 */
export const UPGRADES = {
  engine: { id: 'engine', he: 'מנוע', icon: '🔥', desc: 'מהירות ומבער אחורי', per: 0.05 },
  armor: { id: 'armor', he: 'שריון', icon: '🛡️', desc: 'עוד חיים', per: 0.12 },
  guns: { id: 'guns', he: 'תותחים', icon: '💥', desc: 'עוד נזק לכל כדור', per: 0.1 },
  missiles: { id: 'missiles', he: 'טילים', icon: '🚀', desc: 'טעינה מהירה יותר · בדרגה 3 טיל נוסף', per: 0.12 },
};
export const UPGRADE_ORDER = ['engine', 'armor', 'guns', 'missiles'];
export const TIER_MAX = 5;
export const TIER_COST = [600, 1400, 3000, 6000, 11000];
export const TIER_LEVEL = [2, 5, 9, 14, 20];

/** What the next tier of an upgrade asks for, or null at the top. */
export function nextTier(pilot, id) {
  const have = pilot.upgrades?.[id] || 0;
  if (have >= TIER_MAX) return null;
  return { tier: have + 1, cost: TIER_COST[have], level: TIER_LEVEL[have] };
}

/** Missile reload, seconds, before upgrades. */
export const MISSILE_RELOAD = 7;

/** A plane as this pilot flies it: the plane's numbers with their upgrades on. */
export function statsOf(planeId, upgrades = {}) {
  const p = PLANES[planeId] || PLANES[START_PLANE];
  const t = (k) => Math.max(0, Math.min(TIER_MAX, upgrades[k] | 0));
  const eng = 1 + UPGRADES.engine.per * t('engine');
  return {
    plane: p.id,
    hp: Math.round(p.hp * (1 + UPGRADES.armor.per * t('armor'))),
    speed: p.speed * eng,
    boost: p.boost * eng,
    turn: p.turn, climb: p.climb,
    rate: p.rate, flares: p.flares,
    dmg: p.dmg * (1 + UPGRADES.guns.per * t('guns')),
    missiles: p.missiles + (t('missiles') >= 3 ? 1 : 0),
    reload: MISSILE_RELOAD * (1 - UPGRADES.missiles.per * t('missiles')),
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
