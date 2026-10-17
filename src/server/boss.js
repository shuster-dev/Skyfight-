// The bomber: every few minutes a heavy four-engined bomber crosses the city
// on a long slow circle, guns in its turrets. Everyone in the sky can go for
// it at once; when it goes down, the pay is shared by the damage each pilot
// did, and whoever did the most takes a prize on top. If it is still flying
// when its time is up, it gets away and nobody is paid.
//
// It lives in the arena room: the room calls `tick`, and asks it about
// rounds, missiles and planes that come near.
import { BRIDGE } from '../shared/arena.js';
import { forward } from '../shared/flight.js';
import { GUN, RAM, ramDamage, segmentHit } from '../shared/combat.js';
import { payBonus, view } from './pilot.js';

export const BOSS = {
  first: 2 * 60e3,          // after the first pilot comes in
  every: 6 * 60e3,          // between one and the next
  stays: 3 * 60e3,          // before it gets away
  hp: 700, hpPerPilot: 300, // tougher with more pilots in the sky
  speed: 38, alt: 300,
  cx: BRIDGE.x - 80, cz: BRIDGE.cz, R: 560,
  r: 13, len: 16,           // three spheres along the fuselage, and the wings
  turret: { range: 420, every: 0.32, dmg: 3, spread: 0.035 },
  pay: { gold: 1600, xp: 900, topGold: 1000, topXp: 350, minShare: 0.03 },
};
const q = (v, k = 10) => Math.round(v * k);

export class Bomber {
  constructor(room, opt = {}) {
    this.room = room;
    this.cfg = { ...BOSS, ...Object.fromEntries(Object.entries(opt).filter(([, v]) => v !== undefined)) };
    this.next = Date.now() + this.cfg.first;
    this.b = null;
  }

  /** The bomber as a target (for missiles and the aim help), or null. */
  get target() { return this.b && this.b.hp > 0 ? this.b : null; }

  tick(dt, now) {
    const humans = [...this.room.planes.values()].filter((p) => !p.bot).length;
    if (!this.b) {
      if (!humans) this.next = Math.max(this.next, now + 30e3); // nobody to see it: wait
      if (now >= this.next && humans) this.spawn(now, humans);
      return;
    }
    const b = this.b;
    b.a += (this.cfg.speed / this.cfg.R) * dt;
    const px = b.x, py = b.y, pz = b.z;
    b.x = this.cfg.cx + Math.cos(b.a) * this.cfg.R;
    b.z = this.cfg.cz + Math.sin(b.a) * this.cfg.R;
    b.y = this.cfg.alt + Math.sin(b.a * 3) * 12;
    b.vel = { x: (b.x - px) / dt, y: (b.y - py) / dt, z: (b.z - pz) / dt };
    b.yaw = Math.atan2(-b.vel.x, -b.vel.z);
    b.pitch = 0;
    this.turrets(dt, now);
    this.rams(now);
    if (now > b.until) {
      this.room.broadcast('bossGone', { escaped: true });
      this.b = null;
      this.next = now + this.cfg.every;
    }
  }

  spawn(now, humans) {
    const hp = this.cfg.hp + this.cfg.hpPerPilot * humans;
    this.b = { key: 'boss', alive: true, hp, maxHp: hp, a: Math.random() * Math.PI * 2, x: 0, y: this.cfg.alt, z: 0, yaw: 0, pitch: 0, vel: { x: 0, y: 0, z: 0 }, until: now + this.cfg.stays, dmg: new Map(), turretT: 0, rammed: new Map() };
    this.tick(0.001, now);
    this.room.broadcast('bossStart', { hp, until: this.cfg.stays });
  }

  /** The points a round or a plane can hit: along the fuselage, and out on the wings. */
  spheres() {
    const b = this.b, f = forward(b.yaw, 0), L = this.cfg.len, rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    return [
      [b.x, b.y, b.z, this.cfg.r],
      [b.x + f.x * L, b.y, b.z + f.z * L, this.cfg.r * 0.8],
      [b.x - f.x * L, b.y, b.z - f.z * L, this.cfg.r * 0.8],
      [b.x + rx * 22, b.y, b.z + rz * 22, this.cfg.r * 0.7],
      [b.x - rx * 22, b.y, b.z - rz * 22, this.cfg.r * 0.7],
    ];
  }

  /** Does a segment (a round's flight this tick) pass through the bomber? */
  hitBy(ax, ay, az, bx, by, bz, extra = 0) {
    if (!this.target) return false;
    for (const [x, y, z, r] of this.spheres()) if (segmentHit(ax, ay, az, bx, by, bz, x, y, z, r + extra) >= 0) return true;
    return false;
  }

  /** Damage to the bomber from a pilot (or a bot). */
  hurt(byKey, dmg) {
    const b = this.target;
    if (!b) return;
    b.hp -= dmg;
    b.dmg.set(byKey, (b.dmg.get(byKey) || 0) + dmg);
    const p = this.room.planes.get(byKey);
    p && this.room.sendTo(p, 'hit', { v: 'boss', d: Math.round(dmg) });
    if (b.hp <= 0) this.down();
  }

  /** Its gunners: a burst at whoever is close, a little off. */
  turrets(dt, now) {
    const b = this.b, T = this.cfg.turret;
    b.turretT += dt;
    if (b.turretT < T.every) return;
    b.turretT = 0;
    const near = [...this.room.planes.values()].filter((p) => p.alive && now >= p.shieldUntil && Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < T.range);
    if (!near.length) return;
    const p = near[Math.floor(Math.random() * near.length)];
    const d = Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z), t = d / GUN.speed, v = p.vel || { x: 0, y: 0, z: 0 };
    let dx = p.x + v.x * t - b.x, dy = p.y + v.y * t - b.y, dz = p.z + v.z * t - b.z;
    const n = Math.hypot(dx, dy, dz) || 1;
    dx = dx / n + (Math.random() - 0.5) * T.spread * 2; dy = dy / n + (Math.random() - 0.5) * T.spread * 2; dz = dz / n + (Math.random() - 0.5) * T.spread * 2;
    // from the turret on the side facing the target, clear of the bomber's own spheres
    const sx = b.x + dx * 18, sy = b.y + dy * 18, sz = b.z + dz * 18;
    this.room.bullets.push({ owner: 'boss', team: '', t: 0, dmg: T.dmg, x: sx, y: sy, z: sz, vx: dx * GUN.speed, vy: dy * GUN.speed, vz: dz * GUN.speed });
    this.room.broadcast('bt', [q(sx), q(sy), q(sz), q(dx, 1000), q(dy, 1000), q(dz, 1000)]);
  }

  /** A plane that flies into the bomber: it is hurt badly, the bomber a little. */
  rams(now) {
    const b = this.b;
    for (const p of this.room.planes.values()) {
      if (!p.alive || now < p.shieldUntil) continue;
      if (now - (b.rammed.get(p.key) || 0) < RAM.cooldown) continue;
      const inside = this.spheres().some(([x, y, z, r]) => Math.hypot(p.x - x, p.y - y, p.z - z) < r + 3);
      if (!inside) continue;
      b.rammed.set(p.key, now);
      const closing = Math.hypot(p.vel.x - b.vel.x, p.vel.y - b.vel.y, p.vel.z - b.vel.z);
      this.room.broadcast('ram', { a: p.key, b: 'boss', d: Math.round(ramDamage(closing) * 1.5), at: [q(p.x), q(p.y), q(p.z)] });
      this.room.hurt(p, 'boss', ramDamage(closing) * 1.5, 'collision');
      this.hurt(p.key, 60);
      if (!this.b) return;
    }
  }

  /**
   * Down it goes. Pay by share of the damage (a few percent at least to be
   * counted), a prize on top for the one who did the most.
   */
  down() {
    const b = this.b, C = this.cfg.pay;
    const rows = [...b.dmg.entries()].map(([k, d]) => ({ p: this.room.planes.get(k), d })).filter((r) => r.p).sort((x, y) => y.d - x.d);
    const total = rows.reduce((s, r) => s + r.d, 0) || 1;
    const top = rows[0]?.p;
    for (const { p, d } of rows) {
      const share = d / total;
      if (share < C.minShare) continue;
      const first = p === top;
      const gold = Math.round(C.gold * share) + (first ? C.topGold : 0);
      const xp = Math.round(C.xp * share) + (first ? C.topXp : 0);
      if (p.pilot) {
        const r = payBonus(p.pilot, { xp, gold });
        p.level = p.pilot.level;
        this.room.store.savePilot(p.pilot);
        this.room.sendTo(p, 'reward', { ...r, boss: true, top: first, share: Math.round(share * 100), pilot: view(p.pilot) });
      }
    }
    this.room.broadcast('bossDown', { at: [q(b.x), q(b.y), q(b.z)], top: rows.slice(0, 3).map((r) => ({ key: r.p.key, name: r.p.name, pct: Math.round((r.d / total) * 100) })) });
    this.b = null;
    this.next = Date.now() + this.cfg.every;
    this.room.rosterDirty = true;
  }

  /** For the snapshot: where it is and how it fares. */
  snap() {
    const b = this.target;
    if (!b) return null;
    return [q(b.x), q(b.y), q(b.z), q(b.yaw, 1000), Math.max(0, Math.round((b.hp / b.maxHp) * 1000)), Math.max(0, Math.round((b.until - Date.now()) / 1000))];
  }
}
