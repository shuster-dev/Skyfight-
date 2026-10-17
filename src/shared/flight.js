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
export const BOOST = { drain: 0.32, fill: 0.14, min: 0.08 };

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
  b.boosting = !!input.boost && b.fuel > BOOST.min;
  b.fuel = clamp(b.fuel + (b.boosting ? -BOOST.drain : BOOST.fill) * dt, 0, 1);
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
