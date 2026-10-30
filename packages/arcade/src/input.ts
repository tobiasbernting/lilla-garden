// One controller for every minigame: the keyboard, a gamepad and the on-screen touch buttons all press
// the same buttons. While the arcade is open the shell catches every key before the farm game sees it.
import type { Button } from './types.ts';

const KEYS: Record<string, Button> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'a',
  KeyZ: 'a',
  KeyJ: 'a',
  KeyX: 'b',
  KeyK: 'b',
  ShiftLeft: 'b',
  ShiftRight: 'b',
  KeyC: 'c',
  KeyL: 'c',
  Enter: 'start',
  NumpadEnter: 'start',
};

/** Standard gamepad mapping: face buttons, start and the d-pad. */
const PAD_BUTTONS: [number, Button][] = [
  [0, 'a'],
  [1, 'b'],
  [2, 'c'],
  [3, 'c'],
  [9, 'start'],
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];

const DEAD = 0.18;
const dead = (v: number): number => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class Input {
  private keys = new Set<string>();
  private held = new Map<Button, number>();
  private edges = new Set<Button>();
  private keyEdges = new Set<string>();
  private padHeld = new Set<Button>();
  private touchStick = { x: 0, y: 0 };
  private padSticks = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private padTriggers = { left: 0, right: 0 };

  /** Is the button held (on any device)? */
  down(b: Button): boolean {
    return (this.held.get(b) ?? 0) > 0 || this.padHeld.has(b);
  }

  /** Was the button pressed since the last frame()? */
  pressed(b: Button): boolean {
    return this.edges.has(b);
  }

  /** Was any button or key pressed since the last frame()? */
  anyPressed(): boolean {
    return this.edges.size > 0 || this.keyEdges.size > 0;
  }

  /** Is this key held? `code` is a KeyboardEvent.code like 'KeyR' or 'Digit1'. */
  key(code: string): boolean {
    return this.keys.has(code);
  }

  /** Was this key pressed since the last frame()? */
  keyPressed(code: string): boolean {
    return this.keyEdges.has(code);
  }

  /**
   * Stick 0 is the left stick, the touch stick, the arrows and WASD (-1..1, y down);
   * stick 1 is a gamepad's right stick (for looking around).
   */
  stick(i: 0 | 1 = 0): { x: number; y: number } {
    if (i === 1) return { ...this.padSticks[1]! };
    let x = this.padSticks[0]!.x + this.touchStick.x;
    let y = this.padSticks[0]!.y + this.touchStick.y;
    if ((this.held.get('left') ?? 0) > 0 || this.padHeld.has('left')) x -= 1;
    if ((this.held.get('right') ?? 0) > 0 || this.padHeld.has('right')) x += 1;
    if ((this.held.get('up') ?? 0) > 0 || this.padHeld.has('up')) y -= 1;
    if ((this.held.get('down') ?? 0) > 0 || this.padHeld.has('down')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Gamepad triggers 0..1 (LT, RT) — handy for brake and throttle. */
  triggers(): { left: number; right: number } {
    return { ...this.padTriggers };
  }

  /** Call once per game update, after reading: forgets this frame's presses and reads the gamepads. */
  frame(): void {
    this.edges.clear();
    this.keyEdges.clear();
    this.pollPads();
  }

  // ---- fed by the shell ----

  /** A keyboard event. Returns true when it is one of ours (the shell then stops the browser's default). */
  keyEvent(e: KeyboardEvent): boolean {
    const b = KEYS[e.code];
    if (e.type === 'keydown') {
      if (!e.repeat) {
        this.keyEdges.add(e.code);
        if (b && !this.keys.has(e.code)) this.press(b);
      }
      this.keys.add(e.code);
    } else {
      if (b && this.keys.has(e.code)) this.release(b);
      this.keys.delete(e.code);
    }
    return !!b || e.code.startsWith('Digit') || e.code === 'Tab';
  }

  /** An on-screen button went down or up. */
  touchButton(b: Button, down: boolean): void {
    if (down) this.press(b);
    else this.release(b);
  }

  /** The on-screen stick moved (-1..1); it also holds the direction buttons past halfway. */
  touchStickMove(x: number, y: number): void {
    const before = this.stickDirs(this.touchStick.x, this.touchStick.y);
    this.touchStick = { x, y };
    const after = this.stickDirs(x, y);
    for (const b of before) if (!after.includes(b)) this.release(b);
    for (const b of after) if (!before.includes(b)) this.press(b);
  }

  /** Let go of everything (the window lost focus, the game was paused). */
  clear(): void {
    this.keys.clear();
    this.held.clear();
    this.edges.clear();
    this.keyEdges.clear();
    this.touchStick = { x: 0, y: 0 };
  }

  private stickDirs(x: number, y: number): Button[] {
    const out: Button[] = [];
    if (x < -0.45) out.push('left');
    if (x > 0.45) out.push('right');
    if (y < -0.45) out.push('up');
    if (y > 0.45) out.push('down');
    return out;
  }

  private press(b: Button): void {
    const n = this.held.get(b) ?? 0;
    if (n === 0 && !this.padHeld.has(b)) this.edges.add(b);
    this.held.set(b, n + 1);
  }

  private release(b: Button): void {
    const n = this.held.get(b) ?? 0;
    if (n <= 1) this.held.delete(b);
    else this.held.set(b, n - 1);
  }

  private pollPads(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set<Button>();
    const sticks = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const trig = { left: 0, right: 0 };
    for (const p of pads) {
      if (!p || !p.connected) continue;
      for (const [i, b] of PAD_BUTTONS) if (p.buttons[i]?.pressed) now.add(b);
      sticks[0]!.x += dead(p.axes[0] ?? 0);
      sticks[0]!.y += dead(p.axes[1] ?? 0);
      sticks[1]!.x += dead(p.axes[2] ?? 0);
      sticks[1]!.y += dead(p.axes[3] ?? 0);
      trig.left = Math.max(trig.left, p.buttons[6]?.value ?? 0);
      trig.right = Math.max(trig.right, p.buttons[7]?.value ?? 0);
    }
    for (const b of now) if (!this.padHeld.has(b) && !(this.held.get(b) ?? 0)) this.edges.add(b);
    this.padHeld = now;
    this.padSticks = sticks;
    this.padTriggers = trig;
  }
}
