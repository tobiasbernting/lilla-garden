// The snowmen and how they behave:
//  - normal ones glide between the snow walls, hide, step out past the end of a wall, wind up and throw;
//  - small ones hop about in the open and throw quick ones;
//  - big ones trudge forward and throw a fan of three.
import * as THREE from 'three';
import type { Arena } from './arena.ts';
import { buildSnowman, disposeModel, SCARF_COLORS, type Kind, type SnowmanModel } from './snowman.ts';
import { clamp, damp, easeOutBack, pick, rand, angleDiff } from './util.ts';
import { ENEMY_ZONE, heightAt, type Cover } from './world.ts';

type State = 'rise' | 'move' | 'hide' | 'peek' | 'windup' | 'after' | 'hop' | 'stagger';

const SPEED: Record<Kind, number> = { small: 0, normal: 3.4, big: 1.35, king: 0 };
export const POINTS: Record<Kind, number> = { small: 60, normal: 50, big: 120, king: 0 };
const HATS: ('top' | 'beanie' | 'bucket')[] = ['top', 'beanie', 'beanie', 'bucket'];
const HAT_COLORS = [0xe8412c, 0x3f7bff, 0x2fb36a, 0xffb627, 0xb05cff, 0xff5fa8, 0x23c6c6];

/** Snowmen are a little larger than life, so they are easy to see. */
const SIZE = 1.2;
const v2 = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);
const tmp = new THREE.Vector3();

/** Does the ground segment a→b pass through one of the snowmen's walls? */
export function crossesWall(A: Arena, a: THREE.Vector2, b: THREE.Vector2, pad = 0.45): boolean {
  for (const w of A.world.boxes) {
    if (!w.enemy) continue;
    const ox = a.x - w.cx;
    const oz = a.y - w.cz;
    const lox = ox * w.c - oz * w.s;
    const loz = ox * w.s + oz * w.c;
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const ldx = dx * w.c - dz * w.s;
    const ldz = dx * w.s + dz * w.c;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [o, d, h] of [
      [lox, ldx, w.hx + pad],
      [loz, ldz, w.hz + pad],
    ] as [number, number, number][]) {
      if (Math.abs(d) < 1e-6) {
        if (o < -h || o > h) ok = false;
        continue;
      }
      let ta = (-h - o) / d;
      let tb = (h - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}

function insideWall(A: Arena, p: THREE.Vector2, pad: number): boolean {
  return crossesWall(A, p, p.clone().addScalar(0.001), pad);
}

/** A random spot in the snowmen's half, away from walls. */
export function openSpot(A: Arena, z0: number, z1: number, near?: THREE.Vector2, maxDist = 99): THREE.Vector2 {
  for (let i = 0; i < 40; i++) {
    const p = near ? v2(near.x + rand(-maxDist, maxDist), near.y + rand(-maxDist, maxDist)) : v2(rand(ENEMY_ZONE.x0, ENEMY_ZONE.x1), rand(z0, z1));
    p.x = clamp(p.x, ENEMY_ZONE.x0, ENEMY_ZONE.x1);
    p.y = clamp(p.y, z0, z1);
    if (insideWall(A, p, 0.9)) continue;
    if (near && crossesWall(A, near, p, 0.35)) continue;
    return p;
  }
  return near ? near.clone() : v2(0, (z0 + z1) / 2);
}

let nextId = 1;

export class Enemy {
  readonly id = nextId++;
  readonly model: SnowmanModel;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp: number;
  state: State = 'rise';
  t = 0;
  dur = 0.7;
  dead = false;
  private path: THREE.Vector2[] = [];
  private cover: Cover | null = null;
  private hideIdx = -1;
  private hasToken = false;
  private scale = SIZE;
  private flash = 0;
  private hops = 0;
  private throwAfter = 2;
  private hopFrom = v2(0, 0);
  private hopTo = v2(0, 0);
  private hopY = 0;
  private walk = 0;
  private lean = 0;
  private squash = 0;
  private firstHide = true;
  private lastPos = new THREE.Vector3();
  private armPose = 0;
  private throwKick = 0;

  constructor(
    private A: Arena,
    readonly kind: Kind,
    at?: THREE.Vector2,
  ) {
    this.hp = kind === 'big' ? 3 : 1;
    this.model = buildSnowman(kind, {
      scarf: pick(SCARF_COLORS),
      hat: pick(HAT_COLORS),
      hatType: kind === 'small' ? 'beanie' : kind === 'big' ? pick(['top', 'bucket'] as const) : pick(HATS),
      glowTex: A.glowTex,
      shadows: A.shadows,
      low: A.low,
    });
    let start: THREE.Vector2;
    if (at) start = at.clone();
    else if (kind === 'normal') {
      start = this.pickCover() ?? openSpot(A, -14, -2);
    } else if (kind === 'small') start = openSpot(A, -11, 0);
    else start = openSpot(A, -21, -14);
    this.pos.set(start.x, heightAt(start.x, start.y), start.y);
    this.lastPos.copy(this.pos);
    this.yaw = this.faceYaw();
    this.model.root.position.copy(this.pos);
    this.model.root.position.y -= this.model.dims.top * SIZE + 0.3;
    A.scene.add(this.model.root);
    this.dur = kind === 'big' ? 1.0 : kind === 'small' ? 0.5 : 0.7;
    A.puffs.emit(tmp.copy(this.pos).setY(this.pos.y + 0.3), { n: 10, size: [0.5, 0.9], grow: 2, speed: 2.2, up: 0.8, life: [0.5, 0.9], spread: 0.4 });
    A.sound.spawn(A.pan(this.pos));
  }

  /** Reserve a free hiding spot and return where to pop up (at the end of that wall). */
  private pickCover(): THREE.Vector2 | null {
    const free: [Cover, number][] = [];
    for (const c of this.A.world.covers) c.hide.forEach((_, i) => c.taken[i] === -1 && free.push([c, i]));
    if (!free.length) return null;
    const [c, i] = pick(free);
    this.cover = c;
    this.hideIdx = i;
    c.taken[i] = this.id;
    const hs = c.hide[i]!;
    const peek = c.peek[0]!.distanceTo(hs) < c.peek[1]!.distanceTo(hs) ? c.peek[0]! : c.peek[1]!;
    // pop up a step behind the wall's end, then slide into hiding
    return v2(peek.x * 0.7 + hs.x * 0.3, peek.y * 0.7 + hs.y * 0.3 - 0.4);
  }

  private releaseCover(): void {
    if (this.cover && this.hideIdx >= 0 && this.cover.taken[this.hideIdx] === this.id) this.cover.taken[this.hideIdx] = -1;
    this.cover = null;
    this.hideIdx = -1;
  }

  private faceYaw(): number {
    const p = this.A.playerPos;
    return Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  private go(state: State, dur = 0): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  /** World-space hit spheres (generous). */
  spheres(out: { c: THREE.Vector3; r: number }[]): number {
    const d = this.model.dims;
    const root = this.model.root.position;
    let n = 0;
    for (let i = 0; i < d.r.length; i++) {
      const s = out[n] ?? (out[n] = { c: new THREE.Vector3(), r: 0 });
      s.c.set(root.x, root.y + d.y[i]! * this.scale, root.z);
      s.r = d.r[i]! * this.scale * 1.2 + (this.kind === 'small' ? 0.08 : 0.04);
      n++;
    }
    return n;
  }

  /** The middle of the body, for aim assist and leading. */
  center(out: THREE.Vector3): THREE.Vector3 {
    const d = this.model.dims;
    const mid = d.y[Math.min(1, d.y.length - 1)]!;
    return out.copy(this.model.root.position).setY(this.model.root.position.y + mid * this.scale);
  }

  /** Hidden while rising out of the snow (not yet worth aiming at). */
  get targetable(): boolean {
    return !this.dead && (this.state !== 'rise' || this.t > this.dur * 0.5);
  }

  hit(): 'kill' | 'chip' {
    this.hp--;
    this.flash = 1;
    if (this.hp <= 0) {
      this.dead = true;
      return 'kill';
    }
    // big ones lose a chunk and stagger (the throw is interrupted)
    if (this.hasToken) {
      this.A.releaseThrow();
      this.hasToken = false;
    }
    this.scale *= 0.88;
    this.model.handBall.visible = false;
    this.model.bubble.visible = false;
    this.go('stagger', 0.45);
    return 'chip';
  }

  /** Burst into snow: chunks, puffs, the carrot and hat flying. */
  poof(): void {
    const A = this.A;
    const d = this.model.dims;
    const size = this.kind === 'big' ? 1.6 : this.kind === 'small' ? 0.75 : 1;
    const c = this.center(new THREE.Vector3());
    A.chunks.burst(c, Math.round((A.low ? 16 : 28) * size), 0.15 * size, 7.5 * Math.sqrt(size));
    const head = this.model.head.getWorldPosition(new THREE.Vector3());
    A.chunks.burst(head, 6, 0.06 * size, 5, 0x2a2934);
    A.puffs.emit(c, { n: Math.round(20 * size), size: [0.9 * size, 1.6 * size], grow: 2.1, speed: 4.5 * size, up: 0.45, life: [0.5, 1.0], spread: 0.45 * size });
    A.puffs.emit(c.clone().setY(this.pos.y + 0.2), { n: 8, size: [0.6 * size, 1.0 * size], grow: 2.4, speed: 3.2 * size, up: -0.1, life: [0.5, 0.9], spread: 0.5 * size });
    // a quick white flash of snow dust
    A.sparks.one(c, new THREE.Vector3(0, 0.5, 0), 2.4 * size, 0.22, 0xffffff, 0.75, 1.9);
    A.sparks.emit(head, { n: 10, size: [0.22, 0.4], grow: 0.4, speed: 6, up: 0.6, life: [0.3, 0.6], color: 0xfff2c8, alpha: 1, drag: 3 });
    // the carrot pops off, spinning
    const fwd = tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.model.nose.userData.s0 = 1;
    A.debris.launch(this.model.nose, new THREE.Vector3(fwd.x * 3 + rand(-1.5, 1.5), 6.5 + rand(0, 2), fwd.z * 3 + rand(-1.5, 1.5)), 16, 0.06 * size, 3.5);
    this.model.hat.userData.s0 = this.model.hat.scale.x;
    A.debris.launch(this.model.hat, new THREE.Vector3(rand(-2, 2), 5 + rand(0, 2.5), rand(-2, 2)), 9, d.r[d.r.length - 1]! * 0.35, 3.5);
    A.sound.poof(A.pan(c), size);
    this.dispose();
  }

  dispose(): void {
    if (this.hasToken) {
      this.A.releaseThrow();
      this.hasToken = false;
    }
    this.releaseCover();
    disposeModel(this.model);
  }

  // ---------------------------------------------------------------- behaviour

  update(dt: number): void {
    const A = this.A;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    const k = this.kind;
    switch (this.state) {
      case 'rise': {
        if (this.t >= this.dur) {
          if (k === 'normal') {
            if (this.cover) this.moveTo([this.cover.hide[this.hideIdx]!.clone()], 'hide');
            else this.go('hide', 0.5);
          } else if (k === 'small') this.startHop();
          else this.moveTo([openSpot(A, -18, -5, v2(this.pos.x, this.pos.z), 7)], 'hide');
        }
        break;
      }
      case 'move': {
        if (this.stepPath(dt, SPEED[k] * (k === 'big' ? 1 : this.cover ? 1 : 0.9))) {
          if (k === 'big') this.bigDecide();
          else if (this.peeking) this.go('windup', A.diff.windup);
          else {
            this.go('hide', this.firstHide ? rand(0.5, 1.2) : rand(...A.diff.hide));
            this.firstHide = false;
          }
        }
        break;
      }
      case 'hide': {
        if (this.t >= this.dur) {
          if (k === 'big') {
            this.bigDecide();
          } else if (this.cover && Math.random() < 0.18) {
            this.relocate();
          } else if (A.requestThrow()) {
            this.hasToken = true;
            this.peeking = true;
            const pk = this.cover ? this.pickPeek() : v2(this.pos.x + rand(-1.5, 1.5), this.pos.z + 0.5);
            this.moveTo([pk], 'windup');
          } else this.dur += 0.45;
        }
        break;
      }
      case 'windup': {
        if (this.t >= this.dur) this.release();
        break;
      }
      case 'after': {
        if (this.t >= this.dur) {
          this.peeking = false;
          if (k === 'small') this.startHop();
          else if (k === 'big') this.bigDecide();
          else if (this.cover) this.moveTo([this.cover.hide[this.hideIdx]!.clone()], 'hide');
          else this.go('hide', rand(...A.diff.hide));
        }
        break;
      }
      case 'hop': {
        const ht = clamp(this.t / this.dur, 0, 1);
        this.pos.x = this.hopFrom.x + (this.hopTo.x - this.hopFrom.x) * ht;
        this.pos.z = this.hopFrom.y + (this.hopTo.y - this.hopFrom.y) * ht;
        this.hopY = Math.sin(ht * Math.PI) * 0.75;
        if (ht >= 1) {
          this.hopY = 0;
          this.squash = 1;
          this.hops++;
          if (this.hops >= this.throwAfter && A.requestThrow()) {
            this.hasToken = true;
            this.go('windup', A.diff.windup * 0.68);
          } else this.startHop();
        }
        break;
      }
      case 'stagger': {
        if (this.t >= this.dur) {
          if (k === 'big') this.bigDecide();
          else this.go('hide', 0.4);
        }
        break;
      }
    }
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.animate(dt);
    // velocity for the player's aim leading
    if (dt > 0) {
      this.vel.subVectors(this.pos, this.lastPos).divideScalar(dt);
      if (this.state === 'hop') this.vel.multiplyScalar(0.5);
      this.lastPos.copy(this.pos);
    }
  }

  private peeking = false;

  private pickPeek(): THREE.Vector2 {
    const c = this.cover!;
    const p = this.A.playerPos;
    const [a, b] = c.peek as [THREE.Vector2, THREE.Vector2];
    // usually step out on the side that faces the player
    const better = Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b;
    const other = better === a ? b : a;
    const pk = (Math.random() < 0.72 ? better : other).clone();
    pk.x += rand(-0.3, 0.3);
    pk.y += rand(-0.2, 0.3);
    return pk;
  }

  private relocate(): void {
    const A = this.A;
    const free: [Cover, number][] = [];
    for (const c of A.world.covers) if (c !== this.cover) c.hide.forEach((_, i) => c.taken[i] === -1 && free.push([c, i]));
    if (!free.length) {
      this.go('hide', rand(...A.diff.hide));
      return;
    }
    const from = this.cover!;
    const [c, i] = pick(free);
    this.releaseCover();
    this.cover = c;
    this.hideIdx = i;
    c.taken[i] = this.id;
    const here = v2(this.pos.x, this.pos.z);
    const target = c.hide[i]!.clone();
    const path: THREE.Vector2[] = [];
    // walk round the end of our own wall and the new one when needed
    const exit = from.peek[0]!.distanceTo(target) < from.peek[1]!.distanceTo(target) ? from.peek[0]! : from.peek[1]!;
    if (crossesWall(A, here, target, 0.3)) {
      path.push(exit.clone());
      const entry = c.peek[0]!.distanceTo(exit) < c.peek[1]!.distanceTo(exit) ? c.peek[0]! : c.peek[1]!;
      if (crossesWall(A, exit, target, 0.3)) path.push(entry.clone().add(v2(0, -0.6)));
    }
    path.push(target);
    this.moveTo(path, 'hide');
  }

  private moveTo(path: THREE.Vector2[], _then: State): void {
    this.path = path;
    this.go('move');
  }

  /** Glide along the path; true when there. */
  private stepPath(dt: number, speed: number): boolean {
    const target = this.path[0];
    if (!target) return true;
    const dx = target.x - this.pos.x;
    const dz = target.y - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    this.walk += dt * (this.kind === 'big' ? 5 : 9);
    if (d <= step) {
      this.pos.x = target.x;
      this.pos.z = target.y;
      this.path.shift();
      return this.path.length === 0;
    }
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    return false;
  }

  private startHop(): void {
    const A = this.A;
    if (this.hops === 0 || this.hops >= this.throwAfter) {
      if (this.hops >= this.throwAfter) this.hops = 0;
      this.throwAfter = 2 + Math.floor(rand(0, 3));
    }
    this.hopFrom.set(this.pos.x, this.pos.z);
    // hop towards the open middle now and then, never through walls
    const to = openSpot(A, -13, 0.8, this.hopFrom, 2.6);
    this.hopTo.copy(to);
    this.go('hop', 0.42);
  }

  private bigDecide(): void {
    const A = this.A;
    if (A.requestThrow()) {
      this.hasToken = true;
      this.go('windup', A.diff.windup * 1.45);
    } else {
      this.moveTo([openSpot(A, -17, -3, v2(this.pos.x, this.pos.z), 4.5)], 'hide');
    }
  }

  private release(): void {
    const A = this.A;
    const m = this.model;
    const from = m.handBall.getWorldPosition(new THREE.Vector3());
    const p = A.playerPos;
    const dist = Math.hypot(p.x - from.x, p.z - from.z);
    const flight = clamp(0.8 + dist * 0.024, 0.95, 1.6) * A.diff.flight;
    const aim = new THREE.Vector3(p.x, p.y + 1.0, p.z).addScaledVector(A.playerVel, flight * A.diff.lead);
    const sig = A.diff.sigma;
    const g = (): number => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * sig;
    if (this.kind === 'big') {
      // a fan of three with gaps to slip through
      const side = new THREE.Vector3(aim.z - from.z, 0, -(aim.x - from.x)).normalize();
      for (const k of [-1, 0, 1]) {
        const to = aim.clone().addScaledVector(side, k * 2.4);
        to.x += g() * 0.5;
        to.z += g() * 0.5;
        A.enemyThrow(from, to, flight * (1 + Math.abs(k) * 0.06), true);
      }
      A.sound.enemyThrow(A.pan(from), true);
    } else {
      aim.x += g();
      aim.z += g();
      A.enemyThrow(from, aim, flight, false);
      A.sound.enemyThrow(A.pan(from));
    }
    if (this.hasToken) {
      A.releaseThrow();
      this.hasToken = false;
    }
    m.handBall.visible = false;
    this.throwKick = 1;
    this.go('after', this.kind === 'small' ? 0.35 : this.kind === 'big' ? 0.6 : 0.7);
  }

  // ---------------------------------------------------------------- looks

  private animate(dt: number): void {
    const m = this.model;
    const st = this.state;
    const d = m.dims;
    // face the player (big ones turn slowly)
    const want = this.faceYaw();
    this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * (this.kind === 'big' ? 3 : 8));
    m.root.rotation.y = this.yaw;
    // rising out of the snow
    let y = this.pos.y;
    if (st === 'rise') {
      const k = clamp(this.t / this.dur, 0, 1);
      y -= (1 - easeOutBack(k)) * (d.top * this.scale + 0.3);
    }
    y += this.hopY;
    m.root.position.set(this.pos.x, y, this.pos.z);
    m.root.scale.setScalar(this.scale);
    // gliding waddle
    const moving = st === 'move';
    const wob = moving ? Math.sin(this.walk) : 0;
    m.body.rotation.z = damp(m.body.rotation.z, wob * (this.kind === 'big' ? 0.09 : 0.13), 12, dt);
    m.body.position.y = moving ? Math.abs(Math.sin(this.walk)) * 0.05 : 0;
    // landing squash and the wind-up lean
    this.squash = Math.max(0, this.squash - dt * 5);
    const winding = st === 'windup';
    const wt = winding ? clamp(this.t / this.dur, 0, 1) : 0;
    let sy = 1 - this.squash * 0.25;
    if (st === 'hop') sy = 1 + Math.sin(clamp(this.t / this.dur, 0, 1) * Math.PI) * 0.12;
    if (winding && this.kind === 'small') sy = 1 - Math.abs(Math.sin(this.t * 14)) * 0.1;
    m.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.lean = damp(this.lean, winding ? -0.22 * wt : st === 'after' ? 0.25 : st === 'stagger' ? -0.35 : 0, 10, dt);
    m.body.rotation.x = this.lean;
    // arms: rest, raised behind the head, swing forward
    this.armPose = damp(this.armPose, winding ? 1 : 0, winding ? 7 : 5, dt);
    this.throwKick = Math.max(0, this.throwKick - dt * 3);
    const a = this.armPose;
    const kick = this.throwKick;
    m.armR.rotation.set(-0.3 * a + 0.9 * kick, -1.0 * a + 1.3 * kick, 0.55 - 2.1 * a - 0.2 * kick);
    m.armL.rotation.set(0, 0.3 * a, -0.55 + Math.sin(this.walk * 0.5) * 0.15 * (moving ? 1 : 0) + 0.3 * a);
    if (this.kind === 'big' && winding) m.armL.rotation.z = -0.55 + 2.0 * a;
    // the snowball in hand grows during the wind-up, the warning bubble pops
    m.handBall.visible = winding && wt > 0.05;
    m.handBall.scale.setScalar(0.4 + 0.6 * Math.min(1, wt * 2));
    m.bubble.visible = winding && wt > 0.08;
    if (m.bubble.visible) {
      const s = (this.kind === 'big' ? 0.85 : 0.62) * (1 + Math.max(0, 0.4 - (wt - 0.08) * 3)) * (1 + Math.sin(this.t * 18) * 0.06);
      m.bubble.scale.setScalar(s / this.scale);
    }
    // head bob
    m.head.rotation.z = Math.sin(this.A.time * 2 + this.id) * 0.05 + wob * 0.06;
    m.head.rotation.x = winding ? 0.1 : 0;
    // hit flash on the big ones (they own their material)
    if (m.bodyMat.userData.flash) m.bodyMat.userData.flash.value = this.flash * 0.8;
  }
}
