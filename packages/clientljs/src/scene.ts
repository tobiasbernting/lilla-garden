// What the cozy extras get to know about the scene each frame, filled in by the view.
import type { WeatherKind, WorldState } from '@lilla-garden/shared';
import type { Sprites } from './art.ts';
import type { Extras } from './extras.ts';
import type { YearSeason } from './features.ts';
import type { SkyLight } from './sky.ts';

export interface Scene {
  world: WorldState;
  art: Sprites;
  extras: Extras;
  /** Seconds since the view started, and since the last frame. */
  t: number;
  dt: number;
  /** Time of day, 0..1 from the morning. */
  day: number;
  /** The light the scene is lit with (indoors: the room's), and the sky outside whatever the room. */
  sky: SkyLight;
  outdoor: SkyLight;
  /** How much lamps shine now (0 daylight … 1 night or underground). */
  lampsOn: number;
  weather: WeatherKind | null;
  year: YearSeason;
  snowGround: boolean;
  /** The view in world pixels. */
  vx: number;
  vy: number;
  vw: number;
  vh: number;
  /** 'space': the moon (outdoors, but no birds, mist or weather). */
  where: 'out' | 'inside' | 'bath' | 'cave' | 'space';
  /** People and animals: birds fly from them, plants rustle. */
  movers: { x: number; y: number }[];
  /** Cells of open water. */
  water: [number, number][];
  /** 0..1: how close the player is to lava. */
  nearLava: number;
}

export const inView = (sc: Scene, x: number, y: number, w = 0, h = 0, margin = 8): boolean =>
  x + w > sc.vx - margin && x < sc.vx + sc.vw + margin && y + h > sc.vy - margin && y < sc.vy + sc.vh + margin;

/** Deterministic 0..1 noise for a cell, so decorations stay put. */
export const cellHash = (x: number, y: number, salt = 0): number => {
  let n = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
