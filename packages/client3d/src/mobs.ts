// Characters (Minecraft-proportioned, with a generated 64×64 skin in the standard skin layout),
// animals, monsters and vehicles as jointed box rigs.
import * as THREE from 'three';
import { ITEMS, type Appearance, type Outfit } from '@lilla-garden/shared';
import { atlas } from './blocks.ts';
import { FACE_SHADE, FACES, GeoBuilder, rgb, type RGB, type V3 } from './builder.ts';
import { cloneMaterial, makeMaterial } from './material.ts';
import { pixelTexture } from './sprites.ts';

/** Pixels per block for models. */
const PX = 1 / 16;

// ---------------------------------------------------------------------------- skins

interface Look {
  skin: string;
  hair: string;
  hairStyle: string;
  shirt: { style: string; color: string };
  pants: { style: string; color: string };
  shoes: { style: string; color: string };
  hat?: { style: string; color: string };
}

export function lookOf(appearance: Appearance, outfit: Outfit): Look {
  const cl = (id: string | undefined, fallback: { style: string; color: string }) => {
    const d = id ? ITEMS[id] : undefined;
    return d?.clothing ? { style: d.clothing.style, color: d.clothing.color } : fallback;
  };
  const hat = outfit.hat ? ITEMS[outfit.hat]?.clothing : undefined;
  return {
    skin: appearance.skin,
    hair: appearance.hair,
    hairStyle: appearance.hairStyle,
    shirt: cl(outfit.shirt, { style: 'plain', color: '#3b6fd9' }),
    pants: cl(outfit.pants, { style: 'plain', color: '#2f4c8a' }),
    shoes: cl(outfit.shoes, { style: 'boots', color: '#3a3a3a' }),
    hat: hat ? { style: hat.style, color: hat.color } : undefined,
  };
}

export const lookKey = (l: Look): string => JSON.stringify(l);

const shadeHex = (hex: string, f: number): string => {
  const [r, g, b] = rgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f * 255)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};

const isDress = (s: string) => s === 'dress' || s === 'dress_belt' || s === 'dress_flowers' || s === 'gown';

interface BoxUV {
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
}
const SKIN = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  rArm: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  lArm: { u: 32, v: 48, w: 4, h: 12, d: 4 },
  rLeg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  lLeg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
} satisfies Record<string, BoxUV>;

type FaceKey = 'top' | 'bottom' | 'west' | 'south' | 'east' | 'north';
/** Rectangle of each face of a box in the skin layout (canvas pixels, y down). */
const region = (b: BoxUV, f: FaceKey): [number, number, number, number] => {
  const { u, v, w, h, d } = b;
  switch (f) {
    case 'top':
      return [u + d, v, w, d];
    case 'bottom':
      return [u + d + w, v, w, d];
    case 'west':
      return [u, v + d, d, h];
    case 'south':
      return [u + d, v + d, w, h];
    case 'east':
      return [u + d + w, v + d, d, h];
    case 'north':
      return [u + 2 * d + w, v + d, w, h];
  }
};

/** Paints a 64×64 skin from a look. */
export function paintSkin(l: Look): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const px = (x: number, y: number, col: string, jitter = 0.06) => {
    ctx.fillStyle = jitter ? shadeHex(col, 1 - jitter + rnd() * jitter * 2) : col;
    ctx.fillRect(x, y, 1, 1);
  };
  /** Paints every face of a box with `fn(face, x, y, w, h)` → colour (or null to leave transparent). */
  const paint = (b: BoxUV, fn: (f: FaceKey, x: number, y: number, w: number, h: number) => string | null) => {
    for (const f of ['top', 'bottom', 'west', 'south', 'east', 'north'] as FaceKey[]) {
      const [rx, ry, rw, rh] = region(b, f);
      for (let y = 0; y < rh; y++)
        for (let x = 0; x < rw; x++) {
          const col = fn(f, x, y, rw, rh);
          if (col) px(rx + x, ry + y, col);
        }
    }
  };
  const bald = l.hairStyle === 'bald';
  const long = l.hairStyle === 'long' || l.hairStyle === 'ponytail';
  const curly = l.hairStyle === 'curly';
  const ghost = l.shirt.style === 'ghost';
  const skin = ghost ? '#f0f0f0' : l.skin;
  // ---- head
  paint(SKIN.head, (f, x, y) => {
    const hair = curly && rnd() < 0.3 ? shadeHex(l.hair, 0.8) : l.hair;
    if (f === 'top') return bald ? skin : hair;
    if (f === 'bottom') return skin;
    if (f === 'north') return bald ? skin : y < (long ? 8 : 6) ? hair : skin;
    if (f === 'west' || f === 'east') {
      if (bald) return skin;
      const toFront = f === 'west' ? x : 7 - x; // 0 = back
      if (y < 2) return hair;
      if (long && y < 8 && toFront < 6) return hair;
      if (y < 4 && toFront < 4) return hair;
      return skin;
    }
    // face (south)
    if (!bald && (y < 2 || (curly && y < 3 && (x === 0 || x === 7)) || (long && (x === 0 || x === 7) && y < 6))) return hair;
    if (y === 4 && (x === 1 || x === 6)) return '#ffffff';
    if (y === 4 && (x === 2 || x === 5)) return ghost ? '#202020' : '#3a4fb0';
    if (y === 5 && (x === 3 || x === 4)) return shadeHex(skin, 0.85);
    if (y === 6 && x >= 2 && x <= 5) return ghost ? '#202020' : shadeHex(skin, 0.7);
    return skin;
  });
  // ---- body
  const shirt = l.shirt.color;
  const dress = isDress(l.shirt.style);
  paint(SKIN.body, (f, x, y, w) => {
    if (ghost) return '#f0f0f0';
    if (f === 'top' || f === 'bottom') return shirt;
    if (l.shirt.style === 'stripes' && y % 3 === 0) return '#f4f2ec';
    if (l.shirt.style === 'overalls') {
      if (y >= 6 || ((x === 1 || x === w - 2) && f !== 'west' && f !== 'east')) return shirt;
      return '#f4f2ec';
    }
    if (l.shirt.style === 'xmas' && y % 4 === 1) return x % 2 ? '#d9453b' : '#ffffff';
    if (l.shirt.style === 'star' && f === 'south' && ((y === 4 && x >= 2 && x <= 5) || (x >= 3 && x <= 4 && y >= 2 && y <= 7))) return '#f5e04a';
    if ((l.shirt.style === 'dress_belt' || l.shirt.style === 'gown') && y === 8) return '#ffffff';
    if (l.shirt.style === 'dress_flowers' && (x + y * 3) % 7 === 0) return y % 2 ? '#ffffff' : '#f5e04a';
    if (y === 11 && !dress) return shadeHex(l.pants.color, 0.8); // belt
    return shirt;
  });
  // ---- arms: sleeves then skin
  for (const arm of [SKIN.rArm, SKIN.lArm])
    paint(arm, (f, _x, y) => {
      if (ghost) return '#f0f0f0';
      if (f === 'top') return shirt;
      if (f === 'bottom') return skin;
      return y < (dress ? 3 : 5) ? shirt : skin;
    });
  // ---- legs: trousers (or dress), shoes at the bottom
  const boots = l.shoes.style === 'boots';
  for (const leg of [SKIN.rLeg, SKIN.lLeg])
    paint(leg, (f, _x, y) => {
      if (ghost) return '#f0f0f0';
      if (f === 'bottom') return l.shoes.color;
      if (f === 'top') return dress ? shirt : l.pants.color;
      if (y >= (boots ? 8 : 10)) return l.shoes.color;
      if (dress && y < (l.shirt.style === 'gown' ? 12 : 6)) return shirt;
      if (l.pants.style === 'skirt' && y < 5) return l.pants.color;
      if (dress || l.pants.style === 'skirt') return skin;
      return l.pants.color;
    });
  return c;
}

/** A box in a skin texture: pixel-unit bounds, MC layout UVs, faces shaded like blocks. */
function skinBox(g: GeoBuilder, min: V3, max: V3, b: BoxUV, texW = 64, texH = 64): void {
  const L = g.boxLight;
  for (const f of FACES) {
    const key: FaceKey = f.name === 'top' ? 'top' : f.name === 'bottom' ? 'bottom' : (f.name as FaceKey);
    const [rx, ry, rw, rh] = region(b, key);
    const u0 = rx / texW;
    const u1 = (rx + rw) / texW;
    const v0 = 1 - (ry + rh) / texH;
    const v1 = 1 - ry / texH;
    const shade = FACE_SHADE[f.name];
    const col: RGB = [shade, shade, shade];
    const pts: V3[] = f.corners.map((c) => [(c[0] ? max[0] : min[0]) * PX, (c[1] ? max[1] : min[1]) * PX, (c[2] ? max[2] : min[2]) * PX]);
    const uv: [number, number][] = f.uv.map(([s, t]) => [u0 + (u1 - u0) * s!, v0 + (v1 - v0) * t!]);
    g.quad(pts, uv, [col, col, col, col], [L, L, L, L]);
  }
}

// ---------------------------------------------------------------------------- rigs

export type Swing = 'legA' | 'legB' | 'armA' | 'armB' | 'head' | 'wingA' | 'wingB' | 'tail' | 'none';

export interface PartSpec {
  name: string;
  pivot: V3;
  swing?: Swing;
  /** Boxes relative to the pivot, in pixels, textured from the block atlas. */
  boxes: { min: V3; max: V3; tex: string; color?: string }[];
}

export interface Rig {
  root: THREE.Group;
  /** The model is turned and bobbed inside root. */
  body: THREE.Group;
  parts: Map<string, THREE.Object3D>;
  swings: [THREE.Object3D, Swing][];
  materials: THREE.ShaderMaterial[];
  /** Total height in blocks (for labels). */
  height: number;
  /** Right hand (players): where held items go. */
  hand?: THREE.Object3D;
  /** Seat height for riders (blocks). */
  seat?: number;
}

function newRig(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, parts: new Map(), swings: [], materials: [], height: 1 };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
let atlasMatProto: THREE.ShaderMaterial | null = null;
/** A per-actor material over the block atlas (each actor has its own light). */
function atlasMaterial(): THREE.ShaderMaterial {
  if (!atlasMatProto) atlasMatProto = makeMaterial(atlas().texture, { actor: true });
  return cloneMaterial(atlasMatProto);
}

function buildParts(rig: Rig, key: string, parts: PartSpec[], mat: THREE.ShaderMaterial): void {
  for (const p of parts) {
    const gkey = `${key}:${p.name}`;
    let geo = geoCache.get(gkey);
    if (!geo) {
      const g = new GeoBuilder();
      for (const b of p.boxes) g.box(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], b.tex, b.color ? rgb(b.color) : [1, 1, 1]);
      geo = g.build();
      geoCache.set(gkey, geo);
    }
    const pivot = new THREE.Group();
    pivot.position.set(p.pivot[0] * PX, p.pivot[1] * PX, p.pivot[2] * PX);
    pivot.add(new THREE.Mesh(geo, mat));
    rig.body.add(pivot);
    rig.parts.set(p.name, pivot);
    if (p.swing && p.swing !== 'none') rig.swings.push([pivot, p.swing]);
  }
}

// ---------------------------------------------------------------------------- players

const HAT_BOXES = (style: string, color: string): PartSpec['boxes'] => {
  const c = color;
  const w = 'white';
  switch (style) {
    case 'cap':
      return [
        { min: [-4.5, 5.5, -4.5], max: [4.5, 8.6, 4.5], tex: w, color: c },
        { min: [-4, 5.5, 4.5], max: [4, 6.2, 8], tex: w, color: c },
      ];
    case 'beanie':
      return [
        { min: [-4.5, 4.5, -4.5], max: [4.5, 9, 4.5], tex: w, color: c },
        { min: [-1, 9, -1], max: [1, 10.5, 1], tex: w, color: '#ffffff' },
      ];
    case 'straw':
      return [
        { min: [-7, 5.5, -7], max: [7, 6.3, 7], tex: 'hay_top' },
        { min: [-4.5, 6, -4.5], max: [4.5, 9.5, 4.5], tex: 'hay_side' },
      ];
    case 'cowboy':
      return [
        { min: [-7, 6, -7], max: [7, 6.8, 7], tex: w, color: c },
        { min: [-4, 6.5, -4], max: [4, 11, 4], tex: w, color: c },
      ];
    case 'witch':
      return [
        { min: [-7, 6, -7], max: [7, 6.6, 7], tex: w, color: c },
        { min: [-4, 6.5, -4], max: [4, 10, 4], tex: w, color: c },
        { min: [-3, 10, -2.5], max: [3, 13, 3], tex: w, color: c },
        { min: [-2, 13, -1], max: [1.5, 16, 2], tex: w, color: c },
        { min: [-1, 16, 0], max: [0.5, 18, 1.5], tex: w, color: c },
      ];
    case 'santa':
      return [
        { min: [-4.7, 5, -4.7], max: [4.7, 6.5, 4.7], tex: w, color: '#ffffff' },
        { min: [-4.4, 6.5, -4.4], max: [4.4, 9, 4.4], tex: w, color: c },
        { min: [-3, 9, -3], max: [2, 11, 2], tex: w, color: c },
        { min: [0, 10.5, 0], max: [2.5, 13, 2.5], tex: w, color: '#ffffff' },
      ];
    case 'party':
      return [
        { min: [-3, 8, -3], max: [3, 11, 3], tex: w, color: c },
        { min: [-2, 11, -2], max: [2, 14, 2], tex: w, color: '#f5e04a' },
        { min: [-1, 14, -1], max: [1, 16, 1], tex: w, color: c },
      ];
    case 'crown':
      return [
        { min: [-4.5, 7.5, -4.5], max: [4.5, 9.5, 4.5], tex: 'gold_block' },
        { min: [-4.5, 9.5, -4.5], max: [-2.5, 11, -2.5], tex: 'gold_block' },
        { min: [2.5, 9.5, -4.5], max: [4.5, 11, -2.5], tex: 'gold_block' },
        { min: [-4.5, 9.5, 2.5], max: [-2.5, 11, 4.5], tex: 'gold_block' },
        { min: [2.5, 9.5, 2.5], max: [4.5, 11, 4.5], tex: 'gold_block' },
      ];
    case 'wreath':
      return [
        { min: [-4.7, 7, -4.7], max: [4.7, 8.5, 4.7], tex: 'leaves_oak' },
        { min: [-2, 8, 4.2], max: [-0.5, 9.5, 5], tex: w, color: '#f5e04a' },
        { min: [1.5, 8, 4.2], max: [3, 9.5, 5], tex: w, color: '#e87ab8' },
      ];
    case 'bunny':
      return [
        { min: [-4.5, 7, -4.5], max: [4.5, 8, 4.5], tex: w, color: c },
        { min: [-3, 8, -0.5], max: [-1, 15, 0.5], tex: w, color: c },
        { min: [1, 8, -0.5], max: [3, 15, 0.5], tex: w, color: c },
        { min: [-2.6, 9, 0.5], max: [-1.4, 14, 0.7], tex: w, color: '#f0a8c8' },
        { min: [1.4, 9, 0.5], max: [2.6, 14, 0.7], tex: w, color: '#f0a8c8' },
      ];
    case 'viking':
      return [
        { min: [-4.6, 5, -4.6], max: [4.6, 9, 4.6], tex: w, color: c },
        { min: [-7, 6.5, -1], max: [-4.6, 8, 1], tex: w, color: '#f4f2ec' },
        { min: [-7.5, 8, -1], max: [-6, 10.5, 1], tex: w, color: '#f4f2ec' },
        { min: [4.6, 6.5, -1], max: [7, 8, 1], tex: w, color: '#f4f2ec' },
        { min: [6, 8, -1], max: [7.5, 10.5, 1], tex: w, color: '#f4f2ec' },
      ];
  }
  return [{ min: [-4.5, 6, -4.5], max: [4.5, 9, 4.5], tex: w, color: c }];
};

const skinTextures = new Map<string, THREE.Texture>();

/** A Minecraft-style character (player, villager). Faces +z. */
export function humanoid(appearance: Appearance, outfit: Outfit, scale = 0.9): Rig {
  const look = lookOf(appearance, outfit);
  const key = lookKey(look);
  let tex = skinTextures.get(key);
  if (!tex) {
    tex = pixelTexture(paintSkin(look));
    skinTextures.set(key, tex);
  }
  const rig = newRig();
  const mat = makeMaterial(tex, { actor: true });
  rig.materials.push(mat);
  const part = (name: string, pivot: V3, min: V3, max: V3, b: BoxUV, swing?: Swing) => {
    const gkey = `skin:${name}`;
    let geo = geoCache.get(gkey);
    if (!geo) {
      const g = new GeoBuilder();
      skinBox(g, min, max, b);
      geo = g.build();
      geoCache.set(gkey, geo);
    }
    const p = new THREE.Group();
    p.position.set(pivot[0] * PX, pivot[1] * PX, pivot[2] * PX);
    p.add(new THREE.Mesh(geo, mat));
    rig.body.add(p);
    rig.parts.set(name, p);
    if (swing) rig.swings.push([p, swing]);
    return p;
  };
  part('rLeg', [-2, 12, 0], [-2, -12, -2], [2, 0, 2], SKIN.rLeg, 'legA');
  part('lLeg', [2, 12, 0], [-2, -12, -2], [2, 0, 2], SKIN.lLeg, 'legB');
  part('body', [0, 12, 0], [-4, 0, -2], [4, 12, 2], SKIN.body);
  const rArm = part('rArm', [-6, 22, 0], [-2, -10, -2], [2, 2, 2], SKIN.rArm, 'armA');
  part('lArm', [6, 22, 0], [-2, -10, -2], [2, 2, 2], SKIN.lArm, 'armB');
  const head = part('head', [0, 24, 0], [-4, 0, -4], [4, 8, 4], SKIN.head, 'head');
  // extras in block textures: hat, ponytail, skirts
  const extras: PartSpec['boxes'] = [];
  if (look.hat) extras.push(...HAT_BOXES(look.hat.style, look.hat.color));
  if (look.hairStyle === 'ponytail') extras.push({ min: [-1, 3, -6], max: [1, 7, -4], tex: 'white', color: look.hair });
  if (extras.length) {
    const g = new GeoBuilder();
    for (const b of extras) g.box(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], b.tex, b.color ? rgb(b.color) : [1, 1, 1]);
    const m = atlasMaterial();
    rig.materials.push(m);
    head.add(new THREE.Mesh(g.build(), m));
  }
  const skirt = isDress(look.shirt.style) ? look.shirt : look.pants.style === 'skirt' ? look.pants : null;
  if (skirt) {
    const g = new GeoBuilder();
    const gown = look.shirt.style === 'gown';
    const y0 = gown ? -12 : isDress(look.shirt.style) ? -6 : -4;
    g.box(-5, y0, -3, 5, 1, 3, 'white', rgb(skirt.color));
    const m = atlasMaterial();
    rig.materials.push(m);
    rig.parts.get('body')!.add(new THREE.Mesh(g.build(), m));
  }
  const hand = new THREE.Group();
  hand.position.set(0, -9 * PX, 1 * PX);
  rArm.add(hand);
  rig.hand = hand;
  rig.body.scale.setScalar(scale);
  rig.height = 2 * scale;
  return rig;
}

// ---------------------------------------------------------------------------- animals

const box = (min: V3, max: V3, tex: string, color?: string) => ({ min, max, tex, color });
const W = 'white';

/** A four-legged animal: body length along z, head at +z. Sizes in pixels. */
function quadruped(o: {
  body: [number, number, number];
  legH: number;
  legW?: number;
  head: [number, number, number];
  bodyTex?: string;
  color: string;
  headColor?: string;
  legColor?: string;
  snout?: { size: [number, number, number]; color: string };
  ears?: { size: [number, number, number]; color?: string };
  horns?: { color: string; big?: boolean };
  tail?: { size: [number, number, number]; color?: string };
  mane?: string;
  neckUp?: number;
  eyes?: string;
}): PartSpec[] {
  const [bw, bh, bl] = o.body;
  const lw = o.legW ?? Math.max(2, Math.round(bw / 3));
  const legC = o.legColor ?? o.color;
  const by = o.legH; // body bottom
  const parts: PartSpec[] = [];
  const lx = bw / 2 - lw / 2;
  const lz = bl / 2 - lw / 2 - 1;
  const leg = (name: string, x: number, z: number, swing: Swing) =>
    parts.push({ name, pivot: [x, by, z], swing, boxes: [box([-lw / 2, -o.legH, -lw / 2], [lw / 2, 0, lw / 2], W, legC)] });
  leg('fl', -lx, lz, 'legA');
  leg('fr', lx, lz, 'legB');
  leg('bl', -lx, -lz, 'legB');
  leg('br', lx, -lz, 'legA');
  parts.push({ name: 'body', pivot: [0, by, 0], boxes: [box([-bw / 2, 0, -bl / 2], [bw / 2, bh, bl / 2], o.bodyTex ?? W, o.bodyTex ? undefined : o.color)] });
  const [hw, hh, hl] = o.head;
  const hy = by + bh - 2 + (o.neckUp ?? 0);
  const hz = bl / 2 - 1;
  const head: PartSpec['boxes'] = [box([-hw / 2, 0, 0], [hw / 2, hh, hl], W, o.headColor ?? o.color)];
  const eye = o.eyes ?? '#1a1a1a';
  head.push(box([-hw / 2 + 0.5, hh - 3, hl], [-hw / 2 + 1.5, hh - 2, hl + 0.2], W, eye));
  head.push(box([hw / 2 - 1.5, hh - 3, hl], [hw / 2 - 0.5, hh - 2, hl + 0.2], W, eye));
  if (o.snout) {
    const [sw, sh, sl] = o.snout.size;
    head.push(box([-sw / 2, 0.5, hl], [sw / 2, 0.5 + sh, hl + sl], W, o.snout.color));
  }
  if (o.ears) {
    const [ew, eh, el] = o.ears.size;
    head.push(box([-hw / 2, hh, hl / 2 - el / 2], [-hw / 2 + ew, hh + eh, hl / 2 + el / 2], W, o.ears.color ?? o.headColor ?? o.color));
    head.push(box([hw / 2 - ew, hh, hl / 2 - el / 2], [hw / 2, hh + eh, hl / 2 + el / 2], W, o.ears.color ?? o.headColor ?? o.color));
  }
  if (o.horns) {
    const big = o.horns.big;
    head.push(box([-hw / 2 - (big ? 3 : 1), hh - 1, 1], [-hw / 2, hh + (big ? 1 : 0), 2], W, o.horns.color));
    head.push(box([hw / 2, hh - 1, 1], [hw / 2 + (big ? 3 : 1), hh + (big ? 1 : 0), 2], W, o.horns.color));
    if (big) {
      head.push(box([-hw / 2 - 4, hh, -1], [-hw / 2 - 2, hh + 6, 3], W, o.horns.color));
      head.push(box([hw / 2 + 2, hh, -1], [hw / 2 + 4, hh + 6, 3], W, o.horns.color));
    }
  }
  if (o.mane) head.push(box([-1, hh, -4], [1, hh + 1.5, hl - 2], W, o.mane));
  parts.push({ name: 'head', pivot: [0, hy, hz], swing: 'head', boxes: head });
  if (o.tail) {
    const [tw, th, tl] = o.tail.size;
    parts.push({ name: 'tail', pivot: [0, by + bh - 1, -bl / 2], swing: 'tail', boxes: [box([-tw / 2, -th + 1, -tl], [tw / 2, 1, 0], W, o.tail.color ?? o.color)] });
  }
  return parts;
}

function animalParts(species: string, variant: number): PartSpec[] {
  switch (species) {
    case 'hen':
      return [
        { name: 'legL', pivot: [-1.5, 5, 0], swing: 'legA', boxes: [box([-0.5, -5, -0.5], [0.5, 0, 0.5], W, '#e8a530'), box([-1.5, -5, -0.5], [1.5, -4.5, 2], W, '#e8a530')] },
        { name: 'legR', pivot: [1.5, 5, 0], swing: 'legB', boxes: [box([-0.5, -5, -0.5], [0.5, 0, 0.5], W, '#e8a530'), box([-1.5, -5, -0.5], [1.5, -4.5, 2], W, '#e8a530')] },
        { name: 'body', pivot: [0, 5, 0], boxes: [box([-3, 0, -4], [3, 6, 4], 'white_wool')] },
        { name: 'wingL', pivot: [-3, 10, 0], swing: 'wingA', boxes: [box([-1, -4, -3], [0, 0, 3], 'white_wool')] },
        { name: 'wingR', pivot: [3, 10, 0], swing: 'wingB', boxes: [box([0, -4, -3], [1, 0, 3], 'white_wool')] },
        {
          name: 'head',
          pivot: [0, 9, 3],
          swing: 'head',
          boxes: [
            box([-2, 0, -1], [2, 6, 2], 'white_wool'),
            box([-2, 2, 2], [2, 4, 4], W, '#e8a530'),
            box([-1, 0, 2], [1, 2, 3], W, '#d8363a'),
            box([-1, 6, -1], [1, 7.5, 2], W, '#d8363a'),
            box([-2.1, 4, 1], [-1.9, 5, 2], W, '#111'),
            box([1.9, 4, 1], [2.1, 5, 2], W, '#111'),
          ],
        },
      ];
    case 'cow':
      return quadruped({ body: [12, 10, 18], legH: 12, legW: 4, head: [8, 8, 6], bodyTex: 'cow_hide', color: '#4a3220', headColor: '#4a3220', snout: { size: [6, 3, 1], color: '#c9a090' }, horns: { color: '#e8e0c8' }, tail: { size: [1, 8, 1] } });
    case 'sheep':
      return quadruped({ body: [10, 9, 14], legH: 10, legW: 4, head: [6, 6, 6], bodyTex: 'white_wool', color: '#e9ecec', headColor: '#c8b8a8', legColor: '#c8b8a8', ears: { size: [1, 1, 2] } });
    case 'pig':
      return quadruped({ body: [10, 8, 15], legH: 6, legW: 4, head: [8, 8, 7], color: '#f0a0a0', snout: { size: [4, 3, 1], color: '#e07a80' }, ears: { size: [2, 2, 1] } });
    case 'boar':
      return quadruped({ body: [10, 8, 15], legH: 6, legW: 4, head: [8, 7, 7], color: '#6a4a30', snout: { size: [4, 3, 1], color: '#4a3020' }, horns: { color: '#f4f2ec' }, mane: '#3a2a1a' });
    case 'horse':
      return [
        ...quadruped({ body: [10, 10, 22], legH: 13, legW: 4, head: [5, 6, 10], color: ['#8a5a2a', '#f4f2ec', '#3a2a1a'][variant % 3]!, mane: '#2a1a10', neckUp: 8, tail: { size: [2, 12, 2], color: '#2a1a10' } }),
        { name: 'neck', pivot: [0, 21, 9], boxes: [box([-2.5, 0, -2], [2.5, 10, 3], W, ['#8a5a2a', '#f4f2ec', '#3a2a1a'][variant % 3]!)] },
      ];
    case 'deer':
      return quadruped({ body: [8, 8, 16], legH: 12, legW: 2, head: [5, 6, 7], color: '#a86a3a', neckUp: 5, horns: { color: '#d8c8a8', big: true }, tail: { size: [2, 3, 1], color: '#f4f2ec' } });
    case 'moose':
      return quadruped({ body: [12, 12, 22], legH: 16, legW: 3, head: [6, 8, 10], color: '#5a3a22', neckUp: 4, horns: { color: '#d8c8a8', big: true } });
    case 'goat':
      return quadruped({ body: [8, 8, 13], legH: 9, legW: 3, head: [5, 6, 6], color: '#e8e2d8', horns: { color: '#8a8070' }, tail: { size: [1, 3, 1] } });
    case 'bear':
      return quadruped({ body: [14, 14, 22], legH: 10, legW: 5, head: [9, 8, 7], color: '#5a3a22', snout: { size: [5, 3, 3], color: '#8a6a4a' }, ears: { size: [2, 2, 1] } });
    case 'dog':
      return quadruped({ body: [6, 6, 11], legH: 7, legW: 2, head: [6, 6, 5], color: ['#c8a060', '#3a2a1a', '#f4f2ec'][variant % 3]!, snout: { size: [3, 3, 3], color: '#8a6a4a' }, ears: { size: [2, 2, 1] }, tail: { size: [2, 7, 2] } });
    case 'wolf':
      return quadruped({ body: [6, 7, 12], legH: 8, legW: 2, head: [6, 6, 5], color: '#9a9a9a', snout: { size: [3, 3, 3], color: '#707070' }, ears: { size: [2, 2, 1] }, tail: { size: [2, 7, 2] }, eyes: '#e8c020' });
    case 'fox':
      return quadruped({ body: [6, 6, 11], legH: 6, legW: 2, head: [6, 5, 5], color: '#e07020', legColor: '#2a1a10', snout: { size: [2, 2, 3], color: '#f4f2ec' }, ears: { size: [2, 2, 1] }, tail: { size: [3, 3, 8], color: '#e07020' } });
    case 'lynx':
      return quadruped({ body: [7, 7, 12], legH: 7, legW: 2, head: [6, 6, 5], color: '#c8a070', snout: { size: [3, 2, 1], color: '#f4f2ec' }, ears: { size: [1, 3, 1], color: '#2a1a10' }, tail: { size: [2, 2, 3] } });
    case 'cat':
      return quadruped({ body: [5, 5, 10], legH: 5, legW: 2, head: [5, 5, 4], color: ['#e8a040', '#3a3a3a', '#f4f2ec'][variant % 3]!, ears: { size: [1, 2, 1] }, tail: { size: [1, 8, 1] }, eyes: '#5ac85a' });
    case 'rabbit':
    case 'hare':
      return quadruped({ body: [5, 5, 7], legH: 2, legW: 2, head: [4, 4, 4], color: species === 'hare' ? '#a88a6a' : '#e8e0d8', ears: { size: [1, 5, 2] }, tail: { size: [2, 2, 2], color: '#ffffff' } });
    case 'penguin':
      return [
        { name: 'legL', pivot: [-1.5, 1, 0], swing: 'legA', boxes: [box([-1, -1, -1], [1, 0, 2], W, '#e8a530')] },
        { name: 'legR', pivot: [1.5, 1, 0], swing: 'legB', boxes: [box([-1, -1, -1], [1, 0, 2], W, '#e8a530')] },
        { name: 'body', pivot: [0, 1, 0], boxes: [box([-3, 0, -2.5], [3, 9, 2.5], W, '#1a1a22'), box([-2, 1, 2.5], [2, 8, 2.7], W, '#f4f2ec')] },
        { name: 'wingL', pivot: [-3, 9, 0], swing: 'wingA', boxes: [box([-1, -6, -1.5], [0, 0, 1.5], W, '#1a1a22')] },
        { name: 'wingR', pivot: [3, 9, 0], swing: 'wingB', boxes: [box([0, -6, -1.5], [1, 0, 1.5], W, '#1a1a22')] },
        { name: 'head', pivot: [0, 10, 0], swing: 'head', boxes: [box([-2.5, 0, -2], [2.5, 4, 2.5], W, '#1a1a22'), box([-1, 1, 2.5], [1, 2, 4], W, '#e8a530'), box([-2, 2.5, 2.5], [-1, 3.5, 2.7], W, '#ffffff'), box([1, 2.5, 2.5], [2, 3.5, 2.7], W, '#ffffff')] },
      ];
    case 'crab':
      return [
        { name: 'body', pivot: [0, 2, 0], boxes: [box([-4, 0, -3], [4, 3, 3], W, '#d8432a'), box([-2, 3, 1], [-1, 5, 2], W, '#1a1a1a'), box([1, 3, 1], [2, 5, 2], W, '#1a1a1a')] },
        { name: 'clawL', pivot: [-4, 3, 2], swing: 'armA', boxes: [box([-3, -1, 0], [0, 2, 3], W, '#e8533a')] },
        { name: 'clawR', pivot: [4, 3, 2], swing: 'armB', boxes: [box([0, -1, 0], [3, 2, 3], W, '#e8533a')] },
        { name: 'legs', pivot: [0, 2, 0], swing: 'legA', boxes: [box([-6, -2, -2], [6, 0, -1], W, '#b8331a'), box([-6, -2, 0], [6, 0, 1], W, '#b8331a')] },
      ];
    case 'lizard':
      return [
        { name: 'legs', pivot: [0, 1.5, 0], swing: 'legA', boxes: [box([-4, -1.5, 2], [4, 0, 3], W, '#3a8a3a'), box([-4, -1.5, -3], [4, 0, -2], W, '#3a8a3a')] },
        { name: 'body', pivot: [0, 1.5, 0], boxes: [box([-2, 0, -5], [2, 2, 5], W, '#4aaa4a')] },
        { name: 'head', pivot: [0, 1.5, 5], swing: 'head', boxes: [box([-1.5, 0, 0], [1.5, 2, 3], W, '#4aaa4a'), box([-1.6, 1, 1], [-1.4, 1.6, 1.6], W, '#111'), box([1.4, 1, 1], [1.6, 1.6, 1.6], W, '#111')] },
        { name: 'tail', pivot: [0, 1.5, -5], swing: 'tail', boxes: [box([-1, 0, -6], [1, 1.5, 0], W, '#3a8a3a')] },
      ];
    case 'slime':
      return [
        { name: 'body', pivot: [0, 0, 0], swing: 'none', boxes: [box([-6, 0, -6], [6, 12, 6], W, '#6ac850'), box([-4, 6, 6], [-2, 8, 6.3], W, '#1a3a1a'), box([2, 6, 6], [4, 8, 6.3], W, '#1a3a1a'), box([-1, 3, 6], [1, 4, 6.3], W, '#1a3a1a')] },
      ];
    case 'bat':
      return [
        { name: 'body', pivot: [0, 16, 0], boxes: [box([-2, -3, -2], [2, 3, 2], W, '#4a3a3a'), box([-2, 3, -1], [2, 6, 2], W, '#4a3a3a'), box([-2, 4, 2], [-1, 5, 2.2], W, '#ff4a4a'), box([1, 4, 2], [2, 5, 2.2], W, '#ff4a4a')] },
        { name: 'wingL', pivot: [-2, 18, 0], swing: 'wingA', boxes: [box([-8, -4, -0.5], [0, 1, 0.5], W, '#3a2a2a')] },
        { name: 'wingR', pivot: [2, 18, 0], swing: 'wingB', boxes: [box([0, -4, -0.5], [8, 1, 0.5], W, '#3a2a2a')] },
      ];
  }
  const wider = widerWorldParts(species, variant);
  if (wider) return wider;
  // unknown: a small generic animal
  return quadruped({ body: [6, 6, 10], legH: 5, head: [5, 5, 5], color: '#a08060' });
}

/** Two little eyes on the front (+z face at `z`) of a head. */
const eyes = (y: number, z: number, dx: number, colour = '#111', size = 1): PartSpec['boxes'] => [
  box([-dx - size / 2, y, z], [-dx + size / 2, y + size, z + 0.2], W, colour),
  box([dx - size / 2, y, z], [dx + size / 2, y + size, z + 0.2], W, colour),
];

/** The wider world's wild animals and the dragon. */
function widerWorldParts(species: string, variant: number): PartSpec[] | null {
  switch (species) {
    case 'frog': {
      const c = '#4caf50';
      const dark = '#2e7d32';
      return [
        { name: 'legL', pivot: [-3, 2, -1.5], swing: 'legA', boxes: [box([-2, -2, -2.5], [0.5, 1, 3], W, dark)] },
        { name: 'legR', pivot: [3, 2, -1.5], swing: 'legB', boxes: [box([-0.5, -2, -2.5], [2, 1, 3], W, dark)] },
        { name: 'armL', pivot: [-2.5, 1.5, 3], swing: 'legB', boxes: [box([-1, -1.5, -0.5], [0.5, 0.5, 1.5], W, dark)] },
        { name: 'armR', pivot: [2.5, 1.5, 3], swing: 'legA', boxes: [box([-0.5, -1.5, -0.5], [1, 0.5, 1.5], W, dark)] },
        { name: 'body', pivot: [0, 0, 0], boxes: [box([-3.5, 0.5, -3.5], [3.5, 5, 3], W, c), box([-3, 0.4, -3], [3, 1, 3.1], W, '#c8e6a0')] },
        {
          name: 'head',
          pivot: [0, 3, 2.5],
          swing: 'head',
          boxes: [
            box([-3.5, 0, -1], [3.5, 3, 3], W, c),
            box([-3.2, 3, 0], [-1, 5, 2.2], W, c),
            box([1, 3, 0], [3.2, 5, 2.2], W, c),
            ...eyes(3.6, 2.2, 2.1, '#111', 1.2),
            box([-2.5, 0.8, 3], [2.5, 1.2, 3.2], W, '#1b4d1e'),
          ],
        },
      ];
    }
    case 'parrot': {
      const [c, wing, beak] = [
        ['#e53935', '#1e88e5', '#3a3a3a'],
        ['#1e88e5', '#ffd54f', '#3a3a3a'],
        ['#43a047', '#e53935', '#f0c040'],
      ][variant % 3]!;
      return [
        { name: 'legL', pivot: [-1, 2, 0], swing: 'legA', boxes: [box([-0.5, -2, -0.5], [0.5, 0, 0.5], W, '#5a5a5a')] },
        { name: 'legR', pivot: [1, 2, 0], swing: 'legB', boxes: [box([-0.5, -2, -0.5], [0.5, 0, 0.5], W, '#5a5a5a')] },
        { name: 'body', pivot: [0, 2, 0], boxes: [box([-2, 0, -2], [2, 7, 2.5], W, c), box([-1, -4, -2.5], [1, 1, -1.5], W, wing)] },
        { name: 'wingL', pivot: [-2, 8, 0], swing: 'wingA', boxes: [box([-1, -6, -2], [0, 0, 2.5], W, wing)] },
        { name: 'wingR', pivot: [2, 8, 0], swing: 'wingB', boxes: [box([0, -6, -2], [1, 0, 2.5], W, wing)] },
        { name: 'head', pivot: [0, 9, 0.5], swing: 'head', boxes: [box([-2, 0, -1.5], [2, 4, 2.5], W, c), box([-0.8, 0.6, 2.5], [0.8, 3, 4], W, beak), ...eyes(2.3, 2.5, 1.3, '#111', 0.8)] },
      ];
    }
    case 'monkey': {
      // sits up on short legs, long arms, a pale face with ears on the sides, a tail curling up behind
      const c = '#7a5230';
      const face = '#e0b890';
      return [
        { name: 'legL', pivot: [-1.5, 4, 0], swing: 'legA', boxes: [box([-1, -4, -1], [1, 0, 1.5], W, c)] },
        { name: 'legR', pivot: [1.5, 4, 0], swing: 'legB', boxes: [box([-1, -4, -1], [1, 0, 1.5], W, c)] },
        { name: 'body', pivot: [0, 4, 0], boxes: [box([-2.5, 0, -1.8], [2.5, 7, 1.8], W, c), box([-1.8, 1, 1.8], [1.8, 5, 2], W, face)] },
        { name: 'armL', pivot: [-2.5, 10.5, 0], swing: 'armA', boxes: [box([-1.4, -8, -1], [0, 0, 1], W, c)] },
        { name: 'armR', pivot: [2.5, 10.5, 0], swing: 'armB', boxes: [box([0, -8, -1], [1.4, 0, 1], W, c)] },
        { name: 'tail', pivot: [0, 5, -1.8], swing: 'tail', boxes: [box([-0.6, -0.6, -6], [0.6, 0.6, 0], W, c), box([-0.6, 0, -6.6], [0.6, 5, -5.4], W, c), box([-0.6, 4.4, -6], [0.6, 5.6, -3.5], W, c)] },
        {
          name: 'head',
          pivot: [0, 11, 0],
          swing: 'head',
          boxes: [
            box([-2.8, 0, -2.4], [2.8, 5, 2.4], W, c),
            box([-2, 0.4, 2.4], [2, 3.6, 3], W, face),
            box([-4, 2, -0.6], [-2.8, 3.6, 0.6], W, face),
            box([2.8, 2, -0.6], [4, 3.6, 0.6], W, face),
            ...eyes(2.6, 3, 1, '#2a1a10', 0.8),
          ],
        },
      ];
    }
    case 'salamander':
      return [
        { name: 'legs', pivot: [0, 1.5, 0], swing: 'legA', boxes: [box([-4, -1.5, 2], [4, 0, 3], W, '#1f1f1f'), box([-4, -1.5, -3], [4, 0, -2], W, '#1f1f1f')] },
        { name: 'body', pivot: [0, 1.5, 0], boxes: [box([-2, 0, -5], [2, 2, 5], W, '#2a2a2a'), box([-1, 2, -3], [1, 2.2, -1], W, '#ff8a1a'), box([-1.5, 2, 1], [0.5, 2.2, 3], W, '#ffb02a')] },
        { name: 'head', pivot: [0, 1.5, 5], swing: 'head', boxes: [box([-1.5, 0, 0], [1.5, 2, 3], W, '#2a2a2a'), box([-1, 2, 0.5], [1, 2.2, 1.5], W, '#ff8a1a'), box([-1.6, 1, 1], [-1.4, 1.6, 1.6], W, '#ffd040'), box([1.4, 1, 1], [1.6, 1.6, 1.6], W, '#ffd040')] },
        { name: 'tail', pivot: [0, 1.5, -5], swing: 'tail', boxes: [box([-1, 0, -6], [1, 1.5, 0], W, '#2a2a2a'), box([-0.5, 0.2, -8], [0.5, 1.2, -6], W, '#ff8a1a')] },
      ];
    case 'hedgehog':
      return [
        { name: 'legs', pivot: [0, 1, 0], swing: 'legA', boxes: [box([-2.5, -1, 1.5], [2.5, 0, 2.5], W, '#5a4030'), box([-2.5, -1, -2.5], [2.5, 0, -1.5], W, '#5a4030')] },
        { name: 'body', pivot: [0, 1, 0], boxes: [box([-3, 0, -3.5], [3, 3.5, 3], W, '#8a6a4a'), box([-3.5, 1.5, -4], [3.5, 5, 2], W, '#4a3828'), box([-2.5, 5, -3], [2.5, 5.6, 1], W, '#6a5038')] },
        { name: 'head', pivot: [0, 1, 3], swing: 'head', boxes: [box([-2, 0, -0.5], [2, 3, 2.5], W, '#d8b890'), box([-0.8, 0.5, 2.5], [0.8, 1.6, 3.6], W, '#d8b890'), box([-0.5, 0.8, 3.6], [0.5, 1.5, 3.9], W, '#111'), ...eyes(1.9, 2.5, 1.1, '#111', 0.6)] },
      ];
    case 'dino': {
      const c = ['#5aa83a', '#e08a2a', '#8a5ac8'][variant % 3]!;
      const belly = ['#c8e0a0', '#f8d8a0', '#d8c8f0'][variant % 3]!;
      const leg = (x: number): PartSpec['boxes'] => [box([x - 1.5, -9, -2], [x + 1.5, 0, 2], W, c), box([x - 1.5, -9, 2], [x + 1.5, -8, 4], W, c)];
      return [
        { name: 'legL', pivot: [-2.5, 9, 0], swing: 'legA', boxes: leg(0) },
        { name: 'legR', pivot: [2.5, 9, 0], swing: 'legB', boxes: leg(0) },
        { name: 'body', pivot: [0, 9, 0], boxes: [box([-4, 0, -5], [4, 8, 5], W, c), box([-3, -0.1, 0], [3, 6, 5.2], W, belly)] },
        { name: 'tail', pivot: [0, 13, -5], swing: 'tail', boxes: [box([-2.5, -3, -7], [2.5, 2, 0], W, c), box([-1.5, -2, -13], [1.5, 1, -7], W, c)] },
        { name: 'armL', pivot: [-3, 13, 4], swing: 'armA', boxes: [box([-1, -3, 0], [0, 0, 1.5], W, c)] },
        { name: 'armR', pivot: [3, 13, 4], swing: 'armB', boxes: [box([0, -3, 0], [1, 0, 1.5], W, c)] },
        {
          name: 'head',
          pivot: [0, 16, 3],
          swing: 'head',
          boxes: [
            box([-3.5, 0, -2], [3.5, 6, 6], W, c),
            box([-3, -2, 1], [3, 0, 6], W, c),
            box([-2.8, -0.4, 5.6], [2.8, 0.3, 6.2], W, '#ffffff'),
            box([-3.6, 3.5, 2], [-3.4, 4.7, 3.4], W, '#111'),
            box([3.4, 3.5, 2], [3.6, 4.7, 3.4], W, '#111'),
          ],
        },
      ];
    }
    case 'gummy': {
      const c = ['#e53950', '#43c060', '#f8d040', '#f88a30'][variant % 4]!;
      const light = ['#ff8a9a', '#8ae8a0', '#fff0a0', '#ffc08a'][variant % 4]!;
      return [
        { name: 'legL', pivot: [-1.8, 3, 0], swing: 'legA', boxes: [box([-1.4, -3, -1.4], [1.4, 0, 1.4], W, c)] },
        { name: 'legR', pivot: [1.8, 3, 0], swing: 'legB', boxes: [box([-1.4, -3, -1.4], [1.4, 0, 1.4], W, c)] },
        { name: 'body', pivot: [0, 3, 0], boxes: [box([-3, 0, -2.2], [3, 6, 2.2], W, c), box([-2, 1, 2.2], [2, 4.5, 2.5], W, light)] },
        { name: 'armL', pivot: [-3, 8, 0], swing: 'armA', boxes: [box([-1.5, -3.5, -1.2], [0, 0, 1.2], W, c)] },
        { name: 'armR', pivot: [3, 8, 0], swing: 'armB', boxes: [box([0, -3.5, -1.2], [1.5, 0, 1.2], W, c)] },
        {
          name: 'head',
          pivot: [0, 9, 0],
          swing: 'head',
          boxes: [box([-2.8, 0, -2.2], [2.8, 4.5, 2.2], W, c), box([-2.8, 4, -0.8], [-1.4, 5.4, 0.8], W, c), box([1.4, 4, -0.8], [2.8, 5.4, 0.8], W, c), box([-1.2, 0.6, 2.2], [1.2, 2, 3], W, light), ...eyes(2.6, 2.2, 1.3, '#2a1a1a', 0.8)],
        },
      ];
    }
    case 'alien': {
      const c = '#7ad65a';
      return [
        { name: 'legL', pivot: [-1.3, 5, 0], swing: 'legA', boxes: [box([-1, -5, -1], [1, 0, 1], W, c)] },
        { name: 'legR', pivot: [1.3, 5, 0], swing: 'legB', boxes: [box([-1, -5, -1], [1, 0, 1], W, c)] },
        { name: 'body', pivot: [0, 5, 0], boxes: [box([-2.5, 0, -1.5], [2.5, 6, 1.5], W, '#c0c8d0'), box([-1, 2, 1.5], [1, 4, 1.7], W, '#e8ff70')] },
        { name: 'armL', pivot: [-2.5, 10.5, 0], swing: 'armA', boxes: [box([-1, -5, -0.8], [0, 0, 0.8], W, c)] },
        { name: 'armR', pivot: [2.5, 10.5, 0], swing: 'armB', boxes: [box([0, -5, -0.8], [1, 0, 0.8], W, c)] },
        {
          name: 'head',
          pivot: [0, 11, 0],
          swing: 'head',
          boxes: [
            box([-4, 0, -3.5], [4, 6.5, 3.5], W, c),
            box([-3.2, 2, 3.5], [-0.8, 4.4, 3.7], W, '#111'),
            box([0.8, 2, 3.5], [3.2, 4.4, 3.7], W, '#111'),
            box([-0.4, 6.5, -0.4], [0.4, 9.5, 0.4], W, '#3a8a2a'),
            box([-1, 9.5, -1], [1, 11.5, 1], W, '#e8ff70'),
          ],
        },
      ];
    }
    case 'dragon': {
      const c = '#7a3ab0';
      const wing = '#5a2a8a';
      const horn = '#f0e0b0';
      return [
        ...quadruped({ body: [6, 5, 9], legH: 4, legW: 2, head: [5, 4, 5], color: c }).filter((p) => p.name !== 'head' && p.name !== 'body'),
        { name: 'body', pivot: [0, 4, 0], boxes: [box([-3, 0, -5], [3, 5, 4], W, c), box([-2.5, -0.1, -4], [2.5, 0.5, 3], W, '#d8b8f0'), box([-0.5, 5, -4], [0.5, 6, 3], W, horn)] },
        { name: 'wingL', pivot: [-3, 8, 0], swing: 'wingA', boxes: [box([-11, -0.5, -4], [0, 0.5, 3], W, wing), box([-11, 0.5, -1], [-1, 1, 0], W, horn)] },
        { name: 'wingR', pivot: [3, 8, 0], swing: 'wingB', boxes: [box([0, -0.5, -4], [11, 0.5, 3], W, wing), box([1, 0.5, -1], [11, 1, 0], W, horn)] },
        {
          name: 'head',
          pivot: [0, 8, 4],
          swing: 'head',
          boxes: [
            box([-1.5, 0, -1], [1.5, 4, 2], W, c),
            box([-2.5, 4, -1], [2.5, 8, 4], W, c),
            box([-1.8, 4.5, 4], [1.8, 7, 7], W, c),
            box([-2, 8, -1], [-1, 10, 0], W, horn),
            box([1, 8, -1], [2, 10, 0], W, horn),
            box([-2.6, 6, 2], [-2.4, 7, 3], W, '#ffe060'),
            box([2.4, 6, 2], [2.6, 7, 3], W, '#ffe060'),
          ],
        },
        { name: 'tail', pivot: [0, 6, -5], swing: 'tail', boxes: [box([-1.5, -1.5, -6], [1.5, 1.5, 0], W, c), box([-1, -1, -10], [1, 1, -6], W, c), box([-1.5, -0.2, -12], [1.5, 0.2, -10], W, horn)] },
      ];
    }
  }
  return null;
}

/** Monsters that walk upright reuse the character rig with their own colours. */
const MONSTER_LOOKS: Record<string, { appearance: Appearance; outfit: Outfit; scale: number }> = {
  troll: { appearance: { skin: '#6a8a4a', hair: '#3a4a2a', hairStyle: 'curly' }, outfit: { shirt: 'shirt_green', pants: 'pants_brown' }, scale: 1.15 },
  boss: { appearance: { skin: '#7a5aa8', hair: '#2a1a3a', hairStyle: 'long' }, outfit: { hat: 'hat_crown', shirt: 'shirt_purple', pants: 'pants_red' }, scale: 1.9 },
};

const VEHICLE_COLORS = ['#c9433c', '#3b6fd9', '#e8c23a'];

/** Box model of a vehicle (pixel units, front at +z) into `g`. `parked`: lies across the tile footprint along +x. */
export function vehicleModel(g: GeoBuilder, species: string, variant: number, parked = false): void {
  const col = rgb(VEHICLE_COLORS[variant % VEHICLE_COLORS.length]!);
  const dark = rgb('#222226');
  const glass = 'glass';
  const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: string, c: RGB = [1, 1, 1]) => {
    if (parked) g.box(z0 + 16, y0, -x1 + 8, z1 + 16, y1, -x0 + 8, tex, c);
    else g.box(x0, y0, z0, x1, y1, z1, tex, c);
  };
  const wheels = (xs: number, zs: number[], r = 3) => {
    for (const z of zs) for (const x of [-xs, xs - 2]) b(x, 0, z - r, x + 2, r * 2, z + r, 'white', dark);
  };
  switch (species) {
    case 'car':
      b(-7, 3, -12, 7, 10, 12, 'white', col);
      b(-6, 10, -7, 6, 16, 5, glass);
      b(-6, 16, -7, 6, 17, 5, 'white', col);
      b(-5, 6, 12, -2, 9, 12.3, 'glowstone');
      b(2, 6, 12, 5, 9, 12.3, 'glowstone');
      wheels(8, [-7, 7]);
      return;
    case 'motorcycle':
      b(-2, 4, -8, 2, 9, 8, 'white', col);
      b(-3, 9, -5, 3, 11, 2, 'white', dark);
      b(-5, 13, 6, 5, 14, 7, 'white', dark);
      b(-1, 9, 6, 1, 13, 8, 'white', dark);
      b(-1, 0, -9, 1, 6, -3, 'white', dark);
      b(-1, 0, 4, 1, 6, 10, 'white', dark);
      return;
    case 'bus':
      b(-9, 3, -20, 9, 28, 20, 'white', col);
      for (let z = -16; z < 18; z += 8) {
        b(-9.2, 15, z, -9, 24, z + 6, glass);
        b(9, 15, z, 9.2, 24, z + 6, glass);
      }
      b(-7, 13, 20, 7, 25, 20.2, glass);
      wheels(10, [-13, 13], 4);
      return;
    case 'train':
      b(-9, 4, -24, 9, 26, 24, 'white', col);
      b(-9, 26, -24, 9, 28, 24, 'white', dark);
      for (let z = -20; z < 22; z += 8) {
        b(-9.2, 14, z, -9, 22, z + 5, glass);
        b(9, 14, z, 9.2, 22, z + 5, glass);
      }
      b(-6, 12, 24, 6, 22, 24.2, glass);
      wheels(9, [-18, -9, 9, 18], 3);
      return;
  }
}

export interface ActorModel extends Rig {
  species: string;
}

/** A rig for an animal, monster or vehicle (faces +z). */
export function animalRig(species: string, variant: number, baby: boolean, jul: boolean): ActorModel {
  const monster = MONSTER_LOOKS[species];
  if (monster) {
    const r = humanoid(monster.appearance, monster.outfit, monster.scale) as ActorModel;
    r.species = species;
    return r;
  }
  const rig = newRig() as ActorModel;
  rig.species = species;
  const mat = atlasMaterial();
  rig.materials.push(mat);
  if (species === 'car' || species === 'motorcycle' || species === 'bus' || species === 'train') {
    const key = `veh:${species}:${variant}`;
    let geo = geoCache.get(key);
    if (!geo) {
      const g = new GeoBuilder();
      vehicleModel(g, species, variant);
      geo = g.build();
      geoCache.set(key, geo);
    }
    rig.body.add(new THREE.Mesh(geo, mat));
    rig.height = species === 'bus' || species === 'train' ? 1.8 : 1.1;
    rig.seat = species === 'motorcycle' ? 9 * PX : 6 * PX;
    return rig;
  }
  const parts = animalParts(species, variant);
  if (jul && parts.some((p) => p.name === 'head')) {
    // a little tomteluva
    const head = parts.find((p) => p.name === 'head')!;
    const top = Math.max(...head.boxes.map((b) => b.max[1]));
    head.boxes = [...head.boxes, box([-2, top, -1], [2, top + 2, 2], W, '#d9453b'), box([-1, top + 2, 0], [1, top + 4, 1.5], W, '#d9453b'), box([-0.5, top + 4, 0.5], [0.8, top + 5, 1.8], W, '#ffffff')];
  }
  buildParts(rig, `${species}:${variant}:${jul ? 1 : 0}`, parts, mat);
  const top = Math.max(...parts.flatMap((p) => p.boxes.map((b) => p.pivot[1] + b.max[1])));
  const scale = baby ? 0.6 : species === 'boss' ? 1.6 : 1;
  rig.body.scale.setScalar(scale);
  rig.height = top * PX * scale;
  if (species === 'horse') rig.seat = 23 * PX;
  return rig;
}

/** Walk cycle, head bob, idle sway. `t` seconds, `speed` 0..1 how fast it walks. */
export function animateRig(rig: Rig, t: number, walk: number, phase = 0): void {
  const a = Math.sin(t * 9 + phase) * 0.7 * walk;
  for (const [p, s] of rig.swings) {
    switch (s) {
      case 'legA':
        p.rotation.x = a;
        break;
      case 'legB':
        p.rotation.x = -a;
        break;
      case 'armA':
        if (!p.userData.busy) p.rotation.x = -a * 0.8;
        break;
      case 'armB':
        p.rotation.x = a * 0.8;
        break;
      case 'wingA':
        p.rotation.z = -Math.abs(Math.sin(t * 14 + phase)) * (rig.root.userData.flying ? 1 : 0.15 + walk * 0.4);
        break;
      case 'wingB':
        p.rotation.z = Math.abs(Math.sin(t * 14 + phase)) * (rig.root.userData.flying ? 1 : 0.15 + walk * 0.4);
        break;
      case 'tail':
        p.rotation.y = Math.sin(t * 4 + phase) * 0.3;
        break;
      case 'head':
        if (!p.userData.look) p.rotation.x = Math.sin(t * 1.3 + phase) * 0.06;
        break;
    }
  }
}
