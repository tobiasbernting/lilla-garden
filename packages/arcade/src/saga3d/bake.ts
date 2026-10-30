// Bakes many small shapes into ONE vertex-coloured geometry (one draw call instead of hundreds). The dungeon's
// walls and decor and every monster's joints are built this way, so the "append a transformed, coloured copy and merge
// at the end" part lives here once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Baker {
  private parts: THREE.BufferGeometry[] = [];

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /**
   * Appends a copy of `src` moved by `matrix`, painted with `color` (multiplied into the source's own `color`
   * attribute when it has one). `shade` may lighten or darken each vertex by the y of its normal, for parts that no
   * light touches. Returns the copy, so a caller can give it extra attributes (every part must end up with the same ones).
   */
  add(src: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, shade?: (ny: number) => number): THREE.BufferGeometry {
    const g = src.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    const n = g.getAttribute('position').count;
    const normal = g.getAttribute('normal');
    const own = g.getAttribute('color');
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = shade && normal ? shade(normal.getY(i)) : 1;
      col[i * 3] = color.r * k * (own ? own.getX(i) : 1);
      col[i * 3 + 1] = color.g * k * (own ? own.getY(i) : 1);
      col[i * 3 + 2] = color.b * k * (own ? own.getZ(i) : 1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return g;
  }

  /** Merges everything added so far (null when nothing was) and forgets the parts. */
  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    // indexed and plain geometries cannot be merged together: make the odd ones plain
    const indexed = this.parts.filter((p) => p.index).length;
    if (indexed > 0 && indexed < this.parts.length) this.parts = this.parts.map((p) => (p.index ? p.toNonIndexed() : p));
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}
