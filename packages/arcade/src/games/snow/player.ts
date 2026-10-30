// The player: where they stand and look, and their mitten in the corner of the view (drawn in its
// own little scene on top, so it never pokes into walls). The mitten is the player's colour.
import * as THREE from 'three';
import { stripeTexture } from './textures.ts';
import { clamp, damp, easeOutBack } from './util.ts';
import { PLAYER_START } from './world.ts';

export const MAX_HEARTS = 5;
export const EYE = 1.6;

export class Player {
  pos = PLAYER_START.clone();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0.02;
  grounded = true;
  hearts = MAX_HEARTS;
  invuln = 0;
  bobPhase = 0;
  bob = 0;
  dip = 0;
  stepAcc = 0;
  /** Hit kick on the camera. */
  kickPitch = 0;
  kickRoll = 0;

  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}

/** A forearm in a jacket sleeve with a knitted mitten, pivoting at the elbow (origin), pointing along -z. */
function buildArm(knit: THREE.Material, cuff: THREE.Material, sleeve: THREE.Material, geos: THREE.BufferGeometry[]): { arm: THREE.Group; hand: THREE.Group } {
  const arm = new THREE.Group();
  const sph = new THREE.SphereGeometry(1, 20, 14);
  const sleeveG = new THREE.CylinderGeometry(0.062, 0.078, 0.4, 18);
  sleeveG.rotateX(Math.PI / 2);
  const cuffG = new THREE.CylinderGeometry(0.058, 0.062, 0.075, 18);
  cuffG.rotateX(Math.PI / 2);
  geos.push(sph, sleeveG, cuffG);
  const sl = new THREE.Mesh(sleeveG, sleeve);
  sl.position.z = -0.14;
  const cf = new THREE.Mesh(cuffG, cuff);
  cf.position.z = -0.36;
  const hand = new THREE.Group();
  hand.position.z = -0.45;
  const palm = new THREE.Mesh(sph, knit);
  palm.scale.set(0.068, 0.056, 0.095);
  const thumb = new THREE.Mesh(sph, knit);
  thumb.scale.set(0.028, 0.03, 0.05);
  thumb.position.set(-0.062, 0.024, 0.02);
  thumb.rotation.y = 0.5;
  hand.add(palm, thumb);
  arm.add(sl, cf, hand);
  return { arm, hand };
}

const S = 0.56;

export class Hand {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  private right: THREE.Group;
  private left: THREE.Group;
  private ball: THREE.Mesh;
  private giant: THREE.Mesh;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private tex: THREE.Texture;
  private moon = new THREE.DirectionalLight(0xdfe6ff, 1.1);
  private warm = new THREE.DirectionalLight(0xffb39a, 0.9);
  private knit: THREE.MeshLambertMaterial;
  private baseEmissive: THREE.Color;
  private throwT = 9;
  private ballT = 9;
  private giantT = 9;
  private hitT = 9;
  private aspect = 1.6;
  private sway = new THREE.Vector2();
  private hasBall = true;
  private t = 0;
  private tmpV = new THREE.Vector3();
  private tmpO = new THREE.Vector3();

  constructor(color: string, private moonDir: THREE.Vector3, private warmDir: THREE.Vector3) {
    const c = new THREE.Color(color);
    const jacket = new THREE.Color(0x3a4688);
    this.tex = stripeTexture('#ffffff', '#' + c.getHexString());
    this.tex.repeat.set(3, 1);
    this.knit = new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.14) });
    const cuff = new THREE.MeshLambertMaterial({ map: this.tex, emissive: 0x202030 });
    const sleeve = new THREE.MeshLambertMaterial({ color: jacket, emissive: jacket.clone().multiplyScalar(0.12) });
    this.baseEmissive = this.knit.emissive.clone();
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xf6f8ff, emissive: 0x30304a });
    this.mats.push(this.knit, cuff, sleeve, ballMat);
    const r = buildArm(this.knit, cuff, sleeve, this.geos);
    const l = buildArm(this.knit, cuff, sleeve, this.geos);
    this.right = r.arm;
    this.left = l.arm;
    const bg = new THREE.IcosahedronGeometry(0.058, 2);
    const gg = new THREE.IcosahedronGeometry(0.17, 3);
    this.geos.push(bg, gg);
    this.ball = new THREE.Mesh(bg, ballMat);
    this.ball.position.set(0.004, 0.07, -0.01);
    r.hand.add(this.ball);
    this.giant = new THREE.Mesh(gg, ballMat);
    this.giant.visible = false;
    this.left.visible = false;
    this.scene.add(this.right, this.left, this.giant);
    this.scene.add(new THREE.HemisphereLight(0x9fb0ff, 0xe9c6e4, 1.0), this.moon, this.warm, this.moon.target, this.warm.target);
  }

  resize(aspect: number, fov: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(70, fov);
    this.camera.updateProjectionMatrix();
  }

  throw(): void {
    this.throwT = 0;
    this.ballT = 0;
    this.hasBall = false;
  }

  rollGiant(): void {
    this.giantT = 0;
  }

  flinch(): void {
    this.hitT = 0;
  }

  /** Where a thrown snowball starts, relative to the eye (camera space). */
  launchOffset(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0.18, -0.16, -0.4);
  }

  update(dt: number, s: { camQuat: THREE.Quaternion; moving: number; bobPhase: number; ammo: number; mode: 'normal' | 'rapid' | 'giant'; vy: number; lookDX: number; lookDY: number }): void {
    this.t += dt;
    this.throwT += dt;
    this.ballT += dt;
    this.giantT += dt;
    this.hitT += dt;
    // light the mitten like the world around it
    const inv = s.camQuat.clone().invert();
    this.moon.position.copy(this.moonDir).applyQuaternion(inv).multiplyScalar(5);
    this.warm.position.copy(this.warmDir).applyQuaternion(inv).multiplyScalar(5);
    // place the mitten by where it should appear on screen; the forearm reaches in from below
    const tanH = Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    const narrow = clamp(this.aspect / 1.5, 0.6, 1);
    this.sway.x = damp(this.sway.x, clamp(-s.lookDX * 0.0004, -0.02, 0.02), 10, dt);
    this.sway.y = damp(this.sway.y, clamp(s.lookDY * 0.0004, -0.02, 0.02), 10, dt);
    const bobX = Math.sin(s.bobPhase) * 0.006 * s.moving;
    const bobY = -Math.abs(Math.cos(s.bobPhase)) * 0.008 * s.moving + Math.sin(this.t * 1.6) * 0.002;
    const air = clamp(-s.vy * 0.002, -0.015, 0.015);
    const depth = 0.34;
    let nx = 0.66 + (1 - narrow) * 0.12;
    let ny = -0.62;
    let push = 0;
    let rx = 0.62;
    let ry = 0.16;
    let rz = -0.1;
    // the throw: a quick flick forward and up, then back
    const tt = this.throwT;
    if (tt < 0.3) {
      const k = tt < 0.07 ? Math.sin((tt / 0.07) * Math.PI * 0.5) : 1 - (tt - 0.07) / 0.23;
      const e = clamp(k, 0, 1);
      rx += 0.35 * e;
      nx -= 0.08 * e;
      ny += 0.16 * e;
      push += 0.1 * e;
    }
    if (this.hitT < 0.4) {
      const k = Math.sin((this.hitT / 0.4) * Math.PI);
      ny -= 0.2 * k;
      rz += 0.25 * k;
    }
    // a fresh snowball pops into the mitten
    const want = s.ammo > 0 || s.mode === 'rapid';
    if (!this.hasBall && want && this.ballT > (s.mode === 'rapid' ? 0.05 : 0.16)) {
      this.hasBall = true;
      this.ballT = 0;
    }
    if (!want) this.hasBall = false;
    this.ball.visible = this.hasBall && s.mode !== 'giant';
    this.ball.scale.setScalar(this.ballT < 0.2 ? Math.max(0.01, easeOutBack(this.ballT / 0.2)) : 1);
    // no snowballs left: the mitten dips down to scoop more
    if (!want) {
      ny -= 0.22 + Math.sin(this.t * 9) * 0.03;
      rx -= 0.25;
    }
    const giant = s.mode === 'giant';
    const gt = this.giantT;
    this.giant.visible = giant || gt < 0.25;
    this.left.visible = giant || gt < 0.4;
    let g = 0;
    if (this.left.visible) {
      // the giant snowball is held low in the middle with both mittens
      g = gt < 0.4 ? Math.sin((gt / 0.4) * Math.PI) : 0;
      const gd = 0.5 + g * 0.3;
      this.giant.position.set(0, (-0.62 + Math.sin(this.t * 2) * 0.01) * tanH * gd + bobY - (gt < 0.25 ? gt * 0.3 : 0), -gd);
      this.giant.rotation.x += dt * (gt < 0.25 ? 14 : 0.3);
      nx = 0.36;
      ny = -0.62;
      rx = 0.5;
      ry = 0.5;
      rz = -0.35;
      push = g * 0.12;
    }
    const sc = S * (0.85 + 0.15 * narrow);
    const L = 0.45 * sc;
    const place = (arm: THREE.Group, side: number): void => {
      arm.rotation.set(rx, ry * side, rz * side, 'YXZ');
      const target = this.tmpV.set(side * (nx * tanH * this.aspect * depth) + this.sway.x + bobX, ny * tanH * depth + this.sway.y + bobY + air, -depth - push);
      const off = this.tmpO.set(0, 0, -L).applyEuler(arm.rotation);
      arm.position.copy(target).sub(off);
      arm.scale.set(side * sc, sc, sc);
    };
    place(this.right, 1);
    if (this.left.visible) place(this.left, -1);
    // rapid throws: the mitten glows
    if (s.mode === 'rapid') this.knit.emissive.copy(this.baseEmissive).lerp(new THREE.Color(0xffd23f), 0.35 + 0.25 * Math.sin(this.t * 14));
    else this.knit.emissive.copy(this.baseEmissive);
  }

  render(r: THREE.WebGLRenderer): void {
    r.clearDepth();
    r.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}
