import { objectDef } from './data.ts';
import { mulberry32, randInt } from './rng.ts';
import type { Terrain, WorldObject, WorldState } from './types.ts';
import { MAP_H, MAP_W, key } from './types.ts';

export const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
export const tileIndex = (x: number, y: number): number => y * MAP_W + x;

/** The spot new characters appear at (tile coords). */
export const SPAWN = { x: 15, y: 11 };

/** Add an object to the world, registering its footprint. Returns null if blocked. */
export function addObject(
  world: WorldState,
  kind: string,
  x: number,
  y: number,
  extra: Partial<WorldObject> = {},
): WorldObject | null {
  const def = objectDef(kind);
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) return null;
      if (world.occupancy[key(tx, ty)] !== undefined) return null;
      if (world.terrain[tileIndex(tx, ty)] === 'water') return null;
      if (world.crops[key(tx, ty)]) return null;
    }
  const id = world.nextId++;
  const obj: WorldObject = { id, kind, x, y, ...extra };
  world.objects[id] = obj;
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) world.occupancy[key(x + dx, y + dy)] = id;
  return obj;
}

export function removeObject(world: WorldState, id: number): WorldObject | undefined {
  const obj = world.objects[id];
  if (!obj) return undefined;
  const def = objectDef(obj.kind);
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) delete world.occupancy[key(obj.x + dx, obj.y + dy)];
  delete world.objects[id];
  return obj;
}

export const objectAt = (world: WorldState, x: number, y: number): WorldObject | undefined => {
  const id = world.occupancy[key(x, y)];
  return id === undefined ? undefined : world.objects[id];
};

/** Rebuild occupancy from objects (after loading from DB). */
export function rebuildOccupancy(world: WorldState): void {
  world.occupancy = {};
  for (const obj of Object.values(world.objects)) {
    const def = objectDef(obj.kind);
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++) world.occupancy[key(obj.x + dx, obj.y + dy)] = obj.id;
  }
}

export function emptyWorld(): WorldState {
  return {
    day: 1,
    timeMs: 2 * 60 * 1000, // start mid-morning
    terrain: new Array<Terrain>(MAP_W * MAP_H).fill('grass'),
    crops: {},
    objects: {},
    occupancy: {},
    animals: {},
    drops: {},
    players: {},
    nextId: 1,
    seasonOverride: null,
  };
}

/** Builds the handmade farm map. Deterministic for a given seed. */
export function generateWorld(seed = 1337): WorldState {
  const world = emptyWorld();
  const rnd = mulberry32(seed);
  const T = world.terrain;
  const set = (x: number, y: number, t: Terrain) => {
    if (inBounds(x, y)) T[tileIndex(x, y)] = t;
  };

  // Pond (ellipse) with sand ring
  const pond = { cx: 44, cy: 40, rx: 6, ry: 4 };
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x + 0.5 - pond.cx - 0.5) / pond.rx;
      const dy = (y + 0.5 - pond.cy - 0.5) / pond.ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) set(x, y, 'water');
      else if (d <= 1.6) set(x, y, 'sand');
    }

  // Farmhouse and fixtures
  addObject(world, 'house', 8, 5);
  addObject(world, 'wardrobe', 7, 9);
  addObject(world, 'start_chest', 13, 7);
  addObject(world, 'start_bench', 13, 8);
  addObject(world, 'mailbox', 15, 6);
  addObject(world, 'sellbox', 15, 8);
  // Path from the door
  for (let y = 9; y <= 14; y++) set(10, y, 'path_dirt');
  for (let x = 10; x <= 16; x++) set(x, 11, 'path_dirt');
  for (let x = 6; x <= 14; x++) set(x, 9, 'path_stone');

  const isOpenArea = (x: number, y: number) => x >= 4 && x <= 40 && y >= 4 && y <= 46;
  const nearHouse = (x: number, y: number) => x >= 5 && x <= 18 && y >= 3 && y <= 14;

  // Forest border and patches
  const tryTree = (x: number, y: number, kind?: string) => {
    if (!inBounds(x, y) || nearHouse(x, y)) return;
    if (T[tileIndex(x, y)] !== 'grass') return;
    const k = kind ?? (rnd() < 0.3 ? 'tree_pine' : rnd() < 0.15 ? 'tree_apple' : 'tree');
    addObject(world, k, x, y);
  };
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      if (edge <= 1) tryTree(x, y);
      else if (edge <= 3 && rnd() < 0.6) tryTree(x, y);
      else if ((x >= 48 || y >= 50) && rnd() < 0.35) tryTree(x, y);
      else if (!isOpenArea(x, y) && rnd() < 0.08) tryTree(x, y);
    }

  // Rocks: a rocky patch to the right, plus scattered
  for (let i = 0; i < 70; i++) {
    const x = randInt(rnd, 46, 60);
    const y = randInt(rnd, 6, 34);
    if (T[tileIndex(x, y)] === 'grass' && !objectAt(world, x, y))
      addObject(world, rnd() < 0.5 ? 'rock' : 'rock_small', x, y);
  }
  for (let i = 0; i < 25; i++) {
    const x = randInt(rnd, 4, 60);
    const y = randInt(rnd, 4, 60);
    if (nearHouse(x, y)) continue;
    if (T[tileIndex(x, y)] === 'grass' && !objectAt(world, x, y)) addObject(world, 'rock_small', x, y);
  }

  // Grass tufts, flowers, bushes everywhere
  for (let y = 2; y < MAP_H - 2; y++)
    for (let x = 2; x < MAP_W - 2; x++) {
      if (T[tileIndex(x, y)] !== 'grass' || objectAt(world, x, y)) continue;
      if (nearHouse(x, y) && rnd() < 0.9) continue;
      const r = rnd();
      if (r < 0.07) addObject(world, 'grass_tuft', x, y, { variant: randInt(rnd, 0, 2) });
      else if (r < 0.1) addObject(world, 'flower', x, y, { variant: randInt(rnd, 0, 3) });
      else if (r < 0.115 && !isOpenArea(x, y)) addObject(world, 'bush', x, y);
    }

  return world;
}
