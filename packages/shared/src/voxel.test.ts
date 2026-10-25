import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  MAP_H,
  MAP_W,
  SPAWN,
  TILE,
  VB,
  addAnimal,
  addItem,
  applyMove,
  blockAt,
  bodyFree,
  cellBlock,
  columnTop,
  createPlayer,
  digBlock,
  generateWorld,
  getArea,
  invalidateColumn,
  isSolidForAnimal,
  key,
  objectAt,
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
