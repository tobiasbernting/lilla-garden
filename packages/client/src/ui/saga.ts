// Sagan om Världsträdet's windows and dungeon HUD, as HTML over the game. Out in the world: Kämpastenen's class
// cards, Völvan Sigrun's story and the saga's journal, the villagers' saga quests, a quest tracker, the family list
// to jump to someone. Inside a dungeon: the spell bar (keys 1–4 and a potion on 5) instead of the hotbar, your
// health and your target's, the party, the boss's health and the attack it is getting ready, its shouts, big
// banners (with fireworks for a beaten boss), the loot window, and what happens while you are fallen or frozen.
import {
  CLASSES,
  CLASS_IDS,
  DOWN_MS,
  DUNGEONS,
  DUNGEON_IDS,
  NPCS,
  RARITY_COLORS,
  RARITY_NAMES,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_QUESTS,
  SPELLS,
  T,
  TILE,
  VOLVA_ID,
  areaName,
  chapterDone,
  fmt,
  isBathKey,
  isHallKey,
  isSagaKey,
  itemName,
  placeEmoji,
  placeName,
  previousDungeon,
  questCount,
  questState,
  readProgress,
  sagaItem,
  type Change,
  type ClassId,
  type Rarity,
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
  flagsOf,
  getTarget,
  inSaga,
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
  titleOf,
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
const AT_MONSTER = new Set(['melee', 'bolt', 'lance', 'bash', 'charge', 'storm']);
const AT_FRIEND = new Set(['heal', 'revive']);
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KIND_EMOJI: Record<string, string> = { weapon: '⚔️', hat: '🪖', shirt: '👕', pet: '🐾', mount: '🐎', potion: '🧪', decor: '✨', quest: '📦' };
const FLAG_ICONS: [number, string][] = [
  [FLAG.down, '💀'],
  [FLAG.frozen, '🧊'],
  [FLAG.wall, '🧱'],
  [FLAG.rage, '🔥'],
  [FLAG.hot, '🌿'],
  [FLAG.slow, '🐌'],
];

type Win = 'class' | 'volva' | 'journal' | 'family' | 'loot';
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
const rewardText = (r: { coins: number; stars: number; item?: string; count?: number; title?: string }): string =>
  [`+${r.coins} ${T.coins}`, `+${r.stars} ⭐`, r.item ? `${itemName(r.item)}${(r.count ?? 1) > 1 ? ` × ${r.count}` : ''}` : '', r.title ? `👑 ${r.title}` : ''].filter(Boolean).join(' · ');

/** Where someone is, for the family list. */
function placeOf(area: string): string {
  if (area === 'farm' || area === 'dungeon' || isBathKey(area) || isHallKey(area)) return areaName(area);
  if (isSagaKey(area)) return `⚔️ ${areaName(area)}`;
  const biome = client.biomes[area] ?? client.areas[area]?.biome;
  return `${placeEmoji(biome)} ${placeName(biome)}`;
}

// ---------------------------------------------------------------------------
// The villagers' saga quests (in their window: ui/menus.ts)
// ---------------------------------------------------------------------------

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

    bus.on('open', (c) => {
      if (c.ui === 'sagaClass') this.open('class');
      else if (c.ui === 'saga') this.open('volva');
    });
    bus.on('change', (c) => this.fromServer(c));
    bus.on('me', () => {
      this.sync();
      this.renderTracker();
      if (this.modal && this.win !== 'loot') this.render();
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

  /** Keys: 1–4 spells and 5 a potion inside a dungeon, Tab the next monster, J the saga's journal. True if used. */
  key(e: KeyboardEvent): boolean {
    if (this.modal) {
      if (e.key === 'Escape') this.close();
      return true;
    }
    // no hotbar in a dungeon: the number keys are spells, even with the backpack open
    if (inSaga() && /^[1-8]$/.test(e.key)) {
      if (this.menus.isOpen()) return true;
      if (e.key <= '4') castSlot(Number(e.key) - 1);
      else if (e.key === '5') drinkPotion();
      return true;
    }
    if (this.menus.isOpen()) return false;
    if ((e.key === 'j' || e.key === 'J') && sagaStarted(myPlayer())) {
      this.open('journal');
      return true;
    }
    if (!inSaga()) return false;
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

  /** Inside or outside a dungeon: the spell bar instead of the hotbar, and the class's own buttons. */
  private sync(): void {
    const here = inSaga();
    document.body.classList.toggle('in-saga', here);
    const cls = myClass();
    const want = here && cls ? cls.id : '';
    if (want !== this.barFor) this.buildBar();
    if (!here) {
      this.party.hidden = true;
      this.units.hidden = true;
      this.boss.hidden = true;
      this.castBar.hidden = true;
      this.down.hidden = true;
      this.hint.hidden = true;
      this.wasDown = false;
      this.hintFor = '';
      // out of a boss fight too (the tracker shows again)
      if (document.body.classList.contains('saga-bossfight')) {
        document.body.classList.remove('saga-bossfight');
        this.renderTracker();
      }
    } else if (this.hintFor !== myPlayer()?.area) {
      // a hint about aiming when you come in, fading after a while
      this.hintFor = myPlayer()?.area ?? '';
      this.hint.hidden = false;
      this.hint.textContent = document.body.classList.contains('touch') ? T.sagaTargetHintTouch : T.sagaTargetHint;
      this.hint.classList.remove('fade');
      void this.hint.offsetWidth;
      this.hint.classList.add('fade');
    }
  }

  // ---- the spell bar ----

  private buildBar(): void {
    for (const s of this.slots) s.el.remove();
    this.slots = [];
    const cls = myClass();
    this.barFor = inSaga() && cls ? cls.id : '';
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
    add('aim', h('span', null, '🎯'), '', T.sagaAimName, T.sagaTargetHintTouch, cycleTarget, ' aim');
  }

  /** A spell button: a click (or a short tap) uses it; hovering (or holding a finger on it) shows what it does. */
  private pressable(el: HTMLElement, act: () => void, tip: () => void): void {
    let timer = 0;
    let held = false;
    let tipped = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'mouse') {
        if (e.button === 0) act();
        return;
      }
      held = true;
      tipped = false;
      timer = window.setTimeout(() => {
        tipped = true;
        tip();
      }, 420);
    });
    const release = (fire: boolean): void => {
      if (!held) return;
      held = false;
      clearTimeout(timer);
      if (tipped) this.tip.classList.remove('on');
      else if (fire) act();
    };
    el.addEventListener('pointerup', () => release(true));
    el.addEventListener('pointercancel', () => release(false));
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') tip();
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.tip.classList.remove('on');
      else release(false);
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

  /** Every frame inside a dungeon: cooldown sweeps, the boss's attack filling up, being fallen or frozen. */
  private frame(): void {
    if (!inSaga()) return;
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
    this.units.hidden = !snap;
    if (!snap) return;
    const me = myPlayer();
    const cls = myClass();
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
      this.targetFrame.set(a?.species === 'isblock' ? '🧊' : a && SAGA_BOSSES[a.species] ? '💀' : '👹', a?.name ?? '', m ? [m[0], m[1], 0] : null, '#ff8a70', !!m);
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
    if (!inSaga()) return;
    this.renderUnits();
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
    const el = h('div', { class: `saga-banner ${kind}` }, h('div', { class: 'big' }, c.text), c.sub ? h('div', { class: 'sub' }, c.sub) : null);
    this.banners.append(el);
    if (kind === 'boss' || kind === 'cleared') {
      this.confetti(kind === 'cleared' ? 90 : 55, true);
      SAGA_SFX.fanfare(true);
    } else if (kind === 'reward') {
      this.confetti(45, false);
      SAGA_SFX.fanfare(false);
    } else if (kind === 'wipe') SAGA_SFX.sombre();
    else if (kind === 'rest') SAGA_SFX.calm();
    else SAGA_SFX.banner();
    const ms = kind === 'cleared' ? 5200 : kind === 'boss' || kind === 'reward' || kind === 'enter' || kind === 'chapter' ? 4300 : 3200;
    setTimeout(() => el.classList.add('out'), ms - 600);
    setTimeout(() => {
      el.remove();
      this.nextBanner();
    }, ms);
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
    this.down.classList.toggle('ice', frozen && !isDown);
    if (this.down.hidden) return;
    let title = T.sagaFrozenTitle;
    let sub = T.sagaFrozenSub;
    if (isDown) {
      title = T.sagaFallenTitle;
      const all = Object.values(sagaSnap()?.f ?? {}).every((f) => f[2] & FLAG.down);
      sub = all ? T.sagaWipeSub : fmt(T.sagaFallenSub, { s: Math.max(1, Math.ceil((DOWN_MS - (serverNow() - this.downSince)) / 1000)) });
    }
    const text = `${title}\n${sub}`;
    if (this.down.dataset.text !== text) {
      this.down.dataset.text = text;
      clear(this.down);
      this.down.append(h('div', { class: 'box' }, h('b', null, `${isDown ? '💀' : '🧊'} ${title}`), h('span', null, sub)));
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
      const line = !prog.heard ? T.sagaVisitVolva : chapterDone(prog) ? T.sagaBackToVolva : ch.goal;
      this.tracker.append(h('div', { class: `line${prog.heard && chapterDone(prog) ? ' done' : ''}` }, `${prog.heard ? '🎯' : '❗'} ${line}`));
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
    };
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: `panel saga-panel ${this.win}` });
    if (this.win !== 'loot') panel.append(h('h2', null, titles[this.win], h('span', { class: 'spacer' }), closeBtn));
    panel.append(body);
    if (this.win === 'class') this.renderClass(body);
    else if (this.win === 'volva') this.renderVolva(panel, body);
    else if (this.win === 'journal') this.renderJournal(body);
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
    body.append(h('div', { class: 'saga-head' }, T.sagaChapters));
    const chapters = h('div', { class: 'saga-list' });
    SAGA_CHAPTERS.forEach((ch, i) => {
      if (i > prog.chapter) return;
      const done = i < prog.chapter;
      const name = i === 0 ? ch.title : fmt(T.sagaChapter, { n: i, title: ch.title });
      chapters.append(h('div', { class: `row${done ? ' done' : ''}` }, h('span', { class: 'badge' }, done ? '✅' : '📜'), h('span', { class: 'name' }, name, h('br'), h('span', { class: 'need' }, done ? ch.done[0]! : prog.heard ? ch.goal : T.sagaVisitVolva)), done ? null : h('span', { class: 'price' }, T.sagaChapterNow)));
    });
    body.append(chapters, h('div', { class: 'saga-head' }, T.sagaDungeons));
    for (const id of DUNGEON_IDS) {
      const d = DUNGEONS[id];
      const cleared = prog.cleared.includes(id);
      const prev = previousDungeon(id);
      const open = cleared || (!!prog.cls && (!prev || prog.cleared.includes(prev)));
      const card = h('div', { class: `saga-dungeon${cleared ? ' cleared' : ''}${open ? '' : ' sealed'}` }, h('div', { class: 'top' }, h('b', null, `⚔️ ${d.name}`), h('span', { class: 'tag' }, cleared ? T.sagaClearedTag : open ? '' : `🔒 ${T.sagaSealed}`)));
      if (!open) card.append(h('div', { class: 'tx' }, T.sagaUnknown));
      else
        for (const b of [d.mini, d.boss]) {
          const def = SAGA_BOSSES[b]!;
          const moves = h('ul', { class: 'moves' });
          for (const mv of def.moves) moves.append(h('li', null, h('b', null, `${mv.interrupt ? '🛡️ ' : '🔴 '}${mv.name}: `), mv.text));
          card.append(h('div', { class: 'boss' }, h('div', null, h('b', null, `${def.mini ? '💀' : '👑'} ${def.name}`), h('span', { class: 'title' }, ` · ${def.title}`)), cleared ? h('div', { class: 'lore' }, def.lore) : null, h('div', { class: 'tx' }, fmt(T.sagaHowToFight, { boss: def.name })), moves));
        }
      body.append(card);
    }
    body.append(h('div', { class: 'saga-head' }, T.sagaTitles));
    body.append(prog.titles.length ? h('div', { class: 'saga-titles' }, ...prog.titles.map((t) => h('span', null, `👑 ${t}`))) : h('div', { class: 'hint' }, T.sagaNoTitles));
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
    panel.classList.add(`best-${rar}`);
    panel.style.setProperty('--r', RARITY_COLORS[rar]);
    const ok = h('button', { class: 'gold' }, T.sagaLootOk);
    onTap(ok, () => this.close());
    panel.insertBefore(h('h2', null, h('span', { class: 'chest' }, '🎁'), fmt(T.sagaLootTitle, { from: c.from })), body);
    if (rar === 'legendary') panel.prepend(h('div', { class: 'rays' }));
    body.append(rows, h('div', { class: 'q-act' }, ok));
    SAGA_SFX.loot(best);
    if (best >= 4) this.confetti(60, true);
  }
}

