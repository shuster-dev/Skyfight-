// Many still parts drawn as few: every plain mesh under a root that does not
// move on its own is merged with the others that look the same, one mesh per
// look. A plane of forty parts is a dozen draws; a bridge of eighty, a handful.
import { Matrix4, Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const M = new Matrix4(), INV = new Matrix4();

/** Materials that would draw the same (each part tends to get its own). */
function lookOf(m) {
  return [m.type, m.color?.getHex(), m.roughness, m.metalness, m.emissive?.getHex(), m.emissiveIntensity, m.map?.uuid, m.emissiveMap?.uuid,
    m.normalMap?.uuid, m.flatShading, m.side, m.vertexColors, m.fog, m.toneMapped].join('|');
}

/**
 * Merge in place. `keep(o)` names the objects (and everything under them)
 * that must stay their own: what turns, burns, hides or is swapped later.
 * Glass and glow (transparent) stay too, so they still sort.
 */
export function bakeInPlace(root, keep = () => false) {
  root.updateMatrixWorld(true);
  INV.copy(root.matrixWorld).invert();
  const by = new Map(), gone = [];
  const walk = (o) => {
    for (const c of [...o.children]) {
      if (keep(c) || !c.visible) continue;
      if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !Array.isArray(c.material) && !c.material.transparent && !c.children.length) {
        const m = c.material, attrs = ['position', 'normal'];
        if (m.map || m.emissiveMap || m.normalMap) attrs.push('uv');
        if (m.vertexColors) attrs.push('color');
        if (!attrs.every((k) => c.geometry.attributes[k])) continue;
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!attrs.includes(k)) g.deleteAttribute(k);
        g.morphAttributes = {};
        g.applyMatrix4(M.multiplyMatrices(INV, c.matrixWorld));
        // a mirrored part (scaled by -1) turns its faces inside out: wind them back
        if (M.determinant() < 0) for (const a of Object.values(g.attributes)) {
          const n = a.itemSize, arr = a.array;
          for (let i = 0; i + 2 < a.count; i += 3) for (let k = 0; k < n; k++) {
            const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t;
          }
        }
        const key = lookOf(m);
        if (!by.has(key)) by.set(key, [m, []]);
        by.get(key)[1].push(g);
        gone.push([c, key]);
      } else walk(c);
    }
  };
  walk(root);
  const done = new Set();
  for (const [key, [m, gs]] of by) {
    // a look with one part keeps it as it is
    const merged = gs.length > 1 ? mergeGeometries(gs) : null;
    gs.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new Mesh(merged, m);
    mesh.name = 'baked';
    root.add(mesh);
    done.add(key);
  }
  for (const [c, key] of gone) if (done.has(key)) c.removeFromParent();
  return root;
}
