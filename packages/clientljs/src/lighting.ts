// LittleJS's 2D light system: the world is drawn at full brightness, then multiplied by a light map that starts at
// the sky's ambient colour and gets every lamp, torch, window and lantern added in. Glows go on top after that, and
// the things that shine by themselves (lit windows, flames, fireflies, lightning) are drawn last, unlit.
import { EngineObject, Light, LightSystemPlugin, engineAddPlugin, lightSystem, rgb, vec2 } from 'littlejsengine';
import { ARCADE, ARCADE_GAMES, DUNGEONS, TILE, type DungeonId } from '@lilla-garden/shared';

export interface LampSpec {
  /** Colour of the light, 0..1. */
  color: [number, number, number];
  /** Reach in tiles. */
  radius: number;
  /** Brightness at full night (the light's alpha). */
  strength: number;
  /** 0 steady … 1 a candle in a draught. */
  flicker?: number;
  /** Size across, in tiles, of the haze drawn over the lamp at night (0 none). */
  glow?: number;
  /** Shines in daylight too (cave crystals, a fire indoors). */
  always?: boolean;
  /** Colour cycling (Christmas lights). */
  twinkle?: boolean;
  /** Colours the light glides through one after another, `cycleSec` seconds each (a disco ball, a neon sign). */
  cycle?: [number, number, number][];
  cycleSec?: number;
  /** Quick bright glints now and then, 0..1 (light thrown off a mirror ball). */
  sparkle?: number;
}

export class Lamp {
  readonly light: Light;
  private seed = Math.random() * 1000;
  /** 0..1, for lamps turned on and off (a lantern that follows a player into the dark). */
  level = 1;

  constructor(
    public x: number,
    public y: number,
    public spec: LampSpec,
  ) {
    this.light = new Light(vec2(x / TILE, -y / TILE), spec.radius, rgb(...spec.color, 0), spec.radius * 0.85);
    this.light.glowFalloff = 1.4;
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.light.pos.set(x / TILE, -y / TILE);
  }

  /** Called every frame: `on` is how much lamps shine now (0 in daylight, 1 at night); `glow` false hides the haze. */
  update(on: number, t: number, glow = true): void {
    const s = this.spec;
    const lit = (s.always ? 1 : on) * this.level;
    let k = 1;
    if (s.flicker) {
      const n = Math.sin(t * 13 + this.seed) * 0.5 + Math.sin(t * 23.7 + this.seed * 1.7) * 0.3 + Math.sin(t * 5.1 + this.seed * 0.3) * 0.2;
      k = 1 + n * 0.18 * s.flicker;
    }
    if (s.sparkle) k += s.sparkle * (Math.max(0, Math.sin(t * 7.3 + this.seed * 5.1)) ** 12 + Math.max(0, Math.sin(t * 11.9 + this.seed * 2.3)) ** 12);
    let [r, g, b] = s.color;
    if (s.twinkle) {
      const hue = (t * 0.15 + this.seed) % 1;
      [r, g, b] = [0.6 + 0.4 * Math.sin(hue * 6.28), 0.6 + 0.4 * Math.sin(hue * 6.28 + 2.1), 0.6 + 0.4 * Math.sin(hue * 6.28 + 4.2)];
    }
    if (s.cycle?.length) {
      const count = s.cycle.length;
      const u = (((t / (s.cycleSec ?? 2) + this.seed) % count) + count) % count;
      const i = Math.floor(u);
      const e = (u - i) * (u - i) * (3 - 2 * (u - i));
      const from = s.cycle[i]!;
      const to = s.cycle[(i + 1) % count]!;
      [r, g, b] = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e];
    }
    this.light.color.set(r, g, b, Math.min(1, s.strength * lit * k));
    this.light.radius = s.radius * (0.92 + 0.08 * k);
    this.light.fadeRange = this.light.radius * 0.85;
    this.light.glow = glow ? (s.glow ?? 0) * lit * (0.94 + 0.06 * k) : 0;
  }

  destroy(): void {
    this.light.destroy();
  }
}

/** Paints light of its own straight into the light map each frame (light falling out of windows onto the ground). */
export class LightPainter extends EngineObject {
  constructor(private paint: () => void) {
    super(vec2(), vec2(0));
    this.mass = 0;
  }

  render(): void {}

  renderLight(): void {
    this.paint();
  }
}

let postLight: (() => void) | null = null;

/** Starts the light system (once, after engineInit). `post` draws what shines by itself, over the lit scene. */
export function initLighting(post: () => void): void {
  new LightSystemPlugin(undefined, rgb(1, 1, 1));
  lightSystem.shadows = false;
  postLight = post;
  // made after the light system, so it draws after the light map is applied
  engineAddPlugin(undefined, () => postLight?.());
}

export function setAmbient(r: number, g: number, b: number): void {
  lightSystem?.ambientColor.set(r, g, b, 1);
}

// ---- what gives light ----

const WARM: [number, number, number] = [1, 0.72, 0.42];
const FIRE: [number, number, number] = [1, 0.58, 0.26];
const NEON_PINK: [number, number, number] = [1, 0.32, 0.85];
const NEON_CYAN: [number, number, number] = [0.3, 0.88, 1];

/**
 * How dark each dungeon is and how strongly its lamps shine: the frost castle's snow throws light back, so its
 * darkness and its lamps are turned down further than the crypt's and the forge's.
 */
const DUNGEON_LIGHT: Record<DungeonId, { dark: number; lamps: number }> = {
  draug: { dark: 0.6, lamps: 1 },
  frost: { dark: 0.48, lamps: 0.58 },
  surt: { dark: 0.6, lamps: 0.95 },
};
/** A saga dungeon's darkness: its own colour of light, turned down to about a cave's, so torches pool light. */
export const dungeonAmbient = (id: DungeonId): [number, number, number] => {
  const [r, g, b] = DUNGEONS[id].ambient;
  const k = DUNGEON_LIGHT[id].dark;
  return [r * k, g * k, b * k];
};
export const dungeonLamps = (id: DungeonId): number => DUNGEON_LIGHT[id].lamps;
/** The dungeons' torches in their order: the crypt's green candle, the castle's crystal lantern, the forge's fire. */
const SAGA_TORCH: LampSpec[] = [
  { color: [0.62, 1, 0.55], radius: 3.8, strength: 0.9, flicker: 0.8, glow: 1.4 },
  { color: [0.6, 0.86, 1], radius: 3.8, strength: 0.9, flicker: 0.15, glow: 1.4 },
  { color: FIRE, radius: 4, strength: 0.95, flicker: 1, glow: 1.6 },
];
const SAGA_PORTAL: LampSpec[] = [
  { color: [0.5, 1, 0.5], radius: 3.4, strength: 0.75, flicker: 0.3, glow: 2.2 },
  { color: [0.55, 0.85, 1], radius: 3.4, strength: 0.75, flicker: 0.1, glow: 2.2 },
  { color: FIRE, radius: 4, strength: 0.85, flicker: 0.8, glow: 2.4 },
];

/** The light a creature gives off, if any: the dungeons' fire monsters and frost spirits, the draug king's sword. */
export function lampForAnimal(species: string): LampSpec | null {
  switch (species) {
    case 'eldimp':
      return { color: [1, 0.55, 0.25], radius: 2, strength: 0.6, flicker: 0.8, glow: 0.8 };
    case 'eldhund':
      return { color: [1, 0.5, 0.2], radius: 2.2, strength: 0.6, flicker: 0.8, glow: 0.8 };
    case 'lavagolem':
      return { color: [1, 0.45, 0.18], radius: 2.6, strength: 0.6, flicker: 0.4, glow: 1 };
    case 'isande':
      return { color: [0.6, 0.88, 1], radius: 2, strength: 0.45, flicker: 0.2, glow: 0.7 };
    case 'smeden':
      return { color: [1, 0.5, 0.22], radius: 3, strength: 0.6, flicker: 0.5, glow: 1.2 };
    case 'surt':
      return { color: [1, 0.5, 0.2], radius: 4.5, strength: 0.8, flicker: 0.7, glow: 2 };
    case 'draugkung':
      return { color: [0.6, 1, 0.55], radius: 3, strength: 0.5, flicker: 0.3, glow: 1.2 };
    case 'gullinbursti':
      return { color: [1, 0.85, 0.4], radius: 2.6, strength: 0.6, flicker: 0.2, glow: 1.2, sparkle: 0.3 };
    default:
      return null;
  }
}

/** A minigame's colour (ARCADE_GAMES index) as light: a little paler than the paint, so it reads as a glow. */
const gameLight = (i: number): [number, number, number] => {
  const hex = ARCADE[ARCADE_GAMES[((i % ARCADE_GAMES.length) + ARCADE_GAMES.length) % ARCADE_GAMES.length]!].color;
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => 0.2 + 0.8 * v) as [number, number, number];
};

/** The lamp an object carries, if any. */
export function lampFor(kind: string, variant: number | undefined): LampSpec | null {
  switch (kind) {
    case 'torch':
    case 'cave_torch':
      return { color: FIRE, radius: 3.4, strength: 0.95, flicker: 1, glow: 1.6 };
    case 'stove':
      return { color: FIRE, radius: 3, strength: 0.85, flicker: 0.7, glow: 1.2 };
    case 'lamp':
      return { color: WARM, radius: 3.6, strength: 0.9, flicker: 0.15, glow: 1.8 };
    case 'lantern':
      return { color: WARM, radius: 3.2, strength: 0.85, flicker: 0.4, glow: 1.6 };
    case 'street_lamp':
      return { color: [1, 0.86, 0.6], radius: 5, strength: 1, glow: 2.6 };
    case 'pumpkin_lantern':
      return { color: [1, 0.55, 0.15], radius: 2.6, strength: 0.85, flicker: 0.9, glow: 1.3 };
    case 'xmas_tree':
      return { color: [1, 0.85, 0.5], radius: 3, strength: 0.8, twinkle: true, glow: 1.5 };
    case 'lights':
      return { color: [1, 0.8, 0.6], radius: 2.2, strength: 0.75, twinkle: true, glow: 1 };
    case 'treasure':
      return { color: [1, 0.85, 0.35], radius: 2.4, strength: 0.8, flicker: 0.3, glow: 1.2, always: true };
    case 'cave_wall':
      return variant === 1 ? { color: [0.45, 0.75, 1], radius: 2.6, strength: 0.75, flicker: 0.2, glow: 1.2, always: true } : null;
    // the wider world: things that glow by themselves, in caves, at night and on the moon
    case 'crystal': {
      const c: [number, number, number][] = [
        [0.75, 0.45, 1],
        [0.55, 0.85, 1],
        [0.45, 1, 0.55],
        [1, 0.55, 0.85],
      ];
      return { color: c[(variant ?? 0) % 4]!, radius: 2.4, strength: 0.8, flicker: 0.15, glow: 1.1, always: true };
    }
    case 'fire_crystal':
      return { color: [1, 0.45, 0.2], radius: 2.4, strength: 0.85, flicker: 0.35, glow: 1.2, always: true };
    case 'star_crystal':
      return { color: [1, 0.95, 0.65], radius: 2.4, strength: 0.8, flicker: 0.2, glow: 1.2, always: true };
    case 'glowshroom':
      return { color: [0.35, 0.95, 0.9], radius: 1.8, strength: 0.6, flicker: 0.1, glow: 0.8, always: true };
    case 'giant_glowshroom':
      return { color: [0.35, 0.8, 1], radius: 3.4, strength: 0.7, flicker: 0.1, glow: 1.6, always: true };
    case 'wisp':
      return { color: [0.6, 0.95, 1], radius: 2.6, strength: 0.8, flicker: 0.6, glow: 1.4 };
    case 'wisp_jar':
      return { color: [0.6, 0.95, 1], radius: 2.6, strength: 0.75, flicker: 0.5, glow: 1.2 };
    case 'crystal_lamp':
      return { color: [0.8, 0.55, 1], radius: 3.2, strength: 0.85, flicker: 0.1, glow: 1.5 };
    case 'mushroom_lamp':
      return { color: [0.4, 0.95, 0.9], radius: 3.2, strength: 0.85, flicker: 0.1, glow: 1.5 };
    case 'volcano':
      return { color: [1, 0.42, 0.15], radius: 6, strength: 0.8, flicker: 0.4, glow: 3, always: true };
    case 'ufo':
      return { color: [0.5, 1, 0.7], radius: 3.5, strength: 0.75, flicker: 0.3, glow: 1.6, always: true };
    case 'rocket':
      return { color: [1, 0.9, 0.75], radius: 3, strength: 0.6, flicker: 0.05, glow: 1.2 };
    case 'gingerbread_house':
      return { color: WARM, radius: 4, strength: 0.7, flicker: 0.1, glow: 1.8 };
    case 'loot_chest':
      // a closed chest (frame even) glints so it can be found in the dark; an emptied one doesn't
      return (variant ?? 0) % 2 === 0 ? { color: [1, 0.85, 0.35], radius: 1.8, strength: 0.5, flicker: 0.3, glow: 0.4, always: true } : null;
    case 'house':
    case 'house_small':
    case 'apartment':
      return { color: WARM, radius: 4, strength: 0.6, flicker: 0.1 };
    case 'pizzeria':
    case 'shop':
    case 'train_station':
    case 'market':
    case 'bathhouse':
      return { color: WARM, radius: 4.5, strength: 0.7, flicker: 0.05, glow: 2 };
    // Minigames: the TV at home; Spelhallen's neon, its machines (each in its game's colour), the counter, the board
    case 'tv':
      return { color: [0.55, 0.75, 1], radius: 3, strength: 0.7, flicker: 0.9, glow: 1.2 };
    case 'arcade_hall':
      return { color: NEON_PINK, radius: 4.5, strength: 0.85, flicker: 0.1, glow: 4, cycle: [NEON_PINK, NEON_CYAN], cycleSec: 3 };
    // Rallyvärlden's garage: warm workshop light from the windows and the half-open door, tinted by the beacons
    case 'rally_garage':
      return { color: WARM, radius: 4.5, strength: 0.75, flicker: 0.05, glow: 2, cycle: [WARM, [1, 0.62, 0.2]], cycleSec: 1.6 };
    case 'arcade_machine':
      return { color: gameLight(variant ?? 0), radius: 2.2, strength: 0.6, flicker: 0.25, glow: 1, always: true };
    case 'prize_counter':
      return { color: WARM, radius: 3.2, strength: 0.6, flicker: 0.05, glow: 1.4, always: true };
    case 'score_board':
      return { color: [0.85, 0.92, 1], radius: 3, strength: 0.6, flicker: 0.05, glow: 1.4, always: true };
    case 'lava_lamp':
      return { color: [1, 0.5, 0.45], radius: 2.6, strength: 0.75, flicker: 0.15, glow: 1.2, cycle: [[1, 0.55, 0.3], [1, 0.4, 0.62]], cycleSec: 4 };
    case 'disco_ball':
      return { color: [0.92, 0.82, 1], radius: 3.4, strength: 0.8, glow: 1.4, sparkle: 0.8, cycle: [NEON_PINK, NEON_CYAN, [1, 0.9, 0.4], [0.7, 0.5, 1]], cycleSec: 1.2 };
    case 'neon_sign':
      return { color: (variant ?? 0) % 2 === 1 ? NEON_CYAN : NEON_PINK, radius: 2.4, strength: 0.7, flicker: 0.08, glow: 1.2 };
    // Sagan om Världsträdet: each dungeon's torches, the daylight down the stairs out, a rest stone once it is lit,
    // candles, ice crystals, braziers and lava cracks; out in the world the arches, Kämpastenen and the keepsakes
    case 'saga_torch':
      return SAGA_TORCH[(variant ?? 0) % 3]!;
    case 'saga_exit':
      return { color: [1, 0.95, 0.82], radius: 3.6, strength: 0.75, glow: 0.7 };
    case 'saga_rest':
      return variant === 1 ? { color: [0.35, 0.92, 1], radius: 4.2, strength: 0.9, flicker: 0.1, glow: 1.1 } : null;
    case 'saga_portal':
      return SAGA_PORTAL[(variant ?? 0) % 3]!;
    case 'saga_stone':
      return { color: [1, 0.9, 0.62], radius: 2.8, strength: 0.6, flicker: 0.1, glow: 1.2 };
    case 'saga_candles':
      return { color: [1, 0.78, 0.45], radius: 2.8, strength: 0.8, flicker: 0.9, glow: 1 };
    case 'saga_icecrystal':
      return { color: [0.55, 0.85, 1], radius: 2.8, strength: 0.75, flicker: 0.15, glow: 1.2 };
    case 'saga_brazier':
      return { color: FIRE, radius: 3.8, strength: 0.95, flicker: 1, glow: 1.6 };
    case 'saga_lavacrack':
      return { color: [1, 0.45, 0.15], radius: 2.4, strength: 0.75, flicker: 0.4, glow: 1 };
    case 'solruna':
      return { color: [1, 0.86, 0.45], radius: 3.4, strength: 0.85, flicker: 0.1, glow: 1.8, always: true };
    case 'yggdrasil':
      return { color: [0.6, 1, 0.55], radius: 3.2, strength: 0.7, flicker: 0.2, glow: 1.6, sparkle: 0.4, always: true };
    default:
      return null;
  }
}
