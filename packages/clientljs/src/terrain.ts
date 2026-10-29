// The ground: which tile picture each cell shows (the 2D game's choice, edges and all), drawn for the cells in view.
import { MAP_H, MAP_W, TILE, type Terrain, type WorldState } from '@lilla-garden/shared';
import { getArt } from '@v1/art/textures.ts';
import type { Sprite } from './atlas.ts';
import { drawSprite } from './gfx.ts';

export class Ground {
  /** Tile picture per cell, for both water frames. */
  private frames = [new Int32Array(MAP_W * MAP_H), new Int32Array(MAP_W * MAP_H)];
  /** Cells of open water (glints) in this map. */
  water: [number, number][] = [];
  snowy = false;

  constructor(
    private world: WorldState,
    private cave: boolean,
    private tiles: Sprite[],
  ) {}

  private terrainAt(x: number, y: number): Terrain | undefined {
    return x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? undefined : this.world.terrain[y * MAP_W + x];
  }

  /** Sides of (x,y) whose ground is of another kind: 1 up, 2 right, 4 down, 8 left. */
  private edgeMask(x: number, y: number, same: (t: Terrain | undefined) => boolean): number {
    return (same(this.terrainAt(x, y - 1)) ? 0 : 1) | (same(this.terrainAt(x + 1, y)) ? 0 : 2) | (same(this.terrainAt(x, y + 1)) ? 0 : 4) | (same(this.terrainAt(x - 1, y)) ? 0 : 8);
  }

  private tileIndexFor(x: number, y: number, frame: number): number {
    const art = getArt();
    const t = this.world.terrain[y * MAP_W + x]!;
    if (this.cave) return t === 'water' ? art.terrain.rock : art.terrain.index(t, x, y, false);
    const snowy = this.snowy;
    if (!art.terrain.edges) return art.terrain.index(t, x, y, snowy, 0, t === 'water' || t === 'pool' ? frame : 0);
    if (t === 'water') return art.terrain.index(t, x, y, snowy, this.edgeMask(x, y, (n) => n === 'water' || n === undefined), frame);
    if (t === 'pool') return art.terrain.index(t, x, y, snowy, this.edgeMask(x, y, (n) => n === 'pool'), frame);
    if (t === 'soil' || t === 'soil_wet') return art.terrain.index(t, x, y, snowy, this.edgeMask(x, y, (n) => n === 'soil' || n === 'soil_wet' || n === undefined));
    if (t === 'road' || t === 'crossing') return art.terrain.index(t, x, y, snowy, this.edgeMask(x, y, (n) => n === 'road' || n === 'crossing'));
    return art.terrain.index(t, x, y, snowy);
  }

  private setCell(x: number, y: number): void {
    const i = y * MAP_W + x;
    this.frames[0]![i] = this.tileIndexFor(x, y, 0);
    this.frames[1]![i] = this.tileIndexFor(x, y, 1);
  }

  rebuild(): void {
    this.water = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        this.setCell(x, y);
        if (!this.cave && this.world.terrain[y * MAP_W + x] === 'water') this.water.push([x, y]);
      }
  }

  /** One cell changed: it and its neighbours (whose edges follow it) get new pictures. */
  set(x: number, y: number): void {
    this.setCell(x, y);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const)
      if (x + dx >= 0 && y + dy >= 0 && x + dx < MAP_W && y + dy < MAP_H) this.setCell(x + dx, y + dy);
    this.water = this.water.filter(([wx, wy]) => wx !== x || wy !== y);
    if (!this.cave && this.world.terrain[y * MAP_W + x] === 'water') this.water.push([x, y]);
  }

  isWater(x: number, y: number): boolean {
    const t = this.terrainAt(x, y);
    return t === 'water' || t === 'pool';
  }

  /** Draws the cells between (x0,y0) and (x1,y1), inclusive, in tiles. */
  draw(x0: number, y0: number, x1: number, y1: number, waterFrame: number): void {
    const idx = this.frames[waterFrame]!;
    for (let y = Math.max(0, y0); y <= Math.min(MAP_H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(MAP_W - 1, x1); x++) {
        const s = this.tiles[idx[y * MAP_W + x]!];
        if (s) drawSprite(s, x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE);
      }
  }
}
