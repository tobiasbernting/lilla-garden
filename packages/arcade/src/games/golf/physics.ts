// The ball's little world, without any Three.js: ground pieces (flat greens, ramps, an arched bridge,
// a crater, a turntable), solid bodies (rails, bales, the windmill's sails, cows), water, mud, the
// barn's doors and the cup. Fixed substeps keep it the same at any frame rate.
import type { GreenSpec, HoleSpec, MoverSpec, ObstacleSpec, Pt, RailSpec, Surf } from './spec.ts';

export const R_BALL = 0.2;
export const R_CUP = 0.42;
export const GRAV = 20;
const G_ROLL = (GRAV * 5) / 7; // a rolling ball on a slope
export const SUBSTEPS = 6; // per 1/60 s update
export const MAX_SPEED = 17;
/** Below this the ball stops (relative to the ground under it). */
const V_STOP = 0.09;
/** How far it may fall into the cup before the far wall catches it decides how fast a ball may be and still drop. */
const T_DROP = Math.sqrt((2 * 0.7 * R_BALL) / GRAV);
const V_CAP_MIN = 2.0;
const STEP_UP = 0.06;
const LIFT = 0.012;
export const RAIL_H = 0.34;
export const RAIL_W = 0.24;

const FRIC: Record<Surf, { c: number; k: number }> = {
  felt: { c: 2.4, k: 0.3 },
  wood: { c: 1.9, k: 0.22 },
  mud: { c: 16, k: 3 },
  out: { c: 9, k: 2.5 },
};

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- ground

export interface Sample {
  h: number;
  gx: number;
  gz: number;
}

export interface Spin {
  cx: number;
  cz: number;
  w: number;
}

export abstract class Piece {
  x0 = 0;
  x1 = 0;
  z0 = 0;
  z1 = 0;
  spin: Spin | null = null;
  constructor(
    public surf: Surf,
    public spec: GreenSpec | null,
  ) {}
  abstract inside(x: number, z: number): boolean;
  abstract sample(x: number, z: number, o: Sample): void;
}

export function pointInPoly(pts: Pt[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export class PolyPiece extends Piece {
  constructor(
    public pts: Pt[],
    public h: number,
    surf: Surf,
    spec: GreenSpec | null,
    public sx = 0,
    public sz = 0,
    public holes: Pt[][] = [],
  ) {
    super(surf, spec);
    this.x0 = Math.min(...pts.map((p) => p[0]));
    this.x1 = Math.max(...pts.map((p) => p[0]));
    this.z0 = Math.min(...pts.map((p) => p[1]));
    this.z1 = Math.max(...pts.map((p) => p[1]));
    this.ox = (this.x0 + this.x1) / 2;
    this.oz = (this.z0 + this.z1) / 2;
  }
  ox: number;
  oz: number;
  inside(x: number, z: number): boolean {
    if (!pointInPoly(this.pts, x, z)) return false;
    for (const h of this.holes) if (pointInPoly(h, x, z)) return false;
    return true;
  }
  sample(x: number, z: number, o: Sample): void {
    o.h = this.h + this.sx * (x - this.ox) + this.sz * (z - this.oz);
    o.gx = this.sx;
    o.gz = this.sz;
  }
}

export class LanePiece extends Piece {
  ux: number;
  uz: number;
  len: number;
  constructor(
    public a: Pt,
    public b: Pt,
    public hw: number,
    public h0: number,
    public h1: number,
    public prof: 'ramp' | 'smooth' | 'arch',
    surf: Surf,
    spec: GreenSpec | null,
  ) {
    super(surf, spec);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    this.len = Math.hypot(dx, dz);
    this.ux = dx / this.len;
    this.uz = dz / this.len;
    const px = -this.uz * hw;
    const pz = this.ux * hw;
    const xs = [a[0] + px, a[0] - px, b[0] + px, b[0] - px];
    const zs = [a[1] + pz, a[1] - pz, b[1] + pz, b[1] - pz];
    this.x0 = Math.min(...xs);
    this.x1 = Math.max(...xs);
    this.z0 = Math.min(...zs);
    this.z1 = Math.max(...zs);
  }
  /** Along (0..len) and across (-hw..hw). */
  local(x: number, z: number): [number, number] {
    const dx = x - this.a[0];
    const dz = z - this.a[1];
    return [dx * this.ux + dz * this.uz, -dx * this.uz + dz * this.ux];
  }
  inside(x: number, z: number): boolean {
    const [s, w] = this.local(x, z);
    return s >= 0 && s <= this.len && Math.abs(w) <= this.hw;
  }
  /** Height at a fraction t (0..1) along the lane, and its slope per unit length. */
  profile(t: number): [number, number] {
    const d = this.h1 - this.h0;
    t = clamp(t, 0, 1);
    switch (this.prof) {
      case 'ramp':
        return [this.h0 + d * t, d / this.len];
      case 'smooth':
        return [this.h0 + d * t * t * (3 - 2 * t), (d * 6 * t * (1 - t)) / this.len];
      case 'arch': {
        const s = Math.sin(Math.PI * t);
        return [this.h0 + d * s * s, (d * Math.PI * Math.sin(2 * Math.PI * t)) / this.len];
      }
    }
  }
  sample(x: number, z: number, o: Sample): void {
    const [s] = this.local(x, z);
    const [h, dh] = this.profile(s / this.len);
    o.h = h;
    o.gx = dh * this.ux;
    o.gz = dh * this.uz;
  }
}

export class DiscPiece extends Piece {
  constructor(
    public cx: number,
    public cz: number,
    public r: number,
    public rin: number,
    public h: number,
    public prof: 'flat' | 'bowl' | 'crater',
    public rim: number,
    public height: number,
    public depth: number,
    surf: Surf,
    spec: GreenSpec | null,
  ) {
    super(surf, spec);
    this.x0 = cx - r;
    this.x1 = cx + r;
    this.z0 = cz - r;
    this.z1 = cz + r;
  }
  inside(x: number, z: number): boolean {
    const d2 = (x - this.cx) ** 2 + (z - this.cz) ** 2;
    return d2 <= this.r * this.r && d2 >= this.rin * this.rin;
  }
  /** Height and its slope at a distance from the middle. */
  radial(rho: number): [number, number] {
    switch (this.prof) {
      case 'flat':
        return [this.h, 0];
      case 'bowl': {
        const k = Math.PI / this.r;
        return [this.h - this.depth * 0.5 * (1 + Math.cos(k * rho)), this.depth * 0.5 * k * Math.sin(k * rho)];
      }
      case 'crater': {
        if (rho >= this.rim) {
          const span = this.r - this.rim;
          const k = Math.PI / span;
          const u = rho - this.rim;
          return [this.h + this.height * 0.5 * (1 + Math.cos(k * u)), -this.height * 0.5 * k * Math.sin(k * u)];
        }
        const k = Math.PI / this.rim;
        return [this.h + this.height - this.depth * 0.5 * (1 + Math.cos(k * rho)), this.depth * 0.5 * k * Math.sin(k * rho)];
      }
    }
  }
  sample(x: number, z: number, o: Sample): void {
    const dx = x - this.cx;
    const dz = z - this.cz;
    const rho = Math.hypot(dx, dz);
    const [h, dh] = this.radial(rho);
    o.h = h;
    if (rho > 1e-6) {
      o.gx = (dh * dx) / rho;
      o.gz = (dh * dz) / rho;
    } else {
      o.gx = 0;
      o.gz = 0;
    }
  }
}

// ---------------------------------------------------------------- bodies

export type Snd = 'wood' | 'hay' | 'cow' | 'stone' | 'blade' | 'rubber' | 'fence' | 'metal';

export type Shape = { t: 'box'; hx: number; hy: number; hz: number } | { t: 'cyl'; r: number; hh: number } | { t: 'cap'; hl: number; r: number } | { t: 'sph'; r: number };

export interface Contact {
  nx: number;
  ny: number;
  nz: number;
  depth: number;
}

/** A solid thing: a shape at a pose (position + rotation matrix, row-major, world = m · local). */
export class Body {
  x = 0;
  y = 0;
  z = 0;
  m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  ox = 0;
  oy = 0;
  oz = 0;
  om = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  moving = false;
  enabled = true;
  bound: number;
  /** Set by the game: the last time the ball hit it (for sounds and wiggles). */
  hitAt = -1;
  constructor(
    public shape: Shape,
    public e: number,
    public snd: Snd,
    public tag = '',
  ) {
    switch (shape.t) {
      case 'box':
        this.bound = Math.hypot(shape.hx, shape.hy, shape.hz);
        break;
      case 'cyl':
        this.bound = Math.hypot(shape.r, shape.hh);
        break;
      case 'cap':
        this.bound = shape.hl + shape.r;
        break;
      case 'sph':
        this.bound = shape.r;
        break;
    }
  }
  at(x: number, y: number, z: number, yaw = 0): this {
    this.x = x;
    this.y = y;
    this.z = z;
    rotY(yaw, this.m);
    this.keep();
    return this;
  }
  /** Remember this pose as the previous one (before moving it). */
  keep(): void {
    this.ox = this.x;
    this.oy = this.y;
    this.oz = this.z;
    for (let i = 0; i < 9; i++) this.om[i] = this.m[i]!;
  }
  /** Velocity of a world point fixed to the body, from its last two poses. */
  velocityAt(px: number, py: number, pz: number, dt: number, o: { x: number; y: number; z: number }): void {
    const m = this.m;
    const dx = px - this.x;
    const dy = py - this.y;
    const dz = pz - this.z;
    const lx = m[0]! * dx + m[3]! * dy + m[6]! * dz;
    const ly = m[1]! * dx + m[4]! * dy + m[7]! * dz;
    const lz = m[2]! * dx + m[5]! * dy + m[8]! * dz;
    const n = this.om;
    o.x = (px - (this.ox + n[0]! * lx + n[1]! * ly + n[2]! * lz)) / dt;
    o.y = (py - (this.oy + n[3]! * lx + n[4]! * ly + n[5]! * lz)) / dt;
    o.z = (pz - (this.oz + n[6]! * lx + n[7]! * ly + n[8]! * lz)) / dt;
  }
}

export function rotY(a: number, m: number[]): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[1] = 0;
  m[2] = s;
  m[3] = 0;
  m[4] = 1;
  m[5] = 0;
  m[6] = -s;
  m[7] = 0;
  m[8] = c;
}

/** Columns: where the body's local x, y and z axes point in the world. */
export function basis(m: number[], x: number[], y: number[], z: number[]): void {
  m[0] = x[0]!;
  m[1] = y[0]!;
  m[2] = z[0]!;
  m[3] = x[1]!;
  m[4] = y[1]!;
  m[5] = z[1]!;
  m[6] = x[2]!;
  m[7] = y[2]!;
  m[8] = z[2]!;
}

/** Does a ball of radius r at (px,py,pz) touch the body? Fills the push-out normal and depth. */
export function contact(b: Body, px: number, py: number, pz: number, r: number, c: Contact): boolean {
  const m = b.m;
  const dx = px - b.x;
  const dy = py - b.y;
  const dz = pz - b.z;
  const lx = m[0]! * dx + m[3]! * dy + m[6]! * dz;
  const ly = m[1]! * dx + m[4]! * dy + m[7]! * dz;
  const lz = m[2]! * dx + m[5]! * dy + m[8]! * dz;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let depth = 0;
  const s = b.shape;
  switch (s.t) {
    case 'box': {
      const qx = clamp(lx, -s.hx, s.hx);
      const qy = clamp(ly, -s.hy, s.hy);
      const qz = clamp(lz, -s.hz, s.hz);
      const ex = lx - qx;
      const ey = ly - qy;
      const ez = lz - qz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > 1e-12) {
        if (d2 >= r * r) return false;
        const d = Math.sqrt(d2);
        nx = ex / d;
        ny = ey / d;
        nz = ez / d;
        depth = r - d;
      } else {
        const px_ = s.hx - Math.abs(lx);
        const py_ = s.hy - Math.abs(ly);
        const pz_ = s.hz - Math.abs(lz);
        if (px_ <= py_ && px_ <= pz_) {
          nx = Math.sign(lx) || 1;
          depth = px_ + r;
        } else if (pz_ <= py_) {
          nz = Math.sign(lz) || 1;
          depth = pz_ + r;
        } else {
          ny = Math.sign(ly) || 1;
          depth = py_ + r;
        }
      }
      break;
    }
    case 'cyl': {
      const rho = Math.hypot(lx, lz);
      if (rho > s.r || Math.abs(ly) > s.hh) {
        const k = rho > s.r ? s.r / rho : 1;
        const ex = lx - lx * k;
        const ey = ly - clamp(ly, -s.hh, s.hh);
        const ez = lz - lz * k;
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 >= r * r) return false;
        const d = Math.sqrt(d2);
        if (d < 1e-9) return false;
        nx = ex / d;
        ny = ey / d;
        nz = ez / d;
        depth = r - d;
      } else {
        const pr = s.r - rho;
        const pv = s.hh - Math.abs(ly);
        if (pr < pv) {
          nx = rho > 1e-9 ? lx / rho : 1;
          nz = rho > 1e-9 ? lz / rho : 0;
          depth = pr + r;
        } else {
          ny = Math.sign(ly) || 1;
          depth = pv + r;
        }
      }
      break;
    }
    case 'cap': {
      const t = clamp(lx, -s.hl, s.hl);
      const ex = lx - t;
      const d2 = ex * ex + ly * ly + lz * lz;
      const rr = r + s.r;
      if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2);
      if (d > 1e-9) {
        nx = ex / d;
        ny = ly / d;
        nz = lz / d;
      } else ny = 1;
      depth = rr - d;
      break;
    }
    case 'sph': {
      const d2 = lx * lx + ly * ly + lz * lz;
      const rr = r + s.r;
      if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2);
      if (d > 1e-9) {
        nx = lx / d;
        ny = ly / d;
        nz = lz / d;
      } else ny = 1;
      depth = rr - d;
      break;
    }
  }
  c.nx = m[0]! * nx + m[1]! * ny + m[2]! * nz;
  c.ny = m[3]! * nx + m[4]! * ny + m[5]! * nz;
  c.nz = m[6]! * nx + m[7]! * ny + m[8]! * nz;
  c.depth = depth;
  return true;
}

// ---------------------------------------------------------------- movers

export abstract class Mover {
  bodies: Body[] = [];
  constructor(public spec: MoverSpec) {}
  abstract step(t: number, dt: number, w: World | null): void;
}

/** The red windmill's four sails turn in front of the tunnel. */
export class Windmill extends Mover {
  angle = 0;
  constructor(public s: Extract<MoverSpec, { type: 'windmill' }>) {
    super(s);
    for (let i = 0; i < 4; i++) {
      const b = new Body({ t: 'box', hx: s.w / 2, hy: s.len / 2, hz: 0.06 }, 0.55, 'blade', 'blade');
      b.moving = true;
      this.bodies.push(b);
    }
    this.step(0);
    for (const b of this.bodies) b.keep();
  }
  step(t: number): void {
    const s = this.s;
    this.angle = t * s.speed;
    for (let i = 0; i < 4; i++) {
      const b = this.bodies[i]!;
      b.keep();
      const a = this.angle + (i * Math.PI) / 2;
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      // local y along the sail (outwards), local x across it, local z along the axle
      basis(b.m, [-Math.cos(a), -Math.sin(a), 0], [dx, dy, 0], [0, 0, 1]);
      const mid = s.len / 2 + 0.12;
      b.x = s.x + dx * mid;
      b.y = s.hubY + dy * mid;
      b.z = s.z;
    }
  }
}

/** A slow cow that walks between two spots, grazes and turns, and stops for a ball in its way. */
export class Cow extends Mover {
  x: number;
  z: number;
  yaw: number;
  mode: 'walk' | 'graze' | 'turn' | 'wait' = 'walk';
  timer = 0;
  walk = 0;
  /** 0..1 how far the head is down (grazing). */
  head = 0;
  toB = true;
  turnFrom = 0;
  turnTo = 0;
  /** The game reads and clears this to play a moo. */
  moo = false;
  startle = 0;
  scale: number;
  constructor(public s: Extract<MoverSpec, { type: 'cow' }>) {
    super(s);
    this.scale = s.calf ? 0.68 : 1;
    const a = s.a;
    const b = s.b;
    const f = s.phase % 1;
    this.x = a[0] + (b[0] - a[0]) * f;
    this.z = a[1] + (b[1] - a[1]) * f;
    this.yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const k = this.scale;
    const body = new Body({ t: 'box', hx: 0.82 * k, hy: 0.46 * k, hz: 0.38 * k }, 0.5, 'cow', 'cow');
    body.moving = true;
    this.bodies.push(body);
    this.place();
    body.keep();
  }
  private place(): void {
    const b = this.bodies[0]!;
    b.keep();
    b.x = this.x;
    b.y = 0.46 * this.scale;
    b.z = this.z;
    rotY(this.yaw, b.m);
  }
  step(_t: number, dt: number, w: World | null): void {
    if (!w) return;
    const s = this.s;
    const target = this.toB ? s.b : s.a;
    this.startle = Math.max(0, this.startle - dt);
    switch (this.mode) {
      case 'walk': {
        const dx = target[0] - this.x;
        const dz = target[1] - this.z;
        const d = Math.hypot(dx, dz);
        // a ball lying in front: stop and have a look
        const fx = Math.cos(this.yaw);
        const fz = -Math.sin(this.yaw);
        const bx = w.ball.x - this.x;
        const bz = w.ball.z - this.z;
        const ahead = bx * fx + bz * fz;
        const side = Math.abs(-bx * fz + bz * fx);
        if (w.ballSlow() && ahead > 0 && ahead < 1.55 * this.scale && side < 0.7 * this.scale) {
          this.mode = 'wait';
          this.timer = 1.4;
          break;
        }
        this.head = Math.max(0, this.head - dt * 2);
        if (d < 0.05) {
          this.mode = 'graze';
          this.timer = 2.2 + ((s.phase * 7.3) % 1.8);
          break;
        }
        const v = Math.min(d, s.speed * dt * (this.head > 0.2 ? 0.3 : 1));
        this.x += (dx / d) * v;
        this.z += (dz / d) * v;
        this.walk += v * 3.2;
        break;
      }
      case 'graze':
        this.head = Math.min(1, this.head + dt * 1.6);
        this.timer -= dt;
        if (this.timer <= 0) this.turnAround();
        break;
      case 'wait':
        this.head = Math.max(0, this.head - dt * 2);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.moo = true;
          this.turnAround();
        }
        break;
      case 'turn': {
        this.timer += dt / 1.5;
        const k = Math.min(1, this.timer);
        const e = k * k * (3 - 2 * k);
        this.yaw = this.turnFrom + (this.turnTo - this.turnFrom) * e;
        this.walk += dt * 1.5;
        if (k >= 1) this.mode = 'walk';
        break;
      }
    }
    this.place();
  }
  private turnAround(): void {
    this.toB = !this.toB;
    const target = this.toB ? this.s.b : this.s.a;
    const want = Math.atan2(-(target[1] - this.z), target[0] - this.x);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.turnFrom = this.yaw;
    this.turnTo = this.yaw + d;
    this.mode = 'turn';
    this.timer = 0;
  }
}

/** A bar that sweeps round on a post. */
export class Spinner extends Mover {
  angle = 0;
  constructor(public s: Extract<MoverSpec, { type: 'spinner' }>) {
    super(s);
    const bar = new Body({ t: 'box', hx: s.len / 2, hy: 0.2, hz: 0.12 }, 0.7, 'wood', 'spinner');
    bar.moving = true;
    const post = new Body({ t: 'cyl', r: 0.16, hh: 0.4 }, 0.6, 'wood', 'post').at(s.x, 0.4, s.z);
    this.bodies.push(bar, post);
    this.step(0);
    bar.keep();
  }
  step(t: number): void {
    const b = this.bodies[0]!;
    b.keep();
    this.angle = t * this.s.speed;
    b.x = this.s.x;
    b.y = 0.22;
    b.z = this.s.z;
    rotY(this.angle, b.m);
  }
}

/** The merry-go-round: a turning floor with poles (and horses) on it. */
export class Carousel extends Mover {
  angle = 0;
  constructor(public s: Extract<MoverSpec, { type: 'carousel' }>) {
    super(s);
    for (let i = 0; i < s.poles; i++) {
      const b = new Body({ t: 'cyl', r: 0.13, hh: 0.5 }, 0.6, 'metal', 'pole');
      b.moving = true;
      this.bodies.push(b);
    }
    const hub = new Body({ t: 'cyl', r: 0.62, hh: 0.6 }, 0.95, 'rubber', 'hub').at(s.x, s.h + 0.6, s.z);
    this.bodies.push(hub);
    this.step(0);
    for (const b of this.bodies) b.keep();
  }
  /** Where a point of the floor (given at angle 0) is now. */
  carry(px: number, pz: number, out: Pt): void {
    const dx = px - this.s.x;
    const dz = pz - this.s.z;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    out[0] = this.s.x + dx * c + dz * s;
    out[1] = this.s.z - dx * s + dz * c;
  }
  step(t: number): void {
    const s = this.s;
    this.angle = t * s.speed;
    for (let i = 0; i < s.poles; i++) {
      const b = this.bodies[i]!;
      b.keep();
      const a = this.angle + (i / s.poles) * Math.PI * 2 + 0.6;
      b.x = s.x + Math.cos(a) * s.ring;
      b.y = s.h + 0.5;
      b.z = s.z - Math.sin(a) * s.ring;
    }
  }
}

function makeMover(s: MoverSpec): Mover {
  switch (s.type) {
    case 'windmill':
      return new Windmill(s);
    case 'cow':
      return new Cow(s);
    case 'spinner':
      return new Spinner(s);
    case 'carousel':
      return new Carousel(s);
  }
}

// ---------------------------------------------------------------- the ball and its world

export class Ball {
  x = 0;
  y = R_BALL;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  air = false;
  surf: Surf = 'felt';
  /** Speed relative to the ground under it. */
  rel = 0;
  /** Seconds it has lain still. */
  still = 0;
  /** Seconds it has hung still off the ground (on top of something). */
  hang = 0;
  onSpin: Spin | null = null;
  set(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.air = false;
    this.still = 0;
    this.hang = 0;
    this.rel = 0;
  }
}

export type PhysEvent =
  | { t: 'hit'; snd: Snd; v: number; x: number; y: number; z: number; body: Body }
  | { t: 'land'; v: number; surf: Surf }
  | { t: 'water'; x: number; z: number; level: number; flow: Pt | null }
  | { t: 'out' }
  | { t: 'cup' }
  | { t: 'lip'; v: number }
  | { t: 'portal'; i: number }
  | { t: 'rest' };

export interface RailBox {
  /** The bottom middle of the beam at each end. */
  a: [number, number, number];
  b: [number, number, number];
  h: number;
  w: number;
  look: RailSpec['look'];
  body: Body;
}
export interface RailPost {
  x: number;
  y: number;
  z: number;
  h: number;
  look: RailSpec['look'];
}

export interface Water {
  pts: Pt[];
  level: number;
  flow: Pt | null;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const scratch: Sample = { h: 0, gx: 0, gz: 0 };

export interface Ground extends Sample {
  surf: Surf;
  piece: Piece | null;
}

export class World {
  pieces: Piece[] = [];
  bodies: Body[] = [];
  movers: Mover[] = [];
  waters: Water[] = [];
  mud: [number, number, number][] = [];
  rails: RailBox[] = [];
  posts: RailPost[] = [];
  statics: { spec: ObstacleSpec; bodies: Body[] }[] = [];
  ball = new Ball();
  t = 0;
  cup = { x: 0, z: 0, h: NaN, vx: 0, vz: 0 };
  cupBase: Pt;
  cupOn: Carousel | null = null;
  /** The ball rattled out: no second chance until it has left the cup. */
  private cupLatch = false;
  events: PhysEvent[] = [];
  /** Is the ball being simulated (not held by an animation)? */
  live = false;
  private g: Ground = { h: 0, gx: 0, gz: 0, surf: 'felt', piece: null };
  private c: Contact = { nx: 0, ny: 0, nz: 0, depth: 0 };
  private bv = { x: 0, y: 0, z: 0 };
  private wasStill = false;

  constructor(public spec: HoleSpec) {
    // the island's grass first: anything later lies on top of it
    const isl = islandOutline(spec);
    this.pieces.push(new PolyPiece(isl, -0.12, 'out', null));
    for (const g of spec.greens) this.pieces.push(makePiece(g));
    for (const w of spec.waters ?? []) {
      const xs = w.pts.map((p) => p[0]);
      const zs = w.pts.map((p) => p[1]);
      this.waters.push({ pts: w.pts, level: w.level, flow: w.flow ?? null, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
    }
    this.mud = spec.mud ?? [];
    for (const r of spec.rails) this.addRail(r);
    for (const o of spec.obstacles ?? []) this.addObstacle(o);
    for (const m of spec.movers ?? []) {
      const mv = makeMover(m);
      this.movers.push(mv);
      for (const b of mv.bodies) this.bodies.push(b);
    }
    this.cupBase = [spec.cup[0], spec.cup[1]];
    if (spec.cupOn !== undefined) this.cupOn = this.movers[spec.cupOn] as Carousel;
    this.placeCup();
    const tee = spec.tee;
    this.ball.set(tee[0], this.heightAt(tee[0], tee[1]) + R_BALL, tee[1]);
  }

  // ---- building

  private addRail(r: RailSpec): void {
    const h = r.h ?? RAIL_H;
    const w = r.look === 'lip' ? 0.16 : RAIL_W;
    const pts = r.pts.filter((p, i, a) => {
      const q = a[(i + a.length - 1) % a.length]!;
      return i === 0 && !r.closed ? true : Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3;
    });
    const n = pts.length;
    const segs = r.closed ? n : n - 1;
    // which side of each segment is the green: rails sit just outside it
    const out: Pt[] = [];
    for (let i = 0; i < segs; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      const nx = -dz / l;
      const nz = dx / l;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const left = this.onGreen(mx + nx * 0.3, mz + nz * 0.3);
      const right = this.onGreen(mx - nx * 0.3, mz - nz * 0.3);
      if (left && !right) out.push([-nx, -nz]);
      else if (right && !left) out.push([nx, nz]);
      else out.push([0, 0]);
    }
    const off: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const prev = r.closed ? out[(i - 1 + segs) % segs] : out[i - 1];
      const next = r.closed ? out[i % segs] : out[i];
      const p = pts[i]!;
      let ox = 0;
      let oz = 0;
      if (prev && next) {
        const sx = prev[0] + next[0];
        const sz = prev[1] + next[1];
        const sl = Math.hypot(sx, sz);
        if (sl > 1e-6) {
          const mx = sx / sl;
          const mz = sz / sl;
          const cos = Math.max(0.35, mx * next[0] + mz * next[1] || mx * prev[0] + mz * prev[1]);
          ox = (mx * w) / 2 / cos;
          oz = (mz * w) / 2 / cos;
        }
      } else {
        const o = prev ?? next!;
        ox = (o[0] * w) / 2;
        oz = (o[1] * w) / 2;
      }
      off.push([p[0] + ox, p[1] + oz]);
    }
    const ys = pts.map((p) => this.groundNear(p[0], p[1]));
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const a = off[i]!;
      const b = off[j]!;
      this.railBox([a[0], ys[i]!, a[1]], [b[0], ys[j]!, b[1]], h, w, r.look);
    }
    for (let i = 0; i < n; i++) {
      if (r.look === 'lip') continue;
      const p = off[i]!;
      const post = new Body({ t: 'cyl', r: w * 0.55, hh: h / 2 + 0.02 }, 0.7, r.look === 'stone' ? 'stone' : 'wood', 'post').at(p[0], ys[i]! + h / 2 + 0.02, p[1]);
      this.bodies.push(post);
      this.posts.push({ x: p[0], y: ys[i]!, z: p[1], h, look: r.look });
    }
  }

  private railBox(a: [number, number, number], b: [number, number, number], h: number, w: number, look: RailSpec['look']): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const u = [dx / len, dy / len, dz / len];
    let sx = -u[2]!;
    let sz = u[0]!;
    const sl = Math.hypot(sx, sz);
    sx /= sl;
    sz /= sl;
    const side = [sx, 0, sz];
    // up' = side × u
    const up = [side[1]! * u[2]! - side[2]! * u[1]!, side[2]! * u[0]! - side[0]! * u[2]!, side[0]! * u[1]! - side[1]! * u[0]!];
    const body = new Body({ t: 'box', hx: len / 2 + 0.01, hy: h / 2, hz: w / 2 }, look === 'lip' ? 0.4 : 0.72, look === 'stone' ? 'stone' : look === 'fence' ? 'fence' : 'wood', 'rail');
    basis(body.m, u, up, side);
    body.x = (a[0] + b[0]) / 2 + up[0]! * (h / 2);
    body.y = (a[1] + b[1]) / 2 + up[1]! * (h / 2);
    body.z = (a[2] + b[2]) / 2 + up[2]! * (h / 2);
    body.keep();
    this.bodies.push(body);
    this.rails.push({ a, b, h, w, look, body });
  }

  private addObstacle(o: ObstacleSpec): void {
    const bodies: Body[] = [];
    switch (o.type) {
      case 'bale':
        bodies.push(new Body({ t: 'box', hx: 0.55, hy: 0.38, hz: 0.38 }, 0.32, 'hay', 'bale').at(o.x, this.heightAt(o.x, o.z) + 0.38, o.z, o.yaw ?? 0));
        break;
      case 'roundbale':
        if (o.stand) bodies.push(new Body({ t: 'cyl', r: 0.62, hh: 0.5 }, 0.32, 'hay', 'bale').at(o.x, this.heightAt(o.x, o.z) + 0.5, o.z));
        else bodies.push(new Body({ t: 'cap', hl: 0.42, r: 0.58 }, 0.32, 'hay', 'bale').at(o.x, this.heightAt(o.x, o.z) + 0.58, o.z, o.yaw ?? 0));
        break;
      case 'post': {
        const r = o.r ?? 0.3;
        const look = o.look ?? 'stone';
        const e = look === 'bumper' || look === 'hub' ? 1.0 : look === 'flowerbed' ? 0.6 : 0.6;
        const snd: Snd = look === 'bumper' || look === 'hub' ? 'rubber' : look === 'tree' ? 'wood' : 'stone';
        bodies.push(new Body({ t: 'cyl', r, hh: 0.5 }, e, snd, look).at(o.x, this.heightAt(o.x, o.z) + 0.5, o.z));
        break;
      }
      case 'trough':
        bodies.push(new Body({ t: 'box', hx: 0.7, hy: 0.3, hz: 0.32 }, 0.6, 'wood', 'trough').at(o.x, this.heightAt(o.x, o.z) + 0.3, o.z, o.yaw ?? 0));
        break;
      case 'wall': {
        const dx = o.x1 - o.x0;
        const dz = o.z1 - o.z0;
        const len = Math.hypot(dx, dz);
        const h = o.h ?? 1.2;
        const t = o.t ?? 0.3;
        const yaw = Math.atan2(-dz, dx);
        const y = this.heightAt((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
        bodies.push(new Body({ t: 'box', hx: len / 2, hy: h / 2, hz: t / 2 }, 0.6, o.look === 'barn' ? 'wood' : 'stone', 'wall').at((o.x0 + o.x1) / 2, y + h / 2, (o.z0 + o.z1) / 2, yaw));
        break;
      }
    }
    for (const b of bodies) this.bodies.push(b);
    this.statics.push({ spec: o, bodies });
  }

  // ---- queries

  /** Is (x,z) on a green (not the island's grass)? */
  onGreen(x: number, z: number): boolean {
    for (const p of this.pieces) {
      if (p.surf === 'out') continue;
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (p.inside(x, z)) return true;
    }
    return false;
  }

  /** Height of the green near a rail point (looks a little to every side). */
  private groundNear(x: number, z: number): number {
    let best = -Infinity;
    for (const [ox, oz] of [
      [0, 0],
      [0.2, 0],
      [-0.2, 0],
      [0, 0.2],
      [0, -0.2],
      [0.15, 0.15],
      [-0.15, 0.15],
      [0.15, -0.15],
      [-0.15, -0.15],
    ] as const) {
      for (const p of this.pieces) {
        if (p.surf === 'out' || !p.inside(x + ox, z + oz)) continue;
        p.sample(x + ox, z + oz, scratch);
        best = Math.max(best, scratch.h);
      }
    }
    return best === -Infinity ? 0 : best;
  }

  heightAt(x: number, z: number): number {
    return this.ground(x, z, 99, this.g) ? this.g.h : -0.12;
  }

  waterAt(x: number, z: number): Water | null {
    for (const w of this.waters) {
      if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1) continue;
      if (pointInPoly(w.pts, x, z)) return w;
    }
    return null;
  }

  /** The ground under (x,z) no higher than maxY: later pieces lie on top of earlier ones. */
  ground(x: number, z: number, maxY: number, o: Ground): boolean {
    let wet: boolean | null = null;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (!p.inside(x, z)) continue;
      if (p.surf === 'out') {
        if (wet === null) wet = this.waterAt(x, z) !== null;
        if (wet) continue;
      }
      p.sample(x, z, o);
      if (o.h > maxY) continue;
      o.surf = p.surf;
      o.piece = p;
      return true;
    }
    return false;
  }

  inMud(x: number, z: number): boolean {
    for (const [mx, mz, r] of this.mud) if ((x - mx) ** 2 + (z - mz) ** 2 < r * r) return true;
    return false;
  }

  /** Is the ball lying (nearly) still? The cows wait for it. */
  ballSlow(): boolean {
    const b = this.ball;
    return !b.air && b.rel < 0.6;
  }

  private placeCup(): void {
    const tmp: Pt = [0, 0];
    if (this.cupOn) {
      this.cupOn.carry(this.cupBase[0], this.cupBase[1], tmp);
      const w = this.cupOn.s.speed;
      this.cup.vx = w * (tmp[1] - this.cupOn.s.z);
      this.cup.vz = -w * (tmp[0] - this.cupOn.s.x);
    } else {
      tmp[0] = this.cupBase[0];
      tmp[1] = this.cupBase[1];
    }
    this.cup.x = tmp[0];
    this.cup.z = tmp[1];
    if (Number.isNaN(this.cup.h)) {
      // the cup's rim: the felt's height round its edge (a bowl dips towards the middle)
      let h = -Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        h = Math.max(h, this.heightAt(tmp[0] + Math.cos(a) * R_CUP, tmp[1] + Math.sin(a) * R_CUP));
      }
      this.cup.h = h;
    }
  }

  // ---- stepping

  /** One 1/60 s update: the movers always move; the ball only while it is live. */
  update(dt: number): void {
    const n = SUBSTEPS;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.t += h;
      for (const m of this.movers) m.step(this.t, h, this);
      this.placeCup();
      if (this.live) this.substep(this.ball, h, true);
    }
  }

  /** Simulate a shot from where the ball is, without moving anything: the aim line's dots. */
  preview(vx: number, vz: number, maxLen: number, out: number[]): { n: number; bounce: number; end: 'stop' | 'water' | 'out' | 'cup' | 'len' } {
    const b = new Ball();
    const m = this.ball;
    b.x = m.x;
    b.y = m.y;
    b.z = m.z;
    b.vx = vx + (m.onSpin ? m.onSpin.w * (m.z - m.onSpin.cz) : 0);
    b.vz = vz + (m.onSpin ? -m.onSpin.w * (m.x - m.onSpin.cx) : 0);
    b.vy = 0;
    const dt = 1 / 240;
    let len = 0;
    let n = 0;
    let bounce = -1;
    let px = b.x;
    let pz = b.z;
    let acc = 0;
    const stepLen = 0.32;
    out.length = 0;
    out.push(b.x, b.y, b.z);
    n = 1;
    let end: 'stop' | 'water' | 'out' | 'cup' | 'len' = 'len';
    for (let i = 0; i < 240 * 6; i++) {
      const hits = this.substep(b, dt, false);
      const d = Math.hypot(b.x - px, b.z - pz);
      px = b.x;
      pz = b.z;
      len += d;
      acc += d;
      if (hits && bounce < 0) {
        bounce = n;
        out.push(b.x, b.y, b.z);
        n++;
        acc = 0;
      }
      if (acc >= stepLen) {
        acc -= stepLen;
        out.push(b.x, b.y, b.z);
        n++;
      }
      if (this.previewEnd) {
        end = this.previewEnd;
        break;
      }
      if (b.still > 0.05) {
        end = 'stop';
        break;
      }
      if (len >= maxLen) break;
    }
    this.previewEnd = null;
    return { n, bounce, end };
  }
  private previewEnd: 'water' | 'out' | 'cup' | null = null;

  /** Returns true when the ball hit a body this substep. */
  private substep(b: Ball, dt: number, live: boolean): boolean {
    if (b.air) this.airStep(b, dt, live);
    else this.rollStep(b, dt, live);
    const hit = this.collide(b, dt, live);
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp > MAX_SPEED * 1.4) {
      const k = (MAX_SPEED * 1.4) / sp;
      b.vx *= k;
      b.vy *= k;
      b.vz *= k;
    }
    // water, falling off, the cup, the barn doors
    const w = this.waterAt(b.x, b.z);
    if (w && b.y < w.level + R_BALL * 0.6) {
      if (live) {
        this.events.push({ t: 'water', x: b.x, z: b.z, level: w.level, flow: w.flow });
        this.live = false;
      } else this.previewEnd = 'water';
      return hit;
    }
    if (b.y < -2.5 || (!b.air && b.surf === 'out')) {
      if (live) {
        this.events.push({ t: 'out' });
        this.live = false;
      } else this.previewEnd = 'out';
      return hit;
    }
    const cup = this.checkCup(b, live);
    if (cup === 'in') {
      if (live) {
        this.events.push({ t: 'cup' });
        this.live = false;
      } else this.previewEnd = 'cup';
      return hit;
    }
    const ps = this.spec.portals;
    if (ps) {
      for (let i = 0; i < ps.length; i++) {
        const [x0, z0, x1, z1] = ps[i]!.rect;
        if (b.x > x0 && b.x < x1 && b.z > z0 && b.z < z1 && b.y < 1.2) {
          if (live) {
            this.events.push({ t: 'portal', i });
            this.live = false;
          } else this.previewEnd = 'out';
          return hit;
        }
      }
    }
    if (live) {
      // lying still on something that is not the ground (a bale's top): it counts as out
      if (b.air && Math.hypot(b.vx, b.vy, b.vz) < 0.15) b.hang += dt;
      else b.hang = 0;
      if (b.hang > 0.8) {
        this.events.push({ t: 'out' });
        this.live = false;
        return hit;
      }
      const still = !b.air && b.still >= 0.18;
      if (still && !this.wasStill) {
        // hanging over the lip: it drops in after a breath
        const d = Math.hypot(b.x - this.cup.x, b.z - this.cup.z);
        if (d < R_CUP + 0.1) {
          this.events.push({ t: 'cup' });
          this.live = false;
          return hit;
        }
        this.events.push({ t: 'rest' });
      }
      this.wasStill = still;
    }
    return hit;
  }

  /** Start a shot: the ball leaves the tee mat (or wherever it lies) with this velocity. */
  hit(vx: number, vz: number): void {
    const b = this.ball;
    const s = b.onSpin;
    b.vx = vx + (s ? s.w * (b.z - s.cz) : 0);
    b.vz = vz + (s ? -s.w * (b.x - s.cx) : 0);
    b.vy = 0;
    b.air = false;
    b.still = 0;
    b.hang = 0;
    this.wasStill = false;
    this.cupLatch = false;
    this.live = true;
  }

  private rollStep(b: Ball, dt: number, live: boolean): void {
    const g = this.g;
    if (!this.ground(b.x, b.z, b.y - R_BALL + STEP_UP, g)) {
      b.air = true;
      this.airStep(b, dt, live);
      return;
    }
    let surf = g.surf;
    if (surf === 'felt' && this.mud.length && this.inMud(b.x, b.z)) surf = 'mud';
    b.surf = surf;
    const spin = g.piece?.spin ?? null;
    b.onSpin = spin;
    let svx = 0;
    let svz = 0;
    if (spin) {
      svx = spin.w * (b.z - spin.cz);
      svz = -spin.w * (b.x - spin.cx);
    }
    let rvx = b.vx - svx;
    let rvz = b.vz - svz;
    const k = 1 / (1 + g.gx * g.gx + g.gz * g.gz);
    let ax = -G_ROLL * g.gx * k;
    let az = -G_ROLL * g.gz * k;
    // the cup's little dip: a slow ball close by curls in
    const cdx = this.cup.x - b.x;
    const cdz = this.cup.z - b.z;
    const cd = Math.hypot(cdx, cdz);
    const reach = R_CUP + 0.75;
    if (cd < reach && cd > 1e-4) {
      const sp = Math.hypot(rvx - this.cup.vx, rvz - this.cup.vz);
      if (sp < 3.2) {
        const f = 1 - cd / reach;
        const pull = 4.5 * f * f + 0.6 * f;
        ax += (cdx / cd) * pull;
        az += (cdz / cd) * pull;
      }
    }
    const f = FRIC[surf];
    const speed = Math.hypot(rvx, rvz);
    const slopeA = Math.hypot(ax, az);
    if (speed < V_STOP && slopeA <= f.c) {
      rvx = 0;
      rvz = 0;
      b.still += dt;
    } else {
      b.still = 0;
      rvx += ax * dt;
      rvz += az * dt;
      const s2 = Math.hypot(rvx, rvz);
      if (s2 > 0) {
        const ns = Math.max(0, s2 - (f.c + f.k * s2) * dt);
        rvx *= ns / s2;
        rvz *= ns / s2;
      }
    }
    b.vx = rvx + svx;
    b.vz = rvz + svz;
    b.rel = Math.hypot(rvx, rvz);
    const vy = b.vx * g.gx + b.vz * g.gz;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const yPred = b.y + vy * dt;
    if (!this.ground(b.x, b.z, yPred - R_BALL + STEP_UP, g) || yPred - R_BALL > g.h + LIFT) {
      b.air = true;
      b.y = yPred;
      b.vy = vy;
    } else {
      b.y = g.h + R_BALL;
      b.vy = b.vx * g.gx + b.vz * g.gz;
    }
  }

  private airStep(b: Ball, dt: number, live: boolean): void {
    b.onSpin = null;
    b.vy -= GRAV * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.still = 0;
    b.rel = Math.hypot(b.vx, b.vz);
    const g = this.g;
    if (!this.ground(b.x, b.z, b.y - R_BALL + 0.3, g) || b.y - R_BALL > g.h) return;
    let nx = -g.gx;
    let ny = 1;
    let nz = -g.gz;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;
    b.y = g.h + R_BALL;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    b.surf = g.surf;
    if (g.surf === 'out') {
      // landed on the island's grass: that is out
      b.air = false;
      return;
    }
    if (vn >= 0) return;
    const bounce = vn < -2.4;
    const e = bounce ? 0.3 : 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    b.vz -= (1 + e) * vn * nz;
    b.vx *= 0.95;
    b.vz *= 0.95;
    if (live && -vn > 1) this.events.push({ t: 'land', v: -vn, surf: g.surf });
    if (!bounce) {
      b.air = false;
      b.vy = b.vx * g.gx + b.vz * g.gz;
    }
  }

  private collide(b: Ball, dt: number, live: boolean): boolean {
    const c = this.c;
    const bv = this.bv;
    let hit = false;
    let best: { body: Body; v: number } | null = null;
    for (let it = 0; it < 2; it++) {
      for (const body of this.bodies) {
        if (!body.enabled) continue;
        const dx = b.x - body.x;
        const dz = b.z - body.z;
        const br = body.bound + R_BALL + 0.05;
        if (dx * dx + dz * dz > br * br) continue;
        if (Math.abs(b.y - body.y) > br) continue;
        if (!contact(body, b.x, b.y, b.z, R_BALL, c)) continue;
        b.x += c.nx * c.depth;
        b.y += c.ny * c.depth;
        b.z += c.nz * c.depth;
        bv.x = bv.y = bv.z = 0;
        if (body.moving) body.velocityAt(b.x - c.nx * R_BALL, b.y - c.ny * R_BALL, b.z - c.nz * R_BALL, dt, bv);
        const rx = b.vx - bv.x;
        const ry = b.vy - bv.y;
        const rz = b.vz - bv.z;
        const vn = rx * c.nx + ry * c.ny + rz * c.nz;
        if (vn < 0) {
          const e = -vn < 0.45 ? 0.05 : body.e;
          let nrx = rx - (1 + e) * vn * c.nx;
          let nry = ry - (1 + e) * vn * c.ny;
          let nrz = rz - (1 + e) * vn * c.nz;
          // a little grip along the surface
          const tv = nrx * c.nx + nry * c.ny + nrz * c.nz;
          const tx = nrx - tv * c.nx;
          const ty = nry - tv * c.ny;
          const tz = nrz - tv * c.nz;
          const grip = body.snd === 'hay' ? 0.12 : 0.03;
          nrx -= tx * grip;
          nry -= ty * grip;
          nrz -= tz * grip;
          b.vx = nrx + bv.x;
          b.vy = nry + bv.y;
          b.vz = nrz + bv.z;
          if (-vn > 0.3) {
            hit = true;
            if (!best || -vn > best.v) best = { body, v: -vn };
          }
          // knocked upwards off an edge (the pond's lip, a rail top): it flies
          if (!b.air && c.ny > 0.25 && b.vy > 0.6) b.air = true;
          b.still = 0;
        }
      }
    }
    if (live && best) this.events.push({ t: 'hit', snd: best.body.snd, v: best.v, x: b.x, y: b.y, z: b.z, body: best.body });
    return hit;
  }

  private checkCup(b: Ball, live: boolean): 'in' | 'lip' | null {
    const cup = this.cup;
    const dx = b.x - cup.x;
    const dz = b.z - cup.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > R_CUP * R_CUP) {
      if (d2 > (R_CUP + R_BALL) ** 2) this.cupLatch = false;
      return null;
    }
    if (this.cupLatch) return null;
    if (b.y - R_BALL > cup.h + 0.15) return null;
    const rvx = b.vx - cup.vx;
    const rvz = b.vz - cup.vz;
    const speed = Math.hypot(rvx, rvz);
    if (speed < 0.05) return 'in';
    const ux = rvx / speed;
    const uz = rvz / speed;
    const off = dx * uz - dz * ux; // signed distance from the middle to the ball's line
    const chord = 2 * Math.sqrt(Math.max(0, R_CUP * R_CUP - off * off));
    const vcap = Math.max(V_CAP_MIN, chord / T_DROP);
    if (speed <= vcap) return 'in';
    if (!live) return null;
    // too fast: it rattles over the far edge and hops out
    this.cupLatch = true;
    const turn = clamp(off / R_CUP, -1, 1) * 0.45;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const k = 0.7;
    const nvx = (rvx * c - rvz * s) * k;
    const nvz = (rvx * s + rvz * c) * k;
    b.vx = nvx + cup.vx;
    b.vz = nvz + cup.vz;
    b.vy = 1.4 + speed * 0.08;
    b.air = true;
    this.events.push({ t: 'lip', v: speed });
    return 'lip';
  }
}

function makePiece(g: GreenSpec): Piece {
  switch (g.kind) {
    case 'poly':
      return new PolyPiece(g.pts, g.h ?? 0, g.surf ?? 'felt', g, g.slope?.[0] ?? 0, g.slope?.[1] ?? 0);
    case 'lane':
      return new LanePiece(g.a, g.b, g.hw, g.h0, g.h1, g.prof, g.surf ?? 'felt', g);
    case 'disc': {
      const p = new DiscPiece(g.c[0], g.c[1], g.r, g.rin ?? 0, g.h, g.prof ?? 'flat', g.rim ?? g.r * 0.4, g.height ?? 0, g.depth ?? 0, g.surf ?? 'felt', g);
      if (g.spin) p.spin = { cx: g.c[0], cz: g.c[1], w: g.spin };
      return p;
    }
  }
}

// ---------------------------------------------------------------- the island's shape

/** A rounded, slightly wobbly outline around every green (unless the hole gives its own). */
export function islandOutline(spec: HoleSpec): Pt[] {
  if (spec.island?.outline) return spec.island.outline;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const add = (x: number, z: number): void => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  };
  for (const g of spec.greens) {
    if (g.kind === 'poly') for (const p of g.pts) add(p[0], p[1]);
    else if (g.kind === 'lane') {
      add(g.a[0] - g.hw, g.a[1] - g.hw);
      add(g.a[0] + g.hw, g.a[1] + g.hw);
      add(g.b[0] - g.hw, g.b[1] - g.hw);
      add(g.b[0] + g.hw, g.b[1] + g.hw);
    } else {
      add(g.c[0] - g.r, g.c[1] - g.r);
      add(g.c[0] + g.r, g.c[1] + g.r);
    }
  }
  const m = spec.island?.margin ?? 1.7;
  return roundedRect(x0 - m, z0 - m, x1 + m, z1 + m, 2.4, 0.22, spec.name.length);
}

/** Points around a rounded rectangle, nudged in and out a little so it looks hand-made. */
export function roundedRect(x0: number, z0: number, x1: number, z1: number, rad: number, wobble: number, seed: number): Pt[] {
  const r = Math.min(rad, (x1 - x0) / 2, (z1 - z0) / 2);
  // corners in order round the box; each arc turns a quarter, straight edges get points every ~0.8
  const corners: [number, number, number][] = [
    [x1 - r, z0 + r, -Math.PI / 2],
    [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2],
    [x0 + r, z0 + r, Math.PI],
  ];
  const raw: Pt[] = [];
  for (let c = 0; c < 4; c++) {
    const [cx, cz, a0] = corners[c]!;
    for (let i = 0; i <= 5; i++) {
      const a = a0 + (i / 5) * (Math.PI / 2);
      raw.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    const [nx, nz, na] = corners[(c + 1) % 4]!;
    const ex = cx + Math.cos(a0 + Math.PI / 2) * r;
    const ez = cz + Math.sin(a0 + Math.PI / 2) * r;
    const sx = nx + Math.cos(na) * r;
    const sz = nz + Math.sin(na) * r;
    const len = Math.hypot(sx - ex, sz - ez);
    const steps = Math.max(1, Math.round(len / 0.8));
    for (let i = 1; i < steps; i++) raw.push([ex + ((sx - ex) * i) / steps, ez + ((sz - ez) * i) / steps]);
  }
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const pts: Pt[] = [];
  for (let i = 0; i < raw.length; i++) {
    const [x, z] = raw[i]!;
    const n = Math.sin(i * 1.7 + seed * 3.1) * 0.6 + Math.sin(i * 0.53 + seed) * 0.4;
    const dx = x - mx;
    const dz = z - mz;
    const l = Math.hypot(dx, dz) || 1;
    pts.push([x + (dx / l) * n * wobble, z + (dz / l) * n * wobble]);
  }
  return pts;
}

/** How fast a shot of this power (0..1) leaves the ball: gentle at the bottom for short putts. */
export const shotSpeed = (p: number): number => 0.8 + 16.2 * Math.pow(Math.max(0, Math.min(1, p)), 1.15);
