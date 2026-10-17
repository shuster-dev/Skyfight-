// The planes, built from shapes: no model files to download, sharp facets
// that read at a distance, and each plane a silhouette of its own — the prop
// plane, the dart, the brick, the delta, the stealth wing — so you know what
// is on your tail before you can read its name.
//
// Every model faces -z with y up and x to the right, about ten metres span.
// userData: prop (spins), flames (scale with the burner), guns (muzzles, for
// tracers), tips (wingtips, for the vapour trails in hard turns).
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Shape, SphereGeometry, Vector2, Vector3, AdditiveBlending,
} from 'three';
import { PLANES } from '../../shared/planes.js';

const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, metalness: 0.2, ...o }));
  return mats.get(k);
}
const GLASS = () => mat(0x1b2a3f, { roughness: 0.08, metalness: 0.6, emissive: 0x0a1626 });
const DARK = () => mat(0x23262f, { roughness: 0.7 });

/** A body of revolution along z: [[radius, z], ...] from tail (+z) to nose (-z). */
function body(profile, color, seg = 10) {
  // the lathe turns around y; y runs tail to nose and becomes -z
  const g = new LatheGeometry(profile.map(([r, z]) => new Vector2(Math.max(0.001, r), -z)), seg);
  g.rotateX(-Math.PI / 2);
  return new Mesh(g, mat(color));
}

/**
 * A flat surface from an outline seen from above: [[x, z], ...] (z negative
 * is forward), `t` thick. Mirrored for the left side when `mirror`.
 */
function plate(outline, t, color, mirror = true) {
  const make = (sx) => {
    const s = new Shape(outline.map(([x, z]) => new Vector2(x * sx, -z)));
    const g = new ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -t / 2, 0);
    if (sx < 0) g.scale(1, 1, 1); // winding is fixed by the extrusion either way
    return new Mesh(g, mat(color));
  };
  const grp = new Group();
  grp.add(make(1));
  if (mirror) grp.add(make(-1));
  return grp;
}

/** A fin standing up: outline [[z, y], ...] in the plane x = 0. */
function fin(outline, t, color) {
  const s = new Shape(outline.map(([z, y]) => new Vector2(-z, y)));
  const g = new ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-t / 2, 0, 0);
  return new Mesh(g, mat(color));
}

function canopy(z, y, len, w, h) {
  const g = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const m = new Mesh(g, GLASS());
  m.scale.set(w, h, len);
  m.position.set(0, y, z);
  return m;
}

/** A flame out of an exhaust: a cone that the burner lengthens. */
function flame(x, y, z, r, color = 0xffa040) {
  const g = new ConeGeometry(r, 1, 8, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  const m = new Mesh(g, new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z);
  m.scale.set(1, 1, 1.2);
  return m;
}

function propeller(z, color) {
  const g = new Group();
  const hub = new Mesh(new ConeGeometry(0.32, 0.8, 8).rotateX(-Math.PI / 2), mat(color));
  hub.position.z = -0.3;
  g.add(hub);
  // the blades, and a faint disc for when they turn too fast to see
  for (let i = 0; i < 3; i++) {
    const b = new Mesh(new BoxGeometry(0.22, 1.7, 0.06), DARK());
    b.position.y = 0.85;
    const arm = new Group();
    arm.rotation.z = (i / 3) * Math.PI * 2;
    arm.add(b);
    g.add(arm);
  }
  const disc = new Mesh(new CylinderGeometry(1.75, 1.75, 0.02, 24).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
  g.add(disc);
  g.position.z = z;
  return g;
}

const BUILD = {
  // the old prop plane: round, straight-winged, friendly
  sparrow(c, t) {
    const g = new Group();
    g.add(body([[0.15, 4.6], [0.55, 3.6], [0.8, 1.5], [0.95, -0.5], [0.9, -2.6], [0.75, -3.4], [0.45, -3.7]], c));
    const cowl = body([[0.92, -2.4], [0.95, -2.9], [0.8, -3.5], [0.4, -3.75]], t);
    g.add(cowl);
    g.add(plate([[0.6, -1.2], [5.2, -0.7], [5.3, 0.3], [0.6, 0.6]], 0.22, c));
    // the wingtips in the trim colour
    g.add(plate([[4.4, -0.85], [5.2, -0.7], [5.3, 0.3], [4.4, 0.4]], 0.24, t));
    g.add(plate([[0.2, 3.6], [2.1, 3.9], [2.1, 4.5], [0.2, 4.6]], 0.14, c));
    g.add(fin([[3.3, 0.5], [4.4, 2.1], [4.8, 2.1], [4.7, 0.4]], 0.14, t));
    g.add(canopy(-0.4, 0.7, 1.2, 0.55, 0.55));
    const prop = propeller(-3.8, t);
    g.add(prop);
    g.userData = { prop, flames: [], guns: [new Vector3(-1.8, -0.1, -1.6), new Vector3(1.8, -0.1, -1.6)], tips: [new Vector3(-5.2, 0, 0), new Vector3(5.2, 0, 0)] };
    return g;
  },
  // the light jet: slim, swept, quick
  hornet(c, t) {
    const g = new Group();
    g.add(body([[0.35, 4.3], [0.55, 3.6], [0.7, 1.2], [0.7, -1.5], [0.5, -3.2], [0.2, -4.4], [0.02, -4.9]], c));
    g.add(plate([[0.5, -0.6], [4.6, 1.6], [4.7, 2.2], [0.5, 1.9]], 0.18, c));
    g.add(plate([[4.0, 1.3], [4.6, 1.6], [4.7, 2.2], [4.0, 2.1]], 0.2, t));
    g.add(plate([[0.3, 3.0], [2.0, 4.1], [2.0, 4.5], [0.3, 4.2]], 0.12, c));
    g.add(fin([[2.4, 0.5], [4.0, 2.4], [4.5, 2.4], [4.3, 0.5]], 0.14, t));
    // intakes on the flanks
    for (const s of [-1, 1]) {
      const i = new Mesh(new BoxGeometry(0.35, 0.45, 1.6), DARK());
      i.position.set(0.72 * s, -0.05, -0.5);
      g.add(i);
    }
    g.add(canopy(-2.0, 0.42, 1.3, 0.42, 0.5));
    const f = flame(0, 0, 4.3, 0.34);
    g.add(f);
    g.userData = { prop: null, flames: [f], guns: [new Vector3(-0.6, -0.2, -2.8), new Vector3(0.6, -0.2, -2.8)], tips: [new Vector3(-4.7, 0, 2), new Vector3(4.7, 0, 2)] };
    return g;
  },
  // the twin-engine brick: wide, heavy, four guns in the nose
  bulldog(c, t) {
    const g = new Group();
    g.add(body([[0.3, 5.0], [0.7, 4.2], [1.15, 1.5], [1.2, -1.0], [1.05, -3.0], [0.6, -4.3], [0.2, -4.6]], c, 12));
    g.add(plate([[0.8, -1.4], [6.4, -1.0], [6.4, 0.4], [0.8, 0.8]], 0.3, c));
    g.add(plate([[5.6, -1.05], [6.4, -1.0], [6.4, 0.4], [5.6, 0.45]], 0.32, t));
    // the tailplane between twin fins
    g.add(plate([[0.2, 3.8], [2.6, 3.9], [2.6, 4.7], [0.2, 4.8]], 0.16, c));
    for (const s of [-1, 1]) {
      const f = fin([[3.6, -0.5], [4.2, 1.5], [4.8, 1.5], [4.9, -0.5]], 0.16, t);
      f.position.x = 2.6 * s;
      g.add(f);
      // the engines on the wings, with their own props
      const n = body([[0.3, 1.2], [0.55, 0.6], [0.6, -1.0], [0.45, -2.0]], c, 10);
      n.position.set(2.6 * s, -0.15, -0.6);
      g.add(n);
    }
    const p1 = propeller(-2.7, t), p2 = propeller(-2.7, t);
    p1.position.x = -2.6; p2.position.x = 2.6;
    p1.position.y = p2.position.y = -0.15;
    p1.scale.setScalar(0.85); p2.scale.setScalar(0.85);
    g.add(p1, p2);
    g.add(canopy(-1.8, 0.9, 1.4, 0.65, 0.6));
    const both = new Group(); both.add(p1, p2);
    g.add(both);
    g.userData = { prop: both, props: [p1, p2], flames: [], guns: [new Vector3(-0.5, -0.3, -4.2), new Vector3(0.5, -0.3, -4.2), new Vector3(-0.3, 0.2, -4.2), new Vector3(0.3, 0.2, -4.2)], tips: [new Vector3(-6.4, 0, 0), new Vector3(6.4, 0, 0)] };
    return g;
  },
  // the delta: one big triangle of wing and a tall fin
  viper(c, t) {
    const g = new Group();
    g.add(body([[0.35, 4.6], [0.6, 3.8], [0.7, 0.5], [0.55, -2.5], [0.25, -4.6], [0.02, -5.4]], c));
    g.add(plate([[0.5, -2.2], [4.4, 3.4], [4.4, 3.9], [0.5, 3.9]], 0.2, c));
    g.add(plate([[3.5, 2.3], [4.4, 3.4], [4.4, 3.9], [3.5, 3.9]], 0.22, t));
    // canards up front
    g.add(plate([[0.5, -3.0], [1.6, -2.4], [1.6, -2.1], [0.5, -2.3]], 0.1, t));
    g.add(fin([[1.4, 0.5], [3.7, 3.0], [4.3, 3.0], [4.3, 0.5]], 0.16, c));
    g.add(canopy(-2.6, 0.45, 1.3, 0.42, 0.5));
    const f = flame(0, 0, 4.6, 0.38, 0xff6a3a);
    g.add(f);
    g.userData = { prop: null, flames: [f], guns: [new Vector3(-0.7, -0.15, -2.4), new Vector3(0.7, -0.15, -2.4)], tips: [new Vector3(-4.4, 0, 3.6), new Vector3(4.4, 0, 3.6)] };
    return g;
  },
  // the stealth wing: flat chevron, canted fins, glowing seams
  phantom(c, t) {
    const g = new Group();
    const glow = mat(t, { emissive: t, emissiveIntensity: 0.9 });
    g.add(plate([[0, -5.0], [1.4, -2.6], [5.6, 2.2], [5.2, 3.0], [2.4, 2.0], [1.4, 3.4], [0, 2.6]], 0.55, c));
    // the seams on the leading edges
    const seam = (s) => {
      const m = new Mesh(new BoxGeometry(0.12, 0.6, 6.2), glow);
      m.position.set(3.2 * s, 0.02, -0.15);
      m.rotation.y = -0.73 * s;
      return m;
    };
    g.add(seam(1), seam(-1));
    g.add(body([[0.5, 2.6], [0.85, 1.4], [0.9, -1.0], [0.5, -3.4], [0.05, -4.9]], c));
    for (const s of [-1, 1]) {
      const f = fin([[0.8, 0.2], [2.0, 1.9], [2.6, 1.9], [2.6, 0.2]], 0.14, c);
      f.position.x = 1.5 * s;
      f.rotation.z = -0.45 * s;
      g.add(f);
    }
    g.add(canopy(-2.2, 0.5, 1.4, 0.5, 0.45));
    const f1 = flame(-0.55, 0, 2.6, 0.3, 0x39e6c8), f2 = flame(0.55, 0, 2.6, 0.3, 0x39e6c8);
    g.add(f1, f2);
    g.userData = { prop: null, flames: [f1, f2], guns: [new Vector3(-1.2, -0.1, -2.0), new Vector3(1.2, -0.1, -2.0), new Vector3(-0.5, -0.3, -3.0), new Vector3(0.5, -0.3, -3.0)], tips: [new Vector3(-5.6, 0, 2.2), new Vector3(5.6, 0, 2.2)] };
    return g;
  },
};

/** A plane of a kind, ready to fly. */
export function buildPlane(kind) {
  const p = PLANES[kind] || PLANES.sparrow;
  const g = (BUILD[p.id] || BUILD.sparrow)(p.color, p.trim);
  g.traverse((o) => { if (o.isMesh && !(o.material instanceof MeshBasicMaterial)) o.castShadow = true; });
  return g;
}

/** Per frame: props turn, flames burn with the burner. */
export function animatePlane(g, dt, { boost = false, speed = 60, time = 0 } = {}) {
  const u = g.userData;
  if (u.props) for (const p of u.props) p.rotation.z += dt * (30 + speed * 0.3);
  else if (u.prop) u.prop.rotation.z += dt * (30 + speed * 0.3);
  for (const f of u.flames || []) {
    const k = (boost ? 3.2 : 1.1) * (0.9 + Math.sin(time * 40 + f.position.x) * 0.1);
    f.scale.z += (k - f.scale.z) * Math.min(1, dt * 10);
    f.material.opacity = boost ? 0.95 : 0.6;
  }
}
