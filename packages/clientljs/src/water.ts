// The pond and the rain: lily pads and jumping fish, the moon and the stars mirrored in the water at night, and
// puddles that gather on the paths when it rains and slowly dry up afterwards.
import { TILE, inBounds, mapH, mapW, tileIndex } from '@lilla-garden/shared';
import { on } from './features.ts';
import { alpha, clamp01, drawSprite, rgba, smooth } from './gfx.ts';
import { cellHash, inView, type Scene } from './scene.ts';

/** Ground that collects puddles. */
const PUDDLY = new Set(['path_dirt', 'dirt', 'gravel', 'road', 'crossing', 'path_stone']);

interface Jump {
  x: number;
  y: number;
  t: number;
  dir: number;
  kind: number;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  max: number;
  size: number;
}

export class Water {
  /** 0 dry … 1 soaked: rises in the rain, dries over a few minutes after. */
  wet = 0;
  private jumps: Jump[] = [];
  private jumpIn = 3;
  private rings: Ring[] = [];
  private ringAcc = 0;
  /** Where the moon shows in the water: the middle of the water in view, eased so it glides as you walk. */
  private moon: { x: number; y: number } | null = null;

  clear(): void {
    this.jumps = [];
    this.rings = [];
    this.moon = null;
  }

  private isWater(sc: Scene, x: number, y: number): boolean {
    return inBounds(sc.world, x, y) && sc.world.terrain[tileIndex(sc.world, x, y)] === 'water';
  }

  update(sc: Scene, mapWeather: string | null): void {
    const dt = sc.dt;
    // the moon's reflection: in the middle of the open water in view (a reflection moves with whoever looks)
    let n = 0;
    let mx = 0;
    let my = 0;
    for (const [x, y] of sc.water)
      if (inView(sc, x * TILE, y * TILE, TILE, TILE, -12) && this.isWater(sc, x, y - 1) && this.isWater(sc, x, y + 1)) {
        n++;
        mx += x * TILE + 8;
        my += y * TILE + 8;
      }
    if (n >= 4) {
      const tx = mx / n;
      const ty = my / n;
      if (!this.moon) this.moon = { x: tx, y: ty };
      this.moon.x += (tx - this.moon.x) * Math.min(1, dt * 1.5);
      this.moon.y += (ty - this.moon.y) * Math.min(1, dt * 1.5);
    } else this.moon = null;
    const raining = mapWeather === 'rain' || mapWeather === 'storm';
    this.wet = on('puddles') ? (raining ? Math.min(1, this.wet + dt / 25) : Math.max(0, this.wet - dt / 150)) : 0;

    // now and then a fish jumps somewhere in the pond
    if (on('pond') && sc.where === 'out') {
      this.jumpIn -= dt;
      if (this.jumpIn <= 0) {
        this.jumpIn = 3 + Math.random() * 6;
        const open = sc.water.filter(([x, y]) => inView(sc, x * TILE, y * TILE, TILE, TILE, -8) && this.isWater(sc, x - 1, y) && this.isWater(sc, x + 1, y) && this.isWater(sc, x, y - 1) && this.isWater(sc, x, y + 1));
        if (open.length) {
          const [x, y] = open[Math.floor(Math.random() * open.length)]!;
          const j: Jump = { x: x * TILE + 4 + Math.random() * 8, y: y * TILE + 6 + Math.random() * 6, t: 0, dir: Math.random() < 0.5 ? -1 : 1, kind: Math.random() < 0.6 ? 0 : 1 };
          this.jumps.push(j);
          this.rings.push({ x: j.x, y: j.y, t: 0, max: 0.8, size: 1.1 });
        }
      }
    }
    for (const j of this.jumps) {
      j.t += dt;
      if (j.t >= 0.7 && j.t - dt < 0.7) this.rings.push({ x: j.x + j.dir * 12, y: j.y, t: 0, max: 0.9, size: 1.3 });
    }
    this.jumps = this.jumps.filter((j) => j.t < 0.7);

    // rain rings in the puddles
    if (this.wet > 0.2 && raining && sc.where === 'out') {
      this.ringAcc += dt * 14 * this.wet;
      while (this.ringAcc >= 1) {
        this.ringAcc -= 1;
        const x = Math.floor((sc.vx + Math.random() * sc.vw) / TILE);
        const y = Math.floor((sc.vy + Math.random() * sc.vh) / TILE);
        if (!inBounds(sc.world, x, y) || !PUDDLY.has(sc.world.terrain[tileIndex(sc.world, x, y)]!) || cellHash(x, y, 30) > 0.4) continue;
        const p = this.puddleAt(x, y);
        this.rings.push({ x: p.x + (Math.random() - 0.5) * p.w * 0.6, y: p.y + (Math.random() - 0.5) * p.w * 0.2, t: 0, max: 0.5, size: 0.5 });
      }
    }
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
  }

  /** Where the puddle of a cell lies and how wide it is. */
  private puddleAt(x: number, y: number): { x: number; y: number; w: number } {
    return { x: x * TILE + 4 + cellHash(x, y, 31) * 8, y: y * TILE + 4 + cellHash(x, y, 32) * 8, w: 10 + cellHash(x, y, 33) * 10 };
  }

  /** On the ground, under everything: lily pads, wet earth and puddles. */
  drawGround(sc: Scene): void {
    const ex = sc.extras;
    const x0 = Math.max(0, Math.floor(sc.vx / TILE) - 1);
    const y0 = Math.max(0, Math.floor(sc.vy / TILE) - 1);
    const x1 = Math.min(mapW(sc.world) - 1, Math.ceil((sc.vx + sc.vw) / TILE));
    const y1 = Math.min(mapH(sc.world) - 1, Math.ceil((sc.vy + sc.vh) / TILE));
    // lily pads on ponds and lakes, not on the sea or in caves
    const sea = sc.world.biome === 'strand';
    if (on('pond') && sc.where !== 'cave' && !sea)
      for (const [x, y] of sc.water) {
        if (x < x0 || x > x1 || y < y0 || y > y1 || cellHash(x, y, 11) > 0.22) continue;
        if (!(this.isWater(sc, x - 1, y) && this.isWater(sc, x + 1, y) && this.isWater(sc, x, y - 1) && this.isWater(sc, x, y + 1))) continue;
        const s = ex.lilies[Math.floor(cellHash(x, y, 12) * 4)]!;
        const bob = Math.sin(sc.t * 1.1 + cellHash(x, y, 13) * 6) * 0.6;
        drawSprite(s, x * TILE + 4 + cellHash(x, y, 14) * 8, y * TILE + 5 + cellHash(x, y, 15) * 6 + bob, s.w, s.h, (cellHash(x, y, 16) - 0.5) * 0.6);
      }
    if (this.wet <= 0.01 || sc.where === 'cave') return;
    // wet ground is darker
    drawSprite(sc.art.white, sc.vx + sc.vw / 2, sc.vy + sc.vh / 2, sc.vw + 32, sc.vh + 32, 0, rgba(0.05, 0.08, 0.13, 0.16 * this.wet));
    // puddles mirror the sky, from the middle out as they fill
    const k = smooth(this.wet);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!PUDDLY.has(sc.world.terrain[tileIndex(sc.world, x, y)]!) || cellHash(x, y, 30) > 0.4) continue;
        const p = this.puddleAt(x, y);
        const w = p.w * (0.4 + 0.6 * k);
        drawSprite(ex.puddle, p.x, p.y, w, w * 0.42, 0, rgba(0.58, 0.68, 0.8, 0.7 * k));
        drawSprite(sc.art.white, p.x - w * 0.18, p.y - w * 0.07, w * 0.3, 0.8, 0, alpha(0.45 * k));
      }
  }

  /** Over the water: jumping fish and their rings. */
  drawOver(sc: Scene): void {
    for (const r of this.rings) {
      const k = r.t / r.max;
      const g = r.size * (0.5 + k);
      drawSprite(sc.art.ring, r.x, r.y, sc.art.ring.w * g, sc.art.ring.h * g, 0, alpha(0.8 * (1 - k)));
    }
    for (const j of this.jumps) {
      const s = sc.extras.fish[j.kind]!;
      const k = j.t / 0.7;
      // an arc out of the water and back in, turning over the top
      drawSprite(s, j.x + j.dir * 12 * k, j.y - Math.sin(k * Math.PI) * 11, s.w * j.dir, s.h, j.dir * (k - 0.5) * 2.2);
    }
  }

  /** At night, over the lit scene: the stars and the moon mirrored in the pond. */
  drawBright(sc: Scene): void {
    if (!on('pond') || sc.where !== 'out') return;
    if (sc.weather === 'rain' || sc.weather === 'storm' || sc.weather === 'fog' || sc.weather === 'snow' || sc.weather === 'hail') return;
    const night = smooth((sc.sky.dark - 0.55) / 0.3);
    if (night <= 0.01) return;
    const glow = sc.art.glow;
    for (const [x, y] of sc.water) {
      if (!inView(sc, x * TILE, y * TILE, TILE, TILE)) continue;
      for (let k = 0; k < 3; k++) {
        const h = cellHash(x, y, 200 + k);
        if (h > 0.3) continue;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(sc.t * (0.8 + h * 2) + h * 40));
        drawSprite(glow, x * TILE + cellHash(x, y, 210 + k) * 16, y * TILE + cellHash(x, y, 220 + k) * 16, 3, 3, 0, rgba(0.85, 0.9, 1, 0.75 * tw * night));
      }
    }
    // the moon: a broken streak of light that wobbles on the ripples
    const m = this.moon;
    if (m)
      for (let i = 0; i < 5; i++) {
        const y = m.y - 7 + i * 3.4;
        const w = (9 - Math.abs(i - 2) * 2) * (0.85 + 0.25 * Math.sin(sc.t * 2.3 + i * 1.7));
        const x = m.x + Math.sin(sc.t * 1.6 + i * 2.1) * 1.4;
        drawSprite(glow, x, y, w, 2.2, 0, rgba(1, 0.97, 0.82, clamp01(0.85 * night)));
      }
  }
}
