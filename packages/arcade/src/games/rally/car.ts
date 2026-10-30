// Arcade-sim car handling: a bicycle model with grip-limited tyres, weight transfer, a rear-wheel-drive
// power curve with an automatic six-speed box, handbrake slides, countersteer help, jumps over crests,
// and gentle bounces off the fences. Surfaces: asphalt, gravel, kerbs, grass, snow, sand and ice. In free
// roam only the real walls (stone walls, bridge rails) stop the car. Plain maths, no Three.js.
import { Fence, Surf, type Proj, type Track } from './track.ts';
import { clamp, damp, lerp, smooth, wrapAngle } from './util.ts';

export interface Controls {
  /** 0..1 */
  throttle: number;
  /** 0..1, also reverses from a standstill */
  brake: number;
  /** −1..1, positive steers left */
  steer: number;
  handbrake: boolean;
}

export interface Ground {
  height(x: number, z: number): number;
}

export const Ground_ = { Asphalt: 0, Gravel: 1, Kerb: 2, Grass: 3, Snow: 4, Sand: 5, Ice: 6, DeepSnow: 7, SoftSand: 8 } as const;

/** Grip and rolling resistance per ground (index = Ground_ value). Rolling resistance grows with speed off the road. */
const MU = [1.2, 0.86, 1.08, 0.74, 0.55, 0.8, 0.4, 0.5, 0.7];
const ROLL = [0.15, 0.55, 0.3, 2.6, 0.5, 1.4, 0.1, 1.9, 2.2];
const ROLL_V = [0, 0, 0, 0.05, 0, 0.012, 0, 0.04, 0.05];
const ROAD_GROUND = [Ground_.Asphalt, Ground_.Gravel, Ground_.Snow, Ground_.Sand, Ground_.Ice];

const MASS = 1200;
const IZ = 2100;
const CG_F = 1.15;
const CG_R = 1.35;
const WB = CG_F + CG_R;
const CG_H = 0.45;
const G = 9.81;
const DRAG = 0.95;
/** Speed (m/s) at 7000 rpm in each gear. */
export const GEAR_V = [12.5, 20.5, 28, 35.5, 42.5, 50];
export const REDLINE = 7000;

const tyre = (alpha: number, b: number): number => Math.sin(1.4 * Math.atan(b * alpha));

export class Car {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  heading = 0;
  yawRate = 0;
  steerAngle = 0;
  gear = 1;
  rpm = 900;
  shiftT = 0;
  /** +1 just shifted up, −1 down (read and cleared by the sound). */
  shifted = 0;
  reverse = false;
  private revHold = 0;
  air = false;
  airT = 0;
  speed = 0;
  vLong = 0;
  vLat = 0;
  /** Smoothed accelerations in the car's frame (m/s²), for body pitch and roll. */
  accLong = 0;
  accLat = 0;
  frontSlip = 0;
  rearSlip = 0;
  /** 0..1 how loudly the tyres are complaining. */
  slip = 0;
  wheelspin = 0;
  surface: number = Ground_.Asphalt;
  onKerb = false;
  wheelRot = 0;
  rearRot = 0;
  readonly proj: Proj = { i: 0, u: 0, s: 0, d: 0 };
  private ground = 0;
  private groundVy = 0;
  /** The last landing's impact speed and fence hit (read and cleared by the game). */
  landed = 0;
  wallHit = 0;
  wallKind = 0;
  /** Slope under the car (radians): pitch nose-up positive, roll left-up positive. */
  slopePitch = 0;
  slopeRoll = 0;
  /** Suspension bounce for the body (m) and its speed. */
  susp = 0;
  suspV = 0;
  // ---- tuning ----
  power = 145000;
  grip = 1;
  /** Countersteer and slide-catching help (0 none … 1 lots). */
  assist = 0.4;
  /** Traction control: share of the rear grip the engine may use. */
  traction = 0.85;
  /** Seconds left of a rocket start. */
  launch = 0;
  /** Seconds without bumping other cars (after a respawn). */
  ghost = 0;
  braking = false;
  throttleIn = 0;
  /** Engine boost on top of the power (nitro, a drift boost): 1 = none. */
  boost = 1;
  /** Brake force multiplier (the brakes part). */
  brakeMul = 1;
  /** Collision size (the bigger bodies). */
  size = 1;
  /** Free roam: no run-off fences, only the real walls; the grass rolls a little easier. */
  roam = false;
  /** What the ground off the road is at a point (grass when not set): snow, sand, ice on the lake. */
  offroadAt: ((x: number, z: number) => number) | null = null;
  private prevD = 0;

  constructor(private track: Track) {}

  place(s: number, d: number, ground: Ground): void {
    const p = this.track.point(s, d);
    this.x = p.x;
    this.z = p.z;
    this.heading = this.track.heading(s);
    this.vx = this.vz = this.vy = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.gear = 1;
    this.reverse = false;
    this.track.project(this.x, this.z, -1, this.proj);
    this.ground = this.groundAt(this.x, this.z, ground);
    this.y = this.ground;
    this.groundVy = 0;
    this.air = false;
    this.susp = 0;
    this.suspV = 0;
  }

  /** Height of the ground at a point near the car (the road is flat across). */
  groundAt(x: number, z: number, ground: Ground, p: Proj = this.proj): number {
    const t = this.track;
    const hw = t.hw[p.i]!;
    const ad = Math.abs(p.d);
    // continuous everywhere (a step would launch the car): the road, blending into the ground over the verge
    if (ad <= hw + 0.3) return t.roadY(p);
    const g = ground.height(x, z);
    if (ad >= hw + 2.5) return g;
    return lerp(t.roadY(p), g, smooth(hw + 0.3, hw + 2.5, ad));
  }

  /** One physics step (call at 120 Hz). */
  step(dt: number, c: Controls, ground: Ground, frozen = false): void {
    const t = this.track;
    const p = this.proj;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    let vLong = this.vx * sinH + this.vz * cosH;
    let vLat = this.vx * cosH - this.vz * sinH;
    const speed = Math.hypot(this.vx, this.vz);
    this.throttleIn = c.throttle;

    // ---- what we drive on ----
    const hw = t.hw[p.i]!;
    const ad = Math.abs(p.d);
    const kerbSide = p.d > 0 ? t.kerbL[p.i] : t.kerbR[p.i];
    let surf: number = ROAD_GROUND[t.surf[p.i] ?? Surf.Asphalt] ?? Ground_.Asphalt;
    this.onKerb = false;
    if (kerbSide && ad > hw - 0.55 && ad < hw + 0.9) {
      surf = Ground_.Kerb;
      this.onKerb = true;
    } else if (ad > hw + 0.45) surf = this.offroadAt ? this.offroadAt(this.x, this.z) : Ground_.Grass;
    this.surface = surf;
    const mu = MU[surf]! * this.grip;
    const rollDecel = (ROLL[surf]! + Math.abs(vLong) * ROLL_V[surf]!) * (this.roam && surf >= Ground_.Grass && surf !== Ground_.Ice ? 0.55 : 1);

    // ---- steering: fewer degrees at speed, plus a hand catching slides ----
    const maxSteer = 0.62 / (1 + Math.abs(vLong) / 11);
    let target = clamp(c.steer, -1, 1) * maxSteer;
    const beta = Math.abs(vLong) > 3 ? Math.atan2(vLat, Math.abs(vLong)) * Math.sign(vLong) : 0;
    target += clamp(beta * this.assist * (c.handbrake ? 0.5 : 1.3), -0.32, 0.32);
    const rate = 3.2 + this.assist * 2;
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);
    const delta = this.steerAngle;

    // ---- gears, revs and the reverse gear ----
    if (!this.reverse) {
      if (c.brake > 0.2 && vLong < 0.8 && c.throttle < 0.1) {
        this.revHold += dt;
        if (this.revHold > 0.35) this.reverse = true;
      } else this.revHold = 0;
    } else if (c.throttle > 0.1 || (c.brake < 0.1 && vLong > 0.5)) {
      this.reverse = false;
      this.revHold = 0;
    }
    this.shiftT = Math.max(0, this.shiftT - dt);
    this.launch = Math.max(0, this.launch - dt);
    this.ghost = Math.max(0, this.ghost - dt);
    const va = Math.abs(vLong);
    if (this.reverse) {
      this.gear = -1;
      this.rpm = damp(this.rpm, 1100 + (va / 9) * 4200 + c.brake * 900, 10, dt);
    } else {
      if (this.gear < 1) this.gear = 1;
      const rpmIn = (g: number): number => (va / GEAR_V[g - 1]!) * REDLINE;
      if (!this.air && !frozen) {
        if (this.gear < 6 && rpmIn(this.gear) > REDLINE - 120 && this.shiftT <= 0) {
          this.gear++;
          this.shiftT = 0.17;
          this.shifted = 1;
        } else if (this.gear > 1 && rpmIn(this.gear) < 3300 && rpmIn(this.gear - 1) < REDLINE - 900) {
          this.gear--;
          this.shifted = -1;
        }
      }
      let want = Math.max(rpmIn(this.gear), 900);
      if (this.gear === 1) want = Math.max(want, 900 + c.throttle * 3200);
      if (this.air || frozen) want = 900 + c.throttle * (REDLINE + 200 - 900);
      want += this.wheelspin * 1800;
      this.rpm = damp(this.rpm, Math.min(want, REDLINE + 250), frozen || this.air ? 7 : 16, dt);
    }

    if (frozen) {
      this.vx = this.vz = 0;
      this.yawRate = 0;
      this.speed = 0;
      this.vLong = this.vLat = 0;
      return;
    }

    // ---- loads with weight transfer ----
    const nf0 = (MASS * G * CG_R) / WB;
    const nr0 = (MASS * G * CG_F) / WB;
    const dn = (MASS * clamp(this.accLong, -12, 12) * CG_H) / WB;
    const nf = Math.max(0.3 * nf0, nf0 - dn);
    const nr = Math.max(0.3 * nr0, nr0 + dn);
    const frontMax = mu * nf * 0.97;
    const rearMax = mu * nr * 1.05;

    let fx = 0;
    let fy = 0;
    let torque = 0;
    this.braking = false;
    if (!this.air) {
      // longitudinal requests
      let drive = 0;
      let brake = 0;
      if (this.reverse) {
        drive = -c.brake * 3800 * (vLong > -9 ? 1 : 0.15);
        brake = c.throttle * 9000;
      } else {
        drive = c.throttle * Math.min(7600 * this.boost, (this.power * this.boost) / Math.max(4, va));
        if (this.shiftT > 0) drive *= 0.3;
        if (this.launch > 0) drive *= 1.4;
        brake = c.brake * 13500 * this.brakeMul;
        // engine braking when lifting
        if (c.throttle < 0.05 && va > 1) brake += 650;
      }
      this.braking = c.brake > 0.1 && !this.reverse && vLong > 1;
      const dirSign = vLong >= 0 ? 1 : -1;
      // stop cleanly instead of jittering about zero
      const stopCap = (MASS * va) / dt;
      brake = Math.min(brake, stopCap);
      let fxF = -dirSign * brake * 0.62;
      let fxR = drive - dirSign * brake * 0.38;
      if (c.handbrake && va > 0.5) fxR -= dirSign * Math.min(0.8 * rearMax, stopCap * 0.5);
      // traction control (and wheelspin when it is overwhelmed)
      const tcCap = rearMax * this.traction;
      this.wheelspin = drive > tcCap ? clamp((drive - tcCap) / (rearMax * 0.4), 0, 1) : 0;
      if (Math.abs(fxR) > tcCap && !c.handbrake) fxR = Math.sign(fxR) * tcCap;
      fxF = clamp(fxF, -frontMax * 0.95, frontMax * 0.95);
      fxR = clamp(fxR, -rearMax, rearMax);

      // lateral: slip angles (front in the wheel's own frame, so reversing works too)
      const vfx = vLong;
      const vfy = vLat + CG_F * this.yawRate;
      const cd = Math.cos(delta);
      const sd = Math.sin(delta);
      const vwl = vfx * cd + vfy * sd;
      const vwt = -vfx * sd + vfy * cd;
      const af = Math.atan2(vwt, Math.max(Math.abs(vwl), 3.5));
      const ar = Math.atan2(vLat - CG_R * this.yawRate, Math.max(va, 3.5));
      const capF = Math.sqrt(Math.max(0, frontMax * frontMax - fxF * fxF));
      let capR = Math.sqrt(Math.max(0, rearMax * rearMax - fxR * fxR));
      capR = Math.max(capR, rearMax * 0.25);
      if (c.handbrake && va > 2) capR *= 0.5;
      const fyF = -capF * tyre(af, 11);
      const fyR = -capR * tyre(ar, 14);
      this.frontSlip = clamp((Math.abs(af) - 0.13) / 0.22, 0, 1);
      this.rearSlip = clamp((Math.abs(ar) - 0.1) / 0.2, 0, 1);

      // front wheel force into the car's frame
      const ffx = fxF * cd - fyF * sd;
      const ffy = fxF * sd + fyF * cd;
      fx = ffx + fxR;
      fy = ffy + fyR;
      torque = CG_F * ffy - CG_R * fyR;
      // rolling resistance and drag
      fx -= dirSign * Math.min(rollDecel * MASS, stopCap * 0.5);
      // slopes: gravity along the car
      fx -= MASS * G * Math.sin(this.slopePitch);
      fy -= MASS * G * Math.sin(this.slopeRoll) * 0.6;
    }
    fx -= DRAG * vLong * Math.abs(vLong);
    fy -= DRAG * 2 * vLat * Math.abs(vLat);

    const axl = fx / MASS;
    const ayl = fy / MASS;
    this.vx += (axl * sinH + ayl * cosH) * dt;
    this.vz += (axl * cosH - ayl * sinH) * dt;
    if (!this.air) this.yawRate += (torque / IZ) * dt;
    else this.yawRate *= Math.exp(-dt * 0.8);
    this.accLong = damp(this.accLong, axl, 6, dt);
    this.accLat = damp(this.accLat, ayl, 6, dt);

    // ---- low speed: roll like a toy car instead of sliding ----
    vLong = this.vx * sinH + this.vz * cosH;
    vLat = this.vx * cosH - this.vz * sinH;
    if (!this.air) {
      const kin = smooth(1.2, 6, Math.abs(vLong));
      const yawKin = (vLong * Math.tan(delta)) / WB;
      this.yawRate = lerp(yawKin, this.yawRate, kin);
      vLat *= Math.exp(-dt * 10 * (1 - kin));
      // a hand on the wheel: catch a slide unless the handbrake is pulled
      if (!c.handbrake && Math.abs(vLong) > 4) {
        const b = Math.atan2(vLat, Math.abs(vLong));
        const want = yawKin;
        const k = this.assist * 7 * smooth(0.06, 0.35, Math.abs(b));
        this.yawRate += (want - this.yawRate) * (1 - Math.exp(-dt * k));
      }
      this.vx = vLong * sinH + vLat * cosH;
      this.vz = vLong * cosH - vLat * sinH;
    }

    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // ---- where are we now; walls ----
    t.project(this.x, this.z, p.i, p);
    this.walls();

    // ---- up and down: stick to the ground unless it falls away faster than gravity ----
    const gNew = this.groundAt(this.x, this.z, ground);
    // the ground's own rise and fall under the wheels, smoothed so that seams in the ground are no ramps
    this.groundVy = damp(this.groundVy, clamp((gNew - this.ground) / dt, -15, 15), 30, dt);
    const gVel = this.groundVy;
    this.ground = gNew;
    this.vy -= G * dt;
    this.y += this.vy * dt;
    if (this.y <= gNew) {
      if (this.air && this.airT > 0.15) this.landed = Math.max(this.landed, Math.max(0, gVel - this.vy));
      this.y = gNew;
      this.vy = Math.max(this.vy, Math.min(gVel, 10));
      this.air = false;
      this.airT = 0;
    } else if (this.y > gNew + 0.12) {
      this.air = true;
      this.airT += dt;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    this.vLong = vLong;
    this.vLat = vLat;
    this.wheelRot += (vLong / 0.34) * dt;
    if (!(c.handbrake && !this.air)) this.rearRot += (vLong / 0.34) * dt + this.wheelspin * 30 * dt;
    const slide = Math.max(this.frontSlip * 0.7, this.rearSlip, c.handbrake && va > 4 ? 0.8 : 0, this.wheelspin * 0.9);
    this.slip = this.air ? 0 : slide * smooth(2.5, 7, this.speed + this.wheelspin * 8);
  }

  /** Keep inside the fences: push back, bounce gently, turn along the fence. */
  private walls(): void {
    const t = this.track;
    const p = this.proj;
    const th = Math.atan2(t.tx[p.i]!, t.tz[p.i]!);
    const rel = wrapAngle(this.heading - th);
    const reach = (0.95 + 1.05 * Math.abs(Math.sin(rel))) * this.size;
    if (this.roam) {
      this.roamWalls(th, reach);
      return;
    }
    const wl = t.at(t.wallL, p.s) - reach;
    const wr = t.at(t.wallR, p.s) - reach;
    let over = 0;
    if (p.d > wl) over = p.d - wl;
    else if (p.d < -wr) over = p.d + wr;
    if (over === 0) return;
    this.bounce(over, th, over > 0 ? t.fenceL[p.i]! : t.fenceR[p.i]!);
  }

  /** Free roam: stone walls and bridge rails are thin walls the car bumps into from either side. */
  private roamWalls(th: number, reach: number): void {
    const t = this.track;
    const p = this.proj;
    const side = p.d > 0 ? 1 : -1;
    const kind = side > 0 ? t.fenceL[p.i]! : t.fenceR[p.i]!;
    const prev = this.prevD;
    this.prevD = p.d;
    if (kind !== Fence.Stone && kind !== Fence.Rail) return;
    // the bridge deck is the road: only its rails count, and only near the deck
    const w = side > 0 ? t.at(t.wallL, p.s) : t.at(t.wallR, p.s);
    const ad = Math.abs(p.d);
    if (ad < w - reach || ad > w + reach) return;
    const inside = Math.sign(prev) !== side || Math.abs(prev) < w;
    const target = inside ? w - reach : w + reach;
    const over = (ad - target) * side;
    if (inside ? ad <= target : ad >= target) return;
    this.bounce(over, th, kind);
  }

  /** Push the car `over` metres back towards the centre line (negative: away from it) and bounce. */
  private bounce(over: number, th: number, kind: number): void {
    const t = this.track;
    const p = this.proj;
    const lx = t.tz[p.i]!;
    const lz = -t.tx[p.i]!;
    this.x -= lx * over;
    this.z -= lz * over;
    p.d -= over;
    const sg = Math.sign(over);
    const vn = (this.vx * lx + this.vz * lz) * sg;
    if (vn > 0) {
      this.vx -= lx * sg * vn * 1.3;
      this.vz -= lz * sg * vn * 1.3;
      const keep = Math.max(0.6, 1 - (0.1 * vn) / Math.max(this.speed, 1));
      this.vx *= keep;
      this.vz *= keep;
      let dh = wrapAngle(th - this.heading);
      if (Math.abs(dh) > Math.PI / 2) dh = wrapAngle(dh + Math.PI);
      this.yawRate = this.yawRate * 0.35 + dh * Math.min(3, vn * 0.4);
      if (vn > this.wallHit) {
        this.wallHit = vn;
        this.wallKind = kind;
      }
    }
  }

  /** Once per frame: slopes under the car and the suspension bounce. */
  settle(dt: number, ground: Ground): void {
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    const q: Proj = { i: 0, u: 0, s: 0, d: 0 };
    const h = (fwd: number, left: number): number => {
      const x = this.x + sinH * fwd + cosH * left;
      const z = this.z + cosH * fwd - sinH * left;
      this.track.project(x, z, this.proj.i, q);
      return this.groundAt(x, z, ground, q);
    };
    const hf = h(1.3, 0);
    const hb = h(-1.3, 0);
    const hl = h(0, 0.85);
    const hr = h(0, -0.85);
    const pitch = Math.atan2(hf - hb, 2.6);
    const roll = Math.atan2(hl - hr, 1.7);
    if (!this.air) {
      this.slopePitch = damp(this.slopePitch, pitch, 14, dt);
      this.slopeRoll = damp(this.slopeRoll, roll, 14, dt);
    }
    // spring
    if (this.landed > 0) this.suspV -= Math.min(4, this.landed * 0.5);
    if (this.onKerb && this.speed > 4) this.suspV += (Math.random() - 0.5) * 0.9;
    if (this.surface === Ground_.Gravel && this.speed > 4) this.suspV += (Math.random() - 0.5) * 0.25;
    if (this.surface === Ground_.Grass && this.speed > 3) this.suspV += (Math.random() - 0.5) * 0.5;
    this.suspV += (-this.susp * 160 - this.suspV * 11) * dt;
    this.susp = clamp(this.susp + this.suspV * dt, -0.22, 0.18);
  }
}

/** Bump cars apart: two circles per car, soft impulses, a little spin from off-centre hits. */
export function collideCars(cars: Car[], onHit: (a: number, b: number, j: number) => void): void {
  const R = 1.0;
  for (let i = 0; i < cars.length; i++)
    for (let k = i + 1; k < cars.length; k++) {
      const a = cars[i]!;
      const b = cars[k]!;
      if (a.ghost > 0 || b.ghost > 0) continue;
      const dx0 = b.x - a.x;
      const dz0 = b.z - a.z;
      const reach = 25 * Math.max(a.size, b.size) ** 2;
      if (dx0 * dx0 + dz0 * dz0 > reach || Math.abs(a.y - b.y) > 2.5) continue;
      const rr = R * a.size + R * b.size;
      let hit = 0;
      for (const oa0 of [-1.05, 1.05])
        for (const ob0 of [-1.05, 1.05]) {
          const oa = oa0 * a.size;
          const ob = ob0 * b.size;
          const ax = a.x + Math.sin(a.heading) * oa;
          const az = a.z + Math.cos(a.heading) * oa;
          const bx = b.x + Math.sin(b.heading) * ob;
          const bz = b.z + Math.cos(b.heading) * ob;
          let nx = bx - ax;
          let nz = bz - az;
          const dist = Math.hypot(nx, nz);
          if (dist >= rr || dist < 1e-4) continue;
          nx /= dist;
          nz /= dist;
          const depth = rr - dist;
          a.x -= nx * depth * 0.5;
          a.z -= nz * depth * 0.5;
          b.x += nx * depth * 0.5;
          b.z += nz * depth * 0.5;
          // contact point velocities (with spin)
          const cx = (ax + bx) / 2;
          const cz = (az + bz) / 2;
          const rax = cx - a.x;
          const raz = cz - a.z;
          const rbx = cx - b.x;
          const rbz = cz - b.z;
          const vax = a.vx + a.yawRate * raz;
          const vaz = a.vz - a.yawRate * rax;
          const vbx = b.vx + b.yawRate * rbz;
          const vbz = b.vz - b.yawRate * rbx;
          const vrel = (vbx - vax) * nx + (vbz - vaz) * nz;
          if (vrel >= 0) continue;
          const j = (-(1 + 0.25) * vrel) / 2;
          a.vx -= j * nx;
          a.vz -= j * nz;
          b.vx += j * nx;
          b.vz += j * nz;
          const spin = 0.22 * (MASS / IZ);
          // torque = J · perp(r), perp(x, z) = (z, −x)
          a.yawRate += (-j * nx * raz + j * nz * rax) * spin;
          b.yawRate += (j * nx * rbz - j * nz * rbx) * spin;
          hit = Math.max(hit, j);
        }
      if (hit > 0.3) onHit(i, k, hit);
    }
}
