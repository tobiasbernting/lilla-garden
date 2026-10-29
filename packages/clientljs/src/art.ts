// Every picture the view draws, packed into the atlas: the 2D game's generated art plus a few soft shapes of our own
// for light, weather and effects.
import type { Appearance, Outfit } from '@lilla-garden/shared';
import { animalSheet, ANIMAL_SIZE } from '@v1/art/animals.ts';
import { CHAR_H, CHAR_W, drawCharacterSheet, lookKey, lookOf } from '@v1/art/characters.ts';
import { upscale } from '@v1/art/hd.ts';
import { paintingPx } from '@v1/art/painting.ts';
import { HD, R } from '@v1/art/style.ts';
import { getArt } from '@v1/art/textures.ts';
import { atlas, whole, type Picture, type Sprite } from './atlas.ts';
import { panesOf } from './extras.ts';

export interface ObjectSprites {
  frames: Sprite[];
  /** Pixel offset of the picture's top-left from the object's tile corner. */
  ox: number;
  oy: number;
  animated: boolean;
  /** Per frame: the window panes lit up warm, drawn over the house at night (null where there are none). */
  windows: (Sprite | null)[];
  /** Per frame: where those panes are (pixels from the picture's top-left), for the light they cast. */
  panes: Pane[][];
}

export interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sprites {
  terrain: Sprite[];
  objects: Record<string, ObjectSprites>;
  crops: Record<string, Sprite[]>;
  fx: Record<string, Sprite[]>;
  icons: Record<string, Sprite>;
  /** Soft white round glow (light halos, fireflies, sparkles). */
  glow: Sprite;
  /** Soft round blob, dark in the middle (shadows of clouds, fog puffs when tinted). */
  blob: Sprite;
  /** 1×1 white, for rectangles that share the batch. */
  white: Sprite;
  rain: Sprite;
  flake: Sprite;
  /** A ripple ring where a raindrop lands. */
  ring: Sprite;
  leaf: Sprite[];
  gust: Sprite;
  rainbow: Sprite;
}

/** Things with glass that glows at night. */
const LIT_KINDS = new Set(['house', 'house_small', 'apartment', 'barn', 'bathhouse', 'coop', 'sheepfold', 'pigsty', 'shop', 'market', 'pizzeria', 'train_station', 'stall', 'sellstall', 'window', 'door']);

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};

/** The panes of a building's picture recoloured to lamp light; null when it has no glass. */
function litWindows(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = src.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const [out, octx] = canvas(src.width, src.height);
  const lit = octx.createImageData(src.width, src.height);
  const o = lit.data;
  let any = false;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    if (d[i + 3]! < 200 || b < 200 || g < 170 || r > 205 || b - r < 30) continue;
    any = true;
    // lighter glass (the shine) becomes the bright middle of the flame-lit pane
    const k = Math.min(1, (r - 100) / 120);
    o[i] = 255;
    o[i + 1] = Math.round(196 + 40 * k);
    o[i + 2] = Math.round(110 + 80 * k);
    o[i + 3] = 255;
  }
  if (!any) return null;
  octx.putImageData(lit, 0, 0);
  return out;
}

function radial(size: number, stops: [number, string][]): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function rainbowCanvas(): HTMLCanvasElement {
  // a half ring, 6 bands, soft at the ends; drawn big and faint over the sky side of the view
  const W = 256;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const colours = ['#ff4040', '#ff9a30', '#ffe040', '#50d050', '#40a0ff', '#7050e0'];
  ctx.lineWidth = 7;
  colours.forEach((col, i) => {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(W / 2, H, H - 6 - i * 6.5, Math.PI, 0);
    ctx.stroke();
  });
  // fade both feet into the ground
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  return c;
}

let sprites: Sprites | null = null;

/** Draws and packs everything once (needs the WebGL context, so after engineInit). */
export function loadSprites(): Sprites {
  if (sprites) return sprites;
  const art = getArt();
  const T = 16 * R;

  // the terrain sheet holds 32 tiles a row
  const terrainPics: Picture[] = [];
  for (let i = 0; i < art.terrain.count; i++) terrainPics.push({ src: art.terrain.canvas, sx: (i % 32) * T, sy: Math.floor(i / 32) * T, sw: T, sh: T, extrude: true });

  // one big batch, so the shelves pack tight; remember where each part starts
  const pics: Picture[] = [...terrainPics];
  const objectAt: Record<string, { start: number; n: number; windows: (number | null)[]; panes: Pane[][] }> = {};
  for (const [kind, o] of Object.entries(art.objects)) {
    const start = pics.length;
    const windows: (number | null)[] = [];
    const panes: Pane[][] = [];
    for (const f of o.frames) pics.push(whole(f.canvas));
    if (LIT_KINDS.has(kind))
      for (const f of o.frames) {
        const lit = litWindows(f.canvas);
        windows.push(lit ? pics.push(whole(lit)) - 1 : null);
        panes.push(lit ? panesOf(lit) : []);
      }
    objectAt[kind] = { start, n: o.frames.length, windows, panes };
  }
  const cropAt: Record<string, [number, number]> = {};
  for (const [crop, frames] of Object.entries(art.crops)) {
    cropAt[crop] = [pics.length, frames.length];
    for (const f of frames) pics.push(whole(f.canvas));
  }
  const fxAt: Record<string, [number, number]> = {};
  for (const [name, frames] of Object.entries(art.fx)) {
    fxAt[name] = [pics.length, frames.length];
    for (const f of frames) pics.push(whole(f.canvas));
  }
  const iconAt: Record<string, number> = {};
  for (const [id, p] of Object.entries(art.icons)) iconAt[id] = pics.push(whole(p.canvas)) - 1;

  // our own soft shapes, drawn at texture resolution
  const [white, wctx] = canvas(4, 4);
  wctx.fillStyle = '#fff';
  wctx.fillRect(0, 0, 4, 4);
  const [rain, rctx] = canvas(R, 7 * R);
  const rg = rctx.createLinearGradient(0, 0, 0, 7 * R);
  rg.addColorStop(0, 'rgba(200,222,255,0)');
  rg.addColorStop(1, 'rgba(215,232,255,0.95)');
  rctx.fillStyle = rg;
  rctx.fillRect(0, 0, R, 7 * R);
  const leaf = (c1: string, c2: string) => {
    const [l, lctx] = canvas(4 * R, 3 * R);
    lctx.scale(R, R);
    lctx.fillStyle = c1;
    lctx.fillRect(0, 1, 3, 1);
    lctx.fillRect(1, 0, 2, 3);
    lctx.fillStyle = c2;
    lctx.fillRect(3, 1, 1, 1);
    return l;
  };
  const [ring, ringCtx] = canvas(12 * R, 6 * R);
  ringCtx.strokeStyle = 'rgba(225,240,255,0.95)';
  ringCtx.lineWidth = R;
  ringCtx.beginPath();
  ringCtx.ellipse(6 * R, 3 * R, 5.5 * R, 2.5 * R, 0, 0, Math.PI * 2);
  ringCtx.stroke();
  const [gust, gctx] = canvas(24 * R, R);
  const gg = gctx.createLinearGradient(0, 0, 24 * R, 0);
  gg.addColorStop(0, 'rgba(255,255,255,0)');
  gg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  gg.addColorStop(1, 'rgba(255,255,255,0)');
  gctx.fillStyle = gg;
  gctx.fillRect(0, 0, 24 * R, R);
  const extra = {
    glow: pics.push(whole(radial(32 * R, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]))) - 1,
    blob: pics.push(whole(radial(32 * R, [[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]))) - 1,
    white: pics.push(whole(white)) - 1,
    rain: pics.push(whole(rain)) - 1,
    flake: pics.push(whole(radial(4 * R, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]))) - 1,
    ring: pics.push(whole(ring)) - 1,
    leaf0: pics.push(whole(leaf('#e0902a', '#7a4a1a'))) - 1,
    leaf1: pics.push(whole(leaf('#9ccf4a', '#4a7a1a'))) - 1,
    gust: pics.push(whole(gust)) - 1,
    rainbow: pics.push(whole(rainbowCanvas())) - 1,
  };

  const all = atlas.addMany(pics);
  const objects: Record<string, ObjectSprites> = {};
  for (const [kind, o] of Object.entries(art.objects)) {
    const at = objectAt[kind]!;
    objects[kind] = {
      frames: all.slice(at.start, at.start + at.n),
      ox: o.ox,
      oy: o.oy,
      animated: !!o.animated,
      panes: o.frames.map((_, i) => at.panes[i] ?? []),
      windows: o.frames.map((_, i) => {
        const w = at.windows[i];
        return w === undefined || w === null ? null : all[w]!;
      }),
    };
  }
  const crops: Record<string, Sprite[]> = {};
  for (const [crop, [s, n]] of Object.entries(cropAt)) crops[crop] = all.slice(s, s + n);
  const fx: Record<string, Sprite[]> = {};
  for (const [name, [s, n]] of Object.entries(fxAt)) fx[name] = all.slice(s, s + n);
  const icons: Record<string, Sprite> = {};
  for (const [id, i] of Object.entries(iconAt)) icons[id] = all[i]!;

  sprites = {
    terrain: all.slice(0, terrainPics.length),
    objects,
    crops,
    fx,
    icons,
    glow: all[extra.glow]!,
    blob: all[extra.blob]!,
    white: all[extra.white]!,
    rain: all[extra.rain]!,
    flake: all[extra.flake]!,
    ring: all[extra.ring]!,
    leaf: [all[extra.leaf0]!, all[extra.leaf1]!],
    gust: all[extra.gust]!,
    rainbow: all[extra.rainbow]!,
  };
  atlas.flush();
  return sprites;
}

const characters = new Map<string, Sprite[]>();
/** The 9 frames (down, up, right × stand, step, step) of a look, packed on first use. */
export function characterSprites(appearance: Appearance, outfit: Outfit): Sprite[] {
  const look = lookOf(appearance, outfit);
  const key = lookKey(look);
  let s = characters.get(key);
  if (!s) {
    s = atlas.addFrames(drawCharacterSheet(look), CHAR_W * R, CHAR_H * R, 9);
    characters.set(key, s);
    atlas.flush();
  }
  return s;
}

const animals = new Map<string, Sprite[]>();
/** The 2 walk frames of an animal (or vehicle), facing right. */
export function animalSprites(species: string, baby: boolean, jul: boolean, variant: number): Sprite[] {
  const key = `${species}-${baby}-${jul}-${variant}`;
  let s = animals.get(key);
  if (!s) {
    const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
    const sheet = HD ? upscale(animalSheet(species, baby, jul, variant)).canvas : animalSheet(species, baby, jul, variant);
    s = atlas.addFrames(sheet, size.w * R, size.h * R, 2);
    animals.set(key, s);
    atlas.flush();
  }
  return s;
}

const paintings = new Map<string, Sprite>();
/** A player's drawing in its frame. */
export function paintingSprite(pixels: string): Sprite {
  let s = paintings.get(pixels);
  if (!s) {
    const px = paintingPx(pixels);
    s = atlas.add(whole(HD ? upscale(px).canvas : px.canvas));
    paintings.set(pixels, s);
    atlas.flush();
  }
  return s;
}
