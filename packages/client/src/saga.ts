// Sagan om Världsträdet on the client: the dungeon you are in, everyone's health and state from the server's
// snapshots, the monster or friend you aim at, your spells' cooldowns (they start when the server says a spell
// went off, like the short pause after every spell) and the markers over the villagers' heads.
import {
  CLASSES,
  GCD_MS,
  POTION_CD,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_MOBS,
  SAGA_QUESTS,
  SLOW_MUL,
  SPELLS,
  T,
  TILE,
  VOLVA_ID,
  chapterDone,
  countItem,
  isSagaKey,
  questState,
  readProgress,
  type AnimalState,
  type ClassDef,
  type PlayerState,
  type SagaSnap,
} from '@lilla-garden/shared';
import { net } from './net.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from './state.ts';

/** The fighter flags in a snapshot. */
export const FLAG = { down: 1, wall: 2, rage: 4, hot: 8, slow: 16, frozen: 32 } as const;

export const inSaga = (): boolean => isSagaKey(myPlayer()?.area);

/** The snapshot of the dungeon you are in (null outside, or before the first one). */
export function sagaSnap(): SagaSnap | null {
  const me = myPlayer();
  return me && isSagaKey(me.area) ? (client.saga[me.area] ?? null) : null;
}

/** A player's health, max and flags in the dungeon you are in. */
export const fighterOf = (id: string): [number, number, number] | null => sagaSnap()?.f[id] ?? null;
export const flagsOf = (id: string): number => fighterOf(id)?.[2] ?? 0;

export const classOf = (p: PlayerState | undefined): ClassDef | null => {
  const cls = readProgress(p).cls;
  return cls ? CLASSES[cls] : null;
};
export const myClass = (): ClassDef | null => classOf(myPlayer());

/** A player's newest title, shown under their name. */
export const titleOf = (p: PlayerState | undefined): string | null => {
  const t = p?.saga?.titles;
  return t?.length ? t[t.length - 1]! : null;
};

/** How fast you may walk now: not at all when fallen or frozen, slower when slowed. */
export function sagaSpeed(): number {
  if (!inSaga()) return 1;
  const fl = flagsOf(client.me);
  if (fl & (FLAG.down | FLAG.frozen)) return 0;
  return fl & FLAG.slow ? SLOW_MUL : 1;
}

/** Is this animal one of the dungeon's monsters (a boss, a helper or an ice block too)? */
export const isSagaMonster = (a: AnimalState | undefined): a is AnimalState => !!a && (!!SAGA_MOBS[a.species] || !!SAGA_BOSSES[a.species]);
export const isBossSpecies = (species: string): boolean => !!SAGA_BOSSES[species];

// ---------------------------------------------------------------------------
// The target: a monster (its animal id) or a friend (a player id)
// ---------------------------------------------------------------------------

let target: number | string | null = null;

export const getTarget = (): number | string | null => target;

export function setTarget(t: number | string | null): void {
  if (t === target) return;
  target = t;
  bus.emit('target', undefined);
}

/** The target if it is still there: a monster on this map, or a friend in this dungeon. */
export function liveTarget(): number | string | null {
  if (target === null) return null;
  if (typeof target === 'number') return isSagaMonster(activeWorld()?.animals[target]) ? target : null;
  return fighterOf(target) ? target : null;
}

/** Where a monster or player is now (the server's latest positions). */
export function posOf(id: number | string): { x: number; y: number } | null {
  if (typeof id === 'number') return client.snaps.animals.get(id) ?? activeWorld()?.animals[id] ?? null;
  if (id === client.me) return myPlayer() ?? null;
  return client.snaps.players.get(id) ?? null;
}

/** Monsters near you, nearest first; ice blocks holding a friend and monsters already fighting come first. */
export function nearbyMonsters(maxTiles = 12): number[] {
  const me = myPlayer();
  const world = activeWorld();
  if (!me || !world) return [];
  const snap = sagaSnap();
  const list: { id: number; d: number }[] = [];
  for (const a of Object.values(world.animals)) {
    if (!isSagaMonster(a)) continue;
    const at = posOf(a.id) ?? a;
    const d = Math.hypot(at.x - me.x, at.y - me.y) / TILE;
    if (d > maxTiles) continue;
    const ice = a.species === 'isblock';
    const fighting = !!snap?.m[a.id];
    list.push({ id: a.id, d: d - (ice ? 200 : 0) - (fighting ? 100 : 0) });
  }
  return list.sort((a, b) => a.d - b.d).map((m) => m.id);
}

/** Tab: the next monster near you. */
export function cycleTarget(): void {
  const list = nearbyMonsters();
  if (!list.length) {
    setTarget(null);
    return;
  }
  const i = typeof target === 'number' ? list.indexOf(target) : -1;
  setTarget(list[(i + 1) % list.length]!);
}

// ---------------------------------------------------------------------------
// Spells: sent to the server, cooldowns from its answer
// ---------------------------------------------------------------------------

/** When each spell is ready again, the short pause after any spell, and the next potion (server ms). */
const ready: Record<string, number> = {};
let gcdUntil = 0;
let potionAt = 0;
/** A spell on its way to the server (until its answer, or a moment if none comes). */
let inFlight = 0;
/** A spell pressed just before it was ready: it goes as soon as it is. */
let queued: string | null = null;
/** When each spell was last pressed (performance.now), for the button's flash. */
export const pressedAt: Record<string, number> = {};

/** Time left before a spell can go again, and how long that wait is in all (ms). */
export function cooldown(spell: string): { left: number; total: number } {
  const now = serverNow();
  const own = Math.max(0, (ready[spell] ?? 0) - now);
  const gcd = Math.max(0, gcdUntil - now);
  return own >= gcd ? { left: own, total: SPELLS[spell]?.cd ?? 1 } : { left: gcd, total: GCD_MS };
}

export const potionCooldown = (): { left: number; total: number } => ({ left: Math.max(0, potionAt - serverNow()), total: POTION_CD });
export const potionCount = (): number => countItem(myPlayer()?.inventory ?? [], 'healing_potion');

function canAct(): boolean {
  return inSaga() && !(flagsOf(client.me) & (FLAG.down | FLAG.frozen));
}

/** Presses spell button `slot` (0–3) of your class. */
export function castSlot(slot: number): void {
  const spell = myClass()?.spells[slot];
  if (spell) cast(spell);
}

export function cast(spell: string): void {
  if (!canAct()) return;
  pressedAt[spell] = performance.now();
  const { left } = cooldown(spell);
  if (left > 0 || performance.now() < inFlight) {
    // mashing keys still works: a press just before the spell is ready waits for it
    if (left < 450) queued = spell;
    return;
  }
  send(spell);
}

function send(spell: string): void {
  queued = null;
  inFlight = performance.now() + 350;
  const t = liveTarget();
  net.send(t === null ? { t: 'cast', spell } : { t: 'cast', spell, target: t });
}

export function drinkPotion(): void {
  if (!canAct()) return;
  pressedAt.potion = performance.now();
  if (potionCooldown().left > 0) return;
  if (potionCount() <= 0) {
    bus.emit('toast', T.sagaNoPotion);
    return;
  }
  net.send({ t: 'potion' });
}

/** A monster this far away is let go (you woke at the rest stone, or jumped to a friend). */
const LET_GO_TILES = 16;

/** Called every frame while in a dungeon: lets go of a monster left far behind, sends a waiting spell once it is ready. */
export function sagaTick(): void {
  if (typeof target === 'number') {
    const me = myPlayer();
    const at = posOf(target);
    if (me && at && Math.hypot(at.x - me.x, at.y - me.y) > LET_GO_TILES * TILE) setTarget(null);
  }
  if (!queued || performance.now() < inFlight) return;
  if (!canAct()) {
    queued = null;
    return;
  }
  if (cooldown(queued).left <= 0) send(queued);
}

/** Your own spell came back from the server: its cooldown and the short pause start now. */
bus.on('change', (c) => {
  if (c.t !== 'spell' || c.by !== client.me) return;
  const now = serverNow();
  if (c.spell === 'potion') {
    potionAt = now + POTION_CD;
    return;
  }
  const sp = SPELLS[c.spell];
  if (!sp) return;
  ready[c.spell] = now + sp.cd;
  gcdUntil = now + GCD_MS;
  inFlight = 0;
  // the monster the server picked becomes your target, so you can see its health
  if (typeof c.on === 'number' && liveTarget() === null) setTarget(c.on);
});

bus.on('change', (c) => {
  // a beaten monster is no longer a target
  if (c.t === 'animal' && !c.animal && c.id === target) setTarget(null);
});

bus.on('area', () => {
  // a new dungeon (or none): a fresh fighter, nothing aimed at
  for (const k of Object.keys(ready)) delete ready[k];
  gcdUntil = 0;
  potionAt = 0;
  queued = null;
  setTarget(null);
});

// ---------------------------------------------------------------------------
// The saga out in the world: Völvan's chapters and the villagers' quests
// ---------------------------------------------------------------------------

/** The marker over a villager: yellow ! (something new for you), yellow ? (hand it in), grey ? (in progress). */
export function sagaMarker(npcId: string): { text: string; cls: string } | null {
  const me = myPlayer();
  if (!me) return null;
  const prog = readProgress(me);
  let offer = false;
  let hand = false;
  let busy = false;
  if (npcId === VOLVA_ID && SAGA_CHAPTERS[prog.chapter]) {
    if (!prog.heard) offer = true;
    else if (chapterDone(prog)) hand = true;
    else busy = true;
  }
  for (const q of SAGA_QUESTS) {
    if (q.npc !== npcId) continue;
    const st = questState(me, q);
    if (st === 'ready') hand = true;
    else if (st === 'offer') offer = true;
    else if (st === 'active') busy = true;
  }
  if (hand) return { text: '?', cls: 'bubble marker saga' };
  if (offer) return { text: '!', cls: 'bubble marker saga' };
  if (busy) return { text: '?', cls: 'bubble marker saga busy' };
  return null;
}

/** Has this player started the saga (heard Völvan, or picked a class)? */
export const sagaStarted = (p: PlayerState | undefined): boolean => {
  const prog = readProgress(p);
  return !!prog.cls || prog.heard || prog.chapter > 0;
};
