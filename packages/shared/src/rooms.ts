// Self-built houses: wall pieces that close a loop make a room.
// The sim lays a floor in a freshly closed room; the 2D client puts a roof on it.

import { inInterior } from './map.ts';
import type { WorldState } from './types.ts';
import { MAP_H, MAP_W } from './types.ts';

/** Pieces of a self-built house; they link up, are painted together and close rooms. */
export const WALL_KINDS = new Set(['wall_wood', 'wall_stone', 'window', 'door']);
/** A bigger walled-in area is a yard, not a house: no floor, no roof. */
export const MAX_ROOM_TILES = 160;

export interface Room {
  /** Tile indices (y * MAP_W + x) inside the walls. */
  tiles: number[];
  /** Tile indices of the wall pieces touching the room (also diagonally, so corners count). */
  walls: number[];
  /** Most of the walls are stone (stone floor, slate roof) rather than wood. */
  stone: boolean;
}

const N8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;

/** Wall-piece kind per tile, or undefined. */
function wallGrid(world: WorldState): (string | undefined)[] {
  const grid: (string | undefined)[] = new Array(MAP_W * MAP_H);
  for (const o of Object.values(world.objects))
    if (WALL_KINDS.has(o.kind) && o.x >= 0 && o.y >= 0 && o.x < MAP_W && o.y < MAP_H) grid[o.y * MAP_W + o.x] = o.kind;
  return grid;
}

/**
 * Every room in the world: open ground the outside can't reach. The outside floods in from the
 * map edge, also diagonally, so the walls must join side by side (as they look) to close a room.
 */
export function findRooms(world: WorldState): Room[] {
  const wall = wallGrid(world);
  const seen = new Uint8Array(MAP_W * MAP_H);
  const flood = (start: number[]): number[] => {
    const got: number[] = [];
    for (const i of start) seen[i] = 1;
    const todo = [...start];
    while (todo.length) {
      const i = todo.pop()!;
      got.push(i);
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const n = ny * MAP_W + nx;
        if (seen[n] || wall[n]) continue;
        seen[n] = 1;
        todo.push(n);
      }
    }
    return got;
  };
  const edge: number[] = [];
  for (let x = 0; x < MAP_W; x++) edge.push(x, (MAP_H - 1) * MAP_W + x);
  for (let y = 1; y < MAP_H - 1; y++) edge.push(y * MAP_W, y * MAP_W + MAP_W - 1);
  flood(edge.filter((i) => !wall[i]));

  const farm = !world.area;
  const rooms: Room[] = [];
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    if (seen[i] || wall[i]) continue;
    const tiles = flood([i]);
    if (tiles.length > MAX_ROOM_TILES) continue;
    // The farmhouse's inside is a walled room of its own (with its own exit), never roofed over
    if (farm && tiles.some((t) => inInterior(t % MAP_W, Math.floor(t / MAP_W)))) continue;
    const walls = new Set<number>();
    for (const t of tiles) {
      const x = t % MAP_W;
      const y = (t - x) / MAP_W;
      for (const [dx, dy] of N8) {
        const n = (y + dy) * MAP_W + x + dx;
        if (wall[n]) walls.add(n);
      }
    }
    let stone = 0;
    for (const w of walls) if (wall[w] === 'wall_stone') stone++;
    rooms.push({ tiles, walls: [...walls], stone: stone * 2 > walls.size });
  }
  return rooms;
}
