// The 2D client's pixel art (crops, small objects, item icons, effects) packed into one texture for the 3D world.
import * as THREE from 'three';
import { getArt } from '@v1/art/textures.ts';
import type { Px } from '@v1/art/px.ts';

export interface SpriteUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  w: number;
  h: number;
  /** Top-left of the frame in the atlas canvas (pixels). */
  x: number;
  y: number;
}

const W = 1024;
let canvas: HTMLCanvasElement | null = null;
let texture: THREE.Texture | null = null;
const entries = new Map<string, SpriteUV>();
const fxTextures = new Map<string, THREE.Texture>();

function build(): void {
  const art = getArt();
  const list: [string, Px][] = [];
  for (const [crop, frames] of Object.entries(art.crops)) frames.forEach((f, i) => list.push([`crop:${crop}:${i}`, f]));
  for (const [kind, o] of Object.entries(art.objects)) o.frames.forEach((f, i) => list.push([`obj:${kind}:${i}`, f]));
  for (const [id, p] of Object.entries(art.icons)) list.push([`icon:${id}`, p]);
  // shelf packing, tallest first
  list.sort((a, b) => b[1].h - a[1].h);
  let x = 0;
  let y = 0;
  let shelf = 0;
  const pos: [number, number][] = [];
  for (const [, p] of list) {
    if (x + p.w + 1 > W) {
      x = 0;
      y += shelf + 1;
      shelf = 0;
    }
    pos.push([x, y]);
    x += p.w + 1;
    shelf = Math.max(shelf, p.h);
  }
  const H = Math.pow(2, Math.ceil(Math.log2(y + shelf + 1)));
  canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  list.forEach(([key, p], i) => {
    const [px, py] = pos[i]!;
    ctx.drawImage(p.canvas, px, py);
    const e = 0.01;
    entries.set(key, { u0: (px + e) / W, v0: 1 - (py + p.h - e) / H, u1: (px + p.w - e) / W, v1: 1 - (py + e) / H, w: p.w, h: p.h, x: px, y: py });
  });
}

export function spriteAtlas(): { canvas: HTMLCanvasElement; texture: THREE.Texture } {
  if (!canvas) build();
  if (!texture) {
    texture = new THREE.CanvasTexture(canvas!);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  return { canvas: canvas!, texture };
}

export function sprite(key: string): SpriteUV | undefined {
  spriteAtlas();
  return entries.get(key);
}

/** Reads the RGBA pixels of a packed sprite (for extruding item icons into 3D). */
export function spritePixels(key: string): { w: number; h: number; data: Uint8ClampedArray } | null {
  const s = sprite(key);
  if (!s) return null;
  const ctx = spriteAtlas().canvas.getContext('2d')!;
  return { w: s.w, h: s.h, data: ctx.getImageData(s.x, s.y, s.w, s.h).data };
}

/** A small texture for one effect frame (hearts, sparkles…), used on billboards. */
export function fxTexture(kind: string, frame = 0): THREE.Texture | null {
  const k = `${kind}:${frame}`;
  let t = fxTextures.get(k);
  if (t) return t;
  const frames = getArt().fx[kind];
  const p = frames?.[frame % frames.length];
  if (!p) return null;
  t = new THREE.CanvasTexture(p.canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  fxTextures.set(k, t);
  return t;
}

/** A texture from any canvas, pixel-crisp. */
export function pixelTexture(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
