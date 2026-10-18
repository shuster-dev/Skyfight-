// The weapons, modelled: five missiles and five guns, each with its own
// silhouette — so in the market, and hung on a wing, one is never taken for
// another. Bodies are lathed from a profile (a true ogive nose, a seeker's
// glass dome, a boat-tailed nozzle), fins are cut from a shape and given a
// little thickness, and the guns are built from their real parts: a cooling
// jacket full of holes, a receiver, a feed, a muzzle brake, a ring of six.
//
// Real size, metres, facing -z (the way a plane faces). Missiles are about
// 2–3.6 m long; guns about 1.5–2.6 m.
import {
  BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Shape, SphereGeometry, TorusGeometry, Vector2,
} from 'three';

// ---- materials ------------------------------------------------------------------

const paint = (color, rough = 0.42, metal = 0.25) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const GUNMETAL = () => new MeshStandardMaterial({ color: 0x4a505a, roughness: 0.34, metalness: 0.8 });
const STEEL = () => new MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.26, metalness: 0.95 });
const BRASS = () => new MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 1 });
const SOOT = () => new MeshStandardMaterial({ color: 0x15171a, roughness: 0.7, metalness: 0.4 });
const GLASS = () => new MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.1, transmission: 0.4, transparent: true, opacity: 0.85, emissive: 0x1a3550, emissiveIntensity: 0.6 });

/** A body of revolution along z (nose at -z) from a profile of [z, r] pairs. */
function lathe(profile, mat, segs = 28) {
  // Lathe turns round y, profile (r, y): build there and lay it along z
  // (ordered bottom to top, so the faces point outward)
  const pts = profile.map(([z, r]) => new Vector2(Math.max(0.0001, r), -z)).reverse();
  return new Mesh(new LatheGeometry(pts, segs).rotateX(-Math.PI / 2), mat);
}

/** A fin: a flat shape (span out along +y, chord along z), with a little thickness. */
function finShape(points, thick, mat) {
  const s = new Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 1 });
  // the shape's x runs back along +z from where the fin is set, its y is the
  // span; the extrusion becomes the thickness (x)
  g.translate(0, 0, -thick / 2).rotateY(-Math.PI / 2);
  return new Mesh(g, mat);
}

/** Four of a fin round the body, in an X (or a +). */
function cross(mesh, r, at, plus = false) {
  const g = new Group();
  for (let i = 0; i < 4; i++) {
    const a = new Group();
    a.rotation.z = (i / 4) * Math.PI * 2 + (plus ? 0 : Math.PI / 4);
    const f = i ? mesh.clone() : mesh;
    f.position.set(0, r * 0.9, at);
    a.add(f);
    g.add(a);
  }
  return g;
}

/** A painted ring round a body at z. */
const band = (r, z, w, color) => {
  const m = new Mesh(new CylinderGeometry(r * 1.015, r * 1.015, w, 28, 1, true).rotateX(Math.PI / 2), new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, emissive: color, emissiveIntensity: 0.15 }));
  m.position.z = z;
  return m;
};

// ---- the missiles ---------------------------------------------------------------

/**
 * Each by its own drawing: profile (z from the nose tip at 0 to the tail),
 * fins (rear, and canards up front if it has them), colours.
 */
const MISSILE = {
  // Shafrir 1: short and stubby, olive, a big blunt seeker, broad delta tails
  m1: () => {
    const L = 2.0, r = 0.08, body = paint(0x6f7650, 0.6, 0.15);
    const g = new Group();
    g.add(lathe([[0, 0], [0.04, 0.05], [0.14, 0.075], [0.26, r], [L - 0.08, r], [L, 0.06]], body));
    const dome = new Mesh(new SphereGeometry(0.052, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), GLASS());
    dome.position.z = -0.02; g.add(dome);
    g.add(band(r, 0.5, 0.06, 0xb8322a), band(r, 1.25, 0.05, 0xd8d0b0));
    g.add(cross(finShape([[0, 0], [0.42, 0], [0.42, 0.2], [0.2, 0.2]], 0.012, paint(0x4e5338, 0.6)), r, L - 0.45));
    return { g, L };
  },
  // Shafrir 2: longer, light grey, two yellow bands, trapezoid tails and small canards
  m2: () => {
    const L = 2.5, r = 0.075, body = paint(0xc3c6be, 0.45);
    const g = new Group();
    g.add(lathe([[0, 0], [0.08, 0.045], [0.24, 0.07], [0.36, r], [L - 0.1, r], [L, 0.055]], body));
    const dome = new Mesh(new SphereGeometry(0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), GLASS());
    dome.position.z = -0.005; g.add(dome);
    g.add(band(r, 0.55, 0.05, 0xd8b13a), band(r, 0.68, 0.05, 0xd8b13a), band(r, 1.6, 0.04, 0x8a7a3a));
    g.add(cross(finShape([[0, 0], [0.38, 0], [0.34, 0.17], [0.16, 0.17]], 0.01, paint(0x8e918a)), r, L - 0.42));
    g.add(cross(finShape([[0, 0], [0.16, 0], [0.12, 0.09], [0.06, 0.09]], 0.008, paint(0x8e918a)), r, 0.42));
    return { g, L };
  },
  // Python 3: white, the famous double-delta canards, a blue band, glass seeker
  m3: () => {
    const L = 2.9, r = 0.08, body = paint(0xeeeeea, 0.38);
    const g = new Group();
    g.add(lathe([[0, 0], [0.1, 0.05], [0.3, 0.075], [0.42, r], [L - 0.12, r], [L, 0.06]], body));
    const dome = new Mesh(new SphereGeometry(0.045, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), GLASS());
    dome.position.z = -0.01; g.add(dome);
    g.add(band(r, 0.75, 0.07, 0x2f6fd1), band(r, 2.2, 0.04, 0x2f6fd1));
    g.add(cross(finShape([[0, 0], [0.34, 0], [0.34, 0.12], [0.2, 0.24], [0.08, 0.24]], 0.009, paint(0xd9d9d4)), r, 0.32));
    g.add(cross(finShape([[0, 0], [0.32, 0], [0.32, 0.14], [0.2, 0.14]], 0.009, paint(0xd9d9d4)), r, L - 0.34));
    return { g, L };
  },
  // Python 5: long, a dark seeker section, big swept canards, small tails, orange bands
  m4: () => {
    const L = 3.1, r = 0.08, g = new Group();
    g.add(lathe([[0, 0], [0.1, 0.05], [0.32, 0.075], [0.46, r], [0.9, r]], paint(0x24272c, 0.35, 0.4)));
    g.add(lathe([[0.9, r], [L - 0.12, r], [L, 0.06]], paint(0xf2f2ee, 0.36)));
    const dome = new Mesh(new SphereGeometry(0.045, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), GLASS());
    dome.position.z = -0.01; g.add(dome);
    g.add(band(r, 1.0, 0.05, 0xff7a1a), band(r, 1.12, 0.05, 0xff7a1a));
    g.add(cross(finShape([[0, 0], [0.5, 0], [0.42, 0.11], [0.24, 0.26], [0.12, 0.26]], 0.009, paint(0x2e3238, 0.4)), r, 0.56));
    g.add(cross(finShape([[0, 0], [0.26, 0], [0.26, 0.1], [0.16, 0.1]], 0.009, paint(0xd9d9d4)), r, L - 0.28));
    return { g, L };
  },
  // Derby: radar-guided, long and slim, a long grey radome, mid-body strakes, cropped tails, a green band
  m5: () => {
    const L = 3.6, r = 0.075, g = new Group();
    g.add(lathe([[0, 0], [0.06, 0.02], [0.25, 0.048], [0.5, 0.068], [0.7, r]], paint(0x8f959d, 0.3, 0.2)));
    g.add(lathe([[0.7, r], [L - 0.15, r], [L, 0.055]], paint(0xf6f6f2, 0.34)));
    g.add(band(r, 0.72, 0.03, 0x22252a), band(r, 1.05, 0.06, 0x2fd37a), band(r, 2.9, 0.04, 0x22252a));
    g.add(cross(finShape([[0, 0], [1.3, 0], [1.2, 0.05], [0.1, 0.05]], 0.006, paint(0xdedfd9)), r, 1.2));
    g.add(cross(finShape([[0, 0], [0.3, 0], [0.3, 0.13], [0.2, 0.13]], 0.008, paint(0xdedfd9)), r, L - 0.32));
    return { g, L };
  },
};

/**
 * A missile of a model, nose to -z, centred on its middle. `lit`: the motor
 * burning (in flight), a flame and a glow out of the nozzle.
 */
export function buildMissile(model = 'm1') {
  const { g: body, L } = (MISSILE[model] || MISSILE.m1)();
  // the nozzle
  const noz = lathe([[0, 0.055], [0.06, 0.05], [0.07, 0.035]], SOOT(), 16);
  noz.position.z = L - 0.005;
  body.add(noz);
  body.position.z = -L / 2;
  const g = new Group();
  g.add(body);
  g.userData.len = L;
  g.userData.model = model;
  return g;
}

// ---- the guns -------------------------------------------------------------------

/** A barrel jacket with rows of cooling holes (dark slots on the steel). */
function jacket(r, len, holes, mat) {
  const g = new Group();
  g.add(new Mesh(new CylinderGeometry(r, r, len, 20, 1, true).rotateX(Math.PI / 2), mat));
  const slot = new BoxGeometry(r * 0.35, r * 0.12, len / (holes * 1.8));
  const dark = SOOT();
  for (let i = 0; i < holes; i++) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + (i % 2) * 0.5;
      const s = new Mesh(slot, dark);
      s.position.set(Math.cos(a) * r * 1.005, Math.sin(a) * r * 1.005, -len / 2 + (i + 0.5) * (len / holes));
      s.rotation.z = a;
      g.add(s);
    }
  }
  return g;
}

/** A tube along z from z0 to z1. */
const tube = (r, z0, z1, mat, segs = 16) => {
  const m = new Mesh(new CylinderGeometry(r, r, Math.abs(z1 - z0), segs).rotateX(Math.PI / 2), mat);
  m.position.z = (z0 + z1) / 2;
  return m;
};
/** A box centred at (x, y, z). */
const box = (w, h, d, x, y, z, mat) => { const m = new Mesh(new BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

/** A muzzle brake: a short fat tube with ports cut in its sides. */
function brake(r, len, mat) {
  const g = new Group();
  g.add(tube(r, -len / 2, len / 2, mat, 14));
  const port = SOOT();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(box(0.02, r * 1.2, len * 0.18, s * r * 0.98, 0, -len / 2 + (i + 0.6) * (len / 3.4), port));
  return g;
}

/** An ammunition box with a belt of brass rounds running into the gun. */
function feed(x, y, z, w, n, round = 0.012) {
  const g = new Group();
  g.add(box(w, w * 0.9, w * 1.4, x, y - w * 0.6, z, paint(0x4a5236, 0.7, 0.2)));
  const b = BRASS();
  for (let i = 0; i < n; i++) {
    const r = new Mesh(new CylinderGeometry(round, round, w * 0.5, 8), b);
    r.position.set(x - w / 2 + (i + 0.5) * (w / n), y + 0.005, z);
    g.add(r);
  }
  return g;
}

const GUN = {
  // 7.62 mm: a slim perforated jacket on a small receiver, a belt from the side
  g1: () => {
    const g = new Group(), m = GUNMETAL();
    const j = jacket(0.035, 0.75, 7, m); j.position.z = -0.55; g.add(j);
    g.add(tube(0.012, -1.05, -0.9, STEEL()));
    g.add(box(0.09, 0.1, 0.42, 0, 0, 0.0, m), box(0.05, 0.05, 0.14, 0, -0.07, 0.06, m));
    g.add(feed(-0.12, 0.0, 0.0, 0.09, 5, 0.008));
    return { g, L: 1.1 };
  },
  // 12.7 mm: the heavy Browning look — a fat jacket with big holes, a long square receiver
  g2: () => {
    const g = new Group(), m = GUNMETAL();
    const j = jacket(0.05, 0.85, 8, m); j.position.z = -0.62; g.add(j);
    g.add(tube(0.018, -1.25, -1.04, STEEL()), tube(0.03, -1.07, -1.02, m));
    g.add(box(0.14, 0.15, 0.62, 0, 0, 0.05, m), box(0.15, 0.04, 0.2, 0, 0.09, 0.1, STEEL()));
    g.add(feed(-0.17, 0.01, 0.0, 0.12, 6, 0.012));
    return { g, L: 1.35 };
  },
  // 20 mm cannon: a long plain barrel, a recoil spring sleeve, a ported brake, a round breech
  g3: () => {
    const g = new Group(), m = GUNMETAL();
    g.add(tube(0.03, -1.55, -0.3, STEEL()));
    g.add(tube(0.055, -0.6, -0.25, m));
    // the recoil spring's coils
    for (let i = 0; i < 6; i++) {
      const c = new Mesh(new TorusGeometry(0.058, 0.008, 6, 16), STEEL());
      c.position.z = -0.58 + i * 0.06;
      g.add(c);
    }
    const b = brake(0.05, 0.18, m); b.position.z = -1.6; g.add(b);
    g.add(tube(0.09, -0.25, 0.35, m, 18), box(0.12, 0.08, 0.3, 0, -0.09, 0.15, m));
    g.add(feed(-0.2, 0.0, 0.1, 0.14, 5, 0.018));
    return { g, L: 1.9 };
  },
  // 20 mm rotary: six barrels round a hub, held by clamp rings, a drive housing behind
  g4: () => {
    const g = new Group(), m = GUNMETAL(), st = STEEL();
    const R = 0.07;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = tube(0.017, -1.55, -0.1, st, 10);
      b.position.x = Math.cos(a) * R; b.position.y = Math.sin(a) * R;
      g.add(b);
    }
    for (const z of [-1.45, -0.9, -0.35]) {
      const c = new Mesh(new CylinderGeometry(R + 0.03, R + 0.03, 0.05, 20).rotateX(Math.PI / 2), m);
      c.position.z = z; g.add(c);
    }
    g.add(tube(0.03, -1.55, -0.1, m, 10));
    g.add(tube(R + 0.05, -0.12, 0.35, m, 20), tube(R + 0.02, 0.35, 0.5, st, 20));
    g.add(feed(-0.24, 0.02, 0.15, 0.16, 7, 0.016));
    g.userData.spin = true;
    return { g, L: 2.1 };
  },
  // 30 mm: a massive barrel, a big slotted brake, a heavy breech block
  g5: () => {
    const g = new Group(), m = GUNMETAL();
    g.add(tube(0.045, -2.2, -0.35, STEEL(), 18));
    g.add(tube(0.075, -0.75, -0.3, m, 18));
    const b = brake(0.08, 0.3, m); b.position.z = -2.3; g.add(b);
    g.add(box(0.2, 0.2, 0.55, 0, 0, 0.0, m), box(0.08, 0.06, 0.4, 0, 0.13, 0.0, STEEL()));
    g.add(feed(-0.26, 0.0, 0.05, 0.18, 5, 0.026));
    return { g, L: 2.5 };
  },
};

/** A gun of a model, muzzle to -z, centred on its middle. */
export function buildGun(model = 'g1') {
  const { g: body, L } = (GUN[model] || GUN.g1)();
  // centred along its length
  body.position.z = L / 2 - 0.35;
  const g = new Group();
  g.add(body);
  g.userData.len = L;
  g.userData.model = model;
  g.userData.spin = body.userData.spin;
  return g;
}
