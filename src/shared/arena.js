// The arena: a harbour city on a coast. Sea to the west with a few rocky
// islands; a bay cutting into the land with a suspension bridge across it,
// high enough to fly under; towers downtown at both ends of the bridge,
// low-rise blocks and parks around them; hills rising to mountains in the
// east. Everything solid is here — the ground, the buildings, the bridge —
// so the screen that draws it and the server that kills you on it agree.

export const ARENA = {
  /** Past this radius the plane is turned back toward the middle. */
  radius: 1150,
  /** Thin air: no climbing above it. */
  ceiling: 520,
  /** Fly lower than this over the ground (or the sea) and you hit it. */
  clearance: 2.5,
  /** Where a pilot comes in: on a ring, at height, facing the middle. */
  spawnRadius: 780,
  spawnAlt: 210,
};

// ---- noise, the same everywhere --------------------------------------------

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hash2 = (x, z) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise, 0..1. */
export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => noise(x, z) * 0.55 + noise(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + noise(x * 4.3 - 5, z * 4.3 + 31) * 0.15;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- the land and the water -----------------------------------------------

/** Where the coast runs: land is east of this x. */
export const coastX = (z) => 60 + 90 * Math.sin(z * 0.004) + 40 * Math.sin(z * 0.011 + 1.3);
/** The bay: its middle line and its width, from the mouth inland. */
export const BAY = { end: 780 };
export const bayZ = (x) => 30 * Math.sin(x * 0.006);
export const bayW = (x) => lerp(420, 170, smooth(60, 760, x));
/** 1 in the bay's water, 0 on its banks (smooth between). */
export function inBay(x, z) {
  if (x > BAY.end + 60) return 0;
  const half = bayW(x) / 2, off = Math.abs(z - bayZ(x));
  // the head of the bay closes in a round end
  const endK = 1 - smooth(BAY.end - 40, BAY.end + 60, x);
  return (1 - smooth(half - 10, half + 25, off)) * endK;
}

/** Rocky islands out at sea. */
export const ISLANDS = [
  { x: -460, z: -520, r: 130, h: 46, peak: 40 },
  { x: -720, z: 230, r: 95, h: 30, peak: 85 },
  { x: -330, z: 640, r: 75, h: 22, peak: 0 },
  { x: -880, z: -140, r: 60, h: 18, peak: 30 },
];

/** Height of the terrain, seabed included (negative under the sea). */
export function terrainAt(x, z) {
  const d = x - coastX(z);
  let h = lerp(-7, 5, smooth(-55, 25, d));
  // the city is flat; the land beyond it rolls up into hills and mountains
  const roll = smooth(560, 760, x);
  h += 3 * fbm(x * 0.01, z * 0.01) * smooth(0, 60, d) * (0.4 + roll);
  h += Math.max(0, x - 640) * 0.5 * (0.55 + 0.45 * fbm(x * 0.004 + 3, z * 0.004 - 7)) * roll;
  // ridges on the mountains
  h += roll * Math.max(0, x - 820) * 0.22 * (1 - Math.abs(noise(x * 0.007, z * 0.007) - 0.5) * 2);
  // the bay
  const w = inBay(x, z) * smooth(-80, 0, d + 80);
  h = lerp(h, -7, w);
  for (const o of ISLANDS) {
    const r = Math.hypot(x - o.x, z - o.z);
    if (r >= o.r) continue;
    const k = 1 - r / o.r;
    let ih = -7 + (o.h + 7) * k * k * (3 - 2 * k);
    if (o.peak && r < o.r * 0.45) { const q = 1 - r / (o.r * 0.45); ih += o.peak * q * q; }
    h = Math.max(h, ih);
  }
  return h;
}

/** The surface a plane can hit from above: the ground, or the sea. */
export const groundAt = (x, z) => Math.max(0, terrainAt(x, z));

// ---- the bridge -----------------------------------------------------------

const BX = 330, BZ = bayZ(BX);
/**
 * A suspension bridge across the bay: two towers standing in the water near
 * the banks, a deck 45 m over the sea, cables slung between the towers.
 * The deck and the towers are solid; the cables are not (fly through them
 * if you dare).
 */
export const BRIDGE = {
  x: BX, cz: BZ,
  z0: BZ - 300, z1: BZ + 300,
  deckTop: 50, deckBottom: 43, width: 28,
  towers: [BZ - 135, BZ + 135],
  towerTop: 168, legOffset: 12.5, leg: 7,
  beams: [64, 118, 160],
};

// ---- the city -------------------------------------------------------------

/** Downtown: the towers cluster at both ends of the bridge. */
const DOWNTOWN = [[BX + 40, BZ - 380], [BX + 40, BZ + 380]];
const BLOCK = 72, STREET = 20;

/** Is (x, z) city ground: flat land, off the water, not in the hills? */
export function cityAt(x, z) {
  const d = x - coastX(z);
  if (d < 45 || x > 640 || Math.abs(z) > 980) return 0;
  if (inBay(x, z) > 0 || Math.abs(z - bayZ(x)) < bayW(x) / 2 + 35) return 0;
  // the boulevard that runs onto the bridge stays clear
  if (Math.abs(x - BRIDGE.x) < 48 && z > BRIDGE.z0 - 220 && z < BRIDGE.z1 + 220) return 0;
  return 1;
}

/** The streets, for the map painter: block size, street width, origin. */
export const GRID = { block: BLOCK, street: STREET, x0: 0, z0: 0 };

export const BUILDINGS = (() => {
  const r = rng(4242), out = [];
  const step = BLOCK + STREET;
  for (let i = -2; i < 10; i++) for (let j = -12; j <= 12; j++) {
    const cx = i * step + step / 2, cz = j * step + step / 2;
    // the whole block on city ground
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => cityAt(cx + a * BLOCK / 2, cz + b * BLOCK / 2));
    if (!corners) continue;
    const down = Math.max(...DOWNTOWN.map(([dx, dz]) => Math.exp(-((cx - dx) ** 2 + (cz - dz) ** 2) / (260 * 260))));
    // a park now and then, more of them away from downtown
    if (r() < 0.12 * (1 - down)) continue;
    // one tower, or the block cut into two or four
    const split = down > 0.55 ? (r() < 0.6 ? 1 : 2) : r() < 0.35 ? 2 : 4;
    const parts = split === 1 ? [[0, 0, 1, 1]] : split === 2 ? (r() < 0.5 ? [[-0.25, 0, 0.5, 1], [0.25, 0, 0.5, 1]] : [[0, -0.25, 1, 0.5], [0, 0.25, 1, 0.5]])
      : [[-0.25, -0.25, 0.5, 0.5], [0.25, -0.25, 0.5, 0.5], [-0.25, 0.25, 0.5, 0.5], [0.25, 0.25, 0.5, 0.5]];
    for (const [ox, oz, sw, sd] of parts) {
      const w = BLOCK * sw - 8 - r() * 6, dd = BLOCK * sd - 8 - r() * 6;
      const x = cx + ox * BLOCK, z = cz + oz * BLOCK;
      let h = down > 0.3 ? 30 + down * 150 * (0.45 + r() * 0.7) : 10 + r() * 22;
      if (r() < 0.06) h *= 1.6;
      h = Math.min(h, 185);
      const kind = h > 70 ? (r() < 0.6 ? 'glass' : 'office') : r() < 0.5 ? 'flat' : 'office';
      out.push({ x, z, w, d: dd, h: Math.round(h), base: terrainAt(x, z), kind, tint: r() });
    }
  }
  return out;
})();

// ---- the solid things, and asking about them --------------------------------

/** Boxes a plane cannot pass: buildings, the deck, the towers' legs and beams. */
export const BOXES = (() => {
  const b = [];
  for (const o of BUILDINGS) b.push({ x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2, y0: o.base - 8, y1: o.base + o.h, kind: 'building' });
  const B = BRIDGE;
  b.push({ x0: B.x - B.width / 2, x1: B.x + B.width / 2, z0: B.z0, z1: B.z1, y0: B.deckBottom, y1: B.deckTop, kind: 'bridge' });
  for (const tz of B.towers) {
    for (const s of [-1, 1]) {
      const lx = B.x + s * B.legOffset;
      b.push({ x0: lx - B.leg / 2, x1: lx + B.leg / 2, z0: tz - B.leg / 2, z1: tz + B.leg / 2, y0: -10, y1: B.towerTop, kind: 'bridge' });
    }
    for (const by of B.beams) b.push({ x0: B.x - B.legOffset, x1: B.x + B.legOffset, z0: tz - 2.5, z1: tz + 2.5, y0: by - 3, y1: by + 3, kind: 'bridge' });
  }
  return b;
})();

// a grid over the boxes, so a question asks only the few nearby
const CELL = 40, grid = new Map();
for (const [i, o] of BOXES.entries()) {
  for (let gx = Math.floor(o.x0 / CELL); gx <= Math.floor(o.x1 / CELL); gx++) {
    for (let gz = Math.floor(o.z0 / CELL); gz <= Math.floor(o.z1 / CELL); gz++) {
      const k = gx * 100003 + gz;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  }
}
const near = (x, z) => grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || [];

/**
 * Has a plane at (x, y, z) hit something? Returns what ('ground', 'sea',
 * 'building', 'bridge') or ''. `r` is how fat the plane is.
 */
export function hitsSolid(x, y, z, r = 1.5) {
  const t = terrainAt(x, z);
  if (y < Math.max(0, t) + ARENA.clearance) return t > 0 ? 'ground' : 'sea';
  for (const i of near(x, z)) {
    const o = BOXES[i];
    if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r && y > o.y0 - r && y < o.y1 + r) return o.kind;
  }
  return '';
}

/** The highest solid thing at (x, z): what a bot looks ahead for. */
export function surfaceAt(x, z) {
  let y = groundAt(x, z);
  for (const i of near(x, z)) {
    const o = BOXES[i];
    if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && o.y1 > y) y = o.y1;
  }
  return y;
}

/** Is (x, y, z) under the bridge's deck, over the water? For the screen to cheer. */
export function underBridge(x, y, z) {
  const B = BRIDGE;
  return Math.abs(x - B.x) < B.width / 2 + 2 && z > B.z0 && z < B.z1 && y < B.deckBottom && y > 0;
}

/** The n-th spawn point of a ring of `count`, high over whatever is below, nose to the middle. */
export function spawnPoint(n, count = 12) {
  const a = (n % count) / count * Math.PI * 2;
  const x = Math.cos(a) * ARENA.spawnRadius, z = Math.sin(a) * ARENA.spawnRadius;
  const y = Math.max(ARENA.spawnAlt + (n % 3) * 25, surfaceAt(x, z) + 140);
  // facing the middle: forward is (-sin yaw, -cos yaw), so yaw = atan2(x, z)
  return { x, y, z, yaw: Math.atan2(x, z), pitch: 0 };
}

/**
 * Repair pads: rings of light on open ground. Fly low through one (inside
 * `r` metres, under `h` above the ground) and the airframe is patched up to
 * full; then the pad is spent for `every` seconds. Spread round the land
 * side, on flat ground clear of anything to fly into.
 */
export const HEAL = { r: 26, h: 45, every: 30 };
export const HEALS = [[433, 250], [139, 788], [69, -394], [520, -300], [156, -886]].map(([x, z]) => ({ x, z, y: groundAt(x, z) }));

/** The pad a plane at (x, y, z) is flying through, as its index, or -1. */
export function healAt(x, y, z) {
  for (let i = 0; i < HEALS.length; i++) {
    const p = HEALS[i];
    if (Math.hypot(x - p.x, z - p.z) < HEAL.r && y < p.y + HEAL.h) return i;
  }
  return -1;
}
