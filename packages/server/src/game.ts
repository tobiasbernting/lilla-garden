// The running game: world state, connected clients, tick + broadcast loops.
import {
  DAY_LENGTH_MS,
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
  equip,
  getArea,
  isSeason,
  leaveCave,
  mulberry32,
  nameAnimal,
  newDay,
  npcState,
  performAction,
  seasonForDate,
  selectSlot,
  sell,
  setOnline,
  swapSlots,
  tagArea,
  teleport,
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
  type SimCtx,
  type WorldState,
} from '../../shared/src/index.ts';
import type { Store } from './db/store.ts';

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

export class Game {
  world!: WorldState;
  private clients = new Set<Client>();
  private pending: Change[] = [];
  private rnd = mulberry32(Date.now() & 0xffffffff);
  private timers: NodeJS.Timeout[] = [];
  private lastTick = Date.now();
  private flushCounter = 0;
  tickCount = 0;

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
    const npcs: NpcSnap[] = Object.keys(NPCS).map((id) => {
      const st = npcState(this.world, id);
      return { id, x: st.x, y: st.y, facing: st.facing, moving: st.moving };
    });
    this.broadcast({ t: 'state', timeMs: this.world.timeMs, day: this.world.day, season: this.season(), players, animals, npcs, now: Date.now() });
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
        if (p?.area === 'dungeon') this.pending.push(...leaveCave(this.world, c.playerId, false));
        this.pending.push(...setOnline(this.world, c.playerId, false));
        this.dispatchPending();
      }
    }
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
      client.link.send({ t: 'welcome', you: p.id, world: { ...this.world, areas: undefined, dungeon: undefined }, season: this.season(), now: Date.now(), tick: this.tickCount });
      if (p.area !== 'farm' && p.area !== 'dungeon') {
        const area = getArea(this.world, p.area);
        if (area) {
          area.players[p.id] = p;
          client.link.send({ t: 'changes', changes: [{ t: 'areaData', to: p.id, key: p.area, world: area }] });
        } else p.area = 'farm';
      }
      this.pending.push(...setOnline(this.world, p.id, true));
      this.dispatchPending();
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
      case 'drop':
        changes = dropItem(w, pid, msg.slot, msg.qty);
        break;
      case 'nameAnimal':
        changes = nameAnimal(w, pid, msg.id, String(msg.name ?? ''));
        break;
      case 'quest':
        changes = completeQuest(w, pid, String(msg.id ?? ''));
        break;
    }
    if (changes.length) {
      this.pending.push(...changes);
      this.dispatchPending();
    }
  }
}
