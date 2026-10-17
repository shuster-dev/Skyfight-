// A pilot's record: who they are, what they have earned, what they own.
// Everything that changes it goes through here, so the rules (a level to
// open, gold to pay, one of each) are in one place.
import { PLANES, START_PLANE, UPGRADES, killReward, levelOf, nextTier, planeOpen, planeOwned } from '../shared/planes.js';

export function newPilot(id) {
  return {
    id, name: '', created: Date.now(),
    xp: 0, level: 1, gold: 0,
    kills: 0, deaths: 0, best: 0,
    plane: START_PLANE, planes: [START_PLANE],
    upgrades: { engine: 0, armor: 0, guns: 0, missiles: 0 },
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
  p.upgrades = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, Math.max(0, Math.min(5, p.upgrades?.[k] | 0))]));
  return p;
}

/** What the client is told about its own pilot. */
export const view = (p) => ({
  name: p.name, xp: p.xp, level: p.level, gold: p.gold,
  kills: p.kills, deaths: p.deaths, best: p.best,
  plane: p.plane, planes: p.planes, upgrades: p.upgrades,
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
  if (!assist) p.kills++;
  return { ...r, level: p.level, up: p.level > before };
}
