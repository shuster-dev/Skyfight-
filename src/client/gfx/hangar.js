// The hangar: an air base at dusk. The plane stands on its wheels on a
// turntable set into the apron, a painted parking ring round it; behind it
// an arched hangar with its doors open and the lights on inside, a control
// tower, floodlight masts, the runway's lights running off to the hills,
// and the sky going from deep blue to the last orange of the sun. Its own
// scene: the menus are drawn here, not over the world.
import {
  AdditiveBlending, BackSide, Box3, BoxGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, PointLight, RepeatWrapping, RingGeometry, Scene, SphereGeometry, SpotLight,
  SRGBColorSpace, Sprite, SpriteMaterial, TorusGeometry, Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPlane, animatePlane } from './planes.js';
import { buildGun, buildMissile } from './arms.js';

const CYAN = 0x2fd3bd;

const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/** Concrete slabs: grey, a little stained, dark joints between them. */
const apronTexture = () => {
  const t = canvas(512, 512, (g, w) => {
    g.fillStyle = '#6c6e70'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 9000; i++) {
      const v = 90 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v},${v + 2},0.18)`;
      g.fillRect(Math.random() * w, Math.random() * w, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // oil and tyre marks
    for (let i = 0; i < 14; i++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40);
      gr.addColorStop(0, 'rgba(30,30,32,0.28)'); gr.addColorStop(1, 'rgba(30,30,32,0)');
      g.save(); g.translate(Math.random() * w, Math.random() * w); g.scale(1, 0.5 + Math.random()); g.fillStyle = gr; g.fillRect(-40, -40, 80, 80); g.restore();
    }
    g.strokeStyle = 'rgba(28,28,30,0.75)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(w, 1); g.moveTo(1, 0); g.lineTo(1, w); g.stroke();
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(70, 70);
  t.anisotropy = 8;
  return t;
};

/** Dusk: deep blue overhead, the last of the sun along the hills. */
const skyTexture = () => canvas(4, 512, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#071330'); gr.addColorStop(0.32, '#1d3a6e'); gr.addColorStop(0.44, '#5b6f9c');
  gr.addColorStop(0.49, '#f0a26a'); gr.addColorStop(0.505, '#ffcf8a'); gr.addColorStop(0.52, '#3b3436'); gr.addColorStop(1, '#2a2628');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
});

/** A soft round glow, for lamps seen from afar. */
const glowTexture = () => canvas(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/** The ribs of a hangar's curved roof. */
const ribTexture = () => {
  const t = canvas(64, 4, (g) => { for (let i = 0; i < 64; i++) { const v = i % 8 < 4 ? 200 : 150; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i, 0, 1, 4); } });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(30, 1);
  return t;
};

/**
 * Wheels to stand on: a nose wheel and two mains, sized to the plane. Adds
 * them to it and returns how far below its middle the wheels reach.
 */
function addGear(plane) {
  plane.updateMatrixWorld(true);
  const box = new Box3().setFromObject(plane);
  const len = box.max.z - box.min.z, span = box.max.x - box.min.x;
  const foot = box.min.y - 0.45; // clear of whatever hangs under the wings
  const strut = new MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.85 });
  const tyre = new MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
  const legs = [[0, box.min.z + len * 0.2], [-Math.min(2.4, span * 0.13), box.min.z + len * 0.58], [Math.min(2.4, span * 0.13), box.min.z + len * 0.58]];
  for (const [x, z] of legs) {
    const h = -0.15 - foot;
    const leg = new Mesh(new CylinderGeometry(0.07, 0.09, h, 8), strut);
    leg.position.set(x, -0.15 - h / 2, z);
    const wheel = new Mesh(new CylinderGeometry(0.34, 0.34, 0.22, 16).rotateZ(Math.PI / 2), tyre);
    wheel.position.set(x, foot + 0.34, z);
    plane.add(leg, wheel);
  }
  plane.userData.gear = true;
  return -foot;
}

export class Hangar {
  constructor(renderer) {
    const scene = (this.scene = new Scene());
    scene.background = new Color(0x1d2a48);
    scene.fog = new Fog(0x6c5f6c, 70, 360);
    this.camera = new PerspectiveCamera(40, 1, 0.1, 900);
    // a studio's light for the reflections on the paint and the glass
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();

    // the sky, and the light of the evening: cool from above, the sun low and warm behind
    const sky = new Mesh(new SphereGeometry(600, 32, 24), new MeshBasicMaterial({ map: skyTexture(), side: BackSide, fog: false, depthWrite: false }));
    scene.add(sky);
    scene.add(new HemisphereLight(0x9fb4e8, 0x3a3330, 0.9));
    const sun = new DirectionalLight(0xffb27a, 1.4);
    sun.position.set(-60, 18, -90);
    scene.add(sun);
    const key = new SpotLight(0xfff4e6, 1400, 80, 0.5, 0.55, 1.5);
    key.position.set(10, 26, 16);
    key.target.position.set(0, 0, 0);
    scene.add(key, key.target);
    const fill = new PointLight(0x9fc8ff, 160, 40, 1.6); fill.position.set(-12, 6, 10);
    scene.add(fill);

    // the apron, and what is painted on it
    const apron = new Mesh(new PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: apronTexture(), roughness: 0.92, metalness: 0.05 }));
    scene.add(apron);
    const paint = (color) => new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const ring = new Mesh(new RingGeometry(11.2, 11.7, 64).rotateX(-Math.PI / 2), paint(0xf2c230));
    ring.position.y = 0.02;
    scene.add(ring);
    // the taxi line: off the spot, curving away toward the runway
    for (let i = 0; i < 40; i++) {
      const a = i * 0.035, x = 11.5 + i * 2.2, z = -Math.sin(a) * i * 2.2 * 0.6 + i * 0.4;
      const dash = new Mesh(new PlaneGeometry(2.0, 0.35).rotateX(-Math.PI / 2), paint(0xf2c230));
      dash.position.set(x, 0.02, z); dash.rotation.y = -a;
      scene.add(dash);
    }
    // the turntable the plane stands on: a plate with a line of light round it
    this.table = new Group();
    const plate = new Mesh(new CylinderGeometry(9.5, 9.8, 0.16, 64), new MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.55, metalness: 0.6 }));
    plate.position.y = 0.08;
    const led = new Mesh(new TorusGeometry(9.6, 0.06, 4, 96).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: CYAN }));
    led.position.y = 0.17;
    // a stripe across the plate, so it can be seen to turn
    const stripe = new Mesh(new BoxGeometry(18.6, 0.02, 0.5), new MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.6 }));
    stripe.position.y = 0.17;
    this.table.add(plate, led, stripe);
    scene.add(this.table);
    this.led = led;

    // behind it: an arched hangar, doors open, lit warm inside, facing the camera
    const base = new Group();
    base.rotation.y = 0.55;
    scene.add(base);
    const shell = new MeshStandardMaterial({ color: 0x8c949c, roughness: 0.5, metalness: 0.55, map: ribTexture() });
    const hangar = new Group();
    hangar.position.set(-16, 0, -78);
    const arch = new Mesh(new CylinderGeometry(1, 1, 1, 40, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), shell);
    arch.material.side = DoubleSide;
    arch.scale.set(26, 17, 36);
    const backWall = new Mesh(new CylinderGeometry(1, 1, 0.3, 40, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), shell);
    backWall.scale.set(26, 17, 1); backWall.position.z = -18;
    // inside: a warm glow on the back wall, rows of lamps under the roof
    // (lit from the lamps above: bright under the roof, dimmer down to the floor)
    const wallTex = canvas(16, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#f3c78e'); gr.addColorStop(0.45, '#b9824e'); gr.addColorStop(1, '#4a3324');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
    });
    const glowWall = new Mesh(new PlaneGeometry(46, 15), new MeshBasicMaterial({ map: wallTex }));
    glowWall.position.set(0, 7.5, -17.6);
    const floorIn = new Mesh(new PlaneGeometry(50, 36).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x9a9890, roughness: 0.6, emissive: 0x3a2a14, emissiveIntensity: 0.6 }));
    floorIn.position.set(0, 0.03, 0);
    hangar.add(arch, backWall, glowWall, floorIn);
    const lampM = new MeshBasicMaterial({ color: 0xfff1d6 });
    for (let r = 0; r < 3; r++) for (let c = -2; c <= 2; c++) {
      const l = new Mesh(new BoxGeometry(2.4, 0.2, 0.6), lampM);
      l.position.set(c * 8, 13.5 - Math.abs(c) * 1.8, -12 + r * 9);
      hangar.add(l);
    }
    // the door leaves, slid open to the sides, with hazard stripes along their foot
    const doorM = new MeshStandardMaterial({ color: 0x5c646c, roughness: 0.6, metalness: 0.5 });
    const hazard = canvas(64, 8, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#f2c230'; g.beginPath(); g.moveTo(i * 8, 8); g.lineTo(i * 8 + 4, 0); g.lineTo(i * 8 + 12, 0); g.lineTo(i * 8 + 8, 8); g.fill(); } });
    for (const sx of [-1, 1]) {
      const leaf = new Mesh(new BoxGeometry(6, 15, 0.6), doorM);
      leaf.position.set(sx * 26.5, 7.5, 18.4);
      const foot = new Mesh(new PlaneGeometry(6, 0.8), new MeshBasicMaterial({ map: hazard }));
      foot.position.set(sx * 26.5, 0.5, 18.75);
      hangar.add(leaf, foot);
    }
    const inLight = new PointLight(0xffc98a, 600, 60, 1.6); inLight.position.set(0, 10, 0);
    hangar.add(inLight);
    // the frames of the roof seen from inside, going back into the dark
    const ribM = new MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const rib = new Mesh(new TorusGeometry(25.2, 0.35, 4, 40, Math.PI), ribM);
      rib.scale.y = 16.4 / 25.2;
      rib.position.z = 12 - i * 9;
      hangar.add(rib);
    }
    // and a fighter inside, nose out, under the lamps
    const inside = buildPlane('shahak');
    inside.position.set(-4, addGear(inside) + 0.05, -3);
    inside.rotation.y = 0.25;
    for (const f of inside.userData.flames || []) f.visible = false;
    hangar.add(inside);
    base.add(hangar);
    // a second, smaller hangar beside it, doors shut
    const h2 = new Mesh(new CylinderGeometry(1, 1, 1, 32, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), shell);
    h2.scale.set(16, 11, 26); h2.position.set(-70, 0, -82);
    base.add(h2);
    // two more fighters parked out on the apron, on their wheels, so it is plainly an airfield
    for (const [kind, x, z, ry] of [['phantom', 30, -36, -2.2], ['skyhawk', -34, -40, 2.5]]) {
      const p = buildPlane(kind);
      const reach = addGear(p);
      for (const f of p.userData.flames || []) f.visible = false;
      p.position.set(x, reach + 0.05, z);
      p.rotation.y = ry;
      base.add(p);
    }
    // the control tower off to one side, its cab lit
    const tower = new Group();
    tower.position.set(40, 0, -96);
    const shaft = new Mesh(new CylinderGeometry(2.4, 3, 26, 12).translate(0, 13, 0), new MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }));
    const cab = new Mesh(new CylinderGeometry(5, 4.2, 4, 8).translate(0, 28, 0), new MeshStandardMaterial({ color: 0x1f3c46, roughness: 0.1, metalness: 0.6, emissive: 0x6fe6ff, emissiveIntensity: 0.35 }));
    const roof = new Mesh(new CylinderGeometry(5.6, 5.6, 0.8, 8).translate(0, 30.4, 0), new MeshStandardMaterial({ color: 0xbcb6aa }));
    const beacon = new Mesh(new SphereGeometry(0.5, 8, 6).translate(0, 32.4, 0), new MeshBasicMaterial({ color: 0xff3a2a }));
    tower.add(shaft, cab, roof, beacon);
    base.add(tower);
    this.beacon = beacon;
    // floodlight masts, their lamps glowing
    const glow = glowTexture();
    this.lamps = [];
    for (const [x, z] of [[-30, -18], [30, -24], [-62, -30]]) {
      const mast = new Mesh(new CylinderGeometry(0.25, 0.35, 22, 8).translate(0, 11, 0), new MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.4 }));
      mast.position.set(x, 0, z);
      const head = new Mesh(new BoxGeometry(3, 1, 1), new MeshBasicMaterial({ color: 0xfff6e0 }));
      head.position.set(x, 22, z);
      const halo = new Sprite(new SpriteMaterial({ map: glow, color: 0xffe2b0, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }));
      halo.scale.set(9, 9, 1); halo.position.set(x, 22, z + 0.6);
      base.add(mast, head, halo);
    }
    // the runway's edge lights, running off into the evening, and the hills beyond
    this.runway = [];
    for (let i = 0; i < 30; i++) for (const x of [-12, 12]) {
      const l = new Sprite(new SpriteMaterial({ map: glow, color: i % 5 ? 0xbfe4ff : 0x7fd0ff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
      l.scale.set(1.4, 1.4, 1);
      l.position.set(-140 + i * 11, 0.6, -120 + x);
      base.add(l);
      this.runway.push({ m: l, i });
    }
    const hills = new Mesh(new CylinderGeometry(520, 520, 40, 64, 1, true), new MeshBasicMaterial({ color: 0x2b2830, side: BackSide, fog: false }));
    hills.geometry.translate(0, 8, 0);
    const pos = hills.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 10) pos.setY(i, 14 + 26 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)));
    scene.add(hills);

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
    // on its wheels, scaled to the turntable whatever its size
    const len = this.plane.userData.len || 10, k = Math.min(1.25, 15 / len);
    const reach = addGear(this.plane);
    this.plane.scale.setScalar(k);
    this.plane.userData.rest = reach * k + 0.17;
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
    // the runway's lights run off into the evening, the tower's beacon blinks
    for (const r of this.runway) r.m.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.6 - r.i * 0.45)) ** 4;
    this.beacon.visible = Math.sin(t * 3) > 0;
    this.led.material.color.setHSL(0.47, 0.75, 0.45 + 0.12 * Math.sin(t * 1.5));
    if (this.plane) {
      // set down from above onto its wheels, and standing there
      this.swapT = Math.min(1, this.swapT + dt * 1.6);
      const e = 1 - (1 - this.swapT) ** 3;
      this.plane.position.y = (this.plane.userData.rest || 2) + (1 - e) * 6;
      this.plane.position.z = 0;
      this.plane.rotation.z = 0;
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
      l.m.position.y = (l.m.userData.rest || 2) + l.t * l.t * 10;
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
