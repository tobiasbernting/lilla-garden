// Nature through the day and the year: trees turning with the seasons, leaves falling and lying under them in the
// autumn, mist over the water and the fields at dawn, dew glinting on the grass in the morning sun.
import { TILE, mapH, mapW } from '@lilla-garden/shared';
import type { Sprite } from './atlas.ts';
import { AUTUMN, DECIDUOUS, type Extras } from './extras.ts';
import { autumnProgress, on, type YearSeason } from './features.ts';
import { clamp01, drawSprite, rgba, smooth } from './gfx.ts';
import { cellHash, inView, type Scene } from './scene.ts';

type RGB = [number, number, number];

/** What a tree looks like at this time of year: its frames and, in the autumn, the colour of its leaves. */
export interface TreeLook {
  frames: Sprite[];
  leaf: RGB | null;
}

/** The look for a tree at (x, y), or null for its usual summer green. */
export function treeLook(kind: string, x: number, y: number, year: YearSeason, snowGround: boolean, ex: Extras): TreeLook | null {
  if (!on('seasons')) return null;
  const set = ex.trees[kind];
  if (!set) return null;
  if (snowGround && set.winter.length) return { frames: set.winter, leaf: null };
  if (year === 'spring' && set.spring.length) return { frames: set.spring, leaf: null };
  if (year === 'autumn' && DECIDUOUS.has(kind) && set.autumn.length) {
    const p = autumnProgress();
    // more trees have turned as the autumn goes on; late in November they go brown
    if (cellHash(x, y, 7) > 0.25 + p * 0.7) return null;
    let i = Math.floor(cellHash(x, y, 3) * 3);
    if (p > 0.75 && cellHash(x, y, 5) < (p - 0.75) * 3) i = 3;
    const pal = AUTUMN[i]!;
    return { frames: set.autumn[i]!, leaf: [pal.leaf[0], pal.leaf[1], pal.leaf[2]] };
  }
  return null;
}

/** A turned tree in view: its picture's rectangle and the colour of its leaves. */
export interface LeafyTree {
  x: number;
  y: number;
  w: number;
  h: number;
  leaf: RGB;
  /** Its tile, for where its fallen leaves lie. */
  tx: number;
  ty: number;
}

interface Leaf {
  x: number;
  y: number;
  vy: number;
  /** Where it lands. */
  ground: number;
  angle: number;
  spin: number;
  phase: number;
  color: RGB;
  /** Seconds left lying on the ground once landed. */
  life: number;
  landed: boolean;
}

interface Mist {
  x: number;
  y: number;
  size: number;
  life: number;
  max: number;
  vx: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class Nature {
  private leaves: Leaf[] = [];
  private leafAcc = 0;
  private mist: Mist[] = [];
  private mistAcc = 0;

  clear(): void {
    this.leaves = [];
    this.mist = [];
  }

  /** How thick the dawn mist is now (0 none … 1). */
  private mistAmount(sc: Scene): number {
    if (!on('mist') || sc.where !== 'out') return 0;
    if (sc.weather === 'rain' || sc.weather === 'storm' || sc.weather === 'wind' || sc.weather === 'hail') return 0;
    const f = sc.day;
    if (f > 0.9) return smooth((f - 0.9) / 0.08);
    return 1 - smooth((f - 0.04) / 0.1);
  }

  update(sc: Scene, trees: LeafyTree[]): void {
    const dt = sc.dt;
    // leaves let go of the turned trees in view, more in the wind
    if (on('seasons') && trees.length && sc.where === 'out' && sc.weather !== 'snow') {
      this.leafAcc += dt * (0.8 + sc.sky.wind * 2.5) * Math.min(1, trees.length / 5);
      while (this.leafAcc >= 1) {
        this.leafAcc -= 1;
        const tr = trees[Math.floor(Math.random() * trees.length)]!;
        const c = tr.leaf;
        this.leaves.push({
          x: tr.x + tr.w * rnd(0.2, 0.8),
          y: tr.y + tr.h * rnd(0.12, 0.55),
          vy: rnd(9, 15),
          ground: tr.y + tr.h + rnd(-4, 16),
          angle: rnd(0, 6),
          spin: rnd(-4, 4),
          phase: rnd(0, 6),
          color: [c[0] * rnd(0.85, 1.1), c[1] * rnd(0.85, 1.1), c[2] * rnd(0.8, 1.1)],
          life: rnd(5, 9),
          landed: false,
        });
      }
    }
    const wind = sc.sky.wind;
    for (const l of this.leaves) {
      if (l.landed) {
        l.life -= dt;
        continue;
      }
      l.x += (wind * 14 + Math.sin(sc.t * 2.6 + l.phase) * 9) * dt;
      l.y += l.vy * dt;
      l.angle += l.spin * dt;
      if (l.y >= l.ground) l.landed = true;
    }
    this.leaves = this.leaves.filter((l) => l.life > 0).slice(-160);

    // dawn mist over the water and the low fields, drifting and burning off as the sun climbs
    const amount = this.mistAmount(sc);
    if (amount > 0.02) {
      this.mistAcc += dt * 5 * amount * ((sc.vw * sc.vh) / (320 * 180));
      while (this.mistAcc >= 1) {
        this.mistAcc -= 1;
        // a third of the banks over water when there is some in view
        const water = sc.water.filter(([x, y]) => inView(sc, x * TILE, y * TILE, TILE, TILE, 40));
        const overWater = water.length && Math.random() < 0.4;
        const [wx, wy] = overWater ? water[Math.floor(Math.random() * water.length)]! : [0, 0];
        this.mist.push({
          x: overWater ? wx * TILE + 8 : sc.vx + rnd(-40, sc.vw + 20),
          y: overWater ? wy * TILE + 8 : sc.vy + rnd(-10, sc.vh + 10),
          size: rnd(60, 110),
          life: 9,
          max: 9,
          vx: rnd(2, 5),
        });
      }
    }
    for (const m of this.mist) {
      m.life -= dt;
      m.x += m.vx * dt;
    }
    this.mist = this.mist.filter((m) => m.life > 0);
  }

  /** On the ground: the leaves that have fallen. */
  drawGround(sc: Scene, trees: LeafyTree[]): void {
    if (!on('seasons')) return;
    const leaf = sc.extras.leaf;
    // a carpet of old leaves around each turned tree's foot
    for (const tr of trees) {
      const fx = tr.x + tr.w / 2;
      const fy = tr.y + tr.h;
      for (let i = 0; i < 9; i++) {
        const a = cellHash(tr.tx, tr.ty, 20 + i) * Math.PI * 2;
        const r = 4 + cellHash(tr.tx, tr.ty, 40 + i) * 13;
        const k = 0.75 + cellHash(tr.tx, tr.ty, 60 + i) * 0.35;
        drawSprite(leaf, fx + Math.cos(a) * r * 1.3, fy - 2 + Math.sin(a) * r * 0.5, leaf.w, leaf.h, a * 3, rgba(tr.leaf[0] * k, tr.leaf[1] * k, tr.leaf[2] * k, 0.95));
      }
    }
    for (const l of this.leaves)
      if (l.landed && inView(sc, l.x, l.y)) drawSprite(leaf, l.x, l.y, leaf.w, leaf.h, l.angle, rgba(l.color[0], l.color[1], l.color[2], clamp01(l.life / 2)));
  }

  /** Over everything that stands: leaves in the air and the mist. */
  drawOver(sc: Scene): void {
    const leaf = sc.extras.leaf;
    for (const l of this.leaves) {
      if (l.landed || !inView(sc, l.x, l.y)) continue;
      // a leaf tumbling shows its edge now and then
      const flip = Math.cos(sc.t * 5 + l.phase);
      drawSprite(leaf, l.x, l.y, leaf.w * (0.35 + 0.65 * Math.abs(flip)), leaf.h, l.angle, rgba(l.color[0], l.color[1], l.color[2], 1));
    }
    const blob = sc.art.blob;
    const g = sc.sky.golden;
    for (const m of this.mist) {
      const fade = smooth(Math.min((m.max - m.life) / 3, m.life / 3, 1));
      drawSprite(blob, m.x, m.y, m.size, m.size * 0.42, 0, rgba(0.97, 0.95 - g * 0.04, 0.95 - g * 0.06, 0.34 * fade));
    }
  }

  /** In the morning sun, dew glints on the grass (drawn additively, before the light map: it is daylight). */
  drawDew(sc: Scene): void {
    if (!on('mist') || sc.where !== 'out' || sc.sky.shadowAlpha < 0.05) return;
    const amount = 1 - smooth((sc.day - 0.05) / 0.12);
    if (amount <= 0.01 || sc.day > 0.5) return;
    const sp = sc.art.fx.sparkle?.[1];
    if (!sp) return;
    const x0 = Math.max(0, Math.floor(sc.vx / TILE));
    const y0 = Math.max(0, Math.floor(sc.vy / TILE));
    const W = mapW(sc.world);
    const x1 = Math.min(W - 1, Math.ceil((sc.vx + sc.vw) / TILE));
    const y1 = Math.min(mapH(sc.world) - 1, Math.ceil((sc.vy + sc.vh) / TILE));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (sc.world.terrain[y * W + x] !== 'grass') continue;
        for (let k = 0; k < 2; k++) {
          const h = cellHash(x, y, 90 + k);
          if (h > 0.55) continue;
          const tw = Math.sin(sc.t * 2.1 + h * 60);
          if (tw < 0.86) continue;
          const a = ((tw - 0.86) / 0.14) * amount;
          drawSprite(sp, x * TILE + cellHash(x, y, 100 + k) * 16, y * TILE + cellHash(x, y, 110 + k) * 16, 3, 3, 0, rgba(1, 1, 0.92, a));
        }
      }
  }
}
