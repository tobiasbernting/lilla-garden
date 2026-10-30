// The ground: rolling hills to the horizon, flattened under the road, carved for the lake and the
// stream; crop fields draped over it, and water.
import * as THREE from 'three';
import { canvasTex } from './geo.ts';
import type { CourseDef } from './courses.ts';
import { forest, lakeDist, streamDist, streamLevel, type Field, type Layout } from './layout.ts';
import { Surf, type Track } from './track.ts';
import { clamp, fbm, lerp, noise2, rng, smooth } from './util.ts';

/** Grid coordinates: `cell` apart over [lo, hi], then growing steps out to `far` beyond. */
function axis(lo: number, hi: number, cell: number, far: number): Float32Array {
  const mid: number[] = [];
  const n = Math.ceil((hi - lo) / cell);
  for (let i = 0; i <= n; i++) mid.push(lo + i * cell);
  const left: number[] = [];
  let step = cell;
  let v = lo;
  while (v > lo - far) {
    step *= 1.2;
    v -= step;
    left.push(v);
  }
  const right: number[] = [];
  step = cell;
  v = mid[mid.length - 1]!;
  while (v < hi + far) {
    step *= 1.2;
    v += step;
    right.push(v);
  }
  return Float32Array.from([...left.reverse(), ...mid, ...right]);
}

/** Index i with a[i] <= v < a[i+1] (clamped). */
function locate(a: Float32Array, v: number): number {
  let lo = 0;
  let hi = a.length - 2;
  if (v <= a[0]!) return 0;
  if (v >= a[hi + 1]!) return hi;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (a[m]! <= v) lo = m;
    else hi = m - 1;
  }
  return lo;
}

const col = (hex: string): THREE.Color => new THREE.Color(hex);

export class Terrain {
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly nx: number;
  readonly nz: number;
  /** Heights as drawn, and as driven on (the drawn ground sits a hair under the road). */
  readonly hv: Float32Array;
  readonly hp: Float32Array;
  /** Distance to the road's centre line (capped). */
  readonly dRoad: Float32Array;
  readonly mesh: THREE.Mesh;
  private readonly cx: number;
  private readonly cz: number;
  private readonly ex: number;
  private readonly ez: number;
  readonly layout: Layout;

  constructor(
    private track: Track,
    quality: 'high' | 'low',
    course: CourseDef,
  ) {
    const L = (this.layout = course.layout);
    const WATER_Y = L.waterY;
    const cell = quality === 'high' ? 5.2 : 7;
    const m = 130;
    this.cx = (track.minX + track.maxX) / 2;
    this.cz = (track.minZ + track.maxZ) / 2;
    this.ex = (track.maxX - track.minX) / 2;
    this.ez = (track.maxZ - track.minZ) / 2;
    this.xs = axis(track.minX - m, track.maxX + m, cell, 3200);
    this.zs = axis(track.minZ - m, track.maxZ + m, cell, 3200);
    const nx = (this.nx = this.xs.length);
    const nz = (this.nz = this.zs.length);
    const N = nx * nz;
    this.hv = new Float32Array(N);
    this.hp = new Float32Array(N);
    this.dRoad = new Float32Array(N).fill(999);
    const yNear = new Float32Array(N);
    const sNear = new Float32Array(N);
    const iNear = new Int32Array(N).fill(-1);
    const side = new Int8Array(N);
    const sumW = new Float32Array(N);
    const sumY = new Float32Array(N);

    // ---- the road's reach: nearest point, its height, and a soft average for between the legs ----
    const R = 72;
    const t = track;
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const ax = t.px[i]!;
      const az = t.pz[i]!;
      const sx = t.px[j]! - ax;
      const sz = t.pz[j]! - az;
      const l2 = sx * sx + sz * sz || 1;
      const i0 = locate(this.xs, Math.min(ax, ax + sx) - R);
      const i1 = locate(this.xs, Math.max(ax, ax + sx) + R) + 1;
      const j0 = locate(this.zs, Math.min(az, az + sz) - R);
      const j1 = locate(this.zs, Math.max(az, az + sz) + R) + 1;
      for (let jj = j0; jj <= j1; jj++) {
        const z = this.zs[jj]!;
        for (let ii = i0; ii <= i1; ii++) {
          const x = this.xs[ii]!;
          const u = clamp(((x - ax) * sx + (z - az) * sz) / l2, 0, 1);
          const dx = x - ax - sx * u;
          const dz = z - az - sz * u;
          const d = Math.hypot(dx, dz);
          if (d > R) continue;
          const k = jj * nx + ii;
          const y = t.py[i]! + (t.py[j]! - t.py[i]!) * u;
          if (d < this.dRoad[k]!) {
            this.dRoad[k] = d;
            yNear[k] = y;
            sNear[k] = (i + u) * t.ds;
            iNear[k] = i;
            side[k] = dx * t.tz[i]! - dz * t.tx[i]! > 0 ? 1 : -1;
          }
          const q = d / 5;
          const w = 1 / (1 + q * q * q * q);
          sumW[k] = sumW[k]! + w;
          sumY[k] = sumY[k]! + w * y;
        }
      }
    }

    // ---- heights ----
    for (let jj = 0; jj < nz; jj++) {
      const z = this.zs[jj]!;
      for (let ii = 0; ii < nx; ii++) {
        const x = this.xs[ii]!;
        const k = jj * nx + ii;
        let h = this.natural(x, z);
        const d = this.dRoad[k]!;
        let low = 0;
        if (iNear[k]! >= 0) {
          const hw = t.hw[iNear[k]!]!;
          const yw = sumW[k]! > 0 ? sumY[k]! / sumW[k]! : yNear[k]!;
          const yr = lerp(yNear[k]!, yw, smooth(hw + 2, hw + 14, d));
          h = lerp(yr, h, smooth(hw + 5, hw + 62, d));
          low = 0.14 * (1 - smooth(hw + 0.5, hw + 4, d));
        }
        // the lake: a bowl with a gentle shore (a flat sheet when frozen; the sea's shore is measured in metres)
        const ld = lakeDist(x, z, L);
        if (L.lakeKind === 'sea') {
          const dm = (ld - 1) * L.lake!.rz;
          if (dm < 40) {
            const bed = WATER_Y - 0.5 - 2.8 * smooth(0, 60, -dm);
            h = Math.min(h, lerp(bed, Math.max(h, WATER_Y + 0.35), smooth(-6, 34, dm)));
          }
        } else if (L.lakeKind === 'ice') {
          if (ld < 1.3) h = Math.min(h, lerp(WATER_Y - 0.04, Math.max(h, WATER_Y + 0.3), smooth(0.97, 1.3, ld)));
        } else if (ld < 1.5) {
          const bed = WATER_Y - 0.5 - 2.8 * clamp(1 - ld * ld, 0, 1);
          h = Math.min(h, lerp(bed, Math.max(h, WATER_Y + 0.35), smooth(0.86, 1.45, ld)));
        }
        // the stream bed
        const sd = streamDist(x, z, L);
        if (sd.d < 14) {
          const lvl = streamLevel(sd.t, L);
          const bed = lvl - 1.1;
          h = Math.min(h, lerp(bed, Math.max(h, lvl + 0.3), smooth(2.6, 11, sd.d)));
        }
        this.hp[k] = h;
        this.hv[k] = h - low;
      }
    }

    // ---- the mesh with vertex colours ----
    const pos = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const c = new THREE.Color();
    const G = course.theme.ground;
    const grassA = col(G.grassA);
    const grassB = col(G.grassB);
    const grassDark = col(G.grassDark);
    const dry = col(G.dry);
    const floor = col(G.floor);
    const sand = col(G.sand);
    const mud = col(G.mud);
    const verge = col(G.verge);
    const mowA = col(G.mowA);
    const mowB = col(G.mowB);
    const farTint = col(G.farTint);
    const iceCol = col('#cfe2f0');
    for (let jj = 0; jj < nz; jj++) {
      const z = this.zs[jj]!;
      for (let ii = 0; ii < nx; ii++) {
        const x = this.xs[ii]!;
        const k = jj * nx + ii;
        pos[k * 3] = x;
        pos[k * 3 + 1] = this.hv[k]!;
        pos[k * 3 + 2] = z;
        c.copy(grassA).lerp(grassB, noise2(x / 38, z / 38));
        const n2 = fbm(x / 160 + 2, z / 160 - 3, 3);
        c.lerp(dry, smooth(0.12, 0.45, n2) * 0.55);
        c.lerp(grassDark, smooth(0.0, -0.35, n2) * 0.6);
        const fo = forest(x, z, L).d;
        c.lerp(floor, Math.min(1, fo * 1.1));
        const d = this.dRoad[k]!;
        const i = iNear[k]!;
        if (i >= 0) {
          const wall = side[k]! > 0 ? t.wallL[i]! : t.wallR[i]!;
          const inRun = 1 - smooth(wall - 0.5, wall + 1.5, d);
          if (inRun > 0) c.lerp(Math.floor(sNear[k]! / 7) % 2 ? mowA : mowB, inRun * 0.85);
          if (t.surf[i] !== Surf.Asphalt) c.lerp(verge, 1 - smooth(t.hw[i]! + 0.5, t.hw[i]! + 4, d));
          else c.lerp(verge, (1 - smooth(t.hw[i]! + 0.2, t.hw[i]! + 1.6, d)) * 0.7);
        }
        const ld = lakeDist(x, z, L);
        if (L.lakeKind === 'sea') {
          const dm = (ld - 1) * L.lake!.rz;
          c.lerp(sand, 1 - smooth(30, 70, dm));
          if (dm < 0) c.lerp(mud, 0.5);
        } else if (L.lakeKind === 'ice') {
          if (ld < 1.08) c.lerp(iceCol, 1 - smooth(0.98, 1.08, ld));
        } else {
          if (ld < 1.16) c.lerp(sand, smooth(0.86, 0.98, ld) * (1 - smooth(1.06, 1.16, ld)));
          if (ld < 0.95) c.lerp(mud, 0.8);
        }
        const sd = streamDist(x, z, L).d;
        if (sd < 9) c.lerp(mud, 1 - smooth(3, 9, sd));
        const r = Math.hypot(x - this.cx, z - this.cz);
        c.lerp(farTint, smooth(500, 1600, r) * 0.6);
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let jj = 0; jj < nz - 1; jj++)
      for (let ii = 0; ii < nx - 1; ii++) {
        const a = jj * nx + ii;
        const b = a + 1;
        const cc = a + nx;
        const dd = cc + 1;
        idx[o++] = a;
        idx[o++] = cc;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = cc;
        idx[o++] = dd;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = quality === 'high';
  }

  /** The lie of the land without the road (the course's layout decides). */
  natural(x: number, z: number): number {
    return this.layout.natural(x, z, this.cx, this.cz, this.ex, this.ez);
  }

  /** How far out (0 at the middle, 1 at the edge of the drivable country) a point is, for free roam. */
  edge(x: number, z: number): number {
    return Math.hypot((x - this.cx) / (this.ex + 140), (z - this.cz) / (this.ez + 140));
  }

  private bilinear(a: Float32Array, x: number, z: number): number {
    const i = locate(this.xs, x);
    const j = locate(this.zs, z);
    const fx = clamp((x - this.xs[i]!) / (this.xs[i + 1]! - this.xs[i]!), 0, 1);
    const fz = clamp((z - this.zs[j]!) / (this.zs[j + 1]! - this.zs[j]!), 0, 1);
    const k = j * this.nx + i;
    const h00 = a[k]!;
    const h10 = a[k + 1]!;
    const h01 = a[k + this.nx]!;
    const h11 = a[k + this.nx + 1]!;
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  /** The ground a car drives on (off the road). */
  height(x: number, z: number): number {
    return this.bilinear(this.hp, x, z);
  }

  /** The ground as drawn (for standing things on it). */
  visual(x: number, z: number): number {
    return this.bilinear(this.hv, x, z);
  }

  /** Distance to the road's centre line (999 when far). */
  roadDist(x: number, z: number): number {
    return this.bilinear(this.dRoad, x, z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---- crop fields: raised blocks with rows, draped over the ground ----

function fieldTexture(kind: Field['kind']): THREE.CanvasTexture {
  return canvasTex(
    128,
    128,
    (g, w, h) => {
      const r = rng(kind.length * 31 + 7);
      const pal: Record<Field['kind'], [string, string, string]> = {
        raps: ['#f3d623', '#e2c11c', '#fff27a'],
        vete: ['#dcb65a', '#c9a148', '#efd282'],
        gron: ['#86b94a', '#73a53e', '#9ccc5a'],
        plog: ['#7d5c3d', '#634630', '#8e6c4a'],
      };
      const [base, darker, light] = pal[kind];
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // rows along v
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = darker;
        g.fillRect(x, 0, kind === 'plog' ? 6 : 4, h);
      }
      for (let k = 0; k < 900; k++) {
        g.fillStyle = r() < 0.6 ? light : darker;
        g.globalAlpha = 0.6;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
      g.globalAlpha = 1;
    },
    true,
  );
}

const CROP_H: Record<Field['kind'], number> = { raps: 0.95, vete: 0.75, gron: 0.4, plog: 0.03 };

/** All the fields as one mesh per crop. */
export function buildFields(terrain: Terrain, quality: 'high' | 'low'): THREE.Mesh[] {
  const byKind = new Map<Field['kind'], { pos: number[]; uv: number[]; col: number[]; idx: number[] }>();
  for (const f of terrain.layout.fields) {
    const far = Math.hypot(f.x, f.z) > 520;
    const sp = far ? (quality === 'high' ? 10 : 16) : quality === 'high' ? 3.5 : 5;
    const nu = Math.max(2, Math.ceil(f.w / sp));
    const nv = Math.max(2, Math.ceil(f.d / sp));
    let b = byKind.get(f.kind);
    if (!b) byKind.set(f.kind, (b = { pos: [], uv: [], col: [], idx: [] }));
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    const ch = CROP_H[f.kind];
    const world = (u: number, v: number): [number, number] => [f.x + u * c - v * s, f.z + u * s + v * c];
    // top
    const base = b.pos.length / 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = -f.w / 2 + (f.w * i) / nu;
        const v = -f.d / 2 + (f.d * j) / nv;
        const [x, z] = world(u, v);
        b.pos.push(x, terrain.visual(x, z) + ch, z);
        b.uv.push(u / 8, v / 8);
        b.col.push(1, 1, 1);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        b.idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
      }
    // the sides, down to the ground (a little darker)
    if (ch > 0.1) {
      const ring: [number, number][] = [];
      for (let i = 0; i < nu; i++) ring.push([-f.w / 2 + (f.w * i) / nu, -f.d / 2]);
      for (let j = 0; j < nv; j++) ring.push([f.w / 2, -f.d / 2 + (f.d * j) / nv]);
      for (let i = nu; i > 0; i--) ring.push([-f.w / 2 + (f.w * i) / nu, f.d / 2]);
      for (let j = nv; j > 0; j--) ring.push([-f.w / 2, -f.d / 2 + (f.d * j) / nv]);
      for (let k = 0; k < ring.length; k++) {
        const [u0, v0] = ring[k]!;
        const [u1, v1] = ring[(k + 1) % ring.length]!;
        const [x0, z0] = world(u0, v0);
        const [x1, z1] = world(u1, v1);
        const g0 = terrain.visual(x0, z0);
        const g1 = terrain.visual(x1, z1);
        const o = b.pos.length / 3;
        b.pos.push(x0, g0 + ch, z0, x1, g1 + ch, z1, x1, g1 - 0.2, z1, x0, g0 - 0.2, z0);
        const len = Math.hypot(x1 - x0, z1 - z0) / 8;
        b.uv.push(0, 0, len, 0, len, 0.1, 0, 0.1);
        b.col.push(0.78, 0.78, 0.7, 0.78, 0.78, 0.7, 0.55, 0.55, 0.5, 0.55, 0.55, 0.5);
        b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2);
      }
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const [kind, b] of byKind) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.setIndex(b.idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: fieldTexture(kind), vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = quality === 'high';
    meshes.push(mesh);
  }
  return meshes;
}

// ---- water ----

function waterNormals(): THREE.CanvasTexture {
  const S = 128;
  const t = canvasTex(
    S,
    S,
    (g) => {
      const img = g.createImageData(S, S);
      const hgt = (x: number, y: number): number => {
        const a = (x / S) * Math.PI * 2;
        const b = (y / S) * Math.PI * 2;
        return Math.sin(a * 3 + Math.sin(b * 2) * 1.5) * 0.5 + Math.sin(b * 5 + a * 2) * 0.35 + Math.sin(a * 7 - b * 4) * 0.2 + Math.sin(b * 11 + a) * 0.1;
      };
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const dx = hgt(x + 1, y) - hgt(x - 1, y);
          const dy = hgt(x, y + 1) - hgt(x, y - 1);
          const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
          const o = (y * S + x) * 4;
          img.data[o] = (n.x * 0.5 + 0.5) * 255;
          img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
          img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
          img.data[o + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    true,
  );
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export interface Water {
  meshes: THREE.Mesh[];
  update(time: number): void;
  dispose(): void;
}

export function buildWater(envMap: THREE.Texture | null, L: Layout): Water {
  const WATER_Y = L.waterY;
  const LAKE = L.lake ?? { cx: 0, cz: -99999, rx: 1, rz: 1, rot: 0 };
  const STREAM = L.stream;
  const normals = waterNormals();
  normals.repeat.set(10, 10);
  const frozen = L.lakeKind === 'ice';
  const sea = L.lakeKind === 'sea';
  if (sea) normals.repeat.set(160, 60);
  const mat = new THREE.MeshStandardMaterial({
    color: frozen ? '#d4e6f2' : sea ? '#2f8db0' : '#3f7a93',
    roughness: 0.12,
    metalness: 0.0,
    normalMap: normals,
    normalScale: frozen ? new THREE.Vector2(0.06, 0.06) : new THREE.Vector2(0.35, 0.35),
    envMap,
    envMapIntensity: frozen ? 0.8 : 1.1,
    transparent: !frozen,
    opacity: frozen ? 1 : 0.9,
  });
  const lakeGeo = new THREE.CircleGeometry(1, sea ? 96 : 56);
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, mat);
  lake.scale.set(LAKE.rx * (sea ? 1.02 : frozen ? 1.03 : 1.22), 1, LAKE.rz * (sea ? 1.02 : frozen ? 1.03 : 1.22));
  lake.rotation.y = -LAKE.rot;
  lake.position.set(LAKE.cx, WATER_Y - (frozen ? 0.03 : 0), LAKE.cz);
  lake.visible = !!L.lake;
  // the stream: a ribbon along its course, stepping down to the lake
  const pts: THREE.Vector3[] = (STREAM ?? [
    [0, -99999],
    [1, -99999],
  ]).map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 120;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const tt = i / N;
    const p = curve.getPointAt(tt);
    const tan = curve.getTangentAt(tt);
    const lx = tan.z;
    const lz = -tan.x;
    const w = 3.6;
    const y = streamLevel(streamDist(p.x, p.z, L).t, L);
    pos.push(p.x + lx * w, y, p.z + lz * w, p.x - lx * w, y, p.z - lz * w);
    uv.push(0, tt * 60, 1, tt * 60);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sg.setIndex(idx);
  sg.computeVertexNormals();
  // the ribbon's normals may point down depending on winding: make sure they face up
  const nrm = sg.getAttribute('normal') as THREE.BufferAttribute;
  if (nrm.getY(0) < 0) {
    sg.setIndex(idx.map((_, i) => idx[i - (i % 3) + 2 - (i % 3)]!));
    sg.computeVertexNormals();
  }
  const streamMat = mat.clone();
  streamMat.normalMap = normals;
  const stream = new THREE.Mesh(sg, streamMat);
  stream.visible = !!STREAM;
  lake.renderOrder = frozen ? 0 : 2;
  stream.renderOrder = 2;
  return {
    meshes: [lake, stream],
    update: (time) => {
      normals.offset.set(time * 0.012, time * 0.007);
    },
    dispose: () => {
      lakeGeo.dispose();
      sg.dispose();
      mat.dispose();
      streamMat.dispose();
      normals.dispose();
    },
  };
}
