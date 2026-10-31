// Rallyvärlden on the server: a room from the lobby to the prizes, snapshots relayed, free roam.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROAM_COIN_KR, ROAM_COINS_PER_DAY, ROOM_IDLE_MS, RACE_COUNTDOWN_MS, RACE_DNF_PRIZE, RACE_FINISH_GRACE_MS, T, cleanRules, defaultRules, minRaceMs, racePrize, type CarSnap, type ClientMsg, type ServerMsg } from '../../shared/src/index.ts';
import { Game, RACE_GRACE_MS, type Link } from './game.ts';
import { MemoryStore } from './db/store.ts';
import { ROOM_DONE_MS, finishGraceMs } from './races.ts';

const fakeLink = (): Link & { msgs: ServerMsg[] } => {
  const l = {
    msgs: [] as ServerMsg[],
    send(m: ServerMsg) {
      l.msgs.push(m);
    },
    close() {},
  };
  return l;
};

type Race = Extract<ServerMsg, { t: 'race' }>;
type Roam = Extract<ServerMsg, { t: 'roam' }>;
const races = (l: { msgs: ServerMsg[] }) => l.msgs.filter((m): m is Race => m.t === 'race');
const roams = (l: { msgs: ServerMsg[] }) => l.msgs.filter((m): m is Roam => m.t === 'roam');
const last = <E extends Race['ev']>(l: { msgs: ServerMsg[] }, ev: E) => races(l).filter((m): m is Extract<Race, { ev: E }> => m.ev === ev).at(-1);
const toastsTo = (l: { msgs: ServerMsg[] }, id: string): string[] => l.msgs.flatMap((m) => (m.t === 'changes' ? m.changes.flatMap((c) => (c.t === 'toast' && c.to === id ? [c.text] : [])) : []));

const snap = (id: string, x: number): CarSnap => ({ id, x, y: 0, z: 0, h: 0, vx: 1, vz: 0, st: 0, th: 1, br: 0, hb: false, ni: false, dm: 0, lap: 0, t: 100 });

async function twoPlayers() {
  const game = new Game(new MemoryStore(), { autoStart: false });
  await game.start();
  const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
  const b = game.createPlayer('Bo', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'long' })!;
  const la = fakeLink();
  const lb = fakeLink();
  const ha = game.connect(la);
  const hb = game.connect(lb);
  ha({ t: 'hello', playerId: a.id });
  hb({ t: 'hello', playerId: b.id });
  return { game, a, b, la, lb, ha: ha as (m: ClientMsg) => void, hb: hb as (m: ClientMsg) => void };
}

describe('race rooms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('runs a room from the lobby to the prizes and closes it', async () => {
    const { game, a, b, la, lb, ha, hb } = await twoPlayers();
    expect(game.world.objects && Object.values(game.world.objects).some((o) => o.kind === 'rally_garage')).toBe(true);
    const pa = game.world.players[a.id]!;
    const pb = game.world.players[b.id]!;
    pa.coins = 0;
    pb.coins = 0;

    // Bo looks at the lobby (empty), Astrid creates a room: Bo's list updates by itself
    hb({ t: 'race', a: 'rooms' });
    expect(last(lb, 'rooms')!.rooms).toEqual([]);
    const rules = { ...defaultRules(), laps: 1, ai: 2, damage: true, course: 'beach' as const, junk: 1 } as ReturnType<typeof defaultRules>;
    ha({ t: 'race', a: 'create', rules });
    const room = last(la, 'room')!.room!;
    expect(room.host).toBe(a.id);
    expect(room.id).toMatch(/^[a-z0-9]{6}$/);
    expect(room.rules).toEqual({ ...defaultRules(), laps: 1, ai: 2, damage: true, course: 'beach' });
    expect(room.members[0]!.car.name).toBeTruthy();
    expect(last(lb, 'rooms')!.rooms.map((r) => r.id)).toEqual([room.id]);

    // Bo joins and gets ready; only the host may change the rules or start, and only with everyone ready
    hb({ t: 'race', a: 'join', room: room.id });
    expect(last(lb, 'room')!.room!.members.map((m) => m.id)).toEqual([a.id, b.id]);
    hb({ t: 'race', a: 'ready', ready: true });
    expect(last(la, 'room')!.room!.members[1]!.ready).toBe(true);
    hb({ t: 'race', a: 'rules', rules: { ...rules, laps: 5 } });
    hb({ t: 'race', a: 'start' });
    expect(game.races.room(room.id)!.phase).toBe('lobby');
    ha({ t: 'race', a: 'rules', rules: { ...rules, laps: 2 } });
    expect(last(lb, 'room')!.room!.rules.laps).toBe(2);
    ha({ t: 'race', a: 'start' });
    expect(game.races.room(room.id)!.phase).toBe('lobby');
    ha({ t: 'race', a: 'ready', ready: true });
    ha({ t: 'race', a: 'start' });
    const go = last(lb, 'go')!.room;
    expect(go.phase).toBe('countdown');
    expect(go.startAt).toBe(Date.now() + RACE_COUNTDOWN_MS);
    expect(last(la, 'go')!.room.seed).toBe(go.seed);
    // a started room is no longer in the lobby list
    expect(last(lb, 'rooms')!.rooms).toEqual([]);

    // snapshots reach the other one only, already on the grid during the countdown
    la.msgs.length = 0;
    lb.msgs.length = 0;
    ha({ t: 'race', a: 'snap', snaps: [snap(a.id, 1)] });
    expect(last(lb, 'snap')!.snaps[0]!.x).toBe(1);
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS);
    game.tick(50);
    expect(game.races.room(room.id)!.phase).toBe('racing');
    const dirty = { ...snap('someone-else', 2), x: Number.NaN, evil: '<script>' } as unknown as CarSnap;
    ha({ t: 'race', a: 'snap', snaps: [dirty, snap('ai:1', 3), ...Array.from({ length: 20 }, (_, i) => snap(a.id, i))] });
    const got = last(lb, 'snap')!;
    expect(got.from).toBe(a.id);
    expect(got.snaps).toHaveLength(9);
    expect(got.snaps[0]!.id).toBe(a.id);
    expect(got.snaps[0]!.x).toBe(0);
    expect('evil' in got.snaps[0]!).toBe(false);
    expect(got.snaps[1]!.id).toBe('ai:1'); // the host drives the computer cars
    expect(races(la).some((m) => m.ev === 'snap')).toBe(false);
    hb({ t: 'race', a: 'snap', snaps: [snap('ai:2', 3)] });
    expect(last(la, 'snap')!.snaps[0]!.id).toBe(b.id);
    // too many in one second: dropped
    lb.msgs.length = 0;
    for (let i = 0; i < 40; i++) ha({ t: 'race', a: 'snap', snaps: [snap(a.id, i)] });
    expect(races(lb).filter((m) => m.ev === 'snap').length).toBeLessThanOrEqual(20);

    // a finish sooner than the course can be driven is not believed
    const cleaned = { ...defaultRules(), laps: 2, ai: 2, damage: true, course: 'beach' as const };
    vi.advanceTimersByTime(60_000);
    expect(minRaceMs(cleaned)).toBeGreaterThan(60_000);
    hb({ t: 'race', a: 'finish', time: 60_000, damage: 30 });
    expect(last(la, 'finish')).toBeUndefined();
    // Bo crosses the line first, then Astrid: the times are the server's clock, give or take a little
    vi.advanceTimersByTime(65_000);
    hb({ t: 'race', a: 'finish', time: 100_000, damage: 30 });
    expect(last(la, 'finish')).toMatchObject({ from: b.id, time: 120_000 });
    expect(last(lb, 'finish')).toBeUndefined();
    expect(last(la, 'result')).toBeUndefined();
    // Bo closes his card before the result: the dents he got after the line are kept for later
    hb({ t: 'race', a: 'done', damage: 40 });
    expect(pb.garage!.cars[0]!.damage).toBe(0);
    vi.advanceTimersByTime(6000);
    ha({ t: 'race', a: 'finish', time: 999_999, damage: 12 });
    const res = last(la, 'result')!;
    expect(last(lb, 'result')!.results).toEqual(res.results);
    expect(res.room).toBe(room.id);
    // the two computer cars never got there: behind the humans
    expect(res.results.map((r) => [r.id, r.place, r.time])).toEqual([
      [b.id, 1, 120_000],
      [a.id, 2, 132_000],
      ['ai:0', 3, null],
      ['ai:1', 4, null],
    ]);
    expect(res.results[0]!.prize).toBe(racePrize(cleaned, 1, 4));
    expect(res.results[2]!.prize).toBe(0);
    expect(pb.coins).toBe(racePrize(cleaned, 1, 4));
    expect(pa.coins).toBe(racePrize(cleaned, 2, 4));
    expect(pb.garage!.cars[0]!.damage).toBe(40);
    expect(pb.garage!.cars[0]!.wins).toBe(1);
    expect(game.races.room(room.id)!.phase).toBe('done');
    // the kr reached the clients as player changes, the winner as news for everyone
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'player' && c.id === b.id))).toBe(true);
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'toast' && c.to === null && c.text.includes('Bo')))).toBe(true);

    // closing the result card keeps the dents from after the line (once)
    ha({ t: 'race', a: 'done', damage: 20 });
    expect(pa.garage!.cars[0]!.damage).toBe(20);
    ha({ t: 'race', a: 'done', damage: 90 });
    expect(pa.garage!.cars[0]!.damage).toBe(20);
    hb({ t: 'race', a: 'done', damage: 90 });
    expect(pb.garage!.cars[0]!.damage).toBe(40);

    // the room closes after a while
    vi.advanceTimersByTime(ROOM_DONE_MS);
    game.tick(50);
    expect(game.races.room(room.id)).toBeUndefined();
    expect(last(la, 'room')!.room).toBeNull();
    expect(game.races.roomIdOf(a.id)).toBeUndefined();
    await game.stop();
  });

  /** Astrid's room with Bo, both ready, started: the lights are green after `RACE_COUNTDOWN_MS`. */
  async function startedRace(rules = defaultRules()) {
    const t = await twoPlayers();
    t.ha({ t: 'race', a: 'create', rules });
    const id = last(t.la, 'room')!.room!.id;
    t.hb({ t: 'race', a: 'join', room: id });
    t.ha({ t: 'race', a: 'ready', ready: true });
    t.hb({ t: 'race', a: 'ready', ready: true });
    t.ha({ t: 'race', a: 'start' });
    expect(t.game.races.room(id)!.phase).toBe('countdown');
    return { ...t, id };
  }

  it('hands the room over when the host leaves, books a leaver mid-race as not finished', async () => {
    const { game, a, b, la, lb, hb, id } = await startedRace();
    const pa = game.world.players[a.id]!;
    pa.coins = 0;
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS + 120_000);
    game.tick(50);
    // Astrid's tablet drops on the way: she keeps her place for a while…
    game.disconnect(la);
    expect(game.races.room(id)!.members.map((m) => m.id)).toEqual([a.id, b.id]);
    // …then she is out: Bo is the host now and the race goes on
    vi.advanceTimersByTime(RACE_GRACE_MS);
    const r = last(lb, 'room')!.room!;
    expect(r.host).toBe(b.id);
    expect(r.members.map((m) => m.id)).toEqual([b.id]);
    vi.advanceTimersByTime(30_000);
    hb({ t: 'race', a: 'finish', time: 160_000, damage: 0 });
    const res = last(lb, 'result')!.results;
    expect(res.map((x) => [x.id, x.place, x.time])).toEqual([
      [b.id, 1, 160_000],
      ['ai:0', 2, null],
      ['ai:1', 3, null],
      ['ai:2', 4, null],
      [a.id, 5, null],
    ]);
    expect(pa.coins).toBe(RACE_DNF_PRIZE);
    await game.stop();
  });

  it('keeps a racer through a Wi-Fi blip', async () => {
    const { game, a, b, lb, id } = await startedRace();
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS + 20_000);
    game.disconnect(lb);
    vi.advanceTimersByTime(RACE_GRACE_MS / 2);
    const lb2 = fakeLink();
    game.connect(lb2)({ t: 'hello', playerId: b.id });
    vi.advanceTimersByTime(RACE_GRACE_MS * 2);
    expect(game.races.room(id)!.members.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(game.races.roomIdOf(b.id)).toBe(id);
    await game.stop();
  });

  it('books nothing for leaving during the countdown or right after the start', async () => {
    const { game, a, b, ha, hb, la, id } = await startedRace({ ...defaultRules(), laps: 1, ai: 0 });
    const pb = game.world.players[b.id]!;
    pb.coins = 0;
    hb({ t: 'race', a: 'leave' });
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS + 70_000);
    ha({ t: 'race', a: 'finish', time: 70_000, damage: 0 });
    expect(last(la, 'result')!.results.map((r) => r.id)).toEqual([a.id]);
    expect(pb.coins).toBe(0);
    expect(pb.stats.rallyRaces ?? 0).toBe(0);
    expect(game.races.room(id)!.phase).toBe('done');
    await game.stop();
  });

  it('places the host\'s computer cars by their finish, pays only the humans', async () => {
    const rules = { ...defaultRules(), laps: 1, ai: 2 };
    const { game, a, b, la, lb, ha, hb, id } = await startedRace(rules);
    const pa = game.world.players[a.id]!;
    const pb = game.world.players[b.id]!;
    pa.coins = 0;
    pb.coins = 0;
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS + 66_000);
    ha({ t: 'race', a: 'finish', time: 66_000, damage: 0, id: 'ai:1', name: '  Hästen Blixt  ' });
    expect(last(lb, 'finish')).toMatchObject({ from: 'ai:1', time: 66_000 });
    // only the host drives them, only the ones on the grid, once each; they do not end the race
    hb({ t: 'race', a: 'finish', time: 66_000, damage: 0, id: 'ai:0', name: 'Fusk' });
    ha({ t: 'race', a: 'finish', time: 66_000, damage: 0, id: 'ai:5', name: 'Fusk' });
    ha({ t: 'race', a: 'finish', time: 66_000, damage: 0, id: 'ai:1', name: 'Fusk' });
    ha({ t: 'race', a: 'finish', time: 66_000, damage: 0, id: a.id, name: 'Fusk' });
    expect(last(la, 'finish')).toBeUndefined();
    expect(game.races.room(id)!.members.every((m) => m.finish === undefined)).toBe(true);
    vi.advanceTimersByTime(2000);
    ha({ t: 'race', a: 'finish', time: 68_000, damage: 0, id: 'ai:0', name: 'Kossan Mu' });
    vi.advanceTimersByTime(2000);
    hb({ t: 'race', a: 'finish', time: 70_000, damage: 0 });
    vi.advanceTimersByTime(2000);
    ha({ t: 'race', a: 'finish', time: 72_000, damage: 0 });
    const res = last(la, 'result')!.results;
    expect(res.map((r) => [r.id, r.name, r.place, r.prize])).toEqual([
      ['ai:1', 'Hästen Blixt', 1, 0],
      ['ai:0', 'Kossan Mu', 2, 0],
      [b.id, 'Bo', 3, racePrize(cleanRules(rules), 3, 4)],
      [a.id, 'Astrid', 4, racePrize(cleanRules(rules), 4, 4)],
    ]);
    expect(pb.coins).toBe(racePrize(cleanRules(rules), 3, 4));
    expect(pa.coins).toBe(racePrize(cleanRules(rules), 4, 4));
    expect(pa.garage!.cars[0]!.wins).toBe(0);
    await game.stop();
  });

  it('waits longer for the others on a long race', async () => {
    expect(finishGraceMs(defaultRules())).toBe(Math.max(RACE_FINISH_GRACE_MS, 62 * 3 * 500));
    const rules = { ...defaultRules(), course: 'city' as const, laps: 5, ai: 0 };
    expect(finishGraceMs(rules)).toBe(55 * 5 * 500);
    const { game, a, b, hb, la, id } = await startedRace(rules);
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS + 300_000);
    hb({ t: 'race', a: 'finish', time: 300_000, damage: 0 });
    vi.advanceTimersByTime(RACE_FINISH_GRACE_MS + 1000);
    game.tick(50);
    expect(game.races.room(id)!.phase).toBe('racing');
    vi.advanceTimersByTime(finishGraceMs(rules) - RACE_FINISH_GRACE_MS);
    game.tick(50);
    expect(game.races.room(id)!.phase).toBe('done');
    expect(last(la, 'result')!.results.map((r) => [r.id, r.time])).toEqual([
      [b.id, 300_000],
      [a.id, null],
    ]);
    await game.stop();
  });

  it('closes idle rooms and tells who tries to join a gone one', async () => {
    const { game, la, lb, ha, hb } = await twoPlayers();
    ha({ t: 'race', a: 'create', rules: defaultRules() });
    const id = last(la, 'room')!.room!.id;
    vi.advanceTimersByTime(ROOM_IDLE_MS + 1);
    game.tick(50);
    expect(game.races.room(id)).toBeUndefined();
    expect(last(la, 'room')!.room).toBeNull();
    hb({ t: 'race', a: 'join', room: id });
    expect(last(lb, 'room')!.room).toBeNull();
    await game.stop();
  });

  it('pays a solo race once per race time, and says so when it does not', async () => {
    const { game, a, ha, la } = await twoPlayers();
    const pa = game.world.players[a.id]!;
    pa.coins = 0;
    const solo = { t: 'race', a: 'solo', rules: defaultRules(), place: 1, n: 8, time: 120_000, damage: 0 } as const;
    ha(solo);
    // the number of cars comes from the rules, not the client
    const prize = racePrize(defaultRules(), 1, 4);
    expect(pa.coins).toBe(prize);
    ha(solo);
    expect(pa.coins).toBe(prize);
    expect(toastsTo(la, a.id)).toContain(T.rallyTooSoon);
    vi.advanceTimersByTime(120_000);
    ha(solo);
    expect(pa.coins).toBe(2 * prize);
    await game.stop();
  });

  it('books a solo race the player never finished as not finished', async () => {
    const { game, a, ha, la } = await twoPlayers();
    const pa = game.world.players[a.id]!;
    pa.coins = 0;
    const dnf = { t: 'race', a: 'solo', rules: defaultRules(), place: 4, n: 4, time: 0, damage: 0 } as const;
    ha(dnf);
    expect(pa.coins).toBe(RACE_DNF_PRIZE);
    expect(pa.garage!.best).toEqual({});
    expect(pa.garage!.cars[0]!.races).toBe(1);
    // not again sooner than the shortest race could be driven…
    vi.advanceTimersByTime(30_000);
    ha(dnf);
    expect(pa.coins).toBe(RACE_DNF_PRIZE);
    expect(toastsTo(la, a.id)).toContain(T.rallyTooSoon);
    // …but a real race right after a long one counts
    vi.advanceTimersByTime(minRaceMs(defaultRules()));
    ha(dnf);
    expect(pa.coins).toBe(2 * RACE_DNF_PRIZE);
    vi.advanceTimersByTime(130_000);
    ha({ ...dnf, place: 2, time: 130_000 });
    expect(pa.coins).toBe(2 * RACE_DNF_PRIZE + racePrize(defaultRules(), 2, 4));
    expect(pa.garage!.best['farm:3']).toBe(130_000);
    await game.stop();
  });
});

describe('free roam', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows who is out driving, relays their cars and pays the coins under the daily cap', async () => {
    const { game, a, b, la, lb, ha, hb } = await twoPlayers();
    const pa = game.world.players[a.id]!;
    pa.coins = 0;
    ha({ t: 'roam', a: 'enter' });
    expect(roams(la).at(-1)).toEqual({ t: 'roam', ev: 'peers', peers: [] });
    hb({ t: 'roam', a: 'enter' });
    const peersA = roams(la).at(-1)!;
    expect(peersA.ev === 'peers' && peersA.peers.map((p) => [p.id, p.name])).toEqual([[b.id, 'Bo']]);
    const peersB = roams(lb).at(-1)!;
    expect(peersB.ev === 'peers' && peersB.peers[0]!.car.body).toBe('hatch');
    expect(game.races.roaming().sort()).toEqual([a.id, b.id].sort());

    lb.msgs.length = 0;
    la.msgs.length = 0;
    ha({ t: 'roam', a: 'snap', snap: { ...snap('fake', 5), z: Infinity } });
    const s = roams(lb).at(-1)!;
    expect(s.ev === 'snap' && s.from).toBe(a.id);
    expect(s.ev === 'snap' && s.snap.id).toBe(a.id);
    expect(s.ev === 'snap' && s.snap.z).toBe(0);
    expect(roams(la)).toEqual([]);

    // home again: the coins become kr, Bo sees Astrid go
    ha({ t: 'roam', a: 'leave', coins: 25, damage: 8 });
    expect(pa.coins).toBe(25 * ROAM_COIN_KR);
    expect(pa.garage!.cars[0]!.damage).toBe(8);
    expect(roams(lb).at(-1)).toEqual({ t: 'roam', ev: 'left', id: a.id });
    // a second trip the same day only pays up to the cap; leaving twice pays nothing more
    ha({ t: 'roam', a: 'enter' });
    ha({ t: 'roam', a: 'leave', coins: 40, damage: 0 });
    ha({ t: 'roam', a: 'leave', coins: 40, damage: 0 });
    expect(pa.coins).toBe(ROAM_COINS_PER_DAY * ROAM_COIN_KR);
    // not roaming: snapshots go nowhere
    lb.msgs.length = 0;
    ha({ t: 'roam', a: 'snap', snap: snap(a.id, 1) });
    expect(roams(lb)).toEqual([]);
    // Bo's tablet drops: he is gone from free roam once the grace has run out
    game.disconnect(lb);
    expect(game.races.roaming()).toEqual([b.id]);
    vi.advanceTimersByTime(RACE_GRACE_MS);
    expect(game.races.roaming()).toEqual([]);
    await game.stop();
  });
});
