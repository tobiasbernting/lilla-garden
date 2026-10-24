// "Grottan": a procedurally generated cave with rooms, corridors, torches, monsters and a boss.
// It is a second WorldState (area 'dungeon') that reuses the farm's movement, actions and rendering.
import { ANIMALS } from './data.ts';
import { addObject, emptyWorld } from './map.ts';
import { mulberry32, randInt } from './rng.ts';
import { SPECIES_NAMES } from './sv.ts';
import type { AnimalState, Terrain, WorldState } from './types.ts';
import { MAP_H, MAP_W, TILE, key } from './types.ts';

export const DUNGEON_W = 48;
export const DUNGEON_H = 40;
export const MAX_HEARTS = 5;

/** Where the cave mouth sits on the farm (top-left of the 2x2 object) and where you stand after leaving. */
export const CAVE_POS = { x: 57, y: 12 };
export const CAVE_EXIT_TILE = { x: 58, y: 14 };

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Room, b: Room, pad = 1): boolean =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

/** Builds a fresh cave. `level` scales the number of monsters a little. */
export function generateDungeon(seed: number, level = 1): WorldState {
  const rnd = mulberry32(seed);
  const world = emptyWorld();
  world.area = 'dungeon';
  world.dungeonInfo = { seed, w: DUNGEON_W, h: DUNGEON_H, cleared: false, level, start: { x: 4, y: 4 }, bossRoom: { x: 0, y: 0, w: 1, h: 1 } };
  // The cave uses the top-left DUNGEON_W x DUNGEON_H of the 64x64 grid; everything else is rock.
  const T = world.terrain;
  const floor = new Set<string>();
  const carve = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= DUNGEON_W - 1 || y >= DUNGEON_H - 1) return;
    floor.add(key(x, y));
  };

  // Rooms
  const rooms: Room[] = [];
  let tries = 0;
  while (rooms.length < 7 && tries++ < 300) {
    const w = randInt(rnd, 5, 9);
    const h = randInt(rnd, 4, 7);
    const r: Room = { x: randInt(rnd, 2, DUNGEON_W - w - 3), y: randInt(rnd, 2, DUNGEON_H - h - 3), w, h };
    if (rooms.some((o) => overlaps(o, r, 2))) continue;
    rooms.push(r);
  }
  // Start room is the leftmost, boss room the one farthest from it
  rooms.sort((a, b) => a.x - b.x);
  const start = rooms[0]!;
  const center = (r: Room) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
  const sc = center(start);
  let boss = start;
  let bestD = -1;
  for (const r of rooms) {
    const c = center(r);
    const d = Math.abs(c.x - sc.x) + Math.abs(c.y - sc.y);
    if (d > bestD) {
      bestD = d;
      boss = r;
    }
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  // Corridors: connect each room to the next (sorted by x), L-shaped, 2 wide
  for (let i = 0; i + 1 < rooms.length; i++) {
    const a = center(rooms[i]!);
    const b = center(rooms[i + 1]!);
    const horizontalFirst = rnd() < 0.5;
    const dig = (x0: number, y0: number, x1: number, y1: number) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) carve(x, y), carve(x, y + 1);
    };
    if (horizontalFirst) {
      dig(a.x, a.y, b.x, a.y);
      dig(b.x, a.y, b.x, b.y);
    } else {
      dig(a.x, a.y, a.x, b.y);
      dig(a.x, b.y, b.x, b.y);
    }
  }

  // Terrain: floor_stone where carved, walls (objects) on rock tiles touching floor, 'water' elsewhere
  // so that nothing walks through solid rock. Walls are objects so they render as cave rock.
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      T[i] = floor.has(key(x, y)) ? ('floor_stone' as Terrain) : ('water' as Terrain);
    }
  for (let y = 0; y < DUNGEON_H; y++)
    for (let x = 0; x < DUNGEON_W; x++) {
      if (floor.has(key(x, y))) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (floor.has(key(x + dx, y + dy))) touch = true;
      if (touch) {
        T[y * MAP_W + x] = 'floor_stone';
        addObject(world, 'cave_wall', x, y);
      }
    }

  // Exit in the start room
  addObject(world, 'cave_exit', sc.x, sc.y);
  // Torches on room walls (top row), a few rocks, monsters
  for (const r of rooms) {
    const tx = r.x + randInt(rnd, 0, r.w - 1);
    if (addTorchAt(world, tx, r.y - 1)) void 0;
    if (r.w > 6) addTorchAt(world, r.x + r.w - 1 - randInt(rnd, 0, 1), r.y - 1);
    if (r === start) continue;
    const isBoss = r === boss;
    const n = isBoss ? 1 : randInt(rnd, 1, 2 + Math.min(2, level));
    for (let i = 0; i < n; i++) {
      const species = isBoss ? 'boss' : pick(rnd, ['slime', 'slime', 'bat', 'troll']);
      const x = randInt(rnd, r.x, r.x + r.w - 1);
      const y = randInt(rnd, r.y, r.y + r.h - 1);
      spawnMob(world, species, x, y);
    }
    if (rnd() < 0.5) {
      const x = randInt(rnd, r.x, r.x + r.w - 1);
      const y = randInt(rnd, r.y, r.y + r.h - 1);
      if (!Object.values(world.animals).some((a) => Math.floor(a.x / TILE) === x && Math.floor(a.y / TILE) === y)) addObject(world, 'cave_rock', x, y);
    }
  }
  // Where players appear
  world.players = {};
  world.dungeonInfo.start = { x: sc.x, y: sc.y + 1 };
  world.dungeonInfo.bossRoom = boss;
  return world;
}

const pick = <T>(rnd: () => number, arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;

function addTorchAt(world: WorldState, x: number, y: number): boolean {
  const id = world.occupancy[key(x, y)];
  if (id === undefined) return false;
  const o = world.objects[id];
  if (!o || o.kind !== 'cave_wall') return false;
  // replace the wall with a torch-wall: keep the wall, mark variant 1 (lit); light radius comes from a torch object next to it
  o.variant = 1;
  const below = key(x, y + 1);
  if (world.occupancy[below] === undefined && world.terrain[(y + 1) * MAP_W + x] === 'floor_stone') addObject(world, 'cave_torch', x, y + 1);
  return true;
}

export function spawnMob(world: WorldState, species: string, tx: number, ty: number): AnimalState {
  const def = ANIMALS[species]!;
  const a: AnimalState = {
    id: world.nextId++,
    species,
    name: SPECIES_NAMES[species] ?? species,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    facing: 'down',
    moving: false,
    hearts: 0,
    heartProgress: 0,
    fed: false,
    petted: false,
    brushed: false,
    hasProduct: false,
    named: true,
    age: 10,
    homeId: 0,
    waitMs: 500,
    hp: def.mob?.hp ?? 1,
    attackAt: 0,
  };
  world.animals[a.id] = a;
  return a;
}

export const dungeonStart = (d: WorldState): { x: number; y: number } => d.dungeonInfo?.start ?? { x: 4, y: 4 };
