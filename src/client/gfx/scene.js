// The world as you see it: a hazy sky with a low sun, a deep sea that goes
// turquoise in the shallows and breaks white on the beaches, a harbour city
// with glass towers and streets, a suspension bridge across the bay, hills
// and mountains behind, soft clouds to hide in. The shapes come from
// shared/arena.js — the same ground and buildings the server kills you on.
import {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, CanvasTexture, CatmullRomCurve3, Color,
  ConeGeometry, CylinderGeometry, DataTexture, DirectionalLight, DoubleSide, DynamicDrawUsage, Fog, Group, HemisphereLight,
  InstancedBufferAttribute, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, LineBasicMaterial, LineSegments,
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, RGBAFormat, RepeatWrapping, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Sprite,
  SpriteMaterial, TubeGeometry, Vector3, WebGLRenderer, ClampToEdgeWrapping, RingGeometry, CircleGeometry,
} from 'three';
import { makeStreets } from './streets.js';
import { ARENA, BRIDGE, BUILDINGS, GRID, ISLANDS, cityAt, noise, terrainAt, inBay } from '../../shared/arena.js';

export const SKY = { top: 0x3b78c9, horizon: 0xd4e6f2, sun: 0xfff2d6, fog: 0xcfe2ef };
export const SUN_DIR = { x: -0.42, y: 0.5, z: -0.76 };
const MOBILE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function makeRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: !MOBILE || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.6 : 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

/** The terrain is drawn over this square; the sea runs on past it. */
const SPAN = 3600, SEG = MOBILE ? 220 : 300;

export function makeWorld(renderer) {
  const scene = new Scene();
  scene.background = new Color(SKY.horizon);
  scene.fog = new Fog(SKY.fog, 1300, 4400);
  const camera = new PerspectiveCamera(62, 1, 0.5, 7000);

  scene.add(new HemisphereLight(0xdcecff, 0x6a7a5a, 1.0));
  const sun = new DirectionalLight(0xfff0dc, 2.6);
  sun.position.set(SUN_DIR.x * 1000, SUN_DIR.y * 1000, SUN_DIR.z * 1000);
  scene.add(sun);

  const sky = makeSky();
  scene.add(sky);
  // the sky, as light: everything shiny (glass, paint, the sea) reflects it
  if (renderer) {
    const pm = new PMREMGenerator(renderer);
    const skyScene = new Scene();
    skyScene.add(makeSky());
    scene.environment = pm.fromScene(skyScene, 0.02).texture;
    pm.dispose();
  }

  const heights = sampleHeights();
  const land = makeLand(heights);
  scene.add(land);
  const sea = makeSea(heights);
  scene.add(sea);
  const city = makeCity();
  scene.add(city);
  const bridge = makeBridge();
  scene.add(bridge);
  const trees = makeTrees(heights);
  scene.add(trees);
  const clouds = makeClouds();
  scene.add(clouds);
  const traffic = makeTraffic();
  scene.add(traffic.group);
  const ships = makeShips();
  scene.add(ships.group);
  const streets = makeStreets();
  scene.add(streets.group);

  /**
   * How much to draw. 'high' is everything; 'med' drops the small things you
   * barely see from a cockpit; 'low' also thins the clouds, calms the sea,
   * and draws less far. (The pixel ratio, the biggest cost, is main.js's.)
   */
  function setQuality(level) {
    const low = level === 'low', med = level === 'med';
    trees.children[1].visible = !low;           // the upper tier of each tree
    trees.children[2].visible = !low && !med;   // the trunks
    city.children[1].visible = !low;            // plant rooms on the roofs
    traffic.group.visible = !low;
    ships.group.visible = !low;
    streets.group.visible = !low;
    streets.setQuality(level);
    clouds.children.forEach((c, i) => (c.visible = !low || i % 3 === 0));
    sea.material.uniforms.detail.value = low ? 0 : 1;
    // clear air: the haze starts far out, where it only softens the horizon
    const far = low ? 3000 : med ? 3800 : 4400;
    scene.fog.far = far; scene.fog.near = far * 0.3;
    sea.material.uniforms.fogFar.value = far; sea.material.uniforms.fogNear.value = far * 0.3;
    camera.far = far + 2000; camera.updateProjectionMatrix();
  }

  return {
    scene, camera, sky, sea, clouds, setQuality,
    /** Per frame: the sky follows the camera, the sea and the traffic move. */
    tick(t, dt = 0.016) {
      sky.position.copy(camera.position);
      sea.material.uniforms.time.value = t;
      sea.position.x = Math.round(camera.position.x / 100) * 100;
      sea.position.z = Math.round(camera.position.z / 100) * 100;
      traffic.tick(dt);
      ships.tick(dt);
      if (streets.group.visible) streets.tick(dt, camera.position);
    },
  };
}

// ---- the sky -----------------------------------------------------------------

function makeSky() {
  const m = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new Color(SKY.top) }, horizon: { value: new Color(SKY.horizon) }, sunC: { value: new Color(SKY.sun) },
      sunDir: { value: new Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize() },
    },
    // pinned to the far plane: however short the view distance (the quality
    // setting shortens it), the dome is never clipped into a pale disc
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunC; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5));
        c = mix(c, horizon * 0.96, smoothstep(0.0, -0.15, h));
        float s = max(dot(d, sunDir), 0.0);
        // the disc, its glow, and a warm haze round the sun near the horizon
        c += sunC * (pow(s, 1400.0) * 3.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.12 * (1.0 - clamp(h * 2.0, 0.0, 1.0)));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const s = new Mesh(new SphereGeometry(5000, 32, 16), m);
  s.renderOrder = -1;
  return s;
}

// ---- the ground ----------------------------------------------------------------

/** Heights on the terrain grid, sampled once and shared by everything below. */
function sampleHeights() {
  const n = SEG + 1, h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = terrainAt(-SPAN / 2 + (i / SEG) * SPAN, -SPAN / 2 + (j / SEG) * SPAN);
  const at = (x, z) => {
    const fx = (x + SPAN / 2) / SPAN * SEG, fz = (z + SPAN / 2) / SPAN * SEG;
    const i = Math.max(0, Math.min(SEG - 1, Math.floor(fx))), j = Math.max(0, Math.min(SEG - 1, Math.floor(fz)));
    const u = fx - i, v = fz - j;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return { n, h, at };
}

/** The ground's picture from above: beaches, grass, forest, rock, snow, streets and parks. */
function paintGround(H) {
  const N = MOBILE ? 1024 : 2048, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), px = img.data;
  const step = GRID.block + GRID.street;
  // which city blocks hold a building: the others are parks
  const built = new Set(BUILDINGS.map((b) => `${Math.floor(b.x / step)},${Math.floor(b.z / step)}`));
  const set = (k, r, gg, b) => { px[k] = r; px[k + 1] = gg; px[k + 2] = b; px[k + 3] = 255; };
  for (let j = 0; j < N; j++) {
    const z = -SPAN / 2 + (j + 0.5) / N * SPAN;
    for (let i = 0; i < N; i++) {
      const x = -SPAN / 2 + (i + 0.5) / N * SPAN, k = (j * N + i) * 4;
      const h = H.at(x, z), n1 = noise(x * 0.02, z * 0.02), n2 = noise(x * 0.11, z * 0.11);
      if (h < 0.8) { const w = 0.6 + 0.4 * n2; set(k, 200 * w, 186 * w, 150 * w); continue; } // wet sand and the seabed
      if (cityAt(x, z)) {
        const u = ((x % step) + step) % step, v = ((z % step) + step) % step, s2 = GRID.street / 2;
        const street = u < s2 || u > step - s2 || v < s2 || v > step - s2;
        if (street) {
          // asphalt, with a dashed line down the middle
          const lineU = Math.abs(u - (u < s2 ? 0 : step)) < 0.9 && (Math.floor(z / 6) % 2 === 0);
          const lineV = Math.abs(v - (v < s2 ? 0 : step)) < 0.9 && (Math.floor(x / 6) % 2 === 0);
          if (lineU || lineV) set(k, 220, 210, 160);
          else { const a = 58 + n2 * 14; set(k, a, a + 2, a + 6); }
          continue;
        }
        const bx = Math.floor(x / step), bz = Math.floor(z / step);
        if (!built.has(`${bx},${bz}`)) { const w = 0.75 + 0.35 * n2; set(k, 78 * w, 128 * w, 62 * w); continue; } // a park
        const edge = Math.min(u - s2, step - s2 - u, v - s2, step - s2 - v) < 3; // the sidewalk
        const a = edge ? 176 : 132 + n2 * 22;
        set(k, a, a - 2, a - 6);
        continue;
      }
      // the boulevard onto the bridge
      if (Math.abs(x - BRIDGE.x) < 14 && z > BRIDGE.z0 - 220 && z < BRIDGE.z1 + 220) { const a = 62 + n2 * 10; set(k, a, a, a + 4); continue; }
      const slope = Math.abs(H.at(x + 6, z) - H.at(x - 6, z)) + Math.abs(H.at(x, z + 6) - H.at(x, z - 6));
      if (h < 3.2) { const w = 0.85 + 0.15 * n2; set(k, 222 * w, 205 * w, 160 * w); continue; } // the beach
      if (h > 250 + n1 * 30 && slope < 14) { set(k, 236, 239, 243); continue; } // snow on the high tops only
      if (slope > 15 || h > 165 + n1 * 40) { const w = 0.6 + 0.4 * n2; set(k, 118 * w, 108 * w, 94 * w); continue; } // rock
      const forest = noise(x * 0.008 + 11, z * 0.008 - 4) > 0.55;
      const w = 0.7 + 0.3 * n2 + 0.15 * n1;
      if (forest) set(k, 52 * w, 92 * w, 48 * w);
      else set(k, 96 * w, 140 * w, 70 * w);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  return tex;
}

function makeLand(H) {
  const geo = new PlaneGeometry(SPAN, SPAN, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const i = v % H.n, j = Math.floor(v / H.n);
    pos.setY(v, H.h[j * H.n + i]);
  }
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({ map: paintGround(H), roughness: 0.95, metalness: 0 });
  // up close the picture is soft: a fine grain of noise over it, by place
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLW;
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float grain = vn(vLW.xz * 0.35) * 0.6 + vn(vLW.xz * 1.3) * 0.4;
      diffuseColor.rgb *= 0.86 + grain * 0.26;`);
  };
  return new Mesh(geo, mat);
}

/**
 * The sea: deep blue far out, turquoise over the shallows, foam where it
 * meets the shore, the sky in it at a glancing angle and the sun on it.
 */
function makeSea(H) {
  const N = 256, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -SPAN / 2 + (i / (N - 1)) * SPAN, z = -SPAN / 2 + (j / (N - 1)) * SPAN;
    const h = H.at(x, z);
    // 1 at the waterline, falling off over ~8 m of depth
    data[(j * N + i) * 4] = Math.round(Math.max(0, Math.min(1, 1 + h / 8)) * 255);
    data[(j * N + i) * 4 + 3] = 255;
  }
  const depth = new DataTexture(data, N, N, RGBAFormat);
  depth.magFilter = depth.minFilter = LinearFilter;
  depth.wrapS = depth.wrapT = ClampToEdgeWrapping;
  depth.needsUpdate = true;
  const m = new ShaderMaterial({
    fog: true,
    uniforms: {
      time: { value: 0 }, detail: { value: 1 }, depth: { value: depth }, span: { value: SPAN },
      deep: { value: new Color(0x0b3a63) }, mid: { value: new Color(0x16608c) }, shallow: { value: new Color(0x2fa7a4) }, foam: { value: new Color(0xf2f7fa) },
      skyC: { value: new Color(SKY.horizon) }, fogColor: { value: new Color(SKY.fog) }, fogNear: { value: 1300 }, fogFar: { value: 4400 },
      sunDir: { value: new Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize() },
    },
    vertexShader: `varying vec3 vW; varying float vFog;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time; uniform float detail; uniform sampler2D depth; uniform float span; uniform vec3 deep; uniform vec3 mid; uniform vec3 shallow; uniform vec3 foam; uniform vec3 skyC;
      uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform vec3 sunDir; varying vec3 vW; varying float vFog;
      vec2 wave(vec2 p, vec2 d, float f, float s){ float a = dot(p, d) * f + time * s; return d * cos(a) * f; }
      void main(){
        vec2 uv = vW.xz / span + 0.5;
        float sh = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture2D(depth, uv).r;
        // a few crossing swells, their slopes as the normal
        // many small swells in many directions, so no one of them reads as stripes
        vec2 g = vec2(0.0);
        g += wave(vW.xz, normalize(vec2(1.0, 0.3)), 0.031, 0.9) * 0.35;
        g += wave(vW.xz, normalize(vec2(-0.4, 1.0)), 0.047, 1.2) * 0.3;
        g += wave(vW.xz, normalize(vec2(0.7, -0.7)), 0.083, 1.7) * 0.22;
        if (detail > 0.5) {
          g += wave(vW.xz, normalize(vec2(-0.9, -0.2)), 0.131, 2.3) * 0.16;
          g += wave(vW.xz, normalize(vec2(0.2, 0.95)), 0.211, 2.9) * 0.1;
          g += wave(vW.xz, normalize(vec2(-0.6, -0.8)), 0.337, 3.7) * 0.07;
          g += wave(vW.xz, normalize(vec2(0.95, -0.3)), 0.53, 4.6) * 0.05;
        }
        // the swell fades with distance, as the eye would lose it
        float dist = length(cameraPosition - vW);
        g *= 1.0 - smoothstep(300.0, 2200.0, dist) * 0.8;
        vec3 n = normalize(vec3(-g.x * 2.0, 1.0, -g.y * 2.0));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 water = mix(deep, mid, 0.45);
        water = mix(water, shallow, smoothstep(0.25, 0.95, sh));
        vec3 c = mix(water, skyC, clamp(fres * 0.85, 0.0, 0.85));
        // surf on the beaches
        float surf = smoothstep(0.86, 0.99, sh) * (0.5 + 0.5 * sin(sh * 60.0 - time * 2.0 + vW.x * 0.02));
        c = mix(c, foam, clamp(surf, 0.0, 1.0) * 0.75);
        vec3 h = normalize(sunDir + v);
        c += vec3(1.0, 0.95, 0.85) * (pow(max(dot(n, h), 0.0), 280.0) * 1.6 + pow(max(dot(n, h), 0.0), 40.0) * 0.08);
        float f = smoothstep(fogNear, fogFar, vFog);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const g = new PlaneGeometry(9000, 9000, 1, 1);
  g.rotateX(-Math.PI / 2);
  return new Mesh(g, m);
}

// ---- the city ------------------------------------------------------------------

/**
 * Buildings: one instanced box each, the windows drawn by the shader from
 * where on the wall a pixel is — floors, bays, glass that reflects the sky
 * and the odd lit window — so 200 towers cost one draw.
 */
function makeCity() {
  const group = new Group();
  const n = BUILDINGS.length;
  const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const kinds = new Float32Array(n);
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;\nvarying vec3 vBW;\nvarying vec3 vBN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 bw = vec4(transformed, 1.0);
        vec3 bn = objectNormal;
        #ifdef USE_INSTANCING
          bw = instanceMatrix * bw;
          bn = mat3(instanceMatrix) * bn;
        #endif
        vBW = (modelMatrix * bw).xyz;
        vBN = normalize(bn);
        vKind = aKind;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vKind; varying vec3 vBW; varying vec3 vBN;
      float bh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 23758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wall = 1.0 - step(0.5, abs(vBN.y));
        float along = abs(vBN.x) > 0.5 ? vBW.z : vBW.x;
        float floorH = vKind > 1.5 ? 3.0 : 3.7;
        float bay = vKind < 0.5 ? 1.6 : (vKind > 1.5 ? 2.6 : 3.3);
        vec2 cell = vec2(along / bay, (vBW.y - 3.0) / floorH);
        vec2 f = fract(cell);
        float win;
        if (vKind < 0.5) win = step(0.05, f.x) * step(f.x, 0.95) * step(0.08, f.y) * step(f.y, 0.92);
        else if (vKind < 1.5) win = step(0.12, f.y) * step(f.y, 0.62);
        else win = step(0.22, f.x) * step(f.x, 0.78) * step(0.25, f.y) * step(f.y, 0.75);
        // far off, a window is less than a pixel: fade to the wall's average
        // instead of letting the grid shimmer into stripes
        float cov = vKind < 0.5 ? 0.8 : (vKind < 1.5 ? 0.5 : 0.28);
        float aa = clamp(1.6 - max(fwidth(cell.x), fwidth(cell.y)) * 3.0, 0.0, 1.0);
        win = mix(cov, win, aa);
        win *= wall * step(3.0, vBW.y);
        float lit = step(0.9, bh(floor(cell) + floor(vBW.xz * 0.01))) * aa;
        vec3 glass = mix(vec3(0.16, 0.24, 0.32), vec3(0.62, 0.58, 0.48), lit * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
        // roofs a little darker, the street level darker still
        diffuseColor.rgb *= mix(1.0, 0.72, step(0.5, vBN.y));
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(2.0, 4.5, vBW.y));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, win);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.65, win);');
  };
  const mesh = new InstancedMesh(box, mat, n);
  const o = new Object3D(), c = new Color();
  const tints = {
    glass: [0x8fa7b8, 0x6f8797, 0xa9b9c4, 0x5f7b8f],
    office: [0xc9c2b6, 0xb7b2aa, 0xd8d0c0, 0x9c9a96],
    flat: [0xd9c7a8, 0xc8a98a, 0xe2d7c4, 0xb9a48f, 0xcfbfb0],
  };
  BUILDINGS.forEach((b, i) => {
    o.position.set(b.x, b.base - 1, b.z);
    o.scale.set(b.w, b.h + 1, b.d);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    const list = tints[b.kind];
    mesh.setColorAt(i, c.set(list[Math.floor(b.tint * list.length)]));
    kinds[i] = b.kind === 'glass' ? 0 : b.kind === 'office' ? 1 : 2;
  });
  box.setAttribute('aKind', new InstancedBufferAttribute(kinds, 1));
  group.add(mesh);
  // on the roofs: plant rooms and water tanks, so they are not bare slabs
  const r = rng(77), roofBits = [];
  for (const b of BUILDINGS) {
    const k = 1 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) roofBits.push([b.x + (r() - 0.5) * b.w * 0.6, b.base + b.h, b.z + (r() - 0.5) * b.d * 0.6, 3 + r() * 6, 2 + r() * 3.5, 3 + r() * 6]);
  }
  const roof = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new MeshStandardMaterial({ color: 0x8d9094, roughness: 0.8 }), roofBits.length);
  roofBits.forEach(([x, y, z, w, h, d], i) => { o.position.set(x, y, z); o.scale.set(w, h, d); o.updateMatrix(); roof.setMatrixAt(i, o.matrix); });
  group.add(roof);
  return group;
}

// ---- the bridge -----------------------------------------------------------------

function makeBridge() {
  const B = BRIDGE, g = new Group();
  const red = new MeshStandardMaterial({ color: 0xc0472b, roughness: 0.55, metalness: 0.35 });
  const deckM = new MeshStandardMaterial({ color: 0x9a3f2a, roughness: 0.6, metalness: 0.3 });
  const road = new MeshStandardMaterial({ map: roadTexture(), roughness: 0.9 });
  const len = B.z1 - B.z0;
  // the deck: a truss box with the road on top
  const deck = new Mesh(new BoxGeometry(B.width, B.deckTop - B.deckBottom - 0.4, len), deckM);
  deck.position.set(B.x, (B.deckTop + B.deckBottom) / 2 - 0.2, (B.z0 + B.z1) / 2);
  g.add(deck);
  const top = new Mesh(new PlaneGeometry(B.width - 2, len).rotateX(-Math.PI / 2), road);
  top.material.map.repeat.set(1, len / 40);
  top.position.set(B.x, B.deckTop + 0.02, (B.z0 + B.z1) / 2);
  g.add(top);
  // railings
  for (const s of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.5, 1.4, len), red);
    rail.position.set(B.x + s * (B.width / 2 - 0.3), B.deckTop + 0.7, (B.z0 + B.z1) / 2);
    g.add(rail);
  }
  // the towers: two tapering legs and the beams between them, art-deco steps
  for (const tz of B.towers) {
    for (const s of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(B.leg, B.towerTop + 10, B.leg * 1.4), red);
      leg.geometry.translate(0, (B.towerTop + 10) / 2 - 10, 0);
      leg.position.set(B.x + s * B.legOffset, 0, tz);
      g.add(leg);
      const cap = new Mesh(new BoxGeometry(B.leg - 1.5, 8, B.leg * 1.4 - 1.5), red);
      cap.position.set(B.x + s * B.legOffset, B.towerTop + 4, tz);
      g.add(cap);
    }
    for (const by of B.beams) {
      const beam = new Mesh(new BoxGeometry(B.legOffset * 2, 6, 5), red);
      beam.position.set(B.x, by, tz);
      g.add(beam);
    }
    // a concrete pier where the tower stands in the sea
    const pier = new Mesh(new BoxGeometry(B.legOffset * 2 + 16, 12, 22), new MeshStandardMaterial({ color: 0x9c9890, roughness: 0.9 }));
    pier.position.set(B.x, -2, tz);
    g.add(pier);
  }
  // the main cables: anchored at the ends, over the tower tops, sagging between
  const [t0, t1] = B.towers;
  const susp = [];
  for (const s of [-1, 1]) {
    const x = B.x + s * B.legOffset;
    const pts = [];
    const sag = (z) => {
      if (z < t0) return B.deckTop + 2 + (B.towerTop - 2 - B.deckTop - 2) * ((z - B.z0) / (t0 - B.z0)) ** 1.4;
      if (z > t1) return B.deckTop + 2 + (B.towerTop - 2 - B.deckTop - 2) * ((B.z1 - z) / (B.z1 - t1)) ** 1.4;
      const u = (z - (t0 + t1) / 2) / ((t1 - t0) / 2);
      return B.deckTop + 7 + (B.towerTop - 2 - B.deckTop - 7) * u * u;
    };
    for (let i = 0; i <= 60; i++) { const z = B.z0 + (i / 60) * len; pts.push(new Vector3(x, sag(z), z)); }
    g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 120, 0.9, 6), red));
    // the hangers, every 12 m, from the cable to the deck
    for (let z = B.z0 + 12; z < B.z1 - 6; z += 12) {
      if (Math.abs(z - t0) < 6 || Math.abs(z - t1) < 6) continue;
      susp.push(x, sag(z), z, x, B.deckTop + 1.2, z);
    }
  }
  const lg = new BufferGeometry();
  lg.setAttribute('position', new Float32BufferAttribute(susp, 3));
  g.add(new LineSegments(lg, new LineBasicMaterial({ color: 0x8f3522 })));
  return g;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4d52'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#e8e2c8';
  for (const x of [21, 42]) for (let y = 0; y < 256; y += 64) g.fillRect(x, y, 2, 32);
  g.fillStyle = '#d9b24a'; g.fillRect(31, 0, 2, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Cars on the bridge, both ways. */
function makeTraffic() {
  const B = BRIDGE, n = 26, r = rng(5);
  const mesh = new InstancedMesh(new BoxGeometry(2.0, 1.5, 4.4).translate(0, 0.75, 0), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }), n);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const cars = [], c = new Color(), o = new Object3D();
  const palette = [0xe8e8ea, 0x1d1f24, 0xb0221c, 0x2a4f9a, 0x9aa1a8, 0xd9d2c2];
  for (let i = 0; i < n; i++) {
    const lane = i % 4, dir = lane < 2 ? 1 : -1;
    cars.push({ x: B.x + (lane - 1.5) * 5.6, z: B.z0 + r() * (B.z1 - B.z0), v: dir * (14 + r() * 8) });
    mesh.setColorAt(i, c.set(palette[i % palette.length]));
  }
  const group = new Group();
  group.add(mesh);
  return {
    group,
    tick(dt) {
      cars.forEach((car, i) => {
        car.z += car.v * dt;
        if (car.z > B.z1 - 4) car.z = B.z0 + 4;
        if (car.z < B.z0 + 4) car.z = B.z1 - 4;
        o.position.set(car.x, B.deckTop + 0.05, car.z);
        o.rotation.y = car.v > 0 ? 0 : Math.PI;
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A few ships on slow courses: a freighter, a ferry, yachts. */
function makeShips() {
  const group = new Group(), ships = [];
  const hullM = new MeshStandardMaterial({ color: 0x2c3a4a, roughness: 0.6 }), whiteM = new MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.5 }), redM = new MeshStandardMaterial({ color: 0x9e2b25, roughness: 0.6 });
  const make = (len, kind) => {
    const s = new Group();
    const hull = new Mesh(new BoxGeometry(len * 0.24, len * 0.12, len), kind === 'yacht' ? whiteM : hullM);
    hull.position.y = len * 0.03;
    s.add(hull);
    const bow = new Mesh(new ConeGeometry(len * 0.12, len * 0.22, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), kind === 'yacht' ? whiteM : hullM);
    bow.scale.set(1, 0.5, 1);
    bow.position.set(0, len * 0.03, -len * 0.6);
    s.add(bow);
    if (kind === 'freighter') {
      const cols = [0xc0472b, 0x2a6f9a, 0xd8a33a, 0x3f7f4f];
      for (let i = 0; i < 6; i++) {
        const box = new Mesh(new BoxGeometry(len * 0.2, len * 0.07, len * 0.11), new MeshStandardMaterial({ color: cols[i % 4], roughness: 0.7 }));
        box.position.set(0, len * 0.12, -len * 0.35 + i * len * 0.12);
        s.add(box);
      }
    }
    const cabin = new Mesh(new BoxGeometry(len * 0.18, len * (kind === 'freighter' ? 0.14 : 0.1), len * 0.16), whiteM);
    cabin.position.set(0, len * 0.14, kind === 'freighter' ? len * 0.38 : 0);
    s.add(cabin);
    if (kind === 'ferry') { const st = new Mesh(new CylinderGeometry(len * 0.03, len * 0.03, len * 0.1, 8), redM); st.position.set(0, len * 0.24, 0); s.add(st); }
    // the wake behind
    const wake = new Mesh(new PlaneGeometry(len * 0.4, len * 1.6).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    wake.position.set(0, 0.3, len * 1.2);
    s.add(wake);
    return s;
  };
  const courses = [
    { kind: 'freighter', len: 140, cx: -700, cz: 0, r: 520, w: 0.006 },
    { kind: 'ferry', len: 60, cx: 120, cz: BRIDGE.cz, r: 0, line: true, w: 0.03 },
    { kind: 'yacht', len: 22, cx: -350, cz: 300, r: 220, w: -0.018 },
    { kind: 'yacht', len: 18, cx: -200, cz: -380, r: 160, w: 0.022 },
  ];
  for (const c of courses) { const m = make(c.len, c.kind); group.add(m); ships.push({ ...c, m, a: Math.random() * 6 }); }
  return {
    group,
    tick(dt) {
      for (const s of ships) {
        s.a += s.w * dt;
        if (s.line) {
          // the ferry goes up the bay and back, under the bridge
          const k = (Math.sin(s.a) + 1) / 2, x = -150 + k * 650;
          s.m.position.set(x, 0, s.cz + 30 * Math.sin(x * 0.006));
          s.m.rotation.y = Math.cos(s.a) > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
          s.m.position.set(s.cx + Math.cos(s.a) * s.r, 0, s.cz + Math.sin(s.a) * s.r);
          s.m.rotation.y = -s.a + (s.w > 0 ? Math.PI : 0);
        }
      }
    },
  };
}

// ---- trees -----------------------------------------------------------------------

function makeTrees(H) {
  const r = rng(31), spots = [];
  const target = MOBILE ? 1800 : 3200;
  for (let tries = 0; spots.length < target && tries < target * 12; tries++) {
    const x = -1300 + r() * 2600, z = -1300 + r() * 2600;
    const h = H.at(x, z);
    if (h < 5 || h > 170 || cityAt(x, z) || inBay(x, z) > 0) continue;
    if (Math.abs(x - BRIDGE.x) < 20 && z > BRIDGE.z0 - 230 && z < BRIDGE.z1 + 230) continue;
    const slope = Math.abs(H.at(x + 6, z) - H.at(x - 6, z)) + Math.abs(H.at(x, z + 6) - H.at(x, z - 6));
    if (slope > 14) continue;
    // in woods mostly, a few alone
    if (noise(x * 0.008 + 11, z * 0.008 - 4) < 0.55 && r() > 0.08) continue;
    spots.push([x, h, z, 0.75 + r() * 0.6]);
  }
  const g = new Group(), o = new Object3D();
  const crown = new InstancedMesh(new ConeGeometry(3.2, 9, 7).translate(0, 8, 0), new MeshStandardMaterial({ color: 0x2e5a2c, roughness: 0.9 }), spots.length);
  const crown2 = new InstancedMesh(new ConeGeometry(2.4, 6.5, 7).translate(0, 12.5, 0), new MeshStandardMaterial({ color: 0x386b33, roughness: 0.9 }), spots.length);
  const trunk = new InstancedMesh(new CylinderGeometry(0.35, 0.5, 4, 5).translate(0, 2, 0), new MeshStandardMaterial({ color: 0x5b4330 }), spots.length);
  spots.forEach(([x, y, z, s], i) => {
    o.position.set(x, y - 0.3, z); o.scale.setScalar(s); o.rotation.y = s * 13; o.updateMatrix();
    crown.setMatrixAt(i, o.matrix); crown2.setMatrixAt(i, o.matrix); trunk.setMatrixAt(i, o.matrix);
  });
  g.add(crown, crown2, trunk);
  return g;
}

// ---- clouds ------------------------------------------------------------------------

/** Soft puffs on sprites, in banks high over the sea and the city. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(3);
  // a cluster of soft blobs, lighter on top
  for (let i = 0; i < 14; i++) {
    const x = 30 + r() * 68, y = 38 + r() * 52, rad = 18 + r() * 26;
    const gr = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.55, 'rgba(244,247,250,0.55)');
    gr.addColorStop(1, 'rgba(225,232,240,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function makeClouds() {
  const r = rng(99), group = new Group(), puffs = [];
  const tex = puffTexture();
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, color: 0xffffff });
  const shade = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, color: 0xd5dde6 });
  // few, and high: up near the ceiling and out toward the edge, where they
  // are scenery and a place to hide — not a wall across every fight
  for (let c = 0; c < 14; c++) {
    const a = r() * Math.PI * 2, d = 450 + r() * (ARENA.radius + 300);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 470 + r() * 60;
    const n = 5 + Math.floor(r() * 5), size = 50 + r() * 40;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(i % 3 ? mat : shade);
      const sx = size * (0.8 + r() * 0.7);
      s.scale.set(sx * 1.6, sx, 1);
      s.position.set(cx + (r() - 0.5) * size * 2.6, cy + (r() - 0.4) * size * 0.35 - (i % 3 ? 0 : 6), cz + (r() - 0.5) * size * 1.6);
      group.add(s);
      puffs.push([s.position.x, s.position.y, s.position.z, sx * 0.55]);
    }
  }
  group.userData.puffs = puffs;
  return group;
}

/** How deep in a cloud a point is, 0..1: for the screen to go white flying through. */
export function inCloud(clouds, x, y, z) {
  let best = 0;
  for (const [cx, cy, cz, s] of clouds.userData.puffs) {
    const d = Math.hypot((x - cx) / (s * 1.4), (y - cy) / (s * 0.6), (z - cz) / s);
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return best;
}

// ---- repair pads ---------------------------------------------------------------

/**
 * The repair pads: a ring of green light on the ground, a column of light
 * standing up out of it, and a cross turning over it — grey and dark while
 * a spent pad recharges, a countdown ring filling back up.
 */
export function makePads(scene, list, rule) {
  const glow = (color, opacity) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const beamTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  })();
  const pads = list.map((p) => {
    const g = new Group();
    g.position.set(p.x, p.y + 0.6, p.z);
    const ring = new Mesh(new RingGeometry(rule.r - 2.2, rule.r, 48).rotateX(-Math.PI / 2), glow(0x4dff9a, 0.9));
    const inner = new Mesh(new RingGeometry(rule.r * 0.55, rule.r * 0.6, 48).rotateX(-Math.PI / 2), glow(0x4dff9a, 0.6));
    const disc = new Mesh(new CircleGeometry(rule.r, 48).rotateX(-Math.PI / 2), glow(0x1f8f55, 0.18));
    const beam = new Mesh(new CylinderGeometry(rule.r * 0.95, rule.r, rule.h, 32, 1, true).translate(0, rule.h / 2, 0), new MeshBasicMaterial({ map: beamTex, color: 0x4dff9a, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    const cross = new Group();
    const arm = new BoxGeometry(9, 2.6, 2.6);
    const mat = new MeshBasicMaterial({ color: 0x6dffb0, fog: false });
    cross.add(new Mesh(arm, mat), new Mesh(arm, mat).rotateZ(Math.PI / 2));
    cross.position.y = rule.h * 0.55;
    g.add(disc, ring, inner, beam, cross);
    scene.add(g);
    return { g, ring, inner, disc, beam, cross, mat, until: 0, total: 1 };
  });
  return {
    /** Spent: dark for `secs` seconds. */
    spend(i, secs) { const p = pads[i]; if (!p) return; p.until = performance.now() + secs * 1000; p.total = Math.max(1, secs); },
    ready: (i) => !!pads[i] && performance.now() >= pads[i].until,
    tick(dt, time) {
      const now = performance.now();
      for (const p of pads) {
        const left = Math.max(0, (p.until - now) / 1000), on = left === 0;
        p.beam.visible = on;
        p.cross.visible = on;
        p.cross.rotation.y = time * 1.4;
        p.cross.position.y = rule.h * 0.55 + Math.sin(time * 2) * 2;
        p.ring.material.color.setHex(on ? 0x4dff9a : 0x59626b);
        p.ring.material.opacity = on ? 0.75 + Math.sin(time * 4) * 0.2 : 0.5;
        // recharging: the inner ring fills back round
        p.inner.scale.setScalar(on ? 1 : 1 - left / p.total);
        p.disc.material.opacity = on ? 0.18 : 0.06;
      }
    },
  };
}
