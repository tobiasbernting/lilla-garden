// Badhuset: a bath house in every village with a pool you can swim in.
// The inside is its own small map (an "area" keyed `bath:<village key>`), generated once.
import { addObject, emptyWorld, inBounds, objectAt, removeObject, tileIndex } from './map.ts';
import { BATHHOUSE } from './city.ts';
import { MAP_H, MAP_W, key } from './types.ts';
import type { WorldState } from './types.ts';

export const SWIM_SPEED_MUL = 0.6; // in the pool

/** The room inside the bath house (tiles). Everything outside it is dark. */
export const BATH_ROOM = { x: 20, y: 22, w: 24, h: 18 };
/** The pool inside the room. */
export const BATH_POOL = { x: BATH_ROOM.x + 4, y: BATH_ROOM.y + 3, w: 16, h: 9 };
/** The exit door tile (bottom wall, middle). */
export const BATH_EXIT = { x: BATH_ROOM.x + BATH_ROOM.w / 2, y: BATH_ROOM.y + BATH_ROOM.h - 1 };

export const bathKey = (villageKey: string): string => `bath:${villageKey}`;
export const isBathKey = (k: string | undefined): boolean => !!k && k.startsWith('bath:');
export const villageOfBath = (k: string): string => k.slice('bath:'.length);

/** Where the bath house stands in a village (top-left tile of its 3×2 footprint). */
export const bathhouseSpot = (): { x: number; y: number } => ({ x: BATHHOUSE.x, y: BATHHOUSE.y });

/** The tile in front of the bath house door (where you land when leaving). */
export const bathhouseDoorTile = (world: WorldState): { x: number; y: number } => {
  const b = Object.values(world.objects).find((o) => o.kind === 'bathhouse');
  const s = b ? { x: b.x, y: b.y } : bathhouseSpot();
  return { x: s.x + 1, y: s.y + 2 };
};

/** Adds the bath house to a village that does not have one yet. Returns true if something changed. */
export function ensureBathhouse(world: WorldState): boolean {
  if (world.biome !== 'by') return false;
  if (Object.values(world.objects).some((o) => o.kind === 'bathhouse')) return false;
  const s = bathhouseSpot();
  for (let dy = -1; dy <= 3; dy++)
    for (let dx = -1; dx <= 3; dx++) {
      const tx = s.x + dx;
      const ty = s.y + dy;
      if (!inBounds(tx, ty)) continue;
      const o = objectAt(world, tx, ty);
      if (o) removeObject(world, o.id);
      delete world.occupancy[key(tx, ty)];
      if (dy >= 2 && world.terrain[tileIndex(tx, ty)] !== 'path_stone') world.terrain[tileIndex(tx, ty)] = 'path_dirt';
    }
  addObject(world, 'bathhouse', s.x, s.y);
  return true;
}

/** Builds the inside of a bath house: a tiled room with a big pool, benches and an exit. */
export function generateBath(villageKey: string): WorldState {
  const world = emptyWorld();
  world.area = bathKey(villageKey);
  world.biome = 'bath';
  const T = world.terrain;
  T.fill('floor_stone');
  const R = BATH_ROOM;
  for (let y = R.y; y < R.y + R.h; y++)
    for (let x = R.x; x < R.x + R.w; x++) {
      const edge = x === R.x || y === R.y || x === R.x + R.w - 1 || y === R.y + R.h - 1;
      if (edge && !(x === BATH_EXIT.x && y === BATH_EXIT.y)) addObject(world, 'wall_stone', x, y);
    }
  const P = BATH_POOL;
  for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) T[tileIndex(x, y)] = 'pool';
  addObject(world, 'bath_exit', BATH_EXIT.x, BATH_EXIT.y);
  // benches along the top wall, a plant in each lower corner, lamps by the door
  for (const x of [R.x + 3, R.x + 9, R.x + 15]) addObject(world, 'bench', x, R.y + 1);
  addObject(world, 'plant', R.x + 1, R.y + R.h - 3);
  addObject(world, 'plant', R.x + R.w - 2, R.y + R.h - 3);
  addObject(world, 'lamp', BATH_EXIT.x - 2, R.y + R.h - 2);
  addObject(world, 'lamp', BATH_EXIT.x + 2, R.y + R.h - 2);
  return world;
}
