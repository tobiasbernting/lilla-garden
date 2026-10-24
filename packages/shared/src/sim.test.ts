import { describe, expect, it } from 'vitest';
import {
  CROPS,
  DAY_LENGTH_MS,
  SPAWN,
  TILE,
  addAnimal,
  addItem,
  addObject,
  applyMove,
  bump,
  npcAt,
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
  swapSlots,
  tick,
  tileIndex,
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
    tick(world, 50, ctx());
    expect(world.quests.length).toBeGreaterThanOrEqual(5);
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
