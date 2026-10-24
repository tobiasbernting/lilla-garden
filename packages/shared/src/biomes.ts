// The world beyond the farm: an endless grid of 64x64 areas, each generated from its coordinates.
// Walking off an edge of one area puts you on the opposite edge of the next.
import { ANIMALS, NPCS } from './data.ts';
import { SPECIES_NAMES } from './sv.ts';
import { ensureBathhouse } from './bath.ts';
import { addObject, emptyWorld, inBounds, objectAt, tileIndex } from './map.ts';
import { mulberry32, randInt } from './rng.ts';
import type { Terrain, WorldState } from './types.ts';
import { MAP_H, MAP_W, TILE, key } from './types.ts';

export type Biome = 'skog' | 'ang' | 'is' | 'berg' | 'strand' | 'oken' | 'by';

export const BIOME_NAMES: Record<Biome | 'farm' | 'dungeon', string> = {
  farm: 'Hemma',
  dungeon: 'Grottan',
  skog: 'Skogen',
  ang: 'Ängen',
  is: 'Isvidderna',
  berg: 'Bergen',
  strand: 'Stranden',
  oken: 'Öknen',
  by: 'Byn',
};
export const BIOME_EMOJI: Record<Biome | 'farm' | 'dungeon', string> = {
  farm: '🏡',
  dungeon: '⚔️',
  skog: '🌲',
  ang: '🌼',
  is: '❄️',
  berg: '⛰️',
  strand: '🏖️',
  oken: '🌵',
  by: '🏘️',
};

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

/** Which biome an area has. North is colder, south warmer, mountains in the east, sea in the west. */
export function biomeAt(ax: number, ay: number): Biome {
  if (ax === 1 && ay === 0) return 'by'; // Byn, right next door
  if (Math.abs(ax) + Math.abs(ay) >= 4 && noise(ax, ay, 9) < 0.07) return 'by';
  const cold = -ay + (noise(ax, ay, 1) - 0.5) * 2; // ay < 0 is north
  const dry = ay + (noise(ax, ay, 2) - 0.5) * 2;
  if (cold >= 2.5) return 'is';
  if (dry >= 3) return 'oken';
  if (ax <= -2 && noise(ax, ay, 3) < 0.6) return 'strand';
  if (ax >= 2 && noise(ax, ay, 4) < 0.6) return 'berg';
  return noise(ax, ay, 5) < 0.55 ? 'skog' : 'ang';
}

/** Tile where a traveller arrives when entering from a side. */
export const EDGE_GAP = 3; // openings at the middle of each edge are 2*EDGE_GAP wide
export const arrivalTile = (from: 'n' | 's' | 'e' | 'w'): { x: number; y: number } => {
  const mid = MAP_W / 2;
  switch (from) {
    case 'n':
      return { x: mid, y: 1 };
    case 's':
      return { x: mid, y: MAP_H - 2 };
    case 'w':
      return { x: 1, y: mid };
    case 'e':
      return { x: MAP_W - 2, y: mid };
  }
};
/** Is this tile inside one of the four edge openings? */
export const inEdgeGap = (x: number, y: number): boolean => {
  const mid = MAP_W / 2;
  return (Math.abs(x - mid) < EDGE_GAP && (y < 4 || y >= MAP_H - 4)) || (Math.abs(y - mid) < EDGE_GAP && (x < 4 || x >= MAP_W - 4));
};

interface BiomeStyle {
  ground: Terrain;
  trees: number; // probability per tile in the border belt
  innerTrees: number;
  treeKinds: string[];
  rocks: number;
  rockKinds: string[];
  tufts: number;
  flowers: number;
  bushes: number;
  special: { kind: string; p: number }[];
  water: 'pond' | 'sea' | 'frozen' | 'none';
}

const STYLES: Record<Biome, BiomeStyle> = {
  skog: { ground: 'grass', trees: 0.75, innerTrees: 0.14, treeKinds: ['tree', 'tree', 'tree_pine'], rocks: 0.01, rockKinds: ['rock_small'], tufts: 0.05, flowers: 0.02, bushes: 0.03, special: [{ kind: 'mushroom', p: 0.012 }], water: 'none' },
  ang: { ground: 'grass', trees: 0.5, innerTrees: 0.02, treeKinds: ['tree', 'tree_apple'], rocks: 0.01, rockKinds: ['rock_small'], tufts: 0.1, flowers: 0.12, bushes: 0.01, special: [{ kind: 'beehive', p: 0.003 }], water: 'pond' },
  is: { ground: 'snow', trees: 0.5, innerTrees: 0.05, treeKinds: ['tree_pine'], rocks: 0.03, rockKinds: ['rock', 'rock_small'], tufts: 0, flowers: 0, bushes: 0, special: [{ kind: 'iceberry', p: 0.015 }, { kind: 'snowman_wild', p: 0.002 }], water: 'frozen' },
  berg: { ground: 'gravel', trees: 0.3, innerTrees: 0.03, treeKinds: ['tree_pine'], rocks: 0.14, rockKinds: ['rock', 'rock', 'rock_small', 'ore'], tufts: 0.02, flowers: 0.01, bushes: 0.01, special: [], water: 'none' },
  strand: { ground: 'sand', trees: 0.3, innerTrees: 0.02, treeKinds: ['palm'], rocks: 0.02, rockKinds: ['rock_small'], tufts: 0.03, flowers: 0, bushes: 0, special: [{ kind: 'shell', p: 0.02 }], water: 'sea' },
  by: { ground: 'grass', trees: 0.6, innerTrees: 0.0, treeKinds: ['tree', 'tree_apple'], rocks: 0, rockKinds: [], tufts: 0.04, flowers: 0.06, bushes: 0, special: [], water: 'none' },
  oken: { ground: 'sand', trees: 0.15, innerTrees: 0.01, treeKinds: ['palm'], rocks: 0.05, rockKinds: ['rock', 'rock_small'], tufts: 0.01, flowers: 0, bushes: 0, special: [{ kind: 'cactus', p: 0.02 }], water: 'none' },
};

/** Builds a biome area for grid coordinates (ax, ay). Deterministic. */
export function generateArea(ax: number, ay: number, worldSeed = 1337): WorldState {
  const biome = biomeAt(ax, ay);
  const st = STYLES[biome];
  const rnd = mulberry32(hash(ax, ay, worldSeed));
  const world = emptyWorld();
  world.area = areaKey(ax, ay);
  world.biome = biome;
  const T = world.terrain;
  T.fill(st.ground);

  // Water
  if (st.water === 'pond' || st.water === 'frozen') {
    const cx = randInt(rnd, 18, 46);
    const cy = randInt(rnd, 18, 46);
    const rx = randInt(rnd, 4, 8);
    const ry = randInt(rnd, 3, 6);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) T[tileIndex(x, y)] = st.water === 'frozen' ? 'ice' : 'water';
        else if (d <= 1.6 && st.water === 'pond') T[tileIndex(x, y)] = 'sand';
      }
  } else if (st.water === 'sea') {
    // sea along the west side, wavy shoreline
    for (let y = 0; y < MAP_H; y++) {
      const shore = 10 + Math.round(Math.sin(y / 5) * 2 + (rnd() - 0.5) * 2);
      for (let x = 0; x < shore; x++) if (!inEdgeGap(x, y)) T[tileIndex(x, y)] = 'water';
    }
  }

  const tryObj = (x: number, y: number, kind: string) => {
    if (!inBounds(x, y) || inEdgeGap(x, y)) return;
    const t = T[tileIndex(x, y)];
    if (t === 'water' || t === 'ice') return;
    if (objectAt(world, x, y)) return;
    addObject(world, kind, x, y);
  };
  const pick = (arr: string[]) => arr[Math.floor(rnd() * arr.length)]!;

  // Border belt of trees (keeps areas feeling enclosed, openings at the edge gaps)
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      if (edge <= 1 && rnd() < 0.95) tryObj(x, y, pick(st.treeKinds));
      else if (edge <= 3 && rnd() < st.trees) tryObj(x, y, pick(st.treeKinds));
      else if (edge > 3) {
        const r = rnd();
        if (r < st.innerTrees) tryObj(x, y, pick(st.treeKinds));
        else if (r < st.innerTrees + st.rocks) tryObj(x, y, pick(st.rockKinds));
        else if (r < st.innerTrees + st.rocks + st.bushes) tryObj(x, y, 'bush');
        else if (r < st.innerTrees + st.rocks + st.bushes + st.tufts) tryObj(x, y, 'grass_tuft');
        else if (r < st.innerTrees + st.rocks + st.bushes + st.tufts + st.flowers) tryObj(x, y, 'flower');
        else {
          for (const sp of st.special) if (rnd() < sp.p) tryObj(x, y, sp.kind);
        }
      }
    }
  if (biome === 'by') buildVillage(world, rnd);
  // Wild animals of this biome
  const wild = Object.values(ANIMALS).find((a) => a.wild === biome);
  if (wild) {
    const n = randInt(rnd, 3, 5);
    let tries = 0;
    let placed = 0;
    while (placed < n && tries++ < 200) {
      const x = randInt(rnd, 6, MAP_W - 7);
      const y = randInt(rnd, 6, MAP_H - 7);
      const t = T[tileIndex(x, y)];
      if (t === 'water' || t === 'ice' || objectAt(world, x, y) || inEdgeGap(x, y)) continue;
      const id = world.nextId++;
      world.animals[id] = {
        id,
        species: wild.species,
        name: SPECIES_NAMES[wild.species] ?? wild.species,
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
      placed++;
    }
  }
  // A signpost at every arrival tile pointing home-ish (decoration)
  for (const side of ['n', 's', 'e', 'w'] as const) {
    const a = arrivalTile(side);
    const sx = side === 'e' || side === 'w' ? a.x : a.x + 2;
    const sy = side === 'n' || side === 's' ? a.y : a.y + 2;
    tryObj(sx, sy, 'signpost');
  }
  return world;
}

/** Opens paths out of the farm at the middle of each edge (idempotent). */
export function ensureFarmExits(world: WorldState): void {
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (!inEdgeGap(x, y)) continue;
      const o = objectAt(world, x, y);
      if (o && (o.kind.startsWith('tree') || o.kind === 'bush' || o.kind.startsWith('rock'))) {
        delete world.objects[o.id];
        delete world.occupancy[key(x, y)];
      }
      if (world.terrain[tileIndex(x, y)] === 'water') world.terrain[tileIndex(x, y)] = 'sand';
      const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      if (edge <= 3 && world.terrain[tileIndex(x, y)] === 'grass') world.terrain[tileIndex(x, y)] = 'path_dirt';
    }
}

/** A village square with houses, a well, a market and a buyer, lanterns and flowers. */
function buildVillage(world: WorldState, rnd: () => number): void {
  const T = world.terrain;
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  const clear = (x: number, y: number) => {
    const o = objectAt(world, x, y);
    if (o) {
      delete world.objects[o.id];
      delete world.occupancy[key(x, y)];
    }
  };
  // plaza
  for (let y = cy - 7; y <= cy + 7; y++)
    for (let x = cx - 9; x <= cx + 9; x++) {
      clear(x, y);
      T[tileIndex(x, y)] = 'path_stone';
    }
  // roads to the four edges
  for (let y = 0; y < MAP_H; y++) for (let x = cx - 1; x <= cx; x++) if (!(x >= cx - 9 && y >= cy - 7 && y <= cy + 7)) { clear(x, y); T[tileIndex(x, y)] = 'path_dirt'; }
  for (let x = 0; x < MAP_W; x++) for (let y = cy - 1; y <= cy; y++) if (!(y >= cy - 7 && x >= cx - 9 && x <= cx + 9)) { clear(x, y); T[tileIndex(x, y)] = 'path_dirt'; }
  // houses around the plaza (3x3 footprints) with varied roofs
  const houses: [number, number][] = [
    [cx - 9, cy - 11],
    [cx - 4, cy - 11],
    [cx + 2, cy - 11],
    [cx + 7, cy - 11],
    [cx - 13, cy - 4],
    [cx - 13, cy + 2],
    [cx + 11, cy - 4],
    [cx + 11, cy + 2],
    [cx - 9, cy + 9],
    [cx + 7, cy + 9],
  ];
  houses.forEach(([x, y], i) => {
    for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 3; dx++) clear(x + dx, y + dy);
    addObject(world, 'house_small', x, y, { variant: i % 4 });
  });
  addObject(world, 'town_well', cx, cy - 1);
  addObject(world, 'market', cx - 6, cy - 5);
  addObject(world, 'sellstall', cx + 4, cy - 5);
  for (const [x, y] of [
    [cx - 9, cy - 7],
    [cx + 9, cy - 7],
    [cx - 9, cy + 7],
    [cx + 9, cy + 7],
  ] as const)
    addObject(world, 'lantern', x, y);
  for (const [x, y] of [
    [cx - 7, cy + 5],
    [cx + 6, cy + 5],
    [cx - 2, cy + 7],
    [cx + 2, cy + 7],
  ] as const)
    addObject(world, 'flowerbox', x, y);
  addObject(world, 'bench', cx - 3, cy + 2);
  addObject(world, 'bench', cx + 2, cy + 2);
  ensureBathhouse(world);
  // villagers must be able to stand on their spots
  for (const n of Object.values(NPCS)) {
    if (n.area !== world.area) continue;
    for (const w of [n, ...n.routine]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) clear(w.x + dx, w.y + dy);
  }
  void rnd;
}
