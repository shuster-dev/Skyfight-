// A pilot's record: who they are, what they have earned, what they own.
// Everything that changes it goes through here, so the rules (a level to
// open, gold to pay, one of each) are in one place.
import { PAINTS, PLANES, START_PLANE, UPGRADES, killReward, levelBonus, levelOf, nextTier, planeOpen, planeOwned } from '../shared/planes.js';

export function newPilot(id) {
  return {
    id, name: '', created: Date.now(),
    xp: 0, level: 1, gold: 0,
    kills: 0, deaths: 0, best: 0,
    plane: START_PLANE, planes: [START_PLANE],
    upgrades: { engine: 0, armor: 0, guns: 0, missiles: 0, flares: 0 },
    paint: 'stock', paints: ['stock'],
  };
}

/** Bring an old or damaged record up to shape. */
export function normalize(p) {
  p.xp = Math.max(0, p.xp | 0);
  p.level = levelOf(p.xp);
  p.gold = Math.max(0, p.gold | 0);
  p.kills |= 0; p.deaths |= 0; p.best |= 0;
  p.planes = [...new Set([START_PLANE, ...(p.planes || [])].filter((k) => PLANES[k]))];
  if (!p.planes.includes(p.plane)) p.plane = START_PLANE;
  p.paints = [...new Set(['stock', ...(p.paints || [])].filter((k) => PAINTS[k]))];
  if (!p.paints.includes(p.paint)) p.paint = 'stock';
  p.friends = [...new Set((Array.isArray(p.friends) ? p.friends : []).filter((x) => typeof x === 'string'))].slice(0, 60);
  p.upgrades = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, Math.max(0, Math.min(5, p.upgrades?.[k] | 0))]));
  return p;
}

/** What the client is told about its own pilot. */
export const view = (p) => ({
  name: p.name, tag: p.tag || 0, xp: p.xp, level: p.level, gold: p.gold,
  kills: p.kills, deaths: p.deaths, best: p.best,
  plane: p.plane, planes: p.planes, upgrades: p.upgrades, paint: p.paint, paints: p.paints,
});

/** Buy a plane: open at this level, not owned, and the gold to pay. */
export function buyPlane(p, id) {
  if (!PLANES[id]) return { error: 'no_such_plane' };
  if (planeOwned(p, id)) return { error: 'owned' };
  if (!planeOpen(p, id)) return { error: 'level' };
  if (p.gold < PLANES[id].price) return { error: 'gold' };
  p.gold -= PLANES[id].price;
  p.planes.push(id);
  p.plane = id;
  return { ok: true };
}

/** Take a plane you own out of the hangar. */
export function choosePlane(p, id) {
  if (!PLANES[id]) return { error: 'no_such_plane' };
  if (!planeOwned(p, id)) return { error: 'not_owned' };
  p.plane = id;
  return { ok: true };
}

/** Buy a paint (and wear it), or wear one you have. */
export function buyPaint(p, id) {
  if (!PAINTS[id]) return { error: 'no_such_paint' };
  if (p.paints.includes(id)) return { error: 'owned' };
  if (p.gold < PAINTS[id].price) return { error: 'gold' };
  p.gold -= PAINTS[id].price;
  p.paints.push(id);
  p.paint = id;
  return { ok: true };
}
export function choosePaint(p, id) {
  if (!PAINTS[id]) return { error: 'no_such_paint' };
  if (!p.paints.includes(id)) return { error: 'not_owned' };
  p.paint = id;
  return { ok: true };
}

/** Buy the next tier of an upgrade. */
export function buyUpgrade(p, id) {
  if (!UPGRADES[id]) return { error: 'no_such_upgrade' };
  const n = nextTier(p, id);
  if (!n) return { error: 'max' };
  if (p.level < n.level) return { error: 'level' };
  if (p.gold < n.cost) return { error: 'gold' };
  p.gold -= n.cost;
  p.upgrades[id] = n.tier;
  return { ok: true, tier: n.tier };
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
