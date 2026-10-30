// Rallyvärlden in the sim: the garage, race prizes, free-roam coins, mending overnight and the garage on the farm.
import { describe, expect, it } from 'vitest';
import {
  CAR_BODY_DEFS,
  DAMAGE_HEAL_PER_DAY,
  MAP_W,
  MAX_CARS,
  PART_MAX_LEVEL,
  PART_PRICES,
  RACE_DNF_PRIZE,
  ROAM_COIN_KR,
  ROAM_COINS_PER_DAY,
  SPAWN,
  STYLE_PRICES,
  TILE,
  T,
  activeCar,
  applyStyle,
  cleanRules,
  createPlayer,
  defaultRules,
  defaultStyle,
  ensureGarage,
  fmtRaceTime,
  garageAction,
  garageOf,
  generateWorld,
  healCars,
  newDay,
  objectAt,
  objectDef,
  performAction,
  raceMedal,
  raceOnlineResult,
  racePrize,
  raceSolo,
  reachableFrom,
  repairCost,
  roamDone,
  sellPrice,
  setOnline,
  type Change,
  type ClientMsg,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const ctx: SimCtx = { season: 'none', rnd: () => 0.5, now: 1_000_000 };
const toasts = (ch: Change[]): string[] => ch.filter((c) => c.t === 'toast').map((c) => (c as { text: string }).text);
type GarageMsg = Extract<ClientMsg, { t: 'garage' }>;
type NoT<M> = M extends unknown ? Omit<M, 't'> : never;
const g = (world: WorldState, p: PlayerState, msg: NoT<GarageMsg>): Change[] => garageAction(world, p.id, { t: 'garage', ...msg } as GarageMsg, ctx);

function setup(coins = 10_000): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Elsa', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' }, 'shirt_blue');
  setOnline(world, p.id, true);
  p.coins = coins;
  return { world, p };
}

describe('the garage', () => {
  it('starts with one free car painted like the shirt', () => {
    const { p } = setup();
    const gar = garageOf(p);
    expect(gar.cars).toHaveLength(1);
    expect(gar.cars[0]!.body).toBe('hatch');
    expect(gar.cars[0]!.name).toBe(T.rallyStarterName);
    expect(gar.active).toBe(1);
    expect(gar.nextId).toBe(2);
    expect(gar.cars[0]!.style.paint).toBe('#2f6fe0'); // the blue shirt's nearest paint
    expect(garageOf(p)).toBe(gar);
  });

  it('buys cars (price, default and cleaned names, a full garage)', () => {
    const { world, p } = setup(100_000);
    const before = p.coins;
    const ch = g(world, p, { a: 'buyCar', body: 'buggy' });
    expect(ch.some((c) => c.t === 'player')).toBe(true);
    expect(p.coins).toBe(before - CAR_BODY_DEFS.buggy.price);
    const gar = garageOf(p);
    expect(gar.cars).toHaveLength(2);
    expect(gar.active).toBe(2);
    expect(gar.cars[1]!.name).toBe('Sandloppan');
    g(world, p, { a: 'buyCar', body: 'buggy' });
    expect(gar.cars[2]!.name).toBe('Sandloppan 2');
    g(world, p, { a: 'buyCar', body: 'coupe', name: '  Super\u0000Snabba   bilen med lång namn ' });
    expect(gar.cars[3]!.name).toBe('Super Snabba bil');
    // junk body
    expect(g(world, p, { a: 'buyCar', body: 'tank' as never })).toEqual([]);
    while (gar.cars.length < MAX_CARS) g(world, p, { a: 'buyCar', body: 'hatch' });
    const coins = p.coins;
    expect(toasts(g(world, p, { a: 'buyCar', body: 'monster' }))).toEqual([T.rallyGarageFull]);
    expect(p.coins).toBe(coins);
  });

  it('refuses a car you cannot afford', () => {
    const { world, p } = setup(100);
    const t = toasts(g(world, p, { a: 'buyCar', body: 'monster' }));
    expect(t[0]).toContain(String(CAR_BODY_DEFS.monster.price));
    expect(p.coins).toBe(100);
    expect(garageOf(p).cars).toHaveLength(1);
  });

  it('selects a car, buys parts level by level up to the top', () => {
    const { world, p } = setup(100_000);
    g(world, p, { a: 'buyCar', body: 'pickup' });
    g(world, p, { a: 'select', car: 1 });
    expect(garageOf(p).active).toBe(1);
    expect(g(world, p, { a: 'select', car: 99 })).toEqual([]);
    let coins = p.coins;
    for (let l = 0; l < PART_MAX_LEVEL; l++) {
      g(world, p, { a: 'part', car: 1, part: 'engine' });
      expect(activeCar(p).parts.engine).toBe(l + 1);
      expect(p.coins).toBe(coins - PART_PRICES.engine[l]!);
      coins = p.coins;
    }
    expect(toasts(g(world, p, { a: 'part', car: 1, part: 'engine' }))).toEqual([T.rallyPartMax]);
    expect(p.coins).toBe(coins);
    expect(g(world, p, { a: 'part', car: 1, part: 'wings' as never })).toEqual([]);
  });

  it('charges the style only for what changed and ignores junk', () => {
    const { world, p } = setup(1000);
    const car = activeCar(p);
    const start = { ...car.style };
    g(world, p, { a: 'style', car: 1, style: { paint: '#8bc34a', finish: 'matte', livery: 'flames', number: 42, driver: 'cow', plate: 'ELSA\u0007 123456', wheels: 'hover' as never, paint2: '#123456', glow: '#18b7c9' } });
    expect(car.style.paint).toBe('#8bc34a');
    expect(car.style.finish).toBe('matte');
    expect(car.style.livery).toBe('flames');
    expect(car.style.number).toBe(42);
    expect(car.style.driver).toBe('cow');
    expect(car.style.plate).toBe('ELSA 123');
    expect(car.style.wheels).toBe(start.wheels);
    expect(car.style.paint2).toBe(start.paint2);
    expect(car.style.glow).toBe('#18b7c9');
    expect(p.coins).toBe(1000 - STYLE_PRICES.paint - STYLE_PRICES.finish - STYLE_PRICES.livery - STYLE_PRICES.glow);
    expect(p.stats.rallyStyle).toBe(1);
    expect(p.achievements).toContain('rally_style');
    // the same again costs nothing and changes nothing
    const coins = p.coins;
    g(world, p, { a: 'style', car: 1, style: { paint: '#8bc34a', finish: 'matte' } });
    expect(p.coins).toBe(coins);
    expect(p.stats.rallyStyle).toBe(1);
  });

  it('sets decals and extras as whole sets, deduped, peeling off for free', () => {
    const cur = defaultStyle();
    const a = applyStyle(cur, { extras: ['antlers', 'antlers', 'flag', 'jetpack'], decals: { hood: 'cow', roof: 'unicorn', doors: 'star', bumper: 'heart' } });
    expect(a.style.extras).toEqual(['flag', 'antlers']);
    expect(a.style.decals).toEqual({ hood: 'cow', doors: 'star' });
    expect(a.cost).toBe(2 * STYLE_PRICES.extra + 2 * STYLE_PRICES.decal);
    const b = applyStyle(a.style, { extras: ['flag'], decals: { hood: 'cow' } });
    expect(b.style.extras).toEqual(['flag']);
    expect(b.style.decals).toEqual({ hood: 'cow' });
    expect(b.cost).toBe(0);
    expect(b.changed).toBeGreaterThan(0);
    expect(applyStyle(cur, { number: 500 }).style.number).toBe(99);
    expect(applyStyle(cur, { number: Number.NaN }).changed).toBe(0);
    expect(applyStyle(cur, 'paint').changed).toBe(0);
    expect(applyStyle({ ...cur, glow: '#18b7c9' }, { glow: null }).style.glow).toBeNull();
  });

  it('refuses the whole style when it costs more than you have', () => {
    const { world, p } = setup(100);
    const car = activeCar(p);
    const t = toasts(g(world, p, { a: 'style', car: 1, style: { paint: '#8bc34a', spoiler: 'wing' } }));
    expect(t[0]).toContain(String(STYLE_PRICES.paint + STYLE_PRICES.spoiler));
    expect(car.style.paint).not.toBe('#8bc34a');
    expect(car.style.spoiler).toBe('none');
    expect(p.coins).toBe(100);
  });

  it('repairs for the bill, renames, sells but never the last car', () => {
    const { world, p } = setup(100_000);
    const car = activeCar(p);
    expect(toasts(g(world, p, { a: 'repair', car: 1 }))).toEqual([T.rallyNotDamaged]);
    car.damage = 60;
    const bill = repairCost(car);
    const coins = p.coins;
    g(world, p, { a: 'repair', car: 1 });
    expect(car.damage).toBe(0);
    expect(p.coins).toBe(coins - bill);

    g(world, p, { a: 'rename', car: 1, name: '  Blixt  McQueen  ' });
    expect(car.name).toBe('Blixt McQueen');
    expect(g(world, p, { a: 'rename', car: 1, name: '   ' })).toEqual([]);

    expect(toasts(g(world, p, { a: 'sell', car: 1 }))).toEqual([T.rallyLastCar]);
    g(world, p, { a: 'buyCar', body: 'coupe' });
    const coupe = activeCar(p);
    g(world, p, { a: 'part', car: coupe.id, part: 'turbo' });
    const price = sellPrice(coupe);
    expect(price).toBe(Math.round((CAR_BODY_DEFS.coupe.price + PART_PRICES.turbo[0]) / 2));
    const before = p.coins;
    g(world, p, { a: 'sell', car: coupe.id });
    expect(p.coins).toBe(before + price);
    expect(garageOf(p).cars.map((c) => c.id)).toEqual([1]);
    expect(garageOf(p).active).toBe(1);
  });
});

describe('races', () => {
  it('pays a solo race, keeps the best time, gives a medal and damage only with damage on', () => {
    const { world, p } = setup(0);
    const rules = { ...defaultRules(), course: 'forest' as const, laps: 1, damage: false };
    const t1 = 82_000;
    const ch = raceSolo(world, p.id, rules, 1, 4, t1, 55, ctx);
    const prize = racePrize(cleanRules(rules), 1, 4);
    expect(p.coins).toBe(prize);
    const car = activeCar(p);
    expect(car.damage).toBe(0);
    expect(car.races).toBe(1);
    expect(car.wins).toBe(1);
    expect(garageOf(p).best['forest:1']).toBe(t1);
    expect(raceMedal('forest', 1, t1)).toBe('silver');
    expect(toasts(ch).some((t) => t.includes(T.rallyMedalSilver))).toBe(true);
    expect(p.achievements).toContain('rally_1');

    // slower: the best stays; with damage on, the dents stay too
    raceSolo(world, p.id, { ...rules, damage: true }, 3, 4, 90_000, 55, ctx);
    expect(garageOf(p).best['forest:1']).toBe(t1);
    expect(car.damage).toBe(55);
    expect(car.wins).toBe(1);
    // faster: a new record
    const ch3 = raceSolo(world, p.id, rules, 2, 4, 70_000, 0, ctx);
    expect(garageOf(p).best['forest:1']).toBe(70_000);
    expect(toasts(ch3).some((t) => t.includes(fmtRaceTime(70_000)))).toBe(true);
    expect(fmtRaceTime(62_345)).toBe('1:02.3');
  });

  it('clamps whatever a client reports, and a time under the minimum means not finished', () => {
    const { world, p } = setup(0);
    raceSolo(world, p.id, { junk: true }, 0, 99, 5, 500, ctx);
    // the game sends 0 (or anything tiny) when the player never crossed the line: the small prize, no best time
    expect(p.coins).toBe(RACE_DNF_PRIZE);
    expect(activeCar(p).damage).toBe(0);
    expect(garageOf(p).best['farm:3']).toBeUndefined();
    // place 1 of 8 (n capped), default rules (no damage)
    raceSolo(world, p.id, { junk: true }, 0, 99, 12_000, 500, ctx);
    expect(p.coins).toBe(RACE_DNF_PRIZE + racePrize(defaultRules(), 1, 8));
    expect(garageOf(p).best['farm:3']).toBe(12_000);
    raceSolo(world, p.id, { ...defaultRules(), damage: true }, 'x', 'y', Number.NaN, 500, ctx);
    expect(activeCar(p).damage).toBe(100);
    expect(garageOf(p).best['farm:3']).toBe(12_000);
  });

  it('orders an online race by time, the ones who did not finish last with the small prize', () => {
    const { world, p } = setup(0);
    const q = createPlayer(world, 'Bo', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
    const r = createPlayer(world, 'Cia', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
    q.coins = 0;
    r.coins = 0;
    const rules = { ...defaultRules(), laps: 2, ai: 1, damage: true };
    const { changes, results } = raceOnlineResult(world, rules, [
      { id: p.id, time: 150_000, damage: 10 },
      { id: q.id, time: null, damage: 40 },
      { id: r.id, time: 140_000, damage: 5 },
      { id: 'ghost', time: 1, damage: 0 },
    ], ctx);
    expect(results.map((x) => [x.name, x.place])).toEqual([['Cia', 1], ['Elsa', 2], ['Bo', 3]]);
    expect(results[2]!.time).toBeNull();
    expect(results[2]!.prize).toBe(RACE_DNF_PRIZE);
    expect(results[0]!.prize).toBe(racePrize(rules, 1, 4));
    expect(r.coins).toBe(results[0]!.prize);
    expect(q.coins).toBe(RACE_DNF_PRIZE);
    expect(activeCar(q).damage).toBe(40);
    expect(activeCar(r).wins).toBe(1);
    expect(garageOf(q).best).toEqual({});
    expect(garageOf(r).best['farm:2']).toBe(140_000);
    const everyone = changes.filter((c) => c.t === 'toast' && c.to === null);
    expect(everyone).toHaveLength(1);
    expect((everyone[0] as { text: string }).text).toContain('Cia');
  });
});

describe('free roam', () => {
  it('turns coins into kr up to the daily limit, and again the next day', () => {
    const { world, p } = setup(0);
    roamDone(world, p.id, 30, 12, ctx);
    expect(p.coins).toBe(30 * ROAM_COIN_KR);
    expect(activeCar(p).damage).toBe(12);
    roamDone(world, p.id, 30, 0, ctx);
    expect(p.coins).toBe(ROAM_COINS_PER_DAY * ROAM_COIN_KR);
    const t = toasts(roamDone(world, p.id, 30, 0, ctx));
    expect(t).toEqual([T.rallyRoamCapped]);
    expect(p.coins).toBe(ROAM_COINS_PER_DAY * ROAM_COIN_KR);
    world.day++;
    roamDone(world, p.id, 9999, 0, ctx);
    expect(p.coins).toBe((ROAM_COINS_PER_DAY + 40) * ROAM_COIN_KR);
    expect(p.stats.rallyCoins).toBe(80);
  });
});

describe('overnight and the garage building', () => {
  it('mends every car a little each morning', () => {
    const { world, p } = setup();
    g(world, p, { a: 'buyCar', body: 'buggy' });
    const [a, b] = garageOf(p).cars;
    a!.damage = 40;
    b!.damage = 5;
    const out = healCars(world);
    expect(a!.damage).toBe(40 - DAMAGE_HEAL_PER_DAY);
    expect(b!.damage).toBe(0);
    expect(out.some((c) => c.t === 'player' && c.id === p.id)).toBe(true);
    expect(healCars({ ...world, players: {} })).toEqual([]);
    newDay(world, ctx);
    expect(a!.damage).toBe(Math.max(0, 40 - 2 * DAMAGE_HEAL_PER_DAY));
  });

  const garages = (w: WorldState) => Object.values(w.objects).filter((o) => o.kind === 'rally_garage');

  it('puts exactly one garage on a new farm, reachable and blocking nothing', () => {
    for (const seed of [1, 1337, 42]) {
      const world = generateWorld(seed);
      const before = reachableFrom(world, SPAWN);
      expect(ensureGarage(world)).toBe(true);
      expect(ensureGarage(world)).toBe(false);
      const gs = garages(world);
      expect(gs).toHaveLength(1);
      const gar = gs[0]!;
      const def = objectDef('rally_garage');
      const after = reachableFrom(world, SPAWN);
      expect(after[(gar.y + def.h) * MAP_W + gar.x + 1]).toBe(1);
      for (let i = 0; i < before.length; i++) {
        const x = i % MAP_W;
        const y = Math.floor(i / MAP_W);
        const under = x >= gar.x && x < gar.x + def.w && y >= gar.y && y < gar.y + def.h;
        if (before[i] && !under) expect(after[i]).toBe(1);
      }
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) expect(world.terrain[(gar.y + dy) * MAP_W + gar.x + dx]).not.toBe('water');
    }
  });

  it('builds one on a saved farm without one, around crops and things in the way', () => {
    const world = generateWorld(1);
    // a farmer has planted and built right where the garage would go
    for (let y = 6; y <= 12; y++)
      for (let x = 16; x <= 24; x++) {
        if (objectAt(world, x, y)) continue;
        world.terrain[y * MAP_W + x] = 'soil';
        world.crops[`${x},${y}`] = { crop: 'carrot', stage: 0, progress: 0, watered: false } as never;
      }
    expect(ensureGarage(world)).toBe(true);
    const gar = garages(world)[0]!;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 3; dx++) {
        expect(world.crops[`${gar.x + dx},${gar.y + dy}`]).toBeUndefined();
        expect(world.terrain[(gar.y + dy) * MAP_W + gar.x + dx]).not.toBe('soil');
      }
    expect(Object.keys(world.crops).length).toBeGreaterThan(30);
  });

  it('opens the garage window and hands out the starter car', () => {
    const { world, p } = setup();
    ensureGarage(world);
    const gar = garages(world)[0]!;
    p.x = (gar.x + 1) * TILE + TILE / 2;
    p.y = (gar.y + 2) * TILE + TILE / 2;
    p.facing = 'up';
    delete p.garage;
    const ch = performAction(world, p.id, gar.x + 1, gar.y + 1, ctx);
    expect(ch.some((c) => c.t === 'open' && c.ui === 'rally' && c.id === gar.id)).toBe(true);
    expect(world.players[p.id]!.garage?.cars).toHaveLength(1);
  });
});

describe('rules', () => {
  it('cleans junk into valid rules', () => {
    expect(cleanRules(null)).toEqual(defaultRules());
    expect(cleanRules('fast')).toEqual(defaultRules());
    const r = cleanRules({ course: 'moon', laps: 99, ai: -3, damage: 'yes', difficulty: 'insane', time: 'night', weather: 'snow', nitro: 0, sameCars: 1, pickups: false, extra: 1 });
    expect(r).toEqual({ ...defaultRules(), laps: 5, ai: 0, time: 'night', pickups: false });
    expect(cleanRules({ laps: Number.POSITIVE_INFINITY }).laps).toBe(defaultRules().laps);
    expect(Object.keys(r).sort()).toEqual(Object.keys(defaultRules()).sort());
  });
});
