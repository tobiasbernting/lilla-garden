// Sagan om Världsträdet's windows and dungeon HUD, as HTML over the game. Out in the world: Kämpastenen's class
// cards, Völvan Sigrun's story and the saga's journal, the villagers' saga quests, a quest tracker, the family list
// to jump to someone. Inside a dungeon: the spell bar (keys 1–4 and a potion on 5) instead of the hotbar, your
// health and your target's, the party, the boss's health and the attack it is getting ready, its shouts, big
// banners (with fireworks for a beaten boss), the loot window, and what happens while you are fallen or frozen.
// Out in the world with hero mode on, the spell bar and your frame (hearts for health) and your target's come along,
// and the gear window puts a weapon, an offhand and an amulet on the hero.
import {
  ATTACK_KINDS,
  BLOCK_SPECIES,
  CLASSES,
  CLASS_IDS,
  DISCOVERABLE,
  DOWN_MS,
  FORGE_COSTS,
  FORGE_CRAFTS,
  FORGE_MAX,
  SMITH_ID,
  FRIEND_KINDS,
  DUNGEONS,
  DUNGEON_IDS,
  GEAR_SLOTS,
  LANDMARKS,
  LEVEL_REWARDS,
  MAX_LEVEL,
  MAX_HEARTS,
  NPCS,
  RARITY_COLORS,
  RARITY_NAMES,
  RARITY_POWER,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_QUESTS,
  SPELLS,
  T,
  TILE,
  VOLVA_ID,
  areaName,
  chapterDone,
  combatDef,
  countItem,
  fieldCount,
  fighterMax,
  fmt,
  forgeLevel,
  forgeStats,
  gearOf,
  gearSlotOf,
  gearStats,
  heroLevel,
  isBathKey,
  isHallKey,
  isSagaKey,
  itemName,
  landmarkKind,
  levelSpan,
  parseSeenKey,
  placeEmoji,
  placeName,
  previousDungeon,
  questCount,
  questState,
  readProgress,
  sagaItem,
  type Change,
  type ClassId,
  type ForgeCost,
  type GearSlot,
  type PlayerState,
  type Rarity,
  type SagaItemDef,
  type SagaQuest,
} from '@lilla-garden/shared';
import { getArt, portraitUrl } from '../art/textures.ts';
import { net } from '../net.ts';
import {
  FLAG,
  castSlot,
  classOf,
  cooldown,
  cycleTarget,
  drinkPotion,
  fightMode,
  flagsOf,
  getTarget,
  heroOn,
  inSaga,
  levelOf,
  liveTarget,
  myClass,
  posOf,
  potionCooldown,
  potionCount,
  pressedAt,
  sagaSnap,
  sagaStarted,
  sagaTick,
  setTarget,
  showsLevel,
  titleOf,
  webbed,
} from '../saga.ts';
import { SAGA_SFX } from '../sagasfx.ts';
import { SFX } from '../sound.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from '../state.ts';
import { clear, h, onTap } from './dom.ts';
import type { Menus } from './menus.ts';
import './saga.css';

/** Spells that stop a boss's big attack (Sköldslag, Stormsteg, Isspjut). */
const INTERRUPTS = new Set(['bash', 'charge', 'lance']);
/** Spells aimed at a monster, and at a friend: out of reach shows on their button. */
const AT_MONSTER = ATTACK_KINDS;
const AT_FRIEND = FRIEND_KINDS;
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KIND_EMOJI: Record<string, string> = { weapon: '⚔️', offhand: '🛡️', amulet: '📿', hat: '🪖', shirt: '👕', pet: '🐾', mount: '🐎', potion: '🧪', decor: '✨', quest: '📦', material: '💠' };
const FLAG_ICONS: [number, string][] = [
  [FLAG.down, '💀'],
  [FLAG.frozen, '🧊'],
  [FLAG.wall, '🧱'],
  [FLAG.rage, '🔥'],
  [FLAG.hot, '🌿'],
  [FLAG.slow, '🐌'],
];

type Win = 'class' | 'volva' | 'journal' | 'family' | 'loot' | 'gear' | 'finds' | 'forge';
/** The windows that are tabs of the saga's book. */
const BOOK: readonly Win[] = ['journal', 'gear', 'finds'];
type LootChange = Extract<Change, { t: 'loot' }>;
type BannerChange = Extract<Change, { t: 'banner' }>;

const flagIcons = (fl: number): string => FLAG_ICONS.filter(([f]) => fl & f).map(([, e]) => e).join('');
const hpColor = (k: number): string => (k > 0.5 ? '#4fcf5a' : k > 0.25 ? '#f2c33a' : '#e8473a');
/** Sets CSS custom properties (a style object can't). */
const vars = <E extends HTMLElement>(el: E, v: Record<string, string>): E => {
  for (const [k, val] of Object.entries(v)) el.style.setProperty(k, val);
  return el;
};

/** A health bar that is updated in place, so it slides. */
class Meter {
  readonly el: HTMLElement;
  private fill = h('i');
  private label = h('span');
  constructor(cls = 'hp') {
    this.el = h('div', { class: cls }, this.fill, this.label);
  }
  set(k: number, text: string, color?: string): void {
    const w = `${Math.max(0, Math.min(1, k)) * 100}%`;
    if (this.fill.style.width !== w) this.fill.style.width = w;
    if (color && this.fill.dataset.c !== color) {
      this.fill.dataset.c = color;
      this.fill.style.background = color;
    }
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}

/** A portrait line: emoji, name, flags and a health bar (you, your target, each friend). */
class UnitView {
  readonly el: HTMLElement;
  private em = h('span', { class: 'em' });
  private nm = h('span', { class: 'txt' });
  private fl = h('span', { class: 'fl' });
  readonly meter = new Meter();
  constructor(cls: string) {
    this.el = h('div', { class: cls }, this.em, h('div', { class: 'col' }, h('div', { class: 'nm' }, this.nm, this.fl), this.meter.el));
  }
  set(emoji: string, name: string, f: [number, number, number] | null, color: string, numbers = true): void {
    const k = f ? Math.max(0, f[0] / Math.max(1, f[1])) : 1;
    if (this.em.textContent !== emoji) this.em.textContent = emoji;
    if (this.nm.textContent !== name) this.nm.textContent = name;
    const icons = f ? flagIcons(f[2]) : '';
    if (this.fl.textContent !== icons) this.fl.textContent = icons;
    this.el.style.setProperty('--c', color);
    this.el.classList.toggle('dead', !!f && !!(f[2] & FLAG.down));
    this.el.classList.toggle('frozen', !!f && !!(f[2] & FLAG.frozen));
    this.meter.set(k, f && numbers ? `${f[0]} / ${f[1]}` : f ? String(f[0]) : '', hpColor(k));
  }
}

/** Has this item a picture of its own (not empty, nor the magenta square of art still to be drawn)? */
const drawn = new Map<string, boolean>();
function hasIcon(id: string): boolean {
  let ok = drawn.get(id);
  if (ok === undefined) {
    const c = getArt().icons[id]?.canvas;
    const d = c?.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, c.width, c.height).data;
    let solid = 0;
    let magenta = 0;
    for (let i = 0; d && i < d.length; i += 4) {
      if (d[i + 3]! < 128) continue;
      solid++;
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) magenta++;
    }
    ok = solid > 12 && magenta < solid / 2;
    drawn.set(id, ok);
  }
  return ok;
}
/** An item's picture for the HTML windows (an emoji while it has none yet). */
const itemIcon = (id: string, fallback?: string): HTMLElement => {
  const url = getArt().iconUrl[id];
  return url && hasIcon(id) ? h('img', { src: url, alt: '', draggable: 'false' }) : h('span', { class: 'em' }, fallback ?? KIND_EMOJI[sagaItem(id)?.kind ?? ''] ?? '🎁');
};
/** A level-up banner's golden line: what the new level gives, with its picture. */
function levelSub(c: BannerChange): HTMLElement {
  const n = Number(/\d+/.exec(c.text)?.[0] ?? heroLevel(myPlayer()?.saga));
  const r = LEVEL_REWARDS[n];
  const pic = r?.item ? itemIcon(r.item) : r?.title ? h('span', { class: 'em' }, '👑') : r?.aura ? h('span', { class: 'em' }, r.aura === 2 ? '🌈' : '✨') : null;
  return h('div', { class: 'sub reward' }, pic ? h('span', { class: 'pic' }, pic) : null, h('span', null, c.sub ?? ''));
}
const rewardText = (r: { coins: number; stars: number; item?: string; count?: number; title?: string }): string =>
  [`+${r.coins} ${T.coins}`, `+${r.stars} ⭐`, r.item ? `${itemName(r.item)}${(r.count ?? 1) > 1 ? ` × ${r.count}` : ''}` : '', r.title ? `👑 ${r.title}` : ''].filter(Boolean).join(' · ');

/** The experience bar: how far into this level, and the experience needed for the next. */
function xpMeter(xp: number): HTMLElement {
  const span = levelSpan(xp);
  const k = span.next === null ? 1 : (xp - span.from) / Math.max(1, span.next - span.from);
  return h('div', { class: 'saga-meter xp' }, h('i', { style: { width: `${Math.max(0, Math.min(1, k)) * 100}%` } }), h('span', null, span.next === null ? T.sagaXpMax : fmt(T.sagaXpOf, { xp, next: span.next })));
}
/** What a level gives, as small pieces: a picture and a name for each item, title and glow. */
function rewardParts(level: number): HTMLElement[] {
  const r = LEVEL_REWARDS[level];
  if (!r) return [];
  const parts: HTMLElement[] = [];
  if (r.item) {
    const d = sagaItem(r.item);
    const el = h('span', { class: `rw${d ? ` rar-${d.rarity}` : ''}` }, itemIcon(r.item), h('b', null, itemName(r.item)));
    if (d) vars(el, { '--r': RARITY_COLORS[d.rarity] });
    parts.push(el);
  }
  if (r.title) parts.push(h('span', { class: 'rw title' }, h('span', { class: 'em' }, '👑'), h('b', null, fmt(T.sagaRewardTitle, { title: r.title }))));
  if (r.aura) parts.push(h('span', { class: `rw aura a${r.aura}` }, h('span', { class: 'em' }, r.aura === 2 ? '🌈' : '✨'), h('b', null, r.aura === 2 ? T.sagaRewardAura2 : T.sagaRewardAura1)));
  return parts;
}

/** A fraction as "+12 %". */
const pct = (k: number): string => `+${Math.round(k * 100)} %`;
const SLOT_NAMES: Record<GearSlot, () => string> = { weapon: () => T.sagaSlotWeapon, offhand: () => T.sagaSlotOffhand, amulet: () => T.sagaSlotAmulet };
const SLOT_HINTS: Record<GearSlot, () => string> = { weapon: () => T.sagaSlotWeaponHint, offhand: () => T.sagaSlotOffhandHint, amulet: () => T.sagaSlotAmuletHint };
const SLOT_EMOJI: Record<GearSlot, string> = { weapon: '⚔️', offhand: '🛡️', amulet: '📿' };
/** What a piece of gear gives: "Kraft +10 % · Hälsa +15 · Skydd 6 %" (a weapon's power comes from its rarity). */
function statLine(d: SagaItemDef): string {
  const power = (d.kind === 'weapon' ? RARITY_POWER[d.rarity] - 1 : 0) + (d.stats?.power ?? 0);
  const parts: string[] = [];
  if (power > 0) parts.push(fmt(T.sagaStatPower, { n: pct(power) }));
  if (d.stats?.hp) parts.push(fmt(T.sagaStatHp, { n: d.stats.hp }));
  if (d.stats?.armor) parts.push(fmt(T.sagaStatArmor, { n: Math.round(d.stats.armor * 100) }));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Smedjan: Smed-Stina's forge levels and costs
// ---------------------------------------------------------------------------

/** The villager whose window has the forge's button (ui/menus.ts). */
export const FORGE_NPC = SMITH_ID;
/** A piece's forge level for a player (0 unforged). */
const forgeOf = (p: PlayerState | undefined, item: string): number => forgeLevel(p?.saga, item);
/** Five stars, the forged ones filled and golden, the rest dim: "★★☆☆☆". */
const stars = (level: number): HTMLElement => h('span', { class: 'stars', title: fmt(T.forgeLevel, { n: level }) }, h('b', null, '★'.repeat(level)), h('i', null, '☆'.repeat(Math.max(0, FORGE_MAX - level))));
/** An item's name with its forge level: "Järnsvärd +2". */
const forgedName = (name: string, level: number): string => (level > 0 ? `${name} +${level}` : name);

/** What a piece gives at a forge level, as one short line (its power, health and armor together). */
function forgeLine(item: string, level: number): string {
  const st = forgeStats(item, level);
  const d = sagaItem(item);
  // a weapon's power is its rarity's times what the forge and its own stats add (as gearStats counts it)
  const power = d?.kind === 'weapon' ? RARITY_POWER[d.rarity] * (1 + st.power) - 1 : st.power;
  const parts: string[] = [];
  if (power > 0) parts.push(`💪 ${pct(power)}`);
  if (st.hp) parts.push(`❤️ +${st.hp}`);
  if (st.armor) parts.push(`🛡️ ${Math.round(st.armor * 100)} %`);
  return parts.join(' ');
}

/** One thing a forge level or a craft costs, with how much of it you have. */
interface CostPart {
  /** The item(s) it may be paid in (several: any of them, mixed). Empty for the coins. */
  items: string[];
  need: number;
  have: number;
}
/** A cost (materials, "any of" materials and coins) as parts, measured against a player's bag and purse. */
function costParts(me: PlayerState, cost: ForgeCost): CostPart[] {
  const parts: CostPart[] = cost.items.map(([item, need]) => ({ items: [item], need, have: countItem(me.inventory, item) }));
  if (cost.anyOf) parts.push({ items: cost.anyOf.items, need: cost.anyOf.count, have: cost.anyOf.items.reduce((n, it) => n + countItem(me.inventory, it), 0) });
  parts.push({ items: [], need: cost.kr, have: me.coins });
  return parts;
}
const affordable = (parts: CostPart[]): boolean => parts.every((c) => c.have >= c.need);
/** A cost as chips: each material's picture with "have / need" in green or red, then the kr. */
function costChips(parts: CostPart[]): HTMLElement {
  const row = h('div', { class: 'forge-cost' });
  for (const c of parts) {
    const ok = c.have >= c.need;
    if (!c.items.length) {
      row.append(h('span', { class: `chip-cost coins ${ok ? 'ok' : 'no'}`, title: T.coins }, h('span', { class: 'em' }, '🪙'), h('b', null, `${c.need} ${T.coins}`)));
      continue;
    }
    const pics = h('span', { class: `pics${c.items.length > 1 ? ' any' : ''}` }, ...c.items.map((it) => itemIcon(it, '💠')));
    const label = c.items.length > 1 ? fmt(T.forgeAnyOf, { items: c.items.map(itemName).join(', ') }) : itemName(c.items[0]!);
    row.append(h('span', { class: `chip-cost ${ok ? 'ok' : 'no'}`, title: label }, pics, h('b', null, `${Math.min(c.have, 999)} / ${c.need}`)));
  }
  return row;
}

/** Every piece of gear a player owns: what they wear, then the bag's (each once). */
function ownedGear(me: PlayerState): { item: string; slot: GearSlot; worn: boolean }[] {
  const out: { item: string; slot: GearSlot; worn: boolean }[] = [];
  const seen = new Set<string>();
  const worn = gearOf(me);
  for (const slot of GEAR_SLOTS) {
    const id = worn[slot];
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({ item: id, slot, worn: true });
    }
  }
  for (const st of me.inventory) {
    const slot = st ? gearSlotOf(st.item) : null;
    if (!st || !slot || seen.has(st.item)) continue;
    seen.add(st.item);
    out.push({ item: st.item, slot, worn: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Upptäcktsboken: the landmarks of the wild maps
// ---------------------------------------------------------------------------

const lmPics = new Map<string, string>();
/** A landmark's picture as it stands in the world (its first frame), for the journal. */
function landmarkPic(id: string): HTMLElement {
  let url = lmPics.get(id);
  if (url === undefined) {
    url = getArt().objects[landmarkKind(id)]?.frames[0]?.dataUrl() ?? '';
    lmPics.set(id, url);
  }
  return url ? h('img', { src: url, alt: '', draggable: 'false' }) : h('span', { class: 'em' }, '🧭');
}
/** The landmark ids of each biome, in DISCOVERABLE order (biomes without any are left out). */
function landmarksByBiome(): { biome: (typeof DISCOVERABLE)[number]; ids: string[] }[] {
  const out: { biome: (typeof DISCOVERABLE)[number]; ids: string[] }[] = [];
  for (const biome of DISCOVERABLE) {
    const ids = Object.keys(LANDMARKS).filter((id) => LANDMARKS[id]!.biome === biome);
    if (ids.length) out.push({ biome, ids });
  }
  return out;
}
/**
 * The world map's marks: for each map where you have seen a landmark, 'seen' while one of them is still to be
 * touched, 'found' once every one seen there is discovered.
 */
export function landmarkMarks(me: PlayerState): Map<string, 'seen' | 'found'> {
  const prog = readProgress(me);
  const found = new Set(prog.discovered ?? []);
  const marks = new Map<string, 'seen' | 'found'>();
  for (const s of prog.seen ?? []) {
    const at = parseSeenKey(s);
    if (!at) continue;
    const { area, id } = at;
    if (!found.has(id)) marks.set(area, 'seen');
    else if (!marks.has(area)) marks.set(area, 'found');
  }
  return marks;
}
/** What the forge has done for a player, as text that changes when a level is reached or a piece is smithed. */
const forgeKey = (p: PlayerState | undefined): string => {
  const prog = readProgress(p);
  return `${JSON.stringify(prog.forge ?? {})}|${prog.found.filter((id) => id in FORGE_CRAFTS).join(',')}`;
};
/** "4:07" from milliseconds. */
const clock = (ms: number): string => {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Where someone is, for the family list. */
function placeOf(area: string): string {
  if (area === 'farm' || area === 'dungeon' || isBathKey(area) || isHallKey(area)) return areaName(area);
  if (isSagaKey(area)) return `⚔️ ${areaName(area)}`;
  const biome = client.biomes[area] ?? client.areas[area]?.biome;
  return `${placeEmoji(biome)} ${placeName(biome)}`;
}

/**
 * A chapter of Act II in its parts, for the tracker and the journal: the task out in the world ("🗡️ Jaga bort 6
 * mosspökar…: 2/6") and the dungeon. Empty for a chapter with only one part (its goal line says it all).
 */
function chapterParts(index: number): { text: string; done: boolean }[] {
  const ch = SAGA_CHAPTERS[index];
  const prog = readProgress(myPlayer());
  if (!ch?.field) return [];
  const parts: { text: string; done: boolean }[] = [];
  const n = Math.min(ch.field.count, index === prog.chapter ? fieldCount(prog) : ch.field.count);
  const fieldDone = n >= ch.field.count;
  parts.push({ text: fieldDone ? fmt(T.sagaFieldDone, { text: ch.field.text }) : `🗡️ ${fmt(T.sagaFieldProgress, { text: ch.field.text, n, count: ch.field.count })}`, done: fieldDone });
  if (ch.dungeon) {
    const d = DUNGEONS[ch.dungeon];
    const done = prog.cleared.includes(ch.dungeon);
    const boss = SAGA_BOSSES[d.boss]?.name ?? d.boss;
    parts.push({ text: `${done ? '✅' : '⚔️'} ${fmt(T.sagaDungeonLine, { boss, dungeon: d.name })}`, done });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// The villagers' saga quests (in their window: ui/menus.ts)
// ---------------------------------------------------------------------------

/** The first chapter of Act II, Lokes list (a heading over it in the journal). */
const ACT_TWO = 4;

const questsOf = (npcId: string): SagaQuest[] => SAGA_QUESTS.filter((q) => q.npc === npcId);

/** Does this villager have a saga quest for you to take, follow or hand in? */
export function hasSagaQuests(npcId: string): boolean {
  const me = myPlayer();
  return questsOf(npcId).some((q) => {
    const st = questState(me, q);
    return st === 'offer' || st === 'active' || st === 'ready';
  });
}

/** A villager's saga quests: new ones with their story, ones in progress, and ones to hand in. */
export function sagaQuestRows(npcId: string): HTMLElement {
  const me = myPlayer()!;
  const wrap = h('div', { class: 'saga-quests' }, h('div', { class: 'saga-head' }, T.sagaQuestsHead));
  for (const q of questsOf(npcId)) {
    const st = questState(me, q);
    if (st === 'locked' || st === 'done') continue;
    const card = h('div', { class: `saga-quest ${st}` }, h('div', { class: 'q-title' }, `${st === 'ready' ? '❓' : st === 'offer' ? '❗' : '📜'} ${q.title}`));
    if (st === 'offer' || st === 'ready') card.append(h('div', { class: 'q-say' }, (st === 'offer' ? q.tell : q.done).join(' ')));
    if (st !== 'ready') card.append(h('div', { class: 'q-goal' }, `🎯 ${q.goal}`));
    if (st === 'active') {
      const n = Math.min(q.count, questCount(me, q));
      card.append(h('div', { class: 'saga-meter' }, h('i', { style: { width: `${(n / q.count) * 100}%` } }), h('span', null, fmt(T.sagaQuestAt, { n, count: q.count }))));
    }
    card.append(h('div', { class: 'q-reward' }, fmt(T.sagaReward, { reward: rewardText(q.reward) })));
    if (st !== 'active') {
      const b = h('button', null, st === 'offer' ? T.sagaTakeQuest : T.sagaHandIn);
      onTap(b, () => net.send({ t: 'saga', a: 'quest', id: q.id }));
      card.append(h('div', { class: 'q-act' }, b));
    }
    wrap.append(card);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// The HUD and the windows
// ---------------------------------------------------------------------------

interface Slot {
  el: HTMLElement;
  sweep: HTMLElement;
  num: HTMLElement;
  /** Spell id, 'potion' or 'aim' (the next monster, on touch screens). */
  id: string;
  wasCooling: boolean;
  last: string;
}

export class SagaUi {
  /** Called when a saga window opens or closes (the game stops reading keys and taps meanwhile). */
  onChange: (open: boolean) => void = () => {};

  private modal: HTMLElement | null = null;
  private win: Win | null = null;
  /** Völvan's window: the line she is on, and which chapter and part those lines belong to. */
  private line = 0;
  private lineKey = '';
  private volvaTab: 'story' | 'journal' = 'story';
  /** Kämpastenen: the class looked at. */
  private pickCls: ClassId | null = null;
  private loots: LootChange[] = [];
  /** Smedjan: the tab looked at, and the forge levels and crafted pieces last seen (to ring the anvil when one grows). */
  private forgeTab: 'upgrade' | 'craft' = 'upgrade';
  private forgeSeen = '';

  private bar = h('div', { class: 'saga-bar' });
  private tip = h('div', { class: 'saga-tip' });
  private slots: Slot[] = [];
  private barFor = '';
  private units = h('div', { class: 'saga-units' });
  private meFrame = new UnitView('saga-unit me');
  private targetFrame = new UnitView('saga-unit target');
  private party = h('div', { class: 'saga-party' });
  private partyRows = new Map<string, UnitView>();
  private boss = h('div', { class: 'saga-boss' });
  private bossFor = -1;
  private bossMeter = new Meter();
  private bossPhase = h('span', { class: 'pips' });
  private castBar = h('div', { class: 'saga-cast' });
  private castFill = h('i');
  private castName = h('span', { class: 'nm' });
  private yellEl = h('div', { class: 'saga-yell' });
  private yellTimer = 0;
  private banners = h('div', { class: 'saga-banners' });
  private bannerQueue: BannerChange[] = [];
  private bannerBusy = false;
  private down = h('div', { class: 'saga-down' });
  private downSince = 0;
  private wasDown = false;
  private tracker = h('div', { class: 'saga-tracker' });
  private trackerOpen = true;
  private hint = h('div', { class: 'saga-hint' });
  /** The dungeon the aiming hint was shown for (it shows once when you come in). */
  private hintFor = '';

  constructor(
    private ui: HTMLElement,
    hudRoot: HTMLElement,
    private menus: Menus,
    social: HTMLElement,
  ) {
    this.units.append(this.meFrame.el, this.targetFrame.el);
    this.castBar.append(this.castFill, this.castName);
    this.bar.append(this.tip);
    hudRoot.append(this.party, this.units, this.boss, this.castBar, this.yellEl, this.bar, this.hint, this.tracker, this.down, this.banners);
    onTap(this.tracker, () => {
      this.trackerOpen = !this.trackerOpen;
      this.renderTracker();
    });
    // the family list sits with the chat button
    const fam = h('div', { class: 'round small', title: T.familyBtn }, '👪');
    onTap(fam, () => this.open('family'));
    social.append(fam);

    // the gear window: the HUD's ⚔️ button and the gamepad's Select ask for it
    document.addEventListener('lilla:gear', () => {
      if (myClass()) this.open('gear');
    });
    // the journal's level page: the HUD's level chip asks for it
    document.addEventListener('lilla:journal', () => this.open('journal'));
    // Smedjan: Smed-Stina's window asks for it (ui/menus.ts)
    document.addEventListener('lilla:forge', () => this.open('forge'));
    bus.on('open', (c) => {
      if (c.ui === 'sagaClass') this.open('class');
      else if (c.ui === 'saga') this.open('volva');
    });
    bus.on('change', (c) => this.fromServer(c));
    bus.on('me', () => {
      this.sync();
      this.renderTracker();
      this.forgeRang();
      if (this.modal && this.win !== 'loot') this.render();
      this.renderUnits();
    });
    bus.on('area', () => this.sync());
    bus.on('welcome', () => {
      this.sync();
      this.renderTracker();
    });
    bus.on('state', () => this.onState());
    bus.on('target', () => {
      this.renderUnits();
      if (liveTarget() !== null) SAGA_SFX.target();
    });
    bus.on('connection', (s) => {
      if (s !== 'open') this.close();
    });
    const frame = (): void => {
      requestAnimationFrame(frame);
      this.frame();
    };
    requestAnimationFrame(frame);
    this.sync();
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  /**
   * Keys: 1–4 spells and 5 a potion in a fight (a dungeon, or hero mode out in the world), Tab the next monster,
   * J the saga's journal, G the gear window. True if used.
   */
  key(e: KeyboardEvent): boolean {
    if (this.modal) {
      if (e.key === 'Escape' || (this.win === 'gear' && (e.key === 'g' || e.key === 'G')) || (this.win !== null && BOOK.includes(this.win) && (e.key === 'j' || e.key === 'J'))) this.close();
      return true;
    }
    // no hotbar in a fight: the number keys are spells, even with the backpack open
    if (fightMode() && /^[1-8]$/.test(e.key)) {
      if (this.menus.isOpen()) return true;
      if (e.key <= '4') castSlot(Number(e.key) - 1);
      else if (e.key === '5') drinkPotion();
      return true;
    }
    if (this.menus.isOpen()) return false;
    if (e.key === 'j' || e.key === 'J') {
      // the saga's book; a player who has only found landmarks so far gets the discoveries page
      const me = myPlayer();
      if (sagaStarted(me) || showsLevel(me)) this.open('journal');
      else if (readProgress(me).discovered?.length) this.open('finds');
      else return false;
      return true;
    }
    if ((e.key === 'g' || e.key === 'G') && myClass()) {
      this.open('gear');
      return true;
    }
    if (!fightMode()) return false;
    if (e.key === 'Tab') {
      e.preventDefault();
      cycleTarget();
    } else if (e.key === 'Escape' && getTarget() !== null) setTarget(null);
    else return false;
    return true;
  }

  // ---- reacting to the server ----

  private fromServer(c: Change): void {
    if (c.t === 'loot') {
      this.loots.push(c);
      if (this.win !== 'loot') this.nextLoot();
    } else if (c.t === 'banner') this.banner(c);
    else if (c.t === 'yell') this.yell(c.name, c.text);
  }

  /** In a fight or not: the spell bar instead of the hotbar, and the class's own buttons. */
  private sync(): void {
    const here = inSaga();
    const fight = fightMode();
    document.body.classList.toggle('in-saga', here);
    document.body.classList.toggle('saga-fight', fight);
    const cls = myClass();
    const want = fight && cls ? cls.id : '';
    if (want !== this.barFor) this.buildBar();
    this.renderUnits();
    if (!here) {
      this.party.hidden = true;
      this.boss.hidden = true;
      this.castBar.hidden = true;
      this.down.hidden = true;
      this.wasDown = false;
      // out in the world: the aiming hint once when hero mode goes on
      if (!fight) {
        this.hint.hidden = true;
        this.hintFor = '';
      } else if (this.hintFor !== 'hero') {
        this.hintFor = 'hero';
        this.showHint();
      }
      // out of a boss fight too (the tracker shows again)
      if (document.body.classList.contains('saga-bossfight')) {
        document.body.classList.remove('saga-bossfight');
        this.renderTracker();
      }
    } else if (this.hintFor !== myPlayer()?.area) {
      // a hint about aiming when you come in, fading after a while
      this.hintFor = myPlayer()?.area ?? '';
      this.showHint();
    }
  }

  private showHint(): void {
    this.hint.hidden = false;
    this.hint.textContent = document.body.classList.contains('touch') ? T.sagaTargetHintTouch : T.sagaTargetHint;
    this.hint.classList.remove('fade');
    void this.hint.offsetWidth;
    this.hint.classList.add('fade');
  }

  // ---- the spell bar ----

  private buildBar(): void {
    for (const s of this.slots) s.el.remove();
    this.slots = [];
    const cls = myClass();
    this.barFor = fightMode() && cls ? cls.id : '';
    this.bar.hidden = !this.barFor;
    if (!cls || !this.barFor) return;
    const add = (id: string, icon: HTMLElement, key: string, name: string, text: string, act: () => void, extra = ''): void => {
      const sweep = h('i', { class: 'sweep' });
      const num = h('b', { class: 'cd' });
      const el = h('div', { class: `saga-spell${extra}` }, h('span', { class: 'ic' }, icon), sweep, num, h('span', { class: 'key' }, key));
      this.pressable(el, act, () => this.showTip(el, name, text, key));
      this.bar.insertBefore(el, this.tip);
      this.slots.push({ el, sweep, num, id, wasCooling: false, last: '' });
    };
    cls.spells.forEach((id, i) => {
      const sp = SPELLS[id]!;
      add(id, h('span', null, sp.icon), String(i + 1), sp.name, sp.text, () => castSlot(i));
    });
    add('potion', itemIcon('healing_potion', '🧪'), '5', T.sagaPotionKey, sagaItem('healing_potion')?.text ?? '', drinkPotion, ' potion');
    // touch screens have no Tab key: a button for the next monster
    add('aim', h('span', null, '🎯'), '', T.sagaAimName, T.sagaAimText, cycleTarget, ' aim');
  }

  /**
   * A spell button: it fires the moment it is pressed, like the ✋ button (a small finger that holds the button or
   * slides off it must still get its spell). Hovering, or holding a finger on it, shows what the spell does.
   */
  private pressable(el: HTMLElement, act: () => void, tip: () => void): void {
    let timer = 0;
    let held = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'mouse') {
        if (e.button === 0) act();
        return;
      }
      act();
      held = true;
      timer = window.setTimeout(tip, 420);
    });
    const release = (): void => {
      if (!held) return;
      held = false;
      clearTimeout(timer);
      this.tip.classList.remove('on');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') tip();
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.tip.classList.remove('on');
      else release();
    });
  }

  private showTip(el: HTMLElement, name: string, text: string, key: string): void {
    clear(this.tip);
    this.tip.append(h('b', null, name), h('span', { class: 'k' }, key), h('div', null, text));
    this.tip.classList.add('on');
    const bar = this.bar.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    this.tip.style.left = `${r.left + r.width / 2 - bar.left}px`;
  }

  /** Is the spell's target out of reach (or none in reach at all)? */
  private outOfReach(spell: string): boolean {
    const sp = SPELLS[spell];
    const me = myPlayer();
    const t = liveTarget();
    if (!sp || !me || t === null) return false;
    const aimed = (AT_MONSTER.has(sp.kind) && typeof t === 'number') || (AT_FRIEND.has(sp.kind) && typeof t === 'string');
    if (!aimed) return false;
    const at = posOf(t);
    return !!at && Math.hypot(at.x - me.x, at.y - me.y) / TILE > sp.range + 0.6;
  }

  /** Every frame in a fight: cooldown sweeps, the boss's attack filling up, being fallen or frozen. */
  private frame(): void {
    if (!fightMode()) return;
    sagaTick();
    const fl = flagsOf(client.me);
    const off = !!(fl & (FLAG.down | FLAG.frozen));
    const kick = !!sagaSnap()?.b?.cast?.kick;
    const now = performance.now();
    for (const s of this.slots) {
      if (s.id === 'aim') continue;
      const cd = s.id === 'potion' ? potionCooldown() : cooldown(s.id);
      const cooling = cd.left > 0;
      const k = cooling ? 1 - cd.left / cd.total : 1;
      const num = cd.left > 1000 ? String(Math.ceil(cd.left / 1000)) : '';
      const sp = SPELLS[s.id];
      const pots = s.id === 'potion' ? potionCount() : 1;
      const press = now - (pressedAt[s.id] ?? 0) < 140;
      const far = !!sp && this.outOfReach(s.id);
      // the boss is winding up something this spell can stop
      const stop = !!sp && kick && INTERRUPTS.has(sp.kind) && !cooling && !off;
      const state = `${+cooling}${+off}${+press}${+far}${+stop}${pots}`;
      if (cooling) s.sweep.style.setProperty('--p', `${(k * 100).toFixed(1)}%`);
      if (num !== s.num.textContent) s.num.textContent = num;
      if (state !== s.last) {
        s.last = state;
        s.el.classList.toggle('cooling', cooling);
        s.el.classList.toggle('off', off || pots <= 0);
        s.el.classList.toggle('press', press);
        s.el.classList.toggle('far', far);
        s.el.classList.toggle('kick', stop);
        if (s.id === 'potion') s.el.dataset.n = String(pots);
      }
      if (s.wasCooling && !cooling) {
        // ready again: a quick shine
        s.el.classList.remove('ready');
        void s.el.offsetWidth;
        s.el.classList.add('ready');
      }
      s.wasCooling = cooling;
    }
    this.frameCast();
    this.frameDown(fl);
  }

  // ---- your health and your target's ----

  private renderUnits(): void {
    const snap = sagaSnap();
    const me = myPlayer();
    const cls = myClass();
    if (!snap) {
      // out in the world: your hearts, and the monster you aim at with its hearts
      this.units.hidden = !fightMode() || inSaga();
      if (this.units.hidden || !me) return;
      this.meFrame.set(cls?.emoji ?? '🙂', me.name, [Math.max(0, me.hearts), MAX_HEARTS, 0], cls?.color ?? '#ffe98a');
      const t = liveTarget();
      const a = typeof t === 'number' ? activeWorld()?.animals[t] : undefined;
      this.targetFrame.el.hidden = !a;
      if (!a) return;
      const max = combatDef(a)?.hp;
      this.targetFrame.set(combatDef(a)?.boss ? '💀' : '👹', a.name, max ? [Math.max(0, a.hp ?? max), max, 0] : null, '#ff8a70');
      return;
    }
    this.units.hidden = false;
    this.meFrame.set(cls?.emoji ?? '🙂', me?.name ?? T.sagaYou, snap.f[client.me] ?? null, cls?.color ?? '#ffe98a');
    const t = liveTarget();
    // the boss has its own bar at the top
    this.targetFrame.el.hidden = t === null || t === snap.b?.id;
    if (t === null || t === snap.b?.id) return;
    if (typeof t === 'string') {
      const p = client.world?.players[t];
      const c = classOf(p);
      this.targetFrame.set(c?.emoji ?? '🙂', p?.name ?? '', snap.f[t] ?? null, c?.color ?? '#9fe08a');
    } else {
      const a = activeWorld()?.animals[t];
      const m = snap.m[t];
      // a monster still waiting has its full health (the server only sends those that are fighting or hurt)
      this.targetFrame.set(a?.species === 'spindelnat' ? '🕸️' : a && BLOCK_SPECIES.has(a.species) ? '🧊' : a && SAGA_BOSSES[a.species] ? '💀' : '👹', a?.name ?? '', m ? [m[0], m[1], 0] : null, '#ff8a70', !!m);
    }
  }

  // ---- the party ----

  private renderParty(): void {
    const snap = sagaSnap();
    const ids = snap ? Object.keys(snap.f) : [];
    this.party.hidden = ids.length === 0;
    const name = (id: string): string => client.world?.players[id]?.name ?? '';
    ids.sort((a, b) => (a === client.me ? -1 : b === client.me ? 1 : name(a).localeCompare(name(b))));
    for (const [id, row] of this.partyRows)
      if (!ids.includes(id)) {
        row.el.remove();
        this.partyRows.delete(id);
      }
    const t = liveTarget();
    ids.forEach((id, i) => {
      let row = this.partyRows.get(id);
      if (!row) {
        row = new UnitView('saga-member');
        // a friend to heal: tap their frame
        onTap(row.el, () => setTarget(liveTarget() === id ? null : id));
        this.partyRows.set(id, row);
      }
      if (this.party.children[i] !== row.el) this.party.insertBefore(row.el, this.party.children[i] ?? null);
      const c = classOf(client.world?.players[id]);
      row.set(c?.emoji ?? '🙂', name(id), snap!.f[id]!, c?.color ?? '#cccccc', false);
      row.el.classList.toggle('sel', t === id);
    });
  }

  // ---- the boss ----

  private renderBoss(): void {
    const snap = sagaSnap();
    const b = snap?.b;
    const a = b ? activeWorld()?.animals[b.id] : undefined;
    const def = a ? SAGA_BOSSES[a.species] : undefined;
    this.boss.hidden = !def;
    document.body.classList.toggle('saga-bossfight', !!def);
    if (!b || !def) {
      this.castBar.hidden = true;
      this.bossFor = -1;
      return;
    }
    if (this.bossFor !== b.id) {
      // a new boss: its name, title, and marks on the bar where its phases begin
      this.bossFor = b.id;
      clear(this.boss);
      this.bossMeter = new Meter();
      for (const p of def.phases) this.bossMeter.el.append(h('b', { class: 'mark', style: { left: `${p * 100}%` } }));
      this.boss.append(h('div', { class: 'top' }, h('span', { class: 'crown' }, def.mini ? '💀' : '👑'), h('b', null, def.name), h('span', { class: 'title' }, def.title), this.bossPhase), this.bossMeter.el);
    }
    const m = snap!.m[b.id];
    this.bossMeter.set(m ? m[0] / Math.max(1, m[1]) : 1, m ? `${m[0]} / ${m[1]}` : '');
    clear(this.bossPhase);
    if (def.phases.length) this.bossPhase.append(fmt(T.sagaPhase, { n: b.phase + 1 }), ...[0, ...def.phases].map((_, i) => h('i', { class: i <= b.phase ? 'on' : '' })));
    const cast = b.cast;
    this.castBar.hidden = !cast;
    if (cast) {
      this.castBar.classList.toggle('kick', cast.kick);
      const label = `${cast.kick ? '🛡️ ' : '⚠️ '}${cast.name}${cast.kick ? ` · ${T.sagaCanKick}` : ''}`;
      if (this.castName.textContent !== label) this.castName.textContent = label;
    }
  }

  private frameCast(): void {
    const cast = sagaSnap()?.b?.cast;
    if (!cast || this.castBar.hidden) return;
    const k = 1 - Math.max(0, cast.at - serverNow()) / Math.max(1, cast.warn);
    this.castFill.style.width = `${Math.min(100, k * 100).toFixed(1)}%`;
  }

  private onState(): void {
    if (!fightMode()) return;
    this.renderUnits();
    if (!inSaga()) return;
    this.renderParty();
    this.renderBoss();
    this.tracker.hidden = this.trackerHidden();
  }

  // ---- shouts, banners, fallen and frozen ----

  private yell(name: string, text: string): void {
    clear(this.yellEl);
    this.yellEl.append(h('b', null, `${name}:`), ` ${text}`);
    this.yellEl.classList.remove('on');
    void this.yellEl.offsetWidth;
    this.yellEl.classList.add('on');
    clearTimeout(this.yellTimer);
    this.yellTimer = window.setTimeout(() => this.yellEl.classList.remove('on'), 5200);
    SAGA_SFX.yell();
    // and in the chat, so it can be read again
    bus.emit('chat', { t: 'chat', from: '', name: `⚔️ ${name}`, text, at: Date.now() });
  }

  private banner(c: BannerChange): void {
    this.bannerQueue.push(c);
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner(): void {
    const c = this.bannerQueue.shift();
    if (!c) {
      this.bannerBusy = false;
      document.body.classList.remove('saga-banner-on');
      return;
    }
    this.bannerBusy = true;
    document.body.classList.add('saga-banner-on');
    const kind = c.kind ?? 'enter';
    // a landmark found: its picture over the words, and a little longer to read its story
    const lm = kind === 'reward' ? Object.keys(LANDMARKS).find((id) => c.text.includes(LANDMARKS[id]!.name)) : undefined;
    const el = h('div', { class: `saga-banner ${kind}${lm ? ' landmark' : ''}` }, lm ? h('div', { class: 'lm-pic' }, landmarkPic(lm)) : null, h('div', { class: 'big' }, c.text), c.sub ? (kind === 'level' ? levelSub(c) : h('div', { class: 'sub' }, c.sub)) : null);
    this.banners.append(el);
    if (kind === 'boss' || kind === 'cleared') {
      this.confetti(kind === 'cleared' ? 90 : 55, true);
      SAGA_SFX.fanfare(true);
    } else if (kind === 'reward') {
      this.confetti(45, false);
      SAGA_SFX.fanfare(false);
    } else if (kind === 'level') {
      this.confetti(50, false);
      SAGA_SFX.fanfare(false);
    } else if (kind === 'wipe') SAGA_SFX.sombre();
    else if (kind === 'rest' && c.text === T.sagaPuzzleOpen) {
      // the rune plates all lit: a chime and a shower of golden sparkles
      SAGA_SFX.chime();
      this.sparkles(30);
    } else if (kind === 'rest') SAGA_SFX.calm();
    else SAGA_SFX.banner();
    const ms = kind === 'cleared' || lm ? 5200 : kind === 'boss' || kind === 'reward' || kind === 'enter' || kind === 'chapter' || kind === 'level' ? 4300 : 3200;
    setTimeout(() => el.classList.add('out'), ms - 600);
    setTimeout(() => {
      el.remove();
      this.nextBanner();
    }, ms);
  }

  /** Golden sparkles drifting down (a puzzle solved). */
  private sparkles(n: number): void {
    const layer = h('div', { class: 'saga-confetti sparkle' });
    for (let i = 0; i < n; i++)
      layer.append(h('i', { style: { left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 0.8}s`, animationDuration: `${1.8 + Math.random() * 1.4}s` } }));
    this.ui.append(layer);
    setTimeout(() => layer.remove(), 4000);
  }

  /** Confetti raining down, and fireworks bursting for a beaten boss. */
  private confetti(n: number, fireworks: boolean): void {
    const colours = ['#ffd23f', '#ff5a8a', '#5fd38d', '#4fa8ff', '#b06ef0', '#ff8a3a', '#ffffff'];
    const layer = h('div', { class: 'saga-confetti' });
    for (let i = 0; i < n; i++) {
      const c = colours[i % colours.length]!;
      layer.append(
        h('i', {
          style: {
            left: `${Math.random() * 100}%`,
            background: c,
            animationDelay: `${Math.random() * 0.9}s`,
            animationDuration: `${2.2 + Math.random() * 1.6}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          },
        }),
      );
    }
    if (fireworks)
      for (let f = 0; f < 5; f++) {
        const burst = h('div', { class: 'burst', style: { left: `${15 + Math.random() * 70}%`, top: `${12 + Math.random() * 35}%`, animationDelay: `${0.3 + f * 0.45}s` } });
        const c = colours[f % colours.length]!;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          burst.append(vars(h('b', { style: { background: c, boxShadow: `0 0 6px ${c}`, animationDelay: `${0.3 + f * 0.45}s` } }), { '--dx': `${(Math.cos(a) * 34).toFixed(1)}`, '--dy': `${(Math.sin(a) * 34).toFixed(1)}` }));
        }
        layer.append(burst);
      }
    this.ui.append(layer);
    setTimeout(() => layer.remove(), 5200);
  }

  private frameDown(fl: number): void {
    const isDown = !!(fl & FLAG.down);
    const frozen = !!(fl & FLAG.frozen);
    if (isDown && !this.wasDown) {
      this.downSince = serverNow();
      SAGA_SFX.fall();
    }
    if (!isDown && this.wasDown) SAGA_SFX.rise();
    this.wasDown = isDown;
    this.down.hidden = !isDown && !frozen;
    // a spider's web holds you like the ice does
    const web = frozen && !isDown && webbed(client.me);
    this.down.classList.toggle('ice', frozen && !isDown && !web);
    this.down.classList.toggle('web', web);
    if (this.down.hidden) return;
    let title = web ? T.sagaWebbedTitle : T.sagaFrozenTitle;
    let sub = web ? T.sagaWebbedSub : T.sagaFrozenSub;
    if (isDown) {
      title = T.sagaFallenTitle;
      const all = Object.values(sagaSnap()?.f ?? {}).every((f) => f[2] & FLAG.down);
      sub = all ? T.sagaWipeSub : fmt(T.sagaFallenSub, { s: Math.max(1, Math.ceil((DOWN_MS - (serverNow() - this.downSince)) / 1000)) });
    }
    const text = `${title}\n${sub}`;
    if (this.down.dataset.text !== text) {
      this.down.dataset.text = text;
      clear(this.down);
      this.down.append(h('div', { class: 'box' }, h('b', null, `${isDown ? '💀' : web ? '🕸️' : '🧊'} ${title}`), h('span', null, sub)));
    }
  }

  // ---- the quest tracker ----

  private trackerHidden(): boolean {
    return !sagaStarted(myPlayer()) || document.body.classList.contains('saga-bossfight');
  }

  private renderTracker(): void {
    const me = myPlayer();
    this.tracker.hidden = this.trackerHidden();
    if (!me || this.tracker.hidden) return;
    const prog = readProgress(me);
    clear(this.tracker);
    this.tracker.append(h('div', { class: 'head' }, T.sagaJournalTab, h('span', null, this.trackerOpen ? '▾' : '▸')));
    if (!this.trackerOpen) return;
    const ch = SAGA_CHAPTERS[prog.chapter];
    if (ch) {
      const parts = prog.heard && !chapterDone(prog) ? chapterParts(prog.chapter) : [];
      if (parts.length) for (const p of parts) this.tracker.append(h('div', { class: `line${p.done ? ' done' : ''}` }, p.text));
      else {
        const line = !prog.heard ? T.sagaVisitVolva : chapterDone(prog) ? T.sagaBackToVolva : ch.goal;
        this.tracker.append(h('div', { class: `line${prog.heard && chapterDone(prog) ? ' done' : ''}` }, `${prog.heard ? '🎯' : '❗'} ${line}`));
      }
    }
    for (const q of SAGA_QUESTS) {
      const st = questState(me, q);
      if (st !== 'active' && st !== 'ready') continue;
      const npc = NPCS[q.npc]?.name ?? q.npc;
      this.tracker.append(h('div', { class: `line${st === 'ready' ? ' done' : ''}` }, `${q.title}: `, h('b', null, st === 'ready' ? fmt(T.sagaQuestReadyAt, { npc }) : fmt(T.sagaQuestAt, { n: Math.min(q.count, questCount(me, q)), count: q.count }))));
    }
  }

  // ---- windows ----

  open(win: Win): void {
    this.close();
    this.win = win;
    if (win === 'volva') this.volvaTab = 'story';
    if (win === 'class') this.pickCls = readProgress(myPlayer()).cls ?? null;
    if (win === 'forge') {
      this.forgeTab = 'upgrade';
      this.forgeSeen = forgeKey(myPlayer());
    }
    this.modal = h('div', { class: 'modal saga-modal' });
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal && this.win !== 'loot') this.close();
    });
    this.ui.append(this.modal);
    this.render();
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    if (this.win === 'loot') this.loots.shift();
    this.modal.remove();
    this.modal = null;
    this.win = null;
    this.onChange(false);
    // treasure that came while another window was open
    if (this.loots.length) setTimeout(() => this.nextLoot(), 250);
  }

  private render(): void {
    if (!this.modal || !this.win) return;
    const me = myPlayer();
    if (!me) return;
    clear(this.modal);
    const closeBtn = h('button', { class: 'close' }, '✕');
    onTap(closeBtn, () => this.close());
    const titles: Record<Win, string> = {
      class: `🗿 ${T.sagaStoneTitle}`,
      volva: `🔮 ${NPCS[VOLVA_ID]?.name ?? ''}`,
      journal: `📖 ${T.sagaJournalTitle}`,
      family: `👪 ${T.familyTitle}`,
      loot: '',
      gear: `⚔️ ${T.sagaGearTitle}`,
      finds: `📖 ${T.sagaJournalTitle}`,
      forge: `🔨 ${T.forgeTitle}`,
    };
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: `panel saga-panel ${this.win}` });
    const purse = this.win === 'forge' ? h('span', { class: 'price' }, `🪙 ${me.coins} ${T.coins}`) : null;
    if (this.win !== 'loot') panel.append(h('h2', null, titles[this.win], h('span', { class: 'spacer' }), purse, closeBtn));
    panel.append(body);
    if (this.win === 'class') this.renderClass(body);
    else if (this.win === 'volva') this.renderVolva(panel, body);
    else if (BOOK.includes(this.win)) {
      // the journal, the gear window and the discoveries are tabs of one book (the gear one only with a class)
      const pages: [Win, string][] = [['journal', T.sagaJournalTab]];
      if (myClass()) pages.push(['gear', `⚔️ ${T.sagaGearTitle}`]);
      pages.push(['finds', T.sagaFindsTab]);
      {
        const tabs = h('div', { class: 'tabs' });
        for (const [w, label] of pages) {
          const b = h('button', { class: this.win === w ? 'on' : '' }, label);
          onTap(b, () => {
            if (this.win === w) return;
            this.win = w;
            SFX.talk();
            this.render();
          });
          tabs.append(b);
        }
        panel.insertBefore(tabs, body);
      }
      if (this.win === 'gear') this.renderGear(body);
      else if (this.win === 'finds') this.renderFinds(body);
      else this.renderJournal(body);
    } else if (this.win === 'forge') this.renderForge(panel, body);
    else if (this.win === 'family') this.renderFamily(body);
    else this.renderLoot(panel, body);
    this.modal.append(panel);
  }

  // Kämpastenen: the four classes, one looked at closely, and the one you have
  private renderClass(body: HTMLElement): void {
    const mine = readProgress(myPlayer()).cls;
    const pick = this.pickCls ?? mine ?? CLASS_IDS[0]!;
    body.append(h('p', { class: 'saga-intro' }, T.sagaStoneIntro));
    const tabs = h('div', { class: 'saga-classes' });
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      const b = vars(h('button', { class: `cls${id === pick ? ' on' : ''}` }, h('span', { class: 'em' }, c.emoji), h('span', { class: 'nm' }, c.name), h('span', { class: 'role' }, c.roleName), id === mine ? h('span', { class: 'mine' }, `✓ ${T.sagaMine}`) : null), { '--c': c.color });
      onTap(b, () => {
        this.pickCls = id;
        SFX.talk();
        this.render();
      });
      tabs.append(b);
    }
    body.append(tabs);
    const c = CLASSES[pick];
    const spells = h('div', { class: 'saga-spells' });
    c.spells.forEach((id, i) => {
      const sp = SPELLS[id]!;
      spells.append(h('div', { class: 'sp' }, h('span', { class: 'ic' }, sp.icon), h('div', null, h('b', null, `${sp.name} `, h('span', { class: 'k' }, String(i + 1))), h('div', { class: 'tx' }, sp.text))));
    });
    const choose = h('button', { class: 'pick', disabled: pick === mine }, pick === mine ? `✓ ${T.sagaMine}` : `${T.sagaPick}: ${c.emoji} ${c.name}`);
    onTap(choose, () => {
      if (pick === mine) return;
      net.send({ t: 'saga', a: 'class', cls: pick });
      SAGA_SFX.spell('lakekrets');
      setTimeout(() => this.close(), 350);
    });
    const top = h('div', { class: 'top' }, h('span', { class: 'em' }, c.emoji), h('div', null, h('b', null, c.name), h('div', { class: 'tags' }, h('span', { class: 'role' }, c.roleName), h('span', null, `❤️ ${fmt(T.sagaHealth, { hp: c.hp })}`))));
    const card = h('div', { class: 'saga-classcard' }, top, h('p', { class: 'blurb' }, c.blurb), h('div', { class: 'saga-head' }, T.sagaSpellsTitle), spells, h('div', { class: 'q-act' }, choose));
    body.append(vars(card, { '--c': c.color }));
  }

  // Völvan Sigrun: the chapter as a story, line by line; the journal; or a chat
  private renderVolva(panel: HTMLElement, body: HTMLElement): void {
    const tabs = h('div', { class: 'tabs' });
    const tab = (label: string, on: boolean, fn: () => void): void => {
      const b = h('button', { class: on ? 'on' : '' }, label);
      onTap(b, fn);
      tabs.append(b);
    };
    tab(T.sagaStoryTab, this.volvaTab === 'story', () => {
      this.volvaTab = 'story';
      this.render();
    });
    tab(T.sagaJournalTab, this.volvaTab === 'journal', () => {
      this.volvaTab = 'journal';
      this.render();
    });
    tab(T.sagaTalk, false, () => {
      this.close();
      this.menus.talkTo(VOLVA_ID);
    });
    panel.insertBefore(tabs, body);
    if (this.volvaTab === 'journal') {
      this.renderJournal(body);
      return;
    }
    const me = myPlayer()!;
    const prog = readProgress(me);
    const npc = NPCS[VOLVA_ID]!;
    const ch = SAGA_CHAPTERS[prog.chapter];
    const portrait = h('img', { class: 'portrait', src: portraitUrl(npc.appearance, npc.outfit, 4) });
    if (!ch) {
      body.append(h('div', { class: 'npc-talk' }, portrait, h('div', { class: 'bubble-text' }, T.sagaAllDone)));
      return;
    }
    const mode = !prog.heard ? 'tell' : chapterDone(prog) ? 'done' : 'goal';
    const lines = mode === 'tell' ? ch.tell : mode === 'done' ? ch.done : [ch.tell[ch.tell.length - 1]!];
    const key = `${prog.chapter}:${mode}`;
    if (key !== this.lineKey) {
      this.lineKey = key;
      this.line = 0;
    }
    const heading = prog.chapter === 0 ? ch.title : fmt(T.sagaChapter, { n: prog.chapter, title: ch.title });
    const said = h('div', { class: 'saga-lines' });
    lines.slice(0, this.line + 1).forEach((l, i) => said.append(h('p', { class: i === this.line ? 'now' : '' }, l)));
    body.append(h('div', { class: 'saga-chapter' }, `📜 ${heading}`), h('div', { class: 'npc-talk' }, portrait, said));
    const act = h('div', { class: 'q-act' });
    if (this.line < lines.length - 1) {
      const more = h('button', null, T.sagaMore);
      onTap(more, () => {
        this.line++;
        SFX.talk();
        this.render();
      });
      act.append(more);
    } else if (mode === 'tell') {
      body.append(h('div', { class: 'saga-goal' }, h('b', null, `🎯 ${T.sagaGoal}: `), ch.goal), h('div', { class: 'q-reward' }, fmt(T.sagaReward, { reward: rewardText(ch.reward) })));
      const yes = h('button', null, T.sagaPromise);
      onTap(yes, () => net.send({ t: 'saga', a: 'chapter' }));
      act.append(yes);
    } else if (mode === 'done') {
      body.append(h('div', { class: 'q-reward big' }, fmt(T.sagaReward, { reward: rewardText(ch.reward) })));
      const take = h('button', { class: 'gold' }, `🎁 ${T.sagaTakeReward}`);
      onTap(take, () => net.send({ t: 'saga', a: 'chapter' }));
      act.append(take);
    } else {
      body.append(h('div', { class: 'saga-goal' }, h('b', null, `🎯 ${T.sagaGoal}: `), ch.goal));
      if (!prog.cls) {
        const way = h('button', null, T.sagaChooseWay);
        onTap(way, () => this.open('class'));
        act.append(way);
      }
    }
    body.append(act);
  }

  // The saga so far: chapters, the dungeons and how to beat their bosses, titles
  private renderJournal(body: HTMLElement): void {
    const prog = readProgress(myPlayer());
    this.renderLevels(body);
    body.append(h('div', { class: 'saga-head' }, T.sagaChapters));
    const chapters = h('div', { class: 'saga-list' });
    SAGA_CHAPTERS.forEach((ch, i) => {
      if (i > prog.chapter) return;
      // the second part of the saga begins after Surt
      if (i === ACT_TWO) chapters.append(h('div', { class: 'act' }, `🌀 ${T.sagaActTwo}`));
      const done = i < prog.chapter;
      const name = i === 0 ? ch.title : fmt(T.sagaChapter, { n: i, title: ch.title });
      const parts = !done && prog.heard ? chapterParts(i) : [];
      const need = h('span', { class: 'need' }, done ? ch.done[0]! : prog.heard ? ch.goal : T.sagaVisitVolva);
      chapters.append(
        h(
          'div',
          { class: `row${done ? ' done' : ''}` },
          h('span', { class: 'badge' }, done ? '✅' : '📜'),
          h('span', { class: 'name' }, name, h('br'), need, ...parts.map((p) => h('span', { class: `part${p.done ? ' done' : ''}` }, p.text))),
          done ? null : h('span', { class: 'price' }, T.sagaChapterNow),
        ),
      );
    });
    body.append(chapters, h('div', { class: 'saga-head' }, T.sagaDungeons));
    for (const id of DUNGEON_IDS) {
      const d = DUNGEONS[id];
      const cleared = prog.cleared.includes(id);
      const prev = previousDungeon(id);
      const open = cleared || (!!prog.cls && (!prev || prog.cleared.includes(prev)));
      const card = h('div', { class: `saga-dungeon${cleared ? ' cleared' : ''}${open ? '' : ' sealed'}` }, h('div', { class: 'top' }, h('b', null, `⚔️ ${d.name}`), h('span', { class: 'tag' }, cleared ? T.sagaClearedTag : open ? '' : `🔒 ${T.sagaSealed}`)));
      if (!open) card.append(h('div', { class: 'tx' }, T.sagaUnknown));
      else {
        // today's treasure from each boss (full once a day, a smaller chest after that), and the family's best time
        const chests = h('div', { class: 'chests' });
        for (const b of [d.mini, d.boss]) {
          const def = SAGA_BOSSES[b]!;
          const taken = prog.chestDay?.[b] === client.day;
          chests.append(h('span', { class: `chest-day ${taken ? 'taken' : 'left'}`, title: taken ? T.sagaChestTakenTip : T.sagaChestLeftTip }, `${taken ? '📦' : '🎁'} ${def.name}: `, h('b', null, `${T.sagaChestToday} ${taken ? T.sagaChestTaken : T.sagaChestLeft}`)));
        }
        const best = client.world?.sagaBest?.[id];
        chests.append(h('span', { class: `best${best ? '' : ' none'}` }, best ? `⏱️ ${fmt(T.sagaBestTime, { time: clock(best.ms), names: best.names.join(', ') })}` : `⏱️ ${T.sagaNoBestTime}`));
        card.append(chests);
        for (const b of [d.mini, d.boss]) {
          const def = SAGA_BOSSES[b]!;
          const moves = h('ul', { class: 'moves' });
          for (const mv of def.moves) moves.append(h('li', null, h('b', null, `${mv.interrupt ? '🛡️ ' : '🔴 '}${mv.name}: `), mv.text));
          card.append(h('div', { class: 'boss' }, h('div', null, h('b', null, `${def.mini ? '💀' : '👑'} ${def.name}`), h('span', { class: 'title' }, ` · ${def.title}`)), cleared ? h('div', { class: 'lore' }, def.lore) : null, h('div', { class: 'tx' }, fmt(T.sagaHowToFight, { boss: def.name })), moves));
        }
      }
      body.append(card);
    }
    body.append(h('div', { class: 'saga-head' }, T.sagaTitles));
    body.append(prog.titles.length ? h('div', { class: 'saga-titles' }, ...prog.titles.map((t) => h('span', null, `👑 ${t}`))) : h('div', { class: 'hint' }, T.sagaNoTitles));
  }

  // The hero level: where you are, the experience bar, and what every level gives (the ones reached shine)
  private renderLevels(body: HTMLElement): void {
    const me = myPlayer()!;
    const xp = me.saga?.xp ?? 0;
    const level = levelOf(me);
    body.append(h('div', { class: 'saga-head' }, `⭐ ${T.sagaHeroLevelHead}`));
    body.append(h('div', { class: 'saga-level' }, h('b', { class: 'lvl' }, `⭐ ${fmt(T.sagaLevelOf, { n: level, max: MAX_LEVEL })}`), xpMeter(xp), h('p', { class: 'tx' }, T.sagaLevelIntro)));
    const list = h('div', { class: 'saga-levels' });
    let next = true;
    for (const n of Object.keys(LEVEL_REWARDS).map(Number).sort((a, b) => a - b)) {
      const got = level >= n;
      const row = h('div', { class: `lv${got ? ' got' : ''}${!got && next ? ' next' : ''}` }, h('span', { class: 'n' }, got ? `✓ ${n}` : fmt(T.sagaRewardLocked, { n })), h('span', { class: 'rws' }, ...rewardParts(n)));
      if (!got) next = false;
      list.append(row);
    }
    body.append(list);
  }

  // The gear window: the hero, their level and what they carry; tap a piece in the bag to put it on, tap a worn one to
  // take it off again. Clothes are changed in the wardrobe.
  private renderGear(body: HTMLElement): void {
    const me = myPlayer()!;
    const prog = readProgress(me);
    const cls = myClass();
    if (!cls) return;
    const worn = gearOf(me);
    const gs = gearStats(me);
    const span = levelSpan(prog.xp ?? 0);
    const xp = prog.xp ?? 0;
    const title = titleOf(me);

    // the hero: portrait, level, experience, what it all adds up to
    const meter = xpMeter(xp);
    const totals = h(
      'div',
      { class: 'totals' },
      h('span', { class: 'pow' }, `💪 ${fmt(T.sagaStatPower, { n: pct(gs.power - 1) })}`),
      h('span', { class: 'hp' }, `❤️ ${fmt(T.sagaHealth, { hp: fighterMax(me, cls.id) })}`),
      h('span', { class: 'arm' }, `🛡️ ${fmt(T.sagaStatArmor, { n: Math.round(gs.armor * 100) })}`),
    );
    const heroBtn = h('button', { class: `hero-toggle${heroOn(me) ? ' on' : ''}`, disabled: inSaga() }, heroOn(me) ? `🧑‍🌾 ${T.sagaFarmerMode}` : `${cls.emoji} ${T.sagaHeroMode}`);
    onTap(heroBtn, () => {
      if (inSaga()) return;
      net.send({ t: 'saga', a: 'hero', on: !heroOn(me) });
      SAGA_SFX.hero(!heroOn(me));
    });
    const card = vars(
      h(
        'div',
        { class: 'hero' },
        h('img', { class: 'portrait', src: portraitUrl(me.appearance, me.outfit, 4), alt: '' }),
        h(
          'div',
          { class: 'who' },
          h('b', { class: 'nm' }, me.name),
          title ? h('span', { class: 'ttl' }, `👑 ${title}`) : null,
          h('span', { class: 'cls' }, `${cls.emoji} ${cls.name} · ${cls.roleName}`),
          h('span', { class: 'lvl' }, `⭐ ${fmt(T.sagaLevelOf, { n: span.level, max: MAX_LEVEL })}`),
          meter,
          totals,
          h('div', { class: 'q-act' }, heroBtn),
        ),
      ),
      { '--c': cls.color },
    );

    // the three slots
    const slots = h('div', { class: 'slots' });
    for (const slot of GEAR_SLOTS) {
      const id = worn[slot];
      const d = id ? sagaItem(id) : undefined;
      const fl = id ? forgeOf(me, id) : 0;
      const el = h('div', { class: `gslot${d ? ` rar-${d.rarity}` : ' empty'}${fl ? ' forged' : ''}` }, h('span', { class: 'slot-name' }, SLOT_NAMES[slot]()));
      if (d && id) {
        el.append(h('span', { class: 'pic' }, itemIcon(id)), h('b', { class: 'nm' }, forgedName(d.name, fl), fl ? stars(fl) : null), h('span', { class: 'st' }, fl ? forgeLine(id, fl) : statLine(d)), h('span', { class: 'off' }, `✋ ${T.sagaTapOff}`));
        vars(el, { '--r': RARITY_COLORS[d.rarity], '--fl': String(fl) });
        onTap(el, () => {
          net.send({ t: 'saga', a: 'equip', slot, item: null });
          SFX.talk();
        });
      } else el.append(h('span', { class: 'pic' }, h('span', { class: 'em' }, SLOT_EMOJI[slot])), h('span', { class: 'tx' }, SLOT_HINTS[slot]()));
      slots.append(el);
    }
    // clothes: shown here, changed in the wardrobe
    const clothes = h('div', { class: 'clothes' }, h('span', { class: 'slot-name' }, T.sagaClothes));
    for (const part of ['hat', 'shirt'] as const) {
      const id = me.outfit[part];
      clothes.append(id ? h('span', { class: 'cl', title: itemName(id) }, itemIcon(id, part === 'hat' ? '🎩' : '👕')) : h('span', { class: 'cl none' }, part === 'hat' ? '🎩' : '👕'));
    }
    const wardrobe = h('button', null, `👕 ${T.wardrobe}`);
    onTap(wardrobe, () => {
      this.close();
      this.menus.open('wardrobe');
    });
    clothes.append(wardrobe);
    slots.append(clothes);
    body.append(h('div', { class: 'saga-gear' }, card, slots));

    // the gear in the bag
    body.append(h('div', { class: 'saga-head' }, `🎒 ${T.sagaGearBag}`));
    const grid = h('div', { class: 'saga-gearbag' });
    // a save from before gear wears its best weapon from the bag: that one shows above, not here too
    let skip = me.saga?.gear ? null : (worn.weapon ?? null);
    for (const st of me.inventory) {
      if (!st) continue;
      const slot = gearSlotOf(st.item);
      const d = sagaItem(st.item);
      if (!slot || !d) continue;
      if (st.item === skip) {
        skip = null;
        continue;
      }
      const fits = !!d.classes?.includes(cls.id);
      const fl = forgeOf(me, st.item);
      const el = vars(
        h(
          'div',
          { class: `gitem rar-${d.rarity}${fits ? ' fits' : ''}${fl ? ' forged' : ''}` },
          h('span', { class: 'pic' }, itemIcon(st.item)),
          h(
            'div',
            { class: 'col' },
            h('b', { class: 'nm' }, forgedName(d.name, fl), fl ? stars(fl) : null),
            h('span', { class: 'rar' }, `${RARITY_NAMES[d.rarity]} · ${SLOT_NAMES[slot]()}`),
            h('span', { class: 'st' }, fl ? forgeLine(st.item, fl) : statLine(d)),
            d.classes?.length ? h('span', { class: 'fit' }, `${fits ? '✓ ' : ''}${fmt(T.sagaFits, { classes: d.classes.map((c) => CLASSES[c].name).join(', ') })}`) : null,
            d.text ? h('span', { class: 'tx' }, d.text) : null,
          ),
          h('span', { class: 'put' }, worn[slot] ? '⇄' : '＋'),
        ),
        { '--r': RARITY_COLORS[d.rarity], '--fl': String(fl) },
      );
      el.title = T.sagaTapOn;
      onTap(el, () => {
        net.send({ t: 'saga', a: 'equip', slot, item: st.item });
        SAGA_SFX.loot(RARITY_ORDER.indexOf(d.rarity) >= 3 ? 3 : 0);
      });
      grid.append(el);
    }
    body.append(grid.children.length ? grid : h('div', { class: 'hint' }, T.sagaGearBagEmpty));
  }

  // Upptäcktsboken: every wild biome's landmarks, the found ones with their picture, name and story
  private renderFinds(body: HTMLElement): void {
    const prog = readProgress(myPlayer());
    const found = new Set(prog.discovered ?? []);
    const groups = landmarksByBiome();
    const total = groups.reduce((n, g) => n + g.ids.length, 0);
    const have = groups.reduce((n, g) => n + g.ids.filter((id) => found.has(id)).length, 0);
    body.append(
      h('p', { class: 'saga-intro' }, T.sagaFindsIntro),
      h('div', { class: 'saga-meter finds-all' }, h('i', { style: { width: `${(have / Math.max(1, total)) * 100}%` } }), h('span', null, `🧭 ${fmt(T.sagaFindsAll, { n: have, total })}`)),
    );
    const list = h('div', { class: 'saga-finds' });
    for (const g of groups) {
      const n = g.ids.filter((id) => found.has(id)).length;
      const row = h('div', { class: `biome${n === g.ids.length ? ' all' : ''}` }, h('div', { class: 'bhead' }, h('span', { class: 'em' }, placeEmoji(g.biome)), h('b', null, placeName(g.biome)), h('span', { class: 'count' }, `${n === g.ids.length ? '✓ ' : ''}${fmt(T.sagaFindsCount, { n, total: g.ids.length })}`)));
      const cards = h('div', { class: 'lms' });
      for (const id of g.ids) {
        const lm = LANDMARKS[id]!;
        cards.append(
          found.has(id)
            ? h('div', { class: 'lm found' }, h('span', { class: 'pic' }, landmarkPic(id)), h('div', { class: 'col' }, h('b', { class: 'nm' }, lm.name), h('span', { class: 'lore' }, lm.lore)))
            : h('div', { class: 'lm unknown' }, h('span', { class: 'pic' }, h('span', { class: 'q' }, '?')), h('div', { class: 'col' }, h('b', { class: 'nm' }, '???'), h('span', { class: 'lore' }, fmt(T.sagaFindsUnknown, { biome: placeName(g.biome) })))),
        );
      }
      row.append(cards);
      list.append(row);
    }
    body.append(list);
  }

  // Smedjan: Smed-Stina makes the gear you own stronger (Förbättra), or smiths a simple piece of each kind (Smid)
  private renderForge(panel: HTMLElement, body: HTMLElement): void {
    const me = myPlayer()!;
    const tabs = h('div', { class: 'tabs' });
    for (const [t, label] of [
      ['upgrade', `⚒️ ${T.forgeTabUpgrade}`],
      ['craft', `🔥 ${T.forgeTabCraft}`],
    ] as const) {
      const b = h('button', { class: this.forgeTab === t ? 'on' : '' }, label);
      onTap(b, () => {
        if (this.forgeTab === t) return;
        this.forgeTab = t;
        SFX.talk();
        this.render();
      });
      tabs.append(b);
    }
    panel.insertBefore(tabs, body);
    const npc = NPCS[FORGE_NPC];
    const intro = h('div', { class: 'forge-intro' }, npc ? h('img', { class: 'portrait', src: portraitUrl(npc.appearance, npc.outfit, 3), alt: '' }) : null, h('p', null, this.forgeTab === 'upgrade' ? T.forgeIntro : T.forgeCraftIntro));
    body.append(intro);
    const grid = h('div', { class: 'forge-grid' });
    if (this.forgeTab === 'upgrade') {
      const owned = ownedGear(me);
      for (const g of owned) grid.append(this.forgeCard(me, g.item, g.slot, g.worn));
      body.append(owned.length ? grid : h('div', { class: 'hint' }, T.forgeNone));
      return;
    }
    const prog = readProgress(me);
    const worn = Object.values(gearOf(me));
    for (const [item, cost] of Object.entries(FORGE_CRAFTS)) {
      const d = sagaItem(item);
      const slot = gearSlotOf(item);
      if (!d || !slot) continue;
      const owned = prog.found.includes(item) || worn.includes(item) || countItem(me.inventory, item) > 0;
      const parts = costParts(me, cost);
      const ok = !owned && affordable(parts);
      const btn = h('button', { class: 'gold', disabled: !ok }, owned ? `✓ ${T.forgeOwned}` : `🔨 ${T.forgeCraft}`);
      onTap(btn, () => {
        if (!ok) return;
        net.send({ t: 'saga', a: 'craft', item });
        SFX.talk();
      });
      grid.append(
        vars(
          h(
            'div',
            { class: `forge-card rar-${d.rarity}${owned ? ' owned' : ''}` },
            h('div', { class: 'top' }, h('span', { class: 'pic' }, itemIcon(item)), h('div', { class: 'col' }, h('b', { class: 'nm' }, d.name), h('span', { class: 'rar' }, `${RARITY_NAMES[d.rarity]} · ${SLOT_NAMES[slot]()}`), h('span', { class: 'st' }, statLine(d)))),
            owned ? null : costChips(parts),
            h('div', { class: 'q-act' }, btn),
          ),
          { '--r': RARITY_COLORS[d.rarity] },
        ),
      );
    }
    body.append(grid);
  }

  /** One piece in the forge: its stars, what the next level costs and gives, and the button. */
  private forgeCard(me: PlayerState, item: string, slot: GearSlot, worn: boolean): HTMLElement {
    const d = sagaItem(item)!;
    const level = forgeOf(me, item);
    const max = level >= FORGE_MAX;
    const cost = max ? undefined : FORGE_COSTS[level + 1];
    const parts = cost ? costParts(me, cost) : [];
    const ok = !!cost && affordable(parts);
    const btn = h('button', { class: 'gold', disabled: !ok }, max ? `🏆 ${T.forgeMax}` : `⚒️ ${T.forgeUpgrade}`);
    onTap(btn, () => {
      if (!ok) return;
      net.send({ t: 'saga', a: 'forge', item });
      SFX.talk();
    });
    const now = forgeLine(item, level);
    const next = max ? '' : forgeLine(item, level + 1);
    return vars(
      h(
        'div',
        { class: `forge-card rar-${d.rarity}${level ? ' forged' : ''}${max ? ' max' : ''}` },
        h(
          'div',
          { class: 'top' },
          h('span', { class: 'pic' }, itemIcon(item)),
          h(
            'div',
            { class: 'col' },
            h('b', { class: 'nm' }, forgedName(d.name, level)),
            h('span', { class: 'rar' }, `${RARITY_NAMES[d.rarity]} · ${SLOT_NAMES[slot]()}${worn ? ` · ${T.forgeWorn}` : ''}`),
            stars(level),
          ),
        ),
        h('div', { class: 'stat' }, h('span', { class: 'now' }, now || '–'), max ? null : h('span', { class: 'arrow' }, '→'), max ? null : h('b', { class: 'next' }, next)),
        cost ? costChips(parts) : null,
        h('div', { class: 'q-act' }, btn),
      ),
      { '--r': RARITY_COLORS[d.rarity], '--fl': String(level) },
    );
  }

  /** The anvil rings and sparks fly when a piece in the open forge gains a level or a new one is smithed. */
  private forgeRang(): void {
    if (this.win !== 'forge') return;
    const now = forgeKey(myPlayer());
    if (now === this.forgeSeen) return;
    const before = this.forgeSeen;
    this.forgeSeen = now;
    const level = Math.max(1, ...Object.values(readProgress(myPlayer()).forge ?? {}));
    if (before) {
      SAGA_SFX.anvil(level);
      this.sparkles(24);
    }
  }

  // Everyone in the family: where they are, and a jump to their side
  private renderFamily(body: HTMLElement): void {
    body.append(h('p', { class: 'saga-intro' }, T.familyHint));
    const rows = h('div', { class: 'rows' });
    const players = Object.values(client.world?.players ?? {}).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    for (const p of players) {
      const me = p.id === client.me;
      const c = classOf(p);
      const title = titleOf(p);
      const where = p.online ? placeOf(p.area) : T.familyAway;
      const row = h(
        'div',
        { class: `row${p.online ? '' : ' off'}` },
        h('img', { class: 'face', src: portraitUrl(p.appearance, p.outfit, 2) }),
        h('span', { class: 'name' }, `${c ? `${c.emoji} ` : ''}${p.name}${me ? ` (${T.sagaYou.toLowerCase()})` : ''}`, title ? h('span', { class: 'ttl' }, ` <${title}>`) : null, h('br'), h('span', { class: 'need' }, where)),
      );
      if (!me && p.online) {
        const b = h('button', { disabled: p.area === 'dungeon' || myPlayer()?.area === 'dungeon' }, T.familyJump);
        onTap(b, () => {
          net.send({ t: 'jump', to: p.id });
          this.close();
        });
        row.append(b);
      }
      rows.append(row);
    }
    body.append(rows);
  }

  // ---- loot ----

  private nextLoot(): void {
    if (!this.loots.length || this.modal) return;
    this.open('loot');
  }

  private renderLoot(panel: HTMLElement, body: HTMLElement): void {
    const c = this.loots[0];
    if (!c) return;
    let best = 0;
    const rows = h('div', { class: 'saga-loot' });
    for (const it of c.items) {
      const d = sagaItem(it.item);
      const rar: Rarity = d?.rarity ?? 'common';
      best = Math.max(best, RARITY_ORDER.indexOf(rar));
      rows.append(
        vars(
          h(
            'div',
            { class: `loot rar-${rar}` },
            h('span', { class: 'pic' }, itemIcon(it.item)),
            h('div', { class: 'col' }, h('b', { class: 'nm' }, `${itemName(it.item)}${it.count > 1 ? ` × ${it.count}` : ''}`), h('span', { class: 'rar' }, RARITY_NAMES[rar]), d?.text ? h('div', { class: 'tx' }, d.text) : null),
          ),
          { '--r': RARITY_COLORS[rar] },
        ),
      );
    }
    rows.append(h('div', { class: 'loot coins' }, h('span', { class: 'pic' }, h('span', { class: 'em' }, '🪙')), h('b', null, `+${c.coins} ${T.coins}`), c.stars ? h('b', { class: 'stars' }, `+${c.stars} ⭐`) : null));
    const rar = RARITY_ORDER[best]!;
    // the day's second (and later) chest from a boss: a plainer one, no rays and no fireworks
    const replay = !!c.replay;
    panel.classList.add(`best-${rar}`);
    if (replay) panel.classList.add('replay');
    panel.style.setProperty('--r', RARITY_COLORS[rar]);
    const ok = h('button', { class: 'gold' }, T.sagaLootOk);
    onTap(ok, () => this.close());
    panel.insertBefore(h('h2', null, h('span', { class: 'chest' }, replay ? '📦' : '🎁'), fmt(replay ? T.sagaReplayChest : T.sagaLootTitle, { from: c.from })), body);
    if (replay) body.prepend(h('p', { class: 'replay-note' }, T.sagaReplaySub));
    else if (rar === 'legendary') panel.prepend(h('div', { class: 'rays' }));
    body.append(rows, h('div', { class: 'q-act' }, ok));
    SAGA_SFX.loot(replay ? Math.min(best, 2) : best);
    if (best >= 4 && !replay) this.confetti(60, true);
  }
}

