// The wider world: biomes, caves, treasure, fairy rings, the rocket to the moon, dragon eggs and regrowth.
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ANIMALS,
  AREA_GEN,
  BASE_ROCKET,
  CAVE_THEMES,
  DISCOVERABLE,
  LOOT,
  MAP_H,
  MAP_W,
  WILD_MAP,
  MOON_KEY,
  MOON_ROCKET,
  SPACEPORT,
  SPACEPORT_KEY,
  TILE,
  addItem,
  addObject,
  areaKey,
  areaOf,
  arrivalTile,
  biomeAt,
  caveKey,
  createPlayer,
  ensureRoaming,
  entranceFront,
  generateArea,
  generateCave,
  generateMoon,
  generateWorld,
  getArea,
  inEdgeGap,
  isSolidForPlayer,
  landmarkFronts,
  mapH,
  mapW,
  mulberry32,
  newDay,
  objectAt,
  objectDef,
  performAction,
  rebuildOccupancy,
  stepPlayer,
  upgradeSavedArea,
  reachableFrom,
  rocketFront,
  setOnline,
  themeOfEntrance,
  tileIndex,
  travel,
  wildSpeciesOf,
  LANDMARKS,
  LANDMARK_IDS,
  LANDMARK_SEEN_TILES,
  ensureLandmarks,
  landmarkOfKind,
  landmarksOf,
  noticeLandmarks,
  removeObject,
  seenKey,
  T,
  type WorldObject,
  type Change,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const ctx = (seed = 7): SimCtx => ({ season: 'none', rnd: mulberry32(seed), now: 1_000_000 });
const toasts = (ch: Change[]): string[] => ch.filter((c) => c.t === 'toast').map((c) => (c as { text: string }).text);

function setup(): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Test', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
  setOnline(world, p.id, true);
  return { world, p };
}

/** Puts a player into a map (as travel would) at a tile. */
function goTo(world: WorldState, p: PlayerState, k: string, x: number, y: number): WorldState {
  const a = getArea(world, k)!;
  if (p.area !== 'farm') delete areaOf(world, p).players[p.id];
  p.area = k;
  p.x = x * TILE + TILE / 2;
  p.y = y * TILE + TILE / 2;
  if (!p.visited.includes(k)) p.visited.push(k);
  a.players[p.id] = p;
  return a;
}

/** The landmarks (Upptäcktsboken) on a map. */
const landmarksIn = (a: WorldState): WorldObject[] => Object.values(a.objects).filter((o) => landmarkOfKind(o.kind));

/** An open grass tile away from the edges (with an extra condition). */
function openSpot(a: WorldState, ok: (x: number, y: number) => boolean = () => true): { x: number; y: number } {
  for (let y = 8; y < mapH(a) - 8; y++)
    for (let x = 8; x < mapW(a) - 8; x++)
      if (a.terrain[tileIndex(a, x, y)] === 'grass' && !objectAt(a, x, y) && !inEdgeGap(a, x, y) && ok(x, y)) return { x, y };
  throw new Error('no open spot');
}

const hold = (p: PlayerState, item: string): void => {
  addItem(p.inventory, item, 1);
  p.selected = p.inventory.findIndex((s) => s?.item === item);
};

/** The old rule for where cities are: they must never move. */
const oldCity = (ax: number, ay: number): boolean => {
  if (ax === 1 && ay === 0) return true;
  let h = (ax * 374761393 + ay * 668265263 + 9 * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs(ax) + Math.abs(ay) >= 4 && ((h ^ (h >>> 16)) >>> 0) / 4294967296 < 0.07;
};

describe('biomerna', () => {
  it('keeps every city where it was and puts the space base south of the farm', () => {
    for (let ay = -16; ay <= 16; ay++) for (let ax = -16; ax <= 16; ax++) expect(biomeAt(ax, ay) === 'by').toBe(oldCity(ax, ay));
    expect(biomeAt(SPACEPORT.ax, SPACEPORT.ay)).toBe('rymdbas');
  });

  it('has every biome somewhere, the new ones close to home, Godislandet far away', () => {
    const found = new Set<string>();
    for (let ay = -12; ay <= 12; ay++) for (let ax = -12; ax <= 12; ax++) if (ax || ay) found.add(biomeAt(ax, ay));
    for (const b of DISCOVERABLE) if (b !== 'mane') expect(found).toContain(b);
    const near = new Set<string>();
    for (let ay = -2; ay <= 2; ay++) for (let ax = -2; ax <= 2; ax++) if (ax || ay) near.add(biomeAt(ax, ay));
    for (const b of ['trask', 'svamp', 'dino', 'berg', 'strand', 'djungel', 'vulkan', 'is', 'oken']) expect(near).toContain(b);
    for (let ay = -4; ay <= 4; ay++) for (let ax = -4; ax <= 4; ax++) if (Math.abs(ax) + Math.abs(ay) < 5) expect(biomeAt(ax, ay)).not.toBe('godis');
  });

  it('every generated map can be crossed, and every cave and chest can be reached', () => {
    const seen = new Set<string>();
    for (let ay = -6; ay <= 6; ay++)
      for (let ax = -6; ax <= 6; ax++) {
        if (!ax && !ay) continue;
        const b = biomeAt(ax, ay);
        if (b === 'by') continue;
        if (seen.has(b) && Math.abs(ax) + Math.abs(ay) > 3 && (ax + ay) % 3) continue; // a sample is enough
        seen.add(b);
        const a = generateArea(ax, ay);
        expect(a.gen).toBe(AREA_GEN);
        // the wild is 96×96; the space base keeps the 64×64 of its plan
        const side = b === 'rymdbas' ? MAP_W : WILD_MAP;
        expect([mapW(a), mapH(a), a.terrain.length], `${b} size`).toEqual([side, side, side * side]);
        const reach = reachableFrom(a, arrivalTile(a, 'n'));
        for (const side of ['s', 'e', 'w'] as const) {
          const t = arrivalTile(a, side);
          expect(reach[tileIndex(a, t.x, t.y)], `${b} (${ax},${ay}) opening ${side}`).toBe(1);
        }
        for (const f of landmarkFronts(a)) expect(reach[tileIndex(a, f.x, f.y)], `${b} (${ax},${ay}) landmark front ${f.x},${f.y}`).toBe(1);
        // Upptäcktsboken: both of the biome's landmarks on a wild map (the space base has its one), far apart,
        // out of the crossroads, and each can be walked up to
        const lms = landmarksIn(a);
        expect(lms.map((o) => landmarkOfKind(o.kind)).sort(), `${b} (${ax},${ay}) landmarks`).toEqual(landmarksOf(b).map((d) => d.id).sort());
        for (const o of lms) {
          const d = objectDef(o.kind);
          expect(reach[tileIndex(a, o.x + Math.floor((d.w - 1) / 2), o.y + d.h)], `${o.kind} front`).toBe(1);
          for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) expect(inEdgeGap(a, o.x + dx, o.y + dy)).toBe(false);
          expect(Math.abs(o.x + d.w / 2 - mapW(a) / 2) >= 4 + d.w / 2 && Math.abs(o.y + d.h / 2 - mapH(a) / 2) >= 3 + d.h / 2, `${o.kind} out of the crossroads`).toBe(true);
        }
        if (lms.length === 2) expect(Math.hypot(lms[0]!.x - lms[1]!.x, lms[0]!.y - lms[1]!.y), `${b} landmarks apart`).toBeGreaterThan(20);
        for (const o of Object.values(a.objects)) {
          if (o.kind === 'loot_chest') {
            const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[tileIndex(a, o.x + dx!, o.y + dy!)]);
            expect(around, `${b} chest`).toBe(true);
          }
          // nothing solid in the openings
          if (objectDef(o.kind).solid) expect(inEdgeGap(a, o.x, o.y)).toBe(false);
        }
        for (const an of Object.values(a.animals)) expect(isSolidForPlayer(a, Math.floor(an.x / TILE), Math.floor(an.y / TILE))).toBe(false);
      }
    // it walks well over a hundred maps: a few seconds, longer on a busy machine
  }, 60_000);

  it('each new biome has its own things to find and animals to meet', () => {
    const want: Record<string, string[]> = {
      trask: ['cloudberry', 'wisp', 'reed'],
      djungel: ['banana_plant', 'jungle_tree'],
      vulkan: ['obsidian_rock', 'fire_crystal'],
      svamp: ['glowshroom', 'giant_mushroom'],
      dino: ['fossil_rock', 'dino_bones'],
      skog: ['blueberry_bush'],
      strand: ['shell', 'dig_spot'],
    };
    for (const [b, kinds] of Object.entries(want)) {
      let at: [number, number] | null = null;
      for (let r = 1; r < 8 && !at; r++) for (let ax = -r; ax <= r && !at; ax++) for (const ay of [-r, r]) if (!at && biomeAt(ax, ay) === b) at = [ax, ay];
      for (let ay = -8; ay <= 8 && !at; ay++) for (let ax = -8; ax <= 8 && !at; ax++) if (biomeAt(ax, ay) === b) at = [ax, ay];
      expect(at, b).not.toBeNull();
      const a = generateArea(at![0], at![1]);
      const kindsHere = new Set(Object.values(a.objects).map((o) => o.kind));
      for (const k of kinds) expect(kindsHere, `${b} has ${k}`).toContain(k);
      expect(wildSpeciesOf(b).length, b).toBeGreaterThan(0);
    }
  });

  it("each biome has its own small monster (never in the city), and saved maps get them too", () => {
    const want: Record<string, string> = { ang: 'angsvatte', skog: 'trollunge', berg: 'trollunge', is: 'snotroll', oken: 'sandande', djungel: 'djungelimp', dino: 'benodla', godis: 'sockerspoke' };
    for (const [b, species] of Object.entries(want)) {
      let at: [number, number] | null = null;
      for (let r = 1; r < 12 && !at; r++) for (let ay = -r; ay <= r && !at; ay++) for (let ax = -r; ax <= r && !at; ax++) if (biomeAt(ax, ay) === b) at = [ax, ay];
      expect(at, b).not.toBeNull();
      const a = generateArea(at![0], at![1]);
      const here = Object.values(a.animals).filter((x) => x.species === species);
      // as many per tile as on a 64 map: a 96 map has 2.25 times as many
      const scale = (mapW(a) * mapH(a)) / (MAP_W * MAP_H);
      const [min, max] = ANIMALS[species]!.wildCount ?? [3, 5];
      expect(scale, b).toBe(2.25);
      expect(here.length, `${b} has ${species}`).toBeGreaterThanOrEqual(Math.round(min * scale));
      expect(here.length).toBeLessThanOrEqual(Math.round(max * scale));
      for (const x of here) expect(x.hp).toBe(ANIMALS[species]!.mob!.hp);
      // only where it belongs
      for (const x of Object.values(a.animals)) if (ANIMALS[x.species]?.mob && ANIMALS[x.species]?.wild) expect(ANIMALS[x.species]!.wild!.split('|')).toContain(b);
      // a map saved before them gets them on load
      for (const x of here) delete a.animals[x.id];
      expect(ensureRoaming(a)).toBe(true);
      expect(Object.values(a.animals).filter((x) => x.species === species).length).toBeGreaterThanOrEqual(Math.round(min * scale));
    }
    expect(Object.values(generateMoon().animals).filter((x) => x.species === 'rymdkryp').length).toBeGreaterThanOrEqual(3);
    // none in the city, none on the farm
    expect(wildSpeciesOf('by').some((d) => d.mob || d.predator)).toBe(false);
    expect(Object.values(generateArea(1, 0).animals).some((x) => ANIMALS[x.species]?.mob)).toBe(false);
    expect(Object.values(generateWorld(1).animals).some((x) => ANIMALS[x.species]?.mob)).toBe(false);
  });

  it('godislandet has candy and a gingerbread house more often than not', () => {
    let at: [number, number] | null = null;
    for (let ay = -14; ay <= 14 && !at; ay++) for (let ax = -14; ax <= 14 && !at; ax++) if (biomeAt(ax, ay) === 'godis') at = [ax, ay];
    expect(at).not.toBeNull();
    const a = generateArea(at![0], at![1]);
    expect(a.terrain.includes('candy')).toBe(true);
    expect(Object.values(a.objects).some((o) => o.kind === 'lollipop_tree' || o.kind === 'candy_cane')).toBe(true);
  });
});

describe('grottorna', () => {
  it('every theme makes a cave with a way out, a chest at the far end, and things to mine', () => {
    for (const theme of CAVE_THEMES) {
      for (let n = 0; n < 4; n++) {
        const k = `g:test-${theme}#${n}`;
        const c = generateCave(k, theme, 'a:9,9', { x: 10, y: 10 });
        expect(c.cave?.theme).toBe(theme);
        expect(c.biome).toBe(`g_${theme}`);
        const start = c.cave!.start;
        expect(isSolidForPlayer(c, start.x, start.y)).toBe(false);
        const exit = objectAt(c, start.x, start.y + 1);
        expect(exit?.kind).toBe('cave_exit');
        const reach = reachableFrom(c, start);
        const chests = Object.values(c.objects).filter((o) => o.kind === 'loot_chest');
        const main = chests.find((o) => o.loot === `cave_${theme}`)!;
        expect(main, theme).toBeDefined();
        expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[tileIndex(c, main.x + dx!, main.y + dy!)])).toBe(true);
        const finds = Object.values(c.objects).filter((o) => (objectDef(o.kind).breakWith === 'pick' || objectDef(o.kind).harvest) && o.kind !== 'cave_rock' && o.kind !== 'stalagmite');
        expect(finds.length, theme).toBeGreaterThan(3);
        // deterministic
        expect(JSON.stringify(generateCave(k, theme, 'a:9,9', { x: 10, y: 10 }).terrain)).toBe(JSON.stringify(c.terrain));
        expect(LOOT[`cave_${theme}`]).toBeDefined();
      }
    }
  });

  it('walk in through a cave mouth, open the chest once a week per player, and walk out in front of the mouth', () => {
    const { world, p } = setup();
    // find a map near home with a cave mouth
    let k = '';
    for (const [ax, ay] of [[2, 0], [0, -2], [-1, 2], [2, 2], [1, 1], [-2, 0]] as const) {
      const a = getArea(world, areaKey(ax, ay))!;
      if (Object.values(a.objects).some((o) => o.kind === 'cave_mouth' || o.kind === 'temple' || o.kind === 'pyramid')) {
        k = areaKey(ax, ay);
        break;
      }
    }
    expect(k).not.toBe('');
    const area = getArea(world, k)!;
    const mouth = Object.values(area.objects).find((o) => themeOfEntrance(o))!;
    const front = entranceFront(mouth);
    goTo(world, p, k, front.x, front.y);
    const ch = performAction(areaOf(world, p), p.id, front.x, front.y - 1, ctx());
    expect(p.area).toBe(caveKey(k, mouth.id));
    expect(ch.some((c) => c.t === 'areaData' && c.key === p.area)).toBe(true);
    expect(p.stats.caves).toBe(1);
    const cave = areaOf(world, p);
    expect(cave.cave?.parent).toBe(k);
    // straight to the chest
    const chest = Object.values(cave.objects).find((o) => o.kind === 'loot_chest' && o.loot?.startsWith('cave_'))!;
    p.x = chest.x * TILE + TILE / 2;
    p.y = (chest.y + 1) * TILE + TILE / 2;
    const coins = p.coins;
    const stars = p.stars;
    const opened = performAction(areaOf(world, p), p.id, chest.x, chest.y, ctx());
    expect(toasts(opened).some((t) => t.startsWith('Skatt!'))).toBe(true);
    expect(p.coins).toBeGreaterThan(coins);
    expect(p.stars).toBeGreaterThan(stars);
    expect(p.stats.loot).toBe(1);
    // empty for this player until a week has passed
    const again = performAction(areaOf(world, p), p.id, chest.x, chest.y, ctx());
    expect(toasts(again).some((t) => t.includes('redan tömt'))).toBe(true);
    // another player gets their own loot
    const q = createPlayer(world, 'Syster', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'long' });
    setOnline(world, q.id, true);
    goTo(world, q, p.area, chest.x, chest.y + 1);
    expect(toasts(performAction(areaOf(world, q), q.id, chest.x, chest.y, ctx())).some((t) => t.startsWith('Skatt!'))).toBe(true);
    // a week later it is full again
    world.day += 7;
    expect(toasts(performAction(areaOf(world, p), p.id, chest.x, chest.y, ctx())).some((t) => t.startsWith('Skatt!'))).toBe(true);
    // out through the exit, landing in front of the mouth
    const start = cave.cave!.start;
    p.x = start.x * TILE + TILE / 2;
    p.y = start.y * TILE + TILE / 2;
    performAction(areaOf(world, p), p.id, start.x, start.y + 1, ctx());
    expect(p.area).toBe(k);
    expect(Math.floor(p.x / TILE)).toBe(front.x);
    expect(Math.floor(p.y / TILE)).toBe(front.y);
    // the same cave next time (saved, not rebuilt)
    performAction(areaOf(world, p), p.id, front.x, front.y - 1, ctx());
    expect(areaOf(world, p)).toBe(cave);
  });

  it('crystals and ore grow back over the days, never beyond what the cave had', () => {
    const c = generateCave('g:test#1', 'kristall', 'a:9,9', { x: 1, y: 1 });
    const base = c.renew!.crystal ?? 0;
    expect(base).toBeGreaterThan(0);
    const crystals = Object.values(c.objects).filter((o) => o.kind === 'crystal');
    for (const o of crystals) {
      delete c.objects[o.id];
      for (let dy = 0; dy < 1; dy++) delete c.occupancy[`${o.x},${o.y + dy}`];
    }
    const { world } = setup();
    world.areas = { 'g:test#1': c };
    for (let d = 0; d < 6; d++) newDay(world, ctx(d));
    const back = Object.values(c.objects).filter((o) => o.kind === 'crystal').length;
    expect(back).toBe(base);
  });
});

describe('skatter och älvor', () => {
  it('an X in the sand is dug up with the hoe for loot that fits the place', () => {
    const { world, p } = setup();
    const k = areaKey(-2, 0); // Stranden
    const a = getArea(world, k)!;
    expect(a.biome).toBe('strand');
    const x = Object.values(a.objects).find((o) => o.kind === 'dig_spot')!;
    expect(x).toBeDefined();
    goTo(world, p, k, x.x, x.y + 1);
    p.selected = p.inventory.findIndex((s) => s === null);
    expect(toasts(performAction(areaOf(world, p), p.id, x.x, x.y, ctx())).some((t) => t.includes('hackan'))).toBe(true);
    hold(p, 'hoe');
    const ch = performAction(areaOf(world, p), p.id, x.x, x.y, ctx());
    expect(toasts(ch).some((t) => t.startsWith('Du grävde upp'))).toBe(true);
    expect(objectAt(a, x.x, x.y)).toBeUndefined();
    expect(p.stats.dig).toBe(1);
  });

  it('dancing in a fairy ring gives fairy dust once a day', () => {
    const { world, p } = setup();
    const k = areaKey(1, -1); // Svampskogen
    const a = getArea(world, k)!;
    expect(a.biome).toBe('svamp');
    let ring = Object.values(a.objects).find((o) => o.kind === 'fairy_ring');
    if (!ring) {
      ring = addObject(a, 'fairy_ring', 30, 40)!;
    }
    goTo(world, p, k, ring.x, ring.y + 2);
    const ch = performAction(areaOf(world, p), p.id, ring.x, ring.y + 1, ctx());
    expect(toasts(ch).some((t) => t.startsWith('Du dansade'))).toBe(true);
    expect(toasts(performAction(areaOf(world, p), p.id, ring.x, ring.y + 1, ctx())).some((t) => t.startsWith('Älvorna vilar'))).toBe(true);
    world.day++;
    expect(toasts(performAction(areaOf(world, p), p.id, ring.x, ring.y + 1, ctx())).some((t) => t.startsWith('Du dansade'))).toBe(true);
  });
});

describe('rymden', () => {
  it('the rocket at the space base flies to the moon and back', () => {
    const { world, p } = setup();
    const base = getArea(world, SPACEPORT_KEY)!;
    expect(base.biome).toBe('rymdbas');
    const rocket = Object.values(base.objects).find((o) => o.kind === 'rocket')!;
    expect(rocket.x).toBe(BASE_ROCKET.x);
    const front = rocketFront(rocket);
    goTo(world, p, SPACEPORT_KEY, front.x, front.y);
    expect(isSolidForPlayer(base, front.x, front.y)).toBe(false);
    const up = performAction(areaOf(world, p), p.id, rocket.x, rocket.y + 2, ctx());
    expect(up.some((c) => c.t === 'ride' && c.via === 'rocket')).toBe(true);
    expect(p.area).toBe(MOON_KEY);
    expect(p.stats.moon).toBe(1);
    expect(p.achievements).toContain('moon_1');
    const moon = areaOf(world, p);
    expect(moon.biome).toBe('mane');
    // walking off the moon is not possible: no openings, only the sky
    expect(travel(world, p.id, 'n')).toEqual([]);
    expect(moon.terrain[tileIndex(moon, 0, 0)]).toBe('space');
    // home again
    const mr = Object.values(moon.objects).find((o) => o.kind === 'rocket')!;
    performAction(areaOf(world, p), p.id, mr.x, mr.y + 2, ctx());
    expect(p.area).toBe(SPACEPORT_KEY);
  });

  it('the moon has aliens, cheese, star crystals, a UFO with a chest and a cave, all reachable', () => {
    const m = generateMoon();
    const kinds = new Set(Object.values(m.objects).map((o) => o.kind));
    for (const k of ['moon_cheese', 'star_crystal', 'moon_rock', 'ufo', 'loot_chest', 'cave_mouth', 'earth', 'rocket', 'lm_manporten']) expect(kinds).toContain(k);
    expect(Object.values(m.animals).some((a) => a.species === 'alien')).toBe(true);
    const reach = reachableFrom(m, rocketFront(MOON_ROCKET));
    for (const f of landmarkFronts(m)) expect(reach[tileIndex(m, f.x, f.y)], `${f.x},${f.y}`).toBe(1);
    const chest = Object.values(m.objects).find((o) => o.kind === 'loot_chest')!;
    expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[tileIndex(m, chest.x + dx!, chest.y + dy!)])).toBe(true);
    // the corners are open sky
    for (const [x, y] of [[0, 0], [MAP_W - 1, MAP_H - 1]] as const) expect(m.terrain[tileIndex(m, x, y)]).toBe('space');
  });
});

describe('upptäckter och drakar', () => {
  it('each new kind of place gives a star the first time', () => {
    const { world, p } = setup();
    const stars = p.stars;
    p.x = 32 * TILE + 8;
    p.y = 1 * TILE + 8;
    travel(world, p.id, 'n'); // Skogen
    expect(p.stats.biomes).toBe(1);
    expect(p.stars).toBe(stars + 1);
    const t = arrivalTile(areaOf(world, p), 's');
    p.x = t.x * TILE + 8;
    p.y = t.y * TILE + 8;
    travel(world, p.id, 's'); // home
    p.x = 1 * TILE + 8;
    p.y = 32 * TILE + 8;
    const ch = travel(world, p.id, 'w'); // Träsket
    expect(toasts(ch).some((x) => x.includes('Träsket'))).toBe(true);
    expect(p.stats.biomes).toBe(2);
    expect(p.stars).toBe(stars + 2);
  });

  it('a dragon egg put down hatches the next morning into a dragon that follows its owner', () => {
    const { world, p } = setup();
    hold(p, 'dragon_egg');
    p.x = 20 * TILE + 8;
    p.y = 20 * TILE + 8;
    for (const [x, y] of [[21, 20]] as const) {
      const o = objectAt(world, x, y);
      if (o) delete world.objects[o.id], delete world.occupancy[`${x},${y}`];
      world.terrain[tileIndex(world, x, y)] = 'grass';
    }
    performAction(areaOf(world, p), p.id, 21, 20, ctx());
    const egg = objectAt(world, 21, 20);
    expect(egg?.kind).toBe('dragon_egg');
    const ch = newDay(world, ctx());
    expect(objectAt(world, 21, 20)).toBeUndefined();
    const dragon = Object.values(world.animals).find((a) => a.species === 'dragon')!;
    expect(dragon.owner).toBe(p.id);
    expect(ch.some((c) => c.t === 'open' && c.ui === 'nameAnimal' && c.id === dragon.id)).toBe(true);
    expect(p.achievements).toContain('dragon_1');
  });
});

describe('gamla kartor', () => {
  const oldForest = (k: string): WorldState => {
    const a = generateWorld(3);
    a.area = k;
    a.biome = 'skog';
    delete a.gen;
    // an old forest map: grass, trees around, nothing built (the farm's own buildings removed)
    for (const o of Object.values(a.objects)) if (!objectDef(o.kind).breakWith || o.kind.startsWith('wall') || o.kind === 'door_out') delete a.objects[o.id];
    a.terrain.fill('grass');
    a.players = {};
    a.animals = {};
    a.occupancy = {};
    for (const o of Object.values(a.objects)) a.occupancy[`${o.x},${o.y}`] = o.id;
    return a;
  };

  it('an untouched old map is rebuilt with its new biome; one with a chest the kids built is kept and gets a cave', async () => {
    const { upgradeSavedArea } = await import('./index.ts');
    const k = areaKey(-1, 0); // was a forest, now Träsket
    const old = oldForest(k);
    const up = upgradeSavedArea(old, k);
    expect(up.rebuilt).toBe(true);
    expect(up.area.biome).toBe('trask');
    expect(up.area.gen).toBe(AREA_GEN);
    expect(mapW(up.area)).toBe(WILD_MAP);

    const kept = oldForest(k);
    const there = objectAt(kept, 20, 20);
    if (there) delete kept.objects[there.id], delete kept.occupancy['20,20'];
    expect(addObject(kept, 'chest', 20, 20, { by: 'kid' })).not.toBeNull();
    const up2 = upgradeSavedArea(kept, k);
    expect(up2.rebuilt).toBe(false);
    expect(up2.area).toBe(kept);
    expect(kept.biome).toBe('skog');
    expect(kept.gen).toBe(AREA_GEN);
    expect([mapW(kept), mapH(kept), kept.terrain.length]).toEqual([MAP_W, MAP_H, MAP_W * MAP_H]);
    expect(kept.renew?.blueberry_bush).toBeGreaterThan(0);
    expect(Object.values(kept.objects).some((o) => o.kind === 'chest' && o.by === 'kid')).toBe(true);
    const mouth = Object.values(kept.objects).find((o) => o.kind === 'cave_mouth');
    expect(mouth).toBeDefined();
    const reach = reachableFrom(kept, arrivalTile(kept, 'n'));
    const f = entranceFront(mouth!);
    expect(reach[tileIndex(kept, f.x, f.y)]).toBe(1);
    // up to date maps are left alone
    expect(upgradeSavedArea(kept, k).area).toBe(kept);
  });

  it('cities are kept exactly as they are', async () => {
    const { upgradeSavedArea } = await import('./index.ts');
    const city = generateArea(1, 0);
    delete city.gen;
    const before = JSON.stringify(city.terrain);
    const up = upgradeSavedArea(city, 'a:1,0');
    expect(up.rebuilt).toBe(false);
    expect(JSON.stringify(up.area.terrain)).toBe(before);
  });
});

describe('stora kartor', () => {
  /** A wild map as the server saved it before maps grew: 64×64, built by the gen 2 painters, through JSON. */
  const saved64 = (ax: number, ay: number): WorldState => {
    const a = generateArea(ax, ay, 1337, MAP_W, { landmarks: false });
    a.gen = 2;
    const back = JSON.parse(JSON.stringify({ ...a, players: {} })) as WorldState;
    back.area = areaKey(ax, ay);
    rebuildOccupancy(back);
    return back;
  };

  it('farm, cities, the space base, the moon and caves stay 64; the wild is 96 and as full as before', () => {
    expect(generateWorld(1).w).toBeUndefined();
    for (const m of [generateWorld(1), generateArea(1, 0), generateArea(SPACEPORT.ax, SPACEPORT.ay), generateMoon(), generateCave('g:a:0,-1#1', 'rot', 'a:0,-1', { x: 10, y: 10 })])
      expect([mapW(m), mapH(m), m.terrain.length], m.area ?? 'farm').toEqual([MAP_W, MAP_H, MAP_W * MAP_H]);
    // the same place at both sizes: 2.25 times the tiles, about as many things and animals per tile
    let small = { things: 0, animals: 0, caves: 0 };
    let big = { things: 0, animals: 0, caves: 0 };
    for (const [ax, ay] of [[0, -1], [-1, 0], [0, 1], [1, -1], [1, 1], [2, 0], [-2, 0], [0, -2], [0, 2], [-1, 2], [2, 2], [-1, -1]] as const) {
      for (const [size, sum] of [[MAP_W, small], [WILD_MAP, big]] as const) {
        const a = generateArea(ax, ay, 1337, size);
        sum.things += Object.keys(a.objects).length;
        sum.animals += Object.keys(a.animals).length;
        sum.caves += Object.values(a.objects).filter((o) => o.kind === 'cave_mouth').length;
      }
    }
    expect(big.things / small.things).toBeGreaterThan(1.7);
    expect(big.animals / small.animals).toBeGreaterThan(1.9);
    expect(big.animals / small.animals).toBeLessThan(2.6);
    expect(big.caves / small.caves).toBeGreaterThan(1.6);
  });

  it('walking east off a 96 map into a 64 city and back west lands on open ground both times', () => {
    // a city with the wild to its west
    let city: [number, number] | null = null;
    for (let r = 2; r < 14 && !city; r++)
      for (let ay = -r; ay <= r && !city; ay++)
        for (let ax = -r; ax <= r && !city; ax++) if (biomeAt(ax, ay) === 'by' && !['by', 'rymdbas'].includes(biomeAt(ax - 1, ay)) && (ax - 1 || ay)) city = [ax, ay];
    expect(city).not.toBeNull();
    const [cx, cy] = city!;
    const { world, p } = setup();
    const wild = goTo(world, p, areaKey(cx - 1, cy), 0, 0);
    expect(mapW(wild)).toBe(WILD_MAP);
    // in the east opening of the big map
    const east = arrivalTile(wild, 'e');
    p.x = (mapW(wild) - 1) * TILE + 8;
    p.y = east.y * TILE + 8;
    travel(world, p.id, 'e');
    expect(p.area).toBe(areaKey(cx, cy));
    const town = areaOf(world, p);
    expect(mapW(town)).toBe(MAP_W);
    expect([Math.floor(p.x / TILE), Math.floor(p.y / TILE)]).toEqual([1, MAP_H / 2]);
    expect(isSolidForPlayer(town, Math.floor(p.x / TILE), Math.floor(p.y / TILE))).toBe(false);
    // and back west from the city's west opening
    p.x = 8;
    p.y = (MAP_H / 2) * TILE + 8;
    travel(world, p.id, 'w');
    expect(p.area).toBe(areaKey(cx - 1, cy));
    expect([Math.floor(p.x / TILE), Math.floor(p.y / TILE)]).toEqual([WILD_MAP - 2, WILD_MAP / 2]);
    expect(isSolidForPlayer(wild, Math.floor(p.x / TILE), Math.floor(p.y / TILE))).toBe(false);
    // from there you can walk anywhere on the big map, and further on
    const reach = reachableFrom(wild, { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
    for (const side of ['n', 's', 'w'] as const) expect(reach[tileIndex(wild, arrivalTile(wild, side).x, arrivalTile(wild, side).y)], side).toBe(1);
  });

  it('a map saved at 64 still loads and works; untouched it is rebuilt at 96, built on it stays 64', () => {
    const k = areaKey(0, -1); // Skogen, with trails and bridges of its own
    const old = saved64(0, -1);
    expect(mapW(old)).toBe(MAP_W);
    // walkable as it is: the openings join up, a player moves about and walks off its edge
    const reach = reachableFrom(old, arrivalTile(old, 'n'));
    for (const side of ['s', 'e', 'w'] as const) expect(reach[tileIndex(old, arrivalTile(old, side).x, arrivalTile(old, side).y)], side).toBe(1);
    const { world, p } = setup();
    world.areas = { [k]: old };
    goTo(world, p, k, MAP_W / 2, MAP_H - 2);
    const y0 = p.y;
    for (let i = 0; i < 10; i++) stepPlayer(old, p, 0, -1, 50);
    expect(p.y).toBeLessThan(y0);
    p.x = (MAP_W / 2) * TILE + 8;
    p.y = (MAP_H - 1) * TILE + 8;
    travel(world, p.id, 's');
    expect(p.area).toBe('farm');
    expect(Math.floor(p.y / TILE)).toBe(1);

    // untouched: built again, big
    const up = upgradeSavedArea(saved64(0, -1), k);
    expect(up.rebuilt).toBe(true);
    expect([mapW(up.area), mapH(up.area), up.area.terrain.length]).toEqual([WILD_MAP, WILD_MAP, WILD_MAP * WILD_MAP]);
    expect(up.area.gen).toBe(AREA_GEN);
    // picked berries and wandering animals do not count as changes
    const picked = saved64(0, -1);
    const bush = Object.values(picked.objects).find((o) => o.kind === 'blueberry_bush');
    if (bush) delete picked.objects[bush.id];
    expect(upgradeSavedArea(picked, k).rebuilt).toBe(true);

    // a chest the kids put down: kept at 64
    const built = saved64(0, -1);
    const spot = openSpot(built);
    expect(addObject(built, 'chest', spot.x, spot.y, { by: 'kid' })).not.toBeNull();
    const kept = upgradeSavedArea(built, k);
    expect(kept.rebuilt).toBe(false);
    expect(kept.area).toBe(built);
    expect(mapW(built)).toBe(MAP_W);
    expect(built.gen).toBe(AREA_GEN);
    // a path the kids laid out in the open: kept too
    const paved = saved64(0, -1);
    const far = openSpot(paved, (x, y) => !paved.terrain.some((t, i) => (t === 'path_dirt' || t === 'floor_wood') && Math.abs((i % MAP_W) - x) <= 3 && Math.abs(Math.floor(i / MAP_W) - y) <= 3));
    paved.terrain[tileIndex(paved, far.x, far.y)] = 'path_stone';
    expect(upgradeSavedArea(paved, k).rebuilt).toBe(false);
    // a field: kept
    const farmed = saved64(0, -1);
    const f = openSpot(farmed);
    farmed.terrain[tileIndex(farmed, f.x, f.y)] = 'soil';
    expect(upgradeSavedArea(farmed, k).rebuilt).toBe(false);
  });

  it('someone in a cave of a map that was rebuilt bigger comes out on open ground', () => {
    const { world, p } = setup();
    const k = areaKey(0, -1);
    const forest = getArea(world, k)!;
    const mouth = Object.values(forest.objects).find((o) => o.kind === 'cave_mouth')!;
    expect(mouth).toBeDefined();
    const ck = caveKey(k, mouth.id);
    const cave = getArea(world, ck)!;
    // the cave remembers a way out that is now in the middle of a rock
    cave.cave!.out = { x: 5, y: 5 };
    forest.terrain[tileIndex(forest, 5, 5)] = 'rock';
    goTo(world, p, ck, cave.cave!.start.x, cave.cave!.start.y);
    const front = cave.cave!.start;
    const exit = objectAt(cave, front.x, front.y + 1)!;
    performAction(cave, p.id, exit.x, exit.y, ctx());
    expect(p.area).toBe(k);
    expect(isSolidForPlayer(forest, Math.floor(p.x / TILE), Math.floor(p.y / TILE))).toBe(false);
  });

  it('roaming monsters and wild animals come in numbers that fit the map', () => {
    for (const [ax, ay] of [[0, -1], [-1, 0], [0, 1]] as const) {
      const big = generateArea(ax, ay);
      const b = big.biome!;
      for (const def of wildSpeciesOf(b)) {
        const [min, max] = def.wildCount ?? [3, 5];
        const n = Object.values(big.animals).filter((x) => x.species === def.species).length;
        expect(n, `${b} ${def.species}`).toBeLessThanOrEqual(Math.round(max * 2.25));
        if (min > 0) expect(n, `${b} ${def.species}`).toBeGreaterThanOrEqual(Math.round(min * 2.25));
      }
      // a map kept at 64 is topped up to the 64 numbers, not the big ones
      const small = generateArea(ax, ay, 1337, MAP_W);
      for (const x of Object.values(small.animals)) if (ANIMALS[x.species]?.mob) delete small.animals[x.id];
      ensureRoaming(small);
      for (const def of wildSpeciesOf(b).filter((d) => d.mob)) {
        const n = Object.values(small.animals).filter((x) => x.species === def.species).length;
        expect(n, `${b} ${def.species} at 64`).toBe((def.wildCount ?? [3, 5])[0]);
      }
    }
  });
});

describe('Upptäcktsboken', () => {
  it('has the 26 landmarks: two for each wild biome, one each for the space base and the moon, all named', () => {
    expect(LANDMARK_IDS.length).toBe(26);
    for (const b of DISCOVERABLE) {
      if (b === 'by') continue;
      expect(landmarksOf(b).length, b).toBe(b === 'rymdbas' || b === 'mane' ? 1 : 2);
    }
    for (const d of Object.values(LANDMARKS)) {
      const def = objectDef(`lm_${d.id}`);
      expect([def.w, def.h, def.solid, def.interact, def.breakWith]).toEqual([d.w ?? 3, 3, true, 'landmark', undefined]);
      expect(d.name.length && d.lore.length && d.cache.length).toBeTruthy();
    }
    expect(objectDef('lm_blomsterlabyrint').w).toBe(4);
    expect(objectDef('lm_eldbrunn').light).toBe(true);
    expect(objectDef('lm_stencirkel').light).toBeUndefined();
  });

  it('a 64 map gets one landmark of its biome, and a map built as before them gets none', () => {
    const small = generateArea(0, -1, 1337, MAP_W);
    expect(landmarksIn(small).length).toBe(1);
    expect(landmarksIn(generateArea(0, -1, 1337, MAP_W, { landmarks: false })).length).toBe(0);
    // the rest of the map is laid out as it was: the same ground under every tree and pond
    const without = generateArea(0, -1, 1337, WILD_MAP, { landmarks: false });
    const withLm = generateArea(0, -1);
    const same = without.terrain.filter((t, i) => withLm.terrain[i] === t).length;
    expect(same / without.terrain.length).toBeGreaterThan(0.97);
  });

  /** A player standing in front of a landmark on a forest map. */
  const atLandmark = () => {
    const { world, p } = setup();
    const k = areaKey(0, -1);
    const a = getArea(world, k)!;
    const lm = landmarksIn(a)[0]!;
    const d = objectDef(lm.kind);
    const front = { x: lm.x + Math.floor((d.w - 1) / 2), y: lm.y + d.h };
    goTo(world, p, k, front.x, front.y);
    return { world, p, a, lm, id: landmarkOfKind(lm.kind)!, touch: () => performAction(a, p.id, front.x, front.y - 1, ctx()) };
  };

  it('touching one the first time finds it: a star, the cache, a banner with its lore; later only the lore', () => {
    const { p, a, id, touch } = atLandmark();
    const def = LANDMARKS[id]!;
    const stars = p.stars;
    const coins = p.coins;
    const have = (item: string) => p.inventory.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
    const before = def.cache.map(([item]) => have(item));
    const ch = touch();
    expect(p.saga?.discovered).toEqual([id]);
    expect(p.stars).toBe(stars + 1);
    expect(p.coins).toBe(coins + def.coins);
    def.cache.forEach(([item, n], i) => expect(have(item), item).toBe(before[i]! + n));
    expect(p.stats.landmarks).toBe(1);
    const banner = ch.find((c) => c.t === 'banner');
    expect(banner && banner.t === 'banner' && [banner.kind, banner.text, banner.sub, banner.to]).toEqual(['reward', `Du hittade ${def.name}!`, def.lore, p.id]);
    expect(p.saga?.seen).toContain(seenKey(a.area!, id));
    // again: the lore as a toast, nothing more
    const again = touch();
    expect(again.some((c) => c.t === 'banner')).toBe(false);
    expect(toasts(again).some((t) => t.includes(def.lore))).toBe(true);
    expect([p.stars, p.coins, p.stats.landmarks, p.saga?.discovered]).toEqual([stars + 1, coins + def.coins, 1, [id]]);
  });

  it('five found give Upptäcktsresande; the badges go to 26', () => {
    const { p, id, touch } = atLandmark();
    p.saga = { chapter: 0, heard: false, cleared: [], titles: [], quests: {}, done: [], found: [], discovered: LANDMARK_IDS.filter((x) => x !== id).slice(0, 4) };
    p.stats.landmarks = 4;
    touch();
    expect(p.achievements).toContain('landmarks_5');
    expect(p.achievements).not.toContain('landmarks_15');
    expect(ACHIEVEMENTS.filter((a) => a.stat === 'landmarks').map((a) => a.goal)).toEqual([5, 15, 26]);
  });

  it('coming within 12 tiles of one notes it as seen (for the world map), once', () => {
    const { world, p, a, lm, id } = atLandmark();
    const d = objectDef(lm.kind);
    const cx = (lm.x + d.w / 2) * TILE;
    const cy = (lm.y + d.h / 2) * TILE;
    // just too far
    p.x = cx;
    p.y = cy + (LANDMARK_SEEN_TILES + 1) * TILE;
    expect(noticeLandmarks(world)).toEqual([]);
    expect(p.saga?.seen ?? []).not.toContain(seenKey(a.area!, id));
    p.y = cy + (LANDMARK_SEEN_TILES - 2) * TILE;
    const ch = noticeLandmarks(world);
    expect(ch.some((c) => c.t === 'player' && c.id === p.id)).toBe(true);
    expect(p.saga!.seen).toContain(seenKey(a.area!, id));
    expect(p.saga!.discovered ?? []).toEqual([]);
    expect(noticeLandmarks(world)).toEqual([]);
    // offline players and those at home see nothing
    setOnline(world, p.id, false);
    p.saga!.seen = [];
    expect(noticeLandmarks(world)).toEqual([]);
  });

  it('a kept old map without landmarks gets its own where there is room, reachable, cutting nothing off', () => {
    const k = areaKey(0, -1);
    const a = generateArea(0, -1, 1337, MAP_W, { landmarks: false });
    a.area = k;
    const spot = openSpot(a);
    expect(addObject(a, 'chest', spot.x, spot.y, { by: 'kid' })).not.toBeNull();
    expect(landmarksIn(a).length).toBe(0);
    const was = reachableFrom(a, arrivalTile(a, 'n'));
    const fronts = landmarkFronts(a).filter((f) => was[tileIndex(a, f.x, f.y)]);
    expect(fronts.length).toBeGreaterThan(0);
    expect(ensureLandmarks(a)).toBe(true);
    const lms = landmarksIn(a);
    expect(lms.length).toBe(1);
    expect(landmarksOf('skog').map((d) => d.id)).toContain(landmarkOfKind(lms[0]!.kind));
    const reach = reachableFrom(a, arrivalTile(a, 'n'));
    for (const side of ['s', 'e', 'w'] as const) expect(reach[tileIndex(a, arrivalTile(a, side).x, arrivalTile(a, side).y)]).toBe(1);
    for (const f of fronts) expect(reach[tileIndex(a, f.x, f.y)], `${f.x},${f.y}`).toBe(1);
    const lmFront = { x: lms[0]!.x + Math.floor((objectDef(lms[0]!.kind).w - 1) / 2), y: lms[0]!.y + 3 };
    expect(reach[tileIndex(a, lmFront.x, lmFront.y)]).toBe(1);
    expect(Object.values(a.objects).some((o) => o.kind === 'chest' && o.by === 'kid')).toBe(true);
    // once is enough; the moon and a big map work too; a city gets none
    expect(ensureLandmarks(a)).toBe(false);
    const moon = generateMoon();
    for (const o of landmarksIn(moon)) removeObject(moon, o.id);
    expect(ensureLandmarks(moon)).toBe(true);
    expect(landmarksIn(moon).map((o) => o.kind)).toEqual(['lm_manporten']);
    const big = generateArea(0, -2, 1337, WILD_MAP, { landmarks: false });
    expect(ensureLandmarks(big)).toBe(true);
    expect(landmarksIn(big).length).toBe(2);
    expect(ensureLandmarks(generateArea(1, 0))).toBe(false);
  });
});

describe('bragder', () => {
  it('the "every kind of place" badge needs exactly all discoverable places', async () => {
    expect(ACHIEVEMENTS.find((a) => a.id === 'biomes_all')?.goal).toBe(DISCOVERABLE.length);
  });
});
