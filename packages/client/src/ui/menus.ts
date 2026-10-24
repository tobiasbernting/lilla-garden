// All in-game menus as HTML overlays: ryggsäck, kista, katalog, sälj, snickra, garderob, emotes, namn.
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_TEXT,
  ANIMALS,
  BIOME_EMOJI,
  BIOME_NAMES,
  CHEST_SIZE,
  areaCoords,
  areaKey,
  biomeAt,
  type Biome,
  COOKING,
  HELP,
  NPCS,
  openQuests,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  ITEMS,
  RECIPES,
  SPECIES_NAMES,
  T,
  catalogueAvailable,
  countItem,
  fmt,
  item as itemDef,
  itemName,
  type ClothingSlot,
  type ItemDef,
  type RecipeDef,
  type SlotRef,
} from '@lilla-garden/shared';
import { portraitUrl, getArt } from '../art/textures.js';
import { EMOTE_GLYPH } from '../art/world.js';
import { net } from '../net.js';
import { bus, client, myPlayer } from '../state.js';
import { clear, h, icon, onTap } from './dom.js';
import { slotEl } from './hud.js';

export type MenuKind = 'inventory' | 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'emotes' | 'nameAnimal' | 'help' | 'npc' | 'cook' | 'book' | 'map';

const TAB_NAMES: Record<string, string> = { seeds: T.tabSeeds, animals: T.tabAnimals, feed: T.tabFeed, materials: T.tabMaterials, furniture: T.tabFurniture, clothes: T.tabClothes, season: T.tabSeason, stars: `⭐ ${T.tabStars}` };
const TABS = ['seeds', 'animals', 'feed', 'materials', 'furniture', 'clothes', 'season', 'stars'] as const;

export class Menus {
  private modal: HTMLElement | null = null;
  private kind: MenuKind | null = null;
  private chestId: number | null = null;
  private animalId: number | null = null;
  private npcId: string | null = null;
  private picked: SlotRef | null = null;
  private tab: (typeof TABS)[number] = 'seeds';
  private wardrobeTab: ClothingSlot = 'hat';
  onChange: (open: boolean) => void = () => {};

  constructor(private ui: HTMLElement) {
    bus.on('me', () => this.rerender());
    bus.on('change', (c) => {
      if (c.t === 'object' && this.kind === 'chest' && c.id === this.chestId) {
        if (!c.obj) this.close();
        else this.rerender();
      }
    });
    bus.on('open', (c) => {
      if (c.ui === 'chest') this.open('chest', c.id);
      else if (c.ui === 'nameAnimal') this.open('nameAnimal', c.id);
      else if (c.ui === 'npc') {
        this.npcId = c.npc ?? null;
        this.open('npc');
      } else this.open(c.ui);
    });
    bus.on('connection', (s) => {
      if (s !== 'open') this.close();
    });
  }

  isOpen(): boolean {
    return this.kind !== null;
  }

  toggle(kind: MenuKind): void {
    if (this.kind === kind) this.close();
    else this.open(kind);
  }

  open(kind: MenuKind, id?: number): void {
    this.close();
    this.kind = kind;
    this.picked = null;
    if (kind === 'chest') this.chestId = id ?? null;
    if (kind === 'nameAnimal') this.animalId = id ?? null;
    this.modal = h('div', { class: 'modal' });
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
    this.ui.append(this.modal);
    this.rerender();
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.kind = null;
    this.chestId = null;
    this.animalId = null;
    this.onChange(false);
  }

  private rerender(): void {
    if (!this.modal || !this.kind) return;
    const me = myPlayer();
    if (!me) return;
    clear(this.modal);
    const title = {
      inventory: `🎒 ${T.inventory}`,
      chest: `📦 ${T.chest}`,
      catalogue: `📖 ${T.catalogue}`,
      sell: `💰 ${T.sell}`,
      workbench: `🔨 ${T.craft}`,
      wardrobe: `👕 ${T.wardrobe}`,
      emotes: '😊',
      nameAnimal: '🐾',
      help: `❓ ${T.help}`,
      cook: `🍳 ${T.cook}`,
      book: `📖 ${T.book}`,
      map: `🗺️ ${T.worldMap}`,
      npc: this.npcId ? (NPCS[this.npcId]?.name ?? '') : '',
    }[this.kind];
    const closeBtn = h('button', { class: 'close' }, '✕');
    onTap(closeBtn, () => this.close());
    const coins = h('span', { class: 'price' }, `${me.coins} ${T.coins}${this.kind === 'catalogue' ? ` · ⭐ ${me.stars}` : ''}`);
    const head = h('h2', null, title, h('span', { class: 'spacer' }), this.kind === 'catalogue' || this.kind === 'sell' ? coins : null, closeBtn);
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: 'panel' }, head, body);
    switch (this.kind) {
      case 'inventory':
        this.renderInventory(body, null);
        break;
      case 'chest':
        this.renderInventory(body, this.chestId);
        break;
      case 'catalogue':
        this.renderCatalogue(panel, body);
        break;
      case 'sell':
        this.renderSell(body);
        break;
      case 'workbench':
        this.renderCraft(body, RECIPES, 'craft');
        break;
      case 'cook':
        this.renderCraft(body, COOKING, 'cook');
        break;
      case 'wardrobe':
        this.renderWardrobe(panel, body);
        break;
      case 'emotes':
        this.renderEmotes(body);
        break;
      case 'nameAnimal':
        this.renderName(body);
        break;
      case 'help':
        this.renderHelp(panel, body);
        break;
      case 'npc':
        this.renderNpc(body);
        break;
      case 'book':
        this.renderBook(body);
        break;
      case 'map':
        this.renderMap(body);
        break;
    }
    this.modal.append(panel);
  }

  // ---- inventory & chest (tap one slot, then another to move) ----

  private renderInventory(body: HTMLElement, chestId: number | null): void {
    const me = myPlayer()!;
    const world = client.world!;
    const sameRef = (a: SlotRef, b: SlotRef) => a.slot === b.slot && a.chest === b.chest;
    const tap = (ref: SlotRef) => {
      if (!this.picked) {
        const inv = ref.chest === undefined ? me.inventory : world.objects[ref.chest]?.items;
        if (!inv?.[ref.slot]) return;
        this.picked = ref;
      } else if (sameRef(this.picked, ref)) {
        this.picked = null;
      } else {
        net.send({ t: 'swap', a: this.picked, b: ref });
        this.picked = null;
      }
      this.rerender();
    };
    const grid = (inv: (import('@lilla-garden/shared').ItemStack | null)[], chest: number | undefined, from: number, to: number, keys: boolean) => {
      const g = h('div', { class: 'grid' });
      for (let i = from; i < to; i++) {
        const ref: SlotRef = chest === undefined ? { slot: i } : { chest, slot: i };
        g.append(
          slotEl(inv[i] ?? null, {
            selected: chest === undefined && me.selected === i,
            picked: !!this.picked && sameRef(this.picked, ref),
            key: keys ? String(i + 1) : undefined,
            onTap: () => tap(ref),
          }),
        );
      }
      return g;
    };
    if (chestId !== null) {
      const chest = world.objects[chestId];
      const items = chest?.items ?? [];
      body.append(h('div', { class: 'hint' }, T.chest), grid(items, chestId, 0, CHEST_SIZE, false));
    }
    body.append(h('div', { class: 'hint' }, T.inventory), grid(me.inventory, undefined, 0, HOTBAR_SIZE, true), grid(me.inventory, undefined, HOTBAR_SIZE, INVENTORY_SIZE, false));
    const actions = h('div', { class: 'tabs' });
    if (this.picked && this.picked.chest === undefined) {
      const slot = this.picked.slot;
      const s = me.inventory[slot];
      if (s) {
        const useBtn = h('button', null, `Håll ${itemName(s.item)}`);
        onTap(useBtn, () => {
          me.selected = slot;
          net.send({ t: 'select', slot });
          this.picked = null;
          this.close();
        });
        const drop1 = h('button', { class: 'alt' }, 'Lägg ner 1');
        onTap(drop1, () => {
          net.send({ t: 'drop', slot, qty: 1 });
          this.picked = null;
        });
        const dropAll = h('button', { class: 'alt' }, 'Lägg ner alla');
        onTap(dropAll, () => {
          net.send({ t: 'drop', slot, qty: 99 });
          this.picked = null;
        });
        actions.append(useBtn, drop1, s.count > 1 ? dropAll : null!);
      }
    } else actions.append(h('span', { class: 'hint' }, 'Tryck på en sak, sedan på en ruta för att flytta den.'));
    body.append(actions);
  }

  // ---- catalogue ----

  private renderCatalogue(panel: HTMLElement, body: HTMLElement): void {
    const me = myPlayer()!;
    const tabs = h('div', { class: 'tabs' });
    for (const t of TABS) {
      if (t === 'season' && client.season === 'none') continue;
      const b = h('button', { class: this.tab === t ? 'on' : '' }, TAB_NAMES[t]!);
      onTap(b, () => {
        this.tab = t;
        this.rerender();
      });
      tabs.append(b);
    }
    panel.insertBefore(tabs, body);
    const rows = h('div', { class: 'rows' });
    const items = Object.values(ITEMS).filter((d) => d.tab === this.tab && catalogueAvailable(d.id, client.season));
    if (items.length === 0) rows.append(h('div', { class: 'hint' }, 'Inget här just nu.'));
    for (const d of items) {
      const owned = d.category === 'clothing' && me.wardrobe.includes(d.id);
      const price = d.stars !== undefined ? `⭐ ${d.stars}` : `${d.buy} ${T.coins}`;
      const row = h('div', { class: `row${owned ? ' off' : ''}` }, icon(getArt().iconUrl[d.id] ?? ''), h('span', { class: 'name' }, this.catalogueName(d)), h('span', { class: 'price' }, price));
      if (owned) row.append(h('span', { class: 'hint' }, 'Har redan'));
      else if (d.stars !== undefined) {
        const b = h('button', { disabled: me.stars < d.stars }, T.buy);
        onTap(b, () => net.send({ t: 'buy', item: d.id, qty: 1 }));
        row.append(b);
      } else {
        const qtys = d.category === 'seed' || d.category === 'feed' || d.category === 'material' ? [1, 5, 10] : [1];
        for (const q of qtys) {
          const b = h('button', { disabled: me.coins < (d.buy ?? 0) * q }, qtys.length > 1 ? `${T.buy} ${q}` : T.buy);
          onTap(b, () => net.send({ t: 'buy', item: d.id, qty: q }));
          row.append(b);
        }
      }
      rows.append(row);
    }
    body.append(rows);
  }

  private catalogueName(d: ItemDef): string {
    if (d.category === 'animal' && d.species) {
      const house = ANIMALS[d.species]?.house;
      return `${SPECIES_NAMES[d.species] ?? d.id}${house ? ` (behöver ${itemName(house)})` : ''}`;
    }
    return itemName(d.id);
  }

  // ---- sell ----

  private renderSell(body: HTMLElement): void {
    const me = myPlayer()!;
    const rows = h('div', { class: 'rows' });
    let any = false;
    me.inventory.forEach((s, slot) => {
      if (!s) return;
      const d = itemDef(s.item);
      if (d.sell === undefined) return;
      any = true;
      const one = h('button', null, `${T.sellOne} (${d.sell} ${T.coins})`);
      onTap(one, () => net.send({ t: 'sell', slot, qty: 1 }));
      const all = h('button', { class: 'alt' }, `${T.sellAll} (${d.sell * s.count} ${T.coins})`);
      onTap(all, () => net.send({ t: 'sell', slot, qty: s.count }));
      rows.append(h('div', { class: 'row' }, icon(getArt().iconUrl[s.item] ?? ''), h('span', { class: 'name' }, `${itemName(s.item)} × ${s.count}`), one, s.count > 1 ? all : null!));
    });
    if (!any) rows.append(h('div', { class: 'hint' }, 'Du har inget att sälja just nu. Odla något!'));
    body.append(rows);
  }

  // ---- craft ----

  private renderCraft(body: HTMLElement, recipes: RecipeDef[], msg: 'craft' | 'cook'): void {
    const me = myPlayer()!;
    const rows = h('div', { class: 'rows' });
    for (const r of recipes) {
      const ok = r.in.every((i) => countItem(me.inventory, i.item) >= i.count);
      const needs = h(
        'span',
        { class: 'need' },
        ...r.in.map((i, idx) => {
          const have = countItem(me.inventory, i.item);
          return h('span', { class: `need ${have >= i.count ? 'ok' : 'no'}` }, `${idx ? ' · ' : ''}${itemName(i.item)} ${have}/${i.count}`);
        }),
      );
      const b = h('button', { disabled: !ok }, msg === 'cook' ? T.cook : T.craft);
      onTap(b, () => net.send({ t: msg, recipe: r.id }));
      rows.append(h('div', { class: `row${ok ? '' : ' off'}` }, icon(getArt().iconUrl[r.out.item] ?? ''), h('span', { class: 'name' }, `${itemName(r.out.item)}${r.out.count > 1 ? ` × ${r.out.count}` : ''}`, h('br'), needs), b));
    }
    body.append(rows);
  }

  // ---- wardrobe ----

  private renderWardrobe(panel: HTMLElement, body: HTMLElement): void {
    const me = myPlayer()!;
    const slots: ClothingSlot[] = ['hat', 'shirt', 'pants', 'shoes'];
    const names: Record<ClothingSlot, string> = { hat: 'Hattar', shirt: 'Tröjor', pants: 'Byxor', shoes: 'Skor' };
    const tabs = h('div', { class: 'tabs' });
    for (const s of slots) {
      const b = h('button', { class: this.wardrobeTab === s ? 'on' : '' }, names[s]);
      onTap(b, () => {
        this.wardrobeTab = s;
        this.rerender();
      });
      tabs.append(b);
    }
    panel.insertBefore(tabs, body);
    const grid = h('div', { class: 'wardrobe-grid' });
    if (this.wardrobeTab === 'hat') {
      const none = h('div', { class: `slot${!me.outfit.hat ? ' selected' : ''}` }, '🚫');
      onTap(none, () => net.send({ t: 'equip', slot: 'hat', item: null }));
      grid.append(none);
    }
    for (const id of me.wardrobe) {
      const d = ITEMS[id];
      if (!d?.clothing || d.clothing.slot !== this.wardrobeTab) continue;
      const el = slotEl({ item: id, count: 1 }, { selected: me.outfit[this.wardrobeTab] === id, onTap: () => net.send({ t: 'equip', slot: this.wardrobeTab, item: id }) });
      grid.append(el);
    }
    const preview = h('img', { class: 'portrait', src: portraitUrl(me.appearance, me.outfit, 4) });
    body.append(h('div', { style: { display: 'flex', gap: '2em', alignItems: 'flex-start' } }, preview, grid));
  }

  // ---- emotes ----

  private renderEmotes(body: HTMLElement): void {
    const grid = h('div', { class: 'emotes' });
    for (const e of T.emotes) {
      const b = h('button', { title: e }, EMOTE_GLYPH[e] ?? e);
      onTap(b, () => {
        net.send({ t: 'emote', id: e });
        this.close();
      });
      grid.append(b);
    }
    body.append(grid);
  }

  // ---- world map ----

  private renderMap(body: HTMLElement): void {
    const me = myPlayer()!;
    const here = me.area === 'dungeon' ? 'farm' : me.area;
    const c = areaCoords(here) ?? { ax: 0, ay: 0 };
    const visited = new Set(me.visited ?? ['farm']);
    const R = 3;
    const grid = h('div', { class: 'worldmap' });
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const ax = c.ax + dx;
        const ay = c.ay + dy;
        const k = ax === 0 && ay === 0 ? 'farm' : areaKey(ax, ay);
        const known = visited.has(k);
        const biome = k === 'farm' ? 'farm' : known ? ((client.areas[k]?.biome as Biome | undefined) ?? biomeAt(ax, ay)) : null;
        const cell = h('div', { class: `cell${known ? ' known' : ''}${k === here ? ' here' : ''}`, title: known ? BIOME_NAMES[biome!] : T.notVisited }, known ? h('span', { class: 'em' }, BIOME_EMOJI[biome!]) : h('span', { class: 'em' }, '❔'), known ? h('span', { class: 'nm' }, BIOME_NAMES[biome!]) : null);
        if (known && k !== here && me.area !== 'dungeon') {
          onTap(cell, () => {
            net.send({ t: 'teleport', to: k });
            this.close();
          });
        }
        grid.append(cell);
      }
    const home = h('button', { disabled: me.area === 'farm' || me.area === 'dungeon' }, `🏡 ${T.teleportHome}`);
    onTap(home, () => {
      net.send({ t: 'teleport', to: 'farm' });
      this.close();
    });
    const mini = h('button', { class: 'alt' }, '🧭 Minikarta av/på');
    onTap(mini, () => document.dispatchEvent(new CustomEvent('lilla:minimap')));
    body.append(h('p', { class: 'help-intro' }, `${T.youAreHere}: ${BIOME_EMOJI[(client.areas[here]?.biome as Biome | undefined) ?? (here === 'farm' ? 'farm' : 'ang')]} ${here === 'farm' ? BIOME_NAMES.farm : BIOME_NAMES[(client.areas[here]?.biome as Biome | undefined) ?? 'ang']} · Norr är uppåt. Kallare norrut, varmare söderut.`), grid, h('div', { class: 'tabs' }, home, mini));
  }

  // ---- gårdsbok ----

  private renderBook(body: HTMLElement): void {
    const me = myPlayer()!;
    const done = ACHIEVEMENTS.filter((a) => me.achievements?.includes(a.id)).length;
    body.append(h('p', { class: 'help-intro' }, `⭐ ${me.stars} ${T.stars} · ${done} av ${ACHIEVEMENTS.length} bragder`));
    const rows = h('div', { class: 'rows' });
    for (const a of ACHIEVEMENTS) {
      const have = Math.min(a.goal, me.stats?.[a.stat] ?? 0);
      const unlocked = me.achievements?.includes(a.id);
      const txt = ACHIEVEMENT_TEXT[a.id] ?? { title: a.id, text: '' };
      rows.append(
        h(
          'div',
          { class: `row${unlocked ? ' done' : ''}` },
          h('span', { class: 'badge' }, unlocked ? '🏅' : icon(getArt().iconUrl[a.icon] ?? '')),
          h('span', { class: 'name' }, txt.title, h('br'), h('span', { class: 'need' }, txt.text), h('div', { class: 'bar' }, h('i', { style: { width: `${(have / a.goal) * 100}%` } }))),
          h('span', { class: 'price' }, unlocked ? `+${a.stars} ⭐` : fmt(T.progress, { have, goal: a.goal })),
        ),
      );
    }
    body.append(rows);
  }

  // ---- villager dialogue ----

  private renderNpc(body: HTMLElement): void {
    const me = myPlayer()!;
    const npc = this.npcId ? NPCS[this.npcId] : undefined;
    if (!npc) {
      this.close();
      return;
    }
    const quests = openQuests(client.world!, me, npc.id);
    const greeting = npc.greeting[(client.day + npc.name.length) % npc.greeting.length]!;
    const talk = h('div', { class: 'npc-talk' }, h('img', { class: 'portrait', src: portraitUrl(npc.appearance, npc.outfit, 4) }), h('div', { class: 'bubble-text' }, quests.length ? greeting : T.questAllDone));
    body.append(talk);
    const rows = h('div', { class: 'rows' });
    for (const q of quests) {
      const have = countItem(me.inventory, q.want.item);
      const ok = have >= q.want.count;
      const reward = [q.reward.coins ? `${q.reward.coins} ${T.coins}` : '', q.reward.item ? itemName(q.reward.item.item) : '', `${q.reward.stars} ⭐`].filter(Boolean).join(' + ');
      const give = h('button', { disabled: !ok }, T.questGive);
      onTap(give, () => {
        net.send({ t: 'quest', id: q.id });
        setTimeout(() => this.rerender(), 150);
      });
      rows.append(
        h(
          'div',
          { class: `row${ok ? '' : ' off'}` },
          icon(getArt().iconUrl[q.want.item] ?? ''),
          h('span', { class: 'name' }, q.text, h('br'), h('span', { class: `need ${ok ? 'ok' : 'no'}` }, `${T.questWant}: ${q.want.count} ${itemName(q.want.item)} (du har ${have})`), h('br'), h('span', { class: 'need' }, `${T.questReward}: ${reward}`)),
          give,
        ),
      );
    }
    body.append(rows);
  }

  // ---- help ----

  private helpTopic = 'controls';

  private helpText(text: string): string {
    return text
      .replace(/\{recipe:(\w+)\}/g, (_, id: string) => {
        const r = RECIPES.find((x) => x.id === id);
        return r ? r.in.map((i) => `${i.count} ${itemName(i.item).toLowerCase()}`).join(' + ') : id;
      })
      .replace(/\{price:(\w+)\}/g, (_, id: string) => `${ITEMS[id]?.buy ?? '?'} ${T.coins}`)
      .replace(/\{name:(\w+)\}/g, (_, id: string) => itemName(id));
  }

  private helpIcon(ref: string | undefined): HTMLElement {
    if (!ref) return h('span', { class: 'help-icon' });
    if (ref.startsWith('emoji:')) return h('span', { class: 'help-icon emoji' }, ref.slice(6));
    const url = getArt().iconUrl[ref] ?? getArt().objects[ref]?.frames[0]?.dataUrl();
    return url ? h('span', { class: 'help-icon' }, icon(url)) : h('span', { class: 'help-icon' });
  }

  private renderHelp(panel: HTMLElement, body: HTMLElement): void {
    const touch = document.body.classList.contains('touch');
    const tabs = h('div', { class: 'tabs' });
    for (const t of HELP) {
      const b = h('button', { class: this.helpTopic === t.id ? 'on' : '' }, `${t.emoji} ${t.title}`);
      onTap(b, () => {
        this.helpTopic = t.id;
        this.rerender();
      });
      tabs.append(b);
    }
    panel.insertBefore(tabs, body);
    const topic = HELP.find((t) => t.id === this.helpTopic) ?? HELP[0]!;
    if (topic.intro) body.append(h('p', { class: 'help-intro' }, topic.intro));
    const list = h('ol', { class: 'help-steps' });
    for (const step of topic.steps) {
      if (step.only === 'touch' && !touch) continue;
      if (step.only === 'desktop' && touch) continue;
      list.append(h('li', null, this.helpIcon(step.icon), h('span', null, this.helpText(step.text))));
    }
    body.append(list);
    if (topic.houses) {
      const rows = h('div', { class: 'rows' });
      for (const a of Object.values(ANIMALS)) {
        const r = RECIPES.find((x) => x.id === a.house);
        const animalItem = ITEMS[`animal_${a.species}`];
        rows.append(
          h(
            'div',
            { class: 'row' },
            icon(getArt().iconUrl[a.house] ?? ''),
            h('span', { class: 'name' }, `${itemName(a.house)} → ${SPECIES_NAMES[a.species] ?? a.species}`, h('br'), h('span', { class: 'need' }, r ? r.in.map((i) => `${i.count} ${itemName(i.item).toLowerCase()}`).join(' + ') : '')),
            h('span', { class: 'price' }, `${animalItem?.buy ?? '?'} ${T.coins}`),
          ),
        );
      }
      body.append(h('p', { class: 'help-intro' }, 'Alla djurhus:'), rows);
    }
  }

  // ---- animal name ----

  private renderName(body: HTMLElement): void {
    const a = this.animalId !== null ? client.world?.animals[this.animalId] : undefined;
    if (!a) {
      this.close();
      return;
    }
    const input = h('input', { type: 'text', maxlength: '14', value: a.name, autocomplete: 'off' });
    const ok = h('button', null, T.ok);
    const submit = () => {
      const name = input.value.trim();
      if (name && this.animalId !== null) net.send({ t: 'nameAnimal', id: this.animalId, name });
      this.close();
    };
    onTap(ok, submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      e.stopPropagation();
    });
    body.append(h('p', null, fmt(T.nameAnimal, { species: SPECIES_NAMES[a.species] ?? a.species })), input, h('div', { class: 'tabs' }, ok));
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }
}
