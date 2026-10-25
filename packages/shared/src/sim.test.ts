import { describe, expect, it } from 'vitest';
import {
  CROPS,
  DAY_LENGTH_MS,
  SPAWN,
  TILE,
  addAnimal,
  addItem,
  addObject,
  CAVE_EXIT_TILE,
  MAX_HEARTS,
  applyMove,
  areaOf,
  getArea,
  BATH_EXIT,
  BATH_POOL,
  SWIM_SPEED_MUL,
  PLAYER_SPEED,
  inPool,
  ensureBathhouse,
  arrivalTile,
  biomeAt,
  generateArea,
  spawnDrop,
  teleport,
  travel,
  rideSpeedMul,
  honk,
  bump,
  dungeonStart,
  generateDungeon,
  spawnMob,
  npcAt,
  npcState,
  npcsIn,
  completeQuest,
  cook,
  buy,
  countItem,
  craft,
  createPlayer,
  dropItem,
  emote,
  equip,
  generateWorld,
  isSolidForPlayer,
  isHostile,
  isPetAnimal,
  ANIMALS,
  key,
  mulberry32,
  nameAnimal,
  newDay,
  objectAt,
  performAction,
  resolveMove,
  seasonForDate,
  sell,
  setOnline,
  stepPlayer,
  BOOST_SPEED_MUL,
  ensurePizzeria,
  swapSlots,
  tick,
  tileIndex,
  paint,
  swapSlots as swap,
  PAINT_EMPTY,
  type Change,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const ctx = (season: SimCtx['season'] = 'none'): SimCtx => ({ season, rnd: mulberry32(7), now: 1_000_000 });

function setup(): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Test', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
  setOnline(world, p.id, true);
  return { world, p };
}

/** Puts the player at a tile and clears that tile and its neighbour for actions. */
function standAt(world: WorldState, p: PlayerState, tx: number, ty: number): void {
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE / 2;
  p.facing = 'right';
}

function clearTile(world: WorldState, tx: number, ty: number): void {
  const o = objectAt(world, tx, ty);
  if (o) {
    delete world.objects[o.id];
    for (const [k, id] of Object.entries(world.occupancy)) if (id === o.id) delete world.occupancy[k];
  }
  world.terrain[tileIndex(tx, ty)] = 'grass';
  delete world.crops[key(tx, ty)];
}

const select = (p: PlayerState, itemId: string): void => {
  const i = p.inventory.findIndex((s) => s?.item === itemId);
  if (i < 0) throw new Error(`not holding ${itemId}`);
  p.selected = i;
};

const toasts = (ch: Change[]): string[] => ch.filter((c) => c.t === 'toast').map((c) => (c as { text: string }).text);

describe('map', () => {
  it('generates a farm with fixtures and open spawn', () => {
    const world = generateWorld();
    expect(world.terrain.length).toBe(64 * 64);
    const kinds = new Set(Object.values(world.objects).map((o) => o.kind));
    for (const k of ['house', 'mailbox', 'sellbox', 'wardrobe', 'start_chest', 'start_bench', 'tree', 'rock', 'grass_tuft']) expect(kinds.has(k)).toBe(true);
    expect(isSolidForPlayer(world, SPAWN.x, SPAWN.y)).toBe(false);
    expect(world.terrain.includes('water')).toBe(true);
  });
});

describe('movement', () => {
  it('slides along solids and stays in bounds', () => {
    const solid = (tx: number, ty: number) => tx === 5 || ty < 0 || tx < 0;
    // Moving right into column 5 is blocked, vertical still allowed
    const r = resolveMove(solid, 4 * TILE + 2, 40, 5 * TILE + 2, 48);
    expect(r.x).toBe(4 * TILE + 2);
    expect(r.y).toBe(48);
    const b = resolveMove(solid, 20, 20, -100, -100);
    expect(b.x).toBeGreaterThanOrEqual(5);
    expect(b.y).toBeGreaterThanOrEqual(3);
  });

  it('stepPlayer moves at PLAYER_SPEED and faces the direction', () => {
    const { world, p } = setup();
    const x0 = p.x;
    stepPlayer(world, p, 1, 0, 500);
    expect(p.x).toBeCloseTo(x0 + 32, 3);
    expect(p.facing).toBe('right');
    expect(p.moving).toBe(true);
    stepPlayer(world, p, 0, 0, 100);
    expect(p.moving).toBe(false);
  });

  it('cannot walk into water or trees', () => {
    const { world, p } = setup();
    const water = world.terrain.indexOf('water');
    const wx = water % 64;
    const wy = Math.floor(water / 64);
    standAt(world, p, wx - 1, wy);
    for (let i = 0; i < 40; i++) stepPlayer(world, p, 1, 0, 50);
    expect(Math.floor(p.x / TILE)).toBeLessThan(wx);
    applyMove(world, p.id, wx * TILE + 8, wy * TILE + 8, 'right', false);
    expect(Math.floor(p.x / TILE)).toBeLessThan(wx);
  });
});

describe('farming', () => {
  it('hoe, plant, water, grow, harvest with seeds back', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'hoe');
    performAction(world, p.id, 21, 20, ctx());
    expect(world.terrain[tileIndex(21, 20)]).toBe('soil');
    select(p, 'carrot_seed');
    const seedsBefore = countItem(p.inventory, 'carrot_seed');
    performAction(world, p.id, 21, 20, ctx());
    expect(countItem(p.inventory, 'carrot_seed')).toBe(seedsBefore - 1);
    expect(world.crops['21,20']?.crop).toBe('carrot');
    expect(world.crops['21,20']?.watered).toBe(false);
    select(p, 'can');
    const can = p.inventory[p.selected]!;
    performAction(world, p.id, 21, 20, ctx());
    expect(can.charges).toBe(19);
    expect(world.crops['21,20']?.watered).toBe(true);
    expect(world.terrain[tileIndex(21, 20)]).toBe('soil_wet');
    const days = CROPS.carrot!.stages.length;
    for (let d = 0; d < days; d++) {
      newDay(world, ctx());
      expect(world.terrain[tileIndex(21, 20)]).toBe('soil');
      if (d < days - 1) {
        world.crops['21,20']!.watered = true;
      }
    }
    expect(world.crops['21,20']?.stage).toBe(days);
    select(p, 'hoe'); // harvesting works regardless of held item
    const ch = performAction(world, p.id, 21, 20, ctx());
    expect(countItem(p.inventory, 'carrot')).toBeGreaterThanOrEqual(1);
    expect(countItem(p.inventory, 'carrot_seed')).toBeGreaterThanOrEqual(seedsBefore);
    expect(world.crops['21,20']).toBeUndefined();
    expect(ch.some((c) => c.t === 'fx')).toBe(true);
  });

  it('unwatered crops do not grow; strawberries regrow after harvest', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    world.terrain[tileIndex(21, 20)] = 'soil';
    addItem(p.inventory, 'strawberry_seed', 1);
    select(p, 'strawberry_seed');
    performAction(world, p.id, 21, 20, ctx());
    newDay(world, ctx());
    expect(world.crops['21,20']?.stage).toBe(0);
    const def = CROPS.strawberry!;
    const total = def.stages.reduce((a, b) => a + b, 0);
    for (let i = 0; i < total; i++) {
      world.crops['21,20']!.watered = true;
      newDay(world, ctx());
    }
    expect(world.crops['21,20']?.stage).toBe(def.stages.length);
    performAction(world, p.id, 21, 20, ctx());
    expect(world.crops['21,20']?.stage).toBe(def.regrowTo);
    expect(countItem(p.inventory, 'strawberry')).toBeGreaterThanOrEqual(1);
  });

  it('refills the can at water and reports an empty can', () => {
    const { world, p } = setup();
    const water = world.terrain.indexOf('water');
    const wx = water % 64;
    const wy = Math.floor(water / 64);
    select(p, 'can');
    const can = p.inventory[p.selected]!;
    can.charges = 0;
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    world.terrain[tileIndex(21, 20)] = 'soil';
    expect(toasts(performAction(world, p.id, 21, 20, ctx()))).toContain('Vattenkannan är tom – fyll på vid vatten');
    standAt(world, p, wx - 1, wy);
    performAction(world, p.id, wx, wy, ctx());
    expect(can.charges).toBe(20);
  });

  it('scythe reverts soil to grass', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    world.terrain[tileIndex(21, 20)] = 'soil';
    select(p, 'scythe');
    performAction(world, p.id, 21, 20, ctx());
    expect(world.terrain[tileIndex(21, 20)]).toBe('grass');
  });
});

describe('resources and building', () => {
  it('chops a tree with the axe only, gets wood, leaves a stump', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    const tree = addObject(world, 'tree', 21, 20)!;
    select(p, 'pick');
    const ch = performAction(world, p.id, 21, 20, ctx());
    expect(world.objects[tree.id]).toBeDefined();
    expect(toasts(ch)[0]).toContain('Behöver Yxa');
    select(p, 'axe');
    performAction(world, p.id, 21, 20, ctx());
    expect(world.objects[tree.id]).toBeUndefined();
    expect(countItem(p.inventory, 'wood')).toBeGreaterThanOrEqual(3);
    expect(objectAt(world, 21, 20)?.kind).toBe('stump');
    performAction(world, p.id, 21, 20, ctx());
    expect(objectAt(world, 21, 20)).toBeUndefined();
  });

  it('crafts a fence at the bench and places it, hammer takes it back', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'wood', 2);
    const ch = craft(world, p.id, 'fence');
    expect(countItem(p.inventory, 'fence')).toBe(4);
    expect(countItem(p.inventory, 'wood')).toBe(0);
    expect(ch.some((c) => c.t === 'player')).toBe(true);
    expect(craft(world, p.id, 'barn').some((c) => c.t === 'toast')).toBe(true);
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'fence');
    performAction(world, p.id, 21, 20, ctx());
    expect(objectAt(world, 21, 20)?.kind).toBe('fence');
    expect(countItem(p.inventory, 'fence')).toBe(3);
    expect(isSolidForPlayer(world, 21, 20)).toBe(true);
    select(p, 'hammer');
    performAction(world, p.id, 21, 20, ctx());
    expect(objectAt(world, 21, 20)).toBeUndefined();
    expect(countItem(p.inventory, 'fence')).toBe(4);
  });

  it('paths set terrain and cannot be placed on water; hammer refunds', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'path_stone', 2);
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'path_stone');
    performAction(world, p.id, 21, 20, ctx());
    expect(world.terrain[tileIndex(21, 20)]).toBe('path_stone');
    expect(objectAt(world, 21, 20)).toBeUndefined();
    world.terrain[tileIndex(21, 21)] = 'water';
    performAction(world, p.id, 21, 21, ctx());
    expect(world.terrain[tileIndex(21, 21)]).toBe('water');
    expect(countItem(p.inventory, 'path_stone')).toBe(1);
    select(p, 'hammer');
    performAction(world, p.id, 21, 20, ctx());
    expect(world.terrain[tileIndex(21, 20)]).toBe('grass');
    expect(countItem(p.inventory, 'path_stone')).toBe(2);
  });

  it('cannot place a building on top of a player', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'coop', 1);
    standAt(world, p, 20, 20);
    for (let y = 20; y < 22; y++) for (let x = 20; x < 23; x++) clearTile(world, x, y);
    select(p, 'coop');
    const ch = performAction(world, p.id, 20, 20, ctx());
    expect(toasts(ch)).toContain('Går inte att bygga här');
    performAction(world, p.id, 21, 20, ctx());
    expect(objectAt(world, 22, 21)?.kind).toBe('coop');
  });

  it('chest: swap items in and out, breaking it returns contents', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'chest', 1);
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'chest');
    performAction(world, p.id, 21, 20, ctx());
    const chest = objectAt(world, 21, 20)!;
    expect(chest.items?.length).toBe(32);
    const open = performAction(world, p.id, 21, 20, ctx());
    expect(open.some((c) => c.t === 'open' && c.ui === 'chest' && c.id === chest.id)).toBe(true);
    const seedSlot = p.inventory.findIndex((s) => s?.item === 'carrot_seed');
    swapSlots(world, p.id, { slot: seedSlot }, { chest: chest.id, slot: 3 });
    expect(chest.items![3]?.item).toBe('carrot_seed');
    expect(p.inventory[seedSlot]).toBeNull();
    // Too far away: no swap
    standAt(world, p, 40, 40);
    swapSlots(world, p.id, { chest: chest.id, slot: 3 }, { slot: seedSlot });
    expect(chest.items![3]?.item).toBe('carrot_seed');
    standAt(world, p, 20, 20);
    select(p, 'hammer');
    performAction(world, p.id, 21, 20, ctx());
    expect(countItem(p.inventory, 'carrot_seed')).toBe(6);
    expect(countItem(p.inventory, 'chest')).toBe(1);
  });
});

describe('own house and paint', () => {
  it('places walls, windows and a passable door; floor paints the ground', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    for (const [x, y] of [[21, 19], [21, 20], [21, 21], [19, 20]] as const) clearTile(world, x, y);
    addItem(p.inventory, 'wood', 10);
    addItem(p.inventory, 'stone', 2);
    craft(world, p.id, 'wall_wood');
    craft(world, p.id, 'window');
    craft(world, p.id, 'door');
    expect(countItem(p.inventory, 'wall_wood')).toBe(2);
    select(p, 'wall_wood');
    performAction(world, p.id, 21, 19, ctx());
    select(p, 'window');
    performAction(world, p.id, 21, 20, ctx());
    select(p, 'door');
    performAction(world, p.id, 21, 21, ctx());
    expect(objectAt(world, 21, 19)?.kind).toBe('wall_wood');
    expect(objectAt(world, 21, 20)?.kind).toBe('window');
    expect(objectAt(world, 21, 21)?.kind).toBe('door');
    expect(isSolidForPlayer(world, 21, 19)).toBe(true);
    expect(isSolidForPlayer(world, 21, 20)).toBe(true);
    expect(isSolidForPlayer(world, 21, 21)).toBe(false);
    expect(p.stats?.walls).toBe(3);
    // floor planks paint the ground; the hammer takes them back
    addItem(p.inventory, 'floor_wood', 2);
    select(p, 'floor_wood');
    performAction(world, p.id, 19, 20, ctx());
    expect(world.terrain[tileIndex(19, 20)]).toBe('floor_wood');
    expect(countItem(p.inventory, 'floor_wood')).toBe(1);
    select(p, 'hammer');
    performAction(world, p.id, 19, 20, ctx());
    expect(world.terrain[tileIndex(19, 20)]).toBe('grass');
    expect(countItem(p.inventory, 'floor_wood')).toBe(2);
  });

  it('allows furniture on wooden floor outside the farmhouse', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    clearTile(world, 21, 21);
    world.terrain[tileIndex(21, 20)] = 'floor_wood';
    world.terrain[tileIndex(21, 21)] = 'floor_wood';
    addItem(p.inventory, 'bed', 1);
    select(p, 'bed');
    performAction(world, p.id, 21, 20, ctx());
    expect(objectAt(world, 21, 20)?.kind).toBe('bed');
    expect(objectAt(world, 21, 21)?.kind).toBe('bed');
  });

  it('paints the farmhouse, and a wall piece together with everything connected to it', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    for (const [x, y] of [[21, 19], [21, 20], [21, 21], [19, 20], [20, 19]] as const) clearTile(world, x, y);
    addItem(p.inventory, 'wall_wood', 2);
    addItem(p.inventory, 'door', 1);
    addItem(p.inventory, 'paint_blue', 2);
    select(p, 'wall_wood');
    performAction(world, p.id, 21, 19, ctx());
    performAction(world, p.id, 19, 20, ctx()); // not connected
    select(p, 'door');
    performAction(world, p.id, 21, 20, ctx());
    select(p, 'paint_blue');
    const ch = performAction(world, p.id, 21, 19, ctx());
    expect(objectAt(world, 21, 19)?.variant).toBe(3);
    expect(objectAt(world, 21, 20)?.variant).toBe(3);
    expect(objectAt(world, 19, 20)?.variant).toBeUndefined();
    expect(countItem(p.inventory, 'paint_blue')).toBe(1);
    expect(toasts(ch).some((t) => t.includes('målat'))).toBe(true);
    expect(p.stats?.painted).toBe(1);
    // the farmhouse
    const house = Object.values(world.objects).find((o) => o.kind === 'house')!;
    standAt(world, p, house.x + 2, house.y + 4);
    performAction(world, p.id, house.x + 2, house.y + 3, ctx());
    expect(house.variant).toBe(3);
    expect(countItem(p.inventory, 'paint_blue')).toBe(0);
    // paint on something else just says no
    addItem(p.inventory, 'paint_red', 1);
    select(p, 'paint_red');
    standAt(world, p, 20, 20);
    const rock = addObject(world, 'rock', 20, 19)!;
    const ch2 = performAction(world, p.id, 20, 19, ctx());
    expect(world.objects[rock.id]).toBeDefined();
    expect(toasts(ch2).length).toBe(1);
    expect(countItem(p.inventory, 'paint_red')).toBe(1);
  });
});

describe('economy', () => {
  it('buys seeds, refuses when poor, sells crops', () => {
    const { world, p } = setup();
    buy(world, p.id, 'carrot_seed', 5, ctx());
    expect(p.coins).toBe(100);
    expect(countItem(p.inventory, 'carrot_seed')).toBe(11);
    expect(toasts(buy(world, p.id, 'pumpkin_seed', 10, ctx()))).toContain('Inte tillräckligt med kr');
    addItem(p.inventory, 'pumpkin', 2);
    const slot = p.inventory.findIndex((s) => s?.item === 'pumpkin');
    sell(world, p.id, slot, 99);
    expect(p.coins).toBe(220);
    expect(countItem(p.inventory, 'pumpkin')).toBe(0);
    expect(toasts(sell(world, p.id, 0, 1))).toContain('Inget händer här'); // tools cannot be sold
  });

  it('season items only in season', () => {
    const { world, p } = setup();
    p.coins = 1000;
    expect(buy(world, p.id, 'hat_santa', 1, ctx('none'))).toEqual([]);
    buy(world, p.id, 'hat_santa', 1, ctx('jul'));
    expect(p.wardrobe).toContain('hat_santa');
    equip(world, p.id, 'hat', 'hat_santa');
    expect(p.outfit.hat).toBe('hat_santa');
    equip(world, p.id, 'shirt', 'hat_santa');
    expect(p.outfit.shirt).toBe('shirt_blue');
    equip(world, p.id, 'hat', null);
    expect(p.outfit.hat).toBeUndefined();
  });

  it('animals need a house, arrive next morning, produce when happy and fed', () => {
    const { world, p } = setup();
    p.coins = 1000;
    expect(toasts(buy(world, p.id, 'animal_hen', 1, ctx()))).toContain('Bygg ett Hönshus först');
    for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) clearTile(world, x, y);
    const coop = addObject(world, 'coop', 30, 30)!;
    for (let i = 0; i < 4; i++) expect(toasts(buy(world, p.id, 'animal_hen', 1, ctx()))[0]).toContain('flyttar in i morgon');
    expect(toasts(buy(world, p.id, 'animal_hen', 1, ctx()))).toContain('Fullt i Hönshus');
    expect(p.coins).toBe(1000 - 4 * 150);
    expect(p.orders.length).toBe(4);
    const ch = newDay(world, ctx());
    expect(Object.keys(world.animals).length).toBe(4);
    expect(toasts(ch).some((t) => t.includes('En ny vän har flyttat in'))).toBe(true);
    const hen = Object.values(world.animals)[0]!;
    expect(hen.homeId).toBe(coop.id);
    expect(hen.named).toBe(false);
    // Feed, pet, brush over days until it lays an egg
    hen.x = 33 * TILE + 8;
    hen.y = 33 * TILE + 8;
    standAt(world, p, 32, 33);
    addItem(p.inventory, 'hay', 10);
    for (let d = 0; d < 4; d++) {
      select(p, 'hay');
      performAction(world, p.id, 33, 33, ctx());
      expect(hen.fed).toBe(true);
      expect(toasts(performAction(world, p.id, 33, 33, ctx()))[0]).toContain('är mätt');
      select(p, 'brush');
      performAction(world, p.id, 33, 33, ctx());
      expect(hen.brushed).toBe(true);
      select(p, 'hoe');
      if (hen.hasProduct) {
        expect(d).toBe(3); // grown up after 3 days, fed and happy
        performAction(world, p.id, 33, 33, ctx());
        expect(countItem(p.inventory, 'egg')).toBe(1);
        expect(hen.hasProduct).toBe(false);
      }
      const pet = performAction(world, p.id, 33, 33, ctx());
      expect(hen.petted).toBe(true);
      if (d === 0) expect(pet.some((c) => c.t === 'open' && c.ui === 'nameAnimal')).toBe(true);
      nameAnimal(world, p.id, hen.id, '  Pippi  ');
      expect(hen.name).toBe('Pippi');
      newDay(world, ctx());
      hen.x = 33 * TILE + 8;
      hen.y = 33 * TILE + 8;
    }
    expect(hen.hearts).toBeGreaterThanOrEqual(2);
    expect(hen.age).toBe(4);
    expect(hen.hasProduct).toBe(true);
    performAction(world, p.id, 33, 33, ctx('pask'));
    expect(countItem(p.inventory, 'egg_pask')).toBe(1);
    expect(hen.hasProduct).toBe(false);
  });

  it('a trough feeds nearby animals overnight', () => {
    const { world, p } = setup();
    for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) clearTile(world, x, y);
    const coop = addObject(world, 'coop', 30, 30)!;
    const hen = addAnimal(world, 'hen', coop.id, 'Kotte');
    addItem(p.inventory, 'trough', 1);
    addItem(p.inventory, 'hay', 3);
    standAt(world, p, 33, 34);
    select(p, 'trough');
    performAction(world, p.id, 34, 34, ctx());
    const trough = objectAt(world, 34, 34)!;
    select(p, 'hay');
    performAction(world, p.id, 34, 34, ctx());
    expect(trough.items![0]?.count).toBe(3);
    expect(countItem(p.inventory, 'hay')).toBe(0);
    newDay(world, ctx());
    expect(trough.items![0]?.count).toBe(2);
    expect(hen.heartProgress).toBeCloseTo(0.34);
  });
});

describe('tick', () => {
  it('time only passes when someone is online and days roll over', () => {
    const { world, p } = setup();
    setOnline(world, p.id, false);
    const t0 = world.timeMs;
    tick(world, 1000, ctx());
    expect(world.timeMs).toBe(t0);
    setOnline(world, p.id, true);
    tick(world, 1000, ctx());
    expect(world.timeMs).toBe(t0 + 1000);
    const ch = tick(world, DAY_LENGTH_MS, ctx());
    expect(world.day).toBe(2);
    expect(ch.some((c) => c.t === 'day')).toBe(true);
    expect(world.timeMs).toBeLessThan(2000);
  });

  it('picks up drops, but not your own right away', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    const seedSlot = p.inventory.findIndex((s) => s?.item === 'carrot_seed');
    dropItem(world, p.id, seedSlot, 2);
    expect(countItem(p.inventory, 'carrot_seed')).toBe(4);
    const drop = Object.values(world.drops)[0]!;
    expect(drop.count).toBe(2);
    p.x = drop.x;
    p.y = drop.y;
    tick(world, 50, ctx());
    expect(countItem(p.inventory, 'carrot_seed')).toBe(4);
    for (let i = 0; i < 70; i++) tick(world, 50, ctx());
    expect(countItem(p.inventory, 'carrot_seed')).toBe(6);
    expect(Object.keys(world.drops).length).toBe(0);
  });

  it('animals wander but never through fences', () => {
    const { world, p } = setup();
    for (let y = 28; y < 40; y++) for (let x = 28; x < 40; x++) clearTile(world, x, y);
    const hutch = addObject(world, 'hutch', 33, 33)!;
    const rabbit = addAnimal(world, 'rabbit', hutch.id, 'Skutt');
    // Fence a 5x5 pen around (31..35, 31..35)
    for (let i = 30; i <= 36; i++) {
      addObject(world, 'fence', i, 30);
      addObject(world, 'fence', i, 36);
      addObject(world, 'fence', 30, i);
      addObject(world, 'fence', 36, i);
    }
    rabbit.x = 32 * TILE + 8;
    rabbit.y = 35 * TILE + 8;
    const c = ctx();
    for (let i = 0; i < 20 * 120; i++) tick(world, 50, c);
    expect(rabbit.x).toBeGreaterThan(31 * TILE);
    expect(rabbit.x).toBeLessThan(36 * TILE);
    expect(rabbit.y).toBeGreaterThan(31 * TILE);
    expect(rabbit.y).toBeLessThan(36 * TILE);
    void p;
  });

  it('emotes expire', () => {
    const { world, p } = setup();
    const c = ctx();
    emote(world, p.id, 'hjärta', c);
    expect(p.emote?.id).toBe('hjärta');
    tick(world, 10, { ...c, now: c.now + 5000 });
    expect(p.emote).toBeUndefined();
  });

  it('season twists come and go with the day', () => {
    const { world } = setup();
    newDay(world, ctx('halloween'));
    const pumpkins = () => Object.values(world.objects).filter((o) => o.kind === 'wild_pumpkin').length;
    expect(pumpkins()).toBeGreaterThan(0);
    newDay(world, ctx('none'));
    expect(pumpkins()).toBe(0);
    newDay(world, ctx('midsommar'));
    expect(Object.values(world.objects).some((o) => o.kind === 'wild_flower_mid')).toBe(true);
  });

  it('resources regrow', () => {
    const world = generateWorld();
    const trees = () => Object.values(world.objects).filter((o) => o.kind === 'tree').length;
    const n = trees();
    for (const o of Object.values(world.objects).filter((o) => o.kind === 'tree').slice(0, 10)) {
      delete world.objects[o.id];
      delete world.occupancy[key(o.x, o.y)];
    }
    expect(trees()).toBe(n - 10);
    newDay(world, ctx());
    expect(trees()).toBeGreaterThan(n - 10);
  });
});

describe('season calendar', () => {
  it('detects holiday seasons in Stockholm time', () => {
    expect(seasonForDate(new Date('2026-10-24T10:00:00+02:00'))).toBe('halloween');
    expect(seasonForDate(new Date('2026-11-02T10:00:00+01:00'))).toBe('none');
    expect(seasonForDate(new Date('2026-12-24T10:00:00+01:00'))).toBe('jul');
    expect(seasonForDate(new Date('2027-01-06T10:00:00+01:00'))).toBe('jul');
    expect(seasonForDate(new Date('2027-01-07T10:00:00+01:00'))).toBe('none');
    // Easter 2026 is 5 April: Palm Sunday 29 March, Easter Monday 6 April
    expect(seasonForDate(new Date('2026-03-29T10:00:00+02:00'))).toBe('pask');
    expect(seasonForDate(new Date('2026-04-06T10:00:00+02:00'))).toBe('pask');
    expect(seasonForDate(new Date('2026-04-07T10:00:00+02:00'))).toBe('none');
    // Midsummer day 2026 is Saturday 20 June
    expect(seasonForDate(new Date('2026-06-15T10:00:00+02:00'))).toBe('midsommar');
    expect(seasonForDate(new Date('2026-06-21T10:00:00+02:00'))).toBe('midsommar');
    expect(seasonForDate(new Date('2026-06-22T10:00:00+02:00'))).toBe('none');
  });
});

describe('house, villagers, fishing', () => {
  it('walking into the farmhouse door teleports inside and back out', () => {
    const { world, p } = setup();
    standAt(world, p, 10, 9);
    for (let i = 0; i < 10 && Math.floor(p.x / 16) !== 57; i++) stepPlayer(world, p, 0, -1, 50);
    expect(Math.floor(p.x / 16)).toBe(57);
    expect(Math.floor(p.y / 16)).toBe(59);
    expect(p.facing).toBe('up');
    expect(objectAt(world, 56, 60)?.kind).toBeUndefined();
    expect(objectAt(world, 51, 59)?.kind).toBe('wall_wood');
    for (let i = 0; i < 12 && p.y > 20 * 16; i++) stepPlayer(world, p, 0, 1, 50);
    expect(Math.floor(p.x / 16)).toBe(10);
    expect(Math.floor(p.y / 16)).toBe(9);
  });

  it('the server accepts a predicted move through the portal', () => {
    const { world, p } = setup();
    standAt(world, p, 10, 9);
    applyMove(world, p.id, 57 * 16 + 8, 58 * 16 + 12, 'up', true);
    expect(Math.floor(p.x / 16)).toBe(57);
    expect(Math.floor(p.y / 16)).toBe(58);
  });

  it('furniture can be placed inside', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'chair', 1);
    standAt(world, p, 53, 59);
    select(p, 'chair');
    performAction(world, p.id, 54, 59, ctx());
    expect(objectAt(world, 54, 59)?.kind).toBe('chair');
  });

  it('villagers offer daily quests that reward coins and stars', () => {
    const { world, p } = setup();
    world.timeMs = 1000; // morning: everyone at their first spot
    tick(world, 50, ctx());
    expect(world.quests.length).toBeGreaterThanOrEqual(8);
    expect(world.quests.filter((q) => q.npc === 'elsa').length).toBe(3);
    const greta = world.quests.filter((q) => q.npc === 'greta');
    expect(greta.length).toBe(2);
    const q = greta[0]!;
    world.timeMs = 1000; // morning: Greta by the path
    standAt(world, p, 20, 14);
    const open = performAction(world, p.id, 20, 13, ctx());
    expect(open.some((c) => c.t === 'open' && c.ui === 'npc' && c.npc === 'greta')).toBe(true);
    expect(toasts(completeQuest(world, p.id, q.id))).toContain('Du har inte det än');
    addItem(p.inventory, q.want.item, q.want.count);
    const coins = p.coins;
    completeQuest(world, p.id, q.id);
    expect(p.coins).toBe(coins + q.reward.coins);
    expect(p.stars).toBe(q.reward.stars);
    expect(countItem(p.inventory, q.want.item)).toBe(0);
    expect(completeQuest(world, p.id, q.id)).toEqual([]);
    // Sven's fixed quest gives the fishing rod
    addItem(p.inventory, 'wood', 5);
    standAt(world, p, 37, 37);
    tick(world, 50, ctx());
    completeQuest(world, p.id, 'sven_rod');
    expect(countItem(p.inventory, 'rod')).toBe(1);
    newDay(world, ctx());
    expect(p.questsDone).toEqual(['sven_rod']);
    expect(world.quests.filter((q2) => q2.npc === 'greta')[0]!.id).not.toBe(q.id);
  });

  it('fishing: wait for the bite, then act to catch', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'rod', 1);
    select(p, 'rod');
    const water = world.terrain.indexOf('water');
    const wx = water % 64;
    const wy = Math.floor(water / 64);
    standAt(world, p, wx - 1, wy);
    const c = ctx();
    performAction(world, p.id, wx, wy, c);
    expect(p.fishing).toBeDefined();
    expect(p.emote?.id).toBe('fiske');
    // too early: fish gets away
    expect(toasts(performAction(world, p.id, wx, wy, c))).toContain('Fisken simmade iväg…');
    performAction(world, p.id, wx, wy, c);
    const bite = { ...c, now: c.now + 6000 };
    tick(world, 50, bite);
    expect(p.fishing?.bite).toBe(true);
    expect(p.emote?.id).toBe('napp');
    const ch = performAction(world, p.id, wx, wy, bite);
    expect(toasts(ch).some((t) => t.includes('Du fick en'))).toBe(true);
    expect(p.inventory.some((s) => s?.item.startsWith('fish_'))).toBe(true);
    expect(p.fishing).toBeUndefined();
    // moving cancels
    performAction(world, p.id, wx, wy, c);
    applyMove(world, p.id, p.x - 5, p.y, 'left', true);
    expect(p.fishing).toBeUndefined();
  });
});

describe('tavlor (rita på papper)', () => {
  const pic = '2' + '.'.repeat(254) + '7';
  const draw = (world: WorldState, p: PlayerState) => {
    addItem(p.inventory, 'paper', 1);
    return paint(world, p.id, pic);
  };

  it('paper opens the drawing screen', () => {
    const { world, p } = setup();
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    addItem(p.inventory, 'paper', 1);
    select(p, 'paper');
    const ch = performAction(world, p.id, 21, 20, ctx());
    expect(ch.some((c) => c.t === 'open' && c.ui === 'paint')).toBe(true);
    expect(countItem(p.inventory, 'paper')).toBe(1);
  });

  it('rejects bad drawings and needs paper', () => {
    const { world, p } = setup();
    expect(toasts(paint(world, p.id, 'xyz')).length).toBe(1);
    expect(toasts(paint(world, p.id, PAINT_EMPTY)).length).toBe(1);
    expect(toasts(paint(world, p.id, pic)).length).toBe(1);
    expect(countItem(p.inventory, 'painting')).toBe(0);
  });

  it('turns paper into a tavla carrying the drawing, worth 20 kr', () => {
    const { world, p } = setup();
    const ch = draw(world, p);
    expect(countItem(p.inventory, 'paper')).toBe(0);
    const slot = p.inventory.findIndex((s) => s?.item === 'painting');
    expect(p.inventory[slot]?.data).toBe(pic);
    expect(p.inventory[slot]?.count).toBe(1);
    expect(p.achievements).toContain('paint_1');
    expect(toasts(ch)).toContain('Vilken fin tavla!');
    // two drawings never merge into one stack
    draw(world, p);
    expect(p.inventory.filter((s) => s?.item === 'painting').length).toBe(2);
    // a bought painting does not join a painted one
    addItem(p.inventory, 'painting', 1);
    expect(p.inventory.filter((s) => s?.item === 'painting' && s.data === undefined).length).toBe(1);
    const coins = p.coins;
    sell(world, p.id, slot, 1);
    expect(p.coins - coins).toBe(20);
  });

  it('hangs up with the drawing and comes back down with it', () => {
    const { world, p } = setup();
    draw(world, p);
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'painting');
    performAction(world, p.id, 21, 20, ctx());
    const obj = objectAt(world, 21, 20);
    expect(obj?.kind).toBe('painting');
    expect(obj?.data).toBe(pic);
    expect(countItem(p.inventory, 'painting')).toBe(0);
    // pick it up by hand
    p.selected = p.inventory.findIndex((s) => s === null);
    performAction(world, p.id, 21, 20, ctx());
    expect(objectAt(world, 21, 20)).toBeUndefined();
    expect(p.inventory.find((s) => s?.item === 'painting')?.data).toBe(pic);
  });

  it('keeps the drawing when dropped, moved and picked up', () => {
    const { world, p } = setup();
    draw(world, p);
    const slot = p.inventory.findIndex((s) => s?.item === 'painting');
    swap(world, p.id, { slot }, { slot: 0 });
    expect(p.inventory[0]?.data).toBe(pic);
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    const ch = dropItem(world, p.id, 0, 1);
    const drop = ch.find((c) => c.t === 'drop');
    expect(drop && drop.t === 'drop' && drop.drop?.data).toBe(pic);
    p.x = 21 * TILE + 8;
    for (let i = 0; i < 80; i++) tick(world, 50, ctx());
    expect(Object.keys(world.drops).length).toBe(0);
    expect(p.inventory.find((s) => s?.item === 'painting')?.data).toBe(pic);
  });
});

describe('cooking and pets', () => {
  it('cooks dishes at the stove', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'wheat', 3);
    expect(toasts(cook(world, p.id, 'pancakes'))).toContain('Inget händer här');
    cook(world, p.id, 'bread');
    expect(countItem(p.inventory, 'bread')).toBe(2);
    expect(countItem(p.inventory, 'wheat')).toBe(0);
    const stove = Object.values(world.objects).find((o) => o.kind === 'stove')!;
    standAt(world, p, stove.x, stove.y + 1);
    const ch = performAction(world, p.id, stove.x, stove.y, ctx());
    expect(ch.some((c) => c.t === 'open' && c.ui === 'cook')).toBe(true);
  });

  it('a dog needs no house, arrives next morning and follows its owner', () => {
    const { world, p } = setup();
    p.coins = 500;
    buy(world, p.id, 'animal_dog', 1, ctx());
    expect(p.orders).toEqual([{ species: 'dog', homeId: 0 }]);
    expect(toasts(buy(world, p.id, 'animal_dog', 1, ctx()))).toContain('Inget händer här');
    standAt(world, p, 20, 20);
    newDay(world, ctx());
    const dog = Object.values(world.animals).find((a) => a.species === 'dog')!;
    expect(dog.owner).toBe(p.id);
    standAt(world, p, 24, 20);
    for (let i = 0; i < 40; i++) tick(world, 50, ctx());
    expect(Math.hypot(dog.x - p.x, dog.y - p.y)).toBeLessThan(30);
    // far away (e.g. into the house): pops up next to the owner
    standAt(world, p, 57, 58);
    tick(world, 50, ctx());
    expect(Math.hypot(dog.x - p.x, dog.y - p.y)).toBeLessThan(16);
    expect(Math.floor(dog.x / 16)).toBe(57);
  });
});

describe('gårdsbok and routines', () => {
  it('unlocks achievements with stars as counters grow', () => {
    const { world, p } = setup();
    const out: Change[] = [];
    bump(p, 'harvest', 1, out);
    expect(p.achievements).toEqual(['harvest_1']);
    expect(p.stars).toBe(1);
    expect(toasts(out)[0]).toContain('Första skörden');
    bump(p, 'harvest', 30, out);
    expect(p.achievements).toEqual(['harvest_1', 'harvest_25']);
    bump(p, 'harvest', 1, out);
    expect(p.achievements.length).toBe(2);
    // selling counts coins earned
    addItem(p.inventory, 'pumpkin', 10);
    const slot = p.inventory.findIndex((s) => s?.item === 'pumpkin');
    sell(world, p.id, slot, 10);
    expect(p.stats.earned).toBe(600);
    expect(p.achievements).toContain('coins_500');
    void world;
  });

  it('stars buy special clothes', () => {
    const { world, p } = setup();
    expect(toasts(buy(world, p.id, 'hat_crown', 1, ctx()))).toContain('Du behöver fler stjärnor');
    p.stars = 25;
    buy(world, p.id, 'hat_crown', 1, ctx());
    expect(p.stars).toBe(5);
    expect(p.wardrobe).toContain('hat_crown');
    expect(p.coins).toBe(150);
    equip(world, p.id, 'hat', 'hat_crown');
    expect(p.outfit.hat).toBe('hat_crown');
  });

  it('villagers walk their routine and stop to chat', () => {
    const { world, p } = setup();
    const c = ctx();
    world.timeMs = 1000;
    standAt(world, p, 2, 2); // far away
    tick(world, 50, c);
    const greta = world.npcs.greta!;
    expect(Math.floor(greta.x / 16)).toBe(20);
    world.timeMs = 0.3 * DAY_LENGTH_MS; // stroll time
    for (let i = 0; i < 20 * 15; i++) tick(world, 50, c);
    expect(greta.x / 16).toBeGreaterThan(22);
    expect(greta.y / 16).toBeGreaterThan(16);
    // a player standing close stops her
    p.x = greta.x + 20;
    p.y = greta.y;
    tick(world, 50, c);
    expect(greta.moving).toBe(false);
    expect(greta.facing).toBe('right');
    expect(npcAt(world, Math.floor(greta.x / 16), Math.floor(greta.y / 16))?.id).toBe('greta');
  });
});

describe('grottan', () => {
  const weapons = (p: PlayerState) => {
    addItem(p.inventory, 'sword', 1);
    addItem(p.inventory, 'bow', 1);
    addItem(p.inventory, 'shield', 1);
  };

  it('generates a cave with rooms, an exit, monsters and a boss', () => {
    const d = generateDungeon(42);
    expect(d.area).toBe('dungeon');
    const kinds = Object.values(d.objects).map((o) => o.kind);
    expect(kinds).toContain('cave_exit');
    expect(kinds).toContain('cave_wall');
    expect(kinds).toContain('cave_torch');
    const mobs = Object.values(d.animals);
    expect(mobs.filter((a) => a.species === 'boss').length).toBe(1);
    expect(mobs.length).toBeGreaterThan(3);
    const start = dungeonStart(d);
    expect(isSolidForPlayer(d, start.x, start.y)).toBe(false);
    // the start tile and the boss room are connected floor (walk a flood fill)
    const seen = new Set<string>([key(start.x, start.y)]);
    const stack: [number, number][] = [[start.x, start.y]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = key(x + dx, y + dy);
        if (seen.has(k) || d.terrain[(y + dy) * 64 + x + dx] !== 'floor_stone' || objectAt(d, x + dx, y + dy)?.kind === 'cave_wall') continue;
        seen.add(k);
        stack.push([x + dx, y + dy]);
      }
    }
    const br = d.dungeonInfo!.bossRoom;
    expect(seen.has(key(br.x + 1, br.y + 1))).toBe(true);
  });

  it('needs a weapon to enter; entering and leaving moves between areas', () => {
    const { world, p } = setup();
    const cave = Object.values(world.objects).find((o) => o.kind === 'cave')!;
    standAt(world, p, cave.x, cave.y + 2);
    expect(toasts(performAction(world, p.id, cave.x, cave.y + 1, ctx()))).toContain('Ta med ett svärd eller en pilbåge in i grottan');
    weapons(p);
    const ch = performAction(world, p.id, cave.x, cave.y + 1, ctx());
    expect(ch.some((c) => c.t === 'areaData' && c.key === 'dungeon' && c.world)).toBe(true);
    expect(() => JSON.stringify(ch)).not.toThrow();
    expect(p.area).toBe('dungeon');
    const d = world.dungeon!;
    expect(d.players[p.id]).toBe(p);
    expect(areaOf(world, p)).toBe(d);
    // walk to the exit tile and use it
    const exit = Object.values(d.objects).find((o) => o.kind === 'cave_exit')!;
    p.x = exit.x * 16 + 8;
    p.y = (exit.y + 1) * 16 + 8;
    p.facing = 'up';
    performAction(d, p.id, exit.x, exit.y, ctx());
    expect(p.area).toBe('farm');
    expect(Math.floor(p.x / 16)).toBe(CAVE_EXIT_TILE.x);
    expect(d.players[p.id]).toBeUndefined();
  });

  it('bazooka fires a rocket that blasts every monster nearby and reloads', () => {
    const { world, p } = setup();
    weapons(p);
    addItem(p.inventory, 'bazooka', 1);
    addItem(p.inventory, 'rocket', 2);
    const cave = Object.values(world.objects).find((o) => o.kind === 'cave')!;
    standAt(world, p, cave.x, cave.y + 2);
    performAction(world, p.id, cave.x, cave.y + 1, ctx());
    const d = world.dungeon!;
    const px = Math.floor(p.x / 16);
    const py = Math.floor(p.y / 16);
    for (let dx = 1; dx <= 4; dx++) {
      d.terrain[py * 64 + px + dx] = 'floor_stone';
      const o = objectAt(d, px + dx, py);
      if (o) {
        delete d.objects[o.id];
        delete d.occupancy[key(px + dx, py)];
      }
    }
    const troll = spawnMob(d, 'troll', px + 3, py);
    const slime = spawnMob(d, 'slime', px + 4, py);
    p.facing = 'right';
    select(p, 'bazooka');
    const c = ctx();
    const ch = performAction(d, p.id, px + 1, py, c);
    expect(ch.some((x) => x.t === 'fx' && x.kind === 'rocket')).toBe(true);
    expect(ch.some((x) => x.t === 'fx' && x.kind === 'boom')).toBe(true);
    expect(troll.hp).toBe(0);
    expect(d.animals[troll.id]).toBeUndefined();
    expect(d.animals[slime.id]).toBeUndefined(); // within the blast radius
    expect(countItem(p.inventory, 'rocket')).toBe(1);
    expect(p.achievements).toContain('boom_1');
    // reloading: nothing happens for a second
    expect(performAction(d, p.id, px + 1, py, c).some((x) => x.t === 'fx' && x.kind === 'rocket')).toBe(false);
    expect(countItem(p.inventory, 'rocket')).toBe(1);
    const later = { ...c, now: c.now + 1100 };
    expect(performAction(d, p.id, px + 1, py, later).some((x) => x.t === 'fx' && x.kind === 'rocket')).toBe(true);
    expect(countItem(p.inventory, 'rocket')).toBe(0);
    // out of rockets: a toast, no shot
    const empty = performAction(d, p.id, px + 1, py, { ...c, now: c.now + 2500 });
    expect(empty.some((x) => x.t === 'fx' && x.kind === 'rocket')).toBe(false);
    expect(toasts(empty).length).toBe(1);
  });

  it('on the farm the bazooka breaks rocks but never buildings, fences, crops or animals', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'bazooka', 1);
    addItem(p.inventory, 'rocket', 1);
    standAt(world, p, 30, 30);
    for (let dx = 0; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) clearTile(world, 30 + dx, 30 + dy);
    const rock = addObject(world, 'rock', 33, 30)!;
    const fence = addObject(world, 'fence', 33, 31)!;
    const chest = addObject(world, 'chest', 32, 29)!;
    world.terrain[tileIndex(34, 30)] = 'soil';
    world.crops[key(34, 30)] = { crop: 'carrot', stage: 1, progress: 0, watered: false };
    const hen = addAnimal(world, 'hen', 0);
    hen.x = 34 * TILE + 8;
    hen.y = 31 * TILE + 8;
    p.facing = 'right';
    select(p, 'bazooka');
    const ch = performAction(world, p.id, 31, 30, ctx());
    expect(ch.some((x) => x.t === 'fx' && x.kind === 'boom')).toBe(true);
    expect(world.objects[rock.id]).toBeUndefined();
    expect(countItem(p.inventory, 'stone')).toBeGreaterThan(0);
    expect(world.objects[fence.id]).toBeDefined();
    expect(world.objects[chest.id]).toBeDefined();
    expect(world.crops[key(34, 30)]).toBeDefined();
    expect(world.animals[hen.id]).toBeDefined();
    expect(p.hearts).toBe(MAX_HEARTS);
  });

  it('sword and bow hurt monsters, monsters hurt players, shield blocks, hearts out = carried home', () => {
    const { world, p } = setup();
    weapons(p);
    const cave = Object.values(world.objects).find((o) => o.kind === 'cave')!;
    standAt(world, p, cave.x, cave.y + 2);
    performAction(world, p.id, cave.x, cave.y + 1, ctx());
    const d = world.dungeon!;
    const slime = spawnMob(d, 'slime', Math.floor(p.x / 16) + 1, Math.floor(p.y / 16));
    p.facing = 'right';
    select(p, 'sword');
    performAction(d, p.id, Math.floor(slime.x / 16), Math.floor(slime.y / 16), ctx());
    expect(d.animals[slime.id]).toBeUndefined(); // 2 hp, sword does 2
    expect(p.stats.mobs).toBe(1);
    // make sure the three tiles to the right are open floor (layouts differ per seed)
    for (let dx = 1; dx <= 3; dx++) {
      const x = Math.floor(p.x / 16) + dx;
      const y = Math.floor(p.y / 16);
      d.terrain[y * 64 + x] = 'floor_stone';
      const o = objectAt(d, x, y);
      if (o) {
        delete d.objects[o.id];
        delete d.occupancy[key(x, y)];
      }
    }
    const troll = spawnMob(d, 'troll', Math.floor(p.x / 16) + 3, Math.floor(p.y / 16));
    select(p, 'bow');
    const ch = performAction(world.dungeon!, p.id, Math.floor(p.x / 16) + 1, Math.floor(p.y / 16), ctx());
    expect(ch.some((c) => c.t === 'fx' && c.kind === 'arrow')).toBe(true);
    expect(troll.hp).toBe(3);
    // the troll walks up and hits
    const c = ctx();
    let t = c.now;
    for (let i = 0; i < 60 && p.hearts === MAX_HEARTS; i++) {
      t += 50;
      tick(world, 50, { ...c, now: t });
    }
    expect(p.hearts).toBe(MAX_HEARTS - 1);
    // shield up: no more damage
    select(p, 'shield');
    for (let i = 0; i < 60; i++) {
      t += 50;
      tick(world, 50, { ...c, now: t });
    }
    expect(p.hearts).toBe(MAX_HEARTS - 1);
    // hands down: eventually carried out, nothing lost
    select(p, 'hoe');
    const gold = countItem(p.inventory, 'gold');
    for (let i = 0; i < 400 && p.area === 'dungeon'; i++) {
      t += 50;
      tick(world, 50, { ...c, now: t });
    }
    expect(p.area).toBe('farm');
    expect(p.hearts).toBe(MAX_HEARTS);
    expect(countItem(p.inventory, 'gold')).toBe(gold);
  });

  it('beating the boss spawns the treasure, opening it gives loot and clears the cave', () => {
    const { world, p } = setup();
    weapons(p);
    const cave = Object.values(world.objects).find((o) => o.kind === 'cave')!;
    standAt(world, p, cave.x, cave.y + 2);
    performAction(world, p.id, cave.x, cave.y + 1, ctx());
    const d = world.dungeon!;
    const boss = Object.values(d.animals).find((a) => a.species === 'boss')!;
    p.x = boss.x - 16;
    p.y = boss.y;
    p.facing = 'right';
    select(p, 'sword');
    const bt = { x: Math.floor(boss.x / 16), y: Math.floor(boss.y / 16) };
    let ch: Change[] = [];
    for (let i = 0; i < 5; i++) ch = performAction(d, p.id, bt.x, bt.y, ctx());
    expect(d.animals[boss.id]).toBeUndefined();
    expect(toasts(ch)).toContain('Stora Trollet är besegrat! Skattkistan väntar.');
    expect(p.achievements).toContain('boss_1');
    const chest = Object.values(d.objects).find((o) => o.kind === 'treasure')!;
    p.x = chest.x * 16 + 8;
    p.y = (chest.y + 1) * 16 + 8;
    const stars = p.stars;
    const open = performAction(d, p.id, chest.x, chest.y, ctx());
    expect(toasts(open).some((x) => x.startsWith('Skatten:'))).toBe(true);
    expect(p.stars).toBe(stars + 5);
    expect(countItem(p.inventory, 'gold')).toBeGreaterThanOrEqual(20);
    expect(d.dungeonInfo!.cleared).toBe(true);
    // leaving a cleared, empty cave removes it; the next visit is a new one
    const exit = Object.values(d.objects).find((o) => o.kind === 'cave_exit')!;
    p.x = exit.x * 16 + 8;
    p.y = (exit.y + 1) * 16 + 8;
    performAction(d, p.id, exit.x, exit.y, ctx());
    expect(world.dungeon).toBeUndefined();
  });
});

describe('världen utanför', () => {
  it('biomes follow geography: cold north, dry south, mountains east, coast west', () => {
    expect(biomeAt(0, -6)).toBe('is');
    expect(biomeAt(0, 6)).toBe('oken');
    expect(['berg', 'skog', 'ang']).toContain(biomeAt(3, 0));
    expect(['strand', 'skog', 'ang']).toContain(biomeAt(-3, 0));
    expect(biomeAt(1, 0)).toBe(biomeAt(1, 0)); // deterministic
  });

  it('generates areas with open edges and biome specials', () => {
    const a = generateArea(0, -6);
    expect(a.biome).toBe('is');
    expect(a.terrain[tileIndex(32, 32)]).toBe('snow');
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const t = arrivalTile(side);
      expect(isSolidForPlayer(a, t.x, t.y)).toBe(false);
    }
    expect(Object.values(a.objects).some((o) => o.kind === 'iceberry')).toBe(true);
    const b = generateArea(-4, 1);
    if (b.biome === 'strand') expect(b.terrain.includes('water')).toBe(true);
  });

  it('walking off the farm edge enters the next area; teleport goes home and to visited areas', () => {
    const { world, p } = setup();
    // the farm has an opening in the middle of each edge
    expect(isSolidForPlayer(world, 32, 0)).toBe(false);
    standAt(world, p, 32, 0);
    expect(travel(world, p.id, 'e')).toEqual([]); // not that edge
    const ch = travel(world, p.id, 'n');
    expect(ch.some((c) => c.t === 'areaData' && c.key === 'a:0,-1')).toBe(true);
    expect(p.area).toBe('a:0,-1');
    expect(p.visited).toContain('a:0,-1');
    const north = areaOf(world, p);
    expect(north.area).toBe('a:0,-1');
    expect(Math.floor(p.y / 16)).toBe(62);
    expect(() => JSON.stringify(ch)).not.toThrow();
    // acting in the new area hits that area's objects
    const tree = Object.values(north.objects).find((o) => o.kind.startsWith('tree'))!;
    expect(tree).toBeDefined();
    // walk back south
    standAt(world, p, 32, 63);
    travel(world, p.id, 's');
    expect(p.area).toBe('farm');
    expect(Math.floor(p.y / 16)).toBe(1);
    // teleport to the visited area and home again
    teleport(world, p.id, 'a:0,-1');
    expect(p.area).toBe('a:0,-1');
    expect(teleport(world, p.id, 'a:5,5')).toEqual([]);
    teleport(world, p.id, 'farm');
    expect(p.area).toBe('farm');
    expect(Math.floor(p.x / 16)).toBe(SPAWN.x);
  });

  it('ticks animals and drops in occupied areas and tags their changes', () => {
    const { world, p } = setup();
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    const north = areaOf(world, p);
    spawnDrop(north, 'iceberry', 1, p.x, p.y);
    const ch = tick(world, 50, ctx());
    const drop = ch.find((c) => c.t === 'drop');
    expect(drop && 'area' in drop && drop.area).toBe('a:0,-1');
    expect(countItem(p.inventory, 'iceberry')).toBe(1);
  });
});

describe('byn', () => {
  it('lies east of the farm with houses, a market and villagers with wishes', () => {
    const v = generateArea(1, 0);
    expect(v.biome).toBe('by');
    const kinds = Object.values(v.objects).map((o) => o.kind);
    expect(kinds.filter((k) => k === 'house_small').length).toBeGreaterThanOrEqual(8);
    expect(kinds).toContain('market');
    expect(kinds).toContain('sellstall');
    expect(npcsIn(v).map((n) => n.id).sort()).toEqual(['bo', 'lind', 'pino', 'stina']);
    expect(kinds).toContain('pizzeria');
    for (const n of npcsIn(v)) for (const w of [n, ...n.routine]) expect(objectAt(v, w.x, w.y)?.kind ?? 'free').toBe('free');
    const { world, p } = setup();
    world.timeMs = 1000;
    tick(world, 50, ctx());
    expect(world.quests.filter((q) => q.npc === 'bo').length).toBe(2);
    // village quests can only be handed in while in the village
    const q = world.quests.find((x) => x.npc === 'bo')!;
    addItem(p.inventory, q.want.item, q.want.count);
    expect(completeQuest(world, p.id, q.id)).toEqual([]);
    standAt(world, p, 63, 32);
    travel(world, p.id, 'e');
    expect(p.area).toBe('a:1,0');
    const village = areaOf(world, p);
    const st = npcState(village, 'bo');
    p.x = st.x;
    p.y = st.y + 16;
    expect(completeQuest(world, p.id, q.id).some((c) => c.t === 'player')).toBe(true);
    // the village keeps its own villagers moving when someone is there
    tick(world, 50, ctx());
    expect(village.npcs.bo).toBeDefined();
  });
});

describe('pizzerian', () => {
  it('sells pizza in the village, eating heals and gives pizzapower that wears off', () => {
    const { world, p } = setup();
    p.coins = 100;
    // buy at the pizzeria (the UI is opened by acting on the building)
    const village = generateArea(1, 0);
    const pizzeria = Object.values(village.objects).find((o) => o.kind === 'pizzeria')!;
    expect(pizzeria).toBeDefined();
    expect(buy(world, p.id, 'pizza', 1, ctx()).some((c) => c.t === 'player')).toBe(true);
    expect(p.coins).toBe(70);
    expect(countItem(p.inventory, 'pizza')).toBe(1);
    // eat it: hearts back, boost set, achievement progress
    p.hearts = 1;
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'pizza');
    const now = 1_000_000;
    const ch = performAction(world, p.id, 21, 20, { ...ctx(), now });
    expect(ch.some((c) => c.t === 'toast' && c.text.includes('Pizzapower'))).toBe(true);
    expect(countItem(p.inventory, 'pizza')).toBe(0);
    expect(p.hearts).toBe(MAX_HEARTS);
    expect(p.boostUntil).toBe(now + 60_000);
    expect(p.stats?.pizza).toBe(1);
    // the boost makes the shared movement faster (same multiplier the client predicts with)
    const walker = { x: 300, y: 300, facing: 'right' as const, moving: false };
    stepPlayer(world, walker, 1, 0, 100);
    const plain = walker.x - 300;
    walker.x = 300;
    stepPlayer(world, walker, 1, 0, 100, BOOST_SPEED_MUL);
    expect(walker.x - 300).toBeCloseTo(plain * BOOST_SPEED_MUL, 3);
    // wears off
    tick(world, 50, { ...ctx(), now: now + 61_000 });
    expect(p.boostUntil).toBeUndefined();
    // saved villages without a pizzeria get one
    delete village.objects[pizzeria.id];
    expect(ensurePizzeria(village)).toBe(true);
    expect(Object.values(village.objects).some((o) => o.kind === 'pizzeria')).toBe(true);
    expect(ensurePizzeria(village)).toBe(false);
  });
});

describe('vilda djur', () => {
  it('each biome has its own animal and petting them counts', () => {
    const ice = generateArea(0, -6);
    const kinds = new Set(Object.values(ice.animals).map((a) => a.species));
    expect([...kinds]).toEqual(['penguin']);
    expect(Object.values(ice.animals).length).toBeGreaterThanOrEqual(3);
    const { world, p } = setup();
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    const north = areaOf(world, p);
    const wild = Object.values(north.animals)[0];
    if (wild) {
      p.x = wild.x - 16;
      p.y = wild.y;
      p.facing = 'right';
      const ch = performAction(north, p.id, Math.floor(wild.x / 16), Math.floor(wild.y / 16), ctx());
      expect(toasts(ch).some((t) => t.includes('gillade det'))).toBe(true);
      expect(p.stats.wildpet).toBe(1);
      performAction(north, p.id, Math.floor(wild.x / 16), Math.floor(wild.y / 16), ctx());
      expect(p.stats.wildpet).toBe(1); // once per day
      newDay(world, ctx());
      performAction(north, p.id, Math.floor(wild.x / 16), Math.floor(wild.y / 16), ctx());
      expect(p.stats.wildpet).toBe(2);
    }
    expect(p.stats.areas).toBe(1);
  });
});

describe('hästar', () => {
  const stable = () => {
    const { world, p } = setup();
    for (let y = 28; y < 38; y++) for (let x = 28; x < 40; x++) clearTile(world, x, y);
    const stall = addObject(world, 'stall', 30, 28)!;
    const horse = addAnimal(world, 'horse', stall.id, 'Blixten');
    horse.owner = p.id;
    horse.petted = true;
    horse.x = 34 * TILE + 8;
    horse.y = 34 * TILE + 8;
    standAt(world, p, 33, 34);
    return { world, p, stall, horse };
  };

  it('needs a stall and belongs to the buyer', () => {
    const { world, p } = setup();
    p.coins = 2000;
    expect(toasts(buy(world, p.id, 'animal_horse', 1, ctx()))[0]).toContain('Stall');
    for (let y = 28; y < 34; y++) for (let x = 28; x < 36; x++) clearTile(world, x, y);
    addObject(world, 'stall', 30, 28);
    buy(world, p.id, 'animal_horse', 1, ctx());
    expect(p.coins).toBe(1500);
    newDay(world, ctx());
    const horse = Object.values(world.animals).find((a) => a.species === 'horse')!;
    expect(horse.owner).toBe(p.id);
  });

  it('mounts, rides faster, and dismounts with the next action', () => {
    const { world, p, horse } = stable();
    expect(toasts(performAction(world, p.id, 34, 34, ctx())).some((t) => t.includes('hoppar upp'))).toBe(true);
    expect(p.riding).toBe(horse.id);
    expect(p.stats.ride).toBe(1);
    expect(p.achievements).toContain('ride_1');
    // the horse sticks to the rider
    const before = { x: p.x, y: p.y };
    stepPlayer(world, p, 1, 0, 1000, 1.8);
    expect(p.x - before.x).toBeCloseTo(64 * 1.8, 0);
    stepPlayer(world, p, 1, 0, 1000);
    expect(p.x - before.x).toBeCloseTo(64 * 2.8, 0);
    tick(world, 50, ctx());
    expect(Math.hypot(horse.x - p.x, horse.y - p.y)).toBeLessThan(3);
    // any action dismounts; tools do nothing while riding
    addItem(p.inventory, 'hoe', 1);
    select(p, 'hoe');
    const ftx = Math.floor(p.x / TILE) + 1;
    const ch = performAction(world, p.id, ftx, 34, ctx());
    expect(toasts(ch).some((t) => t.includes('hoppar av'))).toBe(true);
    expect(p.riding).toBeUndefined();
    expect(world.terrain[tileIndex(ftx, 34)]).toBe('grass');
    expect(Math.hypot(horse.x - p.x, horse.y - p.y)).toBeLessThan(2 * TILE);
  });

  it('only the owner may ride, foals and busy horses are refused', () => {
    const { world, p, horse } = stable();
    const other = createPlayer(world, 'Kompis', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
    setOnline(world, other.id, true);
    standAt(world, other, 35, 34);
    other.facing = 'left';
    expect(toasts(performAction(world, other.id, 34, 34, ctx()))[0]).toContain('tillhör Test');
    expect(other.riding).toBeUndefined();
    horse.age = 0;
    expect(toasts(performAction(world, p.id, 34, 34, ctx()))[0]).toContain('för liten');
    horse.age = 10;
    performAction(world, p.id, 34, 34, ctx());
    expect(p.riding).toBe(horse.id);
    tick(world, 50, ctx());
    standAt(world, other, 34, 34);
    other.facing = 'left';
    expect(toasts(performAction(world, other.id, 33, 34, ctx()))[0]).toContain('rider redan');
  });

  it('gets off the horse when leaving the farm', () => {
    const { world, p, horse } = stable();
    performAction(world, p.id, 34, 34, ctx());
    expect(p.riding).toBe(horse.id);
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    expect(p.area).not.toBe('farm');
    expect(p.riding).toBeUndefined();
    expect(horse.y).toBeLessThan(3 * TILE);
    expect(Object.values(areaOf(world, p).animals).some((a) => a.species === 'horse')).toBe(false);
  });
});

describe('grisar', () => {
  it('need a pigsty, root up truffles once grown and happy, and unlock Grisbonde', () => {
    const { world, p } = setup();
    p.coins = 2000;
    expect(toasts(buy(world, p.id, 'animal_pig', 1, ctx()))).toContain('Bygg ett Svinstia först');
    for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) clearTile(world, x, y);
    const sty = addObject(world, 'pigsty', 30, 30)!;
    for (let i = 0; i < 3; i++) expect(toasts(buy(world, p.id, 'animal_pig', 1, ctx()))[0]).toContain('flyttar in i morgon');
    expect(toasts(buy(world, p.id, 'animal_pig', 1, ctx()))).toContain('Fullt i Svinstia');
    expect(p.coins).toBe(2000 - 3 * 350);
    newDay(world, ctx());
    const pig = Object.values(world.animals).find((a) => a.species === 'pig')!;
    expect(pig.homeId).toBe(sty.id);
    pig.x = 33 * TILE + 8;
    pig.y = 33 * TILE + 8;
    standAt(world, p, 32, 33);
    addItem(p.inventory, 'hay', 10);
    for (let d = 0; d < 3; d++) {
      select(p, 'hay');
      performAction(world, p.id, 33, 33, ctx());
      expect(pig.fed).toBe(true);
      select(p, 'hoe');
      performAction(world, p.id, 33, 33, ctx()); // pet
      expect(pig.hasProduct).toBe(false);
      newDay(world, ctx());
      pig.x = 33 * TILE + 8;
      pig.y = 33 * TILE + 8;
    }
    expect(pig.age).toBe(3);
    expect(pig.hasProduct).toBe(true);
    const ch = performAction(world, p.id, 33, 33, ctx());
    expect(countItem(p.inventory, 'truffle')).toBe(1);
    expect(pig.hasProduct).toBe(false);
    expect(p.stats?.truffle).toBe(1);
    expect(p.achievements).toContain('truffle_1');
    expect(toasts(ch).some((t) => t.includes('Grisbonde'))).toBe(true);
  });

  it('truffle pasta is cooked at the stove from truffle, wheat and milk', () => {
    const { world, p } = setup();
    addItem(p.inventory, 'truffle', 1);
    addItem(p.inventory, 'wheat', 2);
    addItem(p.inventory, 'milk', 1);
    cook(world, p.id, 'truffle_pasta');
    expect(countItem(p.inventory, 'truffle_pasta')).toBe(1);
    expect(countItem(p.inventory, 'truffle')).toBe(0);
  });
});

describe('badhuset', () => {
  const toVillage = () => {
    const { world, p } = setup();
    standAt(world, p, 63, 32);
    travel(world, p.id, 'e');
    expect(p.area).toBe('a:1,0');
    const village = areaOf(world, p);
    expect(village.biome).toBe('by');
    return { world, p, village };
  };

  it('every village has a bath house, also villages saved before it existed', () => {
    const { village } = toVillage();
    const bath = Object.values(village.objects).filter((o) => o.kind === 'bathhouse');
    expect(bath).toHaveLength(1);
    // a village without one gets one on load
    delete village.objects[bath[0]!.id];
    expect(ensureBathhouse(village)).toBe(true);
    expect(ensureBathhouse(village)).toBe(false);
    expect(Object.values(village.objects).filter((o) => o.kind === 'bathhouse')).toHaveLength(1);
  });

  it('enter, swim slowly, earn the badge and walk out again', () => {
    const { world, p, village } = toVillage();
    const bath = Object.values(village.objects).find((o) => o.kind === 'bathhouse')!;
    standAt(world, p, bath.x + 1, bath.y + 2);
    p.facing = 'up';
    const ch = performAction(village, p.id, bath.x + 1, bath.y + 1, ctx());
    expect(p.area).toBe('bath:a:1,0');
    expect(ch.some((c) => c.t === 'areaData' && c.key === 'bath:a:1,0')).toBe(true);
    const inside = areaOf(world, p);
    expect(inside).toBe(getArea(world, 'bath:a:1,0'));
    expect(inside.terrain.filter((t) => t === 'pool')).toHaveLength(BATH_POOL.w * BATH_POOL.h);
    expect(Math.floor(p.y / TILE)).toBe(BATH_EXIT.y - 1);
    expect(() => JSON.stringify(ch)).not.toThrow();
    // the pool is walkable but slow
    const px = BATH_POOL.x + 2;
    const py = BATH_POOL.y + 2;
    expect(isSolidForPlayer(inside, px, py)).toBe(false);
    standAt(world, p, px, py);
    expect(inPool(inside, p)).toBe(true);
    const x0 = p.x;
    stepPlayer(inside, p, 1, 0, 1000);
    expect(p.x - x0).toBeCloseTo(PLAYER_SPEED * SWIM_SPEED_MUL, 0);
    // the server tick notices the swimmer: splash, badge, flag
    delete p.moveLock;
    const t1 = tick(world, 50, ctx());
    expect(p.swimming).toBe(true);
    expect(t1.some((c) => c.t === 'fx' && c.kind === 'splash' && c.area === 'bath:a:1,0')).toBe(true);
    expect(p.achievements).toContain('swim_1');
    expect(p.stats?.swim).toBe(1);
    // out of the pool
    standAt(world, p, BATH_EXIT.x, BATH_EXIT.y - 1);
    tick(world, 50, ctx());
    expect(p.swimming).toBeUndefined();
    // the exit door takes you back to the village square
    performAction(inside, p.id, BATH_EXIT.x, BATH_EXIT.y, ctx());
    expect(p.area).toBe('a:1,0');
    expect(Math.floor(p.x / TILE)).toBe(bath.x + 1);
    expect(Math.floor(p.y / TILE)).toBe(bath.y + 2);
    expect(Object.keys(inside.players)).toHaveLength(0);
    // stepping on the door tile also walks you out
    performAction(village, p.id, bath.x + 1, bath.y + 1, ctx());
    expect(p.area).toBe('bath:a:1,0');
    delete p.moveLock;
    standAt(world, p, BATH_EXIT.x, BATH_EXIT.y);
    tick(world, 50, ctx());
    expect(p.area).toBe('a:1,0');
    // and home works from inside too
    performAction(village, p.id, bath.x + 1, bath.y + 1, ctx());
    teleport(world, p.id, 'farm');
    expect(p.area).toBe('farm');
  });
});

describe('lasso och rovdjur', () => {
  const at = (now: number, r: number): SimCtx => ({ season: 'none', rnd: () => r, now });
  /** Player in the area north of the farm with a lasso in hand and a wild animal two tiles to the right. */
  function outdoors(species: string) {
    const { world, p } = setup();
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    const area = areaOf(world, p);
    for (const a of Object.values(area.animals)) delete area.animals[a.id];
    standAt(world, p, 30, 30);
    for (let x = 28; x <= 36; x++) for (let y = 27; y <= 33; y++) clearTile(area, x, y);
    const a = spawnMob(area, species, 32, 30);
    a.hp = ANIMALS[species]?.predator?.hp ?? 1;
    addItem(p.inventory, 'lasso', 1);
    p.selected = p.inventory.findIndex((s) => s?.item === 'lasso');
    return { world, p, area, a };
  }

  it('a lucky throw tames the animal into a pet that asks for a name', () => {
    const { world, p, area, a } = outdoors('hare');
    const ch = performAction(area, p.id, 31, 30, at(1_000_000, 0.1));
    expect(ch.some((c) => c.t === 'fx' && c.kind === 'lasso')).toBe(true);
    expect(a.owner).toBe(p.id);
    expect(isPetAnimal(a)).toBe(true);
    expect(ch.some((c) => c.t === 'open' && c.ui === 'nameAnimal' && c.id === a.id)).toBe(true);
    expect(toasts(ch).some((t) => t.includes('kompis'))).toBe(true);
    expect(p.stats.tame).toBe(1);
    expect(p.stats.tame_species).toBe(1);
    expect(p.achievements).toContain('tame_1');
    // it follows its owner now: moving away makes it walk after you
    standAt(world, p, 30, 30);
    a.x = 36 * TILE;
    const before = a.x;
    tick(world, 200, at(1_000_100, 0.5));
    expect(a.x).toBeLessThan(before);
    // and petting it is like petting a dog, not a wild animal
    expect(p.stats.wildpet).toBeUndefined();
  });

  it('a missed throw scares the animal away for a while', () => {
    const { world, p, area, a } = outdoors('hare');
    const ch = performAction(area, p.id, 31, 30, at(1_000_000, 0.95));
    expect(a.owner).toBeUndefined();
    expect(a.fleeUntil).toBe(1_003_000);
    expect(toasts(ch).some((t) => t.includes('Missade'))).toBe(true);
    const before = a.x;
    tick(world, 200, at(1_000_100, 0.5));
    expect(a.x).toBeGreaterThan(before); // runs away from the player on its left
    tick(world, 200, at(1_004_000, 0.5));
    expect(a.fleeUntil).toBeUndefined();
  });

  it('predators bite one heart with a cooldown, tamed ones do not, and fainting sends you home', () => {
    const { world, p, area, a } = outdoors('bear');
    a.x = p.x + TILE; // right next to the player
    a.y = p.y;
    expect(isHostile(a)).toBe(true);
    tick(world, 50, at(2_000_000, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 1);
    tick(world, 50, at(2_000_100, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 1); // still on cooldown
    tick(world, 50, at(2_001_700, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 2);
    // hearts grow back after a game hour outdoors (and the bear bites again)
    tick(world, 50, at(2_001_700 + DAY_LENGTH_MS / 24 + 1, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 2);
    // a tamed bear is a friend
    a.owner = p.id;
    p.hearts = 3;
    delete p.healAt;
    const quiet = tick(world, 50, at(2_100_000, 0.5));
    expect(p.hearts).toBe(3);
    expect(quiet.some((c) => c.t === 'fx' && c.kind === 'hit')).toBe(false);
    expect(isHostile(a)).toBe(false);
    // fainting: last heart lost outdoors wakes you up at home with everything you carried
    delete a.owner;
    a.x = p.x + TILE;
    a.y = p.y;
    p.hearts = 1;
    p.healAt = 9_000_000; // no heart grows back before the bite
    addItem(p.inventory, 'fur', 2);
    const ch = tick(world, 50, at(2_200_000, 0.5));
    expect(p.area).toBe('farm');
    expect(p.hearts).toBe(MAX_HEARTS);
    expect(countItem(p.inventory, 'fur')).toBe(2);
    expect(toasts(ch).some((t) => t.includes('svimmade'))).toBe(true);
  });

  it('a sword hurts predators outdoors but never other animals, and a beaten predator drops fur', () => {
    const { p, area, a } = outdoors('bear');
    a.x = p.x + TILE;
    a.y = p.y;
    addItem(p.inventory, 'sword', 1);
    p.selected = p.inventory.findIndex((s) => s?.item === 'sword');
    performAction(area, p.id, 31, 30, at(3_000_000, 0.5));
    expect(a.hp).toBe(3);
    performAction(area, p.id, 31, 30, at(3_000_000, 0.5));
    performAction(area, p.id, 31, 30, at(3_000_000, 0.5));
    expect(area.animals[a.id]).toBeUndefined();
    expect(Object.values(area.drops).some((d) => d.item === 'fur')).toBe(true);
    expect(p.stats.predators).toBe(1);
    const hare = spawnMob(area, 'hare', 31, 30);
    performAction(area, p.id, 31, 30, at(3_000_000, 0.5));
    expect(area.animals[hare.id]).toBeDefined();
  });

  it('tamed animals come home with you and areas get their wild animals back the next day', () => {
    const { world, p, area, a } = outdoors('wolf');
    performAction(area, p.id, 31, 30, at(1_000_000, 0.1));
    expect(a.owner).toBe(p.id);
    standAt(world, p, 32, 63);
    const ch = travel(world, p.id, 's');
    expect(p.area).toBe('farm');
    expect(Object.values(area.animals).some((x) => x.species === 'wolf')).toBe(false);
    const home = Object.values(world.animals).find((x) => x.species === 'wolf')!;
    expect(home).toBeDefined();
    expect(home.owner).toBe(p.id);
    expect(ch.some((c) => c.t === 'animal' && c.animal === null && c.area === 'a:0,-1')).toBe(true);
    expect(ch.some((c) => c.t === 'animal' && c.animal?.species === 'wolf' && c.area === undefined)).toBe(true);
    // the emptied area is restocked with its own wild animals at dawn
    const before = Object.keys(area.animals).length;
    newDay(world, ctx());
    expect(Object.keys(area.animals).length).toBeGreaterThan(before);
    expect(Object.values(area.animals).every((x) => ANIMALS[x.species]?.wild?.split('|').includes(area.biome!))).toBe(true);
  });
});

describe('sova', () => {
  it('crawling into bed, the night passes once everyone online sleeps, and any action wakes you', () => {
    const { world, p } = setup();
    const bed = Object.values(world.objects).find((o) => o.kind === 'bed')!;
    standAt(world, p, bed.x, bed.y + 2);
    p.facing = 'up';
    const day0 = world.day;
    const ch = performAction(world, p.id, bed.x, bed.y + 1, ctx());
    expect(p.sleeping).toBe(true);
    expect(toasts(ch).some((t) => t.includes('God natt'))).toBe(true);
    // moving in your sleep is ignored
    const x0 = p.x;
    applyMove(world, p.id, p.x + 40, p.y, 'right', true);
    expect(p.x).toBe(x0);
    // a second player who is still up keeps the night from passing
    const other = createPlayer(world, 'Bo', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
    setOnline(world, other.id, true);
    tick(world, 50, ctx());
    expect(world.day).toBe(day0);
    expect(p.sleeping).toBe(true);
    // ...until they also go to bed
    other.sleeping = true;
    tick(world, 50, ctx());
    expect(world.day).toBe(day0); // the lights go out first
    const morning = tick(world, 50, { ...ctx(), now: 1_000_000 + 3000 });
    expect(world.day).toBe(day0 + 1);
    expect(p.sleeping).toBeUndefined();
    expect(other.sleeping).toBeUndefined();
    expect(toasts(morning).some((t) => t.includes('God morgon'))).toBe(true);
    expect(world.timeMs).toBeLessThan(5000);
    // waking up by hand
    performAction(world, p.id, bed.x, bed.y + 1, ctx());
    expect(p.sleeping).toBe(true);
    select(p, 'hoe');
    const wake = performAction(world, p.id, bed.x, bed.y + 1, ctx());
    // holding a sword must not stop you from opening things
    addItem(p.inventory, 'sword', 1);
    select(p, 'sword');
    expect(performAction(world, p.id, bed.x, bed.y + 1, ctx()).some((c) => c.t === 'player')).toBe(true);
    expect(p.sleeping).toBe(true);
    delete p.sleeping;
    expect(p.sleeping).toBeUndefined();
    expect(toasts(wake).some((t) => t.includes('vaknade'))).toBe(true);
    expect(world.day).toBe(day0 + 1);
  });
});

describe('fordon', () => {
  const tileOf = (v: number) => Math.floor(v / TILE);
  const lot = () => {
    const { world, p } = setup();
    for (let y = 28; y < 36; y++) for (let x = 28; x < 40; x++) clearTile(world, x, y);
    standAt(world, p, 30, 30);
    p.coins = 5000;
    return { world, p };
  };

  it('a bought car is parked next to you at once, only you may drive it, and it is fast', () => {
    const { world, p } = lot();
    const ch = buy(world, p.id, 'vehicle_car_blue', 1, ctx());
    expect(p.coins).toBe(2500);
    const car = Object.values(world.animals).find((a) => a.species === 'car')!;
    expect(car.owner).toBe(p.id);
    expect(car.variant).toBe(1);
    expect(Math.hypot(car.x - p.x, car.y - p.y)).toBeLessThanOrEqual(TILE * 1.5);
    expect(toasts(ch).some((t) => t.includes('parkerad'))).toBe(true);
    expect(toasts(buy(world, p.id, 'vehicle_car_red', 1, ctx()))[0]).toContain('redan');
    // somebody else cannot take it
    const other = createPlayer(world, 'Kompis', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
    setOnline(world, other.id, true);
    standAt(world, other, tileOf(car.x) - 1, tileOf(car.y));
    expect(toasts(performAction(world, other.id, tileOf(car.x), tileOf(car.y), ctx()))[0]).toContain('tillhör Test');
    expect(other.riding).toBeUndefined();
    // the owner drives
    standAt(world, p, tileOf(car.x) - 1, tileOf(car.y));
    const drive = performAction(world, p.id, tileOf(car.x), tileOf(car.y), ctx());
    expect(p.riding).toBe(car.id);
    expect(p.achievements).toContain('drive_1');
    expect(toasts(drive).some((t) => t.includes('kör'))).toBe(true);
    // road is fast, mud is slow
    const idx = tileIndex(tileOf(p.x), tileOf(p.y));
    expect(rideSpeedMul(world, p)).toBeCloseTo(2.6);
    (world.terrain as string[])[idx] = 'road';
    expect(rideSpeedMul(world, p)).toBeCloseTo(2.6 * 1.3);
    world.terrain[idx] = 'soil';
    expect(rideSpeedMul(world, p)).toBeCloseTo(2.6 * 0.7);
    world.terrain[idx] = 'grass';
    const x0 = p.x;
    stepPlayer(world, p, 1, 0, 1000, rideSpeedMul(world, p));
    expect(p.x - x0).toBeCloseTo(64 * 2.6, 0);
    // the car sits under the driver and the odometer ticks
    tick(world, 50, ctx());
    expect(Math.hypot(car.x - p.x, car.y - p.y)).toBeLessThan(3);
    expect(p.stats.drive_tiles).toBeGreaterThanOrEqual(10);
    // any action parks it; tools do nothing while driving
    addItem(p.inventory, 'hoe', 1);
    select(p, 'hoe');
    const ftx = tileOf(p.x) + 1;
    const off = performAction(world, p.id, ftx, tileOf(p.y), ctx());
    expect(p.riding).toBeUndefined();
    expect(toasts(off).some((t) => t.includes('parkerar'))).toBe(true);
    expect(world.terrain[tileIndex(ftx, tileOf(p.y))]).toBe('grass');
    expect(Math.hypot(car.x - p.x, car.y - p.y)).toBeLessThan(2 * TILE);
    // parked cars stay where they are
    const cx = car.x;
    for (let i = 0; i < 40; i++) tick(world, 50, ctx());
    expect(car.x).toBe(cx);
  });

  it('cannot drive into water, honks, and comes along when you drive over the edge', () => {
    const { world, p } = lot();
    buy(world, p.id, 'vehicle_motorcycle', 1, ctx());
    const moped = Object.values(world.animals).find((a) => a.species === 'motorcycle')!;
    standAt(world, p, tileOf(moped.x) - 1, tileOf(moped.y));
    performAction(world, p.id, tileOf(moped.x), tileOf(moped.y), ctx());
    expect(p.riding).toBe(moped.id);
    expect(rideSpeedMul(world, p)).toBeCloseTo(2.2);
    const ahead = tileIndex(tileOf(p.x) + 1, tileOf(p.y));
    world.terrain[ahead] = 'water';
    const x0 = p.x;
    for (let i = 0; i < 20; i++) stepPlayer(world, p, 1, 0, 50, rideSpeedMul(world, p));
    expect(p.x - x0).toBeLessThan(TILE);
    world.terrain[ahead] = 'grass';
    expect(honk(world, p.id).some((c) => c.t === 'fx' && c.kind === 'honk')).toBe(true);
    // over the east edge into the village, still driving
    standAt(world, p, 63, 32);
    tick(world, 50, ctx());
    const ch = travel(world, p.id, 'e');
    expect(p.area).toBe('a:1,0');
    const village = areaOf(world, p);
    const there = Object.values(village.animals).find((a) => a.species === 'motorcycle')!;
    expect(there).toBeDefined();
    expect(there.owner).toBe(p.id);
    expect(world.animals[moped.id]).toBeUndefined();
    expect(p.riding).toBe(there.id);
    expect(ch.some((c) => c.t === 'animal' && c.animal?.species === 'motorcycle' && c.area === 'a:1,0')).toBe(true);
    // parking in the village and going home leaves it there
    performAction(village, p.id, tileOf(p.x) + 1, tileOf(p.y), ctx());
    expect(p.riding).toBeUndefined();
    teleport(world, p.id, 'farm');
    expect(village.animals[there.id]).toBeDefined();
    expect(Object.values(world.animals).some((a) => a.species === 'motorcycle')).toBe(false);
    // on foot there is nothing to honk with
    expect(honk(world, p.id)).toEqual([]);
  });
});
