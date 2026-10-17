// The hangar: a dark, tall shed with the door open on a dusk sky, strip
// lights in the roof, a polished floor, and the plane on a turntable under a
// key light, blue rim lights behind. Its own scene: the menus are drawn here,
// not over the world.
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight,
  RepeatWrapping, RingGeometry, Scene, SpotLight, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPlane, animatePlane } from './planes.js';

const L = 70; // the hangar's depth

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#15181d'; g.fillRect(0, 0, 512, 512);
  // concrete slabs with seams, and a little grime
  for (let i = 0; i < 4000; i++) {
    const v = 18 + Math.random() * 14;
    g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3;
  for (let k = 0; k <= 512; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); }
  // a yellow safety line
  g.fillStyle = '#b8901c'; g.fillRect(0, 250, 512, 6);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 6);
  t.anisotropy = 8;
  return t;
}

function duskTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#1b2a4a'); gr.addColorStop(0.55, '#c0704a'); gr.addColorStop(0.7, '#f2b067'); gr.addColorStop(0.72, '#3b2a2a'); gr.addColorStop(1, '#141414');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Hangar {
  constructor(renderer) {
    const scene = (this.scene = new Scene());
    scene.background = new Color(0x07090d);
    scene.fog = new Fog(0x07090d, 40, 120);
    this.camera = new PerspectiveCamera(40, 1, 0.1, 400);
    // a studio's light for the reflections on the paint and the glass
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();

    scene.add(new HemisphereLight(0x8fa4c4, 0x0a0a0c, 0.35));
    const key = new SpotLight(0xfff1dc, 900, 60, 0.42, 0.55, 1.6);
    key.position.set(-6, 22, 10);
    key.target.position.set(0, 0, 0);
    scene.add(key, key.target);
    const rimL = new PointLight(0x2fd3bd, 260, 40, 1.7); rimL.position.set(-12, 5, -12);
    const rimR = new PointLight(0x3a7bff, 260, 40, 1.7); rimR.position.set(12, 5, -12);
    scene.add(rimL, rimR);
    const sun = new DirectionalLight(0xf2a060, 0.9);
    sun.position.set(0, 6, -60);
    scene.add(sun);

    // the floor, polished: it shines where the lights are
    const floor = new Mesh(new PlaneGeometry(80, 140).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: floorTexture(), roughness: 0.6, metalness: 0.08 }));
    floor.position.z = -L / 2 + 10;
    scene.add(floor);

    // the arched ribs of the shed, and the roof's strip lights
    const steel = new MeshStandardMaterial({ color: 0x1d2229, roughness: 0.6, metalness: 0.7 });
    const glow = new MeshBasicMaterial({ color: 0xdff1ff });
    for (let i = 0; i < 7; i++) {
      const z = 14 - i * 11;
      const rib = new Mesh(new TorusGeometry(26, 0.5, 6, 40, Math.PI), steel);
      rib.position.set(0, 0, z);
      scene.add(rib);
      for (const x of [-9, 0, 9]) {
        const strip = new Mesh(new BoxGeometry(0.35, 0.12, 6), glow);
        strip.position.set(x, 24.5 - Math.abs(x) * 0.12, z - 5.5);
        scene.add(strip);
      }
    }
    // the open door at the back: dusk outside, a runway light or two
    const sky = new Mesh(new PlaneGeometry(56, 30), new MeshBasicMaterial({ map: duskTexture(), fog: false }));
    sky.position.set(0, 12, -L + 2);
    scene.add(sky);
    for (let i = 0; i < 9; i++) {
      const l = new Mesh(new BoxGeometry(0.25, 0.25, 0.25), new MeshBasicMaterial({ color: i % 2 ? 0x3a7bff : 0xffd27a, fog: false }));
      l.position.set(-16 + i * 4, 0.4, -L + 4);
      scene.add(l);
    }

    // the turntable: a dark disc, a light ring round its edge
    this.table = new Group();
    const disc = new Mesh(new CylinderGeometry(9, 9.4, 0.4, 64), new MeshStandardMaterial({ color: 0x171b21, roughness: 0.55, metalness: 0.45 }));
    disc.position.y = 0.2;
    const ring = new Mesh(new RingGeometry(9.1, 9.35, 96).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x2fd3bd, transparent: true, opacity: 0.9, blending: AdditiveBlending }));
    ring.position.y = 0.42;
    const halo = new Mesh(new RingGeometry(9.35, 12, 96).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x2fd3bd, transparent: true, opacity: 0.08, blending: AdditiveBlending, depthWrite: false }));
    halo.position.y = 0.05;
    this.table.add(disc, ring, halo);
    scene.add(this.table);

    this.holder = new Group();
    scene.add(this.holder);
    this.plane = null; this.kind = ''; this.t = 0; this.swapT = 1; this.leaving = null;
    this.drag = 0; this.spin = 0;
  }

  /** Bring this plane onto the table (the last one rolls away). */
  show(kind) {
    if (kind === this.kind) return;
    if (this.plane) this.leaving = { m: this.plane, t: 0 };
    this.kind = kind;
    this.plane = buildPlane(kind);
    // scaled to the table, whatever its size
    const len = this.plane.userData.len || 10;
    this.plane.scale.setScalar(Math.min(1.25, 15 / len));
    this.holder.add(this.plane);
    this.swapT = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    // a phone held upright needs a wider view to fit the wings
    this.camera.fov = aspect < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** A finger dragged across the screen turns the table. */
  turn(dx) { this.spin += dx * 0.008; }

  tick(dt) {
    this.t += dt;
    const t = this.t;
    this.spin *= Math.max(0, 1 - dt * 2.5);
    this.table.rotation.y += dt * 0.18 + this.spin * dt * 10;
    this.holder.rotation.y = this.table.rotation.y;
    if (this.plane) {
      // in from above, settling onto its wheels' height
      this.swapT = Math.min(1, this.swapT + dt * 1.6);
      const e = 1 - (1 - this.swapT) ** 3;
      this.plane.position.y = 3.1 + (1 - e) * 6 + Math.sin(t * 0.8) * 0.08;
      this.plane.rotation.z = Math.sin(t * 0.6) * 0.02;
      animatePlane(this.plane, dt, { speed: 20, time: t, ammo: 9, ammoMax: 9 });
    }
    if (this.leaving) {
      const l = this.leaving;
      l.t += dt * 1.8;
      l.m.position.y = 3.1 + l.t * l.t * 10;
      l.m.position.z = -l.t * 14;
      if (l.t > 1) { this.holder.remove(l.m); this.leaving = null; }
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
}
