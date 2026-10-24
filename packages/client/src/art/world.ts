// Terrain tiles, world objects, crops and effects — all drawn in code.
import { CROPS, type Terrain } from '@lilla-garden/shared';
import { Px, hash2, shade } from './px.js';

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
  /** frame index per terrain (+variant) */
  index: (t: Terrain, x: number, y: number, snow: boolean) => number;
  waterFrames: [number, number];
  count: number;
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

  // grass x4
  const grass: number[] = [];
  for (let v = 0; v < 4; v++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#5f9f3c');
    speck(p, 100 + v, 5, '#4f8a31', 2);
    speck(p, 200 + v, 3, '#7ab84f', 1);
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
  // soil, soil_wet
  const soil = (base: string, dark: string) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, base);
    for (let y = 2; y < 16; y += 4) p.rect(0, y, 16, 1, dark);
    speck(p, 500, 6, dark, 1);
    return add(p);
  };
  const soilI = soil('#9a6a3a', '#7a5028');
  const soilWetI = soil('#5f3d1d', '#452a12');
  // water x2
  const water: number[] = [];
  for (let f = 0; f < 2; f++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#3f86d6');
    const o = f * 2;
    p.rect(2 + o, 3, 4, 1, '#7fb6ee').rect(9 + o, 8, 4, 1, '#7fb6ee').rect(4 - o, 12, 3, 1, '#7fb6ee').rect(11 - o, 1, 3, 1, '#2d6cb8');
    water.push(add(p));
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

  const sheet = new Px(16 * tiles.length, 16);
  tiles.forEach((t, i) => sheet.blit(t, i * 16, 0));
  return {
    canvas: sheet.canvas,
    count: tiles.length,
    waterFrames: [water[0]!, water[1]!],
    index: (t, x, y, snowy) => {
      const h = hash2(x, y);
      switch (t) {
        case 'grass':
          return snowy ? snow[h % 2]! : grass[h % 4]!;
        case 'soil':
          return soilI;
        case 'soil_wet':
          return soilWetI;
        case 'water':
          return water[0]!;
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

const tree = (kind: 'round' | 'pine' | 'apple'): Px => {
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

const fence = (gate = false): Px => {
  const p = new Px(16, 16);
  p.rect(0, 6, 16, 2, WOOD).rect(0, 11, 16, 2, WOOD);
  p.rect(2, 3, 3, 12, WOOD_L).rect(11, 3, 3, 12, WOOD_L).rect(2, 3, 3, 1, '#e0b47a').rect(11, 3, 3, 1, '#e0b47a');
  if (gate) p.line(5, 13, 10, 7, WOOD_D).line(5, 12, 10, 6, WOOD_D);
  return p.outline(OUTLINE);
};

const wall = (stone: boolean): Px => {
  const p = new Px(16, 24);
  if (stone) {
    p.rect(0, 0, 16, 24, STONE);
    for (let y = 0; y < 24; y += 4) {
      p.rect(0, y, 16, 1, STONE_D);
      for (let x = (y / 4) % 2 === 0 ? 0 : 4; x < 16; x += 8) p.rect(x, y, 1, 4, STONE_D);
    }
  } else {
    p.rect(0, 0, 16, 24, WOOD);
    for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 24, WOOD_D);
    p.rect(0, 0, 16, 1, WOOD_L);
  }
  return p.outline(OUTLINE);
};

const door = (): Px => {
  const p = new Px(16, 24).rect(1, 0, 14, 24, WOOD).rect(1, 0, 14, 1, WOOD_L).rect(3, 2, 10, 20, WOOD_D).rect(4, 3, 8, 18, WOOD).rect(11, 12, 2, 2, '#f2d35a');
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

const house = (): Px => {
  const p = new Px(80, 84);
  // walls
  p.rect(2, 34, 76, 49, '#e8dcc0').rect(2, 34, 76, 1, '#f5efe0');
  for (let x = 2; x < 78; x += 6) p.rect(x, 34, 1, 49, '#d4c7a8');
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
  for (const wx of [10, 60]) p.rect(wx, 44, 12, 11, '#8fd0f0').rect(wx + 5, 44, 2, 11, WOOD_D).rect(wx, 49, 12, 1, WOOD_D).box(wx - 1, 43, 14, 13, '#7a5230').rect(wx - 2, 56, 16, 2, '#7a5230');
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
  set('tree', [tree('round')], -2, -16);
  set('tree_pine', [tree('pine')], -2, -16);
  set('tree_apple', [tree('apple')], -2, -16);
  set('stump', [stump()]);
  set('rock', [rock(true)]);
  set('rock_small', [rock(false)]);
  set('grass_tuft', [tuft(0), tuft(1), tuft(2)]);
  set('flower', [flower(0), flower(1), flower(2), flower(3)]);
  set('bush', [bush()]);
  set('wild_pumpkin', [pumpkin(new Px(16, 16), 2, 5, 12, 10).outline(OUTLINE)]);
  set('wild_flower_mid', [flower(0, true), flower(1, true), flower(2, true)]);
  set('fence', [fence()]);
  set('gate', [fence(true)]);
  set('wall_wood', [wall(false)], 0, -8);
  set('wall_stone', [wall(true)], 0, -8);
  set('door', [door()], 0, -8);
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
  set('house', [house()], 0, -20);
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
  return art;
}

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
  const cursor = new Px(16, 16).box(0, 0, 16, 16, '#ffffff').box(1, 1, 14, 14, '#2b2419');
  const bubble = new Px(16, 14).rect(1, 0, 14, 11, '#ffffff').rect(0, 1, 16, 9, '#ffffff').rect(6, 11, 3, 1, '#ffffff').rect(7, 12, 1, 1, '#ffffff').outline(OUTLINE);
  return {
    heart: [heart],
    sparkle: [sparkle(0), sparkle(1)],
    water: [water],
    chop: [chip],
    poof: [poof(0), poof(1)],
    coin: [coin],
    shadow: [shadow],
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
