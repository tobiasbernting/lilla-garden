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
  TILE,
  VILLAGE_KEY,
  VOLVA_SPOT,
  WIPE_MS,
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
  type Change,
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
function inside(world: WorldState, p: PlayerState, cls: keyof typeof CLASSES, id: 'draug' | 'frost' | 'surt' = 'draug'): WorldState {
  p.saga = { cls, chapter: 1, heard: true, cleared: id === 'draug' ? [] : id === 'frost' ? ['draug'] : ['draug', 'frost'], titles: [], quests: {}, done: [], found: [] };
  const plan = DUNGEONS[id].portal;
  const out = getArea(world, plan.area)!;
  const arch = Object.values(out.objects).find((o) => o.kind === 'saga_portal')!;
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
      for (const g of inst.gate) {
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
      const arch = Object.values(a.objects).find((o) => o.kind === 'saga_portal')!;
      expect(arch.variant ?? 0).toBe(variant);
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
