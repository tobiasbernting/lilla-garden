// Item icons extruded into one-pixel-thick 3D models, like items held or dropped in Minecraft.
import * as THREE from 'three';
import { atlas } from './blocks.ts';
import { GeoBuilder } from './builder.ts';
import { cloneMaterial, makeMaterial } from './material.ts';
import { spritePixels } from './sprites.ts';

const cache = new Map<string, THREE.BufferGeometry | null>();

/** Geometry of an item icon, 1 block wide, centred on x, standing on y = 0, thin along z. */
export function itemGeometry(item: string): THREE.BufferGeometry | null {
  if (cache.has(item)) return cache.get(item)!;
  const px = spritePixels(`icon:${item}`);
  if (!px) {
    cache.set(item, null);
    return null;
  }
  const { w, h, data } = px;
  const g = new GeoBuilder();
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3]! > 128;
  const s = 16 / Math.max(w, h); // scale to 16 px
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const i = (y * w + x) * 4;
      const c: [number, number, number] = [data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255];
      const X = (x - w / 2) * s;
      const Y = (h - 1 - y) * s;
      g.box(X, Y, -0.5, X + s, Y + s, 0.5, 'white', c, {
        west: solid(x - 1, y),
        east: solid(x + 1, y),
        top: solid(x, y - 1),
        bottom: solid(x, y + 1),
      });
    }
  const geo = g.build();
  cache.set(item, geo);
  return geo;
}

let proto: THREE.ShaderMaterial | null = null;
/** A per-mesh material for items (own light value). */
export function itemMaterial(): THREE.ShaderMaterial {
  if (!proto) proto = makeMaterial(atlas().texture, { actor: true });
  return cloneMaterial(proto);
}

/** A mesh for an item, scaled so it is `size` blocks wide. */
export function itemMesh(item: string, size: number, mat: THREE.ShaderMaterial): THREE.Mesh | null {
  const geo = itemGeometry(item);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  m.scale.setScalar(size);
  return m;
}
