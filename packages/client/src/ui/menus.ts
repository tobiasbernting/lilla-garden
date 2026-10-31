// All in-game menus as HTML overlays: ryggsäck, kista, gårdsbutik, sälj, snickra, garderob, emotes, namn.
import {
  ACHIEVEMENTS,
  isVehicle,
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
  FILTER_NAMES,
  HELP,
  INVENTORY_FILTERS,
  NPCS,
  openQuests,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  ITEMS,
  PAINTED_SELL,
  RECIPES,
  SPECIES_NAMES,
  T,
  catalogueAvailable,
  countItem,
  fmt,
  item as itemDef,
  itemName,
  filterOf,
  itemMatches,
  normalizeQuery,
  type ClothingSlot,
  type ItemDef,
  type ItemStack,
  type RecipeDef,
  type SlotRef,
  transportDestinations,
} from '@lilla-garden/shared';
import { portraitUrl, getArt } from '../art/textures.js';
import { EMOTE_GLYPH } from '../art/world.js';
import { net } from '../net.js';
import { activeWorld, bus, client, myPlayer } from '../state.js';
import { clear, h, icon, onTap } from './dom.js';
import { slotEl } from './hud.js';
import { PaintBoard } from './paint.ts';
import { stackIconUrl } from '../art/painting.ts';

export type MenuKind = 'inventory' | 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'emotes' | 'nameAnimal' | 'help' | 'npc' | 'cook' | 'book' | 'map' | 'paint' | 'pizzeria' | 'travel';

const TAB_NAMES: Record<string, string> = { seeds: T.tabSeeds, animals: T.tabAnimals, feed: T.tabFeed, materials: T.tabMaterials, furniture: T.tabFurniture, clothes: T.tabClothes, season: T.tabSeason, stars: `⭐ ${T.tabStars}`, vehicles: T.tabVehicles };
const SEARCH_KINDS: readonly MenuKind[] = ['inventory', 'chest', 'catalogue', 'sell'];

/** The parts of a search menu that outlive a rerender. */
interface SearchFrame {
  kind: MenuKind;
  panel: HTMLElement;
  body: HTMLElement;
  search: HTMLInputElement;
  /** Filter chips by filter id ('all' included). */
  chips: Map<string, HTMLElement>;
  clearBtn: HTMLButtonElement;
  /** Shop tab row (catalogue only). */
  tabs: HTMLElement | null;
  /** "No match" line between toolbar and body (backpack/chest). */
  hint: HTMLElement;
  coins: HTMLElement | null;
}
const TABS = ['seeds', 'animals', 'vehicles', 'feed', 'materials', 'furniture', 'clothes', 'season', 'stars'] as const;

export class Menus {
  private modal: HTMLElement | null = null;
  private kind: MenuKind | null = null;
  private chestId: number | null = null;
  /** The bus stop / station the travel menu was opened at. */
  private travelId: number | null = null;
  private animalId: number | null = null;
  private npcId: string | null = null;
  private picked: SlotRef | null = null;
  private tab: (typeof TABS)[number] = 'seeds';
  private wardrobeTab: ClothingSlot = 'hat';
  /** Search text and item filter shared by backpack/chest/shop/sell. Survives rerenders, cleared on close. */
  private query = '';
  private filter = 'all';
  /**
   * Backpack/chest/shop/sell keep one long-lived frame (header, search input, chips, tabs) per open();
   * only its body is rebuilt on search, filter and server updates, so the focused <input> is never
   * removed from the DOM (soft keyboards would dismiss, IME composition would be cancelled).
   */
  private frame: SearchFrame | null = null;
  onChange: (open: boolean) => void = () => {};

  constructor(private ui: HTMLElement) {
    bus.on('me', () => this.rerender());
    // the shop's "on the way tomorrow" list shows everybody's orders
    bus.on('player', (id) => {
      if (this.kind === 'catalogue' && id !== client.me) this.rerender();
    });
    bus.on('change', (c) => {
      if (c.t === 'object' && this.kind === 'chest' && c.id === this.chestId) {
        if (!c.obj) this.close();
        else this.rerender();
      }
    });
    bus.on('open', (c) => {
      if (c.ui === 'chest') this.open('chest', c.id);
      else if (c.ui === 'travel') this.open('travel', c.id);
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
    this.query = '';
    this.filter = 'all';
    if (kind === 'chest') this.chestId = id ?? null;
    if (kind === 'nameAnimal') this.animalId = id ?? null;
    if (kind === 'travel') this.travelId = id ?? null;
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
    this.frame = null;
    this.kind = null;
    this.chestId = null;
    this.animalId = null;
    this.query = '';
    this.filter = 'all';
    this.onChange(false);
  }

  private rerender(resetScroll = false): void {
    if (!this.modal || !this.kind) return;
    const me = myPlayer();
    if (!me) return;
    // Search menus keep their frame (and the focused input) and only rebuild the body.
    if (this.frame && this.frame.kind === this.kind && this.frame.panel.parentElement === this.modal) {
      this.renderBody(resetScroll);
      return;
    }
    this.frame = null;
    const scrollTop = resetScroll ? 0 : (this.modal.querySelector<HTMLElement>('.body')?.scrollTop ?? 0);
    clear(this.modal);
    const title = {
      inventory: `🎒 ${T.inventory}`,
      chest: `📦 ${T.chest}`,
      catalogue: `🏪 ${T.catalogue}`,
      sell: `💰 ${T.sell}`,
      workbench: `🔨 ${T.craft}`,
      wardrobe: `👕 ${T.wardrobe}`,
      emotes: '😊',
      nameAnimal: '🐾',
      help: `❓ ${T.help}`,
      cook: `🍳 ${T.cook}`,
      book: `📖 ${T.book}`,
      map: `🗺️ ${T.worldMap}`,
      paint: `🎨 ${T.paint}`,
      pizzeria: `🍕 ${T.pizzeria}`,
      travel: this.travelVia() === 'train' ? `🚂 ${T.travelTrain}` : `🚌 ${T.travelBus}`,
      npc: this.npcId ? (NPCS[this.npcId]?.name ?? '') : '',
    }[this.kind];
    const closeBtn = h('button', { class: 'close' }, '✕');
    onTap(closeBtn, () => this.close());
    const coins = h('span', { class: 'price' }, `${me.coins} ${T.coins}${this.kind === 'catalogue' ? ` · ⭐ ${me.stars}` : ''}`);
    const head = h('h2', null, title, h('span', { class: 'spacer' }), this.kind === 'catalogue' || this.kind === 'sell' || this.kind === 'pizzeria' || this.kind === 'travel' ? coins : null, closeBtn);
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: 'panel' }, head, body);
    if (SEARCH_KINDS.includes(this.kind)) {
      this.frame = this.buildFrame(panel, head, body, this.kind === 'catalogue' || this.kind === 'sell' ? coins : null);
      this.modal.append(panel);
      this.renderBody(true);
      return;
    }
    switch (this.kind) {
      case 'pizzeria':
        this.renderPizzeria(body);
        break;
      case 'travel':
        this.renderTravel(body);
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
      case 'paint':
        body.append(
          new PaintBoard(
            (pixels) => {
              net.send({ t: 'paint', pixels });
              this.close();
            },
            () => this.close(),
          ).el,
        );
        break;
    }
    this.modal.append(panel);
    if (scrollTop) body.scrollTop = scrollTop;
  }

  // ---- search & filter toolbar (backpack, chest, shop, sell) ----

  private hasFilter(): boolean {
    return this.filter !== 'all' || normalizeQuery(this.query) !== '';
  }

  /** A stack passes the active filter chip and search text. */
  private stackMatches(itemId: string): boolean {
    return (this.filter === 'all' || filterOf(itemId) === this.filter) && itemMatches(itemId, this.query);
  }

  private searchInput(): HTMLInputElement {
    const input = h('input', { type: 'text', class: 'search', placeholder: T.search, value: this.query, maxlength: '20', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    // keep the game's and the global shortcuts' hands off typed characters (same as renderName).
    // keyup must still reach the game, or a key held while clicking here would never be released.
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        input.blur();
        this.close();
      } else if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('input', (e) => {
      this.query = input.value;
      if ((e as InputEvent).isComposing) return; // settled on compositionend
      this.renderBody(true);
    });
    input.addEventListener('compositionend', () => {
      this.query = input.value;
      this.renderBody(true);
    });
    return input;
  }

  /** A chip/clear button: acts on tap without stealing focus from the search input. */
  private chipButton(attrs: Record<string, unknown>, text: string, fn: () => void): HTMLButtonElement {
    const b = h('button', attrs, text);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    onTap(b, fn);
    return b;
  }

  private buildFrame(panel: HTMLElement, head: HTMLElement, body: HTMLElement, coins: HTMLElement | null): SearchFrame {
    const kind = this.kind!;
    const search = this.searchInput();
    const chips = new Map<string, HTMLElement>();
    const mk = (id: string, text: string, name: string) => {
      chips.set(
        id,
        this.chipButton({ class: 'chip', title: name, 'aria-label': name }, text, () => {
          this.filter = this.filter === id ? 'all' : id;
          this.renderBody(true);
        }),
      );
    };
    mk('all', T.filterAll, T.filterAll);
    for (const f of INVENTORY_FILTERS) mk(f.id, f.emoji, FILTER_NAMES[f.id] ?? f.id);
    // always present (disabled when empty) so the toolbar doesn't change width while typing
    const clearBtn = this.chipButton({ class: 'chip', title: T.paintClear, 'aria-label': T.paintClear, disabled: true }, '✕', () => {
      if (this.query === '') return;
      this.query = '';
      this.renderBody(true);
    });
    const hint = h('div', { class: 'hint' });
    let tabs: HTMLElement | null = null;
    if (kind === 'catalogue') {
      // the search box lives in the header row, between the title and the coins
      head.insertBefore(search, head.querySelector('.spacer'));
      tabs = h('div', { class: 'tabs' });
      panel.insertBefore(tabs, body);
    } else {
      const extra: (HTMLElement | null)[] = [];
      if (kind === 'inventory' || kind === 'chest') {
        extra.push(this.sortButton(kind === 'chest' ? `${T.sort} ${T.inventory.toLowerCase()}` : T.sort));
        if (kind === 'chest' && this.chestId !== null) {
          const chestId = this.chestId;
          const stackBtn = h('button', { class: 'alt' }, `📥 ${T.quickStack}`);
          onTap(stackBtn, () => {
            net.send({ t: 'quickStack', chest: chestId });
            this.picked = null;
          });
          extra.push(stackBtn);
        }
      }
      panel.insertBefore(h('div', { class: 'toolbar' }, search, ...chips.values(), clearBtn, ...extra), body);
    }
    return { kind, panel, body, search, chips, clearBtn, tabs, hint, coins };
  }

  private sortButton(label: string, chest?: number): HTMLElement {
    const b = h('button', { class: 'alt', title: label }, `↕ ${label}`);
    onTap(b, () => {
      net.send(chest === undefined ? { t: 'sort' } : { t: 'sort', chest });
      this.picked = null;
    });
    return b;
  }

  /** Rebuild only what depends on state: coins, chip highlight, tabs, hint and body. The input is never touched. */
  private renderBody(resetScroll = false): void {
    const f = this.frame;
    const me = myPlayer();
    if (!f || !this.modal || !me) return;
    const scrollTop = resetScroll ? 0 : f.body.scrollTop;
    if (f.coins) f.coins.textContent = `${me.coins} ${T.coins}${f.kind === 'catalogue' ? ` · ⭐ ${me.stars}` : ''}`;
    if (f.search.value !== this.query) f.search.value = this.query;
    for (const [id, el] of f.chips) el.classList.toggle('on', this.filter === id);
    f.clearBtn.disabled = this.query === '';
    f.hint.remove();
    clear(f.body);
    if (f.kind === 'inventory') this.renderInventory(f, null);
    else if (f.kind === 'chest') this.renderInventory(f, this.chestId);
    else if (f.kind === 'catalogue') this.renderCatalogue(f);
    else this.renderSell(f);
    if (scrollTop) f.body.scrollTop = scrollTop;
  }

  // ---- inventory & chest (tap one slot, then another to move) ----

  private renderInventory(f: SearchFrame, chestId: number | null): void {
    const { panel, body } = f;
    const me = myPlayer()!;
    const world = client.world!;
    const sameRef = (a: SlotRef, b: SlotRef) => a.slot === b.slot && a.chest === b.chest;
    const stackAt = (ref: SlotRef): ItemStack | null | undefined => (ref.chest === undefined ? me.inventory : world.objects[ref.chest]?.items)?.[ref.slot];
    const filtering = this.hasFilter();
    const dims = (s: ItemStack | null) => filtering && !!s && !this.stackMatches(s.item);
    const tap = (ref: SlotRef) => {
      if (!this.picked) {
        const s = stackAt(ref);
        if (!s || dims(s)) return;
        this.picked = ref;
      } else if (sameRef(this.picked, ref)) {
        this.picked = null;
      } else {
        net.send({ t: 'swap', a: this.picked, b: ref });
        this.picked = null;
      }
      this.rerender();
    };
    let anyMatch = false;
    const grid = (inv: (ItemStack | null)[], chest: number | undefined, from: number, to: number, keys: boolean) => {
      const g = h('div', { class: 'grid' });
      for (let i = from; i < to; i++) {
        const ref: SlotRef = chest === undefined ? { slot: i } : { chest, slot: i };
        const s = inv[i] ?? null;
        if (s && !dims(s)) anyMatch = true;
        g.append(
          slotEl(s, {
            selected: chest === undefined && me.selected === i,
            picked: !!this.picked && sameRef(this.picked, ref),
            dim: dims(s),
            key: keys ? String(i + 1) : undefined,
            onTap: () => tap(ref),
          }),
        );
      }
      return g;
    };
    const sortBtn = (label: string, chest?: number) => this.sortButton(label, chest);
    const hint = f.hint;
    if (chestId !== null) {
      const chest = world.objects[chestId];
      const items = chest?.items ?? [];
      body.append(h('div', { class: 'hint title-row' }, T.chest, sortBtn(`${T.sort} ${T.chest.toLowerCase()}`, chestId)), grid(items, chestId, 0, CHEST_SIZE, false));
    }
    body.append(h('div', { class: 'hint' }, this.filter === 'all' ? T.inventory : `${T.inventory} · ${FILTER_NAMES[this.filter] ?? ''}`), grid(me.inventory, undefined, 0, HOTBAR_SIZE, true), grid(me.inventory, undefined, HOTBAR_SIZE, INVENTORY_SIZE, false));
    if (filtering && !anyMatch) {
      hint.textContent = T.noMatch;
      panel.insertBefore(hint, body);
    }
    const actions = h('div', { class: 'tabs' });
    const picked = this.picked ? stackAt(this.picked) : null;
    if (this.picked && picked) {
      actions.append(h('span', { class: 'picked-name' }, `${itemName(picked.item)}${picked.count > 1 ? ` × ${picked.count}` : ''}`));
    }
    if (this.picked && picked && this.picked.chest === undefined) {
      const slot = this.picked.slot;
      const s = picked;
      const useBtn = h('button', null, fmt(T.hold, { item: itemName(s.item) }));
      onTap(useBtn, () => {
        me.selected = slot;
        net.send({ t: 'select', slot });
        this.picked = null;
        this.close();
      });
      const drop1 = h('button', { class: 'alt' }, T.dropOne);
      onTap(drop1, () => {
        net.send({ t: 'drop', slot, qty: 1 });
        this.picked = null;
      });
      const dropAll = h('button', { class: 'alt' }, T.dropAll);
      onTap(dropAll, () => {
        net.send({ t: 'drop', slot, qty: 99 });
        this.picked = null;
      });
      actions.append(useBtn, drop1);
      if (s.count > 1) actions.append(dropAll);
    } else if (!picked) actions.append(h('span', { class: 'hint' }, T.moveHint));
    body.append(actions);
  }

  // ---- catalogue ----

  private renderCatalogue(f: SearchFrame): void {
    const { body } = f;
    const me = myPlayer()!;
    const searching = normalizeQuery(this.query) !== '';
    const tabs = f.tabs!;
    clear(tabs);
    for (const t of TABS) {
      if (t === 'season' && client.season === 'none') continue;
      const b = h('button', { class: this.tab === t && !searching ? 'on' : '' }, TAB_NAMES[t]!);
      onTap(b, () => {
        this.tab = t;
        this.query = '';
        this.renderBody(true);
      });
      tabs.append(b);
    }
    const rows = h('div', { class: 'rows' });
    // a search looks in every tab, so kids find things without knowing where they live
    const items = Object.values(ITEMS)
      .filter((d) => (searching ? d.tab !== undefined && (TABS as readonly string[]).includes(d.tab) && itemMatches(d.id, this.query) : d.tab === this.tab) && catalogueAvailable(d.id, client.season))
      .sort((a, b) => (searching ? TABS.indexOf(a.tab as (typeof TABS)[number]) - TABS.indexOf(b.tab as (typeof TABS)[number]) : 0));
    const orders = this.tab === 'animals' || searching ? this.pendingOrders(searching ? this.query : '') : [];
    if (orders.length) {
      rows.append(h('div', { class: 'hint section' }, `🚚 ${T.onTheWay}`));
      for (const o of orders) {
        const itemId = `animal_${o.species}`;
        rows.append(h('div', { class: 'row' }, icon(getArt().iconUrl[itemId] ?? ''), h('span', { class: 'name' }, SPECIES_NAMES[o.species] ?? o.species), h('span', { class: 'have' }, o.owner)));
      }
    }
    if (items.length === 0 && orders.length === 0) rows.append(h('div', { class: 'hint' }, searching ? T.noMatch : T.nothingHere));
    for (const d of items) {
      const owned = d.category === 'clothing' && me.wardrobe.includes(d.id);
      const price = d.stars !== undefined ? `⭐ ${d.stars}` : `${d.buy} ${T.coins}`;
      const have = d.category === 'clothing' ? 0 : countItem(me.inventory, d.id);
      const name = h('span', { class: 'name' }, this.catalogueName(d));
      if (searching && d.tab) name.append(h('span', { class: 'tag' }, TAB_NAMES[d.tab] ?? d.tab));
      if (have > 0) name.append(h('br'), h('span', { class: 'have' }, fmt(T.youHave, { n: have })));
      const row = h('div', { class: `row${owned ? ' off' : ''}` }, icon(getArt().iconUrl[d.id] ?? ''), name, h('span', { class: 'price' }, price));
      if (owned) row.append(h('span', { class: 'hint' }, T.alreadyOwn));
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

  /** Animals ordered by anyone in the world, arriving tomorrow. A query keeps only the matching species. */
  private pendingOrders(query: string): { species: string; owner: string }[] {
    const out: { species: string; owner: string }[] = [];
    const q = normalizeQuery(query);
    for (const p of Object.values(client.world?.players ?? {})) {
      for (const o of p.orders ?? []) {
        if (q !== '' && !itemMatches(`animal_${o.species}`, q) && !normalizeQuery(SPECIES_NAMES[o.species] ?? o.species).includes(q)) continue;
        out.push({ species: o.species, owner: p.name });
      }
    }
    return out;
  }

  // ---- pizzeria ----

  private renderPizzeria(body: HTMLElement): void {
    const me = myPlayer()!;
    body.append(h('div', { class: 'hint' }, T.pizzeriaHint));
    const rows = h('div', { class: 'rows' });
    for (const d of Object.values(ITEMS).filter((x) => x.tab === 'pizzeria' && catalogueAvailable(x.id, client.season))) {
      const row = h('div', { class: 'row' }, icon(getArt().iconUrl[d.id] ?? ''), h('span', { class: 'name' }, itemName(d.id)), h('span', { class: 'price' }, `${d.buy} ${T.coins}`));
      const b = h('button', { disabled: me.coins < (d.buy ?? 0) }, T.buy);
      onTap(b, () => net.send({ t: 'buy', item: d.id, qty: 1 }));
      row.append(b);
      rows.append(row);
    }
    body.append(rows);
  }

  // ---- bus stop / train station ----
  private travelVia(): 'bus' | 'train' {
    const w = activeWorld();
    const o = w && this.travelId !== null ? w.objects[this.travelId] : undefined;
    return o?.kind === 'train_station' ? 'train' : 'bus';
  }

  private renderTravel(body: HTMLElement): void {
    const me = myPlayer()!;
    const via = this.travelVia();
    body.append(h('div', { class: 'hint' }, T.travelHint));
    const dests = transportDestinations(me, via);
    if (!dests.length) {
      body.append(h('p', { class: 'help-intro' }, T.noDestinations));
      return;
    }
    const rows = h('div', { class: 'rows' });
    for (const d of dests) {
      const row = h('div', { class: 'row' }, h('span', { class: 'em' }, d.key === 'farm' ? '🏡' : d.unknown ? '❔' : '🏙️'), h('span', { class: 'name' }, d.name), h('span', { class: 'price' }, `${d.price} ${T.coins}`));
      const b = h('button', { disabled: me.coins < d.price }, `${via === 'train' ? '🚂' : '🚌'} ${T.go}`);
      onTap(b, () => {
        net.send({ t: 'ride', via, to: d.key });
        this.close();
      });
      row.append(b);
      rows.append(row);
    }
    body.append(rows);
  }

  private catalogueName(d: ItemDef): string {
    if (d.category === 'animal' && d.species && !ANIMALS[d.species]?.vehicle) {
      const house = ANIMALS[d.species]?.house;
      return `${SPECIES_NAMES[d.species] ?? d.id}${house ? ` (${T.needs} ${itemName(house)})` : ''}`;
    }
    return itemName(d.id);
  }

  // ---- sell ----

  private renderSell(f: SearchFrame): void {
    const { body } = f;
    const me = myPlayer()!;
    const rows = h('div', { class: 'rows' });
    let any = false;
    let sellable = false;
    me.inventory.forEach((s, slot) => {
      if (!s) return;
      const d = itemDef(s.item);
      if (d.sell === undefined) return;
      sellable = true;
      if (!this.stackMatches(s.item)) return;
      any = true;
      const price = s.data !== undefined ? PAINTED_SELL : d.sell;
      const one = h('button', null, `${T.sellOne} (${price} ${T.coins})`);
      onTap(one, () => net.send({ t: 'sell', slot, qty: 1 }));
      const all = h('button', { class: 'alt' }, `${T.sellAll} (${price * s.count} ${T.coins})`);
      onTap(all, () => net.send({ t: 'sell', slot, qty: s.count }));
      rows.append(h('div', { class: 'row' }, icon(stackIconUrl(s)), h('span', { class: 'name' }, `${itemName(s.item)} × ${s.count}`), one, s.count > 1 ? all : null!));
    });
    if (!any) rows.append(h('div', { class: 'hint' }, sellable && this.hasFilter() ? T.noMatch : T.nothingToSell));
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
    const names: Record<ClothingSlot, string> = { hat: T.tabHats, shirt: T.tabShirts, pants: T.tabPants, shoes: T.tabShoes };
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
    const me = myPlayer();
    const ridden = me?.riding !== undefined ? activeWorld()?.animals[me.riding] : undefined;
    if (ridden && isVehicle(ridden)) {
      const b = h('button', { title: T.honk }, T.honk);
      onTap(b, () => {
        net.send({ t: 'honk' });
        this.close();
      });
      grid.append(b);
    }
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
    const mini = h('button', { class: 'alt' }, `🧭 ${T.minimapToggle}`);
    onTap(mini, () => document.dispatchEvent(new CustomEvent('lilla:minimap')));
    body.append(h('p', { class: 'help-intro' }, `${T.youAreHere}: ${BIOME_EMOJI[(client.areas[here]?.biome as Biome | undefined) ?? (here === 'farm' ? 'farm' : 'ang')]} ${here === 'farm' ? BIOME_NAMES.farm : BIOME_NAMES[(client.areas[here]?.biome as Biome | undefined) ?? 'ang']} · ${T.mapNorthHint}`), grid, h('div', { class: 'tabs' }, home, mini));
  }

  // ---- gårdsbok ----

  private renderBook(body: HTMLElement): void {
    const me = myPlayer()!;
    const done = ACHIEVEMENTS.filter((a) => me.achievements?.includes(a.id)).length;
    body.append(h('p', { class: 'help-intro' }, `⭐ ${me.stars} ${T.stars} · ${fmt(T.achievementsDone, { done, total: ACHIEVEMENTS.length })}`));
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
    const a = this.animalId !== null ? activeWorld()?.animals[this.animalId] : undefined;
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
