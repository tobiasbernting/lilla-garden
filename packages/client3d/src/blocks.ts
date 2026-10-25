// Minecraft-style 16×16 block textures, painted in code at boot, and the block registry.
import * as THREE from 'three';

export const TEX = 16;
const COLS = 16;

type Painter = (p: Painter2D) => void;

/** Tiny seeded pixel painter for one 16×16 tile in the atlas. */
export class Painter2D {
  private seed: number;
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly ox: number,
    readonly oy: number,
    seed: number,
  ) {
    this.seed = seed * 9301 + 49297;
  }
  rnd(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  px(x: number, y: number, c: string): this {
    if (x < 0 || y < 0 || x >= TEX || y >= TEX) return this;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: string): this {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
    return this;
  }
  clear(x = 0, y = 0, w = TEX, h = TEX): this {
    this.ctx.clearRect(this.ox + x, this.oy + y, w, h);
    return this;
  }
  /** Every pixel a random pick from the palette (weighted towards the first colours). */
  noise(pal: string[], skew = 1.6): this {
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) this.px(x, y, pal[Math.floor(Math.pow(this.rnd(), skew) * pal.length)]!);
    return this;
  }
  /** Sprinkle n single pixels. */
  dots(n: number, pal: string[], area = { x: 0, y: 0, w: TEX, h: TEX }): this {
    for (let i = 0; i < n; i++) this.px(area.x + Math.floor(this.rnd() * area.w), area.y + Math.floor(this.rnd() * area.h), pal[Math.floor(this.rnd() * pal.length)]!);
    return this;
  }
}

// ---------------------------------------------------------------------------- palettes

const GRASS = ['#5f9e3a', '#68a842', '#558f33', '#73b34a', '#4d8530'];
const DIRT = ['#866043', '#79553a', '#96704f', '#6b4a32', '#a07a58'];
const STONE = ['#7d7d7d', '#747474', '#868686', '#6b6b6b', '#8f8f8f'];
const SAND = ['#dbcf9b', '#d4c690', '#e3d8a8', '#c9bb84'];
const GRAVEL = ['#857f7c', '#6e6866', '#9a9391', '#5d5856', '#a8a3a1'];
const OAK = ['#a2834f', '#9a7b48', '#b08f58', '#8d6f40'];
const SPRUCE = ['#6b5131', '#634a2d', '#755a38', '#5a4228'];
const SNOW = ['#f4fbfb', '#eaf3f4', '#ffffff', '#dfe9ec'];
const LEAF = ['#3f7f27', '#4a8f2e', '#36701f', '#56a03a'];
const SPRUCE_LEAF = ['#2f5a33', '#376639', '#284e2b', '#3f7041'];

// ---------------------------------------------------------------------------- painters

const planks = (pal: string[]) => (p: Painter2D) => {
  p.noise(pal, 1.2);
  const dark = pal[3]!;
  for (const y of [3, 7, 11, 15]) p.rect(0, y, 16, 1, dark);
  // plank seams, staggered
  for (const [x, y] of [[4, 0], [12, 4], [7, 8], [1, 12]] as const) p.rect(x, y, 1, 3, dark);
  p.dots(6, [pal[2]!]);
};

const logSide = (pal: string[]) => (p: Painter2D) => {
  for (let x = 0; x < 16; x++) {
    const c = pal[(x * 7 + 3) % pal.length]!;
    for (let y = 0; y < 16; y++) p.px(x, y, p.rnd() < 0.18 ? pal[Math.floor(p.rnd() * pal.length)]! : c);
  }
  p.dots(5, [pal[3]!]);
};

const logTop = (bark: string[], wood: string[]) => (p: Painter2D) => {
  p.noise(bark, 1);
  p.rect(1, 1, 14, 14, wood[0]!);
  for (let r = 0; r < 4; r++) {
    const a = 2 + r * 2;
    const c = wood[r % 2 === 0 ? 1 : 2]!;
    p.rect(a, a, 16 - a * 2, 1, c).rect(a, 15 - a, 16 - a * 2, 1, c).rect(a, a, 1, 16 - a * 2, c).rect(15 - a, a, 1, 16 - a * 2, c);
  }
};

const leaves = (pal: string[], fruit?: string) => (p: Painter2D) => {
  p.clear();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = p.rnd();
      if (r < 0.14) continue; // see-through holes
      p.px(x, y, pal[Math.floor(p.rnd() * pal.length)]!);
    }
  if (fruit) for (const [x, y] of [[3, 4], [11, 2], [7, 10], [13, 12], [2, 13]] as const) p.rect(x, y, 2, 2, fruit).px(x, y, '#ff8a80');
};

const bricks = (mortar: string, pal: string[]) => (p: Painter2D) => {
  p.rect(0, 0, 16, 16, mortar);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let b = -1; b < 2; b++) {
      const x = b * 8 + off;
      for (let y = row * 4; y < row * 4 + 3; y++) for (let xx = x; xx < x + 7; xx++) if (xx >= 0 && xx < 16) p.px(xx, y, pal[Math.floor(p.rnd() * pal.length)]!);
    }
  }
};

const stoneBricks = (p: Painter2D) => {
  p.noise(STONE, 1.3);
  const d = '#5a5a5a';
  const l = '#999999';
  p.rect(0, 7, 16, 1, d).rect(0, 15, 16, 1, d).rect(7, 0, 1, 7, d).rect(3, 8, 1, 7, d).rect(12, 8, 1, 7, d);
  p.rect(0, 0, 16, 1, l).rect(0, 8, 16, 1, l);
};

const cobble = (p: Painter2D) => {
  p.noise(['#7a7a7a', '#5e5e5e', '#8c8c8c', '#4f4f4f'], 1);
  // blobby stones with dark gaps
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(p.rnd() * 14);
    const y = Math.floor(p.rnd() * 14);
    const w = 3 + Math.floor(p.rnd() * 3);
    const h = 2 + Math.floor(p.rnd() * 3);
    p.rect(x, y, w, h, p.rnd() < 0.5 ? '#8f8f8f' : '#a2a2a2').rect(x, y + h - 1, w, 1, '#666666');
  }
  p.dots(18, ['#3f3f3f']);
};

const ore = (spot: string, spot2: string) => (p: Painter2D) => {
  p.noise(STONE, 1.5);
  for (const [x, y] of [[2, 3], [9, 2], [5, 8], [11, 10], [3, 12], [12, 5]] as const) p.rect(x, y, 2, 2, spot).px(x + 1, y + 1, spot2);
};

const wool = (base: string, dark: string, light: string) => (p: Painter2D) => {
  p.rect(0, 0, 16, 16, base);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y * 3) % 5 === 0) p.px(x, y, p.rnd() < 0.5 ? dark : light);
  p.dots(20, [dark, light]);
};

const glass = (p: Painter2D) => {
  p.clear();
  const f = '#dbeff5';
  p.rect(0, 0, 16, 1, f).rect(0, 15, 16, 1, f).rect(0, 0, 1, 16, f).rect(15, 0, 1, 16, f);
  p.px(3, 3, '#ffffff').px(4, 4, '#ffffff').px(5, 5, '#ffffff').px(4, 2, '#ffffff').px(10, 9, '#ffffff').px(11, 10, '#ffffff');
};

const PAINTERS: Record<string, Painter> = {
  white: (p) => p.noise(['#ffffff', '#f2f2f2', '#e8e8e8', '#fafafa'], 1),
  grass_top: (p) => p.noise(GRASS, 1.4).dots(10, ['#7cc152', '#4a7d2c']),
  grass_side: (p) => {
    p.noise(DIRT, 1.4);
    for (let x = 0; x < 16; x++) {
      const d = 3 + Math.floor(p.rnd() * 3) - (x % 3 === 0 ? 1 : 0);
      for (let y = 0; y < d; y++) p.px(x, y, GRASS[Math.floor(p.rnd() * GRASS.length)]!);
    }
  },
  snowy_side: (p) => {
    p.noise(DIRT, 1.4);
    for (let x = 0; x < 16; x++) {
      const d = 3 + Math.floor(p.rnd() * 2) + (x % 4 === 0 ? 1 : 0);
      for (let y = 0; y < d; y++) p.px(x, y, SNOW[Math.floor(p.rnd() * SNOW.length)]!);
    }
  },
  dirt: (p) => p.noise(DIRT, 1.3).dots(6, ['#5a3e2a', '#b18a66']),
  farmland: (p) => {
    p.noise(['#7a5537', '#6d4b30', '#86603f'], 1.2);
    for (const y of [1, 5, 9, 13]) p.rect(0, y, 16, 1, '#4f3522').rect(0, y + 1, 16, 1, '#93694a');
  },
  farmland_wet: (p) => {
    p.noise(['#4a3020', '#432b1c', '#523625'], 1.2);
    for (const y of [1, 5, 9, 13]) p.rect(0, y, 16, 1, '#2c1c12').rect(0, y + 1, 16, 1, '#5b3d29');
  },
  path_top: (p) => p.noise(['#a08350', '#94784a', '#ad9058', '#8a6c3f'], 1.2).dots(8, ['#6d5634']),
  path_side: (p) => {
    p.noise(DIRT, 1.4);
    p.rect(0, 0, 16, 2, '#a08350');
  },
  sand: (p) => p.noise(SAND, 1.2).dots(8, ['#bfae74']),
  gravel: (p) => p.noise(GRAVEL, 1),
  stone: (p) => p.noise(STONE, 1.5).dots(10, ['#626262', '#9a9a9a']),
  cobble,
  mossy_cobble: (p) => {
    cobble(p);
    p.dots(30, ['#5b7a3a', '#4d6b30', '#6a8a45']);
  },
  stone_bricks: stoneBricks,
  smooth_stone: (p) => {
    p.noise(['#a8a8a8', '#a2a2a2', '#b0b0b0'], 1);
    p.rect(0, 0, 16, 1, '#c4c4c4').rect(0, 15, 16, 1, '#7c7c7c');
  },
  planks_oak: planks(OAK),
  planks_spruce: planks(SPRUCE),
  planks_birch: planks(['#d7c185', '#cdb67a', '#e0cc93', '#bca66a']),
  planks_dark: planks(['#4a3220', '#432d1c', '#523826', '#3a2716']),
  log_oak: logSide(['#6b5131', '#5c4529', '#78603b', '#4a3720']),
  log_oak_top: logTop(['#6b5131', '#5c4529'], ['#b8945c', '#a2814d', '#c7a46b']),
  log_spruce: logSide(['#3d2a17', '#342313', '#47321d', '#2a1c0f']),
  log_birch: (p) => {
    p.noise(['#e8e6dc', '#dcdad0', '#f2f0e6'], 1);
    for (let i = 0; i < 6; i++) p.rect(Math.floor(p.rnd() * 13), Math.floor(p.rnd() * 15), 2 + Math.floor(p.rnd() * 3), 1, '#3a3a34');
  },
  log_palm: logSide(['#8c6a3f', '#7d5d36', '#9a7748', '#6b4f2c']),
  leaves_oak: leaves(LEAF),
  leaves_apple: leaves(LEAF, '#d8322a'),
  leaves_spruce: leaves(SPRUCE_LEAF),
  leaves_palm: leaves(['#4f9a2e', '#5aab36', '#448526', '#67b843']),
  leaves_snowy: (p) => {
    leaves(SPRUCE_LEAF)(p);
    p.dots(28, SNOW);
  },
  snow: (p) => p.noise(SNOW, 1.2),
  ice: (p) => {
    p.noise(['#9cc4f5', '#92bbef', '#a8ccf8', '#8ab3e8'], 1);
    for (let i = 0; i < 5; i++) p.rect(Math.floor(p.rnd() * 12), Math.floor(p.rnd() * 15), 4, 1, '#c8e0fc');
  },
  water: (p) => p.noise(['#3f76e4', '#3b6fd8', '#4680ec', '#3568cc'], 1.1).dots(10, ['#6a9cf2']),
  asphalt: (p) => p.noise(['#3b3b3d', '#363638', '#414143', '#2f2f31'], 1).dots(8, ['#55555a']),
  crossing: (p) => {
    p.noise(['#3b3b3d', '#363638', '#414143'], 1);
    for (const x of [1, 9]) p.rect(x, 0, 5, 16, '#e8e8e8').dots(6, ['#c8c8c8'], { x, y: 0, w: 5, h: 16 });
  },
  sidewalk: (p) => {
    p.noise(['#b9b6ad', '#b0ada4', '#c2bfb6'], 1);
    p.rect(0, 0, 16, 1, '#8f8c84').rect(0, 0, 1, 16, '#8f8c84').rect(0, 8, 16, 1, '#a09d95').rect(8, 0, 1, 16, '#a09d95');
  },
  rail: (p) => {
    p.noise(GRAVEL, 1);
    for (const y of [1, 5, 9, 13]) p.rect(0, y, 16, 2, '#6b4f30').rect(0, y + 1, 16, 1, '#523b22');
    p.rect(3, 0, 2, 16, '#a8a8b0').rect(11, 0, 2, 16, '#a8a8b0').rect(3, 0, 1, 16, '#d0d0d8').rect(11, 0, 1, 16, '#d0d0d8');
  },
  bricks: bricks('#9c9384', ['#96503d', '#8a4734', '#a35a45', '#7f3f2e']),
  terracotta: (p) => p.noise(['#a05a3c', '#985436', '#a86042'], 1),
  roof_red: (p) => {
    p.noise(['#8e2e24', '#842a20', '#99342a'], 1);
    for (const y of [3, 7, 11, 15]) p.rect(0, y, 16, 1, '#5c1a14');
  },
  roof_blue: (p) => {
    p.noise(['#3b5a8a', '#355282', '#426396'], 1);
    for (const y of [3, 7, 11, 15]) p.rect(0, y, 16, 1, '#223650');
  },
  glass,
  crafting_top: (p) => {
    planks(OAK)(p);
    p.rect(0, 0, 16, 1, '#5c4529').rect(0, 15, 16, 1, '#5c4529').rect(0, 0, 1, 16, '#5c4529').rect(15, 0, 1, 16, '#5c4529');
    p.rect(2, 2, 12, 12, '#b08f58').rect(2, 7, 12, 1, '#6b5131').rect(7, 2, 1, 12, '#6b5131');
  },
  crafting_side: (p) => {
    planks(OAK)(p);
    p.rect(0, 0, 16, 3, '#6b5131');
    p.rect(2, 5, 2, 8, '#8a8a8a').rect(1, 5, 4, 2, '#a8a8a8'); // hammer
    p.rect(10, 4, 1, 9, '#6b5131').rect(9, 4, 4, 2, '#c8c8c8'); // saw
  },
  furnace_side: (p) => {
    cobble(p);
  },
  furnace_front: (p) => {
    p.noise(['#7a7a7a', '#6e6e6e', '#868686'], 1);
    p.rect(3, 3, 10, 3, '#4a4a4a').rect(3, 9, 10, 5, '#1f1f1f').rect(4, 11, 8, 3, '#f0a020').rect(5, 12, 6, 2, '#ffd34d');
  },
  furnace_top: (p) => p.noise(['#7a7a7a', '#6e6e6e', '#868686', '#5f5f5f'], 1),
  bookshelf: (p) => {
    planks(OAK)(p);
    const cols = ['#b02e26', '#3c44aa', '#5e7c16', '#f9801d', '#835432', '#ffd83d', '#169c9c'];
    for (const y0 of [1, 9]) {
      p.rect(0, y0 + 5, 16, 1, '#5c4529');
      for (let x = 1; x < 15; x += 2) p.rect(x, y0 + (p.rnd() < 0.3 ? 1 : 0), 2, 5, cols[Math.floor(p.rnd() * cols.length)]!).px(x, y0 + 1, '#ffffff33');
    }
  },
  pumpkin_side: (p) => {
    p.noise(['#e3901d', '#d9861a', '#ec9a28'], 1);
    for (const x of [0, 4, 8, 12]) p.rect(x, 0, 1, 16, '#b86a10');
  },
  pumpkin_top: (p) => {
    p.noise(['#e3901d', '#d9861a', '#ec9a28'], 1);
    p.rect(6, 6, 4, 4, '#5e7c16').rect(7, 7, 2, 2, '#4a6312');
  },
  pumpkin_face: (p) => {
    PAINTERS.pumpkin_side!(p);
    p.rect(3, 4, 3, 3, '#3a1f05').rect(10, 4, 3, 3, '#3a1f05').rect(3, 10, 10, 2, '#3a1f05').rect(5, 12, 2, 1, '#3a1f05').rect(9, 12, 2, 1, '#3a1f05');
  },
  lantern_face: (p) => {
    PAINTERS.pumpkin_side!(p);
    p.rect(3, 4, 3, 3, '#ffd34d').rect(10, 4, 3, 3, '#ffd34d').rect(3, 10, 10, 2, '#ffd34d').rect(5, 12, 2, 1, '#ffd34d').rect(9, 12, 2, 1, '#ffd34d');
  },
  hay_side: (p) => {
    p.noise(['#c9a52c', '#b8941f', '#d8b43a', '#a88618'], 1);
    p.rect(0, 3, 16, 1, '#7a5a10').rect(0, 12, 16, 1, '#7a5a10');
  },
  hay_top: (p) => p.noise(['#c9a52c', '#b8941f', '#d8b43a', '#a88618'], 1).dots(10, ['#7a5a10']),
  cactus_side: (p) => {
    p.noise(['#2f7a1f', '#2a6e1b', '#358a24'], 1);
    for (const x of [2, 7, 12]) {
      p.rect(x, 0, 1, 16, '#1f5413');
      for (let y = 1; y < 16; y += 4) p.px(x + 1, y, '#e8e0b0');
    }
  },
  cactus_top: (p) => {
    p.noise(['#358a24', '#2f7a1f'], 1);
    p.rect(3, 3, 10, 10, '#4a9a35').rect(6, 6, 4, 4, '#5fb048');
  },
  beehive: (p) => {
    p.noise(['#d4a440', '#c99a38', '#ddb04c'], 1);
    for (const y of [2, 6, 10, 14]) p.rect(0, y, 16, 1, '#a0742a');
  },
  beehive_front: (p) => {
    PAINTERS.beehive!(p);
    p.rect(5, 8, 6, 4, '#3a2a12');
  },
  stone_dark: (p) => p.noise(['#4a4a4f', '#424247', '#545459', '#3a3a3f'], 1.2).dots(12, ['#2f2f33', '#626268']),
  glowstone: (p) => p.noise(['#f8d478', '#e8b64c', '#ffe9a8', '#c08a30'], 1),
  gold_block: (p) => {
    p.noise(['#f5d63d', '#eac72c', '#fde46a'], 1);
    p.rect(0, 0, 16, 1, '#fff2a0').rect(0, 15, 16, 1, '#b8901a');
  },
  ore_coal: ore('#2a2a2a', '#444444'),
  ore_gold: ore('#f5d63d', '#fff2a0'),
  ore_crystal: ore('#7ad6e8', '#c8f4ff'),
  red_wool: wool('#a12722', '#8a1f1a', '#b8302a'),
  white_wool: wool('#e9ecec', '#d4d8d8', '#ffffff'),
  yellow_wool: wool('#f8c627', '#e0b01c', '#ffd84a'),
  blue_wool: wool('#35399d', '#2b2f88', '#4044b0'),
  green_wool: wool('#546d1b', '#465c15', '#627e22'),
  pink_wool: wool('#ed8dac', '#d97a99', '#f5a3be'),
  orange_wool: wool('#f07613', '#d9680f', '#ff8a2a'),
  black_wool: wool('#1d1d21', '#141417', '#29292e'),
  quartz: (p) => p.noise(['#ece6df', '#e5ded6', '#f2ede7'], 1),
  door_oak_bottom: (p) => {
    planks(OAK)(p);
    p.rect(0, 0, 16, 16, '#9a7b48');
    p.rect(1, 1, 14, 14, '#b08f58').rect(3, 3, 4, 10, '#8d6f40').rect(9, 3, 4, 10, '#8d6f40').rect(11, 6, 2, 2, '#3a2a12');
  },
  door_oak_top: (p) => {
    p.rect(0, 0, 16, 16, '#9a7b48');
    p.rect(1, 1, 14, 14, '#b08f58').rect(3, 3, 4, 10, '#a8d8f0').rect(9, 3, 4, 10, '#a8d8f0').px(4, 4, '#ffffff').px(10, 4, '#ffffff');
  },
  bed_red: wool('#b02e26', '#951f18', '#c23a30'),
  rug: (p) => {
    p.rect(0, 0, 16, 16, '#c0503a');
    p.rect(1, 1, 14, 14, '#e2a04a').rect(3, 3, 10, 10, '#c0503a').rect(5, 5, 6, 6, '#3c6aa0');
  },
  water_flow: (p) => p.noise(['#3f76e4', '#3b6fd8', '#4680ec', '#3568cc'], 1.1),
  obsidian: (p) => p.noise(['#14101c', '#1d1628', '#0e0b14', '#2b2240'], 1),
  netherrack_dark: (p) => p.noise(['#3a2b26', '#30231f', '#45342e'], 1),
  sign: planks(['#b08f58', '#a2834f', '#c09a62', '#8d6f40']),
  shop_window: (p) => {
    p.rect(0, 0, 16, 16, '#3a3a3a');
    p.rect(1, 1, 14, 14, '#9fd0ea').rect(2, 2, 3, 1, '#ffffff').rect(2, 3, 1, 2, '#ffffff');
  },
  lit_window: (p) => {
    p.rect(0, 0, 16, 16, '#5c4529');
    p.rect(2, 2, 12, 12, '#ffd77a').rect(7, 2, 2, 12, '#5c4529').rect(2, 7, 12, 2, '#5c4529');
  },
  dark_opening: (p) => p.noise(['#0b0b0e', '#101014', '#08080a'], 1),
  cow_hide: (p) => {
    p.noise(['#4a3220', '#432d1c', '#523826'], 1);
    for (const [x, y, w, h] of [[1, 2, 5, 4], [9, 1, 4, 3], [10, 8, 5, 5], [2, 10, 4, 4]] as const) p.rect(x, y, w, h, '#ecebe6').dots(3, ['#d8d6cf'], { x, y, w, h });
  },
  tall_grass: (p) => {
    p.clear();
    for (let i = 0; i < 9; i++) {
      const x = 1 + Math.floor(p.rnd() * 14);
      const h = 6 + Math.floor(p.rnd() * 9);
      for (let y = 0; y < h; y++) p.px(x + (y > h * 0.6 && i % 2 ? 1 : 0), 15 - y, GRASS[Math.floor(p.rnd() * GRASS.length)]!);
    }
  },
  melon: (p) => {
    p.noise(['#6f9a25', '#5f8a1c', '#7aa82c'], 1);
    for (const x of [1, 6, 11]) p.rect(x, 0, 2, 16, '#a8c84a');
  },
};

// Paint buckets (PAINT_COLORS 1..6 in the 2D art): smooth, concrete-like colours
['#c9433c', '#f0d060', '#6a9fd8', '#7fb86a', '#f4f2ec', '#f0a8c8'].forEach((c, i) => {
  PAINTERS[`paint_${i + 1}`] = (p) => {
    p.rect(0, 0, 16, 16, c);
    p.dots(24, ['#00000014', '#ffffff1c']);
  };
});

// ---------------------------------------------------------------------------- atlas

const tileIndex = new Map<string, number>();
let atlasCanvas: HTMLCanvasElement | null = null;
let atlasTex: THREE.Texture | null = null;

function buildAtlas(): HTMLCanvasElement {
  const names = Object.keys(PAINTERS);
  const rows = Math.ceil(names.length / COLS);
  const c = document.createElement('canvas');
  c.width = COLS * TEX;
  c.height = Math.max(1, rows) * TEX;
  // power-of-two height keeps older tablets happy
  c.height = Math.pow(2, Math.ceil(Math.log2(c.height)));
  const ctx = c.getContext('2d')!;
  names.forEach((name, i) => {
    tileIndex.set(name, i);
    const ox = (i % COLS) * TEX;
    const oy = Math.floor(i / COLS) * TEX;
    PAINTERS[name]!(new Painter2D(ctx, ox, oy, i + 1));
  });
  return c;
}

export function atlas(): { canvas: HTMLCanvasElement; texture: THREE.Texture } {
  if (!atlasCanvas) atlasCanvas = buildAtlas();
  if (!atlasTex) {
    atlasTex = new THREE.CanvasTexture(atlasCanvas);
    atlasTex.magFilter = THREE.NearestFilter;
    atlasTex.minFilter = THREE.NearestFilter;
    atlasTex.generateMipmaps = false;
  }
  return { canvas: atlasCanvas, texture: atlasTex };
}

/** UV rectangle [u0, v0, u1, v1] of a sub-rectangle (in texels) of a tile; v grows upwards. */
export function tileUV(name: string, x0 = 0, y0 = 0, x1 = TEX, y1 = TEX): [number, number, number, number] {
  const { canvas } = atlas();
  const i = tileIndex.get(name) ?? tileIndex.get('white')!;
  const ox = (i % COLS) * TEX;
  const oy = Math.floor(i / COLS) * TEX;
  const W = canvas.width;
  const H = canvas.height;
  // a hair inside the texel edges so neighbours never bleed in
  const e = 0.02;
  return [(ox + x0 + e) / W, 1 - (oy + y1 - e) / H, (ox + x1 - e) / W, 1 - (oy + y0 + e) / H];
}

export const hasTile = (name: string): boolean => {
  atlas();
  return tileIndex.has(name);
};

// ---------------------------------------------------------------------------- blocks

export interface BlockDef {
  name: string;
  /** Tile per face: top, bottom, side (north/south/east/west may override). */
  top: string;
  bottom: string;
  side: string;
  north?: string;
  south?: string;
  east?: string;
  west?: string;
  /** Occludes neighbours and casts ambient occlusion. */
  opaque: boolean;
  /** Cut-out texture (leaves, glass): faces towards the same block are hidden when `cullSelf`. */
  cutout?: boolean;
  cullSelf?: boolean;
  /** Emits block light (0..15). */
  light?: number;
  /** Rendered in the translucent water pass. */
  liquid?: boolean;
  /** Top surface sits lower (farmland and paths: 15/16). */
  topInset?: number;
}

export const AIR = 0;
export const BLOCKS: BlockDef[] = [{ name: 'air', top: 'white', bottom: 'white', side: 'white', opaque: false }];
export const BLOCK = {} as Record<string, number>;

const add = (d: Omit<BlockDef, 'top' | 'bottom' | 'side' | 'opaque'> & Partial<BlockDef> & { all?: string }): number => {
  const all = d.all ?? d.name;
  const def: BlockDef = { top: all, bottom: all, side: all, opaque: true, ...d } as BlockDef;
  BLOCKS.push(def);
  BLOCK[d.name] = BLOCKS.length - 1;
  return BLOCKS.length - 1;
};

add({ name: 'grass', top: 'grass_top', side: 'grass_side', bottom: 'dirt' });
add({ name: 'snowy_grass', top: 'snow', side: 'snowy_side', bottom: 'dirt' });
add({ name: 'dirt' });
add({ name: 'farmland', top: 'farmland', side: 'dirt', bottom: 'dirt', topInset: 1 });
add({ name: 'farmland_wet', top: 'farmland_wet', side: 'dirt', bottom: 'dirt', topInset: 1 });
add({ name: 'path', top: 'path_top', side: 'path_side', bottom: 'dirt', topInset: 1 });
add({ name: 'sand' });
add({ name: 'gravel' });
add({ name: 'stone' });
add({ name: 'cobble' });
add({ name: 'mossy_cobble' });
add({ name: 'stone_bricks' });
add({ name: 'smooth_stone' });
add({ name: 'planks_oak' });
add({ name: 'planks_spruce' });
add({ name: 'planks_birch' });
add({ name: 'planks_dark' });
add({ name: 'log_oak', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_oak' });
add({ name: 'log_spruce', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_spruce' });
add({ name: 'log_birch', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_birch' });
add({ name: 'log_palm', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_palm' });
add({ name: 'leaves_oak', opaque: false, cutout: true });
add({ name: 'leaves_apple', opaque: false, cutout: true });
add({ name: 'leaves_spruce', opaque: false, cutout: true });
add({ name: 'leaves_palm', opaque: false, cutout: true });
add({ name: 'leaves_snowy', opaque: false, cutout: true });
add({ name: 'snow' });
add({ name: 'ice' });
add({ name: 'water', opaque: false, liquid: true });
add({ name: 'asphalt' });
add({ name: 'crossing', top: 'crossing', side: 'asphalt', bottom: 'asphalt' });
add({ name: 'sidewalk', top: 'sidewalk', side: 'smooth_stone', bottom: 'smooth_stone' });
add({ name: 'rail', top: 'rail', side: 'gravel', bottom: 'gravel' });
add({ name: 'bricks' });
add({ name: 'terracotta' });
add({ name: 'roof_red' });
add({ name: 'roof_blue' });
add({ name: 'glass', opaque: false, cutout: true, cullSelf: true });
add({ name: 'crafting', top: 'crafting_top', side: 'crafting_side', bottom: 'planks_oak' });
add({ name: 'furnace', top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', south: 'furnace_front', light: 13 });
add({ name: 'bookshelf', top: 'planks_oak', bottom: 'planks_oak', side: 'bookshelf' });
add({ name: 'pumpkin', top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', south: 'pumpkin_face' });
add({ name: 'jack_o_lantern', top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', south: 'lantern_face', light: 14 });
add({ name: 'hay', top: 'hay_top', bottom: 'hay_top', side: 'hay_side' });
add({ name: 'cactus', top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' });
add({ name: 'beehive', top: 'hay_top', bottom: 'beehive', side: 'beehive', south: 'beehive_front' });
add({ name: 'stone_dark' });
add({ name: 'glowstone', light: 15 });
add({ name: 'gold_block' });
add({ name: 'ore_coal' });
add({ name: 'ore_gold' });
add({ name: 'ore_crystal', light: 6 });
add({ name: 'red_wool' });
add({ name: 'white_wool' });
add({ name: 'yellow_wool' });
add({ name: 'blue_wool' });
add({ name: 'green_wool' });
add({ name: 'pink_wool' });
add({ name: 'orange_wool' });
add({ name: 'black_wool' });
add({ name: 'quartz' });
add({ name: 'shop_window', opaque: true });
add({ name: 'lit_window', light: 10 });
add({ name: 'dark_opening' });
add({ name: 'obsidian' });
add({ name: 'melon' });
add({ name: 'cow_hide' });
for (let i = 1; i <= 6; i++) add({ name: `paint_${i}` });

export const blockTile = (b: BlockDef, face: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west'): string =>
  face === 'top' ? b.top : face === 'bottom' ? b.bottom : (b[face] ?? b.side);
