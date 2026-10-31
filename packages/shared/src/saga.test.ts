// Sagan om Världsträdet: the dungeon maps, classes and spells, monsters and bosses, loot, Völvan's
// chapters, the villagers' quests and jumping to a family member.
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  DOWN_MS,
  DUNGEONS,
  DUNGEON_IDS,
  NPCS,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_RESET_MS,
  STONE_SPOT,
  T,
  TILE,
  VILLAGE_KEY,
  VOLVA_SPOT,
  WIPE_MS,
  attackSpellOf,
  bossHpScale,
  castSpell,
  chooseClass,
  createPlayer,
  enterSaga,
  generateSaga,
  generateWorld,
  getArea,
  npcState,
  isSolidForPlayer,
  jumpTo,
  mobDmgScale,
  objectAt,
  performAction,
  portalFront,
  questState,
  sagaChapter,
  sagaKey,
  sagaQuest,
  sagaQuestAct,
  setOnline,
  setWeather,
  tick,
  ANIMALS,
  SAGA_XP,
  XP_LEVELS,
  addObject,
  chapterDone,
  ensureRoaming,
  equipGear,
  fieldKey,
  fighterMax,
  gearStats,
  newDay,
  openTileNear,
  placeIn,
  sagaSnapshot,
  setHero,
  shownHeld,
  type AnimalState,
  type Change,
  type DungeonId,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const px = (t: number): number => t * TILE + TILE / 2;
let clock = 1_000_000;
const ctx = (seed = 1): SimCtx => {
  let s = seed;
  return { season: 'none', now: clock, rnd: () => ((s = (s * 16807) % 2147483647) / 2147483647) };
};

/** Tiles you can walk to from a tile. */
function reach(w: WorldState, from: { x: number; y: number }): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: c.x + dx!, y: c.y + dy! };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || isSolidForPlayer(w, n.x, n.y)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}
const near = (seen: Set<string>, t: { x: number; y: number }): boolean => [0, 1, -1].some((dx) => [0, 1, -1].some((dy) => seen.has(`${t.x + dx},${t.y + dy}`)));

function family(n = 1): { world: WorldState; players: PlayerState[] } {
  const world = generateWorld(7);
  const players: PlayerState[] = [];
  for (let i = 0; i < n; i++) {
    const p = createPlayer(world, `Barn${i + 1}`, { skin: '#f1c9a5', hair: '#2b2119', hairStyle: 'short' });
    setOnline(world, p.id, true);
    players.push(p);
  }
  return { world, players };
}

/** A family member with a class, inside a dungeon. */
function inside(world: WorldState, p: PlayerState, cls: keyof typeof CLASSES, id: DungeonId = 'draug'): WorldState {
  p.saga = { cls, chapter: DUNGEONS[id].chapter, heard: true, cleared: DUNGEON_IDS.slice(0, DUNGEON_IDS.indexOf(id)), titles: [], quests: {}, done: [], found: [] };
  const plan = DUNGEONS[id].portal;
  const out = getArea(world, plan.area)!;
  const arch = Object.values(out.objects).find((o) => o.kind === 'saga_portal' && (o.variant ?? 0) === DUNGEON_IDS.indexOf(id))!;
  enterSaga(world, p, arch);
  return world.areas![sagaKey(id)]!;
}

const run = (world: WorldState, ms: number, seed = 3): Change[] => {
  const out: Change[] = [];
  for (let t = 0; t < ms; t += 50) {
    clock += 50;
    out.push(...tick(world, 50, ctx(seed + t)));
  }
  return out;
};

describe('dungeon maps', () => {
  for (const id of DUNGEON_IDS) {
    it(`${id}: every room can be reached, and the boss only after the gate opens`, () => {
      const w = generateSaga(id);
      const inst = w.saga!;
      const def = DUNGEONS[id];
      expect(inst.gate.length).toBeGreaterThanOrEqual(2);
      expect(inst.rests).toHaveLength(2);
      expect(objectAt(w, inst.exit.x, inst.exit.y)?.kind).toBe('saga_exit');
      const before = reach(w, inst.start);
      const boss = w.animals[inst.boss]!;
      const mini = w.animals[inst.mini]!;
      expect(near(before, { x: Math.floor(mini.x / TILE), y: Math.floor(mini.y / TILE) })).toBe(true);
      expect(near(before, inst.rests[0]!)).toBe(true);
      expect(near(before, { x: Math.floor(boss.x / TILE), y: Math.floor(boss.y / TILE) })).toBe(false);
      for (const g of [...inst.gate, ...inst.puzzleGate]) {
        const o = objectAt(w, g.x, g.y)!;
        delete w.occupancy[`${g.x},${g.y}`];
        delete w.objects[o.id];
      }
      const after = reach(w, inst.start);
      expect(near(after, { x: Math.floor(boss.x / TILE), y: Math.floor(boss.y / TILE) })).toBe(true);
      expect(near(after, inst.rests[1]!)).toBe(true);
      // every group from the plan is there, and every monster stands on open floor
      const planned = def.rooms.flatMap((r) => r.packs ?? []);
      expect(inst.packs.map((p) => p.members.length)).toEqual(planned.map((p) => p.length));
      for (const m of Object.values(inst.mobs)) expect(after.has(`${Math.floor(m.home.x / TILE)},${Math.floor(m.home.y / TILE)}`)).toBe(true);
      const chests = Object.values(w.objects).filter((o) => o.kind === 'saga_chest');
      expect(chests).toHaveLength(1);
      expect(near(before, chests[0]!)).toBe(true);
    });
  }

  it('puts each arch out in the world where you can walk to it, and Kämpastenen on the square', () => {
    const { world } = family();
    DUNGEON_IDS.forEach((id, variant) => {
      const a = getArea(world, DUNGEONS[id].portal.area)!;
      const arch = Object.values(a.objects).find((o) => o.kind === 'saga_portal' && (o.variant ?? 0) === variant)!;
      expect(arch).toBeDefined();
      const front = portalFront(arch);
      expect(isSolidForPlayer(a, front.x, front.y)).toBe(false);
      expect(reach(a, front).size).toBeGreaterThan(400);
    });
    const v = getArea(world, VILLAGE_KEY)!;
    expect(objectAt(v, STONE_SPOT.x, STONE_SPOT.y)?.kind).toBe('saga_stone');
  });
});

describe('inside a dungeon', () => {
  it('there is no weather: the news of rain does not reach anyone in the crypt', () => {
    const { world, players } = family(2);
    const [down, up] = players as [PlayerState, PlayerState];
    inside(world, down, 'krigare');
    setWeather(world, 'sun', ctx(), true);
    const out = setWeather(world, 'rain', ctx(), true);
    expect(out.some((c) => c.t === 'toast' && c.to === down.id)).toBe(false);
    expect(out.some((c) => c.t === 'toast' && c.to === up.id)).toBe(true);
  });
});

describe('classes and the way in', () => {
  it('needs a class, and the dungeons in order', () => {
    const { world, players } = family();
    const p = players[0]!;
    const forest = getArea(world, DUNGEONS.draug.portal.area)!;
    const arch = Object.values(forest.objects).find((o) => o.kind === 'saga_portal')!;
    expect(enterSaga(world, p, arch).some((c) => c.t === 'toast')).toBe(true);
    expect(p.area).not.toBe(sagaKey('draug'));
    chooseClass(world, p.id, 'vaktare');
    expect(p.outfit.hat).toBe(CLASSES.vaktare.outfit.hat);
    expect(p.wardrobe).toContain(CLASSES.vaktare.outfit.shirt);
    // the frost giant's castle is sealed until the crypt is cleared
    const ice = getArea(world, DUNGEONS.frost.portal.area)!;
    enterSaga(world, p, Object.values(ice.objects).find((o) => o.kind === 'saga_portal')!);
    expect(p.area).toBe('farm');
    enterSaga(world, p, arch);
    expect(p.area).toBe(sagaKey('draug'));
    expect(world.areas![sagaKey('draug')]!.saga!.fighters[p.id]!.hp).toBe(CLASSES.vaktare.hp);
  });
});

describe('fighting', () => {
  it('the use key next to a monster swings your everyday attack: an axe for a warrior, a light arrow for a healer', () => {
    expect(attackSpellOf('krigare')).toBe('yxhugg');
    expect(attackSpellOf('vaktare')).toBe('hugg');
    expect(attackSpellOf('magiker')).toBe('eldboll');
    expect(attackSpellOf('helare')).toBe('ljuspil');
    const { world, players } = family(2);
    const [axe, healer] = players as [PlayerState, PlayerState];
    const d = inside(world, axe, 'krigare');
    inside(world, healer, 'helare');
    const inst = d.saga!;
    const first = d.animals[inst.packs[0]!.members[0]!]!;
    axe.x = first.x - TILE;
    axe.y = first.y;
    healer.x = first.x - 4 * TILE;
    healer.y = first.y;
    // E, space, the ✋ button and the gamepad's use button all come in as an action on the tile in front
    const swung = performAction(d, axe.id, Math.floor(first.x / TILE), Math.floor(first.y / TILE), ctx());
    expect(swung.some((c) => c.t === 'spell' && c.by === axe.id && c.spell === 'yxhugg' && c.on === first.id)).toBe(true);
    expect(swung.some((c) => c.t === 'hit' && c.on === first.id && c.kind !== 'miss')).toBe(true);
    expect(inst.mobs[first.id]!.state).toBe('fight');
    const shot = performAction(d, healer.id, Math.floor(healer.x / TILE) + 1, Math.floor(healer.y / TILE), ctx());
    expect(shot.some((c) => c.t === 'spell' && c.by === healer.id && c.spell === 'ljuspil')).toBe(true);
  });

  it('the use key with no monster in reach says nothing, and the spell buttons still do', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'krigare');
    // the start of the dungeon is clear of monsters
    expect(performAction(d, p.id, Math.floor(p.x / TILE), Math.floor(p.y / TILE) - 1, ctx())).toEqual([]);
    expect(castSpell(world, p.id, 'yxhugg', undefined, ctx())).toEqual([{ t: 'toast', to: p.id, text: T.sagaNoTarget }]);
  });

  it('a warrior beats the first group, and the villager quest counts it', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'krigare');
    p.saga!.quests.saga_skelett = 0;
    const inst = d.saga!;
    const pack = inst.packs[0]!;
    const first = d.animals[pack.members[0]!]!;
    p.x = first.x - 3 * TILE;
    p.y = first.y;
    run(world, 200);
    expect(inst.mobs[first.id]!.state).toBe('fight');
    let guard = 0;
    while (!pack.dead && guard++ < 400) {
      const target = pack.members.find((id) => inst.mobs[id]);
      if (target === undefined) break;
      const a = d.animals[target]!;
      p.x = a.x - TILE;
      p.y = a.y;
      for (const s of CLASSES.krigare.spells) castSpell(world, p.id, s, target, ctx(guard));
      run(world, 450, guard);
      if (inst.fighters[p.id]!.down !== undefined) {
        clock += DOWN_MS;
        run(world, 100);
      }
    }
    expect(pack.dead).toBe(true);
    expect(p.saga!.quests.saga_skelett).toBeGreaterThanOrEqual(1);
    expect(p.stats.sagaMobs).toBeGreaterThanOrEqual(2);
  });

  it('a boss marks its attacks on the ground first: step out and you are not hit', () => {
    const { world, players } = family(2);
    const [tank, healer] = players as [PlayerState, PlayerState];
    const d = inside(world, tank, 'vaktare');
    inside(world, healer, 'helare');
    const inst = d.saga!;
    // open the way and stand by the boss
    const boss = d.animals[inst.boss]!;
    tank.x = boss.x;
    tank.y = boss.y + 2 * TILE;
    healer.x = boss.x;
    healer.y = boss.y + 6 * TILE;
    run(world, 100);
    const bm = inst.mobs[inst.boss]!;
    expect(bm.state).toBe('fight');
    expect(bm.max).toBe(Math.round(SAGA_BOSSES.draugkung!.hp * bossHpScale(2)));
    // the first big attack is the sword sweep at the tank: the healer stands in it too, then steps out
    let guard = 0;
    while (!bm.cast && guard++ < 200) run(world, 50);
    expect(bm.cast).toBeDefined();
    const zone = inst.zones.find((z) => bm.cast!.zones.includes(z.id))!;
    expect(zone.shape).toBe('cone');
    const hpBefore = inst.fighters[healer.id]!.hp;
    healer.x = boss.x;
    healer.y = boss.y - 9 * TILE;
    const landed = run(world, 2000);
    expect(inst.fighters[healer.id]!.hp).toBe(hpBefore);
    // the tank stayed in front of the boss and took the sweep (gentler for a party of two)
    const sweep = Math.round(SAGA_BOSSES.draugkung!.moves[0]!.dmg * mobDmgScale(2));
    expect(landed.some((c) => c.t === 'hit' && c.on === tank.id && c.n === sweep)).toBe(true);
  });

  it('a shield bash stops the Draug King\'s scream', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'vaktare');
    const inst = d.saga!;
    const boss = d.animals[inst.boss]!;
    p.x = boss.x;
    p.y = boss.y + TILE;
    run(world, 100);
    const bm = inst.mobs[inst.boss]!;
    const nova = SAGA_BOSSES.draugkung!.moves.findIndex((m) => m.move === 'nova');
    bm.next = bm.next!.map((_, i) => (i === nova ? clock : clock + 60_000));
    run(world, 100);
    expect(bm.cast?.move).toBe(nova);
    const out = castSpell(world, p.id, 'skoldslag', inst.boss, ctx());
    expect(out.some((c) => c.t === 'hit' && c.kind === 'kick')).toBe(true);
    expect(bm.cast).toBeUndefined();
    expect(inst.zones).toHaveLength(0);
  });

  it('a boss stays in its hall: it stops at the edge, and goes home only when everyone has left', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'magiker');
    const inst = d.saga!;
    const boss = d.animals[inst.boss]!;
    const home = { x: boss.x, y: boss.y };
    p.x = boss.x;
    p.y = boss.y + 3 * TILE;
    run(world, 200);
    const bm = inst.mobs[inst.boss]!;
    expect(bm.state).toBe('fight');
    // run to the far side of the hall and wait: the boss follows to its edge, but not out
    const far = [...Array(40).keys()].map((i) => ({ x: home.x + (i - 20) * TILE, y: home.y })).find((t) => Math.abs(t.x - home.x) / TILE > 14 && Math.abs(t.x - home.x) / TILE < 20 && !isSolidForPlayer(d, Math.floor(t.x / TILE), Math.floor(t.y / TILE)))!;
    p.x = far.x;
    p.y = far.y;
    inst.fighters[p.id]!.hp = 9999;
    inst.fighters[p.id]!.max = 9999;
    run(world, 6000);
    expect(bm.state).toBe('fight');
    expect(Math.hypot(boss.x - home.x, boss.y - home.y) / TILE).toBeLessThanOrEqual(11.5);
    // out of the hall: it gives up
    p.x = px(inst.start.x);
    p.y = px(inst.start.y);
    run(world, 300);
    expect(bm.state).not.toBe('fight');
  });

  it('when everyone falls, the family gets up at the rest stone and the boss starts over', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'magiker');
    const inst = d.saga!;
    inst.checkpoint = 0;
    const boss = d.animals[inst.boss]!;
    p.x = boss.x;
    p.y = boss.y + TILE;
    run(world, 100);
    const bm = inst.mobs[inst.boss]!;
    bm.hp -= 100;
    inst.fighters[p.id]!.hp = 10;
    let guard = 0;
    while (inst.fighters[p.id]!.down === undefined && guard++ < 600) run(world, 50);
    expect(inst.fighters[p.id]!.down).toBeDefined();
    run(world, WIPE_MS + 200);
    expect(inst.fighters[p.id]!.down).toBeUndefined();
    expect(inst.fighters[p.id]!.hp).toBe(CLASSES.magiker.hp);
    const rest = inst.rests[0]!;
    expect(Math.hypot(p.x - px(rest.x), p.y - px(rest.y))).toBeLessThan(3 * TILE);
    expect(bm.state).not.toBe('fight');
    expect(bm.hp).toBe(bm.max);
  });

  it('a healer heals the one who is hurt, and wakes up the one who fell', () => {
    const { world, players } = family(2);
    const [healer, friend] = players as [PlayerState, PlayerState];
    const d = inside(world, healer, 'helare');
    inside(world, friend, 'krigare');
    const inst = d.saga!;
    friend.x = healer.x + TILE;
    friend.y = healer.y;
    inst.fighters[friend.id]!.hp = 40;
    castSpell(world, healer.id, 'lakerunan', undefined, ctx());
    expect(inst.fighters[friend.id]!.hp).toBeGreaterThan(40);
    clock += 2000;
    inst.fighters[friend.id]!.hp = 0;
    inst.fighters[friend.id]!.down = clock;
    castSpell(world, healer.id, 'vackupp', undefined, ctx());
    expect(inst.fighters[friend.id]!.down).toBeUndefined();
    expect(inst.fighters[friend.id]!.hp).toBe(CLASSES.krigare.hp / 2);
  });
});

describe('loot', () => {
  it('the boss leaves a chest with something for each player, once', () => {
    const { world, players } = family(2);
    const [a, b] = players as [PlayerState, PlayerState];
    const d = inside(world, a, 'magiker');
    inside(world, b, 'helare');
    const inst = d.saga!;
    const boss = d.animals[inst.boss]!;
    a.x = boss.x - 3 * TILE;
    a.y = boss.y;
    b.x = boss.x - 4 * TILE;
    b.y = boss.y;
    run(world, 100);
    inst.mobs[inst.boss]!.hp = 1;
    castSpell(world, a.id, 'eldboll', inst.boss, ctx());
    expect(inst.bossDown).toBe(true);
    expect(a.saga!.cleared).toContain('draug');
    expect(b.saga!.cleared).toContain('draug');
    const chest = Object.values(d.objects).find((o) => o.kind === 'saga_chest' && o.variant === 2)!;
    // never on top of (or right next to) someone, so nobody gets stuck in it
    for (const q of [a, b]) expect(Math.max(Math.abs(Math.floor(q.x / TILE) - chest.x), Math.abs(Math.floor(q.y / TILE) - chest.y))).toBeGreaterThan(1);
    a.x = px(chest.x);
    a.y = px(chest.y) + TILE;
    const first = performAction(d, a.id, chest.x, chest.y, ctx(5));
    const loot = first.find((c) => c.t === 'loot');
    expect(loot && loot.t === 'loot' && loot.items.length).toBeGreaterThan(0);
    const again = performAction(d, a.id, chest.x, chest.y, ctx(5));
    expect(again.some((c) => c.t === 'loot')).toBe(false);
  });
});

describe('the saga', () => {
  it('Völvan tells the chapters, and pays when they are done', () => {
    const { world, players } = family();
    const p = players[0]!;
    getArea(world, VILLAGE_KEY);
    p.area = VILLAGE_KEY;
    world.areas![VILLAGE_KEY]!.players[p.id] = p;
    p.x = px(VOLVA_SPOT.x);
    p.y = px(VOLVA_SPOT.y + 1);
    sagaChapter(world, p.id);
    expect(p.saga!.heard).toBe(true);
    sagaChapter(world, p.id);
    expect(p.saga!.chapter).toBe(0);
    chooseClass(world, p.id, 'helare');
    const coins = p.coins;
    sagaChapter(world, p.id);
    expect(p.saga!.chapter).toBe(1);
    expect(p.coins).toBe(coins + SAGA_CHAPTERS[0]!.reward.coins);
    // the crypt's chapter is told, so Tant Greta has a quest
    sagaChapter(world, p.id);
    expect(questState(p, sagaQuest('saga_skelett')!)).toBe('offer');
    p.saga!.cleared.push('draug');
    sagaChapter(world, p.id);
    expect(p.saga!.titles).toContain('Draugdödare');
    expect(p.inventory.some((s) => s?.item === 'solruna')).toBe(true);
  });

  it('a villager\'s quest is taken, counted and handed in', () => {
    const { world, players } = family();
    const p = players[0]!;
    p.saga = { cls: 'krigare', chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [] };
    const greta = npcState(world, NPCS.greta!.id);
    p.area = 'farm';
    p.x = greta.x;
    p.y = greta.y + TILE;
    sagaQuestAct(world, p.id, 'saga_skelett');
    expect(p.saga.quests.saga_skelett).toBe(0);
    p.saga.quests.saga_skelett = 8;
    const stars = p.stars;
    sagaQuestAct(world, p.id, 'saga_skelett');
    expect(p.saga.done).toContain('saga_skelett');
    expect(p.stars).toBe(stars + 1);
  });

  it('anyone can jump to a family member, even into their dungeon', () => {
    const { world, players } = family(2);
    const [a, b] = players as [PlayerState, PlayerState];
    const d = inside(world, a, 'vaktare');
    b.saga = { cls: 'helare', chapter: 0, heard: false, cleared: [], titles: [], quests: {}, done: [], found: [] };
    jumpTo(world, b.id, a.id);
    expect(b.area).toBe(sagaKey('draug'));
    expect(d.saga!.fighters[b.id]).toBeDefined();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(3 * TILE);
  });

  it('an empty dungeon starts over after a while', () => {
    const { world, players } = family(2);
    const p = players[0]!;
    inside(world, p, 'krigare');
    setOnline(world, p.id, false);
    run(world, 100);
    clock += SAGA_RESET_MS + 1000;
    run(world, 100);
    expect(world.areas![sagaKey('draug')]).toBeUndefined();
    expect(p.area).toBe(DUNGEONS.draug.portal.area);
  });
});

// ---------------------------------------------------------------------------
// Sagan om Världsträdet II: Lokes list
// ---------------------------------------------------------------------------

const ACT2: DungeonId[] = ['hel', 'dvarg', 'orm', 'alv', 'fenrir', 'loke'];

/** A tank and a healer standing right by a (mid-)boss, so tough that nobody falls; the fight has begun. */
function atBoss(id: DungeonId, which: 'mini' | 'boss') {
  const { world, players } = family(2);
  const [tank, healer] = players as [PlayerState, PlayerState];
  const d = inside(world, tank, 'vaktare', id);
  inside(world, healer, 'helare', id);
  const inst = d.saga!;
  const a = d.animals[which === 'mini' ? inst.mini : inst.boss]!;
  tank.x = a.x + TILE;
  tank.y = a.y;
  healer.x = a.x - 2 * TILE;
  healer.y = a.y;
  for (const q of [tank, healer]) {
    const f = inst.fighters[q.id]!;
    f.hp = f.max = 99999;
  }
  run(world, 100);
  const m = inst.mobs[a.id]!;
  expect(m.state).toBe('fight');
  return { world, d, inst, m, a, tank, healer };
}

/** Makes a boss use its move `i` next (and nothing else). */
function force(m: { species: string; phase?: number; next?: number[]; cast?: unknown }, i: number): void {
  const def = SAGA_BOSSES[m.species]!;
  m.phase = Math.max(m.phase ?? 0, def.moves[i]!.phase ?? 0);
  m.next = def.moves.map((_, k) => (k === i ? clock : Infinity));
  delete m.cast;
}
const waitCast = (world: WorldState, m: { cast?: unknown }): void => {
  let guard = 0;
  while (!m.cast && guard++ < 100) run(world, 50);
};

describe('Lokes list: the bosses', () => {
  for (const id of ACT2)
    for (const which of ['mini', 'boss'] as const) {
      const species = which === 'mini' ? DUNGEONS[id].mini : DUNGEONS[id].boss;
      it(`${species}: every move is cast and lands, and the stoppable ones stop for a shield bash`, () => {
        const { world, inst, m, a, tank } = atBoss(id, which);
        const def = SAGA_BOSSES[species]!;
        expect(def.yells.phase.length).toBe(def.phases.length);
        def.moves.forEach((mv, i) => {
          force(m, i);
          tank.x = a.x + TILE;
          tank.y = a.y;
          waitCast(world, m);
          expect(m.cast?.move).toBe(i);
          const zones = m.cast!.zones.map((z) => inst.zones.find((x) => x.id === z)!);
          if (mv.move === 'line') expect(zones[0]).toMatchObject({ shape: 'line', r: mv.radius, w: mv.width });
          if (mv.move === 'summon') expect(zones).toHaveLength(0);
          if (mv.move === 'mend' || mv.move === 'pull' || mv.move === 'nova' || mv.move === 'slam') expect(zones[0]?.shape).toBe('circle');
          if (mv.interrupt) {
            // every stoppable move says how to stop it
            expect(mv.text).toContain('Sköldslag, Stormsteg eller Isspjut');
            const f = inst.fighters[tank.id]!;
            f.cd = {};
            f.gcd = 0;
            tank.x = a.x + TILE;
            tank.y = a.y;
            const ch = castSpell(world, tank.id, 'skoldslag', m.id, ctx());
            expect(m.cast).toBeUndefined();
            expect(ch.some((c) => c.t === 'hit' && c.kind === 'kick')).toBe(true);
          } else {
            run(world, mv.warn + 150);
            expect(m.cast?.move === i).toBe(false);
          }
        });
      });
    }

  it('a line hits whoever stands in the strip, not the one beside it', () => {
    const { world, inst, m, a, tank, healer } = atBoss('dvarg', 'mini');
    const i = SAGA_BOSSES.jarnvakten!.moves.findIndex((mv) => mv.move === 'line');
    force(m, i);
    tank.x = a.x + 3 * TILE;
    tank.y = a.y;
    healer.x = a.x + 3 * TILE;
    healer.y = a.y + 3 * TILE;
    inst.mobs[m.id]!.target = tank.id;
    waitCast(world, m);
    const z = inst.zones.find((x) => x.id === m.cast!.zones[0])!;
    expect(z.shape).toBe('line');
    expect(Math.abs(z.dir!)).toBeLessThan(0.2);
    const landed = run(world, SAGA_BOSSES.jarnvakten!.moves[i]!.warn + 100);
    const dmg = Math.round(SAGA_BOSSES.jarnvakten!.moves[i]!.dmg * mobDmgScale(2));
    expect(landed.some((c) => c.t === 'hit' && c.on === tank.id && c.n === dmg)).toBe(true);
    expect(landed.some((c) => c.t === 'hit' && c.on === healer.id && c.kind === 'dmg')).toBe(false);
  });

  it("Hel's embrace pulls everyone close to her, ready for the scream", () => {
    const { world, m, a, healer } = atBoss('hel', 'boss');
    const i = SAGA_BOSSES.hel!.moves.findIndex((mv) => mv.move === 'pull');
    force(m, i);
    healer.x = a.x - 5 * TILE;
    healer.y = a.y;
    waitCast(world, m);
    const landed = run(world, SAGA_BOSSES.hel!.moves[i]!.warn + 100);
    expect(landed.some((c) => c.t === 'warp' && c.id === healer.id)).toBe(true);
    expect(Math.hypot(healer.x - a.x, healer.y - a.y) / TILE).toBeLessThan(2.8);
    expect(isSolidForPlayer(world.areas![sagaKey('hel')]!, Math.floor(healer.x / TILE), Math.floor(healer.y / TILE))).toBe(false);
  });

  it('Fafner heals in his golden sleep unless someone wakes him', () => {
    const { world, m, a, tank, inst } = atBoss('dvarg', 'boss');
    const i = SAGA_BOSSES.fafner!.moves.findIndex((mv) => mv.move === 'mend');
    m.hp = Math.round(m.max / 2);
    force(m, i);
    waitCast(world, m);
    const before = m.hp;
    const landed = run(world, SAGA_BOSSES.fafner!.moves[i]!.warn + 100);
    const healed = Math.round(m.max * SAGA_BOSSES.fafner!.moves[i]!.heal!);
    expect(landed.some((c) => c.t === 'hit' && c.on === m.id && c.kind === 'heal' && c.n === healed)).toBe(true);
    expect(m.hp).toBeGreaterThan(before);
    // again, and this time the tank wakes him with a bash
    force(m, i);
    waitCast(world, m);
    const f = inst.fighters[tank.id]!;
    f.cd = {};
    f.gcd = 0;
    tank.x = a.x + TILE;
    tank.y = a.y;
    const mid = m.hp;
    castSpell(world, tank.id, 'skoldslag', m.id, ctx());
    const after = run(world, 3200);
    expect(after.some((c) => c.t === 'hit' && c.on === m.id && c.kind === 'heal')).toBe(false);
    expect(m.hp).toBeLessThanOrEqual(mid);
  });

  it('the Spider Queen webs a friend in, and the web breaks like the ice', () => {
    const { world, d, inst, m, healer, tank } = atBoss('alv', 'mini');
    force(m, 0);
    waitCast(world, m);
    const landed = run(world, SAGA_BOSSES.spindeldrottning!.moves[0]!.warn + 100);
    const f = inst.fighters[healer.id]!;
    expect(f.frozen).toBeDefined();
    expect(d.animals[f.frozen!]!.species).toBe('spindelnat');
    expect(landed.some((c) => c.t === 'toast' && c.text.includes('nät'))).toBe(true);
    // the friend breaks the web
    const web = inst.mobs[f.frozen!]!;
    web.hp = 1;
    const tf = inst.fighters[tank.id]!;
    tf.cd = {};
    tf.gcd = 0;
    tank.x = d.animals[web.id]!.x + TILE;
    tank.y = d.animals[web.id]!.y;
    castSpell(world, tank.id, 'hugg', web.id, ctx());
    expect(f.frozen).toBeUndefined();
  });

  it('Garm howls for his hounds: the cast bar shows it, then they come', () => {
    const { world, d, inst, m } = atBoss('hel', 'mini');
    force(m, 1);
    waitCast(world, m);
    expect(sagaSnapshot(world, clock)![sagaKey('hel')]!.b?.cast?.name).toBe('Yla!');
    run(world, SAGA_BOSSES.garm!.moves[1]!.warn + 100);
    const adds = Object.values(inst.mobs).filter((x) => x.kind === 'add');
    expect(adds.length).toBeGreaterThan(0);
    expect(adds.every((x) => d.animals[x.id]!.species === 'helhund')).toBe(true);
  });

  it("Loke has five phases, one for each boss he copies, and his helpers are illusions", () => {
    const w = generateSaga('loke');
    for (const m of Object.values(w.saga!.mobs)) expect(w.animals[m.id]!.variant).toBe(m.kind === 'mob' ? 1 : undefined);
    const { world, d, inst, m, healer } = atBoss('loke', 'boss');
    const phases = SAGA_BOSSES.loke!.phases;
    expect(phases).toHaveLength(4);
    const yells: string[] = [];
    for (const th of phases) {
      m.hp = Math.ceil(m.max * th) + 5;
      const f = inst.fighters[healer.id]!;
      f.cd = {};
      f.gcd = 0;
      for (const c of castSpell(world, healer.id, 'ljuspil', m.id, ctx())) if (c.t === 'yell') yells.push(c.text);
      clock += 500;
    }
    expect(m.phase).toBe(4);
    expect(yells.join(' ')).toContain('Rimtursen');
    expect(yells.join(' ')).toContain('Surt');
    const adds = Object.values(inst.mobs).filter((x) => x.kind === 'add');
    expect(adds.length).toBeGreaterThan(0);
    for (const x of adds) expect(d.animals[x.id]!.variant).toBe(1);
  });
});

describe('Lokes list: puzzles and loot', () => {
  it('standing on the three plates opens the way on', () => {
    for (const id of ['dvarg', 'alv', 'loke'] as const) {
      const { world, players } = family();
      const p = players[0]!;
      const d = inside(world, p, 'krigare', id);
      const inst = d.saga!;
      expect(inst.plates).toHaveLength(3);
      expect(inst.puzzleOpen).toBe(false);
      let out: Change[] = [];
      for (const plate of inst.plates) {
        p.x = px(plate.x);
        p.y = px(plate.y);
        out = out.concat(run(world, 100));
        expect(plate.lit).toBe(true);
        expect(objectAt(d, plate.x, plate.y)!.variant).toBe(1);
      }
      expect(inst.puzzleOpen).toBe(true);
      for (const g of inst.puzzleGate) expect(objectAt(d, g.x, g.y)?.kind).not.toBe('saga_gate');
      expect(out.some((c) => c.t === 'banner' && c.kind === 'rest' && c.text === T.sagaPuzzleOpen)).toBe(true);
    }
  });

  it('a chest gives offhands and amulets once each, and each player opens it once', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'krigare', 'hel');
    const inst = d.saga!;
    p.saga!.found = ['shirt_helrustning', 'garmklo'];
    const tx = Math.floor(p.x / TILE) + 1;
    const ty = Math.floor(p.y / TILE);
    const chest = addObject(d, 'saga_chest', tx, ty, { variant: 1 })!;
    let got = false;
    for (let seed = 1; seed < 60 && !got; seed++) {
      delete inst.looted[chest.id];
      const ch = performAction(d, p.id, tx, ty, ctx(seed));
      got = ch.some((c) => c.t === 'loot' && c.items.some((it) => it.item === 'offhand_helskold'));
    }
    expect(got).toBe(true);
    expect(p.saga!.found).toContain('offhand_helskold');
    expect(p.inventory.some((s) => s?.item === 'offhand_helskold')).toBe(true);
    // all the chest's gear is found: potions instead
    for (let seed = 1; seed < 20; seed++) {
      delete inst.looted[chest.id];
      const ch = performAction(d, p.id, tx, ty, ctx(seed));
      expect(ch.some((c) => c.t === 'loot' && c.items.some((it) => it.item === 'offhand_helskold' || it.item === 'garmklo'))).toBe(false);
    }
    expect(performAction(d, p.id, tx, ty, ctx(3)).some((c) => c.t === 'loot')).toBe(false);
  });
});

describe('Lokes list: gear and levels', () => {
  it('an old save puts on its best weapon; gear goes on and off by its rules', () => {
    const { world, players } = family();
    const p = players[0]!;
    p.saga = { cls: 'vaktare', chapter: 4, heard: true, cleared: ['draug', 'frost', 'surt'], titles: [], quests: {}, done: [], found: [] };
    p.inventory[10] = { item: 'runsvard', count: 1 };
    p.inventory[11] = { item: 'frostbett', count: 1 };
    // not in the bag: refused, but the gear record is made and the best weapon is put on
    const missing = equipGear(world, p.id, 'offhand', 'offhand_dvargskold');
    expect(missing.some((c) => c.t === 'toast')).toBe(true);
    expect(p.saga.gear).toEqual({ weapon: 'frostbett' });
    expect(p.inventory.some((s) => s?.item === 'frostbett')).toBe(false);
    expect(p.inventory.some((s) => s?.item === 'runsvard')).toBe(true);
    p.inventory[12] = { item: 'offhand_dvargskold', count: 1 };
    p.inventory[13] = { item: 'amulet_helring', count: 1 };
    // an amulet does not go in the offhand slot
    equipGear(world, p.id, 'offhand', 'amulet_helring');
    expect(p.saga.gear!.offhand).toBeUndefined();
    equipGear(world, p.id, 'offhand', 'offhand_dvargskold');
    expect(p.saga.gear!.offhand).toBe('offhand_dvargskold');
    expect(p.inventory.some((s) => s?.item === 'offhand_dvargskold')).toBe(false);
    const st = gearStats(p);
    expect(st.armor).toBeCloseTo(0.1);
    // an epic weapon, and a shield made for the tank
    expect(st.power).toBeCloseTo(1.2 * 1.05);
    const max = fighterMax(p, 'vaktare');
    equipGear(world, p.id, 'amulet', 'amulet_helring');
    expect(fighterMax(p, 'vaktare')).toBe(max + 20);
    // a full bag: nothing can come off
    for (let i = 0; i < p.inventory.length; i++) if (!p.inventory[i]) p.inventory[i] = { item: 'stone', count: 1 };
    const full = equipGear(world, p.id, 'amulet', null);
    expect(full.some((c) => c.t === 'toast' && c.text === T.sagaEquipBagFull)).toBe(true);
    expect(p.saga.gear!.amulet).toBe('amulet_helring');
    p.inventory[20] = null;
    equipGear(world, p.id, 'amulet', null);
    expect(p.saga.gear!.amulet).toBeUndefined();
    expect(p.inventory.findIndex((x) => x?.item === 'amulet_helring')).toBe(20);
    // a legendary weapon: the old one goes back into the bag, and it counts
    p.inventory[21] = { item: 'tyrsyxa', count: 1 };
    equipGear(world, p.id, 'weapon', 'tyrsyxa');
    expect(p.saga.gear!.weapon).toBe('tyrsyxa');
    expect(p.inventory.findIndex((x) => x?.item === 'frostbett')).toBe(21);
    expect(p.stats.sagaLegendary).toBe(1);
  });

  it('armor takes away part of every hit', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'vaktare', 'hel');
    p.saga!.gear = { offhand: 'offhand_tyrshandske' };
    const inst = d.saga!;
    const boss = d.animals[inst.boss]!;
    p.x = boss.x + TILE;
    p.y = boss.y;
    const f = inst.fighters[p.id]!;
    f.hp = f.max = 99999;
    const out = run(world, 4000);
    const hits = out.filter((c) => c.t === 'hit' && c.on === p.id && c.kind === 'dmg').map((c) => (c.t === 'hit' ? c.n : 0));
    expect(hits).toContain(Math.round(SAGA_BOSSES.hel!.dmg * mobDmgScale(1) * (1 - 0.14)));
  });

  it('experience gives levels: a banner, a sparkle, more health', () => {
    const { world, players } = family();
    const p = players[0]!;
    const d = inside(world, p, 'krigare');
    const inst = d.saga!;
    p.saga!.xp = XP_LEVELS[1]! - SAGA_XP.mob;
    const m = Object.values(inst.mobs).find((x) => x.kind === 'mob')!;
    const a = d.animals[m.id]!;
    p.x = a.x + TILE;
    p.y = a.y;
    run(world, 100);
    m.hp = 1;
    const out = castSpell(world, p.id, 'yxhugg', m.id, ctx());
    expect(out.some((c) => c.t === 'banner' && c.kind === 'level' && c.text === 'Nivå 2!')).toBe(true);
    expect(p.saga!.level).toBe(2);
    expect(p.stats.sagaLevel).toBe(2);
    expect(inst.fighters[p.id]!.max).toBe(Math.round(CLASSES.krigare.hp * 1.03));
    expect(gearStats(p).power).toBeCloseTo(1.03);
  });
});

describe('Lokes list: out in the world', () => {
  /** A hero with chapter 4 told, standing on an open tile of a map out in the world, with no monsters about. */
  function outdoors(cls: keyof typeof CLASSES, key: string, chapter = 4) {
    // (players in a new world get the same ids, and spell cooldowns out in the world are kept by id)
    clock += 30_000;
    const { world, players } = family(2);
    const p = players[0]!;
    p.saga = { cls, chapter, heard: true, cleared: ['draug', 'frost', 'surt'], titles: [], quests: {}, done: [], found: [] };
    const a = getArea(world, key)!;
    const at = openTileNear(a, 32, 30);
    placeIn(world, p, key, at.x, at.y, 'right', []);
    const roamers = Object.values(a.animals).filter((x) => ANIMALS[x.species]?.mob);
    for (const x of Object.values(a.animals)) if (ANIMALS[x.species]?.mob || ANIMALS[x.species]?.predator) delete a.animals[x.id];
    return { world, p, a, roamers, friend: players[1]! };
  }
  /** Puts a monster right next to (east of) the player. */
  const nextTo = (a: WorldState, p: PlayerState, m: AnimalState, tiles = 1): AnimalState => {
    m.x = p.x + tiles * TILE;
    m.y = p.y;
    m.hp = ANIMALS[m.species]!.mob!.hp;
    a.animals[m.id] = m;
    return m;
  };

  it('the hero switch swaps the outfits and draws the weapon', () => {
    const { world, p } = outdoors('krigare', 'a:0,-1');
    p.outfit = { hat: 'hat_straw', shirt: 'shirt_red' };
    p.saga!.gear = { weapon: 'draugyxa' };
    expect(shownHeld(p)).not.toBe('draugyxa');
    setHero(world, p.id, true);
    expect(p.saga!.hero).toBe(true);
    expect(p.outfit.hat).toBe(CLASSES.krigare.outfit.hat);
    expect(shownHeld(p)).toBe('draugyxa');
    p.outfit = { ...p.outfit, shirt: 'shirt_bjornfall' };
    setHero(world, p.id, false);
    expect(p.outfit).toEqual({ hat: 'hat_straw', shirt: 'shirt_red' });
    setHero(world, p.id, true);
    expect(p.outfit.shirt).toBe('shirt_bjornfall');
    // no class, no hero
    const q = createPlayer(world, 'Utan', { skin: '#f1c9a5', hair: '#2b2119', hairStyle: 'short' });
    expect(setHero(world, q.id, true).some((c) => c.t === 'toast')).toBe(true);
    expect(q.saga?.hero).toBeFalsy();
  });

  it("spells beat Loke's roaming servants, and the chapter's field task counts them", () => {
    const { world, p, a, roamers, friend } = outdoors('magiker', 'a:0,-1');
    expect(roamers.some((x) => x.species === 'vandrardraug')).toBe(true);
    // the friend close by has the same chapter: it counts for them too
    friend.saga = { cls: 'helare', chapter: 4, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [] };
    placeIn(world, friend, 'a:0,-1', Math.floor(p.x / TILE), Math.floor(p.y / TILE) + 1, 'up', []);
    // a farmer's spells do nothing out here
    expect(castSpell(world, p.id, 'eldboll', undefined, ctx())).toEqual([]);
    setHero(world, p.id, true);
    const m = nextTo(a, p, roamers.find((x) => x.species === 'vandrardraug')!, 3);
    let out: Change[] = [];
    for (let i = 0; i < 6 && a.animals[m.id]; i++) {
      out = out.concat(castSpell(world, p.id, 'eldboll', undefined, ctx(i + 1)));
      clock += 1500;
    }
    expect(a.animals[m.id]).toBeUndefined();
    expect(out.some((c) => c.t === 'spell' && c.area === 'a:0,-1')).toBe(true);
    expect(p.saga!.quests[fieldKey(4)]).toBe(1);
    expect(friend.saga!.quests[fieldKey(4)]).toBe(1);
    expect(p.saga!.xp).toBe(SAGA_XP.field);
    expect(chapterDone(p.saga!)).toBe(false);
    p.saga!.quests[fieldKey(4)] = 8;
    expect(chapterDone(p.saga!)).toBe(true);
  });

  it('in hero mode the use key casts the attack spell at a monster in reach; taunts and heals work too', () => {
    const { world, p, a, roamers } = outdoors('krigare', 'a:0,-1');
    setHero(world, p.id, true);
    const m = nextTo(a, p, roamers[0]!);
    const hp = m.hp!;
    const out = performAction(a, p.id, Math.floor(p.x / TILE), Math.floor(p.y / TILE) + 1, ctx());
    expect(out.some((c) => c.t === 'spell' && c.spell === 'yxhugg')).toBe(true);
    expect(a.animals[m.id] ? m.hp! : 0).toBeLessThan(hp);
    // a guardian's challenge makes it go for them, a healer's rune gives hearts back
    const g = outdoors('vaktare', 'a:0,-1');
    setHero(g.world, g.p.id, true);
    const t = nextTo(g.a, g.p, g.roamers[0]!, 2);
    castSpell(g.world, g.p.id, 'utmana', undefined, ctx());
    expect(t.hunt).toBe(g.p.id);
    const h = outdoors('helare', 'a:0,-1');
    setHero(h.world, h.p.id, true);
    h.p.hearts = 1;
    castSpell(h.world, h.p.id, 'lakerunan', undefined, ctx());
    expect(h.p.hearts).toBe(3);
  });

  it('chapter 5 needs both the field task and Helheim', () => {
    const prog = { cls: 'krigare' as const, chapter: 5, heard: true, cleared: ['draug', 'frost', 'surt'] as DungeonId[], titles: [], quests: {} as Record<string, number>, done: [], found: [] };
    expect(chapterDone(prog)).toBe(false);
    prog.cleared.push('hel');
    expect(chapterDone(prog)).toBe(false);
    prog.quests[fieldKey(5)] = 6;
    expect(chapterDone(prog)).toBe(true);
    const { world, players } = family();
    const p = players[0]!;
    p.saga = { ...prog, titles: [], done: [], found: [] };
    getArea(world, VILLAGE_KEY);
    placeIn(world, p, VILLAGE_KEY, VOLVA_SPOT.x, VOLVA_SPOT.y + 1, 'up', []);
    sagaChapter(world, p.id);
    expect(p.saga.chapter).toBe(6);
    expect(p.saga.titles).toContain('Helfarare');
    expect(p.saga.quests[fieldKey(5)]).toBeUndefined();
    expect(p.saga.xp).toBe(SAGA_XP.chapter);
  });

  it('a world boss leaves a treasure chest behind', () => {
    const { world, p, a, roamers } = outdoors('magiker', 'a:2,0');
    const boss = roamers.find((x) => x.species === 'bergatroll')!;
    expect(boss).toBeDefined();
    setHero(world, p.id, true);
    nextTo(a, p, boss, 2);
    boss.hp = 1;
    const out = castSpell(world, p.id, 'eldboll', boss.id, ctx());
    const chest = Object.values(a.objects).find((o) => o.kind === 'loot_chest' && o.loot === 'worldboss');
    expect(chest).toBeDefined();
    expect(p.stats.worldBoss).toBe(1);
    expect(out.some((c) => c.t === 'toast' && c.to === null && c.text.includes('Bergatrollet'))).toBe(true);
  });

  it('the roaming monsters come back: on old maps, and every morning', () => {
    const { world, a } = outdoors('magiker', 'a:0,-1');
    expect(Object.values(a.animals).some((x) => x.species === 'vandrardraug')).toBe(false);
    expect(ensureRoaming(a)).toBe(true);
    expect(Object.values(a.animals).filter((x) => x.species === 'vandrardraug').length).toBeGreaterThanOrEqual(2);
    expect(ensureRoaming(a)).toBe(false);
    for (const x of Object.values(a.animals)) if (x.species === 'vandrardraug') delete a.animals[x.id];
    newDay(world, ctx());
    expect(Object.values(a.animals).filter((x) => x.species === 'vandrardraug').length).toBeGreaterThanOrEqual(2);
  });
});
