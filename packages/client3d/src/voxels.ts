// The block world: a voxel grid built from the 2D map (terrain + block objects), Minecraft-style
// sky/block light, and chunk meshes with face culling and smooth ambient occlusion.
import * as THREE from 'three';
import { BATH_ROOM, EDGE_GAP, INTERIOR, MAP_H, MAP_W, type Season, type Terrain, type WorldState } from '@lilla-garden/shared';
import { AIR, BLOCK, BLOCKS, TEX, atlas, blockTile, tileUV, type BlockDef } from './blocks.ts';
import { FACE_SHADE, FACES, GeoBuilder, type FaceDef, type V3 } from './builder.ts';
import { makeMaterial } from './material.ts';
import { hash, objectLight, oakTree, spruceTree, stampObject, WALL_H, type StampCtx } from './structures.ts';

/** Tiles of scenery drawn around the 64×64 map. */
export const MARGIN = 20;
export const GW = MAP_W + MARGIN * 2;
export const GD = MAP_H + MARGIN * 2;
export const GH = 34;
/** Layer index of the first block above the ground surface; the surface is at world y = 0. */
export const GROUND = 10;
const CHUNK = 16;
const CX = Math.ceil(GW / CHUNK);
const CZ = Math.ceil(GD / CHUNK);

export type AreaKind = 'outdoor' | 'dungeon' | 'bath';

const N = GW * GH * GD;
const idx = (x: number, y: number, z: number) => (y * GD + z) * GW + x;

const AO_CURVE = [0.45, 0.65, 0.82, 1];

/** Block properties as flat lookup tables (the light passes touch every cell). */
let PROPS: { opaque: Uint8Array; emits: Uint8Array; leafy: Uint8Array; liquid: Uint8Array } | null = null;
function props(): NonNullable<typeof PROPS> {
  if (PROPS) return PROPS;
  const n = 256;
  PROPS = { opaque: new Uint8Array(n), emits: new Uint8Array(n), leafy: new Uint8Array(n), liquid: new Uint8Array(n) };
  BLOCKS.forEach((b, i) => {
    PROPS!.opaque[i] = b.opaque ? 1 : 0;
    PROPS!.emits[i] = b.light ?? 0;
    PROPS!.leafy[i] = b.cutout && !b.cullSelf ? 1 : 0;
    PROPS!.liquid[i] = b.liquid ? 1 : 0;
  });
  return PROPS;
}

const SURFACE: Record<Terrain, string> = {
  grass: 'grass',
  soil: 'farmland',
  soil_wet: 'farmland_wet',
  water: 'water',
  sand: 'sand',
  path_stone: 'cobble',
  path_dirt: 'path',
  floor_wood: 'planks_oak',
  floor_stone: 'stone_bricks',
  snow: 'snow',
  gravel: 'gravel',
  ice: 'ice',
  pool: 'water',
  road: 'asphalt',
  sidewalk: 'sidewalk',
  crossing: 'crossing',
  rail: 'rail',
};

export class Voxels {
  blocks = new Uint8Array(N);
  /** Object id owning each block (-1 none): turns a looked-at block into the object to act on. */
  owner = new Int32Array(N);
  sky = new Uint8Array(N);
  blk = new Uint8Array(N);
  private queue = new Int32Array(N * 2);
  private base = new Uint8Array(N);
  private baseKey = '';
  private prevBlocks = new Uint8Array(N);
  private prevSky = new Uint8Array(N);
  private prevBlk = new Uint8Array(N);
  private first = true;
  kind: AreaKind = 'outdoor';
  /** Chunks re-meshed by the last rebuild (their light may have changed). */
  lastDirty = new Set<number>();

  readonly group = new THREE.Group();
  private opaque = new Map<number, THREE.Mesh>();
  private water = new Map<number, THREE.Mesh>();
  readonly solidMat: THREE.ShaderMaterial;
  readonly waterMat: THREE.ShaderMaterial;
  readonly waterTex: THREE.Texture;

  constructor() {
    const { texture } = atlas();
    this.solidMat = makeMaterial(texture);
    // water gets its own repeating texture so it can flow
    const c = document.createElement('canvas');
    c.width = TEX;
    c.height = TEX * 2;
    const ctx = c.getContext('2d')!;
    const src = atlas().canvas;
    const [u0, , , v1] = tileUV('water');
    const sx = Math.round(u0 * src.width);
    const sy = Math.round((1 - v1) * src.height);
    ctx.drawImage(src, sx, sy, TEX, TEX, 0, 0, TEX, TEX);
    ctx.drawImage(src, sx, sy, TEX, TEX, 0, TEX, TEX, TEX);
    this.waterTex = new THREE.CanvasTexture(c);
    this.waterTex.magFilter = THREE.NearestFilter;
    this.waterTex.minFilter = THREE.NearestFilter;
    this.waterTex.generateMipmaps = false;
    this.waterTex.wrapS = THREE.RepeatWrapping;
    this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.repeat.set(1, 0.5);
    this.waterMat = makeMaterial(this.waterTex, { transparent: true, alpha: 0.72, cutout: false, side: THREE.DoubleSide });
    this.waterMat.uniforms.map!.value = this.waterTex;
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || x >= GW || z >= GD || y < 0) return this.kind === 'outdoor' ? BLOCK.stone! : BLOCK.stone_dark!;
    if (y >= GH) return AIR;
    return this.blocks[idx(x, y, z)]!;
  }

  /** Block at a world position (tile x, world y, tile z). */
  blockAtWorld(wx: number, wy: number, wz: number): number {
    return this.get(Math.floor(wx) + MARGIN, Math.floor(wy) + GROUND, Math.floor(wz) + MARGIN);
  }

  ownerAtWorld(wx: number, wy: number, wz: number): number {
    const x = Math.floor(wx) + MARGIN;
    const y = Math.floor(wy) + GROUND;
    const z = Math.floor(wz) + MARGIN;
    if (x < 0 || z < 0 || y < 0 || x >= GW || z >= GD || y >= GH) return -1;
    return this.owner[idx(x, y, z)]!;
  }

  /** Sky and block light (0..1) at a world position. */
  lightAtWorld(wx: number, wy: number, wz: number): [number, number] {
    const x = Math.floor(wx) + MARGIN;
    const y = Math.floor(wy) + GROUND;
    const z = Math.floor(wz) + MARGIN;
    if (x < 0 || z < 0 || y < 0 || x >= GW || z >= GD) return [this.kind === 'outdoor' ? 1 : 0, 0];
    if (y >= GH) return [this.kind === 'outdoor' ? 1 : 0, 0];
    const i = idx(x, y, z);
    return [this.sky[i]! / 15, this.blk[i]! / 15];
  }

  /** Height (world y) of the walkable surface at a tile: ground, or the top of water. */
  surfaceAt(tx: number, tz: number): number {
    const x = tx + MARGIN;
    const z = tz + MARGIN;
    const b = this.get(x, GROUND - 1, z);
    const d = BLOCKS[b];
    if (d?.liquid) return -0.35;
    return d?.topInset ? -d.topInset / TEX : 0;
  }

  // ------------------------------------------------------------------------ building the grid

  /**
   * Rebuilds the grid from the world and re-meshes the chunks that changed. The terrain and scenery
   * layer is cached; pass `terrain` when the ground itself changed.
   */
  rebuild(world: WorldState, kind: AreaKind, season: Season, terrain = true): void {
    const baseKey = `${kind}|${season}|${world.area ?? ''}|${world.biome ?? ''}`;
    let ownerId = -1;
    const put = (tx: number, h: number, tz: number, b: number) => {
      const x = tx + MARGIN;
      const z = tz + MARGIN;
      const y = GROUND + h;
      if (x < 0 || z < 0 || x >= GW || z >= GD || y < 0 || y >= GH) return;
      const i = idx(x, y, z);
      // trees don't overwrite buildings or walls
      if (this.blocks[i] !== AIR && BLOCKS[b]?.cutout && !BLOCKS[b]?.cullSelf) return;
      this.blocks[i] = b;
      this.owner[i] = ownerId;
    };
    this.kind = kind;
    if (terrain || this.baseKey !== baseKey) {
      this.blocks.fill(AIR);
      this.stampTerrain(world, kind, season);
      this.stampRoofs(world, kind, put);
      if (kind === 'outdoor') this.stampScenery(world, season, put);
      this.base.set(this.blocks);
      this.baseKey = baseKey;
    } else this.blocks.set(this.base);
    this.owner.fill(-1);
    const emitters: { x: number; y: number; z: number; level: number }[] = [];
    const kindAt = (tx: number, ty: number): string | undefined => {
      const id = world.occupancy[`${tx},${ty}`];
      return id === undefined ? undefined : world.objects[id]?.kind;
    };
    const ctx: StampCtx = { season, biome: world.biome, kindAt };
    for (const o of Object.values(world.objects)) {
      ownerId = o.id;
      stampObject(put, o, ctx);
      const l = objectLight(o);
      if (l && l.level > 0) emitters.push({ x: o.x + l.dx + MARGIN, y: GROUND + l.h, z: o.y + l.dz + MARGIN, level: l.level });
    }
    this.computeLight(emitters);
    this.remesh();
  }

  private column(x: number, z: number, top: number, surface: number, under: number, deep = BLOCK.stone!): void {
    for (let y = 0; y <= top; y++) {
      const b = y === top ? surface : y >= top - 3 ? under : deep;
      this.blocks[idx(x, y, z)] = b;
    }
  }

  private stampTerrain(world: WorldState, kind: AreaKind, season: Season): void {
    const T = world.terrain;
    const snowy = season === 'jul' && kind === 'outdoor';
    const biome = world.biome;
    const ground = (t: Terrain): number => {
      let name = SURFACE[t] ?? 'grass';
      if (kind === 'dungeon' && t === 'floor_stone') name = 'stone';
      if (snowy && t === 'grass') name = 'snowy_grass';
      return BLOCK[name]!;
    };
    const underOf = (b: number): number => (b === BLOCK.sand ? BLOCK.sand! : b === BLOCK.stone || b === BLOCK.stone_bricks || b === BLOCK.cobble ? BLOCK.stone! : BLOCK.dirt!);
    const terrainAt = (tx: number, tz: number): Terrain => T[Math.min(MAP_H - 1, Math.max(0, tz)) * MAP_W + Math.min(MAP_W - 1, Math.max(0, tx))]!;
    const isWater = (tx: number, tz: number) => {
      const t = terrainAt(tx, tz);
      return t === 'water';
    };
    const roofH = 4;

    for (let z = 0; z < GD; z++)
      for (let x = 0; x < GW; x++) {
        const tx = x - MARGIN;
        const tz = z - MARGIN;
        const inside = tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H;
        const top = GROUND - 1;
        if (kind === 'dungeon') {
          const t = inside ? T[tz * MAP_W + tx]! : 'water';
          if (t === 'water') {
            // solid rock up to the ceiling
            for (let y = 0; y <= GROUND + roofH; y++) this.blocks[idx(x, y, z)] = hash(x, z, y) < 0.08 ? BLOCK.ore_coal! : BLOCK.stone_dark!;
          } else {
            this.column(x, z, top, ground(t), BLOCK.stone!);
            this.blocks[idx(x, GROUND + roofH, z)] = BLOCK.stone_dark!;
          }
          continue;
        }
        if (kind === 'bath') {
          const R = BATH_ROOM;
          const inRoom = tx >= R.x && tx < R.x + R.w && tz >= R.y && tz < R.y + R.h;
          if (!inRoom) {
            for (let y = 0; y <= GROUND + WALL_H; y++) this.blocks[idx(x, y, z)] = BLOCK.stone_bricks!;
            continue;
          }
          const t = T[tz * MAP_W + tx]!;
          if (t === 'pool') {
            this.column(x, z, top - 2, BLOCK.quartz!, BLOCK.quartz!);
            this.blocks[idx(x, top - 1, z)] = BLOCK.water!;
            this.blocks[idx(x, top, z)] = BLOCK.water!;
          } else this.column(x, z, top, BLOCK.quartz!, BLOCK.stone!);
          continue;
        }
        // outdoors
        if (inside) {
          const t = T[tz * MAP_W + tx]!;
          if (t === 'water' || t === 'pool') {
            const deep = isWater(tx - 1, tz) && isWater(tx + 1, tz) && isWater(tx, tz - 1) && isWater(tx, tz + 1);
            const bottom = deep ? top - 2 : top - 1;
            this.column(x, z, bottom, t === 'pool' ? BLOCK.quartz! : deep ? BLOCK.gravel! : BLOCK.sand!, BLOCK.dirt!);
            for (let y = bottom + 1; y <= top; y++) this.blocks[idx(x, y, z)] = BLOCK.water!;
          } else {
            const g = ground(t);
            this.column(x, z, top, g, underOf(g));
          }
          continue;
        }
        // scenery around the map: continue the nearest edge, rising into hills away from the openings
        const et = terrainAt(tx, tz);
        const d = Math.max(tx < 0 ? -tx : tx >= MAP_W ? tx - MAP_W + 1 : 0, tz < 0 ? -tz : tz >= MAP_H ? tz - MAP_H + 1 : 0);
        // the openings in the middle of each edge lead on to the next area: keep them flat
        const outX = tx < 0 || tx >= MAP_W;
        const outZ = tz < 0 || tz >= MAP_H;
        const corridor = (outX && !outZ && Math.abs(tz - MAP_H / 2) < EDGE_GAP) || (outZ && !outX && Math.abs(tx - MAP_W / 2) < EDGE_GAP);
        if (et === 'water' && !corridor) {
          // the sea (beach areas) runs out to the horizon
          this.column(x, z, top - 2, BLOCK.sand!, BLOCK.sand!);
          this.blocks[idx(x, top - 1, z)] = BLOCK.water!;
          this.blocks[idx(x, top, z)] = BLOCK.water!;
          continue;
        }
        let surfaceName = biome === 'is' ? 'snow' : biome === 'strand' || biome === 'oken' ? 'sand' : 'grass';
        if (snowy && surfaceName === 'grass') surfaceName = 'snowy_grass';
        if (corridor && (et === 'path_dirt' || et === 'path_stone' || et === 'road' || et === 'sidewalk' || et === 'rail' || et === 'gravel')) surfaceName = SURFACE[et];
        const surface = BLOCK[surfaceName]!;
        const noise = 0.55 + 0.45 * Math.sin(tx * 0.21 + Math.sin(tz * 0.17) * 2) * Math.cos(tz * 0.19 + Math.sin(tx * 0.13));
        const rise = corridor ? 0 : Math.max(0, Math.floor(Math.min(9, (d - 2) * 0.7) * noise + (hash(tx, tz) < 0.2 ? 1 : 0) * (d > 3 ? 1 : 0)));
        this.column(x, z, top + rise, surface, underOf(surface));
      }
  }

  /** Ceilings over rooms that live inside a map (the farmhouse inside, the bath house). */
  private stampRoofs(world: WorldState, kind: AreaKind, put: (tx: number, h: number, tz: number, b: number) => void): void {
    if (kind === 'outdoor' && !world.area) {
      const I = INTERIOR;
      for (let tz = I.y - 1; tz <= I.y + I.h; tz++)
        for (let tx = I.x - 1; tx <= I.x + I.w; tx++) {
          const skylight = tx > I.x && tx < I.x + I.w - 1 && tz > I.y && tz < I.y + I.h - 1 && (tx + tz) % 3 === 0;
          put(tx, WALL_H, tz, skylight ? BLOCK.glass! : BLOCK.planks_spruce!);
        }
    }
    if (kind === 'bath') {
      const R = BATH_ROOM;
      for (let tz = R.y; tz < R.y + R.h; tz++)
        for (let tx = R.x; tx < R.x + R.w; tx++) put(tx, WALL_H, tz, (tx - R.x) % 4 === 2 && (tz - R.y) % 4 === 2 ? BLOCK.glowstone! : BLOCK.quartz!);
    }
  }

  /** Trees on the hills around the map. */
  private stampScenery(world: WorldState, season: Season, put: (tx: number, h: number, tz: number, b: number) => void): void {
    const biome = world.biome;
    if (biome === 'strand' || biome === 'oken') return;
    for (let z = 0; z < GD; z++)
      for (let x = 0; x < GW; x++) {
        const tx = x - MARGIN;
        const tz = z - MARGIN;
        if (tx >= -2 && tz >= -2 && tx < MAP_W + 2 && tz < MAP_H + 2) continue;
        if (hash(tx, tz, 99) > 0.055) continue;
        // find the surface
        let y = GH - 1;
        while (y > 0 && this.blocks[idx(x, y, z)] === AIR) y--;
        const b = this.blocks[idx(x, y, z)];
        if (b !== BLOCK.grass && b !== BLOCK.snowy_grass && b !== BLOCK.snow) continue;
        const h = y - GROUND + 1;
        const shifted = (px: number, ph: number, pz: number, pb: number) => put(px, ph + h, pz, pb);
        const pine = biome === 'is' || biome === 'berg' || hash(tx, tz, 5) < 0.35;
        if (pine) spruceTree(shifted, tx, tz, season === 'jul' || biome === 'is' ? BLOCK.leaves_snowy! : BLOCK.leaves_spruce!, 3);
        else oakTree(shifted, tx, tz, BLOCK.leaves_oak!, 3);
      }
  }

  // ------------------------------------------------------------------------ light

  private computeLight(emitters: { x: number; y: number; z: number; level: number }[]): void {
    const B = this.blocks;
    const { opaque, emits, leafy, liquid } = props();
    const sky = this.sky;
    const blk = this.blk;
    sky.fill(0);
    blk.fill(0);
    const queue = this.queue;
    let tail = 0;
    const plane = GW * GD;
    if (this.kind === 'outdoor') {
      // direct sky: straight down until something opaque; leaves and water dim it and stop it
      for (let c = 0; c < plane; c++)
        for (let y = GH - 1; y >= 0; y--) {
          const i = y * plane + c;
          const b = B[i]!;
          if (opaque[b]) break;
          if (leafy[b] || liquid[b]) {
            sky[i] = leafy[b] ? 14 : 13;
            queue[tail++] = i;
            break;
          }
          sky[i] = 15;
        }
      // only lit cells next to a dark see-through neighbour need to spread
      for (let i = 0; i < N; i++) {
        if (sky[i] !== 15) continue;
        const x = i % GW;
        const z = Math.floor(i / GW) % GD;
        if (
          (x > 0 && sky[i - 1] === 0 && !opaque[B[i - 1]!]) ||
          (x < GW - 1 && sky[i + 1] === 0 && !opaque[B[i + 1]!]) ||
          (z > 0 && sky[i - GW] === 0 && !opaque[B[i - GW]!]) ||
          (z < GD - 1 && sky[i + GW] === 0 && !opaque[B[i + GW]!])
        )
          queue[tail++] = i;
      }
    }
    this.flood(sky, tail);
    tail = 0;
    for (const e of emitters) {
      if (e.x < 0 || e.z < 0 || e.x >= GW || e.z >= GD || e.y < 0 || e.y >= GH) continue;
      const i = idx(e.x, e.y, e.z);
      if (blk[i]! < e.level) {
        blk[i] = e.level;
        queue[tail++] = i;
      }
    }
    for (let i = 0; i < N; i++) {
      const l = emits[B[i]!]!;
      if (l && blk[i]! < l) {
        blk[i] = l;
        queue[tail++] = i;
      }
    }
    this.flood(blk, tail);
  }

  private flood(L: Uint8Array, tail: number): void {
    const B = this.blocks;
    const { opaque } = props();
    const queue = this.queue;
    const plane = GW * GD;
    let head = 0;
    while (head < tail) {
      const i = queue[head++]!;
      const l = L[i]! - 1;
      if (l <= 0) continue;
      const x = i % GW;
      const z = Math.floor(i / GW) % GD;
      const y = Math.floor(i / plane);
      // neighbours: -x, +x, -z, +z, -y, +y
      for (let k = 0; k < 6; k++) {
        let j: number;
        if (k === 0) {
          if (x === 0) continue;
          j = i - 1;
        } else if (k === 1) {
          if (x === GW - 1) continue;
          j = i + 1;
        } else if (k === 2) {
          if (z === 0) continue;
          j = i - GW;
        } else if (k === 3) {
          if (z === GD - 1) continue;
          j = i + GW;
        } else if (k === 4) {
          if (y === 0) continue;
          j = i - plane;
        } else {
          if (y === GH - 1) continue;
          j = i + plane;
        }
        if (L[j]! >= l || opaque[B[j]!]) continue;
        L[j] = l;
        queue[tail++] = j;
      }
    }
  }

  // ------------------------------------------------------------------------ meshing

  private remesh(): void {
    const dirty = new Set<number>();
    if (this.first) {
      for (let c = 0; c < CX * CZ; c++) dirty.add(c);
      this.first = false;
    } else {
      const B = this.blocks;
      const S = this.sky;
      const L = this.blk;
      const pb = this.prevBlocks;
      const ps = this.prevSky;
      const pl = this.prevBlk;
      for (let i = 0; i < N; i++) {
        if (B[i] === pb[i] && S[i] === ps[i] && L[i] === pl[i]) continue;
        const x = i % GW;
        const z = Math.floor(i / GW) % GD;
        // a change touches its own chunk and, at a border, the neighbour (AO and light sampling)
        for (const dx of [-1, 0, 1])
          for (const dz of [-1, 0, 1]) {
            const cx = Math.floor((x + dx) / CHUNK);
            const cz = Math.floor((z + dz) / CHUNK);
            if (cx >= 0 && cz >= 0 && cx < CX && cz < CZ) dirty.add(cz * CX + cx);
          }
      }
    }
    this.lastDirty = dirty;
    this.prevBlocks.set(this.blocks);
    this.prevSky.set(this.sky);
    this.prevBlk.set(this.blk);
    for (const c of dirty) this.meshChunk(c % CX, Math.floor(c / CX));
  }

  /** Forces every chunk to be rebuilt on the next `rebuild` (switching maps). */
  reset(): void {
    this.first = true;
    this.baseKey = '';
    for (const m of [...this.opaque.values(), ...this.water.values()]) {
      m.geometry.dispose();
      this.group.remove(m);
    }
    this.opaque.clear();
    this.water.clear();
  }

  private meshChunk(cx: number, cz: number): void {
    const solid = new GeoBuilder();
    const liquid = new GeoBuilder();
    const B = this.blocks;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(GW, x0 + CHUNK);
    const z1 = Math.min(GD, z0 + CHUNK);
    for (let y = 0; y < GH; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          const b = B[idx(x, y, z)]!;
          if (b === AIR) continue;
          const def = BLOCKS[b]!;
          for (const f of FACES) {
            const nb = this.get(x + f.n[0], y + f.n[1], z + f.n[2]);
            if (!this.faceVisible(def, b, nb, f)) continue;
            this.emitFace(def.liquid ? liquid : solid, def, x, y, z, f);
          }
        }
    const key = cz * CX + cx;
    this.swap(this.opaque, key, solid, this.solidMat);
    this.swap(this.water, key, liquid, this.waterMat, 1);
  }

  private swap(map: Map<number, THREE.Mesh>, key: number, b: GeoBuilder, mat: THREE.Material, order = 0): void {
    const old = map.get(key);
    if (old) {
      old.geometry.dispose();
      this.group.remove(old);
      map.delete(key);
    }
    if (b.empty) return;
    const mesh = new THREE.Mesh(b.build(), mat);
    mesh.position.set(-MARGIN, -GROUND, -MARGIN);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = order;
    mesh.userData.chunk = true;
    this.group.add(mesh);
    map.set(key, mesh);
  }

  private faceVisible(def: BlockDef, b: number, nb: number, f: FaceDef): boolean {
    if (nb === AIR) return true;
    const n = BLOCKS[nb]!;
    if (def.liquid) return !n.liquid && !n.opaque && f.name !== 'bottom';
    if (n.opaque) {
      // next to a lowered top (farmland, paths) the sliver of our side above it shows
      return !!n.topInset && !def.topInset && f.name !== 'top' && f.name !== 'bottom';
    }
    if (def.cullSelf && nb === b) return false;
    return true;
  }

  private occludes(x: number, y: number, z: number): number {
    return BLOCKS[this.get(x, y, z)]!.opaque ? 1 : 0;
  }

  private lightAt(x: number, y: number, z: number): [number, number] | null {
    if (x < 0 || z < 0 || x >= GW || z >= GD || y < 0) return null;
    if (y >= GH) return [this.kind === 'outdoor' ? 15 : 0, 0];
    const i = idx(x, y, z);
    if (BLOCKS[this.blocks[i]!]!.opaque) return null;
    return [this.sky[i]!, this.blk[i]!];
  }

  private emitFace(g: GeoBuilder, def: BlockDef, x: number, y: number, z: number, f: FaceDef): void {
    const tile = blockTile(def, f.name);
    let [U0, V0, U1, V1] = tileUV(tile);
    const fx = x + f.n[0];
    const fy = y + f.n[1];
    const fz = z + f.n[2];
    const shade = FACE_SHADE[f.name];
    // lowered tops: farmland/paths 15/16, water 14/16 unless more water sits above
    let topDrop = def.topInset ? def.topInset / TEX : 0;
    if (def.liquid && !BLOCKS[this.get(x, y + 1, z)]!.liquid) topDrop = 2 / TEX;
    if (topDrop && f.name !== 'top' && f.name !== 'bottom') {
      // crop the texture's top rows to match the shorter side
      V1 = V0 + (V1 - V0) * (1 - topDrop);
    }
    const pos: V3[] = [];
    const uv: [number, number][] = [];
    const col: [number, number, number][] = [];
    const light: [number, number][] = [];
    const ao: number[] = [];
    const base = this.lightAt(fx, fy, fz) ?? [this.sky[idx(x, y, z)] ?? 0, this.blk[idx(x, y, z)] ?? 0];
    for (let k = 0; k < 4; k++) {
      const c = f.corners[k]!;
      let py = y + c[1];
      if (c[1] === 1 && topDrop) py -= topDrop;
      pos.push([x + c[0], py, z + c[2]]);
      const t = f.uv[k]!;
      uv.push([U0 + (U1 - U0) * t[0], V0 + (V1 - V0) * t[1]]);
      // which way the corner leans along the face's two axes
      const s1 = c[0] * f.a1[0] + c[1] * f.a1[1] + c[2] * f.a1[2] ? 1 : -1;
      const s2 = c[0] * f.a2[0] + c[1] * f.a2[1] + c[2] * f.a2[2] ? 1 : -1;
      const ax = [f.a1[0] * s1, f.a1[1] * s1, f.a1[2] * s1];
      const bx = [f.a2[0] * s2, f.a2[1] * s2, f.a2[2] * s2];
      const side1 = this.occludes(fx + ax[0]!, fy + ax[1]!, fz + ax[2]!);
      const side2 = this.occludes(fx + bx[0]!, fy + bx[1]!, fz + bx[2]!);
      const corner = this.occludes(fx + ax[0]! + bx[0]!, fy + ax[1]! + bx[1]!, fz + ax[2]! + bx[2]!);
      const a = def.liquid ? 3 : side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
      ao.push(a);
      const v = AO_CURVE[a]! * shade;
      col.push([v, v, v]);
      // smooth light: average the see-through cells around the corner
      let sky = base[0];
      let blk = base[1];
      let n = 1;
      for (const s of [
        [ax[0]!, ax[1]!, ax[2]!],
        [bx[0]!, bx[1]!, bx[2]!],
        [ax[0]! + bx[0]!, ax[1]! + bx[1]!, ax[2]! + bx[2]!],
      ]) {
        const l = this.lightAt(fx + s[0]!, fy + s[1]!, fz + s[2]!);
        if (!l) continue;
        sky += l[0];
        blk += l[1];
        n++;
      }
      light.push([sky / n / 15, blk / n / 15]);
    }
    // flip the quad's diagonal so AO gradients don't crease
    const flip = ao[0]! + ao[2]! < ao[1]! + ao[3]!;
    g.quad(pos, uv, col, light, flip);
  }

  dispose(): void {
    this.reset();
  }
}

export { BLOCK };

/** Chunk index of a tile (shared by the block meshes and the model layer). */
export const chunkOf = (tx: number, tz: number): number => {
  const cx = Math.min(CX - 1, Math.max(0, Math.floor((tx + MARGIN) / CHUNK)));
  const cz = Math.min(CZ - 1, Math.max(0, Math.floor((tz + MARGIN) / CHUNK)));
  return cz * CX + cx;
};
