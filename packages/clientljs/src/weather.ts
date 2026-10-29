// Weather on screen: rain with splashes, snow, hail, wind with leaves and gusts, fog, cloud shadows drifting over the
// fields, lightning in storms and a rainbow when the sun comes out after rain.
import { cameraShake, drawLine, rgb, setAdditiveBlendMode, vec2 } from 'littlejsengine';
import { TILE, type WeatherKind } from '@lilla-garden/shared';
import { SFX, setAmbience } from '@v1/sound.ts';
import type { Sprites } from './art.ts';
import { alpha, clamp01, drawSprite, rgba, smooth } from './gfx.ts';

interface Drop {
  /** Screen-relative position in world pixels (the rain falls with the view, like a window pane). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left. */
  life: number;
  max: number;
  size: number;
  spin: number;
  angle: number;
  kind: 'rain' | 'snow' | 'hail' | 'bounce' | 'leaf' | 'leaf2' | 'gust' | 'splash';
}

interface Puff {
  /** World pixels: clouds and fog drift over the map, not with the view. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  max: number;
  fog: boolean;
}

/** How often (per second, per 320×180 of view) each thing appears, by weather. */
const RATES: Record<WeatherKind, Partial<Record<Drop['kind'] | 'cloud' | 'fog', number>>> = {
  sun: {},
  cloudy: { cloud: 0.9 },
  rain: { rain: 260, splash: 26, cloud: 0.5 },
  storm: { rain: 520, splash: 50, leaf: 6, cloud: 0.6 },
  snow: { snow: 55 },
  hail: { hail: 220, bounce: 70 },
  wind: { leaf: 13, leaf2: 9, gust: 18, cloud: 1.1 },
  fog: { fog: 6 },
};

export class WeatherView {
  private drops: Drop[] = [];
  private puffs: Puff[] = [];
  private acc: Record<string, number> = {};
  /** The weather now (null: none indoors, in the cave and the bath house). */
  kind: WeatherKind | null | undefined = undefined;
  /** Ease of each effect in and out (0..1), so a change of weather is a fade, not a cut. */
  private mix: Partial<Record<WeatherKind, number>> = {};
  /** Lightning: seconds until the next bolt, the bolt being shown and how bright the flash is. */
  private nextBolt = 4;
  private bolt: { points: { x: number; y: number }[]; t: number } | null = null;
  flash = 0;
  private rainbow = 0;
  private rainbowUntil = 0;
  /** Christmas: a few flakes on the farm whatever the weather. */
  julSnow = false;

  constructor(private art: Sprites) {}

  reset(): void {
    this.drops = [];
    this.puffs = [];
    this.bolt = null;
    this.flash = 0;
  }

  /** `kind` is the weather where the player is; `prev` and `ageMs` (how long it has lasted) drive the rainbow. */
  setKind(kind: WeatherKind | null, prev: WeatherKind | undefined, ageMs: number, now: number): void {
    if (kind === this.kind) return;
    this.kind = kind;
    setAmbience(kind);
    this.nextBolt = 2 + Math.random() * 4;
    if (kind === 'sun' && (prev === 'rain' || prev === 'storm') && ageMs < 30_000) this.rainbowUntil = now + 45;
  }

  /** dt in seconds; (vx, vy, vw, vh) is the view in world pixels; `now` in seconds. */
  update(dt: number, vx: number, vy: number, vw: number, vh: number, now: number): void {
    // fade the effects of each kind of weather in and out
    for (const k of Object.keys(RATES) as WeatherKind[]) {
      const target = this.kind === k ? 1 : 0;
      const m = this.mix[k] ?? 0;
      this.mix[k] = m + Math.sign(target - m) * Math.min(Math.abs(target - m), dt / 1.5);
    }
    const area = (vw * vh) / (320 * 180);
    const spawn = (kind: string, rate: number, make: () => void) => {
      this.acc[kind] = (this.acc[kind] ?? 0) + rate * area * dt;
      while (this.acc[kind]! >= 1) {
        this.acc[kind]! -= 1;
        make();
      }
    };
    for (const k of Object.keys(RATES) as WeatherKind[]) {
      const m = this.mix[k] ?? 0;
      if (m <= 0.01) continue;
      for (const [what, rate] of Object.entries(RATES[k])) spawn(`${k}-${what}`, rate! * m, () => this.make(what as Drop['kind'] | 'cloud' | 'fog', vx, vy, vw, vh));
    }
    if (this.julSnow) spawn('jul', 9, () => this.make('snow', vx, vy, vw, vh));

    for (const d of this.drops) {
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.spin * dt;
      if (d.kind === 'snow') d.x += Math.sin(now * 1.3 + d.size * 9) * 6 * dt;
      if (d.kind === 'bounce') d.vy += 280 * dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.x > -40 && d.x < vw + 40 && d.y < vh + 20);
    for (const p of this.puffs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);

    // lightning: a double flash, then the rumble
    if (this.kind === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 9;
        this.strike(vw, vh);
      }
    }
    if (this.bolt) {
      this.bolt.t -= dt;
      if (this.bolt.t <= 0) this.bolt = null;
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);

    const rainbow = this.kind === 'sun' && this.rainbowUntil > now ? Math.min(1, (this.rainbowUntil - now) / 5, (45 - (this.rainbowUntil - now)) / 4) * 0.45 : 0;
    this.rainbow += (rainbow - this.rainbow) * Math.min(1, dt / 1.5);
  }

  private strike(vw: number, vh: number): void {
    // a jagged line from the top of the view down to somewhere in it
    const x0 = vw * (0.2 + Math.random() * 0.6);
    const yEnd = vh * (0.45 + Math.random() * 0.4);
    const points = [{ x: x0, y: -10 }];
    let x = x0;
    for (let y = -10; y < yEnd; ) {
      y += 8 + Math.random() * 12;
      x += (Math.random() - 0.5) * 18;
      points.push({ x, y: Math.min(y, yEnd) });
    }
    this.bolt = { points, t: 0.22 };
    this.flash = 1;
    cameraShake(0.15);
    setTimeout(() => SFX.thunder(), 400 + Math.random() * 1100);
  }

  private make(kind: Drop['kind'] | 'cloud' | 'fog', vx: number, vy: number, vw: number, vh: number): void {
    const r = Math.random;
    const storm = this.kind === 'storm';
    switch (kind) {
      case 'rain': {
        const sx = storm ? -95 : -40;
        this.drops.push({ kind, x: r() * (vw + 60), y: -8 - r() * 20, vx: sx, vy: 230 + r() * 50, life: 1.2, max: 1.2, size: 1, spin: 0, angle: Math.atan2(sx, 250) });
        break;
      }
      case 'splash':
        this.drops.push({ kind, x: r() * vw, y: r() * vh, vx: 0, vy: 0, life: 0.32, max: 0.32, size: 0.6 + r() * 0.5, spin: 0, angle: 0 });
        break;
      case 'snow':
        this.drops.push({ kind, x: r() * (vw + 40) - 20, y: -4, vx: -10 + r() * 16, vy: 12 + r() * 16, life: 14, max: 14, size: 0.6 + r() * 0.8, spin: 0, angle: 0 });
        break;
      case 'hail':
        this.drops.push({ kind, x: r() * (vw + 60), y: -6, vx: -20, vy: 280 + r() * 50, life: 0.8, max: 0.8, size: 1, spin: 0, angle: 0 });
        break;
      case 'bounce':
        this.drops.push({ kind, x: r() * vw, y: 10 + r() * vh, vx: -20 + r() * 40, vy: -55 + r() * 25, life: 0.42, max: 0.42, size: 1, spin: 0, angle: 0 });
        break;
      case 'leaf':
      case 'leaf2':
        this.drops.push({ kind, x: -8, y: -10 + r() * vh, vx: 120 + r() * 70, vy: -15 + r() * 45, life: 3, max: 3, size: 1, spin: 4 + r() * 8, angle: r() * 6 });
        break;
      case 'gust':
        this.drops.push({ kind, x: -24, y: r() * vh, vx: 260 + r() * 80, vy: 0, life: 1.4, max: 1.4, size: 1, spin: 0, angle: 0 });
        break;
      case 'cloud':
        // cloud shadows sail in from the west, big and soft
        this.puffs.push({ x: vx - 140 + r() * vw * 0.4, y: vy - 40 + r() * (vh + 60), vx: 6 + r() * 6, vy: 1 + r() * 3, size: 90 + r() * 60, life: 16, max: 16, fog: false });
        break;
      case 'fog':
        this.puffs.push({ x: vx - 40 + r() * (vw + 40), y: vy - 20 + r() * (vh + 20), vx: 3 + r() * 6, vy: 0, size: 50 + r() * 34, life: 10, max: 10, fog: true });
        break;
    }
  }

  /** Under the light map (darkened at night): cloud shadows, fog, rain, snow, leaves. vx/vy is the view's corner. */
  draw(vx: number, vy: number, vw: number, vh: number): void {
    const a = this.art;
    // fog: a pale veil over everything, thicker banks drifting through it
    const fog = this.mix.fog ?? 0;
    if (fog > 0.01) drawSprite(a.white, vx + vw / 2, vy + vh / 2, vw + 32, vh + 32, 0, rgba(0.9, 0.92, 0.95, 0.22 * fog));
    for (const p of this.puffs) {
      const fade = smooth(Math.min((p.max - p.life) / 2, p.life / 2, 1));
      if (p.fog) drawSprite(a.blob, p.x, p.y, p.size, p.size * 0.7, 0, rgba(0.92, 0.94, 0.96, 0.5 * fade));
      else drawSprite(a.blob, p.x, p.y, p.size * 1.3, p.size, 0, rgba(0.06, 0.08, 0.16, 0.26 * fade));
    }
    for (const d of this.drops) {
      const x = vx + d.x;
      const y = vy + d.y;
      const k = d.life / d.max;
      switch (d.kind) {
        case 'rain':
          drawSprite(a.rain, x, y, 1, 7, -d.angle, alpha(0.85));
          break;
        case 'splash': {
          // a ring that spreads and fades where a drop lands
          const g = d.size * (0.4 + (1 - k) * 0.9);
          drawSprite(a.ring, x, y, a.ring.w * g, a.ring.h * g, 0, alpha(0.75 * k));
          break;
        }
        case 'snow':
          drawSprite(a.flake, x, y, 2.2 * d.size, 2.2 * d.size, 0, alpha(0.95));
          break;
        case 'hail':
        case 'bounce':
          drawSprite(a.white, x, y, 2, 2, 0, rgba(0.85, 0.92, 1, 1));
          break;
        case 'leaf':
        case 'leaf2': {
          const s = a.leaf[d.kind === 'leaf' ? 0 : 1]!;
          drawSprite(s, x, y, s.w, s.h, d.angle, alpha(clamp01(k * 3)));
          break;
        }
        case 'gust':
          drawSprite(a.gust, x, y, 24, 1, 0, alpha(0.75 * k));
          break;
      }
    }
    if (this.rainbow > 0.01) drawSprite(a.rainbow, vx + vw * 0.68, vy + vh * 0.42, vw * 0.9, vw * 0.45, 0, alpha(this.rainbow));
  }

  /** Over the light map (it lights itself): the lightning bolt. */
  drawBright(vx: number, vy: number): void {
    if (!this.bolt) return;
    const k = this.bolt.t / 0.22;
    const pts = this.bolt.points.map((p) => vec2((vx + p.x) / TILE, -(vy + p.y) / TILE));
    setAdditiveBlendMode(true);
    for (let i = 1; i < pts.length; i++) {
      drawLine(pts[i - 1]!, pts[i]!, 3 / TILE, rgb(0.55, 0.65, 1, 0.5 * k));
      drawLine(pts[i - 1]!, pts[i]!, 1.2 / TILE, rgb(1, 1, 1, k));
    }
    setAdditiveBlendMode(false);
  }
}
