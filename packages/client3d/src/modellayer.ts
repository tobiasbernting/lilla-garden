// Object models and crops, merged into one mesh per chunk (per texture) so the world stays a few draw calls.
import * as THREE from 'three';
import type { WorldState } from '@lilla-garden/shared';
import { atlas } from './blocks.ts';
import { GeoBuilder } from './builder.ts';
import { makeMaterial } from './material.ts';
import { buildCrop, buildModel, DYNAMIC, type ModelCtx } from './models.ts';
import { spriteAtlas } from './sprites.ts';
import { MODEL_LIGHT_AT, MODEL_TOO, VOXEL_KINDS } from './structures.ts';
import { chunkOf, type Voxels } from './voxels.ts';

export class ModelLayer {
  readonly group = new THREE.Group();
  readonly blockMat = makeMaterial(atlas().texture);
  readonly spriteMat = makeMaterial(spriteAtlas().texture, { side: THREE.DoubleSide });
  private meshes = new Map<number, THREE.Mesh[]>();

  clear(): void {
    for (const list of this.meshes.values())
      for (const m of list) {
        m.geometry.dispose();
        this.group.remove(m);
      }
    this.meshes.clear();
  }

  /** Rebuilds the given chunks (all when `chunks` is null). */
  rebuild(world: WorldState, vox: Voxels, ctx: ModelCtx, chunks: Set<number> | null): void {
    const byChunk = new Map<number, { objs: WorldState['objects'][number][]; crops: [string, WorldState['crops'][string]][] }>();
    const slot = (k: number) => {
      let s = byChunk.get(k);
      if (!s) byChunk.set(k, (s = { objs: [], crops: [] }));
      return s;
    };
    for (const o of Object.values(world.objects)) {
      if ((VOXEL_KINDS.has(o.kind) && !MODEL_TOO.has(o.kind)) || DYNAMIC.has(o.kind)) continue;
      const k = chunkOf(o.x, o.y);
      if (chunks && !chunks.has(k)) continue;
      slot(k).objs.push(o);
    }
    for (const [key, c] of Object.entries(world.crops)) {
      const [xs, ys] = key.split(',');
      const k = chunkOf(Number(xs), Number(ys));
      if (chunks && !chunks.has(k)) continue;
      slot(k).crops.push([key, c]);
    }
    const keys = chunks ?? new Set([...byChunk.keys(), ...this.meshes.keys()]);
    for (const k of keys) {
      for (const m of this.meshes.get(k) ?? []) {
        m.geometry.dispose();
        this.group.remove(m);
      }
      this.meshes.delete(k);
      const s = byChunk.get(k);
      if (!s) continue;
      const g = new GeoBuilder();
      const sg = new GeoBuilder();
      for (const o of s.objs) {
        const y = vox.surfaceAt(o.x, o.y);
        g.off = sg.off = [o.x, y, o.y];
        const [lx, ly, lz] = MODEL_LIGHT_AT[o.kind] ?? [0.5, 0.5, 0.5];
        g.boxLight = sg.boxLight = vox.lightAtWorld(o.x + lx, y + ly, o.y + lz);
        buildModel(o, ctx, g, sg);
      }
      for (const [key, c] of s.crops) {
        const [xs, ys] = key.split(',');
        const x = Number(xs);
        const z = Number(ys);
        const ground = vox.surfaceAt(x, z);
        sg.off = [x, ground + 1 / 16, z];
        sg.boxLight = vox.lightAtWorld(x + 0.5, ground + 0.5, z + 0.5);
        buildCrop(c, sg);
      }
      const list: THREE.Mesh[] = [];
      for (const [b, mat] of [
        [g, this.blockMat],
        [sg, this.spriteMat],
      ] as const) {
        if (b.empty) continue;
        const mesh = new THREE.Mesh(b.build(), mat);
        mesh.matrixAutoUpdate = false;
        mesh.userData.models = true;
        this.group.add(mesh);
        list.push(mesh);
      }
      this.meshes.set(k, list);
    }
  }
}
