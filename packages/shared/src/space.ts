// Rymdbasen and the moon. A rocket stands at the space base a few maps south of the farm; it flies to
// the moon (a small round world floating among the stars) and back. The moon has craters, moon rocks,
// star crystals, moon cheese, friendly aliens, a crashed UFO with a chest, and a cave of its own.
import { spawnWildAnimals } from './biomes.ts';
import { CAVE_THEMES, countRenewables } from './caves.ts';
import { addObject, emptyWorld, objectAt, removeObject } from './map.ts';
import { hashString, mulberry32 } from './rng.ts';
import { Painter, connect } from './worldgen.ts';
import { MAP_H, MAP_W, key, type WorldState } from './types.ts';

export const MOON_KEY = 'moon';
export const isMoonKey = (k: string | undefined): boolean => k === MOON_KEY;

/** The map of the space base (in the hot south, a little east of the farm). */
export const SPACEPORT = { ax: 1, ay: 3 };
export const SPACEPORT_KEY = `a:${SPACEPORT.ax},${SPACEPORT.ay}`;

/** Where the rocket stands at the base and on the moon (top-left of its 2×3 footprint). */
export const BASE_ROCKET = { x: 31, y: 27 };
export const MOON_ROCKET = { x: 31, y: 37 };
/** You step out in front of the rocket. */
export const rocketFront = (r: { x: number; y: number }): { x: number; y: number } => ({ x: r.x, y: r.y + 3 });

/** Lays out the launch site (pad, rocket, dish, lanterns) around BASE_ROCKET. Used by the painter and to repair old maps. */
export function buildLaunchSite(world: WorldState): void {
  const r = BASE_ROCKET;
  const x0 = r.x - 4;
  const y0 = r.y - 2;
  for (let y = y0; y < y0 + 9; y++)
    for (let x = x0; x < x0 + 10; x++) {
      const o = objectAt(world, x, y);
      if (o) removeObject(world, o.id);
      delete world.crops[key(x, y)];
      const edge = x === x0 || x === x0 + 9 || y === y0 || y === y0 + 8;
      world.terrain[y * MAP_W + x] = edge ? 'path_stone' : 'floor_stone';
    }
  addObject(world, 'rocket', r.x, r.y);
  addObject(world, 'satellite_dish', r.x + 4, r.y);
  addObject(world, 'flag_se', r.x - 2, r.y + 1);
  for (const [dx, dy] of [
    [-3, 5],
    [4, 5],
  ] as const)
    addObject(world, 'lantern', r.x + dx, r.y + dy);
  // a road south from the pad
  for (let y = y0 + 9; y < y0 + 13; y++) for (let x = r.x; x <= r.x + 1; x++) if (!objectAt(world, x, y)) world.terrain[y * MAP_W + x] = 'path_stone';
}

/** Adds the launch site to a saved space-base map that was built before it existed. */
export function ensureSpaceport(world: WorldState): boolean {
  if (world.area !== SPACEPORT_KEY || Object.values(world.objects).some((o) => o.kind === 'rocket')) return false;
  buildLaunchSite(world);
  return true;
}

/** The moon: a round world among the stars. Deterministic. */
export function generateMoon(): WorldState {
  const world = emptyWorld();
  world.area = MOON_KEY;
  world.biome = 'mane';
  const g = new Painter(world, mulberry32(hashString('månen')), 4242);
  g.ground = 'moon';
  g.fill('space');
  const cx = MAP_W / 2;
  const cy = MAP_H / 2 - 1;
  g.each((x, y) => {
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    const r = 24.5 + 2.2 * (g.noise(Math.cos(a) * 9 + 40, Math.sin(a) * 9 + 40, 5, 3) - 0.5) * 2;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) g.set(x, y, 'moon');
  });
  // the Earth hangs in the sky in a corner
  addObject(world, 'earth', MAP_W - 9, 2);
  // the landing pad and the rocket home
  const r = MOON_ROCKET;
  for (let y = r.y - 1; y <= r.y + 5; y++) for (let x = r.x - 2; x <= r.x + 3; x++) g.set(x, y, 'floor_stone');
  addObject(world, 'rocket', r.x, r.y);
  addObject(world, 'flag_se', r.x + 3, r.y + 1);
  g.reserve(r.x - 3, r.y - 2, 8, 9);
  // a crashed UFO with a chest beside it
  addObject(world, 'ufo', 15, 17);
  addObject(world, 'loot_chest', 18, 19, { variant: 4, loot: 'ufo' });
  g.reserve(13, 15, 8, 7);
  // a cave in a hill on the far side
  g.caveHill(45, 24, 'rock', CAVE_THEMES.indexOf('rymd'), 1);
  // craters, rocks, crystals and cheese
  const onMoon = (x: number, y: number) => g.at(x, y) === 'moon';
  g.scatter('crater', 10, (x, y) => onMoon(x, y) && onMoon(x + 1, y + 1));
  g.scatter('moon_rock', 18, onMoon);
  g.scatter('star_crystal', 5, onMoon);
  g.scatter('moon_cheese', 7, onMoon);
  g.scatter('dig_spot', 2, onMoon);
  connect(g, { trail: null, trails: false, bridge: () => 'moon', pass: 'moon' }, { openings: false, from: rocketFront(r) });
  world.renew = countRenewables(world);
  spawnWildAnimals(world, 'mane', g.rnd);
  return world;
}
