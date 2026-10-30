// Builds a dungeon of Sagan om Världsträdet from its plan in saga.ts: the rooms, three-wide corridors
// between them, walls, torches, things along the walls, the gate after the mid-boss, the rest stones and
// every monster where it waits. Like Spelhallen it is its own map (`saga:<id>`), built fresh whenever the
// dungeon starts over, so nothing of it is saved.
import { addObject, emptyWorld, inBounds, tileIndex } from './map.ts';
import { mulberry32, randInt } from './rng.ts';
import { DUNGEONS, SAGA_BOSSES, SAGA_MOBS, sagaKey, type DungeonId, type SagaInstance, type SagaMob, type SagaRoom } from './saga.ts';
import { MAP_H, MAP_W, TILE, type AnimalState, type Terrain, type WorldState } from './types.ts';

/** What is outside the rooms: rock nobody walks on. */
const SOLID: Record<DungeonId, Terrain> = { draug: 'rock', frost: 'rock', surt: 'basalt' };
/** Members of a monster group stand around its middle like this. */
const PACK_SPOTS: [number, number][] = [
  [0, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [0, 2],
];

const centre = (r: SagaRoom): { x: number; y: number } => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

const STEPS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const TURN = 6;

/** The cheapest way across the free tiles from one tile to another, where every turn costs extra. */
function route(from: { x: number; y: number }, to: { x: number; y: number }, blocked: Uint8Array): number[] {
  const n = MAP_W * MAP_H * 4;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const push = (c: number, s: number): void => {
    heap.push([c, s]);
    for (let i = heap.length - 1; i > 0; ) {
      const up = (i - 1) >> 1;
      if (heap[up]![0] <= heap[i]![0]) break;
      [heap[up], heap[i]] = [heap[i]!, heap[up]!];
      i = up;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const startTile = tileIndex(from.x, from.y);
  for (let d = 0; d < 4; d++) {
    cost[startTile * 4 + d] = 0;
    push(0, startTile * 4 + d);
  }
  const goal = tileIndex(to.x, to.y);
  let end = -1;
  while (heap.length) {
    const [c, s] = pop();
    if (c > cost[s]!) continue;
    const k = s >> 2;
    if (k === goal) {
      end = s;
      break;
    }
    const d = s & 3;
    const x = k % MAP_W;
    const y = Math.floor(k / MAP_W);
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + STEPS[nd]![0];
      const ny = y + STEPS[nd]![1];
      if (!inBounds(nx, ny)) continue;
      const nk = tileIndex(nx, ny);
      if (blocked[nk] && nk !== goal) continue;
      const ns = nk * 4 + nd;
      const nc = c + 1 + (nd === d ? 0 : TURN);
      if (nc < cost[ns]!) {
        cost[ns] = nc;
        prev[ns] = s;
        push(nc, ns);
      }
    }
  }
  if (end < 0) {
    // no way around: straight across (an L), better than no corridor
    const tiles: number[] = [];
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) tiles.push(tileIndex(x, from.y));
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) tiles.push(tileIndex(to.x, y));
    return tiles;
  }
  const tiles: number[] = [];
  for (let s = end; s >= 0; s = prev[s]!) tiles.push(s >> 2);
  return tiles.reverse();
}

/** Puts a monster (or a boss) on the map and gives it its fight record. */
export function spawnSagaMob(world: WorldState, inst: SagaInstance, species: string, x: number, y: number, kind: SagaMob['kind'], pack: number): AnimalState {
  const boss = SAGA_BOSSES[species];
  const def = SAGA_MOBS[species];
  const a: AnimalState = {
    id: world.nextId++,
    species,
    name: boss?.name ?? def?.name ?? species,
    x,
    y,
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
    waitMs: 0,
  };
  world.animals[a.id] = a;
  const hp = boss?.hp ?? def?.hp ?? 1;
  inst.mobs[a.id] = { id: a.id, species, kind, hp, max: hp, home: { x, y }, pack, state: 'idle', threat: {}, atkAt: 0 };
  return a;
}

/** Builds dungeon `id` with all its monsters, ready for the family to walk in. */
export function generateSaga(id: DungeonId): WorldState {
  const def = DUNGEONS[id];
  const rnd = mulberry32(0x5a6a + DUNGEONS[id].chapter * 7919);
  const world = emptyWorld();
  world.area = sagaKey(id);
  world.biome = 'saga';
  world.players = {};
  const T = world.terrain;
  T.fill(SOLID[id]);
  /** 0 rock, 1 room, 2 corridor. */
  const floor = new Uint8Array(MAP_W * MAP_H);
  const roomOf = new Int16Array(MAP_W * MAP_H).fill(-1);
  const isFloor = (x: number, y: number): boolean => inBounds(x, y) && floor[tileIndex(x, y)]! > 0;

  def.rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const k = tileIndex(x, y);
        floor[k] = 1;
        roomOf[k] = i;
        T[k] = r.kind === 'boss' ? def.bossFloor : def.floor;
      }
  });

  // Corridors: three wide, from the middle of one room to the middle of the next, around the other rooms
  // and corridors (so no corridor makes a shortcut past the gate), with as few turns as possible.
  const corridorTiles: Set<number>[] = [];
  const corridor = new Uint8Array(MAP_W * MAP_H);
  for (const [ia, ib] of def.links) {
    const blocked = new Uint8Array(MAP_W * MAP_H);
    const own = (x: number, y: number): boolean =>
      [def.rooms[ia]!, def.rooms[ib]!].some((r) => x >= r.x - 2 && y >= r.y - 2 && x < r.x + r.w + 2 && y < r.y + r.h + 2);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const k = tileIndex(x, y);
        if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) blocked[k] = 1;
        else if (own(x, y)) continue;
        else
          for (let dy = -2; dy <= 2 && !blocked[k]; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const j = tileIndex(Math.min(MAP_W - 1, Math.max(0, x + dx)), Math.min(MAP_H - 1, Math.max(0, y + dy)));
              if (roomOf[j]! >= 0 || corridor[j]) {
                blocked[k] = 1;
                break;
              }
            }
      }
    const path = route(centre(def.rooms[ia]!), centre(def.rooms[ib]!), blocked);
    const set = new Set<number>();
    for (const k of path) {
      const x0 = k % MAP_W;
      const y0 = Math.floor(k / MAP_W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (!inBounds(x, y)) continue;
          const j = tileIndex(x, y);
          if (floor[j] === 0) {
            floor[j] = 2;
            T[j] = def.floor;
          }
          if (roomOf[j] === -1) {
            set.add(j);
            corridor[j] = 1;
          }
        }
    }
    corridorTiles.push(set);
  }

  // Walls: every rock tile that touches the floor.
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (isFloor(x, y)) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) touch = true;
      if (!touch) continue;
      T[tileIndex(x, y)] = def.floor;
      addObject(world, 'saga_wall', x, y, { variant: def.wall });
    }

  const inst: SagaInstance = {
    id,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    rests: [],
    checkpoint: -1,
    gate: [],
    gateOpen: false,
    packs: [],
    mobs: {},
    fighters: {},
    zones: [],
    mini: 0,
    boss: 0,
    miniDown: false,
    bossDown: false,
    looted: {},
    seq: 1,
  };
  world.saga = inst;

  // The gate: the corridor tiles right outside the gated room, on the way in.
  def.links.forEach(([, ib], li) => {
    const r = def.rooms[ib]!;
    if (!r.gated) return;
    for (const k of corridorTiles[li]!) {
      const x = k % MAP_W;
      const y = Math.floor(k / MAP_W);
      const touches = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return inBounds(nx, ny) && roomOf[tileIndex(nx, ny)] === ib;
      });
      if (touches && addObject(world, 'saga_gate', x, y, { variant: def.wall })) inst.gate.push({ x, y });
    }
  });

  /** Tiles next to a corridor mouth stay clear, so nothing blocks the way through a room. */
  const nearMouth = (x: number, y: number): boolean => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny) && floor[tileIndex(nx, ny)] === 2) return true;
      }
    return false;
  };
  const free = (x: number, y: number): boolean => isFloor(x, y) && world.occupancy[`${x},${y}`] === undefined;
  const px = (t: number): number => t * TILE + TILE / 2;

  def.rooms.forEach((r, ri) => {
    const c = centre(r);
    // torches on the top wall, every few tiles
    for (let x = r.x + 1; x < r.x + r.w - 1; x += 4) if (free(x, r.y) && !nearMouth(x, r.y)) addObject(world, 'saga_torch', x, r.y, { variant: def.wall });
    // things along the walls
    const along: { x: number; y: number }[] = [];
    for (let x = r.x; x < r.x + r.w; x++) along.push({ x, y: r.y + r.h - 1 });
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) along.push({ x: r.x, y }, { x: r.x + r.w - 1, y });
    const want = r.kind === 'boss' ? 10 : r.kind === 'rest' ? 2 : 4;
    for (let n = 0, tries = 0; n < want && tries < 60; tries++) {
      const s = along[Math.floor(rnd() * along.length)]!;
      if (!free(s.x, s.y) || nearMouth(s.x, s.y)) continue;
      const kind = def.decor[Math.floor(rnd() * def.decor.length)]!;
      if (addObject(world, kind, s.x, s.y, { variant: randInt(rnd, 0, 2) })) n++;
    }
    if (r.kind === 'start') {
      // the way out on the far side from the first corridor, and where you arrive in the middle
      const next = centre(def.rooms[def.links.find(([a]) => a === ri)?.[1] ?? 1]!);
      const dx = Math.sign(next.x - c.x);
      const dy = dx === 0 ? Math.sign(next.y - c.y) : 0;
      const ex = c.x - dx * (Math.floor(r.w / 2) - 1);
      const ey = c.y - dy * (Math.floor(r.h / 2) - 1);
      addObject(world, 'saga_exit', ex, ey, { variant: def.wall });
      inst.exit = { x: ex, y: ey };
      inst.start = { x: c.x, y: c.y };
    }
    if (r.kind === 'rest') {
      addObject(world, 'saga_rest', c.x, c.y, { variant: 0 });
      inst.rests.push({ x: c.x, y: c.y });
    }
    if (r.kind === 'treasure') addObject(world, 'saga_chest', c.x, c.y - 1, { variant: 0 });
    if (r.kind === 'mini') inst.mini = spawnSagaMob(world, inst, def.mini, px(c.x), px(c.y), 'mini', -1).id;
    if (r.kind === 'boss') inst.boss = spawnSagaMob(world, inst, def.boss, px(c.x), px(c.y), 'boss', -1).id;
    // monster groups spread along the room's long side
    const packs = r.packs ?? [];
    packs.forEach((members, pi) => {
      const f = (pi + 1) / (packs.length + 1);
      const mx = r.w >= r.h ? r.x + Math.round(r.w * f) : c.x;
      const my = r.w >= r.h ? c.y : r.y + Math.round(r.h * f);
      const pack = { members: [] as number[], dead: false };
      const index = inst.packs.length;
      inst.packs.push(pack);
      members.forEach((species, mi) => {
        const [ox, oy] = PACK_SPOTS[mi % PACK_SPOTS.length]!;
        pack.members.push(spawnSagaMob(world, inst, species, px(mx + ox), px(my + oy), 'mob', index).id);
      });
    });
  });
  return world;
}

/** Where a fallen player gets up: the last rest stone someone reached, else where you came in. */
export const sagaCheckpoint = (inst: SagaInstance): { x: number; y: number } => {
  const r = inst.rests[inst.checkpoint];
  return r ? { x: r.x, y: r.y + 1 } : inst.start;
};
