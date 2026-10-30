// Low-poly models for the countryside round the circuit: red cottages, the barn, the windmill, trees,
// animals, spectators, fences and the cars. Every model is one vertex-coloured geometry (or a few).
import * as THREE from 'three';
import { CAR_BODY_DEFS, defaultStyle, type CarBody, type CarDriver, type CarStyle } from '@lilla-garden/shared';
import { Geo, mat } from './geo.ts';
import { rng } from './util.ts';

export const FALU = '#9b2c1f';
export const WHITE = '#f1ede4';
const GLASS = '#26324a';
const WOOD = '#8c6c4c';
const GREYWOOD = '#857661';
const STONE = '#8a8780';

/** A box between two points in the y–z plane (a beam or a roof slab), `w` wide along x. */
function slab(g: Geo, z1: number, y1: number, z2: number, y2: number, w: number, t: number, color: string, x = 0): void {
  const len = Math.hypot(z2 - z1, y2 - y1);
  const ang = Math.atan2(y2 - y1, z2 - z1);
  g.add(new THREE.BoxGeometry(w, t, len), color, mat(x, (y1 + y2) / 2, (z1 + z2) / 2, -ang, 0, 0));
}

/** A beam between two 3D points (square section). */
export function beam(g: Geo, a: THREE.Vector3, b: THREE.Vector3, t: number, color: string): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.add(new THREE.BoxGeometry(t, len, t), color, m);
}

/** A thin open four-sided rod between two points (8 triangles). */
export function rod(g: Geo, a: THREE.Vector3, b: THREE.Vector3, r: number, color: string): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.add(new THREE.CylinderGeometry(r, r, len, 4, 1, true), color, m);
}

function windowAt(g: Geo, x: number, y: number, z: number, face: 'z' | 'x', sign: number, w = 1.0, h = 1.15): void {
  const o = sign * 0.02;
  if (face === 'z') {
    g.box(w + 0.24, h + 0.24, 0.12, WHITE, x, y, z + o);
    g.box(w, h, 0.14, GLASS, x, y, z + o * 1.5);
    g.box(0.08, h, 0.17, WHITE, x, y, z + o * 2);
    g.box(w, 0.08, 0.17, WHITE, x, y + h * 0.1, z + o * 2);
  } else {
    g.box(0.12, h + 0.24, w + 0.24, WHITE, x + o, y, z);
    g.box(0.14, h, w, GLASS, x + o * 1.5, y, z);
    g.box(0.17, h, 0.08, WHITE, x + o * 2, y, z);
    g.box(0.17, 0.08, w, WHITE, x + o * 2, y + h * 0.1, z);
  }
}

/** A red cottage with white corners, a gable roof and a chimney; door facing +z. */
export function cottage(seed: number, w = 8, d = 6, h = 3.4, roof = '#3c3e44'): THREE.BufferGeometry {
  const r = rng(seed);
  const g = new Geo();
  const y0 = 0.5 + h;
  const rh = d * 0.42;
  g.box(w + 0.3, 0.6, d + 0.3, STONE, 0, 0.25, 0);
  g.box(w, h, d, FALU, 0, 0.5 + h / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.28, h, 0.28, WHITE, (sx * w) / 2, 0.5 + h / 2, (sz * d) / 2);
  // the attic gable, red, then the roof slabs with white barge boards
  g.prism(
    [
      [-d / 2, y0, w / 2],
      [d / 2, y0, w / 2],
      [0, y0 + rh, w / 2],
    ],
    FALU,
  );
  const ez = d / 2 + 0.45;
  slab(g, -ez, y0 - 0.3, 0.02, y0 + rh + 0.12, w + 0.8, 0.2, roof);
  slab(g, ez, y0 - 0.3, -0.02, y0 + rh + 0.12, w + 0.8, 0.2, roof);
  for (const sx of [-1, 1]) {
    slab(g, -ez, y0 - 0.32, 0, y0 + rh + 0.05, 0.12, 0.28, WHITE, sx * (w / 2 + 0.42));
    slab(g, ez, y0 - 0.32, 0, y0 + rh + 0.05, 0.12, 0.28, WHITE, sx * (w / 2 + 0.42));
  }
  // windows and the door
  const wy = 0.5 + h * 0.55;
  for (const x of [-w * 0.32, w * 0.32]) {
    windowAt(g, x, wy, d / 2, 'z', 1);
    windowAt(g, x, wy, -d / 2, 'z', -1);
  }
  windowAt(g, 0, wy, -d / 2, 'z', -1);
  for (const sx of [-1, 1]) windowAt(g, (sx * w) / 2, wy, 0, 'x', sx, 0.9, 1.0);
  windowAt(g, w / 2, y0 + rh * 0.38, 0, 'x', 1, 0.6, 0.6);
  g.box(1.3, 2.35, 0.1, WHITE, 0, 0.5 + 1.12, d / 2 + 0.02);
  g.box(1.0, 2.1, 0.14, r() < 0.5 ? '#2f5a74' : '#3d6b45', 0, 0.5 + 1.05, d / 2 + 0.04);
  // a little porch roof over the door
  slab(g, d / 2 + 1.0, 0.5 + 2.55, d / 2 - 0.05, 0.5 + 2.95, 1.9, 0.12, roof);
  // chimney
  const cx = w * (r() < 0.5 ? 0.22 : -0.22);
  g.box(0.62, 1.6, 0.62, '#e8e2d6', cx, y0 + rh * 0.7, -d * 0.12);
  g.box(0.74, 0.14, 0.74, '#4a4a4a', cx, y0 + rh * 0.7 + 0.82, -d * 0.12);
  return g.build();
}

/** The big red barn: gambrel roof, white trim, big doors with an X on the gable end (+x). */
export function barn(): THREE.BufferGeometry {
  const g = new Geo();
  const w = 22;
  const d = 12;
  const h = 6;
  const y0 = 0.4 + h;
  g.box(w + 0.4, 0.8, d + 0.4, STONE, 0, 0.2, 0);
  g.box(w, h, d, FALU, 0, 0.4 + h / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.36, h, 0.36, WHITE, (sx * w) / 2, 0.4 + h / 2, (sz * d) / 2);
  // gambrel profile
  const pz = [-d / 2 - 0.6, -d / 2 + 1.7, 0, d / 2 - 1.7, d / 2 + 0.6];
  const py = [y0 - 0.4, y0 + 3.4, y0 + 5.6, y0 + 3.4, y0 - 0.4];
  g.prism(
    [
      [-d / 2, y0, w / 2],
      [d / 2, y0, w / 2],
      [d / 2 - 1.62, y0 + 3.3, w / 2],
      [0, y0 + 5.45, w / 2],
      [-d / 2 + 1.62, y0 + 3.3, w / 2],
    ],
    FALU,
  );
  for (let k = 0; k < 4; k++) slab(g, pz[k]!, py[k]!, pz[k + 1]!, py[k + 1]!, w + 1.2, 0.3, '#34363b');
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) slab(g, pz[k]!, py[k]! - 0.05, pz[k + 1]!, py[k + 1]! - 0.05, 0.14, 0.34, WHITE, sx * (w / 2 + 0.62));
  // doors on the gable end with white frames and an X
  for (const dz of [-1.9, 1.9]) {
    g.box(0.14, 4.2, 3.6, '#7a2318', w / 2 + 0.05, 0.4 + 2.1, dz);
    g.box(0.18, 4.4, 0.2, WHITE, w / 2 + 0.08, 0.4 + 2.2, dz - 1.8);
    g.box(0.18, 4.4, 0.2, WHITE, w / 2 + 0.08, 0.4 + 2.2, dz + 1.8);
    g.box(0.18, 0.2, 3.8, WHITE, w / 2 + 0.08, 0.4 + 4.3, dz);
    g.box(0.18, 0.2, 3.8, WHITE, w / 2 + 0.08, 0.5, dz);
    const ang = Math.atan2(4.0, 3.4);
    g.box(0.16, 0.18, Math.hypot(4, 3.4), WHITE, w / 2 + 0.1, 0.4 + 2.2, dz, ang, 0, 0);
    g.box(0.16, 0.18, Math.hypot(4, 3.4), WHITE, w / 2 + 0.1, 0.4 + 2.2, dz, -ang, 0, 0);
  }
  // hay loft hatch
  g.box(0.14, 1.8, 1.8, '#7a2318', w / 2 + 0.05, y0 + 2.2, 0);
  g.box(0.16, 2.0, 2.0, WHITE, w / 2 + 0.03, y0 + 2.2, 0);
  // small windows along the long sides
  for (let x = -w / 2 + 2.5; x < w / 2 - 1; x += 4) {
    windowAt(g, x, 0.4 + h * 0.62, d / 2, 'z', 1, 0.9, 0.7);
    windowAt(g, x, 0.4 + h * 0.62, -d / 2, 'z', -1, 0.9, 0.7);
  }
  // a little white cupola on the ridge
  g.box(1.4, 1.3, 1.4, WHITE, 0, y0 + 5.9, 0);
  g.cone(1.2, 1.2, 4, '#34363b', 0, y0 + 7.1, 0, Math.PI / 4);
  return g.build();
}

/** A small red shed. */
export function shed(): THREE.BufferGeometry {
  return cottage(7, 4.2, 3.4, 2.4, '#3a3a3a');
}

/** A Swedish post mill: the body (sails separate, they turn). Faces +z; `hub` is where the sails sit. */
export function windmill(): { body: THREE.BufferGeometry; sails: THREE.BufferGeometry; hub: THREE.Vector3 } {
  const g = new Geo();
  g.cyl(3.0, 3.6, 1.0, 9, STONE, 0, 0.5, 0);
  g.box(0.7, 4.2, 0.7, '#5d4632', 0, 2.6, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    beam(g, new THREE.Vector3(Math.cos(a) * 2.6, 1.0, Math.sin(a) * 2.6), new THREE.Vector3(Math.cos(a) * 0.35, 3.6, Math.sin(a) * 0.35), 0.28, '#5d4632');
  }
  const y0 = 4.6;
  const red = '#a8442c';
  g.box(4.2, 5.2, 5.0, red, 0, y0 + 2.6, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.22, 5.2, 0.22, WHITE, sx * 2.1, y0 + 2.6, sz * 2.5);
  // the roof, ridge running front to back: built across x, then turned a quarter round
  const roof = new Geo();
  roof.prism(
    [
      [-2.1, y0 + 5.2, 2.5],
      [2.1, y0 + 5.2, 2.5],
      [0, y0 + 6.9, 2.5],
    ],
    red,
  );
  slab(roof, -2.5, y0 + 5.0, 0.02, y0 + 7.05, 5.6, 0.2, '#3a3433');
  slab(roof, 2.5, y0 + 5.0, -0.02, y0 + 7.05, 5.6, 0.2, '#3a3433');
  g.addColored(roof.build(), mat(0, 0, 0, 0, Math.PI / 2, 0));
  windowAt(g, 0, y0 + 3.4, 2.5, 'z', 1, 0.7, 0.8);
  g.box(1.0, 1.9, 0.12, '#5a2a1c', 0, y0 + 1.2, -2.52);
  // stairs / tail pole at the back
  beam(g, new THREE.Vector3(0, y0 + 0.4, -2.5), new THREE.Vector3(0, 0.3, -7.5), 0.3, '#5d4632');
  beam(g, new THREE.Vector3(0.7, y0 + 0.2, -2.5), new THREE.Vector3(0.7, 0.3, -6.5), 0.16, '#5d4632');
  beam(g, new THREE.Vector3(-0.7, y0 + 0.2, -2.5), new THREE.Vector3(-0.7, 0.3, -6.5), 0.16, '#5d4632');
  // the axle sticking out at the front
  g.cyl(0.35, 0.35, 1.2, 8, '#4a3a2a', 0, y0 + 4.4, 2.9, Math.PI / 2);
  // sails: four arms with lattice panels in the x–y plane round the hub
  const s = new Geo();
  s.cyl(0.55, 0.55, 0.5, 8, '#4a3a2a', 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) {
    const arm = new Geo();
    arm.box(0.26, 9.2, 0.22, '#5d4632', 0, 4.8, 0);
    arm.box(1.7, 7.0, 0.06, '#e9e2d0', 0.95, 5.6, 0.05);
    for (let j = 0; j < 7; j++) arm.box(1.8, 0.09, 0.12, '#6b5440', 0.95, 2.4 + j * 1.07, 0.1);
    arm.box(0.09, 7.0, 0.12, '#6b5440', 1.8, 5.6, 0.1);
    s.addColored(arm.build(), mat(0, 0, 0, 0, 0, (k * Math.PI) / 2));
  }
  return { body: g.build(), sails: s.build(), hub: new THREE.Vector3(0, y0 + 4.4, 3.4) };
}

/** Merge already-coloured geometries without recolouring them. */
export function mergeColored(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const colr = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3);
    colr.set(p.getAttribute('color').array as Float32Array, o * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  for (const p of parts) p.dispose();
  for (const g of gs) g.dispose();
  return out;
}

/** A jetty: planks on posts, starting at the shore (z = 0) going out along −z. */
export function jetty(len = 14, waterY = 0): THREE.BufferGeometry {
  const g = new Geo();
  const top = waterY + 0.7;
  for (let z = 0; z < len; z += 0.55) g.box(2.2, 0.1, 0.48, (Math.round(z / 0.55) & 1) === 0 ? '#a58463' : '#9a7a59', 0, top, -z - 0.25);
  for (let z = 1; z < len; z += 2.6) for (const sx of [-1, 1]) g.cyl(0.11, 0.11, 2.2, 6, '#5d4a38', sx * 1.0, top - 0.95, -z);
  g.box(0.12, 0.12, len, '#7a6248', 1.05, top - 0.12, -len / 2);
  g.box(0.12, 0.12, len, '#7a6248', -1.05, top - 0.12, -len / 2);
  // a little ladder at the end
  g.box(0.08, 1.2, 0.08, '#c0c0c0', 0.5, top - 0.5, -len - 0.05);
  g.box(0.08, 1.2, 0.08, '#c0c0c0', -0.1, top - 0.5, -len - 0.05);
  return g.build();
}

/** A small rowing boat (bow along +z). */
export function boat(): THREE.BufferGeometry {
  const g = new Geo();
  g.prism(
    [
      [-1.7, 0.05, 0.42],
      [1.3, 0.05, 0.3],
      [2.05, 0.55, 0.04],
      [-1.75, 0.55, 0.66],
    ],
    '#f0ede6',
  );
  g.box(1.28, 0.08, 0.36, '#9a7a59', 0, 0.42, -0.3);
  g.box(1.1, 0.08, 0.3, '#9a7a59', 0, 0.42, 0.7);
  g.prism(
    [
      [-1.76, 0.45, 0.68],
      [2.08, 0.45, 0.06],
      [2.08, 0.6, 0.06],
      [-1.76, 0.6, 0.68],
    ],
    '#b8392a',
  );
  return g.build();
}

/** A round bale wrapped in white plastic (or straw), lying on its side. */
export function roundBale(straw = false): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.78, 0.78, 1.25, 10, straw ? '#d9b65a' : '#f0f0ea', 0, 0.78, 0, 0, 0, Math.PI / 2);
  if (straw) for (const sx of [-1, 1]) g.cyl(0.6, 0.6, 0.04, 10, '#c49f45', sx * 0.63, 0.78, 0, 0, 0, Math.PI / 2);
  else g.cyl(0.79, 0.79, 0.12, 10, '#dfe8d6', 0, 0.78, 0, 0, 0, Math.PI / 2);
  return g.build();
}

/** Fence pieces, each `len` long along x, centred on the origin, standing on y = 0. */
export function fencePiece(kind: number): { geo: THREE.BufferGeometry; len: number } {
  const g = new Geo();
  if (kind === 1) {
    // roundpole fence (gärdesgård): a post pair and leaning poles (open four-sided rods: cheap)
    const len = 3.0;
    for (const sz of [-1, 1]) rod(g, new THREE.Vector3(-len / 2, 0, sz * 0.12), new THREE.Vector3(-len / 2, 1.45, sz * 0.12), 0.06, '#6e6250');
    for (let k = 0; k < 3; k++) {
      const x0 = -len / 2 + k * 1.0 - 0.3;
      rod(g, new THREE.Vector3(x0, 0.08, 0), new THREE.Vector3(x0 + 2.3, 1.3, 0), 0.075, k % 2 ? GREYWOOD : '#7d6f5a');
    }
    return { geo: g.build(), len };
  }
  if (kind === 2) {
    // straw bales
    const len = 2.4;
    g.box(2.3, 0.82, 1.05, '#e3c25e', 0, 0.41, 0);
    g.box(2.32, 0.84, 0.06, '#b8933c', 0, 0.41, -0.22);
    g.box(2.32, 0.84, 0.06, '#b8933c', 0, 0.41, 0.22);
    g.box(2.1, 0.8, 1.0, '#ecd070', 0.08, 1.2, 0.02);
    g.box(2.12, 0.82, 0.06, '#c29d42', 0.08, 1.2, -0.2);
    return { geo: g.build(), len };
  }
  if (kind === 3) {
    // the white bridge railing
    const len = 2.0;
    g.box(0.16, 1.15, 0.16, WHITE, -len / 2, 0.58, 0);
    g.box(len, 0.12, 0.1, WHITE, 0, 1.08, 0);
    g.box(len, 0.1, 0.08, WHITE, 0, 0.6, 0);
    return { geo: g.build(), len };
  }
  // stone wall (stenmur): tumbled boulders as tilted boxes
  const len = 2.6;
  const r = rng(91);
  for (let k = 0; k < 4; k++) {
    const x = -len / 2 + (k + 0.5) * (len / 4);
    const c = ['#8f8c84', '#7c7a74', '#9b978e', '#86827a'][k % 4]!;
    g.add(new THREE.BoxGeometry(0.62, 0.55, 0.7), c, mat(x, 0.3, (r() - 0.5) * 0.15, (r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5, 1, 0.9 + r() * 0.3, 1));
  }
  g.add(new THREE.BoxGeometry(0.5, 0.42, 0.55), '#93918a', mat(-0.55, 0.78, 0, 0.3, 0.6, 0.2));
  g.add(new THREE.BoxGeometry(0.45, 0.4, 0.5), '#7f7c75', mat(0.5, 0.74, 0.05, -0.2, 1.1, 0.3));
  return { geo: g.build(), len };
}

/** A pine (gran): brown trunk, three dark cones. About 9 m tall. */
export function pine(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.16, 0.28, 2.6, 6, '#5a3f2b', 0, 1.3, 0);
  g.cone(2.3, 3.6, 7, '#2c5530', 0, 3.5, 0);
  g.cone(1.8, 3.1, 7, '#32603a', 0, 5.3, 0, 0.4);
  g.cone(1.15, 2.7, 7, '#3a6c40', 0, 7.1, 0, 0.8);
  return g.build();
}

/** A birch (björk): white trunk with black bands, light green crown. About 8 m tall. */
export function birch(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.11, 0.17, 5.4, 6, '#ebe7dd', 0, 2.7, 0);
  for (const [y, h] of [
    [1.1, 0.13],
    [2.4, 0.1],
    [3.7, 0.12],
  ] as const) {
    const r = 0.172 - y * 0.012;
    g.add(new THREE.CylinderGeometry(r, r, h, 6, 1, true), '#2e2c2a', mat(0, y, 0));
  }
  g.ball(1.75, '#7fae45', 0, 5.6, 0, 1.0, 1.15, 1.0);
  g.ball(1.3, '#8dbb4e', 0.7, 6.7, 0.3, 1, 1.1, 1);
  g.ball(1.2, '#76a23f', -0.6, 4.9, -0.5, 1, 1, 1);
  return g.build();
}

/** A broad-leaved tree (ek / lönn): round dark crown. */
export function oak(): THREE.BufferGeometry {
  const g = new Geo();
  g.cyl(0.28, 0.42, 3.2, 7, '#5b4330', 0, 1.6, 0);
  g.ball(2.6, '#4f7f32', 0, 5.0, 0, 1.15, 0.9, 1.1);
  g.ball(1.9, '#5b8c38', 1.4, 5.8, 0.6, 1, 0.9, 1);
  g.ball(1.8, '#46742c', -1.3, 5.4, -0.7, 1, 0.9, 1);
  return g.build();
}

export function bush(): THREE.BufferGeometry {
  const g = new Geo();
  g.ball(1.0, '#4d7d33', 0, 0.6, 0, 1.3, 0.8, 1.1);
  g.ball(0.7, '#5a8c3a', 0.7, 0.75, 0.2, 1, 0.9, 1);
  return g.build();
}

export function rock(): THREE.BufferGeometry {
  const g = new Geo();
  g.add(new THREE.DodecahedronGeometry(1, 0), '#8e8c86', mat(0, 0.45, 0, 0.3, 0.2, 0.1, 1.2, 0.75, 1));
  return g.build();
}

// ---- animals (the head is separate so it can graze or cheer) ----

export interface Animal {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  /** Where the head is attached on the body. */
  neck: THREE.Vector3;
}

export function cow(red: boolean): Animal {
  const b = new Geo();
  const base = WHITE;
  const spot = red ? '#8a3a22' : '#232323';
  b.box(0.95, 0.85, 1.9, base, 0, 1.15, 0);
  b.box(0.97, 0.5, 0.6, spot, 0, 1.25, 0.35);
  b.box(0.97, 0.42, 0.5, spot, 0, 1.1, -0.55);
  b.box(0.5, 0.2, 0.62, spot, 0.24, 1.58, -0.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.2, 0.78, 0.22, sz > 0 ? base : spot, sx * 0.3, 0.39, sz * 0.7);
  b.box(0.36, 0.2, 0.36, '#f0a2a2', 0, 0.66, -0.45);
  b.box(0.08, 0.7, 0.08, base, 0, 1.1, -0.98);
  b.box(0.14, 0.18, 0.12, spot, 0, 0.72, -0.98);
  const h = new Geo();
  h.box(0.5, 0.5, 0.62, red ? '#8a3a22' : base, 0, 0, 0.25);
  h.box(0.46, 0.3, 0.2, '#e6a8a0', 0, -0.1, 0.62);
  h.box(0.36, 0.1, 0.18, '#a95f5a', 0, -0.06, 0.73);
  for (const sx of [-1, 1]) {
    h.box(0.26, 0.1, 0.14, spot, sx * 0.34, 0.14, 0.05);
    h.cone(0.06, 0.24, 5, '#efe6cf', sx * 0.17, 0.33, 0.1);
    h.box(0.08, 0.08, 0.04, '#111', sx * 0.17, 0.08, 0.57);
  }
  if (!red) h.box(0.3, 0.26, 0.05, '#232323', 0.08, 0.1, 0.565);
  return { body: b.build(), head: h.build(), neck: new THREE.Vector3(0, 1.4, 0.95) };
}

export function sheep(): Animal {
  const b = new Geo();
  b.ball(0.62, '#f2eee2', 0, 0.85, 0, 0.95, 0.82, 1.25, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.5, 0.12, '#2a2622', sx * 0.25, 0.25, sz * 0.42);
  const h = new Geo();
  h.box(0.3, 0.34, 0.42, '#2a2622', 0, 0, 0.18);
  h.ball(0.24, '#f2eee2', 0, 0.16, 0.05, 1, 0.7, 1, 0);
  for (const sx of [-1, 1]) h.box(0.2, 0.08, 0.1, '#2a2622', sx * 0.2, 0.06, 0.05);
  for (const sx of [-1, 1]) h.box(0.05, 0.05, 0.03, '#f6e7a0', sx * 0.09, 0.05, 0.39);
  return { body: b.build(), head: h.build(), neck: new THREE.Vector3(0, 1.02, 0.62) };
}

export function pig(): Animal {
  const b = new Geo();
  b.box(0.72, 0.64, 1.2, '#f2a8b0', 0, 0.62, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.16, 0.34, 0.16, '#e4949e', sx * 0.22, 0.17, sz * 0.42);
  b.box(0.06, 0.06, 0.2, '#e4949e', 0, 0.82, -0.66);
  const h = new Geo();
  h.box(0.5, 0.46, 0.4, '#f2a8b0', 0, 0, 0.15);
  h.cyl(0.13, 0.13, 0.14, 8, '#e88c98', 0, -0.04, 0.4, Math.PI / 2);
  for (const sx of [-1, 1]) {
    h.box(0.03, 0.05, 0.02, '#8a4450', sx * 0.05, -0.04, 0.475);
    h.box(0.16, 0.06, 0.14, '#e4949e', sx * 0.17, 0.25, 0.1, 0.4, 0, sx * 0.3);
    h.box(0.06, 0.06, 0.03, '#111', sx * 0.13, 0.08, 0.35);
  }
  return { body: b.build(), head: h.build(), neck: new THREE.Vector3(0, 0.7, 0.62) };
}

export function hen(): Animal {
  const b = new Geo();
  b.ball(0.24, '#f7f3ea', 0, 0.36, 0, 1, 0.9, 1.25);
  b.box(0.06, 0.24, 0.16, '#f7f3ea', 0, 0.52, -0.26, -0.5, 0, 0);
  for (const sx of [-1, 1]) b.box(0.03, 0.18, 0.03, '#e8a530', sx * 0.08, 0.1, 0);
  const h = new Geo();
  h.ball(0.12, '#f7f3ea', 0, 0.02, 0.02);
  h.box(0.04, 0.1, 0.14, '#e0301e', 0, 0.14, 0.0);
  h.cone(0.04, 0.12, 4, '#f2b233', 0, -0.02, 0.15, 0);
  h.box(0.03, 0.08, 0.04, '#e0301e', 0, -0.1, 0.1);
  return { body: b.build(), head: h.build(), neck: new THREE.Vector3(0, 0.62, 0.18) };
}

export function horse(): Animal {
  const b = new Geo();
  const c = '#7a4a2a';
  b.box(0.7, 0.85, 2.0, c, 0, 1.55, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.18, 1.15, 0.2, c, sx * 0.24, 0.6, sz * 0.75);
    b.box(0.2, 0.18, 0.22, '#2a1c14', sx * 0.24, 0.08, sz * 0.75);
  }
  b.box(0.12, 0.9, 0.14, '#2a1c14', 0, 1.35, -1.08, 0.3, 0, 0);
  const h = new Geo();
  h.box(0.36, 1.0, 0.45, c, 0, 0.25, 0.05, 0.5, 0, 0);
  h.box(0.34, 0.36, 0.7, c, 0, 0.72, 0.42);
  h.box(0.1, 0.22, 0.4, '#f1ede4', 0, 0.86, 0.5);
  h.box(0.1, 0.5, 0.7, '#2a1c14', 0, 0.55, -0.12, 0.5, 0, 0);
  for (const sx of [-1, 1]) h.box(0.08, 0.2, 0.08, c, sx * 0.12, 1.0, 0.25);
  return { body: b.build(), head: h.build(), neck: new THREE.Vector3(0, 1.85, 0.95) };
}

/** A spectator: `shirt` (white, tinted per person) and `rest` (legs, head, hair). Arms up, cheering. */
export function person(): { shirt: THREE.BufferGeometry; rest: THREE.BufferGeometry } {
  const s = new Geo();
  s.cyl(0.2, 0.24, 0.7, 6, '#ffffff', 0, 1.12, 0);
  s.box(0.12, 0.62, 0.12, '#ffffff', -0.3, 1.62, 0, 0, 0, 0.45);
  s.box(0.12, 0.62, 0.12, '#ffffff', 0.3, 1.62, 0, 0, 0, -0.45);
  const r = new Geo();
  r.box(0.38, 0.78, 0.24, '#3c4e78', 0, 0.39, 0);
  r.sphere(0.17, '#f0c8a0', 0, 1.64, 0, 1, 1.08, 1, 6, 4);
  r.sphere(0.175, '#6b4a2a', 0, 1.7, -0.03, 1, 0.75, 1, 6, 3);
  r.box(0.1, 0.1, 0.1, '#f0c8a0', -0.47, 1.95, 0);
  r.box(0.1, 0.1, 0.1, '#f0c8a0', 0.47, 1.95, 0);
  return { shirt: s.build(), rest: r.build() };
}

// ---- the cars ----

export type Driver = 'human' | 'cow' | 'pig' | 'sheep' | 'rooster' | 'horse';

/** The driver's head, seen through the windows. */
function driverHead(kind: Driver, color: string): THREE.BufferGeometry {
  const g = new Geo();
  switch (kind) {
    case 'human':
      g.sphere(0.2, '#f4f4f4', 0, 0, 0, 1, 1.05, 1.1, 10, 8);
      g.box(0.42, 0.08, 0.3, color, 0, 0.1, 0);
      g.box(0.36, 0.12, 0.1, '#1d2433', 0, -0.02, 0.19);
      break;
    case 'cow':
      g.box(0.34, 0.32, 0.38, WHITE, 0, 0, 0.02);
      g.box(0.3, 0.18, 0.12, '#e6a8a0', 0, -0.08, 0.24);
      g.box(0.18, 0.14, 0.05, '#232323', 0.06, 0.08, 0.2);
      for (const sx of [-1, 1]) {
        g.box(0.16, 0.06, 0.08, '#232323', sx * 0.24, 0.08, 0);
        g.cone(0.04, 0.14, 4, '#efe6cf', sx * 0.11, 0.21, 0);
      }
      break;
    case 'pig':
      g.box(0.36, 0.32, 0.32, '#f2a8b0', 0, 0, 0);
      g.cyl(0.09, 0.09, 0.08, 8, '#e88c98', 0, -0.03, 0.2, Math.PI / 2);
      for (const sx of [-1, 1]) g.box(0.1, 0.04, 0.09, '#e4949e', sx * 0.12, 0.18, 0.05, 0.4, 0, sx * 0.3);
      break;
    case 'sheep':
      g.box(0.24, 0.28, 0.32, '#2a2622', 0, -0.02, 0.05);
      g.ball(0.2, '#f2eee2', 0, 0.12, -0.02, 1.1, 0.75, 1.1, 0);
      for (const sx of [-1, 1]) g.box(0.14, 0.05, 0.07, '#2a2622', sx * 0.16, 0.02, 0);
      break;
    case 'rooster':
      g.ball(0.17, '#f7f3ea', 0, 0, 0);
      g.box(0.05, 0.14, 0.2, '#e0301e', 0, 0.2, 0);
      g.cone(0.05, 0.14, 4, '#f2b233', 0, -0.02, 0.2);
      g.box(0.04, 0.1, 0.05, '#e0301e', 0, -0.13, 0.12);
      break;
    case 'horse':
      g.box(0.26, 0.3, 0.46, '#7a4a2a', 0, 0, 0.08);
      g.box(0.08, 0.16, 0.3, '#f1ede4', 0, 0.06, 0.16);
      g.box(0.08, 0.2, 0.3, '#2a1c14', 0, 0.16, -0.12);
      for (const sx of [-1, 1]) g.box(0.05, 0.12, 0.05, '#7a4a2a', sx * 0.08, 0.22, 0.02);
      break;
  }
  return g.build();
}

export interface CarModel {
  root: THREE.Group;
  /** Pitched and rolled by the suspension. */
  body: THREE.Group;
  wheels: THREE.Group[];
  brakeMat: THREE.MeshBasicMaterial;
  paint: THREE.MeshStandardMaterial;
  shadow: THREE.Mesh;
  /** Show the car's damage 0..100: dents, dirt, a cracked window, a loose bumper; smoke is the game's job. */
  setDamage(d: number): void;
  /** Night: headlights, tail lights and the underglow on. */
  setNight(on: boolean): void;
  /** Nitro burning (0 off .. 1 full): exhaust flames glow. */
  setNitro(k: number): void;
  /** Where the headlights are, in the car's frame (the game adds its own lights there). */
  headlights: THREE.Vector3[];
  dispose(): void;
}

/** Everything that decides how a car looks. */
export interface CarModelOpts {
  body: CarBody;
  style: CarStyle;
  /** The computer cars' animal faces override the style's driver. */
  driver?: CarDriver;
  shadowTex: THREE.Texture;
  envMap: THREE.Texture | null;
  /** 'low' leaves out the small bits. */
  quality?: 'high' | 'low';
}

/** A car for a body and a style, front along +z. The arcade default is the red hatchback. */
export function carModel(opts: CarModelOpts): CarModel {
  const style = opts.style ?? defaultStyle();
  const who = opts.driver ?? style.driver;
  const face: Driver = who === 'dog' || who === 'cat' ? 'human' : who;
  const m = carModelLegacy(style.paint, face, style.number, opts.shadowTex, opts.envMap);
  const sz = CAR_BODY_DEFS[opts.body]?.size ?? 1;
  if (sz !== 1) m.root.scale.setScalar(sz);
  return m;
}

/** The old look: a colour, a driver and a number. Kept for the quick arcade race; carModel is the real one. */
export function carModelFromColor(color: string, driver: Driver, num: number, shadowTex: THREE.Texture, envMap: THREE.Texture | null): CarModel {
  return carModel({ body: 'hatch', style: { ...defaultStyle(color), number: num }, driver: driver as CarDriver, shadowTex, envMap });
}

/** Wheel positions (x, z) in the car's frame: front axle at +1.15, rear at −1.35. */
export const WHEELS: [number, number][] = [
  [0.8, 1.15],
  [-0.8, 1.15],
  [0.8, -1.35],
  [-0.8, -1.35],
];
export const WHEEL_R = 0.34;

/** A little rally hatchback in `color`, front along +z, with a driver and a number on the doors. */
function carModelLegacy(color: string, driver: Driver, num: number, shadowTex: THREE.Texture, envMap: THREE.Texture | null): CarModel {
  const disposables: { dispose(): void }[] = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = new THREE.Color(color);
  const dark = '#1c1d22';
  const g = new Geo();
  // lower body
  g.prism(
    [
      [2.02, 0.3, 0.9],
      [2.06, 0.62, 0.88],
      [1.88, 0.8, 0.86],
      [0.78, 0.93, 0.88],
      [-1.62, 0.97, 0.88],
      [-2.0, 0.92, 0.86],
      [-2.04, 0.34, 0.9],
      [-1.8, 0.24, 0.88],
      [1.8, 0.24, 0.88],
    ],
    color,
  );
  // cabin glass and roof
  g.prism(
    [
      [0.8, 0.9, 0.82],
      [0.05, 1.36, 0.7],
      [-1.02, 1.36, 0.7],
      [-1.62, 0.95, 0.82],
    ],
    GLASS,
  );
  g.box(1.44, 0.07, 1.06, color, 0, 1.385, -0.48);
  // pillars
  for (const sx of [-1, 1]) {
    g.box(0.06, 0.48, 0.1, color, sx * 0.76, 1.14, -0.42);
    beam(g, new THREE.Vector3(sx * 0.79, 0.93, 0.78), new THREE.Vector3(sx * 0.71, 1.37, 0.06), 0.07, color);
    beam(g, new THREE.Vector3(sx * 0.79, 0.97, -1.6), new THREE.Vector3(sx * 0.71, 1.37, -1.0), 0.09, color);
  }
  // bumpers, grille, sills
  g.box(1.86, 0.2, 0.16, dark, 0, 0.36, 2.04);
  g.box(1.86, 0.2, 0.16, dark, 0, 0.38, -2.06);
  g.box(0.9, 0.16, 0.06, '#2a2c33', 0, 0.62, 2.07);
  for (const sx of [-1, 1]) g.box(0.06, 0.12, 2.2, dark, sx * 0.9, 0.3, -0.1);
  // wheel arches (dark, slightly flared)
  for (const [wx, wz] of WHEELS) g.box(0.1, 0.22, 0.95, dark, Math.sign(wx) * 0.92, 0.62, wz);
  // rear wing, mirrors, mud flaps
  g.box(1.6, 0.06, 0.38, color, 0, 1.18, -1.86);
  for (const sx of [-1, 1]) {
    g.box(0.06, 0.2, 0.18, dark, sx * 0.62, 1.06, -1.78);
    g.box(0.16, 0.1, 0.12, color, sx * 0.97, 0.98, 0.62);
    g.box(0.24, 0.24, 0.03, dark, sx * 0.8, 0.22, -1.85);
    g.box(0.24, 0.24, 0.03, dark, sx * 0.8, 0.22, 0.62);
  }
  // exhaust
  g.cyl(0.05, 0.05, 0.2, 6, '#555', -0.5, 0.28, -2.12, Math.PI / 2);
  // a white stripe over the bonnet and roof
  const stripe = c.getHSL({ h: 0, s: 0, l: 0 }).l > 0.7 ? '#20232b' : '#f4f4f0';
  g.box(0.3, 0.02, 1.15, stripe, 0, 0.865, 1.38, Math.atan2(0.13, 1.1), 0, 0);
  g.box(0.3, 0.02, 1.07, stripe, 0, 1.425, -0.48);
  const geo = g.build();
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15, flatShading: true, envMap, envMapIntensity: 0.9 });
  const bodyMesh = new THREE.Mesh(geo, paint);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);
  disposables.push(geo, paint);

  // lights (unlit)
  const lg = new Geo();
  for (const sx of [-1, 1]) {
    lg.box(0.36, 0.14, 0.04, '#fff4cc', sx * 0.6, 0.7, 2.065);
    lg.cyl(0.11, 0.11, 0.06, 8, '#fff2a8', sx * 0.32, 0.46, 2.12, Math.PI / 2);
  }
  const lgeo = lg.build();
  const lmat = new THREE.MeshBasicMaterial({ vertexColors: true });
  body.add(new THREE.Mesh(lgeo, lmat));
  disposables.push(lgeo, lmat);
  const tg = new Geo();
  for (const sx of [-1, 1]) tg.box(0.34, 0.14, 0.04, '#ffffff', sx * 0.64, 0.74, -2.045);
  const tgeo = tg.build();
  const brakeMat = new THREE.MeshBasicMaterial({ color: '#7a1410' });
  body.add(new THREE.Mesh(tgeo, brakeMat));
  disposables.push(tgeo, brakeMat);

  // the driver
  const hgeo = driverHead(driver, color);
  const hmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const head = new THREE.Mesh(hgeo, hmat);
  head.position.set(0.36, 1.08, -0.38);
  body.add(head);
  disposables.push(hgeo, hmat);

  // number roundels on the doors
  const numTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(32, 32, 30, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#15171c';
    x.font = 'bold 40px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(num), 32, 35);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const numMat = new THREE.MeshLambertMaterial({ map: numTex, transparent: true });
  const numGeo = new THREE.PlaneGeometry(0.5, 0.5);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(numGeo, numMat);
    m.position.set(sx * 0.895, 0.62, -0.2);
    m.rotation.y = (sx * Math.PI) / 2;
    body.add(m);
  }
  disposables.push(numTex, numMat, numGeo);

  // wheels: tyre, rim and spokes so you can see them turn
  const wg = new Geo();
  wg.cyl(WHEEL_R, WHEEL_R, 0.26, 12, '#1b1b1d', 0, 0, 0, 0, 0, Math.PI / 2);
  wg.cyl(0.2, 0.2, 0.27, 10, '#c9ccd2', 0, 0, 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 3; k++) wg.box(0.28, 0.06, 0.38, '#7b7f88', 0, 0, 0, (k * Math.PI) / 3, 0, 0);
  const wgeo = wg.build();
  const wmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, flatShading: true });
  disposables.push(wgeo, wmat);
  const wheels: THREE.Group[] = [];
  for (const [wx, wz] of WHEELS) {
    const steer = new THREE.Group();
    steer.position.set(wx, WHEEL_R, wz);
    const spin = new THREE.Mesh(wgeo, wmat);
    spin.castShadow = true;
    steer.add(spin);
    root.add(steer);
    wheels.push(steer);
  }

  const sgeo = new THREE.PlaneGeometry(2.5, 4.7);
  sgeo.rotateX(-Math.PI / 2);
  const smat = new THREE.MeshBasicMaterial({ map: shadowTex, color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const shadow = new THREE.Mesh(sgeo, smat);
  shadow.renderOrder = 1;
  disposables.push(sgeo, smat);

  return {
    root,
    body,
    wheels,
    brakeMat,
    paint,
    shadow,
    setDamage: () => {},
    setNight: () => {},
    setNitro: () => {},
    headlights: [new THREE.Vector3(0.6, 0.62, 2.05), new THREE.Vector3(-0.6, 0.62, 2.05)],
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/** The start/finish gantry spanning `span` metres: two lattice towers, a beam with a banner and four lights. */
export function gantry(span: number): { frame: THREE.BufferGeometry; lightPos: THREE.Vector3[]; bannerY: number } {
  const g = new Geo();
  const H = 7.2;
  for (const sx of [-1, 1]) {
    const x = (sx * span) / 2;
    for (const dx of [-0.45, 0.45]) for (const dz of [-0.45, 0.45]) g.box(0.14, H, 0.14, '#d9dde3', x + dx, H / 2, dz);
    for (let y = 0.8; y < H; y += 1.2) {
      g.box(1.0, 0.08, 0.08, '#c3c8cf', x, y, -0.45);
      g.box(1.0, 0.08, 0.08, '#c3c8cf', x, y, 0.45);
      g.box(0.08, 0.08, 1.0, '#c3c8cf', x - 0.45, y, 0);
      g.box(0.08, 0.08, 1.0, '#c3c8cf', x + 0.45, y, 0);
    }
    g.box(1.3, 0.3, 1.3, '#6c727a', x, 0.15, 0);
  }
  // the beam (a box truss)
  g.box(span + 1.2, 0.18, 0.18, '#d9dde3', 0, H - 0.1, -0.45);
  g.box(span + 1.2, 0.18, 0.18, '#d9dde3', 0, H - 0.1, 0.45);
  g.box(span + 1.2, 0.18, 0.18, '#d9dde3', 0, H + 1.6, -0.45);
  g.box(span + 1.2, 0.18, 0.18, '#d9dde3', 0, H + 1.6, 0.45);
  // light housing in the middle; the lights face −z, where the cars come from, lit from the driver's left
  g.box(4.6, 1.1, 0.5, '#22252b', 0, H + 0.75, 0);
  const lightPos: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) lightPos.push(new THREE.Vector3(1.65 - k * 1.1, H + 0.75, -0.27));
  return { frame: g.build(), lightPos, bannerY: H + 0.75 };
}
