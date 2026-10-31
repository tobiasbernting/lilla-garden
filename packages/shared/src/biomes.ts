// The world beyond the farm: an endless grid of areas, each generated from its coordinates. Wild biome maps
// are 96×96 (WILD_MAP), cities and the space base 64×64 like the farm. Walking off an edge of one area puts
// you in the opening on the opposite edge of the next (openings are always in the middle of a side).
import { ANIMALS, NPCS, objectDef } from './data.ts';
import { SPECIES_NAMES } from './sv.ts';
import { countRenewables } from './caves.ts';
import { BUS_STOP, PIZZERIA, TRAIN_STATION, buildCity, setAreaGenerator } from './city.ts';
import { addObject, emptyWorld, inBounds, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import { PAINTERS } from './painters.ts';
import { mulberry32, randInt } from './rng.ts';
import { MOON_KEY, MOON_ROCKET, SPACEPORT, rocketFront } from './space.ts';
import type { AnimalDef, AnimalState, CaveTheme, WorldState } from './types.ts';
import { MAP_H, MAP_W, TILE, WALL_TERRAIN, WILD_MAP, key } from './types.ts';
import { EDGE_GAP, Painter, arrivalTile, inEdgeGap, reachableFrom, wouldBlock } from './worldgen.ts';

export type Biome = 'skog' | 'ang' | 'is' | 'berg' | 'strand' | 'oken' | 'by' | 'trask' | 'djungel' | 'vulkan' | 'svamp' | 'dino' | 'godis' | 'rymdbas' | 'mane';
/** Every kind of place a map can be: a biome, home, the monster cave, or a cave out in the world. */
export type Place = Biome | 'farm' | 'dungeon' | `g_${CaveTheme}`;

export const BIOME_NAMES: Record<Place, string> = {
  farm: 'Hemma',
  dungeon: 'Grottan',
  skog: 'Skogen',
  ang: 'Ängen',
  is: 'Isvidderna',
  berg: 'Bergen',
  strand: 'Stranden',
  oken: 'Öknen',
  by: 'Köpingen',
  trask: 'Träsket',
  djungel: 'Djungeln',
  vulkan: 'Vulkanen',
  svamp: 'Svampskogen',
  dino: 'Dinodalen',
  godis: 'Godislandet',
  rymdbas: 'Rymdbasen',
  mane: 'Månen',
  g_rot: 'Rotgrottan',
  g_is: 'Isgrottan',
  g_kristall: 'Kristallgrottan',
  g_sjorovare: 'Sjörövargrottan',
  g_pyramid: 'Pyramiden',
  g_tempel: 'Tempelruinen',
  g_lava: 'Lavagrottan',
  g_svamp: 'Svampgrottan',
  g_fossil: 'Fossilgrottan',
  g_godis: 'Godisgrottan',
  g_rymd: 'Rymdgrottan',
};
export const BIOME_EMOJI: Record<Place, string> = {
  farm: '🏡',
  dungeon: '⚔️',
  skog: '🌲',
  ang: '🌼',
  is: '❄️',
  berg: '⛰️',
  strand: '🏖️',
  oken: '🌵',
  by: '🏘️',
  trask: '🐸',
  djungel: '🦜',
  vulkan: '🌋',
  svamp: '🍄',
  dino: '🦕',
  godis: '🍭',
  rymdbas: '🚀',
  mane: '🌙',
  g_rot: '🕳️',
  g_is: '🧊',
  g_kristall: '💎',
  g_sjorovare: '🏴‍☠️',
  g_pyramid: '🔺',
  g_tempel: '🗿',
  g_lava: '🔥',
  g_svamp: '🍄',
  g_fossil: '🦴',
  g_godis: '🍬',
  g_rymd: '👾',
};
/** The biomes you can discover (the Gårdsbok counts them). */
export const DISCOVERABLE: Biome[] = ['skog', 'ang', 'is', 'berg', 'strand', 'oken', 'by', 'trask', 'djungel', 'vulkan', 'svamp', 'dino', 'godis', 'rymdbas', 'mane'];
export const isBiome = (b: string | undefined): b is Biome => !!b && (DISCOVERABLE as string[]).includes(b);
/** Name and emoji of any map's place (falls back to the meadow for unknown ones). */
export const placeName = (b: string | undefined): string => BIOME_NAMES[(b ?? 'ang') as Place] ?? BIOME_NAMES.ang;
export const placeEmoji = (b: string | undefined): string => BIOME_EMOJI[(b ?? 'ang') as Place] ?? BIOME_EMOJI.ang;

export const areaKey = (ax: number, ay: number): string => `a:${ax},${ay}`;
export const parseAreaKey = (k: string): { ax: number; ay: number } | null => {
  const m = /^a:(-?\d+),(-?\d+)$/.exec(k);
  return m ? { ax: Number(m[1]), ay: Number(m[2]) } : null;
};
/** Grid coordinates of any area key ('farm' is 0,0). */
export const areaCoords = (k: string): { ax: number; ay: number } | null => (k === 'farm' ? { ax: 0, ay: 0 } : parseAreaKey(k));

const hash = (ax: number, ay: number, salt: number): number => {
  let h = (ax * 374761393 + ay * 668265263 + salt * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const noise = (ax: number, ay: number, salt: number): number => hash(ax, ay, salt) / 4294967296;

/** Fixed places around the farm, so a new biome is never far away. */
const NEAR_HOME: Record<string, Biome> = {
  '0,-1': 'skog',
  '-1,0': 'trask',
  '0,1': 'ang',
  '1,-1': 'svamp',
  '-1,-1': 'skog',
  '1,1': 'dino',
  '-1,1': 'ang',
  '2,0': 'berg',
  '-2,0': 'strand',
  '0,-2': 'is',
  '0,2': 'oken',
  '-1,2': 'djungel',
  '2,2': 'vulkan',
};

/** Picks from weighted choices with a 0..1 roll. */
const weighted = (roll: number, table: [Biome, number][]): Biome => {
  const total = table.reduce((n, [, w]) => n + w, 0);
  let r = roll * total;
  for (const [b, w] of table) if ((r -= w) <= 0) return b;
  return table[table.length - 1]![0];
};

/**
 * Which biome an area has. Cities stay exactly where they always were. Near the farm the biomes are
 * fixed; further out it gets colder to the north and hotter to the south (a few maps at a time), the
 * sea is to the west and the mountains to the east, with every kind of place mixed in along the way,
 * and Godislandet now and then, far, far away.
 */
export function biomeAt(ax: number, ay: number): Biome {
  if (ax === 1 && ay === 0) return 'by'; // Byn, right next door
  if (Math.abs(ax) + Math.abs(ay) >= 4 && noise(ax, ay, 9) < 0.07) return 'by';
  if (ax === SPACEPORT.ax && ay === SPACEPORT.ay) return 'rymdbas';
  const near = NEAR_HOME[`${ax},${ay}`];
  if (near) return near;
  if (Math.abs(ax) + Math.abs(ay) >= 5 && noise(ax, ay, 21) < 0.035) return 'godis';
  const cold = -ay / 4 + (noise(ax, ay, 1) - 0.5) * 1.6; // north is cold
  const wet = -ax / 4 + (noise(ax, ay, 3) - 0.5) * 1.6; // the sea is to the west
  const roll = noise(ax, ay, 10);
  if (cold > 1.1)
    return weighted(roll, [
      ['is', 6],
      ['berg', 2],
      ['skog', 2],
    ]);
  if (cold < -1.1) {
    if (wet > 0.4)
      return weighted(roll, [
        ['djungel', 6],
        ['trask', 2],
        ['strand', 2],
      ]);
    if (wet < -0.4)
      return weighted(roll, [
        ['vulkan', 5],
        ['oken', 3],
        ['dino', 2],
      ]);
    return weighted(roll, [
      ['oken', 4],
      ['dino', 3],
      ['djungel', 2],
      ['vulkan', 1],
    ]);
  }
  if (wet > 1)
    return weighted(roll, [
      ['strand', 6],
      ['trask', 3],
      ['ang', 2],
      ['skog', 1],
    ]);
  if (wet < -1)
    return weighted(roll, [
      ['berg', 6],
      ['skog', 2],
      ['svamp', 2],
      ['ang', 1],
    ]);
  return weighted(roll, [
    ['skog', 5],
    ['ang', 5],
    ['trask', 3],
    ['svamp', 3],
    ['berg', 2],
    ['dino', 2],
  ]);
}

export { EDGE_GAP, arrivalTile, inEdgeGap } from './worldgen.ts';

/**
 * Version of the area generator. Explored maps built by an older one are rebuilt (if nobody changed them) or
 * topped up. 3: wild maps are 96×96.
 */
export const AREA_GEN = 3;

/** How big a biome's maps are: cities and the space base keep the 64×64 of their plans, the wild is bigger. */
export const areaSizeOf = (biome: string): number => (biome === 'by' || biome === 'rymdbas' ? MAP_W : WILD_MAP);

/** Builds a city's surroundings the way it always was (so new cities look like the old ones), then the city. */
function paintCity(world: WorldState, rnd: () => number): void {
  const T = world.terrain;
  T.fill('grass');
  const tryObj = (x: number, y: number, kind: string) => {
    if (!inBounds(world, x, y) || inEdgeGap(world, x, y)) return;
    const t = T[tileIndex(world, x, y)];
    if (t === 'water' || t === 'ice') return;
    if (objectAt(world, x, y)) return;
    addObject(world, kind, x, y);
  };
  const pick = (arr: string[]) => arr[Math.floor(rnd() * arr.length)]!;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      if (edge <= 1 && rnd() < 0.95) tryObj(x, y, pick(['tree', 'tree_apple']));
      else if (edge <= 3 && rnd() < 0.6) tryObj(x, y, pick(['tree', 'tree_apple']));
      else if (edge > 3) {
        const r = rnd();
        if (r < 0.04) tryObj(x, y, 'grass_tuft');
        else if (r < 0.1) tryObj(x, y, 'flower');
      }
    }
  buildCity(world);
}

/**
 * Builds a biome area for grid coordinates (ax, ay). Deterministic. `size` is the side in tiles (the biome's
 * own size unless asked for another; a 64 map comes out exactly as it did before maps grew).
 */
export function generateArea(ax: number, ay: number, worldSeed = 1337, size?: number): WorldState {
  const biome = biomeAt(ax, ay);
  const rnd = mulberry32(hash(ax, ay, worldSeed));
  const side = biome === 'by' ? MAP_W : (size ?? areaSizeOf(biome));
  const world = emptyWorld(side, side);
  world.area = areaKey(ax, ay);
  world.biome = biome;
  world.gen = AREA_GEN;
  if (biome === 'by') paintCity(world, rnd);
  else {
    const g = new Painter(world, rnd, hash(ax, ay, worldSeed + 1));
    g.showcase = !!NEAR_HOME[`${ax},${ay}`] || (ax === SPACEPORT.ax && ay === SPACEPORT.ay);
    (PAINTERS[biome] ?? PAINTERS.ang!)(g);
    world.renew = countRenewables(world);
  }
  spawnWildAnimals(world, biome, rnd);
  // A signpost beside every opening (decoration)
  if (biome !== 'by')
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const a = arrivalTile(world, side);
      const sx = side === 'n' || side === 's' ? a.x + EDGE_GAP : side === 'w' ? a.x + 2 : a.x - 2;
      const sy = side === 'w' || side === 'e' ? a.y + EDGE_GAP : side === 'n' ? a.y + 2 : a.y - 2;
      const o = objectAt(world, sx, sy);
      if (o && objectDef(o.kind).breakWith && !objectDef(o.kind).interact && !objectDef(o.kind).solid) removeObject(world, o.id);
      if (!objectAt(world, sx, sy) && !WALL_TERRAIN.has(world.terrain[tileIndex(world, sx, sy)]!) && !wouldBlock(world, sx, sy)) addObject(world, 'signpost', sx, sy);
    }
  return world;
}

/** The wild species that live in a biome (predators stay out of the village). */
export const wildSpeciesOf = (biome: string): AnimalDef[] =>
  Object.values(ANIMALS).filter((a) => a.wild && a.wild.split('|').includes(biome) && !(biome === 'by' && a.predator));

/** Where wild animals may be found: tiles you can walk to from the way in. */
const entryOf = (world: WorldState): { x: number; y: number } => (world.area === MOON_KEY ? rocketFront(MOON_ROCKET) : arrivalTile(world, 'n'));

/**
 * Puts the biome's wild animals into an area. With `restock`, only tops up species whose untamed
 * count fell below their minimum (predators that were chased off, animals that were tamed).
 * The counts (`wildCount`) are for a 64×64 map; a bigger map gets more, as many per tile.
 * Returns the animals that were added.
 */
export function spawnWildAnimals(world: WorldState, biome: string, rnd: () => number, restock = false, only?: (def: AnimalDef) => boolean): AnimalState[] {
  const added: AnimalState[] = [];
  const species = wildSpeciesOf(biome).filter((d) => !only || only(d));
  if (!species.length) return added;
  const T = world.terrain;
  const W = mapW(world);
  const H = mapH(world);
  const scale = (W * H) / (MAP_W * MAP_H);
  const many = (n: number) => (scale === 1 ? n : Math.round(n * scale));
  const reach = reachableFrom(world, entryOf(world));
  for (const def of species) {
    const [min, max] = def.wildCount ?? [3, 5];
    const have = Object.values(world.animals).filter((a) => a.species === def.species && !a.owner).length;
    const want = restock ? Math.max(0, many(min) - have) : many(randInt(rnd, min, max));
    let tries = 0;
    let placed = 0;
    const maxTries = 200 * Math.ceil(scale);
    while (placed < want && tries++ < maxTries) {
      const x = randInt(rnd, 6, W - 7);
      const y = randInt(rnd, 6, H - 7);
      const t = T[tileIndex(world, x, y)]!;
      if (WALL_TERRAIN.has(t) || t === 'ice' || objectAt(world, x, y) || inEdgeGap(world, x, y)) continue;
      // in the open where you can get to them (an old map's pockets count too, if nothing else is free)
      if (!reach[tileIndex(world, x, y)] && tries < maxTries * 0.75) continue;
      if (Object.values(world.players).some((p) => Math.hypot(p.x - (x * TILE + 8), p.y - (y * TILE + 8)) < 8 * TILE)) continue;
      const id = world.nextId++;
      const a: AnimalState = {
        id,
        species: def.species,
        name: SPECIES_NAMES[def.species] ?? def.species,
        x: x * TILE + TILE / 2,
        y: y * TILE + TILE / 2,
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
        waitMs: randInt(rnd, 500, 3000),
      };
      if (def.variants) a.variant = randInt(rnd, 0, def.variants - 1);
      if (def.predator || def.mob) {
        // predators, and Loke's servants roaming the world (Act II of the saga)
        a.hp = def.predator?.hp ?? def.mob!.hp;
        a.attackAt = 0;
      }
      world.animals[id] = a;
      added.push(a);
      placed++;
    }
  }
  return added;
}

/**
 * Maps saved before Loke's servants roamed the world (Sagan om Världsträdet II) get their monsters now. Tops up
 * only the roaming monsters of the map's biome; returns true if any were added.
 */
export function ensureRoaming(world: WorldState, rnd: () => number = Math.random): boolean {
  if (!world.biome) return false;
  return spawnWildAnimals(world, world.biome, rnd, true, (d) => !!d.mob).length > 0;
}

/** Opens paths out of the farm at the middle of each edge (idempotent). */
export function ensureFarmExits(world: WorldState): void {
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (!inEdgeGap(world, x, y)) continue;
      const o = objectAt(world, x, y);
      if (o && (o.kind.startsWith('tree') || o.kind === 'bush' || o.kind.startsWith('rock'))) {
        delete world.objects[o.id];
        delete world.occupancy[key(x, y)];
      }
      if (world.terrain[tileIndex(world, x, y)] === 'water') world.terrain[tileIndex(world, x, y)] = 'sand';
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      if (edge <= 3 && world.terrain[tileIndex(world, x, y)] === 'grass') world.terrain[tileIndex(world, x, y)] = 'path_dirt';
    }
}

/** Adds the pizzeria (and room for Pino) to a village saved before it existed. Idempotent. */
export function ensurePizzeria(world: WorldState): boolean {
  if (world.biome !== 'by') return false;
  if (Object.values(world.objects).some((o) => o.kind === 'pizzeria')) return false;
  const clearTile = (x: number, y: number) => {
    const o = objectAt(world, x, y);
    if (o && o.kind !== 'house_small' && o.kind !== 'market' && o.kind !== 'sellstall') delete world.objects[o.id];
    const occ = world.occupancy[key(x, y)];
    if (occ !== undefined && !world.objects[occ]) delete world.occupancy[key(x, y)];
  };
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 3; dx++) clearTile(PIZZERIA.x + dx, PIZZERIA.y + dy);
  for (const n of Object.values(NPCS)) {
    if (n.area !== world.area) continue;
    for (const w of [n, ...n.routine]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) clearTile(w.x + dx, w.y + dy);
  }
  addObject(world, 'pizzeria', PIZZERIA.x, PIZZERIA.y);
  return true;
}

// ---------------------------------------------------------------------------
// Public transport: every city has a bus stop by the square and a station by the north road;
// the farm has a bus stop at its east exit.
// ---------------------------------------------------------------------------
export const CITY_BUS_STOP = BUS_STOP;
export const CITY_STATION = TRAIN_STATION;
export const FARM_BUS_STOP = { x: MAP_W - 3, y: MAP_H / 2 - 3 }; // the tile below it is the east exit path

const KEEP_BUILDINGS = new Set(['house_small', 'market', 'sellstall', 'pizzeria', 'bathhouse', 'house', 'bus_stop', 'train_station']);
function clearFootprint(world: WorldState, x0: number, y0: number, w: number, h: number): void {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(world, x, y)) continue;
      const o = objectAt(world, x, y);
      if (o && !KEEP_BUILDINGS.has(o.kind)) delete world.objects[o.id];
      const occ = world.occupancy[key(x, y)];
      if (occ !== undefined && !world.objects[occ]) delete world.occupancy[key(x, y)];
      if (world.terrain[tileIndex(world, x, y)] === 'water') world.terrain[tileIndex(world, x, y)] = 'sand';
    }
}

/** Places the bus stop and the train station in a city (idempotent; the city builder calls this). */
export function placeTransport(world: WorldState): boolean {
  let added = false;
  if (!Object.values(world.objects).some((o) => o.kind === 'bus_stop')) {
    clearFootprint(world, CITY_BUS_STOP.x, CITY_BUS_STOP.y, 1, 1);
    addObject(world, 'bus_stop', CITY_BUS_STOP.x, CITY_BUS_STOP.y);
    added = true;
  }
  if (!Object.values(world.objects).some((o) => o.kind === 'train_station')) {
    clearFootprint(world, CITY_STATION.x, CITY_STATION.y, 3, 2);
    addObject(world, 'train_station', CITY_STATION.x, CITY_STATION.y);
    // a little platform in front of the station
    for (let dx = -1; dx <= 3; dx++) world.terrain[tileIndex(world, CITY_STATION.x + dx, CITY_STATION.y + 2)] = 'path_stone';
    added = true;
  }
  return added;
}

/** Adds transport to a city saved before it existed. */
export function ensureTransport(world: WorldState): boolean {
  if (world.biome !== 'by') return false;
  return placeTransport(world);
}

/** The farm's bus stop, just north of the east exit. Idempotent. */
export function ensureFarmBusStop(world: WorldState): boolean {
  if (Object.values(world.objects).some((o) => o.kind === 'bus_stop')) return false;
  clearFootprint(world, FARM_BUS_STOP.x, FARM_BUS_STOP.y, 1, 1);
  addObject(world, 'bus_stop', FARM_BUS_STOP.x, FARM_BUS_STOP.y);
  return true;
}

// generateArea is what ensureCity uses to rebuild an old village
setAreaGenerator((ax, ay) => generateArea(ax, ay));
