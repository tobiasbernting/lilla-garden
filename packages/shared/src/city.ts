// Staden: the village is a small city with a grid of streets, blocks of houses, a square,
// a rail line with a station, and traffic (cars, buses, motorcycles, a train) that drives around
// the blocks and always stops for people.
import { ANIMALS, NPCS } from './data.ts';
import { addObject, inBounds, objectAt, removeObject, tileIndex } from './map.ts';
import { SPECIES_NAMES } from './sv.ts';
import { MAP_H, MAP_W, TILE, key, type AnimalState, type Facing, type Terrain, type WorldState } from './types.ts';

// ---------------------------------------------------------------------------
// Layout (tiles). Roads are two tiles wide; a sidewalk runs along each side.
// ---------------------------------------------------------------------------
/** Vertical roads: columns x and x+1. The middle one runs edge to edge. */
export const CITY_VX = [12, 31, 50] as const;
/** Horizontal roads: rows y and y+1. The middle one runs edge to edge. */
export const CITY_HY = [13, 33, 50] as const;
/** Row of the railway along the north edge. */
export const RAIL_Y = 5;
export const RAIL_X0 = 2;
export const RAIL_X1 = 61;
/** Where the station stands (3×2), on the platform south of the rails. */
export const TRAIN_STATION = { x: 35, y: 7 };
/** The pizzeria on the square (3×2). */
export const PIZZERIA = { x: 39, y: 21 };
/** The bath house south of the main street (3×2); its door is below the middle tile. */
export const BATHHOUSE = { x: 38, y: 37 };
/** Spelhallen, the arcade, a little further east on the same street (3×2, door below the middle tile). */
export const ARCADE_HALL = { x: 46, y: 37 };
/** The bus stop on the sidewalk of the main street. */
export const BUS_STOP = { x: 37, y: 35 };
/** The square (path_stone) north-east of the central junction. */
const PLAZA = { x0: 34, y0: 20, x1: 47, y1: 31 };

const isRoadRow = (y: number): boolean => CITY_HY.some((h) => y === h || y === h + 1);
const isRoadCol = (x: number): boolean => CITY_VX.some((v) => x === v || x === v + 1);
/** Is (x,y) on a street? The middle streets cross the whole map, the others stay inside the ring. */
export function isRoadTile(x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  if (isRoadRow(y) && (y === 33 || y === 34 || (x >= CITY_VX[0] && x <= CITY_VX[2] + 1))) return true;
  if (isRoadCol(x) && (x === 31 || x === 32 || (y >= CITY_HY[0] && y <= CITY_HY[2] + 1))) return true;
  return false;
}
/** Terrain vehicles may drive on. */
export const isDrivable = (t: Terrain | undefined): boolean => t === 'road' || t === 'crossing';

// ---------------------------------------------------------------------------
// Traffic loops: each vehicle circles one block clockwise, which puts it in the right-hand lane.
// Corners are tile coordinates of the lane next to the block.
// ---------------------------------------------------------------------------
export interface Loop {
  corners: [number, number][];
}
export const LOOPS: Loop[] = [
  { corners: [[13, 14], [31, 14], [31, 33], [13, 33]] }, // NW block
  { corners: [[32, 14], [50, 14], [50, 33], [32, 33]] }, // NE block (the square)
  { corners: [[13, 34], [31, 34], [31, 50], [13, 50]] }, // SW block
  { corners: [[32, 34], [50, 34], [50, 50], [32, 50]] }, // SE block
  { corners: [[13, 14], [50, 14], [50, 33], [13, 33]] }, // bus line, north half
  { corners: [[13, 34], [50, 34], [50, 50], [13, 50]] }, // bus line, south half
];
/** The train shuttles along the rails between these two x tiles. */
export const TRAIN_LOOP = -1;

/** Vehicles on the streets of a new city: [species, loop, start leg]. */
const TRAFFIC: [string, number, number][] = [
  ['car', 0, 0],
  ['car', 1, 2],
  ['car', 2, 1],
  ['car', 3, 3],
  ['motorcycle', 0, 2],
  ['motorcycle', 3, 1],
  ['bus', 4, 0],
  ['bus', 5, 2],
];

const center = (t: number): number => t * TILE + TILE / 2;

function makeVehicle(world: WorldState, species: string, x: number, y: number, facing: Facing): AnimalState {
  const id = world.nextId++;
  const a: AnimalState = {
    id,
    species,
    name: SPECIES_NAMES[species] ?? species,
    x,
    y,
    facing,
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
    waitMs: 0,
  };
  world.animals[id] = a;
  return a;
}

/** Puts the traffic on the streets (only vehicles that are missing). */
export function spawnTraffic(world: WorldState): AnimalState[] {
  const added: AnimalState[] = [];
  const have = (species: string, loop: number) => Object.values(world.animals).some((a) => a.species === species && a.route?.loop === loop);
  TRAFFIC.forEach(([species, loop, leg], i) => {
    if (have(species, loop)) return;
    const L = LOOPS[loop]!;
    const [sx, sy] = L.corners[leg]!;
    const [nx, ny] = L.corners[(leg + 1) % 4]!;
    // start a bit along the leg so vehicles sharing a loop are spread out
    const f = ((i * 7) % 10) / 10;
    const a = makeVehicle(world, species, center(sx) + (center(nx) - center(sx)) * f, center(sy) + (center(ny) - center(sy)) * f, legFacing(sx, sy, nx, ny));
    a.route = { loop, leg: (leg + 1) % 4 };
    a.tx = center(nx);
    a.ty = center(ny);
    a.variant = i % 2;
    added.push(a);
  });
  if (!Object.values(world.animals).some((a) => a.species === 'train')) {
    const a = makeVehicle(world, 'train', center(RAIL_X0 + 10), center(RAIL_Y), 'right');
    a.route = { loop: TRAIN_LOOP, leg: 1 };
    a.tx = center(RAIL_X1);
    a.ty = center(RAIL_Y);
    added.push(a);
  }
  return added;
}

const legFacing = (x0: number, y0: number, x1: number, y1: number): Facing => (x1 > x0 ? 'right' : x1 < x0 ? 'left' : y1 > y0 ? 'down' : 'up');

// ---------------------------------------------------------------------------
// Building the city
// ---------------------------------------------------------------------------
const APARTMENTS: [number, number][] = [
  [16, 17],
  [21, 17],
  [26, 17],
  [16, 36],
  [21, 36],
];
const SHOPS: [number, number][] = [
  [16, 24],
  [25, 27],
  [42, 37],
  [26, 44],
];
const HOUSES: [number, number][] = [
  [20, 23],
  [16, 28],
  [21, 28],
  [16, 42],
  [21, 42],
  [16, 46],
  [34, 44],
  [44, 42],
  [44, 46],
  [38, 45],
  [5, 20],
  [5, 26],
  [56, 20],
  [56, 26],
  [5, 40],
  [56, 40],
  [20, 7],
  [44, 8],
];

/** Lays out streets, sidewalks, the square, buildings, lamps and the railway. Idempotent on fresh terrain. */
export function buildCity(world: WorldState): void {
  const T = world.terrain;
  const set = (x: number, y: number, t: Terrain) => {
    if (inBounds(x, y)) T[tileIndex(x, y)] = t;
  };
  const clear = (x: number, y: number) => {
    const o = objectAt(world, x, y);
    if (o) removeObject(world, o.id);
    delete world.occupancy[key(x, y)];
  };
  const clearRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) clear(x, y);
  };
  const place = (kind: string, x: number, y: number, w: number, h: number, extra?: { variant?: number }) => {
    clearRect(x - 1, y - 1, x + w, y + h);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, 'grass');
    addObject(world, kind, x, y, extra);
  };

  // streets and sidewalks
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (!isRoadTile(x, y)) continue;
      clear(x, y);
      set(x, y, 'road');
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ] as const) {
        const sx = x + dx;
        const sy = y + dy;
        if (inBounds(sx, sy) && !isRoadTile(sx, sy)) {
          clear(sx, sy);
          set(sx, sy, 'sidewalk');
        }
      }
    }
  // zebra crossings on every approach to a junction
  for (const vx of CITY_VX)
    for (const hy of CITY_HY) {
      for (const y of [hy, hy + 1]) for (const x of [vx - 1, vx + 2]) if (isRoadTile(x, y)) set(x, y, 'crossing');
      for (const x of [vx, vx + 1]) for (const y of [hy - 1, hy + 2]) if (isRoadTile(x, y)) set(x, y, 'crossing');
    }
  // the square
  for (let y = PLAZA.y0; y <= PLAZA.y1; y++)
    for (let x = PLAZA.x0; x <= PLAZA.x1; x++) {
      clear(x, y);
      set(x, y, 'path_stone');
    }
  // railway with a level crossing over the main street and a platform
  for (let x = RAIL_X0; x <= RAIL_X1; x++) {
    clear(x, RAIL_Y);
    set(x, RAIL_Y, 'rail');
  }
  for (let x = TRAIN_STATION.x - 3; x <= TRAIN_STATION.x + 5; x++) {
    clear(x, RAIL_Y + 1);
    set(x, RAIL_Y + 1, 'path_stone');
  }
  place('train_station', TRAIN_STATION.x, TRAIN_STATION.y, 3, 2);

  // buildings
  APARTMENTS.forEach(([x, y], i) => place('apartment', x, y, 3, 3, { variant: i % 4 }));
  SHOPS.forEach(([x, y], i) => place('shop', x, y, 3, 2, { variant: i % 3 }));
  HOUSES.forEach(([x, y], i) => place('house_small', x, y, 3, 3, { variant: i % 4 }));
  place('market', 35, 22, 2, 2);
  place('sellstall', 44, 22, 2, 2);
  place('pizzeria', PIZZERIA.x, PIZZERIA.y, 3, 2);
  place('town_well', 40, 27, 1, 1);
  place('bathhouse', BATHHOUSE.x, BATHHOUSE.y, 3, 2);
  for (let y = BATHHOUSE.y + 2; y <= BATHHOUSE.y + 3; y++) for (let x = BATHHOUSE.x; x <= BATHHOUSE.x + 2; x++) set(x, y, 'path_stone');
  place('arcade_hall', ARCADE_HALL.x, ARCADE_HALL.y, 3, 2);
  for (let y = ARCADE_HALL.y + 2; y <= ARCADE_HALL.y + 3; y++) for (let x = ARCADE_HALL.x; x <= ARCADE_HALL.x + 2; x++) set(x, y, 'path_stone');
  // the square: plaza tiles must stay stone under the furniture
  for (let y = PLAZA.y0; y <= PLAZA.y1; y++) for (let x = PLAZA.x0; x <= PLAZA.x1; x++) if (!objectAt(world, x, y)) set(x, y, 'path_stone');
  for (const [x, y] of [
    [36, 29],
    [44, 29],
  ] as const) {
    clear(x, y);
    addObject(world, 'bench', x, y);
  }
  for (const [x, y] of [
    [35, 26],
    [46, 26],
    [37, 31],
    [43, 31],
  ] as const) {
    clear(x, y);
    addObject(world, 'flowerbox', x, y);
  }
  // street furniture
  clear(BUS_STOP.x, BUS_STOP.y);
  addObject(world, 'bus_stop', BUS_STOP.x, BUS_STOP.y);
  for (const [x, y] of [
    [30, 32],
    [33, 32],
    [30, 35],
    [33, 35],
  ] as const) {
    clear(x, y);
    addObject(world, 'traffic_light', x, y);
  }
  for (const [x, y] of [
    [20, 12],
    [40, 12],
    [20, 16],
    [40, 16],
    [11, 24],
    [11, 42],
    [52, 24],
    [52, 42],
    [20, 32],
    [44, 32],
    [20, 35],
    [44, 35],
    [20, 52],
    [40, 52],
    [30, 10],
    [33, 10],
  ] as const) {
    if (world.terrain[tileIndex(x, y)] !== 'sidewalk') continue;
    clear(x, y);
    addObject(world, 'street_lamp', x, y);
  }
  for (const [x, y] of [
    [16, 32],
    [24, 32],
    [36, 52],
  ] as const) {
    clearRect(x, y, x + 1, y);
    set(x, y, 'path_stone');
    set(x + 1, y, 'path_stone');
    addObject(world, 'parked_car', x, y, { variant: x % 3 });
  }
  // villagers must be able to stand on their spots
  for (const n of Object.values(NPCS)) {
    if (n.area !== world.area) continue;
    for (const w of [n, ...n.routine]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) clear(w.x + dx, w.y + dy);
  }
  world.npcs = {};
  spawnTraffic(world);
}

/** Does this area already have streets? */
export const isCity = (world: WorldState): boolean => world.biome === 'by' && world.terrain.includes('road');

/**
 * Upgrades a village saved before the streets existed into a city (idempotent). Players who were
 * standing where a building now is are moved to the western entrance.
 */
export function ensureCity(world: WorldState, farm?: WorldState): boolean {
  if (world.biome !== 'by' || isCity(world)) return false;
  // start over from the generator's version of this area, then lay out the city on top
  const m = /^a:(-?\d+),(-?\d+)$/.exec(world.area ?? '');
  const fresh = m && regenerate ? regenerate(Number(m[1]), Number(m[2])) : null;
  if (fresh) {
    world.terrain = fresh.terrain;
    world.objects = fresh.objects;
    world.occupancy = fresh.occupancy;
    world.animals = fresh.animals;
    world.nextId = Math.max(world.nextId, fresh.nextId);
    world.npcs = {};
  } else buildCity(world);
  if (farm) {
    for (const p of Object.values(farm.players)) {
      if (p.area !== world.area) continue;
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      const o = objectAt(world, tx, ty);
      if (o || world.terrain[tileIndex(tx, ty)] === 'water') {
        p.x = center(1);
        p.y = center(MAP_H / 2);
      }
    }
  }
  return true;
}

// generateArea lives in biomes.ts, which imports buildCity from here; look it up lazily to avoid a cycle
let regenerate: ((ax: number, ay: number) => WorldState) | null = null;
export const setAreaGenerator = (fn: (ax: number, ay: number) => WorldState): void => {
  regenerate = fn;
};

// ---------------------------------------------------------------------------
// Driving
// ---------------------------------------------------------------------------
export const isVehicle = (a: AnimalState): boolean => !!ANIMALS[a.species]?.vehicle;
/** Half length of a vehicle along its facing, in tiles (how many tiles it blocks around its centre). */
const halfLength = (a: AnimalState): number => (a.species === 'bus' || a.species === 'train' ? 1 : 0);

/** Is a vehicle standing on this tile? */
export function vehicleAt(world: WorldState, tx: number, ty: number): AnimalState | undefined {
  for (const a of Object.values(world.animals)) {
    if (!isVehicle(a)) continue;
    const ax = Math.floor(a.x / TILE);
    const ay = Math.floor(a.y / TILE);
    const h = halfLength(a);
    const horizontal = a.facing === 'left' || a.facing === 'right';
    if (horizontal ? ay === ty && Math.abs(ax - tx) <= h : ax === tx && Math.abs(ay - ty) <= h) return a;
  }
  return undefined;
}

const DIRV: Record<Facing, { dx: number; dy: number }> = { right: { dx: 1, dy: 0 }, left: { dx: -1, dy: 0 }, down: { dx: 0, dy: 1 }, up: { dx: 0, dy: -1 } };

/** The first thing in the way: a player, villager, animal or other vehicle within `tiles` ahead of the front bumper. */
export function blockerAhead(world: WorldState, a: AnimalState, npcs: { x: number; y: number }[], tiles = 1.5): 'player' | 'other' | null {
  const d = DIRV[a.facing];
  const front = halfLength(a) * TILE + TILE / 2;
  const reach = front + tiles * TILE;
  const side = TILE * 0.9;
  const inFront = (x: number, y: number): boolean => {
    const rx = x - a.x;
    const ry = y - a.y;
    const along = rx * d.dx + ry * d.dy;
    const across = Math.abs(rx * d.dy - ry * d.dx);
    return along > front * 0.5 && along < reach && across < side;
  };
  for (const p of Object.values(world.players)) if (p.online && (p.area ?? 'farm') === (world.area ?? 'farm') && inFront(p.x, p.y)) return 'player';
  for (const n of npcs) if (inFront(n.x, n.y)) return 'other';
  for (const o of Object.values(world.animals)) {
    if (o.id === a.id) continue;
    if (inFront(o.x, o.y)) return 'other';
  }
  return null;
}

/**
 * Drives one vehicle for dtMs. Returns the honk position when it has been waiting for a player.
 * `npcs` are the villagers' current positions (vehicles stop for them too).
 */
export function driveVehicle(world: WorldState, a: AnimalState, dtMs: number, now: number, npcs: { x: number; y: number }[]): { honk: boolean } {
  const def = ANIMALS[a.species]?.vehicle;
  if (!def) return { honk: false };
  if (!a.route || a.tx === undefined || a.ty === undefined) {
    // a vehicle without a route (older save): park it on the nearest loop
    const L = LOOPS[0]!;
    a.route = { loop: 0, leg: 1 };
    a.x = center(L.corners[0]![0]);
    a.y = center(L.corners[0]![1]);
    a.tx = center(L.corners[1]![0]);
    a.ty = center(L.corners[1]![1]);
    a.facing = 'right';
  }
  // pauses (bus stop, station, honking)
  if (a.waitMs > 0) {
    a.waitMs -= dtMs;
    a.moving = false;
    return { honk: false };
  }
  const blocker = blockerAhead(world, a, npcs);
  if (blocker) {
    a.moving = false;
    if (blocker === 'player' && a.species !== 'train') {
      if (a.honkAt === undefined) a.honkAt = now + 1500;
      else if (now >= a.honkAt) {
        a.honkAt = now + 3000;
        return { honk: true };
      }
    }
    return { honk: false };
  }
  delete a.honkAt;
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const dist = Math.hypot(dx, dy);
  const step = (def.speed * dtMs) / 1000;
  if (dist <= step) {
    a.x = a.tx;
    a.y = a.ty;
    nextLeg(a, now);
    a.moving = true;
    return { honk: false };
  }
  a.x += (dx / dist) * step;
  a.y += (dy / dist) * step;
  a.facing = legFacing(0, 0, Math.sign(dx), Math.sign(dy));
  a.moving = true;
  // buses pause at the stop, trains at the station
  if (a.species === 'bus' && Math.abs(a.x - center(BUS_STOP.x)) < step && Math.abs(a.y - center(BUS_STOP.y - 1)) < TILE && (a.stoppedAt === undefined || now - a.stoppedAt > 20_000)) {
    a.stoppedAt = now;
    a.waitMs = 4000;
    a.moving = false;
  }
  if (a.species === 'train' && Math.abs(a.x - center(TRAIN_STATION.x + 1)) < step && (a.stoppedAt === undefined || now - a.stoppedAt > 15_000)) {
    a.stoppedAt = now;
    a.waitMs = 5000;
    a.moving = false;
  }
  return { honk: false };
}

function nextLeg(a: AnimalState, now: number): void {
  void now;
  if (!a.route) return;
  if (a.route.loop === TRAIN_LOOP) {
    a.route.leg = a.route.leg ? 0 : 1;
    a.tx = center(a.route.leg ? RAIL_X1 : RAIL_X0);
    a.ty = center(RAIL_Y);
    a.facing = a.route.leg ? 'right' : 'left';
    return;
  }
  const L = LOOPS[a.route.loop] ?? LOOPS[0]!;
  const from = L.corners[a.route.leg]!;
  a.route.leg = (a.route.leg + 1) % 4;
  const to = L.corners[a.route.leg]!;
  a.tx = center(to[0]);
  a.ty = center(to[1]);
  a.facing = legFacing(from[0], from[1], to[0], to[1]);
}

/** Players may not walk into vehicles. */
export const vehicleBlocks = (world: WorldState, tx: number, ty: number): boolean => world.biome === 'by' && !!vehicleAt(world, tx, ty);
