// Juice: soft particles (gravel dust, tyre smoke, grass, sparkles), skid marks on the road, and
// confetti for the finish.
import * as THREE from 'three';

const PART_VERT = /* glsl */ `
attribute float size;
attribute vec4 col;
uniform float uScale;
varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vCol = col;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // fade out what drifts right in front of the camera
  vCol.a *= smoothstep(1.5, 8.0, -mvPosition.z);
  gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const PART_FRAG = /* glsl */ `
varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = vCol.a * (1.0 - smoothstep(0.25, 1.0, d));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface Puff {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1: number;
  color: THREE.Color;
  alpha: number;
  drag?: number;
  gravity?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private n = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly rgb: Float32Array;
  private readonly a0: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly aPos: THREE.BufferAttribute;
  private readonly aCol: THREE.BufferAttribute;
  private readonly aSize: THREE.BufferAttribute;
  private readonly mat: THREE.ShaderMaterial;

  constructor(private cap: number) {
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.rgb = new Float32Array(cap * 3);
    this.a0 = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('col', this.aCol);
    geo.setAttribute('size', this.aSize);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 } }]),
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Pixels per metre at 1 m distance: viewport height / (2 tan(fov/2)). */
  setScale(heightPx: number, fovDeg: number): void {
    this.mat.uniforms.uScale!.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(p: Puff): void {
    let i = this.n;
    if (i >= this.cap) {
      // replace the oldest-looking one
      i = Math.floor(Math.random() * this.cap);
    } else this.n++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx ?? 0;
    this.vel[i * 3 + 1] = p.vy ?? 0;
    this.vel[i * 3 + 2] = p.vz ?? 0;
    this.life[i] = p.life;
    this.max[i] = p.life;
    this.s0[i] = p.size0;
    this.s1[i] = p.size1;
    this.rgb[i * 3] = p.color.r;
    this.rgb[i * 3 + 1] = p.color.g;
    this.rgb[i * 3 + 2] = p.color.b;
    this.a0[i] = p.alpha;
    this.drag[i] = p.drag ?? 1.5;
    this.grav[i] = p.gravity ?? 0;
  }

  update(dt: number): void {
    let w = 0;
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const S = this.aSize.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) continue;
      // keep: compact into slot w
      if (w !== i) {
        for (let k = 0; k < 3; k++) {
          this.pos[w * 3 + k] = this.pos[i * 3 + k]!;
          this.vel[w * 3 + k] = this.vel[i * 3 + k]!;
          this.rgb[w * 3 + k] = this.rgb[i * 3 + k]!;
        }
        this.life[w] = this.life[i]!;
        this.max[w] = this.max[i]!;
        this.s0[w] = this.s0[i]!;
        this.s1[w] = this.s1[i]!;
        this.a0[w] = this.a0[i]!;
        this.drag[w] = this.drag[i]!;
        this.grav[w] = this.grav[i]!;
      }
      const f = Math.exp(-this.drag[w]! * dt);
      this.vel[w * 3]! *= f;
      this.vel[w * 3 + 1] = this.vel[w * 3 + 1]! * f - this.grav[w]! * dt;
      this.vel[w * 3 + 2]! *= f;
      this.pos[w * 3]! += this.vel[w * 3]! * dt;
      this.pos[w * 3 + 1]! += this.vel[w * 3 + 1]! * dt;
      this.pos[w * 3 + 2]! += this.vel[w * 3 + 2]! * dt;
      const t = 1 - this.life[w]! / this.max[w]!;
      P[w * 3] = this.pos[w * 3]!;
      P[w * 3 + 1] = this.pos[w * 3 + 1]!;
      P[w * 3 + 2] = this.pos[w * 3 + 2]!;
      C[w * 4] = this.rgb[w * 3]!;
      C[w * 4 + 1] = this.rgb[w * 3 + 1]!;
      C[w * 4 + 2] = this.rgb[w * 3 + 2]!;
      // fade in quickly, out slowly
      C[w * 4 + 3] = this.a0[w]! * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      S[w] = this.s0[w]! + (this.s1[w]! - this.s0[w]!) * Math.sqrt(t);
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, w);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/** Dark tyre marks laid as quads on the road, in a ring buffer. */
export class Skids {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private head = 0;
  private readonly last = new Map<number, { lx: number; ly: number; lz: number; rx: number; ry: number; rz: number; age: number }>();
  private range = { lo: Infinity, hi: -Infinity };

  constructor(private cap: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(cap * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', this.col);
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) {
      idx[q * 6] = q * 4;
      idx[q * 6 + 1] = q * 4 + 1;
      idx[q * 6 + 2] = q * 4 + 2;
      idx[q * 6 + 3] = q * 4;
      idx[q * 6 + 4] = q * 4 + 2;
      idx[q * 6 + 5] = q * 4 + 3;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Lay a mark for wheel `id` up to (x, y, z), `w` wide across direction (ax, az). */
  mark(id: number, x: number, y: number, z: number, ax: number, az: number, w: number, color: THREE.Color, alpha: number): void {
    const hw = w / 2;
    const lx = x + az * hw;
    const lz = z - ax * hw;
    const rx = x - az * hw;
    const rz = z + ax * hw;
    const prev = this.last.get(id);
    if (prev && (prev.lx - lx) ** 2 + (prev.lz - lz) ** 2 < 0.09) return;
    if (prev && (prev.lx - lx) ** 2 + (prev.lz - lz) ** 2 < 9) {
      const q = this.head;
      this.head = (this.head + 1) % this.cap;
      const P = this.pos.array as Float32Array;
      const C = this.col.array as Float32Array;
      const v = [prev.lx, prev.ly, prev.lz, prev.rx, prev.ry, prev.rz, rx, y, rz, lx, y, lz];
      for (let k = 0; k < 12; k++) P[q * 12 + k] = v[k]!;
      for (let k = 0; k < 4; k++) {
        C[q * 16 + k * 4] = color.r;
        C[q * 16 + k * 4 + 1] = color.g;
        C[q * 16 + k * 4 + 2] = color.b;
        C[q * 16 + k * 4 + 3] = alpha;
      }
      this.range.lo = Math.min(this.range.lo, q);
      this.range.hi = Math.max(this.range.hi, q);
    }
    this.last.set(id, { lx, ly: y, lz, rx, ry: y, rz, age: 0 });
  }

  /** The wheel stopped marking: the next mark starts a new streak. */
  lift(id: number): void {
    this.last.delete(id);
  }

  flush(): void {
    if (this.range.hi < this.range.lo) return;
    this.pos.clearUpdateRanges();
    this.col.clearUpdateRanges();
    this.pos.addUpdateRange(this.range.lo * 12, (this.range.hi - this.range.lo + 1) * 12);
    this.col.addUpdateRange(this.range.lo * 16, (this.range.hi - this.range.lo + 1) * 16);
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.range = { lo: Infinity, hi: -Infinity };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Fluttering paper confetti. */
export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly life: Float32Array;
  private live = 0;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly vv = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3(0, 0, 0);

  constructor(private cap: number) {
    const geo = new THREE.PlaneGeometry(0.16, 0.24);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    const cols = ['#ff4d4d', '#ffd23f', '#3fbf5f', '#5fb7ff', '#ff4fd8', '#ffffff', '#ff9a2a'].map((c) => new THREE.Color(c));
    for (let i = 0; i < cap; i++) {
      this.mesh.setColorAt(i, cols[i % cols.length]!);
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.rot = new Float32Array(cap * 3);
    this.spin = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
  }

  burst(x: number, y: number, z: number, n: number, power = 9): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      const a = Math.random() * Math.PI * 2;
      const up = 0.5 + Math.random();
      this.p[i * 3] = x;
      this.p[i * 3 + 1] = y;
      this.p[i * 3 + 2] = z;
      this.v[i * 3] = Math.cos(a) * power * Math.random() * 0.7;
      this.v[i * 3 + 1] = up * power;
      this.v[i * 3 + 2] = Math.sin(a) * power * Math.random() * 0.7;
      for (let c = 0; c < 3; c++) {
        this.rot[i * 3 + c] = Math.random() * 6;
        this.spin[i * 3 + c] = (Math.random() - 0.5) * 14;
      }
      this.life[i] = 4 + Math.random() * 2;
    }
    this.live = this.cap;
  }

  update(dt: number, time: number): void {
    if (!this.live) return;
    let alive = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      const f = Math.exp(-2.2 * dt);
      this.v[i * 3]! *= f;
      this.v[i * 3 + 2]! *= f;
      this.v[i * 3 + 1] = Math.max(-2.2, this.v[i * 3 + 1]! * f - 9.8 * dt);
      this.p[i * 3]! += (this.v[i * 3]! + Math.sin(time * 3 + i) * 0.8) * dt;
      this.p[i * 3 + 1]! += this.v[i * 3 + 1]! * dt;
      this.p[i * 3 + 2]! += (this.v[i * 3 + 2]! + Math.cos(time * 2.6 + i) * 0.8) * dt;
      for (let c = 0; c < 3; c++) this.rot[i * 3 + c]! += this.spin[i * 3 + c]! * dt;
      const s = this.life[i]! > 0 ? Math.min(1, this.life[i]! * 2) : 0;
      this.m.compose(
        this.vv.set(this.p[i * 3]!, this.p[i * 3 + 1]!, this.p[i * 3 + 2]!),
        this.q.setFromEuler(this.e.set(this.rot[i * 3]!, this.rot[i * 3 + 1]!, this.rot[i * 3 + 2]!)),
        s > 0 ? this.one.set(s, s, s) : this.zero,
      );
      this.mesh.setMatrixAt(i, this.m);
      alive++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) this.live = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
