// The opponents: they follow the racing line (pure pursuit), brake for bends from the speed profile,
// pass slower cars, wobble a little each in their own way, and are mildly rubber-banded to the player.
import type { Car, Controls } from './car.ts';
import type { Track } from './track.ts';
import { clamp, damp } from './util.ts';

export interface Personality {
  /** Share of the bend speed they dare (0.8 careful … 1 brave). */
  skill: number;
  /** They like to drive this far left (+) of the line. */
  bias: number;
  /** How much of the racing line they use (0 middle of the road … 1 full line). */
  lineUse: number;
  /** A slow weave across the road (m). */
  wobble: number;
  phase: number;
}

const tmp = { x: 0, y: 0, z: 0 };

/** Steering (−1..1, left positive) that points the car at a spot `ahead` metres on, `off` from the centre. */
export function steerTo(car: Car, track: Track, ahead: number, off: number): number {
  const p = car.proj;
  const tp = track.point(p.s + ahead, off, tmp);
  const dx = tp.x - car.x;
  const dz = tp.z - car.z;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const fwd = dx * sinH + dz * cosH;
  const lat = dx * cosH - dz * sinH;
  const reverse = car.vLong < -0.5;
  const alpha = Math.atan2(lat, Math.max(fwd, 0.5));
  const delta = Math.atan2(2 * 2.5 * Math.sin(alpha), Math.max(4, Math.hypot(dx, dz)));
  const maxSteer = 0.62 / (1 + Math.abs(car.vLong) / 11);
  return clamp((delta / maxSteer) * (reverse ? -1 : 1), -1, 1);
}

export class Driver {
  /** Current sideways dodge (m) to get past a slower car. */
  private dodge = 0;
  stuckT = 0;
  lostT = 0;

  constructor(public p: Personality) {}

  /** The line this driver wants at arc length s. */
  lineAt(track: Track, s: number, time: number): number {
    const hw = track.at(track.hw, s);
    const o = track.at(track.line, s) * this.p.lineUse + this.p.bias + Math.sin(time * 0.37 + this.p.phase) * this.p.wobble + this.dodge;
    return clamp(o, -hw + 1.7, hw - 1.7);
  }

  drive(car: Car, track: Track, others: Car[], speedMul: number, time: number, dt: number, out: Controls): Controls {
    const p = car.proj;
    const v = Math.max(0, car.vLong);
    // someone in the way? dodge to the roomier side and don't ram them
    let block = Infinity;
    let blockV = 0;
    let want = 0;
    for (const o of others) {
      if (o === car) continue;
      const ds = track.wrapDist(o.proj.s - p.s);
      if (ds < 1 || ds > 18) continue;
      const dd = o.proj.d - p.d;
      if (Math.abs(dd) > 3.4) continue;
      if (ds < block) {
        block = ds;
        blockV = o.vLong;
        const hw = track.at(track.hw, p.s + ds);
        // pass on whichever side has more road
        const room = o.proj.d > 0 ? o.proj.d + hw : hw - o.proj.d;
        const goLeft = room < hw ? o.proj.d < 0 : o.proj.d <= 0;
        want = (goLeft ? o.proj.d + 3.8 : o.proj.d - 3.8) - (track.at(track.line, p.s + ds) * this.p.lineUse + this.p.bias);
      }
    }
    this.dodge = damp(this.dodge, block < Infinity && v > blockV - 1 ? clamp(want, -6, 6) : 0, block < Infinity ? 1.6 : 0.8, dt);

    const ahead = 6.5 + v * 0.48;
    const off = this.lineAt(track, p.s + ahead, time);
    out.steer = steerTo(car, track, ahead, off);
    // speed: the profile a little ahead, scaled by courage and the rubber band
    const look = 3 + v * 0.18;
    let target = track.at(track.vmax, p.s + look) * this.p.skill * speedMul;
    if (block < 9 && blockV < v) target = Math.min(target, blockV + 0.5 + block * 0.25);
    // off the road: take it easy
    if (Math.abs(p.d) > track.at(track.hw, p.s) + 0.5) target = Math.min(target, 16);
    const err = target - v;
    if (err > 0) {
      out.throttle = clamp(err / 2.5 + 0.35, 0, 1);
      out.brake = 0;
    } else {
      out.throttle = err > -1 ? 0.25 : 0;
      out.brake = clamp(-err / 4 - 0.1, 0, 1);
    }
    // facing the wrong way (after a spin): drive on round
    const th = track.heading(p.s);
    const rel = Math.cos(car.heading - th);
    if (rel < 0.1 && v < 6) {
      out.throttle = 0.6;
      out.brake = 0;
      out.steer = Math.sign(Math.sin(th - car.heading) || 1);
    }
    out.handbrake = false;
    return out;
  }
}
