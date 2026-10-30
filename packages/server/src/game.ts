// The running game: world state, connected clients, tick + broadcast loops.
import {
  CHAT_COOLDOWN_MS,
  CHAT_HISTORY,
  DAY_LENGTH_MS,
  callPets,
  castSpell,
  chooseClass,
  drinkPotion,
  isSagaKey,
  jumpTo,
  rejoinSaga,
  sagaChapter,
  sagaQuestAct,
  sagaSnapshot,
  cleanChat,
  setWeather,
  MAX_PLAYERS,
  NPCS,
  TICK_HZ,
  applyMove,
  areaOf,
  buy,
  completeQuest,
  cook,
  craft,
  createPlayer,
  dropItem,
  emote,
  honk,
  equip,
  getArea,
  isSeason,
  leaveCave,
  mulberry32,
  nameAnimal,
  paint,
  newDay,
  npcState,
  performAction,
  arcadeScore,
  buyPrize,
  garageAction,
  seasonForDate,
  selectSlot,
  sell,
  setOnline,
  swapSlots,
  tagArea,
  teleport,
  ride,
  tick,
  travel,
  type AnimalSnap,
  type NpcSnap,
  type Appearance,
  type Change,
  type ClientMsg,
  type PlayerSnap,
  type PlayerSummary,
  type Season,
  type ServerMsg,
  type WeatherKind,
  type SimCtx,
  type WorldState,
} from '../../shared/src/index.ts';
import type { Store } from './db/store.ts';
import { Races } from './races.ts';

export interface Link {
  send(msg: ServerMsg): void;
  close(): void;
}

interface Client {
  link: Link;
  playerId: string | null;
}

export interface GameOptions {
  seasonOverride?: string | undefined;
  /** Replace timers (tests). */
  autoStart?: boolean;
}

/** How long an offline player may stay in the cave before being carried out. */
const DUNGEON_GRACE_MS = 90_000;
/** How long an offline player keeps their place in a race room or out in free roam (a Wi-Fi blip). */
export const RACE_GRACE_MS = 10_000;

export class Game {
  world!: WorldState;
  private clients = new Set<Client>();
  private pending: Change[] = [];
  private rnd = mulberry32(Date.now() & 0xffffffff);
  private timers: NodeJS.Timeout[] = [];
  /** Players gone offline, taken out of the races when the grace runs out unless they come back. */
  private raceDrops = new Map<string, NodeJS.Timeout>();
  private lastTick = Date.now();
  private flushCounter = 0;
  /** Recent chat lines for players who come online (not saved). */
  private chatLog: Extract<Change, { t: 'chat' }>[] = [];
  private lastChat = new Map<string, number>();
  tickCount = 0;
  /** Rallyvärlden: the lobby's rooms and the drivers out in free roam. */
  readonly races = new Races({
    world: () => this.world,
    ctx: () => this.ctx(),
    send: (id, msg) => this.sendTo(id, msg),
    apply: (changes) => {
      if (!changes.length) return;
      this.pending.push(...changes);
      this.dispatchPending();
    },
  });

  constructor(
    private store: Store,
    private opts: GameOptions = {},
  ) {}

  async start(): Promise<void> {
    this.world = await this.store.load();
    for (const p of Object.values(this.world.players)) p.online = false;
    if (this.opts.autoStart !== false) {
      this.lastTick = Date.now();
      this.timers.push(setInterval(() => this.tick(), 1000 / TICK_HZ));
      this.timers.push(setInterval(() => this.broadcastState(), 100));
      this.timers.push(setInterval(() => void this.flush(), 1000));
    }
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const t of this.raceDrops.values()) clearTimeout(t);
    this.raceDrops.clear();
    for (const c of this.clients) c.link.close();
    this.store.markAllDirty(this.world);
    await this.store.flush(this.world);
    await this.store.close();
  }

  season(): Season {
    if (this.world.seasonOverride) return this.world.seasonOverride;
    const env = this.opts.seasonOverride;
    if (env && isSeason(env)) return env;
    return seasonForDate(new Date());
  }

  ctx(): SimCtx {
    return { season: this.season(), rnd: this.rnd, now: Date.now() };
  }

  // ---- loops ----

  tick(dtOverride?: number): void {
    const now = Date.now();
    const dt = dtOverride ?? Math.min(250, now - this.lastTick);
    this.lastTick = now;
    this.tickCount++;
    const changes = tick(this.world, dt, this.ctx());
    if (changes.length) this.pending.push(...changes);
    this.races.tick(now);
    this.dispatchPending();
    if (++this.flushCounter % (TICK_HZ * 15) === 0 && 'markMoving' in this.store) {
      (this.store as unknown as { markMoving(w: WorldState): void }).markMoving(this.world);
    }
  }

  broadcastState(): void {
    if (this.clients.size === 0) return;
    const players: PlayerSnap[] = [];
    for (const p of Object.values(this.world.players)) {
      if (!p.online) continue;
      const snap: PlayerSnap = { id: p.id, x: p.x, y: p.y, facing: p.facing, moving: p.moving, held: p.inventory[p.selected]?.item ?? null };
      if (p.emote) snap.emote = p.emote;
      if (p.area !== 'farm') snap.area = p.area;
      players.push(snap);
    }
    const animals: AnimalSnap[] = Object.values(this.world.animals).map((a) => ({ id: a.id, x: a.x, y: a.y, facing: a.facing, moving: a.moving }));
    if (this.world.dungeon) for (const a of Object.values(this.world.dungeon.animals)) animals.push({ id: a.id, x: a.x, y: a.y, facing: a.facing, moving: a.moving, area: 'dungeon' });
    for (const [k, area] of Object.entries(this.world.areas ?? {})) {
      if (!Object.values(area.players).some((p) => p.online)) continue;
      for (const a of Object.values(area.animals)) animals.push({ id: a.id, x: a.x, y: a.y, facing: a.facing, moving: a.moving, area: k });
    }
    const npcs: NpcSnap[] = [];
    for (const n of Object.values(NPCS)) {
      const k = n.area ?? 'farm';
      const w = k === 'farm' ? this.world : this.world.areas?.[k];
      if (!w) continue;
      if (k !== 'farm' && !Object.values(w.players).some((p) => p.online)) continue;
      const st = npcState(w, n.id);
      npcs.push({ id: n.id, x: st.x, y: st.y, facing: st.facing, moving: st.moving, ...(k !== 'farm' ? { area: k } : {}) });
    }
    const msg: ServerMsg = { t: 'state', timeMs: this.world.timeMs, day: this.world.day, season: this.season(), players, animals, npcs, now: Date.now() };
    if (this.world.weather) msg.weather = this.world.weather;
    const saga = sagaSnapshot(this.world, Date.now());
    if (saga) msg.saga = saga;
    this.broadcast(msg);
  }

  async flush(): Promise<void> {
    try {
      await this.store.flush(this.world);
    } catch (e) {
      console.error('flush failed', e);
    }
  }

  /** Sends queued changes; private ones only to their recipient. */
  private dispatchPending(): void {
    if (this.pending.length === 0) return;
    const changes = this.pending;
    this.pending = [];
    this.store.noteChanges(changes);
    const everyone = changes.filter((c) => !('to' in c) || c.to === null);
    if (everyone.length) this.broadcast({ t: 'changes', changes: everyone });
    const byPlayer = new Map<string, Change[]>();
    for (const c of changes) {
      if ('to' in c && c.to) {
        const list = byPlayer.get(c.to) ?? [];
        list.push(c);
        byPlayer.set(c.to, list);
      }
    }
    for (const [pid, list] of byPlayer) this.sendTo(pid, { t: 'changes', changes: list });
  }

  private broadcast(msg: ServerMsg): void {
    for (const c of this.clients) if (c.playerId) c.link.send(msg);
  }

  private sendTo(playerId: string, msg: ServerMsg): void {
    for (const c of this.clients) if (c.playerId === playerId) c.link.send(msg);
  }

  // ---- players (HTTP) ----

  playerSummaries(): PlayerSummary[] {
    return Object.values(this.world.players).map((p) => ({ id: p.id, name: p.name, appearance: p.appearance, outfit: p.outfit }));
  }

  createPlayer(name: string, appearance: Appearance, shirt?: string): PlayerSummary | null {
    if (Object.keys(this.world.players).length >= MAX_PLAYERS) return null;
    const p = createPlayer(this.world, name, appearance, shirt);
    this.pending.push({ t: 'player', id: p.id, player: p });
    this.dispatchPending();
    return { id: p.id, name: p.name, appearance: p.appearance, outfit: p.outfit };
  }

  onlinePlayers(): string[] {
    return Object.values(this.world.players)
      .filter((p) => p.online)
      .map((p) => p.name);
  }

  // ---- admin ----

  setSeasonOverride(season: Season | null): void {
    this.world.seasonOverride = season;
    this.pending.push({ t: 'day', day: this.world.day });
    this.dispatchPending();
    this.broadcastState();
  }

  /** Admin: jump to a time of day (fraction 0..1). */
  setTimeOfDay(fraction: number): void {
    this.world.timeMs = Math.max(0, Math.min(0.99, fraction)) * DAY_LENGTH_MS;
    this.broadcastState();
  }

  /** Admin: change the weather now (it lasts its usual time, then the random pattern goes on). */
  setWeather(kind: WeatherKind): void {
    this.pending.push(...setWeather(this.world, kind, this.ctx(), true));
    this.dispatchPending();
    this.broadcastState();
  }

  skipDay(): void {
    const changes = newDay(this.world, this.ctx());
    this.pending.push(...changes);
    this.dispatchPending();
  }

  // ---- connections ----

  connect(link: Link): (msg: ClientMsg) => void {
    const client: Client = { link, playerId: null };
    this.clients.add(client);
    return (msg) => this.handle(client, msg);
  }

  disconnect(link: Link): void {
    for (const c of this.clients) {
      if (c.link !== link) continue;
      this.clients.delete(c);
      if (c.playerId && ![...this.clients].some((o) => o.playerId === c.playerId)) {
        const p = this.world.players[c.playerId];
        this.dropFromRacesLater(c.playerId);
        this.pending.push(...setOnline(this.world, c.playerId, false));
        this.dispatchPending();
        // A flaky tablet connection must not throw you out of the cave: wait a while before carrying you out
        if (p?.area === 'dungeon') {
          const id = c.playerId;
          setTimeout(() => {
            const q = this.world.players[id];
            if (!q || q.online || q.area !== 'dungeon') return;
            this.pending.push(...leaveCave(this.world, id, false));
            this.dispatchPending();
          }, DUNGEON_GRACE_MS);
        }
      }
    }
  }

  /** Out of the race room and free roam, unless the player is back within RACE_GRACE_MS. */
  private dropFromRacesLater(id: string): void {
    clearTimeout(this.raceDrops.get(id));
    this.raceDrops.set(
      id,
      setTimeout(() => {
        this.raceDrops.delete(id);
        if (this.world.players[id]?.online) return;
        this.races.drop(id);
      }, RACE_GRACE_MS),
    );
  }

  private handle(client: Client, msg: ClientMsg): void {
    if (msg.t === 'ping') {
      client.link.send({ t: 'pong' });
      return;
    }
    if (msg.t === 'hello') {
      const p = this.world.players[msg.playerId];
      if (!p) {
        client.link.send({ t: 'error', text: 'unknown player' });
        return;
      }
      // One device per character: kick the old connection
      for (const other of this.clients) {
        if (other !== client && other.playerId === msg.playerId) {
          other.playerId = null;
          other.link.close();
          this.clients.delete(other);
        }
      }
      client.playerId = msg.playerId;
      // back in time: still in the race room or out driving
      clearTimeout(this.raceDrops.get(msg.playerId));
      this.raceDrops.delete(msg.playerId);
      const biomes: Record<string, string> = {};
      for (const [k, a] of Object.entries(this.world.areas ?? {})) if (k.startsWith('a:') && a.biome) biomes[k] = a.biome;
      client.link.send({ t: 'welcome', you: p.id, world: { ...this.world, areas: undefined, dungeon: undefined }, season: this.season(), now: Date.now(), tick: this.tickCount, biomes });
      if (p.area === 'dungeon') {
        // back in the cave after a dropped connection (the cave may have been cleared meanwhile)
        const d = this.world.dungeon;
        if (d) {
          d.players[p.id] = p;
          client.link.send({ t: 'changes', changes: [{ t: 'areaData', to: p.id, key: 'dungeon', world: d }] });
        } else this.pending.push(...leaveCave(this.world, p.id, false));
      } else if (isSagaKey(p.area)) {
        // back in a dungeon: up at its last rest stone (it may have started over meanwhile)
        this.pending.push(...rejoinSaga(this.world, p.id));
      } else if (p.area !== 'farm') {
        const area = getArea(this.world, p.area);
        if (area) {
          area.players[p.id] = p;
          client.link.send({ t: 'changes', changes: [{ t: 'areaData', to: p.id, key: p.area, world: area }] });
        } else p.area = 'farm';
      }
      this.pending.push(...setOnline(this.world, p.id, true));
      this.dispatchPending();
      if (this.chatLog.length) client.link.send({ t: 'changes', changes: this.chatLog.map((c) => ({ ...c, old: true })) });
      return;
    }
    const pid = client.playerId;
    if (!pid) return;
    const me = this.world.players[pid];
    if (!me) return;
    const w = areaOf(this.world, me);
    const areaK = me.area;
    let changes: Change[] = [];
    switch (msg.t) {
      case 'move':
        applyMove(w, pid, msg.x, msg.y, msg.facing, msg.moving);
        return;
      case 'act':
        changes = tagArea(performAction(w, pid, Math.floor(msg.tx), Math.floor(msg.ty), this.ctx()), areaK);
        break;
      case 'travel':
        changes = travel(this.world, pid, msg.dir);
        if (changes.length) this.store.noteArea?.(me.area);
        break;
      case 'teleport':
        changes = teleport(this.world, pid, String(msg.to ?? ''));
        break;
      case 'ride':
        changes = ride(this.world, pid, msg.via, String(msg.to ?? ''), this.ctx());
        break;
      case 'select':
        changes = selectSlot(w, pid, msg.slot);
        break;
      case 'swap':
        changes = swapSlots(w, pid, msg.a, msg.b);
        break;
      case 'craft':
        changes = craft(w, pid, msg.recipe);
        break;
      case 'cook':
        changes = cook(w, pid, msg.recipe);
        break;
      case 'buy':
        changes = buy(w, pid, msg.item, msg.qty, this.ctx());
        break;
      case 'sell':
        changes = sell(w, pid, msg.slot, msg.qty);
        break;
      case 'equip':
        changes = equip(w, pid, msg.slot, msg.item);
        break;
      case 'emote':
        changes = emote(w, pid, msg.id, this.ctx());
        break;
      case 'honk':
        changes = tagArea(honk(w, pid), areaK);
        break;
      case 'drop':
        changes = dropItem(w, pid, msg.slot, msg.qty);
        break;
      case 'nameAnimal':
        changes = tagArea(nameAnimal(w, pid, msg.id, String(msg.name ?? '')), areaK);
        break;
      case 'paint':
        changes = paint(w, pid, String(msg.pixels ?? ''));
        break;
      case 'arcade':
        changes = arcadeScore(this.world, pid, String(msg.game ?? ''), Number(msg.score), this.ctx());
        break;
      case 'prize':
        changes = buyPrize(this.world, pid, String(msg.item ?? ''));
        break;
      case 'quest':
        changes = completeQuest(w, pid, String(msg.id ?? ''));
        break;
      case 'pets':
        changes = callPets(this.world, pid, msg.cmd, this.ctx());
        break;
      case 'cast':
        changes = castSpell(this.world, pid, String(msg.spell ?? ''), typeof msg.target === 'number' || typeof msg.target === 'string' ? msg.target : undefined, this.ctx());
        break;
      case 'potion':
        changes = drinkPotion(this.world, pid, this.ctx());
        break;
      case 'saga':
        if (msg.a === 'class') changes = chooseClass(this.world, pid, String(msg.cls ?? ''));
        else if (msg.a === 'chapter') changes = sagaChapter(this.world, pid);
        else if (msg.a === 'quest') changes = sagaQuestAct(this.world, pid, String(msg.id ?? ''));
        break;
      case 'jump':
        changes = jumpTo(this.world, pid, String(msg.to ?? ''));
        break;
      case 'garage':
        changes = garageAction(this.world, pid, msg, this.ctx());
        break;
      case 'race':
        if (msg.a === 'solo') this.races.solo(pid, msg);
        else this.races.race(pid, msg);
        break;
      case 'roam':
        this.races.roam(pid, msg);
        break;
      case 'chat': {
        const text = cleanChat(msg.text);
        const now = Date.now();
        if (!text || now - (this.lastChat.get(pid) ?? 0) < CHAT_COOLDOWN_MS) return;
        this.lastChat.set(pid, now);
        const line: Extract<Change, { t: 'chat' }> = { t: 'chat', from: pid, name: me.name, text, at: now };
        this.chatLog.push(line);
        if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
        changes = [line];
        break;
      }
    }
    if (changes.length) {
      this.pending.push(...changes);
      this.dispatchPending();
    }
  }
}
