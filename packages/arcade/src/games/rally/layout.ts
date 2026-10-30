// Where things are round the circuit: the lake and the stream, fields, forests, farms and pastures.
import { fbm, smooth } from './util.ts';

export const WATER_Y = 0.55;

export const LAKE = { cx: -150, cz: 26, rx: 58, rz: 33, rot: 0.25 };

/** 1 at the lake's edge, less inside. */
export function lakeDist(x: number, z: number): number {
  const c = Math.cos(LAKE.rot);
  const s = Math.sin(LAKE.rot);
  const dx = x - LAKE.cx;
  const dz = z - LAKE.cz;
  const u = (dx * c + dz * s) / LAKE.rx;
  const v = (-dx * s + dz * c) / LAKE.rz;
  // a slightly wobbly shore
  return Math.hypot(u, v) * (1 + 0.06 * Math.sin(Math.atan2(v, u) * 3 + 1.2));
}

/** The stream from the hills in the west, under the bridge, into the lake. */
export const STREAM: [number, number][] = [
  [-640, -70],
  [-540, -40],
  [-450, -22],
  [-370, -8],
  [-310, -2],
  [-259, 2],
  [-226, 10],
  [-200, 18],
];

/** Distance to the stream and how far along it (0 at the source, 1 at the lake). */
export function streamDist(x: number, z: number): { d: number; t: number } {
  let best = Infinity;
  let bt = 0;
  let acc = 0;
  let total = 0;
  for (let i = 0; i < STREAM.length - 1; i++) total += Math.hypot(STREAM[i + 1]![0] - STREAM[i]![0], STREAM[i + 1]![1] - STREAM[i]![1]);
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i]!;
    const [bx, bz] = STREAM[i + 1]!;
    const sx = bx - ax;
    const sz = bz - az;
    const l2 = sx * sx + sz * sz;
    const u = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / l2));
    const d = Math.hypot(x - ax - sx * u, z - az - sz * u);
    const l = Math.sqrt(l2);
    if (d < best) {
      best = d;
      bt = (acc + l * u) / total;
    }
    acc += l;
  }
  return { d: best, t: bt };
}

/** The water level of the stream, higher up in the hills. */
export const streamLevel = (t: number): number => WATER_Y + (1 - t) * 1.6;

export type FieldKind = 'raps' | 'vete' | 'gron' | 'plog';

export interface Field {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  kind: FieldKind;
}

export const FIELDS: Field[] = [
  { x: 112, z: 14, w: 108, d: 78, rot: 0.08, kind: 'raps' },
  { x: -22, z: 16, w: 92, d: 64, rot: -0.05, kind: 'vete' },
  { x: 372, z: -42, w: 150, d: 118, rot: 0.35, kind: 'raps' },
  { x: 360, z: 118, w: 110, d: 76, rot: 0.2, kind: 'gron' },
  { x: 40, z: 262, w: 170, d: 68, rot: 0.02, kind: 'vete' },
  { x: -150, z: 252, w: 118, d: 70, rot: -0.1, kind: 'raps' },
  { x: 205, z: 252, w: 72, d: 70, rot: 0.04, kind: 'plog' },
  { x: -405, z: 150, w: 90, d: 104, rot: 0.3, kind: 'gron' },
  { x: 120, z: -330, w: 120, d: 70, rot: -0.15, kind: 'vete' },
  // far away, a patchwork on the hills
  { x: -720, z: 380, w: 260, d: 160, rot: 0.3, kind: 'raps' },
  { x: 760, z: 160, w: 300, d: 180, rot: -0.25, kind: 'vete' },
  { x: 480, z: 620, w: 220, d: 140, rot: 0.15, kind: 'raps' },
  { x: -380, z: 640, w: 240, d: 130, rot: -0.2, kind: 'gron' },
  { x: 900, z: -420, w: 240, d: 160, rot: 0.5, kind: 'raps' },
  { x: -900, z: -300, w: 220, d: 200, rot: -0.4, kind: 'vete' },
  { x: 120, z: 820, w: 300, d: 150, rot: 0.05, kind: 'vete' },
];

/** Inside a field (with a margin in metres)? */
export function inField(x: number, z: number, margin = 0): Field | null {
  for (const f of FIELDS) {
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    const dx = x - f.x;
    const dz = z - f.z;
    const u = dx * c + dz * s;
    const v = -dx * s + dz * c;
    if (Math.abs(u) < f.w / 2 + margin && Math.abs(v) < f.d / 2 + margin) return f;
  }
  return null;
}

interface Blob {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Share of birches (the rest are pines). */
  birch: number;
}

const FORESTS: Blob[] = [
  { x: -60, z: -235, rx: 310, rz: 125, birch: 0.25 },
  { x: -70, z: -60, rx: 175, rz: 24, birch: 0.7 },
  { x: 205, z: -290, rx: 125, rz: 70, birch: 0.15 },
  { x: 480, z: -250, rx: 150, rz: 200, birch: 0.2 },
  { x: -430, z: -70, rx: 110, rz: 230, birch: 0.45 },
  { x: 330, z: 268, rx: 90, rz: 45, birch: 0.6 },
  { x: -330, z: 345, rx: 120, rz: 70, birch: 0.4 },
  { x: 150, z: 120, rx: 30, rz: 16, birch: 0.9 },
];

const blob = (b: Blob, x: number, z: number): number => 1 - smooth(0.55, 1.0, Math.hypot((x - b.x) / b.rx, (z - b.z) / b.rz));

/** How wooded a spot is (0..1) and what share of the trees there are birches. */
export function forest(x: number, z: number): { d: number; birch: number } {
  let d = 0;
  let birch = 0.5;
  for (const b of FORESTS) {
    const v = blob(b, x, z);
    if (v > d) {
      d = v;
      birch = b.birch;
    }
  }
  // ragged edges and clearings
  d *= smooth(-0.35, 0.15, fbm(x / 90 + 4.2, z / 90 - 1.3, 3));
  // far away: forest patches on the hills
  const r = Math.hypot(x + 10, z + 30);
  const far = smooth(430, 650, r) * smooth(-0.05, 0.25, fbm(x / 260 + 17, z / 260 - 5, 3));
  if (far > d) {
    d = far;
    birch = 0.3;
  }
  // birches like the water
  const ld = lakeDist(x, z);
  if (ld > 1.05 && ld < 1.7) {
    d = Math.max(d, 0.35 * (1 - smooth(1.3, 1.7, ld)));
    birch = 0.95;
  }
  const sd = streamDist(x, z);
  if (sd.d > 8 && sd.d < 26 && sd.t < 0.9) {
    d = Math.max(d, 0.5 * (1 - smooth(14, 26, sd.d)));
    birch = 0.85;
  }
  if (inField(x, z, 4)) d = 0;
  return { d, birch };
}

export type BuildingKind = 'cottage' | 'barn' | 'shed' | 'windmill' | 'grandstand';

export interface Building {
  kind: BuildingKind;
  x: number;
  z: number;
  /** Rotation about y (radians). */
  rot: number;
  roof?: string;
  seed?: number;
}

export const BUILDINGS: Building[] = [
  { kind: 'barn', x: 52, z: 92, rot: 0 },
  { kind: 'cottage', x: -14, z: 97, rot: 0, roof: '#3b3d44', seed: 1 },
  { kind: 'shed', x: 98, z: 70, rot: 0.3 },
  { kind: 'cottage', x: 150, z: 88, rot: -0.3, roof: '#8a3a26', seed: 2 },
  { kind: 'cottage', x: -128, z: 92, rot: Math.PI - 0.15, roof: '#2e3036', seed: 3 },
  { kind: 'cottage', x: 40, z: -150, rot: 0.08, roof: '#3b3d44', seed: 4 },
  { kind: 'cottage', x: 318, z: 34, rot: -1.4, roof: '#8a3a26', seed: 5 },
  { kind: 'cottage', x: 398, z: -150, rot: 0.6, roof: '#3b3d44', seed: 6 },
  { kind: 'cottage', x: -78, z: 214, rot: 0.05, roof: '#8a3a26', seed: 7 },
  { kind: 'cottage', x: 152, z: 204, rot: 0.2, roof: '#3b3d44', seed: 8 },
  { kind: 'cottage', x: -384, z: 58, rot: 1.5, roof: '#2e3036', seed: 9 },
  { kind: 'shed', x: -372, z: 80, rot: 1.3 },
  { kind: 'cottage', x: -402, z: -172, rot: 0.1, roof: '#8a3a26', seed: 10 },
  { kind: 'windmill', x: -330, z: 214, rot: 2.35 },
  { kind: 'grandstand', x: 2, z: 188, rot: 0 },
  // far away on the hills
  { kind: 'cottage', x: -640, z: 250, rot: 0.4, roof: '#3b3d44', seed: 11 },
  { kind: 'barn', x: -680, z: 300, rot: 0.4 },
  { kind: 'cottage', x: 700, z: -90, rot: -0.7, roof: '#8a3a26', seed: 12 },
  { kind: 'cottage', x: 320, z: 640, rot: 0.2, roof: '#3b3d44', seed: 13 },
  { kind: 'barn', x: 370, z: 600, rot: 0.2 },
  { kind: 'cottage', x: -300, z: -560, rot: 1.0, roof: '#8a3a26', seed: 14 },
  { kind: 'cottage', x: 860, z: 460, rot: 0.1, roof: '#3b3d44', seed: 15 },
  { kind: 'cottage', x: -880, z: -120, rot: 2.0, roof: '#8a3a26', seed: 16 },
  { kind: 'cottage', x: 620, z: -560, rot: 0.9, roof: '#3b3d44', seed: 17 },
];

/** Fenced pastures with animals: centre, half sizes and what grazes there. */
export const PASTURES: { x: number; z: number; hw: number; hd: number; animal: 'cow' | 'sheep' | 'horse'; n: number }[] = [
  { x: -70, z: 88, hw: 24, hd: 22, animal: 'cow', n: 6 },
  { x: -330, z: 262, hw: 34, hd: 22, animal: 'sheep', n: 8 },
  { x: 232, z: 192, hw: 18, hd: 12, animal: 'horse', n: 2 },
  { x: 300, z: 176, hw: 26, hd: 14, animal: 'cow', n: 4 },
];
