// The circuit round the farm: a smooth closed spline with elevation, sampled every couple of metres.
// Everything here is plain maths (no Three.js), so the physics, the AI, the meshes and the minimap all
// read the same numbers.
import { clamp, smooth } from './util.ts';

/** Fence kinds along the run-off: none, roundpole fence, straw bales, bridge railing, stone wall. */
export const Fence = { None: 0, Pole: 1, Bales: 2, Rail: 3, Stone: 4 } as const;
export type Fence = (typeof Fence)[keyof typeof Fence];

/** Fence kinds 5.. belong to the other courses (props.ts draws them): snow banks, tyre stacks, rope and posts, log piles, concrete barriers. */
export const FenceX = { Snow: 5, Tyres: 6, Rope: 7, Logs: 8, Barrier: 9 } as const;

export type SurfaceName = 'asphalt' | 'gravel' | 'snow' | 'sand' | 'ice';

/** A control point of a course's centre line. */
export interface Ctrl {
  x: number;
  z: number;
  y: number;
  /** Half the road width from here. */
  hw?: number;
  /** The road from this point to the next is gravel (the farm's way of saying surface: 'gravel'). */
  gravel?: boolean;
  /** The road from this point to the next (the course's own surface when left out). */
  surface?: SurfaceName;
  /** A crest (+) or a dip (−) of this many metres centred on this point, `bw` metres each way. */
  bump?: number;
  bw?: number;
  /** Run-off (grass from the road edge to the fence) left and right. */
  runL?: number;
  runR?: number;
  fenceL?: number;
  fenceR?: number;
  /** The road crosses the stream here (a bridge). */
  bridge?: boolean;
  /** The road from this point to the next runs through a tunnel. */
  tunnel?: boolean;
  /** The road from this point to the next is a wooden boardwalk (drives like asphalt). */
  deck?: boolean;
}

/** What a Track needs from a course (courses.ts has the five). */
export interface TrackDef {
  ctrl: Ctrl[];
  /** The surface where a control point does not say. */
  surface: SurfaceName;
  /** The fence where a control point does not say, and the default half width and run-off. */
  fence: number;
  hw: number;
  run: number;
}

// x east, z south, y up. Driven in this order; s = 0 is the start/finish line at the first point.
/** The farm course (Rallyt as it always was). */
export const FARM_CTRL: Ctrl[] = [
  { x: 0, z: 150, y: 2, hw: 8.5 },
  { x: 90, z: 150, y: 2, hw: 8.5 },
  { x: 165, z: 146, y: 2.2, hw: 8 },
  // Kurva 1: a fast left up towards the hill
  { x: 214, z: 123, y: 3, hw: 7.5 },
  { x: 236, z: 74, y: 4.5, hw: 7.5 },
  { x: 239, z: 10, y: 8, hw: 7.5, fenceR: Fence.Stone },
  { x: 245, z: -55, y: 12.5, hw: 7.5 },
  // Krönet: a crest you can fly over
  { x: 241, z: -110, y: 15.5, hw: 7.5, bump: 2.2, bw: 26 },
  { x: 229, z: -160, y: 15, hw: 8, runL: 8, fenceL: Fence.Bales },
  // Hårnålen: the hairpin, straw bales on the outside
  { x: 221, z: -192, y: 14.5, hw: 8.5, runR: 6, fenceR: Fence.Bales },
  { x: 215, z: -206, y: 14.5, hw: 9, runR: 6, fenceR: Fence.Bales },
  { x: 202, z: -212, y: 14.5, hw: 9, runR: 6, fenceR: Fence.Bales },
  { x: 189, z: -206, y: 14.5, hw: 9, runR: 6, fenceR: Fence.Bales },
  { x: 183, z: -192, y: 14.3, hw: 8.5, runR: 6, fenceR: Fence.Bales },
  { x: 175, z: -160, y: 12.5, hw: 7.5 },
  { x: 162, z: -124, y: 10.5, hw: 7.5 },
  { x: 140, z: -97, y: 9.5, hw: 7.5, runL: 7, fenceL: Fence.Bales },
  { x: 102, z: -88, y: 9, hw: 7 },
  // Grusvägen: gravel through the forest, stone walls
  { x: 50, z: -97, y: 8, hw: 6.5, gravel: true, fenceL: Fence.Stone, fenceR: Fence.Stone, runL: 9, runR: 9 },
  { x: -10, z: -123, y: 6, hw: 6.5, gravel: true, fenceL: Fence.Stone, fenceR: Fence.Stone, runL: 9, runR: 9, bump: -1.4, bw: 30 },
  { x: -72, z: -118, y: 6.5, hw: 6.5, gravel: true, fenceL: Fence.Stone, fenceR: Fence.Stone, runL: 9, runR: 9 },
  { x: -132, z: -95, y: 7.5, hw: 6.5, gravel: true, fenceL: Fence.Stone, fenceR: Fence.Stone, runL: 9, runR: 9, bump: 0.8, bw: 30 },
  { x: -186, z: -98, y: 6.5, hw: 7, gravel: true },
  { x: -232, z: -77, y: 5.5, hw: 7.5 },
  { x: -253, z: -38, y: 4.5, hw: 7.5 },
  // Bron: the bridge over the stream
  { x: -259, z: 0, y: 4.2, hw: 7.5, bridge: true, runL: 1.2, runR: 1.2, fenceL: Fence.Rail, fenceR: Fence.Rail },
  { x: -257, z: 38, y: 3.4, hw: 7.5 },
  // Chikanen: left, right
  { x: -243, z: 72, y: 2.8, hw: 8, runL: 7, runR: 7, fenceL: Fence.Bales, fenceR: Fence.Bales },
  { x: -262, z: 99, y: 2.5, hw: 8, runL: 7, runR: 7, fenceL: Fence.Bales, fenceR: Fence.Bales },
  // Ladukurvan: the long left past the barn back onto the straight
  { x: -246, z: 137, y: 2.2, hw: 8 },
  { x: -194, z: 153, y: 2, hw: 8.5 },
  { x: -100, z: 152, y: 2, hw: 8.5 },
];


export const Surf = { Asphalt: 0, Gravel: 1, Snow: 2, Sand: 3, Ice: 4 } as const;
export type Surf = (typeof Surf)[keyof typeof Surf];
const SURF_OF: Record<SurfaceName, Surf> = { asphalt: Surf.Asphalt, gravel: Surf.Gravel, snow: Surf.Snow, sand: Surf.Sand, ice: Surf.Ice };
/** Grip the racing line plans with, and how hard one can brake, per surface (the car's own grip is in car.ts). */
const LINE_MU = [1.2, 0.9, 0.53, 0.78, 0.4];
const LINE_DEC = [8, 5.5, 3.6, 5.0, 2.8];

export interface Proj {
  /** The sample before the point and how far towards the next one (0..1). */
  i: number;
  u: number;
  /** Arc length along the centre line, 0..length. */
  s: number;
  /** Signed distance from the centre line, positive to the left. */
  d: number;
}

const DS = 2;

export class Track {
  readonly n: number;
  readonly length: number;
  readonly ds: number;
  readonly px: Float32Array;
  readonly pz: Float32Array;
  readonly py: Float32Array;
  /** Unit tangent (x, z) and left normal (lx, lz) = (tz, −tx). */
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** Signed curvature, positive turning left. */
  readonly curv: Float32Array;
  readonly hw: Float32Array;
  readonly surf: Uint8Array;
  readonly bridge: Uint8Array;
  readonly tunnel: Uint8Array;
  readonly deck: Uint8Array;
  /** Distance from the centre line to the fence, left and right. */
  readonly wallL: Float32Array;
  readonly wallR: Float32Array;
  readonly fenceL: Uint8Array;
  readonly fenceR: Uint8Array;
  readonly kerbL: Uint8Array;
  readonly kerbR: Uint8Array;
  /** The racing line: lateral offset (left positive) and a target speed (m/s, at grip 1). */
  readonly line: Float32Array;
  readonly vmax: Float32Array;
  /** A fast lap along the racing line (s), for scoring. */
  readonly idealLap: number;
  /** Arc length of each control point (for scenery anchored to them). */
  readonly ctrlS: number[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;

  /** `grip` scales the speeds the racing line plans for (rain). */
  constructor(def: TrackDef, grip = 1) {
    const CTRL = def.ctrl;
    // ---- dense Catmull-Rom (centripetal) through the control points ----
    const m = CTRL.length;
    const P = (k: number): Ctrl => CTRL[((k % m) + m) % m]!;
    const dense: { x: number; z: number; y: number; seg: number; t: number }[] = [];
    const SUB = 80;
    for (let k = 0; k < m; k++) {
      const p0 = P(k - 1);
      const p1 = P(k);
      const p2 = P(k + 1);
      const p3 = P(k + 2);
      const dt = (a: Ctrl, b: Ctrl): number => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
      const d0 = dt(p0, p1);
      const d1 = dt(p1, p2);
      const d2 = dt(p2, p3);
      const tang = (v0: number, v1: number, v2: number, v3: number): [number, number] => {
        let t1 = (v1 - v0) / d0 - (v2 - v0) / (d0 + d1) + (v2 - v1) / d1;
        let t2 = (v2 - v1) / d1 - (v3 - v1) / (d1 + d2) + (v3 - v2) / d2;
        t1 *= d1;
        t2 *= d1;
        return [t1, t2];
      };
      const [xa, xb] = tang(p0.x, p1.x, p2.x, p3.x);
      const [za, zb] = tang(p0.z, p1.z, p2.z, p3.z);
      const [ya, yb] = tang(p0.y, p1.y, p2.y, p3.y);
      const herm = (v1: number, v2: number, m1: number, m2: number, t: number): number => {
        const t2 = t * t;
        const t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2;
      };
      for (let j = 0; j < SUB; j++) {
        const t = j / SUB;
        dense.push({ x: herm(p1.x, p2.x, xa, xb, t), z: herm(p1.z, p2.z, za, zb, t), y: herm(p1.y, p2.y, ya, yb, t), seg: k, t });
      }
    }
    // cumulative length
    const cum = new Float64Array(dense.length + 1);
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i]!;
      const b = dense[(i + 1) % dense.length]!;
      cum[i + 1] = cum[i]! + Math.hypot(b.x - a.x, b.z - a.z);
    }
    const total = cum[dense.length]!;
    const n = Math.round(total / DS);
    this.n = n;
    this.length = total;
    this.ds = total / n;
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.py = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.curv = new Float32Array(n);
    this.hw = new Float32Array(n);
    this.surf = new Uint8Array(n);
    this.bridge = new Uint8Array(n);
    this.tunnel = new Uint8Array(n);
    this.deck = new Uint8Array(n);
    this.wallL = new Float32Array(n);
    this.wallR = new Float32Array(n);
    this.fenceL = new Uint8Array(n);
    this.fenceR = new Uint8Array(n);
    this.kerbL = new Uint8Array(n);
    this.kerbR = new Uint8Array(n);
    this.line = new Float32Array(n);
    this.vmax = new Float32Array(n);
    this.ctrlS = CTRL.map(() => 0);
    for (let k = 0; k < m; k++) this.ctrlS[k] = cum[k * SUB]!;

    const runL = new Float32Array(n);
    const runR = new Float32Array(n);
    let di = 0;
    for (let i = 0; i < n; i++) {
      const s = i * this.ds;
      while (di < dense.length - 1 && cum[di + 1]! < s) di++;
      const a = dense[di]!;
      const b = dense[(di + 1) % dense.length]!;
      const f = (s - cum[di]!) / Math.max(1e-6, cum[di + 1]! - cum[di]!);
      this.px[i] = a.x + (b.x - a.x) * f;
      this.pz[i] = a.z + (b.z - a.z) * f;
      this.py[i] = a.y + (b.y - a.y) * f;
      const c0 = P(a.seg);
      const c1 = P(a.seg + 1);
      const tt = smooth(0, 1, a.t + (b.t - a.t || 1 / SUB) * f);
      this.hw[i] = (c0.hw ?? def.hw) + ((c1.hw ?? def.hw) - (c0.hw ?? def.hw)) * tt;
      this.surf[i] = c0.gravel ? Surf.Gravel : SURF_OF[c0.surface ?? def.surface];
      this.tunnel[i] = c0.tunnel ? 1 : 0;
      this.deck[i] = c0.deck ? 1 : 0;
      runL[i] = c0.runL ?? def.run;
      runR[i] = c0.runR ?? def.run;
      this.fenceL[i] = c0.fenceL ?? def.fence;
      this.fenceR[i] = c0.fenceR ?? def.fence;
    }
    // bumps (crests and dips) and the bridge
    for (let k = 0; k < m; k++) {
      const c = CTRL[k]!;
      const s0 = this.ctrlS[k]!;
      if (c.bump) {
        const bw = c.bw ?? 25;
        for (let i = 0; i < n; i++) {
          const d = this.wrapDist(i * this.ds - s0);
          if (Math.abs(d) < bw) this.py[i] = this.py[i]! + c.bump * 0.5 * (1 + Math.cos((Math.PI * d) / bw));
        }
      }
      if (c.bridge) {
        for (let i = 0; i < n; i++) {
          const d = this.wrapDist(i * this.ds - s0);
          if (Math.abs(d) < 14) this.bridge[i] = 1;
          // the railing runs a little further than the deck
          if (Math.abs(d) < 22) {
            runL[i] = Math.min(runL[i]!, 1.2);
            runR[i] = Math.min(runR[i]!, 1.2);
            this.fenceL[i] = Fence.Rail;
            this.fenceR[i] = Fence.Rail;
          }
        }
      }
    }
    // tangents and curvature
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const dx = this.px[b]! - this.px[a]!;
      const dz = this.pz[b]! - this.pz[a]!;
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const ha = Math.atan2(this.tx[a]!, this.tz[a]!);
      const hb = Math.atan2(this.tx[b]!, this.tz[b]!);
      let dh = hb - ha;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      raw[i] = dh / (2 * this.ds);
    }
    this.blur(raw, this.curv, 2);

    // kerbs where it bends: inside from a gentle radius, both sides when tight
    for (let i = 0; i < n; i++) {
      const k = this.curv[i]!;
      if (this.surf[i] !== Surf.Asphalt || this.bridge[i]) continue;
      if (k > 1 / 130) this.kerbL[i] = 1;
      if (k < -1 / 130) this.kerbR[i] = 1;
      if (Math.abs(k) > 1 / 40) this.kerbL[i] = this.kerbR[i] = 1;
    }
    for (const kerb of [this.kerbL, this.kerbR]) {
      const src = kerb.slice();
      for (let i = 0; i < n; i++) if (src[i]) for (let j = -4; j <= 4; j++) kerb[(i + j + n) % n] = this.surf[(i + j + n) % n] !== Surf.Asphalt || this.bridge[(i + j + n) % n] ? 0 : 1;
    }

    // ---- fences: the run-off, kept inside tight bends and between legs that pass close ----
    const wl = new Float32Array(n);
    const wr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      wl[i] = this.hw[i]! + runL[i]!;
      wr[i] = this.hw[i]! + runR[i]!;
      const k = this.curv[i]!;
      if (k > 1e-4) wl[i] = Math.min(wl[i]!, 0.82 / k);
      if (k < -1e-4) wr[i] = Math.min(wr[i]!, 0.82 / -k);
    }
    for (let i = 0; i < n; i++) {
      const lx = this.tz[i]!;
      const lz = -this.tx[i]!;
      for (let j = 0; j < n; j++) {
        let gap = Math.abs(i - j);
        gap = Math.min(gap, n - gap);
        if (gap < 45) continue;
        const wx = this.px[j]! - this.px[i]!;
        const wz = this.pz[j]! - this.pz[i]!;
        const along = wx * this.tx[i]! + wz * this.tz[i]!;
        const lat = wx * lx + wz * lz;
        if (Math.abs(along) > Math.max(10, Math.abs(lat) * 0.7)) continue;
        if (lat > 0) wl[i] = Math.min(wl[i]!, lat * 0.5 - 0.5);
        else wr[i] = Math.min(wr[i]!, -lat * 0.5 - 0.5);
      }
      wl[i] = Math.max(wl[i]!, this.hw[i]! + 1.2);
      wr[i] = Math.max(wr[i]!, this.hw[i]! + 1.2);
    }
    // no sudden jogs: a running minimum, then a soft average
    const minf = (src: Float32Array, out: Float32Array, r: number): void => {
      for (let i = 0; i < n; i++) {
        let v = Infinity;
        for (let j = -r; j <= r; j++) v = Math.min(v, src[(i + j + n) % n]!);
        out[i] = v;
      }
    };
    const tmp = new Float32Array(n);
    minf(wl, tmp, 5);
    this.blur(tmp, this.wallL, 4);
    minf(wr, tmp, 5);
    this.blur(tmp, this.wallR, 4);
    for (let i = 0; i < n; i++) {
      this.wallL[i] = Math.max(this.wallL[i]!, this.hw[i]! + 1.2);
      this.wallR[i] = Math.max(this.wallR[i]!, this.hw[i]! + 1.2);
    }

    // ---- racing line: an elastic band pulled tight inside the road ----
    const off = this.line;
    const lineX = new Float32Array(n);
    const lineZ = new Float32Array(n);
    const place = (): void => {
      for (let i = 0; i < n; i++) {
        lineX[i] = this.px[i]! + this.tz[i]! * off[i]!;
        lineZ[i] = this.pz[i]! - this.tx[i]! * off[i]!;
      }
    };
    for (const [k, iters] of [
      [14, 120],
      [7, 160],
      [3, 120],
    ] as const) {
      for (let it = 0; it < iters; it++) {
        place();
        for (let i = 0; i < n; i++) {
          const a = (i - k + n) % n;
          const b = (i + k) % n;
          const mx = (lineX[a]! + lineX[b]!) * 0.5;
          const mz = (lineZ[a]! + lineZ[b]!) * 0.5;
          const want = (mx - this.px[i]!) * this.tz[i]! - (mz - this.pz[i]!) * this.tx[i]!;
          const lim = this.hw[i]! - 2.2;
          off[i] = clamp(off[i]! + (want - off[i]!) * 0.5, -lim, lim);
        }
      }
    }
    place();
    // speed along the line: grip-limited in bends, then braking zones worked backwards
    const lk = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 3 + n) % n;
      const b = (i + 3) % n;
      const ax = lineX[i]! - lineX[a]!;
      const az = lineZ[i]! - lineZ[a]!;
      const bx = lineX[b]! - lineX[i]!;
      const bz = lineZ[b]! - lineZ[i]!;
      let dh = Math.atan2(bx, bz) - Math.atan2(ax, az);
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      lk[i] = Math.abs(dh) / Math.max(0.5, (Math.hypot(ax, az) + Math.hypot(bx, bz)) * 0.5);
    }
    const lks = new Float32Array(n);
    this.blur(lk, lks, 3);
    const G = 9.81;
    const TOP = 52;
    for (let i = 0; i < n; i++) {
      const mu = LINE_MU[this.surf[i]!]! * grip;
      this.vmax[i] = Math.min(TOP, Math.sqrt((mu * G) / Math.max(1e-4, lks[i]!)));
    }
    // jumps: a car flying off a crest can neither brake nor steer until it lands (and settles), so the
    // bend after the landing has to be planned for at the take-off. Fly a ball off each crest at the
    // speed the line would carry there and mark the samples it passes over.
    const air = new Uint8Array(n);
    for (let k = 0; k < m; k++) {
      const c = CTRL[k]!;
      if (!c.bump || c.bump <= 0) continue;
      const bw = c.bw ?? 25;
      // the top of the crest (the road's own rise and fall shifts it a little off the control point)
      let ic = this.index(this.ctrlS[k]!);
      for (let j = -Math.ceil(bw / this.ds); j <= Math.ceil(bw / this.ds); j++) {
        const i = (this.index(this.ctrlS[k]!) + j + n) % n;
        if (this.py[i]! > this.py[ic]!) ic = i;
      }
      const v = this.vmax[ic]!;
      const y0 = this.py[ic]!;
      const slope = (this.py[(ic + 1) % n]! - this.py[(ic - 1 + n) % n]!) / (2 * this.ds);
      let j = 1;
      for (; j < n / 4; j++) {
        const d = j * this.ds;
        const h = y0 + slope * d - (G * d * d) / (2 * v * v);
        // a few centimetres of daylight is still the wheels on the road
        if (h < this.py[(ic + j) % n]! + 0.05) break;
      }
      if (j < 3) continue;
      // and a moment after touching down before the tyres bite again
      const settle = Math.ceil((v * 0.5) / this.ds);
      for (let q = 0; q < j + settle; q++) air[(ic + q) % n] = 1;
    }
    for (let pass = 0; pass < 3; pass++)
      for (let i = n - 1; i >= 0; i--) {
        const nx = (i + 1) % n;
        const dec = air[i] ? 0 : LINE_DEC[this.surf[i]!]! * grip;
        this.vmax[i] = Math.min(this.vmax[i]!, Math.sqrt(this.vmax[nx]! ** 2 + 2 * dec * this.ds));
      }
    // a lap at those speeds, accelerating as a real car would
    let v = this.vmax[0]!;
    let lap = 0;
    for (let pass = 0; pass < 2; pass++) {
      lap = 0;
      for (let i = 0; i < n; i++) {
        const acc = Math.max(0.6, 5.2 - v * 0.1);
        v = Math.min(this.vmax[i]!, Math.sqrt(v * v + 2 * acc * this.ds));
        lap += this.ds / Math.max(1, v);
      }
    }
    this.idealLap = lap;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, this.px[i]!);
      maxX = Math.max(maxX, this.px[i]!);
      minZ = Math.min(minZ, this.pz[i]!);
      maxZ = Math.max(maxZ, this.pz[i]!);
    }
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
  }

  /** Box blur over ±r samples, around the loop. */
  private blur(src: Float32Array, out: Float32Array, r: number): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += src[(i + j + n) % n]!;
      out[i] = s / (2 * r + 1);
    }
  }

  /** A difference in arc length wrapped to −length/2..length/2. */
  wrapDist(d: number): number {
    const L = this.length;
    d %= L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  /** The sample index at arc length s (any value, wraps). */
  index(s: number): number {
    const L = this.length;
    s = ((s % L) + L) % L;
    return Math.floor(s / this.ds) % this.n;
  }

  /** Linear interpolation of a per-sample array at arc length s. */
  at(arr: Float32Array, s: number): number {
    const L = this.length;
    s = ((s % L) + L) % L;
    const f = s / this.ds;
    const i = Math.floor(f) % this.n;
    const t = f - Math.floor(f);
    return arr[i]! + (arr[(i + 1) % this.n]! - arr[i]!) * t;
  }

  /** A point at arc length s, d metres to the left of the centre line. */
  point(s: number, d: number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    const L = this.length;
    s = ((s % L) + L) % L;
    const f = s / this.ds;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const t = f - Math.floor(f);
    const x = this.px[i]! + (this.px[j]! - this.px[i]!) * t;
    const z = this.pz[i]! + (this.pz[j]! - this.pz[i]!) * t;
    let tx = this.tx[i]! + (this.tx[j]! - this.tx[i]!) * t;
    let tz = this.tz[i]! + (this.tz[j]! - this.tz[i]!) * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.x = x + tz * d;
    out.z = z - tx * d;
    out.y = this.py[i]! + (this.py[j]! - this.py[i]!) * t;
    return out;
  }

  /** The heading (radians, 0 = +z, turning left is positive) of the road at s. */
  heading(s: number): number {
    const i = this.index(s);
    return Math.atan2(this.tx[i]!, this.tz[i]!);
  }

  /** Project a point onto the centre line, searching near a previous sample (or everywhere when hint < 0). */
  project(x: number, z: number, hint: number, out: Proj): Proj {
    const n = this.n;
    let best = -1;
    let bd = Infinity;
    if (hint >= 0) {
      for (let k = -24; k <= 24; k++) {
        const i = (hint + k + n) % n;
        const dx = x - this.px[i]!;
        const dz = z - this.pz[i]!;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    // lost the track (respawned far away, or the hint was bad): search the whole loop
    if (best < 0 || bd > 60 * 60) {
      for (let i = 0; i < n; i++) {
        const dx = x - this.px[i]!;
        const dz = z - this.pz[i]!;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    // the segment on the right side of that sample
    let i = best;
    const fx = x - this.px[i]!;
    const fz = z - this.pz[i]!;
    if (fx * this.tx[i]! + fz * this.tz[i]! < 0) i = (i - 1 + n) % n;
    const j = (i + 1) % n;
    const sx = this.px[j]! - this.px[i]!;
    const sz = this.pz[j]! - this.pz[i]!;
    const sl = sx * sx + sz * sz || 1;
    const u = clamp(((x - this.px[i]!) * sx + (z - this.pz[i]!) * sz) / sl, 0, 1);
    const cx = this.px[i]! + sx * u;
    const cz = this.pz[i]! + sz * u;
    let tx = this.tx[i]! + (this.tx[j]! - this.tx[i]!) * u;
    let tz = this.tz[i]! + (this.tz[j]! - this.tz[i]!) * u;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    out.i = i;
    out.u = u;
    out.s = (i + u) * this.ds;
    out.d = (x - cx) * tz - (z - cz) * tx;
    return out;
  }

  /** The road height at a projection (the road is flat across). */
  roadY(p: Proj): number {
    const j = (p.i + 1) % this.n;
    return this.py[p.i]! + (this.py[j]! - this.py[p.i]!) * p.u;
  }
}
