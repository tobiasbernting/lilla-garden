// Game controllers (Gamepad API, "standard" layout: Xbox/PlayStation/Switch pads in a browser).
// Shared by the 2D and 3D clients. Polled once per animation frame.
//
// Playing: left stick walks, right stick looks (3D), X/RT uses (hold to keep using in 3D), A jumps in 3D
// (uses in 2D), B/LT/L3 runs, LB/RB and d-pad left/right pick a tool, Y backpack, d-pad up emotes,
// d-pad down minimap, R3 camera (3D), Start help, Select/Back book.
// Menus: stick/d-pad moves a highlight between buttons, A presses, B closes, right stick scrolls.
import { myPlayer } from '../state.js';
import type { Hud, HudTarget } from './hud.js';
import type { Menus } from './menus.js';

export interface PadTarget extends HudTarget {
  stopUse?(): void;
  look?(dYaw: number, dPitch: number): void;
  jump?(): void;
  cycleCamera?(): void;
  /** A controller is being used (the 3D game hides its "click to play" hint). */
  setPadActive?(on: boolean): void;
}

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 } as const;

const DEAD = 0.2;
/** Radians per second at full right-stick deflection. */
const LOOK_RATE = 2.8;
const NAV_DELAY = 380;
const NAV_REPEAT = 130;
const FOCUSABLE = 'button:not(:disabled), input, select, textarea, .slot, .swatch, .card, .worldmap .cell.known';

function dead(v: number): number {
  const a = Math.abs(v);
  return a < DEAD ? 0 : (Math.sign(v) * (a - DEAD)) / (1 - DEAD);
}

export function initGamepad(opts: { ui: HTMLElement; target: () => PadTarget | null; menus: Menus; hud: Hud }): void {
  const { ui, target, menus, hud } = opts;
  let prev: boolean[] = [];
  let pressed: boolean[] = [];
  let axes = [0, 0, 0, 0];
  let active = false;
  let moving = false;
  let using = false;
  let focus: HTMLElement | null = null;
  let focusAt = { x: 0, y: 0 };
  let navDir = '';
  let navNext = 0;
  let last = performance.now();

  window.addEventListener('gamepadconnected', () => hud.toast('🎮 Handkontroll ansluten'));
  window.addEventListener('gamepaddisconnected', () => {
    if (!navigator.getGamepads().some(Boolean)) setActive(false);
  });
  // the mouse or a finger takes over again
  for (const ev of ['mousedown', 'touchstart', 'keydown']) window.addEventListener(ev, () => setActive(false), { capture: true });

  function setActive(on: boolean): void {
    if (active === on) return;
    active = on;
    if (!on) {
      target()?.setPadActive?.(false);
      setFocus(null);
    }
  }

  /** Every connected pad counts, so either of two kids' pads works (they just share the player). */
  function read(): boolean {
    const pads = navigator.getGamepads?.() ?? [];
    const b: boolean[] = [];
    const ax = [0, 0, 0, 0];
    let any = false;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      any = true;
      p.buttons.forEach((btn, i) => (b[i] = b[i] || btn.pressed || btn.value > 0.5));
      for (let i = 0; i < 4; i++) {
        const v = dead(p.axes[i] ?? 0);
        if (Math.abs(v) > Math.abs(ax[i]!)) ax[i] = v;
      }
    }
    prev = pressed;
    pressed = b;
    axes = ax;
    return any;
  }

  const down = (i: number) => !!pressed[i];
  const hit = (i: number) => !!pressed[i] && !prev[i];

  /** The open menu, or the character picker before the game starts. */
  function menuRoot(): HTMLElement | null {
    if (menus.isOpen()) return ui.querySelector<HTMLElement>('.modal');
    return ui.querySelector<HTMLElement>('.picker');
  }

  function frame(): void {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!read()) return;
    if (!active && (pressed.some(Boolean) || axes.some((v) => v !== 0))) setActive(true);
    if (!active) return;
    const root = menuRoot();
    if (root) {
      stopPlaying();
      menuFrame(root, dt, now);
    } else {
      setFocus(null);
      playFrame(dt);
    }
  }
  requestAnimationFrame(frame);

  function stopPlaying(): void {
    const t = target();
    if (!t) return;
    if (moving) {
      t.joystick.dx = 0;
      t.joystick.dy = 0;
      moving = false;
    }
    if (using) {
      t.stopUse?.();
      using = false;
    }
    t.runHeld = false;
  }

  function playFrame(dt: number): void {
    const t = target();
    if (!t) return;
    t.setPadActive?.(true);
    // walking: write the stick only while it's used, so the touch joystick keeps working
    const [lx, ly, rx, ry] = axes as [number, number, number, number];
    if (lx !== 0 || ly !== 0) {
      const len = Math.hypot(lx, ly);
      t.joystick.dx = len > 1 ? lx / len : lx;
      t.joystick.dy = len > 1 ? ly / len : ly;
      moving = true;
    } else if (moving) {
      t.joystick.dx = 0;
      t.joystick.dy = 0;
      moving = false;
    }
    t.runHeld = down(B.B) || down(B.LT) || down(B.L3);
    // looking: squared for fine aiming near the middle
    if (t.look && (rx !== 0 || ry !== 0)) t.look(-rx * Math.abs(rx) * LOOK_RATE * dt, -ry * Math.abs(ry) * LOOK_RATE * dt);

    const useBtn = t.jump ? [B.X, B.RT] : [B.A, B.X, B.RT];
    if (useBtn.some(hit)) {
      t.act();
      using = true;
    } else if (using && !useBtn.some(down)) {
      t.stopUse?.();
      using = false;
    }
    if (t.jump && hit(B.A)) t.jump();
    if (hit(B.R3)) t.cycleCamera?.();

    const slot = hotbarStep();
    if (slot !== null) hud.select(slot);
    if (hit(B.Y)) menus.toggle('inventory');
    if (hit(B.Up)) menus.toggle('emotes');
    if (hit(B.Down)) hud.minimap.toggle();
    if (hit(B.Start)) menus.toggle('help');
    if (hit(B.Back)) menus.toggle('book');
  }

  /** The hotbar slot after LB/RB or d-pad left/right, or null. */
  function hotbarStep(): number | null {
    const dir = hit(B.RB) || hit(B.Right) ? 1 : hit(B.LB) || hit(B.Left) ? -1 : 0;
    if (!dir) return null;
    const me = myPlayer();
    return me ? (me.selected + dir + 8) % 8 : null;
  }

  // ------------------------------------------------------------------ menus

  function setFocus(el: HTMLElement | null): void {
    if (focus === el) return;
    focus?.classList.remove('pad-focus');
    focus = el;
    if (!el) return;
    el.classList.add('pad-focus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    focusAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function focusables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null);
  }

  function menuFrame(root: HTMLElement, dt: number, now: number): void {
    const list = focusables(root);
    // menus redraw themselves when the game state changes: keep the highlight where it was
    if (!focus || !focus.isConnected || !root.contains(focus)) {
      focus = null;
      setFocus(nearest(list, focusAt) ?? null);
    }

    const [lx, ly, , ry] = axes as [number, number, number, number];
    const dir =
      down(B.Up) || ly < -0.5 ? 'up' : down(B.Down) || ly > 0.5 ? 'down' : down(B.Left) || lx < -0.5 ? 'left' : down(B.Right) || lx > 0.5 ? 'right' : '';
    if (dir !== navDir) {
      navDir = dir;
      navNext = now + NAV_DELAY;
      if (dir) move(list, dir);
    } else if (dir && now >= navNext) {
      navNext = now + NAV_REPEAT;
      move(list, dir);
    }
    if (ry !== 0) root.querySelector('.body')?.scrollBy(0, ry * 600 * dt);

    if (hit(B.A) && focus) {
      if (focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement || focus instanceof HTMLSelectElement) focus.focus();
      else focus.click();
    }
    if (hit(B.B) || hit(B.Start)) {
      if (menus.isOpen()) menus.close();
      else root.querySelector<HTMLElement>('button.alt')?.click(); // the picker's "back"
    }
    if (hit(B.Y) && menus.isOpen()) menus.close();
  }

  function centre(e: HTMLElement): { x: number; y: number } {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function nearest(list: HTMLElement[], p: { x: number; y: number }): HTMLElement | undefined {
    let best: HTMLElement | undefined;
    let bestD = Infinity;
    for (const e of list) {
      const c = centre(e);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Spatial navigation: the closest element in that direction, favouring ones in line with us. */
  function move(list: HTMLElement[], dir: string): void {
    if (!focus) return setFocus(list[0] ?? null);
    const from = centre(focus);
    const [ux, uy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0];
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const e of list) {
      if (e === focus) continue;
      const c = centre(e);
      const along = (c.x - from.x) * ux + (c.y - from.y) * uy;
      if (along < 4) continue;
      const across = Math.abs((c.x - from.x) * uy - (c.y - from.y) * ux);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) setFocus(best);
  }
}
