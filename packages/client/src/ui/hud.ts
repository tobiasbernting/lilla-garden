// HUD: top chips, hotbar, toasts, touch controls.
import { BIOME_EMOJI, BIOME_NAMES, HOTBAR_SIZE, MAX_HEARTS, T, WATERING_CAN_CHARGES, fmt, isBathKey, itemName, type Biome, type ItemStack } from '@lilla-garden/shared';
import { Minimap } from './minimap.ts';
import { ART_STYLE, nextArtStyle, setArtStyle } from '../art/style.ts';
import { getArt } from '../art/textures.js';
import { stackIconUrl } from '../art/painting.ts';
import { net } from '../net.js';
import type { GameScene } from '../scenes/GameScene.js';
import { bus, client, myPlayer } from '../state.js';
import { clear, h, icon, onTap } from './dom.js';
import { isMuted, setMuted } from '../sound.ts';

export function slotEl(stack: ItemStack | null, opts: { selected?: boolean; picked?: boolean; key?: string; onTap?: () => void } = {}): HTMLDivElement {
  const art = getArt();
  const el = h('div', { class: `slot${opts.selected ? ' selected' : ''}${opts.picked ? ' picked' : ''}` });
  if (opts.key) el.append(h('span', { class: 'key' }, opts.key));
  if (stack) {
    el.append(icon(stackIconUrl(stack), itemName(stack.item)));
    el.title = itemName(stack.item);
    if (stack.charges !== undefined) {
      el.append(h('div', { class: 'charges' }, h('i', { style: { width: `${(stack.charges / WATERING_CAN_CHARGES) * 100}%` } })));
    } else if (stack.count > 1) el.append(h('span', { class: 'count' }, stack.count));
  }
  if (opts.onTap) onTap(el, opts.onTap);
  return el;
}

export class Hud {
  root: HTMLElement;
  private top: HTMLElement;
  private hotbar: HTMLElement;
  private heldName: HTMLElement;
  private toasts: HTMLElement;
  private joy: HTMLElement;
  private joyKnob: HTMLElement;
  minimap!: Minimap;

  constructor(
    private ui: HTMLElement,
    private scene: () => GameScene | null,
    private openMenu: (ui: 'inventory' | 'emotes' | 'help' | 'book' | 'map') => void,
  ) {
    this.root = h('div', { class: 'hud' });
    this.top = h('div', { class: 'hud-top' });
    this.hotbar = h('div', { class: 'hotbar' });
    this.heldName = h('div', { class: 'hud-name' });
    this.toasts = h('div', { class: 'toasts' });
    this.joyKnob = h('i');
    this.joy = h('div', { class: 'joy' }, this.joyKnob);
    const zone = h('div', { class: 'joy-zone' }, this.joy);
    const act = h('div', { class: 'act-btn' }, '✋');
    const run = h('div', { class: 'run-btn' }, '🏃');
    const setRun = (v: boolean) => {
      const s = this.scene();
      if (s) s.runHeld = v;
    };
    run.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setRun(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) run.addEventListener(ev, () => setRun(false));
    const right = h('div', { class: 'hud-right' }, this.roundBtn('🎒', () => this.openMenu('inventory')), this.roundBtn('😊', () => this.openMenu('emotes')), this.roundBtn('📖', () => this.openMenu('book')), this.roundBtn('🗺️', () => this.openMenu('map')), this.roundBtn('🧭', () => this.minimap.toggle()), this.roundBtn('❓', () => this.openMenu('help')), this.muteBtn(), this.fullscreenBtn(), this.artBtn());
    this.minimap = new Minimap();
    document.addEventListener('lilla:minimap', () => this.minimap.toggle());
    this.root.append(this.top, right, this.hotbar, this.heldName, this.toasts, zone, act, run, this.minimap.el);
    ui.append(this.root);
    this.setupJoystick(zone);
    act.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.scene()?.act();
    });

    bus.on('me', () => this.render());
    bus.on('state', () => this.renderTop());
    bus.on('day', () => this.renderTop());
    bus.on('toast', (text) => this.toast(text));
    this.render();
  }

  private artBtn(): HTMLElement {
    const next = nextArtStyle(ART_STYLE);
    const label: Record<string, string> = { klassisk: 'Klassisk grafik', ny: 'Ny pixelgrafik', hd: 'HD-grafik (prototyp)' };
    const b = h('div', { class: 'round small', title: `Byt till: ${label[next]}` }, ART_STYLE === 'klassisk' ? '✨' : ART_STYLE === 'ny' ? '🖼️' : '🎨');
    onTap(b, () => setArtStyle(next));
    return b;
  }

  private fullscreenBtn(): HTMLElement {
    const b = h('div', { class: 'round small', title: T.fullscreen }, '⛶');
    onTap(b, () => {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (document.fullscreenElement) void document.exitFullscreen();
      else void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => (b.textContent = document.fullscreenElement ? '🡼' : '⛶'));
    return b;
  }

  private muteBtn(): HTMLElement {
    const b = h('div', { class: 'round small' }, isMuted() ? '🔇' : '🔊');
    onTap(b, () => {
      setMuted(!isMuted());
      b.textContent = isMuted() ? '🔇' : '🔊';
      try {
        localStorage.setItem('lilla-garden.muted', isMuted() ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    return b;
  }

  private roundBtn(label: string, fn: () => void): HTMLElement {
    const b = h('div', { class: 'round' }, label);
    onTap(b, fn);
    return b;
  }

  toast(text: string): void {
    const el = h('div', { class: 'toast' }, text);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), 3000);
  }

  render(): void {
    this.renderTop();
    const me = myPlayer();
    clear(this.hotbar);
    if (!me) return;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = me.inventory[i] ?? null;
      this.hotbar.append(
        slotEl(s, {
          selected: me.selected === i,
          key: String(i + 1),
          onTap: () => {
            if (me.selected === i) this.openMenu('inventory');
            else this.select(i);
          },
        }),
      );
    }
    const held = me.inventory[me.selected];
    this.heldName.textContent = held ? itemName(held.item) : '';
  }

  select(i: number): void {
    const me = myPlayer();
    if (!me) return;
    me.selected = i;
    net.send({ t: 'select', slot: i });
    this.render();
  }

  private renderTop(): void {
    const me = myPlayer();
    clear(this.top);
    const f = client.timeMs / (10 * 60 * 1000);
    const clock = f < 0.3 ? '🌅' : f < 0.65 ? '☀️' : f < 0.8 ? '🌇' : '🌙';
    this.top.append(h('div', { class: 'chip' }, `${clock} ${fmt(T.day, { day: client.day })}`));
    if (me) this.top.append(h('div', { class: 'chip' }, h('span', { class: 'coins' }, `${me.coins} ${T.coins}`)));
    if (me && me.stars > 0) this.top.append(h('div', { class: 'chip' }, `⭐ ${me.stars}`));
    if (me && me.area === 'dungeon') this.top.append(h('div', { class: 'chip hearts' }, '❤️'.repeat(Math.max(0, me.hearts)) + '🖤'.repeat(Math.max(0, MAX_HEARTS - me.hearts))));
    if (me && isBathKey(me.area)) this.top.append(h('div', { class: 'chip' }, `🏊 ${T.bathhouseName}`));
    else if (me && me.area !== 'farm' && me.area !== 'dungeon') {
      const b = (client.areas[me.area]?.biome as Biome | undefined) ?? 'ang';
      this.top.append(h('div', { class: 'chip' }, `${BIOME_EMOJI[b]} ${BIOME_NAMES[b]}`));
    }
    if (client.season !== 'none') {
      const glyph = { halloween: '🎃', jul: '🎄', pask: '🐣', midsommar: '🌸', none: '' }[client.season];
      this.top.append(h('div', { class: 'chip' }, glyph));
    }
  }

  private setupJoystick(zone: HTMLElement): void {
    let active = false;
    let ox = 0;
    let oy = 0;
    let id = -1;
    const radius = () => 14 * zoomPx();
    const set = (dx: number, dy: number) => {
      const s = this.scene();
      if (s) s.joystick = { dx, dy };
    };
    zone.addEventListener('pointerdown', (e) => {
      if (active) return;
      active = true;
      id = e.pointerId;
      const r = zone.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      this.joy.style.left = `${ox}px`;
      this.joy.style.top = `${oy}px`;
      this.joy.style.display = 'block';
      this.joyKnob.style.transform = 'translate(-50%,-50%)';
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== id) return;
      const r = zone.getBoundingClientRect();
      let dx = e.clientX - r.left - ox;
      let dy = e.clientY - r.top - oy;
      const len = Math.hypot(dx, dy);
      const rad = radius();
      if (len > rad) {
        dx = (dx / len) * rad;
        dy = (dy / len) * rad;
      }
      this.joyKnob.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
      const dead = rad * 0.2;
      if (len < dead) set(0, 0);
      else set(dx / rad, dy / rad);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      active = false;
      this.joy.style.display = 'none';
      set(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}

export const zoomPx = (): number => Number(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 4;
