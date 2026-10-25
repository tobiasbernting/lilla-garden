// Accumulates quads into a BufferGeometry (position, uv, colour = shade × AO × tint, light = sky/block).
import * as THREE from 'three';
import { TEX, tileUV } from './blocks.ts';

export type V3 = [number, number, number];
export type RGB = [number, number, number];

export type FaceName = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
export const FACE_SHADE: Record<FaceName, number> = { top: 1, bottom: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };

export class GeoBuilder {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  light: number[] = [];
  idx: number[] = [];
  /** Light used by `box` faces (sky, block 0..1). */
  boxLight: [number, number] = [1, 0];
  /** Added to every position (blocks): where the current model sits. */
  off: V3 = [0, 0, 0];

  get empty(): boolean {
    return this.idx.length === 0;
  }

  /** Four corners counter-clockwise seen from the front; uv per corner; flip picks the other diagonal. */
  quad(p: V3[], uv: [number, number][], col: RGB[], light: [number, number][], flip = false): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i]![0] + this.off[0], p[i]![1] + this.off[1], p[i]![2] + this.off[2]);
      this.uv.push(uv[i]![0], uv[i]![1]);
      this.col.push(col[i]![0], col[i]![1], col[i]![2]);
      this.light.push(light[i]![0], light[i]![1]);
    }
    if (flip) this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('light', new THREE.Float32BufferAttribute(this.light, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /**
   * An axis-aligned box in pixel units (16 px = one block), textured Minecraft style: every face samples
   * the part of its tile that matches its own size and position, split at block boundaries.
   * `tex` is a tile name, or one per face. `color` tints (white noise tile + colour = a painted box).
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: string | Partial<Record<FaceName, string>> & { all?: string }, color: RGB = [1, 1, 1], skip: Partial<Record<FaceName, boolean>> = {}): this {
    const t = (f: FaceName): string => (typeof tex === 'string' ? tex : (tex[f] ?? tex.all ?? 'white'));
    const s = 1 / TEX;
    const L = this.boxLight;
    const face = (f: FaceName, corner: (a: number, b: number) => V3, a0: number, a1: number, b0: number, b1: number, uOf: (a: number) => number, vOf: (b: number) => number) => {
      if (skip[f]) return;
      const shade = FACE_SHADE[f];
      const c: RGB = [color[0] * shade, color[1] * shade, color[2] * shade];
      // split into ≤16 px cells so the texture repeats like blocks do
      const cuts = (lo: number, hi: number) => {
        const out = [lo];
        for (let v = Math.floor(lo / TEX) * TEX + TEX; v < hi; v += TEX) out.push(v);
        out.push(hi);
        return out;
      };
      const as = cuts(Math.min(a0, a1), Math.max(a0, a1));
      const bs = cuts(Math.min(b0, b1), Math.max(b0, b1));
      for (let i = 0; i < as.length - 1; i++)
        for (let j = 0; j < bs.length - 1; j++) {
          const A0 = as[i]!;
          const A1 = as[i + 1]!;
          const B0 = bs[j]!;
          const B1 = bs[j + 1]!;
          // texel coordinates inside the tile (wrapped per 16 px cell)
          const ua = uOf(A0);
          const ub = uOf(A1);
          const va = vOf(B0);
          const vb = vOf(B1);
          const cellU = Math.floor(Math.min(ua, ub) / TEX) * TEX;
          const cellV = Math.floor(Math.min(va, vb) / TEX) * TEX;
          const u0 = Math.min(ua, ub) - cellU;
          const u1 = Math.max(ua, ub) - cellU;
          const v0 = Math.min(va, vb) - cellV;
          const v1 = Math.max(va, vb) - cellV;
          const [U0, V0, U1, V1] = tileUV(t(f), u0, TEX - v1, u1, TEX - v0);
          const uAt = (a: number) => (uOf(a) - cellU - u0) / (u1 - u0 || 1);
          const vAt = (b: number) => (vOf(b) - cellV - v0) / (v1 - v0 || 1);
          const pts: V3[] = [corner(A0, B0), corner(A1, B0), corner(A1, B1), corner(A0, B1)].map((p) => [p[0] * s, p[1] * s, p[2] * s]);
          const uvs: [number, number][] = [
            [A0, B0],
            [A1, B0],
            [A1, B1],
            [A0, B1],
          ].map(([a, b]) => [U0 + (U1 - U0) * uAt(a!), V0 + (V1 - V0) * vAt(b!)]);
          // winding must face outwards: check with the normal and swap if needed
          const n = faceNormal(f);
          const e1: V3 = [pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1], pts[1]![2] - pts[0]![2]];
          const e2: V3 = [pts[2]![0] - pts[0]![0], pts[2]![1] - pts[0]![1], pts[2]![2] - pts[0]![2]];
          const cr: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          const dot = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2];
          if (dot < 0) {
            pts.reverse();
            uvs.reverse();
          }
          this.quad(pts, uvs, [c, c, c, c], [L, L, L, L]);
        }
    };
    // (1024 keeps every texel coordinate positive for the per-cell wrapping above)
    // top/bottom: a = x, b = z; texture u = x, v = -z (north up)
    face('top', (a, b) => [a, y1, b], x0, x1, z0, z1, (a) => a, (b) => -b + 1024);
    face('bottom', (a, b) => [a, y0, b], x0, x1, z0, z1, (a) => a, (b) => b + 1024);
    // sides: b = y (v up)
    face('south', (a, b) => [a, b, z1], x0, x1, y0, y1, (a) => a + 1024, (b) => b + 1024);
    face('north', (a, b) => [a, b, z0], x0, x1, y0, y1, (a) => -a + 1024, (b) => b + 1024);
    face('east', (a, b) => [x1, b, a], z0, z1, y0, y1, (a) => -a + 1024, (b) => b + 1024);
    face('west', (a, b) => [x0, b, a], z0, z1, y0, y1, (a) => a + 1024, (b) => b + 1024);
    return this;
  }

  /** Two crossed vertical quads through the middle of a block (flowers, crops, tall grass). Pixel units. */
  cross(tex: string | { u0: number; v0: number; u1: number; v1: number }, w = 16, h = 16, cx = 8, cz = 8, y0 = 0, color: RGB = [1, 1, 1]): this {
    const s = 1 / TEX;
    const [U0, V0, U1, V1] = typeof tex === 'string' ? tileUV(tex) : [tex.u0, tex.v0, tex.u1, tex.v1];
    const L = this.boxLight;
    const r = (w / 2) * Math.SQRT1_2;
    const c = color;
    for (const [dx, dz] of [
      [r, r],
      [r, -r],
    ] as const) {
      const p: V3[] = [
        [(cx - dx) * s, y0 * s, (cz - dz) * s],
        [(cx + dx) * s, y0 * s, (cz + dz) * s],
        [(cx + dx) * s, (y0 + h) * s, (cz + dz) * s],
        [(cx - dx) * s, (y0 + h) * s, (cz - dz) * s],
      ];
      const uv: [number, number][] = [
        [U0, V0],
        [U1, V0],
        [U1, V1],
        [U0, V1],
      ];
      this.quad(p, uv, [c, c, c, c], [L, L, L, L]);
      // back side
      this.quad([p[1]!, p[0]!, p[3]!, p[2]!], [uv[1]!, uv[0]!, uv[3]!, uv[2]!], [c, c, c, c], [L, L, L, L]);
    }
    return this;
  }

  /** A flat upright double-sided panel (a picture standing in the world). Pixel units, facing +z. */
  panel(tex: { u0: number; v0: number; u1: number; v1: number }, x0: number, y0: number, x1: number, y1: number, z: number, color: RGB = [1, 1, 1]): this {
    const s = 1 / TEX;
    const L = this.boxLight;
    const c = color;
    const p: V3[] = [
      [x0 * s, y0 * s, z * s],
      [x1 * s, y0 * s, z * s],
      [x1 * s, y1 * s, z * s],
      [x0 * s, y1 * s, z * s],
    ];
    const uv: [number, number][] = [
      [tex.u0, tex.v0],
      [tex.u1, tex.v0],
      [tex.u1, tex.v1],
      [tex.u0, tex.v1],
    ];
    this.quad(p, uv, [c, c, c, c], [L, L, L, L]);
    this.quad([p[1]!, p[0]!, p[3]!, p[2]!], [uv[1]!, uv[0]!, uv[3]!, uv[2]!], [c, c, c, c], [L, L, L, L]);
    return this;
  }
}

export interface FaceDef {
  name: FaceName;
  n: V3;
  corners: V3[];
  uv: [number, number][];
  /** Tangent axes (unit offsets) used for AO sampling. */
  a1: V3;
  a2: V3;
}

export const FACES: FaceDef[] = [
  { name: 'top', n: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 1], [0, 0], [1, 0], [1, 1]], a1: [1, 0, 0], a2: [0, 0, 1] },
  { name: 'bottom', n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], a1: [1, 0, 0], a2: [0, 0, 1] },
  { name: 'north', n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], a1: [1, 0, 0], a2: [0, 1, 0] },
  { name: 'south', n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], a1: [1, 0, 0], a2: [0, 1, 0] },
  { name: 'east', n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], a1: [0, 0, 1], a2: [0, 1, 0] },
  { name: 'west', n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], a1: [0, 0, 1], a2: [0, 1, 0] },
];

export const faceNormal = (f: FaceName): V3 =>
  f === 'top' ? [0, 1, 0] : f === 'bottom' ? [0, -1, 0] : f === 'north' ? [0, 0, -1] : f === 'south' ? [0, 0, 1] : f === 'east' ? [1, 0, 0] : [-1, 0, 0];

/** Hex colour → RGB 0..1. */
export const rgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
