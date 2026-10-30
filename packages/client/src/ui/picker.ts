// "Vem är du?" – character picker and creator.
import { ITEMS, MAX_PLAYERS, T, itemName, type Appearance, type PlayerSummary } from '@lilla-garden/shared';
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../art/characters.js';
import { portraitUrl } from '../art/textures.js';
import { toGate } from '../net.js';
import { rememberedPlayer } from '../state.js';
import { clear, h, onTap } from './dom.js';

const STYLE_NAMES: Record<string, string> = { short: 'Kort', long: 'Långt', curly: 'Lockigt', ponytail: 'Tofs', bald: 'Inget' };
const STARTER_SHIRTS = ['shirt_red', 'shirt_blue', 'shirt_green', 'shirt_yellow'];

export class Picker {
  root: HTMLElement;
  private status: HTMLElement | null = null;
  private canCreate = true;

  constructor(
    private ui: HTMLElement,
    private onPick: (id: string) => void,
  ) {
    this.root = h('div', { class: 'picker' });
  }

  async show(): Promise<void> {
    this.ui.append(this.root);
    clear(this.root);
    this.root.append(h('h1', null, T.title), h('p', { style: { color: '#fff', fontWeight: '800' } }, T.connecting));
    let players: PlayerSummary[] = [];
    try {
      const res = await fetch('/api/players', { cache: 'no-store' });
      if (res.status === 403) return toGate();
      players = (await res.json()) as PlayerSummary[];
      // With access control on, guest devices may only create a character or two
      const me = await fetch('/api/me', { cache: 'no-store' });
      this.canCreate = !me.ok || ((await me.json().catch(() => ({}))) as { canCreate?: boolean }).canCreate !== false;
    } catch {
      this.root.append(h('div', { class: 'status' }, T.disconnected));
      setTimeout(() => void this.show(), 2000);
      return;
    }
    this.renderList(players);
  }

  hide(): void {
    this.root.remove();
  }

  private renderList(players: PlayerSummary[]): void {
    clear(this.root);
    const last = rememberedPlayer();
    const cards = h('div', { class: 'cards' });
    for (const p of players) {
      const card = h('div', { class: `card${p.id === last ? ' last' : ''}` }, h('img', { class: 'portrait', src: portraitUrl(p.appearance, p.outfit, 4) }), h('div', { class: 'nm' }, p.name));
      onTap(card, () => this.onPick(p.id));
      cards.append(card);
    }
    if (players.length < MAX_PLAYERS && this.canCreate) {
      const add = h('div', { class: 'card new' }, '＋', h('div', { class: 'nm' }, T.newCharacter));
      onTap(add, () => this.renderCreator());
      cards.append(add);
    }
    this.root.append(h('h1', null, T.title), h('h2', { style: { color: '#fff', margin: '0' } }, T.whoAreYou), cards);
  }

  private renderCreator(): void {
    clear(this.root);
    const appearance: Appearance = { skin: SKIN_TONES[1]!, hair: HAIR_COLORS[3]!, hairStyle: 'short' };
    let shirt = 'shirt_blue';
    const preview = h('img', { class: 'portrait', style: { width: '48px' } });
    const refresh = () => {
      preview.src = portraitUrl(appearance, { shirt, pants: 'pants_blue', shoes: 'shoes_boots' }, 6);
      preview.style.width = `calc(48 * var(--u))`;
      preview.style.height = `calc(96 * var(--u))`;
      swatchesSkin.querySelectorAll('.swatch').forEach((el, i) => el.classList.toggle('on', SKIN_TONES[i] === appearance.skin));
      swatchesHair.querySelectorAll('.swatch').forEach((el, i) => el.classList.toggle('on', HAIR_COLORS[i] === appearance.hair));
      swatchesShirt.querySelectorAll('.swatch').forEach((el, i) => el.classList.toggle('on', STARTER_SHIRTS[i] === shirt));
      styleBtns.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.style === appearance.hairStyle));
    };
    const swatches = (colors: string[], get: () => string, set: (c: string) => void) => {
      const el = h('div', { class: 'swatches' });
      for (const c of colors) {
        const s = h('div', { class: `swatch${get() === c ? ' on' : ''}`, style: { background: c } });
        onTap(s, () => {
          set(c);
          refresh();
        });
        el.append(s);
      }
      return el;
    };
    const swatchesSkin = swatches(SKIN_TONES, () => appearance.skin, (c) => (appearance.skin = c));
    const swatchesHair = swatches(HAIR_COLORS, () => appearance.hair, (c) => (appearance.hair = c));
    const swatchesShirt = swatches(
      STARTER_SHIRTS.map((id) => ITEMS[id]!.clothing!.color),
      () => ITEMS[shirt]!.clothing!.color,
      (c) => (shirt = STARTER_SHIRTS.find((id) => ITEMS[id]!.clothing!.color === c) ?? shirt),
    );
    const styleBtns = h('div', { class: 'tabs' });
    for (const s of HAIR_STYLES) {
      const b = h('button', { 'data-style': s, class: appearance.hairStyle === s ? 'on' : '' }, STYLE_NAMES[s] ?? s);
      onTap(b, () => {
        appearance.hairStyle = s;
        refresh();
      });
      styleBtns.append(b);
    }
    const name = h('input', { type: 'text', maxlength: '16', placeholder: T.name, autocomplete: 'off' });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const play = h('button', null, T.play);
    const back = h('button', { class: 'alt' }, T.back);
    onTap(back, () => void this.show());
    onTap(play, async () => {
      const n = name.value.trim();
      if (!n) {
        name.focus();
        return;
      }
      play.disabled = true;
      try {
        const res = await fetch('/api/players', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n, appearance, shirt }) });
        if (res.status === 403) return void this.show();
        if (!res.ok) throw new Error(String(res.status));
        const created = (await res.json()) as PlayerSummary;
        this.onPick(created.id);
      } catch {
        play.disabled = false;
        this.root.append(h('div', { class: 'status' }, T.disconnected));
      }
    });
    const opts = h(
      'div',
      { class: 'opts' },
      h('label', null, T.name),
      name,
      h('label', null, T.skin),
      swatchesSkin,
      h('label', null, T.hair),
      swatchesHair,
      h('label', null, T.hairStyle),
      styleBtns,
      h('label', null, itemName('shirt_blue').replace('Blå ', 'Tröja: ').replace('tröja', '')),
      swatchesShirt,
      h('div', { class: 'tabs' }, play, back),
    );
    const panel = h('div', { class: 'panel' }, h('h2', null, T.newCharacter), h('div', { class: 'body' }, h('div', { class: 'creator' }, preview, opts)));
    this.root.append(panel);
    refresh();
    setTimeout(() => name.focus(), 50);
  }
}
