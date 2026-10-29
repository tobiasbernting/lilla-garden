// Ground of the wider world: cliffs (grey rock, red sandstone, black basalt), lava, ash, mud, bog water,
// moss, red sand, candy, chocolate, moon dust and the starry sky around the moon.
import { isCliff, type Terrain } from '@lilla-garden/shared';
import { Px, hash2 } from './px.js';

export interface BiomeTerrain {
  /** Tile index for one of the wider world's grounds, or null for any other ground. */
  index(t: Terrain, x: number, y: number, snowy: boolean, mask: number, frame: number): number | null;
}

/**
 * Which neighbours count as the same ground when a tile picks its edges (mask bits: 1 up, 2 right,
 * 4 down, 8 left = that side borders other ground). Null: the tile has no edges.
 */
export function edgeGroup(t: Terrain): ((n: Terrain | undefined) => boolean) | null {
  switch (t) {
    case 'water':
      return (n) => n === 'water' || n === undefined;
    case 'pool':
      return (n) => n === 'pool';
    case 'soil':
    case 'soil_wet':
      return (n) => n === 'soil' || n === 'soil_wet' || n === undefined;
    case 'road':
    case 'crossing':
      return (n) => n === 'road' || n === 'crossing';
    case 'bog':
    case 'lava':
    case 'choco':
      return (n) => n === t || n === undefined;
    case 'rock':
    case 'sandstone':
    case 'basalt':
      return (n) => n === undefined || isCliff(n);
    case 'moon':
      return (n) => n !== 'space';
    default:
      return null;
  }
}

// PLACEHOLDER ART: flat colours with masks, replaced by the real tiles.
export function addBiomeTerrain(add: (p: Px) => number, newArt: boolean): BiomeTerrain {
  void newArt;
  const flat = (c: string, mask = 0, rim = '#000000') => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, c);
    if (mask & 1) p.rect(0, 0, 16, 2, rim);
    if (mask & 2) p.rect(14, 0, 2, 16, rim);
    if (mask & 4) p.rect(0, 13, 16, 3, rim);
    if (mask & 8) p.rect(0, 0, 2, 16, rim);
    return add(p);
  };
  const masked = (c: string, rim: string) => Array.from({ length: 16 }, (_, m) => flat(c, m, rim));
  const liquid = (c: string, rim: string) => Array.from({ length: 16 }, (_, m) => [flat(c, m, rim), flat(c, m, rim)]);
  const rock = masked('#7a766e', '#4a4640');
  const rockSnow = masked('#dfe6ee', '#4a4640');
  const sandstone = masked('#c0663a', '#7a3a1e');
  const basalt = masked('#2c2a30', '#121014');
  const lava = liquid('#f06a1a', '#5a2a1a');
  const bog = liquid('#3d5a3a', '#6a5a3a');
  const choco = liquid('#6a3a1e', '#f0c8d8');
  const moon = masked('#bdbdc6', '#e8e8f0');
  const ash = flat('#4a4448');
  const mud = flat('#6a5a3a');
  const moss = flat('#5a8a6a');
  const redsand = flat('#d08a5a');
  const candy = flat('#f4b8d4');
  const space = [flat('#0a0a1a'), flat('#0c0c20')];
  return {
    index(t, x, y, snowy, mask, frame) {
      const h = hash2(x, y);
      switch (t) {
        case 'rock':
          return (snowy ? rockSnow : rock)[mask & 15]!;
        case 'sandstone':
          return sandstone[mask & 15]!;
        case 'basalt':
          return basalt[mask & 15]!;
        case 'lava':
          return lava[mask & 15]![frame & 1]!;
        case 'bog':
          return bog[mask & 15]![frame & 1]!;
        case 'choco':
          return choco[mask & 15]![frame & 1]!;
        case 'moon':
          return moon[mask & 15]!;
        case 'ash':
          return ash;
        case 'mud':
          return mud;
        case 'moss':
          return moss;
        case 'redsand':
          return redsand;
        case 'candy':
          return candy;
        case 'space':
          return space[h % space.length]!;
        default:
          return null;
      }
    },
  };
}
