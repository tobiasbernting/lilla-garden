// Gabled roofs over the rooms players close with wall pieces (the 2D game's look), each painted once into a texture.
import { findRooms, MAP_W, TILE, type WorldState } from '@lilla-garden/shared';
import { release, standalone, type Sprite } from './atlas.ts';

export interface Roof {
  sprite: Sprite;
  /** World pixel position of the picture's top-left. */
  x: number;
  y: number;
  depth: number;
  /** Tiles it covers: it fades away while the local player stands under it. */
  tiles: Set<number>;
  alpha: number;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const shadeInt = (c: number, f: number): number => {
  const ch = (sh: number) => Math.min(255, Math.round(((c >> sh) & 0xff) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export function buildRoofs(world: WorldState, underTile: number): Roof[] {
  const out: Roof[] = [];
  for (const room of findRooms(world)) {
    const tiles = new Set([...room.tiles, ...room.walls]);
    const base = room.stone ? 0x646b74 : 0xb5413a;
    const lit = hex(shadeInt(base, 1.12));
    const dark = hex(shadeInt(base, 0.82));
    const line = hex(shadeInt(base, 0.62));
    const has = (x: number, y: number) => tiles.has(y * MAP_W + x);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    // each column's ridge sits halfway between its top and bottom tile
    const span = new Map<number, [number, number]>();
    for (const i of tiles) {
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const s = span.get(x);
      span.set(x, s ? [Math.min(s[0], y), Math.max(s[1], y)] : [y, y]);
    }
    // the roof is drawn one tile up, like the walls' height, so the front wall still shows below the eaves
    const ox = minX * TILE;
    const oy = (minY - 1) * TILE;
    const c = document.createElement('canvas');
    c.width = (maxX - minX + 1) * TILE;
    c.height = (maxY - minY + 1) * TILE;
    const g = c.getContext('2d')!;
    const rect = (col: string, x: number, y: number, w: number, h: number) => {
      g.fillStyle = col;
      g.fillRect(x - ox, y - oy, w, h);
    };
    for (const i of tiles) {
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      const [top, bot] = span.get(x)!;
      const ridge = ((top + bot + 1) / 2) * TILE;
      const px = x * TILE;
      for (let row = 0; row < 4; row++) {
        const ry = y * TILE + row * 4;
        rect(ry + 4 <= ridge ? lit : dark, px, ry - TILE, TILE, 4);
        rect(line, px, ry - TILE + 3, TILE, 1);
        const off = (row + y) % 2 ? 2 : 6;
        rect(line, px + off, ry - TILE, 1, 3);
        rect(line, px + off + 8, ry - TILE, 1, 3);
      }
      if (!has(x - 1, y)) rect(line, px, y * TILE - TILE, 1, TILE);
      if (!has(x + 1, y)) rect(line, px + TILE - 1, y * TILE - TILE, 1, TILE);
      if (!has(x, y - 1)) rect(line, px, y * TILE - TILE, TILE, 1);
      // eaves along the front
      if (!has(x, y + 1)) {
        rect(hex(shadeInt(base, 0.7)), px, y * TILE - 3, TILE, 2);
        rect(line, px, y * TILE - 1, TILE, 1);
      }
    }
    // the ridge on top, once every tile is down
    for (const [x, [top, bot]] of span) rect(hex(shadeInt(base, 1.35)), x * TILE, ((top + bot + 1) / 2) * TILE - TILE - 1, TILE, 2);
    out.push({ sprite: standalone(c), x: ox, y: oy, depth: (maxY + 1) * TILE + 0.5, tiles, alpha: tiles.has(underTile) ? 0 : 1 });
  }
  return out;
}

export function releaseRoofs(roofs: Roof[]): void {
  for (const r of roofs) release(r.sprite);
}
