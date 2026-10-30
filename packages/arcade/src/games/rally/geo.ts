// A little builder for low-poly models: primitives with a colour each, merged into one geometry with
// vertex colours, so a whole house or car is one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const col = new THREE.Color();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();

/** A transform: position, rotation (radians, XYZ) and scale. */
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(v3.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s3.set(sx, sy, sz));
}

export class Geo {
  private parts: THREE.BufferGeometry[] = [];

  /** Add any geometry in one colour (it is consumed). */
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    if (m) geo.applyMatrix4(m);
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const n = geo.getAttribute('position').count;
    col.set(color);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.parts.push(geo);
    return this;
  }

  /** Add a geometry that already has vertex colours (from another Geo), optionally transformed. */
  addColored(g: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    if (m) geo.applyMatrix4(m);
    this.parts.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, mat(x, y, z, rx, ry, rz));
  }

  /** A cylinder standing on y (radius top, radius bottom, height, sides), centred at x, y, z. */
  cyl(rt: number, rb: number, h: number, seg: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, mat(x, y, z, rx, ry, rz));
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, ry = 0): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, mat(x, y, z, 0, ry));
  }

  /** A lumpy ball (icosahedron), squashed by sx, sy, sz. */
  ball(r: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 0, ry = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, mat(x, y, z, 0, ry, 0, sx, sy, sz));
  }

  sphere(r: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6): this {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, mat(x, y, z, 0, 0, 0, sx, sy, sz));
  }

  /**
   * A prism from a side profile: points (z, y, halfWidth) going round the outline counter-clockwise
   * seen from +x; the shape is mirrored across x = 0 at each point's half width.
   */
  prism(pts: [number, number, number][], color: THREE.ColorRepresentation, m?: THREE.Matrix4): this {
    const pos: number[] = [];
    const contour = pts.map(([z, y]) => new THREE.Vector2(z, y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    let cz = 0;
    let cy = 0;
    for (const p of pts) {
      cz += p[0] / pts.length;
      cy += p[1] / pts.length;
    }
    const a3 = new THREE.Vector3();
    const b3 = new THREE.Vector3();
    const c3 = new THREE.Vector3();
    const n3 = new THREE.Vector3();
    /** Push a triangle, flipped if its normal does not point along `out`. */
    const tri = (a: number[], b: number[], c: number[], ox: number, oy: number, oz: number): void => {
      a3.fromArray(a);
      b3.fromArray(b);
      c3.fromArray(c);
      n3.subVectors(c3, b3).cross(a3.clone().sub(b3));
      if (n3.x * ox + n3.y * oy + n3.z * oz > 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (const t of tris) {
      const [a, b, c] = [t[0]!, t[1]!, t[2]!];
      const P = (k: number, sx: number): number[] => [sx * pts[k]![2], pts[k]![1], pts[k]![0]];
      tri(P(a, 1), P(b, 1), P(c, 1), 1, 0, 0);
      tri(P(a, -1), P(b, -1), P(c, -1), -1, 0, 0);
    }
    // the band round the outline, facing away from the middle of the profile
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const r = pts[(i + 1) % pts.length]!;
      const oz = (p[0] + r[0]) / 2 - cz;
      const oy = (p[1] + r[1]) / 2 - cy;
      const q0 = [p[2], p[1], p[0]];
      const q1 = [-p[2], p[1], p[0]];
      const q2 = [-r[2], r[1], r[0]];
      const q3 = [r[2], r[1], r[0]];
      tri(q0, q1, q2, 0, oy, oz);
      tri(q0, q2, q3, 0, oy, oz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.add(g, color, m);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /** Merge everything into one geometry (the parts are disposed). */
  build(): THREE.BufferGeometry {
    const g = this.parts.length === 1 ? this.parts[0]! : mergeGeometries(this.parts, false);
    if (g !== this.parts[0]) for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Multiply every vertex colour by a factor (darker or lighter variants). */
export function shade(g: THREE.BufferGeometry, f: number): THREE.BufferGeometry {
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.array.length; i++) (c.array as Float32Array)[i] = Math.min(1, (c.array as Float32Array)[i]! * f);
  c.needsUpdate = true;
  return g;
}

/** A canvas texture drawn by `draw` (sRGB colour). */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

/** A soft round spot (white, alpha falling off), for blob shadows and glows. */
export function blobTex(size = 64, inner = 0.15): THREE.CanvasTexture {
  return canvasTex(size, size, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * inner * 0.5, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}
