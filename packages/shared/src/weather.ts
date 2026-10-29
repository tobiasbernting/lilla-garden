// 2D game: weather. One sky for the whole world that drifts from one kind of weather to the next
// in a random pattern (more snow in winter, hardly any in summer). Rain waters the fields.
import { CROPS } from './data.ts';
import { MAP_H, MAP_W, key, type WeatherKind, type WorldState } from './types.ts';
import type { Change } from './protocol.ts';
import { T, WEATHER_NEWS } from './sv.ts';
import type { SimCtx } from './sim.ts';
import { voxelMode } from './voxel.ts';

export const WEATHER_KINDS: WeatherKind[] = ['sun', 'cloudy', 'rain', 'storm', 'snow', 'hail', 'wind', 'fog'];
export const isWeatherKind = (v: unknown): v is WeatherKind => WEATHER_KINDS.includes(v as WeatherKind);

/** How long each kind lasts, in real minutes [min, max]. A game day is 10 minutes. */
const DURATION_MIN: Record<WeatherKind, [number, number]> = {
  sun: [3, 7],
  cloudy: [2, 4],
  rain: [2, 4],
  storm: [1, 2],
  snow: [2, 5],
  hail: [0.5, 1.5],
  wind: [1.5, 3],
  fog: [1.5, 3],
};

/** How likely snow is this month (0 = January): lots in winter, a rare surprise in summer. */
const SNOW_BY_MONTH = [4, 4, 2, 1, 0.3, 0.05, 0.05, 0.05, 0.3, 1, 2, 4];

/** What can follow each kind of weather (weights). `S` is replaced by the month's snow weight. */
const NEXT: Record<WeatherKind, Partial<Record<WeatherKind, number | 'S'>>> = {
  sun: { sun: 2, cloudy: 4, wind: 2, fog: 1 },
  cloudy: { sun: 3, rain: 3, snow: 'S', wind: 1, fog: 1, hail: 0.5 },
  rain: { cloudy: 3, rain: 1, storm: 1, sun: 1.5, hail: 0.5 },
  storm: { rain: 3, hail: 1, cloudy: 1 },
  snow: { snow: 1, cloudy: 3, sun: 1, wind: 0.5 },
  hail: { rain: 2, cloudy: 2 },
  wind: { sun: 2, cloudy: 2, rain: 1, snow: 'S' },
  fog: { sun: 2, cloudy: 2 },
};

export function weatherDuration(kind: WeatherKind, rnd: () => number): number {
  const [lo, hi] = DURATION_MIN[kind];
  return Math.round((lo + rnd() * (hi - lo)) * 60_000);
}

export function nextWeather(kind: WeatherKind, month: number, rnd: () => number): WeatherKind {
  const snow = SNOW_BY_MONTH[((month % 12) + 12) % 12] ?? 1;
  const options = Object.entries(NEXT[kind]).map(([k, w]) => [k as WeatherKind, w === 'S' ? snow : w] as const);
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = rnd() * total;
  for (const [k, w] of options) {
    r -= w;
    if (r < 0) return k;
  }
  return options[options.length - 1]![0];
}

/** The weather as it looks in a biome: snow instead of rain on the ice, only wind in the desert. */
export function localWeather(kind: WeatherKind, biome: string | undefined): WeatherKind {
  if (biome === 'is' && (kind === 'rain' || kind === 'storm' || kind === 'hail')) return 'snow';
  if (biome === 'oken' && (kind === 'rain' || kind === 'storm' || kind === 'snow' || kind === 'hail' || kind === 'fog')) return 'wind';
  return kind;
}

export const isWet = (kind: WeatherKind): boolean => kind === 'rain' || kind === 'storm';

/** Sets the weather now (the parent page, tests) and tells everyone outside. */
export function setWeather(world: WorldState, kind: WeatherKind, ctx: SimCtx, forced = false): Change[] {
  const prev = world.weather?.kind;
  world.weather = { kind, since: ctx.now, until: ctx.now + weatherDuration(kind, ctx.rnd), ...(prev ? { prev } : {}), ...(forced ? { forced } : {}) };
  const out: Change[] = [];
  const news = prev && prev !== kind ? (isWet(prev) && kind === 'sun' ? T.weatherRainbow : WEATHER_NEWS[kind]) : undefined;
  if (news) {
    for (const p of Object.values(world.players)) if (p.online && p.area !== 'dungeon') out.push({ t: 'toast', to: p.id, text: news });
  }
  return out;
}

/** Rain lands for this long before the soil counts as watered. */
const RAIN_SOAK_MS = 8000;
const RAIN_CHECK_MS = 3000;

/** Rolls the weather on and lets the rain water every field it falls on. Not in the 3D game. */
export function tickWeather(world: WorldState, ctx: SimCtx, out: Change[]): void {
  if (voxelMode()) return;
  if (!world.weather) {
    world.weather = { kind: 'sun', since: ctx.now, until: ctx.now + weatherDuration('sun', ctx.rnd) };
    return;
  }
  if (ctx.now >= world.weather.until) {
    out.push(...setWeather(world, nextWeather(world.weather.kind, new Date(ctx.now).getMonth(), ctx.rnd), ctx));
    return;
  }
  if (!isWet(world.weather.kind) || ctx.now - world.weather.since < RAIN_SOAK_MS) return;
  if (ctx.now - (world.weather.rainedAt ?? 0) < RAIN_CHECK_MS) return;
  world.weather.rainedAt = ctx.now;
  for (const m of [world, ...Object.values(world.areas ?? {})]) {
    if (!isWet(localWeather(world.weather.kind, m.biome))) continue;
    out.push(...rainOn(m));
  }
}

/** Wets every dry field on a map and waters what grows there. */
export function rainOn(m: WorldState): Change[] {
  const local: Change[] = [];
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    if (m.terrain[i] !== 'soil') continue;
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    m.terrain[i] = 'soil_wet';
    local.push({ t: 'terrain', x, y, terrain: 'soil_wet' });
    const k = key(x, y);
    const crop = m.crops[k];
    if (crop && CROPS[crop.crop] && !crop.watered) {
      crop.watered = true;
      local.push({ t: 'crop', k, crop });
    }
  }
  const area = m.area;
  if (area && area !== 'dungeon') for (const c of local) if (c.t === 'terrain' || c.t === 'crop') c.area = area;
  return local;
}
