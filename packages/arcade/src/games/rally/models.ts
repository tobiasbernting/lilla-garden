// Low-poly models for the countryside round the circuit: red cottages, the barn, the windmill, trees,
// animals, spectators, fences and the cars. Every model is one vertex-coloured geometry (or a few).
import * as THREE from 'three';
import { CAR_BODY_DEFS, defaultStyle, type CarBody, type CarDriver, type CarSpoiler, type CarStyle, type CarWheels, type DecalSlot } from '@lilla-garden/shared';
import { Geo, mat } from './geo.ts';
import { ATLAS, paintCar, paintCrack, paintDamage, paintPlate, REGION_KIND, type DecalSpot, type PaintLayout, type Region, type RegionSizes } from './style.ts';
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

/** Who drives: you or a farm animal (the computer cars' faces). */
export type Driver = CarDriver;

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
    case 'dog':
      g.box(0.3, 0.28, 0.3, '#c8925a', 0, 0, 0);
      g.box(0.18, 0.14, 0.16, '#e9c9a0', 0, -0.06, 0.2);
      g.box(0.07, 0.06, 0.05, '#1e1a18', 0, -0.01, 0.29);
      for (const sx of [-1, 1]) {
        g.box(0.07, 0.22, 0.12, '#7a5030', sx * 0.18, -0.02, -0.02, 0, 0, sx * 0.25);
        g.box(0.05, 0.05, 0.02, '#1e1a18', sx * 0.08, 0.06, 0.155);
      }
      g.box(0.06, 0.03, 0.08, '#e85a70', 0.02, -0.15, 0.24);
      break;
    case 'cat':
      g.box(0.32, 0.26, 0.28, '#f0a050', 0, 0, 0);
      g.box(0.14, 0.08, 0.06, '#fbe3c8', 0, -0.07, 0.15);
      g.box(0.05, 0.035, 0.03, '#e8708a', 0, -0.03, 0.18);
      for (const sx of [-1, 1]) {
        g.cone(0.07, 0.14, 4, '#f0a050', sx * 0.1, 0.19, 0, Math.PI / 4);
        g.box(0.05, 0.06, 0.02, '#2a6a3a', sx * 0.07, 0.04, 0.145);
        g.box(0.12, 0.008, 0.008, '#ffffff', sx * 0.15, -0.06, 0.16);
      }
      g.box(0.3, 0.04, 0.29, '#c8742c', 0, 0.09, 0);
      break;
  }
  return g.build();
}

export interface CarModel {
  root: THREE.Group;
  /** Pitched and rolled by the suspension. */
  body: THREE.Group;
  /** Front left, front right, rear left, rear right; children[0] of each spins. */
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
  /** This body's wheels (x, z) in the car's frame, in the order of `wheels` (WHEELS is the hatchback's). */
  wheelPos: [number, number][];
  /** Height of the wheel groups' centres above the ground (WHEEL_R is the hatchback's). */
  wheelR: number;
  /** Each wheel's own radius (the buggy's rear tyres are bigger; their spin centre is offset inside the group). */
  wheelRadii: number[];
  /** Exhaust pipe tips in the car's frame (smoke and nitro flames come from here). */
  exhausts: THREE.Vector3[];
  /** Where the driver's eyes are, for an in-car camera. */
  eye: THREE.Vector3;
  /** Half width, front and back (z) and roof height of the body, in the car's frame. */
  extent: { halfW: number; front: number; back: number; top: number };
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

/** Wheel positions (x, z) of the hatchback in the car's frame: front axle at +1.15, rear at −1.35. */
export const WHEELS: [number, number][] = [
  [0.8, 1.15],
  [-0.8, 1.15],
  [0.8, -1.35],
  [-0.8, -1.35],
];
export const WHEEL_R = 0.34;

/** The old look: a colour, a driver and a number on the red hatchback. Kept for the quick arcade race. */
export function carModelFromColor(color: string, driver: Driver, num: number, shadowTex: THREE.Texture, envMap: THREE.Texture | null): CarModel {
  // the old white (or dark, on a pale car) rally stripe over the bonnet and roof
  const paint2 = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l > 0.7 ? '#20232b' : '#f4f4f0';
  return carModel({ body: 'hatch', style: { ...defaultStyle(color), paint2, livery: 'stripe', number: num }, driver, shadowTex, envMap });
}

// ---- the painted body: geometry with UVs into the paint atlas (style.ts) ----

type V3 = [number, number, number];
interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
type Classify = (nx: number, ny: number, nz: number, cx: number, cy: number, cz: number) => Region;
const PLAIN: Classify = () => 'plain';

/** Collects the painted panels; each triangle is tagged with a region and gets planar UVs at build time. */
class PaintGeo {
  private pos: number[] = [];
  private regs: Region[] = [];
  bounds = new Map<Region, Bounds>();

  add(geo: THREE.BufferGeometry, m?: THREE.Matrix4, classify: Classify = PLAIN): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (m) g.applyMatrix4(m);
    const p = g.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i + 2 < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const n = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
      this.regs.push(classify(n.x, n.y, n.z, (a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3));
      this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, classify: Classify = PLAIN, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), mat(x, y, z, rx, ry, rz), classify);
  }

  /** Where a point lands in its region, as fractions (canvas x right, canvas y down). */
  project(r: Region, x: number, y: number, z: number): [number, number] {
    const b = this.bounds.get(r);
    if (!b) return [0.5, 0.5];
    const f = (v: number, lo: number, hi: number): number => (hi - lo < 1e-6 ? 0.5 : (v - lo) / (hi - lo));
    switch (REGION_KIND[r]) {
      case 'sideP':
        return [1 - f(z, b.z0, b.z1), 1 - f(y, b.y0, b.y1)];
      case 'sideN':
        return [f(z, b.z0, b.z1), 1 - f(y, b.y0, b.y1)];
      case 'top':
        return [1 - f(x, b.x0, b.x1), 1 - f(z, b.z0, b.z1)];
      case 'end':
        return r === 'back' ? [1 - f(x, b.x0, b.x1), 1 - f(y, b.y0, b.y1)] : [f(x, b.x0, b.x1), 1 - f(y, b.y0, b.y1)];
      default:
        return [0.5, 0.5];
    }
  }

  /** Metres covered along canvas x and y, per region (for the painter). */
  sizes(): RegionSizes {
    const out: RegionSizes = {};
    for (const [r, b] of this.bounds) {
      const k = REGION_KIND[r];
      const w = k === 'sideP' || k === 'sideN' ? b.z1 - b.z0 : b.x1 - b.x0;
      const h = k === 'top' ? b.z1 - b.z0 : b.y1 - b.y0;
      out[r] = { w: Math.max(0.05, w), h: Math.max(0.05, h) };
    }
    return out;
  }

  build(): THREE.BufferGeometry {
    this.bounds.clear();
    for (let t = 0; t < this.regs.length; t++) {
      const r = this.regs[t]!;
      let b = this.bounds.get(r);
      if (!b) this.bounds.set(r, (b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity }));
      for (let k = 0; k < 3; k++) {
        const i = (t * 3 + k) * 3;
        const x = this.pos[i]!;
        const y = this.pos[i + 1]!;
        const z = this.pos[i + 2]!;
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y);
        b.y1 = Math.max(b.y1, y);
        b.z0 = Math.min(b.z0, z);
        b.z1 = Math.max(b.z1, z);
      }
    }
    const uv = new Float32Array((this.pos.length / 3) * 2);
    const inset = 0.012;
    for (let t = 0; t < this.regs.length; t++) {
      const r = this.regs[t]!;
      const [fx, fy, fw, fh] = ATLAS[r];
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k;
        const [cx, cy] = this.project(r, this.pos[v * 3]!, this.pos[v * 3 + 1]!, this.pos[v * 3 + 2]!);
        uv[v * 2] = fx + fw * (inset + cx * (1 - 2 * inset));
        uv[v * 2 + 1] = 1 - (fy + fh * (inset + cy * (1 - 2 * inset)));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * A side profile (z, y, halfWidth) extruded and mirrored across x = 0, like Geo.prism, with long edges
 * split so the body has vertices to dent.
 */
function profileGeo(raw: V3[], step = 0.45): THREE.BufferGeometry {
  const pts: V3[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]!;
    const q = raw[(i + 1) % raw.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  const pos: number[] = [];
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const ccw = area > 0;
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map(([z, y]) => new THREE.Vector2(z, y)),
    [],
  );
  const a3 = new THREE.Vector3();
  const b3 = new THREE.Vector3();
  const c3 = new THREE.Vector3();
  const n3 = new THREE.Vector3();
  const tri = (a: number[], b: number[], c: number[], ox: number, oy: number, oz: number): void => {
    a3.fromArray(a);
    b3.fromArray(b);
    c3.fromArray(c);
    n3.subVectors(c3, b3).cross(a3.clone().sub(b3));
    if (n3.x * ox + n3.y * oy + n3.z * oz > 0) pos.push(...a, ...b, ...c);
    else pos.push(...a, ...c, ...b);
  };
  for (const t of tris) {
    const P = (k: number, sx: number): number[] => [sx * pts[k]![2], pts[k]![1], pts[k]![0]];
    tri(P(t[0]!, 1), P(t[1]!, 1), P(t[2]!, 1), 1, 0, 0);
    tri(P(t[0]!, -1), P(t[1]!, -1), P(t[2]!, -1), -1, 0, 0);
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const r = pts[(i + 1) % pts.length]!;
    // outward normal of the edge in the (z, y) plane
    const dz = r[0] - p[0];
    const dy = r[1] - p[1];
    const oz = ccw ? dy : -dy;
    const oy = ccw ? -dz : dz;
    const q0 = [p[2], p[1], p[0]];
    const q1 = [-p[2], p[1], p[0]];
    const q2 = [-r[2], r[1], r[0]];
    const q3 = [r[2], r[1], r[0]];
    tri(q0, q1, q2, 0, oy, oz);
    tri(q0, q2, q3, 0, oy, oz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Sorts a profile body's faces into the atlas: sides to the doors, the top to bonnet/deck, ends, underside. */
function bodyClassify(hoodZ: number, deckZ: number): Classify {
  return (nx, ny, nz, _cx, _cy, cz) => {
    if (nx > 0.7) return 'doorP';
    if (nx < -0.7) return 'doorN';
    if (ny < -0.5) return 'dark';
    if (ny > 0.5) return cz > hoodZ ? 'hood' : cz < deckZ ? 'deck' : 'dark';
    return nz > 0 ? 'front' : 'back';
  };
}
const roofClassify: Classify = (_nx, ny) => (ny > 0.7 ? 'roof' : 'plain');

// ---- body specs ----

interface WheelSpec {
  x: number;
  z: number;
  r: number;
  w: number;
}
interface Spot {
  region: Region;
  p: V3;
  size: number;
}
interface Mount {
  y: number;
  z: number;
  w: number;
}

/** What one body tells the shared builder: where everything goes (design units, before CAR_BODY_DEFS.size). */
interface BodySpec {
  wheels: WheelSpec[];
  halfW: number;
  nose: number;
  tail: number;
  sill: number;
  /** Height of the shoulder line (top of the doors), for dents and sideskirts. */
  belt: number;
  roof: { y: number; z0: number; z1: number; w: number };
  /** Spoilers: `lip` at the top rear edge (roof or boot), `deck` low at the tail for the tall wing. */
  lip: Mount;
  deck: Mount;
  head: V3;
  /** Headlight lens centres on the +x side (mirrored). */
  lamps: V3[];
  /** Tail light centre on the +x side, and the lens size. */
  tails: { p: V3; w: number; h: number };
  pipe: V3;
  plate: V3;
  bumper: { y: number; z: number; w: number; h: number };
  screen: { z0: number; y0: number; z1: number; y1: number; hw: number };
  spots: Record<DecalSlot, Spot>;
  numberSpot: Spot;
  eye: V3;
  /** Front wheel arch for the snorkel: x of the −x side, y of the arch top. */
  snorkel: { x: number; y: number; z: number; top: number; zTop: number };
  open?: boolean;
}

interface Parts {
  pg: PaintGeo;
  /** Dark trim, chrome, tyres of the frame… (vertex colours). */
  tg: Geo;
  glass: Geo;
  /** Headlight and lightbar lenses (glow at night). */
  lamp: Geo;
  /** Tail light lenses (the game turns them up when braking). */
  brake: Geo;
  style: CarStyle;
  hi: boolean;
}

const DARK = '#1c1d22';
const CHROME = '#c9ccd2';
const GLASS_CAR = '#2a3a55';

function arches(t: Geo, wheels: WheelSpec[], y: number, halfW: number, flare = 0.1): void {
  for (const w of wheels) {
    const sx = Math.sign(w.x);
    t.box(flare, 0.2, w.r * 2.8, DARK, sx * (halfW + flare / 2 - 0.02), y, w.z);
    t.box(flare + 0.06, 0.07, w.r * 2.4, DARK, sx * (halfW + flare / 2 - 0.02), y + 0.12, w.z);
  }
}

function hatch(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake, hi } = P;
  const wheels: WheelSpec[] = WHEELS.map(([x, z]) => ({ x, z, r: WHEEL_R, w: 0.26 }));
  pg.add(
    profileGeo([
      [2.02, 0.3, 0.9],
      [2.06, 0.62, 0.88],
      [1.88, 0.8, 0.86],
      [0.78, 0.93, 0.88],
      [-1.62, 0.97, 0.88],
      [-2.0, 0.92, 0.86],
      [-2.04, 0.34, 0.9],
      [-1.8, 0.24, 0.88],
      [1.8, 0.24, 0.88],
    ]),
    undefined,
    bodyClassify(0.78, -1.62),
  );
  glass.prism([
    [0.8, 0.9, 0.82],
    [0.05, 1.36, 0.7],
    [-1.02, 1.36, 0.7],
    [-1.62, 0.95, 0.82],
  ], GLASS_CAR);
  pg.box(1.44, 0.07, 1.06, 0, 1.385, -0.48, roofClassify);
  for (const sx of [-1, 1]) {
    pg.box(0.06, 0.48, 0.1, sx * 0.76, 1.14, -0.42);
    const a = new THREE.Vector3(sx * 0.79, 0.93, 0.78);
    const b = new THREE.Vector3(sx * 0.71, 1.37, 0.06);
    pg.add(beamGeo(a, b, 0.07));
    pg.add(beamGeo(new THREE.Vector3(sx * 0.79, 0.97, -1.6), new THREE.Vector3(sx * 0.71, 1.37, -1.0), 0.09));
    if (hi) pg.box(0.16, 0.1, 0.12, sx * 0.97, 0.98, 0.62);
  }
  tg.box(1.86, 0.2, 0.16, DARK, 0, 0.36, 2.04);
  tg.box(0.9, 0.16, 0.06, '#2a2c33', 0, 0.62, 2.07);
  for (const sx of [-1, 1]) tg.box(0.06, 0.12, 2.2, DARK, sx * 0.9, 0.3, -0.1);
  arches(tg, wheels, 0.56, 0.9);
  if (hi) for (const sx of [-1, 1]) for (const z of [-1.85, 0.62]) tg.box(0.24, 0.24, 0.03, DARK, sx * 0.8, 0.22, z);
  for (const sx of [-1, 1]) {
    lamp.box(0.36, 0.14, 0.04, '#fff4cc', sx * 0.6, 0.7, 2.065);
    lamp.cyl(0.11, 0.11, 0.06, 8, '#fff2a8', sx * 0.32, 0.46, 2.12, Math.PI / 2);
    brake.box(0.34, 0.14, 0.04, '#ffffff', sx * 0.64, 0.74, -2.045);
  }
  return {
    wheels,
    halfW: 0.9,
    nose: 2.1,
    tail: -2.08,
    sill: 0.26,
    belt: 0.93,
    roof: { y: 1.42, z0: 0.02, z1: -1.0, w: 1.4 },
    lip: { y: 1.42, z: -1.0, w: 1.4 },
    deck: { y: 0.95, z: -1.86, w: 1.5 },
    head: [0.36, 1.08, -0.38],
    lamps: [[0.6, 0.7, 2.08]],
    tails: { p: [0.64, 0.74, -2.05], w: 0.34, h: 0.14 },
    pipe: [-0.5, 0.28, -2.12],
    plate: [0, 0.56, -2.055],
    bumper: { y: 0.38, z: -2.06, w: 1.86, h: 0.2 },
    screen: { z0: 0.8, y0: 0.9, z1: 0.05, y1: 1.36, hw: 0.74 },
    spots: {
      hood: { region: 'hood', p: [0, 0.88, 1.35], size: 0.62 },
      roof: { region: 'roof', p: [0, 1.42, -0.48], size: 0.62 },
      doors: { region: 'doorP', p: [0.9, 0.6, -0.2], size: 0.5 },
      back: { region: 'back', p: [0, 0.8, -2.04], size: 0.26 },
    },
    numberSpot: { region: 'doorP', p: [0.9, 0.62, -0.2], size: 0.5 },
    eye: [0, 1.42, 0.95],
    snorkel: { x: -0.94, y: 0.75, z: 1.15, top: 1.42, zTop: 0.1 },
  };
}

function coupe(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake, hi } = P;
  const wheels: WheelSpec[] = [
    { x: 0.82, z: 1.3, r: 0.33, w: 0.28 },
    { x: -0.82, z: 1.3, r: 0.33, w: 0.28 },
    { x: 0.84, z: -1.32, r: 0.34, w: 0.32 },
    { x: -0.84, z: -1.32, r: 0.34, w: 0.32 },
  ];
  pg.add(
    profileGeo([
      [2.14, 0.26, 0.88],
      [2.2, 0.46, 0.88],
      [2.04, 0.62, 0.86],
      [0.55, 0.78, 0.92],
      [-1.55, 0.86, 0.92],
      [-2.02, 0.86, 0.88],
      [-2.12, 0.66, 0.9],
      [-2.1, 0.3, 0.9],
      [-1.9, 0.2, 0.9],
      [1.9, 0.2, 0.88],
    ]),
    undefined,
    bodyClassify(0.55, -1.55),
  );
  glass.prism([
    [0.6, 0.76, 0.84],
    [-0.28, 1.12, 0.68],
    [-0.98, 1.12, 0.68],
    [-1.62, 0.84, 0.84],
  ], GLASS_CAR);
  pg.box(1.34, 0.05, 0.74, 0, 1.135, -0.63, roofClassify);
  for (const sx of [-1, 1]) {
    pg.add(beamGeo(new THREE.Vector3(sx * 0.81, 0.77, 0.58), new THREE.Vector3(sx * 0.69, 1.13, -0.26), 0.06));
    pg.add(beamGeo(new THREE.Vector3(sx * 0.82, 0.85, -1.55), new THREE.Vector3(sx * 0.69, 1.13, -0.96), 0.12));
    if (hi) pg.box(0.14, 0.08, 0.1, sx * 0.95, 0.84, 0.45);
    tg.box(0.04, 0.12, 0.42, DARK, sx * 0.93, 0.6, -0.72);
  }
  tg.box(1.8, 0.14, 0.14, DARK, 0, 0.28, 2.12);
  tg.box(1.1, 0.1, 0.05, '#2a2c33', 0, 0.38, 2.19);
  tg.box(1.8, 0.16, 0.12, DARK, 0, 0.3, -2.1);
  for (const sx of [-1, 1]) tg.box(0.06, 0.1, 2.4, DARK, sx * 0.9, 0.26, 0);
  arches(tg, wheels, 0.5, 0.9, 0.08);
  for (const sx of [-1, 1]) {
    lamp.box(0.42, 0.08, 0.06, '#fff4cc', sx * 0.6, 0.56, 2.15, 0, -sx * 0.25, 0);
    brake.box(0.5, 0.08, 0.04, '#ffffff', sx * 0.52, 0.72, -2.11);
  }
  return {
    wheels,
    halfW: 0.92,
    nose: 2.2,
    tail: -2.14,
    sill: 0.22,
    belt: 0.8,
    roof: { y: 1.16, z0: -0.28, z1: -0.98, w: 1.3 },
    lip: { y: 0.86, z: -1.96, w: 1.6 },
    deck: { y: 0.86, z: -1.86, w: 1.6 },
    head: [0.36, 0.92, -0.62],
    lamps: [[0.6, 0.56, 2.17]],
    tails: { p: [0.52, 0.72, -2.12], w: 0.5, h: 0.08 },
    pipe: [-0.5, 0.26, -2.16],
    plate: [0, 0.5, -2.115],
    bumper: { y: 0.3, z: -2.1, w: 1.8, h: 0.16 },
    screen: { z0: 0.6, y0: 0.76, z1: -0.28, y1: 1.12, hw: 0.74 },
    spots: {
      hood: { region: 'hood', p: [0, 0.7, 1.3], size: 0.62 },
      roof: { region: 'roof', p: [0, 1.16, -0.63], size: 0.5 },
      doors: { region: 'doorP', p: [0.92, 0.5, 0.0], size: 0.46 },
      back: { region: 'back', p: [0, 0.48, -2.1], size: 0.22 },
    },
    numberSpot: { region: 'doorP', p: [0.92, 0.5, 0.0], size: 0.46 },
    eye: [0.36, 1.0, -0.4],
    snorkel: { x: -0.95, y: 0.66, z: 1.3, top: 1.16, zTop: -0.3 },
  };
}

function pickup(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake } = P;
  const wheels: WheelSpec[] = [
    { x: 0.86, z: 1.4, r: 0.38, w: 0.3 },
    { x: -0.86, z: 1.4, r: 0.38, w: 0.3 },
    { x: 0.86, z: -1.42, r: 0.38, w: 0.3 },
    { x: -0.86, z: -1.42, r: 0.38, w: 0.3 },
  ];
  pg.add(
    profileGeo([
      [2.2, 0.42, 0.92],
      [2.26, 0.8, 0.92],
      [2.1, 1.0, 0.9],
      [1.0, 1.06, 0.92],
      [-0.35, 1.1, 0.92],
      [-2.2, 1.1, 0.92],
      [-2.26, 1.05, 0.92],
      [-2.28, 0.46, 0.92],
      [-2.0, 0.36, 0.92],
      [2.0, 0.36, 0.92],
    ]),
    undefined,
    bodyClassify(1.0, -0.35),
  );
  glass.prism([
    [1.0, 1.04, 0.86],
    [0.45, 1.62, 0.78],
    [-0.25, 1.62, 0.78],
    [-0.32, 1.06, 0.86],
  ], GLASS_CAR);
  pg.box(1.58, 0.07, 0.74, 0, 1.655, 0.1, roofClassify);
  for (const sx of [-1, 1]) {
    pg.add(beamGeo(new THREE.Vector3(sx * 0.87, 1.05, 0.98), new THREE.Vector3(sx * 0.79, 1.63, 0.45), 0.07));
    pg.add(beamGeo(new THREE.Vector3(sx * 0.87, 1.07, -0.3), new THREE.Vector3(sx * 0.79, 1.63, -0.22), 0.1));
    pg.box(0.16, 0.1, 0.12, sx * 0.99, 1.2, 0.86);
  }
  // the bed: a dark floor just above the rails, rails and a hay bale for the farm
  tg.box(1.66, 0.02, 1.76, '#2b2620', 0, 1.105, -1.32);
  for (const sx of [-1, 1]) tg.box(0.08, 0.05, 1.86, DARK, sx * 0.88, 1.12, -1.3);
  tg.box(1.84, 0.05, 0.08, DARK, 0, 1.12, -0.42);
  tg.box(1.84, 0.05, 0.08, DARK, 0, 1.12, -2.22);
  tg.box(0.95, 0.42, 0.6, '#d9b44a', 0.1, 1.31, -1.45);
  for (const dz of [-0.15, 0.15]) tg.box(0.97, 0.43, 0.03, '#a8842e', 0.1, 1.31, -1.45 + dz);
  // bumpers and grille, chrome
  tg.box(1.9, 0.2, 0.18, CHROME, 0, 0.48, 2.26);
  tg.box(1.2, 0.3, 0.05, '#2a2c33', 0, 0.82, 2.25);
  for (let i = 0; i < 3; i++) tg.box(1.2, 0.03, 0.06, CHROME, 0, 0.72 + i * 0.1, 2.26);
  for (const sx of [-1, 1]) tg.box(0.06, 0.1, 2.1, DARK, sx * 0.93, 0.4, 0);
  arches(tg, wheels, 0.72, 0.92, 0.12);
  for (const sx of [-1, 1]) {
    lamp.box(0.3, 0.18, 0.04, '#fff4cc', sx * 0.66, 0.84, 2.25);
    brake.box(0.08, 0.3, 0.12, '#ffffff', sx * 0.88, 0.84, -2.25);
  }
  return {
    wheels,
    halfW: 0.92,
    nose: 2.3,
    tail: -2.3,
    sill: 0.38,
    belt: 1.08,
    roof: { y: 1.69, z0: 0.46, z1: -0.26, w: 1.5 },
    lip: { y: 1.69, z: -0.26, w: 1.5 },
    deck: { y: 1.12, z: -2.06, w: 1.7 },
    head: [0.4, 1.3, 0.05],
    lamps: [[0.66, 0.84, 2.27]],
    tails: { p: [0.88, 0.84, -2.27], w: 0.08, h: 0.3 },
    pipe: [-0.55, 0.38, -2.32],
    plate: [0, 0.62, -2.285],
    bumper: { y: 0.42, z: -2.3, w: 1.9, h: 0.18 },
    screen: { z0: 1.0, y0: 1.04, z1: 0.45, y1: 1.62, hw: 0.78 },
    spots: {
      hood: { region: 'hood', p: [0, 1.03, 1.55], size: 0.62 },
      roof: { region: 'roof', p: [0, 1.69, 0.1], size: 0.6 },
      doors: { region: 'doorP', p: [0.92, 0.78, 0.35], size: 0.5 },
      back: { region: 'back', p: [0, 0.9, -2.28], size: 0.3 },
    },
    numberSpot: { region: 'doorP', p: [0.92, 0.78, 0.35], size: 0.5 },
    eye: [0.4, 1.45, 0.3],
    snorkel: { x: -0.97, y: 0.95, z: 1.4, top: 1.68, zTop: 0.48 },
  };
}

function monster(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake, hi } = P;
  const R = 0.62;
  const wheels: WheelSpec[] = [
    { x: 1.12, z: 1.18, r: R, w: 0.5 },
    { x: -1.12, z: 1.18, r: R, w: 0.5 },
    { x: 1.12, z: -1.18, r: R, w: 0.5 },
    { x: -1.12, z: -1.18, r: R, w: 0.5 },
  ];
  pg.add(
    profileGeo([
      [1.75, 1.1, 0.84],
      [1.8, 1.38, 0.84],
      [1.62, 1.55, 0.82],
      [0.7, 1.6, 0.84],
      [-0.25, 1.62, 0.84],
      [-1.72, 1.62, 0.84],
      [-1.78, 1.58, 0.84],
      [-1.8, 1.12, 0.84],
      [-1.6, 1.02, 0.84],
      [1.6, 1.02, 0.84],
    ]),
    undefined,
    bodyClassify(0.7, -0.25),
  );
  glass.prism([
    [0.7, 1.58, 0.78],
    [0.32, 2.04, 0.72],
    [-0.18, 2.04, 0.72],
    [-0.24, 1.6, 0.78],
  ], GLASS_CAR);
  pg.box(1.46, 0.07, 0.52, 0, 2.075, 0.07, roofClassify);
  for (const sx of [-1, 1]) {
    pg.add(beamGeo(new THREE.Vector3(sx * 0.79, 1.59, 0.69), new THREE.Vector3(sx * 0.73, 2.05, 0.31), 0.07));
    pg.add(beamGeo(new THREE.Vector3(sx * 0.79, 1.61, -0.23), new THREE.Vector3(sx * 0.73, 2.05, -0.17), 0.09));
  }
  // bed
  tg.box(1.52, 0.02, 1.36, '#2b2620', 0, 1.625, -1.0);
  for (const sx of [-1, 1]) tg.box(0.08, 0.05, 1.5, DARK, sx * 0.8, 1.64, -0.98);
  // chassis rails, solid axles, links and big yellow shocks: the monster's legs
  for (const sx of [-1, 1]) tg.box(0.12, 0.14, 3.2, DARK, sx * 0.5, 0.98, 0);
  for (const w of wheels.slice(0, 1).concat(wheels.slice(2, 3))) {
    tg.cyl(0.07, 0.07, 2.0, 6, '#2a2c33', 0, R, w.z, 0, 0, Math.PI / 2);
    tg.ball(0.16, '#3a3c42', 0, R, w.z, 1, 1, 1, 0);
    for (const sx of [-1, 1]) {
      rod(tg, new THREE.Vector3(sx * 0.5, 0.95, w.z - Math.sign(w.z) * 0.7), new THREE.Vector3(sx * 0.7, R, w.z), 0.04, '#3a3c42');
      rod(tg, new THREE.Vector3(sx * 0.3, 0.95, w.z - Math.sign(w.z) * 0.6), new THREE.Vector3(sx * 0.35, R + 0.05, w.z), 0.035, '#3a3c42');
      const lo = new THREE.Vector3(sx * 0.78, R + 0.05, w.z + 0.12);
      const up = new THREE.Vector3(sx * 0.72, 1.32, w.z + 0.35);
      rod(tg, lo, up, 0.04, CHROME);
      rod(tg, lo.clone().lerp(up, 0.15), lo.clone().lerp(up, 0.75), 0.085, '#f2c21b');
    }
  }
  // big fender flares over the tyres
  for (const w of wheels) {
    const sx = Math.sign(w.x);
    tg.box(0.5, 0.06, 1.2, DARK, sx * 1.02, 1.4, w.z);
    tg.box(0.06, 0.2, 1.2, DARK, sx * 0.86, 1.3, w.z);
  }
  tg.box(1.72, 0.26, 0.2, DARK, 0, 1.12, 1.8);
  tg.box(1.0, 0.24, 0.05, '#2a2c33', 0, 1.42, 1.8);
  for (const sx of [-1, 1]) {
    lamp.box(0.26, 0.16, 0.04, '#fff4cc', sx * 0.56, 1.44, 1.805);
    brake.box(0.24, 0.12, 0.04, '#ffffff', sx * 0.66, 1.46, -1.805);
  }
  return {
    wheels,
    halfW: 0.84,
    nose: 1.9,
    tail: -1.84,
    sill: 1.02,
    belt: 1.6,
    roof: { y: 2.11, z0: 0.32, z1: -0.18, w: 1.4 },
    lip: { y: 2.11, z: -0.18, w: 1.4 },
    deck: { y: 1.64, z: -1.6, w: 1.6 },
    head: [0.38, 1.8, 0.1],
    lamps: [[0.56, 1.44, 1.82]],
    tails: { p: [0.66, 1.46, -1.81], w: 0.24, h: 0.12 },
    pipe: [-0.45, 1.06, -1.84],
    plate: [0, 1.28, -1.805],
    bumper: { y: 1.1, z: -1.82, w: 1.72, h: 0.24 },
    screen: { z0: 0.7, y0: 1.58, z1: 0.32, y1: 2.04, hw: 0.74 },
    spots: {
      hood: { region: 'hood', p: [0, 1.58, 1.15], size: 0.6 },
      roof: { region: 'roof', p: [0, 2.11, 0.07], size: 0.44 },
      doors: { region: 'doorP', p: [0.84, 1.33, 0.1], size: 0.44 },
      back: { region: 'back', p: [0, 1.48, -1.8], size: 0.24 },
    },
    numberSpot: { region: 'doorP', p: [0.84, 1.33, 0.1], size: 0.44 },
    eye: [0.38, 1.95, 0.35],
    snorkel: { x: -0.88, y: 1.5, z: 0.95, top: 2.1, zTop: 0.34 },
  };
}

function buggy(P: Parts): BodySpec {
  const { pg, tg, glass, lamp, brake, hi, style } = P;
  const wheels: WheelSpec[] = [
    { x: 0.9, z: 1.22, r: 0.34, w: 0.26 },
    { x: -0.9, z: 1.22, r: 0.34, w: 0.26 },
    { x: 0.95, z: -1.12, r: 0.45, w: 0.42 },
    { x: -0.95, z: -1.12, r: 0.45, w: 0.42 },
  ];
  pg.add(
    profileGeo([
      [1.85, 0.32, 0.55],
      [1.92, 0.5, 0.55],
      [1.55, 0.64, 0.6],
      [0.5, 0.7, 0.64],
      [-0.85, 0.72, 0.64],
      [-1.5, 0.76, 0.62],
      [-1.68, 0.58, 0.6],
      [-1.62, 0.3, 0.6],
      [1.6, 0.26, 0.55],
    ]),
    undefined,
    bodyClassify(0.5, -0.85),
  );
  // the cage, in the second colour so it shows
  const cage = style.paint2;
  const tube = 0.035;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const hoop = (z: number, y: number, w: number, top: number, ztop: number): void => {
    for (const sx of [-1, 1]) rod(tg, V(sx * w, y, z), V(sx * (w - 0.08), top, ztop), tube, cage);
    rod(tg, V(-(w - 0.08), top, ztop), V(w - 0.08, top, ztop), tube, cage);
  };
  hoop(-0.72, 0.72, 0.6, 1.48, -0.78);
  hoop(0.52, 0.7, 0.62, 1.44, 0.06);
  for (const sx of [-1, 1]) {
    rod(tg, V(sx * 0.52, 1.48, -0.78), V(sx * 0.54, 1.44, 0.06), tube, cage);
    rod(tg, V(sx * 0.52, 1.46, -0.78), V(sx * 0.5, 0.76, -1.45), tube, cage);
    // nerf bars between the wheels and the front arms
    rod(tg, V(sx * 0.66, 0.42, 0.85), V(sx * 0.7, 0.42, -0.62), 0.03, DARK);
    rod(tg, V(sx * 0.55, 0.5, 1.4), V(sx * 0.88, 0.34, 1.22), 0.03, '#3a3c42');
    rod(tg, V(sx * 0.55, 0.36, 1.05), V(sx * 0.88, 0.32, 1.22), 0.03, '#3a3c42');
    rod(tg, V(sx * 0.58, 0.6, -0.8), V(sx * 0.9, 0.45, -1.12), 0.035, '#3a3c42');
  }
  rod(tg, V(-0.52, 1.47, -0.78), V(0.52, 0.76, -1.45), tube, cage);
  // seat, wheel, engine and the front bumper tube
  tg.box(0.5, 0.1, 0.5, '#2a2c33', 0, 0.76, -0.4);
  tg.box(0.5, 0.6, 0.1, '#2a2c33', 0, 1.0, -0.66, -0.15);
  if (hi) {
    tg.add(new THREE.TorusGeometry(0.15, 0.025, 4, 10), DARK, mat(0, 1.0, 0.18, -0.5));
    tg.cyl(0.025, 0.025, 0.4, 4, DARK, 0, 0.9, 0.32, 1.0);
  }
  // the engine cover takes the roof's paint and sticker (a buggy has no roof)
  pg.box(0.74, 0.26, 0.56, 0, 0.87, -1.14, roofClassify);
  tg.box(0.6, 0.06, 0.4, '#3a3c42', 0, 0.74, -1.14);
  tg.cyl(0.1, 0.1, 0.1, 8, CHROME, 0.25, 1.04, -1.3, 0, 0, Math.PI / 2);
  rod(tg, V(-0.6, 0.36, 1.98), V(0.6, 0.36, 1.98), 0.04, DARK);
  glass.box(0.8, 0.28, 0.03, GLASS_CAR, 0, 0.84, 0.52, -0.5);
  for (const sx of [-1, 1]) {
    lamp.cyl(0.09, 0.09, 0.06, 8, '#fff4cc', sx * 0.32, 0.52, 1.89, Math.PI / 2 - 0.15);
    brake.box(0.14, 0.08, 0.04, '#ffffff', sx * 0.42, 0.62, -1.67);
  }
  return {
    wheels,
    halfW: 0.64,
    nose: 2.0,
    tail: -1.7,
    sill: 0.28,
    belt: 0.7,
    roof: { y: 1.49, z0: 0.06, z1: -0.78, w: 1.04 },
    lip: { y: 1.49, z: -0.78, w: 1.1 },
    deck: { y: 0.76, z: -1.48, w: 1.2 },
    head: [0, 1.22, -0.42],
    lamps: [[0.32, 0.52, 1.92]],
    tails: { p: [0.42, 0.62, -1.68], w: 0.14, h: 0.08 },
    pipe: [-0.3, 0.7, -1.72],
    plate: [0, 0.42, -1.65],
    bumper: { y: 0.34, z: -1.7, w: 1.2, h: 0.12 },
    screen: { z0: 0.6, y0: 0.72, z1: 0.46, y1: 0.96, hw: 0.4 },
    spots: {
      hood: { region: 'hood', p: [0, 0.67, 1.08], size: 0.46 },
      roof: { region: 'roof', p: [0, 1.0, -1.14], size: 0.42 },
      doors: { region: 'doorP', p: [0.62, 0.5, 0.05], size: 0.36 },
      back: { region: 'back', p: [0, 0.62, -1.66], size: 0.2 },
    },
    numberSpot: { region: 'doorP', p: [0.62, 0.5, 0.05], size: 0.36 },
    eye: [0, 1.32, -0.2],
    snorkel: { x: -0.66, y: 0.7, z: 0.0, top: 1.48, zTop: -0.74 },
    open: true,
  };
}

const BODIES: Record<CarBody, (p: Parts) => BodySpec> = { hatch, buggy, pickup, coupe, monster };

function beamGeo(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

// ---- wheels ----

/** A wheel with its axle along x: the tyre, the rim style in `rim`, spokes so you can see it turn. */
function wheelGeo(kind: CarWheels, r: number, w: number, rim: string, hi: boolean): THREE.BufferGeometry {
  const g = new Geo();
  const seg = hi ? 14 : 9;
  const rs = hi ? 10 : 7;
  const ax = Math.PI / 2;
  const tyre = '#1b1b1d';
  const spoke = (n: number, len: number, t: number, col: string, ww: number, r0 = 0, phase = 0): void => {
    for (let i = 0; i < n; i++) {
      const a = phase + (i * Math.PI * 2) / n;
      const rr = r0 + len / 2;
      g.box(ww, len, t, col, 0, Math.cos(a) * rr, Math.sin(a) * rr, a, 0, 0);
    }
  };
  if (kind === 'offroad') {
    g.cyl(r * 0.9, r * 0.9, w, seg, tyre, 0, 0, 0, 0, 0, ax);
    const n = hi ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      g.box(w * 0.98, r * 0.2, r * 0.34, '#222225', 0, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, a, 0, 0);
    }
  } else {
    g.cyl(r, r, w, seg, tyre, 0, 0, 0, 0, 0, ax);
  }
  const ww = w + 0.02;
  switch (kind) {
    case 'steel':
      g.cyl(r * 0.6, r * 0.6, ww, rs, rim, 0, 0, 0, 0, 0, ax);
      spoke(4, r * 0.1, r * 0.1, '#2a2b30', ww + 0.01, r * 0.32, Math.PI / 4);
      g.cyl(r * 0.16, r * 0.16, ww + 0.04, 8, '#e2e4e8', 0, 0, 0, 0, 0, ax);
      break;
    case 'sport':
      g.cyl(r * 0.66, r * 0.66, ww, rs, rim, 0, 0, 0, 0, 0, ax);
      g.cyl(r * 0.56, r * 0.56, ww + 0.01, rs, '#2a2b30', 0, 0, 0, 0, 0, ax);
      spoke(5, r * 0.5, r * 0.09, rim, ww + 0.02, r * 0.08);
      g.cyl(r * 0.12, r * 0.12, ww + 0.04, 6, rim, 0, 0, 0, 0, 0, ax);
      break;
    case 'offroad':
      g.cyl(r * 0.6, r * 0.6, ww, rs, rim, 0, 0, 0, 0, 0, ax);
      g.cyl(r * 0.48, r * 0.48, ww + 0.01, rs, '#2e3036', 0, 0, 0, 0, 0, ax);
      spoke(hi ? 8 : 5, r * 0.06, r * 0.06, '#d8dade', ww + 0.03, r * 0.5);
      g.cyl(r * 0.16, r * 0.16, ww + 0.04, 6, rim, 0, 0, 0, 0, 0, ax);
      break;
    case 'star':
      g.cyl(r * 0.62, r * 0.62, ww, rs, '#2a2b30', 0, 0, 0, 0, 0, ax);
      spoke(5, r * 0.56, r * 0.16, rim, ww + 0.02, 0);
      if (hi) spoke(5, r * 0.3, r * 0.08, rim, ww + 0.021, r * 0.3, Math.PI / 5);
      g.cyl(r * 0.14, r * 0.14, ww + 0.04, 6, '#e2e4e8', 0, 0, 0, 0, 0, ax);
      break;
    case 'gold':
      g.cyl(r * 0.64, r * 0.64, ww, rs, rim, 0, 0, 0, 0, 0, ax);
      g.cyl(r * 0.57, r * 0.57, ww + 0.01, rs, '#f2c94c', 0, 0, 0, 0, 0, ax);
      spoke(hi ? 8 : 5, r * 0.46, r * 0.06, '#b8860b', ww + 0.02, r * 0.08);
      g.cyl(r * 0.13, r * 0.13, ww + 0.04, 8, '#ffd700', 0, 0, 0, 0, 0, ax);
      break;
  }
  return g.build();
}

// ---- bolt-ons ----

function spoilerGeo(kind: CarSpoiler, s: BodySpec, col: string): THREE.BufferGeometry | null {
  if (kind === 'none') return null;
  const g = new Geo();
  const { lip, deck } = s;
  if (kind === 'small') {
    g.box(lip.w * 0.92, 0.05, 0.26, col, 0, lip.y + 0.03, lip.z - 0.1, -0.18);
  } else if (kind === 'big') {
    const y = lip.y + 0.16;
    g.box(lip.w, 0.05, 0.36, col, 0, y, lip.z - 0.16, -0.12);
    for (const sx of [-1, 1]) {
      g.box(0.05, 0.18, 0.12, DARK, sx * lip.w * 0.32, lip.y + 0.07, lip.z - 0.1);
      g.box(0.04, 0.16, 0.4, col, sx * lip.w * 0.5, y + 0.02, lip.z - 0.16);
    }
  } else {
    // the tall wing on posts from the tail
    const y = deck.y + 0.52;
    g.box(deck.w + 0.1, 0.06, 0.42, col, 0, y, deck.z, -0.1);
    g.box(deck.w + 0.1, 0.03, 0.12, col, 0, y + 0.08, deck.z - 0.2, -0.5);
    for (const sx of [-1, 1]) {
      g.box(0.05, 0.52, 0.14, DARK, sx * deck.w * 0.3, deck.y + 0.26, deck.z + 0.02);
      g.box(0.04, 0.3, 0.5, col, sx * (deck.w / 2 + 0.07), y + 0.04, deck.z - 0.02);
    }
  }
  return g.build();
}

/** The fun bolt-ons, into the trim geometry (lightbar lenses go to the lamps). */
function addExtras(P: Parts, s: BodySpec): void {
  const { tg, lamp, style, hi } = P;
  const ex = new Set(style.extras);
  const { roof } = s;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const hw = roof.w / 2;
  const zm = (roof.z0 + roof.z1) / 2;
  if (ex.has('roofrack')) {
    for (const sx of [-1, 1]) {
      tg.box(0.05, 0.05, roof.z0 - roof.z1, '#2a2c33', sx * hw * 0.85, roof.y + 0.09, zm);
      for (const z of [roof.z0 - 0.08, roof.z1 + 0.08]) tg.box(0.04, 0.09, 0.04, '#2a2c33', sx * hw * 0.85, roof.y + 0.04, z);
    }
    for (let i = 0; i < 3; i++) tg.box(hw * 1.75, 0.03, 0.04, '#2a2c33', 0, roof.y + 0.11, roof.z1 + 0.1 + ((roof.z0 - roof.z1 - 0.2) * i) / 2);
    tg.box(hw * 1.1, 0.22, (roof.z0 - roof.z1) * 0.55, '#8c5a3c', 0, roof.y + 0.24, zm - 0.05);
    tg.box(hw * 1.12, 0.03, (roof.z0 - roof.z1) * 0.57, '#5d4a32', 0, roof.y + 0.3, zm - 0.05);
  }
  if (ex.has('lightbar')) {
    const y = roof.y + (ex.has('roofrack') ? 0.42 : 0.12);
    const z = roof.z0 - 0.06;
    tg.box(hw * 1.7, 0.12, 0.1, DARK, 0, y, z);
    for (const sx of [-1, 1]) tg.box(0.04, y - roof.y, 0.04, DARK, sx * hw * 0.8, roof.y + (y - roof.y) / 2, z);
    for (let i = 0; i < 4; i++) lamp.box(hw * 0.36, 0.08, 0.03, '#fff4cc', -hw * 0.63 + i * hw * 0.42, y, z + 0.05);
  }
  const mast = (x: number, h: number): THREE.Vector3 => {
    const z = roof.z1 + 0.08;
    rod(tg, V(x, roof.y, z), V(x, roof.y + h, z - 0.08), 0.012, '#2a2c33');
    return V(x, roof.y + h, z - 0.08);
  };
  if (ex.has('antenna')) {
    const top = mast(hw * 0.75, 0.75);
    tg.ball(0.045, '#e8412c', top.x, top.y, top.z);
  }
  if (ex.has('flag')) {
    const top = mast(-hw * 0.75, 0.85);
    // a pennant in the second colour, flying backwards
    const pts = [top.x, top.y, top.z, top.x, top.y - 0.24, top.z, top.x, top.y - 0.1, top.z - 0.5];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...pts, pts[0]!, pts[1]!, pts[2]!, pts[6]!, pts[7]!, pts[8]!, pts[3]!, pts[4]!, pts[5]!], 3));
    g.computeVertexNormals();
    tg.add(g, style.paint2);
  }
  if (ex.has('bullbar')) {
    const z = s.nose + 0.12;
    const y0 = s.bumper.y - 0.05;
    const w = s.halfW * 0.85;
    for (const sx of [-0.4, 0.4]) rod(tg, V(sx * w, y0, z - 0.1), V(sx * w, y0 + 0.5, z), 0.035, CHROME);
    rod(tg, V(-w * 0.6, y0 + 0.5, z), V(w * 0.6, y0 + 0.5, z), 0.035, CHROME);
    for (const sx of [-1, 1]) {
      rod(tg, V(sx * w * 0.6, y0 + 0.5, z), V(sx * w, y0 + 0.3, z - 0.06), 0.035, CHROME);
      rod(tg, V(sx * w, y0 + 0.3, z - 0.06), V(sx * w, y0, z - 0.14), 0.035, CHROME);
    }
    rod(tg, V(-w, y0 + 0.12, z - 0.1), V(w, y0 + 0.12, z - 0.1), 0.035, CHROME);
  }
  if (ex.has('sideskirts')) {
    const f = s.wheels[0]!;
    const r = s.wheels[2]!;
    const len = f.z - r.z - f.r - r.r - 0.1;
    for (const sx of [-1, 1]) tg.box(0.08, 0.12, len, style.paint2, sx * (s.halfW + 0.02), s.sill + 0.02, (f.z - f.r + r.z + r.r) / 2);
  }
  if (ex.has('snorkel')) {
    const { x, y, z, top, zTop } = s.snorkel;
    const a = V(x, y, z - 0.25);
    const b = V(x - 0.02, top - 0.08, zTop + 0.2);
    rod(tg, a, b, 0.05, '#25272c');
    rod(tg, b, V(x - 0.02, top + 0.06, zTop + 0.1), 0.05, '#25272c');
    tg.box(0.12, 0.12, 0.16, '#25272c', x - 0.02, top + 0.1, zTop + 0.14);
  }
  if (ex.has('antlers')) {
    const z = roof.z0 - 0.25;
    for (const sx of [-1, 1]) {
      const base = V(sx * hw * 0.45, roof.y, z);
      const tip = V(sx * hw * 0.75, roof.y + 0.42, z - 0.05);
      rod(tg, base, tip, 0.03, '#8a5a32');
      rod(tg, V(sx * hw * 0.58, roof.y + 0.2, z), V(sx * hw * 0.5, roof.y + 0.4, z + 0.06), 0.025, '#8a5a32');
      rod(tg, V(sx * hw * 0.68, roof.y + 0.32, z - 0.03), V(sx * hw * 0.92, roof.y + 0.46, z - 0.02), 0.025, '#8a5a32');
    }
  }
  if (ex.has('ears')) {
    const z = roof.z0 - 0.22;
    for (const sx of [-1, 1]) {
      tg.add(new THREE.ConeGeometry(0.14, 0.3, 4), style.paint, mat(sx * hw * 0.55, roof.y + 0.14, z, 0, Math.PI / 4, -sx * 0.2));
      tg.add(new THREE.ConeGeometry(0.08, 0.2, 4), '#ffb6c1', mat(sx * hw * 0.55, roof.y + 0.13, z + 0.06, 0, Math.PI / 4, -sx * 0.2));
    }
  }
  if (ex.has('horsetail')) {
    const z = s.tail - 0.02;
    const y = s.belt;
    const n = hi ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 0.035;
      rod(tg, V(dx, y, z), V(dx * 2.2, y - 0.2, z - 0.22), 0.025, '#5a3a22');
      rod(tg, V(dx * 2.2, y - 0.2, z - 0.22), V(dx * 3, y - 0.55 - (i % 2) * 0.06, z - 0.26), 0.022, '#6b4528');
    }
  }
}

/** A flame pointing back along −z from the origin: blue at the pipe, orange to the tip, a pale hot core. */
function flameGeo(): THREE.BufferGeometry {
  const cone = (r: number, len: number, from: string, to: string): THREE.BufferGeometry => {
    const g = new THREE.ConeGeometry(r, len, 8, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -len / 2);
    const p = g.getAttribute('position');
    const c = new Float32Array(p.count * 3);
    const a = new THREE.Color(from);
    const b = new THREE.Color(to);
    const t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      t.copy(a).lerp(b, Math.min(1, (-p.getZ(i) / len) * 1.6));
      c[i * 3] = t.r;
      c[i * 3 + 1] = t.g;
      c[i * 3 + 2] = t.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const out = mergeColored([cone(0.11, 0.75, '#3d7dff', '#ff6a10'), cone(0.06, 0.4, '#bfe0ff', '#ffd25a')]);
  return out;
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 1000), 374761393) ^ Math.imul(Math.round(y * 1000), 668265263) ^ Math.imul(Math.round(z * 1000), 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A car for a body and a style, front along +z. The arcade default is the red hatchback. */
export function carModel(opts: CarModelOpts): CarModel {
  const style = opts.style ?? defaultStyle();
  const bodyKind: CarBody = BODIES[opts.body] ? opts.body : 'hatch';
  const hi = opts.quality !== 'low';
  const S = CAR_BODY_DEFS[bodyKind]?.size ?? 1;
  const who: Driver = opts.driver ?? style.driver;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => (disposables.push(d), d);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = new THREE.Group();
  shell.scale.setScalar(S);
  body.add(shell);

  const P: Parts = { pg: new PaintGeo(), tg: new Geo(), glass: new Geo(), lamp: new Geo(), brake: new Geo(), style, hi };
  const spec = BODIES[bodyKind](P);
  addExtras(P, spec);
  const seed = (style.number * 131 + bodyKind.length * 17 + style.paint.charCodeAt(2)) >>> 0;

  // exhausts: one pipe, or two big chrome ones
  const pipes: V3[] = style.extras.includes('exhaust2')
    ? [
        [-Math.abs(spec.pipe[0]) - 0.05, spec.pipe[1], spec.pipe[2]],
        [Math.abs(spec.pipe[0]) + 0.05, spec.pipe[1], spec.pipe[2]],
      ]
    : [spec.pipe];
  const big = pipes.length > 1;
  for (const [x, y, z] of pipes) {
    P.tg.cyl(big ? 0.075 : 0.05, big ? 0.075 : 0.05, 0.24, 8, big ? CHROME : '#555555', x, y, z + 0.06, Math.PI / 2);
    if (big) P.tg.cyl(0.05, 0.05, 0.25, 8, '#1a1a1a', x, y, z + 0.06, Math.PI / 2);
  }

  // the driver (and shoulders, so open cars and big windows look occupied)
  const [hx, hy, hz] = spec.head;
  const shirt = who === 'human' ? style.paint2 : '#4a6fa5';
  P.tg.box(0.44, 0.3, 0.26, shirt, hx, hy - 0.3, hz - 0.02);
  P.tg.addColored(driverHead(who, style.paint), mat(hx, hy, hz));
  P.tg.box(0.08, 0.1, 0.08, '#e8c39e', hx, hy - 0.17, hz);

  // the painted body
  const paintGeo = keep(P.pg.build());
  const S2 = hi ? 512 : 256;
  const spot = (sp: Spot): DecalSpot => {
    const [u, v] = P.pg.project(sp.region, sp.p[0], sp.p[1], sp.p[2]);
    return { region: sp.region, u, v, size: sp.size };
  };
  const layout: PaintLayout = {
    sizes: P.pg.sizes(),
    spots: { hood: spot(spec.spots.hood), roof: spot(spec.spots.roof), doors: spot(spec.spots.doors), back: spot(spec.spots.back) },
    numberSpot: spot(spec.numberSpot),
    dirtLine: 0.55,
    seed,
  };
  const clean = document.createElement('canvas');
  clean.width = clean.height = S2;
  paintCar(clean, style, layout);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S2;
  const cvg = cv.getContext('2d')!;
  cvg.drawImage(clean, 0, 0);
  const tex = keep(new THREE.CanvasTexture(cv));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const finish = style.finish;
  const paint = keep(
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: finish === 'matte' ? 0.85 : finish === 'metallic' ? 0.35 : 0.3,
      metalness: finish === 'matte' ? 0 : finish === 'metallic' ? 0.7 : 0.15,
      envMap: finish === 'matte' ? null : opts.envMap,
      envMapIntensity: finish === 'metallic' ? 1.2 : 0.9,
      flatShading: true,
    }),
  );
  const bodyMesh = new THREE.Mesh(paintGeo, paint);
  bodyMesh.castShadow = true;
  shell.add(bodyMesh);

  const trimMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, flatShading: true, envMap: opts.envMap, envMapIntensity: 0.6 }));
  const trimGeo = keep(P.tg.build());
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.castShadow = true;
  shell.add(trim);

  const glassGeo = keep(P.glass.build());
  const glassMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: spec.open ? 0.5 : 0.62, envMap: opts.envMap, envMapIntensity: 1.2, flatShading: true }));
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.renderOrder = 2;
  shell.add(glassMesh);

  const lampGeo = keep(P.lamp.build());
  const lampMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, emissive: '#fff1c4', emissiveIntensity: 0.35 }));
  shell.add(new THREE.Mesh(lampGeo, lampMat));
  const brakeGeo = keep(P.brake.build());
  const brakeMat = keep(new THREE.MeshBasicMaterial({ color: '#7a1410' }));
  shell.add(new THREE.Mesh(brakeGeo, brakeMat));

  // the number plate
  const plateCv = document.createElement('canvas');
  plateCv.width = 128;
  plateCv.height = 32;
  paintPlate(plateCv, style.plate.trim() || `RALLY ${style.number}`);
  const plateTex = keep(new THREE.CanvasTexture(plateCv));
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plateMat = keep(new THREE.MeshStandardMaterial({ map: plateTex, emissiveMap: plateTex, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.5 }));
  const plateGeo = keep(new THREE.PlaneGeometry(0.5, 0.125));
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(spec.plate[0], spec.plate[1], spec.plate[2] - 0.012);
  plate.rotation.y = Math.PI;
  shell.add(plate);

  // spoiler and rear bumper on their own meshes, pivoting at the +x end so damage can make them hang
  const pivoted = (geo: THREE.BufferGeometry, px: number, py: number, pz: number): THREE.Mesh => {
    geo.translate(-px, -py, -pz);
    const m = new THREE.Mesh(keep(geo), trimMat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    shell.add(m);
    return m;
  };
  const sg = spoilerGeo(style.spoiler, spec, style.paint2);
  const mount = style.spoiler === 'wing' ? spec.deck : spec.lip;
  const spoiler = sg ? pivoted(sg, mount.w * 0.5, mount.y, mount.z) : null;
  const bb = spec.bumper;
  const bumper = pivoted(new Geo().box(bb.w, bb.h, 0.16, DARK, 0, bb.y, bb.z).build(), bb.w / 2 - 0.1, bb.y, bb.z);

  // the cracked windscreen (shown from 40 damage)
  const sc = spec.screen;
  const crackCv = document.createElement('canvas');
  crackCv.width = crackCv.height = hi ? 128 : 64;
  paintCrack(crackCv, seed);
  const crackTex = keep(new THREE.CanvasTexture(crackCv));
  crackTex.colorSpace = THREE.SRGBColorSpace;
  const crackMat = keep(new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false }));
  const slope = Math.hypot(sc.z1 - sc.z0, sc.y1 - sc.y0);
  const crackGeo = keep(new THREE.PlaneGeometry(sc.hw * 1.1, slope * 0.85));
  const crack = new THREE.Mesh(crackGeo, crackMat);
  const tilt = Math.atan2(sc.y1 - sc.y0, sc.z0 - sc.z1);
  const nrm = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  crack.position.set(sc.hw * 0.3, (sc.y0 + sc.y1) / 2, (sc.z0 + sc.z1) / 2).addScaledVector(nrm, 0.02);
  crack.rotation.x = tilt - Math.PI / 2;
  crack.renderOrder = 3;
  crack.visible = false;
  shell.add(crack);

  // wheels: steer group (the game turns it) → spin group (children[0], the game spins it) → the mesh
  const wheelR = Math.max(...spec.wheels.map((w) => w.r));
  const wheelMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: style.wheels === 'gold' ? 0.6 : 0.2, flatShading: true, envMap: opts.envMap, envMapIntensity: 0.8 }));
  const wgeos = new Map<string, THREE.BufferGeometry>();
  const wheels: THREE.Group[] = [];
  const wheelMeshes: THREE.Mesh[] = [];
  for (const w of spec.wheels) {
    const key = `${w.r}:${w.w}`;
    let geo = wgeos.get(key);
    if (!geo) wgeos.set(key, (geo = keep(wheelGeo(style.wheels, w.r, w.w, style.rimColor, hi))));
    const steer = new THREE.Group();
    steer.position.set(w.x * S, wheelR * S, w.z * S);
    const spin = new THREE.Group();
    spin.position.y = (w.r - wheelR) * S;
    const mesh = new THREE.Mesh(geo, wheelMat);
    mesh.scale.setScalar(S);
    mesh.castShadow = true;
    spin.add(mesh);
    steer.add(spin);
    root.add(steer);
    wheels.push(steer);
    wheelMeshes.push(mesh);
  }

  // blob shadow (the game lays it on the ground) with the underglow's coloured spot on it
  const wide = Math.max(spec.halfW, ...spec.wheels.map((w) => Math.abs(w.x) + w.w / 2));
  const shW = (wide * 2 + 0.6) * S;
  const shL = (spec.nose - spec.tail + 0.6) * S;
  const sgeo = keep(new THREE.PlaneGeometry(shW, shL));
  sgeo.rotateX(-Math.PI / 2);
  sgeo.translate(0, 0, ((spec.nose + spec.tail) / 2) * S);
  const smat = keep(new THREE.MeshBasicMaterial({ map: opts.shadowTex, color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const shadow = new THREE.Mesh(sgeo, smat);
  shadow.renderOrder = 1;

  const night: THREE.Object3D[] = [];
  let glowMat: THREE.MeshBasicMaterial | null = null;
  if (style.glow) {
    const gg = new Geo();
    const y = spec.sill - 0.05;
    for (const sx of [-1, 1]) gg.box(0.04, 0.04, (spec.nose - spec.tail) * 0.7, '#ffffff', sx * (spec.halfW - 0.08), y, (spec.nose + spec.tail) / 2);
    gg.box(spec.halfW * 1.4, 0.04, 0.04, '#ffffff', 0, y, spec.nose - 0.35);
    gg.box(spec.halfW * 1.4, 0.04, 0.04, '#ffffff', 0, y, spec.tail + 0.35);
    glowMat = keep(new THREE.MeshBasicMaterial({ color: style.glow }));
    shell.add(new THREE.Mesh(keep(gg.build()), glowMat));
    const spotGeo = keep(new THREE.PlaneGeometry(shW * 1.15, shL * 1.05));
    spotGeo.rotateX(-Math.PI / 2);
    spotGeo.translate(0, 0.012, ((spec.nose + spec.tail) / 2) * S);
    const spotMat = keep(new THREE.MeshBasicMaterial({ map: opts.shadowTex, color: style.glow, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    const glowSpot = new THREE.Mesh(spotGeo, spotMat);
    glowSpot.renderOrder = 2;
    glowSpot.visible = false;
    shadow.add(glowSpot);
    night.push(glowSpot);
  }

  // halos round the lamps at night (sprites, so they face the camera)
  const lampPos: THREE.Vector3[] = [];
  for (const [x, y, z] of spec.lamps) for (const sx of [1, -1]) lampPos.push(new THREE.Vector3(sx * x, y, z));
  if (hi) {
    const halo = (col: string): THREE.SpriteMaterial => keep(new THREE.SpriteMaterial({ map: opts.shadowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    const hm = halo('#fff1c8');
    const tm = halo('#ff3020');
    for (const p of lampPos) {
      const s = new THREE.Sprite(hm);
      s.position.copy(p).add(new THREE.Vector3(0, 0, 0.16));
      s.scale.setScalar(0.62);
      s.visible = false;
      shell.add(s);
      night.push(s);
    }
    for (const sx of [1, -1]) {
      const s = new THREE.Sprite(tm);
      s.position.set(sx * spec.tails.p[0], spec.tails.p[1], spec.tails.p[2] - 0.12);
      s.scale.setScalar(0.45);
      s.visible = false;
      shell.add(s);
      night.push(s);
    }
  }

  // nitro flames at the pipes
  const flames = new THREE.Group();
  const fgeo = keep(flameGeo());
  const fmat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide }));
  const flameMeshes: THREE.Mesh[] = [];
  for (const [x, y, z] of pipes) {
    const f = new THREE.Mesh(fgeo, fmat);
    f.position.set(x, y, z - 0.06);
    flames.add(f);
    flameMeshes.push(f);
  }
  flames.visible = false;
  shell.add(flames);

  // ---- damage ----
  const posAttr = paintGeo.getAttribute('position') as THREE.BufferAttribute;
  const base = Float32Array.from(posAttr.array as Float32Array);
  const r = rng(seed);
  const side = (): number => (r() < 0.5 ? -1 : 1);
  const s1 = side();
  const s2 = side();
  const mid = (spec.sill + spec.belt) / 2;
  const dents = [
    { c: new THREE.Vector3(s1 * spec.halfW, mid + 0.1, spec.nose - 0.35), d: new THREE.Vector3(-s1 * 0.7, -0.25, -0.65).normalize() },
    { c: new THREE.Vector3(s2 * spec.halfW, spec.belt, (spec.wheels[0]!.z + spec.wheels[2]!.z) / 2 + (r() - 0.5) * 0.6), d: new THREE.Vector3(-s2, -0.45, 0).normalize() },
    { c: new THREE.Vector3(-s1 * spec.halfW, mid, spec.tail + 0.3), d: new THREE.Vector3(s1 * 0.7, -0.15, 0.7).normalize() },
    { c: new THREE.Vector3(-s2 * spec.halfW * 0.4, spec.belt, spec.nose - 0.25), d: new THREE.Vector3(0, -0.8, -0.6).normalize() },
  ];
  let bucket = -1;
  const setDamage = (dmg: number): void => {
    const b = Math.max(0, Math.min(10, Math.round((Number.isFinite(dmg) ? dmg : 0) / 10)));
    if (b === bucket) return;
    bucket = b;
    const d = b * 10;
    // dents: a few vertices pushed in round seeded points, deeper as the damage grows
    const arr = posAttr.array as Float32Array;
    arr.set(base);
    const R = 0.6;
    for (let i = 0; i < dents.length; i++) {
      const k = Math.max(0, Math.min(1, (d - (10 + i * 20)) / 30));
      if (k <= 0) continue;
      const { c, d: dir } = dents[i]!;
      for (let v = 0; v < arr.length; v += 3) {
        const x = base[v]!;
        const y = base[v + 1]!;
        const z = base[v + 2]!;
        const dist = Math.hypot(x - c.x, y - c.y, z - c.z);
        if (dist >= R) continue;
        const f = (1 - dist / R) ** 2 * k * 0.28 * (0.6 + 0.8 * hash3(x, y, z));
        arr[v] = x + dir.x * f;
        arr[v + 1] = y + dir.y * f;
        arr[v + 2] = z + dir.z * f;
      }
    }
    posAttr.needsUpdate = true;
    paintGeo.computeVertexNormals();
    // dirt and scratches over the clean paint
    cvg.setTransform(1, 0, 0, 1, 0, 0);
    cvg.drawImage(clean, 0, 0);
    paintDamage(cvg, S2, layout, d / 100);
    tex.needsUpdate = true;
    crack.visible = d >= 40;
    const loose = d >= 70;
    bumper.rotation.set(loose ? 0.12 : 0, 0, loose ? 0.2 : 0);
    if (spoiler) spoiler.rotation.set(loose ? 0.08 : 0, 0, loose ? 0.14 : 0);
    // a wobbly wheel: tilted inside its spin group, so it wobbles as it turns
    const wob = wheelMeshes[3];
    if (wob) wob.rotation.z = d >= 85 ? 0.13 : 0;
  };
  setDamage(0);

  let lit = false;
  const setNight = (on: boolean): void => {
    if (on === lit) return;
    lit = on;
    lampMat.emissiveIntensity = on ? 2.6 : 0.35;
    plateMat.emissiveIntensity = on ? 0.55 : 0;
    for (const o of night) o.visible = on;
  };

  const setNitro = (k: number): void => {
    const on = k > 0.02;
    flames.visible = on;
    if (!on) return;
    for (const f of flameMeshes) {
      const w = 0.7 + 0.5 * k;
      f.scale.set(w, w, k * (0.75 + Math.random() * 0.5));
    }
  };

  const v = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);
  return {
    root,
    body,
    wheels,
    brakeMat,
    paint,
    shadow,
    setDamage,
    setNight,
    setNitro,
    headlights: lampPos.map((p) => p.clone().multiplyScalar(S)),
    wheelPos: spec.wheels.map((w) => [w.x * S, w.z * S]),
    wheelR: wheelR * S,
    wheelRadii: spec.wheels.map((w) => w.r * S),
    exhausts: pipes.map(v),
    eye: v(spec.eye),
    extent: { halfW: spec.halfW * S, front: spec.nose * S, back: spec.tail * S, top: spec.roof.y * S },
    dispose: () => {
      for (const d of disposables) d.dispose();
      shadow.clear();
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
