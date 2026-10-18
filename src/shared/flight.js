// How a plane flies. Arcade, not a simulator: the stick turns and climbs,
// the plane banks into its turns by itself, levels out when let go, and the
// afterburner burns a tank that refills. One function, run by the client for
// its own plane every frame, by the server for the bots, and by the server
// to judge whether what a client says it did could have been flown.
import { ARENA, hitsSolid } from './arena.js';

const clamp = (v, a = -1, b = 1) => (v < a ? a : v > b ? b : v);

/** Where the nose points. Yaw 0 is -z; a right turn lowers yaw. */
export function forward(yaw, pitch, out = { x: 0, y: 0, z: 0 }) {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}

export const PITCH_MAX = 1.25;
/** Afterburner tank: drains while lit, refills while not. */
/**
 * The air brake: held, the plane bleeds down to `slow` of its cruise and its
 * nose comes round `turn` times as fast — a tight turn, a U-turn onto a plane
 * chasing you, a way to let one overshoot.
 */
export const BRAKE = { slow: 0.55, turn: 1.35, bleed: 2.0 };
/** The burner: run dry (`min`), it lights again only once the tank is back to `relight`. */
export const BOOST = { drain: 0.32, fill: 0.14, min: 0.08, relight: 0.25 };

/** A plane's flying state, fresh. */
export function newBody(at, stats) {
  return { x: at.x, y: at.y, z: at.z, yaw: at.yaw || 0, pitch: at.pitch || 0, roll: 0, speed: stats.speed, fuel: 1, boosting: false };
}

/**
 * One step. `input` is { turn, climb, boost }: turn and climb run -1..1
 * (right and up are positive). Returns what happened: 'crash' when it flew
 * into something solid, 'edge' when the arena turned it back, or ''.
 */
export function fly(b, input, stats, dt) {
  const turn = clamp(+input.turn || 0), climb = clamp(+input.climb || 0);
  let edge = '';

  // the stick: yaw and pitch; the bank follows the turn
  b.yaw -= turn * stats.turn * dt;
  if (climb) b.pitch = clamp(b.pitch + climb * stats.climb * dt, -PITCH_MAX, PITCH_MAX);
  else b.pitch *= Math.max(0, 1 - 0.9 * dt); // let go and the nose comes back level
  b.roll += (-turn * 0.95 - b.roll) * Math.min(1, dt * 5);

  // past the edge: the plane turns itself back toward the middle
  const r = Math.hypot(b.x, b.z);
  if (r > ARENA.radius) {
    const home = Math.atan2(b.x, b.z); // the yaw that faces the middle
    let d = home - b.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    b.yaw += clamp(d, -1, 1) * 1.4 * dt;
    edge = 'edge';
  }

  // the afterburner
  if (b.fuel <= BOOST.min) b.dry = true; else if (b.fuel >= BOOST.relight) b.dry = false;
  b.boosting = !!input.boost && !b.dry;
  b.fuel = clamp(b.fuel + (b.boosting ? -BOOST.drain : stats.fill || BOOST.fill) * dt, 0, 1);
  // a climb costs speed and a dive gives it; the burner wins over both
  const want = (b.boosting ? stats.boost : stats.speed) - Math.sin(b.pitch) * stats.speed * 0.25;
  b.speed += (want - b.speed) * Math.min(1, dt * (b.boosting ? 2.2 : 1.2));

  const f = forward(b.yaw, b.pitch, FWD);
  b.x += f.x * b.speed * dt;
  b.y += f.y * b.speed * dt;
  b.z += f.z * b.speed * dt;

  if (b.y > ARENA.ceiling) { b.y = ARENA.ceiling; if (b.pitch > 0) b.pitch *= 0.5; }
  // a hard wall well past the soft one, for whatever slips through
  const r2 = Math.hypot(b.x, b.z), wall = ARENA.radius + 150;
  if (r2 > wall) { b.x *= wall / r2; b.z *= wall / r2; }
  // the ground, the sea, a building, the bridge: `b.hit` says which
  const hit = hitsSolid(b.x, b.y, b.z);
  if (hit) { b.hit = hit; return 'crash'; }
  return edge;
}
const FWD = { x: 0, y: 0, z: 0 };

/**
 * Could a plane have gone from `a` to `b` in `dt`? The server's question of
 * every pose a client sends: its top speed, with room for a late packet.
 */
export function plausibleMove(a, b, dt, stats) {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return d <= stats.boost * 1.3 * Math.min(dt, 1) + 12;
}

// ---- full attitude: loops, rolls, any way up --------------------------------
//
// The pilot's own plane flies by a quaternion, so nothing stops a loop at
// the vertical: pulling the stick turns the nose about the plane's own wings,
// pushing it sideways about the plane's own up — over the top of a loop, as
// in level flight, the stick means the same thing to the pilot. Let go of the
// stick and the plane rights itself and levels out, gently. (Bots still fly
// `fly` above; they have no need of loops.)

/** Quaternions as plain {x, y, z, w}: the server must not need three.js. */
export const Q = {
  ident: () => ({ x: 0, y: 0, z: 0, w: 1 }),
  mul(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  },
  axis(ax, ay, az, ang) { const s = Math.sin(ang / 2); return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(ang / 2) }; },
  norm(q) { const n = Math.hypot(q.x, q.y, q.z, q.w) || 1; q.x /= n; q.y /= n; q.z /= n; q.w /= n; return q; },
  /** v rotated by q. */
  rot(q, vx, vy, vz) {
    const ix = q.w * vx + q.y * vz - q.z * vy, iy = q.w * vy + q.z * vx - q.x * vz, iz = q.w * vz + q.x * vy - q.y * vx, iw = -q.x * vx - q.y * vy - q.z * vz;
    return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
  },
  /** From yaw, pitch and roll applied in that order (three's 'YXZ'). */
  euler(yaw, pitch, roll) {
    return Q.mul(Q.mul(Q.axis(0, 1, 0, yaw), Q.axis(1, 0, 0, pitch)), Q.axis(0, 0, 1, roll));
  },
};

/** A fresh body with an attitude, for the pilot's own plane. */
export function newBodyQ(at, stats) {
  const b = newBody(at, stats);
  b.q = Q.euler(b.yaw, b.pitch, 0);
  return b;
}

/**
 * One step of free flight. `input` as for `fly`. Keeps b.yaw and b.pitch
 * (the nose's heading and climb, what the guns use) in step with b.q, and
 * b.roll as the bank to draw on top of it.
 */
export function flyQ(b, input, stats, dt) {
  const turn = clamp(+input.turn || 0), climb = clamp(+input.climb || 0);
  // the brake (not with the burner lit): slower, and the nose quicker
  b.braking = !!input.brake && !input.boost;
  const agile = b.braking ? BRAKE.turn : 1;
  let edge = '';
  let q = b.q;
  const right = Q.rot(q, 1, 0, 0), up = Q.rot(q, 0, 1, 0);
  // the stick: about the wings to pitch, about the plane's up to turn
  if (climb) q = Q.mul(Q.axis(right.x, right.y, right.z, climb * stats.climb * agile * dt), q);
  if (turn) q = Q.mul(Q.axis(up.x, up.y, up.z, -turn * stats.turn * agile * dt), q);
  let f = Q.rot(q, 0, 0, -1);
  // hands off: roll back upright, then bring the nose to the horizon
  if (!climb && !turn && Math.abs(f.y) < 0.97) {
    const u = Q.rot(q, 0, 1, 0);
    // the up we want: world up, square to the nose
    let wx = -f.x * f.y, wy = 1 - f.y * f.y, wz = -f.z * f.y;
    const wn = Math.hypot(wx, wy, wz) || 1; wx /= wn; wy /= wn; wz /= wn;
    const cross = { x: u.y * wz - u.z * wy, y: u.z * wx - u.x * wz, z: u.x * wy - u.y * wx };
    const ang = Math.atan2(cross.x * f.x + cross.y * f.y + cross.z * f.z, u.x * wx + u.y * wy + u.z * wz);
    q = Q.mul(Q.axis(f.x, f.y, f.z, clamp(ang, -1, 1) * Math.min(1, dt * 1.6)), q);
    if (u.y > 0.3) {
      const r = Q.rot(q, 1, 0, 0);
      q = Q.mul(Q.axis(r.x, r.y, r.z, -Math.asin(clamp(f.y)) * Math.min(1, dt * 0.9)), q);
    }
  }
  // past the edge: turned back toward the middle, about the world's up
  if (Math.hypot(b.x, b.z) > ARENA.radius) {
    const home = Math.atan2(b.x, b.z), hdg = Math.atan2(-f.x, -f.z);
    const d = Math.atan2(Math.sin(home - hdg), Math.cos(home - hdg));
    q = Q.mul(Q.axis(0, 1, 0, clamp(d, -1, 1) * 1.4 * dt), q);
    edge = 'edge';
  }
  b.q = Q.norm(q);
  f = Q.rot(b.q, 0, 0, -1);
  b.roll += (-turn * 0.95 - b.roll) * Math.min(1, dt * 5);
  b.yaw = Math.atan2(-f.x, -f.z);
  b.pitch = Math.asin(clamp(f.y));

  if (b.fuel <= BOOST.min) b.dry = true; else if (b.fuel >= BOOST.relight) b.dry = false;
  b.boosting = !!input.boost && !b.dry;
  b.fuel = clamp(b.fuel + (b.boosting ? -BOOST.drain : stats.fill || BOOST.fill) * dt, 0, 1);
  const want = (b.boosting ? stats.boost : b.braking ? stats.speed * BRAKE.slow : stats.speed) - f.y * stats.speed * 0.25;
  b.speed += (want - b.speed) * Math.min(1, dt * (b.boosting ? 2.2 : b.braking ? BRAKE.bleed : 1.2));
  b.x += f.x * b.speed * dt;
  b.y += f.y * b.speed * dt;
  b.z += f.z * b.speed * dt;
  if (b.y > ARENA.ceiling) b.y = ARENA.ceiling;
  const r2 = Math.hypot(b.x, b.z), wall = ARENA.radius + 150;
  if (r2 > wall) { b.x *= wall / r2; b.z *= wall / r2; }
  const hit = hitsSolid(b.x, b.y, b.z);
  if (hit) { b.hit = hit; return 'crash'; }
  return edge;
}

/** The attitude to draw: the flight attitude with the bank on top. */
export const drawnQ = (b) => Q.mul(b.q, Q.axis(0, 0, 1, b.roll));
