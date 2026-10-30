// The pocket console around the LCD, in the player's colour: a bezel with a battery lamp, and on wide
// screens a cross pad and A/B buttons that press down with the player's own presses. On 'high' a faint
// grid sits between the LCD's pixels. Everything follows the screen when the window changes size.

export interface Pads {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  a: boolean;
  b: boolean;
}

export interface Bezel {
  /** Put the bezel behind and the grid over the LCD canvas. */
  attach(screen: HTMLCanvasElement): void;
  /** Show the controller's presses on the drawn buttons (redraws only when something changed). */
  press(p: Pads): void;
  dispose(): void;
}

const LCD_W = 160;
const LCD_H = 144;

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0xe8412c;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: [number, number, number], b: [number, number, number], k: number): string =>
  `rgb(${Math.round(a[0] * (1 - k) + b[0] * k)},${Math.round(a[1] * (1 - k) + b[1] * k)},${Math.round(a[2] * (1 - k) + b[2] * k)})`;

export function bezel(root: HTMLElement, opts: { accent: string; grid: boolean; dpr: number; controls: boolean }): Bezel {
  const back = document.createElement('canvas');
  Object.assign(back.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  root.append(back);
  const grid = document.createElement('canvas');
  Object.assign(grid.style, { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' });
  const bg = back.getContext('2d')!;
  const gg = grid.getContext('2d')!;
  const accent = hexRgb(opts.accent);
  const body = mix(accent, [40, 43, 49], 0.74);
  const bodyDark = mix(accent, [24, 26, 30], 0.82);
  const bodyLight = mix(accent, [90, 95, 104], 0.7);
  let pads: Pads = { left: false, right: false, up: false, down: false, a: false, b: false };

  const draw = (): void => {
    const r = root.getBoundingClientRect();
    const rw = Math.max(1, r.width);
    const rh = Math.max(1, r.height);
    const dpr = opts.dpr;
    back.width = Math.round(rw * dpr);
    back.height = Math.round(rh * dpr);
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the same fit as the kit's pixelCanvas: whole device pixels per LCD pixel
    const ddpr = devicePixelRatio || 1;
    const s = Math.max(1, Math.floor(Math.min(rw / LCD_W, rh / LCD_H) * ddpr) / ddpr);
    const sw = LCD_W * s;
    const sh = LCD_H * s;
    const sx = (rw - sw) / 2;
    const sy = (rh - sh) / 2;

    const vg = bg.createRadialGradient(rw / 2, rh / 2, Math.min(rw, rh) * 0.2, rw / 2, rh / 2, Math.max(rw, rh) * 0.75);
    vg.addColorStop(0, '#1b1f1c');
    vg.addColorStop(1, '#0a0c0b');
    bg.fillStyle = vg;
    bg.fillRect(0, 0, rw, rh);

    // the console: wide enough for buttons on both sides, or just a frame round the glass
    const m = Math.max(10, Math.min(46, Math.min(sw, sh) * 0.06));
    const room = (rw - sw) / 2 - 14;
    const side = opts.controls ? Math.min(room, sh * 0.6) : 0;
    const wings = side > 90;
    const ext = wings ? side : m;
    const bx = sx - ext;
    const bw = sw + ext * 2;
    const by = sy - m * 1.1;
    const bh = sh + m * 2.4;
    const rad = wings ? Math.min(90, ext * 0.45) : m * 0.8;
    const lg = bg.createLinearGradient(0, by, 0, by + bh);
    lg.addColorStop(0, bodyLight);
    lg.addColorStop(0.08, body);
    lg.addColorStop(1, bodyDark);
    bg.fillStyle = lg;
    bg.beginPath();
    bg.roundRect(bx, by, bw, bh, [rad, rad, rad * (wings ? 1 : 3), rad]);
    bg.fill();
    bg.strokeStyle = 'rgba(255,255,255,0.10)';
    bg.lineWidth = 1.5;
    bg.stroke();
    // the glass round the LCD, and a dark rim
    const gm = Math.max(6, m * 0.55);
    bg.fillStyle = '#23262c';
    bg.beginPath();
    bg.roundRect(sx - gm, sy - gm, sw + gm * 2, sh + gm * 2, [gm * 0.7, gm * 0.7, gm * 2.2, gm * 0.7]);
    bg.fill();
    bg.fillStyle = '#121416';
    bg.fillRect(sx - 3, sy - 3, sw + 6, sh + 6);

    // the battery lamp
    const lampX = wings ? sx - side * 0.5 : sx - gm * 0.5 - Math.max(0, m - gm) * 0.5;
    const lampY = wings ? sy + sh * 0.14 : sy + sh * 0.3;
    if (wings || m >= 16) {
      const lr = wings ? Math.max(3, side * 0.035) : Math.max(2.5, m * 0.09);
      const glow = bg.createRadialGradient(lampX, lampY, 0, lampX, lampY, lr * 4);
      glow.addColorStop(0, 'rgba(255,70,50,0.85)');
      glow.addColorStop(1, 'rgba(255,70,50,0)');
      bg.fillStyle = glow;
      bg.beginPath();
      bg.arc(lampX, lampY, lr * 4, 0, Math.PI * 2);
      bg.fill();
      bg.fillStyle = '#ff5a3c';
      bg.beginPath();
      bg.arc(lampX, lampY, lr, 0, Math.PI * 2);
      bg.fill();
      if (wings) {
        bg.font = `700 ${Math.round(Math.max(8, side * 0.07))}px 'Trebuchet MS', system-ui, sans-serif`;
        bg.textAlign = 'center';
        bg.textBaseline = 'top';
        bg.fillStyle = 'rgba(255,255,255,0.45)';
        bg.fillText('BATTERI', lampX, lampY + lr * 2.4);
      }
    }

    if (wings) {
      const u = side;
      // the name, on the left wing
      bg.font = `italic 900 ${Math.round(u * 0.12)}px 'Trebuchet MS', system-ui, sans-serif`;
      bg.textAlign = 'center';
      bg.textBaseline = 'middle';
      bg.fillStyle = 'rgba(255,255,255,0.78)';
      bg.fillText('Hönan Hilda', sx - u * 0.5, sy + sh * 0.31);
      // the cross pad
      const cx = sx - u * 0.5;
      const cy = sy + sh * 0.6;
      const arm = u * 0.15;
      const len = u * 0.43;
      bg.fillStyle = 'rgba(0,0,0,0.28)';
      bg.beginPath();
      bg.arc(cx, cy, len * 0.68, 0, Math.PI * 2);
      bg.fill();
      const padRect = (x: number, y: number, w: number, h: number, down: boolean): void => {
        bg.fillStyle = down ? '#0c0d0f' : '#1a1c20';
        bg.beginPath();
        bg.roundRect(x, y + (down ? 1.5 : 0), w, h, arm * 0.2);
        bg.fill();
      };
      padRect(cx - arm / 2, cy - len / 2, arm, len, false);
      padRect(cx - len / 2, cy - arm / 2, len, arm, false);
      const half = len / 2 - arm / 2;
      if (pads.up) padRect(cx - arm / 2, cy - len / 2, arm, half, true);
      if (pads.down) padRect(cx - arm / 2, cy + arm / 2, arm, half, true);
      if (pads.left) padRect(cx - len / 2, cy - arm / 2, half, arm, true);
      if (pads.right) padRect(cx + arm / 2, cy - arm / 2, half, arm, true);
      bg.fillStyle = 'rgba(255,255,255,0.10)';
      bg.beginPath();
      bg.arc(cx, cy, arm * 0.22, 0, Math.PI * 2);
      bg.fill();
      // the A and B buttons, tilted like on a real one
      const btn = (x: number, y: number, label: string, down: boolean): void => {
        const br = u * 0.105;
        bg.fillStyle = 'rgba(0,0,0,0.3)';
        bg.beginPath();
        bg.arc(x, y + 2.5, br, 0, Math.PI * 2);
        bg.fill();
        const g2 = bg.createRadialGradient(x - br * 0.3, y - br * 0.3 + (down ? 2 : 0), br * 0.1, x, y + (down ? 2 : 0), br);
        g2.addColorStop(0, down ? '#4a1f3a' : '#a23a72');
        g2.addColorStop(1, down ? '#2c1224' : '#6e2350');
        bg.fillStyle = g2;
        bg.beginPath();
        bg.arc(x, y + (down ? 2 : 0), br, 0, Math.PI * 2);
        bg.fill();
        bg.font = `800 ${Math.round(u * 0.07)}px 'Trebuchet MS', system-ui, sans-serif`;
        bg.textAlign = 'center';
        bg.textBaseline = 'top';
        bg.fillStyle = 'rgba(255,255,255,0.5)';
        bg.fillText(label, x, y + br + 6);
      };
      const ax = sx + sw + u * 0.66;
      const ay = sy + sh * 0.5;
      btn(ax - u * 0.3, ay + u * 0.12, 'B', pads.b);
      btn(ax, ay - u * 0.04, 'A', pads.a);
      // the loudspeaker
      bg.strokeStyle = 'rgba(0,0,0,0.35)';
      bg.lineWidth = Math.max(2, u * 0.022);
      bg.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const x0 = sx + sw + u * (0.3 + i * 0.075);
        const y0 = sy + sh * 0.95;
        bg.beginPath();
        bg.moveTo(x0, y0);
        bg.lineTo(x0 + u * 0.12, y0 - u * 0.22);
        bg.stroke();
      }
    }

    // the LCD's pixel grid
    if (opts.grid) {
      const k = Math.round(s * ddpr);
      grid.width = LCD_W * k;
      grid.height = LCD_H * k;
      grid.style.width = `${sw}px`;
      grid.style.height = `${sh}px`;
      gg.clearRect(0, 0, grid.width, grid.height);
      if (k >= 3) {
        gg.fillStyle = 'rgba(155,188,15,0.13)';
        for (let x = 1; x < LCD_W; x++) gg.fillRect(x * k, 0, 1, grid.height);
        for (let y = 1; y < LCD_H; y++) gg.fillRect(0, y * k, grid.width, 1);
      }
    }
  };

  const ro = new ResizeObserver(draw);
  ro.observe(root);
  draw();

  return {
    attach(screen: HTMLCanvasElement): void {
      if (opts.grid) screen.after(grid);
      draw();
    },
    press(p: Pads): void {
      if (!opts.controls) return;
      if (p.left === pads.left && p.right === pads.right && p.up === pads.up && p.down === pads.down && p.a === pads.a && p.b === pads.b) return;
      pads = { ...p };
      draw();
    },
    dispose(): void {
      ro.disconnect();
      back.remove();
      grid.remove();
    },
  };
}
