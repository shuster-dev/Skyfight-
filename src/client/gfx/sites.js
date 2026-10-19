// The airfield and the port, as you see them: arched hangars with their doors
// open on the apron, a control tower with a green-glass cab, fuel tanks, a
// terminal, old fighters parked in a row and lights down both sides of the
// runway; on the coast, gantry cranes reaching out over a freighter at the
// quay, rows of containers four high, long sheds. Where they stand, and how
// big, is shared/arena.js's (the server crashes you into the same boxes).
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, RepeatWrapping, SphereGeometry, SRGBColorSpace, ConeGeometry, PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIRFIELD, PORT, STRUCTURES, groundAt } from '../../shared/arena.js';
import { buildPlane } from './planes.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Ribs of corrugated sheet: light and dark stripes, to multiply a colour by. */
function ribs(n = 64, dark = 0.72) {
  const c = document.createElement('canvas');
  c.width = n; c.height = 4;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) { const v = Math.round(255 * (i % 4 < 2 ? 1 : dark)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i, 0, 1, 4); }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** A row of windows on a wall: dark glass in a pale frame, for sheds and the terminal. */
function windowBand() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d6d0'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#26323e';
  for (let x = 4; x < 128; x += 16) g.fillRect(x, 10, 11, 14);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}

/**
 * Nothing here moves: so every plain mesh is baked into one mesh per
 * material — a few dozen draws for the lot instead of hundreds (phones, and
 * software rendering, count draws).
 */
function bake(group) {
  group.updateMatrixWorld(true);
  const by = new Map(), keep = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh || Array.isArray(o.material) || !o.geometry.index) { keep.push(o); return; }
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv || !g.attributes.normal) { keep.push(o); return; }
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(g);
  });
  const out = new Group();
  for (const [m, gs] of by) {
    const merged = mergeGeometries(gs);
    if (merged) out.add(new Mesh(merged, m));
  }
  // what could not be merged stays as it was, where it was
  for (const o of keep) { o.updateWorldMatrix(true, false); o.matrixWorld.decompose(o.position, o.quaternion, o.scale); out.add(o); }
  return out;
}

export function makeSites() {
  const group = new Group(), o = new Object3D(), col = new Color(), r = rng(515);
  const S = (kind) => STRUCTURES.filter((s) => s.kind === kind);
  const std = (color, rough = 0.7, metal = 0.1, extra = {}) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

  // ---- the airfield -------------------------------------------------------------

  // arched hangars: half a cylinder of corrugated sheet, the open door facing the apron
  const sheet = ribs();
  sheet.repeat.set(24, 1);
  for (const h of S('hangar')) {
    const arch = new Mesh(new CylinderGeometry(1, 1, 1, 28, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), std(0x9aa3a2, 0.55, 0.45, { map: sheet }));
    arch.scale.set(h.w / 2, h.h, h.d);
    arch.position.set(h.x, h.base, h.z);
    const door = new Mesh(new PlaneGeometry(h.w * 0.72, h.h * 0.72), std(0x15181b, 1, 0));
    door.position.set(h.x, h.base + h.h * 0.36, h.z - h.d / 2 - 0.15);
    door.rotation.y = Math.PI;
    // the number painted over the door
    const band = new Mesh(new BoxGeometry(h.w * 0.74, 1.2, 0.3), std(0xe1b53a, 0.6));
    band.position.set(h.x, h.base + h.h * 0.74, h.z - h.d / 2 - 0.1);
    group.add(arch, door, band);
  }
  // the control tower: a shaft, a cab of green glass, a roof and a mast
  for (const t of S('tower')) {
    const shaft = new Mesh(new CylinderGeometry(t.w / 2 * 0.8, t.w / 2, t.h - 7, 12).translate(0, (t.h - 7) / 2, 0), std(0xd9d4c8, 0.8));
    const cab = new Mesh(new CylinderGeometry(t.w * 0.75, t.w * 0.62, 5, 8).translate(0, t.h - 4.5, 0), std(0x2a5a55, 0.08, 0.6, { emissive: 0x0b2a26, emissiveIntensity: 0.6 }));
    const roof = new Mesh(new CylinderGeometry(t.w * 0.85, t.w * 0.85, 1.2, 8).translate(0, t.h - 1.4, 0), std(0xbcb6aa, 0.7));
    const mast = new Mesh(new CylinderGeometry(0.2, 0.25, 9, 6).translate(0, t.h + 3.5, 0), std(0xc93a2b, 0.5, 0.4));
    const beacon = new Mesh(new SphereGeometry(0.6, 8, 6).translate(0, t.h + 8.2, 0), new MeshBasicMaterial({ color: 0xff4030 }));
    for (const m of [shaft, cab, roof, mast, beacon]) m.position.set(t.x, t.base, t.z), group.add(m);
  }
  // the terminal: low, pale, a band of windows round it
  const band = windowBand();
  for (const t of S('terminal')) {
    const tex = band.clone(); tex.needsUpdate = true; tex.repeat.set(t.w / 16, 1);
    const box = new Mesh(new BoxGeometry(t.w, t.h, t.d).translate(0, t.h / 2, 0), [std(0xd8d6d0, 0.85, 0, { map: tex }), std(0xd8d6d0, 0.85, 0, { map: tex }), std(0x9a9894, 0.9), std(0x9a9894, 0.9), std(0xd8d6d0, 0.85, 0, { map: tex }), std(0xd8d6d0, 0.85, 0, { map: tex })]);
    box.position.set(t.x, t.base, t.z);
    group.add(box);
  }
  // fuel tanks: white drums with a darker lid
  for (const t of S('tank')) {
    const drum = new Mesh(new CylinderGeometry(t.w / 2, t.w / 2, t.h, 24).translate(0, t.h / 2, 0), std(0xecebe6, 0.5, 0.2));
    const lid = new Mesh(new CylinderGeometry(t.w / 2 * 0.9, t.w / 2, 1.2, 24).translate(0, t.h + 0.6, 0), std(0x9b9d9f, 0.6, 0.3));
    drum.position.set(t.x, t.base, t.z); lid.position.copy(drum.position);
    group.add(drum, lid);
  }
  // lights down both edges of the runway, and a red-and-white windsock
  const R = AIRFIELD.runway, edge = [];
  for (let x = R.x0; x <= R.x1; x += 30) for (const s of [-1, 1]) edge.push([x, R.z + s * (R.w / 2 + 2)]);
  const lights = new InstancedMesh(new SphereGeometry(0.55, 6, 4), new MeshBasicMaterial({ color: 0xfff3c4 }), edge.length);
  const halos = new InstancedMesh(new SphereGeometry(1.6, 6, 4), new MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }), edge.length);
  edge.forEach(([x, z], i) => { o.position.set(x, groundAt(x, z) + 0.6, z); o.scale.setScalar(1); o.rotation.set(0, 0, 0); o.updateMatrix(); lights.setMatrixAt(i, o.matrix); halos.setMatrixAt(i, o.matrix); });
  group.add(lights, halos);
  {
    const x = R.x0 + 40, z = R.z + R.w / 2 + 16, y = groundAt(x, z);
    const pole = new Mesh(new CylinderGeometry(0.15, 0.2, 7, 6).translate(0, 3.5, 0), std(0xcfcfcf, 0.5, 0.5));
    pole.position.set(x, y, z);
    const sock = new Mesh(new ConeGeometry(0.8, 4, 10, 1, true).rotateZ(Math.PI / 2).translate(2.2, 6.6, 0), std(0xe8502a, 0.8, 0, { side: 2 }));
    sock.position.set(x, y, z); sock.rotation.y = 0.6;
    group.add(pole, sock);
  }
  // old fighters parked on the apron, noses to the taxiway
  const A = AIRFIELD.apron, parked = ['sparrow', 'mustang', 'ouragan', 'mystere', 'shahak', 'skyhawk'];
  parked.forEach((id, i) => {
    const m = buildPlane(id);
    const x = A.x0 + 25 + i * ((A.x1 - A.x0 - 50) / (parked.length - 1)), z = (A.z0 + A.z1) / 2 + 4;
    m.position.set(x, groundAt(x, z) + 1.7, z);
    m.rotation.y = 0;
    for (const f of m.userData.flames || []) f.visible = false;
    // little legs to stand on
    const leg = std(0x2a2c30, 0.6, 0.5);
    for (const [lx, lz] of [[-1.6, 0.4], [1.6, 0.4], [0, -2.8]]) {
      const l = new Mesh(new CylinderGeometry(0.08, 0.08, 1.4, 6).translate(0, -0.9, 0), leg);
      const w = new Mesh(new CylinderGeometry(0.32, 0.32, 0.2, 10).rotateZ(Math.PI / 2).translate(0, -1.55, 0), std(0x111214, 0.9));
      l.position.set(lx, 0, lz); w.position.set(lx, 0, lz);
      m.add(l, w);
    }
    group.add(m);
  });

  // ---- the port --------------------------------------------------------------

  // the quay wall where the land stops and the deep water begins
  {
    const len = PORT.z1 - PORT.z0;
    const wall = new Mesh(new BoxGeometry(3, 12, len), std(0x8f8b83, 0.95));
    wall.position.set(PORT.x0 - 1.5, -1.5, (PORT.z0 + PORT.z1) / 2);
    // black fenders along it, a yellow line on the edge
    const fend = new InstancedMesh(new BoxGeometry(0.8, 2.5, 1.6), std(0x151617, 0.9), Math.floor(len / 14));
    for (let i = 0; i < fend.count; i++) { o.position.set(PORT.x0 - 3.3, 2.6, PORT.z0 + 7 + i * 14); o.scale.setScalar(1); o.updateMatrix(); fend.setMatrixAt(i, o.matrix); }
    group.add(wall, fend);
  }
  // gantry cranes: four legs, a crossbeam, the boom out over the water, the
  // machinery house on top and the spreader hanging under the boom
  const craneM = std(0xd6532a, 0.55, 0.35), legs = S('craneLeg');
  const legMesh = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), craneM, legs.length);
  legs.forEach((l, i) => { o.position.set(l.x, l.base, l.z); o.scale.set(l.w, l.h, l.d); o.rotation.set(0, 0, 0); o.updateMatrix(); legMesh.setMatrixAt(i, o.matrix); });
  group.add(legMesh);
  for (const b of S('craneBoom')) {
    const boom = new Mesh(new BoxGeometry(b.w, b.h, b.d).translate(0, b.h / 2, 0), craneM);
    boom.position.set(b.x, b.base, b.z);
    const cross = new Mesh(new BoxGeometry(3, 3, 21), craneM);
    cross.position.set(PORT.x0 + 6, b.base - 8, b.z);
    const cross2 = cross.clone(); cross2.position.x = PORT.x0 + 30;
    const house = new Mesh(new BoxGeometry(14, 6, 9).translate(0, 3, 0), std(0xeeeeea, 0.6));
    house.position.set(PORT.x0 + 24, b.base + b.h, b.z);
    const spread = new Mesh(new BoxGeometry(12, 1.2, 2.6), std(0x30333a, 0.6, 0.5));
    const tipX = b.x - b.w / 2 + 14;
    spread.position.set(tipX, b.base - 18, b.z);
    const cable = new Mesh(new CylinderGeometry(0.08, 0.08, 18, 4).translate(0, -9, 0), std(0x222222, 0.5, 0.6));
    cable.position.set(tipX, b.base, b.z);
    group.add(boom, cross, cross2, house, spread, cable);
  }
  // containers: each stack a row of boxes side by side, one to four high
  const stacks = S('stack'), boxes = [];
  const palette = [0xc0472b, 0x2a6f9a, 0xd8a33a, 0x3f7f4f, 0x8d2f2f, 0x2d4f7a, 0xd8d6d0, 0x7a4c8a, 0x4c6b78];
  for (const s of stacks) {
    const rr = rng(s.seed), levels = Math.round(s.h / 2.6), n = Math.floor(s.d / 2.55);
    for (let i = 0; i < n; i++) {
      const tall = Math.max(1, levels - (rr() < 0.25 ? 1 : 0));
      for (let k = 0; k < tall; k++) boxes.push([s.x, s.base + k * 2.6, s.z - s.d / 2 + 1.3 + i * 2.55, palette[Math.floor(rr() * palette.length)]]);
    }
  }
  const cont = ribs(64, 0.8); cont.repeat.set(6, 1);
  const cmesh = new InstancedMesh(new BoxGeometry(12, 2.55, 2.4).translate(0, 1.28, 0), std(0xffffff, 0.7, 0.25, { map: cont }), boxes.length);
  boxes.forEach(([x, y, z, c], i) => { o.position.set(x, y, z); o.scale.setScalar(1); o.updateMatrix(); cmesh.setMatrixAt(i, o.matrix); cmesh.setColorAt(i, col.set(c)); });
  group.add(cmesh);
  // long sheds: pale walls, a shallow grey roof, roller doors
  for (const s of S('shed')) {
    const wallTex = sheet.clone(); wallTex.needsUpdate = true; wallTex.repeat.set(s.d / 4, 1);
    const body = new Mesh(new BoxGeometry(s.w, s.h, s.d).translate(0, s.h / 2, 0), std(0xc9c4b8, 0.7, 0.2, { map: wallTex }));
    body.position.set(s.x, s.base, s.z);
    const roof = new Mesh(new CylinderGeometry(1, 1, 1, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI), std(0x7c8287, 0.6, 0.4));
    roof.scale.set(s.w * 0.6, 3, s.d);
    roof.position.set(s.x, s.base + s.h + 1.4, s.z);
    group.add(body, roof);
    for (let z = s.z - s.d / 2 + 12; z < s.z + s.d / 2 - 6; z += 22) {
      const door = new Mesh(new PlaneGeometry(8, 7), std(0x5b6168, 0.6, 0.4));
      door.position.set(s.x - s.w / 2 - 0.1, s.base + 3.5, z);
      door.rotation.y = -Math.PI / 2;
      group.add(door);
    }
  }
  // the freighter at the quay: a dark hull, a red bottom at the waterline,
  // containers on deck, a white bridge house at the stern, a funnel
  for (const h of S('hull')) {
    const hull = new Mesh(new BoxGeometry(h.w, h.h, h.d).translate(0, h.h / 2, 0), std(0x22303d, 0.6, 0.2));
    hull.position.set(h.x, h.base, h.z);
    const bottom = new Mesh(new BoxGeometry(h.w + 0.1, 4.2, h.d + 0.1).translate(0, 2.1, 0), std(0x8a2b25, 0.7));
    bottom.position.set(h.x, h.base, h.z);
    const bow = new Mesh(new ConeGeometry(h.w / 2 / Math.SQRT1_2, 22, 4).rotateY(Math.PI / 4).rotateX(-Math.PI / 2), std(0x22303d, 0.6, 0.2));
    bow.scale.set(1, h.h / h.w, 1);
    bow.position.set(h.x, h.base + h.h / 2, h.z - h.d / 2 - 11);
    group.add(hull, bottom, bow);
    const deck = [], rr = rng(77);
    for (let z = h.z - h.d / 2 + 12; z < h.z + h.d / 2 - 30; z += 13) for (let x = -1; x <= 1; x++) for (let k = 0; k < 1 + Math.floor(rr() * 3); k++) deck.push([h.x + x * 6.6, h.base + h.h + k * 2.6, z, palette[Math.floor(rr() * palette.length)]]);
    const dm = new InstancedMesh(new BoxGeometry(2.4, 2.55, 12).translate(0, 1.28, 0), std(0xffffff, 0.7, 0.25), deck.length);
    deck.forEach(([x, y, z, c], i) => { o.position.set(x, y, z); o.scale.setScalar(1); o.updateMatrix(); dm.setMatrixAt(i, o.matrix); dm.setColorAt(i, col.set(c)); });
    group.add(dm);
  }
  for (const b of S('bridgehouse')) {
    const tex = band.clone(); tex.needsUpdate = true; tex.repeat.set(b.w / 12, 4);
    const m = new Mesh(new BoxGeometry(b.w, b.h, b.d).translate(0, b.h / 2, 0), std(0xf1f1ee, 0.5, 0, { map: tex }));
    m.position.set(b.x, b.base, b.z);
    const funnel = new Mesh(new CylinderGeometry(2.2, 2.6, 8, 12).translate(0, 4, 0), std(0xd6532a, 0.5));
    funnel.position.set(b.x, b.base + b.h, b.z + 3);
    group.add(m, funnel);
  }
  return bake(group);
}
