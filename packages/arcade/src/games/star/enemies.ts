// The storm's geometric aliens. Each enemy describes its look once (shapes → emit) and that is
// used both to draw it and to break it into flying line pieces when it pops.
import type { Game, Power } from './game.ts';
import type { Poly } from './fx.ts';
import type { Pen } from './render.ts';
import { C, FH, FW, TAU, angleDiff, dist2, easeOut, rand, regular, rockPoly, starPoly } from './util.ts';

export type Emit = (pts: readonly number[], x: number, y: number, rot: number, sc: number, closed: boolean, color: string, sx?: number, w?: number) => void;

/** Things that pop together for a bonus (a formation, a snake). */
export class Group {
  total = 0;
  killed = 0;
  lost = 0;
  constructor(
    public bonus: number,
    public label: string,
  ) {}
}

// ---- drawing through the emit callback ----

let curPen: Pen | null = null;
let curFlash = false;
let curAlpha = 1;
const drawEmit: Emit = (pts, x, y, rot, sc, closed, color, sx = 1, w = 2) => {
  const p = curPen!;
  p.begin();
  p.shape(pts, x, y, rot, sc, closed, sx);
  p.stroke(curFlash ? '#ffffff' : color, p.lw(w), curAlpha);
};

export function toWorld(pts: readonly number[], x: number, y: number, rot: number, sc: number, sx = 1): number[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const lx = pts[i]! * sc * sx;
    const ly = pts[i + 1]! * sc;
    out.push(x + lx * c - ly * s, y + lx * s + ly * c);
  }
  return out;
}

export abstract class Enemy {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = 16;
  hp = 1;
  maxHp = 1;
  t = 0;
  rot = 0;
  dead = false;
  /** Popped by the player (not just flown away). */
  killed = false;
  /** > 0: drawn white after a hit; it can blink again once it is below -0.07. */
  flash = -1;
  points = 4;
  stars = 1;
  color: string = C.cyan;
  /** Shots spark off it (a boss on its way in, a closed core). */
  armored = false;
  /** Bosses keep the chain alive while you hit them and are not hurt by touching them... */
  boss = false;
  /** ...and touching anything solid hurts the player. */
  solid = true;
  group: Group | null = null;
  bombId = -1;
  /** 0..1: how big the pop is (sound, shake, pieces). */
  size = 0.2;
  /** Bombs do at most this much damage. */
  bombDamage = 40;

  abstract update(g: Game, dt: number): void;
  abstract shapes(emit: Emit, g: Game): void;

  draw(pen: Pen, g: Game): void {
    curPen = pen;
    curFlash = this.flash > 0;
    curAlpha = 1;
    this.shapes(drawEmit, g);
  }

  parts(g: Game): Poly[] {
    const out: Poly[] = [];
    this.shapes((pts, x, y, rot, sc, closed, color, sx = 1) => out.push({ pts: toWorld(pts, x, y, rot, sc, sx), closed, color }), g);
    return out;
  }

  hits(x: number, y: number, r: number): boolean {
    return dist2(x, y, this.x, this.y) < (r + this.r) ** 2;
  }

  /** Does a vertical laser at x (half width w) reach me? */
  beamHits(x: number, w: number): boolean {
    return Math.abs(x - this.x) < this.r + w;
  }

  healthFrac(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  /** Shots spark off it right now. */
  shielded(): boolean {
    return this.armored;
  }

  damage(g: Game, d: number): void {
    if (this.dead) return;
    if (this.armored) return;
    this.hp -= d;
    if (this.flash <= -0.07) this.flash = 0.05;
    if (this.boss) g.keepChain();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killed = true;
      g.onKill(this);
      this.onDeath(g);
    }
  }

  onDeath(_g: Game): void {}

  offscreen(): boolean {
    return this.y > FH + 90 || this.x < -170 || this.x > FW + 170 || this.y < -420;
  }

  setHp(hp: number): this {
    this.hp = hp;
    this.maxHp = hp;
    return this;
  }
}

// ---- shapes ----

const DIAMOND = [0, -22, 15, 0, 0, 22, -15, 0];
const DIAMOND_IN = [0, -10, 7, 0, 0, 10, -7, 0];
const CHEVRON = [-17, -11, 0, 9, 17, -11, 0, -3];
const CHEVRON_IN = [-6, -4, 0, 2, 6, -4];
const SPINNER = starPoly(4, 23, 7, 0);
const SPINNER_IN = regular(4, 6, Math.PI / 4);
const HEX = regular(6, 1, 0);
const TRI_DOWN = regular(3, 1, Math.PI / 2);
const TRI_UP = regular(3, 1, -Math.PI / 2);
const CROSS = [-1, 0, 1, 0];
const SNAKE_SEG = regular(6, 9, Math.PI / 6);
const SNAKE_DOT = regular(4, 3, 0);
const SNAKE_HEAD = [-13, -8, 0, -13, 13, -8, 13, 6, 0, 15, -13, 6];
const SNAKE_V = [-7, 0, 0, 7, 7, 0];

/** A zigzagging diamond that spins like a coin as it falls. */
export class Diamond extends Enemy {
  private x0: number;
  private fired = false;
  private fireAt: number;
  constructor(
    x: number,
    y: number,
    private amp = 70,
    private freq = 2.4,
    vy = 105,
    private phase = 0,
    private shoots = false,
  ) {
    super();
    this.x = this.x0 = x;
    this.y = y;
    this.vy = vy;
    this.r = 17;
    this.setHp(2);
    this.points = 4;
    this.color = C.cyan;
    this.fireAt = rand(130, 330);
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    this.y += this.vy * dt;
    this.x = this.x0 + Math.sin(this.t * this.freq + this.phase) * this.amp;
    this.rot = Math.cos(this.t * this.freq + this.phase) * 0.35;
    if (this.shoots && !this.fired && this.y > this.fireAt) {
      this.fired = true;
      g.shoot(this.x, this.y + 10, g.aim(this.x, this.y), 150);
    }
  }
  shapes(emit: Emit): void {
    const spin = Math.cos(this.t * 4.2);
    emit(DIAMOND, this.x, this.y, this.rot, 1, true, this.color, 0.25 + Math.abs(spin) * 0.75);
    emit(DIAMOND_IN, this.x, this.y, this.rot, 1, true, C.ice, Math.abs(Math.sin(this.t * 4.2)) * 0.9 + 0.1, 1.5);
  }
}

export type PathFn = (u: number) => [number, number];

/** A cubic Bézier path through four points. */
export function bez(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): PathFn {
  return (u) => {
    const v = 1 - u;
    const a = v * v * v;
    const b = 3 * v * v * u;
    const c = 3 * v * u * u;
    const d = u * u * u;
    return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
  };
}

/** One arrow in a formation: it follows a path and points the way it flies. */
export class Chevron extends Enemy {
  private shotAt: number;
  private fired = false;
  constructor(
    private path: PathFn,
    private dur: number,
    private delay: number,
    group: Group,
    shoots: boolean,
    color: string = C.yellow,
  ) {
    super();
    this.group = group;
    group.total++;
    this.r = 15;
    this.setHp(2);
    this.points = 4;
    this.color = color;
    this.shotAt = shoots ? rand(0.3, 0.55) : 99;
    const [x, y] = path(0);
    this.x = x;
    this.y = y - 2000; // hidden until its turn
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    const u = (this.t - this.delay) / this.dur;
    if (u < 0) return;
    if (u > 1) {
      this.dead = true;
      if (this.group) this.group.lost++;
      return;
    }
    const [x, y] = this.path(u);
    const [x2, y2] = this.path(Math.min(1, u + 0.01));
    if (x2 !== x || y2 !== y) this.rot = Math.atan2(y2 - y, x2 - x) - Math.PI / 2;
    this.x = x;
    this.y = y;
    if (!this.fired && u > this.shotAt) {
      this.fired = true;
      g.shoot(this.x, this.y, g.aim(this.x, this.y), 160);
    }
  }
  offscreen(): boolean {
    return false;
  }
  shapes(emit: Emit): void {
    if (this.t < this.delay) return;
    emit(CHEVRON, this.x, this.y, this.rot, 1, true, this.color);
    emit(CHEVRON_IN, this.x, this.y, this.rot, 1, false, C.white, 1, 1.5);
  }
  hits(x: number, y: number, r: number): boolean {
    return this.t >= this.delay && super.hits(x, y, r);
  }
}

/** A spinning star: it flies in, stops, fires a few times and dives away. */
export class Spinner extends Enemy {
  private y0: number;
  private x0: number;
  private cd: number;
  private volleys = 0;
  private leaving = false;
  constructor(
    x: number,
    private ty: number,
    private mode: 'aim' | 'fan' | 'ring',
    private maxVolleys = 3,
    private wait = 0,
  ) {
    super();
    this.x = this.x0 = x;
    this.y = this.y0 = -40;
    this.r = 20;
    this.setHp(7);
    this.points = 12;
    this.stars = 2;
    this.size = 0.4;
    this.color = C.magenta;
    this.cd = 1.2;
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    const t = this.t - this.wait;
    if (t < 0) {
      this.y = -60;
      return;
    }
    this.rot += dt * (this.leaving ? 9 : 4.5);
    if (t < 1.3) {
      this.y = this.y0 + (this.ty - this.y0) * easeOut(t / 1.3);
      return;
    }
    if (!this.leaving) {
      this.y = this.ty + Math.sin(t * 2.2) * 8;
      this.x = this.x0 + Math.sin(t * 1.3) * 14;
      this.cd -= dt * g.fireRate;
      if (this.cd <= 0) {
        this.cd = this.mode === 'ring' ? 2.1 : 1.5;
        this.volleys++;
        const a = g.aim(this.x, this.y);
        if (this.mode === 'aim') g.shoot(this.x, this.y, a, 150);
        else if (this.mode === 'fan') g.fan(this.x, this.y, 3, 0.32, 150, a);
        else g.ring(this.x, this.y, 8, 120, rand(0, TAU));
        g.fx.ring(this.x, this.y, C.magenta, 160, 0.25, 2);
        if (this.volleys >= this.maxVolleys) {
          this.leaving = true;
          const dir = g.player.x < this.x ? -1 : 1;
          this.vx = dir * 70;
          this.vy = 40;
        }
      }
    } else {
      this.vy += 260 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
  }
  shapes(emit: Emit): void {
    emit(SPINNER, this.x, this.y, this.rot, 1, true, this.color);
    emit(SPINNER_IN, this.x, this.y, -this.rot * 1.5, 1, true, C.yellow, 1, 1.5);
  }
}

/** A hexagon that breaks in two when popped, and its halves break in two again. */
export class Splitter extends Enemy {
  constructor(
    x: number,
    y: number,
    private gen: 0 | 1 | 2,
    vx = 0,
    vy = 55,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = gen === 0 ? 27 : gen === 1 ? 17 : 10;
    this.setHp(gen === 0 ? 9 : gen === 1 ? 3 : 1);
    this.points = gen === 0 ? 10 : gen === 1 ? 4 : 2;
    this.stars = gen === 0 ? 2 : gen === 1 ? 1 : 0;
    this.size = gen === 0 ? 0.45 : gen === 1 ? 0.25 : 0.1;
    this.color = C.magenta;
    this.rot = rand(0, TAU);
  }
  update(_g: Game, dt: number): void {
    this.t += dt;
    const target = this.gen === 0 ? 55 : this.gen === 1 ? 85 : 140;
    this.vx *= Math.exp(-1.6 * dt);
    this.vy += (target - this.vy) * Math.min(1, 2 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 20 && this.vx < 0) this.vx = -this.vx;
    if (this.x > FW - 20 && this.vx > 0) this.vx = -this.vx;
    this.rot += dt * (this.gen === 0 ? 0.8 : this.gen === 1 ? -1.6 : 3);
  }
  shapes(emit: Emit): void {
    if (this.gen === 2) {
      emit(TRI_DOWN, this.x, this.y, this.rot, this.r * 1.1, true, C.pink);
      return;
    }
    emit(HEX, this.x, this.y, this.rot, this.r, true, this.color);
    emit(TRI_UP, this.x, this.y, -this.rot * 1.3, this.r * 0.55, true, C.cyan, 1, 1.5);
    if (this.gen === 0) emit(CROSS, this.x, this.y, this.rot, this.r * 0.3, false, C.white, 1, 1.5);
  }
  onDeath(g: Game): void {
    if (this.gen === 2) return;
    const next = (this.gen + 1) as 1 | 2;
    for (const s of [-1, 1]) {
      const c = new Splitter(this.x + s * this.r * 0.4, this.y, next, s * (next === 1 ? 150 : 170), -50);
      c.bombId = -1;
      g.spawn(c);
    }
  }
}

/** One piece of a snake: all pieces follow the same wavy path a little behind each other. */
export class SnakeSeg extends Enemy {
  head = false;
  constructor(
    private cx: number,
    private amp: number,
    private freq: number,
    private speed: number,
    private lag: number,
    group: Group,
    private dir = 1,
  ) {
    super();
    this.group = group;
    group.total++;
    this.r = 11;
    this.setHp(2);
    this.points = 3;
    this.stars = 1;
    this.size = 0.15;
    this.color = C.yellow;
    this.y = -3000;
  }
  update(_g: Game, dt: number): void {
    this.t += dt;
    const tau = this.t - this.lag;
    if (tau < 0) {
      this.y = -3000;
      return;
    }
    this.x = this.cx + Math.sin(tau * this.freq) * this.amp * this.dir;
    this.y = -30 + tau * this.speed;
    const nx = this.cx + Math.sin((tau + 0.05) * this.freq) * this.amp * this.dir;
    const ny = -30 + (tau + 0.05) * this.speed;
    this.rot = Math.atan2(ny - this.y, nx - this.x) - Math.PI / 2;
  }
  offscreen(): boolean {
    const off = this.y > FH + 60;
    if (off && this.group && !this.dead) this.group.lost++;
    return off;
  }
  shapes(emit: Emit): void {
    if (this.y < -200) return;
    if (this.head) {
      emit(SNAKE_HEAD, this.x, this.y, this.rot, 1, true, C.magenta);
      emit(SNAKE_V, this.x, this.y, this.rot, 1, false, C.white, 1, 1.5);
    } else {
      emit(SNAKE_SEG, this.x, this.y, this.rot + this.t * 2, 1, true, this.color);
      emit(SNAKE_DOT, this.x, this.y, this.t * -3, 1, true, C.cyan, 1, 1.5);
    }
  }
  hits(x: number, y: number, r: number): boolean {
    return this.y > -100 && super.hits(x, y, r);
  }
}

/** Makes the first living piece of each snake its head (and tougher). */
export function updateSnakeHeads(enemies: Enemy[]): void {
  const seen = new Set<Group>();
  for (const e of enemies) {
    if (!(e instanceof SnakeSeg) || e.dead || !e.group) continue;
    if (!seen.has(e.group)) {
      seen.add(e.group);
      if (!e.head) {
        e.head = true;
        e.points = 10;
        e.stars = 2;
        e.r = 13;
        e.hp = Math.max(e.hp, 4);
        e.maxHp = 4;
      }
    }
  }
}

/** A drifting rock; some carry a little cannon that aims at you. Rocks without one break into pebbles. */
export class Rock extends Enemy {
  private poly: number[];
  private spin: number;
  private aimA = Math.PI / 2;
  private cd: number;
  constructor(
    x: number,
    y: number,
    rad: number,
    private turret: 'none' | 'aim' | 'fan',
    vx = 0,
    vy = 55,
    private pebble = false,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = rad;
    this.poly = rockPoly(rad, pebble ? 7 : 11);
    this.spin = rand(-0.7, 0.7);
    this.rot = rand(0, TAU);
    this.color = C.gold;
    this.cd = rand(0.8, 1.8);
    if (turret !== 'none') {
      this.setHp(12);
      this.points = 16;
      this.stars = 3;
      this.size = 0.55;
    } else if (pebble) {
      this.setHp(1);
      this.points = 2;
      this.stars = 0;
      this.size = 0.1;
    } else {
      this.setHp(6);
      this.points = 6;
      this.stars = 1;
      this.size = 0.35;
    }
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.turret !== 'none') {
      const want = g.aim(this.x, this.y);
      this.aimA += angleDiff(this.aimA, want) * Math.min(1, dt * 3);
      if (this.y > 30 && this.y < FH * 0.62) {
        this.cd -= dt * g.fireRate;
        if (this.cd <= 0.35 && this.cd + dt * g.fireRate > 0.35) g.fx.ring(this.x, this.y, C.cyan, -40, 0.3, 2, 0, 22);
        if (this.cd <= 0) {
          this.cd = this.turret === 'fan' ? 2.4 : 1.9;
          const bx = this.x + Math.cos(this.aimA) * 22;
          const by = this.y + Math.sin(this.aimA) * 22;
          if (this.turret === 'fan') g.fan(bx, by, 3, 0.28, 150, this.aimA);
          else g.shoot(bx, by, this.aimA, 155);
        }
      }
    }
  }
  shapes(emit: Emit): void {
    emit(this.poly, this.x, this.y, this.rot, 1, true, this.color);
    if (this.turret !== 'none') {
      emit(TURRET_BASE, this.x, this.y, this.rot, 1, true, C.cyan, 1, 1.8);
      emit(TURRET_BARREL, this.x, this.y, this.aimA, 1, false, C.ice, 1, 2.5);
    } else if (!this.pebble) {
      emit(CRATER, this.x + this.r * 0.25, this.y - this.r * 0.2, this.rot, this.r * 0.22, true, this.color, 1, 1.2);
    }
  }
  onDeath(g: Game): void {
    if (this.turret === 'none' && !this.pebble) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(-0.4, 0.4);
        const p = new Rock(this.x + Math.cos(a) * 8, this.y + Math.sin(a) * 8, rand(8, 11), 'none', Math.cos(a) * 110, Math.sin(a) * 60 + 70, true);
        g.spawn(p);
      }
    }
  }
}
const TURRET_BASE = regular(8, 11, 0);
const TURRET_BARREL = [0, 0, 22, 0];
const CRATER = regular(7, 1, 0);

/** A glowing capsule carrying an upgrade: pop it to set the present free. */
export class Carrier extends Enemy {
  private x0: number;
  constructor(
    x: number,
    public power: Power,
  ) {
    super();
    this.x = this.x0 = x;
    this.y = -40;
    this.vy = 62;
    this.r = 22;
    this.setHp(6);
    this.points = 10;
    this.stars = 2;
    this.size = 0.4;
    this.color = C.white;
  }
  update(_g: Game, dt: number): void {
    this.t += dt;
    this.y += this.vy * dt;
    this.x = this.x0 + Math.sin(this.t * 1.4) * 40;
    this.rot += dt * 1.2;
  }
  shapes(emit: Emit, g: Game): void {
    emit(HEX, this.x, this.y, this.rot, 22, true, this.color);
    emit(HEX, this.x, this.y, -this.rot * 0.7, 27 + Math.sin(this.t * 6) * 2, true, powerColor(this.power), 1, 1.2);
    drawPowerIcon(emit, this.power, this.x, this.y, 0.75, g);
  }
  onDeath(g: Game): void {
    g.dropPower(this.x, this.y, this.power);
  }
}

// ---- power-up icons ----

export const POWER_NAMES: Record<Power, string> = {
  twin: 'TVILLINGSKOTT',
  spread: 'SPRIDNING',
  laser: 'LASER',
  homing: 'JAKTSTJÄRNOR',
  shield: 'SKÖLD',
  bomb: 'EXTRA BOMB',
  life: 'EXTRA LIV',
};

export function powerColor(p: Power): string {
  switch (p) {
    case 'spread':
      return C.yellow;
    case 'laser':
      return C.cyan;
    case 'homing':
      return C.magenta;
    case 'shield':
      return C.blue;
    case 'bomb':
      return C.gold;
    case 'life':
      return C.green;
    default:
      return C.white;
  }
}

// three bolts flying apart, from a little gun below
const ICON_SPREAD = [
  [-4, -1, -9, -10],
  [0, -2, 0, -12],
  [4, -1, 9, -10],
  [-6, 9, 0, 3, 6, 9],
];
// a beam with a glowing tip
const ICON_LASER = [
  [0, 10, 0, -11],
  [-3, 10, -3, -4],
  [3, 10, 3, -4],
  [-5, -11, 5, -11],
];
const ICON_STAR = starPoly(5, 10, 4);
const ICON_SHIELD = [-9, -9, 9, -9, 9, 1, 0, 10, -9, 1];
const ICON_BOMB = starPoly(8, 11, 4.5);
const ICON_ROCKET = [0, -11, 5, -3, 5, 7, -5, 7, -5, -3];
const ICON_FINS = [-5, 2, -9, 9, -5, 7, 5, 7, 9, 9, 5, 2];

export function drawPowerIcon(emit: Emit, p: Power, x: number, y: number, sc: number, g: Game): void {
  const col = powerColor(p);
  switch (p) {
    case 'spread':
      for (const l of ICON_SPREAD) emit(l, x, y, 0, sc, false, col, 1, 2);
      break;
    case 'laser':
      for (const l of ICON_LASER) emit(l, x, y, 0, sc, false, col, 1, 2);
      break;
    case 'homing':
      emit(ICON_STAR, x, y, g.t * 2, sc, true, col, 1, 2);
      break;
    case 'shield':
      emit(ICON_SHIELD, x, y, 0, sc, true, col, 1, 2);
      break;
    case 'bomb':
      emit(ICON_BOMB, x, y, g.t, sc, true, col, 1, 2);
      break;
    case 'life':
      emit(ICON_ROCKET, x, y, 0, sc, true, col, 1, 2);
      emit(ICON_FINS, x, y, 0, sc, false, col, 1, 2);
      break;
    default:
      break;
  }
}

