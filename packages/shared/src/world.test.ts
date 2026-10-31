// The wider world: biomes, caves, treasure, fairy rings, the rocket to the moon, dragon eggs and regrowth.
import { describe, expect, it } from 'vitest';
import {
  ANIMALS,
  AREA_GEN,
  BASE_ROCKET,
  CAVE_THEMES,
  DISCOVERABLE,
  LOOT,
  MAP_H,
  MAP_W,
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
  mulberry32,
  newDay,
  objectAt,
  objectDef,
  performAction,
  reachableFrom,
  rocketFront,
  setOnline,
  themeOfEntrance,
  tileIndex,
  travel,
  wildSpeciesOf,
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
        const reach = reachableFrom(a, arrivalTile('n'));
        for (const side of ['s', 'e', 'w'] as const) {
          const t = arrivalTile(side);
          expect(reach[tileIndex(t.x, t.y)], `${b} (${ax},${ay}) opening ${side}`).toBe(1);
        }
        for (const f of landmarkFronts(a)) expect(reach[tileIndex(f.x, f.y)], `${b} (${ax},${ay}) landmark front ${f.x},${f.y}`).toBe(1);
        for (const o of Object.values(a.objects)) {
          if (o.kind === 'loot_chest') {
            const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[tileIndex(o.x + dx!, o.y + dy!)]);
            expect(around, `${b} chest`).toBe(true);
          }
          // nothing solid in the openings
          if (objectDef(o.kind).solid) expect(inEdgeGap(o.x, o.y)).toBe(false);
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
      expect(here.length, `${b} has ${species}`).toBeGreaterThanOrEqual(3);
      expect(here.length).toBeLessThanOrEqual(5);
      for (const x of here) expect(x.hp).toBe(ANIMALS[species]!.mob!.hp);
      // only where it belongs
      for (const x of Object.values(a.animals)) if (ANIMALS[x.species]?.mob && ANIMALS[x.species]?.wild) expect(ANIMALS[x.species]!.wild!.split('|')).toContain(b);
      // a map saved before them gets them on load
      for (const x of here) delete a.animals[x.id];
      expect(ensureRoaming(a)).toBe(true);
      expect(Object.values(a.animals).filter((x) => x.species === species).length).toBeGreaterThanOrEqual(3);
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
        expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[tileIndex(main.x + dx!, main.y + dy!)])).toBe(true);
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
    expect(moon.terrain[tileIndex(0, 0)]).toBe('space');
    // home again
    const mr = Object.values(moon.objects).find((o) => o.kind === 'rocket')!;
    performAction(areaOf(world, p), p.id, mr.x, mr.y + 2, ctx());
    expect(p.area).toBe(SPACEPORT_KEY);
  });

  it('the moon has aliens, cheese, star crystals, a UFO with a chest and a cave, all reachable', () => {
    const m = generateMoon();
    const kinds = new Set(Object.values(m.objects).map((o) => o.kind));
    for (const k of ['moon_cheese', 'star_crystal', 'moon_rock', 'ufo', 'loot_chest', 'cave_mouth', 'earth', 'rocket']) expect(kinds).toContain(k);
    expect(Object.values(m.animals).some((a) => a.species === 'alien')).toBe(true);
    const reach = reachableFrom(m, rocketFront(MOON_ROCKET));
    for (const f of landmarkFronts(m)) expect(reach[tileIndex(f.x, f.y)], `${f.x},${f.y}`).toBe(1);
    const chest = Object.values(m.objects).find((o) => o.kind === 'loot_chest')!;
    expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[tileIndex(chest.x + dx!, chest.y + dy!)])).toBe(true);
    // the corners are open sky
    for (const [x, y] of [[0, 0], [MAP_W - 1, MAP_H - 1]] as const) expect(m.terrain[tileIndex(x, y)]).toBe('space');
  });
});

describe('upptäckter och drakar', () => {
  it('each new kind of place gives a star the first time', () => {
    const { world, p } = setup();
    const stars = p.stars;
    const t = arrivalTile('s');
    p.x = 32 * TILE + 8;
    p.y = 1 * TILE + 8;
    travel(world, p.id, 'n'); // Skogen
    expect(p.stats.biomes).toBe(1);
    expect(p.stars).toBe(stars + 1);
    p.x = t.x * TILE + 8;
    p.y = (MAP_H - 2) * TILE + 8;
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
      world.terrain[tileIndex(x, y)] = 'grass';
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

    const kept = oldForest(k);
    const there = objectAt(kept, 20, 20);
    if (there) delete kept.objects[there.id], delete kept.occupancy['20,20'];
    expect(addObject(kept, 'chest', 20, 20, { by: 'kid' })).not.toBeNull();
    const up2 = upgradeSavedArea(kept, k);
    expect(up2.rebuilt).toBe(false);
    expect(up2.area).toBe(kept);
    expect(kept.biome).toBe('skog');
    expect(kept.gen).toBe(AREA_GEN);
    expect(kept.renew?.blueberry_bush).toBeGreaterThan(0);
    expect(Object.values(kept.objects).some((o) => o.kind === 'chest' && o.by === 'kid')).toBe(true);
    const mouth = Object.values(kept.objects).find((o) => o.kind === 'cave_mouth');
    expect(mouth).toBeDefined();
    const reach = reachableFrom(kept, arrivalTile('n'));
    const f = entranceFront(mouth!);
    expect(reach[tileIndex(f.x, f.y)]).toBe(1);
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

describe('bragder', () => {
  it('the "every kind of place" badge needs exactly all discoverable places', async () => {
    const { ACHIEVEMENTS } = await import('./index.ts');
    expect(ACHIEVEMENTS.find((a) => a.id === 'biomes_all')?.goal).toBe(DISCOVERABLE.length);
  });
});
