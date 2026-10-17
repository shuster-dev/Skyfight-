// The arena: everyone against everyone, in one sky.
//
// Who decides what. A pilot's own plane flies on their own screen — waiting a
// round trip for every touch of the stick is what makes a flying game feel
// like mud — and the room checks every pose it is sent against what that
// plane could have flown. Everything that hurts is the room's alone: rounds
// and missiles fly here, hit here, and the kill and its pay are decided here.
//
// Bots fill the sky when it is empty, so a pilot who comes alone has someone
// to fight; they step out as real pilots come in.
import { Room } from '@colyseus/core';
import { verifyToken } from '../auth.js';
import { normalize, payKill, view } from '../pilot.js';
import { PLANES, PLANE_ORDER, levelOf, statsOf, killReward } from '../../shared/planes.js';
import { ARENA, groundAt, spawnPoint } from '../../shared/arena.js';
import { fly, forward, newBody, plausibleMove } from '../../shared/flight.js';
import { ASSIST_SHARE, CREDIT_MS, GUN, MISSILE, REPAIR, RESPAWN, aimDir, offNose, pickTarget, segmentHit, steerMissile } from '../../shared/combat.js';

const TICK_MS = 1000 / 30;
const SNAP_EVERY = 2;          // 15 snapshots a second
const MAX_POSES_PER_SEC = 40;
const IDLE_MS = 20000;
const BOT_NAMES = ['נץ', 'עיט', 'ברק', 'סערה', 'שחף', 'רעם', 'Falcon', 'Ghost', 'Raven', 'Blaze', 'Nomad', 'Hawk', 'Comet', 'Storm'];
/** How many planes the room wants in the air; bots make up the difference. */
export const FILL_TO = 7;
export const MAX_BOTS = 6;

const q = (v, k = 10) => Math.round(v * k);

export class ArenaRoom extends Room {
  maxClients = 40;

  onCreate(opts = {}) {
    this.store = opts.store;
    this.planes = new Map();   // key -> plane
    this.bySession = new Map(); // sessionId -> key
    this.bullets = [];
    this.missiles = [];
    this.seq = 0;
    this.tickN = 0;
    this.now = Date.now();
    this.rosterDirty = true;
    this.noBots = !!opts.noBots;
    this.setSimulationInterval((dt) => this.tick(Math.min(dt, 100) / 1000), TICK_MS);

    this.onMessage('pose', (client, m) => this.onPose(client, m));
    this.onMessage('missile', (client) => {
      const p = this.planeOf(client);
      p && this.launch(p);
    });
    this.onMessage('hello', (client) => this.hello(client));
    this.onMessage('ping', (client, t) => client.send('pong', t));
  }

  async onAuth(client, options = {}) {
    const claims = verifyToken(options.token);
    if (!claims) throw new Error('unauthorized');
    const pilot = await this.store.getPilot(claims.sub);
    if (!pilot || !pilot.name) throw new Error('no_pilot');
    normalize(pilot);
    return { id: claims.sub, pilot };
  }

  onJoin(client, _opts, auth) {
    // the same pilot twice (a second tab): the older one leaves
    for (const p of this.planes.values()) if (p.uid === auth.id && p.sid) {
      const old = this.clients.find((c) => c.sessionId === p.sid);
      old?.leave(4000);
      this.drop(p.key);
    }
    const pilot = auth.pilot;
    const p = this.addPlane({ uid: auth.id, sid: client.sessionId, name: pilot.name, plane: pilot.plane, level: pilot.level, upgrades: pilot.upgrades, pilot });
    this.bySession.set(client.sessionId, p.key);
    this.fillBots();
  }

  /**
   * The client is listening: now it is told who it is and put in the air.
   * (Anything sent from onJoin can arrive before the page has said what to
   * do with it, and is lost.)
   */
  hello(client) {
    const p = this.planes.get(this.bySession.get(client.sessionId));
    if (!p || p.greeted) return;
    p.greeted = true;
    client.send('welcome', { key: p.key, stats: p.stats, roster: this.roster(), pilot: view(p.pilot) });
    this.spawn(p);
  }

  onLeave(client) {
    const key = this.bySession.get(client.sessionId);
    this.bySession.delete(client.sessionId);
    const p = key && this.planes.get(key);
    if (p?.pilot) this.store.savePilot(p.pilot);
    key && this.drop(key);
    this.fillBots();
  }

  async onDispose() {
    for (const p of this.planes.values()) if (p.pilot) await this.store.savePilot(p.pilot);
  }

  // ---- planes -------------------------------------------------------------

  addPlane({ uid = '', sid = '', name, plane, level, upgrades = {}, pilot = null, bot = null }) {
    const key = (++this.seq).toString(36);
    const stats = statsOf(plane, upgrades);
    const p = {
      key, uid, sid, name, plane, level, bot, pilot, stats,
      hp: stats.hp, alive: false, respawnAt: 0, shieldUntil: 0,
      ...newBody(spawnPoint(0), stats),
      vel: { x: 0, y: 0, z: 0 },
      firing: false, fireT: 0, gun: 0,
      ammo: stats.missiles, reloadT: 0,
      lastHurt: 0, damagers: new Map(),
      kills: 0, deaths: 0, streak: 0,
      poseAt: 0, poses: 0, poseWindow: 0, strikes: 0,
    };
    this.planes.set(key, p);
    this.rosterDirty = true;
    return p;
  }

  drop(key) {
    this.planes.delete(key);
    this.bullets = this.bullets.filter((b) => b.owner !== key);
    for (const m of this.missiles) if (m.target === key) m.target = '';
    this.rosterDirty = true;
  }

  planeOf(client) {
    const p = this.planes.get(this.bySession.get(client.sessionId));
    return p && p.alive ? p : null;
  }

  /** Bring a plane in at the spawn point furthest from anyone who can shoot. */
  spawn(p) {
    let best = null, bestD = -1;
    for (let n = 0; n < 12; n++) {
      const s = spawnPoint(n);
      let d = Infinity;
      for (const o of this.planes.values()) if (o !== p && o.alive) d = Math.min(d, Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z));
      // a little chance in it, so two pilots who die together are not reunited
      d += Math.random() * 150;
      if (d > bestD) { bestD = d; best = s; }
    }
    Object.assign(p, newBody(best, p.stats));
    p.hp = p.stats.hp; p.alive = true; p.firing = false;
    p.shieldUntil = this.now + RESPAWN.shield * 1000;
    p.ammo = p.stats.missiles; p.reloadT = 0;
    p.damagers.clear(); p.lastHurt = 0;
    p.poseAt = Date.now();
    if (p.bot) p.bot.target = '', p.bot.think = 0;
    const c = p.sid && this.clients.find((x) => x.sessionId === p.sid);
    c && c.send('spawn', { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, shield: RESPAWN.shield, hp: p.hp, ammo: p.ammo });
  }

  // ---- what clients say ---------------------------------------------------

  /** A pose from a pilot's own screen: [x, y, z, yaw, pitch, roll, speed, flags]. */
  onPose(client, m) {
    const p = this.planes.get(this.bySession.get(client.sessionId));
    if (!p || !p.alive || !Array.isArray(m) || m.length < 8) return;
    // a flood is ignored, not obeyed
    if (Date.now() - p.poseWindow > 1000) p.poseWindow = Date.now(), p.poses = 0;
    if (++p.poses > MAX_POSES_PER_SEC) return;
    const [x, y, z, yaw, pitch, roll, speed, flags] = m.map(Number);
    if (![x, y, z, yaw, pitch, roll, speed].every(Number.isFinite)) return;
    // the wall clock, not the tick's: two poses can land within one tick
    const now = Date.now();
    const dt = Math.max(1 / 30, (now - p.poseAt) / 1000);
    const next = { x, y, z };
    if (!plausibleMove(p, next, Math.min(dt, 1.5), p.stats) || Math.hypot(x, z) > ARENA.radius + 160 || y > ARENA.ceiling + 5) {
      // not something that plane could have flown: put it back where it was
      if (process.env.DEBUG_POSE) console.log('[fix]', p.key, { from: [p.x, p.y, p.z], to: [x, y, z], dt });
      if (++p.strikes > 30) return client.leave(4001);
      client.send('fix', { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
      p.poseAt = now;
      return;
    }
    p.strikes = Math.max(0, p.strikes - 0.2);
    const k = 1 / dt;
    p.vel.x = (x - p.x) * k; p.vel.y = (y - p.y) * k; p.vel.z = (z - p.z) * k;
    p.x = x; p.y = y; p.z = z;
    p.yaw = yaw; p.pitch = Math.max(-1.3, Math.min(1.3, pitch)); p.roll = roll;
    p.speed = Math.max(0, Math.min(p.stats.boost * 1.1, speed));
    p.firing = !!(flags & 1);
    p.boosting = !!(flags & 2);
    p.poseAt = now;
    if (y < groundAt(x, z) + ARENA.clearance - 1.5) this.down(p, '', 'crash');
  }

  // ---- the tick -----------------------------------------------------------

  tick(dt) {
    this.now = Date.now();
    this.tickN++;
    for (const p of this.planes.values()) {
      if (!p.alive) {
        if (this.now >= p.respawnAt && (p.bot || p.greeted)) this.spawn(p);
        continue;
      }
      if (p.bot) this.botFly(p, dt);
      else if (this.now - p.poseAt > 1000) {
        // a pilot whose screen has gone quiet stops shooting, and after a
        // while is sent back to the hangar rather than left hanging there
        p.firing = false;
        if (this.now - p.poseAt > IDLE_MS) { this.clients.find((c) => c.sessionId === p.sid)?.leave(4002); continue; }
      }
      this.guns(p, dt);
      this.reload(p, dt);
      if (p.hp < p.stats.hp && this.now - p.lastHurt > REPAIR.after * 1000) p.hp = Math.min(p.stats.hp, p.hp + REPAIR.perSec * dt);
    }
    this.moveBullets(dt);
    this.moveMissiles(dt);
    if (this.tickN % 60 === 0) this.fillBots();
    if (this.tickN % SNAP_EVERY === 0) this.snapshot();
    if (this.rosterDirty && this.tickN % 6 === 0) this.rosterDirty = false, this.broadcast('roster', this.roster());
  }

  guns(p, dt) {
    const every = 1 / p.stats.rate;
    if (!p.firing) { p.fireT = Math.min(every, p.fireT + dt); return; }
    p.fireT += dt;
    const others = [...this.planes.values()];
    while (p.fireT >= every) {
      p.fireT -= every;
      const f = forward(p.yaw, p.pitch);
      const target = pickTarget(p, others, GUN.assistCone, GUN.assistRange);
      const d = aimDir(p, target);
      // from the wing the barrel is on, alternating
      const side = (p.gun++ % 2 ? 1 : -1) * 2.2, rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      this.bullets.push({
        owner: p.key, t: 0, dmg: p.stats.dmg,
        x: p.x + f.x * 5 + rx * side, y: p.y + f.y * 5, z: p.z + f.z * 5 + rz * side,
        vx: d.x * GUN.speed + f.x * p.speed, vy: d.y * GUN.speed + f.y * p.speed, vz: d.z * GUN.speed + f.z * p.speed,
      });
    }
  }

  reload(p, dt) {
    if (p.ammo >= p.stats.missiles) return void (p.reloadT = 0);
    p.reloadT += dt;
    if (p.reloadT >= p.stats.reload) p.ammo++, p.reloadT = 0;
  }

  moveBullets(dt) {
    const alive = [...this.planes.values()].filter((p) => p.alive);
    const keep = [];
    for (const b of this.bullets) {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
      let hit = null, tBest = 2;
      for (const p of alive) {
        if (p.key === b.owner) continue;
        // where the target was when the shooter saw it is a little behind
        // where it is: the sphere is fat enough to cover that
        const t = segmentHit(b.x, b.y, b.z, nx, ny, nz, p.x, p.y, p.z, GUN.hitR);
        if (t >= 0 && t < tBest) tBest = t, hit = p;
      }
      if (hit) { this.hurt(hit, b.owner, b.dmg, 'guns'); continue; }
      b.x = nx; b.y = ny; b.z = nz; b.t += dt;
      if (b.t < GUN.life && b.y > 0 && (b.y > 240 || b.y > groundAt(b.x, b.z))) keep.push(b);
    }
    this.bullets = keep;
  }

  launch(p) {
    if (p.ammo < 1) return;
    const target = pickTarget(p, [...this.planes.values()], MISSILE.lockCone, MISSILE.lockRange);
    p.ammo--;
    const f = forward(p.yaw, p.pitch);
    const m = { id: (++this.seq).toString(36), owner: p.key, target: target?.key || '', t: 0, x: p.x + f.x * 4, y: p.y + f.y * 4 - 1, z: p.z + f.z * 4, yaw: p.yaw, pitch: p.pitch };
    this.missiles.push(m);
    if (target?.sid) this.sendTo(target, 'incoming', { from: p.key });
    const me = p.sid && this.clients.find((c) => c.sessionId === p.sid);
    me && me.send('fired', { target: m.target, ammo: p.ammo });
  }

  moveMissiles(dt) {
    const keep = [];
    for (const m of this.missiles) {
      const px = m.x, py = m.y, pz = m.z;
      steerMissile(m, this.planes.get(m.target), dt);
      m.t += dt;
      let hit = null;
      if (m.t > MISSILE.arm) for (const p of this.planes.values()) {
        if (!p.alive || p.key === m.owner) continue;
        if (segmentHit(px, py, pz, m.x, m.y, m.z, p.x, p.y, p.z, MISSILE.hitR) >= 0) { hit = p; break; }
      }
      if (hit) {
        this.broadcast('boom', [q(m.x), q(m.y), q(m.z)]);
        this.hurt(hit, m.owner, MISSILE.dmg, 'missile');
        continue;
      }
      if (m.t > MISSILE.life || m.y < groundAt(m.x, m.z) + 0.5) {
        this.broadcast('boom', [q(m.x), q(m.y), q(m.z)]);
        continue;
      }
      keep.push(m);
    }
    this.missiles = keep;
  }

  // ---- hurting and going down --------------------------------------------

  hurt(p, by, dmg, how) {
    if (!p.alive || this.now < p.shieldUntil) return;
    p.hp -= dmg;
    p.lastHurt = this.now;
    const d = p.damagers.get(by) || { dmg: 0, at: 0 };
    d.dmg += dmg; d.at = this.now;
    p.damagers.set(by, d);
    const shooter = this.planes.get(by);
    shooter && this.sendTo(shooter, 'hit', { v: p.key, d: Math.round(dmg), how });
    this.sendTo(p, 'hurt', { by, d: Math.round(dmg), hp: Math.max(0, Math.round(p.hp)), how });
    if (shooter?.bot) shooter.bot.lastHit = this.now;
    if (p.bot) p.bot.hurtAt = this.now, p.bot.attacker = by;
    if (p.hp <= 0) this.down(p, by, how);
  }

  /**
   * A plane goes down. Whoever did it is paid; so is anyone who did a fair
   * share of it. A crash with someone on your tail is their kill.
   */
  down(p, by, how) {
    if (!p.alive) return;
    p.alive = false; p.hp = 0; p.firing = false;
    p.respawnAt = this.now + RESPAWN.delay * 1000;
    p.deaths++; p.streak = 0;
    if (p.pilot) p.pilot.deaths++, this.store.savePilot(p.pilot);
    const recent = [...p.damagers.entries()].filter(([, d]) => this.now - d.at < CREDIT_MS);
    if (!by && recent.length) by = recent.sort((a, b) => b[1].at - a[1].at)[0][0];
    const killer = by && this.planes.get(by);
    const assists = recent.filter(([k, d]) => k !== by && d.dmg >= p.stats.hp * ASSIST_SHARE).map(([k]) => this.planes.get(k)).filter(Boolean);
    const victim = { level: p.level, bot: !!p.bot };
    if (killer && killer !== p) {
      killer.kills++; killer.streak++;
      this.pay(killer, victim, { streak: killer.streak - 1 });
    }
    for (const a of assists) this.pay(a, victim, { assist: true });
    p.damagers.clear();
    this.broadcast('down', { v: p.key, k: killer && killer !== p ? killer.key : '', how, a: assists.map((a) => a.key), x: q(p.x), y: q(p.y), z: q(p.z) });
    this.rosterDirty = true;
  }

  pay(p, victim, opt) {
    if (p.pilot) {
      const r = payKill(p.pilot, victim, opt);
      p.level = p.pilot.level;
      p.pilot.best = Math.max(p.pilot.best || 0, p.streak);
      this.store.savePilot(p.pilot);
      this.sendTo(p, 'reward', { ...r, assist: !!opt.assist, streak: p.streak, pilot: view(p.pilot) });
    } else if (p.bot) {
      // bots grow a little too, so a long-lived one is a real threat
      p.bot.xp += killReward(victim.level, { bot: victim.bot, ...opt }).xp;
      p.level = Math.min(30, Math.max(p.level, levelOf(p.bot.xp)));
    }
  }

  sendTo(p, type, msg) {
    if (!p?.sid) return;
    const c = this.clients.find((x) => x.sessionId === p.sid);
    c && c.send(type, msg);
  }

  // ---- what everyone sees -------------------------------------------------

  snapshot() {
    const ps = [];
    for (const p of this.planes.values()) {
      const flags = (p.alive ? 1 : 0) | (p.firing ? 2 : 0) | (p.boosting ? 4 : 0) | (this.now < p.shieldUntil ? 8 : 0);
      ps.push([p.key, q(p.x), q(p.y), q(p.z), q(p.yaw, 1000), q(p.pitch, 1000), q(p.roll, 1000), Math.round(Math.max(0, p.hp) / p.stats.hp * 100), flags, q(p.speed)]);
    }
    const ms = this.missiles.map((m) => [m.id, q(m.x), q(m.y), q(m.z), q(m.yaw, 1000), q(m.pitch, 1000), m.target]);
    this.broadcast('s', { t: this.now, p: ps, m: ms });
  }

  roster() {
    return [...this.planes.values()].map((p) => ({ key: p.key, name: p.name, plane: p.plane, level: p.level, bot: !!p.bot, kills: p.kills, deaths: p.deaths, streak: p.streak }));
  }

  // ---- bots ---------------------------------------------------------------

  fillBots() {
    const humans = [...this.planes.values()].filter((p) => !p.bot).length;
    const bots = [...this.planes.values()].filter((p) => p.bot);
    const want = this.noBots || !humans ? 0 : Math.max(0, Math.min(MAX_BOTS, FILL_TO - humans));
    // they leave when they are not needed: the one doing worst goes first
    while (bots.length > want) this.drop(bots.sort((a, b) => a.kills - b.kills).shift().key);
    const lv = humans ? Math.round([...this.planes.values()].filter((p) => !p.bot).reduce((s, p) => s + p.level, 0) / humans) : 1;
    let n = bots.length;
    while (n++ < want) {
      const used = new Set([...this.planes.values()].map((p) => p.name));
      const name = BOT_NAMES.filter((x) => !used.has(x))[Math.floor(Math.random() * 6)] || 'Bot';
      const level = Math.max(1, lv + Math.round(Math.random() * 4 - 2));
      const open = PLANE_ORDER.filter((k) => PLANES[k].level <= level);
      const plane = open[Math.floor(Math.random() * open.length)];
      const tier = Math.min(5, Math.floor(level / 5));
      const p = this.addPlane({ name, plane, level, upgrades: { engine: tier, armor: tier, guns: tier, missiles: tier }, bot: { xp: 0, skill: 0.35 + Math.random() * 0.4, target: '', think: 0, jink: 0, jinkDir: 1, hurtAt: 0 } });
      this.spawn(p);
    }
  }

  /**
   * A bot's stick. It picks someone, chases where they will be, fires when
   * they are in front of it, breaks off when hit, and above all does not fly
   * into the ground.
   */
  botFly(p, dt) {
    const ai = p.bot;
    ai.think -= dt;
    let t = this.planes.get(ai.target);
    if (ai.think <= 0 || !t || !t.alive) {
      ai.think = 1.5 + Math.random() * 1.5;
      // the nearest, but one already hunted by others counts as further:
      // a pack of bots on one pilot is no fun for that pilot
      const hunted = new Map();
      for (const o of this.planes.values()) if (o.bot && o !== p && o.bot.target) hunted.set(o.bot.target, (hunted.get(o.bot.target) || 0) + 1);
      let best = null, bestD = Infinity;
      for (const o of this.planes.values()) {
        if (o === p || !o.alive || this.now < o.shieldUntil) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) * (1 + 0.8 * (hunted.get(o.key) || 0));
        if (d < bestD) bestD = d, best = o;
      }
      // whoever is shooting at it, if they are close
      const att = this.planes.get(ai.attacker);
      if (att?.alive && this.now - ai.hurtAt < 4000 && Math.random() < 0.7) best = att;
      ai.target = best?.key || '';
      t = best;
    }
    const input = { turn: 0, climb: 0, boost: false };
    let fire = false;
    if (t) {
      const d = aimDir(p, t);
      const wantYaw = Math.atan2(-d.x, -d.z), wantPitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      // a worse pilot aims worse
      const wobble = (1 - ai.skill) * 0.35 * Math.sin(this.now / 700 + p.key.charCodeAt(0));
      const dy = Math.atan2(Math.sin(wantYaw + wobble - p.yaw), Math.cos(wantYaw + wobble - p.yaw));
      input.turn = Math.max(-1, Math.min(1, -dy * 2.4));
      input.climb = Math.max(-1, Math.min(1, (wantPitch - p.pitch) * 2.4));
      const dist = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      input.boost = dist > 450 && p.fuel > 0.5;
      fire = dist < 430 && offNose(p, p.yaw, p.pitch, t) < 0.09 + (1 - ai.skill) * 0.08;
      if (p.ammo > 0 && dist < 600 && offNose(p, p.yaw, p.pitch, t) < MISSILE.lockCone * 0.7 && Math.random() < dt * 0.25 * ai.skill) this.launch(p);
    }
    // hit: break hard one way for a moment
    if (this.now - ai.hurtAt < 300 && ai.jink <= 0 && Math.random() < 0.5) ai.jink = 0.8 + Math.random(), ai.jinkDir = Math.random() < 0.5 ? -1 : 1;
    if (ai.jink > 0) ai.jink -= dt, input.turn = ai.jinkDir, input.climb = 0.4, fire = false;
    // the ground, two and a half seconds ahead, and right under it
    const f = forward(p.yaw, p.pitch), look = Math.max(60, p.speed * 2.5);
    const ahead = groundAt(p.x + f.x * look, p.z + f.z * look), under = groundAt(p.x, p.z);
    if (p.y + f.y * look < ahead + 45 || p.y < under + 50) input.climb = 1, fire = false;
    if (p.y > ARENA.ceiling - 30) input.climb = Math.min(input.climb, -0.4);
    p.firing = fire;
    const r = fly(p, input, p.stats, dt);
    const fv = forward(p.yaw, p.pitch);
    p.vel.x = fv.x * p.speed; p.vel.y = fv.y * p.speed; p.vel.z = fv.z * p.speed;
    if (r === 'crash') this.down(p, '', 'crash');
  }
}
