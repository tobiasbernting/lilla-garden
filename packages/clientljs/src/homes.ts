// Homes that feel lived in: smoke curling from the chimneys, and inside the farmhouse the sun falling in through the
// windows in long beams with dust drifting in them (the moon's at night).
import { INTERIOR, TILE } from '@lilla-garden/shared';
import { on } from './features.ts';
import { clamp01, drawSprite, rgba, smooth } from './gfx.ts';
import { inView, type Scene } from './scene.ts';

interface Puff {
  x: number;
  y: number;
  vx: number;
  size: number;
  life: number;
  max: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

/** Where the beams fall in through the farmhouse's back wall (tile columns). */
const BEAMS = [INTERIOR.x + 2.6, INTERIOR.x + 6.4];

export class Homes {
  private puffs: Puff[] = [];
  private acc = new Map<string, number>();
  private motes: Mote[] = [];

  clear(): void {
    this.puffs = [];
    this.motes = [];
  }

  /** `chimneys`: the tops of the chimneys in and just around the view. */
  update(sc: Scene, chimneys: { x: number; y: number }[]): void {
    const dt = sc.dt;
    if (on('smoke') && sc.where === 'out') {
      // more smoke when it is cold out, and in the morning and evening when the stoves are lit
      const cold = sc.year === 'winter' ? 1 : sc.year === 'autumn' ? 0.85 : sc.year === 'spring' ? 0.6 : 0.35;
      const stove = sc.day < 0.15 || sc.day > 0.6 ? 1 : 0.6;
      const rate = 2.6 * cold * stove;
      for (const c of chimneys) {
        const key = `${c.x},${c.y}`;
        let a = (this.acc.get(key) ?? Math.random()) + dt * rate;
        while (a >= 1) {
          a -= 1;
          this.puffs.push({ x: c.x + (Math.random() - 0.5) * 2, y: c.y, vx: 1 + Math.random() * 2, size: 4 + Math.random() * 2.5, life: 4, max: 4 });
        }
        this.acc.set(key, a);
      }
    }
    const wind = sc.sky.wind;
    for (const p of this.puffs) {
      p.life -= dt;
      const age = p.max - p.life;
      p.y -= (11 - age * 1.5) * dt;
      p.x += (p.vx + wind * 9 * Math.min(1, age)) * dt;
      p.size += 4.4 * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);

    // dust in the farmhouse air
    if (on('indoors') && sc.where === 'inside') {
      while (this.motes.length < 34)
        this.motes.push({ x: (INTERIOR.x + Math.random() * INTERIOR.w) * TILE, y: (INTERIOR.y - 0.5 + Math.random() * (INTERIOR.h + 0.5)) * TILE, vx: 0, vy: 0, phase: Math.random() * 10 });
      for (const m of this.motes) {
        m.vx += (Math.random() - 0.5) * 8 * dt - m.vx * dt * 0.5;
        m.vy += ((Math.random() - 0.5) * 8 + 0.6) * dt - m.vy * dt * 0.5;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < INTERIOR.x * TILE || m.x > (INTERIOR.x + INTERIOR.w) * TILE || m.y < (INTERIOR.y - 0.5) * TILE || m.y > (INTERIOR.y + INTERIOR.h) * TILE) {
          m.x = (INTERIOR.x + Math.random() * INTERIOR.w) * TILE;
          m.y = (INTERIOR.y - 0.5) * TILE;
        }
      }
    } else this.motes = [];
  }

  /** Over everything outdoors (lit with the rest): the smoke. */
  drawOver(sc: Scene): void {
    const blob = sc.art.blob;
    for (const p of this.puffs) {
      if (!inView(sc, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)) continue;
      const age = p.max - p.life;
      const a = 0.62 * clamp01(age / 0.35) * clamp01(p.life / 1.8);
      drawSprite(blob, p.x, p.y, p.size * 1.4, p.size * 1.2, 0, rgba(0.9, 0.9, 0.93, a));
    }
  }

  /** Over the lit scene, indoors: sunbeams (or moonbeams) from the windows, with dust glittering in them. */
  drawBright(sc: Scene): void {
    if (!on('indoors') || sc.where !== 'inside') return;
    const out = sc.outdoor;
    const sun = out.shadowAlpha / 0.24; // 0 at night or overcast … 1 in full sun
    const night = smooth((out.dark - 0.55) / 0.3);
    const clear = sc.weather === 'sun' || sc.weather === 'cloudy' || sc.weather === 'wind' || sc.weather === null;
    const moon = clear ? night * 0.6 : 0;
    const k = Math.max(sun, moon);
    if (k <= 0.01) return;
    // the beams lean away from the sun like the shadows outside: to the west in the morning, east in the evening
    const lean = out.shadowX * 0.5;
    const golden = out.golden;
    const [r, g, b] = sun >= moon ? [1, 0.93 - golden * 0.18, 0.78 - golden * 0.35] : [0.62, 0.72, 1];
    const beam = sc.extras.beam;
    const top = (INTERIOR.y - 0.6) * TILE;
    const len = (INTERIOR.h + 0.2) * TILE;
    const beams: { x0: number; dx: number }[] = [];
    for (const bx of BEAMS) {
      const x0 = bx * TILE;
      const dx = Math.sin(lean) * len;
      beams.push({ x0, dx });
      // the shaft, and the bright patch where it lands on the floor
      drawSprite(beam, x0 + dx / 2, top + len / 2, 13, len, -lean, rgba(r, g, b, 0.3 * k));
      drawSprite(sc.art.blob, x0 + dx, top + len - 6, 26, 9, 0, rgba(r, g, b, 0.22 * k));
    }
    // dust: faint everywhere, glittering where it drifts through a beam
    for (const m of this.motes) {
      let lit = 0.15;
      for (const bm of beams) {
        const f = clamp01((m.y - top) / len);
        if (Math.abs(m.x - (bm.x0 + bm.dx * f)) < 6) lit = 1;
      }
      const tw = 0.6 + 0.4 * Math.sin(sc.t * 3 + m.phase);
      drawSprite(sc.art.glow, m.x, m.y, 2, 2, 0, rgba(r, g, b, lit * tw * k));
    }
  }
}
