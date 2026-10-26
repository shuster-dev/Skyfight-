// What a fight looks like: tracers, smoke, fire, and the missiles with their
// white trails. Pools of instanced meshes, so a sky full of guns costs a
// handful of draw calls.
import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Group, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion,
  SphereGeometry, UniformsLib, UniformsUtils, Vector3,
} from 'three';
import { GUN, MISSILE } from '../../shared/combat.js';

const O = new Object3D(), V = new Vector3(), Q = new Quaternion(), Z = new Vector3(0, 0, 1), C = new Color();

export class Fx {
  constructor(scene) {
    this.scene = scene;
    // tracers: long thin bright streaks — thin, so a sky of guns is not a
    // sky of orange blocks
    // solid orange, not additive: an additive streak vanishes against a bright sky
    this.tr = new InstancedMesh(new BoxGeometry(0.17, 0.17, 7), new MeshBasicMaterial({ color: 0xffa21a, fog: false }), 600);
    this.tr.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tr.frustumCulled = false;
    this.tracers = [];
    // smoke: one pool, coloured per puff. Soft — thin at the rim, denser in
    // the middle, lit from above, thinning away as it ages — so a burst of
    // smoke is a cloud, not a handful of dark stones
    const smokeGeo = new IcosahedronGeometry(1, 2);
    this.smFade = new InstancedBufferAttribute(new Float32Array(1400), 1);
    this.smFade.setUsage(DynamicDrawUsage);
    smokeGeo.setAttribute('aFade', this.smFade);
    this.sm = new InstancedMesh(smokeGeo, new ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog]),
      vertexShader: `attribute float aFade; varying vec3 vC; varying float vF; varying float vA; varying float vUp;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vF = abs(dot(n, normalize(-mvPosition.xyz)));
          vUp = normalize(mat3(instanceMatrix) * normal).y;
          vC = instanceColor; vA = aFade;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vC; varying float vF; varying float vA; varying float vUp;
        #include <fog_pars_fragment>
        void main() {
          vec3 c = vC * (0.78 + 0.32 * vUp);
          gl_FragColor = vec4(c, smoothstep(0.0, 0.85, vF) * 0.8 * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }), 1400);
    this.sm.instanceMatrix.setUsage(DynamicDrawUsage);
    this.sm.frustumCulled = false;
    this.sm.setColorAt(0, C.set(0xffffff));
    this.puffs = [];
    // fireballs: glowing, additive
    // soft at the edges (the more side-on the surface, the more see-through),
    // hot in the middle: a ball of fire, not a lit polyhedron
    this.fb = new InstancedMesh(new IcosahedronGeometry(1, 2), new ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vC; varying float vF;
        void main() {
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vF = abs(dot(n, normalize(-mv.xyz)));
          vC = instanceColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vC; varying float vF;
        void main() {
          vec3 c = mix(vC, vec3(1.0, 0.93, 0.7), pow(vF, 3.0) * 0.85);
          gl_FragColor = vec4(c, pow(vF, 1.2) * 0.95);
        }`,
    }), 260);
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
  tracer(from, dir, speed, life = GUN.life) {
    if (this.tracers.length >= 600) this.tracers.shift();
    this.tracers.push({ p: from.clone(), v: dir.clone().multiplyScalar(speed), t: 0, life });
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
      this.puff(p, { color: i % 4 === 0 ? 0x7a6a5c : i % 3 ? 0x3a3a40 : 0x6b6b70, size: 3.5 * big, grow: 12, life: 2.4 + Math.random() * 1.6, drift: d });
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

  /** The flash on a plane that is hit: bigger the farther it is drawn, so it reads. */
  flash(p, k = 1) {
    if (this.balls.length < 240) this.balls.push({ p: p.clone(), s: 2.6 * k, t: 0, life: 0.09, flare: true });
  }

  /** Sparks where a round hits a plane. */
  spark(p) {
    this.balls.push({ p: p.clone(), s: 0.8, t: 0, life: 0.12 });
  }

  /**
   * Bring the missiles on screen in line with the room's list. Between the
   * room's word on them (`age` seconds old) each flies on at its own speed,
   * so it streaks rather than hops; a small error left is eased out.
   */
  syncMissiles(list, dt, age = 0) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.id);
      let e = this.missiles.get(m.id);
      const f = V.set(-Math.sin(m.yaw) * Math.cos(m.pitch), Math.sin(m.pitch), -Math.cos(m.yaw) * Math.cos(m.pitch));
      const sp = m.speed || MISSILE.speed;
      const want = new Vector3(m.x, m.y, m.z).addScaledVector(f, sp * age);
      if (!e) {
        e = { mesh: missileMesh(), trailT: 0 };
        e.mesh.position.copy(want);
        this.scene.add(e.mesh);
        this.missiles.set(m.id, e);
      }
      const p = e.mesh.position;
      p.addScaledVector(f, sp * dt);
      p.lerp(want, Math.min(1, dt * 8));
      if (p.distanceTo(want) > 60) p.copy(want);
      e.mesh.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
      // the motor: a flickering flame and a hot point you can see from far off
      const fl = e.mesh.userData.flame;
      fl.scale.set(1, 1, 0.8 + Math.random() * 0.6);
      e.mesh.userData.glow.scale.setScalar(2.2 + Math.random() * 0.8);
      // a thick white trail, from the tail
      e.trailT += dt;
      if (e.trailT > 0.02) {
        e.trailT = 0;
        const tail = new Vector3(0, 0, 2.2).applyEuler(e.mesh.rotation).add(p);
        this.puff(tail, { color: 0xf4f4f4, size: 1.3, grow: 4.5, life: 2.2, rise: 0.4 });
      }
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
      // grows as it spreads, and thins away (quickly in, slowly out)
      O.scale.setScalar(p.s + p.g * Math.sqrt(k));
      O.updateMatrix();
      this.sm.setMatrixAt(n, O.matrix);
      this.sm.setColorAt(n, p.c);
      this.smFade.setX(n, Math.min(1, k * 12) * (1 - k) ** 1.3);
      n++;
    }
    this.sm.count = n;
    this.sm.instanceMatrix.needsUpdate = true;
    this.smFade.needsUpdate = true;
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
      this.fb.setColorAt(n, b.flare ? C.setRGB(1, 0.97, 0.85) : C.setHSL(0.1 - k * 0.08, 1, 0.62 - k * 0.32));
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
  // a little over life size: a real one is a pencil at fighting distance
  const g = new Group();
  const white = new MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.4, metalness: 0.2 });
  const body = new Mesh(new CylinderGeometry(0.32, 0.32, 3.6, 10).rotateX(Math.PI / 2), white);
  const nose = new Mesh(new ConeGeometry(0.32, 0.9, 10).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.3 }));
  nose.position.z = -2.25;
  const band = new Mesh(new CylinderGeometry(0.335, 0.335, 0.25, 10).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: 0xd8b13a }));
  band.position.z = -1.2;
  // the motor's flame: a hot cone out of the tail, and a glow round it
  const flame = new Mesh(new ConeGeometry(0.3, 2.4, 8).rotateX(-Math.PI / 2).translate(0, 0, 3.0), new MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }));
  const glow = new Mesh(new SphereGeometry(0.5, 10, 8), new MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.z = 2.0;
  g.add(body, nose, band, flame, glow);
  g.userData.flame = flame; g.userData.glow = glow;
  for (let i = 0; i < 4; i++) {
    const a = new Group();
    a.rotation.z = i * Math.PI / 2 + Math.PI / 4;
    const tail = new Mesh(new BoxGeometry(0.05, 0.75, 0.7), white);
    tail.position.set(0, 0.5, 1.4);
    const canard = new Mesh(new BoxGeometry(0.05, 0.45, 0.35), white);
    canard.position.set(0, 0.4, -1.5);
    a.add(tail, canard);
    g.add(a);
  }
  return g;
}
