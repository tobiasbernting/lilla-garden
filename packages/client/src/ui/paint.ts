// Drawing screen: a 16×16 canvas you paint with a finger or the mouse, then "Klar" sends it to the server.
import { PAINT_CHARS, PAINT_EMPTY, PAINT_PALETTE, PAINT_SIZE, T } from '@lilla-garden/shared';
import { h, onTap } from './dom.js';

const PAPER = '#f6efdc';
type Mode = 'brush' | 'fill' | 'eraser';

export class PaintBoard {
  readonly el: HTMLElement;
  private pixels: string[] = PAINT_EMPTY.split('');
  private color = '0';
  private mode: Mode = 'brush';
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tools = new Map<string, HTMLElement>();

  constructor(
    private onDone: (pixels: string) => void,
    private onCancel: () => void,
  ) {
    this.canvas = h('canvas', { class: 'paint-canvas', width: PAINT_SIZE, height: PAINT_SIZE });
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    const palette = h('div', { class: 'paint-palette' });
    PAINT_PALETTE.forEach((c, i) => {
      const ch = PAINT_CHARS[i]!;
      const sw = h('button', { class: 'paint-swatch', style: { background: c } });
      onTap(sw, () => this.pick(this.mode === 'eraser' ? 'brush' : this.mode, ch));
      this.tools.set(`c${ch}`, sw);
      palette.append(sw);
    });
    const brush = h('button', { class: 'alt paint-tool' }, `🖌️ ${T.paintBrush}`);
    onTap(brush, () => this.pick('brush', this.color));
    const fill = h('button', { class: 'alt paint-tool' }, `🪣 ${T.paintFill}`);
    onTap(fill, () => this.pick('fill', this.color));
    const eraser = h('button', { class: 'alt paint-tool' }, `🧽 ${T.paintEraser}`);
    onTap(eraser, () => this.pick('eraser', this.color));
    this.tools.set('brush', brush);
    this.tools.set('fill', fill);
    this.tools.set('eraser', eraser);

    const clearBtn = h('button', { class: 'danger' }, T.paintClear);
    onTap(clearBtn, () => {
      this.pixels = PAINT_EMPTY.split('');
      this.redraw();
    });
    const cancel = h('button', { class: 'alt' }, T.paintCancel);
    onTap(cancel, () => this.onCancel());
    const ok = h('button', { class: 'paint-ok' }, `✔ ${T.paintOk}`);
    onTap(ok, () => this.onDone(this.pixels.join('')));

    this.el = h(
      'div',
      { class: 'paint' },
      h('div', { class: 'paint-top' }, this.canvas, h('div', { class: 'paint-side' }, palette, h('div', { class: 'paint-tools' }, brush, fill, eraser))),
      h('div', { class: 'paint-actions' }, clearBtn, h('span', { class: 'spacer' }), cancel, ok),
    );
    this.bindPointer();
    this.pick('brush', '0');
    this.redraw();
  }

  private pick(mode: Mode, color: string): void {
    this.mode = mode;
    this.color = color;
    for (const [k, el] of this.tools) el.classList.toggle('on', k === mode || (mode !== 'eraser' && k === `c${color}`));
  }

  private cell(ev: PointerEvent): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - r.left) / r.width) * PAINT_SIZE);
    const y = Math.floor(((ev.clientY - r.top) / r.height) * PAINT_SIZE);
    if (x < 0 || y < 0 || x >= PAINT_SIZE || y >= PAINT_SIZE) return null;
    return [x, y];
  }

  private bindPointer(): void {
    let down = false;
    let last: [number, number] | null = null;
    const paintAt = (c: [number, number]) => {
      const i = c[1] * PAINT_SIZE + c[0];
      if (this.mode === 'fill') this.flood(c[0], c[1]);
      else this.pixels[i] = this.mode === 'eraser' ? '.' : this.color;
    };
    const stroke = (ev: PointerEvent) => {
      const c = this.cell(ev);
      if (!c) return;
      if (last && this.mode !== 'fill') {
        // connect fast finger moves so lines do not break up
        const dx = c[0] - last[0];
        const dy = c[1] - last[1];
        const n = Math.max(Math.abs(dx), Math.abs(dy));
        for (let s = 1; s < n; s++) paintAt([Math.round(last[0] + (dx * s) / n), Math.round(last[1] + (dy * s) / n)]);
      }
      paintAt(c);
      last = c;
      this.redraw();
    };
    this.canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      down = true;
      last = null;
      this.canvas.setPointerCapture(ev.pointerId);
      stroke(ev);
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (!down) return;
      ev.preventDefault();
      stroke(ev);
    });
    const up = () => {
      down = false;
      last = null;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  private flood(x: number, y: number): void {
    const from = this.pixels[y * PAINT_SIZE + x];
    const to = this.color;
    if (from === to) return;
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= PAINT_SIZE || cy >= PAINT_SIZE) continue;
      const i = cy * PAINT_SIZE + cx;
      if (this.pixels[i] !== from) continue;
      this.pixels[i] = to;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  private redraw(): void {
    const g = this.ctx;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
    for (let i = 0; i < this.pixels.length; i++) {
      const idx = PAINT_CHARS.indexOf(this.pixels[i]!);
      if (idx < 0) continue;
      g.fillStyle = PAINT_PALETTE[idx]!;
      g.fillRect(i % PAINT_SIZE, Math.floor(i / PAINT_SIZE), 1, 1);
    }
  }
}
