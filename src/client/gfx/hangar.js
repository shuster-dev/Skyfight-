// The hangar: a launch bay of the future. A long hexagonal tunnel of dark
// steel framed in light, a glass floor with a grid glowing under it, and the
// plane hovering over a pad of turning rings while a scanner rises and falls
// round it. At the far end the bay opens on a night sky. Its own scene: the
// menus are drawn here, not over the world.
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Float32BufferAttribute, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, PointLight, Points, PointsMaterial, RepeatWrapping, RingGeometry, Scene, SpotLight,
  SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPlane, animatePlane } from './planes.js';
import { buildGun, buildMissile } from './arms.js';

const L = 90;           // the bay's depth
const R = 20;           // the tunnel's radius, corner to corner
const CYAN = 0x2fd3bd, ICE = 0x6fe6ff, VIOLET = 0x8a5cff;

const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/** Dark glass tiles, a fine grid of light between them. */
const floorTexture = () => {
  const t = canvas(512, 512, (g, w) => {
    g.fillStyle = '#06090e'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2500; i++) {
      const v = 10 + Math.random() * 10;
      g.fillStyle = `rgba(${v},${v + 4},${v + 9},0.6)`;
      g.fillRect(Math.random() * w, Math.random() * w, 2, 2);
    }
    g.strokeStyle = 'rgba(47,211,189,0.28)'; g.lineWidth = 2;
    for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, w); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
    g.strokeStyle = 'rgba(111,230,255,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, w); g.stroke();
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(10, 16);
  t.anisotropy = 8;
  return t;
};

/** The night outside: deep blue up top, a violet band and a thin line of dawn. */
const nightTexture = () => canvas(16, 256, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#02040b'); gr.addColorStop(0.45, '#0b1640'); gr.addColorStop(0.62, '#3a1f6b');
  gr.addColorStop(0.7, '#6fe6ff'); gr.addColorStop(0.71, '#0a0d16'); gr.addColorStop(1, '#05070c');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
});

/** A soft column of light: bright at the foot, gone at the top. */
const beamTexture = () => canvas(4, 128, (g) => {
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
});

/** A round soft dot, for motes of dust caught in the light. */
const dotTexture = () => canvas(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
});

/** Arcs of a ring, with gaps: the pad's turning dials. */
function dashedRing(r0, r1, n, fill, mat) {
  const g = new Group();
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) g.add(new Mesh(new RingGeometry(r0, r1, 24, 1, i * step, step * fill).rotateX(-Math.PI / 2), mat));
  return g;
}

export class Hangar {
  constructor(renderer) {
    const scene = (this.scene = new Scene());
    scene.background = new Color(0x04060a);
    scene.fog = new Fog(0x04060a, 45, 135);
    this.camera = new PerspectiveCamera(40, 1, 0.1, 400);
    // a studio's light for the reflections on the paint and the glass
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.5;
    pm.dispose();

    scene.add(new HemisphereLight(0x7f9cc8, 0x05060a, 0.3));
    const key = new SpotLight(0xf4f8ff, 950, 60, 0.42, 0.6, 1.6);
    key.position.set(-6, 22, 10);
    key.target.position.set(0, 0, 0);
    scene.add(key, key.target);
    const rimL = new PointLight(CYAN, 300, 40, 1.7); rimL.position.set(-12, 5, -10);
    const rimR = new PointLight(VIOLET, 300, 40, 1.7); rimR.position.set(12, 5, -10);
    const under = new PointLight(ICE, 120, 16, 1.8); under.position.set(0, 1, 0);
    scene.add(rimL, rimR, under);
    const back = new DirectionalLight(0x8a7cff, 0.6);
    back.position.set(0, 6, -60);
    scene.add(back);

    // the glass floor
    const floor = new Mesh(new PlaneGeometry(60, 160).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: floorTexture(), roughness: 0.42, metalness: 0.55 }));
    floor.position.z = -L / 2 + 15;
    scene.add(floor);

    // the tunnel: hexagonal frames (flat floor, flat roof), each with a line of light along its inside
    const steel = new MeshStandardMaterial({ color: 0x141a22, roughness: 0.45, metalness: 0.85 });
    const line = new MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.85, fog: true });
    this.frames = [];
    // all behind the pad: one between it and the camera would cut the view in two
    for (let i = 0; i < 8; i++) {
      const z = -16 - i * 10;
      const frame = new Mesh(new TorusGeometry(R, 0.4, 4, 6), steel);
      frame.position.set(0, R * 0.866 - 0.6, z);
      const glow = new Mesh(new TorusGeometry(R - 1, 0.07, 3, 6), line.clone());
      glow.position.copy(frame.position);
      scene.add(frame, glow);
      this.frames.push(glow);
    }
    // long light strips down the walls and along the floor's edges, from
    // behind the pad on (nearer, they would streak across the camera)
    const strip = new MeshBasicMaterial({ color: CYAN });
    for (const x of [-1, 1]) {
      const s = new Mesh(new BoxGeometry(0.12, 0.12, L - 6), strip);
      s.position.set(x * 11.5, 0.1, -L / 2 - 6);
      const w = new Mesh(new BoxGeometry(0.1, 0.1, L - 6), new MeshBasicMaterial({ color: VIOLET }));
      w.position.set(x * 18.6, R * 0.866 - 0.6, -L / 2 - 6);
      scene.add(s, w);
    }
    // the open end: night outside, and the runway's lights leading off into it
    const sky = new Mesh(new PlaneGeometry(60, 40), new MeshBasicMaterial({ map: nightTexture(), fog: false }));
    sky.position.set(0, 14, -L + 4);
    scene.add(sky);
    this.runway = [];
    for (let i = 0; i < 14; i++) {
      for (const x of [-4, 4]) {
        const l = new Mesh(new BoxGeometry(0.3, 0.1, 0.9), new MeshBasicMaterial({ color: ICE, transparent: true, fog: false }));
        l.position.set(x, 0.08, -14 - i * 5.5);
        scene.add(l);
        this.runway.push({ m: l, i });
      }
    }

    // the pad: a hexagon of steel, a glowing rim, dials turning both ways,
    // and a column of light the plane hangs in
    this.table = new Group();
    const pad = new Mesh(new CylinderGeometry(8.6, 9.2, 0.5, 6), new MeshStandardMaterial({ color: 0x10151c, roughness: 0.35, metalness: 0.8 }));
    pad.position.y = 0.25;
    const rim = new Mesh(new TorusGeometry(8.9, 0.09, 3, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6), new MeshBasicMaterial({ color: ICE }));
    rim.position.y = 0.52;
    this.table.add(pad, rim);
    scene.add(this.table);
    const add = (color, opacity) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.dialA = dashedRing(6.6, 7.0, 12, 0.7, add(CYAN, 0.9));
    this.dialB = dashedRing(5.2, 5.4, 36, 0.5, add(ICE, 0.75));
    this.dialC = dashedRing(10.2, 10.5, 3, 0.28, add(VIOLET, 0.8));
    for (const d of [this.dialA, this.dialB]) d.position.y = 0.54;
    this.dialC.position.y = 0.06;
    const halo = new Mesh(new RingGeometry(9.2, 14, 6, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 6), add(CYAN, 0.06));
    halo.position.y = 0.04;
    scene.add(this.dialA, this.dialB, this.dialC, halo);
    const beam = new Mesh(new CylinderGeometry(7.4, 7.4, 16, 6, 1, true), new MeshBasicMaterial({ map: beamTexture(), color: CYAN, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    beam.position.y = 8.5;
    scene.add(beam);
    // the scanner: a thin hexagon of light sweeping up and down the plane
    this.scan = new Mesh(new TorusGeometry(7.6, 0.06, 3, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6), add(ICE, 0.9));
    this.scanFill = new Mesh(new CylinderGeometry(7.6, 7.6, 0.6, 6, 1, true), add(ICE, 0.12));
    scene.add(this.scan, this.scanFill);

    // motes drifting in the light
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 30, Math.random() * 18, (Math.random() - 0.7) * 40], i * 3);
    const mg = new BufferGeometry();
    mg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.motes = new Points(mg, new PointsMaterial({ map: dotTexture(), color: ICE, size: 0.28, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }));
    scene.add(this.motes);

    this.holder = new Group();
    scene.add(this.holder);
    this.plane = null; this.kind = ''; this.t = 0; this.swapT = 1; this.fitT = 1; this.lk = ''; this.arm = null; this.armOut = null; this.armKey = '';
    this.leaving = [];
    this.drag = 0; this.spin = 0;
  }

  /**
   * Bring this plane onto the pad (the last one lifts away). With the same
   * plane and only its load changed, it stays where it is and the new
   * missiles and guns are fitted on it there and then: they grow onto the
   * pylons with a flash.
   */
  show(kind, paint = 'stock', load = {}) {
    if (this.arm || this.armOut) this.hideArm();
    const lk = `${load.missile || ''}/${load.gun || ''}/${load.neon ? 'n' : ''}`;
    if (kind === this.kind && paint === this.paint && lk === this.lk) return;
    const refit = this.plane && kind === this.kind && paint === this.paint && !!load.neon === !!this.plane.userData.neon;
    this.paint = paint; this.lk = lk;
    const old = this.plane;
    this.kind = kind;
    this.plane = buildPlane(kind, paint, load);
    // scaled to the pad, whatever its size
    const len = this.plane.userData.len || 10;
    this.plane.scale.setScalar(Math.min(1.25, 15 / len));
    if (refit) {
      this.plane.position.copy(old.position); this.plane.rotation.copy(old.rotation);
      this.holder.remove(old);
      this.fitT = 0;
    } else {
      if (old) this.leaving.push({ m: old, t: 0 });
      // flicking through fast: only the last one is still on its way out
      while (this.leaving.length > 1) this.holder.remove(this.leaving.shift().m);
      this.swapT = 0;
      this.fitT = 1;
    }
    this.holder.add(this.plane);
  }

  /**
   * The market's showcase: a weapon on its own, big over the pad, turning
   * slowly under the lights; the next one slides in as the last slides out.
   * (show() brings a plane back.)
   */
  showArm(kind, model) {
    if (this.armKey === `${kind}/${model}`) return;
    this.armKey = `${kind}/${model}`;
    // flicking fast: the one still on its way out goes now, not left behind
    if (this.armOut) this.scene.remove(this.armOut.m), this.armOut = null;
    if (this.arm) this.armOut = { m: this.arm, t: 0 };
    const w = kind === 'guns' ? buildGun(model) : buildMissile(model);
    const g = new Group();
    g.add(w);
    // as long as the pad is wide, whatever its real size
    // a gun is a slim thing: shown a little fatter than true, to read at a glance
    const k = (kind === 'guns' ? 11 : 13) / w.userData.len;
    g.scale.set(k * (kind === 'guns' ? 1.5 : 1), k * (kind === 'guns' ? 1.5 : 1), k);
    g.userData.spin = w.userData.spin;
    this.arm = g; this.armT = 0;
    this.scene.add(g);
    if (this.plane) this.plane.visible = false;
  }

  /** Back to planes: the showcase is put away. */
  hideArm() {
    for (const a of [this.arm, this.armOut?.m]) a && this.scene.remove(a);
    this.arm = null; this.armOut = null; this.armKey = '';
    if (this.plane) this.plane.visible = true;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    // a phone held upright needs a wider view to fit the wings
    this.camera.fov = aspect < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** A finger dragged across the screen turns the pad. */
  turn(dx) { this.spin += dx * 0.008; }

  tick(dt) {
    // a frame held back (the tab was away) must not throw things around
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    this.spin *= Math.max(0, 1 - dt * 2.5);
    this.table.rotation.y += dt * 0.18 + this.spin * dt * 10;
    this.holder.rotation.y = this.table.rotation.y;
    this.dialA.rotation.y += dt * 0.35;
    this.dialB.rotation.y -= dt * 0.6;
    this.dialC.rotation.y += dt * 0.12;
    const sy = 1.2 + (Math.sin(t * 0.9) * 0.5 + 0.5) * 9;
    this.scan.position.y = sy; this.scanFill.position.y = sy - 0.3;
    this.scan.rotation.y = this.scanFill.rotation.y = this.table.rotation.y;
    this.motes.rotation.y = t * 0.02;
    this.motes.position.y = Math.sin(t * 0.3) * 0.4;
    // the frames' light runs down the tunnel, the runway lights out into the night
    this.frames.forEach((f, i) => (f.material.opacity = 0.35 + 0.6 * Math.max(0, Math.sin(t * 2.2 - i * 0.7)) ** 3));
    for (const r of this.runway) r.m.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3 - r.i * 0.5)) ** 4;
    if (this.plane) {
      // down from above, settling to hover over the pad
      this.swapT = Math.min(1, this.swapT + dt * 1.6);
      const e = 1 - (1 - this.swapT) ** 3;
      this.plane.position.y = 3.6 + (1 - e) * 6 + Math.sin(t * 0.8) * 0.12;
      this.plane.position.z = 0;
      this.plane.rotation.z = Math.sin(t * 0.6) * 0.02;
      animatePlane(this.plane, dt, { speed: 20, time: t, ammo: 9, ammoMax: 9 });
      // a fresh fit: the stores and barrels grow on, glowing, and settle
      if (this.fitT < 1) {
        this.fitT = Math.min(1, this.fitT + dt * 2.2);
        const k = 1 - (1 - this.fitT) ** 3, glow = (1 - this.fitT) * 2.5;
        for (const m of [...this.plane.userData.missiles, ...this.plane.userData.barrels]) {
          m.scale.setScalar(0.2 + 0.8 * k);
          m.traverse((o) => {
            const mt = o.material;
            if (!mt?.emissive) return;
            if (o.userData.e0 === undefined) o.userData.e0 = mt.emissive.getHex(), o.userData.ei0 = mt.emissiveIntensity;
            // the teal flash, then each part's own glow back (a missile's band keeps its colour)
            if (this.fitT < 1) mt.emissive.setHex(0x2fd3bd), mt.emissiveIntensity = glow;
            else mt.emissive.setHex(o.userData.e0), mt.emissiveIntensity = o.userData.ei0;
          });
        }
      }
    }
    if (this.arm) {
      // in from the side, then hanging there, turning, the nose dipping a little
      this.armT = Math.min(1, this.armT + dt * 1.8);
      const e = 1 - (1 - this.armT) ** 3;
      this.arm.position.set((1 - e) * 14, 5.2 + Math.sin(t * 0.9) * 0.25, 3);
      this.arm.rotation.set(0.12 + Math.sin(t * 0.5) * 0.06, this.table.rotation.y * 1.6 + 0.6, Math.sin(t * 0.7) * 0.05, 'YXZ');
      // the rotary cannon's barrels turn
      if (this.arm.userData.spin) this.arm.children[0].children[0].rotation.z += dt * 2.5;
    }
    if (this.armOut) {
      const o = this.armOut;
      o.t += dt * 2.2;
      o.m.position.x = -o.t * o.t * 18;
      if (o.t > 1) { this.scene.remove(o.m); this.armOut = null; }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t += dt * 1.8;
      l.m.position.y = 3.6 + l.t * l.t * 10;
      l.m.position.z = -l.t * 14;
      if (l.t > 1) { this.holder.remove(l.m); this.leaving.splice(i, 1); }
    }
    // the camera: low, a little off the nose, drifting slowly
    const wide = this.camera.aspect >= 1;
    const a = 0.55 + Math.sin(t * 0.12) * 0.12, d = wide ? 27 : 34;
    this.camera.position.set(Math.sin(a) * d, (wide ? 6.5 : 9) + Math.sin(t * 0.17) * 0.4, Math.cos(a) * d);
    // landscape: the words are on the right (Hebrew), so the plane goes
    // left of the middle — look a little to the right of it
    const look = new Vector3(0, wide ? 3.4 : 1.2, 0);
    if (wide) {
      const fwd = look.clone().sub(this.camera.position).normalize();
      look.addScaledVector(fwd.cross(this.camera.up).normalize(), 6.5);
    }
    this.camera.lookAt(look);
  }

  /** Off screen (flying): nothing on its way out is left hanging for next time. */
  clear() {
    for (const l of this.leaving) this.holder.remove(l.m);
    this.leaving = [];
  }
}
