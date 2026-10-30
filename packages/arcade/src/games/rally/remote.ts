// Cars driven on other screens: the other racers online (and, for everyone but the host, the computer
// cars), drawn from their snapshots a tenth of a second behind, extrapolated a little when a packet is
// late. Also the time-trial ghost: a recorded run played back as a see-through car.
import * as THREE from 'three';
import type { CarSnap } from '@lilla-garden/shared';
import { Car, type Ground } from './car.ts';
import type { CarModel } from './models.ts';
import type { Track } from './track.ts';
import { clamp, damp, lerp, wrapAngle } from './util.ts';

/** How far behind the newest snapshot we draw (ms). */
const DELAY = 100;
/** How far past the newest snapshot we dare guess (ms). */
const MAX_EXTRAP = 300;

export class RemoteCar {
  /** A stand-in Car so the AI sees it, it can be bumped into, and the race can rank it. */
  readonly car: Car;
  private snaps: CarSnap[] = [];
  /** Local clock minus the sender's clock (ms), smoothed. */
  private offset = NaN;
  lap = 0;
  /** Distance raced along the centre line (as Entrant.u). */
  u = 0;
  finished = false;
  finishTime = 0;
  damage = 0;
  nitro = false;
  steer = 0;
  braking = false;
  /** Seconds since the last snapshot (a car that went quiet fades its name). */
  quiet = 0;
  private wheelRot = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly color: string,
    readonly model: CarModel,
    track: Track,
    size = 1,
  ) {
    this.car = new Car(track);
    this.car.size = size;
  }

  get ready(): boolean {
    return this.snaps.length > 0;
  }

  push(s: CarSnap, localMs: number): void {
    const off = localMs - s.t;
    // the smallest offset is the one with the least network delay; drift slowly towards later ones
    if (!Number.isFinite(this.offset) || off < this.offset || Math.abs(off - this.offset) > 2000) this.offset = off;
    else this.offset += (off - this.offset) * 0.02;
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) return;
    this.snaps.push(s);
    if (this.snaps.length > 4) this.snaps.shift();
    this.lap = s.lap;
    this.damage = s.dm;
    this.nitro = s.ni;
    this.steer = s.st;
    this.braking = s.br > 0.1;
    this.quiet = 0;
  }

  /** Move the stand-in car to where the sender's car was DELAY ms ago. */
  update(localMs: number, dt: number, track: Track, ground: Ground): void {
    this.quiet += dt;
    const n = this.snaps.length;
    if (!n) return;
    const t = localMs - this.offset - DELAY;
    const c = this.car;
    let a = this.snaps[0]!;
    let b = a;
    for (let i = 0; i < n - 1; i++) {
      if (this.snaps[i + 1]!.t >= t) {
        a = this.snaps[i]!;
        b = this.snaps[i + 1]!;
        break;
      }
      a = b = this.snaps[i + 1]!;
    }
    let x: number;
    let y: number;
    let z: number;
    let h: number;
    if (a !== b && b.t > a.t) {
      const f = clamp((t - a.t) / (b.t - a.t), 0, 1);
      x = lerp(a.x, b.x, f);
      y = lerp(a.y, b.y, f);
      z = lerp(a.z, b.z, f);
      h = a.h + wrapAngle(b.h - a.h) * f;
      c.vx = lerp(a.vx, b.vx, f);
      c.vz = lerp(a.vz, b.vz, f);
    } else {
      // past the newest one: keep going a little along its velocity
      const ex = clamp(t - b.t, 0, MAX_EXTRAP) / 1000;
      x = b.x + b.vx * ex;
      z = b.z + b.vz * ex;
      y = b.y;
      h = b.h;
      c.vx = b.vx;
      c.vz = b.vz;
    }
    c.x = x;
    c.z = z;
    c.heading = wrapAngle(h);
    track.project(x, z, c.proj.i, c.proj);
    const gy = c.groundAt(x, z, ground);
    c.y = Math.max(y, gy - 0.3);
    c.air = c.y > gy + 0.3;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    c.vLong = c.vx * sinH + c.vz * cosH;
    c.vLat = c.vx * cosH - c.vz * sinH;
    c.speed = Math.hypot(c.vx, c.vz);
    c.steerAngle = damp(c.steerAngle, (this.steer * 0.62) / (1 + Math.abs(c.vLong) / 11), 10, dt);
    c.settle(dt, ground);
    this.wheelRot += (c.vLong / 0.34) * dt;
    c.wheelRot = c.rearRot = this.wheelRot;
    c.braking = this.braking;
    // laps and the distance raced, for the standings
    const s = c.proj.s;
    this.u = this.lap === 0 && s > track.length / 2 ? s - track.length : this.lap * track.length + s;
  }

  dispose(): void {
    this.model.root.removeFromParent();
    this.model.shadow.removeFromParent();
    this.model.dispose();
  }
}

/** A recorded run: x, y, z and heading ten times a second. */
export class GhostTrack {
  static readonly HZ = 10;
  data: number[] = [];
  private nextT = 0;

  record(t: number, c: Car): void {
    while (t >= this.nextT) {
      this.data.push(Math.round(c.x * 100) / 100, Math.round(c.y * 100) / 100, Math.round(c.z * 100) / 100, Math.round(c.heading * 1000) / 1000);
      this.nextT += 1 / GhostTrack.HZ;
    }
  }

  /** Where the run was at time t (s); false past its end. */
  sample(t: number, out: { x: number; y: number; z: number; h: number }): boolean {
    const f = t * GhostTrack.HZ;
    const i = Math.floor(f);
    const n = this.data.length / 4;
    if (i < 0 || i + 1 >= n) return false;
    const k = f - i;
    const d = this.data;
    out.x = lerp(d[i * 4]!, d[i * 4 + 4]!, k);
    out.y = lerp(d[i * 4 + 1]!, d[i * 4 + 5]!, k);
    out.z = lerp(d[i * 4 + 2]!, d[i * 4 + 6]!, k);
    out.h = d[i * 4 + 3]! + wrapAngle(d[i * 4 + 7]! - d[i * 4 + 3]!) * k;
    return true;
  }
}

/** Make a car model see-through (its materials are cloned so the real cars keep theirs). */
export function ghostify(model: CarModel, opacity = 0.38): () => void {
  const clones: THREE.Material[] = [];
  model.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const swap = (mt: THREE.Material): THREE.Material => {
      const c = mt.clone();
      c.transparent = true;
      c.opacity = opacity * (mt.opacity ?? 1);
      c.depthWrite = false;
      clones.push(c);
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    m.castShadow = false;
  });
  model.shadow.visible = false;
  return () => {
    for (const c of clones) c.dispose();
  };
}
