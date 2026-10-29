// Drawing in world pixels (16 per tile, y down, like the 2D game) straight into LittleJS's WebGL batch. LittleJS
// works in world units with y up; one unit here is one tile.
import { glDraw, glEnable, glSetTexture } from 'littlejsengine';
import { TILE } from '@lilla-garden/shared';
import type { Sprite } from './atlas.ts';

/** RGBA in 0..1 packed the way glDraw takes it. */
export const rgba = (r: number, g: number, b: number, a = 1): number => {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return c(r) | (c(g) << 8) | (c(b) << 16) | (c(a) << 24);
};
export const WHITE = rgba(1, 1, 1, 1);
/** White at an alpha. */
export const alpha = (a: number): number => rgba(1, 1, 1, a);

/** Sprite with its centre at (cx, cy), w×h world pixels (a negative w mirrors it), turned clockwise by angle. */
export function drawSprite(s: Sprite, cx: number, cy: number, w = s.w, h = s.h, angle = 0, color = WHITE, additive = 0): void {
  if (!glEnable || !s.sheet.tex?.glTexture) return;
  glSetTexture(s.sheet.tex.glTexture);
  glDraw(cx / TILE, -cy / TILE, w / TILE, h / TILE, angle, s.u0, s.v0, s.u1, s.v1, color, additive);
}

/** Only the top `part` (0..1) of a sprite whose full picture would be centred at (cx, cy). */
export function drawSpriteTop(s: Sprite, cx: number, cy: number, w: number, h: number, part: number, color = WHITE): void {
  if (!glEnable || !s.sheet.tex?.glTexture) return;
  glSetTexture(s.sheet.tex.glTexture);
  const top = cy - h / 2;
  glDraw(cx / TILE, -(top + (h * part) / 2) / TILE, w / TILE, (h * part) / TILE, 0, s.u0, s.v0, s.u1, s.v0 + (s.v1 - s.v0) * part, color, 0);
}

/**
 * The shadow a picture standing on (bx, by) casts on the ground: its silhouette sheared away from the sun, drawn in
 * horizontal slices (WebGL quads can't shear). Per pixel of height the shadow moves (shx, shy); shy is negative,
 * towards the back of the scene, so a shadow always starts at the feet and never lies in front of what casts it.
 */
export function drawSheared(s: Sprite, bx: number, by: number, w: number, h: number, shx: number, shy: number, color: number): void {
  if (!glEnable || !s.sheet.tex?.glTexture || shy >= 0) return;
  glSetTexture(s.sheet.tex.glTexture);
  // enough slices that each step sideways is about two pixels
  const n = Math.max(2, Math.min(16, Math.ceil((Math.abs(shx) * h) / 2.2)));
  const dv = (s.v1 - s.v0) / n;
  const sliceH = -shy * (h / n);
  for (let i = 0; i < n; i++) {
    const zm = ((i + 0.5) / n) * h; // height of the slice's middle above the feet
    const vb = s.v1 - dv * i;
    glDraw((bx + shx * zm) / TILE, -(by + shy * zm) / TILE, w / TILE, sliceH / TILE, 0, s.u0, vb - dv, s.u1, vb, color, 0);
  }
}

/** Centre of a w×h picture standing on (bx, by) and leaning clockwise by angle about that foot point. */
export function centreFromFoot(bx: number, by: number, h: number, angle: number): [number, number] {
  return [bx + Math.sin(angle) * (h / 2), by - Math.cos(angle) * (h / 2)];
}

interface Item {
  depth: number;
  s: Sprite;
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
  color: number;
  add: number;
  /** Part of the picture drawn, from the top (swimming, sitting in a car). */
  part: number;
}

/** Sprites collected over a frame and drawn back to front by depth (the 2D game's y-sorting). */
export class DrawQueue {
  private pool: Item[] = [];
  private n = 0;

  push(depth: number, s: Sprite, cx: number, cy: number, w = s.w, h = s.h, angle = 0, color = WHITE, add = 0, part = 1): void {
    let it = this.pool[this.n];
    if (!it) {
      it = { depth, s, cx, cy, w, h, angle, color, add, part };
      this.pool.push(it);
    } else {
      it.depth = depth;
      it.s = s;
      it.cx = cx;
      it.cy = cy;
      it.w = w;
      it.h = h;
      it.angle = angle;
      it.color = color;
      it.add = add;
      it.part = part;
    }
    this.n++;
  }

  flush(): void {
    const list = this.pool.slice(0, this.n);
    list.sort((a, b) => a.depth - b.depth); // stable: equal depths keep the order they were pushed in
    for (const it of list) {
      if (it.part < 1) drawSpriteTop(it.s, it.cx, it.cy, it.w, it.h, it.part, it.color);
      else drawSprite(it.s, it.cx, it.cy, it.w, it.h, it.angle, it.color, it.add);
    }
    this.n = 0;
  }
}

// ---- easing ----
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeOutBack = (t: number): number => {
  const x = clamp01(t) - 1;
  return 1 + 2.7 * x * x * x + 1.7 * x * x;
};
/** Springy overshoot that settles at 1. */
export const easeOutElastic = (t: number): number => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
