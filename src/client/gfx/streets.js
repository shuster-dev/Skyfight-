// The city's life: cars and buses driving the streets and turning at the
// corners, people walking the pavements, a light-rail tram up and down the
// longest avenue, and lamp posts along the kerbs. Nothing here is solid —
// the server knows only the buildings — so it is all drawn on the client,
// a handful of instanced meshes for the lot.
import {
  BoxGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshStandardMaterial,
  Object3D, SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID, cityAt, terrainAt } from '../../shared/arena.js';

const MOBILE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const STEP = GRID.block + GRID.street;
const LANE = 3.4, WALK = GRID.street / 2 + 2.2;

/**
 * The street grid as a graph: a node at every corner, an edge along every
 * stretch of street with city on it. A street runs on x = i·STEP (or z).
 */
function streetGraph() {
  const nodes = new Map(), edges = [];
  const key = (i, j) => `${i},${j}`;
  const node = (i, j) => {
    const k = key(i, j);
    if (!nodes.has(k)) nodes.set(k, { i, j, x: i * STEP, z: j * STEP, y: Math.max(0, terrainAt(i * STEP, j * STEP)), out: [] });
    return nodes.get(k);
  };
  const city = (x0, z0, x1, z1) => [0.2, 0.5, 0.8].every((t) => cityAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t));
  for (let i = -2; i <= 10; i++) for (let j = -12; j <= 13; j++) {
    if (j < 13 && city(i * STEP, j * STEP, i * STEP, (j + 1) * STEP)) edges.push([node(i, j), node(i, j + 1)]);
    if (i < 10 && city(i * STEP, j * STEP, (i + 1) * STEP, j * STEP)) edges.push([node(i, j), node(i + 1, j)]);
  }
  for (const [a, b] of edges) { a.out.push(b); b.out.push(a); }
  return { nodes: [...nodes.values()].filter((n) => n.out.length), edges };
}

/** Someone on the graph: from node a to node b, s metres along, on one side. */
function walker(r, g, speed, side) {
  const [a, b] = g.edges[Math.floor(r() * g.edges.length)];
  const flip = r() < 0.5;
  return { a: flip ? b : a, b: flip ? a : b, s: r() * STEP, v: speed, side, r };
}
/** On to the next corner: any way but back, unless it is a dead end. */
function turn(w) {
  const next = w.b.out.filter((n) => n !== w.a);
  const to = next.length ? next[Math.floor(w.r() * next.length)] : w.a;
  w.a = w.b; w.b = to; w.s = 0;
}
/** Where a walker is: on its edge, `off` metres to its right. */
function place(w, off, o) {
  const dx = (w.b.x - w.a.x) / STEP, dz = (w.b.z - w.a.z) / STEP, t = w.s / STEP;
  // forward (dx, dz): its right, with y up, is (-dz, dx)
  o.position.set(w.a.x + (w.b.x - w.a.x) * t - dz * off, w.a.y + (w.b.y - w.a.y) * t, w.a.z + (w.b.z - w.a.z) * t + dx * off);
  o.rotation.set(0, Math.atan2(dx, dz), 0);
}

export function makeStreets() {
  const group = new Group(), r = rng(31), o = new Object3D(), c = new Color();
  const g = streetGraph();
  if (!g.edges.length) return { group, tick() {}, setQuality() {} };

  // ---- cars and buses: a body and a glasshouse, scaled per vehicle ----------
  const NCAR = MOBILE ? 140 : 240, NBUS = MOBILE ? 12 : 20, NV = NCAR + NBUS;
  const body = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.55 }), NV);
  const cabin = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1, metalness: 0.8 }), NV);
  const lamps = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.6 }), NV * 2);
  for (const m of [body, cabin, lamps]) m.instanceMatrix.setUsage(DynamicDrawUsage), (m.frustumCulled = false);
  const paint = [0xe8e8ea, 0xf4f4f2, 0x1d1f24, 0x9aa1a8, 0xb0221c, 0x2a4f9a, 0x6b6f75, 0xd9d2c2, 0x2f5d3a, 0xf0c419];
  const cars = [];
  for (let i = 0; i < NV; i++) {
    const bus = i >= NCAR;
    const w = walker(r, g, bus ? 7 + r() * 2 : 9 + r() * 6, 1);
    w.bus = bus;
    w.len = bus ? 11.5 : 4.2 + r() * 0.6; w.wid = bus ? 2.5 : 1.8; w.hgt = bus ? 2.6 : 0.9;
    cars.push(w);
    body.setColorAt(i, c.set(bus ? (r() < 0.6 ? 0x2c8a4b : 0xf2f2ee) : paint[Math.floor(r() * paint.length)]));
    lamps.setColorAt(i * 2, c.set(0xfff4d8));
    lamps.setColorAt(i * 2 + 1, c.set(0xff2a1a));
  }
  group.add(body, cabin, lamps);

  // ---- people on the pavements ---------------------------------------------
  const NPED = MOBILE ? 260 : 520;
  const person = mergeGeometries([
    new CylinderGeometry(0.22, 0.2, 0.85, 6).translate(0, 0.43, 0),      // legs
    new CylinderGeometry(0.28, 0.24, 0.7, 6).translate(0, 1.2, 0),       // body
    new SphereGeometry(0.15, 6, 5).translate(0, 1.7, 0),                 // head
  ]);
  const peds = new InstancedMesh(person, new MeshStandardMaterial({ roughness: 0.9 }), NPED);
  peds.instanceMatrix.setUsage(DynamicDrawUsage);
  peds.frustumCulled = false;
  const clothes = [0x2b3a55, 0xc9473e, 0xe8e2d4, 0x3f6b4a, 0x1c1c1f, 0xd8a33a, 0x7a4a8c, 0x5d8fb8, 0xf0f0f0, 0x8a6a4d];
  const people = [];
  for (let i = 0; i < NPED; i++) {
    people.push(walker(r, g, 1.1 + r() * 0.6, r() < 0.5 ? 1 : -1));
    peds.setColorAt(i, c.set(clothes[Math.floor(r() * clothes.length)]));
  }
  // a few standing about on the corners and at the stops: they do not walk
  for (let i = 0; i < NPED; i += 7) people[i].v = 0;
  group.add(peds);

  // ---- a tram on the longest avenue -----------------------------------------
  // the longest straight run of edges along one street line
  let best = [];
  for (const n of g.nodes) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      if (g.nodes.some((m) => m.i === n.i - di && m.j === n.j - dj && m.out.includes(n))) continue;
      const run = [n];
      for (let cur = n; ;) {
        const nx = cur.out.find((m) => m.i === cur.i + di && m.j === cur.j + dj);
        if (!nx) break;
        run.push(nx); cur = nx;
      }
      if (run.length > best.length) best = run;
    }
  }
  const tram = { run: best, s: 0, v: 11, wait: 0, cars: [] };
  if (best.length > 2) {
    const tm = new MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.6 });
    const band = new MeshStandardMaterial({ color: 0xc2272d, roughness: 0.4 });
    const glass = new MeshStandardMaterial({ color: 0x18222c, roughness: 0.1, metalness: 0.8 });
    for (let k = 0; k < 3; k++) {
      const car = new Group();
      const b = new Mesh(new BoxGeometry(2.65, 2.9, 13).translate(0, 1.85, 0), tm);
      const w = new Mesh(new BoxGeometry(2.7, 1.0, 12).translate(0, 2.35, 0), glass);
      const s = new Mesh(new BoxGeometry(2.72, 0.3, 13.02).translate(0, 1.1, 0), band);
      const pan = new Mesh(new BoxGeometry(0.1, 1.2, 0.1).translate(0, 3.9, 0), band);
      car.add(b, w, s, pan);
      group.add(car);
      tram.cars.push(car);
    }
    // the rails, a pair of dark strips along the run
    const a = best[0], z = best[best.length - 1];
    const len = Math.hypot(z.x - a.x, z.z - a.z);
    const rails = new Mesh(new BoxGeometry(3.2, 0.06, len), new MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.6, metalness: 0.4 }));
    rails.position.set((a.x + z.x) / 2, Math.max(a.y, z.y) + 0.06, (a.z + z.z) / 2);
    rails.rotation.y = Math.atan2(z.x - a.x, z.z - a.z);
    group.add(rails);
  }

  // ---- lamp posts, every so often on both kerbs (they stand still) ----------
  const posts = [];
  for (const [a, b] of g.edges) {
    for (const t of [0.25, 0.75]) {
      const dx = (b.x - a.x) / STEP, dz = (b.z - a.z) / STEP;
      for (const sd of [-1, 1]) posts.push([a.x + (b.x - a.x) * t - dz * sd * (GRID.street / 2 + 0.7), a.y, a.z + (b.z - a.z) * t + dx * sd * (GRID.street / 2 + 0.7)]);
    }
  }
  const pole = new InstancedMesh(mergeGeometries([
    new CylinderGeometry(0.12, 0.16, 7, 5).translate(0, 3.5, 0),
    new BoxGeometry(0.5, 0.25, 1.2).translate(0, 7, 0),
  ]), new MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6, metalness: 0.5 }), posts.length);
  posts.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); pole.setMatrixAt(i, o.matrix); });
  group.add(pole);

  // the middle of it all, to know when the camera is too far to see a person
  const mid = g.nodes.reduce((m, n) => ((m.x += n.x / g.nodes.length), (m.z += n.z / g.nodes.length), m), { x: 0, z: 0 });
  let pedsOn = true, frame = 0;

  function moveCars(dt) {
    for (let i = 0; i < NV; i++) {
      const w = cars[i];
      w.s += w.v * dt;
      if (w.s > STEP) turn(w);
      place(w, LANE, o);
      const base = o.position.clone(), rot = o.rotation.y;
      o.scale.set(w.wid, w.hgt, w.len); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
      // the glasshouse: a car's on top and short, a bus's a band of windows
      if (w.bus) { o.position.y = base.y + 1.2; o.scale.set(w.wid + 0.04, 0.9, w.len - 1); }
      else { o.position.y = base.y + 0.9; o.position.x -= Math.sin(rot) * 0.3; o.position.z -= Math.cos(rot) * 0.3; o.scale.set(w.wid - 0.2, 0.55, w.len * 0.5); }
      o.updateMatrix(); cabin.setMatrixAt(i, o.matrix);
      // head and tail lights
      const fx = Math.sin(rot), fz = Math.cos(rot);
      for (const [k, d] of [[0, 1], [1, -1]]) {
        o.position.set(base.x + fx * d * (w.len / 2 + 0.02), base.y + 0.45, base.z + fz * d * (w.len / 2 + 0.02));
        o.scale.set(w.wid * 0.9, 0.18, 0.06); o.updateMatrix(); lamps.setMatrixAt(i * 2 + k, o.matrix);
      }
    }
    body.instanceMatrix.needsUpdate = cabin.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true;
  }

  function movePeople(dt, t) {
    for (let i = 0; i < NPED; i++) {
      const w = people[i];
      w.s += w.v * dt;
      if (w.s > STEP) turn(w);
      place(w, w.side * WALK, o);
      // a little bounce in the step
      if (w.v) o.position.y += Math.abs(Math.sin(t * 7 + i)) * 0.06;
      o.scale.set(1, 0.9 + (i % 5) * 0.05, 1);
      o.updateMatrix();
      peds.setMatrixAt(i, o.matrix);
    }
    peds.instanceMatrix.needsUpdate = true;
  }

  function moveTram(dt) {
    if (!tram.cars.length) return;
    const run = tram.run, len = (run.length - 1) * STEP;
    if (tram.wait > 0) tram.wait -= dt;
    else {
      tram.s += tram.v * dt;
      if (tram.s > len - 22 || tram.s < 22) { tram.v = -tram.v; tram.s = Math.max(22, Math.min(len - 22, tram.s)); tram.wait = 5; }
    }
    const a = run[0], z = run[run.length - 1], dx = (z.x - a.x) / len, dz = (z.z - a.z) / len;
    tram.cars.forEach((car, k) => {
      const s = tram.s + (k - 1) * 13.4;
      car.position.set(a.x + dx * s, Math.max(a.y, z.y) + 0.06, a.z + dz * s);
      car.rotation.y = Math.atan2(dx, dz);
    });
  }

  moveCars(0); movePeople(0, 0); moveTram(0);
  let time = 0;
  return {
    group,
    /** Per frame; the people only when the camera is near enough to see them. */
    tick(dt, cam) {
      time += dt;
      moveCars(dt);
      moveTram(dt);
      const near = !cam || Math.hypot(cam.x - mid.x, cam.z - mid.z) < 1300 && cam.y < 700;
      peds.visible = pedsOn && near;
      // a walker's step is small: half the frames are plenty
      if (peds.visible && (frame++ & 1) === 0) movePeople(dt * 2, time);
    },
    setQuality(level) {
      pedsOn = level === 'high' || (level === 'med' && !MOBILE);
      pole.visible = level !== 'low';
      lamps.visible = level !== 'low';
    },
  };
}
