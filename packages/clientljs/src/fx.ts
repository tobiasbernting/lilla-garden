// Short animations: the server's effects (hearts, sparkles, splashes, wood chips, coins, hits, explosions, arrows,
// lassos…) and this client's own touches (pickups flying to whoever took them, dust under running feet).
import { cameraShake, drawLine, rgb, vec2 } from 'littlejsengine';
import { TILE } from '@lilla-garden/shared';
import type { Sprite } from './atlas.ts';
import type { Sprites } from './art.ts';
import { alpha, clamp01, DrawQueue, easeOutBack, easeOutCubic, lerp, rgba } from './gfx.ts';

interface Fx {
  /** Seconds since it started (negative while delayed). */
  t: number;
  dur: number;
  s: Sprite;
  x: number;
  y: number;
  /** Size multiplier over the sprite's own size. */
  scale: number;
  /** Squash across (coins spinning, a heart's wobble). */
  sx: number;
  alpha: number;
  angle: number;
  depth: number;
  tint: number;
  /** Sets the fields above from k = t / dur (0..1). */
  step: (fx: Fx, k: number) => void;
  done?: () => void;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class Effects {
  private list: Fx[] = [];
  /** Lassos in flight: their rope is drawn from the thrower to the loop. */
  private ropes: { from: { x: number; y: number }; fx: Fx }[] = [];

  constructor(private art: Sprites) {}

  clear(): void {
    this.list = [];
    this.ropes = [];
  }

  private add(s: Sprite, x: number, y: number, dur: number, step: Fx['step'], opts: Partial<Fx> = {}): Fx {
    const fx: Fx = { t: 0, dur, s, x, y, scale: 1, sx: 1, alpha: 1, angle: 0, depth: 8000, tint: -1, step, ...opts };
    step(fx, 0);
    this.list.push(fx);
    return fx;
  }

  private sprite(name: string, i = 0): Sprite | undefined {
    const frames = this.art.fx[name];
    return frames?.[i % frames.length];
  }

  /** One of the server's effects at (x, y) world pixels. */
  spawn(x: number, y: number, kind: string, from?: { x: number; y: number }): void {
    if (kind === 'rocket' && from) return this.rocket(x, y, from);
    if (kind === 'boom') return this.boom(x, y);
    if (kind === 'lasso' && from) return this.lasso(x, y, from);
    if (kind === 'arrow' && from) {
      const s = this.sprite('arrow');
      if (!s) return;
      const ang = Math.atan2(y - from.y, x - from.x);
      const dur = Math.min(0.26, Math.hypot(x - from.x, y - from.y) * 0.0025) || 0.05;
      const sx = from.x;
      const sy = from.y - 6;
      this.add(s, sx, sy, dur, (f, k) => {
        f.x = lerp(sx, x, k);
        f.y = lerp(sy, y - 6, k) - Math.sin(k * Math.PI) * 4;
      }, { angle: ang });
      return;
    }
    const frames = this.art.fx[kind]?.length ?? 1;
    const n = kind === 'water' ? 3 : kind === 'chop' ? 5 : kind === 'sparkle' ? 4 : kind === 'coin' ? 1 : 1;
    for (let i = 0; i < n; i++) {
      const s = this.sprite(kind, i % frames);
      if (!s) return;
      const ox = n > 1 ? rnd(-6, 6) : 0;
      if (kind === 'hit') {
        this.add(s, x, y - 4, 0.22, (f, k) => {
          f.scale = lerp(0.6, 1.6, easeOutCubic(k));
          f.alpha = 1 - k;
        });
        cameraShake(0.12);
      } else if (kind === 'poof') {
        this.add(s, x, y - 4, 0.35, (f, k) => {
          f.scale = lerp(1, 1.8, easeOutCubic(k));
          f.alpha = 0.9 * (1 - k);
        });
        this.dust(x, y + 2, 5);
      } else if (kind === 'splash') {
        this.add(s, x + ox, y + 2, 0.38, (f, k) => {
          f.scale = lerp(0.6, 1.3, easeOutCubic(k));
          f.y = y + 2 - 10 * easeOutCubic(k);
          f.alpha = 1 - k * k;
        });
      } else if (kind === 'water' || kind === 'chop') {
        // drops and chips fly out in a little arc and fall
        const vx = rnd(-14, 14);
        const up = rnd(10, 20);
        const spin = rnd(-8, 8);
        const dur = 0.42 + i * 0.05;
        this.add(s, x + ox, y - 4, dur, (f, k) => {
          f.x = x + ox + vx * k;
          f.y = y - 4 - up * k + 34 * k * k;
          f.alpha = 1 - Math.max(0, k - 0.6) / 0.4;
          if (kind === 'chop') f.angle = spin * k;
        });
      } else if (kind === 'coin') {
        // a coin pops up spinning and sparkles away
        this.add(s, x, y - 4, 0.75, (f, k) => {
          f.y = y - 4 - 22 * easeOutCubic(k);
          f.sx = Math.cos(k * Math.PI * 6);
          f.alpha = 1 - Math.max(0, k - 0.7) / 0.3;
        });
        const sp = this.sprite('sparkle');
        if (sp)
          for (let j = 0; j < 3; j++)
            this.add(sp, x + rnd(-8, 8), y - 20 + rnd(-6, 4), 0.5, (f, k) => {
              f.scale = Math.sin(k * Math.PI);
              f.alpha = 1 - k;
            }, { t: -0.25 - j * 0.08 });
      } else if (kind === 'heart') {
        // hearts float up, swaying like a leaf
        const sway = rnd(0, Math.PI * 2);
        this.add(s, x + ox, y - 6, 0.95, (f, k) => {
          f.y = y - 6 - 22 * easeOutCubic(k);
          f.x = x + ox + Math.sin(k * 7 + sway) * 3;
          f.scale = k < 0.15 ? easeOutBack(k / 0.15) : 1;
          f.alpha = 1 - Math.max(0, k - 0.65) / 0.35;
        });
      } else if (kind === 'sparkle') {
        const dx = rnd(-8, 8);
        const dy = rnd(-14, -2);
        this.add(s, x + dx, y + dy, 0.6, (f, k) => {
          f.scale = Math.sin(clamp01(k) * Math.PI) * 1.2;
          f.angle = k * 2;
          f.alpha = 1 - k * 0.5;
        }, { t: -i * 0.07 });
      } else {
        this.add(s, x + ox, y - 4, 0.7 + i * 0.1, (f, k) => {
          f.y = y - 4 - (18 + i * 3) * easeOutCubic(k);
          f.alpha = 1 - k;
        }, { t: -i * 0.08 });
      }
    }
  }

  private rocket(x: number, y: number, from: { x: number; y: number }): void {
    const s = this.sprite('rocket');
    if (!s) return;
    const ang = Math.atan2(y - from.y, x - from.x);
    const dur = Math.min(0.42, 0.06 + Math.hypot(x - from.x, y - from.y) * 0.0022);
    let nextSmoke = 0;
    this.add(s, from.x, from.y - 6, dur, (f, k) => {
      f.x = lerp(from.x, x, k);
      f.y = lerp(from.y - 6, y - 6, k);
      if (f.t >= nextSmoke) {
        nextSmoke = f.t + 0.04;
        this.smoke(f.x, f.y, 0.45, 1, 2);
      }
    }, { angle: ang });
  }

  private boom(x: number, y: number): void {
    const frames = this.art.fx.boom;
    if (frames?.length) {
      this.add(frames[0]!, x, y - 4, 0.46, (f, k) => {
        const t = k * 0.46;
        f.s = frames[t < 0.12 ? 0 : t < 0.18 ? 1 : 2] ?? frames[0]!;
        f.scale = t < 0.12 ? lerp(0.5, 1.2, t / 0.12) : t < 0.2 ? 1.2 : lerp(1.2, 1.6, (t - 0.2) / 0.26);
        f.alpha = t < 0.2 ? 1 : 1 - (t - 0.2) / 0.26;
      });
    }
    for (let i = 0; i < 6; i++) this.smoke(x + rnd(-10, 10), y - 4 + rnd(-10, 10), 0.6 + i * 0.06, 1.5, 3, 12);
    cameraShake(0.7);
  }

  private lasso(x: number, y: number, from: { x: number; y: number }): void {
    const s = this.sprite('lasso');
    if (!s) return;
    const go = Math.min(0.22, 0.06 + Math.hypot(x - from.x, y - from.y) * 0.002);
    const hold = 0.16;
    const fx = this.add(s, from.x, from.y - 8, go * 2 + hold, (f, k) => {
      const t = k * (go * 2 + hold);
      // out, hold, back
      const p = t < go ? t / go : t < go + hold ? 1 : 1 - (t - go - hold) / go;
      f.x = lerp(from.x, x, easeOutCubic(p));
      f.y = lerp(from.y - 8, y - 4, easeOutCubic(p));
      f.angle = p * Math.PI * 2;
    });
    this.ropes.push({ from, fx });
  }

  private smoke(x: number, y: number, dur: number, s0: number, s1: number, rise = 4): void {
    const s = this.sprite('smoke', Math.random() < 0.5 ? 0 : 1);
    if (!s) return;
    this.add(s, x, y, dur, (f, k) => {
      f.scale = lerp(s0, s1, k);
      f.y = y - rise * k;
      f.alpha = 0.8 * (1 - k);
    }, { depth: 7999 });
  }

  /** A few puffs of dust at someone's feet (running, landing, a poof). */
  dust(x: number, y: number, n = 2, depth = 0): void {
    const s = this.sprite('poof', 1);
    if (!s) return;
    for (let i = 0; i < n; i++) {
      const dx = rnd(-5, 5);
      const vx = dx * 1.2;
      this.add(s, x + dx, y, 0.4 + rnd(0, 0.15), (f, k) => {
        f.x = x + dx + vx * k;
        f.y = y - 4 * easeOutCubic(k);
        f.scale = lerp(0.25, 0.6, k);
        f.alpha = 0.55 * (1 - k);
      }, { depth: depth || y + 1, tint: rgba(0.86, 0.8, 0.68, 1) });
    }
  }

  /** Something picked up: its icon jumps from where it lay to the one who took it. */
  pickup(icon: Sprite, x: number, y: number, to: () => { x: number; y: number }): void {
    this.add(icon, x, y, 0.32, (f, k) => {
      const t = to();
      const e = easeOutCubic(k);
      f.x = lerp(x, t.x, e);
      f.y = lerp(y, t.y - 12, e) - Math.sin(k * Math.PI) * 10;
      f.scale = lerp(0.75, 0.35, k);
      f.alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    });
  }

  /** A thing that went away shrinks into the ground and fades where it stood. */
  vanish(s: Sprite, cx: number, cy: number, scale: number, depth: number): void {
    this.add(s, cx, cy, 0.22, (f, k) => {
      f.scale = scale * (1 - 0.5 * k);
      f.y = cy + (s.h * scale * 0.5 * k) / 2;
      f.alpha = 1 - k;
    }, { depth });
  }

  update(dt: number): void {
    for (const f of this.list) {
      f.t += dt;
      if (f.t >= 0) f.step(f, clamp01(f.t / f.dur));
    }
    const done = this.list.filter((f) => f.t >= f.dur);
    if (done.length) {
      for (const f of done) f.done?.();
      this.list = this.list.filter((f) => f.t < f.dur);
      this.ropes = this.ropes.filter((r) => r.fx.t < r.fx.dur);
    }
  }

  draw(q: DrawQueue): void {
    for (const f of this.list) {
      if (f.t < 0) continue;
      const w = f.s.w * f.scale * f.sx;
      const h = f.s.h * f.scale;
      const a = clamp01(f.alpha);
      q.push(f.depth, f.s, f.x, f.y, w, h, f.angle, f.tint === -1 ? alpha(a) : (f.tint & 0xffffff) | (Math.round(a * 255) << 24));
    }
  }

  /** The lassos' ropes, over everything. */
  drawRopes(): void {
    const col = rgb(0.77, 0.56, 0.33);
    for (const r of this.ropes) {
      if (r.fx.t < 0) continue;
      drawLine(vec2(r.from.x / TILE, -(r.from.y - 6) / TILE), vec2(r.fx.x / TILE, -r.fx.y / TILE), 1.2 / TILE, col);
    }
  }
}
