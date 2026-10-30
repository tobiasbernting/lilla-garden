// Minigames: Spelhallen in every city, the TV at home, scores, tickets, prizes and cartridges.
import { describe, expect, it } from 'vitest';
import {
  ARCADE_GAMES,
  HALL_BOARD,
  HALL_COUNTER,
  HALL_MACHINES,
  INDOOR_EXIT,
  LOOT,
  MAX_TICKETS_PER_DAY,
  MAX_TICKETS_PER_GAME,
  PRIZES,
  SPARE_CART_TICKETS,
  TILE,
  TV_GAMES,
  TV_SPOT,
  addObject,
  arcadeScore,
  areaOf,
  buyPrize,
  countItem,
  createPlayer,
  ensureArcadeHall,
  ensureTv,
  familyGames,
  generateHall,
  generateWorld,
  getArea,
  grantLoot,
  objectAt,
  performAction,
  reachableFrom,
  setOnline,
  teleport,
  tick,
  travel,
  type Change,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const T0 = 1_000_000;
const at = (now: number, seed = 0.5): SimCtx => ({ season: 'none', rnd: () => seed, now });
const toasts = (ch: Change[]): { to: string | null; text: string }[] => ch.filter((c) => c.t === 'toast').map((c) => c as { to: string | null; text: string });

function setup(): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Elsa', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
  setOnline(world, p.id, true);
  return { world, p };
}

function standAt(p: PlayerState, tx: number, ty: number, facing: PlayerState['facing'] = 'up'): void {
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE / 2;
  p.facing = facing;
}

/** Walks east into the city next to the farm and in through Spelhallen's door. */
function toHall(): { world: WorldState; p: PlayerState; village: WorldState; hall: WorldState } {
  const { world, p } = setup();
  standAt(p, 63, 32, 'right');
  travel(world, p.id, 'e');
  const village = areaOf(world, p);
  const door = Object.values(village.objects).find((o) => o.kind === 'arcade_hall')!;
  standAt(p, door.x + 1, door.y + 2);
  performAction(village, p.id, door.x + 1, door.y + 1, at(T0));
  return { world, p, village, hall: areaOf(world, p) };
}

/** Turns on the machine for a game (standing in front of it). */
function useMachine(hall: WorldState, p: PlayerState, game: (typeof ARCADE_GAMES)[number], now: number): Change[] {
  const m = HALL_MACHINES[ARCADE_GAMES.indexOf(game)]!;
  standAt(p, m.x, m.y + 1);
  return performAction(hall, p.id, m.x, m.y, at(now));
}

describe('Spelhallen', () => {
  it('stands in every city, also cities saved before it existed', () => {
    const { village } = toHall();
    const halls = Object.values(village.objects).filter((o) => o.kind === 'arcade_hall');
    expect(halls).toHaveLength(1);
    delete village.objects[halls[0]!.id];
    for (const [k, id] of Object.entries(village.occupancy)) if (id === halls[0]!.id) delete village.occupancy[k];
    expect(ensureArcadeHall(village)).toBe(true);
    expect(ensureArcadeHall(village)).toBe(false);
    expect(Object.values(village.objects).filter((o) => o.kind === 'arcade_hall')).toHaveLength(1);
  });

  it('has a machine for every game, the score board and the prize counter, all reachable from the door', () => {
    const hall = generateHall('a:1,0');
    const machines = Object.values(hall.objects).filter((o) => o.kind === 'arcade_machine');
    expect(machines.map((m) => m.variant).sort()).toEqual(ARCADE_GAMES.map((_, i) => i));
    expect(objectAt(hall, HALL_BOARD.x, HALL_BOARD.y)?.kind).toBe('score_board');
    expect(objectAt(hall, HALL_COUNTER.x, HALL_COUNTER.y)?.kind).toBe('prize_counter');
    const reach = reachableFrom(hall, { x: INDOOR_EXIT.x, y: INDOOR_EXIT.y - 1 });
    const fronts = [...HALL_MACHINES, HALL_BOARD, { x: HALL_COUNTER.x + 1, y: HALL_COUNTER.y }].map((s) => ({ x: s.x, y: s.y + 1 }));
    for (const f of fronts) expect(reach[f.y * 64 + f.x], `${f.x},${f.y}`).toBe(1);
  });

  it('a machine plays its own game and wins tickets, a few a day; prizes cost tickets; out through the door', () => {
    const { world, p, village, hall } = toHall();
    expect(p.area).toBe('arcade:a:1,0');
    expect(hall.biome).toBe('hall');
    const ch = useMachine(hall, p, 'rally', T0);
    const machine = objectAt(hall, HALL_MACHINES[0]!.x, HALL_MACHINES[0]!.y)!;
    expect(ch).toContainEqual({ t: 'open', to: p.id, ui: 'arcade', id: machine.id });
    // too quick to be a real game, or another game than the machine's: nothing
    expect(arcadeScore(world, p.id, 'rally', 10_000, at(T0 + 1000))).toEqual([]);
    expect(arcadeScore(world, p.id, 'snow', 10_000, at(T0 + 60_000))).toEqual([]);
    // a real run: the best score and tickets
    arcadeScore(world, p.id, 'rally', 10_000, at(T0 + 60_000));
    expect(p.arcade!.best.rally).toBe(10_000);
    expect(p.arcade!.tickets).toBe(20);
    expect(p.achievements).toContain('arcade_1');
    // the same score sent again at once only keeps the score
    arcadeScore(world, p.id, 'rally', 12_000, at(T0 + 61_000));
    expect(p.arcade!.best.rally).toBe(12_000);
    expect(p.arcade!.tickets).toBe(20);
    // at most MAX_TICKETS_PER_GAME a game, and MAX_TICKETS_PER_DAY a day
    arcadeScore(world, p.id, 'rally', 99_999, at(T0 + 120_000));
    expect(p.arcade!.tickets).toBe(20 + MAX_TICKETS_PER_GAME);
    p.arcade!.won = MAX_TICKETS_PER_DAY - 3;
    arcadeScore(world, p.id, 'rally', 99_999, at(T0 + 180_000));
    expect(p.arcade!.tickets).toBe(20 + MAX_TICKETS_PER_GAME + 3);
    world.day++;
    arcadeScore(world, p.id, 'rally', 5_000, at(T0 + 240_000));
    expect(p.arcade!.tickets).toBe(20 + MAX_TICKETS_PER_GAME + 3 + 10);

    // the prize counter
    p.arcade!.tickets = 200;
    buyPrize(world, p.id, 'plush_cow');
    expect(countItem(p.inventory, 'plush_cow')).toBe(1);
    expect(p.arcade!.tickets).toBe(200 - PRIZES.find((x) => x.item === 'plush_cow')!.tickets);
    const before = p.arcade!.tickets;
    buyPrize(world, p.id, 'cart_rally');
    expect(familyGames(world)).toContain('rally');
    expect(p.arcade!.tickets).toBe(before - 100);
    expect(toasts(buyPrize(world, p.id, 'cart_rally'))[0]!.text).toMatch(/redan/);
    expect(toasts(buyPrize(world, p.id, 'plush_dragon'))[0]!.text).toMatch(/inte tillräckligt/);
    expect(buyPrize(world, p.id, 'gold')).toEqual([]);

    // out through the door, back on the street; prizes are only sold inside
    standAt(p, INDOOR_EXIT.x, INDOOR_EXIT.y - 1, 'down');
    performAction(hall, p.id, INDOOR_EXIT.x, INDOOR_EXIT.y, at(T0 + 300_000));
    expect(p.area).toBe('a:1,0');
    const door = Object.values(village.objects).find((o) => o.kind === 'arcade_hall')!;
    expect(Math.floor(p.x / TILE)).toBe(door.x + 1);
    expect(Math.floor(p.y / TILE)).toBe(door.y + 2);
    p.arcade!.tickets = 999;
    expect(buyPrize(world, p.id, 'plush_hen')).toEqual([]);
    // no teleporting into the hall; walking onto the door tile also leads out
    expect(teleport(world, p.id, 'arcade:a:1,0')).toEqual([]);
    performAction(village, p.id, door.x + 1, door.y + 1, at(T0 + 400_000));
    delete p.moveLock;
    standAt(p, INDOOR_EXIT.x, INDOOR_EXIT.y);
    tick(world, 50, at(T0 + 400_100));
    expect(p.area).toBe('a:1,0');
  });
});

describe('TV:n hemma', () => {
  it('stands in the farmhouse and plays the family games, without tickets', () => {
    const { world, p } = setup();
    const tv = objectAt(world, TV_SPOT.x, TV_SPOT.y)!;
    expect(tv.kind).toBe('tv');
    standAt(p, TV_SPOT.x, TV_SPOT.y + 1);
    const ch = performAction(world, p.id, TV_SPOT.x, TV_SPOT.y, at(T0));
    expect(ch).toContainEqual({ t: 'open', to: p.id, ui: 'arcade', id: tv.id });
    expect(familyGames(world)).toEqual(ARCADE_GAMES.filter((g) => TV_GAMES.includes(g)));
    arcadeScore(world, p.id, 'hen', 8000, at(T0 + 60_000));
    expect(p.arcade!.best.hen).toBe(8000);
    expect(p.arcade!.tickets).toBe(0);
    // a game nobody in the family has found yet does not count
    expect(arcadeScore(world, p.id, 'star', 8000, at(T0 + 120_000))).toEqual([]);
    // a found game is on everyone's TV, and beating someone else's record is news
    const p2 = createPlayer(world, 'Morfar', { skin: '#f0c0a0', hair: '#999999', hairStyle: 'short' });
    p2.arcade = { best: { star: 5000 }, tickets: 0, games: ['star'], day: 0, won: 0 };
    expect(familyGames(world)).toContain('star');
    const news = toasts(arcadeScore(world, p.id, 'star', 6000, at(T0 + 180_000)));
    expect(news).toContainEqual({ t: 'toast', to: null, text: expect.stringMatching(/Elsa slog familjerekordet i Stjärnstorm/) } as never);
  });

  it('is added to farmhouses saved before there were TVs, where there is room', () => {
    const { world } = setup();
    const tv = objectAt(world, TV_SPOT.x, TV_SPOT.y)!;
    delete world.objects[tv.id];
    for (const [k, id] of Object.entries(world.occupancy)) if (id === tv.id) delete world.occupancy[k];
    addObject(world, 'chair', TV_SPOT.x + 1, TV_SPOT.y);
    expect(ensureTv(world)).toBe(true);
    expect(ensureTv(world)).toBe(false);
    const tvs = Object.values(world.objects).filter((o) => o.kind === 'tv');
    expect(tvs).toHaveLength(1);
    expect(world.terrain[tvs[0]!.y * 64 + tvs[0]!.x]).toBe('floor_wood');
  });
});

describe('spelkassetter', () => {
  it('found in treasure: a new game on the TV, or tickets when the family has it', () => {
    const { world, p } = setup();
    LOOT.test_cart = { picks: 1, pool: [{ item: 'cart_star', min: 1, max: 1, weight: 1 }] };
    try {
      const got = grantLoot(world, p, 'test_cart', at(T0), []);
      expect(got.join()).toMatch(/Stjärnstorm/);
      expect(familyGames(world)).toContain('star');
      expect(countItem(p.inventory, 'cart_star')).toBe(0);
      grantLoot(world, p, 'test_cart', at(T0), []);
      expect(p.arcade!.tickets).toBe(SPARE_CART_TICKETS);
    } finally {
      delete LOOT.test_cart;
    }
  });

  it('the games found out in the world are in the caves and the UFO', () => {
    const where = Object.entries(LOOT).filter(([, t]) => t.pool.some((e) => e.item?.startsWith('cart_'))).map(([k]) => k);
    expect(where).toEqual(expect.arrayContaining(['cave_rot', 'cave_is', 'cave_godis', 'cave_rymd', 'ufo']));
    // every game that does not come with the TV can be found or won
    for (const g of ARCADE_GAMES.filter((x) => !TV_GAMES.includes(x))) {
      expect(PRIZES.some((x) => x.item === `cart_${g}`)).toBe(true);
      expect(Object.values(LOOT).some((t) => t.pool.some((e) => e.item === `cart_${g}`)), g).toBe(true);
    }
    expect(getArea).toBeTypeOf('function');
  });
});
