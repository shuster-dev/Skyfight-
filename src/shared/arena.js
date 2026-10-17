// The arena: an archipelago in open sea, a ring of peaks to fight around and
// a ceiling of thin air. The same islands on every screen and on the server,
// from one seed — the ground is where planes die, so everyone has to agree
// where it is.

export const ARENA = {
  /** Past this radius the plane is turned back toward the middle. */
  radius: 1100,
  /** Thin air: no climbing above it. */
  ceiling: 460,
  /** Fly lower than this over the ground (or the sea) and you hit it. */
  clearance: 2.5,
  /** Where a pilot comes in: on a ring, at height, facing the middle. */
  spawnRadius: 750,
  spawnAlt: 170,
};

// a small seeded generator, so the islands are the same everywhere
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * The islands. A few big ones with peaks, a scatter of small ones. Each is a
 * smooth dome: `h` at the middle down to the sea at `r`, with a sharper peak
 * `peak` on top for the mountains.
 */
export const ISLANDS = (() => {
  const r = rng(7331), out = [];
  // the big three, around the middle, for the fights to wrap around
  const big = [[-260, -180, 230, 70, 190], [320, 120, 200, 55, 150], [-40, 380, 170, 45, 120]];
  for (const [x, z, rad, h, peak] of big) out.push({ x, z, r: rad, h, peak, pr: rad * 0.35 });
  // the small ones, kept apart from the big ones and from each other
  let tries = 0;
  while (out.length < 16 && tries++ < 400) {
    const a = r() * Math.PI * 2, d = 250 + r() * 750;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, rad = 50 + r() * 90;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad + 40)) continue;
    const tall = r() < 0.35;
    out.push({ x, z, r: rad, h: 10 + r() * 22, peak: tall ? 40 + r() * 70 : 0, pr: rad * 0.4 });
  }
  return out;
})();

/** Height of the ground at (x, z); the sea is 0. */
export function groundAt(x, z) {
  let y = 0;
  for (const o of ISLANDS) {
    const d = Math.hypot(x - o.x, z - o.z);
    if (d >= o.r) continue;
    const k = 1 - d / o.r;
    // a dome that meets the sea gently, and the peak on top of it
    let h = o.h * (k * k * (3 - 2 * k));
    if (o.peak && d < o.pr) { const q = 1 - d / o.pr; h += o.peak * q * q; }
    if (h > y) y = h;
  }
  return y;
}

/** The n-th spawn point of a ring of `count`, at height, nose to the middle. */
export function spawnPoint(n, count = 12) {
  const a = (n % count) / count * Math.PI * 2;
  const x = Math.cos(a) * ARENA.spawnRadius, z = Math.sin(a) * ARENA.spawnRadius;
  // facing the middle: forward is (-sin yaw, -cos yaw), so yaw = atan2(x, z)
  return { x, y: ARENA.spawnAlt + (n % 3) * 25, z, yaw: Math.atan2(x, z), pitch: 0 };
}
