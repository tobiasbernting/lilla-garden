// Spelhallen: an arcade in every city, with a machine for each minigame, a prize counter and the
// family's score board. Like the bath house, the inside is its own small map (`arcade:<village key>`),
// rebuilt from this plan whenever it is needed. And the TV in the farmhouse, for playing at home.
import { ARCADE_GAMES, TV_GAMES, type ArcadeGame } from './arcade.ts';
import { BATH_EXIT, BATH_ROOM } from './bath.ts';
import { ARCADE_HALL } from './city.ts';
import { objectDef } from './data.ts';
import { INTERIOR, addObject, emptyWorld, inBounds, objectAt, removeObject, tileIndex } from './map.ts';
import { key, type WorldState } from './types.ts';

export const hallKey = (villageKey: string): string => `arcade:${villageKey}`;
export const isHallKey = (k: string | undefined): boolean => !!k && k.startsWith('arcade:');
export const villageOfHall = (k: string): string => k.slice('arcade:'.length);

/** Maps inside a building (the bath house, Spelhallen): one lit room, dark around it, no weather. */
export const isIndoorKey = (k: string | undefined): boolean => !!k && (k.startsWith('bath:') || k.startsWith('arcade:'));
/** The room of an indoor map (the same size in every building), and its door in the bottom wall. */
export const INDOOR_ROOM = BATH_ROOM;
export const INDOOR_EXIT = BATH_EXIT;

/** Where the machines stand (top row of the room), in ARCADE_GAMES order: three on each side of the score board. */
export const HALL_MACHINES: { x: number; y: number }[] = [
  { x: INDOOR_ROOM.x + 2, y: INDOOR_ROOM.y + 1 },
  { x: INDOOR_ROOM.x + 4, y: INDOOR_ROOM.y + 1 },
  { x: INDOOR_ROOM.x + 6, y: INDOOR_ROOM.y + 1 },
  { x: INDOOR_ROOM.x + INDOOR_ROOM.w - 7, y: INDOOR_ROOM.y + 1 },
  { x: INDOOR_ROOM.x + INDOOR_ROOM.w - 5, y: INDOOR_ROOM.y + 1 },
  { x: INDOOR_ROOM.x + INDOOR_ROOM.w - 3, y: INDOOR_ROOM.y + 1 },
];
export const HALL_BOARD = { x: INDOOR_ROOM.x + INDOOR_ROOM.w / 2 - 1, y: INDOOR_ROOM.y + 1 };
export const HALL_COUNTER = { x: INDOOR_ROOM.x + INDOOR_ROOM.w - 7, y: INDOOR_ROOM.y + 11 };

/** The tile in front of Spelhallen's door (where you land when leaving). */
export const hallDoorTile = (world: WorldState): { x: number; y: number } => {
  const b = Object.values(world.objects).find((o) => o.kind === 'arcade_hall');
  const s = b ? { x: b.x, y: b.y } : ARCADE_HALL;
  return { x: s.x + 1, y: s.y + 2 };
};

/** Adds Spelhallen to a city that does not have one yet. Returns true if something changed. */
export function ensureArcadeHall(world: WorldState): boolean {
  if (world.biome !== 'by') return false;
  if (Object.values(world.objects).some((o) => o.kind === 'arcade_hall')) return false;
  const s = ARCADE_HALL;
  for (let dy = -1; dy <= 3; dy++)
    for (let dx = -1; dx <= 3; dx++) {
      const tx = s.x + dx;
      const ty = s.y + dy;
      if (!inBounds(world, tx, ty)) continue;
      const o = objectAt(world, tx, ty);
      if (o) removeObject(world, o.id);
      delete world.occupancy[key(tx, ty)];
      if (dy >= 2 && dx >= 0 && dx <= 2) world.terrain[tileIndex(world, tx, ty)] = 'path_stone';
    }
  addObject(world, 'arcade_hall', s.x, s.y);
  return true;
}

/** Builds the inside of Spelhallen: carpet, neon, a machine per game, the score board and the prize counter. */
export function generateHall(villageKey: string): WorldState {
  const world = emptyWorld();
  world.area = hallKey(villageKey);
  world.biome = 'hall';
  const T = world.terrain;
  T.fill('floor_stone');
  const R = INDOOR_ROOM;
  for (let y = R.y; y < R.y + R.h; y++)
    for (let x = R.x; x < R.x + R.w; x++) {
      const edge = x === R.x || y === R.y || x === R.x + R.w - 1 || y === R.y + R.h - 1;
      if (edge) {
        if (!(x === INDOOR_EXIT.x && y === INDOOR_EXIT.y)) addObject(world, 'hall_wall', x, y);
      } else T[tileIndex(world, x, y)] = 'carpet';
    }
  addObject(world, 'hall_exit', INDOOR_EXIT.x, INDOOR_EXIT.y);
  ARCADE_GAMES.forEach((_, i) => addObject(world, 'arcade_machine', HALL_MACHINES[i]!.x, HALL_MACHINES[i]!.y, { variant: i }));
  addObject(world, 'score_board', HALL_BOARD.x, HALL_BOARD.y);
  addObject(world, 'neon_sign', HALL_BOARD.x - 2, HALL_BOARD.y, { variant: 0 });
  addObject(world, 'neon_sign', HALL_BOARD.x + 3, HALL_BOARD.y, { variant: 1 });
  // the prize counter, with prizes on show behind it
  const C = HALL_COUNTER;
  addObject(world, 'prize_counter', C.x, C.y);
  addObject(world, 'plush_cow', C.x, C.y - 1);
  addObject(world, 'trophy', C.x + 1, C.y - 1);
  addObject(world, 'plush_dragon', C.x + 2, C.y - 1);
  addObject(world, 'lava_lamp', C.x + 3, C.y - 1);
  // a disco ball in the middle, a corner to sit in, plants by the door
  addObject(world, 'disco_ball', R.x + R.w / 2, R.y + 8);
  addObject(world, 'bench', R.x + 2, R.y + 10);
  addObject(world, 'bench', R.x + 2, R.y + 12);
  addObject(world, 'plush_hen', R.x + 1, R.y + 14);
  addObject(world, 'plant', R.x + 1, R.y + R.h - 2);
  addObject(world, 'plant', R.x + R.w - 2, R.y + R.h - 2);
  addObject(world, 'lava_lamp', INDOOR_EXIT.x - 2, R.y + R.h - 2);
  addObject(world, 'lava_lamp', INDOOR_EXIT.x + 2, R.y + R.h - 2);
  return world;
}

/** The family's TV in the farmhouse: in front of the rug, or wherever there is room. */
export const TV_SPOT = { x: INTERIOR.x + 4, y: INTERIOR.y };

/** Puts a TV in a farmhouse saved before there were TVs. Returns true if something changed. */
export function ensureTv(farm: WorldState): boolean {
  if (Object.values(farm.objects).some((o) => o.kind === 'tv')) return false;
  const w = objectDef('tv').w;
  const free = (x: number, y: number): boolean => {
    for (let dx = 0; dx < w; dx++) if (objectAt(farm, x + dx, y) || farm.terrain[tileIndex(farm, x + dx, y)] !== 'floor_wood') return false;
    return true;
  };
  const spots = [TV_SPOT];
  for (let y = INTERIOR.y; y < INTERIOR.y + INTERIOR.h - 2; y++) for (let x = INTERIOR.x; x <= INTERIOR.x + INTERIOR.w - w; x++) spots.push({ x, y });
  const at = spots.find((s) => free(s.x, s.y));
  if (!at) return false;
  addObject(farm, 'tv', at.x, at.y);
  return true;
}

/** The games on the family's TV: the ones it came with and every one a family member found or won. */
export function familyGames(farm: WorldState): ArcadeGame[] {
  const have = new Set<string>(TV_GAMES);
  for (const p of Object.values(farm.players)) for (const g of p.arcade?.games ?? []) have.add(g);
  return ARCADE_GAMES.filter((g) => have.has(g));
}

/** The family's best score in a game (0 and no one when nobody has played it). */
export function familyBest(farm: WorldState, game: string): { score: number; id?: string } {
  let best: { score: number; id?: string } = { score: 0 };
  for (const p of Object.values(farm.players)) {
    const s = p.arcade?.best[game] ?? 0;
    if (s > best.score) best = { score: s, id: p.id };
  }
  return best;
}
