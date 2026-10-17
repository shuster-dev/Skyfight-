// What a fight looks like: tracers, smoke, fire, and the missiles with their
// white trails. Pools of instanced meshes, so a sky full of guns costs a
// handful of draw calls.
import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Group, IcosahedronGeometry,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { GUN } from '../../shared/combat.js';

const O = new Object3D(), V = new Vector3(), Q = new Quaternion(), Z = new Vector3(0, 0, 1), C = new Color();

export class Fx {
  constructor(scene) {
    this.scene = scene;
    // tracers: long thin bright boxes
    // solid orange, not additive: an additive streak vanishes against a bright sky
    this.tr = new InstancedMesh(new BoxGeometry(0.32, 0.32, 9), new MeshBasicMaterial({ color: 0xffa21a, fog: false }), 600);
    this.tr.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tr.frustumCulled = false;
    this.tracers = [];
    // smoke and fire: one pool, coloured per puff
    this.sm = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false }), 1400);
    this.sm.instanceMatrix.setUsage(DynamicDrawUsage);
    this.sm.frustumCulled = false;
    this.sm.setColorAt(0, C.set(0xffffff));
    this.puffs = [];
    // fireballs: glowing, additive
    this.fb = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }), 260);
    this.fb.instanceMatrix.setUsage(DynamicDrawUsage);
    this.fb.frustumCulled = false;
    this.fb.setColorAt(0, C.set(0xffffff));
    this.balls = [];
    // debris: dark shards that fall
    this.db = new InstancedMesh(new BoxGeometry(0.8, 0.25, 1.2), new MeshStandardMaterial({ color: 0x2c2c33, flatShading: true }), 240);
    this.db.instanceMatrix.setUsage(DynamicDrawUsage);
    this.db.frustumCulled = false;
    this.bits = [];
    scene.add(this.tr, this.sm, this.fb, this.db);
    this.missiles = new Map();
    this.hot = [];
  }

  /** A round from a muzzle, along a direction, at a speed (m/s). */
  tracer(from, dir, speed) {
    if (this.tracers.length >= 600) this.tracers.shift();
    this.tracers.push({ p: from.clone(), v: dir.clone().multiplyScalar(speed), t: 0, life: GUN.life });
  }

  puff(p, { color = 0xffffff, size = 2, grow = 4, life = 1.2, rise = 2, drift = null } = {}) {
    if (this.puffs.length >= 1400) this.puffs.shift();
    this.puffs.push({ p: p.clone(), v: drift ? drift.clone() : new Vector3((Math.random() - 0.5) * 2, rise, (Math.random() - 0.5) * 2), c: new Color(color), s: size, g: grow, t: 0, life });
  }

  /** A plane going up: a fireball, black smoke, falling pieces. */
  explode(p, big = 1) {
    for (let i = 0; i < 6; i++) {
      const o = new Vector3((Math.random() - 0.5), (Math.random() - 0.3), (Math.random() - 0.5)).multiplyScalar(6 * big);
      this.balls.push({ p: p.clone().add(o), s: (4 + Math.random() * 4) * big, t: -i * 0.04, life: 0.7 + Math.random() * 0.3 });
    }
    for (let i = 0; i < 16 * big; i++) {
      const d = new Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 10);
      this.puff(p, { color: i % 3 ? 0x2b2b30 : 0x6b6b70, size: 3 * big, grow: 9, life: 2 + Math.random() * 1.5, drift: d });
    }
    for (let i = 0; i < 12 * big; i++) {
      if (this.bits.length >= 240) this.bits.shift();
      this.bits.push({ p: p.clone(), v: new Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(60), r: new Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(8), a: new Vector3(), t: 0, life: 2.5 });
    }
  }

  /** A missile's burst, or rounds hitting home. */
  pop(p, size = 1) {
    this.balls.push({ p: p.clone(), s: 3 * size, t: 0, life: 0.45 });
    for (let i = 0; i < 4 * size; i++) this.puff(p, { color: 0x444448, size: 1.5 * size, grow: 5, life: 1.2 });
  }

  /**
   * Flares: a fan of white-hot decoys thrown out behind and to the sides,
   * falling and trailing smoke. `rot` is the plane's rotation.
   */
  flares(p, rot) {
    const yaw = rot.y;
    // two fans of six, thrown out to both sides and back: the "angel" shape
    for (let i = 0; i < 12; i++) {
      const side = (i % 2 ? 1 : -1) * (0.35 + (i >> 1) * 0.18);
      const v = new Vector3(Math.cos(yaw) * side * 26 + Math.sin(yaw) * 18, 6 - i * 0.9, -Math.sin(yaw) * side * 26 + Math.cos(yaw) * 18);
      this.hot.push({ p: p.clone(), v, t: 0, life: 2.6 + (i % 4) * 0.15, smokeT: 0 });
    }
  }

  /** Flame licking out of a hurt engine. */
  fire(p) {
    if (this.balls.length < 240) this.balls.push({ p: p.clone().add(V.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5)), s: 1.6 + Math.random(), t: 0, life: 0.35 });
  }

  /** The flash at a muzzle. */
  muzzle(p) {
    if (this.balls.length < 240) this.balls.push({ p: p.clone(), s: 0.7, t: 0, life: 0.045, flare: true });
  }

  /** Sparks where a round hits a plane. */
  spark(p) {
    this.balls.push({ p: p.clone(), s: 1.2, t: 0, life: 0.18 });
  }

  /** Bring the missiles on screen in line with the room's list. */
  syncMissiles(list, dt) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.id);
      let e = this.missiles.get(m.id);
      if (!e) {
        e = { mesh: missileMesh(), trailT: 0 };
        e.mesh.position.set(m.x, m.y, m.z);
        this.scene.add(e.mesh);
        this.missiles.set(m.id, e);
      }
      e.mesh.position.lerp(V.set(m.x, m.y, m.z), Math.min(1, dt * 12));
      e.mesh.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
      e.trailT += dt;
      if (e.trailT > 0.03) { e.trailT = 0; this.puff(e.mesh.position, { color: 0xf2f2f2, size: 1.1, grow: 3.5, life: 1.6, rise: 0.6 }); }
    }
    for (const [id, e] of this.missiles) if (!seen.has(id)) { this.scene.remove(e.mesh); this.missiles.delete(id); }
  }

  tick(dt, camera) {
    // the flares burn as small fireballs, drop, and smoke
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const h = this.hot[i];
      h.t += dt;
      if (h.t > h.life) { this.hot.splice(i, 1); continue; }
      h.v.y -= 9 * dt;
      h.v.multiplyScalar(1 - dt * 0.6);
      h.p.addScaledVector(h.v, dt);
      // a white-hot core, flickering
      this.balls.push({ p: h.p.clone(), s: 2.4 + Math.random() * 1.2, t: 0, life: 0.07, flare: true });
      h.smokeT += dt;
      if (h.smokeT > 0.035) { h.smokeT = 0; this.puff(h.p, { color: 0xf4f4f4, size: 1.2, grow: 4.5, life: 2.2, rise: 0.3 }); }
    }
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t > t.life) { this.tracers.splice(i, 1); continue; }
      t.p.addScaledVector(t.v, dt);
      O.position.copy(t.p);
      Q.setFromUnitVectors(Z, V.copy(t.v).normalize());
      O.quaternion.copy(Q);
      O.scale.set(1, 1, 1);
      O.updateMatrix();
      this.tr.setMatrixAt(n++, O.matrix);
    }
    this.tr.count = n;
    this.tr.instanceMatrix.needsUpdate = true;

    n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      if (p.t > p.life) { this.puffs.splice(i, 1); continue; }
      const k = p.t / p.life;
      p.p.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 0.8);
      O.position.copy(p.p);
      O.rotation.set(p.t, p.t * 0.7, 0);
      // grows, then shrinks away at the end (instances have no opacity)
      O.scale.setScalar((p.s + p.g * k) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1));
      O.updateMatrix();
      this.sm.setMatrixAt(n, O.matrix);
      this.sm.setColorAt(n, p.c);
      n++;
    }
    this.sm.count = n;
    this.sm.instanceMatrix.needsUpdate = true;
    if (this.sm.instanceColor) this.sm.instanceColor.needsUpdate = true;

    n = 0;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      if (b.t > b.life) { this.balls.splice(i, 1); continue; }
      if (b.t < 0) continue;
      const k = b.t / b.life;
      O.position.copy(b.p);
      O.rotation.set(0, 0, 0);
      O.scale.setScalar(b.s * (0.5 + k * 1.2) * (1 - k * k));
      O.updateMatrix();
      this.fb.setMatrixAt(n, O.matrix);
      this.fb.setColorAt(n, b.flare ? C.setRGB(1, 0.97, 0.85) : C.setHSL(0.09 - k * 0.07, 1, 0.62 - k * 0.3));
      n++;
    }
    this.fb.count = n;
    this.fb.instanceMatrix.needsUpdate = true;
    if (this.fb.instanceColor) this.fb.instanceColor.needsUpdate = true;

    n = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      if (b.t > b.life) { this.bits.splice(i, 1); continue; }
      b.v.y -= 30 * dt;
      b.p.addScaledVector(b.v, dt);
      b.a.addScaledVector(b.r, dt);
      O.position.copy(b.p);
      O.rotation.set(b.a.x, b.a.y, b.a.z);
      O.scale.setScalar(1.4);
      O.updateMatrix();
      this.db.setMatrixAt(n++, O.matrix);
    }
    this.db.count = n;
    this.db.instanceMatrix.needsUpdate = true;
  }
}

function missileMesh() {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.22, 0.22, 2.6, 8).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: 0xe8e8ee, flatShading: true }));
  const nose = new Mesh(new ConeGeometry(0.22, 0.6, 8).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0xd8432f, flatShading: true }));
  nose.position.z = -1.6;
  const glow = new Mesh(new SphereGeometry(0.45, 8, 6), new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }));
  glow.position.z = 1.4;
  g.add(body, nose, glow);
  for (let i = 0; i < 4; i++) {
    const f = new Mesh(new BoxGeometry(0.05, 0.6, 0.5), new MeshStandardMaterial({ color: 0x9aa0aa }));
    f.position.z = 1.0;
    const a = new Group();
    a.rotation.z = i * Math.PI / 2;
    f.position.y = 0.3;
    a.add(f);
    g.add(a);
  }
  return g;
}
