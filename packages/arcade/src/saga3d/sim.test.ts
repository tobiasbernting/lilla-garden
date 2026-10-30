import { describe, expect, it } from 'vitest';
import { CLASSES, DUNGEON_IDS, SAGA_BOSSES, SAGA_MOBS, TILE, bossHpScale, generateSaga, mobHpScale, type ClassId, type DungeonId } from '@lilla-garden/shared';
import { Sim, walkableFromWorld, type SimEvent, type SimMob } from './sim.ts';

const DT = 1 / 60;

function make(d: DungeonId = 'draug', cls: ClassId = 'krigare') {
  const world = generateSaga(d);
  const walk = walkableFromWorld(world);
  const sim = new Sim(world, { dungeon: d, cls, walkable: walk });
  return { world, walk, sim };
}

type Stamped = { t: number; e: SimEvent };

/** Runs the sim for `secs` seconds and returns the events with the sim time they came at. `each` runs before every step. */
function run(sim: Sim, secs: number, each?: () => void): Stamped[] {
  const out: Stamped[] = [];
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) {
    each?.();
    sim.update(DT);
    for (const e of sim.drain()) out.push({ t: sim.time, e });
  }
  return out;
}

const standable = (walk: (x: number, z: number) => boolean, x: number, z: number): boolean => [-0.4, 0.4].every((a) => [-0.4, 0.4].every((b) => walk(x + a, z + b)));

/** A floor spot `r` units from `at` with a clear line to it, in any direction. */
function spotAround(walk: (x: number, z: number) => boolean, at: { x: number; z: number }, r: number, ok: (x: number, z: number) => boolean = () => true): { x: number; z: number } {
  const from = 0;
  for (let k = 0; k < 32; k++) {
    const a = from + (k / 32) * Math.PI * 2;
    const x = at.x + Math.cos(a) * r;
    const z = at.z + Math.sin(a) * r;
    if (!standable(walk, x, z)) continue;
    let clear = true;
    // (the first stretch is skipped: a rest stone itself is solid)
    for (let i = 1; i <= 20; i++) if (r * (i / 20) > 0.75 && !walk(at.x + ((x - at.x) * i) / 20, at.z + ((z - at.z) * i) / 20)) clear = false;
    if (clear && !ok(x, z)) clear = false;
    if (clear) return { x, z };
  }
  throw new Error('no free spot');
}

function placeNear(sim: Sim, walk: (x: number, z: number) => boolean, m: SimMob, r: number): void {
  // not next to another monster: that would be a different fight
  const clearOf = Math.min(2.6, r + 0.5);
  const s = spotAround(walk, m, r, (x, z) => [...sim.mobs.values()].every((o) => o === m || Math.hypot(o.x - x, o.z - z) > clearOf));
  sim.player.x = s.x;
  sim.player.z = s.z;
}

/** Runs until `done()` is true (or `max` seconds pass). */
function runUntil(sim: Sim, done: () => boolean, max: number, each?: () => void): Stamped[] {
  const out: Stamped[] = [];
  for (let i = 0; i < Math.round(max / DT) && !done(); i++) {
    each?.();
    sim.update(DT);
    for (const e of sim.drain()) out.push({ t: sim.time, e });
  }
  return out;
}

const damagesOnPlayer = (evs: Stamped[], spell?: string): Stamped[] => evs.filter((s) => s.e.type === 'damage' && s.e.target === 'player' && (spell === undefined || s.e.spell === spell));
const has = (evs: Stamped[], type: SimEvent['type']): boolean => evs.some((s) => s.e.type === type);

describe('construction', () => {
  for (const d of DUNGEON_IDS) {
    it(`${d}: player at the start, every monster at home with scaled health`, () => {
      const { world, sim } = make(d);
      const inst = world.saga!;
      expect(sim.player.x).toBe(inst.start.x + 0.5);
      expect(sim.player.z).toBe(inst.start.y + 0.5);
      expect(sim.player.hp).toBe(CLASSES.krigare.hp);
      expect(sim.player.checkpoint).toEqual({ x: inst.start.x + 0.5, z: inst.start.y + 0.5 });
      expect(sim.rests.length).toBe(inst.rests.length);
      expect(sim.packs.length).toBe(inst.packs.length);
      expect(sim.mobs.size).toBe(Object.keys(inst.mobs).length);
      expect(sim.mobs.get(sim.bossId)?.kind).toBe('boss');
      expect(sim.mobs.get(sim.miniId)?.kind).toBe('mini');
      for (const sm of Object.values(inst.mobs)) {
        const m = sim.mobs.get(sm.id)!;
        expect(m).toBeDefined();
        expect(m.x).toBeCloseTo(sm.home.x / TILE, 6);
        expect(m.z).toBeCloseTo(sm.home.y / TILE, 6);
        expect(m.home).toEqual({ x: m.x, z: m.z });
        expect(m.state).toBe('idle');
        const big = sm.kind === 'boss' || sm.kind === 'mini';
        const base = (SAGA_BOSSES[sm.species] ?? SAGA_MOBS[sm.species])!.hp;
        expect(m.max).toBe(Math.round(base * (big ? bossHpScale(1) : mobHpScale(1))));
        expect(m.hp).toBe(m.max);
        expect(sim.mobDef(m.id)?.species).toBe(sm.species);
      }
    });
  }

  it('the player can stand at the start and the gate blocks until the mid-boss falls', () => {
    const { world, walk, sim } = make('frost');
    expect(standable(walk, sim.player.x, sim.player.z)).toBe(true);
    expect(walk(0.5, 0.5)).toBe(false);
    const g = world.saga!.gate[0]!;
    expect(walk(g.x + 0.5, g.y + 0.5)).toBe(false);
    world.saga!.gateOpen = true;
    expect(walk(g.x + 0.5, g.y + 0.5)).toBe(true);
  });
});

describe('player', () => {
  it('walks, and cannot walk into walls', () => {
    const { walk, sim } = make('draug');
    const x0 = sim.player.x;
    sim.move(1, 0);
    run(sim, 1);
    expect(sim.player.x).toBeGreaterThan(x0 + 3);
    expect(sim.player.moving).toBe(true);
    // keep walking: the room ends, and the player stays on the floor
    run(sim, 8, () => expect(standable(walk, sim.player.x, sim.player.z) || walk(sim.player.x, sim.player.z)).toBe(true));
    sim.move(0, 0);
    run(sim, 0.1);
    expect(sim.player.moving).toBe(false);
  });

  it('slows to 60% and a rage speeds up', () => {
    const { sim } = make('draug', 'krigare');
    sim.move(1, 0);
    run(sim, 0.1);
    expect(sim.player.speed).toBe(4);
    sim.player.slowUntil = 99;
    run(sim, 0.1);
    expect(sim.player.speed).toBeCloseTo(2.4, 6);
    sim.player.slowUntil = 0;
    expect(sim.cast(3)).toBe(true);
    run(sim, 0.1);
    expect(sim.player.speed).toBeCloseTo(5.2, 6);
  });

  it('health comes back slowly after a fight, and the potion heals 40% every 15 s', () => {
    const { sim } = make('draug', 'krigare');
    sim.player.hp = 50;
    run(sim, 2);
    expect(sim.player.hp).toBeGreaterThan(50);
    expect(sim.player.hp).toBeLessThan(60);
    sim.player.hp = 10;
    expect(sim.potion()).toBe(true);
    expect(sim.player.hp).toBe(10 + 60);
    expect(sim.drain().some((e) => e.type === 'heal')).toBe(true);
    expect(sim.potion()).toBe(false);
    expect(sim.drain()).toContainEqual({ type: 'fail', reason: 'cooldown' });
    run(sim, 15.1);
    expect(sim.potion()).toBe(true);
  });

  it('a rest stone heals fast, sets the checkpoint and speaks once per visit', () => {
    const { walk, sim } = make('draug');
    const r = sim.rests[0]!;
    const s = spotAround(walk, r, 2);
    sim.player.x = s.x;
    sim.player.z = s.z;
    sim.player.hp = 30;
    const evs = run(sim, 2);
    expect(evs.filter((x) => x.e.type === 'rest').length).toBe(1);
    expect(sim.player.hp).toBeGreaterThan(30 + 150 * 0.15 * 1.5);
    expect(sim.player.checkpoint.x).toBeGreaterThan(r.x - 2);
    expect(Math.hypot(sim.player.checkpoint.x - r.x, sim.player.checkpoint.z - r.z)).toBeLessThan(2);
    // leaving and coming back is a new visit
    sim.player.x = sim.start.x;
    sim.player.z = sim.start.z;
    run(sim, 0.1);
    sim.player.x = s.x;
    sim.player.z = s.z;
    expect(run(sim, 0.1).filter((x) => x.e.type === 'rest').length).toBe(1);
  });

  it('tab cycles through the monsters, nearest first', () => {
    const { walk, sim } = make('draug');
    const first = sim.packs[0]!.members[0]!;
    placeNear(sim, walk, sim.mobs.get(first)!, 6);
    sim.cycleTarget();
    const a = sim.player.target;
    expect(a).not.toBeNull();
    sim.cycleTarget();
    expect(sim.player.target).not.toBe(a);
    sim.setTarget(null);
    expect(sim.player.target).toBeNull();
  });
});

describe('monsters', () => {
  it('idle until the player is within aggro, then the whole pack chases and hurts', () => {
    const { walk, sim } = make('draug');
    const pack = sim.packs[0]!;
    const lead = sim.mobs.get(pack.members[0]!)!;
    const far = sim.mobs.get(sim.packs[3]!.members[0]!)!;
    run(sim, 1);
    expect(pack.members.every((id) => sim.mobs.get(id)!.state === 'idle')).toBe(true);
    const aggro = sim.mobDef(lead.id) as { aggro: number };
    placeNear(sim, walk, lead, aggro.aggro - 1);
    run(sim, 0.1);
    expect(pack.members.every((id) => sim.mobs.get(id)!.state === 'fight')).toBe(true);
    expect(far.state).toBe('idle');
    const hp = sim.player.hp;
    const evs = run(sim, 8);
    expect(sim.player.hp).toBeLessThan(hp);
    expect(damagesOnPlayer(evs).length).toBeGreaterThan(0);
    for (const s of damagesOnPlayer(evs)) expect(Number.isInteger((s.e as { amount: number }).amount)).toBe(true);
    // they came to the player
    expect(Math.hypot(lead.x - sim.player.x, lead.z - sim.player.z)).toBeLessThan(2);
  });

  it('a monster dragged too far gives up, walks home and heals', () => {
    const { walk, sim } = make('draug');
    const lead = sim.mobs.get(sim.packs[0]!.members[0]!)!;
    placeNear(sim, walk, lead, 3);
    run(sim, 0.1);
    expect(lead.state).toBe('fight');
    lead.hp = 5;
    // the player is teleported far away (22 tiles from home)
    sim.player.x = sim.start.x;
    sim.player.z = sim.start.z;
    sim.player.hp = sim.player.max;
    lead.x = lead.home.x + 23;
    run(sim, 0.05);
    expect(lead.state).toBe('home');
    expect(lead.hp).toBe(lead.max);
    run(sim, 30);
    expect(lead.state).toBe('idle');
    expect(lead.x).toBeCloseTo(lead.home.x, 3);
  });

  it('archers stand and shoot a bolt that hurts only when it lands', () => {
    const { walk, sim } = make('draug');
    const archer = [...sim.mobs.values()].find((m) => m.species === 'draugbage')!;
    placeNear(sim, walk, archer, 4);
    sim.player.hp = sim.player.max = 1000;
    const evs = run(sim, 6);
    const bolt = evs.find((s) => s.e.type === 'bolt' && s.e.spell === 'mob_draugbage')!;
    expect(bolt).toBeDefined();
    const arrive = (bolt.e as { arrive: number }).arrive;
    expect(arrive).toBeGreaterThan(bolt.t);
    const hits = damagesOnPlayer(evs, 'mob_draugbage');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.t).toBeGreaterThanOrEqual(arrive - DT);
    expect(hits[0]!.t).toBeLessThan(arrive + 2 * DT);
    // the archer stays put at range
    expect(Math.hypot(archer.x - sim.player.x, archer.z - sim.player.z)).toBeGreaterThan(2.5);
  });

  it('an ice-wraith shot slows the player', () => {
    const { walk, sim } = make('frost');
    const w = [...sim.mobs.values()].find((m) => m.species === 'isande')!;
    placeNear(sim, walk, w, 4);
    sim.player.hp = sim.player.max = 1000;
    run(sim, 5);
    expect(sim.player.slowUntil).toBeGreaterThan(0);
  });
});

describe('spells', () => {
  it('a bolt deals damage only on arrival', () => {
    const { walk, sim } = make('draug', 'magiker');
    const m = sim.mobs.get(sim.packs[0]!.members[0]!)!;
    placeNear(sim, walk, m, 7);
    sim.setTarget(m.id);
    expect(sim.cast(0)).toBe(true);
    const first = sim.drain();
    const cast = first.find((e) => e.type === 'cast');
    const bolt = first.find((e) => e.type === 'bolt');
    expect(cast).toBeDefined();
    expect(first.indexOf(cast!)).toBeLessThan(first.indexOf(bolt!));
    expect(bolt).toMatchObject({ type: 'bolt', spell: 'eldboll', target: m.id });
    const arrive = (bolt as { arrive: number }).arrive;
    expect(arrive - sim.time).toBeCloseTo(7 / 12, 1);
    const before = run(sim, arrive - sim.time - 0.05);
    expect(m.hp).toBe(m.max);
    expect(before.some((s) => s.e.type === 'damage')).toBe(false);
    const after = run(sim, 0.2);
    const dmg = after.find((s) => s.e.type === 'damage' && s.e.target === m.id)!;
    expect(dmg).toBeDefined();
    expect(dmg.t).toBeGreaterThanOrEqual(arrive - DT);
    expect(m.hp).toBeLessThan(m.max);
    const amount = (dmg.e as { amount: number }).amount;
    expect(amount).toBeGreaterThanOrEqual(Math.round(24 * 0.9));
    expect(amount).toBeLessThanOrEqual(Math.round(24 * 1.1));
    expect(m.state).toBe('fight');
  });

  it('the global cooldown and spell cooldowns refuse a second cast', () => {
    const { sim } = make('draug', 'krigare');
    expect(sim.cast(2)).toBe(true); // whirlwind needs no target
    sim.drain();
    expect(sim.cast(3)).toBe(false);
    expect(sim.drain()).toEqual([{ type: 'fail', reason: 'cooldown' }]);
    run(sim, 0.45);
    expect(sim.cast(2)).toBe(false); // its own cooldown (6 s)
    expect(sim.cast(3)).toBe(true);
    run(sim, 6);
    expect(sim.cast(2)).toBe(true);
    expect(sim.player.cds[2]).toBeGreaterThan(sim.time + 5.9);
  });

  it('without a target or anything in front it fails; out of range says range', () => {
    const { walk, sim } = make('draug', 'krigare');
    sim.drain();
    expect(sim.cast(0)).toBe(false);
    expect(sim.drain()).toEqual([{ type: 'fail', reason: 'noTarget' }]);
    expect(sim.player.cds[0]).toBe(0);
    const m = sim.mobs.get(sim.packs[0]!.members[0]!)!;
    placeNear(sim, walk, m, 4);
    sim.setTarget(m.id);
    expect(sim.cast(0)).toBe(false);
    expect(sim.drain()).toEqual([{ type: 'fail', reason: 'range' }]);
  });

  it('a melee blow picks the nearest monster in front when nothing is targeted', () => {
    const { walk, sim } = make('draug', 'krigare');
    const m = sim.mobs.get(sim.packs[0]!.members[0]!)!;
    placeNear(sim, walk, m, 1.2);
    sim.player.facing = Math.atan2(m.z - sim.player.z, m.x - sim.player.x);
    expect(sim.cast(0)).toBe(true);
    expect(sim.player.target).toBe(m.id);
    expect(m.hp).toBeLessThan(m.max);
    expect(m.state).toBe('fight');
    // behind the player nothing is picked
    const { walk: w2, sim: s2 } = make('draug', 'krigare');
    const m2 = s2.mobs.get(s2.packs[0]!.members[0]!)!;
    placeNear(s2, w2, m2, 1.2);
    s2.player.facing = Math.atan2(m2.z - s2.player.z, m2.x - s2.player.x) + Math.PI;
    expect(s2.cast(0)).toBe(false);
  });

  it('the dead player cannot cast', () => {
    const { sim } = make();
    sim.player.down = true;
    sim.drain();
    expect(sim.cast(2)).toBe(false);
    expect(sim.potion()).toBe(false);
    expect(sim.drain()).toEqual([{ type: 'fail', reason: 'down' }, { type: 'fail', reason: 'down' }]);
  });

  it('whirlwind hits everything near, stormsteg dashes and stuns, rage leeches', () => {
    const { walk, sim } = make('draug', 'krigare');
    const ids = sim.packs[0]!.members;
    const a = sim.mobs.get(ids[0]!)!;
    const b = sim.mobs.get(ids[1]!)!;
    sim.player.x = (a.x + b.x) / 2;
    sim.player.z = (a.z + b.z) / 2 + 0.7;
    expect(sim.cast(2)).toBe(true);
    expect(a.hp).toBeLessThan(a.max);
    expect(b.hp).toBeLessThan(b.max);
    // charge
    const { walk: w2, sim: s2 } = make('draug', 'krigare');
    const m = s2.mobs.get(s2.packs[0]!.members[0]!)!;
    placeNear(s2, w2, m, 6);
    s2.setTarget(m.id);
    const from = { x: s2.player.x, z: s2.player.z };
    expect(s2.cast(1)).toBe(true);
    const evs = s2.drain();
    expect(evs.some((e) => e.type === 'charge' && e.who === 'player')).toBe(true);
    expect(Math.hypot(s2.player.x - m.x, s2.player.z - m.z)).toBeLessThan(1.8);
    expect(Math.hypot(s2.player.x - from.x, s2.player.z - from.z)).toBeGreaterThan(3);
    expect(m.stunUntil).toBeGreaterThan(s2.time);
    // rage
    s2.player.hp = 50;
    run(s2, 0.5);
    s2.player.hp = 50;
    expect(s2.cast(3)).toBe(true);
    run(s2, 0.5);
    s2.player.hp = 50;
    s2.player.cds[0] = 0;
    s2.player.gcdUntil = 0;
    s2.cast(0);
    expect(s2.drain().some((e) => e.type === 'heal')).toBe(true);
    void walk;
  });

  it('blink jumps four units forward and stops at a wall', () => {
    const { walk, sim } = make('draug', 'magiker');
    sim.player.facing = 0;
    const x0 = sim.player.x;
    expect(sim.cast(3)).toBe(true);
    expect(sim.player.x - x0).toBeCloseTo(4, 1);
    expect(sim.drain().some((e) => e.type === 'blink')).toBe(true);
    // right at a wall: nothing to jump
    let x = sim.player.x;
    while (walk(x + 1, sim.player.z)) x += 0.5;
    sim.player.x = x;
    sim.player.cds[3] = 0;
    sim.player.gcdUntil = 0;
    const before = sim.player.x;
    sim.cast(3);
    expect(standable(walk, sim.player.x, sim.player.z) || walk(sim.player.x, sim.player.z)).toBe(true);
    expect(sim.player.x - before).toBeLessThan(2);
  });

  it('healer heals herself, shield wall cuts damage', () => {
    const { sim } = make('draug', 'helare');
    sim.player.hp = 50;
    expect(sim.cast(0)).toBe(true);
    expect(sim.player.hp).toBeGreaterThan(50);
    const { sim: s2, walk, world } = make('draug', 'vaktare');
    void world;
    const m = s2.mobs.get(s2.packs[0]!.members[0]!)!;
    placeNear(s2, walk, m, 1.5);
    s2.player.hp = s2.player.max = 100000;
    expect(s2.cast(3)).toBe(true);
    expect(s2.player.wallUntil).toBeGreaterThan(s2.time + 5);
    const evs = run(s2, 4);
    const hits = damagesOnPlayer(evs);
    expect(hits.length).toBeGreaterThan(0);
    // skeleton: 7 * 0.4 (solo) * 0.4 (wall) = 1.1, never more than 2
    for (const h of hits) expect((h.e as { amount: number }).amount).toBeLessThanOrEqual(2);
  });
});

describe('bosses', () => {
  it('killing the mid-boss opens the gate', () => {
    const { world, walk, sim } = make('draug', 'krigare');
    const mini = sim.mobs.get(sim.miniId)!;
    const g = world.saga!.gate[0]!;
    expect(walk(g.x + 0.5, g.y + 0.5)).toBe(false);
    placeNear(sim, walk, mini, 1.2);
    sim.setTarget(mini.id);
    mini.hp = 1;
    expect(sim.cast(0)).toBe(true);
    const evs = sim.drain().map((e) => ({ t: 0, e }));
    expect(mini.dead).toBe(true);
    expect(mini.state).toBe('dead');
    expect(has(evs, 'mobDied')).toBe(true);
    expect(has(evs, 'gateOpen')).toBe(true);
    expect(has(evs, 'cleared')).toBe(false);
    expect(evs.some((s) => s.e.type === 'yell' && s.e.text === SAGA_BOSSES.gravvaktare!.yells.death)).toBe(true);
    expect(sim.gateOpen).toBe(true);
    expect(walk(g.x + 0.5, g.y + 0.5)).toBe(true);
    expect(sim.cleared).toBe(false);
  });

  it('killing the last boss clears the dungeon', () => {
    const { walk, sim } = make('surt', 'krigare');
    const boss = sim.mobs.get(sim.bossId)!;
    placeNear(sim, walk, boss, 1.5);
    sim.setTarget(boss.id);
    boss.hp = 1;
    sim.cast(0);
    const evs = sim.drain();
    expect(evs.some((e) => e.type === 'cleared')).toBe(true);
    expect(evs.some((e) => e.type === 'yell' && e.text === SAGA_BOSSES.surt!.yells.death)).toBe(true);
    expect(sim.cleared).toBe(true);
  });

  it('a boss pulls with a yell, telegraphs a slam before it lands and hurts only inside it', () => {
    for (const inside of [true, false]) {
      const { walk, sim } = make('draug', 'krigare');
      const mini = sim.mobs.get(sim.miniId)!;
      placeNear(sim, walk, mini, 3.5);
      sim.player.max = sim.player.hp = 5000;
      const evs = runUntil(sim, () => sim.zones.length > 0, 12);
      expect(evs.some((s) => s.e.type === 'yell' && s.e.text === SAGA_BOSSES.gravvaktare!.yells.pull)).toBe(true);
      expect(mini.state).toBe('fight');
      // the mark is on the floor before it lands
      const zone = sim.zones[0]!;
      expect(zone.shape).toBe('circle');
      expect(zone.at).toBeGreaterThan(sim.time + 1);
      expect(zone.born).toBeLessThanOrEqual(sim.time);
      expect(zone.r).toBe(2.6);
      expect(zone.by).toBe(mini.id);
      expect(mini.cast).toMatchObject({ move: 'slam', name: 'Gravslaget', at: zone.at });
      expect(evs.some((s) => s.e.type === 'bossMove' && s.e.move === 'slam')).toBe(true);
      // step to where the player is safe, or hit
      if (inside) {
        sim.player.x = zone.x;
        sim.player.z = zone.z;
      } else {
        const s = spotAround(walk, zone, zone.r + 1.6);
        sim.player.x = s.x;
        sim.player.z = s.z;
      }
      const before = run(sim, zone.at - sim.time - 0.1);
      expect(damagesOnPlayer(before, 'boss_slam').length).toBe(0);
      expect(sim.zones.length).toBe(1);
      const after = run(sim, 0.3);
      const hits = damagesOnPlayer(after, 'boss_slam');
      if (inside) {
        expect(hits.length).toBe(1);
        const amount = (hits[0]!.e as { amount: number }).amount;
        expect(amount).toBeGreaterThanOrEqual(Math.round(28 * 0.4 * 0.9));
        expect(amount).toBeLessThanOrEqual(Math.round(28 * 0.4 * 1.1));
        expect(hits[0]!.t).toBeGreaterThanOrEqual(zone.at - DT);
      } else expect(hits.length).toBe(0);
      expect(sim.zones.length).toBe(0);
      expect(mini.cast).toBeNull();
    }
  });

  it('a cleave is a cone: behind the boss is safe', () => {
    const { walk, sim } = make('draug', 'vaktare');
    const boss = sim.mobs.get(sim.bossId)!;
    placeNear(sim, walk, boss, 3);
    sim.player.max = sim.player.hp = 5000;
    runUntil(sim, () => sim.zones.some((z) => z.shape === 'cone'), 12, () => (sim.player.hp = 5000));
    const cone = sim.zones.find((z) => z.shape === 'cone')!;
    expect(cone.arc).toBe(100);
    expect(cone.r).toBe(3.4);
    const ahead = { x: cone.x + Math.cos(cone.dir!) * 2, z: cone.z + Math.sin(cone.dir!) * 2 };
    const behind = { x: cone.x - Math.cos(cone.dir!) * 2, z: cone.z - Math.sin(cone.dir!) * 2 };
    const inZone = (p: { x: number; z: number }): boolean => {
      const a = Math.abs(((Math.atan2(p.z - cone.z, p.x - cone.x) - cone.dir! + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return Math.hypot(p.x - cone.x, p.z - cone.z) <= cone.r && a <= (cone.arc! / 2) * (Math.PI / 180);
    };
    expect(inZone(ahead)).toBe(true);
    expect(inZone(behind)).toBe(false);
  });

  it('bash interrupts a boss cast that can be interrupted, and only that', () => {
    const { walk, sim } = make('draug', 'vaktare');
    const boss = sim.mobs.get(sim.bossId)!;
    placeNear(sim, walk, boss, 2.5);
    runUntil(sim, () => boss.cast?.move === 'nova', 40, () => (sim.player.hp = sim.player.max));
    expect(boss.cast?.move).toBe('nova');
    expect(sim.zones.some((z) => z.r === 7)).toBe(true);
    // right next to the boss, ready to bash
    placeNear(sim, walk, boss, 1.3);
    sim.setTarget(boss.id);
    sim.player.gcdUntil = 0;
    expect(sim.cast(2)).toBe(true);
    const evs = sim.drain();
    expect(evs).toContainEqual({ type: 'interrupt', by: boss.id });
    expect(evs).toContainEqual({ type: 'bossMove', by: boss.id, move: 'nova', name: 'Draugropet', interrupted: true });
    expect(boss.cast).toBeNull();
    expect(sim.zones.filter((z) => z.by === boss.id).length).toBe(0);
    const after = run(sim, 4, () => (sim.player.hp = sim.player.max));
    expect(damagesOnPlayer(after, 'boss_nova').length).toBe(0);
    expect(boss.stunUntil).toBe(0); // a boss is never stunned for real

    // a slam cannot be stopped
    const { walk: w2, sim: s2 } = make('draug', 'vaktare');
    const mini = s2.mobs.get(s2.miniId)!;
    placeNear(s2, w2, mini, 3);
    runUntil(s2, () => !!mini.cast, 12, () => (s2.player.hp = s2.player.max));
    placeNear(s2, w2, mini, 1.3);
    s2.setTarget(mini.id);
    s2.player.gcdUntil = 0;
    expect(s2.cast(2)).toBe(true);
    expect(s2.drain().some((e) => e.type === 'interrupt')).toBe(false);
    expect(mini.cast).not.toBeNull();
  });

  it('an ice lance stops a boss cast when it lands', () => {
    const { walk, sim } = make('draug', 'magiker');
    const boss = sim.mobs.get(sim.bossId)!;
    placeNear(sim, walk, boss, 5);
    runUntil(sim, () => boss.cast?.move === 'nova', 40, () => (sim.player.hp = sim.player.max));
    sim.setTarget(boss.id);
    expect(sim.cast(1)).toBe(true);
    expect(boss.cast).not.toBeNull(); // not before it arrives
    const evs = run(sim, 1.2);
    expect(has(evs, 'interrupt')).toBe(true);
    expect(boss.cast).toBeNull();
    expect(boss.slowUntil).toBeGreaterThan(sim.time);
  });

  it('a new phase shouts and calls helpers with new ids', () => {
    const { walk, sim } = make('draug', 'krigare');
    const boss = sim.mobs.get(sim.bossId)!;
    const maxId = Math.max(...sim.mobs.keys());
    placeNear(sim, walk, boss, 1.3);
    sim.setTarget(boss.id);
    boss.hp = Math.floor(boss.max * 0.67) + 5; // just over the first mark (66%)
    sim.cast(0);
    const evs = sim.drain();
    expect(boss.phase).toBe(1);
    expect(evs.some((e) => e.type === 'yell' && e.text === 'Mina krigare, res er!')).toBe(true);
    const spawn = evs.find((e) => e.type === 'spawn');
    expect(spawn).toBeDefined();
    const add = sim.mobs.get((spawn as { id: number }).id)!;
    expect(add.id).toBeGreaterThan(maxId);
    expect(add.kind).toBe('add');
    expect(add.state).toBe('fight');
    expect(add.max).toBe(Math.round(SAGA_MOBS.skelett!.hp * mobHpScale(1)));
    expect(add.species).toBe('skelett');
    // a rain mark appears for phase one once the boss is ready
    run(sim, 0.1);
  });

  it('pools linger and hurt every second', () => {
    const { walk, sim } = make('surt', 'vaktare');
    const smith = sim.mobs.get(sim.miniId)!;
    placeNear(sim, walk, smith, 3);
    sim.player.max = sim.player.hp = 5000;
    runUntil(sim, () => sim.zones.some((z) => z.until !== undefined), 20, () => (sim.player.hp = 5000));
    const z = sim.zones.find((q) => q.until !== undefined)!;
    expect(z.until).toBeCloseTo(z.at + 8, 3);
    sim.player.x = z.x;
    sim.player.z = z.z;
    const evs = run(sim, z.at - sim.time + 3.1, () => {
      sim.player.x = z.x;
      sim.player.z = z.z;
    });
    expect(damagesOnPlayer(evs, 'boss_pools').length).toBeGreaterThanOrEqual(3);
    expect(sim.zones.includes(z)).toBe(true);
    run(sim, 10, () => (sim.player.hp = 5000));
    expect(sim.zones.includes(z)).toBe(false);
  });
});

describe('falling', () => {
  it('the player falls, gets up at the checkpoint after 3 s and the monsters go home', () => {
    const { walk, sim } = make('draug', 'krigare');
    const lead = sim.mobs.get(sim.packs[0]!.members[0]!)!;
    placeNear(sim, walk, lead, 2);
    sim.player.hp = 1;
    const evs = runUntil(sim, () => sim.player.down, 10);
    expect(has(evs, 'playerDown')).toBe(true);
    expect(sim.player.hp).toBe(0);
    const downAt = sim.player.downAt;
    expect(downAt).toBeCloseTo(sim.time, 1);
    // the monsters leave at once
    run(sim, 0.1);
    expect([...sim.mobs.values()].some((m) => m.state === 'fight')).toBe(false);
    // still down after two seconds, and cannot walk
    sim.move(1, 0);
    const x = sim.player.x;
    run(sim, 2.5);
    expect(sim.player.down).toBe(true);
    expect(sim.player.x).toBe(x);
    sim.move(0, 0);
    const up = run(sim, 0.6);
    expect(has(up, 'playerUp')).toBe(true);
    expect(sim.player.down).toBe(false);
    expect(sim.player.hp).toBe(sim.player.max);
    expect(sim.time - downAt).toBeGreaterThanOrEqual(3 - DT);
    sim.move(0, 0);
    run(sim, 0.05);
    expect(sim.player.x).toBeCloseTo(sim.start.x, 0);
    expect(sim.player.z).toBeCloseTo(sim.start.z, 0);
    // and they are all back home and healthy in the end
    run(sim, 40);
    for (const m of sim.mobs.values()) {
      expect(m.state).toBe('idle');
      expect(m.hp).toBe(m.max);
      expect(Math.hypot(m.x - m.home.x, m.z - m.home.z)).toBeLessThan(0.2);
    }
  });

  it('gets up at the rest stone that was reached', () => {
    const { walk, sim } = make('draug', 'krigare');
    const r = sim.rests[0]!;
    const s = spotAround(walk, r, 2);
    sim.player.x = s.x;
    sim.player.z = s.z;
    run(sim, 0.2);
    const cp = { ...sim.player.checkpoint };
    expect(Math.hypot(cp.x - r.x, cp.z - r.z)).toBeLessThan(2);
    sim.player.x = sim.start.x;
    sim.player.z = sim.start.z;
    sim.player.down = true;
    sim.player.downAt = sim.time;
    run(sim, 3.1);
    expect(sim.player.down).toBe(false);
    expect(sim.player.x).toBeCloseTo(cp.x, 3);
    expect(sim.player.z).toBeCloseTo(cp.z, 3);
  });

  it('a boss that downs the player has the last word, and loses its helpers and phase', () => {
    const { walk, sim } = make('draug', 'krigare');
    const boss = sim.mobs.get(sim.bossId)!;
    placeNear(sim, walk, boss, 1.3);
    sim.setTarget(boss.id);
    boss.hp = Math.floor(boss.max * 0.67) + 5;
    sim.cast(0);
    expect(boss.phase).toBe(1);
    sim.player.hp = 1;
    const evs = runUntil(sim, () => sim.player.down, 20);
    expect(evs.some((s) => s.e.type === 'yell' && s.e.text === SAGA_BOSSES.draugkung!.yells.kill)).toBe(true);
    run(sim, 0.1);
    expect(['home', 'idle']).toContain(boss.state);
    expect(boss.hp).toBe(boss.max);
    expect(boss.phase).toBe(0);
    expect([...sim.mobs.values()].filter((m) => m.kind === 'add' && !m.dead).length).toBe(0);
    expect(sim.zones.length).toBe(0);
  });
});
