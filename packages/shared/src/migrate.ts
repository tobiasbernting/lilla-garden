// Explored maps saved by an older version of the world. Untouched ones are rebuilt with today's biomes;
// ones the family changed (built on, farmed, left a pet or a thing) are kept and topped up instead.
import { AREA_GEN, generateArea, parseAreaKey } from './biomes.ts';
import { CAVE_THEMES, countRenewables } from './caves.ts';
import { objectDef } from './data.ts';
import { mapH, mapW, objectAt } from './map.ts';
import { hashString, mulberry32 } from './rng.ts';
import { ensureSagaPlaces } from './sagasim.ts';
import { buildArea, openTileNear } from './sim.ts';
import { ensureSpaceport } from './space.ts';
import { TILE, type CaveTheme, type Terrain, type WorldState } from './types.ts';
import { Painter, connect, plankBridge } from './worldgen.ts';

/** Ground only people make (a map from before the wider world had none of it). */
const MADE_GROUND = new Set<Terrain>(['soil', 'soil_wet', 'floor_wood', 'floor_stone', 'path_stone', 'path_dirt']);
/** Floors and paths: today's painters lay them too (trails, bridges, plazas), so on newer maps only stray ones count. */
const FLOORS = new Set<Terrain>(['floor_wood', 'floor_stone', 'path_stone', 'path_dirt']);

/** Has anyone left a mark on this map: built, farmed, dropped something, left an animal, dug blocks? */
export function untouched(a: WorldState): boolean {
  if (!untouchedThings(a)) return false;
  return !a.terrain.some((t) => MADE_GROUND.has(t));
}

/** Nothing built, planted, dropped or left behind (the ground is checked separately). */
function untouchedThings(a: WorldState): boolean {
  if (Object.values(a.objects).some((o) => o.by)) return false;
  if (Object.keys(a.crops).length || Object.keys(a.drops).length) return false;
  return !Object.values(a.animals).some((an) => an.owner || an.stay);
}

/**
 * The same test for a map today's painters built (gen 2 and later), which has trails, bridges and plazas of
 * its own: the map is built again the way it was first made (64×64, with its dungeon arch) and only ground
 * the painter could not have laid counts, i.e. fields anywhere, and floors or paths with no floor or path of
 * the fresh map within two tiles (a trail of an older painter may have wandered a little).
 */
function untouchedSinceBuilt(a: WorldState, k: string, ax: number, ay: number): boolean {
  if (!untouchedThings(a)) return false;
  if (a.terrain.some((t) => t === 'soil' || t === 'soil_wet')) return false;
  const fresh = generateArea(ax, ay, undefined, mapW(a));
  if (fresh.terrain.length !== a.terrain.length) return false;
  fresh.area = k;
  ensureSagaPlaces(k, fresh);
  const W = mapW(a);
  const H = mapH(a);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = a.terrain[y * W + x]!;
      if (!FLOORS.has(t) || fresh.terrain[y * W + x] === t) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && FLOORS.has(fresh.terrain[ny * W + nx]!)) near = true;
        }
      if (!near) return false;
    }
  return true;
}

/** What grows back in a kept old map: its own finds, and the new ones of its biome. */
const OLD_RENEW: Record<string, Record<string, number>> = {
  skog: { mushroom: 6, blueberry_bush: 6 },
  ang: { beehive: 2 },
  is: { iceberry: 8 },
  berg: { ore: 6 },
  strand: { shell: 10, dig_spot: 2 },
  oken: { cactus: 10, dig_spot: 2 },
};
const OLD_CAVE: Record<string, CaveTheme> = { skog: 'rot', ang: 'rot', is: 'is', berg: 'kristall', strand: 'sjorovare', oken: 'pyramid' };
const OLD_GROUND: Record<string, Terrain> = { skog: 'grass', ang: 'grass', is: 'snow', berg: 'gravel', strand: 'sand', oken: 'sand' };

/** Gives a kept old map a cave of its own, in a spot that is still wild (nothing built or dug there). */
function addCave(a: WorldState, k: string): void {
  const biome = a.biome ?? '';
  const theme = OLD_CAVE[biome];
  const ground = OLD_GROUND[biome];
  if (!theme || !ground || Object.values(a.objects).some((o) => o.kind === 'cave_mouth')) return;
  const g = new Painter(a, mulberry32(hashString(k)), hashString(`${k}/cave`));
  g.ground = ground;
  for (let tries = 0; tries < 300; tries++) {
    const x = g.int(8, g.W - 17);
    const y = g.int(8, g.H - 15);
    if (Math.abs(x + 4 - g.midX) < 8 || Math.abs(y + 3 - g.midY) < 6) continue;
    let wild = true;
    for (let dy = -2; dy < 10 && wild; dy++)
      for (let dx = -2; dx < 11 && wild; dx++) {
        const t = g.at(x + dx, y + dy);
        if (t !== ground) wild = false;
        const o = objectAt(a, x + dx, y + dy);
        if (o && (!objectDef(o.kind).breakWith || o.by || objectDef(o.kind).interact)) wild = false;
      }
    if (!wild) continue;
    g.caveHill(x + 4, y + 2, 'rock', CAVE_THEMES.indexOf(theme), 0);
    connect(g, { trail: null, trails: false, bridge: plankBridge, pass: ground });
    return;
  }
}

/**
 * Brings a saved overworld map up to date. Returns the map to keep (a new one when rebuilt).
 * Cities and anything that is not a grid map are left as they are. Untouched maps are built again by
 * today's generator (so wild maps grow to 96×96); maps the family changed keep their size (64×64), and
 * ones from before the wider world get a cave and regrowth.
 */
export function upgradeSavedArea(a: WorldState, k: string): { area: WorldState; rebuilt: boolean } {
  if ((a.gen ?? 1) >= AREA_GEN) return { area: a, rebuilt: false };
  const c = parseAreaKey(k);
  if (!c || a.biome === 'by') {
    a.gen = AREA_GEN;
    return { area: a, rebuilt: false };
  }
  if (a.gen !== undefined && a.gen >= 2) {
    // built by today's painters: rebuilt if nobody changed it, else kept as it is
    if (untouchedSinceBuilt(a, k, c.ax, c.ay)) return { area: buildArea(c.ax, c.ay), rebuilt: true };
    a.gen = AREA_GEN;
    return { area: a, rebuilt: false };
  }
  if (untouched(a)) return { area: buildArea(c.ax, c.ay), rebuilt: true };
  addCave(a, k);
  ensureSpaceport(a);
  const have = countRenewables(a);
  const want = OLD_RENEW[a.biome ?? ''] ?? {};
  a.renew = { ...have };
  for (const [kind, n] of Object.entries(want)) a.renew[kind] = Math.max(n, have[kind] ?? 0);
  a.gen = AREA_GEN;
  return { area: a, rebuilt: false };
}

/** After a map was rebuilt: someone who logged out there stands on open ground again. */
export function settlePlayer(a: WorldState, p: { x: number; y: number }): void {
  const at = openTileNear(a, Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  p.x = at.x * TILE + TILE / 2;
  p.y = at.y * TILE + TILE / 2;
}
