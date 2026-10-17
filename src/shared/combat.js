// Guns and missiles. Pure geometry — the server runs it to decide what hit;
// the client runs the same numbers to draw tracers where the server will
// count them.
import { forward } from './flight.js';

export const GUN = {
  /** Muzzle velocity, m/s (plus the plane's own speed). */
  speed: 480,
  /** Seconds a round flies before it is spent: the guns' reach. */
  life: 1.0,
  /** How fat a plane is to a round. Generous: lag eats the rest. */
  hitR: 6.5,
  /** Aim help: a target this close to the nose (radians) and in reach is led. */
  assistCone: 0.08,
  assistRange: 520,
};

export const MISSILE = {
  speed: 155, life: 6, turn: 2.0, dmg: 40, hitR: 8,
  /** What can be locked: in front within this cone and range. */
  lockCone: 0.38, lockRange: 650,
  /** It arms after this long, so it cannot hit the plane that fired it. */
  arm: 0.25,
};

/**
 * Flares: hot decoys that pull a missile off its target. Each one fired
 * throws every missile chasing you with this chance; one comes back every
 * `reload` seconds.
 */
export const FLARE = { decoy: 0.85, reload: 10 };

/** Seconds of no damage before the airframe starts patching itself. */
export const REPAIR = { after: 6, perSec: 5 };
/** Seconds between going down and coming back, and of grace on arrival. */
export const RESPAWN = { delay: 3, shield: 3 };
/** Damage counts toward a kill (or an assist) for this long. */
export const CREDIT_MS = 15000;
/** Share of a victim's health dealt that earns an assist. */
export const ASSIST_SHARE = 0.2;

/**
 * Where does segment a→b first pass within r of c? Returns 0..1 along the
 * segment, or -1 if it does not.
 */
export function segmentHit(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const fx = ax - cx, fy = ay - cy, fz = az - cz;
  const A = dx * dx + dy * dy + dz * dz;
  const B = 2 * (fx * dx + fy * dy + fz * dz);
  const C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 0; // starts inside
  if (A < 1e-9) return -1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : -1;
}

/** The angle between the nose and the line to a point, radians. */
export function offNose(from, yaw, pitch, to) {
  const f = forward(yaw, pitch);
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (f.x * dx + f.y * dy + f.z * dz) / d)));
}

/**
 * The target nearest the nose within a cone and a reach, or null. Used to
 * lead the guns a little and to choose what a missile goes after.
 */
export function pickTarget(shooter, others, cone, range) {
  let best = null, bestA = cone;
  for (const o of others) {
    if (o === shooter || !o.alive) continue;
    const d = Math.hypot(o.x - shooter.x, o.y - shooter.y, o.z - shooter.z);
    if (d > range) continue;
    const a = offNose(shooter, shooter.yaw, shooter.pitch, o);
    if (a < bestA) { bestA = a; best = o; }
  }
  return best;
}

/**
 * Which way a round leaves: down the nose — or, with a target close to the
 * nose, at where that target will be when the round gets there. Returns a
 * unit vector.
 */
export function aimDir(shooter, target) {
  const f = forward(shooter.yaw, shooter.pitch);
  if (!target) return f;
  const d = Math.hypot(target.x - shooter.x, target.y - shooter.y, target.z - shooter.z);
  const t = d / (GUN.speed + (shooter.speed || 0));
  const v = target.vel || { x: 0, y: 0, z: 0 };
  const px = target.x + v.x * t - shooter.x, py = target.y + v.y * t - shooter.y, pz = target.z + v.z * t - shooter.z;
  const n = Math.hypot(px, py, pz) || 1;
  return { x: px / n, y: py / n, z: pz / n };
}

/** Steer a missile toward its target, turning at most `MISSILE.turn` rad/s. */
export function steerMissile(m, target, dt) {
  if (target && target.alive) {
    const dx = target.x - m.x, dy = target.y - m.y, dz = target.z - m.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let dy_ = Math.atan2(Math.sin(wantYaw - m.yaw), Math.cos(wantYaw - m.yaw));
    const k = MISSILE.turn * dt;
    m.yaw += Math.max(-k, Math.min(k, dy_));
    m.pitch += Math.max(-k, Math.min(k, wantPitch - m.pitch));
  }
  const f = forward(m.yaw, m.pitch);
  m.x += f.x * MISSILE.speed * dt;
  m.y += f.y * MISSILE.speed * dt;
  m.z += f.z * MISSILE.speed * dt;
}
