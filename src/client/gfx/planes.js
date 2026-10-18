// The planes, modelled from real shapes: fuselages lofted through
// cross-sections (round on the piston fighter, boxy on the heavy twin, chined
// on the stealth), wings and fins with a true airfoil, bubble canopies that
// catch the sky, and paint drawn on canvas — camouflage, panel lines, the
// squadron insignia and a number on the tail.
//
// Every model faces -z with y up and x to the right.
// userData: props (spin), flames (scale with the burner), guns (muzzles, for
// tracers and flashes), tips (wingtips, for vapour), missiles (meshes under
// the wings, shown one per missile ready, of the model carried), barrels (the
// carried gun's muzzles), load ({ missile, gun }).
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, SRGBColorSpace, Vector3, BoxGeometry, TorusGeometry,
} from 'three';
import { PAINTS, PLANES } from '../../shared/planes.js';
import { buildMissile } from './arms.js';

// ---- shapes -------------------------------------------------------------------

/**
 * A body lofted through cross-sections, nose (-z) to tail (+z). Each station
 * is { z, w, h, y = 0, p = 2 }: width, height, centre height, and the
 * squareness of the section (2 an ellipse, higher boxier). UVs: u round the
 * section from the belly (0) up the right side to the spine (0.5); v along.
 */
function loft(stations, R = 20) {
  const pos = [], uv = [], idx = [];
  const z0 = stations[0].z, z1 = stations[stations.length - 1].z;
  for (const s of stations) {
    const p = s.p || 2;
    for (let i = 0; i <= R; i++) {
      const th = (i / R) * Math.PI * 2;
      const sn = Math.sin(th), cs = Math.cos(th);
      const x = (s.w / 2) * Math.sign(sn) * Math.abs(sn) ** (2 / p);
      const y = (s.y || 0) - (s.h / 2) * Math.sign(cs) * Math.abs(cs) ** (2 / p);
      pos.push(x, y, s.z);
      uv.push(i / R, (s.z - z0) / (z1 - z0));
    }
  }
  const row = R + 1;
  for (let k = 0; k < stations.length - 1; k++) {
    for (let i = 0; i < R; i++) {
      const a = k * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // close the tail
  const last = (stations.length - 1) * row, centre = pos.length / 3, t = stations[stations.length - 1];
  pos.push(0, t.y || 0, t.z); uv.push(0.5, 1);
  for (let i = 0; i < R; i++) idx.push(last + i + 1, last + i, centre);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a symmetric airfoil (NACA 00xx), as chord stations from the leading edge
const FOIL = [0, 0.02, 0.06, 0.12, 0.22, 0.34, 0.48, 0.62, 0.76, 0.88, 1];
const thickAt = (x) => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);

/**
 * A lifting surface: `at(t, xc, side)` places the point at span fraction t
 * (0 root, 1 tip), chord fraction xc and side (+1 upper, -1 lower), given the
 * airfoil half-thickness `yt` in chords. UV: u = t, v = xc on the top half
 * (0..0.5) and the bottom half (0.5..1), so paint can tell them apart.
 */
function surface(n, at, mirror = false) {
  const pos = [], uv = [], idx = [];
  const ring = [];
  for (let j = FOIL.length - 1; j >= 0; j--) ring.push([FOIL[j], 1]);
  for (let j = 1; j < FOIL.length; j++) ring.push([FOIL[j], -1]);
  const R = ring.length;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (const [xc, side] of ring) {
      const [x, y, z] = at(t, xc, side * thickAt(xc));
      pos.push(mirror ? -x : x, y, z);
      uv.push(t, side > 0 ? xc * 0.5 : 0.5 + xc * 0.5);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    if (mirror) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  // cap the tip
  const tip = n * R, centre = pos.length / 3;
  const [cx, cy, cz] = at(1, 0.4, 0);
  pos.push(mirror ? -cx : cx, cy, cz); uv.push(1, 0.2);
  for (let j = 0; j < R - 1; j++) mirror ? idx.push(tip + j, tip + j + 1, centre) : idx.push(tip + j + 1, tip + j, centre);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A pair of wings (or tailplanes). Chord and leading edge as functions of t. */
function wings({ x0, span, chord, le, y0 = 0, dihedral = 0, thick = 0.12, n = 6 }) {
  const at = (t, xc, yt) => [x0 + t * span, y0 + t * span * Math.tan(dihedral) + yt * chord(t) * thick, le(t) + xc * chord(t)];
  return [surface(n, at), surface(n, at, true)];
}

/** A fin standing up from (x0, y0), canted outward by `cant`. */
function fin({ x0 = 0, y0, height, chord, le, thick = 0.09, cant = 0, n = 4 }) {
  const at = (t, xc, yt) => {
    const h = t * height;
    return [x0 + yt * chord(t) * thick + Math.sin(cant) * h, y0 + Math.cos(cant) * h, le(t) + xc * chord(t)];
  };
  return surface(n, at);
}

// ---- paint --------------------------------------------------------------------

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** The squadron insignia: a ring, a disc, a chevron. Low-vis on the modern ones. */
function roundel(g, x, y, r, low) {
  g.save();
  g.translate(x, y);
  g.fillStyle = low ? '#6d747c' : '#f4f4f0'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = low ? '#555b62' : '#1c3f8a'; g.beginPath(); g.arc(0, 0, r * 0.78, 0, Math.PI * 2); g.fill();
  g.fillStyle = low ? '#7a828b' : '#2fd3bd';
  g.beginPath(); g.moveTo(-r * 0.5, -r * 0.05); g.lineTo(0, -r * 0.5); g.lineTo(r * 0.5, -r * 0.05); g.lineTo(r * 0.5, r * 0.25); g.lineTo(0, -r * 0.2); g.lineTo(-r * 0.5, r * 0.25); g.closePath(); g.fill();
  g.restore();
}

/** Blotches of camouflage: soft-edged shapes in the given colours. */
function camo(g, W, H, colors, seed, scale = 1, y0 = 0, y1 = H) {
  const r = rng(seed);
  for (const col of colors) {
    g.fillStyle = col;
    for (let i = 0; i < 26 * scale; i++) {
      const x = r() * W, y = y0 + r() * (y1 - y0), rx = (20 + r() * 50) / scale, ry = (10 + r() * 26) / scale;
      g.beginPath();
      // a lumpy blob: an ellipse with a wobbling edge
      for (let a = 0; a <= 12; a++) {
        const t = (a / 12) * Math.PI * 2, k = 0.75 + r() * 0.5;
        const px = x + Math.cos(t) * rx * k, py = y + Math.sin(t) * ry * k;
        a ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    }
  }
}

/** Panel lines and rivets: the plane is built of plates, not cast in one piece. */
function panels(g, W, H, seed, alpha = 0.22, dense = 1) {
  const r = rng(seed);
  g.strokeStyle = `rgba(20,22,26,${alpha})`;
  g.lineWidth = 1.2;
  for (let i = 0; i < 18 * dense; i++) { const y = r() * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (r() - 0.5) * 6); g.stroke(); }
  for (let i = 0; i < 26 * dense; i++) { const x = r() * W, y = r() * H, l = 30 + r() * 90; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + l); g.stroke(); }
  g.fillStyle = `rgba(20,22,26,${alpha * 0.6})`;
  for (let i = 0; i < 500 * dense; i++) g.fillRect(r() * W, r() * H, 1.2, 1.2);
}

// v runs down the canvas as drawn (nose at the top, upper surfaces on the top half)
const tex = (cv) => { const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; t.flipY = false; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

/**
 * The paint schemes. Body: x is u (round the section, belly at the edges and
 * spine in the middle), y is v (nose at the top). Wing: x is span (root at
 * 0), top half the upper surface, bottom half the lower.
 */
const SCHEMES = {
  // olive drab over neutral grey, yellow nose band — late war
  sparrow: { top: '#4d5730', blot: ['#3d4526', '#5b6438'], under: '#9fa197', metal: 0.15, rough: 0.6, nose: '#e2b52c', low: false, num: '17' },
  // bare polished aluminium, black glare panel, a yellow band
  hornet: { top: '#c4c8cd', blot: [], under: '#b9bdc2', metal: 0.6, rough: 0.32, band: '#e5bd2b', glare: true, low: false, num: '43' },
  // two greys in splinters, low-vis markings
  bulldog: { top: '#8794a1', blot: ['#6e7a87', '#7d8995'], under: '#a6b0ba', metal: 0.2, rough: 0.55, low: true, num: '688', splinter: true },
  // desert: sand, brown and green over light blue
  viper: { top: '#c3a26c', blot: ['#8a683d', '#6f7350'], under: '#a8bac7', metal: 0.15, rough: 0.6, low: false, num: '874' },
  // radar-absorbent dark grey with darker saw-toothed panel edges
  phantom: { top: '#62686f', blot: [], under: '#5c6268', metal: 0.25, rough: 0.5, low: true, num: '901', stealth: true },
};

function paintBody(S) {
  const [c, g] = canvas(512, 512), W = 512, H = 512;
  g.fillStyle = S.under; g.fillRect(0, 0, W, H);
  // the upper half of the section: u from 0.25 to 0.75
  const t0 = W * 0.22, t1 = W * 0.78;
  g.fillStyle = S.top; g.fillRect(t0, 0, t1 - t0, H);
  if (S.blot.length) {
    g.save(); g.beginPath(); g.rect(t0, 0, t1 - t0, H); g.clip();
    S.splinter ? splinters(g, t0, t1, H, S.blot, 7) : camo(g, W, H, S.blot, 7, 1.4);
    g.restore();
  }
  if (S.stealth) sawtooth(g, W, H);
  panels(g, W, H, 3, S.low ? 0.25 : 0.2);
  if (S.nose) { g.fillStyle = S.nose; g.fillRect(0, 0, W, H * 0.07); }
  if (S.band) { g.fillStyle = '#1a1a1a'; g.fillRect(0, H * 0.555, W, H * 0.07); g.fillStyle = S.band; g.fillRect(0, H * 0.565, W, H * 0.05); }
  if (S.glare) { g.fillStyle = '#1b1d20'; g.fillRect(W * 0.42, 0, W * 0.16, H * 0.24); }
  // the insignia on both flanks, and a number
  roundel(g, W * 0.25, H * 0.66, 34, S.low);
  roundel(g, W * 0.75, H * 0.66, 34, S.low);
  return tex(c);
}

function paintWing(S) {
  const [c, g] = canvas(512, 512), W = 512, H = 512;
  g.fillStyle = S.top; g.fillRect(0, 0, W, H / 2);
  g.fillStyle = S.under; g.fillRect(0, H / 2, W, H / 2);
  if (S.blot.length) {
    g.save(); g.beginPath(); g.rect(0, 0, W, H / 2); g.clip();
    S.splinter ? splinters(g, 0, W, H / 2, S.blot, 11) : camo(g, W, H / 2, S.blot, 11, 1);
    g.restore();
  }
  if (S.stealth) sawtooth(g, W, H / 2);
  panels(g, W, H, 9, 0.18, 0.8);
  // insignia on the outer wing, above and below; on the tip, a coloured band
  roundel(g, W * 0.7, H * 0.25, 46, S.low);
  roundel(g, W * 0.7, H * 0.75, 46, S.low);
  if (S.nose) { g.fillStyle = S.nose; g.fillRect(W * 0.94, 0, W * 0.06, H); }
  return tex(c);
}

function paintFin(S) {
  const [c, g] = canvas(256, 256), W = 256, H = 256;
  g.fillStyle = S.top; g.fillRect(0, 0, W, H);
  if (S.blot.length) S.splinter ? splinters(g, 0, W, H, S.blot, 5) : camo(g, W, H, S.blot, 5, 2);
  if (S.band) { g.fillStyle = S.band; g.fillRect(W * 0.7, 0, W * 0.12, H); }
  panels(g, W, H, 13, 0.2, 0.4);
  // the tail number on both sides (each side is one half of the chord, v)
  for (const [y, flip] of [[H * 0.3, 1], [H * 0.7, -1]]) {
    g.save();
    g.translate(W * 0.36, y);
    g.rotate(Math.PI / 2 * flip);
    g.scale(-1, 1); // the fin's chord runs against the canvas: unmirror
    g.fillStyle = S.low ? '#3f454c' : '#16181b';
    g.font = 'bold 40px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(S.num, 0, 0);
    g.restore();
  }
  return tex(c);
}

function splinters(g, x0, x1, H, colors, seed) {
  const r = rng(seed);
  for (const col of colors) {
    g.fillStyle = col;
    for (let i = 0; i < 9; i++) {
      const x = x0 + r() * (x1 - x0), y = r() * H;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo(x + (r() - 0.3) * 160, y + (r() - 0.3) * 120);
      g.closePath(); g.fill();
    }
  }
}

function sawtooth(g, W, H) {
  g.strokeStyle = 'rgba(30,33,37,0.65)';
  g.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    const y = 40 + k * (H - 80) / 5;
    g.beginPath();
    for (let x = 0; x <= W; x += 24) g.lineTo(x, y + ((x / 24) % 2 ? 10 : -10));
    g.stroke();
  }
}

// ---- parts ----------------------------------------------------------------------

const GLASS = () => new MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.04, metalness: 0.95, transparent: true, opacity: 0.88 });
const DARK = () => new MeshStandardMaterial({ color: 0x24272c, roughness: 0.6, metalness: 0.4 });
const STEEL = () => new MeshStandardMaterial({ color: 0x5d6168, roughness: 0.35, metalness: 0.9 });

function canopy(z, y, len, w, h, framed) {
  const g = new Group();
  const m = new Mesh(new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), GLASS());
  m.scale.set(w, h, len);
  m.position.set(0, y, z);
  g.add(m);
  if (framed) {
    // the frame hoops of an old canopy
    for (const k of [-0.45, 0.3]) {
      const ring = new Mesh(new TorusGeometry(1, 0.035, 6, 20, Math.PI), DARK());
      ring.scale.set(w * Math.sqrt(1 - k * k), h * Math.sqrt(1 - k * k), 1);
      ring.position.set(0, y, z + k * len);
      g.add(ring);
    }
  }
  return g;
}

function flame(x, y, z, r, color = 0xffa040) {
  const geo = new ConeGeometry(r, 1, 12, 1, true);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 0.5);
  const m = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z);
  m.scale.set(1, 1, 1.2);
  return m;
}

function nozzle(x, y, z, r, len = 1.4) {
  const g = new Group();
  const n = new Mesh(new CylinderGeometry(r * 0.92, r, len, 18, 1, true).rotateX(Math.PI / 2), STEEL());
  n.position.set(x, y, z);
  const inner = new Mesh(new CylinderGeometry(r * 0.7, r * 0.7, 0.1, 18).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x401a08, roughness: 1 }));
  inner.position.set(x, y, z - len * 0.2);
  g.add(n, inner);
  return g;
}

function propeller(z, y, blades, r, spinner) {
  const g = new Group();
  const hub = new Mesh(new ConeGeometry(0.42, 1.2, 16).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: spinner, roughness: 0.4, metalness: 0.3 }));
  hub.position.z = -0.4;
  g.add(hub);
  const bladeM = new MeshStandardMaterial({ color: 0x17181b, roughness: 0.5 });
  const tipM = new MeshStandardMaterial({ color: 0xe2b52c, roughness: 0.5 });
  for (let i = 0; i < blades; i++) {
    const arm = new Group();
    arm.rotation.z = (i / blades) * Math.PI * 2;
    const b = new Mesh(new BoxGeometry(0.26, r, 0.07), bladeM);
    b.position.y = r / 2; b.rotation.y = 0.35;
    const tip = new Mesh(new BoxGeometry(0.27, 0.22, 0.075), tipM);
    tip.position.y = r - 0.11; tip.rotation.y = 0.35;
    arm.add(b, tip);
    g.add(arm);
  }
  const disc = new Mesh(new CylinderGeometry(r, r, 0.02, 32).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, depthWrite: false }));
  g.add(disc);
  g.position.set(0, y, z);
  return g;
}

/** A missile of a model hung under the wing on its pylon (the models are arms.js's). */
function store(x, y, z, model = 'm1') {
  const g = new Group();
  const m = buildMissile(model);
  g.add(m);
  const pylon = new Mesh(new BoxGeometry(0.07, 0.24, Math.min(1.2, m.userData.len * 0.4)), DARK());
  pylon.position.y = 0.17;
  g.add(pylon);
  g.position.set(x, y, z);
  g.userData.model = model;
  return g;
}

/**
 * The gun's muzzle, out where the rounds leave: a thin barrel for the light
 * gun, heavier ones up the range, a ring of six for the rotary cannon.
 */
const GUN_LOOK = {
  g1: { n: 1, r: 0.035, len: 0.5, color: 0x2b2d31 },
  g2: { n: 1, r: 0.05, len: 0.7, color: 0x2b2d31 },
  g3: { n: 1, r: 0.07, len: 0.85, color: 0x3a3d42, brake: true },
  g4: { n: 6, r: 0.03, len: 0.9, color: 0x45484e, ring: 0.09 },
  g5: { n: 1, r: 0.09, len: 1.2, color: 0x30333a, brake: true },
};
function barrel(at, model = 'g1') {
  const L = GUN_LOOK[model] || GUN_LOOK.g1, g = new Group();
  const m = new MeshStandardMaterial({ color: L.color, roughness: 0.35, metalness: 0.85 });
  for (let i = 0; i < L.n; i++) {
    const b = new Mesh(new CylinderGeometry(L.r, L.r, L.len, 8).rotateX(Math.PI / 2), m);
    if (L.n > 1) { const a = (i / L.n) * Math.PI * 2; b.position.set(Math.cos(a) * L.ring, Math.sin(a) * L.ring, 0); }
    g.add(b);
  }
  if (L.brake) {
    const k = new Mesh(new CylinderGeometry(L.r * 1.5, L.r * 1.5, 0.16, 8).rotateX(Math.PI / 2), m);
    k.position.z = -L.len / 2;
    g.add(k);
  }
  g.position.set(at.x, at.y, at.z + L.len / 2 - 0.1);
  return g;
}

// ---- the five -------------------------------------------------------------------

// one set of painted materials per plane and paint, shared by every copy
const MATS = new Map();
let PAINT = 'stock';
// what the plane being built carries: { missile, gun }
let LOAD = { missile: 'm1', gun: 'g1' };
function mats(id) {
  const key = `${id}:${PAINT}`;
  if (MATS.has(key)) return MATS.get(key);
  const p = PAINTS[PAINT];
  // a paint replaces the colours and the finish; markings stay the plane's
  const S = p && p.top ? { ...SCHEMES[id], top: p.top, blot: p.blot, under: p.under, metal: p.metal, rough: p.rough, splinter: !!p.splinter, stealth: false, nose: p.nose ?? SCHEMES[id].nose, band: p.band ?? SCHEMES[id].band } : SCHEMES[id];
  const base = { roughness: S.rough, metalness: S.metal };
  const m = {
    body: new MeshStandardMaterial({ map: paintBody(S), ...base }),
    wing: new MeshStandardMaterial({ map: paintWing(S), ...base }),
    fin: new MeshStandardMaterial({ map: paintFin(S), ...base }),
  };
  MATS.set(key, m);
  return m;
}

const BUILD = {
  // the last of the piston fighters: round nose, four blades, straight tapered wing
  sparrow() {
    const M = mats('sparrow'), g = new Group();
    g.add(new Mesh(loft([
      { z: -4.6, w: 1.1, h: 1.15 }, { z: -4.3, w: 1.25, h: 1.35 }, { z: -2.8, w: 1.25, h: 1.5 }, { z: -1.0, w: 1.15, h: 1.55, y: 0.05 },
      { z: 0.6, w: 1.0, h: 1.5, y: 0.0 }, { z: 1.5, w: 0.95, h: 1.7, y: -0.15 }, { z: 2.4, w: 0.7, h: 1.2, y: 0 },
      { z: 3.8, w: 0.4, h: 0.8, y: 0.1 }, { z: 4.8, w: 0.12, h: 0.35, y: 0.18 },
    ]), M.body));
    // the radiator scoop under the belly
    const scoop = new Mesh(loft([{ z: 0.4, w: 0.7, h: 0.1, y: -0.75 }, { z: 0.9, w: 0.75, h: 0.45, y: -0.95 }, { z: 1.9, w: 0.72, h: 0.5, y: -0.95 }, { z: 2.6, w: 0.5, h: 0.2, y: -0.85 }], 14), M.body);
    g.add(scoop);
    for (const w of wings({ x0: 0.45, span: 5.2, chord: (t) => 2.55 - 1.3 * t, le: (t) => -1.15 + 0.3 * t, y0: -0.45, dihedral: 0.09, thick: 0.15 })) g.add(new Mesh(w, M.wing));
    for (const w of wings({ x0: 0.2, span: 2.0, chord: (t) => 1.25 - 0.55 * t, le: (t) => 3.6 + 0.2 * t, y0: 0.15, thick: 0.09 })) g.add(new Mesh(w, M.wing));
    g.add(new Mesh(fin({ y0: 0.3, height: 1.7, chord: (t) => 1.6 - 0.85 * t, le: (t) => 3.3 + 0.8 * t }), M.fin));
    g.add(canopy(-0.3, 0.72, 1.2, 0.48, 0.62, true));
    const prop = propeller(-4.7, 0, 4, 1.8, 0xd9b52c);
    g.add(prop);
    const missiles = [store(2.6, -0.85, -0.6, LOAD.missile), store(-2.6, -0.85, -0.6, LOAD.missile)];
    missiles.forEach((m) => g.add(m));
    const guns = [-1.6, -1.9, -2.2, 1.6, 1.9, 2.2].map((x) => new Vector3(x, -0.4, -1.3));
    g.userData = { props: [prop], flames: [], guns, tips: [new Vector3(-5.6, 0, 0), new Vector3(5.6, 0, 0)], missiles, len: 9.6 };
    return g;
  },
  // the first swept-wing jets: nose intake, bubble canopy, bare metal
  hornet() {
    const M = mats('hornet'), g = new Group();
    g.add(new Mesh(loft([
      { z: -5.2, w: 1.15, h: 1.15 }, { z: -4.6, w: 1.4, h: 1.45 }, { z: -2.8, w: 1.5, h: 1.65, y: 0.05 }, { z: -0.6, w: 1.55, h: 1.7 },
      { z: 1.6, w: 1.35, h: 1.5 }, { z: 3.6, w: 1.0, h: 1.15 }, { z: 5.2, w: 0.8, h: 0.85 },
    ]), M.body));
    // the open mouth of the intake
    const mouth = new Mesh(new CylinderGeometry(0.5, 0.5, 0.3, 20).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1 }));
    mouth.position.z = -5.15;
    const lip = new Mesh(new TorusGeometry(0.55, 0.06, 8, 24), new MeshStandardMaterial({ color: 0xb0261c, roughness: 0.4 }));
    lip.position.z = -5.22;
    g.add(mouth, lip);
    for (const w of wings({ x0: 0.6, span: 4.9, chord: (t) => 3.0 - 1.6 * t, le: (t) => -1.2 + 2.6 * t, y0: -0.35, dihedral: 0.05, thick: 0.1 })) g.add(new Mesh(w, M.wing));
    for (const w of wings({ x0: 0.3, span: 2.0, chord: (t) => 1.4 - 0.7 * t, le: (t) => 3.6 + 1.0 * t, y0: 0.35, thick: 0.08 })) g.add(new Mesh(w, M.wing));
    g.add(new Mesh(fin({ y0: 0.4, height: 2.1, chord: (t) => 2.2 - 1.2 * t, le: (t) => 2.6 + 1.9 * t }), M.fin));
    g.add(canopy(-2.6, 0.68, 1.3, 0.5, 0.6, false));
    g.add(nozzle(0, 0, 5.3, 0.42, 0.6));
    const f = flame(0, 0, 5.5, 0.38);
    g.add(f);
    const missiles = [store(2.7, -0.7, 0.4, LOAD.missile), store(-2.7, -0.7, 0.4, LOAD.missile)];
    missiles.forEach((m) => g.add(m));
    const guns = [-0.55, -0.62, -0.69, 0.55, 0.62, 0.69].map((x, i) => new Vector3(x, 0.1 - (i % 3) * 0.15, -4.4));
    g.userData = { props: [], flames: [f], guns, tips: [new Vector3(-5.5, 0, 2.6), new Vector3(5.5, 0, 2.6)], missiles, len: 10.7 };
    return g;
  },
  // the heavy twin: boxy intakes, broad wing, two tails, two engines
  bulldog() {
    const M = mats('bulldog'), g = new Group();
    // the slim nose and cockpit
    g.add(new Mesh(loft([
      { z: -8.0, w: 0.08, h: 0.08 }, { z: -7.2, w: 0.75, h: 0.75 }, { z: -5.4, w: 1.3, h: 1.35, y: 0.05 }, { z: -3.4, w: 1.55, h: 1.6, y: 0.15, p: 2.4 },
      { z: -1.5, w: 1.6, h: 1.4, y: 0.2, p: 2.6 }, { z: 1.0, w: 1.4, h: 1.0, y: 0.25, p: 3 }, { z: 4.0, w: 1.0, h: 0.7, y: 0.25, p: 3 }, { z: 5.0, w: 0.6, h: 0.5, y: 0.25 },
    ]), M.body));
    // the two engine bodies, with the square intakes up front
    for (const s of [-1, 1]) {
      const e = new Mesh(loft([
        { z: -3.6, w: 1.25, h: 1.5, p: 6 }, { z: -2.0, w: 1.35, h: 1.45, p: 5 }, { z: 1.0, w: 1.3, h: 1.3, p: 3.5 }, { z: 4.4, w: 1.05, h: 1.05, p: 2.2 }, { z: 6.1, w: 0.95, h: 0.95 },
      ], 18), M.body);
      e.position.x = s * 1.2; e.position.y = -0.2;
      g.add(e);
      const mouth = new Mesh(new BoxGeometry(1.0, 1.25, 0.1), new MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1 }));
      mouth.position.set(s * 1.2, -0.2, -3.62);
      g.add(mouth);
      g.add(nozzle(s * 1.2, -0.2, 6.3, 0.48, 0.8));
    }
    for (const w of wings({ x0: 1.6, span: 4.8, chord: (t) => 5.4 - 3.6 * t, le: (t) => -1.4 + 3.4 * t, y0: 0.0, dihedral: -0.02, thick: 0.06 })) g.add(new Mesh(w, M.wing));
    for (const w of wings({ x0: 1.7, span: 2.2, chord: (t) => 2.3 - 1.1 * t, le: (t) => 4.2 + 1.0 * t, y0: -0.1, thick: 0.05 })) g.add(new Mesh(w, M.wing));
    for (const s of [-1, 1]) {
      const f = new Mesh(fin({ x0: s * 1.25, y0: 0.4, height: 3.0, chord: (t) => 2.4 - 1.2 * t, le: (t) => 2.8 + 1.7 * t, cant: s * 0.08 }), M.fin);
      g.add(f);
    }
    g.add(canopy(-4.6, 0.85, 1.6, 0.6, 0.66, false));
    const f1 = flame(-1.2, -0.2, 6.6, 0.42), f2 = flame(1.2, -0.2, 6.6, 0.42);
    g.add(f1, f2);
    const missiles = [store(3.6, -0.45, 0.6, LOAD.missile), store(-3.6, -0.45, 0.6, LOAD.missile)];
    missiles.forEach((m) => g.add(m));
    const guns = [new Vector3(1.9, 0.3, -2.0)];
    g.userData = { props: [], flames: [f1, f2], guns, tips: [new Vector3(-6.4, 0, 2.2), new Vector3(6.4, 0, 2.2)], missiles, len: 14.3 };
    return g;
  },
  // the delta: long needle nose, canards, one big triangle of wing
  viper() {
    const M = mats('viper'), g = new Group();
    g.add(new Mesh(loft([
      { z: -8.2, w: 0.05, h: 0.05 }, { z: -7.0, w: 0.5, h: 0.5 }, { z: -5.0, w: 1.0, h: 1.1 }, { z: -3.3, w: 1.25, h: 1.45, y: 0.1 },
      { z: -1.0, w: 1.55, h: 1.5, y: 0.05, p: 2.4 }, { z: 2.0, w: 1.45, h: 1.35, p: 2.2 }, { z: 4.6, w: 1.1, h: 1.1 }, { z: 5.6, w: 0.95, h: 0.95 },
    ]), M.body));
    // the half-cone intakes on the flanks
    for (const s of [-1, 1]) {
      const it = new Mesh(loft([{ z: -2.8, w: 0.1, h: 0.5 }, { z: -2.4, w: 0.55, h: 0.95 }, { z: 0.2, w: 0.6, h: 0.95 }, { z: 1.4, w: 0.25, h: 0.6 }], 14), M.body);
      it.position.set(s * 0.85, -0.05, 0);
      g.add(it);
    }
    for (const w of wings({ x0: 0.6, span: 3.9, chord: (t) => 7.4 - 6.3 * t, le: (t) => -2.4 + 6.0 * t, y0: -0.25, thick: 0.045, n: 5 })) g.add(new Mesh(w, M.wing));
    // canards
    for (const w of wings({ x0: 0.7, span: 1.25, chord: (t) => 1.6 - 1.1 * t, le: (t) => -2.9 + 1.0 * t, y0: 0.25, thick: 0.05 })) g.add(new Mesh(w, M.wing));
    g.add(new Mesh(fin({ y0: 0.45, height: 2.6, chord: (t) => 3.6 - 2.6 * t, le: (t) => 1.6 + 2.8 * t }), M.fin));
    g.add(canopy(-3.6, 0.72, 1.3, 0.5, 0.58, true));
    g.add(nozzle(0, 0, 5.8, 0.46, 0.7));
    const f = flame(0, 0, 6.1, 0.42, 0xff7a3a);
    g.add(f);
    const missiles = [store(3.6, -0.5, 1.8, LOAD.missile), store(-3.6, -0.5, 1.8, LOAD.missile), store(2.1, -0.55, 1.0, LOAD.missile), store(-2.1, -0.55, 1.0, LOAD.missile)];
    missiles.forEach((m) => g.add(m));
    const guns = [new Vector3(-0.8, -0.45, -1.8), new Vector3(0.8, -0.45, -1.8)];
    g.userData = { props: [], flames: [f], guns, tips: [new Vector3(-4.5, 0, 3.8), new Vector3(4.5, 0, 3.8)], missiles, len: 13.8 };
    return g;
  },
  // fifth generation: chined nose, faceted body, canted twin tails
  phantom() {
    const M = mats('phantom'), g = new Group();
    g.add(new Mesh(loft([
      { z: -7.6, w: 0.06, h: 0.04 }, { z: -6.4, w: 0.9, h: 0.55, p: 2.6 }, { z: -4.6, w: 1.7, h: 1.1, y: 0.05, p: 3 }, { z: -2.6, w: 2.4, h: 1.4, y: 0.1, p: 3.4 },
      { z: 0.0, w: 2.8, h: 1.45, y: 0.05, p: 4 }, { z: 3.0, w: 2.4, h: 1.25, p: 4 }, { z: 5.0, w: 1.4, h: 1.0, p: 2.6 }, { z: 6.0, w: 1.15, h: 0.95 },
    ], 24), M.body));
    // diamond intakes
    for (const s of [-1, 1]) {
      const it = new Mesh(loft([{ z: -3.0, w: 0.1, h: 0.8, p: 1.2 }, { z: -2.6, w: 0.75, h: 1.0, p: 1.4 }, { z: 0.5, w: 0.7, h: 0.95, p: 1.6 }, { z: 1.6, w: 0.2, h: 0.5 }], 14), M.body);
      it.position.set(s * 1.35, -0.05, 0);
      g.add(it);
    }
    for (const w of wings({ x0: 1.2, span: 4.2, chord: (t) => 5.6 - 3.6 * t, le: (t) => -1.3 + 3.0 * t, y0: -0.05, thick: 0.05 })) g.add(new Mesh(w, M.wing));
    for (const w of wings({ x0: 1.0, span: 2.2, chord: (t) => 2.4 - 1.3 * t, le: (t) => 4.2 + 1.1 * t, y0: 0.0, thick: 0.045 })) g.add(new Mesh(w, M.wing));
    for (const s of [-1, 1]) g.add(new Mesh(fin({ x0: s * 1.1, y0: 0.45, height: 2.4, chord: (t) => 2.6 - 1.3 * t, le: (t) => 2.6 + 1.6 * t, cant: s * 0.42 }), M.fin));
    // the gold-tinted canopy of a stealth fighter
    const cnp = canopy(-3.8, 0.72, 1.6, 0.55, 0.55, false);
    cnp.children[0].material = new MeshStandardMaterial({ color: 0x5a4a22, roughness: 0.05, metalness: 1, transparent: true, opacity: 0.92 });
    g.add(cnp);
    g.add(nozzle(0, 0, 6.2, 0.55, 0.9));
    const f = flame(0, 0, 6.6, 0.5, 0x7fd8ff);
    g.add(f);
    // stealth would carry inside; here the load is hung out to be seen
    const missiles = [store(3.4, -0.35, 1.6, LOAD.missile), store(-3.4, -0.35, 1.6, LOAD.missile), store(2.2, -0.4, 0.9, LOAD.missile), store(-2.2, -0.4, 0.9, LOAD.missile)];
    missiles.forEach((m) => g.add(m));
    const guns = [new Vector3(-1.0, 0.3, -2.4)];
    g.userData = { props: [], flames: [f], guns, tips: [new Vector3(-5.4, 0, 2.6), new Vector3(5.4, 0, 2.6)], missiles, len: 13.6 };
    return g;
  },
};

/**
 * The bomber: four engines on a long straight wing, a glazed nose, gun
 * turrets top and bottom, bare metal with a black tail band. About 30 m
 * long and 44 m across: big enough to read from a long way off.
 */
export function buildBomber() {
  const S = { top: '#b8bcc0', blot: [], under: '#aeb2b6', metal: 0.75, rough: 0.32, low: false, num: '42', band: '#1c1d20' };
  const M = { body: new MeshStandardMaterial({ map: paintBody(S), roughness: S.rough, metalness: S.metal }), wing: new MeshStandardMaterial({ map: paintWing(S), roughness: S.rough, metalness: S.metal }), fin: new MeshStandardMaterial({ map: paintFin(S), roughness: S.rough, metalness: S.metal }) };
  const g = new Group();
  g.add(new Mesh(loft([
    { z: -15, w: 0.4, h: 0.4 }, { z: -14.2, w: 2.6, h: 2.6 }, { z: -12.5, w: 3.2, h: 3.2 }, { z: 6, w: 3.2, h: 3.2 },
    { z: 11, w: 2.4, h: 2.6, y: 0.3 }, { z: 15, w: 0.9, h: 1.4, y: 0.6 },
  ], 24), M.body));
  const nose = new Mesh(new SphereGeometry(1.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), GLASS());
  nose.position.z = -14.3;
  g.add(nose);
  for (const w of wings({ x0: 1.4, span: 20.5, chord: (t) => 5.2 - 3.0 * t, le: (t) => -3.4 + 1.2 * t, y0: 0.4, dihedral: 0.06, thick: 0.15, n: 6 })) g.add(new Mesh(w, M.wing));
  for (const w of wings({ x0: 0.6, span: 6.5, chord: (t) => 3.4 - 1.6 * t, le: (t) => 11.6 + 0.6 * t, y0: 0.6, thick: 0.1 })) g.add(new Mesh(w, M.wing));
  g.add(new Mesh(fin({ y0: 1.4, height: 6.6, chord: (t) => 5 - 2.6 * t, le: (t) => 9.6 + 2.2 * t, thick: 0.1 }), M.fin));
  const props = [];
  for (const x of [-12.5, -6.5, 6.5, 12.5]) {
    const n = new Mesh(loft([{ z: -2.6, w: 1.5, h: 1.5 }, { z: -1.6, w: 1.7, h: 1.7 }, { z: 2.4, w: 1.4, h: 1.4 }, { z: 4.2, w: 0.5, h: 0.6 }], 14), M.body);
    n.position.set(x, 0.25, -2.0);
    g.add(n);
    const pr = propeller(-4.9, 0.25, 4, 2.4, 0x2a2b2e);
    pr.position.x = x;
    g.add(pr);
    props.push(pr);
  }
  // gun turrets: a dome on the spine, one under the belly, one in the tail
  for (const [y, z, flip] of [[1.6, -6, 1], [-1.6, 2, -1], [1.7, 4, 1]]) {
    const t = new Mesh(new SphereGeometry(0.75, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS());
    t.position.set(0, y, z); if (flip < 0) t.rotation.x = Math.PI;
    g.add(t);
    const gun = new Mesh(new CylinderGeometry(0.08, 0.08, 1.8, 6).rotateX(Math.PI / 2), DARK());
    gun.position.set(0, y + 0.3 * flip, z - 1);
    g.add(gun);
  }
  g.userData = { props, flames: [], guns: [], tips: [], missiles: [], len: 30 };
  return g;
}

/** A plane of a kind, ready to fly. */
export function buildPlane(kind, paint = 'stock', load = {}) {
  const id = PLANES[kind] ? kind : 'sparrow';
  PAINT = PAINTS[paint] ? paint : 'stock';
  LOAD = { missile: /^m[1-5]$/.test(load.missile || '') ? load.missile : 'm1', gun: GUN_LOOK[load.gun] ? load.gun : 'g1' };
  const g = BUILD[id]();
  // the gun carried, at every muzzle
  g.userData.barrels = g.userData.guns.map((v) => barrel(v, LOAD.gun));
  g.userData.barrels.forEach((b) => g.add(b));
  g.userData.load = { ...LOAD };
  return g;
}

/** Per frame: props turn, flames burn with the burner, missiles hang while they are there. */
export function animatePlane(g, dt, { boost = false, speed = 60, time = 0, ammo = null, ammoMax = 1 } = {}) {
  const u = g.userData;
  for (const p of u.props || []) p.rotation.z += dt * (40 + speed * 0.4);
  for (const f of u.flames || []) {
    const k = (boost ? 3.4 : 0.9) * (0.9 + Math.sin(time * 40 + f.position.x) * 0.1);
    f.scale.z += (k - f.scale.z) * Math.min(1, dt * 10);
    f.material.opacity = boost ? 0.95 : 0.45;
  }
  // the missiles under the wings go as they are fired (in pairs, kept even)
  if (ammo !== null && u.missiles?.length) {
    const n = Math.round(u.missiles.length * ammo / Math.max(1, ammoMax || 1) / 2) * 2;
    u.missiles.forEach((m, i) => (m.visible = i < n));
  }
}
