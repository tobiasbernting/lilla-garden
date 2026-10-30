// Snowballs in flight (the player's and the snowmen's), drawn as two instanced meshes with soft
// shadows on the snow, and the giant snowball that rolls through everything.
import * as THREE from 'three';
import { heightAt } from './world.ts';

export const PLAYER_G = 11;
export const ENEMY_G = 9.8;

export interface Ball {
  p: THREE.Vector3;
  prev: THREE.Vector3;
  v: THREE.Vector3;
  r: number;
  enemy: boolean;
  big: boolean;
  age: number;
  alive: boolean;
  /** Steers gently towards this (aim assist), if set. */
  homing: (() => THREE.Vector3 | null) | null;
  /** Counted as a hit already (for accuracy and the streak). */
  scored: boolean;
  trail: number;
}

export class Balls {
  list: Ball[] = [];
  private pMesh: THREE.InstancedMesh;
  private eMesh: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private tp = new THREE.Vector3();

  constructor(scene: THREE.Scene, blob: THREE.Texture, low: boolean) {
    const geo = new THREE.SphereGeometry(1, low ? 10 : 14, low ? 8 : 10);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8aa8 }), 48);
    this.eMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xfff4f8, emissive: 0x8a6078 }), 48);
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 96);
    for (const im of [this.pMesh, this.eMesh, this.shadows]) {
      im.count = 0;
      im.frustumCulled = false;
      scene.add(im);
    }
    this.shadows.renderOrder = 2;
  }

  throwPlayer(from: THREE.Vector3, v: THREE.Vector3, homing: Ball['homing'], big = false): Ball {
    const b: Ball = { p: from.clone(), prev: from.clone(), v: v.clone(), r: big ? 0.2 : 0.13, enemy: false, big, age: 0, alive: true, homing, scored: false, trail: 0 };
    this.list.push(b);
    return b;
  }

  /** A snowman's throw: lands at `to` after `flight` seconds. */
  throwEnemy(from: THREE.Vector3, to: THREE.Vector3, flight: number, big: boolean): Ball {
    const v = new THREE.Vector3().subVectors(to, from).divideScalar(flight);
    v.y += 0.5 * ENEMY_G * flight;
    const b: Ball = { p: from.clone(), prev: from.clone(), v, r: big ? 0.26 : 0.17, enemy: true, big, age: 0, alive: true, homing: null, scored: false, trail: 0 };
    this.list.push(b);
    return b;
  }

  /** Move one ball a small step. */
  step(b: Ball, dt: number): void {
    b.prev.copy(b.p);
    if (b.homing && b.age < 1.5) {
      const t = b.homing();
      if (t) {
        // steer the horizontal velocity a little towards the target
        this.tp.subVectors(t, b.p);
        const d = this.tp.length();
        if (d > 0.5) {
          const sp = Math.hypot(b.v.x, b.v.z);
          const want = this.tp.multiplyScalar(sp / d);
          const k = Math.min(1, dt * 5);
          b.v.x += (want.x - b.v.x) * k;
          b.v.z += (want.z - b.v.z) * k;
        }
      }
    }
    b.v.y -= (b.enemy ? ENEMY_G : PLAYER_G) * dt;
    b.p.addScaledVector(b.v, dt);
    b.age += dt;
  }

  sync(): void {
    this.list = this.list.filter((b) => b.alive);
    let np = 0;
    let ne = 0;
    let ns = 0;
    for (const b of this.list) {
      this.s.setScalar(b.r);
      // stretch a little along the flight for speed
      this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.tp.copy(b.v).normalize());
      const sp = b.v.length();
      this.s.set(b.r, b.r * (1 + Math.min(0.5, sp * 0.012)), b.r);
      this.m.compose(b.p, this.q, this.s);
      if (b.enemy) this.eMesh.setMatrixAt(ne++, this.m);
      else this.pMesh.setMatrixAt(np++, this.m);
      // the shadow grows sharper as the ball comes down
      const gy = heightAt(b.p.x, b.p.z);
      const h = b.p.y - gy;
      if (h < 14 && ns < 96) {
        const k = b.r * (2.6 + h * 0.18) * (b.enemy ? 1.25 : 1);
        this.s.set(k, k, k);
        this.tp.set(b.p.x, gy + 0.05, b.p.z);
        this.m.compose(this.tp, this.flat, this.s);
        this.shadows.setMatrixAt(ns++, this.m);
      }
    }
    this.pMesh.count = np;
    this.eMesh.count = ne;
    this.shadows.count = ns;
    for (const im of [this.pMesh, this.eMesh, this.shadows]) im.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.list = [];
    this.sync();
  }
}

/** A lumpy giant snowball that rolls along the ground. */
export class Giant {
  readonly mesh: THREE.Mesh;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  r = 0.85;
  traveled = 0;
  alive = true;
  hitIds = new Set<number>();
  bossHit = false;
  private speed = 14;

  constructor(scene: THREE.Scene, from: THREE.Vector3, dir: THREE.Vector3, shadows: boolean) {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + Math.sin(v.x * 5.1 + v.y * 2.3) * 0.04 + Math.sin(v.z * 6.7 - v.x * 1.7) * 0.035;
      v.multiplyScalar(n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xf4f7ff, emissive: 0x3a3c5c }));
    this.mesh.castShadow = shadows;
    this.pos = from.clone();
    this.dir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    const step = this.speed * dt;
    this.pos.addScaledVector(this.dir, step);
    this.traveled += step;
    this.r = Math.min(1.35, this.r + dt * 0.18);
    this.pos.y = heightAt(this.pos.x, this.pos.z) + this.r * 0.92;
    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(this.r);
    // roll: rotate round the axis across the direction of travel
    const axis = new THREE.Vector3(this.dir.z, 0, -this.dir.x);
    this.mesh.rotateOnWorldAxis(axis, step / this.r);
    if (this.traveled > 58 || Math.abs(this.pos.x) > 24 || this.pos.z < -33) this.alive = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
