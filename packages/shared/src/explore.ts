// Upptäcktsboken's rules: touching a landmark the first time finds it (a star, its lore on a banner, a small cache),
// later touches tell the lore again; coming within sight of one notes it on the world map; old saved maps that have
// none get theirs where there is room.
import { LANDMARKS, LANDMARK_SEEN_TILES, landmarkOfKind, landmarksOf, seenKey } from './landmarks.ts';
import { objectDef } from './data.ts';
import { mapW, tileIndex } from './map.ts';
import type { Change } from './protocol.ts';
import { hashString, mulberry32 } from './rng.ts';
import { placeLandmarks } from './painters.ts';
import { isSagaKey } from './saga.ts';
import { progressOf } from './sagasim.ts';
import { bump, farmOf, fx, giveItems, playerChange, toast } from './sim.ts';
import { MOON_ROCKET, isMoonKey, rocketFront } from './space.ts';
import { T, fmt, itemName } from './sv.ts';
import { MAP_W, TILE, type PlayerState, type WorldObject, type WorldState } from './types.ts';
import { Painter, arrivalTile, landmarkFronts, reachableFrom } from './worldgen.ts';

/** Notes a landmark as seen on a map; true if it was new. */
function markSeen(p: PlayerState, area: string, id: string): boolean {
  const prog = progressOf(p);
  const seen = (prog.seen ??= []);
  const k = seenKey(area, id);
  if (seen.includes(k)) return false;
  seen.push(k);
  return true;
}

/**
 * Touching a landmark (`interact: 'landmark'`). The first time a player touches a kind: it is found (prog.discovered),
 * a star, the cache of materials and coins, the `landmarks` stat (Upptäcktsresande and friends) and a reward banner
 * with the lore. Every later touch shows the lore again.
 */
export function discoverLandmark(world: WorldState, p: PlayerState, obj: WorldObject): Change[] {
  const id = landmarkOfKind(obj.kind);
  const d = id ? LANDMARKS[id] : undefined;
  if (!id || !d) return [];
  const prog = progressOf(p);
  const found = (prog.discovered ??= []);
  const newlySeen = markSeen(p, p.area, id);
  if (found.includes(id)) {
    const out: Change[] = [toast(p.id, fmt(T.landmarkAgain, { name: d.name, lore: d.lore }))];
    if (newlySeen) out.push(playerChange(p));
    return out;
  }
  found.push(id);
  const out: Change[] = [];
  p.stars += 1;
  p.coins += d.coins;
  bump(p, 'earned', d.coins, out);
  for (const [item, count] of d.cache) giveItems(world, p, item, count, out);
  bump(p, 'landmarks', 1, out);
  const got = [...d.cache.map(([item, count]) => `${count} ${itemName(item)}`), `${d.coins} kr`, '1 ⭐'];
  const def = objectDef(obj.kind);
  const cx = obj.x + Math.floor(def.w / 2);
  out.push(
    { t: 'banner', to: p.id, kind: 'reward', text: fmt(T.landmarkFound, { name: d.name }), sub: d.lore },
    toast(p.id, fmt(T.landmarkCache, { items: got.join(', ') })),
    fx(cx, obj.y + 1, 'sparkle'),
    fx(cx, obj.y + def.h, 'coin'),
    playerChange(p),
  );
  return out;
}

/**
 * Notes, for everyone online out in the world, the landmarks within LANDMARK_SEEN_TILES of them (prog.seen, for the
 * world map's badges). The server runs it once a second. Returns a player change for each one who saw something new.
 */
export function noticeLandmarks(world: WorldState): Change[] {
  const farm = farmOf(world);
  const out: Change[] = [];
  const near = LANDMARK_SEEN_TILES * TILE;
  for (const p of Object.values(farm.players)) {
    if (!p.online || p.area === 'farm' || p.area === 'dungeon' || isSagaKey(p.area)) continue;
    const a = farm.areas?.[p.area];
    if (!a || !landmarksOf(a.biome).length) continue;
    let changed = false;
    for (const o of Object.values(a.objects)) {
      const id = landmarkOfKind(o.kind);
      if (!id) continue;
      const def = objectDef(o.kind);
      const cx = (o.x + def.w / 2) * TILE;
      const cy = (o.y + def.h / 2) * TILE;
      if (Math.hypot(cx - p.x, cy - p.y) <= near && markSeen(p, p.area, id)) changed = true;
    }
    if (changed) out.push(playerChange(p));
  }
  return out;
}

/**
 * A saved wild map (or the moon) the family has changed, from before the landmarks: its landmarks where there is
 * room (two on a big map, one on a 64 map), only where they can be walked to and cut nothing else off. True if any
 * were added. Maps that already have one are left alone.
 */
export function ensureLandmarks(a: WorldState): boolean {
  if (!landmarksOf(a.biome).length || !a.area) return false;
  if (Object.values(a.objects).some((o) => landmarkOfKind(o.kind))) return false;
  const k = a.area;
  const entry = isMoonKey(k) ? rocketFront(MOON_ROCKET) : arrivalTile(a, 'n');
  const wanted = (): { x: number; y: number }[] => [...(isMoonKey(k) ? [] : (['s', 'e', 'w'] as const).map((side) => arrivalTile(a, side))), ...landmarkFronts(a)];
  const before = reachableFrom(a, entry);
  const keep = wanted().filter((t) => before[tileIndex(a, t.x, t.y)]);
  const g = new Painter(a, mulberry32(hashString(`${k}/lm`)), hashString(`${k}/lm`));
  const placed = placeLandmarks(g, mulberry32(hashString(`${k}/upptäckt`)), mapW(a) > MAP_W ? 2 : 1, (o) => {
    const reach = reachableFrom(a, entry);
    const def = objectDef(o.kind);
    const front = { x: o.x + Math.floor((def.w - 1) / 2), y: o.y + def.h };
    return !!reach[tileIndex(a, front.x, front.y)] && keep.every((t) => reach[tileIndex(a, t.x, t.y)]);
  });
  return placed.length > 0;
}
