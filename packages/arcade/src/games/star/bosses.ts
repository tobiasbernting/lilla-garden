// The sector guards and the storm's heart, Stormkristallen.
import { Diamond, Enemy, type Emit } from './enemies.ts';
import type { Poly } from './fx.ts';
import type { Game } from './game.ts';
import type { Pen } from './render.ts';
import { C, FH, FW, TAU, clamp, easeOut, rand, regular, rockPoly, starPoly } from './util.ts';

type BossState = 'enter' | 'fight' | 'dying' | 'flee';

export abstract class Boss extends Enemy {
  name = '';
  state: BossState = 'enter';
  st = 0;
  ty = 190;
  enterTime = 2.6;
  fleeAfter = 55;
  final = false;
  /** Seconds of the death show. */
  dieTime = 1.5;
  private boomCd = 0;
  private imploded = false;
  children: Enemy[] = [];

  constructor() {
    super();
    this.boss = true;
    this.armored = true;
    this.x = FW / 2;
    this.y = -170;
    this.size = 1;
    this.points = 0;
    this.bombDamage = 30;
  }

  /** Called once when it is added to the game (spawn the parts here). */
  onSpawn(_g: Game): void {}
  onFight(_g: Game): void {}
  abstract fight(g: Game, dt: number): void;

  update(g: Game, dt: number): void {
    this.t += dt;
    this.st += dt;
    switch (this.state) {
      case 'enter': {
        const k = easeOut(this.st / this.enterTime);
        this.y = -170 + (this.ty + 170) * k;
        this.x = FW / 2;
        if (this.st >= this.enterTime) {
          this.state = 'fight';
          this.st = 0;
          this.armored = false;
          this.onFight(g);
        }
        break;
      }
      case 'fight':
        this.fight(g, dt);
        if (!this.final && this.st > this.fleeAfter) {
          this.state = 'flee';
          this.st = 0;
          this.armored = true;
          g.onBossFlee(this);
        }
        break;
      case 'dying': {
        this.boomCd -= dt;
        if (this.boomCd <= 0) {
          // pops all over it, faster and faster
          const k = this.st / this.dieTime;
          this.boomCd = this.final ? 0.12 - k * 0.07 : 0.13;
          const a = rand(0, TAU);
          const d = rand(0, this.r * (this.final ? 1.5 : 1.1));
          const col = this.final ? ([C.white, C.cyan, C.magenta, C.yellow][Math.floor(Math.random() * 4)] ?? C.white) : Math.random() < 0.5 ? this.color : C.white;
          g.explodeAt(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d * 0.9, col, this.final ? 0.6 + k * 0.6 : 0.5);
          if (this.final) g.flashScreen(col, 0.08 + k * 0.12);
        }
        // the light pulls in before the last blast
        if (this.final && !this.imploded && this.st > this.dieTime - 0.75) {
          this.imploded = true;
          for (let i = 0; i < 4; i++) g.fx.ring(this.x, this.y, i % 2 ? C.white : C.magenta, -760, 0.75, 4, 6 * (i % 2), 360 - i * 50, i * 0.07);
          g.sound.play('charge');
        }
        this.x += Math.sin(this.st * 40) * (this.final ? 1.6 : 0.8);
        if (this.st >= this.dieTime) {
          this.dead = true;
          this.killed = true;
          g.onKill(this);
          g.onBossDefeated(this);
        }
        break;
      }
      case 'flee':
        this.y -= 240 * dt * Math.min(1, this.st * 1.5);
        if (this.y < -280) {
          this.dead = true;
          g.onBossGone(this);
        }
        break;
    }
  }

  damage(g: Game, d: number): void {
    if (this.state !== 'fight' || this.armored || this.dead) return;
    this.hp -= d;
    if (this.flash <= -0.07) this.flash = 0.05;
    g.keepChain();
    if (this.hp <= 0) this.phaseDone(g);
  }

  shielded(): boolean {
    return this.state !== 'fight' || this.armored;
  }

  /** The health bar ran out: die (bosses with phases change instead). */
  phaseDone(g: Game): void {
    this.hp = 0;
    this.state = 'dying';
    this.st = 0;
    this.armored = true;
    g.onBossDying(this);
  }

  offscreen(): boolean {
    return false;
  }
}

/** A part that rides on a boss (a cannon, a pod): it pops when the boss pops. */
abstract class Part extends Enemy {
  constructor(public parent: Boss) {
    super();
    this.solid = false;
    this.bombDamage = 25;
  }
  get active(): boolean {
    return this.parent.state === 'fight';
  }
  damage(g: Game, d: number): void {
    if (!this.active) return;
    super.damage(g, d);
  }
  shielded(): boolean {
    return !this.active || this.armored;
  }
  /** Follow the boss; pop with it. Returns false when the part is gone. */
  follow(g: Game): boolean {
    if (this.parent.dead || this.parent.state === 'dying') {
      if (!this.dead) {
        this.dead = true;
        this.killed = true;
        g.onKill(this);
      }
      return false;
    }
    if (this.parent.state === 'flee') {
      this.dead = true;
      return false;
    }
    return true;
  }
  offscreen(): boolean {
    return false;
  }
}

// ======================= Sector 1: Snurrjätten =======================

const SIX_STAR = starPoly(6, 74, 30);
const HEX22 = regular(6, 22, 0);
const RING9 = regular(12, 9, 0);
const TIP = regular(4, 5, 0);

export class Spinjatte extends Boss {
  private spin = 0;
  private cyc = 0;
  private prev = 0;
  private emitCd = 0;
  constructor() {
    super();
    this.name = 'SNURRJÄTTEN';
    this.r = 60;
    this.setHp(200);
    this.ty = 190;
    this.stars = 16;
    this.color = C.magenta;
  }
  fight(g: Game, dt: number): void {
    this.x = FW / 2 + Math.sin(this.st * 0.45) * 125;
    this.y = this.ty + Math.sin(this.st * 0.9) * 20;
    this.cyc += dt * g.fireRate;
    const P = 6.4;
    const c = this.cyc % P;
    const p = this.prev;
    this.prev = c;
    const angry = this.hp < this.maxHp * 0.4;
    const spinning = c > 5.2 || c < 2.6;
    this.spin += dt * (spinning ? 1.25 : 0.4);
    if (c < 2.6) {
      this.emitCd -= dt;
      if (this.emitCd <= 0) {
        this.emitCd = angry ? 0.26 : 0.21;
        const arms = angry ? [0, 1, 2, 3, 4, 5] : [0, 2, 4];
        for (const k of arms) {
          const a = this.spin + (k * TAU) / 6 - Math.PI / 2;
          g.shoot(this.x + Math.cos(a) * 70, this.y + Math.sin(a) * 70, a, 110, 'orb', true);
        }
        g.sound.play('enemyShot');
      }
    }
    const cross = (at: number): boolean => (p < at && c >= at) || (c < p && at <= c);
    if (cross(3.3) || cross(4.1)) {
      g.fan(this.x, this.y + 24, 5, 0.55, 150, g.aim(this.x, this.y));
      g.fx.ring(this.x, this.y, C.yellow, 220, 0.3, 2);
    }
  }
  shapes(emit: Emit, g: Game): void {
    const charge = this.state === 'fight' && this.cyc % 6.4 > 5.2;
    emit(SIX_STAR, this.x, this.y, this.spin, 1, true, this.color, 1, 2.5);
    emit(HEX22, this.x, this.y, -this.spin * 1.5, 1, true, C.yellow, 1, 2);
    emit(RING9, this.x, this.y, 0, 1 + g.sound.pulse() * 0.25, true, C.white, 1, 2);
    for (let k = 0; k < 6; k++) {
      const a = this.spin + (k * TAU) / 6 - Math.PI / 2;
      emit(TIP, this.x + Math.cos(a) * 74, this.y + Math.sin(a) * 74, this.t * 3, charge ? 1.6 : 1, true, charge ? C.white : C.yellow, 1, 1.5);
    }
  }
}

// ======================= Sector 2: Stenfästet =======================

const LID = regular(6, 24, 0);
const CORE = regular(10, 15, 0);
const CORE_X = [-9, -9, 9, 9, -9, 9, 9, -9];
const T_BASE = regular(8, 14, Math.PI / 8);

class FortTurret extends Part {
  private aimA = Math.PI / 2;
  private cd: number;
  constructor(
    parent: Boss,
    private ox: number,
    private oy: number,
    private big: boolean,
    offset: number,
  ) {
    super(parent);
    this.r = 17;
    this.setHp(big ? 55 : 45);
    this.points = 25;
    this.stars = 3;
    this.size = 0.55;
    this.color = C.cyan;
    this.cd = 1.2 + offset;
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    if (!this.follow(g)) return;
    this.x = this.parent.x + this.ox;
    this.y = this.parent.y + this.oy;
    this.aimA += (g.aim(this.x, this.y) - this.aimA) * Math.min(1, dt * 4);
    if (!this.active) return;
    this.cd -= dt * g.fireRate;
    if (this.cd <= 0) {
      this.cd = this.big ? 3.0 : 2.1;
      const bx = this.x + Math.cos(this.aimA) * 24;
      const by = this.y + Math.sin(this.aimA) * 24;
      if (this.big) g.fan(bx, by, 5, 0.5, 145, this.aimA);
      else g.shoot(bx, by, this.aimA, 160);
      g.fx.ring(bx, by, C.cyan, 120, 0.2, 2);
    }
  }
  shapes(emit: Emit): void {
    emit(T_BASE, this.x, this.y, this.t * 0.5, this.big ? 1.2 : 1, true, this.color, 1, 2);
    emit([0, -6, 26, -6, 26, 6, 0, 6], this.x, this.y, this.aimA, 1, true, C.ice, 1, 1.8);
  }
}

export class Fortress extends Boss {
  private poly = rockPoly(96, 15);
  private open = false;
  private cyc = 0;
  private prev = 0;
  private spiralA = 0;
  private emitCd = 0;
  private wob = 0;
  constructor() {
    super();
    this.name = 'STENFÄSTET';
    this.r = 88;
    this.setHp(170);
    this.ty = 185;
    this.stars = 18;
    this.color = C.gold;
  }
  onSpawn(g: Game): void {
    // the cannons sit on the rock's belly, facing the rocket
    const spots: [number, number, boolean][] = [
      [-62, 34, false],
      [0, 62, true],
      [62, 34, false],
    ];
    spots.forEach(([ox, oy, big], i) => {
      const t = new FortTurret(this, ox, oy, big, i * 0.6);
      this.children.push(t);
      g.spawn(t);
    });
  }
  fight(g: Game, dt: number): void {
    this.wob += dt;
    this.x = FW / 2 + Math.sin(this.st * 0.35) * 110;
    this.y = this.ty + Math.sin(this.st * 0.7) * 12;
    this.rot = Math.sin(this.wob * 0.6) * 0.08;
    if (!this.open) {
      this.armored = true;
      if (this.children.every((c) => c.dead)) {
        this.open = true;
        this.armored = false;
        this.cyc = 0;
        g.sound.play('crack');
        g.fx.ring(this.x, this.coreY(), C.cyan, 420, 0.6, 4);
        g.fx.shatter([{ pts: LID.map((v, i) => v + (i % 2 ? this.coreY() : this.x)), closed: true, color: C.white }], this.x, this.coreY(), 200, 0.8);
        g.addShake(0.4);
        g.popup(this.x, this.y - 40, 'KÄRNAN ÄR ÖPPEN!', C.cyan, 16);
      }
      return;
    }
    this.cyc += dt * g.fireRate;
    const P = 4.2;
    const c = this.cyc % P;
    const p = this.prev;
    this.prev = c;
    const cross = (at: number): boolean => (p < at && c >= at) || (c < p && at <= c);
    if (cross(0.4)) {
      g.ring(this.x, this.coreY(), 12, 120, this.spiralA, 'big', 3);
      g.fx.ring(this.x, this.coreY(), C.cyan, 250, 0.3, 3);
    }
    if (c > 1.6 && c < 3.2) {
      this.emitCd -= dt;
      if (this.emitCd <= 0) {
        this.emitCd = 0.2;
        this.spiralA += 0.33;
        for (const k of [0, Math.PI]) g.shoot(this.x, this.coreY(), this.spiralA + k, 125, 'orb', true);
      }
    }
  }
  /** Shots fly through the rock itself; only the core can be hit, once it is open. */
  hits(x: number, y: number, r: number): boolean {
    if (!this.open) return false;
    return (x - this.x) ** 2 + (y - this.coreY()) ** 2 < (r + 30) ** 2;
  }
  beamHits(x: number, w: number): boolean {
    return this.open && Math.abs(x - this.x) < 30 + w;
  }
  private coreY(): number {
    return this.y - 6;
  }
  shapes(emit: Emit, g: Game): void {
    emit(this.poly, this.x, this.y, this.rot, 1, true, this.color, 1, 2.5);
    emit(this.poly, this.x, this.y, this.rot + 0.4, 0.62, true, this.color, 1, 1.2);
    const cy = this.coreY();
    if (!this.open) emit(LID, this.x, cy, this.t * 0.3, 1, true, C.white, 1, 2);
    else {
      const pulse = 1 + g.sound.pulse() * 0.3;
      emit(CORE, this.x, cy, this.t, pulse, true, C.cyan, 1, 2.5);
      emit(CORE_X, this.x, cy, this.t * -2, 1, false, C.white, 1, 2);
    }
  }
}

// ======================= Sector 3: Virvelvakten =======================

const POD = [0, -18, 13, 0, 0, 18, -13, 0];
const POD_IN = regular(4, 5, 0);
const VHEX = regular(6, 62, 0);
const VHEX2 = regular(6, 44, Math.PI / 6);
const VTRI = regular(3, 26, -Math.PI / 2);

class Pod extends Part {
  private cd: number;
  a = 0;
  constructor(
    parent: Boss,
    private offset: number,
  ) {
    super(parent);
    this.r = 17;
    this.setHp(45);
    this.points = 25;
    this.stars = 3;
    this.size = 0.5;
    this.color = C.cyan;
    this.cd = 1.4 + offset * 0.3;
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    if (!this.follow(g)) return;
    this.a = this.parent.t * 0.9 + this.offset;
    this.x = this.parent.x + Math.cos(this.a) * 128;
    this.y = this.parent.y + Math.sin(this.a) * 58;
    if (!this.active) return;
    this.cd -= dt * g.fireRate;
    if (this.cd <= 0) {
      this.cd = 1.9;
      g.shoot(this.x, this.y, g.aim(this.x, this.y), 160);
    }
  }
  shapes(emit: Emit): void {
    emit(POD, this.x, this.y, Math.sin(this.t * 3) * 0.3, 1, true, this.color, Math.abs(Math.cos(this.t * 2.5)) * 0.7 + 0.3, 2);
    emit(POD_IN, this.x, this.y, this.t * 4, 1, true, C.white, 1, 1.5);
  }
}

export class Vortex extends Boss {
  private cyc = 0;
  private prev = 0;
  private gapA = 0;
  constructor() {
    super();
    this.name = 'VIRVELVAKTEN';
    this.r = 56;
    this.setHp(280);
    this.ty = 200;
    this.stars = 20;
    this.color = C.violet;
  }
  onSpawn(g: Game): void {
    for (const off of [0, Math.PI]) {
      const p = new Pod(this, off);
      this.children.push(p);
      g.spawn(p);
    }
  }
  fight(g: Game, dt: number): void {
    this.x = FW / 2 + Math.sin(this.st * 0.5) * 130;
    this.y = this.ty + Math.sin(this.st * 1.0) * 40;
    const podsGone = this.children.every((c) => c.dead);
    this.cyc += dt * g.fireRate * (podsGone ? 1.25 : 1);
    const P = 5.2;
    const c = this.cyc % P;
    const p = this.prev;
    this.prev = c;
    const cross = (at: number): boolean => (p < at && c >= at) || (c < p && at <= c);
    if (cross(0.5) || cross(3.0)) {
      this.gapA += 0.55;
      g.ring(this.x, this.y, 14, 118, this.gapA, 'big', 3);
      g.fx.ring(this.x, this.y, C.violet, 260, 0.35, 3, 6);
    }
    if (cross(1.8) || cross(4.3)) {
      const a = g.aim(this.x, this.y);
      for (const d of [-0.2, 0, 0.2]) g.shoot(this.x, this.y + 20, a + d, 205, 'dart');
      g.sound.play('enemyShot');
    }
  }
  shapes(emit: Emit, g: Game): void {
    const pulse = g.sound.pulse();
    emit(VHEX, this.x, this.y, this.t * 0.8, 1, true, this.color, 1, 2.5);
    emit(VHEX2, this.x, this.y, -this.t * 1.2, 1 + pulse * 0.08, true, C.magenta, 1, 2);
    emit(VTRI, this.x, this.y, this.t * 2, 1, true, C.yellow, 1, 2);
  }
  draw(pen: Pen, g: Game): void {
    // lightning between the guard and its pods
    if (this.state !== 'dying') {
      for (const c of this.children) {
        if (c.dead) continue;
        pen.begin();
        const n = 7;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const x = this.x + (c.x - this.x) * k + (i > 0 && i < n ? rand(-9, 9) : 0);
          const y = this.y + (c.y - this.y) * k + (i > 0 && i < n ? rand(-9, 9) : 0);
          if (i === 0) pen.m(x, y);
          else pen.l(x, y);
        }
        pen.stroke(Math.random() < 0.5 ? C.ice : C.violet, pen.lw(1.4), 0.75);
      }
    }
    super.draw(pen, g);
  }
}

// ======================= The final boss: Stormkristallen =======================

/** A hexagonal crystal: apex, upper ring, lower ring, bottom apex. */
const CV: [number, number, number][] = [];
const CE: [number, number][] = [];
{
  CV.push([0, -1.6, 0]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    CV.push([Math.cos(a), -0.42, Math.sin(a)]);
  }
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * TAU;
    CV.push([Math.cos(a) * 0.86, 0.52, Math.sin(a) * 0.86]);
  }
  CV.push([0, 1.5, 0]);
  for (let k = 0; k < 6; k++) {
    const u = 1 + k;
    const u2 = 1 + ((k + 1) % 6);
    const l = 7 + k;
    const l2 = 7 + ((k + 1) % 6);
    CE.push([0, u], [u, u2], [u, l], [u2, l], [l, l2], [l, 13]);
  }
}
/** An octahedron for the shards and the core. */
const OV: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1.3, 0],
  [0, -1.3, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const OE: [number, number][] = [
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 4],
  [4, 3],
  [3, 5],
  [5, 2],
];

/** Projects a rotating 3D wireframe; out gets x, y, z per vertex. */
function project(verts: [number, number, number][], out: Float32Array, cx: number, cy: number, s: number, yaw: number, pitch: number, roll = 0): void {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  for (let i = 0; i < verts.length; i++) {
    const [x, y, z] = verts[i]!;
    const x1 = x * cyw - z * syw;
    const z1 = x * syw + z * cyw;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const x3 = x1 * cr - y2 * sr;
    const y3 = x1 * sr + y2 * cr;
    const f = 1 / (1 - z2 * 0.13);
    out[i * 3] = cx + x3 * s * f;
    out[i * 3 + 1] = cy + y3 * s * f;
    out[i * 3 + 2] = z2;
  }
}

function drawWire(pen: Pen, p: Float32Array, edges: [number, number][], front: string, back: string, w: number, flash: boolean): void {
  for (const pass of [0, 1]) {
    pen.begin();
    for (const [a, b] of edges) {
      const z = p[a * 3 + 2]! + p[b * 3 + 2]!;
      if ((z >= 0 ? 1 : 0) !== pass) continue;
      pen.seg(p[a * 3]!, p[a * 3 + 1]!, p[b * 3]!, p[b * 3 + 1]!);
    }
    if (pass === 0) pen.stroke(flash ? '#fff' : back, pen.lw(w * 0.7), 0.42);
    else pen.stroke(flash ? '#fff' : front, pen.lw(w), 1);
  }
}

function wirePolys(p: Float32Array, edges: [number, number][], color: string): Poly[] {
  return edges.map(([a, b]) => ({ pts: [p[a * 3]!, p[a * 3 + 1]!, p[b * 3]!, p[b * 3 + 1]!], closed: false, color }));
}

class Shard extends Part {
  private cd: number;
  a = 0;
  private proj = new Float32Array(OV.length * 3);
  constructor(
    parent: Boss,
    private offset: number,
  ) {
    super(parent);
    this.r = 19;
    this.setHp(32);
    this.points = 30;
    this.stars = 3;
    this.size = 0.55;
    this.color = C.yellow;
    this.cd = 1.6 + offset * 0.4;
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    if (!this.follow(g)) return;
    this.a = this.parent.t * 0.65 + this.offset;
    this.x = this.parent.x + Math.cos(this.a) * 178;
    this.y = this.parent.y + Math.sin(this.a) * 74;
    if (!this.active) return;
    this.cd -= dt * g.fireRate;
    if (this.cd <= 0) {
      this.cd = 2.8;
      g.shoot(this.x, this.y, g.aim(this.x, this.y), 150);
      g.fx.ring(this.x, this.y, C.yellow, 120, 0.2, 2);
    }
  }
  shapes(emit: Emit): void {
    project(OV, this.proj, this.x, this.y, 16, this.t * 2.2, 0.4);
    for (const [a, b] of OE) emit([this.proj[a * 3]!, this.proj[a * 3 + 1]!, this.proj[b * 3]!, this.proj[b * 3 + 1]!], 0, 0, 0, 1, false, this.color, 1, 1.8);
  }
}

interface Beam {
  x: number;
  t: number;
}

const SHIELD = regular(6, 1, Math.PI / 6);

export class StormCrystal extends Boss {
  phase = 1;
  private spin = 0;
  private spinV = 0.5;
  private proj = new Float32Array(CV.length * 3);
  private inner = new Float32Array(CV.length * 3);
  private coreProj = new Float32Array(OV.length * 3);
  private shield = true;
  private cyc = 0;
  private prev = 0;
  private trans = 0;
  private emitCd = 0;
  private spiralA = 0;
  private gapA = 0;
  private beams: Beam[] = [];
  private rainT = 0;
  private readonly phaseHp = [340, 380, 320];
  constructor() {
    super();
    this.name = 'STORMKRISTALLEN';
    this.final = true;
    this.r = 105;
    this.setHp(this.phaseHp[0]!);
    this.ty = 215;
    this.enterTime = 3.6;
    this.stars = 40;
    this.color = C.cyan;
    this.dieTime = 3.0;
  }

  healthFrac(): number {
    const total = this.phaseHp.reduce((a, b) => a + b, 0);
    let left = Math.max(0, this.hp);
    for (let i = this.phase; i < 3; i++) left += this.phaseHp[i]!;
    return left / total;
  }

  /** Where the phase marks go on the health bar. */
  marks(): number[] {
    const total = this.phaseHp.reduce((a, b) => a + b, 0);
    return [(this.phaseHp[1]! + this.phaseHp[2]!) / total, this.phaseHp[2]! / total];
  }

  onFight(g: Game): void {
    for (let k = 0; k < 4; k++) {
      const s = new Shard(this, (k / 4) * TAU);
      this.children.push(s);
      g.spawn(s);
    }
    this.armored = true;
  }

  hits(x: number, y: number, r: number): boolean {
    if (this.phase === 3) return (x - this.x) ** 2 + (y - this.y) ** 2 < (r + 52) ** 2;
    if (this.shield && this.phase === 1 && this.state === 'fight') return (x - this.x) ** 2 + (y - this.y) ** 2 < (r + 150) ** 2 && y < this.y + 150;
    const dx = Math.abs(x - this.x) / (100 + r);
    const dy = Math.abs(y - this.y) / (165 + r);
    return dx + dy < 1;
  }

  beamHits(x: number, w: number): boolean {
    return Math.abs(x - this.x) < (this.phase === 3 ? 50 : 90) + w;
  }

  phaseDone(g: Game): void {
    if (this.phase >= 3) {
      super.phaseDone(g);
      return;
    }
    this.phase++;
    this.setHp(this.phaseHp[this.phase - 1]!);
    this.trans = 2.2;
    this.armored = true;
    this.cyc = 0;
    this.prev = 0;
    this.beams.length = 0;
    g.clearBullets(true);
    g.addShake(0.7);
    g.flashScreen(this.phase === 2 ? C.magenta : C.white, 0.55);
    g.sound.play('crack');
    g.hitstop(0.12);
    if (this.phase === 2) {
      this.color = C.magenta;
      g.fx.ring(this.x, this.y, C.magenta, 520, 0.8, 5, 6);
      g.popup(this.x, this.y + 175, 'KRISTALLEN BLIR ARG!', C.magenta, 18);
    } else {
      // the shell shatters and the core comes out
      g.fx.shatter(wirePolys(this.proj, CE, C.magenta), this.x, this.y, 260, 1.6, 2.5);
      for (let i = 0; i < 4; i++) g.fx.ring(this.x, this.y, i % 2 ? C.white : C.yellow, 300 + i * 120, 0.9, 4, 0, 10, i * 0.08);
      g.popup(this.x, this.y + 110, 'KÄRNAN!', C.yellow, 20);
      this.color = C.yellow;
    }
  }

  fight(g: Game, dt: number): void {
    const t = this.st;
    if (this.trans > 0) {
      this.trans -= dt;
      this.spin += dt * 4;
      if (this.trans <= 0) this.armored = this.phase === 1 && this.shield;
      return;
    }
    if (this.phase === 1) this.phase1(g, dt, t);
    else if (this.phase === 2) this.phase2(g, dt, t);
    else this.phase3(g, dt, t);
  }

  private step(g: Game, dt: number, P: number): { c: number; cross: (at: number) => boolean } {
    this.cyc += dt * g.fireRate;
    const c = this.cyc % P;
    const p = this.prev;
    this.prev = c;
    return { c, cross: (at: number) => (p < at && c >= at) || (c < p && at <= c) };
  }

  private phase1(g: Game, dt: number, t: number): void {
    this.spinV = 0.55;
    this.spin += this.spinV * dt;
    this.x = FW / 2 + Math.sin(t * 0.3) * 70;
    this.y = this.ty + Math.sin(t * 0.6) * 14;
    if (this.shield && this.children.every((c) => c.dead)) {
      this.shield = false;
      this.armored = false;
      g.sound.play('shieldBreak');
      g.sound.play('crack');
      g.fx.ring(this.x, this.y, C.cyan, 600, 0.7, 5, 6);
      g.fx.shatter([{ pts: SHIELD.map((v, i) => v * 150 + (i % 2 ? this.y : this.x)), closed: true, color: C.cyan }], this.x, this.y, 240, 1.1);
      g.addShake(0.5);
      g.popup(this.x, this.y + 175, 'SKÖLDEN BORTA!', C.cyan, 18);
    }
    const { cross } = this.step(g, dt, this.shield ? 3.4 : 2.6);
    if (cross(0.3)) {
      this.gapA += 0.7;
      g.ring(this.x, this.y, 12, 115, this.gapA, 'big', 3);
      g.fx.ring(this.x, this.y, C.cyan, 300, 0.4, 3, 6);
    }
    if (!this.shield && cross(1.5)) g.fan(this.x, this.y + 60, 3, 0.3, 160, g.aim(this.x, this.y + 60));
  }

  private phase2(g: Game, dt: number, t: number): void {
    this.spin += dt * 1.3;
    this.x = FW / 2 + Math.sin(t * 0.42) * 165;
    this.y = this.ty + Math.sin(t * 0.84) * 34;
    const { c, cross } = this.step(g, dt, 7.4);
    if (cross(0.05)) {
      // a few diamonds tumble out of the crystal
      for (const s of [-1, 0, 1]) {
        const d = new Diamond(clamp(this.x + s * 120, 60, FW - 60), this.y + 40, 40, 2.2, 120, s, false);
        g.spawn(d);
        g.fx.ring(d.x, d.y, C.cyan, 140, 0.3, 2);
      }
    }
    if (c > 0.8 && c < 3.8) {
      this.emitCd -= dt;
      if (this.emitCd <= 0) {
        this.emitCd = 0.15;
        this.spiralA += 0.21;
        for (const k of [0, Math.PI]) g.shoot(this.x, this.y + 10, this.spiralA + k, 118, 'orb', true);
        g.sound.play('enemyShot');
      }
    }
    for (const at of [4.6, 5.2, 5.8]) {
      if (cross(at)) {
        g.fan(this.x, this.y + 80, 5, 0.5, 155, g.aim(this.x, this.y + 80));
        g.fx.ring(this.x, this.y + 80, C.magenta, 200, 0.25, 2);
      }
    }
  }

  private phase3(g: Game, dt: number, t: number): void {
    this.spin += dt * 2.4;
    this.x = FW / 2 + Math.sin(t * 0.55) * 185;
    this.y = this.ty + 10 + Math.sin(t * 1.1) * 48;
    const desperate = this.hp < this.phaseHp[2]! * 0.3;
    const { c, cross } = this.step(g, dt, desperate ? 7.2 : 8.4);
    // light beams: warn first, then fire; there is always room between them
    if (cross(0.1)) {
      const px = clamp(g.player.x, 60, FW - 60);
      const lanes = [px, px + (px < FW / 2 ? 210 : -210)];
      if (desperate) lanes.push(px < FW / 2 ? Math.max(40, px - 200) : Math.min(FW - 40, px + 200));
      for (const x of lanes) this.beams.push({ x: clamp(x, 30, FW - 30), t: 0 });
      g.sound.play('charge');
    }
    for (const b of this.beams) {
      const before = b.t;
      b.t += dt;
      if (before < 1.25 && b.t >= 1.25) {
        g.sound.play('beam');
        g.addShake(0.25);
      }
      if (b.t > 1.25 && b.t < 1.95) {
        const p = g.player;
        if (Math.abs(p.x - b.x) < 19 && p.y > this.y) g.hurtPlayer();
        if (Math.random() < 0.5) g.fx.spray(b.x, FH - 4, 2, C.white, -Math.PI / 2, 1.2, 300, 0.3);
      }
    }
    this.beams = this.beams.filter((b) => b.t < 2.05);
    if (cross(2.6) || cross(3.3)) {
      this.gapA += 0.9;
      g.ring(this.x, this.y, 16, 122, this.gapA, 'big', 4);
      g.fx.ring(this.x, this.y, C.yellow, 300, 0.35, 3);
    }
    if (c > 4.4 && c < 6.6) {
      this.rainT -= dt;
      if (this.rainT <= 0) {
        this.rainT = desperate ? 0.16 : 0.2;
        const x = rand(20, FW - 20);
        if (Math.abs(x - g.player.x) > 30) g.shoot(x, -10, Math.PI / 2 + rand(-0.1, 0.1), 125, 'orb', true);
      }
    }
    if (cross(7.0)) g.fan(this.x, this.y + 40, 7, 0.9, 150, g.aim(this.x, this.y + 40));
  }

  update(g: Game, dt: number): void {
    if (this.state === 'enter') this.spin += dt * 1.6;
    if (this.state === 'dying') {
      this.spin += dt * 9;
      this.beams.length = 0;
    }
    super.update(g, dt);
  }

  onDeath(_g: Game): void {}

  shapes(emit: Emit): void {
    if (this.phase < 3) {
      project(CV, this.proj, this.x, this.y, 108, this.spin, 0.3 + Math.sin(this.t * 0.7) * 0.08, Math.sin(this.t * 0.5) * 0.06);
      for (const [a, b] of CE) emit([this.proj[a * 3]!, this.proj[a * 3 + 1]!, this.proj[b * 3]!, this.proj[b * 3 + 1]!], 0, 0, 0, 1, false, this.color, 1, 2.5);
    } else {
      project(OV, this.coreProj, this.x, this.y, 46, this.spin, this.t * 1.3);
      for (const [a, b] of OE) emit([this.coreProj[a * 3]!, this.coreProj[a * 3 + 1]!, this.coreProj[b * 3]!, this.coreProj[b * 3 + 1]!], 0, 0, 0, 1, false, this.color, 1, 2.5);
    }
  }

  draw(pen: Pen, g: Game): void {
    const flash = this.flash > 0;
    const pulse = g.sound.pulse();
    if (this.phase < 3) {
      project(CV, this.proj, this.x, this.y, 108 * (1 + pulse * 0.025), this.spin, 0.3 + Math.sin(this.t * 0.7) * 0.08, Math.sin(this.t * 0.5) * 0.06);
      const front = this.phase === 1 ? C.cyan : C.magenta;
      const back = this.phase === 1 ? C.blue : C.violet;
      drawWire(pen, this.proj, CE, front, back, 2.6, flash);
      // an inner glow: the same crystal, smaller and turning the other way
      project(CV, this.inner, this.x, this.y, 46, -this.spin * 1.7, 0.5);
      drawWire(pen, this.inner, CE, this.phase === 1 ? C.white : C.yellow, front, 1.4, flash);
    } else {
      // swells and shivers while it breaks apart
      const swell = this.state === 'dying' ? 1 + (this.st / this.dieTime) * 0.7 + Math.sin(this.st * 50) * 0.08 : 1;
      project(OV, this.coreProj, this.x, this.y, 46 * (1 + pulse * 0.12) * swell, this.spin, this.t * 1.3);
      drawWire(pen, this.coreProj, OE, this.state === 'dying' && Math.floor(this.st * 16) % 2 ? C.white : C.yellow, C.gold, 3, flash);
      for (let i = 0; i < 3; i++) {
        pen.begin();
        const rr = 72 + i * 16;
        const tilt = this.t * (0.9 + i * 0.4) + i;
        for (let k = 0; k <= 40; k++) {
          const a = (k / 40) * TAU;
          const ex = Math.cos(a) * rr;
          const ey = Math.sin(a) * rr * 0.32;
          const x = this.x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
          const y = this.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
          if (k === 0) pen.m(x, y);
          else pen.l(x, y);
        }
        pen.stroke(i === 1 ? C.magenta : C.cyan, pen.lw(1.6), 0.8);
      }
    }
    // the shield and its links to the shards
    if (this.phase === 1 && this.shield && this.state === 'fight') {
      pen.begin();
      pen.shape(SHIELD, this.x, this.y, this.t * 0.2, 150 + pulse * 4, true);
      pen.stroke(C.cyan, pen.lw(1.6), 0.35 + pulse * 0.3);
      for (const c of this.children) {
        if (c.dead) continue;
        pen.begin();
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const jx = i > 0 && i < n ? rand(-6, 6) : 0;
          const x = this.x + (c.x - this.x) * k + jx;
          const y = this.y + (c.y - this.y) * k + jx;
          if (i === 0) pen.m(x, y);
          else pen.l(x, y);
        }
        pen.stroke(C.yellow, pen.lw(1.2), 0.5);
      }
    }
    // beams
    for (const b of this.beams) {
      if (b.t < 1.25) {
        const on = Math.floor(b.t * 10) % 2 === 0;
        pen.begin();
        for (let y = this.y + 40; y < FH; y += 28) pen.seg(b.x, y, b.x, Math.min(FH, y + 16));
        pen.stroke(C.red, pen.lw(on ? 2.2 : 1.2), on ? 0.95 : 0.5);
        pen.begin();
        pen.m(b.x - 12, FH - 36);
        pen.l(b.x, FH - 20);
        pen.l(b.x + 12, FH - 36);
        pen.stroke(C.red, pen.lw(2), on ? 1 : 0.4);
      } else if (b.t < 1.95) {
        const k = 1 - (b.t - 1.25) / 0.7;
        const wob = Math.sin(b.t * 60) * 2;
        pen.begin();
        pen.seg(b.x, this.y, b.x, FH);
        pen.stroke(C.yellow, pen.lw(26 * k + 6 + wob), 0.35);
        pen.begin();
        pen.seg(b.x, this.y, b.x, FH);
        pen.stroke(C.white, pen.lw(8 * k + 2), 1);
      }
    }
  }

  parts(): Poly[] {
    if (this.phase < 3) return wirePolys(this.proj, CE, this.color);
    return wirePolys(this.coreProj, OE, C.yellow);
  }
}

/** The mini-boss for a sector (0..2). */
export function miniBoss(sector: number): Boss {
  return sector === 0 ? new Spinjatte() : sector === 1 ? new Fortress() : new Vortex();
}
