// Rallyvärlden on the server: the lobby's rooms, the start, relaying car snapshots between racers,
// collecting finish times and paying the prizes (with the shared formulas), and free roam.
// Nothing here is saved: rooms live as long as the server runs.
import {
  MAX_RACERS,
  RACE_COUNTDOWN_MS,
  RACE_FINISH_GRACE_MS,
  ROOM_IDLE_MS,
  T,
  activeCar,
  cleanRules,
  raceOnlineResult,
  raceSolo,
  roamDone,
  saveCarDamage,
  toast,
  RACE_MAX_MS,
  RACE_MIN_MS,
  type CarSnap,
  type Change,
  type ClientMsg,
  type GarageCar,
  type RaceLineIn,
  type RaceRules,
  type RoomInfo,
  type RoomMember,
  type ServerMsg,
  type SimCtx,
  type WorldState,
} from '../../shared/src/index.ts';

/** What the races need from the game. */
export interface RaceHost {
  world(): WorldState;
  ctx(): SimCtx;
  /** Sends a message to one player (every connection of theirs). */
  send(playerId: string, msg: ServerMsg): void;
  /** Applies and dispatches sim changes (toasts, player updates). */
  apply(changes: Change[]): void;
}

/** Most snapshots in one message, and per player per second. */
export const MAX_SNAPS_PER_MSG = 9;
export const MAX_SNAP_MSGS_PER_SEC = 20;
/** How long the lobby list keeps being pushed to someone who asked for it (ms). */
export const ROOMS_WATCH_MS = 2 * 60_000;
/** A finished room stays this long so the result card can be read, then closes (ms). */
export const ROOM_DONE_MS = 30_000;
/** A race nobody finishes ends anyway this long after the start (ms). */
const RACE_TIMEOUT_MS = RACE_MAX_MS + RACE_COUNTDOWN_MS + 30_000;

interface Room extends RoomInfo {
  touched: number;
  firstFinish?: number;
  doneAt?: number;
  /** Reported damage per racer at the finish. */
  damage: Map<string, number>;
  /** Racers who left mid-race: they still get the prize for taking part. */
  gone: RaceLineIn[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A client's snapshot rebuilt key by key (finite numbers, known keys only), or null when it is junk. */
export function cleanSnap(s: unknown, id: string): CarSnap | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const big = 1e6;
  return {
    id,
    x: clamp(fin(o.x), -big, big),
    y: clamp(fin(o.y), -big, big),
    z: clamp(fin(o.z), -big, big),
    h: clamp(fin(o.h), -big, big),
    vx: clamp(fin(o.vx), -1000, 1000),
    vz: clamp(fin(o.vz), -1000, 1000),
    st: clamp(fin(o.st), -1, 1),
    th: clamp(fin(o.th), 0, 1),
    br: clamp(fin(o.br), 0, 1),
    hb: o.hb === true,
    ni: o.ni === true,
    dm: clamp(fin(o.dm), 0, 100),
    lap: clamp(Math.round(fin(o.lap)), 0, 99),
    t: clamp(fin(o.t), 0, 24 * 3600_000),
  };
}

const copyCar = (c: GarageCar): GarageCar => structuredClone(c);

export class Races {
  private rooms = new Map<string, Room>();
  private roomOf = new Map<string, string>();
  /** Who asked for the lobby list, and when. */
  private watching = new Map<string, number>();
  /** Who is out in free roam, with the car they drive. */
  private roamers = new Map<string, { name: string; car: GarageCar }>();
  /** Snapshot rate limit: messages this second. */
  private rate = new Map<string, { sec: number; n: number }>();
  /** Last online race per player, for the damage saved when the result card closes. */
  private lastRace = new Map<string, { damage: boolean; car: number }>();
  /** When each player's last race was booked: a race cannot end sooner after the last one than it lasted. */
  private lastBooked = new Map<string, number>();

  constructor(private host: RaceHost) {}

  // ---- queries (tests, admin) ----

  room(id: string): RoomInfo | undefined {
    const r = this.rooms.get(id);
    return r ? this.info(r) : undefined;
  }

  roomIdOf(playerId: string): string | undefined {
    return this.roomOf.get(playerId);
  }

  roaming(): string[] {
    return [...this.roamers.keys()];
  }

  // ---- messages ----

  race(pid: string, msg: Extract<ClientMsg, { t: 'race' }>): void {
    const now = Date.now();
    switch (msg.a) {
      case 'rooms':
        this.watching.set(pid, now);
        this.host.send(pid, { t: 'race', ev: 'rooms', rooms: this.lobbyList() });
        return;
      case 'create':
        this.create(pid, msg.rules, now);
        return;
      case 'join':
        this.join(pid, String(msg.room ?? ''), now);
        return;
      case 'leave':
        this.leave(pid, now);
        return;
      case 'ready':
        this.ready(pid, msg.ready === true, now);
        return;
      case 'rules':
        this.setRules(pid, msg.rules, now);
        return;
      case 'start':
        this.start(pid, now);
        return;
      case 'snap':
        this.snap(pid, msg.snaps, now);
        return;
      case 'finish':
        this.finish(pid, msg.time, msg.damage, now);
        return;
      case 'done':
        this.done(pid, msg.damage);
        return;
    }
  }

  /** A race alone against the computer ended (prizes from the shared formula, at most one race per race time). */
  solo(pid: string, msg: Extract<ClientMsg, { t: 'race'; a: 'solo' }>): void {
    const now = Date.now();
    const t = clamp(Math.round(fin(msg.time) || RACE_MAX_MS), RACE_MIN_MS, RACE_MAX_MS);
    const last = this.lastBooked.get(pid);
    if (last !== undefined && now - last < t - 2000) return;
    this.lastBooked.set(pid, now);
    this.host.apply(raceSolo(this.host.world(), pid, msg.rules, msg.place, msg.n, t, msg.damage, this.host.ctx()));
  }

  roam(pid: string, msg: Extract<ClientMsg, { t: 'roam' }>): void {
    const p = this.host.world().players[pid];
    if (!p) return;
    switch (msg.a) {
      case 'enter': {
        this.roamers.set(pid, { name: p.name, car: copyCar(activeCar(p)) });
        this.pushPeers();
        return;
      }
      case 'snap': {
        if (!this.roamers.has(pid) || !this.allowSnap(pid, Date.now())) return;
        const snap = cleanSnap(msg.snap, pid);
        if (!snap) return;
        for (const id of this.roamers.keys()) if (id !== pid) this.host.send(id, { t: 'roam', ev: 'snap', from: pid, snap });
        return;
      }
      case 'leave': {
        if (!this.roamers.has(pid)) return;
        this.roamers.delete(pid);
        this.host.apply(roamDone(this.host.world(), pid, msg.coins, msg.damage, this.host.ctx()));
        for (const id of this.roamers.keys()) this.host.send(id, { t: 'roam', ev: 'left', id: pid });
        return;
      }
    }
  }

  /** The player's last connection went away: out of the room, home from free roam (no coins). */
  drop(pid: string): void {
    this.watching.delete(pid);
    this.rate.delete(pid);
    this.lastRace.delete(pid);
    this.leave(pid, Date.now());
    if (this.roamers.delete(pid)) for (const id of this.roamers.keys()) this.host.send(id, { t: 'roam', ev: 'left', id: pid });
  }

  /** Called from the game loop: lights go green, slow racers run out of time, old rooms close. */
  tick(now = Date.now()): void {
    for (const r of [...this.rooms.values()]) {
      if (r.phase === 'countdown' && r.startAt !== undefined && now >= r.startAt) r.phase = 'racing';
      if (r.phase === 'racing') {
        const late = (r.firstFinish !== undefined && now - r.firstFinish >= RACE_FINISH_GRACE_MS) || (r.startAt !== undefined && now - r.startAt >= RACE_TIMEOUT_MS);
        if (late) this.endRace(r, now);
      }
      if (r.phase === 'done' && r.doneAt !== undefined && now - r.doneAt >= ROOM_DONE_MS) this.close(r);
      else if (now - r.touched >= ROOM_IDLE_MS) this.close(r);
    }
    for (const [pid, at] of this.watching) if (now - at > ROOMS_WATCH_MS) this.watching.delete(pid);
  }

  // ---- the lobby ----

  private member(pid: string): RoomMember | null {
    const p = this.host.world().players[pid];
    if (!p) return null;
    return { id: pid, name: p.name, car: copyCar(activeCar(p)), ready: false };
  }

  private newId(): string {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (;;) {
      let id = '';
      for (let i = 0; i < 6; i++) id += abc[Math.floor(Math.random() * abc.length)];
      if (!this.rooms.has(id)) return id;
    }
  }

  private create(pid: string, rules: RaceRules, now: number): void {
    const m = this.member(pid);
    if (!m) return;
    this.leave(pid, now, false);
    const r: Room = { id: this.newId(), host: pid, hostName: m.name, rules: cleanRules(rules), phase: 'lobby', members: [m], seed: 0, touched: now, damage: new Map(), gone: [] };
    this.rooms.set(r.id, r);
    this.roomOf.set(pid, r.id);
    this.pushRoom(r);
    this.pushLobby();
  }

  private join(pid: string, id: string, now: number): void {
    const r = this.rooms.get(id);
    if (r && this.roomOf.get(pid) === id) {
      this.host.send(pid, { t: 'race', ev: 'room', room: this.info(r) });
      return;
    }
    if (!r) {
      this.host.send(pid, { t: 'race', ev: 'room', room: null });
      this.host.apply([toast(pid, T.rallyRoomGone)]);
      return;
    }
    if (r.phase !== 'lobby' || r.members.length >= MAX_RACERS) {
      this.host.apply([toast(pid, T.rallyRoomFull)]);
      return;
    }
    const m = this.member(pid);
    if (!m) return;
    this.leave(pid, now, false);
    r.members.push(m);
    r.touched = now;
    this.roomOf.set(pid, r.id);
    this.pushRoom(r);
    this.pushLobby();
  }

  /** Out of the room (a mid-race leaver still gets the small prize when the race ends). */
  private leave(pid: string, now: number, tell = true): void {
    const id = this.roomOf.get(pid);
    if (!id) return;
    this.roomOf.delete(pid);
    const r = this.rooms.get(id);
    if (tell) this.host.send(pid, { t: 'race', ev: 'room', room: null });
    if (!r) return;
    const m = r.members.find((x) => x.id === pid);
    r.members = r.members.filter((x) => x.id !== pid);
    r.touched = now;
    // a finisher who leaves keeps the time; one who leaves on the way is booked as not finished
    if (m && (r.phase === 'countdown' || r.phase === 'racing')) r.gone.push({ id: pid, time: m.finish ?? null, damage: r.damage.get(pid) ?? m.car.damage, car: m.car.id });
    if (r.members.length === 0) {
      // nobody left to wait for: settle the race for the ones who took part, then close
      if (r.phase === 'countdown' || r.phase === 'racing') this.endRace(r, now);
      this.rooms.delete(r.id);
      this.pushLobby();
      return;
    }
    if (r.host === pid) {
      r.host = r.members[0]!.id;
      r.hostName = r.members[0]!.name;
    }
    this.pushRoom(r);
    if (r.phase === 'racing' || r.phase === 'countdown') this.maybeEnd(r, now);
    this.pushLobby();
  }

  private ready(pid: string, ready: boolean, now: number): void {
    const r = this.roomFor(pid);
    if (!r || r.phase !== 'lobby') return;
    const m = r.members.find((x) => x.id === pid)!;
    m.ready = ready;
    // the car may have changed in the garage meanwhile
    const fresh = this.member(pid);
    if (fresh) m.car = fresh.car;
    r.touched = now;
    this.pushRoom(r);
  }

  private setRules(pid: string, rules: RaceRules, now: number): void {
    const r = this.roomFor(pid);
    if (!r || r.host !== pid || r.phase !== 'lobby') return;
    r.rules = cleanRules(rules);
    r.touched = now;
    this.pushRoom(r);
    this.pushLobby();
  }

  private start(pid: string, now: number): void {
    const r = this.roomFor(pid);
    if (!r || r.host !== pid || r.phase !== 'lobby' || r.members.length < 1) return;
    for (const m of r.members) {
      const fresh = this.member(m.id);
      if (fresh) m.car = fresh.car;
      delete m.finish;
    }
    r.phase = 'countdown';
    r.startAt = now + RACE_COUNTDOWN_MS;
    r.seed = Math.floor(Math.random() * 0x7fffffff);
    r.touched = now;
    r.damage.clear();
    r.gone = [];
    delete r.firstFinish;
    const info = this.info(r);
    for (const m of r.members) this.host.send(m.id, { t: 'race', ev: 'go', room: info });
    this.pushLobby();
  }

  // ---- the race ----

  private allowSnap(pid: string, now: number): boolean {
    const sec = Math.floor(now / 1000);
    const r = this.rate.get(pid);
    if (!r || r.sec !== sec) {
      this.rate.set(pid, { sec, n: 1 });
      return true;
    }
    r.n++;
    return r.n <= MAX_SNAP_MSGS_PER_SEC;
  }

  private snap(pid: string, snaps: unknown, now: number): void {
    const r = this.roomFor(pid);
    if (!r || !Array.isArray(snaps)) return;
    if (r.phase === 'countdown' && r.startAt !== undefined && now >= r.startAt - 500) r.phase = 'racing';
    if (r.phase !== 'racing' || !this.allowSnap(pid, now)) return;
    const isHost = r.host === pid;
    const clean: CarSnap[] = [];
    for (const s of snaps.slice(0, MAX_SNAPS_PER_MSG)) {
      const raw = s && typeof s === 'object' ? (s as { id?: unknown }).id : undefined;
      // the host also drives the computer cars
      const id = isHost && typeof raw === 'string' && /^ai:\d{1,2}$/.test(raw) ? raw : pid;
      const c = cleanSnap(s, id);
      if (c) clean.push(c);
    }
    if (!clean.length) return;
    r.touched = now;
    for (const m of r.members) if (m.id !== pid) this.host.send(m.id, { t: 'race', ev: 'snap', from: pid, snaps: clean });
  }

  private finish(pid: string, time: unknown, damage: unknown, now: number): void {
    const r = this.roomFor(pid);
    if (!r) return;
    if (r.phase === 'countdown' && r.startAt !== undefined && now >= r.startAt - 500) r.phase = 'racing';
    if (r.phase !== 'racing') return;
    const m = r.members.find((x) => x.id === pid);
    if (!m || m.finish !== undefined) return;
    const t = clamp(Math.round(fin(time) || RACE_MAX_MS), RACE_MIN_MS, RACE_MAX_MS);
    m.finish = t;
    r.damage.set(pid, clamp(Math.round(fin(damage)), 0, 100));
    r.touched = now;
    if (r.firstFinish === undefined) r.firstFinish = now;
    for (const o of r.members) if (o.id !== pid) this.host.send(o.id, { t: 'race', ev: 'finish', from: pid, time: t });
    this.maybeEnd(r, now);
  }

  private maybeEnd(r: Room, now: number): void {
    if (r.phase !== 'racing' && r.phase !== 'countdown') return;
    if (r.members.every((m) => m.finish !== undefined)) this.endRace(r, now);
  }

  /** Everyone is in (or out of time): pay the prizes and show the result. */
  private endRace(r: Room, now: number): void {
    if (r.phase === 'done' || r.phase === 'lobby') return;
    const lines: RaceLineIn[] = r.members.map((m) => ({ id: m.id, time: m.finish ?? null, damage: r.damage.get(m.id) ?? m.car.damage, car: m.car.id }));
    for (const g of r.gone) if (!lines.some((l) => l.id === g.id)) lines.push(g);
    const { changes, results } = raceOnlineResult(this.host.world(), r.rules, lines, this.host.ctx());
    r.phase = 'done';
    r.doneAt = now;
    r.touched = now;
    for (const l of lines) {
      this.lastRace.set(l.id, { damage: r.rules.damage, car: l.car ?? -1 });
      this.lastBooked.set(l.id, now);
    }
    for (const m of r.members) this.host.send(m.id, { t: 'race', ev: 'result', room: r.id, results });
    this.host.apply(changes);
  }

  /** The result card was closed: keep the dents the car got after the finish line too. */
  private done(pid: string, damage: unknown): void {
    const last = this.lastRace.get(pid);
    if (!last) return;
    this.lastRace.delete(pid);
    if (!last.damage) return;
    this.host.apply(saveCarDamage(this.host.world(), pid, damage, last.car));
  }

  private close(r: Room): void {
    this.rooms.delete(r.id);
    for (const m of r.members) {
      if (this.roomOf.get(m.id) === r.id) this.roomOf.delete(m.id);
      this.host.send(m.id, { t: 'race', ev: 'room', room: null });
    }
    this.pushLobby();
  }

  // ---- sending ----

  private roomFor(pid: string): Room | undefined {
    const id = this.roomOf.get(pid);
    return id ? this.rooms.get(id) : undefined;
  }

  /** The public part of a room. */
  private info(r: Room): RoomInfo {
    const out: RoomInfo = {
      id: r.id,
      host: r.host,
      hostName: r.hostName,
      rules: { ...r.rules },
      phase: r.phase,
      members: r.members.map((m) => ({ ...m })),
      seed: r.seed,
    };
    if (r.startAt !== undefined) out.startAt = r.startAt;
    return out;
  }

  private lobbyList(): RoomInfo[] {
    return [...this.rooms.values()].filter((r) => r.phase === 'lobby').map((r) => this.info(r));
  }

  private pushRoom(r: Room): void {
    const room = this.info(r);
    for (const m of r.members) this.host.send(m.id, { t: 'race', ev: 'room', room });
  }

  /** The lobby list changed: tell everyone who is looking at it. */
  private pushLobby(): void {
    if (!this.watching.size) return;
    const now = Date.now();
    const rooms = this.lobbyList();
    for (const [pid, at] of this.watching) {
      if (now - at > ROOMS_WATCH_MS) this.watching.delete(pid);
      else this.host.send(pid, { t: 'race', ev: 'rooms', rooms });
    }
  }

  private pushPeers(): void {
    for (const id of this.roamers.keys()) {
      const peers = [...this.roamers].filter(([pid]) => pid !== id).map(([pid, v]) => ({ id: pid, name: v.name, car: v.car }));
      this.host.send(id, { t: 'roam', ev: 'peers', peers });
    }
  }
}
