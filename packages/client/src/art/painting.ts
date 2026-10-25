// Textures for paintings drawn by players (16×16 palette-index strings).
import type Phaser from 'phaser';
import { PAINT_SIZE, paintColor } from '@lilla-garden/shared';
import { upscale } from './hd.ts';
import { Px } from './px.js';
import { HD } from './style.ts';
import { getArt } from './textures.js';

const FRAME = '#a5733a';
const FRAME_D = '#6b4420';
const PAPER = '#f6efdc';

/** A framed tavla: 20×20 with a 2px wooden frame around the drawing. */
export function paintingPx(pixels: string): Px {
  const p = new Px(PAINT_SIZE + 4, PAINT_SIZE + 4);
  p.rect(0, 0, PAINT_SIZE + 4, PAINT_SIZE + 4, FRAME).box(0, 0, PAINT_SIZE + 4, PAINT_SIZE + 4, FRAME_D);
  p.rect(2, 2, PAINT_SIZE, PAINT_SIZE, PAPER);
  for (let i = 0; i < pixels.length && i < PAINT_SIZE * PAINT_SIZE; i++) {
    const c = paintColor(pixels[i]!);
    if (c) p.px(2 + (i % PAINT_SIZE), 2 + Math.floor(i / PAINT_SIZE), c);
  }
  return p;
}

const hashOf = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

const urls = new Map<string, string>();
/** Data URL of a framed thumbnail for inventory slots (cached). */
export function paintingIconUrl(pixels: string): string {
  let u = urls.get(pixels);
  if (!u) {
    u = paintingPx(pixels).dataUrl();
    urls.set(pixels, u);
  }
  return u;
}

/** Icon for an inventory stack: the drawing for a painted tavla, the item icon otherwise. */
export function stackIconUrl(stack: { item: string; data?: string }): string {
  if (stack.data !== undefined) return paintingIconUrl(stack.data);
  return getArt().iconUrl[stack.item] ?? '';
}

/** Ensures a texture for this drawing exists; returns its key. */
export function paintingTexture(tm: Phaser.Textures.TextureManager, pixels: string): string {
  const key = `painting-${hashOf(pixels)}`;
  if (!tm.exists(key)) tm.addCanvas(key, (HD ? upscale(paintingPx(pixels)) : paintingPx(pixels)).canvas);
  return key;
}
