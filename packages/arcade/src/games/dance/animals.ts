// The animal band and the dancing crowd, drawn with plain canvas shapes. Each character is drawn in its
// own units (about 220 tall, feet at 0, up is negative y) and scaled to the stage.
import { C, ellipse, glow, mix, rgba, roundRect, type G } from './art.ts';

export interface Pose {
  /** Seconds, for blinking and wobbles. */
  t: number;
  /** 0..1, high right on the beat. */
  bob: number;
  /** −1..1 side to side. */
  sway: number;
  /** The main action, 0..1 (pluck, snare stroke, singing, key press). */
  act: number;
  /** A second action (the other stick, a wing flap). */
  act2: number;
  /** 0..1: a cymbal crash, a big accent. */
  big: number;
  /** 0..1: arms up for the final pose. */
  cheer: number;
  /** 0..1 Discofeber. */
  fever: number;
}

const INK = C.ink;
const LW = 5;

function paint(g: G, fill: string, lw = LW): void {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.stroke();
}

function limb(g: G, x0: number, y0: number, x1: number, y1: number, w: number, fill: string): void {
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.lineWidth = w + LW * 2;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = w;
  g.strokeStyle = fill;
  g.stroke();
}

function eye(g: G, x: number, y: number, r: number, t: number, seed: number, look = 0): void {
  const blink = (t * 0.37 + seed) % 4 < 0.12;
  if (blink) {
    g.beginPath();
    g.moveTo(x - r, y);
    g.quadraticCurveTo(x, y + r * 0.6, x + r, y);
    g.lineWidth = LW * 0.8;
    g.strokeStyle = INK;
    g.stroke();
    return;
  }
  ellipse(g, x, y, r, r * 1.1);
  paint(g, '#ffffff', LW * 0.6);
  ellipse(g, x + look * r * 0.3, y + r * 0.1, r * 0.6, r * 0.7);
  g.fillStyle = INK;
  g.fill();
  ellipse(g, x + look * r * 0.3 - r * 0.22, y - r * 0.2, r * 0.22, r * 0.22);
  g.fillStyle = '#ffffff';
  g.fill();
}

function shadow(g: G, rx: number): void {
  ellipse(g, 0, 0, rx, rx * 0.16);
  g.fillStyle = 'rgba(5,0,15,0.45)';
  g.fill();
}

// ---------------------------------------------------------------- the cow on bass

export function cow(g: G, x: number, y: number, s: number, p: Pose, accent: string): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  shadow(g, 56);
  const sq = 1 + p.bob * 0.05;
  const hop = p.cheer * -14 * Math.abs(Math.sin(p.t * 6));
  // legs
  for (const lx of [-24, 24]) {
    roundRect(g, lx - 13, -64, 26, 64, 11);
    paint(g, '#f7f3ee');
    roundRect(g, lx - 14, -18, 28, 18, 7);
    paint(g, '#4a3a52');
  }
  g.translate(0, -58 + hop);
  g.rotate(p.sway * 0.05);
  g.scale(sq, 1 / sq);
  // tail
  g.beginPath();
  g.moveTo(44, -40);
  g.quadraticCurveTo(70, -20 + p.sway * 8, 64, 8 + p.sway * 6);
  g.lineWidth = 5;
  g.strokeStyle = INK;
  g.stroke();
  ellipse(g, 64, 12 + p.sway * 6, 7, 10);
  paint(g, '#2c2236', 3);
  // body
  ellipse(g, 0, -44, 54, 50);
  paint(g, '#f7f3ee');
  g.save();
  ellipse(g, 0, -44, 52, 48);
  g.clip();
  g.fillStyle = '#2c2236';
  ellipse(g, -30, -64, 24, 17, 0.4);
  g.fill();
  ellipse(g, 34, -30, 19, 24, -0.3);
  g.fill();
  ellipse(g, 4, 2, 16, 10);
  g.fill();
  g.restore();
  // bell on a red strap
  g.beginPath();
  g.moveTo(-26, -84);
  g.quadraticCurveTo(0, -70, 26, -84);
  g.lineWidth = 7;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = '#e8412c';
  g.stroke();
  g.beginPath();
  g.moveTo(-8, -76);
  g.lineTo(8, -76);
  g.lineTo(11, -60);
  g.lineTo(-11, -60);
  g.closePath();
  paint(g, '#ffd23f', 4);
  // the bass guitar, held across the body
  const pluck = p.act;
  const up = p.cheer;
  g.save();
  g.translate(14, -40);
  g.rotate(-0.55 - up * 0.7);
  // neck
  roundRect(g, -112, -6, 100, 12, 4);
  paint(g, '#6b4430', 4);
  roundRect(g, -128, -9, 20, 18, 5);
  paint(g, '#3a2440', 4);
  // body
  g.beginPath();
  g.moveTo(-16, -20);
  g.bezierCurveTo(8, -34, 30, -26, 30, -12);
  g.bezierCurveTo(44, -10, 46, 18, 26, 22);
  g.bezierCurveTo(10, 30, -14, 26, -20, 14);
  g.bezierCurveTo(-28, 4, -26, -14, -16, -20);
  g.closePath();
  paint(g, '#13a9c9', 4.5);
  ellipse(g, 6, 2, 14, 10);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fill();
  // strings light up on every bass note
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(-124, -4.5 + i * 3);
    g.lineTo(22, -4.5 + i * 3);
    g.lineWidth = 1.3;
    g.strokeStyle = rgba(mix('#c8f6ff', '#ffffff', pluck), 0.6 + pluck * 0.4);
    g.stroke();
  }
  if (pluck > 0.05) {
    g.globalCompositeOperation = 'lighter';
    glow(g, C.cyan, 4, 0, 46, pluck * 0.8);
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
  // arms: one on the neck, one plucking
  const ax = -64 - up * 6;
  const ay = -88 - up * 50;
  limb(g, -40, -64, ax, ay, 15, '#f7f3ee');
  ellipse(g, ax, ay, 9, 9);
  paint(g, '#4a3a52', 4);
  const px = 26 + pluck * 6 + up * 10;
  const py = -34 + pluck * 6 - up * 70;
  limb(g, 42, -62, px, py, 15, '#f7f3ee');
  ellipse(g, px, py, 9, 9);
  paint(g, '#4a3a52', 4);
  // head, nodding
  g.translate(0, -112 + p.bob * 4);
  g.rotate(p.sway * -0.06);
  // ears
  for (const sx of [-1, 1]) {
    ellipse(g, sx * 46, -6, 21, 10, sx * -0.45);
    paint(g, '#f7f3ee', 4);
    ellipse(g, sx * 47, -6, 12, 5, sx * -0.45);
    g.fillStyle = '#ffb0c4';
    g.fill();
  }
  // horns
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * 14, -30);
    g.quadraticCurveTo(sx * 22, -50, sx * 34, -52);
    g.quadraticCurveTo(sx * 30, -40, sx * 28, -28);
    g.closePath();
    paint(g, '#f6e7c1', 4);
  }
  ellipse(g, 0, 0, 44, 38);
  paint(g, '#f7f3ee');
  g.save();
  ellipse(g, 0, 0, 42, 36);
  g.clip();
  ellipse(g, -22, -14, 20, 17, 0.3);
  g.fillStyle = '#2c2236';
  g.fill();
  g.restore();
  // muzzle
  ellipse(g, 0, 20, 33, 20);
  paint(g, '#ffb0c4', 4.5);
  ellipse(g, -11, 19, 4.5, 6);
  g.fillStyle = '#b84d72';
  g.fill();
  ellipse(g, 11, 19, 4.5, 6);
  g.fill();
  g.beginPath();
  g.arc(0, 26, 9, 0.2, Math.PI - 0.2);
  g.lineWidth = 3;
  g.strokeStyle = '#b84d72';
  g.stroke();
  // cool sunglasses
  for (const gx of [-30, 4]) {
    roundRect(g, gx, -16, 26, 17, 7);
    g.fillStyle = '#140c24';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = accent;
    g.stroke();
    g.beginPath();
    g.moveTo(gx + 6, -12);
    g.lineTo(gx + 12, -4);
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-4, -10);
  g.lineTo(4, -10);
  g.lineWidth = 3;
  g.strokeStyle = accent;
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- the pig on drums

export function pig(g: G, x: number, y: number, s: number, p: Pose, accent: string, kick: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  shadow(g, 92);
  const PINK = '#ff9ec2';
  const bob = p.bob * 5;
  // the pig behind the kit
  g.save();
  g.translate(0, bob - p.cheer * 18);
  ellipse(g, 0, -120, 50, 46);
  paint(g, PINK);
  ellipse(g, 0, -110, 30, 28);
  g.fillStyle = '#ffc4d8';
  g.fill();
  // head
  g.translate(0, -180);
  g.rotate(Math.sin(p.t * 2.2) * 0.04 + p.sway * 0.05);
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * 18, -32);
    g.lineTo(sx * 46, -50 + p.act * 4);
    g.lineTo(sx * 38, -12);
    g.closePath();
    paint(g, PINK, 4);
  }
  ellipse(g, 0, 0, 42, 38);
  paint(g, PINK);
  // headband
  g.save();
  ellipse(g, 0, 0, 40, 36);
  g.clip();
  g.fillStyle = accent;
  g.fillRect(-44, -30, 88, 11);
  g.restore();
  ellipse(g, 0, 0, 42, 38);
  g.lineWidth = LW;
  g.strokeStyle = INK;
  g.stroke();
  ellipse(g, 0, 10, 18, 13);
  paint(g, '#ff7fae', 4);
  ellipse(g, -6, 10, 3.5, 5);
  g.fillStyle = '#8a2a55';
  g.fill();
  ellipse(g, 6, 10, 3.5, 5);
  g.fill();
  ellipse(g, -27, 10, 8, 5);
  g.fillStyle = 'rgba(255,90,140,0.55)';
  g.fill();
  ellipse(g, 27, 10, 8, 5);
  g.fill();
  eye(g, -15, -8, 6.5, p.t, 0.3);
  eye(g, 15, -8, 6.5, p.t, 0.3);
  g.beginPath();
  g.arc(0, 22, 8, 0.25, Math.PI - 0.25);
  g.lineWidth = 3;
  g.strokeStyle = '#8a2a55';
  g.stroke();
  g.restore();

  // the kit: cymbal, hi-hat, toms, bass drum, snare
  const crash = p.big;
  g.save();
  g.translate(84, -160);
  g.rotate(-0.25 + Math.sin(p.t * 30) * 0.08 * crash);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, 160);
  g.lineWidth = 4;
  g.strokeStyle = '#3d3450';
  g.stroke();
  ellipse(g, 0, 0, 36, 7);
  paint(g, '#ffd23f', 3.5);
  g.restore();
  if (crash > 0.05) {
    g.globalCompositeOperation = 'lighter';
    glow(g, C.yellow, 84, -160, 60, crash * 0.8);
    g.globalCompositeOperation = 'source-over';
  }
  // hi-hat
  g.beginPath();
  g.moveTo(-100, -124);
  g.lineTo(-100, 0);
  g.lineWidth = 4;
  g.strokeStyle = '#3d3450';
  g.stroke();
  const hh = p.act2 * 3;
  ellipse(g, -100, -130 + hh, 28, 5);
  paint(g, '#ffd23f', 3);
  ellipse(g, -100, -122, 28, 5);
  paint(g, '#e8b92e', 3);
  // rack tom
  roundRect(g, 14, -128, 40, 26, 6);
  paint(g, '#7a2bd6', 4);
  ellipse(g, 34, -128, 20, 6);
  paint(g, '#f4eaf5', 3);
  // bass drum, pumping on the kick
  const k = kick;
  g.save();
  g.translate(0, -58);
  g.scale(1 + k * 0.04, 1 + k * 0.04);
  ellipse(g, 0, 0, 56, 56);
  paint(g, '#7a2bd6');
  ellipse(g, 0, 0, 46, 46);
  paint(g, '#f4eaf5', 4);
  // a heart on the skin that lights up on the kick
  g.beginPath();
  g.moveTo(0, 18);
  g.bezierCurveTo(-34, -6, -18, -32, 0, -16);
  g.bezierCurveTo(18, -32, 34, -6, 0, 18);
  g.closePath();
  g.fillStyle = mix(C.magenta, '#ffffff', k * 0.5);
  g.fill();
  g.restore();
  if (k > 0.05) {
    g.globalCompositeOperation = 'lighter';
    glow(g, C.magenta, 0, -60, 70, k * 0.9);
    g.globalCompositeOperation = 'source-over';
  }
  // snare
  roundRect(g, -86, -104, 48, 18, 5);
  paint(g, '#e8412c', 4);
  ellipse(g, -62, -104, 24, 6);
  paint(g, '#f4eaf5', 3);

  // arms and sticks over the kit
  g.translate(0, bob - p.cheer * 18);
  const stroke = p.act;
  const tap = p.act2;
  const lx = -62 + p.cheer * -10;
  const ly = -150 + stroke * 40 - p.cheer * 70;
  limb(g, -38, -136, lx, ly, 15, PINK);
  ellipse(g, lx, ly, 9, 9);
  paint(g, PINK, 4);
  const la = -2.4 + stroke * 0.9 + p.cheer * 0.6;
  stick(g, lx, ly, la);
  const crashing = crash > 0.3;
  const rx = crashing ? 70 : 40 + tap * 4 + p.cheer * 30;
  const ry = crashing ? -168 : -150 + tap * 22 - p.cheer * 70;
  limb(g, 38, -136, rx, ry, 15, PINK);
  ellipse(g, rx, ry, 9, 9);
  paint(g, PINK, 4);
  stick(g, rx, ry, crashing ? -0.6 : -0.8 - tap * 0.5 - p.cheer * 1.2);
  g.restore();
}

function stick(g: G, x: number, y: number, a: number): void {
  const L = 50;
  const ex = x + Math.cos(a) * L;
  const ey = y + Math.sin(a) * L;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - Math.cos(a) * 8, y - Math.sin(a) * 8);
  g.lineTo(ex, ey);
  g.lineWidth = 9;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = 4.5;
  g.strokeStyle = '#ffe3b0';
  g.stroke();
}

// ---------------------------------------------------------------- the hen, singing

export function hen(g: G, x: number, y: number, s: number, p: Pose, scarf: string): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  shadow(g, 46);
  const hop = Math.max(0, p.bob) * 6 + p.cheer * 16 * Math.abs(Math.sin(p.t * 5));
  // legs
  for (const lx of [-14, 14]) {
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(lx, -34 - hop);
    g.lineTo(lx + Math.sign(lx) * 2, -4);
    g.lineWidth = 9;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = '#ffa52e';
    g.stroke();
    for (const dx of [-9, 0, 9]) {
      g.beginPath();
      g.moveTo(lx + Math.sign(lx) * 2, -4);
      g.lineTo(lx + Math.sign(lx) * 2 + dx, 0);
      g.lineWidth = 4;
      g.strokeStyle = '#e8862a';
      g.stroke();
    }
  }
  g.translate(0, -hop);
  g.rotate(p.sway * 0.07);
  // tail feathers
  for (let i = 0; i < 3; i++) {
    ellipse(g, -40 - i * 4, -96 - i * 12, 12, 26, -0.6 - i * 0.25);
    paint(g, i === 1 ? '#fff3e0' : '#fffaf2', 4);
  }
  // body
  ellipse(g, 0, -78, 46, 50);
  paint(g, '#fffaf2');
  ellipse(g, 6, -58, 30, 22);
  g.fillStyle = 'rgba(200,180,230,0.35)';
  g.fill();
  // the far wing flaps
  const flap = p.act2 * 0.6 + p.cheer * (1.4 + Math.sin(p.t * 9) * 0.3);
  g.save();
  g.translate(-30, -96);
  g.rotate(0.2 - flap);
  ellipse(g, -8, 18, 15, 30, 0.2);
  paint(g, '#fff3e0', 4);
  g.restore();
  // head
  g.translate(10, -138);
  g.rotate(Math.sin(p.t * 1.7) * 0.05 - p.act * 0.08);
  // comb and wattle
  for (const [cx, cy, r] of [
    [-8, -30, 9],
    [4, -34, 10],
    [16, -29, 8],
  ] as const) {
    ellipse(g, cx, cy, r, r);
    paint(g, '#ff3b4e', 4);
  }
  ellipse(g, 0, 0, 30, 30);
  paint(g, '#fffaf2');
  ellipse(g, 27, 18, 6, 10);
  paint(g, '#ff3b4e', 3.5);
  // beak: opens when she sings
  const open = Math.max(p.act * 12, p.cheer * 10);
  g.beginPath();
  g.moveTo(24, -6);
  g.lineTo(46, 2);
  g.lineTo(24, 6);
  g.closePath();
  paint(g, '#ffb02e', 3.5);
  g.beginPath();
  g.moveTo(24, 6);
  g.lineTo(40, 8 + open);
  g.lineTo(23, 11);
  g.closePath();
  paint(g, '#f08a1c', 3.5);
  eye(g, 12, -8, 7.5, p.t, 1.3, 0.5);
  // eyelashes
  g.beginPath();
  g.moveTo(16, -17);
  g.lineTo(20, -22);
  g.moveTo(10, -18);
  g.lineTo(11, -24);
  g.lineWidth = 2.5;
  g.strokeStyle = INK;
  g.stroke();
  g.rotate(-(Math.sin(p.t * 1.7) * 0.05 - p.act * 0.08));
  g.translate(-10, 138);
  // a feather boa in the player's colour
  const boa: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.05 + i * 0.112);
    boa.push([Math.cos(a) * 36 + 6, -108 + Math.sin(a) * 12]);
  }
  boa.push([-28, -92], [-26, -78], [-30, -64]);
  boa.forEach(([bx, by], i) => {
    ellipse(g, bx, by, 11, 10);
    paint(g, i % 2 ? scarf : mix(scarf, '#ffffff', 0.25), 3.5);
  });
  // the near wing holds the microphone
  const mx = 40 - p.cheer * 4;
  const my = -132 + p.act * 2 - p.cheer * 46;
  g.save();
  g.translate(18, -92);
  g.rotate(-0.9 - p.cheer * 1.2);
  ellipse(g, 18, 0, 26, 13);
  paint(g, '#fff3e0', 4);
  g.restore();
  g.beginPath();
  g.moveTo(mx - 10, my + 24);
  g.lineTo(mx, my);
  g.lineWidth = 9;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = 5;
  g.strokeStyle = '#6b6680';
  g.stroke();
  ellipse(g, mx + 2, my - 4, 9, 9);
  paint(g, '#b7b3c9', 3.5);
  if (p.act > 0.05) {
    g.globalCompositeOperation = 'lighter';
    glow(g, C.magenta, mx + 2, my - 4, 30, p.act * 0.7);
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

// ---------------------------------------------------------------- the sheep on keys

export function sheep(g: G, x: number, y: number, s: number, p: Pose, lit: number[], keyGlow: string): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  shadow(g, 70);
  const bob = p.bob * 5 - p.cheer * 24 * Math.abs(Math.sin(p.t * 5.5));
  // stand
  g.lineCap = 'round';
  for (const [x0, x1] of [
    [-54, 50],
    [54, -50],
  ] as const) {
    g.beginPath();
    g.moveTo(x0, 0);
    g.lineTo(x1, -84);
    g.lineWidth = 9;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = '#4b4363';
    g.stroke();
  }
  // wool body
  g.save();
  g.translate(0, bob);
  g.rotate(p.sway * 0.05);
  const WOOL = '#f6f1ff';
  const puffs: [number, number, number][] = [
    [-36, -110, 28],
    [36, -110, 28],
    [-18, -138, 30],
    [18, -138, 30],
    [0, -104, 34],
    [-28, -88, 24],
    [28, -88, 24],
  ];
  for (const [px, py, r] of puffs) {
    ellipse(g, px, py, r + 2.5, r + 2.5);
    g.fillStyle = INK;
    g.fill();
  }
  for (const [px, py, r] of puffs) {
    ellipse(g, px, py, r, r);
    g.fillStyle = WOOL;
    g.fill();
    ellipse(g, px + r * 0.2, py + r * 0.25, r * 0.6, r * 0.5);
    g.fillStyle = 'rgba(190,170,235,0.35)';
    g.fill();
  }
  // head
  g.translate(0, -168);
  g.rotate(Math.sin(p.t * 2 + 1) * 0.05);
  for (const sx of [-1, 1]) {
    ellipse(g, sx * 28, 0, 15, 7, sx * 0.35);
    paint(g, '#2e2638', 4);
    ellipse(g, sx * 29, 0, 8, 3.5, sx * 0.35);
    g.fillStyle = '#ff9ec2';
    g.fill();
  }
  ellipse(g, 0, 2, 24, 29);
  paint(g, '#2e2638');
  eye(g, -9, -4, 6.5, p.t, 2.2);
  eye(g, 9, -4, 6.5, p.t, 2.2);
  g.beginPath();
  g.moveTo(-6, 16);
  g.quadraticCurveTo(-3, 20, 0, 16);
  g.quadraticCurveTo(3, 20, 6, 16);
  g.lineWidth = 2.5;
  g.strokeStyle = '#ff9ec2';
  g.stroke();
  for (const [tx, ty] of [
    [-11, -27],
    [0, -32],
    [11, -27],
  ] as const) {
    ellipse(g, tx, ty, 11, 11);
    paint(g, WOOL, 3.5);
  }
  // a bow
  g.beginPath();
  g.moveTo(14, -36);
  g.lineTo(26, -44);
  g.lineTo(26, -28);
  g.closePath();
  g.moveTo(14, -36);
  g.lineTo(2, -44);
  g.lineTo(2, -28);
  g.closePath();
  paint(g, C.magenta, 3);
  g.restore();

  // keyboard
  roundRect(g, -80, -104, 160, 26, 6);
  paint(g, '#241c34');
  const n = 14;
  for (let i = 0; i < n; i++) {
    const kx = -72 + (i * 144) / n;
    const l = lit[i % lit.length] ?? 0;
    g.fillStyle = l > 0.02 ? mix('#f4f0ff', keyGlow, l) : '#f4f0ff';
    g.fillRect(kx + 0.8, -96, 144 / n - 1.6, 14);
  }
  for (let i = 0; i < n - 1; i++) {
    if (i % 7 === 2 || i % 7 === 6) continue;
    g.fillStyle = '#1a1328';
    g.fillRect(-72 + ((i + 1) * 144) / n - 3, -96, 6, 8);
  }
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const l = lit[i % lit.length] ?? 0;
    if (l > 0.05) glow(g, keyGlow, -72 + ((i + 0.5) * 144) / n, -90, 18, l * 0.8);
  }
  g.globalCompositeOperation = 'source-over';
  roundRect(g, -80, -104, 160, 26, 6);
  g.lineWidth = 3;
  g.strokeStyle = C.violet;
  g.stroke();
  // hooves on the keys
  const press = p.act * 4;
  const up = p.cheer;
  for (const sx of [-1, 1]) {
    const hx = sx * (26 + up * 30);
    const hy = -100 + press * (sx < 0 ? 1 : 0.6) + bob * 0.3 - up * 110;
    limb(g, sx * 30, -110 + bob, hx, hy, 18, WOOL);
    ellipse(g, hx, hy, 10, 9);
    paint(g, '#2e2638', 4);
  }
  g.restore();
}

// ---------------------------------------------------------------- the crowd, seen from behind

export type Fan = 0 | 1 | 2 | 3 | 4;

/** A dancing fan from behind: a dark shape with a coloured rim of stage light. */
export function fan(g: G, x: number, y: number, s: number, kind: Fan, bounce: number, arms: number, rim: string, stick: string | null, t: number): void {
  g.save();
  g.translate(x, y - bounce * 14 * s);
  g.scale(s, s);
  const body = (dx: number, dy: number, color: string): void => {
    g.fillStyle = color;
    // shoulders
    ellipse(g, dx, dy - 40, 62, 52);
    g.fill();
    // arms up
    if (arms > 0.05) {
      g.lineCap = 'round';
      g.lineWidth = 20;
      g.strokeStyle = color;
      for (const sx of [-1, 1]) {
        const wave = Math.sin(t * 7 + sx) * 10 * arms;
        g.beginPath();
        g.moveTo(dx + sx * 40, dy - 62);
        g.lineTo(dx + sx * (52 + 14 * arms) + wave, dy - 62 - 90 * arms);
        g.stroke();
      }
    }
    // head
    const hy = dy - 112;
    switch (kind) {
      case 0: // rabbit
        ellipse(g, dx, hy, 26, 28);
        g.fill();
        ellipse(g, dx - 12, hy - 42, 8, 28, -0.18);
        g.fill();
        ellipse(g, dx + 12, hy - 42, 8, 28, 0.18);
        g.fill();
        break;
      case 1: // cow
        ellipse(g, dx, hy, 32, 28);
        g.fill();
        ellipse(g, dx - 36, hy - 4, 16, 8, -0.3);
        g.fill();
        ellipse(g, dx + 36, hy - 4, 16, 8, 0.3);
        g.fill();
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.moveTo(dx + sx * 12, hy - 22);
          g.quadraticCurveTo(dx + sx * 20, hy - 42, dx + sx * 32, hy - 44);
          g.quadraticCurveTo(dx + sx * 26, hy - 30, dx + sx * 24, hy - 18);
          g.closePath();
          g.fill();
        }
        break;
      case 2: // hen
        ellipse(g, dx, hy + 6, 24, 26);
        g.fill();
        for (const [cx, cy, r] of [
          [-9, -24, 8],
          [2, -28, 9],
          [12, -23, 7],
        ] as const) {
          ellipse(g, dx + cx, hy + cy, r, r);
          g.fill();
        }
        break;
      case 3: // sheep
        for (const [cx, cy, r] of [
          [-14, -6, 18],
          [14, -6, 18],
          [0, -18, 18],
          [0, 6, 20],
        ] as const) {
          ellipse(g, dx + cx, hy + cy, r, r);
          g.fill();
        }
        break;
      case 4: // pig
        ellipse(g, dx, hy, 30, 28);
        g.fill();
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.moveTo(dx + sx * 12, hy - 20);
          g.lineTo(dx + sx * 30, hy - 42);
          g.lineTo(dx + sx * 30, hy - 12);
          g.closePath();
          g.fill();
        }
        break;
    }
  };
  // rim light: the same shape a little up and to the side, in the light's colour
  body(-3, -4, rim);
  body(0, 0, '#0c0618');
  if (stick && arms > 0.3) {
    g.globalCompositeOperation = 'lighter';
    for (const sx of [-1, 1]) {
      const wave = Math.sin(t * 7 + sx) * 10 * arms;
      const hx = sx * (52 + 14 * arms) + wave;
      const hy = -62 - 90 * arms;
      const a = sx * 0.3 + Math.sin(t * 7 + sx) * 0.3;
      const ex = hx + Math.sin(a) * 50;
      const ey = hy - Math.cos(a) * 50;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(ex, ey);
      g.lineWidth = 16;
      g.strokeStyle = rgba(stick, 0.25);
      g.stroke();
      g.lineWidth = 6;
      g.strokeStyle = mix(stick, '#ffffff', 0.5);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}
