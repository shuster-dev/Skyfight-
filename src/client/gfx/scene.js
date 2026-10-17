// The sky to fight in: a gradient sky with a low sun, a sea that is turquoise
// over the shallows and deep blue past them, faceted islands with beaches,
// grass, rock and snow on the peaks, trees, and banks of cloud to hide in.
// The islands come from shared/arena.js, so the ground you see is the ground
// the server kills you on.
import {
  AmbientLight, BackSide, BufferAttribute, BufferGeometry, Color, DataTexture, DirectionalLight, DodecahedronGeometry,
  Fog, Group, HemisphereLight, IcosahedronGeometry, ConeGeometry, InstancedMesh, LinearFilter, Mesh, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, SphereGeometry, WebGLRenderer, ClampToEdgeWrapping,
  MeshBasicMaterial,
} from 'three';
import { ARENA, ISLANDS, groundAt } from '../../shared/arena.js';

export const SKY = { top: 0x2f6fd6, horizon: 0xbfe3ff, sun: 0xfff1d0, fog: 0xbfe3ff };
export const SUN_DIR = { x: -0.45, y: 0.55, z: -0.7 };

// a little seeded noise, for the shapes of the land and the clouds
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

export function makeRenderer(canvas) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.6 : 2));
  return renderer;
}

export function makeWorld() {
  const scene = new Scene();
  scene.background = new Color(SKY.horizon);
  scene.fog = new Fog(SKY.fog, 500, 2600);
  const camera = new PerspectiveCamera(62, 1, 0.5, 6000);

  scene.add(new HemisphereLight(0xdff1ff, 0x4f7a5a, 1.15));
  scene.add(new AmbientLight(0xffffff, 0.15));
  const sun = new DirectionalLight(0xfff0d8, 2.2);
  sun.position.set(SUN_DIR.x * 1000, SUN_DIR.y * 1000, SUN_DIR.z * 1000);
  scene.add(sun);

  const sky = makeSky();
  scene.add(sky);
  const sea = makeSea();
  scene.add(sea);
  const land = makeLand();
  scene.add(land);
  const clouds = makeClouds();
  scene.add(clouds);

  return {
    scene, camera, sky, sea, clouds,
    /** Per frame: the sky follows the camera, the sea moves. */
    tick(t) {
      sky.position.copy(camera.position);
      sea.material.uniforms.time.value = t;
      sea.position.x = Math.round(camera.position.x / 50) * 50;
      sea.position.z = Math.round(camera.position.z / 50) * 50;
    },
  };
}

function makeSky() {
  const m = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new Color(SKY.top) }, horizon: { value: new Color(SKY.horizon) }, sunC: { value: new Color(SKY.sun) },
      sunDir: { value: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z] },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunC; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 c = mix(horizon, top, pow(max(h, 0.0), 0.55));
        // below the horizon: the haze over the sea
        c = mix(c, horizon, smoothstep(0.0, -0.2, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sunC * (pow(s, 900.0) * 2.5 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const s = new Mesh(new SphereGeometry(4000, 32, 16), m);
  s.renderOrder = -1;
  return s;
}

/**
 * The sea, with the shallows baked into a texture: how close each point is
 * to land, so the water near an island goes turquoise and breaks white.
 */
function makeSea() {
  const N = 256, span = (ARENA.radius + 600) * 2, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / (N - 1) - 0.5) * span, z = (j / (N - 1) - 0.5) * span;
    let near = 0;
    for (const o of ISLANDS) {
      const d = Math.hypot(x - o.x, z - o.z) - o.r;
      near = Math.max(near, 1 - Math.min(1, Math.max(0, d) / 90));
    }
    data[(j * N + i) * 4] = Math.round(near * 255);
    data[(j * N + i) * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, N, N, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const m = new ShaderMaterial({
    fog: true,
    uniforms: {
      time: { value: 0 }, near: { value: tex }, span: { value: span },
      deep: { value: new Color(0x1663a8) }, shallow: { value: new Color(0x3fd6d0) }, foam: { value: new Color(0xf4fbff) },
      fogColor: { value: new Color(SKY.fog) }, fogNear: { value: 500 }, fogFar: { value: 2600 },
      sunDir: { value: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z] },
    },
    vertexShader: `varying vec3 vW; varying float vFog;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time; uniform sampler2D near; uniform float span; uniform vec3 deep; uniform vec3 shallow; uniform vec3 foam;
      uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform vec3 sunDir; varying vec3 vW; varying float vFog;
      void main(){
        vec2 uv = vW.xz / span + 0.5;
        float n = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture2D(near, uv).r;
        // small moving waves for the glitter
        float w = sin(vW.x * 0.08 + time * 1.3) * 0.5 + sin(vW.z * 0.11 - time * 1.1) * 0.5 + sin((vW.x + vW.z) * 0.05 + time * 0.7) * 0.6;
        vec3 nrm = normalize(vec3(cos(vW.x * 0.08 + time * 1.3) * 0.06, 1.0, cos(vW.z * 0.11 - time * 1.1) * 0.06));
        vec3 c = mix(deep, shallow, smoothstep(0.15, 0.95, n));
        // surf: rings that walk in toward the beach
        float ring = smoothstep(0.86, 0.97, n) * (0.55 + 0.45 * sin(n * 40.0 - time * 2.4));
        c = mix(c, foam, clamp(ring, 0.0, 1.0) * 0.8);
        vec3 v = normalize(cameraPosition - vW);
        vec3 h = normalize(normalize(sunDir) + v);
        c += vec3(1.0, 0.96, 0.85) * pow(max(dot(nrm, h), 0.0), 120.0) * 0.9;
        c += w * 0.012;
        float f = smoothstep(fogNear, fogFar, vFog);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
      }`,
  });
  const g = new PlaneGeometry(7000, 7000, 1, 1);
  g.rotateX(-Math.PI / 2);
  return new Mesh(g, m);
}

/** The islands: a ring grid per island, faceted, coloured by height and slope. */
function makeLand() {
  const group = new Group();
  const sand = new Color(0xe9d7a3), grass = new Color(0x5fae4e), grass2 = new Color(0x3f8d45), rock = new Color(0x8b8478), rock2 = new Color(0x6f6a62), snow = new Color(0xf6f8fb);
  const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const trees = [];
  for (const o of ISLANDS) {
    const R = 14, S = 44, pos = [], col = [];
    const pt = (ri, si) => {
      const k = ri / R, a = (si / S) * Math.PI * 2;
      // the rim goes a little past the shore and under the water
      const r = o.r * 1.04 * k;
      const jx = ri && ri < R ? (hash(o.x + ri, o.z + si) - 0.5) * o.r * 0.03 : 0;
      const x = o.x + Math.cos(a) * r + jx, z = o.z + Math.sin(a) * r + jx;
      let y = groundAt(x, z);
      y += ri && ri < R ? (hash(x, z) - 0.5) * Math.min(6, y * 0.15) : 0;
      return [x, ri === R ? -2 : y, z];
    };
    const tint = (y, steep, x, z) => {
      const j = hash(z, x);
      if (y < 3.5) return sand;
      if (y > 130 + j * 20) return snow;
      if (steep > 0.9 || y > 75 + j * 15) return j > 0.5 ? rock : rock2;
      return j > 0.5 ? grass : grass2;
    };
    for (let ri = 0; ri < R; ri++) for (let si = 0; si < S; si++) {
      const a = pt(ri, si), b = pt(ri + 1, si), c = pt(ri + 1, si + 1), d = pt(ri, si + 1);
      // counter-clockwise seen from above, so the faces point up at the sky
      for (const tri of ri === 0 ? [[a, c, b]] : [[a, c, b], [a, d, c]]) {
        const ys = tri.map((p) => p[1]), my = (ys[0] + ys[1] + ys[2]) / 3;
        const steep = (Math.max(...ys) - Math.min(...ys)) / (o.r / R * 1.2);
        const cc = tint(my, steep, tri[0][0], tri[0][2]);
        for (const p of tri) pos.push(...p), col.push(cc.r, cc.g, cc.b);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    g.computeVertexNormals();
    group.add(new Mesh(g, mat));
    // trees on the green, below the rock
    const r = rng(Math.round(o.x * 13 + o.z * 7));
    const n = Math.round(o.r * 0.5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * o.r * 0.85;
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d, y = groundAt(x, z);
      if (y > 5 && y < 65) trees.push([x, y, z, 0.7 + r() * 0.8]);
    }
  }
  const crown = new InstancedMesh(new ConeGeometry(2.6, 7, 6).translate(0, 5.5, 0), new MeshStandardMaterial({ color: 0x2f7d3f, flatShading: true, roughness: 0.9 }), trees.length);
  const trunk = new InstancedMesh(new ConeGeometry(0.5, 3, 5).translate(0, 1.5, 0), new MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true }), trees.length);
  const o = new Object3D();
  trees.forEach(([x, y, z, s], i) => {
    o.position.set(x, y - 0.5, z); o.scale.setScalar(s * 1.6); o.rotation.y = s * 10; o.updateMatrix();
    crown.setMatrixAt(i, o.matrix); trunk.setMatrixAt(i, o.matrix);
  });
  group.add(crown, trunk);
  return group;
}

/** Cloud banks: clusters of white facets, high enough to fly through. */
function makeClouds() {
  const r = rng(99), puffs = [];
  for (let c = 0; c < 46; c++) {
    const a = r() * Math.PI * 2, d = 150 + r() * (ARENA.radius + 300);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 190 + r() * 170;
    const n = 5 + Math.floor(r() * 6), size = 14 + r() * 16;
    for (let i = 0; i < n; i++) puffs.push([cx + (r() - 0.5) * size * 3.2, cy + (r() - 0.3) * size * 0.6, cz + (r() - 0.5) * size * 2, size * (0.6 + r() * 0.7)]);
  }
  const m = new InstancedMesh(new IcosahedronGeometry(1, 2), new MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.93, emissive: 0xdde8f5, emissiveIntensity: 0.55 }), puffs.length);
  const o = new Object3D();
  puffs.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.scale.set(s * 1.3, s * 0.75, s); o.rotation.y = x; o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.userData.puffs = puffs;
  return m;
}

/** Is a point inside a cloud? For the screen to go white as you fly through. */
export function inCloud(clouds, x, y, z) {
  let best = 0;
  for (const [cx, cy, cz, s] of clouds.userData.puffs) {
    const d = Math.hypot((x - cx) / (s * 1.3), (y - cy) / (s * 0.75), (z - cz) / s);
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return best;
}
