// Rallyvärlden on the server: a room from the lobby to the prizes, snapshots relayed, free roam.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROAM_COIN_KR, ROAM_COINS_PER_DAY, ROOM_IDLE_MS, RACE_COUNTDOWN_MS, RACE_DNF_PRIZE, defaultRules, racePrize, type CarSnap, type ClientMsg, type ServerMsg } from '../../shared/src/index.ts';
import { Game, type Link } from './game.ts';
import { MemoryStore } from './db/store.ts';
import { ROOM_DONE_MS } from './races.ts';

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

    // Bo joins and gets ready; only the host may change the rules or start
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
    const go = last(lb, 'go')!.room;
    expect(go.phase).toBe('countdown');
    expect(go.startAt).toBe(Date.now() + RACE_COUNTDOWN_MS);
    expect(last(la, 'go')!.room.seed).toBe(go.seed);
    // a started room is no longer in the lobby list
    expect(last(lb, 'rooms')!.rooms).toEqual([]);

    // snapshots during the countdown are dropped; after the green light they reach the other one only
    la.msgs.length = 0;
    lb.msgs.length = 0;
    ha({ t: 'race', a: 'snap', snaps: [snap(a.id, 1)] });
    expect(races(lb).some((m) => m.ev === 'snap')).toBe(false);
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

    // Bo crosses the line first, then Astrid: the result comes with prizes for both
    vi.advanceTimersByTime(60_000);
    hb({ t: 'race', a: 'finish', time: 125_000, damage: 30 });
    expect(last(la, 'finish')).toMatchObject({ from: b.id, time: 125_000 });
    expect(last(lb, 'finish')).toBeUndefined();
    expect(last(la, 'result')).toBeUndefined();
    ha({ t: 'race', a: 'finish', time: 131_000, damage: 12 });
    const res = last(la, 'result')!;
    expect(last(lb, 'result')!.results).toEqual(res.results);
    expect(res.room).toBe(room.id);
    expect(res.results.map((r) => [r.id, r.place])).toEqual([
      [b.id, 1],
      [a.id, 2],
    ]);
    const cleaned = { ...defaultRules(), laps: 2, ai: 2, damage: true, course: 'beach' as const };
    expect(res.results[0]!.prize).toBe(racePrize(cleaned, 1, 4));
    expect(pb.coins).toBe(racePrize(cleaned, 1, 4));
    expect(pa.coins).toBe(racePrize(cleaned, 2, 4));
    expect(pb.garage!.cars[0]!.damage).toBe(30);
    expect(pb.garage!.cars[0]!.wins).toBe(1);
    expect(game.races.room(room.id)!.phase).toBe('done');
    // the kr reached the clients as player changes, the winner as news for everyone
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'player' && c.id === b.id))).toBe(true);
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'toast' && c.to === null && c.text.includes('Bo')))).toBe(true);

    // closing the result card keeps the dents from after the line
    ha({ t: 'race', a: 'done', damage: 20 });
    expect(pa.garage!.cars[0]!.damage).toBe(20);
    ha({ t: 'race', a: 'done', damage: 90 });
    expect(pa.garage!.cars[0]!.damage).toBe(20);

    // the room closes after a while
    vi.advanceTimersByTime(ROOM_DONE_MS);
    game.tick(50);
    expect(game.races.room(room.id)).toBeUndefined();
    expect(last(la, 'room')!.room).toBeNull();
    expect(game.races.roomIdOf(a.id)).toBeUndefined();
    await game.stop();
  });

  it('hands the room over when the host leaves, books a leaver mid-race as not finished', async () => {
    const { game, a, b, la, lb, ha, hb } = await twoPlayers();
    const pa = game.world.players[a.id]!;
    pa.coins = 0;
    ha({ t: 'race', a: 'create', rules: defaultRules() });
    const id = last(la, 'room')!.room!.id;
    hb({ t: 'race', a: 'join', room: id });
    ha({ t: 'race', a: 'start' });
    vi.advanceTimersByTime(RACE_COUNTDOWN_MS + 1000);
    game.tick(50);
    // Astrid drops out on the way: Bo is the host now and the race goes on
    game.disconnect(la);
    const r = last(lb, 'room')!.room!;
    expect(r.host).toBe(b.id);
    expect(r.members.map((m) => m.id)).toEqual([b.id]);
    vi.advanceTimersByTime(30_000);
    hb({ t: 'race', a: 'finish', time: 200_000, damage: 0 });
    const res = last(lb, 'result')!.results;
    expect(res.map((x) => [x.id, x.place, x.time])).toEqual([
      [b.id, 1, 200_000],
      [a.id, 2, null],
    ]);
    expect(pa.coins).toBe(RACE_DNF_PRIZE);
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

  it('pays a solo race once per race time', async () => {
    const { game, a, ha } = await twoPlayers();
    const pa = game.world.players[a.id]!;
    pa.coins = 0;
    const solo = { t: 'race', a: 'solo', rules: defaultRules(), place: 1, n: 4, time: 120_000, damage: 0 } as const;
    ha(solo);
    const prize = racePrize(defaultRules(), 1, 4);
    expect(pa.coins).toBe(prize);
    ha(solo);
    expect(pa.coins).toBe(prize);
    vi.advanceTimersByTime(120_000);
    ha(solo);
    expect(pa.coins).toBe(2 * prize);
    await game.stop();
  });
});

describe('free roam', () => {
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
    // Bo's tablet drops: he is gone from free roam
    game.disconnect(lb);
    expect(game.races.roaming()).toEqual([]);
    await game.stop();
  });
});
