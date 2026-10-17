// The rules, checked without a server or a browser: flying, shooting, paying,
// and the hangar's prices. `npm run qa`
import { PLANES, PLANE_ORDER, UPGRADES, TIER_COST, TIER_LEVEL, statsOf, xpAt, xpStep, levelOf, levelProgress, killReward, cleanCallsign, nextTier, MAX_LEVEL } from '../src/shared/planes.js';
import { ARENA, BRIDGE, BUILDINGS, groundAt, hitsSolid, inBay, spawnPoint, surfaceAt, terrainAt, underBridge } from '../src/shared/arena.js';
import { fly, flyQ, forward, newBody, newBodyQ, plausibleMove, BOOST, Q } from '../src/shared/flight.js';
import { GUN, MISSILE, RAM, aimDir, blastDamage, closestOn, offNose, pickTarget, ramDamage, segmentHit, steerMissile } from '../src/shared/combat.js';
import { newPilot, normalize, buyPlane, buyUpgrade, choosePlane, payKill, view } from '../src/server/pilot.js';

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, info === undefined ? '' : JSON.stringify(info)); }
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

console.log('\nplanes');
ok('five planes, in order of level', PLANE_ORDER.length === 5 && PLANE_ORDER.every((k, i) => !i || PLANES[k].level > PLANES[PLANE_ORDER[i - 1]].level));
ok('the first plane is free and open at level 1', PLANES.sparrow.price === 0 && PLANES.sparrow.level === 1);
ok('every plane has a Hebrew name and a description', PLANE_ORDER.every((k) => PLANES[k].he && PLANES[k].desc));
ok('prices rise with level', PLANE_ORDER.every((k, i) => !i || PLANES[k].price > PLANES[PLANE_ORDER[i - 1]].price));
{
  const base = statsOf('sparrow'), up = statsOf('sparrow', { engine: 5, armor: 5, guns: 5, missiles: 5, flares: 5 });
  ok('no upgrades: the plane as it is', base.hp === 100 && base.speed === 60 && base.missiles === 1);
  ok('engine 5: a quarter faster', near(up.speed, 60 * 1.25) && near(up.boost, 92 * 1.25));
  ok('armor 5: 60% more health', up.hp === 160);
  ok('guns 5: 30% more damage and 30% faster fire', near(up.dmg, base.dmg * 1.3) && near(up.rate, base.rate * 1.3));
  ok('engine 5: the burner refills faster', up.fill > base.fill * 1.7);
  ok('flares 3+: one more flare, and faster reload', up.flares === base.flares + 1 && up.flareReload < base.flareReload * 0.4);
  ok('missiles 3+: one more missile, and faster reload', up.missiles === 2 && up.reload < base.reload);
  ok('nonsense tiers are clamped', statsOf('sparrow', { engine: 99 }).speed === up.speed && statsOf('sparrow', { engine: -4 }).speed === 60);
  ok('an unknown plane flies as the first', statsOf('nope').plane === 'sparrow');
}

console.log('\nlevels');
ok('level 1 starts at 0', xpAt(1) === 0 && levelOf(0) === 1);
ok('level 2 at the first step', levelOf(xpStep(1)) === 2 && levelOf(xpStep(1) - 1) === 1);
ok('levels are monotone up to the cap', Array.from({ length: MAX_LEVEL - 1 }, (_, i) => xpAt(i + 2) > xpAt(i + 1)).every(Boolean));
ok('the cap holds', levelOf(1e9) === MAX_LEVEL && levelProgress(1e9) === 1);
ok('progress is a fraction', near(levelProgress(xpStep(1) / 2), 0.5));
{
  const human = killReward(5), bot = killReward(5, { bot: true });
  ok('a pilot pays more than a bot', human.xp > bot.xp && human.gold > bot.gold, { human, bot });
  ok('a higher level pays more', killReward(10).xp > killReward(2).xp);
  ok('a streak adds, up to half again', killReward(5, { streak: 3 }).xp > human.xp && killReward(5, { streak: 50 }).xp === Math.round((60 + 40) * 1.5));
  ok('an assist pays half', killReward(5, { assist: true }).xp === Math.round(human.xp / 2));
  // the first level should not take an hour: about three bot kills
  const k = Math.ceil(xpStep(1) / killReward(1, { bot: true }).xp);
  ok('level 2 in a few kills', k >= 2 && k <= 4, k);
}

console.log('\ncallsigns');
ok('Hebrew is a name', cleanCallsign('  טייס  מהיר ') === 'טייס מהיר');
ok('Latin and digits', cleanCallsign('Ace_99') === 'Ace_99');
ok('too short or too long is not', !cleanCallsign('a') && !cleanCallsign('x'.repeat(15)));
ok('markup is not a name', !cleanCallsign('<b>hi</b>') && !cleanCallsign('a;drop'));

console.log('\nthe arena');
{
  const B = BRIDGE;
  ok('the sea is to the west, at zero', groundAt(-600, 0) === 0 && terrainAt(-600, 0) < 0);
  ok('mountains rise in the east', terrainAt(1100, 0) > 150, terrainAt(1100, 0));
  ok('the city is flat ground by the bay', BUILDINGS.length > 120 && BUILDINGS.every((b) => b.base > 2 && b.base < 15), BUILDINGS.length);
  ok('downtown has towers', BUILDINGS.some((b) => b.h > 120) && BUILDINGS.every((b) => b.h <= 185));
  ok('no building stands in the bay or on the bridge', BUILDINGS.every((b) => inBay(b.x, b.z) === 0 && !(Math.abs(b.x - B.x) < 40 && b.z > B.z0 - 20 && b.z < B.z1 + 20)));
  ok('the bridge stands over water', terrainAt(B.x, B.cz) < 0 && B.towers.every((z) => terrainAt(B.x, z) < 0));
  ok('under the deck is open sky to fly through', !hitsSolid(B.x, 25, B.cz) && underBridge(B.x, 25, B.cz));
  ok('the deck is solid', hitsSolid(B.x, 46, B.cz) === 'bridge');
  ok('the towers are solid', hitsSolid(B.x + B.legOffset, 120, B.towers[0]) === 'bridge');
  ok('between the cables over the deck is open', !hitsSolid(B.x, 80, B.cz));
  const tall = BUILDINGS.reduce((a, b) => (b.h > a.h ? b : a));
  ok('a building is solid, and only up to its roof', hitsSolid(tall.x, tall.base + tall.h - 5, tall.z) === 'building' && !hitsSolid(tall.x, tall.base + tall.h + 5, tall.z));
  ok('the surface over a tower is its roof', surfaceAt(tall.x, tall.z) === tall.base + tall.h);
  ok('the sea and the ground are told apart', hitsSolid(-600, 1, 0) === 'sea' && hitsSolid(1100, terrainAt(1100, 0) + 1, 0) === 'ground');
  const pts = Array.from({ length: 12 }, (_, n) => spawnPoint(n));
  ok('spawns are in the air, well clear of anything', pts.every((s) => s.y > surfaceAt(s.x, s.z) + 100), pts.map((s) => Math.round(s.y - surfaceAt(s.x, s.z))));
  ok('spawns face the middle', pts.every((s) => { const f = forward(s.yaw, 0); return f.x * -s.x + f.z * -s.z > 0.99 * Math.hypot(s.x, s.z); }));
  ok('the ground is the same every time', terrainAt(100, 33) === terrainAt(100, 33));
}

console.log('\nflying');
{
  const st = statsOf('sparrow');
  const b = newBody({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  for (let i = 0; i < 30; i++) fly(b, {}, st, 1 / 30);
  ok('yaw 0 flies toward -z at cruise', b.z < -55 && near(b.x, 0, 1e-6) && near(b.speed, 60, 0.5), b);
  const r = newBody({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  for (let i = 0; i < 30; i++) fly(r, { turn: 1 }, st, 1 / 30);
  ok('right turns right (+x when heading -z)', r.x > 5, r.x);
  ok('and banks right wing down', r.roll < -0.5, r.roll);
  const c = newBody({ x: 0, y: 200, z: 0 }, st);
  for (let i = 0; i < 30; i++) fly(c, { climb: 1 }, st, 1 / 30);
  ok('climbing climbs', c.y > 215 && c.pitch > 0.9, c.y);
  const l = newBody({ x: 0, y: 200, z: 0, pitch: 0.8 }, st);
  for (let i = 0; i < 90; i++) fly(l, {}, st, 1 / 30);
  ok('let go and the nose comes back level', Math.abs(l.pitch) < 0.1, l.pitch);
  const u = newBody({ x: 0, y: ARENA.ceiling - 1, z: 0, pitch: 1 }, st);
  for (let i = 0; i < 30; i++) fly(u, { climb: 1 }, st, 1 / 30);
  ok('the ceiling holds', u.y <= ARENA.ceiling);
  const d = newBody({ x: 3000, y: 50, z: 3000, pitch: -1.2 }, st);
  let res = '';
  for (let i = 0; i < 300 && res !== 'crash'; i++) res = fly(d, { climb: -1 }, st, 1 / 30);
  ok('diving into the sea is a crash', res === 'crash');
  const e = newBody({ x: ARENA.radius + 50, y: 300, z: 0, yaw: -Math.PI / 2 }, st); // heading +x, outward
  for (let i = 0; i < 30 * 6; i++) fly(e, {}, st, 1 / 30);
  ok('past the edge the plane is turned home', Math.hypot(e.x, e.z) < ARENA.radius + 150 && forward(e.yaw, 0).x < 0, { x: e.x, yaw: e.yaw });
  const bo = newBody({ x: 0, y: 300, z: 0 }, st);
  for (let i = 0; i < 60; i++) fly(bo, { boost: true }, st, 1 / 30);
  ok('the burner speeds up and burns the tank', bo.speed > 80 && bo.fuel < 0.6, bo);
  for (let i = 0; i < 30 * 8; i++) fly(bo, { boost: true }, st, 1 / 30);
  ok('an empty tank burns no more', !bo.boosting && bo.fuel <= BOOST.min + 0.01);
}
{
  const st = statsOf('sparrow');
  ok('a normal move is plausible', plausibleMove({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -60 }, 0.5, st));
  ok('a teleport is not', !plausibleMove({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -900 }, 0.5, st));
}

console.log('\nfree flight: loops');
{
  const st = statsOf('sparrow');
  ok('euler and quaternion agree on the nose', (() => { const q = Q.euler(0.7, 0.3, 0), f = Q.rot(q, 0, 0, -1), g = forward(0.7, 0.3); return near(f.x, g.x, 1e-9) && near(f.y, g.y, 1e-9) && near(f.z, g.z, 1e-9); })());
  const b = newBodyQ({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  // hold the stick back: a full loop, the nose passing straight up and over
  let maxUp = 0, wentOver = false, steps = 0;
  const startYaw = b.yaw;
  for (; steps < 30 * 12; steps++) {
    flyQ(b, { climb: 1 }, st, 1 / 30);
    const f = Q.rot(b.q, 0, 0, -1), u = Q.rot(b.q, 0, 1, 0);
    maxUp = Math.max(maxUp, f.y);
    if (u.y < -0.5) wentOver = true;
    if (wentOver && f.y > -0.05 && f.y < 0.05 && u.y > 0.9) break;
  }
  ok('holding the stick back flies a whole loop', maxUp > 0.99 && wentOver, { maxUp, wentOver, steps });
  ok('and comes out the way it went in', Math.abs(Math.atan2(Math.sin(b.yaw - startYaw), Math.cos(b.yaw - startYaw))) < 0.2, b.yaw);
  ok('nothing stops the nose at the vertical', steps < 30 * 12);
  // upside down, hands off: it rolls back upright
  const i = newBodyQ({ x: 0, y: 300, z: 0 }, st);
  i.q = Q.mul(i.q, Q.axis(0, 0, 1, Math.PI * 0.95));
  for (let k = 0; k < 30 * 4; k++) flyQ(i, {}, st, 1 / 30);
  ok('upside down with the stick let go, it rights itself', Q.rot(i.q, 0, 1, 0).y > 0.9);
  // level turn: right is right, as in `fly`
  const t = newBodyQ({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  for (let k = 0; k < 30; k++) flyQ(t, { turn: 1 }, st, 1 / 30);
  ok('a right turn turns right', t.x > 5, t.x);
  const c = newBodyQ({ x: 3000, y: 60, z: 3000 }, st);
  let r = '';
  for (let k = 0; k < 600 && r !== 'crash'; k++) r = flyQ(c, { climb: -1 }, st, 1 / 30);
  ok('and the sea is still the sea', r === 'crash');
}

console.log('\nguns and missiles');
ok('a segment through a sphere hits', segmentHit(0, 0, 0, 0, 0, -20, 0, 0, -10, 2) > 0.3);
ok('a segment beside it does not', segmentHit(0, 0, 0, 0, 0, -20, 5, 0, -10, 2) === -1);
ok('a segment that stops short does not', segmentHit(0, 0, 0, 0, 0, -5, 0, 0, -10, 2) === -1);
{
  const me = { x: 0, y: 100, z: 0, yaw: 0, pitch: 0, alive: true };
  const ahead = { x: 0, y: 100, z: -200, alive: true, vel: { x: 50, y: 0, z: 0 } };
  const side = { x: 200, y: 100, z: 0, alive: true };
  ok('dead ahead is off the nose by ~0', offNose(me, 0, 0, ahead) < 1e-6);
  ok('the target picked is the one in front', pickTarget(me, [me, ahead, side], 0.3, 500) === ahead);
  ok('nothing in the cone: nothing', pickTarget(me, [me, side], 0.3, 500) === null);
  const d = aimDir(me, ahead);
  ok('guns lead a crossing target', d.x > 0.01 && d.z < -0.9, d);
  const m = { x: 0, y: 100, z: 0, yaw: Math.PI / 2, pitch: 0 }; // facing -x
  for (let i = 0; i < 90; i++) steerMissile(m, ahead, 1 / 30);
  ok('a missile turns after its target', Math.hypot(m.x - ahead.x, m.z - ahead.z) < 200, m);
}

console.log('\nmid-air collisions');
ok('a missile passing close goes off by a plane it was not after', closestOn(0, 0, 0, 0, 0, -40, 9, 0, -20) === 0.5 && MISSILE.fuse > 9);
ok('the blast hurts in full up close', blastDamage(2) === MISSILE.dmg && blastDamage(MISSILE.full) === MISSILE.dmg);
ok('less further out, nothing past the blast', blastDamage(12) < MISSILE.dmg && blastDamage(12) > blastDamage(18) && blastDamage(MISSILE.blast + 1) === 0);
ok('the fuse is inside the blast', blastDamage(MISSILE.fuse) > 0);
ok('a graze side by side takes a bite', ramDamage(5) === RAM.min);
ok('a head-on at speed brings down even the heaviest plane', ramDamage(60 + 70) >= 100 && ramDamage(120 + 120) >= statsOf('bulldog', { armor: 5 }).hp, ramDamage(240));
ok('more speed, more damage', ramDamage(80) > ramDamage(40));

console.log('\nthe hangar');
{
  const p = newPilot('u1');
  ok('a new pilot flies the first plane', p.plane === 'sparrow' && p.planes.includes('sparrow') && p.level === 1);
  ok('cannot buy a plane above your level', buyPlane(p, 'hornet').error === 'level');
  p.xp = xpAt(3); normalize(p);
  ok('the level is worked out from xp', p.level === 3);
  ok('cannot buy without the gold', buyPlane(p, 'hornet').error === 'gold');
  p.gold = 2000;
  ok('with both, it is bought and flown', buyPlane(p, 'hornet').ok && p.plane === 'hornet' && p.gold === 500);
  ok('not twice', buyPlane(p, 'hornet').error === 'owned');
  ok('back to the first plane', choosePlane(p, 'sparrow').ok && p.plane === 'sparrow');
  ok('not one you do not own', choosePlane(p, 'phantom').error === 'not_owned');
  p.gold = 1000;
  ok('the first upgrade costs its price', buyUpgrade(p, 'engine').ok && p.upgrades.engine === 1 && p.gold === 1000 - TIER_COST[0], p);
  p.gold = 1e6;
  ok('the second tier waits for its level', buyUpgrade(p, 'engine').error === 'level' && p.level < TIER_LEVEL[1]);
  p.xp = xpAt(30); normalize(p);
  for (let i = 0; i < 9; i++) buyUpgrade(p, 'engine');
  ok('five tiers and no more', p.upgrades.engine === 5 && buyUpgrade(p, 'engine').error === 'max' && nextTier(p, 'engine') === null);
  ok('an unknown upgrade is refused', buyUpgrade(p, 'laser').error === 'no_such_upgrade');
  const q = newPilot('u2');
  const r = payKill(q, { level: 1, bot: true });
  ok('a kill pays xp, gold and counts', q.xp === r.xp && q.gold === r.gold && q.kills === 1);
  const a = payKill(q, { level: 1, bot: true }, { assist: true });
  ok('an assist pays but is not a kill', q.kills === 1 && a.xp > 0);
  for (let i = 0; i < 3; i++) payKill(q, { level: 1, bot: true });
  ok('kills raise the level', q.level >= 2);
  const z = newPilot('u3');
  z.xp = xpAt(2) - 1;
  const lv = payKill(z, { level: 5, bot: false });
  ok('a level up pays a gold bonus on top', lv.up && lv.bonus === 200 && z.gold === lv.gold + 200, lv);
  const broken = normalize({ id: 'x', xp: -5, plane: 'jet', planes: ['jet'], upgrades: { engine: 77 } });
  ok('a broken record is mended', broken.xp === 0 && broken.plane === 'sparrow' && broken.upgrades.engine === 5 && broken.upgrades.armor === 0 && broken.upgrades.flares === 0);
  ok('the view has no id', !('id' in view(p)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
