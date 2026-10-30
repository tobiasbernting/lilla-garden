// Rallyvärlden in the sim: the garage on a player (buy, tune, style, repair, rename, sell), prizes for
// solo and online races, the free-roam coins, damage that mends overnight and the garage on the farm.
// Pure functions over WorldState like sim.ts; the server keeps the rooms and relays the snapshots.
//
// Trust: races run on the clients, so reported places, times, damage and coins are only range-clamped.
// Money always comes from the formulas in rally.ts.

import { cleanChat } from './chat.ts';
import { ITEMS, objectDef } from './data.ts';
import { SPAWN, addObject, inBounds, inInterior, objectAt, removeObject, tileIndex } from './map.ts';
import type { Change, ClientMsg } from './protocol.ts';
import {
  CAR_BODY_DEFS,
  CAR_DECALS,
  CAR_DRIVERS,
  CAR_EXTRAS,
  CAR_FINISHES,
  CAR_HORNS,
  CAR_LIVERIES,
  CAR_NAME_MAX,
  CAR_PAINTS,
  CAR_SMOKES,
  CAR_SPOILERS,
  CAR_WHEELS,
  DAMAGE_HEAL_PER_DAY,
  DECAL_SLOTS,
  MAX_CARS,
  MAX_CARS_ON_TRACK,
  PART_MAX_LEVEL,
  PART_PRICES,
  PLATE_MAX,
  RACE_DNF_PRIZE,
  ROAM_COIN_COUNT,
  ROAM_COIN_KR,
  ROAM_COINS_PER_DAY,
  STYLE_PRICES,
  cleanRules,
  isCarBody,
  isCarPart,
  newCar,
  raceMedal,
  racePrize,
  repairCost,
  sellPrice,
  type CarExtra,
  type CarStyle,
  type GarageCar,
  type GarageState,
  type RaceResultLine,
  type RaceRules,
} from './rally.ts';
import { bump, farmOf, playerChange, toast, type SimCtx } from './sim.ts';
import { CAR_DEFAULT_NAMES, RALLY_COURSE_NAMES, CAR_PART_NAMES, T, fmt } from './sv.ts';
import { MAP_H, MAP_W, WALL_TERRAIN, key, type PlayerState, type WorldState } from './types.ts';
import { inEdgeGap, reachableFrom, walkableTile } from './worldgen.ts';

/** Shortest race time the server believes (ms); and the longest. */
export const RACE_MIN_MS = 10_000;
export const RACE_MAX_MS = 15 * 60_000;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** A number from a client, or `def` when it is not a finite number. */
const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);

// ---------------------------------------------------------------------------
// The garage on a player
// ---------------------------------------------------------------------------

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** The paint closest to a colour (the starter car is painted like the player's shirt). */
export function nearestPaint(color: string | undefined): string {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return '#e8412c';
  const [r, g, b] = hex(color);
  let best: string = CAR_PAINTS[0];
  let bestD = Infinity;
  for (const p of CAR_PAINTS) {
    const [pr, pg, pb] = hex(p);
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The player's garage, created on first use with a free starter car in the colour of their shirt. */
export function garageOf(p: PlayerState): GarageState {
  if (!p.garage) {
    const paint = nearestPaint(ITEMS[p.outfit?.shirt ?? '']?.clothing?.color);
    p.garage = { cars: [newCar(1, 'hatch', T.rallyStarterName, paint)], active: 1, nextId: 2, best: {}, roamDay: 0, roamCoins: 0 };
  }
  return p.garage;
}

/** The car the player drives (the first one if the active id went missing). */
export function activeCar(p: PlayerState): GarageCar {
  const g = garageOf(p);
  let car = g.cars.find((c) => c.id === g.active);
  if (!car) {
    car = g.cars[0]!;
    g.active = car.id;
  }
  return car;
}

/** A car name: cleaned like chat, at most CAR_NAME_MAX characters (empty when nothing is left). */
export const cleanCarName = (s: unknown): string => [...cleanChat(s)].slice(0, CAR_NAME_MAX).join('').trim();
/** Number plate text: cleaned like chat, at most PLATE_MAX characters. */
export const cleanPlate = (s: unknown): string => [...cleanChat(s)].slice(0, PLATE_MAX).join('').trim();

/** A default name for a new car that no other car in the garage has yet ("Blixten", "Blixten 2"…). */
function freeName(g: GarageState, base: string): string {
  const taken = new Set(g.cars.map((c) => c.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${[...base].slice(0, CAR_NAME_MAX - 3).join('')} ${i}`;
    if (!taken.has(n)) return n;
  }
}

const isPaint = (v: unknown): v is string => typeof v === 'string' && (CAR_PAINTS as readonly string[]).includes(v);
const pick = <K extends string>(v: unknown, list: readonly K[]): K | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as K) : undefined);

/**
 * Applies a style patch from a client. Every field present is the new value (decals and extras are
 * the whole new set); unknown values are ignored. Returns the new style and what the changes cost.
 */
export function applyStyle(cur: CarStyle, patch: unknown): { style: CarStyle; cost: number; changed: number } {
  const next: CarStyle = { ...cur, decals: { ...cur.decals }, extras: [...cur.extras] };
  let cost = 0;
  let changed = 0;
  if (!patch || typeof patch !== 'object') return { style: next, cost, changed };
  const o = patch as Record<string, unknown>;
  const set = <F extends keyof CarStyle>(field: F, v: CarStyle[F] | undefined, price: number): void => {
    if (v === undefined || v === next[field]) return;
    next[field] = v;
    cost += price;
    changed++;
  };
  if ('paint' in o && isPaint(o.paint)) set('paint', o.paint, STYLE_PRICES.paint);
  if ('paint2' in o && isPaint(o.paint2)) set('paint2', o.paint2, STYLE_PRICES.paint2);
  if ('rimColor' in o && isPaint(o.rimColor)) set('rimColor', o.rimColor, STYLE_PRICES.rimColor);
  if ('glow' in o && (o.glow === null || isPaint(o.glow))) set('glow', o.glow, o.glow === null ? 0 : STYLE_PRICES.glow);
  set('finish', pick(o.finish, CAR_FINISHES), STYLE_PRICES.finish);
  set('livery', pick(o.livery, CAR_LIVERIES), STYLE_PRICES.livery);
  set('wheels', pick(o.wheels, CAR_WHEELS), STYLE_PRICES.wheels);
  set('spoiler', pick(o.spoiler, CAR_SPOILERS), STYLE_PRICES.spoiler);
  set('horn', pick(o.horn, CAR_HORNS), STYLE_PRICES.horn);
  set('driver', pick(o.driver, CAR_DRIVERS), STYLE_PRICES.driver);
  set('smoke', pick(o.smoke, CAR_SMOKES), STYLE_PRICES.smoke);
  if (typeof o.number === 'number' && Number.isFinite(o.number)) set('number', clamp(Math.round(o.number), 1, 99), STYLE_PRICES.number);
  if (typeof o.plate === 'string') set('plate', cleanPlate(o.plate), STYLE_PRICES.plate);
  if (Array.isArray(o.extras)) {
    const want = CAR_EXTRAS.filter((e) => (o.extras as unknown[]).includes(e));
    const added = want.filter((e) => !cur.extras.includes(e)).length;
    const same = want.length === cur.extras.length && want.every((e) => cur.extras.includes(e));
    if (!same) {
      next.extras = want as CarExtra[];
      cost += added * STYLE_PRICES.extra;
      changed++;
    }
  }
  if (o.decals && typeof o.decals === 'object' && !Array.isArray(o.decals)) {
    const d = o.decals as Record<string, unknown>;
    for (const slot of DECAL_SLOTS) {
      const v = d[slot];
      const decal = pick(v, CAR_DECALS);
      if (decal) {
        if (cur.decals[slot] === decal) continue;
        next.decals[slot] = decal;
        cost += STYLE_PRICES.decal;
        changed++;
      } else if (v === undefined || v === null || v === '' || v === 'none') {
        // gone from the set: peeled off, for free
        if (cur.decals[slot] === undefined) continue;
        delete next.decals[slot];
        changed++;
      }
    }
  }
  return { style: next, cost, changed };
}

type GarageMsg = Extract<ClientMsg, { t: 'garage' }>;

/** Everything done in the garage window. */
export function garageAction(world: WorldState, playerId: string, msg: GarageMsg, ctx: SimCtx): Change[] {
  void ctx;
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !msg || typeof msg !== 'object') return [];
  const g = garageOf(p);
  const out: Change[] = [];
  const carById = (id: unknown): GarageCar | undefined => g.cars.find((c) => c.id === id);
  const pay = (kr: number): boolean => {
    if (p.coins < kr) {
      out.push(toast(p.id, fmt(T.rallyTooPoor, { kr })));
      return false;
    }
    p.coins -= kr;
    return true;
  };
  switch (msg.a) {
    case 'buyCar': {
      if (!isCarBody(msg.body)) return [];
      if (g.cars.length >= MAX_CARS) return [toast(p.id, T.rallyGarageFull)];
      if (!pay(CAR_BODY_DEFS[msg.body].price)) return out;
      const name = cleanCarName(msg.name) || freeName(g, CAR_DEFAULT_NAMES[msg.body] ?? T.rallyStarterName);
      const car = newCar(g.nextId++, msg.body, name, activeCar(p).style.paint);
      g.cars.push(car);
      g.active = car.id;
      bump(p, 'rallyCars', 1, out);
      out.push(toast(p.id, fmt(T.rallyCarBought, { name: car.name })));
      break;
    }
    case 'select': {
      const car = carById(msg.car);
      if (!car) return [];
      g.active = car.id;
      out.push(toast(p.id, fmt(T.rallyCarSelected, { name: car.name })));
      break;
    }
    case 'part': {
      const car = carById(msg.car);
      if (!car || !isCarPart(msg.part)) return [];
      const level = car.parts[msg.part] ?? 0;
      if (level >= PART_MAX_LEVEL) return [toast(p.id, T.rallyPartMax)];
      if (!pay(PART_PRICES[msg.part][level]!)) return out;
      car.parts[msg.part] = level + 1;
      bump(p, 'rallyParts', 1, out);
      out.push(toast(p.id, fmt(T.rallyPartBought, { part: CAR_PART_NAMES[msg.part] ?? msg.part, level: level + 1, name: car.name })));
      break;
    }
    case 'style': {
      const car = carById(msg.car);
      if (!car) return [];
      const { style, cost, changed } = applyStyle(car.style, msg.style);
      if (changed === 0) return [playerChange(p)];
      if (!pay(cost)) return out;
      car.style = style;
      bump(p, 'rallyStyle', 1, out);
      out.push(toast(p.id, cost > 0 ? fmt(T.rallyStyledPaid, { name: car.name, kr: cost }) : fmt(T.rallyStyled, { name: car.name })));
      break;
    }
    case 'repair': {
      const car = carById(msg.car);
      if (!car) return [];
      const kr = repairCost(car);
      if (car.damage <= 0 || kr <= 0) return [toast(p.id, T.rallyNotDamaged)];
      if (!pay(kr)) return out;
      car.damage = 0;
      bump(p, 'rallyRepairs', 1, out);
      out.push(toast(p.id, fmt(T.rallyRepaired, { name: car.name, kr })));
      break;
    }
    case 'rename': {
      const car = carById(msg.car);
      const name = cleanCarName(msg.name);
      if (!car || !name) return [];
      car.name = name;
      out.push(toast(p.id, fmt(T.rallyRenamed, { name })));
      break;
    }
    case 'sell': {
      const car = carById(msg.car);
      if (!car) return [];
      if (g.cars.length <= 1) return [toast(p.id, T.rallyLastCar)];
      const kr = sellPrice(car);
      g.cars = g.cars.filter((c) => c !== car);
      if (g.active === car.id) g.active = g.cars[0]!.id;
      p.coins += kr;
      out.push(toast(p.id, fmt(T.rallySold, { name: car.name, kr })));
      break;
    }
    default:
      return [];
  }
  out.push(playerChange(p));
  return out;
}

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------

/** 62345 → "1:02.3" */
export function fmtRaceTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** Key for the best time on a course over a number of laps. */
export const bestKey = (r: RaceRules): string => `${r.course}:${r.laps}`;

const MEDAL_TEXT = { gold: T.rallyMedalGold, silver: T.rallyMedalSilver, bronze: T.rallyMedalBronze } as const;

const clampTime = (t: unknown): number => clamp(Math.round(num(t, RACE_MAX_MS)), RACE_MIN_MS, RACE_MAX_MS);
const clampDamage = (d: unknown): number => clamp(Math.round(num(d, 0)), 0, 100);

/**
 * Books one finished (time) or unfinished (null) race on a player's car: prize, damage, counters and the
 * best time. Returns the toast text for the player.
 */
function bookRace(p: PlayerState, car: GarageCar, rules: RaceRules, place: number, n: number, time: number | null, damage: number, out: Change[]): { prize: number; medal: RaceResultLine['medal']; text: string } {
  const g = garageOf(p);
  const prize = time === null ? RACE_DNF_PRIZE : racePrize(rules, place, n);
  p.coins += prize;
  if (rules.damage) car.damage = damage;
  car.races++;
  const won = time !== null && place === 1 && n > 1;
  if (won) car.wins++;
  const parts = [time === null ? fmt(T.rallyDnf, { kr: prize }) : fmt(T.rallyPlace, { place, n, kr: prize })];
  let medal: RaceResultLine['medal'] = null;
  if (time !== null) {
    medal = raceMedal(rules.course, rules.laps, time);
    if (medal) parts.push(MEDAL_TEXT[medal]);
    const k = bestKey(rules);
    const before = g.best[k];
    if (before === undefined || time < before) {
      g.best[k] = time;
      if (before !== undefined) parts.push(fmt(T.rallyNewBest, { time: fmtRaceTime(time) }));
    }
  }
  bump(p, 'rallyRaces', 1, out);
  if (won) bump(p, 'rallyWins', 1, out);
  bump(p, 'rallyKr', prize, out);
  bump(p, 'earned', prize, out);
  return { prize, medal, text: parts.join(' ') };
}

/** A race alone against the computer cars ended: pay the prize and keep the time and the damage. */
export function raceSolo(world: WorldState, pid: string, rules: unknown, place: unknown, n: unknown, time: unknown, damage: unknown, ctx: SimCtx): Change[] {
  void ctx;
  const farm = farmOf(world);
  const p = farm.players[pid];
  if (!p) return [];
  const r = cleanRules(rules);
  const cars = clamp(Math.round(num(n, 1)), 1, MAX_CARS_ON_TRACK);
  const pl = clamp(Math.round(num(place, cars)), 1, cars);
  const out: Change[] = [];
  const res = bookRace(p, activeCar(p), r, pl, cars, clampTime(time), clampDamage(damage), out);
  out.push(toast(p.id, res.text), playerChange(p));
  return out;
}

/** One racer's line in an online race as the server collected it (time null: did not finish). */
export interface RaceLineIn {
  id: string;
  time: number | null;
  damage: number;
  /** The car raced with (the member's snapshot); the active car when missing or gone. */
  car?: number;
}

/**
 * An online race ended: places by time (the ones who did not finish last), prizes for everyone,
 * damage, best times and counters, and one toast for the whole family with the winner.
 */
export function raceOnlineResult(world: WorldState, roomRules: unknown, lines: RaceLineIn[], ctx: SimCtx): { changes: Change[]; results: RaceResultLine[] } {
  void ctx;
  const farm = farmOf(world);
  const rules = cleanRules(roomRules);
  const changes: Change[] = [];
  const results: RaceResultLine[] = [];
  const known = lines.filter((l) => farm.players[l.id]);
  const finished = known.filter((l) => l.time !== null && Number.isFinite(l.time)).map((l) => ({ ...l, time: clampTime(l.time) }));
  finished.sort((a, b) => a.time - b.time);
  const dnf = known.filter((l) => !(l.time !== null && Number.isFinite(l.time)));
  const n = clamp(known.length + rules.ai, 1, MAX_CARS_ON_TRACK);
  const ordered: { line: RaceLineIn; time: number | null }[] = [...finished.map((l) => ({ line: l as RaceLineIn, time: l.time })), ...dnf.map((l) => ({ line: l, time: null }))];
  ordered.forEach(({ line, time }, i) => {
    const p = farm.players[line.id]!;
    const g = garageOf(p);
    const car = g.cars.find((c) => c.id === line.car) ?? activeCar(p);
    const place = i + 1;
    const res = bookRace(p, car, rules, place, n, time, clampDamage(line.damage), changes);
    changes.push(toast(p.id, res.text), playerChange(p));
    results.push({ id: p.id, name: p.name, time, place, prize: res.prize, medal: res.medal });
  });
  const winner = results.find((r) => r.time !== null);
  if (winner && results.length > 1) changes.push(toast(null, fmt(T.rallyWinner, { name: winner.name, course: RALLY_COURSE_NAMES[rules.course] ?? rules.course })));
  return { changes, results };
}

/** Saves the damage of the car after a race (when the result card is closed). Only with damage on. */
export function saveCarDamage(world: WorldState, pid: string, damage: unknown, carId?: number): Change[] {
  const p = farmOf(world).players[pid];
  if (!p) return [];
  const g = garageOf(p);
  const car = g.cars.find((c) => c.id === carId) ?? activeCar(p);
  const d = clampDamage(damage);
  if (car.damage === d) return [];
  car.damage = d;
  return [playerChange(p)];
}

// ---------------------------------------------------------------------------
// Free roam
// ---------------------------------------------------------------------------

/** Back from free roam: the coins found turn into kr (up to the daily limit) and the car keeps its dents. */
export function roamDone(world: WorldState, pid: string, coins: unknown, damage: unknown, ctx: SimCtx): Change[] {
  void ctx;
  const farm = farmOf(world);
  const p = farm.players[pid];
  if (!p) return [];
  const g = garageOf(p);
  if (g.roamDay !== farm.day) {
    g.roamDay = farm.day;
    g.roamCoins = 0;
  }
  const found = clamp(Math.round(num(coins, 0)), 0, ROAM_COIN_COUNT);
  const take = Math.min(found, Math.max(0, ROAM_COINS_PER_DAY - g.roamCoins));
  const out: Change[] = [];
  activeCar(p).damage = clampDamage(damage);
  if (take > 0) {
    const kr = take * ROAM_COIN_KR;
    g.roamCoins += take;
    p.coins += kr;
    bump(p, 'rallyCoins', take, out);
    bump(p, 'earned', kr, out);
    out.push(toast(p.id, fmt(T.rallyRoamCoins, { n: take, kr })));
  } else out.push(toast(p.id, found > 0 ? T.rallyRoamCapped : T.rallyRoamNone));
  out.push(playerChange(p));
  return out;
}

// ---------------------------------------------------------------------------
// The morning and the garage on the farm
// ---------------------------------------------------------------------------

/** A new morning: every car mends a little by itself. */
export function healCars(world: WorldState, out: Change[] = []): Change[] {
  for (const p of Object.values(world.players)) {
    if (!p.garage) continue;
    let healed = false;
    for (const c of p.garage.cars) {
      if (c.damage <= 0) continue;
      c.damage = Math.max(0, c.damage - DAMAGE_HEAL_PER_DAY);
      healed = true;
    }
    if (healed) out.push(playerChange(p));
  }
  return out;
}

/** Where the garage goes on the farm: east of the farmhouse, at the end of the path. */
export const GARAGE_SPOT = { x: 18, y: 8 };

/** Ground a building may stand on. */
const BUILD_GROUND = new Set(['grass', 'sand', 'gravel', 'snow', 'moss', 'path_dirt', 'path_stone']);

/**
 * Puts the garage on a farm that has none: on open ground near GARAGE_SPOT, never on crops, water or
 * anything built, and only where everything that was reachable stays reachable. Returns true if added.
 */
export function ensureGarage(farm: WorldState): boolean {
  if (farm.area && farm.area !== 'farm') return false;
  if (Object.values(farm.objects).some((o) => o.kind === 'rally_garage')) return false;
  const def = objectDef('rally_garage');
  /** Grass tufts and flowers may go; anything else on the tile keeps it from being used. */
  const clearable = (x: number, y: number): boolean => {
    const o = objectAt(farm, x, y);
    if (!o) return true;
    const d = objectDef(o.kind);
    return d.flat === true && d.solid === false && d.regrowDays !== undefined;
  };
  const freeTile = (x: number, y: number): boolean =>
    inBounds(x, y) && !inInterior(x, y) && !inEdgeGap(x, y) && x >= 2 && y >= 2 && BUILD_GROUND.has(farm.terrain[tileIndex(x, y)]!) && !farm.crops[key(x, y)] && clearable(x, y);
  const fits = (x: number, y: number): boolean => {
    // the footprint, a free tile in front of the door and a free ring around it so nothing gets wedged in
    for (let dy = -1; dy <= def.h; dy++)
      for (let dx = -1; dx <= def.w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        const inside = dx >= 0 && dx < def.w && dy >= 0 && dy < def.h;
        if (inside || (dy === def.h && dx === Math.floor((def.w - 1) / 2))) {
          if (!freeTile(tx, ty)) return false;
        } else if (!inBounds(tx, ty) || WALL_TERRAIN.has(farm.terrain[tileIndex(tx, ty)]!)) return false;
      }
    return true;
  };
  const before = reachableFrom(farm, SPAWN);
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = 2; y < MAP_H - 2; y++)
    for (let x = 2; x < MAP_W - 2; x++) {
      const d = Math.abs(x - GARAGE_SPOT.x) + Math.abs(y - GARAGE_SPOT.y);
      if (d <= 30) candidates.push({ x, y, d });
    }
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of candidates) {
    const front = tileIndex(c.x + Math.floor((def.w - 1) / 2), c.y + def.h);
    if (!before[front] || !fits(c.x, c.y)) continue;
    // with the footprint blocked, everything reachable before must stay reachable
    const inFoot = (x: number, y: number): boolean => x >= c.x && x < c.x + def.w && y >= c.y && y < c.y + def.h;
    const after = reachWithout(farm, SPAWN, inFoot);
    let ok = true;
    for (let i = 0; ok && i < before.length; i++) if (before[i] && !after[i] && !inFoot(i % MAP_W, Math.floor(i / MAP_W))) ok = false;
    if (!ok) continue;
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++) {
        const o = objectAt(farm, c.x + dx, c.y + dy);
        if (o) removeObject(farm, o.id);
      }
    addObject(farm, 'rally_garage', c.x, c.y);
    return true;
  }
  return false;
}

/** Like reachableFrom, with some tiles counted as blocked (a building being tried out). */
function reachWithout(world: WorldState, start: { x: number; y: number }, blocked: (x: number, y: number) => boolean): Uint8Array {
  const seen = new Uint8Array(MAP_W * MAP_H);
  if (!walkableTile(world, start.x, start.y) || blocked(start.x, start.y)) return seen;
  const queue = [tileIndex(start.x, start.y)];
  seen[queue[0]!] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const n = tileIndex(nx, ny);
      if (seen[n] || blocked(nx, ny) || !walkableTile(world, nx, ny)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}
