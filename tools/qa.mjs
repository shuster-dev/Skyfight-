// The rules, checked without a server or a browser: flying, shooting, paying,
// and the hangar's prices. `npm run qa`
import { GUNS, MISSILES, GUN_ORDER, MISSILE_ORDER, PLANES, PLANE_ORDER, UPGRADES, TIER_COST, TIER_LEVEL, statsOf, xpAt, xpStep, levelOf, levelProgress, killReward, cleanCallsign, nextTier, MAX_LEVEL } from '../src/shared/planes.js';
import { ARENA, BRIDGE, BUILDINGS, HEAL, HEALS, groundAt, healAt, hitsSolid, inBay, spawnPoint, surfaceAt, terrainAt, underBridge } from '../src/shared/arena.js';
import { fly, flyQ, forward, newBody, newBodyQ, plausibleMove, BOOST, BRAKE, Q } from '../src/shared/flight.js';
import { GUN, MISSILE, RAM, aimDir, blastDamage, closestOn, missileHurt, DODGE, dodgeChance, gunTarget, leadPoint, offNose, pickTarget, ramDamage, segmentHit, steerMissile } from '../src/shared/combat.js';
import { buyArm, buyPaint, choosePaint, equipArm, newPilot, normalize, buyPlane, buyUpgrade, choosePlane, payKill, redeemGift, setNeon, view } from '../src/server/pilot.js';

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, info === undefined ? '' : JSON.stringify(info)); }
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

console.log('\nplanes');
ok('ten planes, in order of level', PLANE_ORDER.length === 10 && PLANE_ORDER.every((k, i) => !i || PLANES[k].level > PLANES[PLANE_ORDER[i - 1]].level));
ok('the first plane is free and open at level 1', PLANES.sparrow.price === 0 && PLANES.sparrow.level === 1);
ok('every plane has a Hebrew name and a description', PLANE_ORDER.every((k) => PLANES[k].he && PLANES[k].desc));
const ACES = PLANE_ORDER.filter((k) => PLANES[k].ace), REG = PLANE_ORDER.filter((k) => !PLANES[k].ace);
ok('three regulars, then a strong one; the last is the strongest', ACES.join() === 'shahak,sufa,phantom' && PLANE_ORDER.at(-1) === 'phantom');
ok('prices rise along the regulars, and along the strong ones', [REG, ACES].every((l) => l.every((k, i) => !i || PLANES[k].price > PLANES[l[i - 1]].price)));
{
  const pow = (k) => { const s = statsOf(k); return s.speed * s.rate * s.dmg * s.hp; };
  ok('a strong one outflies and outguns the plane after it, and costs more', ACES.slice(0, -1).every((k) => {
    const nx = PLANE_ORDER[PLANE_ORDER.indexOf(k) + 1], a = statsOf(k), b = statsOf(nx);
    return a.speed > b.speed && a.rate * a.dmg > b.rate * b.dmg && PLANES[k].price > PLANES[nx].price;
  }));
  ok('the ladder climbs: each regular above the regular before, each strong one above the strong one before', [REG, ACES].every((l) => l.every((k, i) => !i || pow(k) > pow(l[i - 1]))));
  ok('the best plane is best at everything that counts', ['speed', 'boost', 'turn', 'hp', 'missiles', 'flares'].every((f) => PLANE_ORDER.every((k) => statsOf('phantom')[f] >= statsOf(k)[f])));
}
ok('three upgrades', Object.keys(UPGRADES).join() === 'engine,weapons,armor');
{
  const ALL5 = { engine: 5, weapons: 5, armor: 5 };
  const base = statsOf('sparrow'), up = statsOf('sparrow', ALL5), best = statsOf('phantom');
  ok('no upgrades: the plane as it is', base.hp === 250 && base.speed === 56 && base.missiles === 1);
  ok('the starter is heavy and slow to fire', base.turn < best.turn && base.speed < best.speed && base.rate * base.dmg < Math.min(...PLANE_ORDER.slice(1).map((k) => statsOf(k).rate * statsOf(k).dmg)));
  ok('engine 5: 40% faster, a quarter quicker to turn, half again the burner', near(up.speed, base.speed * 1.4) && near(up.turn, base.turn * 1.25) && near(up.boost, base.boost * 1.5) && near(up.fill, base.fill * 1.75));
  ok('weapons 5: 60% more damage a second, 40% more reach, missiles reload much faster', near(up.rate * up.dmg, base.rate * base.dmg * 1.6) && up.gunRange === Math.round(base.gunRange * 1.4) && near(up.reload, base.reload * 0.55));
  ok('armour 5: three quarters more health, flares back faster', up.hp === Math.round(base.hp * 1.75) && up.flareReload < base.flareReload * 0.5);
  ok('a maxed starter is still short of the best plane', up.speed < best.speed && up.rate * up.dmg < best.rate * best.dmg);
  ok('each tier a jump you feel (8% speed a tier), not a sliver', near(statsOf('sparrow', { engine: 2 }).speed, base.speed * 1.16) && statsOf('sparrow', { weapons: 1 }).reload < base.reload * 0.92);
  ok('the best plane still gains from an upgrade', statsOf('phantom', ALL5).speed > best.speed && statsOf('phantom', ALL5).rate * statsOf('phantom', ALL5).dmg > best.rate * best.dmg);
  ok('armour 3+: one more flare', statsOf('sparrow', { armor: 3 }).flares === base.flares + 1 && statsOf('sparrow', { armor: 2 }).flares === base.flares);
  ok('weapons 3+: one more missile', statsOf('sparrow', { weapons: 3 }).missiles === 2 && statsOf('sparrow', { weapons: 2 }).missiles === 1);
  ok('nonsense tiers are clamped', statsOf('sparrow', { engine: 99 }).speed === up.speed && statsOf('sparrow', { engine: -4 }).speed === 56);
  ok('the free gun fights from 250 m, the free missile locks from 300 m', statsOf('sparrow').gunRange === 250 && statsOf('sparrow').mRange === 300);
  ok('a better gun reaches further', GUN_ORDER.every((k, i) => !i || GUNS[k].range > GUNS[GUN_ORDER[i - 1]].range));
  ok('a better missile reaches further and hits harder', MISSILE_ORDER.every((k, i) => !i || (MISSILES[k].range > MISSILES[MISSILE_ORDER[i - 1]].range && MISSILES[k].dmg > MISSILES[MISSILE_ORDER[i - 1]].dmg)));
  ok('a gun changes the plane\'s fire', near(statsOf('sparrow', {}, { gun: 'g4' }).rate, statsOf('sparrow').rate * GUNS.g4.rate) && near(statsOf('sparrow', {}, { gun: 'g5' }).dmg, statsOf('sparrow').dmg * GUNS.g5.dmg));
  ok('the missile carried sets its flight and punch', statsOf('phantom', {}, { missile: 'm5' }).mDmg === MISSILES.m5.dmg && statsOf('phantom', {}, { missile: 'm5' }).mSpeed === MISSILES.m5.speed);
  ok('the market opens by level and costs more as it goes', [GUNS, MISSILES].every((shelf) => Object.values(shelf).every((w, i, a) => !i || (w.level > a[i - 1].level && w.price > a[i - 1].price))));
  ok('an unknown plane flies as the first', statsOf('nope').plane === 'sparrow');
}

console.log('\nthe gift helicopter');
{
  const h = statsOf('alfasi'), hu = statsOf('alfasi', { weapons: 5 });
  ok('not on the ladder, not in the shop', !PLANE_ORDER.includes('alfasi') && PLANES.alfasi.gift && buyPlane(normalize({ id: 'q', xp: 1e9, gold: 1e9 }), 'alfasi').error === 'gift_only');
  ok('its guns reach a kilometre, its missiles five', h.gunRange === 1000 && h.mRange === 5000 && hu.gunRange > 1000, [h.gunRange, h.mRange]);
  ok('two heavy guns that hit like the best plane\'s', h.rate * h.dmg >= statsOf('phantom').rate * statsOf('phantom').dmg * 0.9);
  ok('a missile of its needs two flares', h.shake === 2 && statsOf('phantom').shake === 1);
  const g = newPilot('gift');
  const r = redeemGift(g, '  alfasi ');
  ok('the code ALFASI gives it, in any case, and puts it on the table', r.ok && g.planes.includes('alfasi') && g.plane === 'alfasi' && g.loadout.alfasi && g.upgrades.alfasi, r);
  ok('once only', redeemGift(g, 'ALFASI').error === 'gift_used');
  ok('a made-up code gives nothing', redeemGift(g, 'NOPE').error === 'no_such_gift' && redeemGift(g, '__proto__').error === 'no_such_gift');
  ok('it stays after the record is read back', normalize(JSON.parse(JSON.stringify(g))).planes.includes('alfasi') && normalize(JSON.parse(JSON.stringify(g))).gifts.includes('ALFASI'));
}

console.log('\nthe gift fighter, and neon');
{
  const st = statsOf('shuster');
  ok('SHUSTER: not on the ladder, not in the shop', !PLANE_ORDER.includes('shuster') && PLANES.shuster.gift && buyPlane(normalize({ id: 'q2', xp: 1e9, gold: 1e9 }), 'shuster').error === 'gift_only');
  ok('the strongest: more health, speed, fire and flares than any plane', PLANE_ORDER.every((k) => { const o = statsOf(k); return st.hp > o.hp && st.speed > o.speed && st.rate * st.dmg > o.rate * o.dmg && st.flares > o.flares; }));
  ok('two guns to 2 km, missiles to 5 km that bring a plane down in one', st.gunRange === 2000 && st.mRange === 5000 && st.oneShot);
  ok('a missile every half second, the rack back as fast', st.launchGap === 0.5 && st.reload === 0.5);
  ok('two flares may fool a missile of its, three always do', st.shake === 2 && st.shakeSure === 3);
  const g = newPilot('sh');
  ok('SHUSTER gives it and puts it on the table', redeemGift(g, 'shuster').ok && g.plane === 'shuster' && g.planes.includes('shuster'));
  ok('neon needs its code', setNeon(g, true).error === 'no_neon');
  const r = redeemGift(g, 'NEON');
  ok('NEON gives the glow, on the plane flown at once', r.ok && r.gift.neon && g.neon && g.neonOf.shuster === true);
  ok('neon is each plane\'s: off on one, on on another', setNeon(g, false, 'shuster').ok && !g.neonOf.shuster && setNeon(g, true, 'sparrow').ok && g.neonOf.sparrow);
  ok('not on a plane you do not own', setNeon(g, true, 'phantom').error === 'not_owned');
  const back = normalize(JSON.parse(JSON.stringify(g)));
  ok('kept through a save and a load', back.neon && back.neonOf.sparrow && !back.neonOf.shuster);
}

console.log('\nstanding in the air');
{
  const st = statsOf('shuster');
  const b = newBodyQ({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  b.speed = st.speed;
  for (let i = 0; i < 120; i++) flyQ(b, { hover: true }, st, 1 / 30);
  const x0 = b.x, z0 = b.z, y0 = b.y;
  for (let i = 0; i < 90; i++) flyQ(b, { hover: true }, st, 1 / 30);
  ok('switched to hover, its speed bleeds away and it stands still', b.speed < 2 && Math.hypot(b.x - x0, b.z - z0) < 5 && Math.abs(b.y - y0) < 1, { speed: b.speed, moved: Math.hypot(b.x - x0, b.z - z0) });
  for (let i = 0; i < 60; i++) flyQ(b, { hover: true, boost: true }, st, 1 / 30);
  ok('the burner lifts it straight up', b.y > y0 + 20 && Math.hypot(b.x - x0, b.z - z0) < 6, b.y - y0);
  const y1 = b.y;
  for (let i = 0; i < 60; i++) flyQ(b, { hover: true, brake: true }, st, 1 / 30);
  ok('the brake lets it down', b.y < y1 - 10);
  const yaw0 = b.yaw;
  for (let i = 0; i < 30; i++) flyQ(b, { hover: true, turn: 1 }, st, 1 / 30);
  ok('the stick turns it where it stands', Math.abs(b.yaw - yaw0) > 1 && Math.hypot(b.x - x0, b.z - z0) < 8);
  for (let i = 0; i < 60; i++) flyQ(b, { hover: true, climb: 1 }, st, 1 / 30);
  ok('and tilts the nose to aim, not past a limit', b.pitch > 0.5 && b.pitch <= 0.76);
  for (let i = 0; i < 90; i++) flyQ(b, {}, st, 1 / 30);
  ok('switched off, it flies on again', b.speed > st.speed * 0.6);
  const ph = statsOf('phantom'), c = newBodyQ({ x: 0, y: 300, z: 0, yaw: 0 }, ph);
  c.speed = ph.speed;
  for (let i = 0; i < 90; i++) flyQ(c, { hover: true }, ph, 1 / 30);
  ok('a plane that cannot hover just flies', c.speed > ph.speed * 0.9);
}

console.log('\nhow a plane turns');
{
  const T5 = { engine: 5, weapons: 5, armor: 5 };
  const top = (k) => statsOf(k, T5).turn;
  ok('no plane on the ladder, maxed, turns faster than 2 rad/s (1.9 s for a full circle at the very best)', PLANE_ORDER.every((k) => top(k) <= 2), PLANE_ORDER.map((k) => +top(k).toFixed(2)));
  ok('the gift planes turn no faster either: extreme in everything else, not in a pivot', ['alfasi', 'shuster'].every((k) => top(k) <= 2.05));
  ok('the brake tightens a turn by a quarter, not more', BRAKE.turn <= 1.25);
  ok('better planes turn better: the best twice what the first does at most', statsOf('phantom').turn / statsOf('sparrow').turn < 1.7 && statsOf('phantom').turn > statsOf('sparrow').turn);
  // a full stick: the turn builds up, it does not snap
  const st = statsOf('phantom'), b = newBodyQ({ x: 0, y: 400, z: 0, yaw: 0 }, st);
  flyQ(b, { turn: 1 }, st, 1 / 30);
  const early = b.wTurn / st.turn;
  for (let i = 0; i < 20; i++) flyQ(b, { turn: 1 }, st, 1 / 30);
  const late = b.wTurn / st.turn;
  for (let i = 0; i < 20; i++) flyQ(b, {}, st, 1 / 30);
  ok('the turn builds up over a fraction of a second and dies away the same', early < 0.3 && late > 0.9 && Math.abs(b.wTurn) < st.turn * 0.1, { early, late, after: b.wTurn });
  // a sustained turn traces a circle: the heading changes evenly
  const c = newBodyQ({ x: 0, y: 400, z: 0, yaw: 0 }, st);
  for (let i = 0; i < 30; i++) flyQ(c, { turn: 1 }, st, 1 / 30);
  const h = [];
  for (let i = 0; i < 4; i++) { const y0 = c.yaw; for (let j = 0; j < 10; j++) flyQ(c, { turn: 1 }, st, 1 / 30); h.push(Math.atan2(Math.sin(c.yaw - y0), Math.cos(c.yaw - y0))); }
  ok('a held turn is a steady curve: the heading swings the same every moment', Math.max(...h.map(Math.abs)) - Math.min(...h.map(Math.abs)) < 0.05, h);
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

console.log('\nhow long a fight lasts');
{
  // time to bring a plane down with nothing but hits, against the strongest
  // gun on a fully upgraded plane, and the starter's own against itself
  const T5 = { engine: 5, weapons: 5, armor: 5 }, T3 = { engine: 3, weapons: 3, armor: 3 };
  const dps = (k, t, g) => { const s = statsOf(k, t, { gun: g }); return s.rate * s.dmg; };
  const ttk = (k, t, g, on = k, ont = t) => statsOf(on, ont).hp / dps(k, t, g);
  // a fight, not two rounds: like for like, a good three seconds of solid
  // hits — and as long low on the ladder as high on it
  ok('like for like, as it comes: three to four seconds of hits, all the way up', PLANE_ORDER.every((k) => { const v = ttk(k, {}, 'g1'); return v > 2.8 && v < 3.8; }), PLANE_ORDER.map((k) => +ttk(k, {}, 'g1').toFixed(2)));
  ok('like for like at the top, maxed with the best gun: about two seconds', ttk('phantom', T5, 'g5') > 1.6 && ttk('phantom', T5, 'g5') < 2.6, ttk('phantom', T5, 'g5'));
  ok('like for like in the middle (tier 3): about three', ttk('viper', T3, 'g3') > 2.5 && ttk('viper', T3, 'g3') < 3.6, ttk('viper', T3, 'g3'));
  ok('a bot about your level (the jet after the starter, tier 3) still needs well over a second and a half', ttk('hornet', T3, 'g2', 'sparrow', {}) > 1.6, ttk('hornet', T3, 'g2', 'sparrow', {}));
  ok('the best plane maxed against a fresh starter: under a second — the ladder counts', ttk('phantom', T5, 'g5', 'sparrow', {}) < 1);
  // a missile: the same share of anyone, so it counts at every level
  const share = (m, k, t) => missileHurt(0, MISSILES[m].dmg, statsOf(k, t).hp) / statsOf(k, t).hp;
  ok('the first missile takes about a quarter of anyone, the best about half', near(share('m1', 'sparrow', {}), share('m1', 'phantom', T5)) && share('m1', 'sparrow', {}) > 0.22 && share('m1', 'sparrow', {}) < 0.32 && share('m5', 'phantom', T5) > 0.45 && share('m5', 'phantom', T5) < 0.56, [share('m1', 'sparrow', {}), share('m5', 'phantom', T5)]);
  ok('one missile never brings anyone down on its own', MISSILE_ORDER.every((m) => share(m, 'sparrow', {}) < 0.6));
}

console.log('\nhow true the weapons are');
{
  ok('a dearer gun reaches further, scatters less, helps more onto a target', GUN_ORDER.every((k, i) => !i || (GUNS[k].range > GUNS[GUN_ORDER[i - 1]].range && GUNS[k].spread < GUNS[GUN_ORDER[i - 1]].spread && GUNS[k].assist > GUNS[GUN_ORDER[i - 1]].assist)));
  ok('the best gun fires fastest of the heavy ones and hits hardest a second', GUNS.g5.rate * GUNS.g5.dmg === Math.max(...GUN_ORDER.map((k) => GUNS[k].rate * GUNS[k].dmg)) && GUNS.g5.rate > 1);
  const w0 = statsOf('phantom', {}, { gun: 'g5' }), w5 = statsOf('phantom', { weapons: 5 }, { gun: 'g5' });
  ok('the weapons tier trues the guns: less scatter, a wider cone of help', w5.gunSpread < w0.gunSpread * 0.6 && w5.gunAssist > w0.gunAssist * 1.25, [w0.gunSpread, w5.gunSpread, w0.gunAssist, w5.gunAssist]);
  ok('a dearer missile sees through more flares and breaks', MISSILE_ORDER.every((k, i) => !i || MISSILES[k].ccm > MISSILES[MISSILE_ORDER[i - 1]].ccm) && statsOf('phantom', { weapons: 5 }, { missile: 'm5' }).mCcm > MISSILES.m5.ccm);
  // a missile chases the fastest plane in the game, maxed, on full burner, breaking hard
  const fast = statsOf('phantom', { engine: 5 });
  for (const mk of ['m1', 'm5']) {
    const M = MISSILES[mk];
    let caught = 0;
    for (const turnRate of [0, 0.6, 1.2]) {
      const tgt = { x: 0, y: 300, z: -150, yaw: 0, alive: true, vel: null };
      const m = { x: 0, y: 300, z: 0, yaw: 0, pitch: 0, speed: M.speed + 90, turn: M.turn };
      for (let t = 0; t < (M.range * 2.5) / m.speed; t += 1 / 30) {
        tgt.yaw += turnRate / 30;
        const f = forward(tgt.yaw, 0);
        tgt.vel = { x: f.x * fast.boost, y: 0, z: f.z * fast.boost };
        tgt.x += tgt.vel.x / 30; tgt.z += tgt.vel.z / 30;
        steerMissile(m, tgt, 1 / 30);
        if (Math.hypot(m.x - tgt.x, m.y - tgt.y, m.z - tgt.z) < MISSILE.fuse) { caught++; break; }
      }
    }
    ok(`${M.he} catches the fastest plane on its tail, burner on, breaking or not`, caught === 3, caught);
  }
}

console.log('\nthe air brake');
{
  const st = statsOf('sparrow');
  // a full-stick turn for four seconds, with and without the brake: how far
  // the plane strays from where it began the turn is how wide it turned
  const turnFor = (brake) => {
    const b = newBodyQ({ x: 0, y: 300, z: 0, yaw: 0 }, st);
    let far = 0;
    for (let i = 0; i < 120; i++) { flyQ(b, { turn: 1, brake }, st, 1 / 30); far = Math.max(far, Math.hypot(b.x, b.z)); }
    return { b, far };
  };
  const plain = turnFor(false), braked = turnFor(true);
  ok('held, the brake slows the plane well down', braked.b.speed < st.speed * (BRAKE.slow + 0.12) && plain.b.speed > st.speed * 0.9, { braked: braked.b.speed, plain: plain.b.speed });
  ok('and the turn is much tighter', braked.far < plain.far * 0.75, { braked: braked.far, plain: plain.far });
  const lit = newBodyQ({ x: 0, y: 300, z: 0 }, st);
  for (let i = 0; i < 30; i++) flyQ(lit, { boost: true, brake: true }, st, 1 / 30);
  ok('with the burner lit, no brake', !lit.braking && lit.speed > st.speed);
}

console.log('\nrepair pads');
ok('a few pads, on land', HEALS.length >= 4 && HEALS.every((p) => terrainAt(p.x, p.z) > 1));
ok('each on open ground: nothing to fly into over it', HEALS.every((p) => [6, 15, 30, HEAL.h - 2].every((h) => [[0, 0], [HEAL.r - 3, 0], [0, HEAL.r - 3], [-(HEAL.r - 3), 0], [0, -(HEAL.r - 3)]].every(([dx, dz]) => !hitsSolid(p.x + dx, groundAt(p.x + dx, p.z + dz) + h, p.z + dz, 1)))));
ok('low over a pad is on it', healAt(HEALS[1].x + 5, HEALS[1].y + 20, HEALS[1].z) === 1);
ok('high over it is not', healAt(HEALS[1].x, HEALS[1].y + HEAL.h + 5, HEALS[1].z) === -1);
ok('beside it is not', healAt(HEALS[1].x + HEAL.r + 2, HEALS[1].y + 10, HEALS[1].z) === -1);

console.log('\nflying');
{
  const st = statsOf('sparrow');
  const b = newBody({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  for (let i = 0; i < 30; i++) fly(b, {}, st, 1 / 30);
  ok('yaw 0 flies toward -z at cruise', b.z < -52 && near(b.x, 0, 1e-6) && near(b.speed, st.speed, 0.5), b);
  const r = newBody({ x: 0, y: 300, z: 0, yaw: 0 }, st);
  for (let i = 0; i < 30; i++) fly(r, { turn: 1 }, st, 1 / 30);
  ok('right turns right (+x when heading -z)', r.x > 5, r.x);
  ok('and banks right wing down', r.roll < -0.5, r.roll);
  const c = newBody({ x: 0, y: 200, z: 0 }, st);
  for (let i = 0; i < 30; i++) fly(c, { climb: 1 }, st, 1 / 30);
  ok('climbing climbs', c.y > 215 && c.pitch > 0.7, { y: c.y, pitch: c.pitch });
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
  ok('an empty tank burns no more, and does not sputter back on', !bo.boosting && bo.dry && bo.fuel < BOOST.relight);
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
  // a plane crossing fast, 300 m out: the nose on its pip, well off the plane itself
  const fast = { x: 0, y: 100, z: -300, alive: true, vel: { x: 120, y: 0, z: 0 } };
  const shooter = { x: 0, y: 100, z: 0, yaw: 0, pitch: 0, speed: 80, alive: true };
  const L = leadPoint(shooter, fast);
  shooter.yaw = Math.atan2(-L.x, -L.z);
  ok('the nose on the pip of a fast crossing plane: the guns are helped onto it', offNose(shooter, shooter.yaw, 0, fast) > GUN.assistCone && gunTarget(shooter, [fast], GUN.assistCone, 400) === fast && pickTarget(shooter, [fast], GUN.assistCone, 400) === null);
  // and the rounds, scattered as a person's are, mostly hit
  let hits = 0;
  for (let i = 0; i < 400; i++) {
    const a = Math.random() * Math.PI * 2, r = GUN.spread * Math.sqrt(Math.random()), dd = aimDir(shooter, fast), f = forward(shooter.yaw, 0);
    const vx = (dd.x + Math.cos(a) * r) * GUN.speed + f.x * shooter.speed, vy = (dd.y + Math.sin(a) * r) * GUN.speed, vz = dd.z * GUN.speed + f.z * shooter.speed;
    const tx = fast.x, tz = fast.z;
    for (let t = 0, dt = 1 / 30; t < 1; t += dt) {
      const bx = vx * t, by = 100 + vy * t, bz = vz * t, cx = tx + fast.vel.x * (t + dt);
      if (segmentHit(bx, by, bz, bx + vx * dt, by + vy * dt, bz + vz * dt, cx, 100, tz, GUN.hitR) >= 0) { hits++; break; }
    }
  }
  ok('on the pip, nine rounds in ten hit', hits / 400 > 0.9, hits / 400);
  const m = { x: 0, y: 100, z: 0, yaw: Math.PI / 2, pitch: 0 }; // facing -x
  for (let i = 0; i < 90; i++) steerMissile(m, ahead, 1 / 30);
  ok('a missile turns after its target', Math.hypot(m.x - ahead.x, m.z - ahead.z) < 200, m);
}

console.log('\nmid-air collisions');
ok('a missile passing close goes off by a plane it was not after', closestOn(0, 0, 0, 0, 0, -40, 9, 0, -20) === 0.5 && MISSILE.fuse > 9);
ok('the blast hurts in full up close', blastDamage(2) === MISSILE.dmg && blastDamage(MISSILE.full) === MISSILE.dmg);
ok('less further out, nothing past the blast', blastDamage(12) < MISSILE.dmg && blastDamage(12) > blastDamage(18) && blastDamage(MISSILE.blast + 1) === 0);
ok('the fuse is inside the blast', blastDamage(MISSILE.fuse) > 0);
ok('a break at the last moment nearly always shakes a missile', dodgeChance(DODGE.near) === DODGE.best && DODGE.best >= 0.85);
ok('a break at the edge of the window rarely does', near(dodgeChance(DODGE.far), DODGE.worst) && dodgeChance(DODGE.far) < 0.3);
ok('too early, or too late, it does not at all', dodgeChance(DODGE.far + 1) === 0 && dodgeChance(DODGE.near - 1) === 0);
ok('the later, the better', dodgeChance(60) > dodgeChance(120));
ok('a graze side by side takes a bite', ramDamage(5) === RAM.min);
ok('a head-on at full burner brings a plane down; a graze only bites', ramDamage(2 * statsOf('sparrow').boost) >= statsOf('sparrow').hp && ramDamage(2 * statsOf('phantom', { engine: 5 }).boost) >= statsOf('phantom').hp * 1.4 && ramDamage(10) < statsOf('sparrow').hp * 0.2, ramDamage(2 * statsOf('sparrow').boost));
ok('more speed, more damage', ramDamage(80) > ramDamage(40));

console.log('\nthe hangar');
{
  const p = newPilot('u1');
  ok('a new pilot flies the first plane', p.plane === 'sparrow' && p.planes.includes('sparrow') && p.level === 1);
  ok('cannot buy a plane above your level', buyPlane(p, 'gull').error === 'level');
  p.xp = xpAt(3); normalize(p);
  ok('the level is worked out from xp', p.level === 3);
  ok('cannot buy without the gold', buyPlane(p, 'gull').error === 'gold');
  p.gold = 2000;
  ok('with both, it is bought and flown', buyPlane(p, 'gull').ok && p.plane === 'gull' && p.gold === 800);
  ok('not twice', buyPlane(p, 'gull').error === 'owned');
  ok('back to the first plane', choosePlane(p, 'sparrow').ok && p.plane === 'sparrow');
  ok('not one you do not own', choosePlane(p, 'phantom').error === 'not_owned');
  p.gold = 1000;
  const c1 = nextTier(p, 'engine', 'sparrow').cost;
  ok('an upgrade is for one plane: the one flown', buyUpgrade(p, 'engine').ok && p.upgrades.sparrow.engine === 1 && p.upgrades.gull.engine === 0 && p.gold === 1000 - c1, p);
  ok('a better plane\'s tier costs more', nextTier(p, 'engine', 'gull').cost > c1 && c1 < TIER_COST[0]);
  ok('or another plane you own', buyUpgrade(p, 'armor', 'gull').ok && p.upgrades.gull.armor === 1 && !p.upgrades.sparrow.armor);
  ok('not a plane you do not own', buyUpgrade(p, 'armor', 'phantom').error === 'not_owned');
  p.gold = 1e6;
  ok('the second tier waits for its level', buyUpgrade(p, 'engine').error === 'level' && p.level < TIER_LEVEL[1]);
  p.xp = xpAt(30); normalize(p);
  for (let i = 0; i < 9; i++) buyUpgrade(p, 'engine');
  ok('five tiers and no more', p.upgrades.sparrow.engine === 5 && buyUpgrade(p, 'engine').error === 'max' && nextTier(p, 'engine') === null);
  ok('an unknown upgrade is refused', buyUpgrade(p, 'laser').error === 'no_such_upgrade');
  ok('a plane bought later starts with none', (p.gold = 1e6, buyPlane(p, 'bulldog').ok) && Object.values(p.upgrades.bulldog).every((t) => t === 0));
  {
    const m = newPilot('arms');
    ok('a new pilot\'s plane carries the free gun and missile', m.loadout.sparrow.gun === 'g1' && m.loadout.sparrow.missile === 'm1' && m.arms.guns[0] === 'g1');
    m.gold = 100000; m.xp = 0; normalize(m);
    ok('a weapon above the level is refused', buyArm(m, 'missiles', 'm2').error === 'level');
    m.xp = xpAt(10); normalize(m);
    ok('bought: paid for, owned, and on the plane flown', buyArm(m, 'missiles', 'm2').ok && m.loadout.sparrow.missile === 'm2' && m.gold === 100000 - MISSILES.m2.price);
    ok('not twice', buyArm(m, 'missiles', 'm2').error === 'owned');
    ok('another plane bought carries what the one flown carries', buyPlane(m, 'hornet').ok && m.loadout.hornet.missile === 'm2');
    ok('each plane its own load', equipArm(m, 'missiles', 'm1', 'hornet').ok && m.loadout.hornet.missile === 'm1' && m.loadout.sparrow.missile === 'm2');
    // a plane's whole setup stays as it was left: weapons, tiers, paint
    m.gold = 1e6; m.paints.push('night');
    ok('a paint is one plane\'s', choosePaint(m, 'night', 'hornet').ok && m.paintOf.hornet === 'night' && m.paintOf.sparrow === 'stock');
    choosePlane(m, 'hornet');
    ok('flying it: its paint on', m.plane === 'hornet' && m.paint === 'night');
    choosePlane(m, 'sparrow');
    ok('back to the other: its own paint and load, untouched', m.paint === 'stock' && m.loadout.sparrow.missile === 'm2' && m.loadout.hornet.missile === 'm1');
    const back2 = normalize(JSON.parse(JSON.stringify(m)));
    ok('and all of it kept through a save and a load', back2.paintOf.hornet === 'night' && back2.loadout.sparrow.missile === 'm2' && back2.paint === 'stock');
    ok('an older record (one paint for all) keeps it on every plane', normalize({ id: 'pp', planes: ['sparrow', 'gull'], paints: ['stock', 'gold'], paint: 'gold' }).paintOf.gull === 'gold');
    ok('no painting a plane you do not own', choosePaint(m, 'night', 'phantom').error === 'not_owned');
    ok('not on a plane you do not own', equipArm(m, 'missiles', 'm2', 'phantom').error === 'not_owned');
    ok('not one not owned', equipArm(m, 'guns', 'g3').error === 'not_owned');
    ok('no gold, no gun', (m.gold = 10, buyArm(m, 'guns', 'g3').error === 'gold'));
    ok('nonsense is refused, prototype keys too', buyArm(m, '__proto__', 'toString').error === 'no_such_weapon' && buyArm(m, 'guns', 'constructor').error === 'no_such_weapon' && equipArm(m, 'missiles', 'hasOwnProperty').error === 'no_such_weapon' && equipArm(m, 'missiles', 'm1', '__proto__').error === 'not_owned');
    const older = normalize({ id: 'o', planes: ['sparrow', 'viper'], arms: { guns: ['g1', 'g2'], missiles: ['m1', 'm3'] }, gun: 'g2', missile: 'm3' });
    ok('one choice for every plane (an older record) becomes each plane\'s', older.loadout.sparrow.gun === 'g2' && older.loadout.viper.missile === 'm3' && !('gun' in older));
    const bad = normalize({ id: 'z', arms: { guns: ['laser'], missiles: ['m9'] }, gun: 'laser', missile: 'm9' });
    ok('a broken arms record is mended', bad.loadout.sparrow.gun === 'g1' && bad.loadout.sparrow.missile === 'm1' && bad.arms.guns.join() === 'g1');
  }
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
  ok('a broken record is mended', broken.xp === 0 && broken.plane === 'sparrow' && broken.upgrades.sparrow.engine === 5 && broken.upgrades.sparrow.armor === 0 && broken.upgrades.sparrow.weapons === 0 && !('turbo' in broken.upgrades.sparrow));
  const old = normalize({ id: 'y', xp: 0, plane: 'hornet', planes: ['sparrow', 'hornet'], upgrades: { engine: 2, guns: 3, armor: 0, missiles: 1, flares: 0 } });
  ok('old upgrades (for every plane) stay, on each plane owned', old.upgrades.hornet.weapons === 3 && old.upgrades.sparrow.engine === 2 && old.upgrades.hornet.armor === 0);
  const six = normalize({ id: 'w', xp: 0, plane: 'sparrow', planes: ['sparrow'], upgrades: { sparrow: { engine: 1, turbo: 3, guns: 2, missiles: 4, armor: 1, flares: 2 } } });
  ok('six old upgrades fold into three, keeping the best of each pair', JSON.stringify(six.upgrades.sparrow) === JSON.stringify({ engine: 3, weapons: 4, armor: 2 }), six.upgrades.sparrow);
  ok('the view has no id', !('id' in view(p)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
