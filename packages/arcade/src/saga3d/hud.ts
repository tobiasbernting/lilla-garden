// The DOM HUD over the 3D view: dungeon name, FPS and renderer counters, the player's health, the spell bar
// with cooldown sweeps, a target frame, a boss bar, a speech line and the walking stick for touch screens.
// DOM is cheap on a tablet and lets the text stay sharp whatever the render resolution is.
import { SPELLS, type ClassDef } from '@lilla-garden/shared';
import type { Input } from '../input.ts';
import './style.css';

export interface HudOptions {
  /** Show the on-screen stick (the spell buttons are always there; they also work with a mouse). */
  touch: boolean;
  /** Show draw calls, triangles and pixel ratio next to the FPS. */
  stats: boolean;
  dungeonName: string;
  /** Receives the stick (-1..1, y down) via `touchStickMove`. */
  input: Input;
}

const STICK_R = 56;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

/** A health bar: fill and a "hp / max" text. */
class Bar {
  readonly root: HTMLElement;
  private fill: HTMLElement;
  private text: HTMLElement;
  private last = '';
  constructor(parent: HTMLElement) {
    this.root = el('div', 'saga3d-bar', parent);
    this.fill = el('i', '', this.root);
    this.text = el('b', '', this.root);
  }
  set(hp: number, max: number): void {
    const key = `${Math.ceil(hp)}/${max}`;
    if (key === this.last) return;
    this.last = key;
    this.fill.style.width = `${Math.max(0, Math.min(1, hp / Math.max(1, max))) * 100}%`;
    this.text.textContent = `${Math.max(0, Math.ceil(hp))} / ${Math.ceil(max)}`;
  }
}

export class Hud {
  /** Fired on pointerdown on a spell button (slot 0–3) or when the integrator wires the keys to it. */
  onSpell: (slot: number) => void = () => {};
  onPotion: () => void = () => {};
  /** A short tap on the walking-stick half of the screen (client coordinates): the integrator can use it to pick a monster. */
  onTap: (x: number, y: number) => void = () => {};

  readonly root: HTMLElement;
  private fps: HTMLElement;
  private playerLabel: HTMLElement;
  private playerBar: Bar;
  private spells: HTMLElement;
  private buttons: HTMLElement[] = [];
  private cdLast: number[] = [-1, -1, -1, -1];
  private potion: HTMLElement;
  private potionCd: HTMLElement;
  private potionLast = -1;
  private targetBox: HTMLElement;
  private targetName: HTMLElement;
  private targetBar: Bar;
  private bossBox: HTMLElement;
  private bossName: HTMLElement;
  private bossBar: Bar;
  private say: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private downEl: HTMLElement;
  private sayTimer = 0;
  private cls: ClassDef | null = null;
  private fpsText = '';
  private cleanup: (() => void)[] = [];

  constructor(parent: HTMLElement, private opts: HudOptions) {
    this.root = el('div', 'saga3d-hud', parent);
    if (opts.touch) this.root.classList.add('saga3d-touch');
    el('div', 'saga3d-name', this.root, opts.dungeonName);
    this.fps = el('div', 'saga3d-fps', this.root);

    const player = el('div', 'saga3d-player', this.root);
    this.playerLabel = el('div', 'saga3d-label', player);
    this.playerBar = new Bar(player);

    this.targetBox = el('div', 'saga3d-target', this.root);
    this.targetName = el('div', 'saga3d-label', this.targetBox);
    this.targetBar = new Bar(this.targetBox);
    this.bossBox = el('div', 'saga3d-boss', this.root);
    this.bossName = el('div', 'saga3d-label', this.bossBox);
    this.bossBar = new Bar(this.bossBox);
    this.say = el('div', 'saga3d-say', this.root);
    this.toastEl = el('div', 'saga3d-toast', this.root);
    this.downEl = el('div', 'saga3d-down', this.root, 'Du föll… reser dig snart');

    this.spells = el('div', 'saga3d-spells', this.root);
    this.potion = this.makeButton('saga3d-potion', '🧪', '5', 'Dryck');
    this.potionCd = this.potion.querySelector('.saga3d-cd') as HTMLElement;
    this.potion.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onPotion();
    });
    this.spells.append(this.potion);

    if (opts.touch) this.makeStick();
  }

  private makeButton(extra: string, icon: string, key: string, name: string): HTMLElement {
    const b = el('div', `saga3d-btn ${extra}`.trim());
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', name);
    b.append(document.createTextNode(icon));
    el('span', 'saga3d-key', b, key);
    el('span', 'saga3d-spellname', b, name);
    el('div', 'saga3d-cd', b);
    return b;
  }

  /** Builds the four spell buttons for a class the first time (and again if the class changes). */
  private buildSpells(cls: ClassDef): void {
    for (const b of this.buttons) b.remove();
    this.buttons = cls.spells.map((id, slot) => {
      const sp = SPELLS[id];
      const b = this.makeButton('', sp?.icon ?? '❔', String(slot + 1), sp?.name ?? id);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('saga3d-press');
        this.onSpell(slot);
      });
      const release = (): void => b.classList.remove('saga3d-press');
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('pointerleave', release);
      this.spells.append(b);
      return b;
    });
    this.cdLast = [-1, -1, -1, -1];
  }

  /** The player's health and class (the class decides the spell buttons). */
  setPlayer(hp: number, max: number, cls: ClassDef): void {
    if (this.cls !== cls) {
      this.cls = cls;
      this.playerLabel.textContent = `${cls.emoji} ${cls.name}`;
      this.buildSpells(cls);
    }
    this.playerBar.set(hp, max);
  }

  /** How much of a spell's cooldown is left, 0 (ready) to 1 (just cast). Slot 4 is the potion. */
  setCooldown(slot: number, fraction: number): void {
    const f = Math.round(Math.max(0, Math.min(1, fraction)) * 200) / 200;
    if (slot === 4) {
      if (f !== this.potionLast) this.potionCd.style.setProperty('--cd', String(f));
      this.potionLast = f;
      return;
    }
    if (this.cdLast[slot] === f) return;
    this.cdLast[slot] = f;
    (this.buttons[slot]?.querySelector('.saga3d-cd') as HTMLElement | null)?.style.setProperty('--cd', String(f));
  }

  /** A small shake of a button (nothing to hit with that spell). */
  shake(slot: number): void {
    const b = slot === 4 ? this.potion : this.buttons[slot];
    if (!b) return;
    b.classList.remove('saga3d-shake');
    void b.offsetWidth;
    b.classList.add('saga3d-shake');
  }

  /** The target frame at the top; null hides it. */
  setTarget(name: string | null, hp = 0, max = 1): void {
    this.targetBox.style.display = name ? 'block' : 'none';
    if (!name) return;
    if (this.targetName.textContent !== name) this.targetName.textContent = name;
    this.targetBar.set(hp, max);
  }

  /** The boss bar at the top; null hides it. */
  setBoss(name: string | null, hp = 0, max = 1): void {
    this.bossBox.style.display = name ? 'block' : 'none';
    if (!name) return;
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    this.bossBar.set(hp, max);
  }

  /** A line in the middle of the screen (a boss yell, "Dungeon klarad!") that fades after a while. */
  speak(text: string, ms = 3500): void {
    this.say.textContent = text;
    this.say.classList.add('saga3d-on');
    clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => this.say.classList.remove('saga3d-on'), ms);
  }

  /** A big message in the middle of the screen ("Porten öppnas!") that fades after a while. */
  toast(text: string, ms = 2500): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('saga3d-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('saga3d-on'), ms);
  }

  /** Greys the screen while the player is down. */
  setDown(down: boolean): void {
    this.downEl.classList.toggle('saga3d-on', down);
  }

  /** The FPS readout (always); `note` is a short warning like "pixelratio sänkt". */
  setFps(fps: number, note = ''): void {
    this.fpsText = `${Math.round(fps)} fps${note ? `\n${note}` : ''}`;
    this.refreshFps();
  }

  private stats = '';
  /** Draw calls, triangles and pixel ratio; only shown with ?stats=1. */
  setStats(calls: number, triangles: number, dpr: number): void {
    if (!this.opts.stats) return;
    this.stats = `\n${calls} anrop · ${triangles > 9999 ? `${Math.round(triangles / 1000)}k` : triangles} trianglar · dpr ${dpr.toFixed(2)}`;
    this.refreshFps();
  }

  private refreshFps(): void {
    const text = this.fpsText + this.stats;
    if (text !== this.fps.textContent) this.fps.textContent = text;
  }

  // ---- the walking stick ----

  /**
   * A floating stick: touch anywhere in the left part of the screen and the stick appears under the thumb.
   * The zone covers only the left half, and the camera only takes fingers that land on the right half, so
   * the two never fight over a finger.
   */
  private makeStick(): void {
    const zone = el('div', 'saga3d-zone', this.root);
    const base = el('div', 'saga3d-base saga3d-idle', zone);
    const knob = el('div', 'saga3d-knob', base);
    let id = -1;
    let ox = 0;
    let oy = 0;
    let downAt = 0;
    const rest = (): void => {
      base.classList.add('saga3d-idle');
      base.style.left = '112px';
      base.style.top = `${Math.max(120, zone.clientHeight - 170)}px`;
      knob.style.transform = '';
    };
    const feed = (e: PointerEvent): void => {
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.opts.input.touchStickMove(dx / STICK_R, dy / STICK_R);
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = -1;
      if (e.type === 'pointerup' && performance.now() - downAt < 350 && Math.hypot(e.clientX - ox, e.clientY - oy) < 10) this.onTap(e.clientX, e.clientY);
      this.opts.input.touchStickMove(0, 0);
      rest();
    };
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void): void => {
      zone.addEventListener(t, f as EventListener);
      this.cleanup.push(() => zone.removeEventListener(t, f as EventListener));
    };
    on('pointerdown', (e) => {
      const p = e as PointerEvent;
      if (id >= 0) return;
      e.preventDefault();
      id = p.pointerId;
      zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect();
      ox = p.clientX;
      oy = p.clientY;
      downAt = performance.now();
      base.classList.remove('saga3d-idle');
      base.style.left = `${ox - r.left}px`;
      base.style.top = `${oy - r.top}px`;
      feed(p);
    });
    on('pointermove', (e) => {
      if ((e as PointerEvent).pointerId === id) feed(e as PointerEvent);
    });
    on('pointerup', (e) => end(e as PointerEvent));
    on('pointercancel', (e) => end(e as PointerEvent));
    on('contextmenu', (e) => e.preventDefault());
    rest();
    window.addEventListener('resize', rest);
    this.cleanup.push(() => window.removeEventListener('resize', rest));
  }

  dispose(): void {
    clearTimeout(this.sayTimer);
    clearTimeout(this.toastTimer);
    for (const f of this.cleanup) f();
    this.cleanup = [];
    this.root.remove();
  }
}
