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
  leaves_birch: leaves(['#6a9a3a', '#7aab46', '#5e8a33', '#86b852']),
  leaves_dark: leaves(['#2b5a1c', '#336a22', '#244c17', '#3b7428']),
  leaves_cherry: leaves(['#f2a6c8', '#f7bdd6', '#e88fb8', '#fbd0e2']),
  log_dark: logSide(['#3b2a1a', '#33241a', '#45321f', '#2a1d12']),
  log_redwood: logSide(['#8a3f24', '#7a361f', '#9a4a2c', '#682c18']),
  log_cherry: logSide(['#4a2a2e', '#3f2428', '#553236', '#341d21']),
  bedrock: (p) => p.noise(['#3a3a3a', '#575757', '#2a2a2a', '#6a6a6a', '#1f1f1f'], 1),
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

// ---------------------------------------------------------------------------- the wider world

const pick = (p: Painter2D, pal: readonly string[]): string => pal[Math.floor(p.rnd() * pal.length)]!;
/** A wavy line across the tile (x → y), for veins and swirls. */
const wave = (p: Painter2D, y0: number, amp: number, freq: number, phase: number, c: string, thick = 1): void => {
  for (let x = 0; x < 16; x++) {
    const y = Math.round(y0 + Math.sin(x * freq + phase) * amp);
    for (let t = 0; t < thick; t++) p.px(x, (y + t + 16) % 16, c);
  }
};
/** Little 2-pixel sprinkles in candy colours. */
const sprinkles = (p: Painter2D, n: number): void => {
  const cols = ['#ffffff', '#ffe066', '#78cff0', '#9be37a', '#ff6f91', '#b48cf0'];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(p.rnd() * 15);
    const y = Math.floor(p.rnd() * 15);
    if (p.rnd() < 0.5) p.rect(x, y, 2, 1, pick(p, cols));
    else p.rect(x, y, 1, 2, pick(p, cols));
  }
};
/** A ground's top colour running down over earth, like the side of a grass block. */
const capSide = (top: readonly string[], under: readonly string[], deep = 3) => (p: Painter2D) => {
  p.noise([...under], 1.4);
  for (let x = 0; x < 16; x++) {
    const d = deep + Math.floor(p.rnd() * 2) - (x % 3 === 0 ? 1 : 0);
    for (let y = 0; y < d; y++) p.px(x, y, pick(p, top));
  }
};
/** A crack wandering across the tile. */
const crack = (p: Painter2D, c: string, glow?: string): void => {
  let x = Math.floor(p.rnd() * 16);
  let y = 0;
  while (y < 16) {
    p.px(x, y, c);
    if (glow && p.rnd() < 0.5) p.px(x + 1, y, glow);
    y += 1;
    x += p.rnd() < 0.35 ? -1 : p.rnd() < 0.5 ? 1 : 0;
  }
};

const LAVA = ['#d8460f', '#e85a16', '#c63a0c', '#f06e1c'];
const BOG = ['#3f4b28', '#46532d', '#384422', '#4d5a32'];
const CHOCO = ['#5b311a', '#522c17', '#66381e', '#4a2614'];
const CANDY = ['#f6b3d0', '#f3a6c7', '#f9c1d9', '#f09cc0'];
const MOON_DUST = ['#cfcfc9', '#c5c5bf', '#d8d8d2', '#bcbcb6'];
const MOON_ROCK = ['#8f8f8a', '#86867f', '#99998f', '#7c7c76'];
const ASH = ['#4b4845', '#43403d', '#545049', '#3b3936'];
const MUD = ['#5d4231', '#53392a', '#674a37', '#4a3324'];
const MOSS = ['#3e917b', '#378573', '#47a08a', '#327a69'];
const REDSAND = ['#c9663b', '#bf5d35', '#d27044', '#b45630'];
const SANDSTONE = ['#c97a42', '#bf6e3a', '#d48a50', '#b8663a'];
const BASALT = ['#2b2b30', '#25252a', '#323238', '#1f1f24'];
const DESERT_BRICK = ['#e4c88c', '#dcc084', '#ead096', '#d6b87a'];
const GINGER = ['#a9652e', '#a05e2a', '#b26e34', '#985626'];
const STEM = ['#e8e0cc', '#ded6c0', '#f0e8d6'];

Object.assign(PAINTERS, {
  // liquids (each scrolls in its own texture, see Voxels)
  lava: (p: Painter2D) => {
    p.noise(LAVA, 1.1);
    wave(p, 4, 1.6, 0.7, 0, '#ffb52e', 2);
    wave(p, 11, 1.4, 0.5, 2, '#ffa422');
    p.dots(12, ['#ffe27a', '#fff2b0']);
    p.dots(9, ['#9a2a0a', '#7a1e08']);
  },
  bog: (p: Painter2D) => {
    p.noise(BOG, 1.2);
    wave(p, 6, 1, 0.5, 1, '#55623a');
    p.dots(16, ['#6f8f36', '#7fa040', '#5d7a2c']);
    p.dots(6, ['#2a3218']);
  },
  choco: (p: Painter2D) => {
    p.noise(CHOCO, 1.1);
    wave(p, 5, 1.5, 0.6, 0, '#7c4a2a');
    wave(p, 12, 1.5, 0.6, 3, '#744426');
    p.dots(6, ['#8e5a36']);
  },
  // the wider world's grounds
  candy: (p: Painter2D) => {
    p.noise(CANDY, 1.2);
    sprinkles(p, 12);
  },
  candy_side: (p: Painter2D) => {
    p.noise(['#f3a6c7', '#ee98bd', '#f5b0cd'], 1.2);
    p.rect(0, 9, 16, 1, '#e888b0');
    sprinkles(p, 4);
    // white icing running down
    for (let x = 0; x < 16; x++) p.rect(x, 0, 1, 2 + (p.rnd() < 0.35 ? 2 : p.rnd() < 0.5 ? 1 : 0), p.rnd() < 0.15 ? '#ffe2ef' : '#fff6fa');
  },
  moon_dust: (p: Painter2D) => {
    p.noise(MOON_DUST, 1.2);
    for (const [x, y] of [[3, 4], [11, 9], [6, 12]] as const) p.rect(x, y, 2, 1, '#a9a9a3').px(x, y + 1, '#e2e2dc');
    p.dots(10, ['#b0b0aa', '#e4e4de']);
  },
  moon_rock: (p: Painter2D) => {
    p.noise(MOON_ROCK, 1.3);
    for (const [x, y] of [[2, 2], [10, 5], [5, 10], [12, 12]] as const) p.rect(x, y, 2, 2, '#6a6a65').px(x + 1, y + 1, '#a8a8a2');
    p.dots(8, ['#70706b']);
  },
  ash: (p: Painter2D) => {
    p.noise(ASH, 1.2);
    p.dots(10, ['#625e59', '#33312e']);
    p.dots(4, ['#ff6a1a', '#ffa030', '#e04a12']);
  },
  ash_side: (p: Painter2D) => {
    p.noise(ASH, 1.3);
    p.dots(14, ['#33312e', '#5a5651']);
    p.dots(2, ['#ff6a1a']);
  },
  mud: (p: Painter2D) => {
    p.noise(MUD, 1.2);
    p.rect(3, 9, 4, 2, '#3e2b1e').rect(4, 10, 2, 1, '#6b5040');
    p.dots(10, ['#7d5d45', '#866650', '#3e2b1e']);
  },
  moss_top: (p: Painter2D) => {
    p.noise(MOSS, 1.3);
    p.dots(14, ['#6cc6ad', '#2a6658', '#58b49a']);
  },
  moss_side: capSide(MOSS, DIRT, 4),
  redsand: (p: Painter2D) => {
    p.noise(REDSAND, 1.2);
    p.dots(10, ['#a84c2a', '#de8050']);
  },
  sandstone: (p: Painter2D) => {
    // wavy layers of red rock, a crack or two
    for (let x = 0; x < 16; x++) {
      const off = Math.round(Math.sin(x * 0.55) * 1.2);
      for (let y = 0; y < 16; y++) {
        const band = SANDSTONE[Math.floor((y + off + 16) / 5) % SANDSTONE.length]!;
        p.px(x, y, p.rnd() < 0.3 ? pick(p, SANDSTONE) : band);
      }
      if (p.rnd() < 0.7) p.px(x, (9 + off + 16) % 16, '#b0623a');
    }
    p.dots(6, ['#a65c32', '#dc9a60']);
  },
  sandstone_top: (p: Painter2D) => {
    p.noise(['#cf8048', '#c77840', '#d68c52'], 1.1);
    wave(p, 5, 1, 0.5, 0, '#b86a38');
    wave(p, 12, 1, 0.5, 2, '#b86a38');
  },
  basalt: (p: Painter2D) => {
    for (let x = 0; x < 16; x++) {
      const c = BASALT[(x * 5 + 1) % BASALT.length]!;
      for (let y = 0; y < 16; y++) p.px(x, y, p.rnd() < 0.2 ? pick(p, BASALT) : c);
    }
    for (const x of [0, 5, 10]) p.rect(x, 0, 1, 16, '#141418');
    p.dots(8, ['#3e3e45']);
  },
  basalt_top: (p: Painter2D) => {
    p.noise(BASALT, 1.2);
    p.rect(0, 0, 16, 1, '#141418').rect(0, 0, 1, 16, '#141418').rect(0, 8, 8, 1, '#141418').rect(8, 4, 8, 1, '#141418').rect(8, 0, 1, 16, '#141418').rect(0, 12, 8, 1, '#141418');
  },
  magma: (p: Painter2D) => {
    p.noise(['#3a1a10', '#2e140c', '#46200f'], 1.2);
    crack(p, '#ff7a1a', '#ffb030');
    crack(p, '#e85a12');
    p.dots(6, ['#ffd050', '#ff8a2a']);
  },
  // built: the pyramid, the temple, the gingerbread house, the rocket, the UFO
  sand_bricks: bricks('#c8a868', DESERT_BRICK),
  sand_smooth: (p: Painter2D) => {
    p.noise(['#e6cb8f', '#e0c588', '#ead296'], 1);
    p.rect(0, 0, 16, 1, '#f2dca8').rect(0, 15, 16, 1, '#c8aa70');
  },
  chiseled_sand: (p: Painter2D) => {
    p.noise(['#e6cb8f', '#e0c588', '#ead296'], 1);
    p.rect(1, 1, 14, 14, '#d8bc80').rect(2, 2, 12, 12, '#e6cb8f');
    // an eye
    p.rect(4, 6, 8, 1, '#a07a40').rect(4, 9, 8, 1, '#a07a40').rect(3, 7, 1, 2, '#a07a40').rect(12, 7, 1, 2, '#a07a40').rect(7, 7, 2, 2, '#5a3e1a').rect(6, 10, 1, 3, '#a07a40');
  },
  mossy_bricks: (p: Painter2D) => {
    stoneBricks(p);
    p.dots(26, ['#5b7a3a', '#4d6b30', '#6a8a45']);
    p.rect(2, 0, 3, 2, '#4d6b30').rect(10, 8, 2, 3, '#5b7a3a');
  },
  gingerbread: (p: Painter2D) => {
    p.noise(GINGER, 1.1);
    p.dots(10, ['#7a4520', '#c07a3e']);
  },
  icing: (p: Painter2D) => {
    p.noise(['#fff6fb', '#ffeef6', '#ffffff'], 1);
    p.dots(6, ['#f7a6c6', '#ffd0e2']);
  },
  roof_candy: (p: Painter2D) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(x, y, (x + y) % 8 < 4 ? '#f05a7a' : '#fff4f6');
    p.dots(8, ['#ffe066', '#78cff0']);
  },
  door_choco: (p: Painter2D) => {
    p.rect(0, 0, 16, 16, '#4a2614');
    for (const [x, y] of [[1, 1], [8, 1], [1, 6], [8, 6], [1, 11], [8, 11]] as const) p.rect(x, y, 7, 4, '#6a3a1e').rect(x, y, 7, 1, '#8a5430');
    p.rect(12, 8, 2, 2, '#ffe066');
  },
  rocket_white: (p: Painter2D) => {
    p.noise(['#eef0f4', '#e6e9ee', '#f6f7fa'], 1);
    p.rect(0, 7, 16, 1, '#c4c8d0').rect(0, 0, 1, 16, '#c4c8d0');
    for (const [x, y] of [[2, 2], [13, 2], [2, 12], [13, 12]] as const) p.px(x, y, '#a8acb6');
  },
  rocket_red: (p: Painter2D) => {
    p.noise(['#d23a30', '#c8342a', '#dc4236'], 1);
    p.rect(0, 7, 16, 1, '#a8261e').rect(0, 0, 1, 16, '#a8261e');
    for (const [x, y] of [[2, 2], [13, 2], [2, 12], [13, 12]] as const) p.px(x, y, '#ff7a6a');
  },
  porthole: (p: Painter2D) => {
    PAINTERS.rocket_white!(p);
    p.rect(4, 3, 8, 10, '#8a8f98').rect(3, 4, 10, 8, '#8a8f98');
    p.rect(5, 4, 6, 8, '#6ec0ec').rect(4, 5, 8, 6, '#6ec0ec');
    p.rect(5, 5, 2, 2, '#e0f6ff').px(7, 5, '#b8e6fa');
  },
  metal: (p: Painter2D) => {
    p.noise(['#b8bec6', '#b0b6be', '#c2c8d0'], 1);
    p.rect(0, 0, 16, 1, '#d8dee6').rect(0, 15, 16, 1, '#8a9098').rect(0, 7, 16, 1, '#9aa0a8');
    for (const x of [2, 7, 13]) p.px(x, 3, '#7a8088').px(x, 11, '#7a8088');
  },
  ufo_light: (p: Painter2D) => {
    p.noise(['#a8f070', '#98e060', '#b8ff80'], 1);
    p.rect(4, 4, 8, 8, '#e0ffc0').rect(6, 6, 4, 4, '#ffffff');
  },
  // big plants
  mushroom_stem: (p: Painter2D) => {
    p.noise(STEM, 1);
    for (const x of [3, 8, 12]) p.rect(x, 0, 1, 16, '#cfc6ae');
  },
  mushroom_red: (p: Painter2D) => {
    p.noise(['#d8322a', '#cc2c24', '#e23c32'], 1);
    for (const [x, y] of [[2, 2], [9, 1], [5, 8], [12, 9], [1, 12], [10, 13]] as const) p.rect(x, y, 3, 2, '#f8f2ea').px(x + 1, y + 2, '#f8f2ea');
  },
  mushroom_brown: (p: Painter2D) => {
    p.noise(['#9a6a44', '#906240', '#a4744c'], 1.2);
    p.dots(10, ['#7a5032', '#b48458']);
  },
  glow_cap: (p: Painter2D) => {
    p.noise(['#3fc8dc', '#38bcd0', '#4ad8e8'], 1);
    for (const [x, y] of [[2, 3], [10, 2], [6, 9], [12, 11], [2, 12]] as const) p.rect(x, y, 2, 2, '#b8f8ff').px(x, y, '#ffffff');
  },
  log_jungle: (p: Painter2D) => {
    logSide(['#6a5232', '#5e482a', '#76603c', '#4e3b22'])(p);
    for (const x of [2, 11]) for (let y = 0; y < 16; y++) if (p.rnd() < 0.6) p.px(x, y, '#3f7f27');
  },
  leaves_jungle: leaves(['#2f8a2a', '#38a032', '#287a24', '#44b03a']),
  log_dead: (p: Painter2D) => {
    logSide(['#4a433c', '#3e3833', '#56504a', '#332e2a'])(p);
    for (const x of [3, 9, 13]) for (let y = 0; y < 16; y++) if (p.rnd() < 0.5) p.px(x, y, '#28231f');
  },
  log_dead_top: (p: Painter2D) => {
    p.noise(['#4a433c', '#3e3833'], 1);
    p.rect(2, 2, 12, 12, '#6e655a').rect(4, 4, 8, 8, '#5e564c').rect(6, 6, 4, 4, '#6e655a');
  },
  chiseled_stone: (p: Painter2D) => {
    p.noise(STONE, 1.3);
    p.rect(1, 1, 14, 14, '#6e6e6e').rect(2, 2, 12, 12, '#8a8a8a');
    p.rect(4, 6, 8, 1, '#4e4e4e').rect(4, 9, 8, 1, '#4e4e4e').rect(3, 7, 1, 2, '#4e4e4e').rect(12, 7, 1, 2, '#4e4e4e').rect(7, 7, 2, 2, '#2e2e2e').rect(6, 10, 1, 3, '#4e4e4e');
    p.dots(10, ['#5b7a3a', '#4d6b30']);
  },
  leaves_blueberry: leaves(LEAF, '#3a4fb0'),
  // found in the world and in caves
  fossil_stone: (p: Painter2D) => {
    p.noise(['#b9a07e', '#ae9674', '#c4aa88'], 1.3);
    // a curled shell
    p.rect(5, 4, 6, 1, '#efe6cf').rect(4, 5, 1, 6, '#efe6cf').rect(5, 11, 6, 1, '#efe6cf').rect(11, 6, 1, 5, '#efe6cf').rect(7, 6, 3, 1, '#efe6cf').rect(7, 7, 1, 3, '#efe6cf').rect(8, 9, 2, 1, '#efe6cf');
  },
  packed_ice: (p: Painter2D) => {
    p.noise(['#a8cff5', '#9cc6f0', '#b4d8fa', '#90bce8'], 1);
    crack(p, '#e8f4ff');
    p.dots(6, ['#ffffff']);
  },
  amethyst: (p: Painter2D) => {
    p.noise(['#7a4fb0', '#6e44a2', '#8a5cc2', '#5e3a90'], 1);
    for (const [x, y] of [[2, 3], [9, 2], [5, 9], [12, 10]] as const) p.rect(x, y, 2, 3, '#c09af0').px(x, y, '#ead8ff');
  },
  rooted_dirt: (p: Painter2D) => {
    p.noise(['#5a4030', '#4e3626', '#64483a', '#45301f'], 1.3);
    crack(p, '#8a6a44');
    crack(p, '#7a5a3a');
  },
  moss_stone: (p: Painter2D) => {
    p.noise(STONE, 1.5);
    p.dots(34, ['#3e917b', '#47a08a', '#2f7262']);
  },
  candy_stripes: (p: Painter2D) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(x, y, (x - y + 32) % 8 < 3 ? '#e8303a' : '#fff6f6');
  },
  dragon_egg: (p: Painter2D) => {
    p.noise(['#7a3ab0', '#6e32a2', '#8644be'], 1);
    p.dots(14, ['#5ad0a0', '#f0c040', '#b884e8']);
  },
  // cross-sprites for small plants (cut out like leaves)
  reeds: (p: Painter2D) => {
    p.clear();
    for (const x of [2, 5, 8, 11, 13]) {
      const h = 9 + Math.floor(p.rnd() * 6);
      for (let y = 0; y < h; y++) p.px(x + (y > h - 4 && x % 2 ? 1 : 0), 15 - y, y % 3 ? '#7a8f3a' : '#8a9a4a');
      if (x % 3 === 2) p.rect(x, 15 - h, 2, 4, '#6a4224').px(x, 15 - h - 1, '#8a9a4a');
    }
  },
  fern: (p: Painter2D) => {
    p.clear();
    for (const [x0, dir] of [[7, -1], [8, 1], [7, 0]] as const)
      for (let y = 0; y < 13; y++) {
        const x = Math.round(x0 + dir * y * 0.45);
        p.px(x, 15 - y, '#2f7a2a');
        if (y > 2 && y % 2 === 0) p.px(x - 1, 15 - y, '#3f9a36').px(x + 1, 15 - y, '#3f9a36');
      }
  },
  jungle_flower: (p: Painter2D) => {
    p.clear();
    p.rect(7, 7, 2, 9, '#3a8a32').rect(4, 11, 3, 2, '#3a8a32').rect(9, 9, 3, 2, '#3a8a32');
    p.rect(4, 2, 8, 5, '#e04a8a').rect(5, 1, 6, 7, '#e04a8a').rect(7, 3, 2, 2, '#ffe066').px(6, 2, '#f58ab8');
  },
  dig_x: (p: Painter2D) => {
    p.clear();
    for (let i = 2; i < 14; i++) p.rect(i, i, 2, 1, '#b8281e').rect(15 - i, i, 2, 1, '#b8281e');
  },
  crater: (p: Painter2D) => {
    p.noise(['#a6a6a0', '#9c9c96', '#aeaea8'], 1.2);
    p.rect(3, 3, 10, 10, '#8a8a84').rect(5, 5, 6, 6, '#7c7c76');
    p.dots(8, ['#6e6e68', '#b8b8b2']);
  },
  lollipop_0: (p: Painter2D) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(x, y, (Math.floor(Math.hypot(x - 7.5, y - 7.5) + Math.atan2(y - 7.5, x - 7.5) * 1.3) & 2) ? '#f04a8a' : '#fff0f6');
  },
  lollipop_1: (p: Painter2D) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(x, y, (Math.floor(Math.hypot(x - 7.5, y - 7.5) + Math.atan2(y - 7.5, x - 7.5) * 1.3) & 2) ? '#4ab8f0' : '#f0faff');
  },
  lollipop_2: (p: Painter2D) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(x, y, (Math.floor(Math.hypot(x - 7.5, y - 7.5) + Math.atan2(y - 7.5, x - 7.5) * 1.3) & 2) ? '#f0c030' : '#fffbe8');
  },
} satisfies Record<string, Painter>);

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

const colourCache = new Map<string, string[]>();
/** A few colours of a tile, picked from its pixels (crumbs when something breaks). */
export function tileColours(name: string): string[] {
  const hit = colourCache.get(name);
  if (hit) return hit;
  const { canvas } = atlas();
  const i = tileIndex.get(name);
  const out: string[] = [];
  if (i !== undefined) {
    const data = canvas.getContext('2d')!.getImageData((i % COLS) * TEX, Math.floor(i / COLS) * TEX, TEX, TEX).data;
    for (const [x, y] of [[3, 3], [11, 5], [6, 11], [13, 13], [8, 8]] as const) {
      const k = (y * TEX + x) * 4;
      if (data[k + 3]! > 128) out.push(`rgb(${data[k]},${data[k + 1]},${data[k + 2]})`);
    }
  }
  if (!out.length) out.push('#9a9a9a', '#7a7a7a');
  colourCache.set(name, out);
  return out;
}

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
  /** Rendered in the liquid pass, with its own flowing texture (the `top` tile). */
  liquid?: boolean;
  /** Liquids: opacity (water 0.72) and how fast the surface flows (tiles per second). */
  alpha?: number;
  flow?: number;
  /** Shines by itself whatever the light around it (lava). */
  glow?: boolean;
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
add({ name: 'leaves_birch', opaque: false, cutout: true });
add({ name: 'leaves_dark', opaque: false, cutout: true });
add({ name: 'leaves_cherry', opaque: false, cutout: true });
add({ name: 'log_dark', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_dark' });
add({ name: 'log_redwood', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_redwood' });
add({ name: 'log_cherry', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_cherry' });
add({ name: 'bedrock' });
add({ name: 'snow' });
add({ name: 'ice' });
add({ name: 'water', opaque: false, liquid: true, alpha: 0.72, flow: 0.25 });
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
// the wider world: liquids
add({ name: 'lava', opaque: false, liquid: true, alpha: 1, flow: 0.06, glow: true, light: 15 });
add({ name: 'bog', opaque: false, liquid: true, alpha: 0.88, flow: 0.04 });
add({ name: 'choco', opaque: false, liquid: true, alpha: 0.96, flow: 0.08 });
// grounds and rock
add({ name: 'candy', top: 'candy', side: 'candy_side', bottom: 'candy_side' });
add({ name: 'candy_fill', all: 'candy_side' });
add({ name: 'moon_dust' });
add({ name: 'moon_rock' });
add({ name: 'ash', top: 'ash', side: 'ash_side', bottom: 'ash_side' });
add({ name: 'mud' });
add({ name: 'moss', top: 'moss_top', side: 'moss_side', bottom: 'dirt' });
add({ name: 'redsand' });
add({ name: 'sandstone', top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' });
add({ name: 'basalt', top: 'basalt_top', bottom: 'basalt_top', side: 'basalt' });
add({ name: 'magma', light: 12 });
add({ name: 'packed_ice' });
add({ name: 'amethyst', light: 7 });
add({ name: 'rooted_dirt' });
add({ name: 'moss_stone' });
add({ name: 'fossil_stone' });
// built things
add({ name: 'sand_bricks' });
add({ name: 'sand_smooth' });
add({ name: 'chiseled_sand', top: 'sand_smooth', bottom: 'sand_smooth', side: 'chiseled_sand' });
add({ name: 'mossy_bricks' });
add({ name: 'gingerbread' });
add({ name: 'icing' });
add({ name: 'roof_candy' });
add({ name: 'door_choco', top: 'gingerbread', bottom: 'gingerbread', side: 'door_choco' });
add({ name: 'candy_stripes' });
add({ name: 'rocket_white' });
add({ name: 'rocket_red' });
add({ name: 'rocket_window', top: 'rocket_white', bottom: 'rocket_white', side: 'rocket_white', south: 'porthole', light: 9 });
add({ name: 'metal' });
add({ name: 'ufo_light', light: 13 });
// big plants
add({ name: 'mushroom_stem' });
add({ name: 'mushroom_red' });
add({ name: 'mushroom_brown' });
add({ name: 'glow_cap', light: 13 });
add({ name: 'log_jungle', top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_jungle' });
add({ name: 'leaves_jungle', opaque: false, cutout: true });
add({ name: 'log_dead', top: 'log_dead_top', bottom: 'log_dead_top', side: 'log_dead' });
add({ name: 'chiseled_stone', top: 'stone_bricks', bottom: 'stone_bricks', side: 'chiseled_stone' });
add({ name: 'leaves_blueberry', opaque: false, cutout: true });

export const blockTile = (b: BlockDef, face: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west'): string =>
  face === 'top' ? b.top : face === 'bottom' ? b.bottom : (b[face] ?? b.side);
