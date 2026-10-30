// Juice: snow chunks that bounce, soft puffs, golden sparkles, splats stuck to walls, and the carrots
// and hats that fly off a snowman when it goes poof.
import * as THREE from 'three';
import { heightAt } from './world.ts';
import { rand } from './util.ts';

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- chunks

interface Chunk {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  s: number;
  life: number;
  max: number;
  rest: boolean;
  color: number;
}

export class Chunks {
  readonly mesh: THREE.InstancedMesh;
  private list: Chunk[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sv = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(private max: number, shadows: boolean) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.count = 0;
    this.mesh.castShadow = shadows;
    this.mesh.frustumCulled = false;
    // instance colours so coal bits can be dark
    this.mesh.setColorAt(0, this.col.set(0xffffff));
  }

  burst(at: THREE.Vector3, n: number, size: number, speed: number, color = 0xf4f7ff, up = 1): void {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const dir = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.2) * up, rand(-1, 1)).normalize();
      this.list.push({
        p: at.clone().addScaledVector(dir, size * 1.5),
        v: dir.multiplyScalar(speed * rand(0.4, 1.1)),
        r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
        s: size * rand(0.5, 1.15),
        life: rand(1.6, 2.6),
        max: 2.6,
        rest: false,
        color,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    const out: Chunk[] = [];
    for (const c of this.list) {
      c.life -= dt;
      if (c.life <= 0) continue;
      out.push(c);
      if (!c.rest) {
        c.v.y -= 15 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        c.r.z += c.w.z * dt;
        const g = heightAt(c.p.x, c.p.z) + c.s * 0.6;
        if (c.p.y < g) {
          c.p.y = g;
          if (Math.abs(c.v.y) < 1.2) {
            c.rest = true;
          } else {
            c.v.y *= -0.32;
            c.v.x *= 0.55;
            c.v.z *= 0.55;
            c.w.multiplyScalar(0.5);
          }
        }
      }
      const k = Math.min(1, c.life / 0.5);
      this.sv.setScalar(c.s * k);
      this.q.setFromEuler(c.r);
      this.m.compose(c.p, this.q, this.sv);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.col.set(c.color));
      n++;
    }
    this.list = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.list = [];
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------- soft particles

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  drag: number;
  grav: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  c: THREE.Color;
}

export interface PuffOpts {
  n?: number;
  size?: [number, number];
  grow?: number;
  speed?: number;
  up?: number;
  life?: [number, number];
  color?: THREE.ColorRepresentation;
  alpha?: number;
  drag?: number;
  grav?: number;
  spread?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private list: Particle[] = [];
  private pos: Float32Array;
  private colA: Float32Array;
  private size: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  constructor(private max: number, additive: boolean, tex: THREE.Texture) {
    this.pos = new Float32Array(max * 3);
    this.colA = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uMap: { value: tex } },
      vertexShader: /* glsl */ `
        attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vC = aCol;
          gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 360.0);
        }`,
      fragmentShader: additive
        ? /* glsl */ `uniform sampler2D uMap; varying vec4 vC; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vC.a; gl_FragColor = vec4(vC.rgb * a, 1.0); }`
        : /* glsl */ `uniform sampler2D uMap; varying vec4 vC; void main(){ float a = texture2D(uMap, gl_PointCoord).a; a = smoothstep(0.0, 0.6, a) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 10;
  }

  get count(): number {
    return this.list.length;
  }

  /** Where the live particles are (for tests). */
  dump(): string {
    return this.list
      .slice(0, 12)
      .map((p) => `${p.p.x.toFixed(1)},${p.p.y.toFixed(1)},${p.p.z.toFixed(1)} s${p.s1.toFixed(1)}`)
      .join(' | ');
  }

  emit(at: THREE.Vector3, o: PuffOpts = {}): void {
    const n = o.n ?? 8;
    const col = new THREE.Color(o.color ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1) + (o.up ?? 0.3), rand(-1, 1)).normalize();
      const sp = (o.speed ?? 2) * rand(0.3, 1);
      const life = rand(...(o.life ?? [0.5, 0.9]));
      const s0 = rand(...(o.size ?? [0.4, 0.8]));
      this.list.push({
        p: at.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(o.spread ?? 0.1)),
        v: dir.multiplyScalar(sp),
        drag: o.drag ?? 2.5,
        grav: o.grav ?? 0,
        life,
        max: life,
        s0,
        s1: s0 * (o.grow ?? 2),
        a0: o.alpha ?? 0.9,
        c: col,
      });
    }
  }

  /** One particle with an exact velocity (trails, rising steam). */
  one(at: THREE.Vector3, v: THREE.Vector3, size: number, life: number, color: THREE.ColorRepresentation, alpha = 0.8, grow = 1.6, grav = 0, drag = 1): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: at.clone(), v: v.clone(), drag, grav, life, max: life, s0: size, s1: size * grow, a0: alpha, c: new THREE.Color(color) });
  }

  update(dt: number, scale: number): void {
    this.mat.uniforms.uScale!.value = scale;
    let n = 0;
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      out.push(p);
      p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.v.y -= p.grav * dt;
      p.p.addScaledVector(p.v, dt);
      const t = 1 - p.life / p.max;
      this.pos[n * 3] = p.p.x;
      this.pos[n * 3 + 1] = p.p.y;
      this.pos[n * 3 + 2] = p.p.z;
      this.colA[n * 4] = p.c.r;
      this.colA[n * 4 + 1] = p.c.g;
      this.colA[n * 4 + 2] = p.c.b;
      this.colA[n * 4 + 3] = p.a0 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      this.size[n] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      n++;
    }
    this.list = out;
    this.geo.setDrawRange(0, n);
    for (const name of ['position', 'aCol', 'aSize']) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.list = [];
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- splats on walls and snow

interface Splat {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
  life: number;
}

export class Splats {
  readonly mesh: THREE.InstancedMesh;
  private list: Splat[] = [];
  private m = new THREE.Matrix4();
  private sv = new THREE.Vector3();

  constructor(private max: number, tex: THREE.Texture) {
    const g = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(
      g,
      new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0xffffff, emissive: 0x2a2a40 }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  add(at: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    if (this.list.length >= this.max) this.list.shift();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand(0, Math.PI * 2)));
    this.list.push({ p: at.clone().addScaledVector(normal, 0.03), q, s: size * rand(0.85, 1.2), life: 6 });
  }

  update(dt: number): void {
    let n = 0;
    const out: Splat[] = [];
    for (const s of this.list) {
      s.life -= dt;
      if (s.life <= 0) continue;
      out.push(s);
      const grow = Math.min(1, (6 - s.life) / 0.08);
      const k = s.s * grow * Math.min(1, s.life / 1.2);
      this.sv.set(k, k, k);
      this.m.compose(s.p, s.q, this.sv);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.list = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.list = [];
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------- flying bits (carrots, hats, crowns)

interface Debris {
  o: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  life: number;
  r: number;
  landed: boolean;
}

export class DebrisSet {
  private list: Debris[] = [];
  /** Called when a piece first lands (for a little sound). */
  onLand: ((p: THREE.Vector3) => void) | null = null;

  constructor(private scene: THREE.Scene) {}

  /** Take an object out of its parent (keeping where it is) and let it fly. */
  launch(o: THREE.Object3D, v: THREE.Vector3, spin: number, radius: number, life = 3.2): void {
    this.scene.attach(o);
    this.list.push({ o, v: v.clone(), w: new THREE.Vector3(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin)), life, r: radius, landed: false });
  }

  update(dt: number): void {
    const out: Debris[] = [];
    for (const d of this.list) {
      d.life -= dt;
      if (d.life <= 0) {
        d.o.removeFromParent();
        continue;
      }
      out.push(d);
      d.v.y -= 16 * dt;
      d.o.position.addScaledVector(d.v, dt);
      d.o.rotation.x += d.w.x * dt;
      d.o.rotation.y += d.w.y * dt;
      d.o.rotation.z += d.w.z * dt;
      const g = heightAt(d.o.position.x, d.o.position.z) + d.r;
      if (d.o.position.y < g) {
        d.o.position.y = g;
        if (!d.landed && this.onLand) this.onLand(d.o.position);
        d.landed = true;
        d.v.y = Math.abs(d.v.y) > 2 ? -d.v.y * 0.35 : 0;
        d.v.x *= 0.5;
        d.v.z *= 0.5;
        d.w.multiplyScalar(0.4);
      }
      // sink into the snow at the end
      if (d.life < 0.6) d.o.scale.setScalar(Math.max(0.01, d.life / 0.6) * (d.o.userData.s0 ?? 1));
    }
    this.list = out;
  }

  clear(): void {
    for (const d of this.list) d.o.removeFromParent();
    this.list = [];
  }
}

export { UP };
