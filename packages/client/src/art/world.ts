// Terrain tiles, world objects, crops and effects — all drawn in code.
import { CROPS, type Terrain } from '@lilla-garden/shared';
import { Px, hash2, shade } from './px.js';
import { NEW_ART } from './style.ts';

export const OUTLINE = '#2b2419';
const WOOD = '#9a6a3a';
const WOOD_D = '#6f4a26';
const WOOD_L = '#c58f55';
const STONE = '#9d9a92';
const STONE_D = '#6f6c66';
const STONE_L = '#c9c6bd';
const LEAF = '#4f9a3a';
const LEAF_D = '#357028';
const LEAF_L = '#7fc35a';

// ---------------------------------------------------------------------------
// Terrain (16x16). Index order matters: see TERRAIN_INDEX.
// ---------------------------------------------------------------------------

export interface TerrainTiles {
  canvas: HTMLCanvasElement;
  /** frame index per terrain (+variant). `mask` = sides with a different kind of ground (1 up, 2 right, 4 down, 8 left). */
  index: (t: Terrain, x: number, y: number, snow: boolean, mask?: number, frame?: number) => number;
  waterFrames: [number, number];
  rock: number;
  count: number;
  /** Whether water/soil need neighbour masks (new style). */
  edges: boolean;
}

export function drawTerrainTiles(): TerrainTiles {
  const tiles: Px[] = [];
  const add = (p: Px) => tiles.push(p) - 1;
  const speck = (p: Px, seed: number, n: number, c: string, len = 1) => {
    for (let i = 0; i < n; i++) {
      const h = hash2(seed * 31 + i, seed * 17 + i * 7);
      const x = h % 16;
      const y = Math.floor(h / 16) % 16;
      p.rect(x, y, 1, len, c);
    }
  };

  // grass x4 (classic) or x8 (new: soft patches, tiny flowers, pebbles)
  const grass: number[] = [];
  const GRASS = NEW_ART ? '#64a848' : '#5f9f3c';
  for (let v = 0; v < (NEW_ART ? 8 : 4); v++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, GRASS);
    if (NEW_ART) {
      // soft, organic grass: short tufts in two greens, a few lighter blades, the odd flower or pebble
      const h = hash2(v * 13, v * 7);
      const tuftAt = (x: number, y: number, c: string) => p.rect(x, y, 1, 2, c).rect(x + 1, y + 1, 1, 1, c);
      for (let i = 0; i < 3 + (v % 3); i++) {
        const t = hash2(h + i * 29, v * 11 + i);
        tuftAt(t % 14, Math.floor(t / 16) % 13, i % 2 ? '#578f3c' : '#5a9a40');
      }
      speck(p, 200 + v, 2 + (v % 2), '#7cc05a', 1);
      if (v === 2) p.rect(4, 4, 4, 3, '#5c9c40').rect(5, 3, 2, 1, '#5c9c40');
      if (v === 4) p.rect(9, 9, 5, 3, '#5c9c40').rect(10, 8, 3, 1, '#5c9c40');
      if (v === 5) p.rect(3, 4, 1, 1, '#ffffff').rect(11, 10, 1, 1, '#ffe66a');
      if (v === 6) p.rect(7, 12, 2, 1, '#8f8a80');
      if (v === 7) p.rect(12, 3, 1, 1, '#ff9ac8');
    } else {
      speck(p, 100 + v, 5, '#4f8a31', 2);
      speck(p, 200 + v, 3, '#7ab84f', 1);
    }
    grass.push(add(p));
  }
  // snow grass x2
  const snow: number[] = [];
  for (let v = 0; v < 2; v++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#eef2f7');
    speck(p, 300 + v, 4, '#d6dfe9', 1);
    speck(p, 400 + v, 2, '#ffffff', 1);
    snow.push(add(p));
  }
  // soil, soil_wet: in the new style 16 edge variants each, with a rounded grass fringe on open sides
  const soilTile = (base: string, dark: string, mask: number) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, base);
    for (let y = 2; y < 16; y += 4) p.rect(0, y, 16, 1, dark);
    speck(p, 500 + mask, 6, dark, 1);
    if (NEW_ART) {
      const g = GRASS;
      const gd = '#4f8a35';
      if (mask & 1) p.rect(0, 0, 16, 2, g).rect(0, 2, 16, 1, gd).rect(3, 2, 2, 1, g).rect(10, 2, 3, 1, g);
      if (mask & 4) p.rect(0, 14, 16, 2, g).rect(0, 13, 16, 1, gd).rect(5, 13, 3, 1, g).rect(12, 13, 2, 1, g);
      if (mask & 8) p.rect(0, 0, 2, 16, g).rect(2, 0, 1, 16, gd).rect(2, 4, 1, 2, g).rect(2, 11, 1, 2, g);
      if (mask & 2) p.rect(14, 0, 2, 16, g).rect(13, 0, 1, 16, gd).rect(13, 3, 1, 3, g).rect(13, 10, 1, 2, g);
      // rounded corners
      if (mask & 1 && mask & 8) p.rect(0, 0, 4, 4, g).px(3, 3, gd);
      if (mask & 1 && mask & 2) p.rect(12, 0, 4, 4, g).px(12, 3, gd);
      if (mask & 4 && mask & 8) p.rect(0, 12, 4, 4, g).px(3, 12, gd);
      if (mask & 4 && mask & 2) p.rect(12, 12, 4, 4, g).px(12, 12, gd);
    }
    return add(p);
  };
  const soilVariants: number[] = [];
  const soilWetVariants: number[] = [];
  for (let m = 0; m < (NEW_ART ? 16 : 1); m++) {
    soilVariants.push(soilTile('#9a6a3a', '#7a5028', m));
    soilWetVariants.push(soilTile('#5f3d1d', '#452a12', m));
  }
  const soilI = soilVariants[0]!;
  const soilWetI = soilWetVariants[0]!;
  // water: 2 frames; in the new style 16 shore variants x 2 frames with shallow water and foam on land sides
  const water: number[] = [];
  const waterShore: number[][] = [];
  const waterTile = (f: number, mask: number) => {
    const deep = NEW_ART ? '#3a80d0' : '#3f86d6';
    const p = new Px(16, 16).rect(0, 0, 16, 16, deep);
    const o = f * 2;
    p.rect(2 + o, 3, 4, 1, '#7fb6ee').rect(9 + o, 8, 4, 1, '#7fb6ee').rect(4 - o, 12, 3, 1, '#7fb6ee').rect(11 - o, 1, 3, 1, '#2d6cb8');
    if (NEW_ART && mask) {
      const shallow = '#6fb3ea';
      const foam = f === 0 ? '#dff2ff' : '#b9dcf7';
      if (mask & 1) p.rect(0, 0, 16, 3, shallow).rect(0, 0, 16, 1, foam).rect(4 + o, 1, 3, 1, foam);
      if (mask & 4) p.rect(0, 13, 16, 3, shallow).rect(0, 15, 16, 1, foam).rect(8 - o, 14, 3, 1, foam);
      if (mask & 8) p.rect(0, 0, 3, 16, shallow).rect(0, 0, 1, 16, foam).rect(1, 5 + o, 1, 3, foam);
      if (mask & 2) p.rect(13, 0, 3, 16, shallow).rect(15, 0, 1, 16, foam).rect(14, 9 - o, 1, 3, foam);
      if (mask & 1 && mask & 8) p.rect(0, 0, 5, 5, shallow).rect(0, 0, 5, 1, foam).rect(0, 0, 1, 5, foam);
      if (mask & 1 && mask & 2) p.rect(11, 0, 5, 5, shallow).rect(11, 0, 5, 1, foam).rect(15, 0, 1, 5, foam);
      if (mask & 4 && mask & 8) p.rect(0, 11, 5, 5, shallow).rect(0, 15, 5, 1, foam).rect(0, 11, 1, 5, foam);
      if (mask & 4 && mask & 2) p.rect(11, 11, 5, 5, shallow).rect(11, 15, 5, 1, foam).rect(15, 11, 1, 5, foam);
    }
    return add(p);
  };
  for (let m = 0; m < (NEW_ART ? 16 : 1); m++) {
    const frames = [waterTile(0, m), waterTile(1, m)];
    waterShore.push(frames);
    if (m === 0) water.push(...frames);
  }
  // sand
  const sandP = new Px(16, 16).rect(0, 0, 16, 16, '#e3d08f');
  speck(sandP, 600, 5, '#cdb878', 1);
  const sandI = add(sandP);
  // path_stone
  const ps = new Px(16, 16).rect(0, 0, 16, 16, '#8d8a82');
  for (const [x, y, w, h] of [
    [1, 1, 6, 5],
    [8, 1, 7, 4],
    [1, 7, 4, 4],
    [6, 6, 9, 5],
    [1, 12, 7, 3],
    [9, 12, 6, 3],
  ] as const)
    ps.rect(x, y, w, h, '#b5b2a8').rect(x, y, w, 1, '#cbc8bf');
  const pathStoneI = add(ps);
  // path_dirt
  const pd = new Px(16, 16).rect(0, 0, 16, 16, '#c9a978');
  speck(pd, 700, 7, '#a98858', 1);
  speck(pd, 800, 3, '#e0c48f', 1);
  const pathDirtI = add(pd);
  // floor_wood
  const fw = new Px(16, 16).rect(0, 0, 16, 16, '#b07a44');
  for (let y = 0; y < 16; y += 4) fw.rect(0, y, 16, 1, '#8a5c30').rect(y % 8 === 0 ? 7 : 2, y + 1, 1, 3, '#8a5c30');
  const floorWoodI = add(fw);
  // floor_stone
  const fs = new Px(16, 16).rect(0, 0, 16, 16, '#b9b6ad');
  fs.rect(0, 0, 16, 1, '#8e8b83').rect(0, 8, 16, 1, '#8e8b83').rect(0, 0, 1, 16, '#8e8b83').rect(8, 0, 1, 8, '#8e8b83').rect(4, 8, 1, 8, '#8e8b83').rect(12, 8, 1, 8, '#8e8b83');
  const floorStoneI = add(fs);

  // gravel and ice
  const gravelP = new Px(16, 16).rect(0, 0, 16, 16, '#8f8a80');
  speck(gravelP, 950, 7, '#6f6a62', 1);
  speck(gravelP, 960, 4, '#aaa59b', 1);
  const gravelI = add(gravelP);
  const iceP = new Px(16, 16).rect(0, 0, 16, 16, '#bfe3f5').rect(2, 3, 5, 1, '#ffffff').rect(9, 9, 4, 1, '#ffffff').rect(5, 12, 3, 1, '#9fcfe8');
  const iceI = add(iceP);
  // cave rock (solid darkness with a faint texture)
  const rockP = new Px(16, 16).rect(0, 0, 16, 16, '#1d1c22');
  speck(rockP, 900, 4, '#26252c', 2);
  const rockI = add(rockP);

  const sheet = new Px(16 * tiles.length, 16);
  tiles.forEach((t, i) => sheet.blit(t, i * 16, 0));
  return {
    canvas: sheet.canvas,
    count: tiles.length,
    rock: rockI,
    edges: NEW_ART,
    waterFrames: [water[0]!, water[1]!],
    index: (t, x, y, snowy, mask = 0, frame = 0) => {
      const h = hash2(x, y);
      switch (t) {
        case 'grass':
          return snowy ? snow[h % 2]! : grass[h % grass.length]!;
        case 'soil':
          return soilVariants[mask % soilVariants.length] ?? soilI;
        case 'soil_wet':
          return soilWetVariants[mask % soilWetVariants.length] ?? soilWetI;
        case 'water':
          return waterShore[mask % waterShore.length]![frame]!;
        case 'sand':
          return snowy ? snow[h % 2]! : sandI;
        case 'path_stone':
          return pathStoneI;
        case 'path_dirt':
          return pathDirtI;
        case 'floor_wood':
          return floorWoodI;
        case 'floor_stone':
          return floorStoneI;
        case 'snow':
          return snow[h % 2]!;
        case 'gravel':
          return gravelI;
        case 'ice':
          return iceI;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Objects. Each kind -> list of variant/frames canvases + anchor info.
// ---------------------------------------------------------------------------

export interface ObjectArt {
  frames: Px[];
  /** Pixel offset of the sprite's top-left relative to the object's tile origin. */
  ox: number;
  oy: number;
  /** Sort offset in pixels added to the footprint's bottom edge. */
  animated?: boolean;
}

const treeNew = (kind: 'round' | 'pine' | 'apple', v: number): Px => {
  const p = new Px(24, 36);
  if (kind === 'pine') {
    p.rect(10, 28, 4, 8, '#5a3d20').rect(10, 28, 1, 8, '#3e2a14');
    const layers: [number, number, number][] = [
      [4, 20, 20],
      [6, 13, 16],
      [8, 6, 12],
      [10, 1, 6],
    ];
    for (const [x, y, w] of layers) {
      const h = 10;
      for (let yy = 0; yy < h; yy++) {
        const half = Math.round((w / 2) * (yy / h)) + 1;
        const c = yy < 2 ? '#4f9a48' : yy < h - 3 ? '#2f7a3a' : '#215a2a';
        p.rect(12 - half, y + yy, half * 2, 1, c);
        if (yy >= 2 && half > 2) p.rect(12 - half, y + yy, Math.max(1, Math.floor(half / 2)), 1, yy < h - 3 ? '#245f2d' : '#19461f');
        if (yy >= 2 && half > 1) p.rect(12 + half - 1, y + yy, 1, 1, yy < h - 3 ? '#4f9a48' : '#2f7a3a');
      }
    }
    p.rect(11, 0, 2, 2, '#6fc060');
  } else {
    p.rect(10, 24, 4, 12, '#8a5a2a').rect(10, 24, 1, 12, '#5a3d20').rect(13, 24, 1, 12, '#a5733a').rect(8, 33, 8, 3, '#5a3d20');
    p.ellipse(2, 6, 20, 18, '#2c6b2e'); // dark base
    p.ellipse(3, 3, 18, 18, '#3f8f3a');
    p.ellipse(5, 2, 12, 11, '#55aa48');
    p.ellipse(7 + (v % 2) * 2, 3, 6, 4, '#8ad66a').ellipse(13 - (v % 2) * 3, 9, 4, 3, '#8ad66a');
    p.ellipse(2, 15, 9, 7, '#2c6b2e').ellipse(14, 14, 8, 7, '#2c6b2e');
    if (kind === 'apple') {
      for (const [x, y] of [
        [6, 11],
        [13, 7],
        [16, 15],
        [9, 18],
      ] as const)
        p.rect(x, y, 2, 2, '#d8363a').px(x, y, '#ff8a8a');
    }
  }
  return p.outline('#1f2a18');
};

const tree = (kind: 'round' | 'pine' | 'apple', v = 0): Px => {
  if (NEW_ART) return treeNew(kind, v);
  const p = new Px(20, 32);
  if (kind === 'pine') {
    p.rect(8, 24, 4, 8, WOOD_D);
    p.tpl(2, 2, [
      '.......##.......',
      '......####......',
      '.....######.....',
      '....########....',
      '.....######.....',
      '....########....',
      '...##########...',
      '..############..',
      '....########....',
      '...##########...',
      '..############..',
      '.##############.',
      '################',
    ], { '#': '#2f7a3a' });
    p.tpl(2, 2, [
      '.......##.......',
      '......#.........',
      '.....#..........',
      '....#...........',
      '.....#..........',
      '....#...........',
      '...#............',
      '..#.............',
      '....#...........',
      '...#............',
      '..#.............',
      '.#..............',
    ], { '#': '#5fae55' });
  } else {
    p.rect(8, 22, 4, 10, WOOD).rect(8, 22, 1, 10, WOOD_D).rect(7, 30, 6, 2, WOOD_D);
    p.ellipse(1, 4, 18, 18, LEAF_D);
    p.ellipse(3, 2, 14, 16, LEAF);
    p.ellipse(5, 3, 6, 5, LEAF_L).ellipse(10, 9, 5, 4, LEAF_L);
    if (kind === 'apple') {
      for (const [x, y] of [
        [5, 10],
        [11, 6],
        [13, 13],
        [8, 15],
      ] as const)
        p.rect(x, y, 2, 2, '#d8363a').px(x, y, '#ff7a7a');
    }
  }
  return p.outline(OUTLINE);
};

const rock = (big: boolean): Px => {
  const p = new Px(16, 16);
  if (big) {
    p.ellipse(1, 4, 14, 11, STONE_D).ellipse(2, 3, 12, 10, STONE).ellipse(4, 4, 5, 3, STONE_L);
  } else {
    p.ellipse(4, 8, 9, 7, STONE_D).ellipse(5, 7, 7, 6, STONE).rect(6, 8, 2, 1, STONE_L);
  }
  return p.outline(OUTLINE);
};

const tuft = (v: number): Px => {
  const p = new Px(16, 16);
  const c = '#3f8a2e';
  const l = '#6cb84a';
  const xs = v === 0 ? [3, 6, 9, 12] : v === 1 ? [2, 5, 8, 11, 13] : [4, 7, 10];
  xs.forEach((x, i) => {
    p.rect(x, 9 + (i % 2) * 2, 1, 6 - (i % 2) * 2, c).px(x, 9 + (i % 2) * 2, l);
    p.px(x + 1, 11 + (i % 2), c);
  });
  return p;
};

const flower = (v: number, mid = false): Px => {
  const p = new Px(16, 16);
  const cols = mid ? ['#5aa0e8', '#f5e04a', '#ffffff', '#e87ab8'] : ['#e8502a', '#f5d94a', '#e87ab8', '#ffffff'];
  const c = cols[v % cols.length]!;
  const stem = '#3f8a2e';
  const pts: [number, number][] = mid ? [[3, 8], [9, 5], [12, 11], [6, 12]] : [[4, 7], [10, 9]];
  for (const [x, y] of pts) {
    p.rect(x + 1, y + 2, 1, 5, stem).px(x, y + 4, stem);
    p.rect(x, y + 1, 3, 1, c).rect(x + 1, y, 1, 3, c).px(x + 1, y + 1, '#f7c948');
  }
  return p;
};

const bush = (): Px => new Px(16, 16).ellipse(0, 3, 16, 13, LEAF_D).ellipse(2, 2, 12, 11, LEAF).ellipse(4, 4, 4, 3, LEAF_L).outline(OUTLINE);

const pumpkin = (p: Px, x: number, y: number, w: number, h: number, face = false): Px => {
  p.ellipse(x, y, w, h, '#d8631a').ellipse(x + 1, y + 1, w - 2, h - 2, '#f08a2a');
  p.rect(x + Math.floor(w / 2) - 1, y + 1, 1, h - 2, '#d8631a').rect(x + 2, y + 2, 1, h - 4, '#d8631a').rect(x + w - 3, y + 2, 1, h - 4, '#d8631a');
  p.rect(x + Math.floor(w / 2) - 1, y - 2, 2, 3, '#3f8a2e');
  if (face) {
    p.rect(x + 3, y + 3, 2, 2, '#ffe36a').rect(x + w - 5, y + 3, 2, 2, '#ffe36a').rect(x + 3, y + h - 4, w - 6, 1, '#ffe36a');
  }
  return p;
};

/** Fence piece for a neighbour mask: bit 1 = up, 2 = right, 4 = down, 8 = left. */
const fence = (mask: number): Px => {
  const p = new Px(16, 16);
  const up = mask & 1;
  const right = mask & 2;
  const down = mask & 4;
  const left = mask & 8;
  // rails towards connected sides (two rails), lonely posts get short stubs
  const lonely = mask === 0;
  if (left || lonely) p.rect(0, 6, 8, 2, WOOD).rect(0, 11, 8, 2, WOOD);
  if (right || lonely) p.rect(8, 6, 8, 2, WOOD).rect(8, 11, 8, 2, WOOD);
  if (up) p.rect(5, 0, 2, 9, WOOD).rect(9, 0, 2, 9, WOOD);
  if (down) p.rect(5, 8, 2, 8, WOOD).rect(9, 8, 2, 8, WOOD);
  // post
  p.rect(6, 2, 4, 13, WOOD_L).rect(6, 2, 4, 1, '#e0b47a').rect(9, 3, 1, 12, WOOD);
  return p.outline(OUTLINE);
};
const gate = (vertical: boolean): Px => {
  const p = new Px(16, 16);
  if (vertical) {
    p.rect(5, 0, 2, 16, WOOD).rect(9, 0, 2, 16, WOOD).rect(4, 1, 8, 3, WOOD_L).rect(4, 12, 8, 3, WOOD_L).line(5, 4, 10, 11, WOOD_D);
  } else {
    p.rect(0, 6, 16, 2, WOOD).rect(0, 11, 16, 2, WOOD);
    p.rect(1, 3, 3, 12, WOOD_L).rect(12, 3, 3, 12, WOOD_L).rect(1, 3, 3, 1, '#e0b47a').rect(12, 3, 3, 1, '#e0b47a');
    p.line(4, 13, 11, 7, WOOD_D).line(4, 12, 11, 6, WOOD_D);
  }
  return p.outline(OUTLINE);
};

/** Paint colours; index 0 = unpainted (natural wood / stone / the farmhouse's cream). */
export const PAINT_COLORS = ['', '#c9433c', '#f0d060', '#6a9fd8', '#7fb86a', '#f4f2ec', '#f0a8c8'];

const wallColor = (stone: boolean, colour: number): string => PAINT_COLORS[colour] || (stone ? STONE : WOOD);

/** Face texture of a wall piece: vertical planks (wood) or stone blocks. */
const wallFace = (p: Px, x: number, y: number, w: number, h: number, stone: boolean, col: string, painted: boolean) => {
  const dark = shade(col, painted ? 0.82 : 0.72);
  p.rect(x, y, w, h, col);
  if (stone) {
    for (let yy = y; yy < y + h; yy += 4) {
      p.rect(x, yy, w, 1, dark);
      for (let xx = x + (((yy - y) / 4) % 2 === 0 ? 0 : 4); xx < x + w; xx += 8) p.rect(xx, yy, 1, Math.min(4, y + h - yy), dark);
    }
  } else {
    for (let xx = x + 1; xx < x + w; xx += 4) p.rect(xx, y, 1, h, dark);
  }
};

/**
 * Wall piece (16×24, drawn 8px above its tile) for a neighbour mask: bit 1 = up, 2 = right, 4 = down, 8 = left.
 * Horizontal runs show the wall's face; vertical runs a thin top-down strip; both have a light cap on top.
 */
const wallPiece = (stone: boolean, colour: number, mask: number): Px => {
  const p = new Px(16, 24);
  const col = wallColor(stone, colour);
  const painted = colour > 0;
  const cap = shade(col, 1.25);
  const up = mask & 1;
  const right = mask & 2;
  const down = mask & 4;
  const left = mask & 8;
  const horizontal = left || right;
  const vertical = up || down;
  if (vertical) {
    const y0 = up ? 0 : 6;
    const y1 = down ? 24 : 22;
    wallFace(p, 5, y0, 6, y1 - y0, stone, col, painted);
    p.rect(5, y0, 6, 1, cap).rect(5, y0, 1, y1 - y0, cap);
  }
  if (horizontal || !vertical) {
    const x0 = left ? 0 : vertical ? 5 : 3;
    const x1 = right ? 16 : vertical ? 11 : 13;
    wallFace(p, x0, 8, x1 - x0, 16, stone, col, painted);
    p.rect(x0, 6, x1 - x0, 2, cap).rect(x0, 8, x1 - x0, 1, shade(col, 1.1));
  }
  return p.outline(OUTLINE);
};

/** A wall piece with a window; `vertical` when it sits in a vertical run. */
const windowPiece = (colour: number, vertical: boolean): Px => {
  const p = wallPiece(false, colour, vertical ? 5 : 10);
  const frame = colour > 0 ? '#f4f2ec' : '#7a5230';
  if (vertical) {
    p.rect(6, 9, 4, 6, '#8fd0f0').rect(6, 12, 4, 1, frame).box(5, 8, 6, 8, frame);
  } else {
    p.rect(4, 11, 8, 8, '#8fd0f0').rect(7, 11, 2, 8, frame).rect(4, 14, 8, 1, frame).box(3, 10, 10, 10, frame);
    p.rect(4, 20, 2, 2, '#e8502a').rect(10, 20, 2, 2, '#f5d94a');
  }
  return p;
};

/** A door in a wall; swings open when someone is near. */
const doorPiece = (colour: number, vertical: boolean, open: boolean): Px => {
  const p = new Px(16, 24);
  const col = wallColor(false, colour);
  const cap = shade(col, 1.25);
  if (vertical) {
    wallFace(p, 5, 0, 6, 24, false, col, colour > 0);
    p.rect(5, 0, 6, 1, cap).rect(5, 0, 1, 24, cap);
    if (open) p.clear(4, 6, 8, 12).rect(11, 5, 2, 7, WOOD_D).rect(11, 12, 2, 7, WOOD);
    else p.rect(4, 6, 8, 12, WOOD_D).rect(5, 7, 6, 10, WOOD).rect(9, 11, 1, 2, '#f2d35a');
  } else {
    wallFace(p, 0, 8, 16, 16, false, col, colour > 0);
    p.rect(0, 6, 16, 2, cap).rect(0, 8, 16, 1, shade(col, 1.1));
    p.rect(3, 9, 10, 15, WOOD_D);
    if (open) p.rect(4, 10, 8, 14, '#2a2420').rect(12, 10, 2, 14, WOOD).rect(12, 10, 2, 1, WOOD_L);
    else p.rect(4, 10, 8, 14, WOOD).rect(5, 11, 6, 12, WOOD_D).rect(6, 12, 4, 10, WOOD).rect(10, 17, 1, 2, '#f2d35a');
  }
  return p.outline(OUTLINE);
};

const chest = (): Px => {
  const p = new Px(16, 16).rect(1, 4, 14, 11, WOOD).rect(1, 4, 14, 4, WOOD_L).rect(1, 8, 14, 1, WOOD_D).rect(7, 7, 2, 3, '#f2d35a').rect(1, 14, 14, 1, WOOD_D);
  return p.outline(OUTLINE);
};

const trough = (): Px => {
  const p = new Px(16, 16).rect(1, 7, 14, 7, WOOD).rect(1, 7, 14, 1, WOOD_L).rect(2, 8, 12, 3, '#e6c15a').rect(2, 13, 14, 1, WOOD_D).rect(2, 14, 2, 2, WOOD_D).rect(12, 14, 2, 2, WOOD_D);
  return p.outline(OUTLINE);
};

const workbench = (): Px => {
  const p = new Px(16, 16).rect(0, 4, 16, 6, WOOD).rect(0, 4, 16, 1, WOOD_L).rect(1, 10, 2, 6, WOOD_D).rect(13, 10, 2, 6, WOOD_D);
  p.rect(3, 2, 4, 2, STONE).rect(4, 1, 1, 3, WOOD_D).rect(10, 2, 3, 2, '#d8363a');
  return p.outline(OUTLINE);
};

const torch = (frame: number): Px => {
  const p = new Px(16, 16).rect(7, 7, 2, 9, WOOD_D);
  p.rect(6, 5 - frame, 4, 3 + frame, '#f5a623').rect(7, 3 - frame, 2, 3, '#ffd45a').px(7 + frame, 2 - frame, '#fff2a0');
  return p.outline(OUTLINE);
};

const scarecrow = (): Px => {
  const p = new Px(16, 24).rect(7, 6, 2, 18, WOOD_D).rect(2, 10, 12, 2, WOOD_D);
  p.rect(4, 8, 8, 9, '#3b6fd9').rect(4, 8, 8, 1, '#5a8fe8');
  p.ellipse(4, 1, 8, 8, '#e6c15a').rect(3, 1, 10, 2, '#9a6a3a').rect(5, 0, 6, 1, '#9a6a3a');
  p.px(6, 5, OUTLINE).px(9, 5, OUTLINE);
  return p.outline(OUTLINE);
};

const bench = (): Px => new Px(16, 16).rect(0, 7, 16, 3, WOOD_L).rect(0, 10, 16, 1, WOOD_D).rect(2, 11, 2, 4, WOOD_D).rect(12, 11, 2, 4, WOOD_D).rect(0, 3, 16, 3, WOOD).outline(OUTLINE);
const table = (): Px => new Px(16, 16).rect(0, 4, 16, 4, WOOD_L).rect(0, 8, 16, 1, WOOD_D).rect(1, 9, 2, 6, WOOD_D).rect(13, 9, 2, 6, WOOD_D).rect(6, 2, 4, 2, '#d8363a').outline(OUTLINE);
const flowerbox = (): Px => {
  const p = new Px(16, 16).rect(1, 9, 14, 6, WOOD).rect(1, 9, 14, 1, WOOD_L);
  for (const [x, c] of [
    [2, '#e8502a'],
    [6, '#f5d94a'],
    [10, '#e87ab8'],
  ] as const)
    p.rect(x + 1, 5, 1, 4, '#3f8a2e').rect(x, 4, 3, 1, c).rect(x + 1, 3, 1, 3, c);
  return p.outline(OUTLINE);
};
const well = (): Px => {
  const p = new Px(16, 24);
  p.rect(2, 14, 12, 8, STONE).rect(2, 14, 12, 1, STONE_L);
  for (let y = 16; y < 22; y += 3) for (let x = 2 + ((y / 3) % 2) * 3; x < 14; x += 6) p.rect(x, y, 1, 3, STONE_D);
  p.rect(3, 8, 1, 7, WOOD_D).rect(12, 8, 1, 7, WOOD_D);
  p.rect(1, 4, 14, 4, '#b5413a').rect(0, 7, 16, 1, '#8c2f2a').rect(3, 2, 10, 2, '#b5413a').rect(5, 0, 6, 2, '#b5413a');
  p.rect(7, 9, 2, 5, '#4f86d6');
  return p.outline(OUTLINE);
};

const building = (w: number, h: number, wallC: string, roofC: string, door = true, opts: { windows?: number; roofH?: number; label?: string } = {}): Px => {
  const roofH = opts.roofH ?? Math.round(h * 0.45);
  const p = new Px(w, h);
  const wallTop = roofH;
  p.rect(1, wallTop, w - 2, h - wallTop - 1, wallC).rect(1, wallTop, w - 2, 1, shade(wallC, 1.2));
  for (let x = 1; x < w - 1; x += 5) p.rect(x, wallTop, 1, h - wallTop - 1, shade(wallC, 0.85));
  // roof: trapezoid
  for (let y = 0; y < roofH; y++) {
    const inset = Math.max(0, Math.round(((roofH - 1 - y) / (roofH - 1)) * (w / 2 - 4)));
    p.rect(inset, y, w - inset * 2, 1, y % 3 === 0 ? shade(roofC, 0.85) : roofC);
  }
  p.rect(0, roofH - 1, w, 2, shade(roofC, 0.7));
  if (door) {
    const dw = Math.min(10, Math.max(6, Math.round(w / 5)));
    const dx = Math.round(w / 2 - dw / 2);
    p.rect(dx, h - 2 - Math.round(h * 0.3), dw, Math.round(h * 0.3) + 1, WOOD_D).rect(dx + 1, h - 1 - Math.round(h * 0.3), dw - 2, Math.round(h * 0.3), WOOD);
    p.rect(dx + dw - 3, h - Math.round(h * 0.15) - 1, 1, 1, '#f2d35a');
  }
  const windows = opts.windows ?? 0;
  for (let i = 0; i < windows; i++) {
    const wx = Math.round(((i + 1) * w) / (windows + 1)) - 3;
    const wy = wallTop + 4;
    p.rect(wx, wy, 6, 6, '#8fd0f0').rect(wx + 2, wy, 1, 6, WOOD_D).rect(wx, wy + 2, 6, 1, WOOD_D).box(wx - 1, wy - 1, 8, 8, WOOD_D);
  }
  return p.outline(OUTLINE);
};

const horseStable = (): Px => {
  // a wooden stable: brown plank walls, dark roof, a wide half-door with a horse looking out
  const p = building(48, 44, '#a8743c', '#4e3520', false, { windows: 1, roofH: 18 });
  const dw = 14;
  const dx = 24 - dw / 2;
  p.rect(dx, 24, dw, 19, WOOD_D).rect(dx + 1, 25, dw - 2, 18, '#5a3d20');
  p.rect(dx + 1, 34, dw - 2, 9, WOOD).rect(dx + 1, 34, dw - 2, 1, WOOD_D); // lower half-door
  // horse head peeking out of the top half
  p.rect(dx + 4, 26, 6, 7, '#9a5a2c').rect(dx + 5, 25, 2, 2, '#3a2414').rect(dx + 8, 25, 1, 2, '#3a2414').px(dx + 8, 28, OUTLINE).rect(dx + 6, 29, 1, 3, '#f4ead8');
  // horseshoe above the door
  p.rect(21, 20, 6, 1, '#c0c0c0').rect(20, 21, 1, 2, '#c0c0c0').rect(26, 21, 1, 2, '#c0c0c0');
  return p;
};

const house = (colour = 0): Px => {
  const p = new Px(80, 84);
  const wallC = PAINT_COLORS[colour] || '#e8dcc0';
  const trim = colour > 0 ? '#f4f2ec' : '#7a5230';
  // walls
  p.rect(2, 34, 76, 49, wallC).rect(2, 34, 76, 1, shade(wallC, 1.15));
  for (let x = 2; x < 78; x += 6) p.rect(x, 34, 1, 49, shade(wallC, 0.9));
  // roof (Swedish red)
  for (let y = 0; y < 36; y++) {
    const inset = Math.max(0, Math.round(((35 - y) / 35) * 30));
    p.rect(inset, y, 80 - inset * 2, 1, y % 4 === 0 ? '#8f2f2a' : '#b5413a');
  }
  p.rect(0, 34, 80, 3, '#7a2622');
  // chimney
  p.rect(58, 4, 8, 14, STONE_D).rect(57, 3, 10, 2, STONE);
  // door
  p.rect(35, 60, 12, 23, WOOD_D).rect(36, 61, 10, 22, WOOD).rect(44, 72, 2, 2, '#f2d35a');
  // windows
  for (const wx of [10, 60]) p.rect(wx, 44, 12, 11, '#8fd0f0').rect(wx + 5, 44, 2, 11, WOOD_D).rect(wx, 49, 12, 1, WOOD_D).box(wx - 1, 43, 14, 13, trim).rect(wx - 2, 56, 16, 2, trim);
  // flower pots under windows
  for (const wx of [10, 60]) p.rect(wx + 2, 58, 2, 2, '#e8502a').rect(wx + 7, 58, 2, 2, '#f5d94a');
  return p.outline(OUTLINE);
};

const mailbox = (): Px => {
  const p = new Px(16, 24).rect(7, 12, 2, 12, WOOD_D);
  p.rect(2, 4, 12, 9, '#d8363a').rect(2, 4, 12, 1, '#ef6a6a').rect(3, 7, 10, 1, '#ffffff').rect(3, 9, 7, 1, '#ffffff');
  p.rect(13, 1, 2, 5, '#f2d35a');
  return p.outline(OUTLINE);
};
const sellbox = (): Px => {
  const p = new Px(16, 16).rect(1, 5, 14, 10, WOOD).rect(1, 5, 14, 1, WOOD_L).rect(1, 9, 14, 1, WOOD_D).rect(4, 5, 1, 10, WOOD_D).rect(11, 5, 1, 10, WOOD_D);
  p.circle(8, 4, 3, '#f2d35a').px(8, 4, '#c9a32a');
  return p.outline(OUTLINE);
};
const wardrobe = (): Px => {
  const p = new Px(16, 24).rect(1, 1, 14, 22, WOOD).rect(1, 1, 14, 1, WOOD_L).rect(8, 1, 1, 22, WOOD_D).rect(6, 11, 1, 2, '#f2d35a').rect(10, 11, 1, 2, '#f2d35a');
  p.rect(2, 3, 5, 6, WOOD_D).rect(10, 3, 5, 6, WOOD_D);
  return p.outline(OUTLINE);
};
const stump = (): Px => new Px(16, 16).ellipse(2, 6, 12, 8, WOOD_D).ellipse(3, 5, 10, 6, WOOD_L).ellipse(5, 6, 6, 3, WOOD).outline(OUTLINE);

const xmasTree = (): Px => {
  const p = tree('pine');
  const cols = ['#ff4a4a', '#ffe14a', '#4ad0ff', '#ff8ae0'];
  [
    [6, 8],
    [11, 11],
    [5, 14],
    [13, 15],
    [8, 18],
    [4, 20],
    [12, 21],
  ].forEach(([x, y], i) => p.rect(x!, y!, 2, 2, cols[i % 4]!));
  p.rect(9, 1, 2, 2, '#ffe14a').px(10, 0, '#ffe14a');
  return p;
};
const lights = (): Px => {
  const p = new Px(16, 16).line(0, 6, 15, 6, '#2b4a1f');
  const cols = ['#ff4a4a', '#ffe14a', '#4ad0ff', '#ff8ae0', '#7aff7a'];
  for (let i = 0; i < 5; i++) p.rect(1 + i * 3, 7, 2, 2, cols[i]!);
  return p;
};
const snowman = (): Px => {
  const p = new Px(16, 24).circle(8, 18, 6, '#f4f7fb').circle(8, 9, 4, '#f4f7fb').px(6, 8, OUTLINE).px(10, 8, OUTLINE).rect(8, 10, 2, 1, '#f08a2a');
  p.rect(5, 3, 6, 1, OUTLINE).rect(6, 0, 4, 3, OUTLINE).rect(7, 14, 2, 1, OUTLINE).rect(7, 17, 2, 1, OUTLINE);
  p.rect(4, 12, 8, 2, '#d8363a');
  return p.outline(OUTLINE);
};
const easterTwigs = (): Px => {
  const p = new Px(16, 24).rect(7, 12, 2, 12, '#7a5230');
  p.line(8, 14, 3, 4, '#7a5230').line(8, 14, 13, 3, '#7a5230').line(8, 13, 8, 2, '#7a5230');
  const cols = ['#ff8ae0', '#ffe14a', '#4ad0ff', '#7aff7a', '#ff4a4a'];
  [
    [2, 3],
    [12, 2],
    [7, 1],
    [5, 8],
    [11, 8],
  ].forEach(([x, y], i) => p.rect(x!, y!, 2, 3, cols[i]!));
  return p.outline(OUTLINE);
};
const eggBasket = (): Px => {
  const p = new Px(16, 16).ellipse(1, 7, 14, 8, '#c49a5a').rect(2, 7, 12, 1, '#e0b47a').line(3, 7, 8, 1, '#c49a5a').line(12, 7, 8, 1, '#c49a5a');
  const cols = ['#ff8ae0', '#ffe14a', '#4ad0ff', '#7aff7a'];
  [3, 6, 9, 12].forEach((x, i) => p.ellipse(x - 1, 4, 3, 4, cols[i]!));
  return p.outline(OUTLINE);
};
const maypole = (): Px => {
  const p = new Px(16, 32).rect(7, 2, 2, 30, '#7a5230').rect(2, 7, 12, 2, '#7a5230');
  for (let i = 0; i < 12; i += 2) p.px(2 + i, 6, i % 4 === 0 ? '#5aa0e8' : '#f5e04a').px(3 + i, 9, i % 4 === 0 ? '#f5e04a' : '#5aa0e8');
  p.circle(3, 13, 3, '#4f9a3a').circle(13, 13, 3, '#4f9a3a').px(2, 12, '#f5e04a').px(13, 14, '#e87ab8').px(4, 14, '#5aa0e8').px(12, 11, '#ffffff');
  p.rect(5, 9, 1, 4, '#4f9a3a').rect(10, 9, 1, 4, '#4f9a3a');
  p.circle(8, 1, 1, '#4f9a3a');
  return p.outline(OUTLINE);
};
const wreathDecor = (): Px => {
  const p = new Px(16, 16).circle(8, 8, 6, '#4f9a3a').circle(8, 8, 3, '#00000000');
  p.ctx.clearRect(5, 5, 6, 6);
  p.circle(8, 8, 3, '#5f9f3c');
  p.ctx.globalCompositeOperation = 'destination-out';
  p.circle(8, 8, 3, '#000');
  p.ctx.globalCompositeOperation = 'source-over';
  [
    [8, 2, '#f5e04a'],
    [13, 7, '#e87ab8'],
    [8, 13, '#5aa0e8'],
    [3, 8, '#ffffff'],
  ].forEach(([x, y, c]) => p.rect(Number(x) - 1, Number(y) - 1, 2, 2, String(c)));
  return p;
};
const ghostFlag = (): Px => {
  const p = new Px(16, 24).rect(2, 2, 1, 22, WOOD_D);
  p.rect(3, 3, 11, 10, '#f4f4f4').rect(3, 13, 2, 2, '#f4f4f4').rect(7, 13, 2, 2, '#f4f4f4').rect(11, 13, 2, 2, '#f4f4f4');
  p.rect(6, 6, 2, 2, OUTLINE).rect(10, 6, 2, 2, OUTLINE).rect(8, 9, 2, 1, OUTLINE);
  return p.outline(OUTLINE);
};

export function drawObjects(): Record<string, ObjectArt> {
  const art: Record<string, ObjectArt> = {};
  const set = (kind: string, frames: Px[], ox = 0, oy = 0, animated = false) => (art[kind] = { frames, ox, oy, animated });
  if (NEW_ART) {
    set('tree', [tree('round', 0), tree('round', 1)], -4, -20);
    set('tree_pine', [tree('pine', 0)], -4, -20);
    set('tree_apple', [tree('apple', 0)], -4, -20);
  } else {
    set('tree', [tree('round')], -2, -16);
    set('tree_pine', [tree('pine')], -2, -16);
    set('tree_apple', [tree('apple')], -2, -16);
  }
  set('stump', [stump()]);
  set('rock', [rock(true)]);
  set('rock_small', [rock(false)]);
  set('grass_tuft', [tuft(0), tuft(1), tuft(2)]);
  set('flower', [flower(0), flower(1), flower(2), flower(3)]);
  set('bush', [bush()]);
  set('wild_pumpkin', [pumpkin(new Px(16, 16), 2, 5, 12, 10).outline(OUTLINE)]);
  set('wild_flower_mid', [flower(0, true), flower(1, true), flower(2, true)]);
  set('fence', Array.from({ length: 16 }, (_, m) => fence(m)));
  set('gate', [gate(false), gate(true)]);
  // wall pieces: frame = colour * 16 + neighbour mask; windows: colour * 2 + vertical; doors: colour * 4 + vertical * 2 + open
  const colours = PAINT_COLORS.map((_, i) => i);
  set('wall_wood', colours.flatMap((c) => Array.from({ length: 16 }, (_, m) => wallPiece(false, c, m))), 0, -8);
  set('wall_stone', colours.flatMap((c) => Array.from({ length: 16 }, (_, m) => wallPiece(true, c, m))), 0, -8);
  set('window', colours.flatMap((c) => [windowPiece(c, false), windowPiece(c, true)]), 0, -8);
  set('door', colours.flatMap((c) => [doorPiece(c, false, false), doorPiece(c, false, true), doorPiece(c, true, false), doorPiece(c, true, true)]), 0, -8);
  set('chest', [chest()]);
  set('start_chest', [chest()]);
  set('trough', [trough()]);
  set('workbench', [workbench()]);
  set('start_bench', [workbench()]);
  set('torch', [torch(0), torch(1)], 0, 0, true);
  set('scarecrow', [scarecrow()], 0, -8);
  set('bench', [bench()]);
  set('table', [table()]);
  set('flowerbox', [flowerbox()]);
  set('well', [well()], 0, -8);
  set('coop', [building(32, 36, '#e0b47a', '#b5413a', true, { windows: 1, roofH: 14 })], 0, -4);
  set('hutch', [building(16, 20, '#c58f55', '#7a5230', true, { roofH: 7 })], 0, -4);
  set('sheepfold', [building(32, 36, '#c9c6bd', '#6f6c66', true, { windows: 2, roofH: 14 })], 0, -4);
  set('barn', [building(48, 44, '#b5413a', '#6f4a26', true, { windows: 2, roofH: 18 })], 0, -12);
  set('stall', [horseStable()], 0, -12);
  set('house', PAINT_COLORS.map((_, i) => house(i)), 0, -20);
  set('mailbox', [mailbox()], 0, -8);
  set('sellbox', [sellbox()]);
  set('wardrobe', [wardrobe()], 0, -8);
  set('pumpkin_lantern', [pumpkin(new Px(16, 16), 2, 5, 12, 10, true).outline(OUTLINE)]);
  set('ghost_flag', [ghostFlag()], 0, -8);
  set('xmas_tree', [xmasTree()], -2, -16);
  set('lights', [lights()]);
  set('snowman', [snowman()], 0, -8);
  set('easter_twigs', [easterTwigs()], 0, -8);
  set('egg_basket', [eggBasket()]);
  set('maypole', [maypole()], 0, -16);
  set('flower_wreath_decor', [wreathDecor()]);
  // Furniture
  set('bed', [bed()], 0, -4);
  set('rug', [rug()]);
  set('chair', [chair()], 0, -4);
  set('sofa', [sofa()], 0, -4);
  set('bookshelf', [bookshelf()], 0, -8);
  set('lamp', [lamp()], 0, -8);
  set('plant', [plant()], 0, -6);
  set('painting', [painting()], 0, -6);
  set('stove', [stove()], 0, -6);
  set('clock', [clock()], 0, -6);
  set('door_out', [doorOut()]);
  // Biome specials
  set('mushroom', [mushroom(0), mushroom(1)]);
  set('beehive', [beehive()], 0, -6);
  set('iceberry', [iceberry()]);
  set('snowman_wild', [snowman()], 0, -8);
  set('ore', [ore()]);
  set('palm', [palm()], -4, -20);
  set('shell', [shell(0), shell(1)]);
  set('cactus', [cactus()], 0, -8);
  set('signpost', [signpost()], 0, -8);
  // Village
  set('house_small', [0, 1, 2, 3].map((v) => building(48, 52, ['#e8dcc0', '#f0d8a8', '#dce8c8', '#f4e0e0'][v]!, ['#b5413a', '#6f4a26', '#3b5fa6', '#2f7a3a'][v]!, true, { windows: 2, roofH: 20 })), 0, -4);
  set('market', [stall('#d9453b')], 0, -8);
  set('sellstall', [stall('#3b6fd9')], 0, -8);
  set('lantern', [lantern(0), lantern(1)], 0, -8, true);
  set('town_well', [well()], 0, -8);
  // Cave
  set('cave', [caveMouth()], 0, -8);
  set('cave_exit', [caveExit()]);
  set('cave_wall', [caveWall(false), caveWall(true)], 0, -8);
  set('cave_torch', [torch(0), torch(1)], 0, 0, true);
  set('cave_rock', [rock(true)]);
  set('treasure', [treasure()]);
  return art;
}

const mushroom = (v: number): Px => {
  const cap = v === 0 ? '#d8363a' : '#c9a36a';
  const p = new Px(16, 16).rect(6, 9, 3, 6, '#f0e4c8').rect(3, 5, 9, 4, cap).rect(4, 4, 7, 1, cap).px(5, 6, '#ffffff').px(9, 7, '#ffffff').rect(11, 10, 2, 5, '#f0e4c8').rect(10, 8, 4, 2, cap);
  return p.outline(OUTLINE);
};
const beehive = (): Px => new Px(16, 22).rect(7, 0, 2, 6, WOOD_D).ellipse(2, 5, 12, 14, '#e6c15a').rect(2, 9, 12, 1, '#c9a32a').rect(2, 13, 12, 1, '#c9a32a').rect(6, 15, 4, 3, '#3a2a1a').px(3, 7, '#3a2a1a').px(12, 11, '#3a2a1a').outline(OUTLINE);
const iceberry = (): Px => {
  const p = new Px(16, 16).ellipse(2, 4, 12, 11, '#4a7a6a').ellipse(4, 3, 8, 6, '#6a9a8a');
  [[4, 7], [9, 6], [7, 11], [11, 10]].forEach(([x, y]) => p.rect(x!, y!, 2, 2, '#8fd0f0').px(x!, y!, '#ffffff'));
  return p.outline(OUTLINE);
};
const ore = (): Px => new Px(16, 16).ellipse(1, 4, 14, 11, STONE_D).ellipse(2, 3, 12, 10, STONE).rect(5, 6, 2, 2, '#4ad0ff').rect(9, 8, 2, 2, '#4ad0ff').px(7, 10, '#f2d35a').outline(OUTLINE);
const palm = (): Px => {
  const p = new Px(24, 36).rect(10, 14, 4, 22, '#b07a44').rect(10, 14, 1, 22, '#8a5c30');
  for (const [x0, y0, x1, y1] of [[12, 12, 2, 4], [12, 12, 22, 4], [12, 12, 4, 18], [12, 12, 20, 18], [12, 12, 12, 0]] as const) {
    p.line(x0, y0, x1, y1, LEAF).line(x0 + 1, y0, x1 + 1, y1, LEAF_D);
  }
  p.rect(9, 12, 6, 4, '#8a5c30').rect(10, 13, 2, 2, '#c9a36a');
  return p.outline(OUTLINE);
};
const shell = (v: number): Px => {
  const c = v === 0 ? '#f7d7c0' : '#e8c8e0';
  const p = new Px(16, 16).ellipse(4, 7, 9, 6, c).rect(5, 9, 1, 3, shade(c, 0.8)).rect(8, 8, 1, 4, shade(c, 0.8)).rect(11, 9, 1, 3, shade(c, 0.8));
  return p.outline(OUTLINE);
};
const cactus = (): Px => new Px(16, 24).rect(6, 2, 4, 22, '#4f9a3a').rect(6, 2, 1, 22, '#3f7a2e').rect(1, 8, 3, 2, '#4f9a3a').rect(1, 4, 2, 6, '#4f9a3a').rect(12, 10, 3, 2, '#4f9a3a').rect(13, 6, 2, 6, '#4f9a3a').rect(7, 0, 2, 2, '#e87ab8').outline(OUTLINE);
const signpost = (): Px => new Px(16, 24).rect(7, 8, 2, 16, WOOD_D).rect(1, 3, 14, 6, WOOD_L).rect(1, 3, 14, 1, '#e0b47a').rect(3, 5, 8, 1, WOOD_D).rect(3, 7, 5, 1, WOOD_D).px(13, 5, OUTLINE).outline(OUTLINE);

const stall = (awning: string): Px => {
  const p = new Px(32, 40);
  p.rect(2, 22, 28, 14, WOOD).rect(2, 22, 28, 1, WOOD_L).rect(2, 35, 28, 2, WOOD_D);
  p.rect(3, 10, 2, 14, WOOD_D).rect(27, 10, 2, 14, WOOD_D);
  for (let x = 0; x < 32; x += 4) p.rect(x, 6, 4, 6, x % 8 === 0 ? awning : '#ffffff');
  p.rect(0, 5, 32, 1, shade(awning, 0.7)).rect(0, 12, 32, 1, shade(awning, 0.7));
  p.rect(6, 16, 5, 5, '#f08a2a').rect(13, 15, 5, 6, '#e03a3a').rect(20, 17, 6, 4, '#f5d94a');
  return p.outline(OUTLINE);
};
const lantern = (f: number): Px => new Px(16, 24).rect(7, 8, 2, 16, '#3a3a3a').rect(4, 2, 8, 7, '#3a3a3a').rect(5, 3, 6, 5, f ? '#ffd45a' : '#f5a623').rect(7, 0, 2, 2, '#3a3a3a').rect(3, 22, 10, 2, '#3a3a3a').outline(OUTLINE);

const caveMouth = (): Px => {
  const p = new Px(32, 40).ellipse(0, 4, 32, 36, STONE_D).ellipse(2, 6, 28, 32, STONE).ellipse(8, 14, 16, 26, '#1b1a17').rect(6, 30, 20, 10, '#1b1a17');
  p.rect(10, 2, 4, 3, STONE_L).rect(20, 6, 3, 2, STONE_L).rect(4, 20, 2, 3, STONE_L);
  return p.outline(OUTLINE);
};
const caveExit = (): Px => new Px(16, 16).rect(2, 0, 12, 16, '#3a3a3a').rect(3, 2, 10, 2, STONE).rect(3, 6, 10, 2, STONE).rect(3, 10, 10, 2, STONE).rect(3, 14, 10, 2, STONE).rect(6, 0, 4, 1, '#8fd0f0');
const caveWall = (lit: boolean): Px => {
  const p = new Px(16, 24).rect(0, 0, 16, 24, '#4a4640');
  for (let y = 0; y < 24; y += 6) {
    p.rect(0, y, 16, 1, '#2f2c28');
    for (let x = (y / 6) % 2 === 0 ? 0 : 5; x < 16; x += 9) p.rect(x, y, 1, 6, '#2f2c28');
  }
  p.rect(2, 2, 3, 2, '#5c5850').rect(9, 9, 4, 2, '#5c5850').rect(5, 15, 3, 3, '#5c5850');
  if (lit) p.rect(7, 10, 2, 8, WOOD_D).rect(6, 7, 4, 3, '#f5a623').rect(7, 5, 2, 2, '#ffd45a').px(8, 4, '#fff2a0');
  return p;
};
const treasure = (): Px => {
  const p = new Px(16, 16).rect(1, 5, 14, 10, '#8a5a2a').rect(1, 5, 14, 4, '#b07a44').rect(1, 9, 14, 1, '#6f4a26').rect(6, 8, 4, 3, '#f2d35a').rect(2, 6, 12, 1, '#f2d35a').rect(2, 12, 12, 1, '#f2d35a');
  p.rect(3, 3, 10, 2, '#f2d35a').px(5, 2, '#fff2a0').px(10, 2, '#fff2a0');
  return p.outline(OUTLINE);
};

const bed = (): Px => {
  const p = new Px(16, 36).rect(1, 4, 14, 30, WOOD).rect(1, 4, 14, 2, WOOD_L).rect(2, 8, 12, 24, '#f4f0e6').rect(2, 8, 12, 6, '#ffffff').rect(2, 16, 12, 16, '#d9453b').rect(2, 16, 12, 1, '#ef7a6a');
  for (let y = 19; y < 32; y += 4) p.rect(2, y, 12, 1, '#b5362c');
  p.rect(1, 32, 14, 2, WOOD_D);
  return p.outline(OUTLINE);
};
const rug = (): Px => {
  const p = new Px(32, 32).rect(0, 0, 32, 32, '#b55a4a').rect(2, 2, 28, 28, '#d9736a').rect(5, 5, 22, 22, '#e8a898').rect(9, 9, 14, 14, '#d9736a');
  for (let i = 0; i < 32; i += 4) p.rect(i, 0, 2, 1, '#f0c8b8').rect(i + 2, 31, 2, 1, '#f0c8b8');
  return p;
};
const chair = (): Px => new Px(16, 20).rect(3, 2, 10, 2, WOOD_L).rect(3, 4, 10, 8, WOOD).rect(3, 11, 10, 3, WOOD_L).rect(3, 14, 2, 5, WOOD_D).rect(11, 14, 2, 5, WOOD_D).rect(4, 5, 8, 6, '#d9453b').outline(OUTLINE);
const sofa = (): Px => new Px(32, 20).rect(1, 3, 30, 12, '#3b6fd9').rect(1, 3, 30, 1, '#6a95ea').rect(3, 7, 26, 6, '#5a8fe8').rect(1, 13, 30, 4, '#2f4c8a').rect(2, 17, 3, 2, WOOD_D).rect(27, 17, 3, 2, WOOD_D).rect(0, 5, 3, 12, '#3b6fd9').rect(29, 5, 3, 12, '#3b6fd9').outline(OUTLINE);
const bookshelf = (): Px => {
  const p = new Px(16, 24).rect(1, 0, 14, 24, WOOD_D).rect(2, 1, 12, 22, WOOD);
  const cols = ['#d9453b', '#3b6fd9', '#3ba35b', '#e8c23a', '#8a4fd1', '#e87ab8'];
  for (let shelf = 0; shelf < 3; shelf++) {
    p.rect(2, 7 + shelf * 7, 12, 1, WOOD_D);
    for (let i = 0; i < 5; i++) p.rect(3 + i * 2, 2 + shelf * 7 + (i % 2), 2, 5 - (i % 2), cols[(i + shelf) % cols.length]!);
  }
  return p.outline(OUTLINE);
};
const lamp = (): Px => new Px(16, 24).rect(7, 8, 2, 14, WOOD_D).rect(4, 20, 8, 2, WOOD_D).rect(3, 2, 10, 7, '#f5e04a').rect(4, 1, 8, 1, '#f5e04a').rect(3, 8, 10, 1, '#d9b53a').outline(OUTLINE);
const plant = (): Px => new Px(16, 22).rect(4, 14, 8, 7, '#c0603a').rect(4, 14, 8, 1, '#e0805a').ellipse(2, 2, 12, 12, LEAF).ellipse(5, 0, 6, 6, LEAF_L).rect(7, 10, 2, 5, LEAF_D).outline(OUTLINE);
const painting = (): Px => new Px(16, 14).rect(0, 0, 16, 14, WOOD_L).rect(2, 2, 12, 10, '#8fd0f0').rect(2, 8, 12, 4, '#4f9a3a').circle(10, 5, 2, '#f5e04a').outline(OUTLINE);
const stove = (): Px => {
  const p = new Px(16, 22).rect(1, 6, 14, 16, '#3a3a3a').rect(1, 6, 14, 1, '#5a5a5a').rect(3, 10, 10, 6, '#1b1a17').rect(5, 12, 6, 3, '#f5a623').rect(7, 11, 2, 1, '#ffd45a');
  p.rect(5, 1, 6, 5, '#5a5a5a').rect(6, 0, 4, 1, '#5a5a5a').rect(2, 18, 12, 2, '#5a5a5a');
  return p.outline(OUTLINE);
};
const clock = (): Px => new Px(16, 16).circle(8, 8, 7, WOOD).circle(8, 8, 5, '#f4f0e6').rect(8, 4, 1, 4, OUTLINE).rect(8, 8, 3, 1, OUTLINE).px(8, 8, '#d9453b').outline(OUTLINE);
const doorOut = (): Px => new Px(16, 16).rect(0, 0, 16, 16, '#b9b6ad').rect(1, 1, 14, 14, WOOD).rect(2, 2, 12, 12, WOOD_D).rect(3, 3, 10, 10, WOOD).rect(11, 7, 2, 2, '#f2d35a').rect(5, 12, 6, 1, '#f2d35a');

// ---------------------------------------------------------------------------
// Crops: one 16x16 frame per stage (stages.length growth stages + mature).
// ---------------------------------------------------------------------------

const CROP_COLORS: Record<string, { leaf: string; fruit: string; fruit2?: string }> = {
  carrot: { leaf: '#4f9a3a', fruit: '#f08a2a' },
  potato: { leaf: '#3f7a30', fruit: '#c9a36a' },
  strawberry: { leaf: '#3f8a2e', fruit: '#e03a3a', fruit2: '#ffffff' },
  tomato: { leaf: '#3f8a2e', fruit: '#e04a2a' },
  pumpkin: { leaf: '#4f9a3a', fruit: '#f08a2a' },
  sunflower: { leaf: '#4f9a3a', fruit: '#f5d94a', fruit2: '#6f4a26' },
  wheat: { leaf: '#9ab84a', fruit: '#e6c15a' },
};

export function drawCrops(): Record<string, Px[]> {
  const out: Record<string, Px[]> = {};
  for (const def of Object.values(CROPS)) {
    const n = def.stages.length;
    const col = CROP_COLORS[def.id] ?? { leaf: LEAF, fruit: '#ffffff' };
    const frames: Px[] = [];
    for (let s = 0; s <= n; s++) {
      const p = new Px(16, 16);
      const t = s / n; // 0..1 growth
      const mature = s === n;
      const h = 3 + Math.round(t * 9);
      if (def.id === 'wheat') {
        for (const x of [4, 7, 10, 13]) {
          p.rect(x, 15 - h, 1, h, col.leaf);
          if (t > 0.5) p.rect(x - 1, 15 - h, 3, 2, mature ? col.fruit : shade(col.leaf, 1.3)).rect(x, 15 - h - 2, 1, 2, mature ? col.fruit : col.leaf);
        }
      } else if (def.id === 'sunflower') {
        p.rect(7, 15 - h, 2, h, col.leaf);
        if (t > 0.3) p.rect(4, 12 - Math.round(t * 2), 3, 2, col.leaf).rect(9, 10 - Math.round(t * 2), 3, 2, col.leaf);
        if (mature) p.circle(8, 4, 4, col.fruit).circle(8, 4, 2, col.fruit2!);
        else if (t > 0.6) p.circle(8, 15 - h, 2, shade(col.leaf, 1.2));
      } else {
        // leafy plant growing taller, fruits appear when mature
        p.rect(7, 15 - h, 2, h, col.leaf);
        const leaves = Math.max(1, Math.round(t * 4));
        for (let i = 0; i < leaves; i++) {
          const y = 14 - Math.round((i + 1) * (h / (leaves + 1)));
          const side = i % 2 === 0 ? -1 : 1;
          p.rect(side < 0 ? 4 : 9, y, 3, 2, shade(col.leaf, 1.15)).px(side < 0 ? 4 : 11, y + 1, col.leaf);
        }
        if (mature) {
          if (def.id === 'carrot') p.rect(6, 12, 4, 3, col.fruit).rect(7, 15, 2, 1, col.fruit);
          else if (def.id === 'potato') p.rect(3, 12, 4, 3, col.fruit).rect(9, 13, 4, 3, col.fruit).px(4, 13, shade(col.fruit, 0.8));
          else if (def.id === 'pumpkin') pumpkin(p, 2, 7, 12, 9);
          else if (def.id === 'strawberry') p.rect(4, 8, 2, 3, col.fruit).rect(10, 10, 2, 3, col.fruit).rect(7, 12, 2, 3, col.fruit).px(4, 9, col.fruit2!).px(10, 11, col.fruit2!);
          else if (def.id === 'tomato') p.rect(4, 7, 3, 3, col.fruit).rect(10, 9, 3, 3, col.fruit).rect(6, 11, 3, 3, col.fruit).px(5, 7, '#ff9a7a');
        } else if (def.regrowTo !== undefined && s >= def.regrowTo && t > 0.6) {
          p.rect(5, 9, 2, 2, '#9ad06a').rect(10, 11, 2, 2, '#9ad06a');
        }
      }
      frames.push(p);
    }
    out[def.id] = frames;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Effects, drops, misc
// ---------------------------------------------------------------------------

export function drawFx(): Record<string, Px[]> {
  const heart = new Px(8, 8).tpl(0, 0, ['.##.##..', '#######.', '#######.', '.#####..', '..###...', '...#....'], { '#': '#ff5a8a' }).px(1, 1, '#ffb0c8');
  const sparkle = (f: number) => {
    const p = new Px(8, 8);
    if (f === 0) p.rect(3, 0, 2, 8, '#fff1a0').rect(0, 3, 8, 2, '#fff1a0').rect(3, 3, 2, 2, '#ffffff');
    else p.rect(3, 2, 2, 4, '#fff1a0').rect(2, 3, 4, 2, '#fff1a0');
    return p;
  };
  const water = new Px(6, 8).tpl(0, 0, ['..##..', '.####.', '######', '######', '.####.', '..##..'], { '#': '#6fb6ff' }).px(2, 2, '#d0ecff');
  const chip = new Px(6, 6).rect(1, 1, 4, 3, WOOD_L).rect(1, 4, 4, 1, WOOD_D);
  const poof = (f: number) => new Px(12, 12).circle(6, 6, 4 + f, f === 0 ? '#ffffffcc' : '#ffffff88');
  const coin = new Px(8, 8).circle(4, 4, 3.5, '#f2d35a').circle(4, 4, 2, '#d9b53a').rect(3, 2, 2, 4, '#f7e48a');
  const shadow = new Px(12, 6).ellipse(0, 0, 12, 6, '#00000055');
  const shadowBig = new Px(24, 10).ellipse(0, 0, 24, 10, '#00000066');
  const cursor = new Px(16, 16).box(0, 0, 16, 16, '#ffffff').box(1, 1, 14, 14, '#2b2419');
  const bubble = new Px(16, 14).rect(1, 0, 14, 11, '#ffffff').rect(0, 1, 16, 9, '#ffffff').rect(6, 11, 3, 1, '#ffffff').rect(7, 12, 1, 1, '#ffffff').outline(OUTLINE);
  const hit = new Px(10, 10).tpl(0, 0, ['....##....', '.#..##..#.', '..######..', '.########.', '##########', '##########', '.########.', '..######..', '.#..##..#.', '....##....'], { '#': '#ff5a3a' }).rect(4, 4, 2, 2, '#fff2a0');
  const rocket = new Px(12, 5).rect(0, 1, 9, 3, '#d8d8d8').rect(0, 1, 9, 1, '#ffffff').rect(9, 1, 3, 3, '#e04a2a').px(11, 2, '#ff9a7a').rect(0, 0, 2, 1, '#e04a2a').rect(0, 4, 2, 1, '#e04a2a');
  const smoke = (f: number) => new Px(8, 8).circle(4, 4, 2 + f, f === 0 ? '#d0d0d0cc' : '#b0b0b088');
  const boom = (f: number) => {
    const p = new Px(32, 32);
    const r = 8 + f * 4;
    p.circle(16, 16, r, f < 2 ? '#ff6a2a' : '#ffb24a');
    p.circle(16, 16, Math.max(2, r - 4), f < 2 ? '#ffd24a' : '#fff2a0');
    if (f === 0) p.circle(16, 16, 3, '#ffffff');
    const spikes = [[0, -1], [1, 0], [0, 1], [-1, 0], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [-0.7, -0.7]] as const;
    for (const [sx, sy] of spikes) p.rect(Math.round(16 + sx * (r + 2)) - 1, Math.round(16 + sy * (r + 2)) - 1, 2, 2, '#ff6a2a');
    return p;
  };
  const arrow = new Px(12, 3).rect(0, 1, 10, 1, WOOD_L).rect(9, 0, 3, 3, '#d8d8d8').px(11, 1, '#ffffff').rect(0, 0, 2, 3, '#e04a2a');
  return {
    hit: [hit],
    arrow: [arrow],
    rocket: [rocket],
    smoke: [smoke(0), smoke(1)],
    boom: [boom(0), boom(1), boom(2)],
    heart: [heart],
    sparkle: [sparkle(0), sparkle(1)],
    water: [water],
    chop: [chip],
    poof: [poof(0), poof(1)],
    coin: [coin],
    shadow: [shadow],
    shadowBig: [shadowBig],
    cursor: [cursor],
    bubble: [bubble],
    snow: [new Px(2, 2).rect(0, 0, 2, 2, '#ffffff')],
  };
}

export const EMOTE_GLYPH: Record<string, string> = {
  hjärta: '❤️',
  skratt: '😂',
  hej: '👋',
  hjälp: '🆘',
  titta: '👀',
  sova: '💤',
  fiske: '🎣',
  napp: '❗',
};
