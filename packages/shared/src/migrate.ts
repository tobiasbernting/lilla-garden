// Explored maps saved by an older version of the world. Untouched ones are rebuilt with today's biomes;
// ones the family changed (built on, farmed, left a pet or a thing) are kept and topped up instead.
import { AREA_GEN, parseAreaKey } from './biomes.ts';
import { CAVE_THEMES, countRenewables } from './caves.ts';
import { objectDef } from './data.ts';
import { objectAt } from './map.ts';
import { hashString, mulberry32 } from './rng.ts';
import { buildArea, openTileNear } from './sim.ts';
import { ensureSpaceport } from './space.ts';
import { MAP_H, MAP_W, TILE, type CaveTheme, type Terrain, type WorldState } from './types.ts';
import { Painter, connect, plankBridge } from './worldgen.ts';

/** Has anyone left a mark on this map: built, farmed, dropped something, left an animal, dug blocks? */
export function untouched(a: WorldState): boolean {
  if (Object.values(a.objects).some((o) => o.by)) return false;
  if (Object.keys(a.crops).length || Object.keys(a.drops).length) return false;
  if (Object.values(a.animals).some((an) => an.owner || an.stay)) return false;
  return !a.terrain.some((t) => t === 'soil' || t === 'soil_wet' || t === 'floor_wood' || t === 'floor_stone' || t === 'path_stone' || t === 'path_dirt');
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
    const x = g.int(8, MAP_W - 17);
    const y = g.int(8, MAP_H - 15);
    if (Math.abs(x + 4 - MAP_W / 2) < 8 || Math.abs(y + 3 - MAP_H / 2) < 6) continue;
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
 * Cities and anything that is not a grid map are left as they are.
 */
export function upgradeSavedArea(a: WorldState, k: string): { area: WorldState; rebuilt: boolean } {
  if ((a.gen ?? 1) >= AREA_GEN) return { area: a, rebuilt: false };
  const c = parseAreaKey(k);
  if (!c || a.biome === 'by') {
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
