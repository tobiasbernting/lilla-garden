// Turns a dungeon's tile grid into Three.js meshes: one merged floor, one instanced wall mesh, a few merged
// decor meshes, and the collision grid the player and camera use. Everything is built once, so the draw
// call count stays tiny (that is the point of the 3D proof of concept: old tablets must keep up).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_H, MAP_W, objectDef, type SagaDungeonDef, type Terrain, type WorldState } from '@lilla-garden/shared';

export interface SagaWorld {
  group: THREE.Group;
  /** Can a point stand here? False for rock, walls, a closed gate and solid decor. */
  isWalkable(x: number, z: number): boolean;
  /** Does this spot hide the view (walls, a closed gate, the void)? Low decor does not, so the camera can look over it. */
  blocksView(x: number, z: number): boolean;
  /** Where the flames are (torches and braziers): the integrator hangs the few real lights on the nearest ones. */
  torches: THREE.Vector3[];
  start: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  setGateOpen(open: boolean): void;
  dispose(): void;
}

export const WALL_H = 1.6;

type V3 = [number, number, number];

const hex = (n: number): THREE.Color => new THREE.Color(n);
/** A stable pseudo-random number 0..1 for a tile. */
const hash = (x: number, y: number, s = 0): number => {
  let h = Math.imul(x + 374761393 * (s + 1), 668265263) ^ Math.imul(y + 1442695041, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Floor colours by terrain (sRGB hex). `alt` is the second colour of the checker (default: the same colour a touch darker),
 * `streak` lightens a few soft diagonal glints (ice). The lights are kept low, so these read as the colour you see.
 */
const FLOOR: Partial<Record<Terrain, { base: number; alt?: number; streak?: number }>> = {
  crypt: { base: 0x8a93b0 },
  // the throne room: a darker slate with a hint of violet, in the crypt's palette but clearly a grander room
  floor_stone: { base: 0x6d6a88, alt: 0x5f5c7b },
  // soft pale blue-white snow with a faint cool checker
  snow: { base: 0xe2edf8, alt: 0xcddff0 },
  // glassy blue ice with lighter streaks
  ice: { base: 0x8ab9e2, alt: 0x7aacd9, streak: 0xd2ecff },
  ash: { base: 0x58474f },
  forge: { base: 0x5a4864 },
};
const WALL_BASE = [0x8f9bb8, 0xeef7ff, 0x4d4260];
/** What the dark base row of the wall block is tinted by (multiplies the instance colour), per wall look. */
const WALL_BAND: V3[] = [
  [0.62, 0.66, 0.74],
  [0.5, 0.64, 0.86],
  [0.55, 0.45, 0.5],
];

// ---- shared primitive geometries (unit sized; parts scale them) ----
const prim = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10, 1),
  cone: new THREE.ConeGeometry(1, 1, 8, 1),
  cone5: new THREE.ConeGeometry(1, 1, 5, 1),
  half: new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI),
  torus: new THREE.TorusGeometry(1, 0.2, 5, 14),
  ring: new THREE.RingGeometry(0.78, 1, 20),
  disc: new THREE.CircleGeometry(1, 16),
  oct: new THREE.OctahedronGeometry(1, 0),
};
type Prim = keyof typeof prim;

/** Collects coloured parts of one kind of mesh and merges them into one geometry at the end. */
class Bake {
  private parts: THREE.BufferGeometry[] = [];
  /** Per object: where in the flicker cycle its flames are, so no two torches pulse together. */
  phase = 0;
  constructor(private glow: boolean) {}
  /** Adds a primitive: size (scale), position, rotation (euler XYZ), colour. A `flame` part flickers (see `flickerMaterial`). */
  add(p: Prim, color: number | THREE.Color, size: V3 | number, pos: V3, rot: V3 = [0, 0, 0], base?: THREE.Matrix4, tint = 1, flame = false): void {
    const g = prim[p].clone();
    g.deleteAttribute('uv');
    const s: V3 = typeof size === 'number' ? [size, size, size] : size;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
    if (base) m.premultiply(base);
    g.applyMatrix4(m);
    const c = typeof color === 'number' ? hex(color) : color;
    const n = g.getAttribute('normal');
    const col = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) {
      // emissive parts get their shading painted in (a lit top, a darker underside) because no light touches them
      const k = this.glow ? 0.8 + 0.2 * Math.max(-1, Math.min(1, n.getY(i))) : 1;
      col[i * 3] = c.r * k * tint;
      col[i * 3 + 1] = c.g * k * tint;
      col[i * 3 + 2] = c.b * k * tint;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.glow) {
      // x: how much this vertex flickers (0 = not at all), y: the phase, z: the height it grows from (the foot of the flame)
      g.computeBoundingBox();
      const footY = g.boundingBox!.min.y;
      const fl = new Float32Array(n.count * 3);
      if (flame) for (let i = 0; i < n.count; i++) fl.set([1, this.phase, footY], i * 3);
      g.setAttribute('flick', new THREE.BufferAttribute(fl, 3));
    }
    this.parts.push(g);
  }
  get empty(): boolean {
    return this.parts.length === 0;
  }
  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

/** What a decor builder draws with: `s` for lit parts, `g` for glowing ones, both in the object's local frame. */
interface Ctx {
  s(p: Prim, color: number, size: V3 | number, pos: V3, rot?: V3): void;
  g(p: Prim, color: number, size: V3 | number, pos: V3, rot?: V3): void;
  /** Like `g`, but the part flickers: it grows and shrinks a little from its foot. */
  f(p: Prim, color: number, size: V3 | number, pos: V3, rot?: V3): void;
  variant: number;
  /** A flame position in the local frame, recorded as a point-light candidate. `pool` is where its light lands on the floor (x, z in the local frame; default straight below). */
  flame(pos: V3, pool?: [number, number]): void;
}

type Builder = (c: Ctx) => void;

const WOOD = 0x9a6a46;
const IRON = 0x474c5c;
const GOLD = 0xffd24a;

const DECOR: Record<string, Builder> = {
  // a post against the wall to the north, with a warm flame in a cup (the local frame has the wall at z = -0.5)
  saga_torch: (c) => {
    c.s('box', WOOD, [0.1, 0.55, 0.1], [0, 0.85, -0.38]);
    c.s('cyl', IRON, [0.11, 0.1, 0.11], [0, 1.16, -0.34]);
    c.s('box', IRON, [0.2, 0.05, 0.05], [0, 0.72, -0.4]);
    c.f('sphere', 0xff8a2a, [0.1, 0.15, 0.1], [0, 1.34, -0.34]);
    c.f('cone', 0xff8a2a, [0.08, 0.2, 0.08], [0, 1.5, -0.34]);
    c.f('sphere', 0xffe27a, [0.06, 0.09, 0.06], [0, 1.32, -0.34]);
    // the torch hangs on the wall, so its light falls on the floor half a tile out from it
    c.flame([0, 1.42, -0.2], [0, 0.55]);
  },
  saga_candles: (c) => {
    c.s('cyl', IRON, [0.28, 0.03, 0.28], [0, 0.03, 0]);
    // x, height, z
    const spots: V3[] = [
      [-0.1, 0.08, 0.2],
      [0.12, 0.14, -0.06],
      [-0.02, 0.1, -0.16],
    ];
    for (const [x, h, z] of spots) {
      c.s('cyl', 0xfff1d0, [0.045, h, 0.045], [x, 0.05 + h / 2, z]);
      c.f('cone', 0xffc04a, [0.03, 0.09, 0.03], [x, 0.05 + h + 0.05, z]);
    }
  },
  saga_brazier: (c) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      c.s('cyl', IRON, [0.045, 0.5, 0.045], [Math.sin(a) * 0.2, 0.25, Math.cos(a) * 0.2], [-Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25]);
    }
    c.s('cyl', 0x5a5f72, [0.34, 0.2, 0.34], [0, 0.6, 0]);
    c.s('torus', IRON, [0.34, 0.34, 0.34], [0, 0.7, 0], [Math.PI / 2, 0, 0]);
    c.f('sphere', 0xff7a1e, [0.22, 0.2, 0.22], [0, 0.78, 0]);
    c.f('cone', 0xff7a1e, [0.17, 0.4, 0.17], [0, 1.0, 0]);
    c.f('cone', 0xffd45a, [0.1, 0.28, 0.1], [0, 0.94, 0]);
    c.flame([0, 1.1, 0]);
  },
  // flat glowing cracks in the floor
  saga_lavacrack: (c) => {
    const seg: [number, number, number, number, number][] = [
      [-0.3, -0.1, 0.34, 0.06, 0.4],
      [-0.05, 0.05, 0.3, 0.07, -0.5],
      [0.2, -0.02, 0.28, 0.06, 0.3],
      [0.05, 0.28, 0.24, 0.05, 1.2],
      [-0.2, 0.3, 0.2, 0.05, -0.9],
    ];
    for (const [x, z, l, w, a] of seg) c.g('box', 0xff6a1a, [l, 0.02, w], [x, 0.015, z], [0, a, 0]);
    for (const [x, z, l, w, a] of seg) c.g('box', 0xffc24a, [l * 0.7, 0.025, w * 0.4], [x, 0.02, z], [0, a, 0]);
  },
  saga_coffin: (c) => {
    c.s('box', 0x6d4a3a, [0.66, 0.4, 1.0], [0, 0.2, 0]);
    c.s('box', 0x8a6048, [0.72, 0.14, 1.04], [0, 0.45, 0]);
    c.s('box', 0x8a6048, [0.5, 0.1, 0.82], [0, 0.56, 0]);
    c.s('box', GOLD, [0.07, 0.03, 0.5], [0, 0.62, 0]);
    c.s('box', GOLD, [0.3, 0.03, 0.07], [0, 0.62, -0.1]);
  },
  saga_bones: (c) => {
    const bone = 0xf2e9d0;
    c.s('cyl', bone, [0.03, 0.34, 0.03], [-0.15, 0.03, 0.1], [Math.PI / 2, 0, 0.5]);
    c.s('cyl', bone, [0.03, 0.3, 0.03], [0.12, 0.03, -0.12], [Math.PI / 2, 0, -0.9]);
    c.s('sphere', bone, [0.04, 0.04, 0.04], [-0.3, 0.04, 0.2]);
    c.s('sphere', bone, [0.04, 0.04, 0.04], [0.0, 0.04, -0.01]);
    c.s('sphere', bone, [0.13, 0.11, 0.12], [0.22, 0.1, 0.18]);
    c.s('sphere', 0x2b2433, [0.025, 0.03, 0.02], [0.18, 0.12, 0.29]);
    c.s('sphere', 0x2b2433, [0.025, 0.03, 0.02], [0.27, 0.12, 0.29]);
  },
  saga_urn: (c) => {
    const clay = c.variant === 1 ? 0x5ea5c7 : c.variant === 2 ? 0xd7a24a : 0xc9724a;
    c.s('sphere', clay, [0.3, 0.32, 0.3], [0, 0.33, 0]);
    c.s('cyl', clay, [0.14, 0.14, 0.14], [0, 0.66, 0]);
    c.s('torus', 0xf1d8a8, [0.16, 0.16, 0.16], [0, 0.74, 0], [Math.PI / 2, 0, 0]);
    c.s('torus', 0xf1d8a8, [0.3, 0.3, 0.3], [0, 0.4, 0], [Math.PI / 2, 0, 0]);
    c.s('torus', clay, [0.1, 0.1, 0.1], [0.32, 0.45, 0], [0, Math.PI / 2, 0]);
    c.s('torus', clay, [0.1, 0.1, 0.1], [-0.32, 0.45, 0], [0, Math.PI / 2, 0]);
  },
  saga_icecrystal: (c) => {
    const shards: [number, number, number, number, number, number][] = [
      [0, 0, 0.17, 0.95, 0, 0],
      [-0.2, 0.1, 0.12, 0.6, 0.25, -0.3],
      [0.2, -0.08, 0.13, 0.7, -0.2, 0.35],
      [0.05, -0.22, 0.09, 0.45, -0.3, -0.1],
    ];
    for (const [x, z, r, h, rx, rz] of shards) {
      c.g('cone5', 0xb4ecff, [r, h, r], [x, h / 2, z], [rx, 0, rz]);
      c.g('cone5', 0xe8fbff, [r * 0.5, h * 0.55, r * 0.5], [x, h * 0.55, z], [rx, 0, rz]);
    }
  },
  saga_frozenpillar: (c) => {
    c.s('cyl', 0xbfe3f5, [0.42, 0.14, 0.42], [0, 0.07, 0]);
    c.s('cyl', 0xdaf2fc, [0.3, 1.3, 0.3], [0, 0.75, 0]);
    c.s('cyl', 0xbfe3f5, [0.4, 0.16, 0.4], [0, 1.48, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      c.s('cone5', 0xeafaff, [0.05, 0.28 + (i % 2) * 0.12, 0.05], [Math.sin(a) * 0.3, 1.25, Math.cos(a) * 0.3], [Math.PI, 0, 0]);
    }
    c.g('box', 0xa6e6ff, [0.03, 0.9, 0.03], [0.17, 0.78, 0.2]);
  },
  saga_snowdrift: (c) => {
    c.s('sphere', 0xffffff, [0.42, 0.16, 0.34], [0, 0.02, 0]);
    c.s('sphere', 0xf3f8ff, [0.26, 0.12, 0.24], [0.28, 0.02, 0.18]);
    c.s('sphere', 0xf3f8ff, [0.2, 0.1, 0.2], [-0.25, 0.02, -0.2]);
  },
  saga_anvil: (c) => {
    c.s('cyl', 0x7a5638, [0.3, 0.3, 0.3], [0, 0.15, 0]);
    c.s('box', IRON, [0.34, 0.14, 0.3], [0, 0.37, 0]);
    c.s('box', IRON, [0.24, 0.12, 0.2], [0, 0.48, 0]);
    c.s('box', 0x5a6074, [0.5, 0.12, 0.28], [0, 0.6, 0]);
    c.s('cone', 0x5a6074, [0.1, 0.26, 0.1], [0.37, 0.6, 0], [0, 0, -Math.PI / 2]);
    c.g('box', 0xff8a2a, [0.14, 0.03, 0.1], [-0.05, 0.67, 0]);
  },
  // a flat glowing rune circle where you step out of the dungeon
  saga_exit: (c) => {
    c.g('ring', 0xffe08a, 0.46, [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
    c.g('ring', 0x9be8ff, 0.3, [0, 0.025, 0], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.g('box', 0xffe08a, [0.03, 0.01, 0.1], [Math.sin(a) * 0.19, 0.03, Math.cos(a) * 0.19], [0, a, 0]);
    }
    c.g('disc', 0xcff6ff, 0.07, [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
  },
  // a standing rune stone that glows a soft green, with a ring on the floor around it
  saga_rest: (c) => {
    c.s('cyl', 0x77828f, [0.36, 0.12, 0.36], [0, 0.06, 0]);
    c.s('box', 0x98a4b4, [0.36, 0.8, 0.24], [0, 0.52, 0]);
    c.s('sphere', 0x98a4b4, [0.19, 0.12, 0.13], [0, 0.92, 0]);
    c.g('box', 0x7dffa8, [0.05, 0.3, 0.02], [0, 0.55, 0.13]);
    c.g('box', 0x7dffa8, [0.18, 0.04, 0.02], [0, 0.6, 0.13]);
    c.g('box', 0x7dffa8, [0.14, 0.04, 0.02], [0, 0.45, 0.13], [0, 0, 0.5]);
    c.g('ring', 0x66ee96, 0.7, [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
  },
  saga_chest: (c) => {
    c.s('box', WOOD, [0.7, 0.34, 0.48], [0, 0.17, 0]);
    // a rounded lid: half a cylinder lying along x
    c.s('half', 0xb07a4e, [0.24, 0.7, 0.24], [0, 0.34, 0], [0, 0, Math.PI / 2]);
    c.s('box', GOLD, [0.74, 0.07, 0.07], [0, 0.17, 0.23]);
    c.s('box', GOLD, [0.08, 0.36, 0.5], [-0.24, 0.2, 0]);
    c.s('box', GOLD, [0.08, 0.36, 0.5], [0.24, 0.2, 0]);
    c.g('box', 0xffe9a0, [0.1, 0.12, 0.05], [0, 0.34, 0.26]);
  },
};

/** The gate is built facing along local x (a bar across the corridor); `along` rotates it. */
const GATE: Record<number, Builder> = {
  0: (c) => {
    c.s('box', IRON, [1, 0.12, 0.2], [0, 0.06, 0]);
    c.s('box', IRON, [1, 0.12, 0.2], [0, 1.46, 0]);
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) c.s('cyl', 0x585e72, [0.045, 1.4, 0.045], [x, 0.76, 0]);
    c.s('box', 0x585e72, [1, 0.05, 0.05], [0, 0.9, 0]);
  },
  1: (c) => {
    c.s('box', 0xa7dcf6, [0.99, 1.45, 0.5], [0, 0.72, 0]);
    c.s('box', 0xd2f0fd, [0.99, 0.18, 0.54], [0, 1.45, 0]);
    for (const x of [-0.3, 0, 0.3]) c.s('cone5', 0xeafaff, [0.07, 0.3, 0.07], [x, 1.2, 0.27], [Math.PI, 0, 0]);
    c.g('box', 0xe2f8ff, [0.04, 1.0, 0.02], [0.2, 0.7, 0.26]);
  },
  2: (c) => {
    c.s('box', 0x2f2833, [0.99, 1.45, 0.6], [0, 0.72, 0]);
    c.s('box', 0x4a3a52, [0.99, 0.16, 0.64], [0, 1.45, 0]);
    c.g('box', 0xff7a1e, [0.1, 1.2, 0.64], [0, 0.72, 0]);
    c.g('box', 0xff7a1e, [0.99, 0.08, 0.64], [0, 0.7, 0]);
    c.g('box', 0xffd45a, [0.04, 1.2, 0.66], [0, 0.72, 0]);
  },
};

/**
 * A flat-shaded block (a box, or a tapered one when `w1` differs from `w0`) with no bottom face, since nobody sees it.
 * Vertex colours are baked: `kFoot` at the bottom edge fading to `kHead` at the top edge, `kTop` on the top face, all times `tint`.
 */
function block(w0: number, w1: number, y0: number, h: number, kFoot: number, kHead: number, kTop: number, tint: V3, top = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const a = w0 / 2;
  const b = w1 / 2;
  const y1 = y0 + h;
  const put = (p: V3, n: V3, k: number): void => {
    pos.push(...p);
    nor.push(...n);
    col.push(tint[0] * k, tint[1] * k, tint[2] * k);
  };
  // each side: two bottom corners, two top corners (counter-clockwise seen from outside), normal tilted by the taper
  const tilt = (w0 - w1) / 2 / h;
  for (const [dx, dz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ] as const) {
    // the side's own axis (to the right when looking at it from outside)
    const rx = dz;
    const rz = -dx;
    const bl: V3 = [dx * a - rx * a, y0, dz * a - rz * a];
    const br: V3 = [dx * a + rx * a, y0, dz * a + rz * a];
    const tr: V3 = [dx * b + rx * b, y1, dz * b + rz * b];
    const tl: V3 = [dx * b - rx * b, y1, dz * b - rz * b];
    const len = Math.hypot(1, tilt);
    const n: V3 = [(dx * 1) / len, tilt / len, (dz * 1) / len];
    put(bl, n, kFoot);
    put(br, n, kFoot);
    put(tr, n, kHead);
    put(bl, n, kFoot);
    put(tr, n, kHead);
    put(tl, n, kHead);
  }
  if (top) {
    const up: V3 = [0, 1, 0];
    for (const p of [
      [-b, -b],
      [-b, b],
      [b, b],
      [-b, -b],
      [b, b],
      [b, -b],
    ] as const)
      put([p[0], y1, p[1]], up, kTop);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildWorld(world: WorldState, def: SagaDungeonDef): SagaWorld {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => (disposables.push(d), d);

  // ---- classify every tile ----
  /** 0 void or wall, 1 floor, 2 gate. */
  const kind = new Uint8Array(MAP_W * MAP_H);
  const solid = new Uint8Array(MAP_W * MAP_H);
  const wallVariant = new Int8Array(MAP_W * MAP_H).fill(-1);
  const idx = (x: number, y: number): number => y * MAP_W + x;
  const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  for (const o of Object.values(world.objects)) if (o.kind === 'saga_wall') wallVariant[idx(o.x, o.y)] = o.variant ?? def.wall;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const t = world.terrain[idx(x, y)];
      if (t && t !== 'rock' && t !== 'basalt' && wallVariant[idx(x, y)]! < 0) kind[idx(x, y)] = 1;
    }
  const gates: { x: number; y: number; variant: number }[] = [];
  for (const o of Object.values(world.objects)) {
    if (o.kind === 'saga_gate') {
      kind[idx(o.x, o.y)] = 2;
      gates.push({ x: o.x, y: o.y, variant: o.variant ?? def.wall });
    } else if (kind[idx(o.x, o.y)] === 1 && o.kind !== 'saga_wall' && objectDef(o.kind).solid) solid[idx(o.x, o.y)] = 1;
  }
  let gateOpen = false;
  const isFloorTile = (x: number, y: number): boolean => inb(x, y) && kind[idx(x, y)] !== 0;

  // ---- bounds: only the dungeon's own box is drawn ----
  let minX = MAP_W;
  let minZ = MAP_H;
  let maxX = 0;
  let maxZ = 0;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (kind[idx(x, y)] !== 0 || wallVariant[idx(x, y)]! >= 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + 1);
        minZ = Math.min(minZ, y);
        maxZ = Math.max(maxZ, y + 1);
      }

  // ---- the floor: one quad per tile in ONE geometry, vertex colours with a little variation and a soft dark edge by the walls ----
  {
    const pos: number[] = [];
    const col: number[] = [];
    const ind: number[] = [];
    const c = new THREE.Color();
    const streak = new THREE.Color();
    for (let y = minZ; y < maxZ; y++)
      for (let x = minX; x < maxX; x++) {
        if (!isFloorTile(x, y)) continue;
        const terrain = world.terrain[idx(x, y)] ?? 'crypt';
        const look = FLOOR[terrain];
        const odd = (x + y) % 2 === 0;
        c.setHex(look ? (odd ? look.base : (look.alt ?? look.base)) : 0x888899);
        const k = (look?.alt ? 1 : odd ? 1.03 : 0.97) * (0.96 + hash(x, y) * 0.08);
        const base = pos.length / 3;
        for (const [cx, cz] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as const) {
          const vx = x + cx;
          const vz = y + cz;
          // corners next to walls get darker, which reads as a rounded, soft-lit floor
          let walls = 0;
          for (const [ox, oz] of [
            [-1, -1],
            [0, -1],
            [-1, 0],
            [0, 0],
          ] as const) if (!isFloorTile(vx + ox, vz + oz)) walls++;
          const ao = 1 - 0.14 * walls;
          // ice: a few soft pale glints on the tile corners, and a diagonal line now and then, like light in glass
          let glint = 0;
          if (look?.streak) {
            streak.setHex(look.streak);
            glint = (hash(vx, vz, 77) < 0.16 ? 0.4 : 0) + ((vx - vz + 70) % 7 === 0 ? 0.25 : 0);
          }
          pos.push(vx, 0, vz);
          col.push(
            (c.r + (streak.r - c.r) * glint) * k * ao,
            (c.g + (streak.g - c.g) * glint) * k * ao,
            (c.b + (streak.b - c.b) * glint) * k * ao,
          );
        }
        ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const normals = new Float32Array(pos.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setIndex(ind);
    g.computeBoundingSphere();
    const floor = new THREE.Mesh(g, track(new THREE.MeshLambertMaterial({ vertexColors: true })));
    floor.matrixAutoUpdate = false;
    group.add(floor);
  }

  // ---- walls: one InstancedMesh of chunky blocks: a dark, slightly wider base row, an inset body that gets lighter
  // towards the top, and a bevelled, lighter cap. All painted with vertex colours, so it is still a single draw call ----
  {
    const band = WALL_BAND[Math.min(2, Math.max(0, def.wall))]!;
    const white: V3 = [1, 1, 1];
    const parts = [
      block(1, 1, 0, 0.3, 0.42, 0.55, 0.8, band),
      block(0.94, 0.94, 0.3, 1.0, 0.7, 0.95, 0, white, false),
      block(1, 0.9, 1.3, 0.3, 1.02, 1.12, 1.3, white),
    ];
    const geo = track(mergeGeometries(parts, false));
    for (const p of parts) p.dispose();
    const tiles: { x: number; y: number; v: number }[] = [];
    for (let y = minZ; y < maxZ; y++) for (let x = minX; x < maxX; x++) if (wallVariant[idx(x, y)]! >= 0) tiles.push({ x, y, v: wallVariant[idx(x, y)]! });
    const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const walls = new THREE.InstancedMesh(geo, mat, Math.max(1, tiles.length));
    walls.count = tiles.length;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const moss: THREE.Matrix4[] = [];
    const cracks: THREE.Matrix4[] = [];
    const bricks: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    tiles.forEach((t, i) => {
      m.makeTranslation(t.x + 0.5, 0, t.y + 0.5);
      walls.setMatrixAt(i, m);
      const v = Math.min(2, Math.max(0, t.v));
      c.setHex(WALL_BASE[v]!);
      const r = hash(t.x, t.y, 3);
      c.multiplyScalar(0.93 + r * 0.14);
      if (v === 0 && hash(t.x, t.y, 4) < 0.22) c.lerp(hex(0x78b06e), 0.4);
      walls.setColorAt(i, c);
      if (v === 0 && hash(t.x, t.y, 4) < 0.22) {
        // a hint of moss: a couple of squashed green blobs on the cap
        for (let n = 0; n < 2; n++) {
          const ox = (hash(t.x, t.y, 5 + n) - 0.5) * 0.7;
          const oz = (hash(t.x, t.y, 7 + n) - 0.5) * 0.7;
          const s = 0.12 + hash(t.x, t.y, 9 + n) * 0.1;
          moss.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x + 0.5 + ox, 1.6, t.y + 0.5 + oz), new THREE.Quaternion(), new THREE.Vector3(s * 1.6, s * 0.7, s * 1.6)));
        }
      }
      if (v === 0) {
        // a brick or two sticking out of the faces that look into the room, so the stone does not read as a plain box
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (!isFloorTile(t.x + dx, t.y + dz) || hash(t.x, t.y, 80 + dx * 3 + dz) > 0.38) continue;
          const yy = 0.42 + hash(t.x, t.y, 90 + dx + dz * 2) * 0.7;
          const off = (hash(t.x, t.y, 100 + dx + dz * 2) - 0.5) * 0.5;
          const w = 0.26 + hash(t.x, t.y, 110 + dx + dz * 2) * 0.12;
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
          const sideways = new THREE.Vector3(dz !== 0 ? 1 : 0, 0, dx !== 0 ? 1 : 0).multiplyScalar(off);
          const mx = new THREE.Matrix4().compose(
            new THREE.Vector3(t.x + 0.5 + dx * 0.485 + sideways.x, yy, t.y + 0.5 + dz * 0.485 + sideways.z),
            q,
            new THREE.Vector3(w, 0.15, 0.1),
          );
          bricks.push({ m: mx, c: c.clone().multiplyScalar(1.08 + hash(t.x, t.y, 120 + dx + dz * 2) * 0.12) });
        }
      }
      if (v === 2) {
        // glowing cracks on the sides that face the floor
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (!isFloorTile(t.x + dx, t.y + dz) || hash(t.x, t.y, 20 + dx * 3 + dz) > 0.5) continue;
          const yy = 0.4 + hash(t.x, t.y, 30 + dx + dz * 2) * 0.55;
          const off = (hash(t.x, t.y, 40 + dx + dz * 2) - 0.5) * 0.4;
          const yaw = Math.atan2(dx, dz);
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          const sideways = new THREE.Vector3(dz !== 0 ? 1 : 0, 0, dx !== 0 ? 1 : 0).multiplyScalar(off);
          cracks.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x + 0.5 + dx * 0.47 + sideways.x, yy, t.y + 0.5 + dz * 0.47 + sideways.z), q, new THREE.Vector3(1, 1, 1)));
        }
      }
    });
    walls.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    walls.computeBoundingSphere();
    group.add(walls);
    if (moss.length) {
      const g = track(new THREE.IcosahedronGeometry(1, 0));
      const mm = new THREE.InstancedMesh(g, track(new THREE.MeshLambertMaterial({ color: 0x74b85a })), moss.length);
      moss.forEach((mx, i) => mm.setMatrixAt(i, mx));
      mm.computeBoundingSphere();
      group.add(mm);
    }
    if (bricks.length) {
      const mm = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), track(new THREE.MeshLambertMaterial({ color: 0xffffff })), bricks.length);
      bricks.forEach((b, i) => {
        mm.setMatrixAt(i, b.m);
        mm.setColorAt(i, b.c);
      });
      mm.computeBoundingSphere();
      group.add(mm);
    }
    if (cracks.length) {
      // a jagged crack: three thin slabs, glowing (unlit) so the basalt looks like it has lava inside
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, y, w, h, a] of [
        [-0.1, 0.0, 0.07, 0.3, 0.25],
        [0.0, 0.22, 0.06, 0.24, -0.5],
        [0.08, -0.2, 0.05, 0.26, 0.6],
      ] as const) {
        const p = new THREE.BoxGeometry(w, h, 0.03);
        p.rotateZ(a);
        p.translate(x, y, 0);
        parts.push(p);
      }
      const g = track(mergeGeometries(parts, false));
      for (const p of parts) p.dispose();
      const mm = new THREE.InstancedMesh(g, track(new THREE.MeshBasicMaterial({ color: 0xff8a2a })), cracks.length);
      cracks.forEach((mx, i) => mm.setMatrixAt(i, mx));
      mm.computeBoundingSphere();
      group.add(mm);
    }
  }

  // ---- decor: baked into one lit mesh and one glowing mesh (whose flames flicker in the vertex shader) ----
  const torches: THREE.Vector3[] = [];
  /** Where each flame's light lands on the floor, in world x and z. */
  const pools: { x: number; z: number; r: number }[] = [];
  /** Shared by every flickering thing; written once per draw, so nothing is allocated per frame. */
  const clock = { value: 0 };
  {
    const lit = new Bake(false);
    const glow = new Bake(true);
    for (const o of Object.values(world.objects)) {
      const build = DECOR[o.kind];
      if (!build) continue;
      const variant = o.variant ?? 0;
      // things lean a little differently from one another so rows of urns do not look stamped
      const yaw = o.kind === 'saga_torch' ? 0 : (hash(o.x, o.y, 50) - 0.5) * 0.6 + (o.kind === 'saga_coffin' ? (variant % 2) * Math.PI : 0);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(o.x + 0.5, 0, o.y + 0.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      const tint = 0.94 + hash(o.x, o.y, 60) * 0.12;
      glow.phase = hash(o.x, o.y, 70) * Math.PI * 2;
      build({
        variant,
        s: (p, color, size, pos, rot) => lit.add(p, color, size, pos, rot, base, tint),
        g: (p, color, size, pos, rot) => glow.add(p, color, size, pos, rot, base),
        f: (p, color, size, pos, rot) => glow.add(p, color, size, pos, rot, base, 1, true),
        flame: (pos, pool) => {
          const at = new THREE.Vector3(pos[0], pos[1], pos[2]).applyMatrix4(base);
          torches.push(at);
          const on = new THREE.Vector3(pool?.[0] ?? pos[0], 0, pool?.[1] ?? pos[2]).applyMatrix4(base);
          pools.push({ x: on.x, z: on.z, r: o.kind === 'saga_torch' ? 2.7 : 2.3 });
        },
      });
    }
    const litGeo = lit.build();
    if (litGeo) group.add(new THREE.Mesh(track(litGeo), track(new THREE.MeshLambertMaterial({ vertexColors: true }))));
    const glowGeo = glow.build();
    if (glowGeo) {
      const mat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
      // flames grow and shrink a little from their foot; the cost is one sine pair per vertex of a few dozen flames
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = clock;
        sh.vertexShader = sh.vertexShader
          .replace('void main() {', 'attribute vec3 flick;\nuniform float uTime;\nvoid main() {')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float fl = sin(uTime * 11.0 + flick.y) * 0.6 + sin(uTime * 27.0 + flick.y * 2.3) * 0.4;
            transformed.y = flick.z + (transformed.y - flick.z) * (1.0 + 0.2 * fl * flick.x);`,
          );
      };
      const glowMesh = new THREE.Mesh(track(glowGeo), mat);
      glowMesh.onBeforeRender = () => {
        clock.value = (performance.now() / 1000) % 1000;
      };
      group.add(glowMesh);
    }
  }

  // ---- light pools: warm additive patches on the floor tiles around each flame, so torches far from the four real lights
  // still read as lit. One merged geometry, tiles only (the light never leaks through a wall) ----
  if (pools.length) {
    const pos: number[] = [];
    const col: number[] = [];
    const ind: number[] = [];
    for (const pl of pools) {
      for (let ty = Math.floor(pl.z - pl.r); ty <= Math.ceil(pl.z + pl.r); ty++)
        for (let tx = Math.floor(pl.x - pl.r); tx <= Math.ceil(pl.x + pl.r); tx++) {
          if (!isFloorTile(tx, ty)) continue;
          const base = pos.length / 3;
          let any = false;
          for (const [cx, cz] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ] as const) {
            const f = Math.max(0, 1 - Math.hypot(tx + cx - pl.x, ty + cz - pl.z) / pl.r);
            const k = f * f * 0.15;
            if (k > 0) any = true;
            pos.push(tx + cx, 0.012, ty + cz);
            col.push(1.0 * k, 0.5 * k, 0.16 * k);
          }
          if (any) {
            ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
          } else {
            pos.length -= 12;
            col.length -= 12;
          }
        }
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ind);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // ---- flame halos: one Points draw for every flame, a soft warm glow that pulses (additive, fades out with distance) ----
  if (torches.length) {
    const pts = new Float32Array(torches.length * 3);
    const info = new Float32Array(torches.length * 2);
    torches.forEach((t, i) => {
      pts.set([t.x, t.y - 0.05, t.z], i * 3);
      info.set([hash(i, 5, 71) * Math.PI * 2, 0.95], i * 2);
    });
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    g.setAttribute('halo', new THREE.BufferAttribute(info, 2));
    g.computeBoundingSphere();
    const size = new THREE.Vector2();
    const uniforms = { uTime: clock, uScale: { value: 600 } };
    const mat = track(
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute vec2 halo;
          uniform float uTime;
          uniform float uScale;
          varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float flick = 1.0 + 0.1 * sin(uTime * 9.0 + halo.x) + 0.06 * sin(uTime * 31.0 + halo.x * 1.7);
            float d = -mv.z;
            gl_PointSize = uScale * halo.y * flick / d;
            vAlpha = (1.0 - smoothstep(12.0, 26.0, d)) * flick;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying float vAlpha;
          void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float a = max(0.0, 1.0 - dot(p, p));
            a *= a;
            gl_FragColor = vec4(vec3(1.0, 0.56, 0.22) * a * 0.5 * vAlpha, 1.0);
          }`,
      }),
    );
    const halos = new THREE.Points(g, mat);
    halos.frustumCulled = false;
    halos.renderOrder = 2;
    halos.onBeforeRender = (renderer, _scene, camera) => {
      clock.value = (performance.now() / 1000) % 1000;
      // point sizes are in pixels: world size times (half the drawing buffer height over tan(fov/2)) over distance
      renderer.getDrawingBufferSize(size);
      uniforms.uScale.value = size.y * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
    };
    group.add(halos);
  }

  // ---- the gate: bars, an ice wall or a lava wall per tile; setGateOpen hides the lot ----
  const gateGroup = new THREE.Group();
  {
    const lit = new Bake(false);
    const glow = new Bake(true);
    const isGate = (x: number, y: number): boolean => inb(x, y) && kind[idx(x, y)] === 2;
    for (const gt of gates) {
      // the gate tiles of one corridor stand in a row; the row runs along x or along z
      const alongX = isGate(gt.x - 1, gt.y) || isGate(gt.x + 1, gt.y);
      const base = new THREE.Matrix4().compose(
        new THREE.Vector3(gt.x + 0.5, 0, gt.y + 0.5),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongX ? 0 : Math.PI / 2),
        new THREE.Vector3(1, 1, 1),
      );
      (GATE[Math.min(2, Math.max(0, gt.variant))] ?? GATE[0]!)({
        variant: 0,
        s: (p, color, size, pos, rot) => lit.add(p, color, size, pos, rot, base),
        g: (p, color, size, pos, rot) => glow.add(p, color, size, pos, rot, base),
        f: (p, color, size, pos, rot) => glow.add(p, color, size, pos, rot, base),
        flame: () => {},
      });
    }
    const litGeo = lit.build();
    if (litGeo) gateGroup.add(new THREE.Mesh(track(litGeo), track(new THREE.MeshLambertMaterial({ vertexColors: true }))));
    const glowGeo = glow.build();
    if (glowGeo) gateGroup.add(new THREE.Mesh(track(glowGeo), track(new THREE.MeshBasicMaterial({ vertexColors: true }))));
    group.add(gateGroup);
  }

  const start = world.saga ? { x: world.saga.start.x + 0.5, z: world.saga.start.y + 0.5 } : { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };

  const isWalkable = (x: number, z: number): boolean => {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    if (!inb(tx, tz)) return false;
    const i = idx(tx, tz);
    const k = kind[i];
    if (k === 1) return solid[i] === 0;
    return k === 2 && gateOpen;
  };
  const blocksView = (x: number, z: number): boolean => {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    if (!inb(tx, tz)) return true;
    const k = kind[idx(tx, tz)];
    return k === 0 || (k === 2 && !gateOpen);
  };

  return {
    group,
    isWalkable,
    blocksView,
    torches,
    start,
    bounds: { minX, maxX, minZ, maxZ },
    setGateOpen(open: boolean) {
      gateOpen = open;
      gateGroup.visible = !open;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
      group.removeFromParent();
    },
  };
}
