// Rallyvärlden: the garage, the cars and the races. Pure data, types and formulas shared by the sim, the
// server and the 3D rally game in packages/arcade. No I/O. Every player-facing string lives in sv.ts.
//
// A player owns cars (GarageCar) kept on their PlayerState (`garage`). A car has a body, tuning parts,
// a style (paint, livery, decals, wheels, spoiler, extras…) and damage 0..100. Races are run by the
// clients; the server keeps rooms, relays car snapshots and pays prizes with `racePrize`.

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

export const CAR_BODIES = ['hatch', 'buggy', 'pickup', 'coupe', 'monster'] as const;
export type CarBody = (typeof CAR_BODIES)[number];
export const isCarBody = (s: unknown): s is CarBody => typeof s === 'string' && (CAR_BODIES as readonly string[]).includes(s);

export interface CarBodyDef {
  id: CarBody;
  /** kr; the first body is the free starter car. */
  price: number;
  /** Multipliers on the base car in car.ts (1 = the old rally car). */
  power: number;
  grip: number;
  /** Damage resistance: damage taken is divided by this. */
  tough: number;
  /** Bigger bodies feel heavier (the model and the camera use it too). */
  size: number;
}

export const CAR_BODY_DEFS: Record<CarBody, CarBodyDef> = {
  hatch: { id: 'hatch', price: 0, power: 1.0, grip: 1.0, tough: 1.0, size: 1.0 },
  buggy: { id: 'buggy', price: 900, power: 0.95, grip: 1.1, tough: 0.9, size: 0.95 },
  pickup: { id: 'pickup', price: 1500, power: 1.05, grip: 0.95, tough: 1.3, size: 1.1 },
  coupe: { id: 'coupe', price: 2500, power: 1.2, grip: 1.05, tough: 0.85, size: 1.0 },
  monster: { id: 'monster', price: 4000, power: 1.1, grip: 0.9, tough: 1.5, size: 1.3 },
};

// ---------------------------------------------------------------------------
// Tuning parts (level 0..3 each)
// ---------------------------------------------------------------------------

export const CAR_PARTS = ['engine', 'tyres', 'suspension', 'brakes', 'turbo', 'armour'] as const;
export type CarPart = (typeof CAR_PARTS)[number];
export const isCarPart = (s: unknown): s is CarPart => typeof s === 'string' && (CAR_PARTS as readonly string[]).includes(s);
export const PART_MAX_LEVEL = 3;

/** kr for level 1, 2 and 3 of each part. */
export const PART_PRICES: Record<CarPart, [number, number, number]> = {
  engine: [200, 500, 1100],
  tyres: [150, 400, 900],
  suspension: [150, 400, 900],
  brakes: [100, 300, 700],
  turbo: [250, 600, 1200],
  armour: [150, 400, 900],
};

/** What the parts do to the car in car.ts, per level (the game multiplies/adds these). */
export const PART_EFFECTS = {
  /** power × (1 + level·this) */
  enginePower: 0.1,
  /** grip × (1 + level·this) */
  tyresGrip: 0.06,
  /** assist and slide-catching + level·this; landings softer */
  suspensionAssist: 0.08,
  /** brake force × (1 + level·this) */
  brakesForce: 0.12,
  /** nitro charges per race = level (0 none); each charge is NITRO_SECONDS of boost */
  turboCharges: 1,
  /** damage taken × (1 − level·this) */
  armourShield: 0.15,
} as const;
export const NITRO_SECONDS = 2.2;

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

/** Paints a kid can pick (hex). */
export const CAR_PAINTS = [
  '#e8412c', '#ff8a1f', '#f4c20d', '#8bc34a', '#2fa84f', '#18b7c9', '#2f6fe0', '#1f3a93',
  '#8a4fd8', '#d63aa5', '#f06ba8', '#ffb6c1', '#8c5a3c', '#5d4a32', '#f2f2f2', '#c9c9c9',
  '#6b7280', '#16161a', '#b8860b', '#00ced1', '#ff4500', '#7fff00', '#ffd700', '#e6e6fa',
] as const;

export const CAR_FINISHES = ['gloss', 'matte', 'metallic'] as const;
export type CarFinish = (typeof CAR_FINISHES)[number];

export const CAR_LIVERIES = ['none', 'stripe', 'stripes2', 'flames', 'checker', 'dots', 'zigzag', 'stars', 'hearts', 'camo', 'lightning', 'rainbow'] as const;
export type CarLivery = (typeof CAR_LIVERIES)[number];

/** Stickers. `number` paints the car's number in a roundel. */
export const CAR_DECALS = ['number', 'star', 'heart', 'flame', 'lightning', 'flower', 'rainbow', 'paw', 'cow', 'hen', 'pig', 'sheep', 'crown', 'smiley', 'flag', 'strawberry'] as const;
export type CarDecal = (typeof CAR_DECALS)[number];
/** Where a sticker can go; `doors` is mirrored on both sides. */
export const DECAL_SLOTS = ['hood', 'roof', 'doors', 'back'] as const;
export type DecalSlot = (typeof DECAL_SLOTS)[number];

export const CAR_WHEELS = ['steel', 'sport', 'offroad', 'star', 'gold'] as const;
export type CarWheels = (typeof CAR_WHEELS)[number];

export const CAR_SPOILERS = ['none', 'small', 'big', 'wing'] as const;
export type CarSpoiler = (typeof CAR_SPOILERS)[number];

/** Bolt-on extras (any number of them). */
export const CAR_EXTRAS = ['roofrack', 'lightbar', 'flag', 'bullbar', 'exhaust2', 'antenna', 'sideskirts', 'snorkel', 'antlers', 'ears', 'horsetail'] as const;
export type CarExtra = (typeof CAR_EXTRAS)[number];

export const CAR_HORNS = ['beep', 'tune', 'cow', 'duck', 'train', 'honk'] as const;
export type CarHorn = (typeof CAR_HORNS)[number];

/** Who sits behind the wheel: you, or one of the farm animals (the AI's faces in models.ts). */
export const CAR_DRIVERS = ['human', 'cow', 'horse', 'pig', 'rooster', 'sheep', 'dog', 'cat'] as const;
export type CarDriver = (typeof CAR_DRIVERS)[number];

/** Tyre smoke and boost flame colour. */
export const CAR_SMOKES = ['white', 'rainbow', 'hearts', 'hay', 'pink', 'blue', 'gold'] as const;
export type CarSmoke = (typeof CAR_SMOKES)[number];

export interface CarStyle {
  paint: string;
  /** Secondary colour (liveries, spoiler, rims where it fits). */
  paint2: string;
  finish: CarFinish;
  livery: CarLivery;
  decals: Partial<Record<DecalSlot, CarDecal>>;
  /** 1..99, shown by the `number` decal and on the plate. */
  number: number;
  wheels: CarWheels;
  rimColor: string;
  spoiler: CarSpoiler;
  extras: CarExtra[];
  horn: CarHorn;
  /** Underglow colour, shown at night and in tunnels; null for none. */
  glow: string | null;
  driver: CarDriver;
  smoke: CarSmoke;
  /** Text on the number plate (≤ 8 characters, cleaned like chat). */
  plate: string;
}

/** kr for each kind of change in the garage (paint is cheap so kids can play with it). */
export const STYLE_PRICES = {
  paint: 20,
  paint2: 20,
  finish: 40,
  livery: 50,
  decal: 15,
  number: 0,
  wheels: 120,
  rimColor: 20,
  spoiler: 150,
  extra: 100,
  horn: 40,
  glow: 150,
  driver: 0,
  smoke: 60,
  plate: 0,
} as const;

export const PLATE_MAX = 8;

export function defaultStyle(paint = '#e8412c'): CarStyle {
  return {
    paint,
    paint2: '#f2f2f2',
    finish: 'gloss',
    livery: 'none',
    decals: {},
    number: 7,
    wheels: 'steel',
    rimColor: '#c9c9c9',
    spoiler: 'none',
    extras: [],
    horn: 'beep',
    glow: null,
    driver: 'human',
    smoke: 'white',
    plate: '',
  };
}

// ---------------------------------------------------------------------------
// The garage on a player
// ---------------------------------------------------------------------------

export interface GarageCar {
  id: number;
  body: CarBody;
  /** The car's name (≤ 16 characters). */
  name: string;
  parts: Record<CarPart, number>;
  style: CarStyle;
  /** 0 (shiny) .. 100 (a wreck that still drives, slowly). */
  damage: number;
  races: number;
  wins: number;
}

export interface GarageState {
  cars: GarageCar[];
  /** Id of the car you drive. */
  active: number;
  nextId: number;
  /** Best time (ms) per course (solo and online alike), for the medals. */
  best: Record<string, number>;
  /** Free roam: coins collected today and the day they count for (daily limit). */
  roamDay: number;
  roamCoins: number;
}

export const MAX_CARS = 6;
export const CAR_NAME_MAX = 16;

export const emptyParts = (): Record<CarPart, number> => ({ engine: 0, tyres: 0, suspension: 0, brakes: 0, turbo: 0, armour: 0 });

export function newCar(id: number, body: CarBody, name: string, paint?: string): GarageCar {
  return { id, body, name, parts: emptyParts(), style: defaultStyle(paint), damage: 0, races: 0, wins: 0 };
}

/** What the car is worth (body + parts), for the repair bill and the sell price. */
export function carValue(car: GarageCar): number {
  let v = CAR_BODY_DEFS[car.body].price;
  for (const p of CAR_PARTS) for (let l = 0; l < (car.parts[p] ?? 0); l++) v += PART_PRICES[p][l]!;
  return v;
}

/** Selling a car gives half its value (never the last car). */
export const sellPrice = (car: GarageCar): number => Math.round(carValue(car) / 2);

/** The repair bill: about a tenth of a win for a scratched car, never more than REPAIR_MAX. */
export const REPAIR_MAX = 400;
export function repairCost(car: GarageCar): number {
  if (car.damage <= 0) return 0;
  const full = 120 + carValue(car) * 0.07;
  return Math.max(10, Math.min(REPAIR_MAX, Math.round((car.damage / 100) * full)));
}
/** Damage mends by itself a little every morning, so a broke kid can still race. */
export const DAMAGE_HEAL_PER_DAY = 15;

/** Driving stats as 1..5 stars for the garage (no numbers for the kids). */
export function carStars(car: GarageCar): { speed: number; grip: number; handling: number; tough: number } {
  const b = CAR_BODY_DEFS[car.body];
  const st = (x: number): number => Math.max(1, Math.min(5, Math.round(x)));
  return {
    speed: st((b.power - 0.85) * 8 + car.parts.engine * 0.7 + car.parts.turbo * 0.4),
    grip: st((b.grip - 0.85) * 8 + car.parts.tyres * 0.9),
    handling: st(1.5 + car.parts.suspension * 0.8 + car.parts.brakes * 0.5),
    tough: st((b.tough - 0.8) * 4 + car.parts.armour * 0.8),
  };
}

// ---------------------------------------------------------------------------
// Courses and rules
// ---------------------------------------------------------------------------

export const RALLY_COURSES = ['farm', 'forest', 'ice', 'beach', 'city', 'meadow', 'mountain'] as const;
export type RallyCourse = (typeof RALLY_COURSES)[number];
export const isRallyCourse = (s: unknown): s is RallyCourse => typeof s === 'string' && (RALLY_COURSES as readonly string[]).includes(s);

export interface RallyCourseDef {
  id: RallyCourse;
  /** Prize multiplier (longer, harder courses pay more). */
  prize: number;
  /** The surface that dominates (for the card and the tyres tip). */
  surface: 'asphalt' | 'gravel' | 'snow' | 'sand';
  /** Target lap time (s) for a gold medal at 1 lap; silver ×1.15, bronze ×1.35. */
  gold: number;
  emoji: string;
  color: string;
}

export const RALLY_COURSE_DEFS: Record<RallyCourse, RallyCourseDef> = {
  farm: { id: 'farm', prize: 1.0, surface: 'asphalt', gold: 62, emoji: '🚜', color: '#e8412c' },
  forest: { id: 'forest', prize: 1.15, surface: 'gravel', gold: 54, emoji: '🌲', color: '#2fa84f' },
  ice: { id: 'ice', prize: 1.25, surface: 'snow', gold: 57, emoji: '❄️', color: '#5fb7ff' },
  beach: { id: 'beach', prize: 1.1, surface: 'sand', gold: 60, emoji: '🏖️', color: '#f4c20d' },
  city: { id: 'city', prize: 1.3, surface: 'asphalt', gold: 55, emoji: '🌃', color: '#8a4fd8' },
  meadow: { id: 'meadow', prize: 1.05, surface: 'gravel', gold: 48, emoji: '🌼', color: '#9bc53d' },
  mountain: { id: 'mountain', prize: 1.25, surface: 'snow', gold: 59, emoji: '🏔️', color: '#4a6fa5' },
};

export const RALLY_TIMES = ['day', 'sunset', 'night'] as const;
export type RallyTime = (typeof RALLY_TIMES)[number];
export const RALLY_WEATHERS = ['clear', 'rain'] as const;
export type RallyWeather = (typeof RALLY_WEATHERS)[number];
export const RALLY_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type RallyDifficulty = (typeof RALLY_DIFFICULTIES)[number];

export interface RaceRules {
  course: RallyCourse;
  /** 1..5 */
  laps: number;
  /** Cars take damage from fences and each other. */
  damage: boolean;
  /** Computer-driven farm animals filling the grid: 0..5. */
  ai: number;
  difficulty: RallyDifficulty;
  time: RallyTime;
  weather: RallyWeather;
  /** Nitro charges from the turbo part may be used. */
  nitro: boolean;
  /** Everyone drives the same stats (styling still shows): a fair family race. */
  sameCars: boolean;
  /** Boost pads and mud puddles on the road. */
  pickups: boolean;
}

export const MAX_LAPS = 5;
export const MAX_AI = 5;
/** Humans in one race (plus AI, never more than 8 cars). */
export const MAX_RACERS = 6;
export const MAX_CARS_ON_TRACK = 8;

export function defaultRules(): RaceRules {
  return { course: 'farm', laps: 3, damage: false, ai: 3, difficulty: 'normal', time: 'day', weather: 'clear', nitro: true, sameCars: false, pickups: true };
}

/** Cleans anything a client sent into valid rules. */
export function cleanRules(r: unknown): RaceRules {
  const d = defaultRules();
  if (!r || typeof r !== 'object') return d;
  const o = r as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def);
  const int = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);
  return {
    course: pick(o.course, RALLY_COURSES, d.course),
    laps: int(o.laps, 1, MAX_LAPS, d.laps),
    damage: o.damage === true,
    ai: int(o.ai, 0, MAX_AI, d.ai),
    difficulty: pick(o.difficulty, RALLY_DIFFICULTIES, d.difficulty),
    time: pick(o.time, RALLY_TIMES, d.time),
    weather: pick(o.weather, RALLY_WEATHERS, d.weather),
    nitro: o.nitro !== false,
    sameCars: o.sameCars === true,
    pickups: o.pickups !== false,
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * kr for finishing a race in `place` of `n` cars (humans and AI). Everyone who finishes gets something.
 * Alone on the track (a time trial, or a race with nobody else) pays like a practice run.
 */
export function racePrize(rules: RaceRules, place: number, n: number): number {
  const byPlace = [200, 140, 100, 70, 50, 40, 35, 30];
  const base = n <= 1 ? 50 : byPlace[Math.max(0, Math.min(byPlace.length - 1, place - 1))]!;
  const laps = Math.max(0.6, Math.min(1.6, rules.laps / 3));
  const diff = rules.difficulty === 'easy' ? 0.8 : rules.difficulty === 'hard' ? 1.25 : 1;
  const dmg = rules.damage ? 1.25 : 1;
  const field = 0.85 + Math.min(8, n) * 0.03;
  return Math.round(base * laps * diff * dmg * field * RALLY_COURSE_DEFS[rules.course].prize) + 10;
}

/** kr for not finishing (left early, timed out): a little for taking part. */
export const RACE_DNF_PRIZE = 10;

/** Medal for a total time over `laps` laps, or null. */
export function raceMedal(course: RallyCourse, laps: number, totalMs: number): 'gold' | 'silver' | 'bronze' | null {
  const gold = RALLY_COURSE_DEFS[course].gold * laps * 1000 + 3000;
  if (totalMs <= gold) return 'gold';
  if (totalMs <= gold * 1.15) return 'silver';
  if (totalMs <= gold * 1.35) return 'bronze';
  return null;
}

/** Free roam: each coin found is worth this, at most ROAM_COINS_PER_DAY coins a day per player. */
export const ROAM_COIN_KR = 2;
export const ROAM_COINS_PER_DAY = 40;
/** Coins placed in the free-roam world (the game spreads this many; they come back next day). */
export const ROAM_COIN_COUNT = 40;

// ---------------------------------------------------------------------------
// Rooms (the lobby in the garage) and snapshots relayed between racers
// ---------------------------------------------------------------------------

export type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'done';

export interface RoomMember {
  id: string;
  name: string;
  car: GarageCar;
  ready: boolean;
  /** Set when the racer has crossed the line (ms of race time) or left (null). */
  finish?: number | null;
}

export interface RoomInfo {
  id: string;
  host: string;
  hostName: string;
  rules: RaceRules;
  phase: RoomPhase;
  members: RoomMember[];
  /** Server wall clock when the lights go green (countdown/racing). */
  startAt?: number;
  /** Seed for pickups and AI personalities, the same on every client. */
  seed: number;
}

/** A racer's car as sent ~12 times a second (short keys: it goes to everyone in the room). */
export interface CarSnap {
  /** Player id, or `ai:<n>` for the host's computer cars. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Heading (rad). */
  h: number;
  vx: number;
  vz: number;
  /** Steer −1..1, throttle 0..1, brake 0..1, handbrake, nitro on. */
  st: number;
  th: number;
  br: number;
  hb: boolean;
  ni: boolean;
  /** Damage 0..100 and laps done, so the others can show it. */
  dm: number;
  lap: number;
  /** Sender's race clock (ms) for interpolation. */
  t: number;
}

export interface RaceResultLine {
  id: string;
  name: string;
  /** Race time (ms), or null for not finished. */
  time: number | null;
  place: number;
  prize: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
}

/** A race ends for everyone this long after the first finisher (ms); long races wait longer (see races.ts). */
export const RACE_FINISH_GRACE_MS = 45_000;
/** Shortest race time the server believes (ms); and the longest. */
export const RACE_MIN_MS = 10_000;
export const RACE_MAX_MS = 15 * 60_000;

/**
 * The shortest time a race over these rules can take (ms): 60 % of the gold lap time per lap, never under
 * RACE_MIN_MS. A finish sooner than this is not believed, and a solo race under it is booked as not finished.
 */
export function minRaceMs(rules: RaceRules): number {
  return Math.max(RACE_MIN_MS, RALLY_COURSE_DEFS[rules.course].gold * rules.laps * 600);
}
/** How long the room's start countdown is (ms) after the host presses start. */
export const RACE_COUNTDOWN_MS = 5000;
/** Rooms nobody touches for this long are closed. */
export const ROOM_IDLE_MS = 10 * 60_000;
