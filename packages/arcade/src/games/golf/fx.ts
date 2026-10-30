// Juice: confetti, splashes, puffs and sparkles; the dotted aim line with its slingshot band and
// power ring; and the ball itself (rolling stripe, soft shadow, a ghost when something hides it).
import * as THREE from 'three';
import { type Kit } from './kit3d.ts';
import { R_BALL } from './physics.ts';
import { ballTexture } from './tex.ts';

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  drag: number;
  grav: number;
  color: THREE.Color;
}

class Pool {
  bits: Bit[] = [];
  mesh: THREE.InstancedMesh;
  private o = new THREE.Object3D();
  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    private cap: number,
    scene: THREE.Object3D,
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
    scene.add(this.mesh);
  }
  add(b: Partial<Bit> & { x: number; y: number; z: number }): void {
    if (this.bits.length >= this.cap) this.bits.shift();
    this.bits.push({
      vx: 0,
      vy: 0,
      vz: 0,
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      rz: Math.random() * 6,
      wx: 0,
      wy: 0,
      wz: 0,
      life: 0,
      max: 1,
      size: 0.1,
      grow: 0,
      drag: 0,
      grav: 0,
      color: new THREE.Color('#ffffff'),
      ...b,
    });
  }
  update(dt: number): void {
    const out: Bit[] = [];
    for (const b of this.bits) {
      b.life += dt;
      if (b.life >= b.max) continue;
      b.vy -= b.grav * dt;
      const k = Math.max(0, 1 - b.drag * dt);
      b.vx *= k;
      b.vy *= k;
      b.vz *= k;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.rx += b.wx * dt;
      b.ry += b.wy * dt;
      b.rz += b.wz * dt;
      out.push(b);
    }
    this.bits = out;
    const o = this.o;
    let i = 0;
    for (const b of out) {
      const f = b.life / b.max;
      const s = Math.max(0.001, b.size * (1 + b.grow * f) * (f > 0.7 ? (1 - f) / 0.3 : 1));
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(b.rx, b.ry, b.rz);
      o.scale.setScalar(s);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
      this.mesh.setColorAt(i, b.color);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

const CONFETTI = ['#ff4f7b', '#ffd23f', '#3fb6ff', '#5fdc6a', '#ff8f2a', '#b388ff', '#ffffff'];

export class Particles {
  private confettiP: Pool;
  private drops: Pool;
  private puffs: Pool;
  private stars: Pool;
  private bits: Pool;
  private rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private many: boolean;
  private owned: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(
    kit: Kit,
    private scene: THREE.Object3D,
  ) {
    this.many = kit.quality === 'high';
    const plane = this.g(new THREE.PlaneGeometry(1, 0.6));
    const confMat = this.m(new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    this.confettiP = new Pool(plane, confMat, this.many ? 320 : 140, scene);
    const drop = this.g(new THREE.SphereGeometry(1, 6, 4));
    this.drops = new Pool(drop, this.m(new THREE.MeshBasicMaterial({ color: '#ffffff' })), 60, scene);
    const puff = this.g(new THREE.IcosahedronGeometry(1, 1));
    this.puffs = new Pool(puff, this.m(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true })), 60, scene);
    const star = this.g(new THREE.OctahedronGeometry(1, 0));
    this.stars = new Pool(star, this.m(new THREE.MeshBasicMaterial({ color: '#ffffff' })), 60, scene);
    const box = this.g(new THREE.BoxGeometry(1, 0.25, 0.25));
    this.bits = new Pool(box, this.m(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })), 50, scene);
    const ring = this.g(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2));
    for (let i = 0; i < 3; i++) {
      const mat = this.m(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      const m = new THREE.Mesh(ring, mat);
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, mat, life: 1 });
    }
  }
  private g<G extends THREE.BufferGeometry>(g: G): G {
    this.owned.push(g);
    return g;
  }
  private m<M extends THREE.Material>(m: M): M {
    this.mats.push(m);
    return m;
  }

  confetti(x: number, y: number, z: number, n: number, up = 7): void {
    const count = this.many ? n : Math.round(n * 0.45);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3.5;
      this.confettiP.add({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: up * (0.6 + Math.random() * 0.6),
        vz: Math.sin(a) * s,
        wx: (Math.random() - 0.5) * 14,
        wy: (Math.random() - 0.5) * 14,
        wz: (Math.random() - 0.5) * 14,
        max: 2.4 + Math.random() * 1.4,
        size: 0.12 + Math.random() * 0.06,
        drag: 1.6,
        grav: 5,
        color: new THREE.Color(CONFETTI[i % CONFETTI.length]!),
      });
    }
  }

  splash(x: number, y: number, z: number): void {
    for (let i = 0; i < (this.many ? 34 : 18); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 2.2;
      this.drops.add({ x, y, z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 4, vz: Math.sin(a) * s, max: 0.8 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.05, grav: 16, color: new THREE.Color(Math.random() < 0.5 ? '#bdeeff' : '#ffffff') });
    }
    this.ring(x, y + 0.02, z, 0);
    this.ring(x, y + 0.02, z, 0.18);
  }

  private ring(x: number, y: number, z: number, delay: number): void {
    const r = this.rings.find((q) => q.life >= 1) ?? this.rings[0]!;
    r.m.position.set(x, y, z);
    r.life = -delay;
    r.m.visible = true;
  }

  puff(x: number, y: number, z: number, n = 8, color = '#ffffff', size = 0.16): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.2;
      this.puffs.add({ x, y, z, vx: Math.cos(a) * s, vy: 0.5 + Math.random() * 1.2, vz: Math.sin(a) * s, max: 0.5 + Math.random() * 0.4, size: size * (0.7 + Math.random() * 0.6), grow: 0.8, drag: 3, color: new THREE.Color(color) });
    }
  }

  sparkle(x: number, y: number, z: number, n = 14, color = '#ffe066'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.6;
      this.stars.add({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, wy: 8, wx: 3, max: 0.7 + Math.random() * 0.6, size: 0.06 + Math.random() * 0.05, grav: 4, drag: 1.5, color: new THREE.Color(i % 3 === 0 ? '#ffffff' : color) });
    }
  }

  hay(x: number, y: number, z: number): void {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.5;
      this.bits.add({ x, y, z, vx: Math.cos(a) * s, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * s, wx: 9, wz: 7, max: 0.9, size: 0.12, grav: 9, drag: 1, color: new THREE.Color(Math.random() < 0.5 ? '#f2c64a' : '#e0a92e') });
    }
  }

  update(dt: number): void {
    this.confettiP.update(dt);
    this.drops.update(dt);
    this.puffs.update(dt);
    this.stars.update(dt);
    this.bits.update(dt);
    for (const r of this.rings) {
      if (r.life >= 1) continue;
      r.life += dt / 0.9;
      if (r.life < 0) {
        r.m.visible = false;
        continue;
      }
      r.m.visible = r.life < 1;
      r.m.scale.setScalar(0.25 + r.life * 1.3);
      r.mat.opacity = 0.75 * (1 - r.life);
    }
  }

  dispose(): void {
    for (const p of [this.confettiP, this.drops, this.puffs, this.stars, this.bits]) p.dispose();
    for (const r of this.rings) r.m.removeFromParent();
    for (const g of this.owned) g.dispose();
    for (const m of this.mats) m.dispose();
    void this.scene;
  }
}

// ---------------------------------------------------------------- aiming

const MAX_DOTS = 44;

export class AimView {
  root = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private band: THREE.Mesh;
  private knob: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringGeo: THREE.BufferGeometry;
  private endMark: THREE.Mesh;
  private owned: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private o = new THREE.Object3D();
  private c = new THREE.Color();
  private segs = 48;

  constructor(color: string) {
    const dotGeo = this.g(new THREE.SphereGeometry(0.075, 10, 6));
    this.dots = new THREE.InstancedMesh(dotGeo, this.m(new THREE.MeshBasicMaterial({ color: '#ffffff' })), MAX_DOTS);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.setColorAt(0, new THREE.Color('#ffffff'));
    this.root.add(this.dots);
    const bandGeo = this.g(new THREE.CylinderGeometry(0.04, 0.04, 1, 8).translate(0, 0.5, 0).rotateX(Math.PI / 2));
    const lighter = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35);
    this.band = new THREE.Mesh(bandGeo, this.m(new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.4 })));
    this.root.add(this.band);
    this.knob = new THREE.Mesh(this.g(new THREE.SphereGeometry(0.1, 12, 8)), this.m(new THREE.MeshStandardMaterial({ color, roughness: 0.3 })));
    this.root.add(this.knob);
    // the power ring around the ball: drawn part-way to show the strength
    const ring = new THREE.RingGeometry(0.34, 0.46, this.segs, 1, Math.PI / 2, -Math.PI * 2);
    ring.rotateX(-Math.PI / 2);
    const cols: number[] = [];
    const pos = ring.attributes.position!;
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const seg = i % (this.segs + 1);
      powerColor(seg / this.segs, cc);
      cols.push(cc.r, cc.g, cc.b);
    }
    ring.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.ringGeo = this.g(ring);
    this.ring = new THREE.Mesh(ring, this.m(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })));
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
    this.endMark = new THREE.Mesh(this.g(new THREE.TorusGeometry(0.16, 0.035, 6, 20).rotateX(Math.PI / 2)), this.m(new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    this.root.add(this.endMark);
    this.root.visible = false;
  }
  private g<G extends THREE.BufferGeometry>(g: G): G {
    this.owned.push(g);
    return g;
  }
  private m<M extends THREE.Material>(m: M): M {
    this.mats.push(m);
    return m;
  }

  /**
   * Show the aim: `path` holds x,y,z triples of the predicted roll, `power` 0..1, `dir` the shot's
   * direction on the ground. `ready` dims it while the ball is still moving.
   */
  show(bx: number, by: number, bz: number, dx: number, dz: number, power: number, path: number[], n: number, bounce: number, t: number, ready: boolean, pull: boolean): void {
    this.root.visible = true;
    const o = this.o;
    // dots marching along the path
    const step = 1;
    let k = 0;
    const march = (t * 2.2) % 1;
    for (let i = 1; i < n && k < MAX_DOTS; i += step) {
      const i0 = i - 1;
      const f = march;
      const x = path[i0 * 3]! + (path[i * 3]! - path[i0 * 3]!) * f;
      const y = path[i0 * 3 + 1]! + (path[i * 3 + 1]! - path[i0 * 3 + 1]!) * f;
      const z = path[i0 * 3 + 2]! + (path[i * 3 + 2]! - path[i0 * 3 + 2]!) * f;
      const fade = 1 - i / Math.max(n, 2);
      const after = bounce > 0 && i > bounce;
      o.position.set(x, y - R_BALL + 0.06, z);
      o.rotation.set(0, 0, 0);
      const s = (after ? 0.7 : 1) * (0.65 + 0.5 * fade) * (ready ? 1 : 0.6);
      o.scale.set(s, s * 0.6, s);
      o.updateMatrix();
      this.dots.setMatrixAt(k, o.matrix);
      powerColor(power, this.c);
      if (after) this.c.lerp(new THREE.Color('#ffffff'), 0.5);
      this.dots.setColorAt(k, this.c);
      k++;
    }
    this.dots.count = k;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    // the end of the line
    if (n > 1) {
      const e = (n - 1) * 3;
      this.endMark.visible = true;
      this.endMark.position.set(path[e]!, path[e + 1]! - R_BALL + 0.05, path[e + 2]!);
      const pulse = 1 + Math.sin(t * 8) * 0.12;
      this.endMark.scale.setScalar(pulse * (0.8 + power * 0.6));
    } else this.endMark.visible = false;
    // the slingshot band, pulled back behind the ball
    this.band.visible = this.knob.visible = pull && power > 0.01;
    const back = 0.3 + power * 1.25;
    this.band.position.set(bx, by, bz);
    this.band.lookAt(bx - dx, by, bz - dz);
    this.band.scale.set(1 + power, 1 + power, back);
    this.knob.position.set(bx - dx * back, by, bz - dz * back);
    // the power ring
    this.ring.position.set(bx, by - R_BALL + 0.03, bz);
    this.ring.rotation.y = Math.atan2(-dx, -dz);
    const segs = Math.round(power * this.segs);
    this.ringGeo.setDrawRange(0, segs * 6);
    this.ring.visible = segs > 0;
  }

  hide(): void {
    this.root.visible = false;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.dots.dispose();
    for (const g of this.owned) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** Green (soft) to yellow to red (hard). */
export function powerColor(p: number, out: THREE.Color): THREE.Color {
  const h = (1 - Math.min(1, Math.max(0, p))) * 0.33;
  return out.setHSL(h, 0.95, 0.55);
}

// ---------------------------------------------------------------- the ball

export class BallView {
  root = new THREE.Group();
  ball: THREE.Mesh;
  private ghost: THREE.Mesh;
  private shadow: THREE.Mesh;
  private trail: THREE.InstancedMesh;
  private past: number[] = [];
  private owned: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private tex: THREE.Texture;
  private q = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private o = new THREE.Object3D();
  /** Squash and stretch after a knock. */
  squash = 0;
  scale = 1;

  constructor(kit: Kit, color: string) {
    this.tex = ballTexture(color);
    const geo = this.g(new THREE.SphereGeometry(R_BALL, 28, 18));
    this.ball = new THREE.Mesh(geo, this.m(new THREE.MeshStandardMaterial({ color: '#ffffff', map: this.tex, roughness: 0.28, metalness: 0.0 })));
    this.ball.castShadow = false;
    this.root.add(this.ball);
    this.ghost = new THREE.Mesh(geo, this.m(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false })));
    this.ghost.renderOrder = 10;
    this.root.add(this.ghost);
    const sh = this.g(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.shadow = new THREE.Mesh(sh, this.m(new THREE.MeshBasicMaterial({ map: kit.tex.blob, transparent: true, depthWrite: false, opacity: 0.9 })));
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    const tg = this.g(new THREE.SphereGeometry(R_BALL * 0.7, 8, 6));
    this.trail = new THREE.InstancedMesh(tg, this.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55), transparent: true, opacity: 0.45, depthWrite: false })), 14);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.root.add(this.trail);
  }
  private g<G extends THREE.BufferGeometry>(g: G): G {
    this.owned.push(g);
    return g;
  }
  private m<M extends THREE.Material>(m: M): M {
    this.mats.push(m);
    return m;
  }

  /** Place the ball, roll it by the distance moved, and lay its shadow on the ground. */
  set(x: number, y: number, z: number, vx: number, vz: number, dt: number, groundY: number, visible: boolean): void {
    this.root.visible = visible;
    const b = this.ball;
    const dx = x - b.position.x;
    const dz = z - b.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5 && d < 2) {
      this.axis.set(dz, 0, -dx).normalize();
      this.q.setFromAxisAngle(this.axis, d / R_BALL);
      b.quaternion.premultiply(this.q);
    }
    b.position.set(x, y, z);
    this.ghost.position.set(x, y, z);
    // a knock squashes it for a moment
    this.squash = Math.max(0, this.squash - dt * 5);
    const sq = Math.sin(this.squash * Math.PI) * 0.25 * this.squash;
    b.scale.set(this.scale * (1 + sq), this.scale * (1 - sq), this.scale * (1 + sq));
    this.ghost.scale.setScalar(this.scale);
    const h = Math.max(0, y - R_BALL - groundY);
    const s = (R_BALL * 2.6) / (1 + h * 0.6);
    this.shadow.position.set(x + h * 0.15, groundY + 0.012, z + h * 0.1);
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.9 - h * 0.35) * this.scale;
    // a little comet tail when it is fast
    const sp = Math.hypot(vx, vz);
    if (sp > 4 && visible) {
      this.past.unshift(x, y, z);
    } else if (this.past.length) this.past.splice(this.past.length - 3, 3);
    if (this.past.length > 14 * 3) this.past.length = 14 * 3;
    const n = this.past.length / 3;
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n;
      this.o.position.set(this.past[i * 3]!, this.past[i * 3 + 1]!, this.past[i * 3 + 2]!);
      this.o.scale.setScalar(k * 0.9);
      this.o.updateMatrix();
      this.trail.setMatrixAt(i, this.o.matrix);
    }
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;
  }

  clearTrail(): void {
    this.past.length = 0;
    this.trail.count = 0;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.trail.dispose();
    for (const g of this.owned) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}
