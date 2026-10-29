// LittleJS's 2D light system: the world is drawn at full brightness, then multiplied by a light map that starts at
// the sky's ambient colour and gets every lamp, torch, window and lantern added in. Glows go on top after that, and
// the things that shine by themselves (lit windows, flames, fireflies, lightning) are drawn last, unlit.
import { EngineObject, Light, LightSystemPlugin, engineAddPlugin, lightSystem, rgb, vec2 } from 'littlejsengine';
import { TILE } from '@lilla-garden/shared';

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
    let [r, g, b] = s.color;
    if (s.twinkle) {
      const hue = (t * 0.15 + this.seed) % 1;
      [r, g, b] = [0.6 + 0.4 * Math.sin(hue * 6.28), 0.6 + 0.4 * Math.sin(hue * 6.28 + 2.1), 0.6 + 0.4 * Math.sin(hue * 6.28 + 4.2)];
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
    default:
      return null;
  }
}
