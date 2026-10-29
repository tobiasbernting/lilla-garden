import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  CLIFF_MAX,
  CLIFF_MIN,
  MAP_H,
  MAP_W,
  SPAWN,
  TILE,
  VB,
  WALL_TERRAIN,
  addAnimal,
  addItem,
  addObject,
  applyMove,
  arrivalTile,
  blockAt,
  blockedByTiles,
  bodyFree,
  cellBlock,
  columnTop,
  createPlayer,
  digBlock,
  emptyWorld,
  generateArea,
  generateMoon,
  generateWorld,
  getArea,
  inBounds,
  initVoxel,
  invalidateColumn,
  isCliff,
  isSolidForAnimal,
  key,
  landmarkFronts,
  objectAt,
  objectDef,
  performAction,
  placeBlock,
  setOnline,
  setVoxelMode,
  standHeight,
  steepTile,
  stepBody,
  tileIndex,
  mulberry32,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const ctx = (): SimCtx => ({ season: 'none', rnd: mulberry32(7), now: 1_000_000 });

function setup(): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Test', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
  setOnline(world, p.id, true);
  return { world, p };
}

/** A flat grass tile with nothing on it and flat neighbours, near spawn. */
function flatSpot(world: WorldState): { x: number; y: number } {
  for (let r = 2; r < 30; r++)
    for (let y = SPAWN.y - r; y <= SPAWN.y + r; y++)
      for (let x = SPAWN.x - r; x <= SPAWN.x + r; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++)
          for (let dx = -1; dx <= 1 && ok; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            if (world.terrain[tileIndex(tx, ty)] !== 'grass' || objectAt(world, tx, ty) || world.crops[key(tx, ty)] || columnTop(world, tx, ty) !== BASE) ok = false;
          }
        if (ok) return { x, y };
      }
  throw new Error('no flat spot');
}

const stand = (p: PlayerState, world: WorldState, x: number, y: number) => {
  p.x = x * TILE + TILE / 2;
  p.y = y * TILE + TILE / 2;
  p.z = standHeight(world, p.x, p.y);
};
const hold = (p: PlayerState, id: string) => {
  p.selected = p.inventory.findIndex((s) => s?.item === id);
};

describe('the 2D game without voxel mode', () => {
  it('generates worlds without a block layer, and moves stay 2D', () => {
    const { world, p } = setup();
    expect(world.voxel).toBeUndefined();
    applyMove(world, p.id, p.x + 4, p.y, 'right', true, 99);
    expect(p.z).toBeUndefined();
  });
});

describe('voxel worlds (the 3D game)', () => {
  beforeAll(() => setVoxelMode(true));
  afterAll(() => setVoxelMode(false));

  it('raises mountains at the edges but keeps the farmyard and the exits flat', () => {
    const { world } = setup();
    const v = world.voxel!;
    expect(v.heights).toHaveLength(MAP_W * MAP_H);
    const edgeMax = Math.max(...[2, 5, 58, 61].flatMap((y) => [6, 12, 52, 58].map((x) => v.heights[tileIndex(x, y)]!)));
    expect(edgeMax).toBeGreaterThan(BASE + 4);
    // the farmhouse and the spot people appear on stay at ground level
    expect(columnTop(world, 10, 7)).toBe(BASE);
    expect(columnTop(world, SPAWN.x, SPAWN.y)).toBe(BASE);
    // the openings to the next map (middle of each edge) stay walkable
    expect(columnTop(world, MAP_W / 2, 0)).toBe(BASE);
    expect(columnTop(world, 0, MAP_H / 2)).toBe(BASE);
  });

  it('grows forests with room to walk between the trees, and mixed kinds', () => {
    const { world } = setup();
    const trees = Object.values(world.objects).filter((o) => o.kind === 'tree' || o.kind === 'tree_pine' || o.kind === 'tree_apple');
    expect(trees.length).toBeGreaterThan(20);
    const at = new Set(trees.map((o) => key(o.x, o.y)));
    for (const o of trees) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) expect(at.has(key(o.x + dx, o.y + dy))).toBe(false);
    expect(new Set(trees.filter((o) => o.kind === 'tree').map((o) => o.variant)).size).toBeGreaterThan(2);
  });

  it('has ground on top, then earth, stone and bedrock', () => {
    const { world } = setup();
    const { x, y } = flatSpot(world);
    expect(cellBlock(world, x, y, BASE - 1)).toBe('dirt'); // grass looks like grass, digs as earth
    expect(cellBlock(world, x, y, BASE - 2)).toBe('dirt');
    expect(['stone', 'coal_ore', 'gold_ore', 'crystal_ore', 'bedrock', 'air']).toContain(cellBlock(world, x, y, BASE - 8));
    expect(blockAt(world, x, y, 0)).toBe(VB.bedrock);
    expect(blockAt(world, x, y, BASE)).toBe(VB.air);
  });

  it('digs a hole and fills it again, keeping the terrain in step', () => {
    const { world, p } = setup();
    const { x, y } = flatSpot(world);
    stand(p, world, x - 1, y);
    hold(p, 'hoe');
    const out = digBlock(world, p.id, x, y, BASE - 1, ctx());
    expect(out.some((c) => c.t === 'block')).toBe(true);
    expect(columnTop(world, x, y)).toBe(BASE - 1);
    expect(world.terrain[tileIndex(x, y)]).toBe('dirt');
    expect(p.inventory.some((s) => s?.item === 'dirt')).toBe(true);
    // put it back
    hold(p, 'dirt');
    placeBlock(world, p.id, x, y, BASE - 1);
    expect(columnTop(world, x, y)).toBe(BASE);
    expect(world.voxel!.edits[`${x},${y},${BASE - 1}`]).toBe(VB.dirt);
    // a dirt top can be hoed into a field again
    hold(p, 'hoe');
    performAction(world, p.id, x, y, ctx());
    expect(world.terrain[tileIndex(x, y)]).toBe('soil');
  });

  it('needs the pickaxe for stone, and refuses to dig under things', () => {
    const { world, p } = setup();
    const { x, y } = flatSpot(world);
    stand(p, world, x - 1, y);
    hold(p, 'hoe');
    digBlock(world, p.id, x, y, BASE - 1, ctx());
    digBlock(world, p.id, x, y, BASE - 2, ctx());
    digBlock(world, p.id, x, y, BASE - 3, ctx());
    digBlock(world, p.id, x, y, BASE - 4, ctx());
    stand(p, world, x, y); // down in the hole
    const below = BASE - 5;
    const kind = cellBlock(world, x, y, below);
    expect(['stone', 'coal_ore', 'gold_ore', 'crystal_ore', 'air']).toContain(kind);
    if (kind !== 'air') {
      const out = digBlock(world, p.id, x, y, below, ctx());
      expect(out.some((c) => c.t === 'toast')).toBe(true);
      hold(p, 'pick');
      digBlock(world, p.id, x, y, below, ctx());
      expect(blockAt(world, x, y, below)).toBe(VB.air);
    }
    // a tree's ground can't be dug away from under it
    const tree = Object.values(world.objects).find((o) => o.kind === 'tree')!;
    stand(p, world, tree.x, tree.y + 1);
    const top = columnTop(world, tree.x, tree.y);
    const out = digBlock(world, p.id, tree.x, tree.y, top - 1, ctx());
    expect(out.some((c) => c.t === 'block')).toBe(false);
  });

  it('walks up single steps, falls back down, and stops at walls', () => {
    const { world, p } = setup();
    // a flat, empty strip to walk along
    const y = 30;
    const x0 = 20;
    for (let x = x0 - 1; x <= x0 + 10; x++)
      for (let dy = -1; dy <= 1; dy++) {
        world.voxel!.heights[tileIndex(x, y + dy)] = BASE;
        world.terrain[tileIndex(x, y + dy)] = 'grass';
        const o = objectAt(world, x, y + dy);
        if (o) {
          delete world.objects[o.id];
          delete world.occupancy[key(x, y + dy)];
        }
        invalidateColumn(world, x, y + dy);
      }
    stand(p, world, x0, y);
    addItem(p.inventory, 'stone', 10);
    hold(p, 'stone');
    placeBlock(world, p.id, x0 + 2, y, BASE); // a step
    stand(p, world, x0 + 4, y);
    for (const h of [BASE, BASE + 1, BASE + 2]) placeBlock(world, p.id, x0 + 6, y, h); // a wall
    expect(columnTop(world, x0 + 6, y)).toBe(BASE + 3);
    stand(p, world, x0, y);
    const fall = { vz: 0, onGround: true };
    const zs: number[] = [];
    for (let i = 0; i < 90; i++) {
      stepBody(world, p, fall, 64, 0, 33, false, () => false);
      zs.push(p.z!);
    }
    expect(Math.max(...zs)).toBe(BASE + 1); // went up the step…
    expect(p.z).toBe(BASE); // …and back down after it
    expect(p.x).toBeLessThan((x0 + 6) * TILE); // the wall stops you
    expect(p.x).toBeGreaterThan((x0 + 5) * TILE);
    // jumping goes up and lands again
    stepBody(world, p, fall, 0, 0, 33, true, () => false);
    expect(p.z!).toBeGreaterThan(BASE);
    for (let i = 0; i < 60; i++) stepBody(world, p, fall, 0, 0, 33, false, () => false);
    expect(p.z).toBe(BASE);
    expect(fall.onGround).toBe(true);
  });

  it('only accepts moves into free space, and works out a missing height', () => {
    const { world, p } = setup();
    const { x, y } = flatSpot(world);
    stand(p, world, x, y);
    applyMove(world, p.id, p.x + 3, p.y, 'right', true, BASE);
    expect(p.x).toBe(x * TILE + TILE / 2 + 3);
    // into the ground: refused
    applyMove(world, p.id, p.x + 3, p.y, 'right', true, BASE - 3);
    expect(p.x).toBe(x * TILE + TILE / 2 + 3);
    expect(bodyFree(world, p.x, p.y, p.z!)).toBe(true);
    // no height (an older client, or just arrived): stands on the ground
    delete p.z;
    applyMove(world, p.id, p.x + 2, p.y, 'right', true);
    expect(p.z).toBe(BASE);
  });

  it('keeps animals off cliffs and out of holes', () => {
    const { world, p } = setup();
    const { x, y } = flatSpot(world);
    stand(p, world, x - 1, y);
    expect(isSolidForAnimal(world, x, y)).toBe(false);
    digBlock(world, p.id, x, y, BASE - 1, ctx());
    digBlock(world, p.id, x, y, BASE - 2, ctx());
    expect(steepTile(world, x, y)).toBe(true);
    expect(isSolidForAnimal(world, x, y)).toBe(true);
    void addAnimal;
  });

  it('builds the block layer for new areas too', () => {
    const { world } = setup();
    const a = getArea(world, 'a:1,0')!;
    expect(a.voxel?.heights).toHaveLength(MAP_W * MAP_H);
  });
});

describe('the wider world in blocks (3D game)', () => {
  beforeAll(() => setVoxelMode(true));
  afterAll(() => setVoxelMode(false));

  const N4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  /** Tiles you can walk to from the north opening: open ground, nothing solid, single steps up or down. */
  function reachable3D(a: WorldState): Uint8Array {
    const open = (x: number, y: number) => {
      if (WALL_TERRAIN.has(a.terrain[tileIndex(x, y)]!)) return false;
      const o = objectAt(a, x, y);
      return !(o && objectDef(o.kind).solid);
    };
    const start = tileIndex(MAP_W / 2, 1);
    const seen = new Uint8Array(MAP_W * MAP_H);
    seen[start] = 1;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const n = tileIndex(nx, ny);
        if (seen[n] || !open(nx, ny) || Math.abs(columnTop(a, nx, ny) - columnTop(a, x, y)) > 1) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    return seen;
  }

  /** Puts a player into an area map (as travel would) at a tile, standing on the ground. */
  function enter(world: WorldState, p: PlayerState, k: string, x: number, y: number): WorldState {
    const a = getArea(world, k)!;
    p.area = k;
    a.players[p.id] = p;
    stand(p, a, x, y);
    return a;
  }

  it('raises cliffs into rock walls you can neither walk into nor get stuck on', () => {
    const { world, p } = setup();
    for (const [ax, ay] of [
      [2, 0], // Bergen
      [2, 2], // Vulkanen
      [1, 1], // Dinodalen
    ] as const) {
      const flat = generateArea(ax, ay); // the map the block world was built from
      const a = getArea(world, `a:${ax},${ay}`)!;
      let cliffs = 0;
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          if (!isCliff(flat.terrain[tileIndex(x, y)]) || objectAt(a, x, y)) continue;
          cliffs++;
          const h = columnTop(a, x, y) - BASE;
          expect(a.terrain[tileIndex(x, y)]).toBe('stone');
          expect(h).toBeGreaterThanOrEqual(CLIFF_MIN);
          expect(h).toBeLessThanOrEqual(CLIFF_MAX);
          // solid rock right through, no earth on its face
          for (let z = BASE; z < BASE + h; z++) expect(['stone', 'coal_ore']).toContain(cellBlock(a, x, y, z));
          // a wall (two blocks or more) to every bit of open ground beside it
          for (const [dx, dy] of N4) {
            if (!inBounds(x + dx, y + dy) || isCliff(flat.terrain[tileIndex(x + dx, y + dy)]) || WALL_TERRAIN.has(a.terrain[tileIndex(x + dx, y + dy)]!)) continue;
            expect(h - (columnTop(a, x + dx, y + dy) - BASE)).toBeGreaterThanOrEqual(2);
          }
        }
      expect(cliffs).toBeGreaterThan(300);
    }
    // walking at a cliff stops at its foot…
    const a = getArea(world, 'a:2,0')!;
    const flat = generateArea(2, 0);
    let foot: { x: number; y: number } | null = null;
    for (let y = 2; y < MAP_H - 2 && !foot; y++)
      for (let x = 2; x < MAP_W - 2 && !foot; x++) {
        const below = [y + 1, y + 2].every((yy) => !isCliff(flat.terrain[tileIndex(x, yy)]) && !WALL_TERRAIN.has(a.terrain[tileIndex(x, yy)]!) && !objectAt(a, x, yy) && columnTop(a, x, yy) === BASE);
        if (isCliff(flat.terrain[tileIndex(x, y)]) && !objectAt(a, x, y) && below) foot = { x, y };
      }
    expect(foot).not.toBeNull();
    enter(world, p, 'a:2,0', foot!.x, foot!.y + 2);
    const fall = { vz: 0, onGround: true };
    for (let i = 0; i < 60; i++) stepBody(a, p, fall, 0, -64, 33, false, (x, y, z) => blockedByTiles(a, x, y, z));
    expect(p.y).toBeGreaterThanOrEqual((foot!.y + 1) * TILE + 0.3 * TILE - 0.01);
    expect(p.z).toBe(BASE);
    // …and whoever climbs up (building a pillar, say) can walk about on top
    stand(p, a, foot!.x, foot!.y);
    const top = p.z!;
    expect(top).toBe(columnTop(a, foot!.x, foot!.y));
    applyMove(a, p.id, p.x + 3, p.y, 'right', true, top);
    expect(p.x).toBe(foot!.x * TILE + TILE / 2 + 3);
    expect(p.z).toBe(top);
    // building on top of a cliff leaves it rock all the way down
    addItem(p.inventory, 'dirt', 3);
    hold(p, 'dirt');
    stand(p, a, foot!.x, foot!.y + 1);
    p.z = top; // (up on a pillar beside it)
    placeBlock(a, p.id, foot!.x, foot!.y, top);
    expect(columnTop(a, foot!.x, foot!.y)).toBe(top + 1);
    expect(a.terrain[tileIndex(foot!.x, foot!.y)]).toBe('dirt');
    for (let z = BASE; z < top; z++) expect(['stone', 'coal_ore']).toContain(cellBlock(a, foot!.x, foot!.y, z));
  });

  it('keeps every opening and entrance reachable on foot, and cave mouths at the foot of their cliff', () => {
    const world = generateWorld(1);
    // Bergen, Vulkanen, Dinodalen, Träsket, Svampskogen, Djungeln, Öknen, Isvidderna, Rymdbasen, Stranden, Skogen
    for (const k of ['a:2,0', 'a:2,2', 'a:1,1', 'a:-1,0', 'a:1,-1', 'a:-1,2', 'a:0,2', 'a:0,-2', 'a:1,3', 'a:-2,0', 'a:-1,-1']) {
      const a = getArea(world, k)!;
      const seen = reachable3D(a);
      for (const side of ['s', 'e', 'w'] as const) {
        const t = arrivalTile(side);
        expect(seen[tileIndex(t.x, t.y)], `${k} opening ${side}`).toBe(1);
      }
      for (const f of landmarkFronts(a)) expect(seen[tileIndex(f.x, f.y)], `${k} entrance front ${f.x},${f.y}`).toBe(1);
      for (const o of Object.values(a.objects)) {
        if (o.kind !== 'cave_mouth') continue;
        expect(columnTop(a, o.x, o.y), `${k} cave mouth`).toBe(BASE);
        expect(columnTop(a, o.x, o.y + 2), `${k} in front of the cave mouth`).toBe(BASE);
      }
    }
  });

  it('lays a way to an entrance that the mountains would cut off', () => {
    const a = emptyWorld();
    a.area = 'a:9,9';
    a.biome = 'berg'; // rugged mountains along the edges
    addObject(a, 'loot_chest', 4, 40);
    initVoxel(a, 4242);
    expect(reachable3D(a)[tileIndex(4, 41)]).toBe(1);
    // the mountains are still there on either side of it
    expect(Math.max(...[30, 34, 50, 54].map((y) => columnTop(a, 3, y) - BASE))).toBeGreaterThan(4);
  });

  it('lets the new grounds rise into hills, keeps every liquid flat and thins the jungle', () => {
    const world = generateWorld(1);
    const risen = new Set<string>();
    let liquids = 0;
    // Svampskogen, Dinodalen, Vulkanen, Träsket, Godislandet
    for (const k of ['a:1,-1', 'a:1,1', 'a:2,2', 'a:-1,0', 'a:-5,-5']) {
      const a = getArea(world, k)!;
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          const t = a.terrain[tileIndex(x, y)]!;
          const up = columnTop(a, x, y) - BASE;
          if (t === 'water' || t === 'bog' || t === 'lava' || t === 'choco') {
            liquids++;
            expect(up, `${k} ${t} at ${x},${y}`).toBe(0);
          } else if (up > 0) risen.add(t);
        }
    }
    expect(liquids).toBeGreaterThan(200);
    for (const t of ['moss', 'redsand', 'ash', 'mud', 'candy']) expect(risen).toContain(t);
    const jungle = getArea(world, 'a:-1,2')!;
    const trees = Object.values(jungle.objects).filter((o) => o.kind === 'jungle_tree');
    expect(trees.length).toBeGreaterThan(20);
    const at = new Set(trees.map((o) => key(o.x, o.y)));
    for (const o of trees) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) expect(at.has(key(o.x + dx, o.y + dy))).toBe(false);
  });

  it("can't dig away a swamp pool, and anything else digs like its kin", () => {
    const { world, p } = setup();
    const a = getArea(world, 'a:-1,0')!; // Träsket
    let spot: { x: number; y: number } | null = null;
    for (let y = 4; y < MAP_H - 4 && !spot; y++)
      for (let x = 4; x < MAP_W - 4 && !spot; x++)
        if (a.terrain[tileIndex(x, y)] === 'bog' && a.terrain[tileIndex(x - 1, y)] === 'mud' && !objectAt(a, x - 1, y) && columnTop(a, x - 1, y) === BASE) spot = { x, y };
    expect(spot).not.toBeNull();
    enter(world, p, 'a:-1,0', spot!.x - 1, spot!.y);
    hold(p, 'pick');
    const out = digBlock(a, p.id, spot!.x, spot!.y, BASE - 1, ctx());
    expect(out.some((c) => c.t === 'block')).toBe(false);
    expect(a.terrain[tileIndex(spot!.x, spot!.y)]).toBe('bog');
    // the mud you stand on digs as earth
    hold(p, 'hoe');
    digBlock(a, p.id, spot!.x - 1, spot!.y, BASE - 1, ctx());
    expect(columnTop(a, spot!.x - 1, spot!.y)).toBe(BASE - 1);
    expect(p.inventory.some((s) => s?.item === 'dirt')).toBe(true);
  });

  it('gives a moon with a block layer a flat sky around it that nobody walks or digs into', () => {
    const moon = generateMoon();
    initVoxel(moon, 99);
    let space = 0;
    let rim: { x: number; y: number } | null = null;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (moon.terrain[tileIndex(x, y)] !== 'space') {
          if (!rim && moon.terrain[tileIndex(x, y)] === 'moon' && moon.terrain[tileIndex(x + 1, y)] === 'space') rim = { x, y };
          continue;
        }
        space++;
        expect(columnTop(moon, x, y)).toBe(BASE);
        expect(blockAt(moon, x, y, BASE - 1)).toBe(VB.bedrock);
      }
    expect(space).toBeGreaterThan(1000);
    expect(rim).not.toBeNull();
    expect(columnTop(moon, rim!.x, rim!.y)).toBe(BASE);
    expect(blockedByTiles(moon, (rim!.x + 1) * TILE + TILE / 2, rim!.y * TILE + TILE / 2, BASE)).toBe(true);
  });
});
