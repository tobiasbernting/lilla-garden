// The rules of Sagan om Världsträdet's dungeons. A player picks a class at Kämpastenen and fights with
// its four spells; monsters wait in groups and fight together, go for whoever they hate most (the tank
// makes sure that is the tank) and give up when dragged too far from home. Bosses mark their big attacks
// on the ground before they land, call helpers at each new phase, and some attacks can be stopped with a
// stun. Rest stones heal and become where the family gets up after falling. Chests give each player their
// own loot. Völvan Sigrun tells the saga, the villagers give quests, and anyone can jump to a family member.
import { ANIMALS, ITEMS, NPCS, VILLAGE_KEY, objectDef } from './data.ts';
import { MAX_HEARTS } from './dungeon.ts';
import { isIndoorKey } from './hall.ts';
import { addItem, countItem, removeItem } from './inventory.ts';
import { addObject, inBounds, inInterior, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import type { Change } from './protocol.ts';
import { randInt } from './rng.ts';
import {
  CALM_MS,
  CLASSES,
  DOWN_MS,
  attackSpellOf,
  DUNGEONS,
  GCD_MS,
  LEASH_TILES,
  BLOCK_SPECIES,
  REST_RADIUS,
  SAGA_XP,
  LEVEL_REWARDS,
  fighterMax,
  gearOf,
  gearSlotOf,
  gearStats,
  isGearSlot,
  xpLevel,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_LOOT,
  SAGA_MOBS,
  SAGA_PORTAL,
  SAGA_QUESTS,
  SAGA_RESET_MS,
  SAGA_TREASURE,
  SPELLS,
  STONE_SPOT,
  addCount,
  VOLVA_ID,
  WIPE_MS,
  bossHpScale,
  DUNGEON_IDS,
  dungeonOfKey,
  isClassId,
  isSagaKey,
  mobDmgScale,
  mobHpScale,
  newSagaProgress,
  portalFront,
  previousDungeon,
  sagaItem,
  sagaKey,
  sagaQuest,
  type DungeonId,
  type SagaFighter,
  type SagaInstance,
  type SagaLoot,
  type SagaMob,
  type SagaProgress,
  type SagaQuest,
  type SagaZone,
  type SagaBossDef,
  type BossAbility,
  type LevelReward,
  type SagaBest,
  ESSENS_CHANCE,
  FORGE_COSTS,
  FORGE_CRAFTS,
  FORGE_MAX,
  SMITH_ID,
  forgeLevel,
  type ForgeCost,
} from './saga.ts';
import { sagaCheckpoint, spawnSagaMob } from './sagamap.ts';
import {
  ATTACK_GAP,
  animalAt,
  attackMob,
  bump,
  farmOf,
  fx,
  getArea,
  giveItems,
  isFarm,
  isHostile,
  isSolidForAnimal,
  isSolidForPlayer,
  lineOfSight,
  npcAt,
  npcState,
  openTileNear,
  placeIn,
  playerChange,
  resolveMove,
  tagArea,
  toast,
  type SimCtx,
} from './sim.ts';
import { isUnderground } from './caves.ts';
import { T, fmt, fmtDuration, itemName } from './sv.ts';
import { MAP_H, MAP_W, TILE, type AnimalState, type PlayerState, type WorldObject, type WorldState } from './types.ts';

const px = (t: number): number => t * TILE + TILE / 2;
const tileOf = (v: number): number => Math.floor(v / TILE);
/** Distance in tiles. */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y) / TILE;
const MOB_HALF = 5;

/** A player's saga, created the first time something needs it. */
export const progressOf = (p: PlayerState): SagaProgress => (p.saga ??= newSagaProgress());
const EMPTY: SagaProgress = newSagaProgress();
/** A player's saga for reading (clients): never changes the player. */
export const readProgress = (p: PlayerState | undefined): SagaProgress => p?.saga ?? EMPTY;

interface Here {
  farm: WorldState;
  area: WorldState;
  inst: SagaInstance;
  key: string;
}

function hereOf(world: WorldState, p: PlayerState): Here | null {
  if (!isSagaKey(p.area)) return null;
  const farm = farmOf(world);
  const area = farm.areas?.[p.area];
  return area?.saga ? { farm, area, inst: area.saga, key: p.area } : null;
}

/** The players in a dungeon right now (online, with a class). */
const partyOf = (h: Here): PlayerState[] => Object.values(h.area.players).filter((p) => p.online && p.area === h.key && !!h.inst.fighters[p.id]);
const upright = (h: Here, p: PlayerState): boolean => {
  const f = h.inst.fighters[p.id];
  return !!f && f.down === undefined;
};

const hit = (h: Here, on: string | number, n: number, kind: 'dmg' | 'heal' | 'crit' | 'block' | 'stun' | 'kick' | 'miss'): Change => ({ t: 'hit', area: h.key, on, n: Math.round(n), kind });
const spellFx = (h: Here | string, by: string | number, spell: string, from: { x: number; y: number }, to?: { x: number; y: number }, on?: string | number): Change => ({
  t: 'spell',
  area: typeof h === 'string' ? h : h.key,
  by,
  spell,
  x: from.x,
  y: from.y,
  ...(to ? { tx: to.x, ty: to.y } : {}),
  ...(on !== undefined ? { on } : {}),
});
/** A sparkle (or other effect) on whatever map a player is on. */
const fxOn = (area: string, x: number, y: number, kind: 'sparkle' | 'poof'): Change => (area === 'farm' ? fx(x, y, kind) : { ...(fx(x, y, kind) as Extract<Change, { t: 'fx' }>), area });
const toEveryone = (h: Here, out: Change[], text: string): void => {
  for (const p of partyOf(h)) out.push(toast(p.id, text));
};
const yell = (h: Here, species: string, text: string): Change => ({ t: 'yell', area: h.key, name: SAGA_BOSSES[species]?.name ?? species, text });

// ---------------------------------------------------------------------------
// In and out
// ---------------------------------------------------------------------------

/** A fresh fighter for a player with a class (full health). */
function makeFighter(h: Here, p: PlayerState): SagaFighter | null {
  const cls = p.saga?.cls;
  if (!cls) return null;
  ensureGear(p);
  const old = h.inst.fighters[p.id];
  if (old && old.cls === cls) return old;
  const max = fighterMax(p, cls);
  const f: SagaFighter = { cls, hp: max, max, cd: {}, gcd: 0, fightAt: 0 };
  h.inst.fighters[p.id] = f;
  return f;
}

/** After arriving in a dungeon (by its arch, a jump or a reconnect): a fighter and a welcome. */
function joined(h: Here, p: PlayerState, out: Change[], greet: boolean): void {
  makeFighter(h, p);
  delete h.inst.emptySince;
  if (greet) {
    const d = DUNGEONS[h.inst.id];
    out.push({ t: 'banner', to: p.id, area: h.key, text: d.name, sub: d.intro, kind: 'enter' });
  }
}

/** Walks into a dungeon through its arch out in the world. */
export function enterSaga(world: WorldState, p: PlayerState, arch: WorldObject): Change[] {
  const id = DUNGEON_IDS[arch.variant ?? 0];
  if (!id) return [];
  const prog = progressOf(p);
  if (!prog.cls) return [toast(p.id, T.sagaNeedClass)];
  const prev = previousDungeon(id);
  if (prev && !prog.cleared.includes(prev)) return [toast(p.id, fmt(T.sagaLocked, { name: DUNGEONS[id].name, boss: SAGA_BOSSES[DUNGEONS[prev].boss]!.name, prev: DUNGEONS[prev].name }))];
  return goInto(farmOf(world), p, id, null);
}

function goInto(farm: WorldState, p: PlayerState, id: DungeonId, at: { x: number; y: number } | null): Change[] {
  const key = sagaKey(id);
  const area = getArea(farm, key);
  const inst = area?.saga;
  if (!area || !inst) return [];
  const out: Change[] = [];
  const spot = at ?? inst.start;
  if (!placeIn(farm, p, key, spot.x, spot.y, 'up', out)) return [];
  joined({ farm, area, inst, key }, p, out, true);
  out.push(playerChange(p));
  return out;
}

/** Leaves a dungeon by its way out: back in front of the arch. */
export function leaveSaga(world: WorldState, p: PlayerState): Change[] {
  const id = dungeonOfKey(p.area);
  if (!id) return [];
  const farm = farmOf(world);
  const h = hereOf(world, p);
  if (h) forget(h, p.id);
  const out: Change[] = [];
  const front = archFront(farm, id);
  placeIn(farm, p, DUNGEONS[id].portal.area, front.x, front.y, 'down', out);
  return out;
}

/** The tile in front of a dungeon's arch out in the world (wherever it ended up). */
export function archFront(farm: WorldState, id: DungeonId): { x: number; y: number } {
  const plan = DUNGEONS[id].portal;
  const a = getArea(farm, plan.area);
  const arch = a ? Object.values(a.objects).find((o) => o.kind === 'saga_portal' && (o.variant ?? 0) === DUNGEON_IDS.indexOf(id)) : undefined;
  return portalFront(arch ?? (a ? archPlan(a, plan) : plan));
}

/**
 * Where an arch is planned in its map. The plans are drawn for 64×64 maps; on a bigger map the spot moves out
 * with the map, so the arch keeps its place relative to the middle.
 */
function archPlan(a: WorldState, plan: { x: number; y: number }): { x: number; y: number } {
  if (mapW(a) === MAP_W && mapH(a) === MAP_H) return plan;
  return { x: Math.round((plan.x * mapW(a)) / MAP_W), y: Math.round((plan.y * mapH(a)) / MAP_H) };
}

/** A player is no longer in the fight: monsters stop chasing them. */
function forget(h: Here, playerId: string): void {
  delete h.inst.fighters[playerId];
  for (const m of Object.values(h.inst.mobs)) {
    delete m.threat[playerId];
    if (m.target === playerId) delete m.target;
    if (m.tauntBy === playerId) delete m.tauntBy;
  }
}

/** Back online inside a dungeon (or the server restarted): up at the last rest stone, full health. */
export function rejoinSaga(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const id = p ? dungeonOfKey(p.area) : null;
  if (!p || !id) return [];
  const area = getArea(farm, p.area);
  if (!area?.saga || !p.saga?.cls) {
    // no class any more (or no dungeon): out in front of the arch
    const out: Change[] = [];
    const front = archFront(farm, id);
    placeIn(farm, p, DUNGEONS[id].portal.area, front.x, front.y, 'down', out);
    return out;
  }
  delete area.saga.fighters[p.id];
  return goInto(farm, p, id, sagaCheckpoint(area.saga));
}

/** Jumps to a family member, wherever they are: into their dungeon too (with a class). */
export function jumpTo(world: WorldState, playerId: string, toId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const q = farm.players[toId];
  if (!p || !q || p.id === q.id || !q.online || p.sleeping) return [];
  if (p.area === 'dungeon' || q.area === 'dungeon') return [toast(p.id, T.jumpNo)];
  const qid = dungeonOfKey(q.area);
  if (qid && !p.saga?.cls) return [toast(p.id, T.sagaNeedClass)];
  const leaving = hereOf(world, p);
  if (leaving && leaving.key !== q.area) forget(leaving, p.id);
  const area = getArea(farm, q.area);
  if (!area) return [toast(p.id, T.jumpNo)];
  const at = openTileNear(area, tileOf(q.x), tileOf(q.y) + 1);
  const out: Change[] = [];
  if (qid) {
    if (leaving && leaving.key === q.area) {
      warp(leaving, p, at.x, at.y, out);
      return out;
    }
    out.push(...goInto(farm, p, qid, at));
  } else if (!placeIn(farm, p, q.area, at.x, at.y, q.facing, out)) return [toast(p.id, T.jumpNo)];
  out.push(toast(p.id, fmt(T.jumpTo, { name: q.name })), toast(q.id, fmt(T.jumpedHere, { name: p.name })), fxOn(q.area, at.x, at.y, 'sparkle'));
  return out;
}

/** Moves a player within the map they are on (blink, charge, getting up, a boss's pull): the client jumps there too. */
function warp(h: Here | string, p: PlayerState, tx: number, ty: number, out: Change[], exact?: { x: number; y: number }): void {
  p.x = exact?.x ?? px(tx);
  p.y = exact?.y ?? px(ty);
  p.moving = false;
  p.moveLock = 6;
  out.push({ t: 'warp', id: p.id, x: p.x, y: p.y, area: typeof h === 'string' ? h : h.key }, playerChange(p));
}

// ---------------------------------------------------------------------------
// Out in the world: the arches, Kämpastenen, Völvan and the villagers
// ---------------------------------------------------------------------------

const ARCH_CLEAR = new Set(['tree', 'tree_pine', 'tree_apple', 'tree_snow', 'tree_dead', 'stump', 'rock', 'boulder', 'bush', 'flower', 'grass_tuft', 'mushroom', 'ice_rock', 'snow_rock', 'ash_rock', 'lava_rock', 'reed', 'berry_bush']);

/** Puts a dungeon's arch on its map (and Kämpastenen on the city square) if it is missing. True if something changed. */
export function ensureSagaPlaces(keyStr: string, a: WorldState): boolean {
  let changed = false;
  DUNGEON_IDS.forEach((id, variant) => {
    const plan = DUNGEONS[id].portal;
    if (plan.area !== keyStr || Object.values(a.objects).some((o) => o.kind === 'saga_portal' && (o.variant ?? 0) === variant)) return;
    const spot = archSpot(a, archPlan(a, plan));
    if (!spot) return;
    const front = portalFront(spot);
    // clear the footprint, a tile around it and the path in front: only trees and stones go from the top row
    for (let dy = -1; dy <= SAGA_PORTAL.h + 1; dy++)
      for (let dx = -1; dx <= SAGA_PORTAL.w; dx++) {
        const tx = spot.x + dx;
        const ty = spot.y + dy;
        if (!inBounds(a, tx, ty)) continue;
        const o = objectAt(a, tx, ty);
        if (o && (dy >= 0 || ARCH_CLEAR.has(o.kind))) removeObject(a, o.id);
        const t = a.terrain[tileIndex(a, tx, ty)];
        const solid = t === 'water' || t === 'lava' || t === 'bog' || t === 'basalt' || t === 'rock' || t === 'sandstone' || t === 'choco';
        if (dy >= 0 && dy < SAGA_PORTAL.h && solid) a.terrain[tileIndex(a, tx, ty)] = 'stone';
        if (dy >= SAGA_PORTAL.h && (solid || (tx === front.x && dy === SAGA_PORTAL.h))) a.terrain[tileIndex(a, tx, ty)] = 'path_stone';
      }
    if (addObject(a, 'saga_portal', spot.x, spot.y, { variant })) changed = true;
  });
  if (keyStr === VILLAGE_KEY && !Object.values(a.objects).some((o) => o.kind === 'saga_stone')) {
    const o = objectAt(a, STONE_SPOT.x, STONE_SPOT.y);
    if (o && !objectDef(o.kind).interact) removeObject(a, o.id);
    if (addObject(a, 'saga_stone', STONE_SPOT.x, STONE_SPOT.y)) changed = true;
  }
  return changed;
}

/** The planned spot for an arch, or the closest one with no door, chest, cave or building in the way. */
function archSpot(a: WorldState, plan: { x: number; y: number }): { x: number; y: number } | null {
  for (let r = 0; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const s = { x: plan.x + dx, y: plan.y + dy };
        if (s.x < 2 || s.y < 2 || s.x + SAGA_PORTAL.w > mapW(a) - 2 || s.y + SAGA_PORTAL.h + 2 > mapH(a) - 2) continue;
        let ok = true;
        for (let ty = s.y - 1; ty <= s.y + SAGA_PORTAL.h + 1 && ok; ty++)
          for (let tx = s.x - 1; tx <= s.x + SAGA_PORTAL.w && ok; tx++) {
            const o = objectAt(a, tx, ty);
            const d = o ? objectDef(o.kind) : undefined;
            if (o && d && !ARCH_CLEAR.has(o.kind) && (d.interact || d.w > 1 || d.h > 1)) ok = false;
          }
        if (ok) return s;
      }
  return null;
}

/** Kämpastenen: picks (or changes) a class. The class's clothes go to the wardrobe and are put on. */
export function chooseClass(world: WorldState, playerId: string, cls: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isClassId(cls)) return [];
  if (isSagaKey(p.area)) return [toast(p.id, T.sagaClassChange)];
  const prog = progressOf(p);
  const first = !prog.cls;
  prog.cls = cls;
  ensureGear(p);
  const c = CLASSES[cls];
  for (const piece of [c.outfit.hat, c.outfit.shirt]) if (!p.wardrobe.includes(piece)) p.wardrobe.push(piece);
  p.outfit = { ...p.outfit, hat: c.outfit.hat, shirt: c.outfit.shirt };
  // the new class's clothes are what the hero switch puts on from now on
  prog.heroOutfit = { ...p.outfit };
  const out: Change[] = [toast(p.id, fmt(T.sagaClassChosen, { cls: c.name })), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle')];
  if (first) {
    // every new hero gets a few healing potions to start with
    giveItems(farm, p, 'healing_potion', FIRST_POTIONS, out);
    bump(p, 'sagaClass', 1, out);
  }
  out.push(playerChange(p));
  return out;
}

const FIRST_POTIONS = 3;

const nearNpc = (farm: WorldState, p: PlayerState, npcId: string): boolean => {
  const n = NPCS[npcId];
  if (!n || (n.area ?? 'farm') !== p.area) return false;
  const area = p.area === 'farm' ? farm : farm.areas?.[p.area];
  if (!area) return false;
  const st = npcState(area, npcId);
  return Math.hypot(st.x - p.x, st.y - p.y) <= 4 * TILE;
};

/** Where a chapter's task out in the world is counted (SagaProgress.quests). */
export const fieldKey = (chapter: number): string => `field:${chapter}`;
/** How far a player has got with the task out in the world of the chapter Völvan is on. */
export const fieldCount = (prog: SagaProgress): number => prog.quests[fieldKey(prog.chapter)] ?? 0;

/** Is the goal of the chapter Völvan has told done? Every part of it: the task out in the world and the dungeon. */
export const chapterDone = (prog: SagaProgress): boolean => {
  const ch = SAGA_CHAPTERS[prog.chapter];
  if (!ch) return false;
  if (!ch.dungeon && !ch.field) return !!prog.cls;
  return (!ch.dungeon || prog.cleared.includes(ch.dungeon)) && (!ch.field || fieldCount(prog) >= ch.field.count);
};

/** Talking to Völvan: hear the next chapter, or hand in the one you have done. */
export function sagaChapter(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !nearNpc(farm, p, VOLVA_ID)) return [];
  const prog = progressOf(p);
  const ch = SAGA_CHAPTERS[prog.chapter];
  if (!ch) return [toast(p.id, T.sagaAllDone)];
  const out: Change[] = [];
  if (!prog.heard) {
    prog.heard = true;
    out.push({ t: 'banner', to: p.id, text: prog.chapter === 0 ? ch.title : fmt(T.sagaChapter, { n: prog.chapter, title: ch.title }), sub: ch.goal, kind: 'chapter' }, playerChange(p));
    return out;
  }
  if (!chapterDone(prog)) return [toast(p.id, ch.goal)];
  const r = ch.reward;
  p.coins += r.coins;
  p.stars += r.stars;
  bump(p, 'earned', r.coins, out);
  if (r.item) giveItems(farm, p, r.item, 1, out);
  if (r.title && !prog.titles.includes(r.title)) {
    prog.titles.push(r.title);
    out.push(toast(p.id, fmt(T.sagaTitle, { title: r.title })));
  }
  if (prog.chapter === SAGA_CHAPTERS.length - 1) bump(p, 'sagaAct2', 1, out);
  delete prog.quests[fieldKey(prog.chapter)];
  prog.chapter++;
  prog.heard = false;
  giveXp(p, SAGA_XP.chapter, out);
  out.push({ t: 'banner', to: p.id, kind: 'reward', text: fmt(T.sagaChapterDone, { title: ch.title }), sub: `+${r.coins} kr · +${r.stars} ⭐${r.item ? ` · ${itemName(r.item)}` : ''}` }, fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p));
  return out;
}

/** Where a villager's quest stands for a player. */
export function questState(p: PlayerState | undefined, q: SagaQuest): 'locked' | 'offer' | 'active' | 'ready' | 'done' {
  const prog = readProgress(p);
  if (prog.done.includes(q.id)) return 'done';
  const have = prog.quests[q.id];
  if (have !== undefined) return questCount(p!, q) >= q.count ? 'ready' : 'active';
  const ch = DUNGEONS[q.dungeon].chapter;
  return prog.cleared.includes(q.dungeon) || prog.chapter > ch || (prog.chapter === ch && prog.heard) ? 'offer' : 'locked';
}
/** How far a player has got with a quest (collect quests count what is in the bag). */
export const questCount = (p: PlayerState, q: SagaQuest): number => (q.kind === 'collect' ? countItem(p.inventory, q.target) : (p.saga?.quests[q.id] ?? 0));

/** A villager's quest: take it, or hand it in when it is done. */
export function sagaQuestAct(world: WorldState, playerId: string, questId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const q = sagaQuest(questId);
  if (!p || !q || !nearNpc(farm, p, q.npc)) return [];
  const prog = progressOf(p);
  const st = questState(p, q);
  if (st === 'offer') {
    prog.quests[q.id] = 0;
    return [toast(p.id, fmt(T.sagaQuestTaken, { title: q.title })), playerChange(p)];
  }
  if (st !== 'ready') return st === 'active' ? [toast(p.id, fmt(T.sagaQuestProgress, { goal: q.goal, n: questCount(p, q), count: q.count }))] : [];
  if (q.kind === 'collect' && !removeItem(p.inventory, q.target, q.count)) return [];
  delete prog.quests[q.id];
  prog.done.push(q.id);
  const out: Change[] = [];
  p.coins += q.reward.coins;
  p.stars += q.reward.stars;
  bump(p, 'earned', q.reward.coins, out);
  if (q.reward.item) giveItems(farm, p, q.reward.item, q.reward.count ?? 1, out);
  bump(p, 'sagaQuests', 1, out);
  giveXp(p, SAGA_XP.quest, out);
  out.push(toast(p.id, fmt(T.sagaQuestDone, { title: q.title })), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p));
  return out;
}

// ---------------------------------------------------------------------------
// Acting inside a dungeon: the way out, chests, rest stones, potions
// ---------------------------------------------------------------------------

/** Pressing the action button inside a dungeon. Farm tools do nothing in here. */
export function sagaAct(world: WorldState, p: PlayerState, tx: number, ty: number, ctx: SimCtx): Change[] {
  const h = hereOf(world, p);
  if (!h) return [];
  const obj = objectAt(h.area, tx, ty);
  if (obj?.kind === 'saga_exit') return leaveSaga(world, p);
  if (obj?.kind === 'saga_chest') return openChest(h, p, obj, ctx);
  if (obj?.kind === 'saga_rest') return [toast(p.id, T.sagaRestHint)];
  if (obj?.kind === 'saga_gate' && h.inst.puzzleGate.some((g) => g.x === obj.x && g.y === obj.y)) return [toast(p.id, T.sagaPuzzleShut)];
  if (obj?.kind === 'saga_plate' && !h.inst.puzzleOpen) return [toast(p.id, T.sagaPlatesHint)];
  if (p.inventory[p.selected]?.item === 'healing_potion') return drinkPotion(world, p.id, ctx);
  if (p.inventory[p.selected]?.item === STRENGTH_POTION) return drinkStrength(world, p.id, ctx);
  // nothing to use: the use key (E, space, the ✋ button, a tap next to you) swings your everyday attack at the
  // nearest monster in reach, quietly when there is none (the key is pressed a lot while walking about)
  const f = h.inst.fighters[p.id];
  if (f) return castSpell(world, p.id, attackSpellOf(f.cls), undefined, ctx, { quiet: true });
  return [];
}

const POTION_HEAL = 0.6;
/** Time between two healing potions (the client's potion button shows it too). */
export const POTION_CD = 15_000;

/** Drinks a healing potion (the potion button, or pressing action with one in hand). */
export function drinkPotion(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const p = farmOf(world).players[playerId];
  if (p && !isSagaKey(p.area) && p.saga?.hero) return drinkFieldPotion(world, playerId, ctx);
  const h = p ? hereOf(world, p) : null;
  const f = h && p ? h.inst.fighters[p.id] : undefined;
  if (!p || !h || !f || f.down !== undefined || f.frozen !== undefined) return [];
  if (ctx.now < (f.potionAt ?? 0)) return [toast(p.id, T.sagaNotReady)];
  if (!removeItem(p.inventory, 'healing_potion', 1)) return [toast(p.id, T.sagaNoPotion)];
  f.potionAt = ctx.now + POTION_CD;
  const out: Change[] = [];
  heal(h, p, f, f.max * POTION_HEAL, out);
  out.push(spellFx(h, p.id, 'potion', p), playerChange(p));
  return out;
}

/** The strength potion (Styrkedryck): a quarter more power for a little while, in a dungeon or out in the world. */
export const STRENGTH_POTION = 'styrkedryck';
const STRENGTH_MS = 20_000;
const STRENGTH_MUL = 1.25;

export function drinkStrength(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !p.saga?.cls) return [];
  const h = hereOf(world, p);
  const f = h ? h.inst.fighters[p.id] : undefined;
  if (h && (!f || f.down !== undefined || f.frozen !== undefined)) return [];
  if (!h && !canFieldCast(world, p)) return [];
  if (!removeItem(p.inventory, STRENGTH_POTION, 1)) return [toast(p.id, T.sagaNoStrength)];
  const until = ctx.now + STRENGTH_MS;
  if (f) f.strong = until;
  else fieldState(p.id).strong = until;
  return [spellFx(h ?? p.area, p.id, 'strength', p), toast(p.id, T.sagaStrength), playerChange(p)];
}

/** Opens a chest: everyone gets their own loot from it once. */
function openChest(h: Here, p: PlayerState, chest: WorldObject, ctx: SimCtx): Change[] {
  const looted = (h.inst.looted[chest.id] ??= []);
  if (looted.includes(p.id)) return [toast(p.id, T.sagaLooted)];
  const d = DUNGEONS[h.inst.id];
  const kind = chest.variant ?? 0;
  if (kind === 0) {
    // the side room's treasure is guarded
    const guard = Object.values(h.inst.mobs).some((m) => m.kind === 'mob' && h.area.animals[m.id] && dist(h.area.animals[m.id]!, { x: px(chest.x), y: px(chest.y) }) < 7);
    if (guard) return [toast(p.id, T.sagaChestGuarded)];
  }
  const species = kind === 1 ? d.mini : d.boss;
  const table = kind === 0 ? SAGA_TREASURE[h.inst.id] : SAGA_LOOT[species];
  if (!table) return [];
  looted.push(p.id);
  const out: Change[] = [];
  if (kind === 0) {
    rollLoot(h, p, table, T.sagaTreasureName, ctx, out);
    return out;
  }
  // a boss's chest gives its full loot once a game day per player; after that the same day, the replay chest
  const prog = progressOf(p);
  const days = (prog.chestDay ??= {});
  const today = h.farm.day;
  if (days[species] === today) replayChest(h, p, table, SAGA_BOSSES[species]!.name, kind === 2, ctx, out);
  else {
    days[species] = today;
    rollLoot(h, p, table, SAGA_BOSSES[species]!.name, ctx, out, kind === 2 ? [{ item: DRAKFJALL, count: 1 }] : []);
  }
  return out;
}

/** Smedjan's dungeon materials. */
const ESSENS = 'monsteressens';
const DRAKFJALL = 'drakfjall';

/** The smaller chest of a boss already looted today: a third of the coins, 2–4 Monsteressens (and a Drakfjäll from a final boss), no stars. */
function replayChest(h: Here, p: PlayerState, table: SagaLoot, from: string, final: boolean, ctx: SimCtx, out: Change[]): void {
  const coins = Math.floor(randInt(ctx.rnd, table.coins[0], table.coins[1]) / 3);
  const items = [{ item: ESSENS, count: randInt(ctx.rnd, 2, 4) }];
  if (final) items.push({ item: DRAKFJALL, count: 1 });
  p.coins += coins;
  bump(p, 'earned', coins, out);
  for (const it of items) giveItems(h.area, p, it.item, it.count, out);
  bump(p, 'loot', 1, out);
  out.push({ t: 'loot', to: p.id, from, items, coins, stars: 0, replay: true }, playerChange(p));
}

/** Things that come once each (clothes, weapons, offhands, amulets, pets, mounts), so the same one does not come twice while there are new ones. */
const unique = (id: string): boolean => {
  const k = sagaItem(id)?.kind;
  return k === 'weapon' || k === 'offhand' || k === 'amulet' || k === 'hat' || k === 'shirt' || k === 'pet' || k === 'mount';
};

function rollLoot(h: Here, p: PlayerState, table: SagaLoot, from: string, ctx: SimCtx, out: Change[], extra: { item: string; count: number }[] = []): void {
  const prog = progressOf(p);
  const items: { item: string; count: number }[] = [];
  const coins = randInt(ctx.rnd, table.coins[0], table.coins[1]);
  const fresh = table.gear.filter((g) => !unique(g.item) || !prog.found.includes(g.item));
  const pool = fresh.length ? fresh : table.gear;
  const total = pool.reduce((n, g) => n + g.weight, 0);
  let r = ctx.rnd() * total;
  let pick = pool[0]!;
  for (const g of pool) {
    r -= g.weight;
    if (r <= 0) {
      pick = g;
      break;
    }
  }
  items.push({ item: pick.item, count: pick.item === 'healing_potion' ? 2 : 1 });
  for (const rare of table.rare ?? []) if (!prog.found.includes(rare.item) && ctx.rnd() < rare.chance) items.push({ item: rare.item, count: 1 });
  items.push(...extra);
  p.coins += coins;
  p.stars += table.stars;
  bump(p, 'earned', coins, out);
  for (const it of items) {
    if (unique(it.item) && prog.found.includes(it.item) && !fresh.length) {
      // everything here is found already: a potion instead of a second copy
      it.item = 'healing_potion';
      it.count = 2;
    }
    if (unique(it.item)) prog.found.push(it.item);
    if (ITEMS[it.item]?.category === 'clothing') {
      if (!p.wardrobe.includes(it.item)) p.wardrobe.push(it.item);
    } else giveItems(h.area, p, it.item, it.count, out);
  }
  bump(p, 'loot', 1, out);
  out.push({ t: 'loot', to: p.id, from, items, coins, stars: table.stars }, playerChange(p));
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

/** The gear and the hero's level make every spell stronger (and a strength potion, while it lasts). */
const spellPower = (p: PlayerState, strongUntil: number | undefined, now: number): number => gearStats(p).power * (strongUntil !== undefined && now < strongUntil ? STRENGTH_MUL : 1);

const CRIT_CHANCE = 0.12;
const RAGE_LEECH = 0.3;
/** Sköldmur also gives back a little health. */
const WALL_HEAL = 0.15;

/** A monster a spell can hit: in a fight or waiting (not on its way home), close enough, in sight for ranged spells. */
function pickMob(h: Here, p: PlayerState, f: SagaFighter, range: number, wanted: number | undefined, sight: boolean): SagaMob | null {
  const ok = (m: SagaMob | undefined): m is SagaMob => {
    if (!m || m.state === 'home') return false;
    const a = h.area.animals[m.id];
    return !!a && dist(a, p) <= range + 0.6 && (!sight || lineOfSight(h.area, p.x, p.y, a.x, a.y));
  };
  for (const id of [wanted, f.target]) {
    const m = id !== undefined ? h.inst.mobs[id] : undefined;
    if (ok(m)) return m;
  }
  let best: SagaMob | null = null;
  let bestD = Infinity;
  for (const m of Object.values(h.inst.mobs)) {
    if (!ok(m)) continue;
    // monsters already fighting come first, then the closest
    const d = dist(h.area.animals[m.id]!, p) - (m.state === 'fight' ? 100 : 0);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** A friend a heal can reach: the one asked for, else whoever is hurt worst (yourself too). */
function pickFriend(h: Here, p: PlayerState, range: number, wanted: string | undefined, down: boolean): PlayerState | null {
  const party = partyOf(h);
  const ok = (q: PlayerState | undefined): q is PlayerState => {
    const f = q ? h.inst.fighters[q.id] : undefined;
    return !!q && !!f && (f.down !== undefined) === down && dist(q, p) <= range + 0.6;
  };
  const asked = wanted ? party.find((q) => q.id === wanted) : undefined;
  if (ok(asked) && (down || h.inst.fighters[asked.id]!.hp < h.inst.fighters[asked.id]!.max)) return asked;
  let best: PlayerState | null = null;
  let worst = down ? Infinity : 0.999;
  for (const q of party) {
    if (!ok(q)) continue;
    const f = h.inst.fighters[q.id]!;
    const v = down ? dist(q, p) : f.hp / f.max;
    if (v < worst) {
      worst = v;
      best = q;
    }
  }
  return best;
}

/**
 * Casts one of the player's spells at `target` (a monster's animal id or a friend's player id; left out, the server
 * picks). `quiet`: no toast when nothing is in reach.
 */
export function castSpell(world: WorldState, playerId: string, spellId: string, target: number | string | undefined, ctx: SimCtx, opts: { quiet?: boolean } = {}): Change[] {
  const p = farmOf(world).players[playerId];
  const h = p ? hereOf(world, p) : null;
  const f = h && p ? h.inst.fighters[p.id] : undefined;
  const sp = SPELLS[spellId];
  // out in the world in hero mode, the same spells work on Loke's roaming servants
  if (p && !h && !isSagaKey(p.area) && p.saga?.hero) return castFieldSpell(world, playerId, spellId, target, ctx, opts);
  if (!p || !h || !f || !sp || !CLASSES[f.cls].spells.includes(spellId)) return [];
  const now = ctx.now;
  if (f.down !== undefined || f.frozen !== undefined || now < f.gcd || now < (f.cd[spellId] ?? 0)) return [];
  const out: Change[] = [];
  const gear = spellPower(p, f.strong, now);
  const power = (base: number): { n: number; crit: boolean } => {
    const crit = ctx.rnd() < CRIT_CHANCE;
    return { n: base * gear * (f.rage !== undefined && now < f.rage ? 1.5 : 1) * (crit ? 1.5 : 1), crit };
  };
  const raging = f.rage !== undefined && now < f.rage;
  const strike = (m: SagaMob, base: number): void => {
    const pw = power(base);
    hurtMob(h, m, p.id, pw.n, sp.threat ?? 1, pw.crit, ctx, out);
    // a raging berserker heals a little from every blow
    if (raging) heal(h, p, f, pw.n * RAGE_LEECH, out);
  };
  const mobAt = (m: SagaMob): { x: number; y: number } => h.area.animals[m.id] ?? m.home;
  const noTarget = (): Change[] => (opts.quiet ? [] : [toast(p.id, T.sagaNoTarget)]);
  const wantMob = typeof target === 'number' ? target : undefined;
  const wantFriend = typeof target === 'string' ? target : undefined;
  switch (sp.kind) {
    case 'melee':
    case 'bolt':
    case 'lance':
    case 'bash': {
      const m = pickMob(h, p, f, sp.range, wantMob, sp.kind === 'bolt' || sp.kind === 'lance');
      if (!m) return noTarget();
      f.target = m.id;
      out.push(spellFx(h, p.id, sp.id, p, mobAt(m), m.id));
      strike(m, sp.power);
      if (sp.kind === 'lance' && h.inst.mobs[m.id]) {
        m.slowUntil = now + (sp.ms ?? 3000);
        // the ice also stops a boss's big attack
        if (m.cast) stun(h, m, 0, now, out);
      }
      if (sp.kind === 'bash' && h.inst.mobs[m.id]) stun(h, m, sp.ms ?? 1500, now, out);
      break;
    }
    case 'charge': {
      const m = pickMob(h, p, f, sp.range, wantMob, true);
      if (!m) return noTarget();
      f.target = m.id;
      const a = mobAt(m);
      const d = Math.max(1, Math.hypot(p.x - a.x, p.y - a.y));
      const to = { x: a.x + ((p.x - a.x) / d) * TILE, y: a.y + ((p.y - a.y) / d) * TILE };
      const from = { x: p.x, y: p.y };
      if (!isSolidForPlayer(h.area, tileOf(to.x), tileOf(to.y))) warp(h, p, 0, 0, out, to);
      out.push(spellFx(h, p.id, sp.id, from, a, m.id));
      strike(m, sp.power);
      if (h.inst.mobs[m.id]) stun(h, m, sp.ms ?? 1000, now, out);
      break;
    }
    case 'storm': {
      const m = pickMob(h, p, f, sp.range, wantMob, true);
      if (!m) return noTarget();
      f.target = m.id;
      const at = { ...mobAt(m) };
      out.push(spellFx(h, p.id, sp.id, p, at));
      for (const o of mobsNear(h, at, sp.radius ?? 2)) strike(o, sp.power);
      break;
    }
    case 'whirl': {
      out.push(spellFx(h, p.id, sp.id, p));
      for (const o of mobsNear(h, p, sp.radius ?? 2)) strike(o, sp.power);
      break;
    }
    case 'taunt': {
      out.push(spellFx(h, p.id, sp.id, p));
      for (const m of mobsNear(h, p, sp.radius ?? 5)) {
        if (m.state === 'idle') pull(h, m, p.id, now, out);
        const top = Math.max(0, ...Object.values(m.threat));
        m.threat[p.id] = top * 1.2 + 20;
        m.tauntBy = p.id;
        m.tauntUntil = now + (sp.ms ?? 4000);
        m.target = p.id;
      }
      break;
    }
    case 'heal': {
      const q = pickFriend(h, p, sp.range, wantFriend, false);
      if (!q) return [toast(p.id, T.sagaAllWell)];
      out.push(spellFx(h, p.id, sp.id, p, q, q.id));
      const pw = power(sp.power);
      heal(h, q, h.inst.fighters[q.id]!, pw.n, out, pw.crit);
      healThreat(h, p.id, pw.n);
      break;
    }
    case 'hot': {
      out.push(spellFx(h, p.id, sp.id, p));
      const ms = sp.ms ?? 6000;
      for (const q of partyOf(h)) {
        const qf = h.inst.fighters[q.id]!;
        if (qf.down === undefined && dist(q, p) <= (sp.radius ?? 4)) qf.hot = { until: now + ms, per: (sp.power * gear) / (ms / 1000) };
      }
      healThreat(h, p.id, sp.power / 2);
      break;
    }
    case 'revive': {
      const q = pickFriend(h, p, sp.range, wantFriend, true);
      if (!q) return [toast(p.id, T.sagaNoneDown)];
      const qf = h.inst.fighters[q.id]!;
      delete qf.down;
      qf.hp = Math.max(1, Math.round((qf.max * sp.power) / 100));
      qf.fightAt = now;
      out.push(spellFx(h, p.id, sp.id, p, q, q.id), hit(h, q.id, qf.hp, 'heal'), playerChange(q));
      toEveryone(h, out, fmt(T.sagaUp, { name: q.name }));
      break;
    }
    case 'wall':
      f.wall = now + (sp.ms ?? 6000);
      out.push(spellFx(h, p.id, sp.id, p));
      heal(h, p, f, f.max * WALL_HEAL, out);
      break;
    case 'rage':
      f.rage = now + (sp.ms ?? 8000);
      p.boostUntil = f.rage;
      out.push(spellFx(h, p.id, sp.id, p), playerChange(p));
      break;
    case 'blink': {
      const dir = p.facing === 'left' ? [-1, 0] : p.facing === 'right' ? [1, 0] : p.facing === 'up' ? [0, -1] : [0, 1];
      let to = { x: p.x, y: p.y };
      for (let s = 0.5; s <= sp.range; s += 0.5) {
        const nx = p.x + dir[0]! * s * TILE;
        const ny = p.y + dir[1]! * s * TILE;
        if (isSolidForPlayer(h.area, tileOf(nx), tileOf(ny))) break;
        to = { x: nx, y: ny };
      }
      out.push(spellFx(h, p.id, sp.id, p, to));
      warp(h, p, 0, 0, out, to);
      break;
    }
  }
  f.gcd = now + GCD_MS;
  f.cd[spellId] = now + sp.cd;
  if (inFight(h)) f.fightAt = now;
  return out;
}

const mobsNear = (h: Here, at: { x: number; y: number }, r: number): SagaMob[] =>
  Object.values(h.inst.mobs).filter((m) => m.state !== 'home' && h.area.animals[m.id] && dist(h.area.animals[m.id]!, at) <= r + 0.4);

/** Healing makes the monsters in the fight a little cross with the healer. */
function healThreat(h: Here, by: string, amount: number): void {
  const fighting = Object.values(h.inst.mobs).filter((m) => m.state === 'fight');
  for (const m of fighting) m.threat[by] = (m.threat[by] ?? 0) + (amount * 0.5) / fighting.length;
}

/** A stun: a monster stands dazed; a boss is only stopped in a big attack that can be stopped. */
function stun(h: Here, m: SagaMob, ms: number, now: number, out: Change[]): void {
  if (m.kind === 'boss' || m.kind === 'mini') {
    const move = m.cast ? SAGA_BOSSES[m.species]?.moves[m.cast.move] : undefined;
    if (!move?.interrupt) return;
    for (const id of m.cast!.zones) dropZone(h, id, out);
    delete m.cast;
    out.push(hit(h, m.id, 0, 'kick'));
    toEveryone(h, out, fmt(T.sagaInterrupt, { move: move.name }));
    return;
  }
  m.stunUntil = now + ms;
  out.push(hit(h, m.id, 0, 'stun'));
}

const inFight = (h: Here): boolean => Object.values(h.inst.mobs).some((m) => m.state === 'fight');

// ---------------------------------------------------------------------------
// Damage, healing, falling and getting up
// ---------------------------------------------------------------------------

function heal(h: Here, p: PlayerState, f: SagaFighter, amount: number, out: Change[], crit = false): void {
  if (f.down !== undefined) return;
  const before = f.hp;
  f.hp = Math.min(f.max, f.hp + Math.round(amount));
  if (f.hp > before || crit) out.push(hit(h, p.id, f.hp - before, crit ? 'crit' : 'heal'));
}

function hurtFighter(h: Here, p: PlayerState, amount: number, by: SagaMob | null, now: number, out: Change[]): void {
  const f = h.inst.fighters[p.id];
  // the ice that holds a frozen player keeps everything else out too
  if (!f || f.down !== undefined || f.frozen !== undefined) return;
  const armor = gearStats(p).armor;
  let n = Math.max(1, Math.round(amount * mobDmgScale(partyOf(h).length) * (1 - armor) * (f.wall !== undefined && now < f.wall ? 0.4 : 1)));
  if (n >= f.hp && f.hp > f.max * 0.5 && n < f.max) n = f.hp - 1; // one hit from full health never knocks you down
  f.hp -= n;
  f.fightAt = now;
  out.push(hit(h, p.id, n, f.wall !== undefined && now < f.wall ? 'block' : 'dmg'));
  if (f.hp > 0) return;
  f.hp = 0;
  f.down = now;
  delete f.hot;
  if (f.frozen !== undefined) melt(h, f.frozen, out);
  for (const m of Object.values(h.inst.mobs)) {
    delete m.threat[p.id];
    if (m.target === p.id) delete m.target;
  }
  toEveryone(h, out, fmt(T.sagaDown, { name: p.name }));
  if (by && (by.kind === 'boss' || by.kind === 'mini')) out.push(yell(h, by.species, SAGA_BOSSES[by.species]!.yells.kill));
  out.push(playerChange(p));
}

/** Gets a fallen player up at the last rest stone, with full health. */
function standUp(h: Here, p: PlayerState, now: number, out: Change[]): void {
  const f = h.inst.fighters[p.id];
  if (!f) return;
  delete f.down;
  delete f.frozen;
  f.hp = f.max;
  f.fightAt = now;
  const at = sagaCheckpoint(h.inst);
  const spot = openTileNear(h.area, at.x, at.y);
  warp(h, p, spot.x, spot.y, out);
  out.push(fxOn(h.key, spot.x, spot.y, 'sparkle'));
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

/** The party's size now (monsters get tougher with more players). */
const partySize = (h: Here): number => Math.max(1, partyOf(h).length);

/** Wakes a monster (and its whole group, or a boss): they all come for `by`. */
function pull(h: Here, m: SagaMob, by: string, now: number, out: Change[]): void {
  const group = m.pack >= 0 ? h.inst.packs[m.pack]!.members.map((id) => h.inst.mobs[id]).filter((x): x is SagaMob => !!x) : [m];
  const n = partySize(h);
  for (const g of group) {
    if (g.state === 'fight') continue;
    g.state = 'fight';
    g.threat[by] = Math.max(g.threat[by] ?? 0, 1);
    g.atkAt = now + 600;
    if (g.hp >= g.max && (g.kind === 'mob' || g.kind === 'boss' || g.kind === 'mini')) {
      // tougher the more of the family is here
      const base = SAGA_BOSSES[g.species]?.hp ?? SAGA_MOBS[g.species]?.hp ?? g.max;
      g.max = Math.round(base * (g.kind === 'mob' ? mobHpScale(n) : bossHpScale(n)));
      g.hp = g.max;
    }
    g.pulledAt = now;
    const boss = SAGA_BOSSES[g.species];
    if (boss) {
      g.phase = g.phase ?? 0;
      g.next = boss.moves.map((mv) => now + mv.first);
      out.push(yell(h, g.species, boss.yells.pull));
    }
  }
}

/** A monster loses health; at zero it is beaten. */
function hurtMob(h: Here, m: SagaMob, by: string, amount: number, threatMul: number, crit: boolean, ctx: SimCtx, out: Change[]): void {
  if (!h.inst.mobs[m.id] || m.state === 'home') return;
  if (m.state === 'idle') pull(h, m, by, ctx.now, out);
  const n = Math.max(1, Math.round(amount));
  m.hp -= n;
  if (m.kind !== 'ice') m.threat[by] = (m.threat[by] ?? 0) + n * threatMul;
  const f = h.inst.fighters[by];
  if (f) f.fightAt = ctx.now;
  out.push(hit(h, m.id, n, crit ? 'crit' : 'dmg'));
  if (m.hp <= 0) {
    mobDown(h, m, by, ctx, out);
    return;
  }
  // a boss gets a new phase at each health mark: a shout and helpers
  const boss = SAGA_BOSSES[m.species];
  if (boss && m.phase !== undefined && m.phase < boss.phases.length && m.hp / m.max <= boss.phases[m.phase]!) {
    const line = boss.yells.phase[m.phase] ?? boss.yells.phase[0] ?? '';
    m.phase++;
    if (line) out.push(yell(h, m.species, line));
    const a = h.area.animals[m.id];
    if (boss.phaseAdds && a) {
      const party = partyOf(h).filter((p) => upright(h, p));
      const n = addCount(boss.phaseAdds.count, partySize(h));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + ctx.rnd();
        const at = { x: a.x + Math.cos(ang) * 3 * TILE, y: a.y + Math.sin(ang) * 3 * TILE };
        const spot = isSolidForAnimal(h.area, tileOf(at.x), tileOf(at.y)) ? { x: a.x, y: a.y } : at;
        const add = spawnSagaMob(h.area, h.inst, boss.phaseAdds.species, spot.x, spot.y, 'add', -1);
        const am = h.inst.mobs[add.id]!;
        am.max = Math.round(am.max * mobHpScale(partySize(h)));
        am.hp = am.max;
        am.state = 'fight';
        am.atkAt = ctx.now + 800;
        const victim = party[Math.floor(ctx.rnd() * party.length)];
        if (victim) am.threat[victim.id] = 5;
        out.push({ t: 'animal', id: add.id, animal: add, area: h.key }, fxOn(h.key, tileOf(spot.x), tileOf(spot.y), 'poof'));
      }
    }
  }
}

/**
 * A monster is beaten (by `by`): quest credit for everyone there, now and then a Monsteressens for whoever beat a
 * dungeon monster, the gate opens after the mid-boss, a chest after a boss, and the family's best time after the last.
 */
function mobDown(h: Here, m: SagaMob, by: string, ctx: SimCtx, out: Change[]): void {
  const a = h.area.animals[m.id];
  delete h.inst.mobs[m.id];
  delete h.area.animals[m.id];
  const at = a ? { x: a.x, y: a.y } : m.home;
  out.push({ t: 'animal', id: m.id, animal: null, area: h.key }, fxOn(h.key, tileOf(at.x), tileOf(at.y), 'poof'));
  if (m.kind === 'ice') {
    freeFrom(h, m, out);
    return;
  }
  const party = partyOf(h);
  const xp = m.kind === 'boss' ? SAGA_XP.boss : m.kind === 'mini' ? SAGA_XP.mini : m.kind === 'add' ? SAGA_XP.add : SAGA_XP.mob;
  for (const p of party) {
    if (h.inst.fighters[p.id]?.target === m.id) delete h.inst.fighters[p.id]!.target;
    questCredit(h.area, p, m.species, ctx, out, true);
    bump(p, 'sagaMobs', 1, out);
    giveXp(p, xp, out, h);
  }
  if (m.kind === 'mob') {
    const killer = h.farm.players[by];
    if (killer && ctx.rnd() < ESSENS_CHANCE) {
      giveItems(h.area, killer, ESSENS, 1, out);
      out.push(toast(killer.id, T.sagaEssens));
    }
  }
  if (m.pack >= 0) {
    const pack = h.inst.packs[m.pack]!;
    if (pack.members.every((id) => !h.inst.mobs[id])) pack.dead = true;
  }
  const boss = SAGA_BOSSES[m.species];
  if (!boss || (m.kind !== 'boss' && m.kind !== 'mini')) {
    for (const p of party) out.push(playerChange(p));
    return;
  }
  // the boss's helpers and attacks go with it
  for (const z of h.inst.zones.filter((z) => z.by === m.id)) dropZone(h, z.id, out);
  for (const add of Object.values(h.inst.mobs).filter((x) => x.kind === 'add' || x.kind === 'ice')) {
    if (add.kind === 'ice') freeFrom(h, add, out);
    delete h.inst.mobs[add.id];
    delete h.area.animals[add.id];
    out.push({ t: 'animal', id: add.id, animal: null, area: h.key });
  }
  out.push(yell(h, m.species, boss.yells.death));
  const tx = tileOf(at.x);
  const ty = tileOf(at.y);
  // the chest appears where the boss fell, but never on top of (or right next to) someone
  const clear = (x: number, y: number): boolean => !Object.values(h.area.players).some((p) => Math.abs(tileOf(p.x) - x) <= 1 && Math.abs(tileOf(p.y) - y) <= 1);
  let chest: WorldObject | null = null;
  for (let r = 0; r <= 4 && !chest; r++)
    for (let dy = -r; dy <= r && !chest; dy++)
      for (let dx = -r; dx <= r && !chest; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !clear(tx + dx, ty + dy)) continue;
        chest = addObject(h.area, 'saga_chest', tx + dx, ty + dy, { variant: m.kind === 'mini' ? 1 : 2 });
      }
  if (chest) out.push({ t: 'object', id: chest.id, obj: chest, area: h.key });
  const d = DUNGEONS[h.inst.id];
  if (m.kind === 'mini') {
    h.inst.miniDown = true;
    h.inst.gateOpen = true;
    for (const g of h.inst.gate) {
      const o = objectAt(h.area, g.x, g.y);
      if (o?.kind === 'saga_gate') {
        removeObject(h.area, o.id);
        out.push({ t: 'object', id: o.id, obj: null, area: h.key });
      }
    }
    for (const p of party) out.push({ t: 'banner', to: p.id, area: h.key, text: fmt(T.sagaBossDown, { boss: boss.name }), sub: T.sagaGateOpen, kind: 'boss' });
  } else {
    h.inst.bossDown = true;
    const names: string[] = [];
    for (const p of party) {
      const prog = progressOf(p);
      if (!prog.cleared.includes(h.inst.id)) {
        prog.cleared.push(h.inst.id);
        bump(p, CLEARED_STAT[h.inst.id], 1, out);
      }
      names.push(p.name);
      out.push({ t: 'banner', to: p.id, area: h.key, text: fmt(T.sagaBossDown, { boss: boss.name }), sub: fmt(T.sagaCleared, { dungeon: d.name }), kind: 'cleared' });
    }
    out.push(toast(null, fmt(T.sagaFamilyWin, { names: names.join(' och '), boss: boss.name })));
    bestTime(h, names, ctx.now, out);
  }
  for (const p of party) out.push(playerChange(p));
}

/** The family's best time through a dungeon: from the first one in to the boss's fall. A new best is told to everyone. */
function bestTime(h: Here, names: string[], now: number, out: Change[]): void {
  if (h.inst.startedAt === undefined || !names.length) return;
  const ms = Math.max(0, now - h.inst.startedAt);
  const all = (h.farm.sagaBest ??= {});
  const old = all[h.inst.id];
  if (old && old.ms <= ms) return;
  const best: SagaBest = { ms, names: [...names], day: h.farm.day };
  all[h.inst.id] = best;
  out.push({ t: 'sagaBest', dungeon: h.inst.id, best });
  if (old) out.push(toast(null, fmt(T.sagaBestBeaten, { names: names.join(' och '), dungeon: DUNGEONS[h.inst.id].name, time: fmtDuration(ms) })));
}

/** The achievement stat for clearing each dungeon. */
const CLEARED_STAT: Record<DungeonId, string> = { draug: 'sagaDraug', frost: 'sagaFrost', surt: 'sagaSurt', hel: 'sagaHel', dvarg: 'sagaDvarg', orm: 'sagaOrm', alv: 'sagaAlv', fenrir: 'sagaFenrir', loke: 'sagaLoke' };

/** Kill quests count the monster; collect quests may find what the villager wants on it (in a dungeon). */
function questCredit(area: WorldState, p: PlayerState, species: string, ctx: SimCtx, out: Change[], collect: boolean): void {
  const prog = p.saga;
  if (!prog) return;
  for (const q of SAGA_QUESTS) {
    if (prog.quests[q.id] === undefined) continue;
    if (q.kind === 'kill' && q.target === species && prog.quests[q.id]! < q.count) {
      prog.quests[q.id]!++;
      out.push(toast(p.id, fmt(T.sagaQuestProgress, { goal: q.goal, n: prog.quests[q.id]!, count: q.count })));
    }
    if (collect && q.kind === 'collect' && q.from?.includes(species) && countItem(p.inventory, q.target) < q.count && ctx.rnd() < (q.chance ?? 0.5)) {
      giveItems(area, p, q.target, 1, out);
      out.push(toast(p.id, fmt(T.sagaQuestProgress, { goal: q.goal, n: countItem(p.inventory, q.target), count: q.count })));
    }
  }
}

/** Sends a monster home: full health, no grudges. A boss also loses its helpers and its half-done attack. */
function resetMob(h: Here, m: SagaMob, out: Change[]): void {
  m.state = 'home';
  m.threat = {};
  m.hp = m.max;
  delete m.target;
  delete m.tauntBy;
  delete m.stunUntil;
  delete m.slowUntil;
  if (m.cast) for (const id of m.cast.zones) dropZone(h, id, out);
  delete m.cast;
  if (SAGA_BOSSES[m.species] && (m.kind === 'boss' || m.kind === 'mini')) {
    m.phase = 0;
    for (const z of h.inst.zones.filter((z) => z.by === m.id)) dropZone(h, z.id, out);
    for (const add of Object.values(h.inst.mobs).filter((x) => x.kind === 'add' || x.kind === 'ice')) {
      if (add.kind === 'ice') freeFrom(h, add, out);
      delete h.inst.mobs[add.id];
      delete h.area.animals[add.id];
      out.push({ t: 'animal', id: add.id, animal: null, area: h.key });
    }
  }
}

/** The ice around a frozen player breaks (or melts). */
function freeFrom(h: Here, ice: SagaMob, out: Change[]): void {
  const p = ice.holds ? h.farm.players[ice.holds] : undefined;
  const f = p ? h.inst.fighters[p.id] : undefined;
  if (p && f && f.frozen === ice.id) {
    delete f.frozen;
    out.push(playerChange(p));
  }
}
function melt(h: Here, iceId: number, out: Change[]): void {
  const ice = h.inst.mobs[iceId];
  if (!ice) return;
  delete h.inst.mobs[iceId];
  delete h.area.animals[iceId];
  out.push({ t: 'animal', id: iceId, animal: null, area: h.key });
  freeFrom(h, ice, out);
}

/** Who a monster goes for: whoever taunted it, else whoever it hates most (it only switches for a lot more). */
function chooseTarget(h: Here, m: SagaMob, now: number): PlayerState | null {
  const ok = (id: string | undefined): PlayerState | null => {
    const p = id ? h.farm.players[id] : undefined;
    return p && p.online && p.area === h.key && upright(h, p) ? p : null;
  };
  if (m.tauntBy && now < (m.tauntUntil ?? 0)) {
    const t = ok(m.tauntBy);
    if (t) return t;
  }
  const cur = ok(m.target);
  let best: PlayerState | null = null;
  let top = 0;
  for (const [id, v] of Object.entries(m.threat)) {
    const p = ok(id);
    if (p && v > top) {
      top = v;
      best = p;
    }
  }
  if (cur && best && best !== cur && top < (m.threat[cur.id] ?? 0) * 1.1) best = cur;
  m.target = best?.id;
  return best;
}

/** Steps along the floor towards the target, around corners when the way straight is blocked. */
function stepTowards(h: Here, m: SagaMob, a: { x: number; y: number; facing: string; moving: boolean }, goal: { x: number; y: number }, speed: number, dtMs: number, field: Int16Array | null): void {
  const step = (speed * dtMs) / 1000;
  let tx = goal.x;
  let ty = goal.y;
  if (field && !lineOfSight(h.area, a.x, a.y, goal.x, goal.y)) {
    // follow the distance field: the neighbouring tile closest to the target
    const cx = tileOf(a.x);
    const cy = tileOf(a.y);
    let best = field[tileIndex(h.area, cx, cy)] ?? -1;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx!;
      const ny = cy + dy!;
      if (!inBounds(h.area, nx, ny)) continue;
      const v = field[tileIndex(h.area, nx, ny)]!;
      if (v >= 0 && (best < 0 || v < best)) {
        best = v;
        tx = px(nx);
        ty = px(ny);
      }
    }
  }
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) {
    a.moving = false;
    return;
  }
  const s = Math.min(step, d);
  const r = resolveMove((x, y) => isSolidForAnimal(h.area, x, y), a.x, a.y, a.x + (dx / d) * s, a.y + (dy / d) * s, MOB_HALF, MOB_HALF, h.area);
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  void m;
}

/** How many steps every floor tile is from a player (to find the way around walls). */
function distanceField(h: Here, from: { x: number; y: number }): Int16Array {
  const W = mapW(h.area);
  const H = mapH(h.area);
  const field = new Int16Array(W * H).fill(-1);
  const start = tileIndex(h.area, tileOf(from.x), tileOf(from.y));
  field[start] = 0;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const k = q[i]!;
    const x = k % W;
    const y = Math.floor(k / W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx!;
      const ny = y + dy!;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = tileIndex(h.area, nx, ny);
      if (field[j] !== -1 || isSolidForAnimal(h.area, nx, ny)) continue;
      field[j] = field[k]! + 1;
      if (field[j]! < 60) q.push(j);
    }
  }
  return field;
}

/** One monster's turn. */
function tickMob(h: Here, m: SagaMob, dtMs: number, ctx: SimCtx, fields: Map<string, Int16Array>, out: Change[]): void {
  const a = h.area.animals[m.id];
  if (!a) {
    delete h.inst.mobs[m.id];
    return;
  }
  const now = ctx.now;
  if (m.kind === 'ice') {
    a.moving = false;
    if (now >= (m.meltAt ?? Infinity)) melt(h, m.id, out);
    return;
  }
  const boss = SAGA_BOSSES[m.species];
  const def = SAGA_MOBS[m.species];
  const stats = boss ?? def;
  if (!stats) return;
  if (m.state === 'idle') {
    a.moving = false;
    const sight = boss ? 5 : (def?.aggro ?? 4);
    for (const p of partyOf(h)) {
      if (!upright(h, p) || dist(p, a) > sight || !lineOfSight(h.area, a.x, a.y, p.x, p.y)) continue;
      pull(h, m, p.id, now, out);
      break;
    }
    return;
  }
  if (m.state === 'home') {
    stepTowards(h, m, a, m.home, stats.speed * TILE * 1.6, dtMs, null);
    if (Math.hypot(a.x - m.home.x, a.y - m.home.y) < 3 || !a.moving) {
      a.x = m.home.x;
      a.y = m.home.y;
      a.moving = false;
      a.facing = 'down';
      m.state = 'idle';
      m.hp = m.max;
    }
    return;
  }
  // fighting: a monster dragged too far gives up; a boss keeps to its hall and gives up only when everyone has left it
  if (boss ? !partyOf(h).some((p) => upright(h, p) && dist(p, m.home) <= LEASH_TILES) : dist(a, m.home) > LEASH_TILES) {
    resetMob(h, m, out);
    return;
  }
  if (now < (m.stunUntil ?? 0)) {
    a.moving = false;
    return;
  }
  if (boss && m.cast) {
    a.moving = false;
    if (now >= m.cast.at) landCast(h, m, ctx, out);
    return;
  }
  const target = chooseTarget(h, m, now);
  if (!target) {
    resetMob(h, m, out);
    return;
  }
  if (boss && m.next && startCast(h, m, a, ctx, out)) return;
  const reach = stats.reach;
  const d = dist(a, target);
  const ranged = reach > 2.5;
  const see = lineOfSight(h.area, a.x, a.y, target.x, target.y);
  if (d <= reach && (!ranged || see)) {
    a.moving = false;
    const dx = target.x - a.x;
    const dy = target.y - a.y;
    a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (now >= m.atkAt) {
      m.atkAt = now + stats.atkMs;
      if (ranged) out.push(spellFx(h, m.id, `mob_${m.species}`, a, target, target.id));
      else out.push(spellFx(h, m.id, 'claw', a, target, target.id));
      hurtFighter(h, target, stats.dmg, m, now, out);
      if (def?.slows) {
        const f = h.inst.fighters[target.id];
        if (f) f.slow = now + 2500;
      }
    }
    return;
  }
  const slow = now < (m.slowUntil ?? 0) ? 0.5 : 1;
  let field = fields.get(target.id);
  if (!field && !see) {
    field = distanceField(h, target);
    fields.set(target.id, field);
  }
  const was = { x: a.x, y: a.y };
  stepTowards(h, m, a, target, stats.speed * TILE * slow, dtMs, field ?? null);
  if (boss && dist(a, m.home) > BOSS_HALL && dist(a, m.home) > dist(was, m.home)) {
    // a boss stops at the edge of its hall
    a.x = was.x;
    a.y = was.y;
    a.moving = false;
  }
}

/** How far from its place a boss follows anyone (tiles). */
const BOSS_HALL = 11;

// ---------------------------------------------------------------------------
// Boss attacks: marked on the ground, then they land
// ---------------------------------------------------------------------------

function addZone(h: Here, m: SagaMob, z: Omit<SagaZone, 'id' | 'by'>, out: Change[]): string {
  const zone: SagaZone = { ...z, id: `${h.inst.id}${h.inst.seq++}`, by: m.id };
  h.inst.zones.push(zone);
  out.push({ t: 'zone', area: h.key, id: zone.id, zone });
  return zone.id;
}
function dropZone(h: Here, id: string, out: Change[]): void {
  const i = h.inst.zones.findIndex((z) => z.id === id);
  if (i < 0) return;
  h.inst.zones.splice(i, 1);
  out.push({ t: 'zone', area: h.key, id, zone: null });
}

/** Starts the next ready attack, if any. True if the boss is now busy with it. */
function startCast(h: Here, m: SagaMob, a: { x: number; y: number; facing: string }, ctx: SimCtx, out: Change[]): boolean {
  const boss = SAGA_BOSSES[m.species]!;
  const now = ctx.now;
  const i = boss.moves.findIndex((mv, k) => (mv.phase ?? 0) <= (m.phase ?? 0) && now >= m.next![k]!);
  if (i < 0) return false;
  const mv = boss.moves[i]!;
  m.next![i] = now + mv.every + mv.warn;
  const party = partyOf(h).filter((p) => upright(h, p));
  // the ice prison needs a friend to break it: never on someone alone
  if (!party.length || (mv.move === 'freeze' && party.length < 2)) return false;
  const at = now + mv.warn;
  const zones: string[] = [];
  const tank = m.target ? h.farm.players[m.target] : undefined;
  const others = party.filter((p) => p !== tank);
  const someone = (): PlayerState => (others.length ? others : party)[Math.floor(ctx.rnd() * (others.length ? others.length : party.length))]!;
  const circle = (x: number, y: number, r: number, extra: Partial<SagaZone> = {}): void => {
    zones.push(addZone(h, m, { shape: 'circle', x, y, r, at, dmg: mv.dmg, ...extra }, out));
  };
  switch (mv.move) {
    case 'cleave': {
      const t = tank ?? party[0]!;
      const dir = Math.atan2(t.y - a.y, t.x - a.x);
      zones.push(addZone(h, m, { shape: 'cone', x: a.x, y: a.y, r: mv.radius, dir, arc: mv.arc ?? 90, at, dmg: mv.dmg }, out));
      break;
    }
    case 'slam':
    case 'nova':
    case 'pull':
      circle(a.x, a.y, mv.radius);
      break;
    case 'line': {
      // a long strip from the boss towards the one it is fighting
      const t = tank ?? party[0]!;
      const dir = Math.atan2(t.y - a.y, t.x - a.x);
      zones.push(addZone(h, m, { shape: 'line', x: a.x, y: a.y, r: mv.radius, w: mv.width ?? 1.6, dir, at, dmg: mv.dmg }, out));
      break;
    }
    case 'mend':
      // the boss curls up and glows (only a picture: nobody is hurt)
      circle(a.x, a.y, mv.radius || 1, { dmg: 0 });
      toEveryone(h, out, fmt(T.sagaMending, { boss: boss.name }));
      break;
    case 'rain':
    case 'pools': {
      for (const p of party) circle(p.x, p.y, mv.radius, mv.linger ? { until: at + mv.linger } : {});
      for (let k = 0; k < (mv.count ?? 0); k++) {
        const p = party[Math.floor(ctx.rnd() * party.length)]!;
        const ang = ctx.rnd() * Math.PI * 2;
        const r = (2 + ctx.rnd() * 3) * TILE;
        const x = p.x + Math.cos(ang) * r;
        const y = p.y + Math.sin(ang) * r;
        if (!isSolidForAnimal(h.area, tileOf(x), tileOf(y))) circle(x, y, mv.radius, mv.linger ? { until: at + mv.linger } : {});
      }
      break;
    }
    case 'charge':
    case 'freeze': {
      const p = someone();
      circle(p.x, p.y, mv.radius);
      break;
    }
    case 'summon':
      break;
  }
  m.cast = { move: i, at, zones };
  const dx = (tank ?? party[0]!).x - a.x;
  a.facing = Math.abs(dx) > 0 ? (dx > 0 ? 'right' : 'left') : a.facing;
  out.push(spellFx(h, m.id, `cast_${mv.move}`, a));
  return true;
}

const inZone = (z: SagaZone, p: { x: number; y: number }): boolean => {
  if (z.shape === 'line') {
    // along the strip (from a little behind the boss to its far end) and no further to the side than half its width
    const dx = (p.x - z.x) / TILE;
    const dy = (p.y - z.y) / TILE;
    const c = Math.cos(z.dir ?? 0);
    const s = Math.sin(z.dir ?? 0);
    const along = dx * c + dy * s;
    return along >= -0.6 && along <= z.r && Math.abs(-dx * s + dy * c) <= (z.w ?? 1.6) / 2;
  }
  const d = Math.hypot(p.x - z.x, p.y - z.y) / TILE;
  if (d > z.r) return false;
  if (z.shape === 'circle') return true;
  if (d < 0.6) return true;
  const ang = Math.atan2(p.y - z.y, p.x - z.x);
  let diff = Math.abs(ang - (z.dir ?? 0));
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  return diff <= (((z.arc ?? 90) / 2) * Math.PI) / 180;
};

/** The attack lands: whoever is still standing in its marks is hit. */
function landCast(h: Here, m: SagaMob, ctx: SimCtx, out: Change[]): void {
  const boss = SAGA_BOSSES[m.species]!;
  const cast = m.cast!;
  delete m.cast;
  const mv = boss.moves[cast.move]!;
  const now = ctx.now;
  const a = h.area.animals[m.id];
  const zones = cast.zones.map((id) => h.inst.zones.find((z) => z.id === id)).filter((z): z is SagaZone => !!z);
  const party = partyOf(h).filter((p) => upright(h, p));
  if (mv.move === 'charge' && a && zones[0]) {
    // the boss lands where the mark was
    const z = zones[0];
    const from = { x: a.x, y: a.y };
    if (!isSolidForAnimal(h.area, tileOf(z.x), tileOf(z.y))) {
      a.x = z.x;
      a.y = z.y;
    }
    out.push(spellFx(h, m.id, 'charge_land', from, z));
  }
  if (mv.move === 'mend' && a) {
    // nobody stopped it: the boss gets some of its health back
    const n = Math.min(m.max - m.hp, Math.round(m.max * (mv.heal ?? 0.1)));
    if (n > 0) {
      m.hp += n;
      out.push(hit(h, m.id, n, 'heal'));
    }
    toEveryone(h, out, fmt(T.sagaMended, { boss: boss.name }));
  }
  let pulled = false;
  for (const z of zones) {
    out.push(spellFx(h, m.id, `land_${mv.move}`, z));
    if (mv.move === 'mend') {
      dropZone(h, z.id, out);
      continue;
    }
    for (const p of party) {
      if (!inZone(z, p)) continue;
      if (mv.move === 'freeze') {
        freeze(h, m, p, mv, ctx, out);
        continue;
      }
      if (mv.move === 'pull' && a) {
        pullIn(h, a, p, out);
        pulled = true;
      }
      hurtFighter(h, p, mv.dmg, m, now, out);
    }
    if (z.until !== undefined) {
      // burning ground stays a while, hurting a little every second
      z.dmg = mv.dmg;
      z.at = now;
      out.push({ t: 'zone', area: h.key, id: z.id, zone: z });
    } else dropZone(h, z.id, out);
  }
  if (pulled) toEveryone(h, out, fmt(T.sagaPulled, { boss: boss.name }));
  if (mv.move === 'summon' && a && mv.add) {
    for (let i = 0; i < addCount(mv.count ?? 2, partySize(h)); i++) {
      const add = spawnSagaMob(h.area, h.inst, mv.add, a.x + (i - 0.5) * 2 * TILE, a.y + TILE, 'add', -1);
      const am = h.inst.mobs[add.id]!;
      am.state = 'fight';
      am.atkAt = now + 800;
      if (party[0]) am.threat[party[i % party.length]!.id] = 5;
      out.push({ t: 'animal', id: add.id, animal: add, area: h.key });
    }
  }
}

/** A boss's pull: the player lands on a free tile one or two steps from the boss, on their own side of it. */
function pullIn(h: Here, a: { x: number; y: number }, p: PlayerState, out: Change[]): void {
  const d = Math.max(1, Math.hypot(p.x - a.x, p.y - a.y));
  const bx = tileOf(a.x);
  const by = tileOf(a.y);
  for (const step of [1.5, 2, 1, 2.5]) {
    const tx = tileOf(a.x + ((p.x - a.x) / d) * step * TILE);
    const ty = tileOf(a.y + ((p.y - a.y) / d) * step * TILE);
    if ((tx !== bx || ty !== by) && !isSolidForPlayer(h.area, tx, ty)) {
      warp(h, p, tx, ty, out);
      return;
    }
  }
  const spot = openTileNear(h.area, bx, by + 1);
  warp(h, p, spot.x, spot.y, out);
}

const ICE_HP = 45;
const ICE_MS = 9000;

/** Freezes a player in a block of ice (or a spider's web): no walking or spells until someone breaks it (or it melts). */
function freeze(h: Here, m: SagaMob, p: PlayerState, mv: BossAbility, ctx: SimCtx, out: Change[]): void {
  const f = h.inst.fighters[p.id];
  if (!f || f.frozen !== undefined) return;
  const block = mv.block && BLOCK_SPECIES.has(mv.block) ? mv.block : 'isblock';
  const ice = spawnSagaMob(h.area, h.inst, block, p.x, p.y + 1, 'ice', -1);
  const im = h.inst.mobs[ice.id]!;
  im.max = Math.round(ICE_HP * mobHpScale(partySize(h)));
  im.hp = im.max;
  im.state = 'fight';
  im.holds = p.id;
  im.meltAt = ctx.now + ICE_MS;
  f.frozen = ice.id;
  out.push({ t: 'animal', id: ice.id, animal: ice, area: h.key });
  toEveryone(h, out, fmt(block === 'spindelnat' ? T.sagaWebbed : T.sagaFrozen, { name: p.name }));
  hurtFighter(h, p, mv.dmg, m, ctx.now, out);
  out.push(playerChange(p));
}

// ---------------------------------------------------------------------------
// The dungeon's tick
// ---------------------------------------------------------------------------

const REGEN = 0.03;
const REST_REGEN = 0.3;

/** Runs a dungeon for one tick while anyone is inside. */
export function tickSaga(area: WorldState, key: string, dtMs: number, ctx: SimCtx, out: Change[]): void {
  const inst = area.saga;
  if (!inst) return;
  const farm = farmOf(area);
  const h: Here = { farm, area, inst, key };
  const now = ctx.now;
  const party = partyOf(h);
  // players who left (or lost their class) are out of the fight
  for (const id of Object.keys(inst.fighters)) {
    const p = farm.players[id];
    if (!p || p.area !== key || !p.saga?.cls) forget(h, id);
    else if (!p.online) {
      for (const m of Object.values(inst.mobs)) delete m.threat[id];
    }
  }
  for (const p of Object.values(area.players)) if (p.online && p.area === key && !inst.fighters[p.id] && p.saga?.cls) makeFighter(h, p);
  // the clock of the family's best time starts when the first fighter is in a fresh dungeon
  if (inst.startedAt === undefined && Object.keys(inst.fighters).length) inst.startedAt = now;
  const fighting = inFight(h);
  const sec = dtMs / 1000;
  for (const p of party) {
    const f = inst.fighters[p.id]!;
    if (f.down !== undefined) {
      if (!inst.wipeAt && now - f.down >= DOWN_MS) standUp(h, p, now, out);
      continue;
    }
    // the healing ring
    if (f.hot && now < f.hot.until) {
      const before = f.hp;
      f.hp = Math.min(f.max, f.hp + f.hot.per * sec);
      if (Math.floor(f.hp) > Math.floor(before) && Math.floor(now / 1000) !== Math.floor((now - dtMs) / 1000)) out.push(hit(h, p.id, f.hot.per, 'heal'));
    } else if (f.hot) delete f.hot;
    // rest stones: they light up when someone comes near, heal, and become where you get up
    inst.rests.forEach((r, i) => {
      if (dist(p, { x: px(r.x), y: px(r.y) }) > REST_RADIUS) return;
      if (i > inst.checkpoint) {
        inst.checkpoint = i;
        const o = objectAt(area, r.x, r.y);
        if (o) {
          o.variant = 1;
          out.push({ t: 'object', id: o.id, obj: o, area: key });
        }
        for (const q of party) out.push({ t: 'banner', to: q.id, area: key, text: T.sagaRestLit, sub: T.sagaRestSub, kind: 'rest' });
      }
      if (!fighting) f.hp = Math.min(f.max, f.hp + f.max * REST_REGEN * sec);
    });
    // out of the fight, health slowly comes back
    if (!fighting && now - f.fightAt > CALM_MS) f.hp = Math.min(f.max, f.hp + f.max * REGEN * sec);
  }
  // a puzzle room's plates light up under anyone standing on them; all of them lit opens the way on
  if (!inst.puzzleOpen) {
    for (const plate of inst.plates) {
      if (plate.lit || !party.some((p) => upright(h, p) && tileOf(p.x) === plate.x && tileOf(p.y) === plate.y)) continue;
      plate.lit = true;
      const o = objectAt(area, plate.x, plate.y);
      if (o) {
        o.variant = 1;
        out.push({ t: 'object', id: o.id, obj: o, area: key });
      }
      out.push(fxOn(key, plate.x, plate.y, 'sparkle'));
      toEveryone(h, out, fmt(T.sagaPlateLit, { n: inst.plates.filter((q) => q.lit).length, count: inst.plates.length }));
    }
    if (inst.plates.length && inst.plates.every((q) => q.lit)) openPuzzle(h, out);
  }
  // monsters
  const fields = new Map<string, Int16Array>();
  for (const m of Object.values(inst.mobs)) tickMob(h, m, dtMs, ctx, fields, out);
  // burning ground
  for (const z of [...inst.zones]) {
    if (z.until === undefined || now < z.at) continue;
    if (now >= z.until) {
      dropZone(h, z.id, out);
      continue;
    }
    if (Math.floor(now / 1000) === Math.floor((now - dtMs) / 1000)) continue;
    for (const p of party) if (upright(h, p) && inZone(z, p)) hurtFighter(h, p, z.dmg, inst.mobs[z.by] ?? null, now, out);
  }
  // everyone fell: a short pause, then up at the last rest stone, and the monsters go home
  if (party.length && party.every((p) => !upright(h, p))) {
    if (inst.wipeAt === undefined) {
      inst.wipeAt = now + WIPE_MS;
      const boss = Object.values(inst.mobs).find((m) => (m.kind === 'boss' || m.kind === 'mini') && m.state === 'fight');
      if (boss) out.push(yell(h, boss.species, SAGA_BOSSES[boss.species]!.yells.wipe));
      for (const p of party) out.push({ t: 'banner', to: p.id, area: key, text: T.sagaWipe, sub: T.sagaWipeSub, kind: 'wipe' });
    } else if (now >= inst.wipeAt) {
      delete inst.wipeAt;
      for (const m of Object.values(inst.mobs)) if (m.state === 'fight') resetMob(h, m, out);
      for (const z of [...inst.zones]) dropZone(h, z.id, out);
      for (const p of party) standUp(h, p, now, out);
    }
  } else delete inst.wipeAt;
}

/** Every plate is lit: the puzzle room's gate goes, like the gate after the mid-boss. */
function openPuzzle(h: Here, out: Change[]): void {
  h.inst.puzzleOpen = true;
  for (const g of h.inst.puzzleGate) {
    const o = objectAt(h.area, g.x, g.y);
    if (o?.kind === 'saga_gate') {
      removeObject(h.area, o.id);
      out.push({ t: 'object', id: o.id, obj: null, area: h.key });
    }
  }
  for (const p of partyOf(h)) out.push({ t: 'banner', to: p.id, area: h.key, text: T.sagaPuzzleOpen, sub: T.sagaPuzzleOpenSub, kind: 'rest' });
}

/** A dungeon nobody is in: after a while it starts over. Returns true when it should be thrown away. */
export function idleSaga(farm: WorldState, key: string, area: WorldState, now: number): boolean {
  const inst = area.saga;
  if (!inst) return false;
  inst.emptySince ??= now;
  if (now - inst.emptySince < SAGA_RESET_MS) return false;
  // anyone still inside (offline) waits in front of the arch instead
  const id = dungeonOfKey(key);
  if (id) {
    const front = archFront(farm, id);
    for (const p of Object.values(farm.players)) {
      if (p.area !== key) continue;
      p.area = DUNGEONS[id].portal.area;
      p.x = px(front.x);
      p.y = px(front.y);
    }
  }
  return true;
}

/** Monsters that do not move by the farm's animal rules. */
export const isSagaMob = (area: WorldState, id: number): boolean => !!area.saga?.mobs[id];

/** A fallen or frozen player cannot walk. */
export function sagaRooted(world: WorldState, p: PlayerState): boolean {
  const h = hereOf(world, p);
  const f = h?.inst.fighters[p.id];
  return !!f && (f.down !== undefined || f.frozen !== undefined);
}

/** A slowed player walks at this speed (client prediction). */
export const SLOW_MUL = 0.6;

// ---------------------------------------------------------------------------
// What clients need every tenth of a second
// ---------------------------------------------------------------------------

export interface SagaSnap {
  /** Players: health, max, flags (1 fallen, 2 shield wall, 4 rage, 8 healing ring, 16 slowed, 32 frozen). */
  f: Record<string, [number, number, number]>;
  /** Monsters that are fighting or hurt: health and max. */
  m: Record<number, [number, number]>;
  /** The boss in a fight: its id, phase, and the attack it is getting ready (name, when it lands, warning ms, stoppable). */
  b?: { id: number; phase: number; cast?: { name: string; at: number; warn: number; kick: boolean } };
}

export function sagaSnapshot(farm: WorldState, now: number): Record<string, SagaSnap> | undefined {
  let res: Record<string, SagaSnap> | undefined;
  for (const [k, a] of Object.entries(farm.areas ?? {})) {
    const inst = a.saga;
    if (!inst || !Object.values(a.players).some((p) => p.online)) continue;
    const snap: SagaSnap = { f: {}, m: {} };
    for (const [id, f] of Object.entries(inst.fighters)) {
      const flags = (f.down !== undefined ? 1 : 0) | (f.wall !== undefined && now < f.wall ? 2 : 0) | (f.rage !== undefined && now < f.rage ? 4 : 0) | (f.hot && now < f.hot.until ? 8 : 0) | (f.slow !== undefined && now < f.slow ? 16 : 0) | (f.frozen !== undefined ? 32 : 0);
      snap.f[id] = [Math.ceil(f.hp), f.max, flags];
    }
    for (const m of Object.values(inst.mobs)) {
      if (m.state === 'fight' || m.hp < m.max) snap.m[m.id] = [Math.max(0, Math.ceil(m.hp)), m.max];
      if ((m.kind === 'boss' || m.kind === 'mini') && m.state === 'fight') {
        const mv = m.cast ? SAGA_BOSSES[m.species]?.moves[m.cast.move] : undefined;
        snap.b = { id: m.id, phase: m.phase ?? 0 };
        if (mv && m.cast) snap.b.cast = { name: mv.name, at: m.cast.at, warn: mv.warn, kick: !!mv.interrupt };
      }
    }
    (res ??= {})[k] = snap;
  }
  return res;
}

// ---------------------------------------------------------------------------
// Act II: gear, hero levels, hero mode out in the world, field tasks and Loke's roaming servants
// ---------------------------------------------------------------------------

/** Saves from before gear: the gear record is made and the best weapon in the bag is put on. True if it changed. */
export function ensureGear(p: PlayerState): boolean {
  const prog = p.saga;
  if (!prog || prog.gear) return false;
  const best = gearOf(p).weapon;
  prog.gear = {};
  if (best && removeItem(p.inventory, best, 1)) prog.gear.weapon = best;
  return true;
}

/** A fighter's full health follows their gear and level (they keep what they gained or lost). */
function refreshMax(p: PlayerState, f: SagaFighter): void {
  const max = fighterMax(p, f.cls);
  if (max === f.max) return;
  if (f.down === undefined) f.hp = Math.max(1, Math.min(max, f.hp + Math.max(0, max - f.max)));
  f.max = max;
}

/**
 * Puts a weapon, an offhand or an amulet from the bag on (`itemId` null takes the slot's piece off, back into the
 * bag). Anywhere, but not while fallen or frozen in a dungeon.
 */
export function equipGear(world: WorldState, playerId: string, slot: string, itemId: string | null): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !isGearSlot(slot)) return [];
  const prog = progressOf(p);
  ensureGear(p);
  const gear = prog.gear!;
  const h = hereOf(world, p);
  const f = h?.inst.fighters[p.id];
  if (f && (f.down !== undefined || f.frozen !== undefined)) return [toast(p.id, T.sagaEquipNotNow)];
  const old = gear[slot];
  const out: Change[] = [];
  if (itemId === null) {
    if (!old) return [];
    if (addItem(p.inventory, old, 1) > 0) return [toast(p.id, T.sagaEquipBagFull)];
    delete gear[slot];
    out.push(toast(p.id, fmt(T.sagaUnequipped, { item: itemName(old) })));
  } else {
    if (gearSlotOf(itemId) !== slot) return [toast(p.id, fmt(T.sagaEquipNoFit, { item: itemName(itemId) }))];
    if (old === itemId) return [];
    if (!removeItem(p.inventory, itemId, 1)) return [toast(p.id, fmt(T.sagaEquipMissing, { item: itemName(itemId) }))];
    if (old && addItem(p.inventory, old, 1) > 0) {
      addItem(p.inventory, itemId, 1);
      return [toast(p.id, T.sagaEquipBagFull)];
    }
    gear[slot] = itemId;
    out.push(toast(p.id, fmt(T.sagaEquipped, { item: itemName(itemId) })));
    if (sagaItem(itemId)?.rarity === 'legendary' && !p.stats?.sagaLegendary) {
      bump(p, 'sagaLegendary', 1, out);
      out.push(toast(null, fmt(T.sagaLegendaryOn, { name: p.name, item: itemName(itemId) })));
    }
  }
  if (f) refreshMax(p, f);
  out.push(playerChange(p));
  return out;
}

/**
 * Hero experience, for everyone (the saga record is made if there is none; spells still need a class). A floating
 * "+n xp" for the player, and at each new level a banner naming the level's reward, a sparkle, the reward itself
 * and a little more power and health.
 */
export function giveXp(p: PlayerState, n: number, out: Change[], h?: Here): void {
  if (n <= 0) return;
  const prog = progressOf(p);
  const before = xpLevel(prog.xp ?? 0);
  prog.xp = (prog.xp ?? 0) + n;
  const level = xpLevel(prog.xp);
  prog.level = level;
  out.push({ t: 'xp', to: p.id, n, x: p.x, y: p.y, ...(p.area !== 'farm' ? { area: p.area } : {}) });
  // the rewards of the levels just reached, and any an old save is still owed
  ensureLevelRewards(p, out);
  if ((p.stats?.sagaLevel ?? 0) < level) bump(p, 'sagaLevel', level - (p.stats?.sagaLevel ?? 0), out);
  if (level <= before) return;
  const lines: string[] = [];
  for (let l = before + 1; l <= level; l++) lines.push(...rewardLines(LEVEL_REWARDS[l]));
  out.push(
    { t: 'banner', to: p.id, ...(h ? { area: h.key } : {}), kind: 'level', text: fmt(T.sagaLevelUp, { n: level }), sub: lines.length ? lines.join(' ') : T.sagaLevelSub },
    fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'),
  );
  const f = h?.inst.fighters[p.id];
  if (f) refreshMax(p, f);
}

/** What the level banner says about a level's reward ("Du får Glödkransen!", "Ny titel: Vandrare"). */
const rewardLines = (r: LevelReward | undefined): string[] => {
  if (!r) return [];
  const lines: string[] = [];
  if (r.item) lines.push(fmt(T.sagaLevelItem, { item: itemName(r.item) }));
  if (r.title) lines.push(fmt(T.sagaLevelTitle, { title: r.title }));
  if (r.aura) lines.push(r.aura === 2 ? T.sagaLevelAura2 : T.sagaLevelAura1);
  return lines;
};

/**
 * Hands out every hero level reward a player has reached and not had yet: clothes to the wardrobe, pets, mounts and
 * amulets to the bag, titles to the saga's list. Each item comes once (it is noted in the saga's `found`); one that
 * does not fit in a full bag waits for the next time. giveXp runs it, and the server on load (saves from before the
 * rewards). With `out`, a toast for each. True if anything changed.
 */
export function ensureLevelRewards(p: PlayerState, out?: Change[]): boolean {
  const xp = p.saga?.xp ?? 0;
  if (!xp) return false;
  const prog = progressOf(p);
  prog.found ??= [];
  prog.titles ??= [];
  const level = xpLevel(xp);
  let changed = prog.level !== level;
  prog.level = level;
  for (let l = 2; l <= level; l++) {
    const r = LEVEL_REWARDS[l];
    if (!r) continue;
    if (r.title && !prog.titles.includes(r.title)) {
      prog.titles.push(r.title);
      changed = true;
    }
    if (!r.item || prog.found.includes(r.item)) continue;
    if (ITEMS[r.item]?.category === 'clothing') {
      if (!p.wardrobe.includes(r.item)) {
        p.wardrobe.push(r.item);
        out?.push(toast(p.id, fmt(T.sagaLevelToWardrobe, { item: itemName(r.item) })));
      }
    } else if (addItem(p.inventory, r.item, 1) > 0) {
      out?.push(toast(p.id, fmt(T.sagaLevelBagFull, { item: itemName(r.item) })));
      continue;
    } else out?.push(toast(p.id, fmt(T.sagaLevelToBag, { item: itemName(r.item) })));
    prog.found.push(r.item);
    changed = true;
  }
  return changed;
}

/** Experience for beating something out in the world or in the farm's cave (0: it gives none). */
export function killXpOf(species: string): number {
  const def = ANIMALS[species];
  if (def?.mob) return def.wild ? (def.mob.boss ? SAGA_XP.worldBoss : SAGA_XP.wild) : def.mob.boss ? SAGA_XP.caveBoss : SAGA_XP.cave;
  return def?.predator ? SAGA_XP.predator : 0;
}

/**
 * Something was beaten out in the world or in the farm's cave (attackMob calls this: the sword, the bow, the bazooka,
 * a spell): experience for whoever did it and for everyone within FIELD_SHARE tiles on the same map, class or not.
 * A roaming monster, a predator, a cave monster, the cave's troll king or a world boss (SAGA_XP). Dungeons count
 * their own (mobDown).
 */
export function killXp(area: WorldState, by: PlayerState, mob: AnimalState, out: Change[]): void {
  if (isSagaKey(area.area)) return;
  const n = killXpOf(mob.species);
  if (!n) return;
  const key = area.area ?? 'farm';
  const there = Object.values(area.players).filter((q) => q.id !== by.id && q.online && q.area === key && dist(q, mob) <= FIELD_SHARE);
  for (const q of [by, ...there]) {
    giveXp(q, n, out);
    // everyone's record goes out (the killer's too: not every kill path sends it), so the level chips follow
    out.push(playerChange(q));
  }
}

/**
 * The hero switch: walk the world as your class (spells, the weapon drawn, the hero outfit) or as a farmer again.
 * Needs a class; inside a dungeon you are always the hero.
 */
export function setHero(world: WorldState, playerId: string, on: boolean): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p) return [];
  const prog = progressOf(p);
  if (!prog.cls) return [toast(p.id, T.sagaHeroNeedClass)];
  if (isSagaKey(p.area)) return [toast(p.id, T.sagaHeroInDungeon)];
  if (!!prog.hero === on) return [];
  ensureGear(p);
  if (on) {
    const c = CLASSES[prog.cls].outfit;
    prog.farmOutfit = { ...p.outfit };
    p.outfit = { ...(prog.heroOutfit ?? { ...p.outfit, hat: c.hat, shirt: c.shirt }) };
  } else {
    prog.heroOutfit = { ...p.outfit };
    if (prog.farmOutfit) p.outfit = { ...prog.farmOutfit };
  }
  prog.hero = on;
  return [toast(p.id, on ? T.sagaHeroOn : T.sagaHeroOff), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p)];
}

/** What a player holds in the picture: their weapon while a hero (and in a dungeon), else what they have selected. */
export const shownHeld = (p: PlayerState): string | null => {
  const weapon = p.saga?.gear?.weapon;
  if (weapon && (p.saga?.hero || isSagaKey(p.area))) return weapon;
  return p.inventory[p.selected]?.item ?? null;
};

/** Spells out in the world: cooldowns and buffs per player (not saved; a restart makes them all ready). */
interface FieldState {
  cd: Record<string, number>;
  gcd: number;
  rage?: number;
  potionAt?: number;
  strong?: number;
}
const FIELD = new Map<string, FieldState>();
const fieldState = (id: string): FieldState => {
  let st = FIELD.get(id);
  if (!st) FIELD.set(id, (st = { cd: {}, gcd: 0 }));
  return st;
};
/** Spell power is counted in dungeon health; out in the world monsters have hearts, so it is divided by this. */
const FIELD_DIV = 8;
/** Monsters beaten this close count for everyone's experience, field task and quests (tiles). */
const FIELD_SHARE = 10;
const FIELD_POTION_HEARTS = 3;
const FIELD_HEAL_HEARTS = 2;

/** May this player cast spells where they are? A hero, out in the world (not the farm's cave, indoors or a dungeon). */
function canFieldCast(world: WorldState, p: PlayerState): boolean {
  if (!p.saga?.cls || !p.saga.hero || p.sleeping || p.hearts <= 0) return false;
  if (isSagaKey(p.area) || p.area === 'dungeon' || isIndoorKey(p.area)) return false;
  const area = getArea(farmOf(world), p.area);
  return !!area && !(isFarm(area) && inInterior(tileOf(p.x), tileOf(p.y)));
}

/** A monster out in the world is dazed: it stands still and does not bite for a while (sim's tickMob reads attackAt). */
const daze = (a: AnimalState, ms: number, now: number): void => {
  a.attackAt = Math.max(a.attackAt ?? 0, now + ATTACK_GAP + ms);
};

/**
 * A hero's spell out in the world, at the roaming monsters (any hostile animal) and the family. Damage is counted
 * in hearts like the sword's; heals give hearts back. `target`: an animal id or a player id (left out, the server
 * picks). castSpell sends a hero out in the world here by itself.
 */
export function castFieldSpell(world: WorldState, playerId: string, spellId: string, target: number | string | undefined, ctx: SimCtx, opts: { quiet?: boolean } = {}): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const sp = SPELLS[spellId];
  const cls = p?.saga?.cls;
  if (!p || !cls || !sp || !CLASSES[cls].spells.includes(spellId) || !canFieldCast(farm, p)) return [];
  const area = getArea(farm, p.area);
  if (!area) return [];
  const st = fieldState(p.id);
  const now = ctx.now;
  if (now < st.gcd || now < (st.cd[spellId] ?? 0)) return [];
  const key = p.area;
  const out: Change[] = [];
  const raging = st.rage !== undefined && now < st.rage;
  const pow = spellPower(p, st.strong, now) * (raging ? 1.5 : 1);
  const hostile = (a: AnimalState | undefined): a is AnimalState => !!a && isHostile(a) && !area.saga?.mobs[a.id];
  const inReach = (a: AnimalState, range: number, sight: boolean): boolean => dist(a, p) <= range + 0.6 && (!sight || lineOfSight(area, p.x, p.y, a.x, a.y));
  const pick = (range: number, sight: boolean): AnimalState | null => {
    const wanted = typeof target === 'number' ? area.animals[target] : undefined;
    if (hostile(wanted) && inReach(wanted, range, sight)) return wanted;
    let best: AnimalState | null = null;
    for (const a of Object.values(area.animals)) if (hostile(a) && inReach(a, range, sight) && (!best || dist(a, p) < dist(best, p))) best = a;
    return best;
  };
  const near = (at: { x: number; y: number }, r: number): AnimalState[] => Object.values(area.animals).filter((a) => hostile(a) && dist(a, at) <= r + 0.4);
  const strike = (a: AnimalState, base: number): void => {
    if (area.animals[a.id] === a) attackMob(area, p, a, Math.max(1, Math.round((base * pow) / FIELD_DIV)), ctx, out);
  };
  const friends = (r: number): PlayerState[] => Object.values(area.players).filter((q) => q.online && q.area === key && q.hearts > 0 && dist(q, p) <= r + 0.6);
  const noTarget = (): Change[] => (opts.quiet ? [] : [toast(p.id, T.sagaNoTarget)]);
  switch (sp.kind) {
    case 'melee':
    case 'bolt':
    case 'lance':
    case 'bash': {
      const a = pick(sp.range, sp.kind === 'bolt' || sp.kind === 'lance');
      if (!a) return noTarget();
      out.push(spellFx(key, p.id, sp.id, p, a, a.id));
      strike(a, sp.power);
      if ((sp.kind === 'bash' || sp.kind === 'lance') && area.animals[a.id]) daze(a, sp.kind === 'bash' ? (sp.ms ?? 1500) : 800, now);
      break;
    }
    case 'charge': {
      const a = pick(sp.range, true);
      if (!a) return noTarget();
      const d = Math.max(1, Math.hypot(p.x - a.x, p.y - a.y));
      const to = { x: a.x + ((p.x - a.x) / d) * TILE, y: a.y + ((p.y - a.y) / d) * TILE };
      const from = { x: p.x, y: p.y };
      if (!isSolidForPlayer(area, tileOf(to.x), tileOf(to.y))) warp(key, p, 0, 0, out, to);
      out.push(spellFx(key, p.id, sp.id, from, a, a.id));
      strike(a, sp.power);
      if (area.animals[a.id]) daze(a, sp.ms ?? 1000, now);
      break;
    }
    case 'storm': {
      const a = pick(sp.range, true);
      if (!a) return noTarget();
      const at = { x: a.x, y: a.y };
      out.push(spellFx(key, p.id, sp.id, p, at));
      for (const o of near(at, sp.radius ?? 2)) strike(o, sp.power);
      break;
    }
    case 'whirl':
      out.push(spellFx(key, p.id, sp.id, p));
      for (const o of near(p, sp.radius ?? 2)) strike(o, sp.power);
      break;
    case 'taunt':
      out.push(spellFx(key, p.id, sp.id, p));
      for (const a of near(p, sp.radius ?? 5)) {
        a.hunt = p.id;
        a.huntUntil = now + (sp.ms ?? 4000);
      }
      break;
    case 'heal': {
      const all = friends(sp.range).filter((q) => q.hearts < MAX_HEARTS);
      const q = all.find((x) => x.id === target) ?? all.sort((x, y) => x.hearts - y.hearts)[0];
      if (!q) return opts.quiet ? [] : [toast(p.id, T.sagaAllWell)];
      q.hearts = Math.min(MAX_HEARTS, q.hearts + FIELD_HEAL_HEARTS);
      out.push(spellFx(key, p.id, sp.id, p, q, q.id), playerChange(q));
      break;
    }
    case 'hot':
      out.push(spellFx(key, p.id, sp.id, p));
      for (const q of friends(sp.radius ?? 4))
        if (q.hearts < MAX_HEARTS) {
          q.hearts++;
          out.push(playerChange(q));
        }
      break;
    case 'revive':
      return opts.quiet ? [] : [toast(p.id, T.sagaNoneDown)];
    case 'wall':
      p.hurtUntil = now + (sp.ms ?? 6000);
      out.push(spellFx(key, p.id, sp.id, p));
      break;
    case 'rage':
      st.rage = now + (sp.ms ?? 8000);
      p.boostUntil = st.rage;
      out.push(spellFx(key, p.id, sp.id, p), playerChange(p));
      break;
    case 'blink': {
      const dir = p.facing === 'left' ? [-1, 0] : p.facing === 'right' ? [1, 0] : p.facing === 'up' ? [0, -1] : [0, 1];
      let to = { x: p.x, y: p.y };
      for (let s = 0.5; s <= sp.range; s += 0.5) {
        const nx = p.x + dir[0]! * s * TILE;
        const ny = p.y + dir[1]! * s * TILE;
        if (!inBounds(area, tileOf(nx), tileOf(ny)) || isSolidForPlayer(area, tileOf(nx), tileOf(ny))) break;
        to = { x: nx, y: ny };
      }
      out.push(spellFx(key, p.id, sp.id, p, to));
      warp(key, p, 0, 0, out, to);
      break;
    }
  }
  st.gcd = now + GCD_MS;
  st.cd[spellId] = now + sp.cd;
  return tagArea(out, key);
}

/** A healing potion out in the world: three hearts back. */
export function drinkFieldPotion(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !canFieldCast(farm, p)) return [];
  const st = fieldState(p.id);
  if (ctx.now < (st.potionAt ?? 0)) return [toast(p.id, T.sagaNotReady)];
  if (!removeItem(p.inventory, 'healing_potion', 1)) return [toast(p.id, T.sagaNoPotion)];
  st.potionAt = ctx.now + POTION_CD;
  p.hearts = Math.min(MAX_HEARTS, p.hearts + FIELD_POTION_HEARTS);
  return [spellFx(p.area, p.id, 'potion', p), playerChange(p)];
}

/**
 * The use key in hero mode out in the world (from performAction): a monster within the attack spell's reach gets the
 * spell. Pointing at something to open, talk to or pet still does that. Null: do the normal farm action.
 */
export function heroAction(world: WorldState, p: PlayerState, tx: number, ty: number, ctx: SimCtx): Change[] | null {
  const cls = p.saga?.cls;
  if (!cls || !canFieldCast(world, p)) return null;
  if (p.inventory[p.selected]?.item === STRENGTH_POTION) return drinkStrength(world, p.id, ctx);
  const obj = objectAt(world, tx, ty);
  if (obj && objectDef(obj.kind).interact) return null;
  const pointed = animalAt(world, tx, ty);
  if (pointed && !isHostile(pointed)) return null;
  if (npcAt(world, tx, ty)) return null;
  const sp = SPELLS[attackSpellOf(cls)]!;
  const sight = sp.kind !== 'melee' && sp.kind !== 'bash';
  const inReach = Object.values(world.animals).some((a) => isHostile(a) && dist(a, p) <= sp.range + 0.6 && (!sight || lineOfSight(world, p.x, p.y, a.x, a.y)));
  if (!inReach) return null;
  return castFieldSpell(world, p.id, sp.id, pointed?.id, ctx, { quiet: true });
}

/**
 * One of Loke's roaming servants is beaten out in the world (by a spell, the sword or anything else): field tasks
 * and villagers' kill quests for every hero close by (the experience comes from killXp), and a world boss leaves its treasure chest.
 * Returns false for anything that is not a roaming monster (the caller handles it as before).
 */
export function roamingDown(area: WorldState, by: PlayerState, mob: AnimalState, ctx: SimCtx, out: Change[]): boolean {
  const def = ANIMALS[mob.species];
  if (!def?.mob || !def.wild) return false;
  const key = area.area ?? 'farm';
  const there = Object.values(area.players).filter((q) => q.online && q.area === key && (q.id === by.id || dist(q, mob) <= FIELD_SHARE));
  if (!there.some((q) => q.id === by.id)) there.push(by);
  for (const q of there) {
    const prog = q.saga;
    if (!prog?.cls) continue;
    questCredit(area, q, mob.species, ctx, out, false);
    const ch = SAGA_CHAPTERS[prog.chapter];
    if (prog.heard && ch?.field?.target === mob.species) {
      const k = fieldKey(prog.chapter);
      const n = (prog.quests[k] ?? 0) + 1;
      if (n <= ch.field.count) {
        prog.quests[k] = n;
        out.push(toast(q.id, n >= ch.field.count ? fmt(T.sagaFieldDone, { text: ch.field.text }) : fmt(T.sagaFieldProgress, { text: ch.field.text, n, count: ch.field.count })));
      }
    }
    // (killXp has already sent each of them, and objects are sent by reference)
  }
  if (def.mob.boss) {
    // the world boss's chest: one per map, filled again for everyone each time the boss is beaten
    let chest = Object.values(area.objects).find((o) => o.kind === 'loot_chest' && o.loot === WORLD_BOSS_LOOT) ?? null;
    if (chest) chest.openedBy = {};
    else {
      const tx = tileOf(mob.x);
      const ty = tileOf(mob.y);
      for (let r = 0; r <= 2 && !chest; r++)
        for (let dy = -r; dy <= r && !chest; dy++)
          for (let dx = -r; dx <= r && !chest; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !isSolidForPlayer(area, tx + dx, ty + dy)) chest = addObject(area, 'loot_chest', tx + dx, ty + dy, { loot: WORLD_BOSS_LOOT });
    }
    if (chest) out.push({ t: 'object', id: chest.id, obj: chest });
    bump(by, 'worldBoss', 1, out);
    out.push(toast(null, fmt(T.sagaWorldBossDown, { names: there.map((q) => q.name).join(' och '), boss: mob.name })));
  } else out.push(toast(by.id, fmt(T.sagaRoamDown, { name: mob.name })));
  out.push(playerChange(by));
  return true;
}
/** The loot table of a world boss's chest (LOOT in data.ts). */
const WORLD_BOSS_LOOT = 'worldboss';

// ---------------------------------------------------------------------------
// Round 4: Smedjan at Smed-Stina in Köpingen
// ---------------------------------------------------------------------------

/** Does the player wear this piece or have it in the bag? */
const ownsGear = (p: PlayerState, itemId: string): boolean => Object.values(p.saga?.gear ?? {}).includes(itemId) || countItem(p.inventory, itemId) > 0;

/** What is missing to pay for a forge step or a craft (item names with how many more), empty when it can be paid. */
function missingFor(p: PlayerState, cost: { items: [string, number][]; anyOf?: ForgeCost['anyOf'] }): string[] {
  const lack: string[] = [];
  for (const [item, n] of cost.items) {
    const have = countItem(p.inventory, item);
    if (have < n) lack.push(`${n - have} ${itemName(item)}`);
  }
  if (cost.anyOf) {
    const have = cost.anyOf.items.reduce((sum, item) => sum + countItem(p.inventory, item), 0);
    if (have < cost.anyOf.count) lack.push(fmt(T.forgeNeedAnyOf, { n: cost.anyOf.count - have, items: cost.anyOf.items.map(itemName).join(', ') }));
  }
  return lack;
}

/** Takes a cost's materials and coins (it must be payable): the "any of" part from the first kinds in its list the player has. */
function pay(p: PlayerState, cost: { items: [string, number][]; anyOf?: ForgeCost['anyOf']; kr: number }): void {
  for (const [item, n] of cost.items) removeItem(p.inventory, item, n);
  if (cost.anyOf) {
    let left = cost.anyOf.count;
    for (const item of cost.anyOf.items) {
      const take = Math.min(left, countItem(p.inventory, item));
      if (take > 0) removeItem(p.inventory, item, take);
      left -= take;
      if (!left) break;
    }
  }
  p.coins -= cost.kr;
}

/** Why a player cannot pay (a toast), or null when they can. */
function cannotPay(p: PlayerState, cost: { items: [string, number][]; anyOf?: ForgeCost['anyOf']; kr: number }): Change | null {
  const lack = missingFor(p, cost);
  if (lack.length) return toast(p.id, fmt(T.forgeNeedItems, { items: lack.join(', ') }));
  if (p.coins < cost.kr) return toast(p.id, fmt(T.forgeNeedKr, { kr: cost.kr, have: p.coins }));
  return null;
}

/**
 * Smed-Stina forges a weapon, an offhand or an amulet one level up (to at most +FORGE_MAX), for the materials and coins
 * of FORGE_COSTS. The player stands by Stina and wears the piece or has it in the bag. A toast for every refusal.
 */
export function forgeGear(world: WorldState, playerId: string, itemId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  if (!nearNpc(farm, p, SMITH_ID)) return [toast(p.id, T.forgeNotNear)];
  if (!gearSlotOf(itemId)) return [toast(p.id, fmt(T.forgeNotGear, { item: itemName(itemId) }))];
  if (!ownsGear(p, itemId)) return [toast(p.id, fmt(T.forgeNotOwned, { item: itemName(itemId) }))];
  const prog = progressOf(p);
  const level = forgeLevel(prog, itemId);
  if (level >= FORGE_MAX) return [toast(p.id, fmt(T.forgeAtMax, { item: itemName(itemId) }))];
  const cost = FORGE_COSTS[level + 1]!;
  const no = cannotPay(p, cost);
  if (no) return [no];
  pay(p, cost);
  (prog.forge ??= {})[itemId] = level + 1;
  const out: Change[] = [];
  bump(p, 'forged', 1, out);
  out.push(toast(p.id, fmt(T.forged, { item: itemName(itemId), n: level + 1 })), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p));
  return out;
}

/** Smed-Stina makes a piece of the starter set (FORGE_CRAFTS): once for each hero, for materials and coins. */
export function craftGear(world: WorldState, playerId: string, itemId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const recipe = FORGE_CRAFTS[itemId];
  if (!p || !recipe) return [];
  if (!nearNpc(farm, p, SMITH_ID)) return [toast(p.id, T.forgeNotNear)];
  const prog = progressOf(p);
  prog.found ??= [];
  if (prog.found.includes(itemId) || ownsGear(p, itemId)) return [toast(p.id, fmt(T.forgeCraftedAlready, { item: itemName(itemId) }))];
  const no = cannotPay(p, recipe);
  if (no) return [no];
  pay(p, recipe);
  if (addItem(p.inventory, itemId, 1) > 0) {
    // no room: everything back
    for (const [item, n] of recipe.items) addItem(p.inventory, item, n);
    p.coins += recipe.kr;
    return [toast(p.id, T.sagaEquipBagFull)];
  }
  prog.found.push(itemId);
  return [toast(p.id, fmt(T.forgeCrafted, { item: itemName(itemId) })), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p)];
}
