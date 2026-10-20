// A pilot's record: who they are, what they have earned, what they own.
// Everything that changes it goes through here, so the rules (a level to
// open, gold to pay, one of each) are in one place.
import { ARMS, MAX_LEVEL, PAINTS, PLANES, START_GUN, START_MISSILE, START_PLANE, UPGRADES, UPGRADE_WAS, killReward, levelBonus, levelOf, nextTier, planeOpen, planeOwned, xpAt } from '../shared/planes.js';

const noTiers = () => Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));

export function newPilot(id) {
  return {
    id, name: '', created: Date.now(),
    xp: 0, level: 1, gold: 0,
    kills: 0, deaths: 0, best: 0,
    plane: START_PLANE, planes: [START_PLANE],
    upgrades: { [START_PLANE]: noTiers() }, // each plane its own
    paint: 'stock', paints: ['stock'],
    // the paint each plane wears: switch planes and each comes back as it was left
    paintOf: { [START_PLANE]: 'stock' },
    // the market: what is owned on each shelf, and what is carried
    arms: { guns: [START_GUN], missiles: [START_MISSILE] },
    // what each plane carries
    loadout: { [START_PLANE]: { gun: START_GUN, missile: START_MISSILE } },
  };
}

/** Bring an old or damaged record up to shape. */
export function normalize(p) {
  p.xp = Math.max(0, p.xp | 0);
  p.level = levelOf(p.xp);
  p.gold = Math.max(0, p.gold | 0);
  p.kills |= 0; p.deaths |= 0; p.best |= 0;
  p.gifts = Array.isArray(p.gifts) ? p.gifts.filter((x) => typeof x === 'string').slice(0, 200) : [];
  p.planes = [...new Set([START_PLANE, ...(p.planes || [])].filter((k) => PLANES[k]))];
  if (!p.planes.includes(p.plane)) p.plane = START_PLANE;
  p.paints = [...new Set(['stock', ...(p.paints || [])].filter((k) => PAINTS[k]))];
  if (!p.paints.includes(p.paint)) p.paint = 'stock';
  const po = p.paintOf && typeof p.paintOf === 'object' ? p.paintOf : {};
  p.paintOf = Object.fromEntries(p.planes.map((id) => [id, p.paints.includes(po[id]) ? po[id] : p.paint]));
  p.paint = p.paintOf[p.plane];
  // neon (from the NEON code): on or off for each plane
  p.neon = !!p.neon;
  const no = p.neonOf && typeof p.neonOf === 'object' ? p.neonOf : {};
  p.neonOf = p.neon ? Object.fromEntries(p.planes.filter((id) => no[id]).map((id) => [id, true])) : {};
  const a = p.arms || {};
  p.arms = {
    guns: [...new Set([START_GUN, ...(a.guns || [])].filter((k) => ARMS.guns[k]))],
    missiles: [...new Set([START_MISSILE, ...(a.missiles || [])].filter((k) => ARMS.missiles[k]))],
  };
  // what each plane carries (once one choice for every plane: that becomes
  // each plane's), only what is owned
  const lo = p.loadout || {};
  p.loadout = Object.fromEntries(p.planes.map((id) => {
    const l = lo[id] || { gun: p.gun, missile: p.missile };
    return [id, { gun: p.arms.guns.includes(l.gun) ? l.gun : START_GUN, missile: p.arms.missiles.includes(l.missile) ? l.missile : START_MISSILE }];
  }));
  delete p.gun; delete p.missile;
  p.friends = [...new Set((Array.isArray(p.friends) ? p.friends : []).filter((x) => typeof x === 'string'))].slice(0, 60);
  // upgrades used to be the pilot's, for every plane: an old record keeps
  // them, now on each plane it owns
  // and there were six, now three: each of the three keeps the best of
  // the ones folded into it
  const u = p.upgrades || {};
  const old = Object.keys(UPGRADE_WAS).some((k) => typeof u[k] === 'number');
  const tiers = (t) => {
    const out = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));
    for (const [was, now] of Object.entries(UPGRADE_WAS)) out[now] = Math.max(out[now], Math.max(0, Math.min(5, t?.[was] | 0)));
    if (t) for (const k of Object.keys(UPGRADES)) out[k] = Math.max(out[k], Math.max(0, Math.min(5, t[k] | 0)));
    return out;
  };
  p.upgrades = Object.fromEntries(p.planes.map((id) => [id, tiers(old ? u : u[id])]));
  return p;
}

/** What the client is told about its own pilot. */
export const view = (p) => ({
  name: p.name, tag: p.tag || 0, xp: p.xp, level: p.level, gold: p.gold,
  kills: p.kills, deaths: p.deaths, best: p.best,
  plane: p.plane, planes: p.planes, upgrades: p.upgrades, paint: p.paint, paints: p.paints, paintOf: p.paintOf, neon: p.neon, neonOf: p.neonOf,
  arms: p.arms, loadout: p.loadout,
  // the admin asked for a new name: nothing until one is chosen
  mustRename: !!p.mustRename,
});

/** Buy a plane: open at this level, not owned, and the gold to pay. */
export function buyPlane(p, id) {
  if (!PLANES[id]) return { error: 'no_such_plane' };
  if (PLANES[id].gift) return { error: 'gift_only' };
  if (planeOwned(p, id)) return { error: 'owned' };
  if (!planeOpen(p, id)) return { error: 'level' };
  if (p.gold < PLANES[id].price) return { error: 'gold' };
  p.gold -= PLANES[id].price;
  p.planes.push(id);
  p.upgrades[id] ||= noTiers();
  p.loadout[id] ||= { ...(p.loadout[p.plane] || { gun: START_GUN, missile: START_MISSILE }) };
  p.plane = id;
  return { ok: true };
}

/**
 * The admin's hand on a pilot: set or add gold, give a plane (or all of
 * them), set the level. Nothing is bought: no level asked, no gold paid.
 */
export const GOLD_MAX = 1e9;
export function adminEdit(p, b = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  let did = false;
  if (b.gold != null) {
    const g = num(b.gold);
    if (g == null) return { error: 'bad_gold' };
    p.gold = Math.max(0, Math.min(GOLD_MAX, g)); did = true;
  }
  if (b.addGold != null) {
    const g = num(b.addGold);
    if (g == null) return { error: 'bad_gold' };
    p.gold = Math.max(0, Math.min(GOLD_MAX, (p.gold || 0) + g)); did = true;
  }
  if (b.level != null) {
    const l = num(b.level);
    if (l == null || l < 1 || l > MAX_LEVEL) return { error: 'bad_level' };
    p.xp = xpAt(l); p.level = levelOf(p.xp); did = true;
  }
  const give = b.plane === 'all' ? Object.keys(PLANES) : b.plane != null ? [String(b.plane)] : [];
  for (const id of give) {
    if (!Object.hasOwn(PLANES, id)) return { error: 'no_such_plane' };
    if (!planeOwned(p, id)) p.planes.push(id);
    p.upgrades[id] ||= noTiers();
    p.loadout[id] ||= { ...(p.loadout[p.plane] || { gun: START_GUN, missile: START_MISSILE }) };
    did = true;
  }
  return did ? { ok: true } : { error: 'nothing_to_do' };
}

/**
 * Gift codes: a word handed out (ALFASI), typed in the hangar, good once
 * for each pilot. Each gives a plane (and whatever else is added here).
 */
export const GIFTS = {
  ALFASI: { plane: 'alfasi', he: 'מסוק הקרב של אלפסי' },
  SHUSTER: { plane: 'shuster', he: 'מטוס הקרב של שוסטר' },
  // not a plane: a glow for every paint, on any plane you choose
  NEON: { neon: true, he: 'ניאון — כל צבע זוהר' },
};
export const giftKey = (code) => String(code || '').trim().toUpperCase().replace(/\s+/g, '');
export function redeemGift(p, code) {
  const k = giftKey(code);
  const g = Object.hasOwn(GIFTS, k) ? GIFTS[k] : null;
  if (!g) return { error: 'no_such_gift' };
  p.gifts ||= [];
  if (p.gifts.includes(k)) return { error: 'gift_used' };
  p.gifts.push(k);
  if (g.plane) {
    if (!planeOwned(p, g.plane)) p.planes.push(g.plane);
    p.upgrades[g.plane] ||= noTiers();
    p.loadout[g.plane] ||= { ...(p.loadout[p.plane] || { gun: START_GUN, missile: START_MISSILE }) };
    p.plane = g.plane;
  }
  if (g.gold) p.gold = (p.gold || 0) + g.gold;
  if (g.neon) p.neon = true, (p.neonOf ||= {})[p.plane] = true;
  return { ok: true, gift: { he: g.he, plane: g.plane || '', gold: g.gold || 0, neon: !!g.neon } };
}

/** Take a plane you own out of the hangar. */
export function choosePlane(p, id) {
  if (!PLANES[id]) return { error: 'no_such_plane' };
  if (!planeOwned(p, id)) return { error: 'not_owned' };
  p.plane = id;
  // its own paint (and, in loadout and upgrades, its own weapons and tiers)
  p.paint = p.paintOf?.[id] || p.paint;
  return { ok: true };
}

/** Buy a paint (and wear it), or wear one you have. */
export function buyPaint(p, id, plane = p.plane) {
  if (!PAINTS[id]) return { error: 'no_such_paint' };
  if (p.paints.includes(id)) return { error: 'owned' };
  if (!PLANES[plane] || !planeOwned(p, plane)) return { error: 'not_owned' };
  if (p.gold < PAINTS[id].price) return { error: 'gold' };
  p.gold -= PAINTS[id].price;
  p.paints.push(id);
  return wear(p, id, plane);
}
/** Paint one of your planes (the one flown, unless said): that plane wears it from now on. */
export function choosePaint(p, id, plane = p.plane) {
  if (!PAINTS[id]) return { error: 'no_such_paint' };
  if (!p.paints.includes(id)) return { error: 'not_owned' };
  if (!PLANES[plane] || !planeOwned(p, plane)) return { error: 'not_owned' };
  return wear(p, id, plane);
}
/** Neon on (or off) for one of your planes: every colour it wears glows. */
export function setNeon(p, on, plane = p.plane) {
  if (!p.neon) return { error: 'no_neon' };
  if (!PLANES[plane] || !planeOwned(p, plane)) return { error: 'not_owned' };
  if (on) (p.neonOf ||= {})[plane] = true; else delete p.neonOf?.[plane];
  return { ok: true, plane };
}
function wear(p, id, plane) {
  (p.paintOf ||= {})[plane] = id;
  if (plane === p.plane) p.paint = id;
  return { ok: true, plane };
}

/**
 * The market: buy a gun or a missile (open at a level, gold to pay, once)
 * and carry it; or carry one already owned. `kind` is 'guns' or 'missiles'.
 */
// own keys only: a name off the wire is not to reach Object.prototype
const armOf = (kind, id) => (Object.hasOwn(ARMS, kind) && Object.hasOwn(ARMS[kind], id) ? ARMS[kind][id] : null);
export function buyArm(p, kind, id, plane = p.plane) {
  const w = armOf(kind, id);
  if (!w) return { error: 'no_such_weapon' };
  if (p.arms[kind].includes(id)) return { error: 'owned' };
  if (p.level < w.level) return { error: 'level' };
  if (p.gold < w.price) return { error: 'gold' };
  p.gold -= w.price;
  p.arms[kind].push(id);
  // bought for a plane: it goes straight on it (if that plane is yours)
  return planeOwned(p, plane) ? equipArm(p, kind, id, plane) : { ok: true };
}
/** Put a gun or missile you own on one of your planes: that plane carries it from now on. */
export function equipArm(p, kind, id, plane = p.plane) {
  if (!armOf(kind, id)) return { error: 'no_such_weapon' };
  if (!p.arms[kind].includes(id)) return { error: 'not_owned' };
  if (!PLANES[plane] || !planeOwned(p, plane)) return { error: 'not_owned' };
  const l = (p.loadout[plane] ||= { gun: START_GUN, missile: START_MISSILE });
  if (kind === 'guns') l.gun = id; else l.missile = id;
  return { ok: true, plane };
}

/** Buy the next tier of an upgrade, for one plane (the one flown, unless said). */
export function buyUpgrade(p, id, plane = p.plane) {
  if (!UPGRADES[id]) return { error: 'no_such_upgrade' };
  if (!PLANES[plane]) return { error: 'no_such_plane' };
  if (!planeOwned(p, plane)) return { error: 'not_owned' };
  const n = nextTier(p, id, plane);
  if (!n) return { error: 'max' };
  if (p.level < n.level) return { error: 'level' };
  if (p.gold < n.cost) return { error: 'gold' };
  p.gold -= n.cost;
  (p.upgrades[plane] ||= noTiers())[id] = n.tier;
  return { ok: true, tier: n.tier, plane };
}

/** Pay a lump of xp and gold (the bomber's share), level-up bonuses included. */
export function payBonus(p, { xp = 0, gold = 0 }) {
  const before = p.level;
  p.xp += xp; p.gold += gold;
  p.level = levelOf(p.xp);
  let bonus = 0;
  for (let l = before + 1; l <= p.level; l++) bonus += levelBonus(l);
  p.gold += bonus;
  return { xp, gold, bonus, level: p.level, up: p.level > before };
}

/**
 * Pay for a kill (or an assist). Returns what was paid and whether the pilot
 * went up a level, for the screen to celebrate.
 */
export function payKill(p, victim, { streak = 0, assist = false } = {}) {
  const r = killReward(victim.level, { bot: victim.bot, streak, assist });
  const before = p.level;
  p.xp += r.xp;
  p.gold += r.gold;
  p.level = levelOf(p.xp);
  let bonus = 0;
  for (let l = before + 1; l <= p.level; l++) bonus += levelBonus(l);
  p.gold += bonus;
  if (!assist) p.kills++;
  return { ...r, bonus, level: p.level, up: p.level > before };
}
