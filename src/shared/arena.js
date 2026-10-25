// The arena: the Land of Israel, pressed into a few kilometres. North is -z,
// the Mediterranean to the west. In the middle the coastal city (Tel Aviv:
// the towers, the river mouth with its bridge, the airfield to the south-
// east); to the north Haifa — its bay, its port, the Carmel running down to
// the sea — then the Galilee, the Kinneret in the rift and the Hermon with
// snow on it, the Golan beyond; to the east the Jerusalem hills, and over
// them the Jordan rift, the Dead Sea and Masada; to the south the Negev, the
// Ramon crater, and Eilat at the head of the Red Sea. Everything solid is
// here — the ground, the buildings, the bridge — so the screen that draws it
// and the server that kills you on it agree.

export const ARENA = {
  /** Past this radius the plane is turned back toward the middle. */
  radius: 2300,
  /** Thin air: no climbing above it. */
  ceiling: 520,
  /** Fly lower than this over the ground (or the sea) and you hit it. */
  clearance: 2.5,
  /** Where a pilot comes in: on a ring, at height, facing the middle. */
  spawnRadius: 900,
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

/**
 * Where the coast runs: land is east of this x. Haifa's bay bites into it in
 * the north, the Carmel's headland juts out just south of the bay, and south
 * of the city the coast bends away west (towards Sinai).
 */
export const coastX = (z) => 60 + 90 * Math.sin(z * 0.004) + 40 * Math.sin(z * 0.011 + 1.3)
  + 260 * Math.exp(-(((z + 1700) / 170) ** 2)) - 70 * Math.exp(-(((z + 1460) / 90) ** 2))
  - Math.max(0, z - 1200) * 0.45;
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

/** No islands off this coast. (Kept as a list: the drawing still asks.) */
export const ISLANDS = [];

/**
 * The places, where they are on this map (x east, z south). The ground is
 * shaped round them; the screen paints and plants by them.
 */
export const PLACES = {
  jerusalem: { x: 1150, z: 150, r: 190, h: 225 },
  carmel: { x0: -40, z0: -1470, x1: 520, z1: -1120 },
  hermon: { x: 1560, z: -2130 },
  kinneret: { x: 1760, z: -1300, rx: 150, rz: 240 },
  deadSea: { x: 1790, z: 760, rx: 170, rz: 430 },
  masada: { x: 1610, z: 1000, r: 55, h: 125 },
  ramon: { x: 980, z: 1700, r: 280 },
  eilat: { x: 1250, z: 1960 },
};
const ell = (x, z, o) => Math.hypot((x - o.x) / o.rx, (z - o.z) / o.rz);
/** How much of the desert (the Negev, the rift by the Dead Sea) is here, 0..1. */
export function desertAt(x, z) {
  const negev = smooth(1050, 1350, z);
  const rift = smooth(1520, 1640, x) * smooth(-300, 200, z);
  return Math.min(1, Math.max(negev, rift));
}
/** The Jordan rift, 1 in its floor. */
const riftK = (x, z) => smooth(1420, 1660, x) * (1 - smooth(1880, 2080, x)) * smooth(-1750, -1500, z) * (1 - smooth(2000, 2200, z));
/** The Red Sea's gulf at Eilat: 1 in its water. */
function gulfK(x, z) {
  const E = PLACES.eilat;
  if (z < E.z - 30) return 0;
  const half = 30 + (z - E.z) * 0.55;
  return (1 - smooth(half - 10, half + 25, Math.abs(x - E.x))) * smooth(E.z - 30, E.z + 20, z);
}

/**
 * The airfield, on the flat land north of the city: a runway along x, a
 * taxiway and an apron beside it, hangars, a control tower, fuel tanks.
 */
export const AIRFIELD = { x0: 160, x1: 620, z0: 700, z1: 960, runway: { x0: 175, x1: 600, z: 790, w: 34 }, taxi: 832, apron: { x0: 240, x1: 540, z0: 846, z1: 900 } };
/**
 * The port: Haifa's, at the back of the bay — a straight quay at x0 with deep
 * water off it, gantry cranes over the water, container stacks and sheds
 * behind, a freighter tied up alongside.
 */
export const PORT = { x0: 330, x1: 560, z0: -1810, z1: -1590 };
const portK = (z) => smooth(PORT.z0 - 30, PORT.z0, z) * (1 - smooth(PORT.z1, PORT.z1 + 30, z));
const fieldK = (x, z) => smooth(AIRFIELD.x0 - 30, AIRFIELD.x0, x) * (1 - smooth(AIRFIELD.x1, AIRFIELD.x1 + 30, x)) * smooth(AIRFIELD.z0 - 30, AIRFIELD.z0, z) * (1 - smooth(AIRFIELD.z1, AIRFIELD.z1 + 30, z));
/** Which site (x, z) is on, `m` metres round it counted in: 'airfield', 'port' or ''. */
export function siteAt(x, z, m = 0) {
  if (x > AIRFIELD.x0 - m && x < AIRFIELD.x1 + m && z > AIRFIELD.z0 - m && z < AIRFIELD.z1 + m) return 'airfield';
  if (x > PORT.x0 - 6 && x < PORT.x1 + m && z > PORT.z0 - m && z < PORT.z1 + m) return 'port';
  return '';
}

/** Height of the terrain, seabed included (negative under the sea). */
export function terrainAt(x, z) {
  const d = x - coastX(z);
  let h = lerp(-7, 5, smooth(-55, 25, d));
  const land = smooth(0, 60, d);
  // the coastal plain: flat, a little roll
  h += 3 * fbm(x * 0.01, z * 0.01) * land * 0.45;
  // the highlands: the Galilee in the north, Samaria and the Jerusalem hills
  // down the middle, a ridge of rolling hills up to the rift
  const west = lerp(720, 600, smooth(-1050, -1350, z));
  const hl = smooth(west, west + 320, x) * (1 - smooth(1380, 1620, x)) * (1 - smooth(950, 1250, z));
  if (hl > 0) {
    let up = 120 + 120 * fbm(x * 0.0032 + 3, z * 0.0032 - 7);
    up += 60 * (1 - Math.abs(noise(x * 0.006, z * 0.006) - 0.5) * 2) * smooth(-900, -1300, z); // craggier in the Galilee
    h += hl * up * land;
  }
  // Jerusalem: a broad plateau on the hilltops
  const J = PLACES.jerusalem, jr = Math.hypot(x - J.x, z - J.z);
  if (jr < J.r + 120) h = lerp(h, J.h + 8 * fbm(x * 0.02, z * 0.02), 1 - smooth(J.r, J.r + 120, jr));
  // the Carmel: a long ridge from the sea up to the south-east
  {
    const C = PLACES.carmel, vx = C.x1 - C.x0, vz = C.z1 - C.z0;
    const t = Math.max(0, Math.min(1, ((x - C.x0) * vx + (z - C.z0) * vz) / (vx * vx + vz * vz)));
    const cd = Math.hypot(x - (C.x0 + vx * t), z - (C.z0 + vz * t));
    if (cd < 220) h += (130 + 40 * fbm(x * 0.01, z * 0.01)) * (1 - smooth(30, 200, cd)) * land * (0.6 + 0.4 * Math.sin(t * Math.PI));
  }
  // the Golan, a high plateau east of the rift in the north, and the Hermon
  // standing over it, snow on top; the mountains of Moab across from the Dead Sea
  const east = smooth(1880, 2120, x);
  if (east > 0) {
    const golan = 1 - smooth(-1150, -950, z);
    h = lerp(h, golan * (205 + 25 * fbm(x * 0.006, z * 0.006)) + (1 - golan) * (150 + 80 * fbm(x * 0.004 + 9, z * 0.004)), east);
  }
  const H = PLACES.hermon;
  h += 390 * Math.exp(-(((x - H.x) ** 2 + (z - H.z) ** 2) / (2 * 260 * 260)));
  // the Jordan rift: a long low valley; the Kinneret and the Dead Sea in it
  const rk = riftK(x, z);
  if (rk > 0) h = lerp(h, 14 + 6 * fbm(x * 0.01, z * 0.01), rk);
  for (const L of [PLACES.kinneret, PLACES.deadSea]) {
    const e = ell(x, z, L);
    if (e < 1.25) h = lerp(h, -8, 1 - smooth(0.9, 1.2, e));
  }
  // the Negev: rolling desert, higher in the middle, the mountains of Eilat in the south
  const neg = smooth(1050, 1350, z) * land;
  if (neg > 0) {
    let dh = 30 + 70 * fbm(x * 0.003 + 5, z * 0.003 + 1) + 6 * Math.sin(x * 0.05 + z * 0.02) * fbm(x * 0.02, z * 0.02);
    dh += 110 * smooth(1700, 2100, z) * (1 - Math.abs(noise(x * 0.008, z * 0.008) - 0.5) * 2);
    h = lerp(h, Math.max(h, dh) * (1 - rk) + h * rk, neg);
  }
  // the Ramon crater: a rim, and a deep floor inside it
  {
    const R = PLACES.ramon, rr = Math.hypot((x - R.x) / 1.6, z - R.z) * 1.0;
    if (rr < R.r + 140) {
      h += 70 * Math.exp(-(((rr - R.r) / 55) ** 2));
      // the floor: deep, but dry land (never down to the sea)
      h = lerp(h, Math.max(28, h - 80), 1 - smooth(R.r - 90, R.r, rr));
    }
  }
  // Masada: a flat-topped rock by the Dead Sea
  {
    const M = PLACES.masada, mr = Math.hypot(x - M.x, z - M.z);
    if (mr < M.r + 30) h = lerp(h, M.h, 1 - smooth(M.r - 8, M.r + 12, mr));
  }
  // the Red Sea at Eilat
  const gk = gulfK(x, z);
  if (gk > 0) h = lerp(h, -9, gk);
  // the bay
  const w = inBay(x, z) * smooth(-80, 0, d + 80);
  h = lerp(h, -7, w);
  // the airfield is levelled; the port is a flat quay, deep water off it
  const fk = fieldK(x, z);
  if (fk > 0) h = lerp(h, 5, fk);
  const pk = portK(z);
  if (pk > 0) {
    if (x >= PORT.x0) h = lerp(h, 4.5, pk * (1 - smooth(PORT.x1, PORT.x1 + 40, x)));
    else h = lerp(h, -7, pk);
  }
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
  if (x > AIRFIELD.x0 - 20 && x < AIRFIELD.x1 + 20 && z > AIRFIELD.z0 - 20 && z < AIRFIELD.z1 + 20) return 0;
  if (x > PORT.x0 - 20 && x < PORT.x1 + 20 && z > PORT.z0 - 20 && z < PORT.z1 + 20) return 0;
  if (inBay(x, z) > 0 || Math.abs(z - bayZ(x)) < bayW(x) / 2 + 35) return 0;
  // the boulevard that runs onto the bridge stays clear
  if (Math.abs(x - BRIDGE.x) < 48 && z > BRIDGE.z0 - 220 && z < BRIDGE.z1 + 220) return 0;
  return 1;
}

/** The streets, for the map painter: block size, street width, origin. */
export const GRID = { block: BLOCK, street: STREET, x0: 0, z0: 0 };

// where the repair pads stand (see HEALS): kept clear of buildings
const PAD_SPOTS = [[433, 250], [139, 788], [69, -394], [520, -300], [430, -1545], [1150, 150]];

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
      if (PAD_SPOTS.some(([px, pz]) => Math.abs(px - x) < w / 2 + 36 && Math.abs(pz - z) < dd / 2 + 36)) continue;
      let h = down > 0.3 ? 30 + down * 150 * (0.45 + r() * 0.7) : 10 + r() * 22;
      if (r() < 0.06) h *= 1.6;
      h = Math.min(h, 185);
      const kind = h > 70 ? (r() < 0.6 ? 'glass' : 'office') : r() < 0.5 ? 'flat' : 'office';
      const b = { x, z, w, d: dd, h: Math.round(h), base: terrainAt(x, z), kind, tint: r() };
      // a tall one steps in once or twice on the way up, as towers do; the
      // tallest wear a spire, and some flat roofs a helipad
      const look = r();
      if (b.h > 75 && look < 0.55) b.step = { at: Math.round(b.h * (0.45 + r() * 0.25)), k: 0.62 + r() * 0.16 };
      if (b.h > 110 && look > 0.7) b.spire = 12 + Math.round(r() * 18);
      else if (b.h > 60 && !b.step && look > 0.35) b.pad = true;
      out.push(b);
    }
  }
  return out;
})();

/**
 * What stands at the airfield and the port: boxes a plane can hit, each
 * with what it is so the screen can draw it as that. (h is from `base`.)
 */
export const STRUCTURES = (() => {
  const out = [], A = AIRFIELD, P = PORT;
  const at = (kind, x, z, w, d, h, extra = {}) => out.push({ kind, x, z, w, d, h, base: groundAt(x, z), ...extra });
  // three arched hangars behind the apron, a control tower, fuel tanks
  for (const x of [290, 370, 450]) at('hangar', x, 928, 64, 44, 19);
  at('tower', 565, 872, 9, 9, 34);
  at('terminal', 565, 918, 46, 30, 11);
  for (const [x, z] of [[604, 900], [604, 926], [580, 950]]) at('tank', x, z, 16, 16, 12);
  // the port: three gantry cranes on the quay, their booms out over the water
  const zc = (P.z0 + P.z1) / 2;
  for (const z of [zc - 65, zc - 5, zc + 55]) {
    at('craneLeg', P.x0 + 6, z - 9, 3, 3, 46, { crane: z });
    at('craneLeg', P.x0 + 6, z + 9, 3, 3, 46, { crane: z });
    at('craneLeg', P.x0 + 30, z - 9, 3, 3, 46, { crane: z });
    at('craneLeg', P.x0 + 30, z + 9, 3, 3, 46, { crane: z });
    out.push({ kind: 'craneBoom', x: P.x0 - 4, z, w: 74, d: 6, h: 6, base: groundAt(P.x0 + 6, z) + 46 });
  }
  // container stacks in rows, and two long sheds
  const r = rng(808);
  for (let x = P.x0 + 52; x < P.x0 + 150; x += 16) {
    for (let z = P.z0 + 22; z < P.z1 - 10; z += 34) {
      if (r() < 0.15) continue;
      at('stack', x, z, 12, 28, 2.6 * (1 + Math.floor(r() * 4)), { seed: Math.floor(r() * 1e6) });
    }
  }
  at('shed', P.x0 + 190, zc - 30, 40, 110, 13);
  at('shed', P.x0 + 190, zc + 80, 40, 50, 11);
  // the freighter tied up at the quay
  out.push({ kind: 'hull', x: P.x0 - 16, z: zc, w: 22, d: 150, h: 13, base: -4 });
  out.push({ kind: 'bridgehouse', x: P.x0 - 16, z: zc + 65, w: 18, d: 14, h: 16, base: 9 });
  return out;
})();

// ---- the solid things, and asking about them --------------------------------

/** Boxes a plane cannot pass: buildings, the deck, the towers' legs and beams. */
export const BOXES = (() => {
  const b = [];
  for (const o of BUILDINGS) {
    // a stepped tower: the full footprint up to the step, the narrower top above it
    const top = o.step ? o.base + o.step.at : o.base + o.h;
    b.push({ x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2, y0: o.base - 8, y1: top, kind: 'building' });
    if (o.step) { const w = o.w * o.step.k / 2, d = o.d * o.step.k / 2; b.push({ x0: o.x - w, x1: o.x + w, z0: o.z - d, z1: o.z + d, y0: top - 1, y1: o.base + o.h, kind: 'building' }); }
  }
  for (const o of STRUCTURES) b.push({ x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2, y0: o.base - 6, y1: o.base + o.h, kind: 'building' });
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
export const HEALS = PAD_SPOTS.map(([x, z]) => ({ x, z, y: groundAt(x, z) }));

/** The pad a plane at (x, y, z) is flying through, as its index, or -1. */
export function healAt(x, y, z) {
  for (let i = 0; i < HEALS.length; i++) {
    const p = HEALS[i];
    if (Math.hypot(x - p.x, z - p.z) < HEAL.r && y < p.y + HEAL.h) return i;
  }
  return -1;
}
