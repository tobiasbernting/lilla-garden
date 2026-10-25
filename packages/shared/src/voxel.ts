// The block world of v2 (the 3D game): heights, digging and building on top of the 2D tile world.
//
// Every outdoor map keeps its tile rules (terrain, objects, crops, animals) and gains a column of blocks
// per tile. `voxel.heights` is fixed at generation; `voxel.edits` holds every block a player dug or
// placed. Everything else is derived, so a map costs 4 KB plus its edits. The top block of a column
// is described by the tile's terrain (grass, farmland, path…), which keeps farming working on hills.
// Enabled per server with WORLD_MODE=voxel; worlds without `voxel` behave exactly as before.
import { MAP_H, MAP_W, TILE, key, type Facing, type Terrain, type WorldState } from './types.ts';
import { inBounds, tileIndex } from './map.ts';

/** Layers in a column; layer `h` spans heights h..h+1 (in blocks). */
export const VH = 48;
/** Height of flat ground: the first empty layer. A player standing on flat ground has z = BASE. */
export const BASE = 16;
export const PLAYER_HEIGHT = 1.8;
/** Half width of the player's body in blocks (Minecraft's 0.3). */
export const BODY_R = 0.3;
export const EYE_HEIGHT = 1.62;
/** How far away (blocks, from the eyes) you can dig or place. */
export const DIG_REACH = 5;

export const VOXEL_BLOCKS = [
  'air',
  'surface', // the generated top block: whatever the tile's terrain says
  'dirt',
  'stone',
  'bedrock',
  'coal_ore',
  'gold_ore',
  'crystal_ore',
  'sand',
  'gravel',
  'cobble',
  'planks',
  'snow',
] as const;
export type VoxelBlock = (typeof VOXEL_BLOCKS)[number];
export const VB = Object.fromEntries(VOXEL_BLOCKS.map((n, i) => [n, i])) as Record<VoxelBlock, number>;

let enabled = false;
/** Turns on block worlds for newly generated maps (the v2 server). */
export const setVoxelMode = (on: boolean): void => {
  enabled = on;
};
export const voxelMode = (): boolean => enabled;

// ---------------------------------------------------------------------------- noise

const hash3 = (x: number, y: number, z: number, seed: number): number => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Smooth value noise 0..1 on a 2D grid with cells of `scale` tiles. */
function noise2(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = hash3(x0, y0, 0, seed);
  const b = hash3(x0 + 1, y0, 0, seed);
  const c = hash3(x0, y0 + 1, 0, seed);
  const d = hash3(x0 + 1, y0 + 1, 0, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function noise3(x: number, y: number, z: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const tz = smooth(fz - z0);
  const v = (dx: number, dy: number, dz: number) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(v(0, 0, 0), v(1, 0, 0), tx), l(v(0, 1, 0), v(1, 1, 0), tx), ty), l(l(v(0, 0, 1), v(1, 0, 1), tx), l(v(0, 1, 1), v(1, 1, 1), tx), ty), tz);
}

// ---------------------------------------------------------------------------- generation

/** Objects that may sit on hills and mountains; anything else (buildings, fences, chests…) keeps flat ground. */
const NATURAL = new Set(['tree', 'tree_pine', 'tree_apple', 'palm', 'stump', 'rock', 'rock_small', 'grass_tuft', 'bush', 'flower', 'wild_flower_mid', 'mushroom', 'ore', 'cactus', 'shell', 'iceberry', 'wild_pumpkin', 'snowman_wild', 'beehive']);
const NATURAL_GROUND = new Set<Terrain>(['grass', 'snow', 'sand', 'gravel']);
/** How far (tiles) in from the map edge the mountains reach. */
const MOUNTAIN_BAND = 11;

/** Builds the block layer of a freshly generated outdoor map. */
export function initVoxel(world: WorldState, seed: number): void {
  const T = world.terrain;
  const keep = new Uint8Array(MAP_W * MAP_H);
  const mid = MAP_W / 2;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = tileIndex(x, y);
      const id = world.occupancy[key(x, y)];
      const o = id === undefined ? undefined : world.objects[id];
      // ground people built on, water, buildings, and the openings to the next map stay flat
      const gap = (Math.abs(x - mid) < 4 && (y < MOUNTAIN_BAND + 2 || y >= MAP_H - MOUNTAIN_BAND - 2)) || (Math.abs(y - mid) < 4 && (x < MOUNTAIN_BAND + 2 || x >= MAP_W - MOUNTAIN_BAND - 2));
      if (!NATURAL_GROUND.has(T[i]!) || (o && !NATURAL.has(o.kind)) || gap) keep[i] = 1;
    }
  // distance (Chebyshev, tiles) to the nearest flat tile
  const dist = new Float32Array(MAP_W * MAP_H).fill(99);
  for (let i = 0; i < keep.length; i++) if (keep[i]) dist[i] = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let n = 0; n < MAP_W * MAP_H; n++) {
      const i = pass === 0 ? n : MAP_W * MAP_H - 1 - n;
      const x = i % MAP_W;
      const y = Math.floor(i / MAP_W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!inBounds(x + dx, y + dy)) continue;
          dist[i] = Math.min(dist[i]!, dist[tileIndex(x + dx, y + dy)]! + 1);
        }
    }
  const rocky = world.biome === 'berg' ? 1.6 : world.biome === 'strand' || world.biome === 'oken' ? 0.35 : 1;
  const heights: number[] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = tileIndex(x, y);
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      const hills = 2.6 * noise2(x, y, 13, seed) + 1.2 * noise2(x, y, 6, seed + 7) - 1.2;
      const band = Math.max(0, Math.min(1, (MOUNTAIN_BAND - edge) / (MOUNTAIN_BAND - 2)));
      const peaks = 0.45 + 0.75 * noise2(x, y, 9, seed + 3);
      const mountains = Math.pow(band, 1.4) * 15 * peaks * rocky;
      const ease = Math.max(0, Math.min(1, (dist[i]! - 1) / 4));
      const h = Math.max(0, Math.round((Math.max(0, hills) + mountains) * ease));
      heights.push(T[i] === 'water' ? BASE : BASE + Math.min(h, VH - BASE - 12));
    }
  world.voxel = { heights, edits: {}, seed };
  // rocky peaks and snow caps
  for (let i = 0; i < heights.length; i++) {
    if (!NATURAL_GROUND.has(T[i]!) || keep[i]) continue;
    const id = world.occupancy[key(i % MAP_W, Math.floor(i / MAP_W))];
    if (id !== undefined) continue;
    const up = heights[i]! - BASE;
    if (up >= 12) T[i] = 'snow';
    else if (up >= 8 && hash3(i, 0, 1, seed) < 0.75) T[i] = 'stone';
  }
  topCache.delete(world);
}

/** v2 forests: no two trees side by side, so you can always walk between them, and mixed kinds. */
export function thinForest(world: WorldState, rnd: () => number): void {
  const trees = Object.values(world.objects).filter((o) => o.kind === 'tree' || o.kind === 'tree_pine' || o.kind === 'tree_apple' || o.kind === 'palm');
  // shuffle, then keep a tree only if no kept tree is next to it
  for (let i = trees.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [trees[i], trees[j]] = [trees[j]!, trees[i]!];
  }
  const kept = new Set<string>();
  for (const o of trees) {
    let crowded = rnd() < 0.25; // and some clearings
    for (let dy = -1; dy <= 1 && !crowded; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && kept.has(key(o.x + dx, o.y + dy))) crowded = true;
    if (crowded) {
      delete world.objects[o.id];
      delete world.occupancy[key(o.x, o.y)];
      continue;
    }
    kept.add(key(o.x, o.y));
    // the 3D client draws each variant as a different tree: oak, birch, dark oak, cherry / spruce, redwood
    if (o.kind === 'tree') o.variant = Math.floor(rnd() * 4);
    if (o.kind === 'tree_pine') o.variant = rnd() < 0.35 ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------- blocks

const topCache = new WeakMap<WorldState, Int16Array>();

/** The block at a cell, before the top block is interpreted (see cellBlock). */
export function blockAt(world: WorldState, x: number, y: number, h: number): number {
  if (h < 0) return VB.bedrock;
  if (h >= VH) return VB.air;
  const v = world.voxel;
  if (!v || !inBounds(x, y)) return h < BASE ? VB.stone : VB.air;
  const e = v.edits[`${x},${y},${h}`];
  if (e !== undefined) return e;
  const top = v.heights[tileIndex(x, y)]!;
  if (h >= top) return VB.air;
  if (h === top - 1) return VB.surface;
  if (h === 0) return VB.bedrock;
  const t = world.terrain[tileIndex(x, y)];
  const depth = top - 1 - h;
  // caves: cheese holes well below ground, never right under the surface
  if (depth > 4 && h > 2 && noise3(x, y, h, 6, v.seed + 11) > 0.79) return VB.air;
  if (depth <= 3 && top <= BASE + 7) return t === 'sand' || t === 'water' ? VB.sand : VB.dirt;
  const r = hash3(x, y, h, v.seed + 5);
  if (h < BASE - 9 && r < 0.006) return VB.crystal_ore;
  if (h < BASE - 4 && r < 0.016) return VB.gold_ore;
  if (r < 0.045) return VB.coal_ore;
  if (h < 4 && r > 0.6) return VB.bedrock;
  return VB.stone;
}

export const isSolidBlock = (b: number): boolean => b !== VB.air;

/** Height of the column: one above its highest solid block (what you stand on). */
export function columnTop(world: WorldState, x: number, y: number): number {
  const v = world.voxel;
  if (!v || !inBounds(x, y)) return BASE;
  let cache = topCache.get(world);
  if (!cache) {
    cache = new Int16Array(MAP_W * MAP_H).fill(-1);
    topCache.set(world, cache);
  }
  const i = tileIndex(x, y);
  if (cache[i]! >= 0) return cache[i]!;
  let h = VH - 1;
  while (h > 0 && blockAt(world, x, y, h) === VB.air) h--;
  cache[i] = h + 1;
  return h + 1;
}

/** Forget cached column tops (after edits arrive, or when the world is replaced). */
export function invalidateColumn(world: WorldState, x: number, y: number): void {
  const cache = topCache.get(world);
  if (cache && inBounds(x, y)) cache[tileIndex(x, y)] = -1;
}

const TERRAIN_BLOCK: Partial<Record<Terrain, VoxelBlock>> = {
  grass: 'dirt',
  soil: 'dirt',
  soil_wet: 'dirt',
  path_dirt: 'dirt',
  dirt: 'dirt',
  sand: 'sand',
  gravel: 'gravel',
  snow: 'snow',
  stone: 'stone',
  path_stone: 'cobble',
  floor_stone: 'cobble',
  floor_wood: 'planks',
};
/** What the top of a column is made of when it is dug (the terrain says how it looks). */
export const terrainBlock = (t: Terrain): VoxelBlock => TERRAIN_BLOCK[t] ?? 'stone';

const BLOCK_TERRAIN: Record<VoxelBlock, Terrain> = {
  air: 'grass',
  surface: 'grass',
  dirt: 'dirt',
  stone: 'stone',
  bedrock: 'stone',
  coal_ore: 'stone',
  gold_ore: 'stone',
  crystal_ore: 'stone',
  sand: 'sand',
  gravel: 'gravel',
  cobble: 'path_stone',
  planks: 'floor_wood',
  snow: 'snow',
};
/** The terrain a block gives a column when it ends up on top. */
export const blockTerrain = (b: number): Terrain => BLOCK_TERRAIN[VOXEL_BLOCKS[b] ?? 'stone'] ?? 'stone';

/** The real block at a cell: a buried generated top becomes dirt, the top block follows the terrain. */
export function cellBlock(world: WorldState, x: number, y: number, h: number): VoxelBlock {
  const b = blockAt(world, x, y, h);
  if (b !== VB.surface) return VOXEL_BLOCKS[b] ?? 'stone';
  if (h === columnTop(world, x, y) - 1) return terrainBlock(world.terrain[tileIndex(x, y)]!);
  return (world.voxel!.heights[tileIndex(x, y)]! > BASE + 7 ? 'stone' : 'dirt');
}

/** Sets a cell, keeping edits minimal. Returns whether the column's top changed. */
export function setBlock(world: WorldState, x: number, y: number, h: number, b: number): boolean {
  const v = world.voxel!;
  const before = columnTop(world, x, y);
  const k = `${x},${y},${h}`;
  delete v.edits[k];
  if (blockAt(world, x, y, h) !== b) v.edits[k] = b;
  invalidateColumn(world, x, y);
  return columnTop(world, x, y) !== before;
}

/** A column is too steep for animals and villagers to walk onto (a step of 2+ blocks to a neighbour). */
export function steepTile(world: WorldState, tx: number, ty: number): boolean {
  if (!world.voxel || !inBounds(tx, ty)) return false;
  const h = columnTop(world, tx, ty);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (!inBounds(tx + dx, ty + dy)) continue;
    if (Math.abs(columnTop(world, tx + dx, ty + dy) - h) >= 2) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------- movement

/** Is a body with its feet at height z free of blocks? Position in pixels like the 2D game. */
export function bodyFree(world: WorldState, px: number, py: number, z: number): boolean {
  const x = px / TILE;
  const y = py / TILE;
  const x0 = Math.floor(x - BODY_R);
  const x1 = Math.floor(x + BODY_R - 1e-6);
  const y0 = Math.floor(y - BODY_R);
  const y1 = Math.floor(y + BODY_R - 1e-6);
  const z0 = Math.floor(z + 1e-6);
  const z1 = Math.floor(z + PLAYER_HEIGHT - 1e-6);
  for (let h = z0; h <= z1; h++) for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blockAt(world, tx, ty, h) !== VB.air) return false;
  return true;
}

/** Where someone standing at a spot ends up: on top of the column (first free space from the top down). */
export function standHeight(world: WorldState, px: number, py: number): number {
  let z = columnTop(world, Math.floor(px / TILE), Math.floor(py / TILE));
  for (let i = 0; i < 8 && !bodyFree(world, px, py, z); i++) z++;
  return z;
}

export interface Fall {
  vz: number;
  onGround: boolean;
}

/**
 * One step of a player in a block world (client prediction and tests). Horizontal input is in the
 * 2D game's px/s like stepPlayer; `blocked2D` reports tile rules (water, objects…) at a position.
 * Walks up single steps by itself, so nobody gets stuck on a block's edge.
 */
export function stepBody(
  world: WorldState,
  p: { x: number; y: number; z?: number; facing: Facing; moving: boolean },
  fall: Fall,
  vx: number,
  vy: number,
  dtMs: number,
  jump: boolean,
  blocked2D: (px: number, py: number, z: number) => boolean,
): void {
  const dt = dtMs / 1000;
  let z = p.z ?? standHeight(world, p.x, p.y);
  if (!bodyFree(world, p.x, p.y, z)) z = standHeight(world, p.x, p.y);
  const ok = (x: number, y: number, zz: number) => x >= BODY_R * TILE && y >= BODY_R * TILE && x <= MAP_W * TILE - BODY_R * TILE && y <= MAP_H * TILE - BODY_R * TILE && bodyFree(world, x, y, zz) && !blocked2D(x, y, zz);
  const tryAxis = (nx: number, ny: number): boolean => {
    if (ok(nx, ny, z)) {
      p.x = nx;
      p.y = ny;
      return true;
    }
    // a single step up (or a slab of the same tile) when standing on something
    if (fall.onGround && ok(nx, ny, Math.floor(z + 1e-6) + 1) && bodyFree(world, p.x, p.y, Math.floor(z + 1e-6) + 1)) {
      z = Math.floor(z + 1e-6) + 1;
      p.x = nx;
      p.y = ny;
      return true;
    }
    return false;
  };
  const x0 = p.x;
  const y0 = p.y;
  if (vx) tryAxis(p.x + vx * dt, p.y);
  if (vy) tryAxis(p.x, p.y + vy * dt);
  p.moving = p.x !== x0 || p.y !== y0;
  if (vx || vy) p.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
  // gravity and jumping
  if (jump && fall.onGround) fall.vz = 8.4;
  fall.vz = Math.max(-40, fall.vz - 28 * dt);
  const nz = z + fall.vz * dt;
  if (bodyFree(world, p.x, p.y, nz)) {
    z = nz;
    fall.onGround = false;
  } else if (fall.vz < 0) {
    // land on the block below
    let landed = Math.floor(nz) + 1;
    while (landed < z && !bodyFree(world, p.x, p.y, landed)) landed++;
    z = Math.min(z, landed);
    fall.vz = 0;
    fall.onGround = true;
  } else fall.vz = 0; // bumped the head
  if (z < 0) z = standHeight(world, p.x, p.y);
  p.z = z;
}
