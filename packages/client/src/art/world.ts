// Terrain tiles, world objects, crops and effects — all drawn in code.
import { CROPS, type Terrain } from '@lilla-garden/shared';
import { Px, hash2, shade } from './px.js';
import { drawBiomeObjects } from './objects2.ts';
import { caveWallThemed, drawLandmarks } from './landmarks.ts';
import { drawArcade } from './arcade.ts';
import { drawSaga } from './saga.ts';
import { drawSagaPlaces } from './sagaplaces.ts';
import { addBiomeTerrain, edgeGroup } from './terrain2.ts';

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
  /** Which neighbours count as the same ground for a tile's edges (null: it has none). */
  edgeGroup: (t: Terrain) => ((n: Terrain | undefined) => boolean) | null;
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

  // grass x8: soft patches, tiny flowers, pebbles
  const grass: number[] = [];
  const GRASS = '#64a848';
  for (let v = 0; v < 8; v++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, GRASS);
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
  // soil, soil_wet: 16 edge variants each, with a rounded grass fringe on open sides
  const soilTile = (base: string, dark: string, mask: number) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, base);
    for (let y = 2; y < 16; y += 4) p.rect(0, y, 16, 1, dark);
    speck(p, 500 + mask, 6, dark, 1);
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
    return add(p);
  };
  const soilVariants: number[] = [];
  const soilWetVariants: number[] = [];
  for (let m = 0; m < 16; m++) {
    soilVariants.push(soilTile('#9a6a3a', '#7a5028', m));
    soilWetVariants.push(soilTile('#5f3d1d', '#452a12', m));
  }
  const soilI = soilVariants[0]!;
  const soilWetI = soilWetVariants[0]!;
  // water: 2 frames; 16 shore variants x 2 frames with shallow water and foam on land sides
  const water: number[] = [];
  const waterShore: number[][] = [];
  const waterTile = (f: number, mask: number) => {
    const deep = '#3a80d0';
    const p = new Px(16, 16).rect(0, 0, 16, 16, deep);
    const o = f * 2;
    p.rect(2 + o, 3, 4, 1, '#7fb6ee').rect(9 + o, 8, 4, 1, '#7fb6ee').rect(4 - o, 12, 3, 1, '#7fb6ee').rect(11 - o, 1, 3, 1, '#2d6cb8');
    if (mask) {
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
  for (let m = 0; m < 16; m++) {
    const frames = [waterTile(0, m), waterTile(1, m)];
    waterShore.push(frames);
    if (m === 0) water.push(...frames);
  }
  // pool (the bath house): bright turquoise, 2 frames; a pale stone rim on the open sides
  const poolTile = (f: number, mask: number) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#4fc0e6');
    const o = f * 2;
    p.rect(2 + o, 3, 4, 1, '#bff0ff').rect(9 + o, 8, 4, 1, '#bff0ff').rect(4 - o, 12, 3, 1, '#bff0ff').rect(11 - o, 1, 3, 1, '#2fa0d0');
    speck(p, 700 + f, 3, '#8fe0f8', 1);
    if (mask) {
      const rim = '#d8d4c8';
      const rimD = '#a9a59a';
      if (mask & 1) p.rect(0, 0, 16, 2, rim).rect(0, 2, 16, 1, rimD);
      if (mask & 4) p.rect(0, 14, 16, 2, rim).rect(0, 13, 16, 1, rimD);
      if (mask & 8) p.rect(0, 0, 2, 16, rim).rect(2, 0, 1, 16, rimD);
      if (mask & 2) p.rect(14, 0, 2, 16, rim).rect(13, 0, 1, 16, rimD);
    }
    return add(p);
  };
  const pool: number[][] = [];
  for (let m = 0; m < 16; m++) pool.push([poolTile(0, m), poolTile(1, m)]);
  // the market town: cobbles worn lighter down the middle of a street, flagstone pavements, pale slabs to cross on.
  // Every cobble tile has the same stones in the same places (rows of 3-pixel stones over 1 pixel of mortar,
  // wrapping at the tile edge) so neighbours run on; only their colours change between the variants.
  const COBBLES = ['#a39a8c', '#978d80', '#ab9f90', '#9c9184', '#a09a92', '#a8998a'];
  const COBBLE_ROWS: [number, number[]][] = [
    [0, [6, 5, 5]],
    [3, [5, 6, 5]],
    [1, [5, 5, 6]],
    [4, [6, 5, 5]],
  ];
  const cobbles = (p: Px, seed: number, worn: (x: number, y: number) => number) => {
    p.rect(0, 0, 16, 16, '#6a6056');
    COBBLE_ROWS.forEach(([start, widths], r) => {
      let x = start;
      widths.forEach((w, i) => {
        const base = COBBLES[hash2(r * 7 + i * 3 + seed * 11, seed * 5 + r + i) % COBBLES.length]!;
        const sw = w - 1;
        for (let sy = 0; sy < 3; sy++)
          for (let sx = 0; sx < sw; sx++) {
            if (sy === 0 && (sx === 0 || sx === sw - 1)) continue; // rounded tops
            const px = (x + sx) % 16;
            const py = r * 4 + sy;
            const c = sy === 0 ? shade(base, 1.14) : sy === 2 ? shade(base, 0.8) : sx === sw - 1 ? shade(base, 0.9) : base;
            const k = worn(px, py);
            p.px(px, py, k > 0 ? shade(c, 1 + 0.28 * k) : c);
          }
        x += w;
      });
    });
    return p;
  };
  const roadTile = (mask: number, v: number) => {
    // the worn middle sits where the dashes were: along the edge between the two lanes of a street
    const up = mask & 1;
    const right = mask & 2;
    const down = mask & 4;
    const left = mask & 8;
    const along = (d: number) => (d < 5 ? 1 - d / 6 : 0);
    const worn = (x: number, y: number): number => {
      if (up && !down && !left && !right) return along(15 - y);
      if (down && !up && !left && !right) return along(y);
      if (left && !right && !up && !down) return along(15 - x);
      if (right && !left && !up && !down) return along(x);
      return 0;
    };
    const p = cobbles(new Px(16, 16), v * 7 + mask, worn);
    // a darker kerb row along the pavement
    if (up) p.rect(0, 0, 16, 1, '#4e463e');
    if (down) p.rect(0, 15, 16, 1, '#4e463e');
    if (left) p.rect(0, 0, 1, 16, '#4e463e');
    if (right) p.rect(15, 0, 1, 16, '#4e463e');
    return add(p);
  };
  const road = Array.from({ length: 16 }, (_, m) => [0, 1, 2].map((v) => roadTile(m, v)));
  // flagstones: mortar along the top and left edge of every tile, the slabs inside split differently per variant
  const FLAGS: [number, number, number, number][][] = [
    [[1, 1, 8, 6], [10, 1, 6, 6], [1, 8, 4, 8], [6, 8, 10, 8]],
    [[1, 1, 7, 9], [9, 1, 7, 4], [9, 6, 7, 10], [1, 11, 7, 5]],
    [[1, 1, 15, 8], [1, 10, 5, 6], [7, 10, 9, 6]],
    [[1, 1, 10, 5], [12, 1, 4, 15], [1, 7, 10, 9]],
  ];
  const SLABS = ['#c2baa8', '#b8b09e', '#cbc4b2', '#b4ad9d', '#bfb5a0'];
  const sidewalk = FLAGS.map((slabs, v) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#8a8478');
    slabs.forEach(([x, y, w, h], i) => {
      const c = SLABS[(v * 3 + i * 2) % SLABS.length]!;
      p.rect(x, y, w, h, c).rect(x, y, w, 1, shade(c, 1.1)).rect(x, y + h - 1, w, 1, shade(c, 0.9)).rect(x + w - 1, y, 1, h, shade(c, 0.92));
    });
    speck(p, 1200 + v, 3, '#a8a090', 1);
    if (v === 1) p.px(4, 4, '#9a9284').px(5, 5, '#9a9284').px(5, 6, '#9a9284'); // a hairline crack
    return add(p);
  });
  // two big pale slabs per tile, laid across the street the way people walk over it
  const crossingTile = (vertical: boolean) => {
    const p = cobbles(new Px(16, 16), 40 + (vertical ? 1 : 0), () => 0);
    for (const o of [1, 9]) {
      const [x, y, w, h] = vertical ? [o, 2, 6, 12] : [2, o, 12, 6];
      p.rect(x, y, w, h, '#ddd6c4').rect(x, y, w, 1, '#efe9d9').rect(x, y + h - 1, w, 1, '#a9a191').rect(x + w - 1, y, 1, h, '#b9b1a0');
      p.px(x, y, '#6a6056').px(x + w - 1, y, '#6a6056').px(x, y + h - 1, '#6a6056').px(x + w - 1, y + h - 1, '#6a6056');
      p.px(x + 2, y + 2, '#c9c2b0').px(x + w - 3, y + h - 3, '#c9c2b0');
    }
    return add(p);
  };
  const crossing = [crossingTile(false), crossingTile(true)];
  const railP = new Px(16, 16).rect(0, 0, 16, 16, '#8f8a80');
  speck(railP, 1300, 5, '#7a766d', 1);
  for (let x = 1; x < 16; x += 4) railP.rect(x, 3, 2, 10, '#5a3d20');
  railP.rect(0, 5, 16, 1, '#b8b8c0').rect(0, 6, 16, 1, '#6e6e78').rect(0, 10, 16, 1, '#b8b8c0').rect(0, 11, 16, 1, '#6e6e78');
  const railI = add(railP);
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
  // the wider world: cliffs, lava, swamp, moss, candy, the moon…
  const biome = addBiomeTerrain(add);

  // several rows: a single row would exceed the GPU's texture width limit
  const cols = 32;
  const sheet = new Px(16 * cols, 16 * Math.ceil(tiles.length / cols));
  tiles.forEach((t, i) => sheet.blit(t, (i % cols) * 16, Math.floor(i / cols) * 16));
  return {
    canvas: sheet.canvas,
    count: tiles.length,
    rock: rockI,
    edgeGroup,
    waterFrames: [water[0]!, water[1]!],
    index: (t, x, y, snowy, mask = 0, frame = 0) => {
      const h = hash2(x, y);
      const wider = biome.index(t, x, y, snowy, mask, frame);
      if (wider !== null) return wider;
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
        case 'dirt': // (3D game only)
          return pathDirtI;
        case 'floor_wood':
          return floorWoodI;
        case 'floor_stone':
          return floorStoneI;
        case 'snow':
          return snow[h % 2]!;
        case 'gravel':
        case 'stone': // (3D game only)
          return gravelI;
        case 'ice':
          return iceI;
        case 'pool':
          return pool[mask % pool.length]![frame]!;
        case 'road':
          return road[mask & 15]![h % 3]!;
        case 'sidewalk':
          return sidewalk[h % sidewalk.length]!;
        case 'crossing':
          return crossing[mask & 5 ? 0 : 1]!;
        case 'rail':
          return railI;
        default:
          return grass[0]!;
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

const tree = (kind: 'round' | 'pine' | 'apple', v: number): Px => {
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

// ---- the market town (Köpingen): timber and turf houses, cobbles, lanterns and carts ----
// Window glass is a pale blue that the LittleJS view recolours to lamp light at night (litWindows in
// clientljs/src/art.ts takes pixels with blue >= 200, green >= 170, red <= 205 and blue - red >= 30). Nothing else
// on a lit building may be that colour: the station's runes glow a deeper blue (green < 170) so they stay runes.
const GLASS = '#9cc8e0';
const GLASS_L = '#c4e4f4';
const BEAM = '#4a3020';
const BEAM_L = '#6a4630';
const IRON = '#3a3a40';
const IRON_L = '#6e6e78';
const BRASS = '#d9a640';
const BRASS_D = '#9a6a20';
const BRASS_L = '#f2d27a';
const FLAME = '#ffd45a';
const FLAME_L = '#fff1a0';
const TURF = '#5f8f3a';
const TURF_D = '#456a2a';
const TURF_L = '#86b552';
const RUNE = '#3a9cff';
const RUNE_L = '#8ac8ff';
const STEAM = '#eef2f6';

/** A small leaded window: glass (lit at night) in a timber frame, a shine in the top-left pane, optional shutters. */
const leaded = (p: Px, x: number, y: number, w: number, h: number, frame = BEAM, shutters?: string): void => {
  if (shutters) {
    p.rect(x - 4, y - 1, 3, h + 2, shutters).rect(x + w + 1, y - 1, 3, h + 2, shutters);
    p.rect(x - 4, y + Math.floor(h / 2), 3, 1, shade(shutters, 0.7)).rect(x + w + 1, y + Math.floor(h / 2), 3, 1, shade(shutters, 0.7));
  }
  p.rect(x - 1, y - 1, w + 2, h + 2, frame).rect(x, y, w, h, GLASS);
  const mx = x + Math.floor(w / 2);
  const my = y + Math.floor(h / 2);
  p.rect(x, y, mx - x, my - y, GLASS_L);
  p.rect(mx, y, 1, h, frame).rect(x, my, w, 1, frame);
};

/** A box of red and yellow flowers under a window. */
const flowerBox = (p: Px, x: number, y: number, w: number): void => {
  p.rect(x, y, w, 2, WOOD_D).rect(x, y, w, 1, WOOD);
  for (let i = 0; i < w; i += 2) p.px(x + i, y - 1, i % 4 === 0 ? '#e8502a' : '#f5d94a').px(x + i + 1, y - 1, '#3f8a2e');
};

/** A plank door with an arched top, iron hinges and a ring. */
const plankDoor = (p: Px, x: number, y: number, w: number, h: number, c = WOOD): void => {
  p.rect(x - 1, y, w + 2, h, BEAM).rect(x, y + 1, w, h - 1, c).clear(x - 1, y, 1, 1).clear(x + w, y, 1, 1);
  p.px(x, y + 1, BEAM).px(x + w - 1, y + 1, BEAM);
  for (let i = x + 2; i < x + w - 1; i += 2) p.rect(i, y + 2, 1, h - 2, shade(c, 0.78));
  p.rect(x, y + 4, Math.ceil(w / 2), 1, IRON).rect(x, y + h - 4, Math.ceil(w / 2), 1, IRON);
  p.px(x + w - 2, y + Math.floor(h / 2) + 1, BRASS);
};

/** Wooden shingles on a roof seen from the front: rows that step in towards the ridge. */
const shingleRoof = (p: Px, x: number, y: number, w: number, h: number, c: string, slope: number): void => {
  for (let yy = 0; yy < h; yy++) {
    const inset = Math.round(((h - 1 - yy) / Math.max(1, h - 1)) * slope);
    const row = Math.floor(yy / 3);
    p.rect(x + inset, y + yy, w - inset * 2, 1, yy % 3 === 2 ? shade(c, 0.78) : yy % 3 === 0 ? shade(c, 1.12) : c);
    if (yy % 3 === 1) for (let sx = x + inset + ((row * 2) % 4); sx < x + w - inset; sx += 4) p.px(sx, y + yy, shade(c, 0.85));
  }
  p.rect(x, y + h - 1, w, 1, shade(c, 0.6));
  p.rect(x + slope, y, w - slope * 2, 1, shade(c, 0.65)); // ridge
};

/** A turf roof: a grassy mound over birch bark, tufts hanging over the eaves, the odd flower. */
const turfRoof = (p: Px, x: number, y: number, w: number, h: number, slope: number, seed: number): void => {
  const insetAt = (yy: number) => Math.round(slope * Math.pow(1 - yy / Math.max(1, h - 1), 2));
  for (let yy = 0; yy < h; yy++) p.rect(x + insetAt(yy), y + yy, w - insetAt(yy) * 2, 1, yy < 2 ? TURF_L : yy > h - 4 ? TURF_D : TURF);
  const inside = (sx: number, sy: number) => sy >= y && sy < y + h && sx >= x + insetAt(sy - y) + 1 && sx < x + w - insetAt(sy - y) - 1;
  for (let i = 0; i < 30; i++) {
    const hh = hash2(seed * 13 + i, i * 7 + seed);
    const sx = x + 2 + (hh % (w - 4));
    const sy = y + 3 + (Math.floor(hh / 7) % Math.max(1, h - 5));
    if (inside(sx, sy) && inside(sx, sy - 1)) p.px(sx, sy, i % 3 === 0 ? TURF_L : TURF_D).px(sx, sy - 1, i % 3 === 0 ? TURF_L : TURF);
  }
  for (let i = 0; i < 4; i++) {
    const hh = hash2(seed + i * 31, seed * 3 + i);
    const sx = x + 6 + (hh % (w - 12));
    const sy = y + 2 + (Math.floor(hh / 11) % Math.max(1, h - 6));
    if (inside(sx, sy)) p.px(sx, sy, ['#f5f0e0', '#f5d94a', '#e87ab8', '#e8502a'][i]!);
  }
  // birch bark at the eave and grass hanging over it
  p.rect(x, y + h, w, 2, '#d8d0c0').rect(x, y + h + 1, w, 1, '#a89e8c');
  for (let i = x; i < x + w; i += 3) p.rect(i, y + h, 1, 1 + ((i * 7) % 3 === 0 ? 2 : 1), TURF_D).px(i + 1, y + h, TURF);
};

/** Crossed carved gable boards (with a little dragon head) sticking up at a roof's ridge end. */
const gableBoards = (p: Px, x: number, y: number, flip: boolean): void => {
  const d = flip ? -1 : 1;
  p.line(x, y + 5, x + 4 * d, y + 1, BEAM).line(x + 4 * d, y + 5, x, y + 1, BEAM);
  p.px(x - d, y, BEAM).px(x - d, y + 1, BEAM_L).px(x + 5 * d, y, BEAM).px(x + 5 * d, y + 1, BEAM_L);
};

/** Logs laid on their sides, with the round log ends showing at the corners. */
const logWall = (p: Px, x: number, y: number, w: number, h: number, c: string): void => {
  p.rect(x, y, w, h, c);
  for (let yy = y; yy < y + h; yy += 3) {
    p.rect(x, yy, w, 1, shade(c, 1.15)).rect(x, yy + 2, w, 1, shade(c, 0.72));
    if (yy + 3 <= y + h) for (const ex of [x, x + w - 3]) p.rect(ex, yy, 3, 3, '#c8955a').px(ex + 1, yy + 1, '#a8743c').rect(ex, yy + 2, 3, 1, shade(c, 0.6));
  }
};

/** Vertical planks (a stave wall), tarred dark. */
const plankWall = (p: Px, x: number, y: number, w: number, h: number, c: string): void => {
  p.rect(x, y, w, h, c);
  for (let xx = x; xx < x + w; xx += 3) p.rect(xx, y, 1, h, shade(c, 0.75)).rect(xx + 1, y, 1, h, shade(c, 1.1));
};

/** Plaster between dark timber: top and bottom beams, posts, and braces in the panels that ask for one. */
const halfTimber = (p: Px, x: number, y: number, w: number, h: number, plaster: string, posts: number[], braces: [number, number, boolean][]): void => {
  p.rect(x, y, w, h, plaster).rect(x, y + 2, w, 1, shade(plaster, 1.06));
  for (const [x0, x1, up] of braces) p.line(x + x0, up ? y + h - 2 : y + 2, x + x1, up ? y + 2 : y + h - 2, BEAM).line(x + x0 + 1, up ? y + h - 2 : y + 2, x + x1 + 1, up ? y + 2 : y + h - 2, BEAM);
  for (const px of posts) p.rect(x + px, y, 2, h, BEAM).rect(x + px, y, 1, h, BEAM_L);
  p.rect(x, y, w, 2, BEAM).rect(x, y + h - 2, w, 2, BEAM).rect(x, y, w, 1, BEAM_L);
};

/** A low stone plinth along the foot of a house. */
const plinth = (p: Px, x: number, y: number, w: number, h: number): void => {
  p.rect(x, y, w, h, STONE_D);
  for (let i = x; i < x + w; i += 5) p.rect(i, y, 4, h - 1, STONE).px(i, y, STONE_L);
};

const apartment = (v: number): Px => {
  const p = new Px(48, 56);
  if (v % 2 === 0) {
    // a half-timbered town house: shingle roof with a dormer and a chimney, a jettied upper storey
    const plaster = v === 0 ? '#f0e6cc' : '#ead2a0';
    const roof = v === 0 ? '#9a4a34' : '#5a5a66';
    p.rect(33, 0, 6, 10, STONE_D).rect(34, 0, 4, 9, STONE).rect(33, 0, 6, 1, STONE_L);
    shingleRoof(p, 0, 3, 48, 17, roof, 9);
    p.rect(33, 3, 6, 4, STONE).rect(34, 3, 1, 4, STONE_L);
    // dormer
    p.rect(19, 7, 10, 9, plaster).rect(18, 6, 12, 2, shade(roof, 0.8)).rect(20, 5, 8, 1, shade(roof, 0.8));
    leaded(p, 21, 9, 6, 5);
    halfTimber(p, 0, 20, 48, 17, plaster, [0, 15, 31, 46], [[17, 19, true], [29, 31, false]]);
    p.rect(2, 32, 13, 1, BEAM).rect(33, 32, 13, 1, BEAM); // sill rails
    leaded(p, 20, 24, 8, 8);
    flowerBox(p, 19, 33, 10);
    leaded(p, 5, 25, 6, 6);
    leaded(p, 37, 25, 6, 6);
    for (let i = 1; i < 48; i += 4) p.px(i, 37, BEAM); // joist ends under the jetty
    halfTimber(p, 2, 38, 44, 15, plaster, [0, 14, 28, 42], []);
    leaded(p, 6, 42, 6, 6, BEAM, v === 0 ? '#3f7a4a' : '#8a3a2a');
    leaded(p, 34, 42, 6, 6, BEAM, v === 0 ? '#3f7a4a' : '#8a3a2a');
    plankDoor(p, 19, 41, 8, 12);
    plinth(p, 1, 53, 46, 3);
  } else {
    // a longhouse: a deep turf roof with carved gable boards, log or stave walls, small shuttered windows
    const stave = v === 3;
    const wall = stave ? '#7a3a28' : '#8a5a30';
    turfRoof(p, 0, 3, 48, 22, 10, v * 17);
    gableBoards(p, 8, 0, false);
    gableBoards(p, 39, 0, true);
    p.rect(22, 1, 4, 3, BEAM).rect(23, 2, 2, 2, '#2a1a10'); // smoke hole hood
    if (stave) plankWall(p, 1, 27, 46, 26, wall);
    else logWall(p, 1, 27, 46, 26, wall);
    leaded(p, 9, 35, 5, 5, BEAM, stave ? '#4a6a3a' : '#7a3a28');
    leaded(p, 34, 35, 5, 5, BEAM, stave ? '#4a6a3a' : '#7a3a28');
    // carved door frame with a little dragon lintel
    p.rect(17, 34, 14, 2, BEAM).rect(16, 33, 2, 2, BEAM).rect(30, 33, 2, 2, BEAM).px(15, 33, BEAM_L).px(32, 33, BEAM_L);
    p.rect(18, 36, 1, 17, BEAM).rect(29, 36, 1, 17, BEAM);
    plankDoor(p, 20, 37, 8, 16, stave ? '#9a6a3a' : '#b07a44');
    p.rect(19, 35, 10, 1, '#c8955a');
    plinth(p, 0, 53, 48, 3);
    if (!stave) p.rect(40, 47, 6, 6, WOOD_D).rect(40, 47, 6, 1, WOOD_L).rect(41, 49, 4, 1, WOOD).rect(41, 51, 4, 1, WOOD); // woodpile
    else p.ellipse(38, 47, 7, 7, '#a8743c').rect(38, 49, 7, 1, IRON).rect(38, 52, 7, 1, IRON); // a barrel
  }
  return p.outline(OUTLINE);
};

/** The shops' hanging signs: an anvil (smith), a pretzel (baker), a shuttle with yarn (weaver). */
const SHOP_SIGNS: { rows: string[]; pal: Record<string, string> }[] = [
  { rows: ['KKKKKKKKK', '.KKKKKKKL', '...KKKK..', '...KKK...', '..KKKKK..', '.KKKKKKK.'], pal: { K: '#3a3a42', L: '#8a8a94' } },
  { rows: ['.BBB.BBB.', 'B...B...B', 'B..B.B..B', '.BB...BB.', '..B...B..', '...BBB...'], pal: { B: '#b8722a' } },
  { rows: ['...WWWWW...', '.WWLYYYLWW.', 'WWWLYYYLWWW', '.WWWWWWWWW.', '.....T.....', '.....T.....', '......TT...'], pal: { W: '#8a5a2a', L: '#c58f55', Y: '#d84a4a', T: '#d84a4a' } },
];

const shop = (v: number): Px => {
  const p = new Px(48, 40);
  const roof = ['#5a4a3e', '#9a4a34', '#6a4630'][v % 3]!;
  shingleRoof(p, 0, 0, 48, 13, roof, 6);
  if (v % 3 === 0) {
    // the smith: dark logs on a stone footing, a glow from the forge inside
    logWall(p, 1, 13, 46, 26, '#6a4628');
    plinth(p, 1, 36, 46, 3);
    p.rect(1, 13, 46, 1, BEAM);
  } else if (v % 3 === 1) {
    halfTimber(p, 1, 13, 46, 26, '#f2e2c2', [0, 15, 44], [[2, 6, true], [9, 13, false]]);
  } else {
    plankWall(p, 1, 13, 46, 26, '#5f7f8f');
    p.rect(1, 13, 46, 2, BEAM).rect(1, 37, 46, 2, BEAM);
  }
  // the shop window over a counter of goods
  leaded(p, 17, 18, 16, 7);
  p.rect(16, 25, 18, 1, BEAM).rect(16, 26, 18, 7, '#3a2618').rect(16, 33, 18, 2, WOOD).rect(16, 33, 18, 1, WOOD_L);
  if (v % 3 === 0) {
    p.rect(17, 27, 6, 5, '#f08a2a').rect(18, 28, 4, 3, FLAME); // forge glow
    p.rect(24, 29, 3, 3, IRON_L).clear(25, 30, 1, 2).rect(25, 30, 1, 2, '#3a2618'); // a horseshoe
    p.line(29, 27, 32, 31, '#c9c6bd').px(28, 31, BRASS); // a sword
  } else if (v % 3 === 1) {
    for (const [x, c] of [
      [18, '#c8843a'],
      [23, '#d89a4a'],
      [28, '#b8722a'],
    ] as const)
      p.ellipse(x, 29, 5, 4, c).rect(x + 1, 29, 3, 1, shade(c, 1.25));
  } else {
    for (const [x, c] of [
      [18, '#c83a3a'],
      [21, '#3a6ab8'],
      [24, '#e8c040'],
      [27, '#4a8a4a'],
      [30, '#e8e0d0'],
    ] as const)
      p.rect(x, 27, 3, 6, c).rect(x, 27, 3, 1, shade(c, 1.25)).rect(x + 2, 28, 1, 5, shade(c, 0.8));
  }
  plankDoor(p, 37, 24, 8, 15);
  // the hanging sign: an iron bracket out from the wall and a board on two chains
  p.rect(1, 15, 14, 1, IRON).px(14, 14, IRON).rect(3, 16, 1, 2, IRON_L).rect(12, 16, 1, 2, IRON_L);
  p.rect(1, 18, 14, 11, '#e0c48f').box(1, 18, 14, 11, BEAM).rect(2, 19, 12, 1, '#f0dcb0');
  const sign = SHOP_SIGNS[v % 3]!;
  const sw = sign.rows[0]!.length;
  p.tpl(8 - Math.ceil(sw / 2), 21, sign.rows, sign.pal);
  return p.outline(OUTLINE);
};

/** A wooden signpost: arms pointing both ways, a little lantern on top. */
const trafficLight = (): Px => {
  const p = new Px(16, 24);
  p.rect(7, 6, 2, 18, WOOD_D).rect(7, 6, 1, 18, WOOD).rect(5, 22, 6, 2, STONE_D).rect(5, 22, 6, 1, STONE);
  p.rect(2, 9, 11, 3, WOOD_L).rect(2, 9, 11, 1, '#e0b47a').px(13, 10, WOOD_L).px(1, 10, WOOD_L).clear(1, 9, 1, 1);
  p.rect(4, 10, 6, 1, WOOD_D);
  p.rect(3, 14, 11, 3, WOOD_L).rect(3, 14, 11, 1, '#e0b47a').px(2, 15, WOOD_L);
  p.rect(5, 15, 5, 1, WOOD_D);
  // lantern
  p.rect(7, 0, 2, 1, IRON).rect(5, 1, 6, 1, IRON).rect(5, 2, 6, 4, IRON).rect(6, 2, 4, 3, FLAME).px(6, 2, FLAME_L).rect(7, 2, 1, 3, IRON).rect(5, 6, 6, 1, IRON);
  return p.outline(OUTLINE);
};

/** An iron lantern on a wooden post with a stone foot. */
const streetLamp = (): Px => {
  const p = new Px(16, 24);
  p.rect(7, 8, 2, 14, WOOD_D).rect(7, 8, 1, 14, WOOD).rect(5, 21, 6, 3, STONE_D).rect(5, 21, 6, 1, STONE_L);
  p.rect(5, 8, 6, 1, IRON).px(5, 9, IRON).px(10, 9, IRON);
  p.rect(7, 0, 2, 1, IRON).rect(6, 1, 4, 1, IRON).rect(4, 2, 8, 1, IRON);
  p.rect(5, 3, 6, 5, IRON).rect(6, 3, 4, 4, FLAME).rect(6, 3, 2, 2, FLAME_L).rect(8, 3, 1, 4, shade(IRON, 1.3));
  p.rect(5, 7, 6, 1, IRON);
  return p.outline(OUTLINE);
};

/** A two-wheeled hand cart resting on its shafts (32×18): hay, barrels or pumpkins. */
const cartBody = (p: Px, x: number, y: number, c: string): void => {
  p.line(x + 22, y + 6, x + 30, y + 9, WOOD_D).line(x + 22, y + 7, x + 30, y + 10, WOOD_D); // shafts down to the ground
  p.rect(x + 1, y + 2, 22, 6, c).rect(x + 1, y + 2, 22, 1, shade(c, 1.25)).rect(x + 1, y + 7, 22, 1, shade(c, 0.7));
  for (let i = x + 5; i < x + 22; i += 6) p.rect(i, y + 3, 1, 4, shade(c, 0.8));
};
/** A wooden cart wheel: rim, four spokes (turned a little on odd frames), an iron hub. */
const spokeWheel = (p: Px, cx: number, cy: number, r: number, f = 0): void => {
  p.circle(cx, cy, r, BEAM).circle(cx, cy, r - 1, WOOD).circle(cx, cy, r - 2, '#2a1a10');
  const k = Math.max(1, Math.round(r - 2));
  const x = Math.round(cx - 0.5);
  const y = Math.round(cy - 0.5);
  if (f % 2 === 0) p.rect(x - k, y, k * 2 + 1, 1, WOOD).rect(x, y - k, 1, k * 2 + 1, WOOD);
  else for (let i = -k + 1; i < k; i++) p.px(x + i, y + i, WOOD).px(x + i, y - i, WOOD);
  p.px(x, y, IRON_L);
};
const barrel = (p: Px, x: number, y: number, w = 6, h = 7): void => {
  p.ellipse(x, y, w, h, '#9a6a3a').rect(x + 1, y, w - 2, h, '#9a6a3a').rect(x + 1, y + 1, 1, h - 2, '#c58f55');
  p.rect(x, y + 1, w, 1, IRON).rect(x, y + h - 2, w, 1, IRON).rect(x + w - 2, y + 1, 1, h - 2, '#6f4a26');
  p.rect(x + 1, y, w - 2, 1, '#c58f55');
};
const hay = (p: Px, x: number, y: number, w: number, h: number): void => {
  p.ellipse(x, y, w, h + 3, '#d8b04a').rect(x, y + Math.floor(h / 2) + 1, w, Math.ceil(h / 2) + 1, '#d8b04a');
  for (let i = 0; i < w; i += 2) p.rect(x + i, y + 2 + ((i * 3) % 4), 1, 2, i % 4 ? '#f0d070' : '#b8902a');
  p.px(x + 2, y + 1, '#f0d070').px(x + w - 3, y + 2, '#f0d070');
};
const parkedCar = (v: number): Px => {
  const p = new Px(32, 18);
  const c = ['#b5413a', '#3b5fa6', '#c89a30'][v % 3]!;
  if (v % 3 === 0) hay(p, 2, 1, 20, 7);
  else if (v % 3 === 1) {
    barrel(p, 3, 1);
    barrel(p, 10, 0);
    barrel(p, 17, 1);
  } else {
    pumpkin(p, 3, 4, 7, 6);
    pumpkin(p, 14, 4, 7, 6);
    pumpkin(p, 8, 2, 8, 7);
  }
  cartBody(p, 0, 7, c);
  spokeWheel(p, 11, 13, 4.5);
  return p.outline(OUTLINE);
};

/** The Diligens stop: a wooden post with a horseshoe on its board, and a bench beside it. */
const busStop = (): Px => {
  const p = new Px(16, 24);
  p.rect(7, 8, 2, 12, WOOD_D).rect(7, 8, 1, 12, WOOD);
  p.rect(1, 0, 14, 10, WOOD_L).rect(1, 0, 14, 1, '#e0b47a').box(1, 0, 14, 10, WOOD_D);
  // a horseshoe, open end up for luck, with its nail holes
  p.tpl(5, 2, ['.##.##.', '##...##', '##...##', '##...##', '.#####.', '..###..'], { '#': IRON_L });
  p.px(5, 4, IRON).px(11, 4, IRON).px(7, 6, IRON).px(9, 6, IRON).px(5, 3, '#a8a8b2');
  // a low bench in front of the post to wait on
  p.rect(0, 17, 16, 3, WOOD_L).rect(0, 17, 16, 1, '#e0b47a').rect(0, 19, 16, 1, WOOD_D).rect(1, 20, 2, 4, WOOD_D).rect(13, 20, 2, 4, WOOD_D);
  return p.outline(OUTLINE);
};

/** The dwarves' station: a stone hall with a rune band, a brass-bound door and a brass bell on the roof. */
const trainStation = (): Px => {
  const p = new Px(48, 40);
  const S = '#8a8a90';
  const SD = '#5e5e66';
  const SL = '#b0b0b6';
  // the bell in its frame
  p.rect(18, 1, 2, 7, BEAM).rect(28, 1, 2, 7, BEAM).rect(17, 0, 14, 2, BEAM).rect(17, 0, 14, 1, BEAM_L);
  p.rect(22, 2, 4, 2, BRASS).rect(21, 4, 6, 2, BRASS).rect(20, 6, 8, 1, BRASS).rect(22, 2, 1, 4, BRASS_L).rect(20, 7, 8, 1, BRASS_D).px(24, 8, BRASS_D);
  // a heavy slate roof
  for (let y = 5; y < 13; y++) {
    const inset = Math.round(((12 - y) / 7) * 8);
    p.rect(inset, y, 48 - inset * 2, 1, y % 2 ? '#4a4a56' : '#565664');
  }
  p.rect(0, 12, 48, 2, '#3a3a44');
  // stone blocks
  p.rect(1, 14, 46, 26, SD);
  for (let y = 14, r = 0; y < 40; y += 4, r++)
    for (let x = (r % 2) * 3 - 2; x < 47; x += 7) {
      const x0 = Math.max(1, x);
      const x1 = Math.min(47, x + 6);
      if (x1 > x0) p.rect(x0, y, x1 - x0, 3, S).rect(x0, y, x1 - x0, 1, SL);
    }
  // pillars at the corners
  for (const x of [0, 42]) p.rect(x, 14, 6, 26, S).rect(x, 14, 1, 26, SL).rect(x + 5, 14, 1, 26, SD).rect(x, 14, 6, 2, SL).rect(x, 37, 6, 3, SD);
  // the rune band over the door
  p.rect(7, 15, 34, 5, '#3a3a44').rect(7, 15, 34, 1, '#2a2a32');
  p.tpl(9, 16, ['|.\\.|/.|..|\\|.|.\\.|./|.|/.\\|', '|..|..|\\.|.|/..|.|\\.|..|..|', '|.|..|..|/.|.|.\\|..|.|.\\|..'], { '|': RUNE, '/': RUNE, '\\': RUNE });
  // the great arched door, brass-bound
  p.rect(16, 23, 16, 17, SD).rect(17, 22, 14, 1, SD).rect(18, 21, 12, 1, SD);
  p.rect(17, 24, 14, 16, '#5a3a22').rect(18, 23, 12, 1, '#5a3a22').rect(24, 23, 1, 17, '#3a2414');
  for (const y of [26, 33]) p.rect(17, y, 14, 1, BRASS).px(19, y, BRASS_L).px(29, y, BRASS_L);
  p.px(22, 30, BRASS_L).px(26, 30, BRASS_L);
  // slit windows
  for (const x of [9, 36]) {
    p.rect(x - 1, 23, 5, 11, SD).rect(x, 24, 3, 9, GLASS).rect(x, 24, 1, 4, GLASS_L).px(x - 1, 23, S).px(x + 3, 23, S);
    p.rect(x - 1, 34, 5, 1, SL);
  }
  // a pick and hammer in brass beside the door
  p.line(11, 36, 13, 38, BRASS).line(13, 36, 11, 38, BRASS);
  p.line(35, 36, 37, 38, BRASS).line(37, 36, 35, 38, BRASS);
  return p.outline(OUTLINE);
};

const pigsty = (): Px => {
  // a low wooden shed with an open front and a muddy wallow in front of it
  const p = new Px(32, 38);
  const shed = building(32, 26, '#c58f55', '#7a5230', false, { roofH: 10 });
  p.blit(shed, 0, 0);
  // open doorway with a pig looking out
  p.rect(11, 14, 10, 11, '#3a2414').rect(13, 18, 6, 5, '#f2b8c6').rect(18, 19, 2, 2, '#e8899e').px(14, 19, OUTLINE).px(17, 19, OUTLINE);
  // mud wallow
  p.ellipse(3, 27, 26, 10, '#6b4a2a').ellipse(6, 28, 20, 7, '#8a6238').ellipse(10, 30, 6, 3, '#5a3d20').ellipse(19, 29, 5, 3, '#5a3d20');
  return p.outline(OUTLINE);
};

/** The badstuga: a log sauna house with a stone chimney puffing steam, a wave carved over the door, a bucket. */
const bathhouse = (): Px => {
  const p = new Px(48, 44);
  // steam rising from the chimney
  p.ellipse(28, 0, 7, 5, STEAM).ellipse(32, 2, 6, 5, STEAM).ellipse(25, 3, 5, 4, '#dde4ec');
  p.rect(33, 4, 6, 10, STONE_D).rect(34, 4, 4, 10, STONE).rect(33, 4, 6, 1, STONE_L).rect(34, 7, 4, 1, STONE_D);
  turfRoof(p, 0, 7, 48, 10, 6, 5);
  p.rect(33, 7, 6, 3, STONE).rect(34, 7, 1, 3, STONE_L);
  gableBoards(p, 5, 4, false);
  gableBoards(p, 42, 4, true);
  logWall(p, 1, 19, 46, 24, '#9a6a3a');
  // the wave sign over the door
  p.rect(16, 21, 16, 6, '#e8e0cc').box(16, 21, 16, 6, BEAM);
  p.tpl(18, 23, ['#..##..##..#', '.##..##..##.'], { '#': '#2b86a6' });
  plankDoor(p, 20, 29, 8, 14, '#b07a44');
  leaded(p, 7, 27, 6, 5);
  leaded(p, 36, 27, 6, 5);
  // steam curling out of the vent over the right window
  p.rect(36, 23, 6, 2, '#3a2414').ellipse(40, 19, 5, 4, STEAM);
  // a wooden bucket with a ladle and a birch whisk by the door
  p.rect(9, 37, 6, 6, '#b07a44').rect(9, 37, 6, 1, '#c58f55').rect(9, 39, 6, 1, IRON).rect(9, 41, 6, 1, IRON).line(13, 37, 16, 34, WOOD_D);
  // a stack of split birch logs for the stove
  p.rect(37, 36, 9, 6, '#6a4a2a');
  for (let y = 36; y < 42; y += 2) for (let x = 37 + ((y / 2) % 2); x < 45; x += 2) p.px(x, y, '#e8dcc0').px(x + 1, y, '#c8955a');
  plinth(p, 0, 42, 48, 2);
  return p.outline(OUTLINE);
};

/** Pino's pizzeria as a timber tavern: his pizza sign still on the roof, a stone oven glowing by the door. */
const pizzeria = (): Px => {
  const p = new Px(48, 44);
  shingleRoof(p, 0, 1, 48, 16, '#8a5a2a', 8);
  // the pizza sign on the roof, now in a carved frame
  p.rect(15, 1, 18, 12, BEAM).rect(16, 2, 16, 10, '#ffffff');
  p.circle(21, 7, 3, '#e0453a').circle(21, 7, 2, '#f5d94a').px(20, 6, '#e0453a').px(22, 8, '#e0453a');
  p.rect(26, 5, 4, 1, '#d9453b').rect(26, 7, 3, 1, '#2e8a3a').rect(26, 9, 4, 1, '#d9453b');
  p.px(14, 0, BEAM).px(33, 0, BEAM);
  halfTimber(p, 1, 17, 46, 26, '#f3e2c0', [0, 13, 33, 44], [[2, 7, true], [36, 41, false]]);
  // red-white awning over the door
  for (let x = 14; x < 34; x += 4) p.rect(x, 20, 4, 4, ((x - 14) / 4) % 2 === 0 ? '#d9453b' : '#ffffff').px(x + 1, 24, ((x - 14) / 4) % 2 === 0 ? '#d9453b' : '#ffffff');
  p.rect(14, 19, 20, 1, '#8f2f2a');
  leaded(p, 4, 24, 6, 6, BEAM, '#2e7a3a');
  leaded(p, 37, 22, 6, 6, BEAM, '#2e7a3a');
  plankDoor(p, 19, 28, 10, 15);
  // stone oven glow and a barrel
  p.rect(36, 33, 8, 9, STONE_D).rect(37, 34, 6, 8, STONE).rect(38, 36, 4, 4, '#f08a2a').rect(39, 37, 2, 2, FLAME);
  barrel(p, 4, 35);
  p.rect(1, 42, 46, 2, STONE_D);
  return p.outline(OUTLINE);
};

/** A tall pole with a cloth banner (16×40, standing on its tile): red with a gold knot, blue with a raven, green with a tree. */
const BANNERS: { c: string; e: string; rows: string[] }[] = [
  { c: '#b8302a', e: '#f0c040', rows: ['.###.', '#.#.#', '###.#', '#.###', '#.#.#', '.###.'] },
  { c: '#2f5aa8', e: '#1a1a22', rows: ['..##.', '.####', '####.', '.###.', '..#..', '.#.#.'] },
  { c: '#2e7a3a', e: '#f0c040', rows: ['.###.', '#####', '.###.', '..#..', '..#..', '.###.'] },
];
const bannerPole = (v: number): Px => {
  const b = BANNERS[v % BANNERS.length]!;
  const p = new Px(16, 40);
  p.rect(7, 3, 2, 34, WOOD_D).rect(7, 3, 1, 34, WOOD);
  p.rect(6, 0, 4, 3, BRASS).rect(7, 0, 1, 2, BRASS_L).px(6, 0, BRASS_D).px(9, 0, BRASS_D);
  p.rect(2, 5, 12, 2, WOOD_D).rect(2, 5, 12, 1, WOOD_L).px(2, 7, BRASS).px(13, 7, BRASS);
  // the cloth with a swallowtail hem and a gold border
  p.rect(3, 7, 10, 18, b.c).rect(3, 7, 10, 1, shade(b.c, 0.7)).rect(3, 8, 1, 17, shade(b.c, 1.2)).rect(12, 8, 1, 17, shade(b.c, 0.75));
  p.rect(3, 25, 4, 3, b.c).rect(9, 25, 4, 3, b.c).px(3, 28, b.c).px(12, 28, b.c);
  p.rect(4, 9, 8, 1, BRASS).rect(4, 23, 8, 1, BRASS);
  p.tpl(6, 13, b.rows, { '#': b.e });
  p.rect(5, 36, 6, 4, STONE_D).rect(5, 36, 6, 1, STONE_L).rect(6, 37, 4, 2, STONE);
  return p.outline(OUTLINE);
};

/** Three barrels stacked on their ends, two below and one on top (16×20). */
const barrelStack = (): Px => {
  const p = new Px(16, 20);
  barrel(p, 4, 0, 8, 9);
  barrel(p, 0, 9, 8, 10);
  barrel(p, 8, 9, 8, 10);
  p.rect(9, 10, 2, 1, '#5a3d20');
  return p.outline(OUTLINE);
};

/** A runestone (16×28): grey granite carved with a serpent band, its runes glowing blue, brighter on frame 1. */
const runestone = (f: number): Px => {
  const p = new Px(16, 28);
  const G = '#8a8a8e';
  p.ellipse(2, 1, 11, 10, G).rect(2, 6, 12, 18, G).ellipse(1, 20, 14, 7, G).px(13, 4, G).px(13, 5, G);
  p.rect(3, 6, 2, 15, '#a4a4a8').ellipse(4, 2, 5, 4, '#a4a4a8').rect(12, 7, 2, 17, '#6a6a70').px(9, 13, '#76767c').px(6, 19, '#76767c');
  p.rect(1, 25, 14, 2, '#4f8a35').px(0, 26, '#5a9a40').px(15, 25, '#5a9a40').rect(4, 24, 1, 2, '#6aaa4a').rect(11, 24, 1, 2, '#6aaa4a');
  // the serpent band, painted red the old way, running round the stone and biting its tail at the foot
  const band = '#b8483a';
  p.line(5, 4, 10, 4, band).line(10, 4, 12, 7, band).line(12, 7, 12, 21, band).line(5, 4, 4, 7, band).line(4, 7, 4, 21, band).line(4, 21, 7, 23, band).line(12, 21, 9, 23, band);
  p.px(7, 3, band).px(8, 3, band).px(8, 23, '#f0e0c0');
  // the runes inside it glow blue, brighter on frame 1
  const g = f ? RUNE_L : RUNE;
  p.tpl(6, 7, ['|`.|', '||/.', '|.`|', '/|.|', '|`|.', '|.|/', '`|.|', '|/.|', '.|`|', '|`.|', '|.|/', '/.||', '|`..'], { '|': g, '/': g, '`': g });
  if (f) p.px(5, 6, RUNE_L).px(11, 12, RUNE_L).px(5, 18, RUNE_L);
  return p.outline(OUTLINE);
};

/** A hay wagon (32×24, on a 2×1 footprint): four wheels, a mound of hay and a pitchfork stuck in it. */
const hayCart = (): Px => {
  const p = new Px(32, 24);
  hay(p, 2, 0, 26, 12);
  p.line(22, 1, 26, 9, WOOD_L).px(21, 0, IRON_L).px(22, 0, IRON_L).px(20, 1, IRON_L).px(23, 1, IRON_L).px(21, 1, IRON).px(19, 0, IRON_L);
  p.rect(1, 13, 28, 5, '#9a6a3a').rect(1, 13, 28, 1, '#c58f55').rect(1, 17, 28, 1, WOOD_D);
  for (let x = 4; x < 28; x += 6) p.rect(x, 14, 1, 3, WOOD_D);
  p.line(29, 15, 31, 19, WOOD_D).line(29, 16, 31, 20, WOOD_D);
  spokeWheel(p, 6, 19, 4.5);
  spokeWheel(p, 23, 19, 4.5, 1);
  return p.outline(OUTLINE);
};
const bathExit = (): Px => new Px(16, 16).rect(0, 0, 16, 16, '#b9b6ad').rect(1, 1, 14, 14, '#2b86a6').rect(2, 2, 12, 12, '#4fb8da').rect(3, 3, 10, 10, '#2b86a6').rect(4, 4, 8, 8, '#4fb8da').rect(11, 7, 2, 2, '#f2d35a').rect(5, 12, 6, 1, '#dff6ff');

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

// The farm shop ("Gårdsbutik"): a small market stall with a striped awning, a counter with produce and a price sign.
// Still registered as the 'mailbox' object kind (ids never change).
const mailbox = (): Px => {
  const p = new Px(16, 24);
  // posts and dark back wall under the awning
  p.rect(1, 8, 2, 15, WOOD_D).rect(13, 8, 2, 15, WOOD_D).rect(3, 8, 10, 7, '#5a3d22');
  // red/white striped awning with a scalloped edge
  for (let x = 0; x < 16; x += 2) {
    const c = x % 4 === 0 ? '#d9453b' : '#ffffff';
    p.rect(x, 2, 2, 6, c);
    p.rect(x, 8, 2, 1, c);
  }
  p.rect(0, 1, 16, 1, '#8f2f2a').rect(0, 7, 16, 1, shade('#d9453b', 0.8));
  // counter with plank lines
  p.rect(0, 15, 16, 8, WOOD).rect(0, 15, 16, 1, WOOD_L).rect(0, 22, 16, 1, WOOD_D);
  for (const x of [5, 10]) p.rect(x, 16, 1, 6, WOOD_D);
  // produce on the counter: apples, a carrot crate and a bright pumpkin
  p.rect(3, 13, 2, 2, '#e03a3a').rect(5, 13, 2, 2, '#e8502a').px(4, 12, '#3a8a3a');
  p.rect(9, 12, 4, 3, WOOD_L).rect(9, 12, 4, 1, WOOD_D).rect(10, 11, 1, 1, '#f08a2a').rect(12, 11, 1, 1, '#f08a2a').px(11, 11, '#3a8a3a');
  p.rect(7, 13, 2, 2, '#f5d94a');
  // price sign on the counter front
  p.rect(5, 17, 6, 4, '#f4ead8').box(5, 17, 6, 4, WOOD_D).circle(8, 19, 1, '#d4a52a');
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
  const p = tree('pine', 0);
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
  set('tree', [tree('round', 0), tree('round', 1)], -4, -20);
  set('tree_pine', [tree('pine', 0)], -4, -20);
  set('tree_apple', [tree('apple', 0)], -4, -20);
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
  set('pigsty', [pigsty()], 0, -6);
  set('bathhouse', [bathhouse()], 0, -12);
  set('apartment', [0, 1, 2, 3].map(apartment), 0, -8);
  set('shop', [0, 1, 2].map(shop), 0, -8);
  set('traffic_light', [trafficLight()], 0, -8);
  set('street_lamp', [streetLamp()], 0, -8);
  set('parked_car', [0, 1, 2].map(parkedCar), 0, -2);
  set('bus_stop', [busStop()], 0, -8);
  set('train_station', [trainStation()], 0, -8);
  set('bath_exit', [bathExit()]);
  // the market town's dressing
  set('banner_pole', [0, 1, 2].map(bannerPole), 0, -24);
  set('barrel_stack', [barrelStack()], 0, -4);
  set('runestone', [runestone(0), runestone(1)], 0, -12, true);
  set('hay_cart', [hayCart()], 0, -8);
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
  set('pizzeria', [pizzeria()], 0, -12);
  set('lantern', [lantern(0), lantern(1)], 0, -8, true);
  set('town_well', [well()], 0, -8);
  // Cave
  set('cave', [caveMouth()], 0, -8);
  set('cave_exit', [caveExit()]);
  set('cave_wall', [caveWall(false), caveWall(true), ...Array.from({ length: 11 }, (_, t) => [caveWallThemed(t, false), caveWallThemed(t, true)]).flat()], 0, -8);
  set('cave_torch', [torch(0), torch(1)], 0, 0, true);
  set('cave_rock', [rock(true)]);
  set('treasure', [treasure()]);
  drawBiomeObjects(set);
  drawLandmarks(set);
  drawArcade(set);
  drawSaga(set);
  drawSagaPlaces(set);
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
  const splash = new Px(16, 12).tpl(0, 0, ['...#....#...', '..#.#..#.#..', '.#...##...#.', '#....##....#', '.##.####.##.', '..########..'], { '#': '#dff6ff' }).rect(5, 8, 2, 2, '#8fe0f8');
  const ripple = (f: number) => {
    const p = new Px(20, 10);
    const w = 12 + f * 4;
    const h = 5 + f * 2;
    p.ellipse(10 - w / 2, 5 - h / 2, w, h, f ? '#dff6ff88' : '#dff6ffcc').ellipse(10 - w / 2 + 1, 5 - h / 2 + 1, w - 2, h - 2, '#00000000');
    return p;
  };
  const lasso = new Px(12, 12).circle(6, 6, 5.5, WOOD_L).circle(6, 6, 4.5, WOOD_D);
  lasso.ctx.clearRect(3, 3, 6, 6);
  lasso.rect(5, 9, 2, 3, WOOD_L);
  const honk = new Px(14, 12).tpl(0, 0, ['....#....', '...##..#.', '..###...#', '.####...#', '..###...#', '...##..#.', '....#....'], { '#': '#ffe66a' }).rect(0, 4, 3, 3, '#ffe66a');
  return {
    hit: [hit],
    arrow: [arrow],
    lasso: [lasso],
    honk: [honk],
    splash: [splash],
    ripple: [ripple(0), ripple(1)],
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
  vissla: '🎵',
  dans: '💃',
};
