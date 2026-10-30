// The dance pavilion at night: a summer sky, spruces, the band stage with its neon sign, the mirror
// ball, string lights, a disco floor and the crowd. The still parts are drawn once per size into a
// background canvas; the lights, the band and the crowd are drawn every frame, pulsing with the music.
import { cow, fan, hen, pig, sheep, type Fan, type Pose } from './animals.ts';
import { C, LANE_COLOR, canvas, clamp, decay, ellipse, font, glow, mix, neonStroke, rainbow, rgba, rng, type G } from './art.ts';
import type { Chord, Kind } from './songs.ts';

export interface Layout {
  w: number;
  h: number;
  /** Scale against a 1600 × 900 screen. */
  s: number;
  portrait: boolean;
  touch: boolean;
  cx: number;
  /** The note highway: a trapezoid from `top` to the bottom, notes meet the line at `hit`. */
  top: number;
  hit: number;
  bot: number;
  wTop: number;
  wBot: number;
  /** Note size at the line. */
  note: number;
  stageY: number;
  stageX0: number;
  stageX1: number;
  roofY: number;
  peakY: number;
  floorY: number;
  ball: { x: number; y: number; r: number };
  sign: { x: number; y: number; size: number };
  band: { x: number; y: number; s: number }[];
  crowd: { x: number; y: number; s: number; kind: Fan; phase: number; rim: string }[];
}

export const widthAt = (L: Layout, y: number): number => L.wTop + ((L.wBot - L.wTop) * (y - L.top)) / (L.bot - L.top);
export const laneX = (L: Layout, lane: number, y: number): number => L.cx + ((lane - 1.5) * widthAt(L, y)) / 4;

export function layout(w: number, h: number, touch: boolean, low: boolean): Layout {
  const portrait = w / h < 1.15;
  const s = Math.min(w / 1600, h / 900);
  const cx = w / 2;
  let laneW = portrait ? clamp(w * 0.2, 64, 180) : touch ? clamp(w * 0.19, 84, 170) : clamp(h * 0.125, 56, 140);
  laneW = Math.min(laneW, (w * 0.9) / 4);
  const roofY = h * (portrait ? 0.07 : 0.13);
  const peakY = h * (portrait ? 0.018 : 0.03);
  const ballR = Math.max(12, (portrait ? w * 0.05 : h * 0.042) * (touch && !portrait ? 0.85 : 1));
  const stageY = h * (portrait ? 0.27 : 0.47);
  const top = portrait ? stageY + h * 0.03 : roofY + ballR * 2 + h * 0.012;
  const ball = portrait ? { x: cx, y: roofY + ballR + h * 0.01, r: ballR } : { x: cx, y: top - ballR * 0.15, r: ballR };
  const hit = h * (touch ? (portrait ? 0.8 : 0.77) : 0.84);
  const bot = h;
  const wHit = laneW * 4;
  const wTop = wHit * (portrait ? 0.78 : 0.62);
  const u = (hit - top) / (bot - top);
  const wBot = wTop + (wHit - wTop) / u;
  const note = Math.min(laneW * 0.8, (hit - top) * (touch ? 0.22 : 0.19));
  const stageX0 = w * (portrait ? 0.02 : 0.06);
  const stageX1 = w - stageX0;
  const floorY = stageY + h * (portrait ? 0.02 : 0.045);
  const gable = roofY - peakY;
  const sign = { x: cx, y: roofY - gable * 0.42, size: Math.min(gable * 0.55, (w * 0.42) / 7) };
  const L: Layout = { w, h, s, portrait, touch, cx, top, hit, bot, wTop, wBot, note, stageY, stageX0, stageX1, roofY, peakY, floorY, ball, sign, band: [], crowd: [] };
  // the band: two on each side of the highway (in portrait across the stage above it)
  if (portrait) {
    const ms = Math.min((w / 4) * 0.8 / 190, (stageY - roofY - ballR * 2) / 235);
    [0.14, 0.38, 0.62, 0.86].forEach((f) => L.band.push({ x: w * f, y: stageY, s: ms }));
  } else {
    const wS = widthAt(L, stageY);
    const m = w * 0.012;
    const side = cx - wS / 2 - stageX0 - m * 2;
    const slot = side / 2;
    const ms = Math.max(0.12, Math.min(slot / 190, ((stageY - roofY) * 0.92) / 235));
    const l0 = stageX0 + m;
    const r0 = cx + wS / 2 + m;
    L.band.push({ x: l0 + slot * 0.5, y: stageY, s: ms }, { x: l0 + slot * 1.5, y: stageY, s: ms }, { x: r0 + slot * 0.5, y: stageY, s: ms }, { x: r0 + slot * 1.5, y: stageY, s: ms });
  }
  // the crowd in the front corners
  const R = rng(7);
  const sideW = cx - L.wBot / 2 - w * 0.01;
  if (sideW > 30 && !portrait) {
    const fs = h * 0.00125;
    const per = low ? 2 : sideW > 320 ? 5 : sideW > 160 ? 3 : 2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < per; i++) {
        const back = i % 2 === 0 && per > 2;
        const f = (i + 0.5) / per;
        const x = side < 0 ? sideW * f : w - sideW * f;
        L.crowd.push({
          x: x + (R() - 0.5) * 20 * s,
          y: back ? h * 0.93 : h + h * 0.05,
          s: fs * (back ? 0.78 : 1) * (0.9 + R() * 0.2),
          kind: Math.floor(R() * 5) as Fan,
          phase: R(),
          rim: LANE_COLOR[Math.floor(R() * 4)]!,
        });
      }
    }
    L.crowd.sort((a, b) => a.y - b.y);
  }
  return L;
}

export interface Music {
  /** Song time and beats. */
  t: number;
  beat: number;
  /** Seconds since the last kick, snare (or clap), hi-hat, crash, bass note, chord stab. */
  kick: number;
  snare: number;
  hat: number;
  crash: number;
  bass: number;
  stab: number;
  /** The lead: is a note sounding, and since when. */
  leadOn: boolean;
  leadSince: number;
  chord: Chord;
  section: Kind;
  /** 0..1 how full the music is. */
  energy: number;
}

export interface Mood {
  /** Seconds of animation (always running). */
  time: number;
  /** 0..1 Discofeber. */
  fever: number;
  /** Per lane 0..1, the light after a hit. */
  lit: number[];
  /** 0..1 how much the crowd cheers. */
  cheer: number;
  /** 0..1 the final pose. */
  pose: number;
  /** Signs letters lit (0..9). */
  sign: number;
  /** 0..1 the scene dimmed (song picker). */
  dim: number;
}

const SIGN = 'DANSBANAN';

export class Scene {
  L!: Layout;
  private bg: HTMLCanvasElement | null = null;
  private letters: { on: HTMLCanvasElement[]; off: HTMLCanvasElement[]; w: number[]; total: number } | null = null;
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private spots: { a: number; e: number; r: number; c: string }[] = [];
  private bulbs: { x: number; y: number; c: string }[] = [];
  private keyLit = new Array<number>(14).fill(0);
  private lastStab = -1;

  constructor(
    private low: boolean,
    private touch: boolean,
    private player: string,
  ) {
    const R = rng(3);
    const n = low ? 14 : 26;
    for (let i = 0; i < n; i++) this.spots.push({ a: R() * Math.PI * 2, e: (R() - 0.35) * 1.3, r: 0.6 + R() * 0.6, c: [C.white, C.white, C.cyan, C.magenta, C.yellow][i % 5]! });
  }

  resize(w: number, h: number, dpr: number): void {
    this.L = layout(w, h, this.touch, this.low);
    this.bg = this.drawBackground(w, h, dpr);
    this.letters = this.drawLetters(dpr);
    const R = rng(11);
    this.stars = [];
    for (let i = 0; i < (this.low ? 10 : 22); i++) this.stars.push({ x: R() * w, y: R() * this.L.roofY * 1.1, r: 1 + R() * 2, p: R() * 10 });
    this.bulbs = [];
    const L = this.L;
    const cols = [C.magenta, C.yellow, C.cyan, C.lime, C.orange];
    // two strands on each side: from the stage roof out over the floor
    const strands: [number, number, number, number, number][] = L.portrait
      ? [
          [0, L.roofY + h * 0.02, w, L.roofY + h * 0.02, h * 0.04],
        ]
      : [
          [L.stageX0, L.roofY, -w * 0.02, L.stageY * 0.95, h * 0.06],
          [L.stageX0 + w * 0.12, L.roofY - (L.roofY - L.peakY) * 0.3, -w * 0.02, L.stageY * 0.62, h * 0.05],
          [L.stageX1, L.roofY, w * 1.02, L.stageY * 0.95, h * 0.06],
          [L.stageX1 - w * 0.12, L.roofY - (L.roofY - L.peakY) * 0.3, w * 1.02, L.stageY * 0.62, h * 0.05],
        ];
    let k = 0;
    for (const [x0, y0, x1, y1, sag] of strands) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(4, Math.round(len / (42 * Math.max(0.5, L.s))));
      for (let i = 1; i < n; i++) {
        const f = i / n;
        this.bulbs.push({ x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * sag, c: cols[k++ % cols.length]! });
      }
    }
  }

  // ---------------------------------------------------------------- still parts

  private drawBackground(w: number, h: number, dpr: number): HTMLCanvasElement {
    const L = this.L;
    const { c, g } = canvas(w * dpr, h * dpr);
    g.scale(dpr, dpr);
    // sky: a light summer night, deep blue to violet with a warm glow low down
    const sky = g.createLinearGradient(0, 0, 0, L.stageY);
    sky.addColorStop(0, '#0a0524');
    sky.addColorStop(0.55, '#221048');
    sky.addColorStop(1, '#4a1a62');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const warm = g.createRadialGradient(w / 2, L.stageY, 0, w / 2, L.stageY, w * 0.7);
    warm.addColorStop(0, 'rgba(255,110,170,0.32)');
    warm.addColorStop(1, 'rgba(255,110,170,0)');
    g.fillStyle = warm;
    g.fillRect(0, 0, w, L.stageY);
    const R = rng(5);
    for (let i = 0; i < 160; i++) {
      const x = R() * w;
      const y = R() * L.stageY * 0.85;
      g.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.6})`;
      g.fillRect(x, y, R() < 0.15 ? 2 : 1, R() < 0.15 ? 2 : 1);
    }
    // the moon
    const mx = L.portrait ? w * 0.82 : w * 0.88;
    const my = L.portrait ? h * 0.035 : h * 0.2;
    const mr = Math.max(8, h * (L.portrait ? 0.022 : 0.035));
    const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 5);
    halo.addColorStop(0, 'rgba(255,240,200,0.28)');
    halo.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    ellipse(g, mx, my, mr, mr);
    g.fillStyle = '#fff3c9';
    g.fill();
    ellipse(g, mx - mr * 0.3, my - mr * 0.2, mr * 0.22, mr * 0.22);
    g.fillStyle = 'rgba(220,200,150,0.5)';
    g.fill();
    ellipse(g, mx + mr * 0.35, my + mr * 0.3, mr * 0.14, mr * 0.14);
    g.fill();
    // spruces along the horizon
    const tree = (x: number, base: number, th: number, col: string): void => {
      const tw = th * 0.38;
      g.beginPath();
      g.moveTo(x, base - th);
      for (let i = 1; i <= 5; i++) {
        const f = i / 5;
        g.lineTo(x + tw * f * 0.9, base - th + th * f * 0.95);
        g.lineTo(x + tw * f * 0.45, base - th + th * f * 0.95 - th * 0.05);
      }
      g.lineTo(x + tw, base);
      g.lineTo(x - tw, base);
      for (let i = 5; i >= 1; i--) {
        const f = i / 5;
        g.lineTo(x - tw * f * 0.45, base - th + th * f * 0.95 - th * 0.05);
        g.lineTo(x - tw * f * 0.9, base - th + th * f * 0.95);
      }
      g.closePath();
      g.fillStyle = col;
      g.fill();
    };
    const RT = rng(9);
    for (let i = 0; i < 26; i++) {
      const x = RT() * w;
      tree(x, L.stageY + h * 0.02, h * (0.12 + RT() * 0.14), '#170a30');
    }
    for (let i = 0; i < 16; i++) {
      const x = RT() < 0.5 ? RT() * w * 0.2 : w - RT() * w * 0.2;
      tree(x, L.stageY + h * 0.05, h * (0.2 + RT() * 0.16), '#0e0622');
    }
    // the stage: back wall with planks, a gable roof in falu red with white trim
    const x0 = L.stageX0;
    const x1 = L.stageX1;
    const wall = g.createLinearGradient(0, L.roofY, 0, L.stageY);
    wall.addColorStop(0, '#12081f');
    wall.addColorStop(1, '#2a1238');
    g.fillStyle = wall;
    g.fillRect(x0, L.roofY, x1 - x0, L.stageY - L.roofY);
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 1;
    const plank = Math.max(10, 26 * L.s);
    for (let x = x0 + plank; x < x1; x += plank) {
      g.beginPath();
      g.moveTo(x, L.roofY);
      g.lineTo(x, L.stageY);
      g.stroke();
    }
    // a soft shadow under the roof
    const under = g.createLinearGradient(0, L.roofY, 0, L.roofY + h * 0.08);
    under.addColorStop(0, 'rgba(0,0,0,0.55)');
    under.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = under;
    g.fillRect(x0, L.roofY, x1 - x0, h * 0.08);
    // posts
    const postW = Math.max(6, 16 * L.s);
    for (const px of [x0, x1 - postW]) {
      g.fillStyle = '#5c1a2a';
      g.fillRect(px, L.roofY, postW, L.stageY - L.roofY);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(px + postW * 0.15, L.roofY, postW * 0.18, L.stageY - L.roofY);
    }
    // roof
    const over = w * 0.025;
    g.beginPath();
    g.moveTo(x0 - over, L.roofY);
    g.lineTo(w / 2, L.peakY);
    g.lineTo(x1 + over, L.roofY);
    g.closePath();
    const roof = g.createLinearGradient(0, L.peakY, 0, L.roofY);
    roof.addColorStop(0, '#7a2232');
    roof.addColorStop(1, '#4a1220');
    g.fillStyle = roof;
    g.fill();
    // board-and-batten on the gable
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = Math.max(1, 3 * L.s);
    for (let x = x0; x < x1; x += plank * 0.8) {
      g.beginPath();
      g.moveTo(x, L.peakY);
      g.lineTo(x, L.roofY);
      g.stroke();
    }
    g.restore();
    g.beginPath();
    g.moveTo(x0 - over, L.roofY);
    g.lineTo(w / 2, L.peakY);
    g.lineTo(x1 + over, L.roofY);
    g.lineWidth = Math.max(2, 7 * L.s);
    g.strokeStyle = '#f2e9f5';
    g.lineJoin = 'round';
    g.stroke();
    g.fillStyle = '#f2e9f5';
    g.fillRect(x0 - over, L.roofY - Math.max(1, 3 * L.s), x1 - x0 + over * 2, Math.max(3, 9 * L.s));
    // the sign's board
    // stage floor and its front
    const front = L.floorY - L.stageY;
    g.fillStyle = '#3b1d2c';
    g.fillRect(x0 - over, L.stageY, x1 - x0 + over * 2, front * 0.35);
    g.fillStyle = '#1c0c1e';
    g.fillRect(x0 - over, L.stageY + front * 0.35, x1 - x0 + over * 2, front * 0.65);
    // the dance floor: wooden planks running towards the stage
    const floor = g.createLinearGradient(0, L.floorY, 0, h);
    floor.addColorStop(0, '#1a0b22');
    floor.addColorStop(1, '#2e1430');
    g.fillStyle = floor;
    g.fillRect(0, L.floorY, w, h - L.floorY);
    const vx = w / 2;
    const vy = L.floorY - h * 0.9;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    for (let i = -16; i <= 16; i++) {
      const bx = vx + i * w * 0.08;
      const t = (L.floorY - vy) / (h - vy);
      g.beginPath();
      g.moveTo(vx + (bx - vx) * t, L.floorY);
      g.lineTo(bx, h);
      g.stroke();
    }
    return c;
  }

  private drawLetters(dpr: number): { on: HTMLCanvasElement[]; off: HTMLCanvasElement[]; w: number[]; total: number } {
    const size = this.L.sign.size;
    const px = size;
    const pad = size * 0.5;
    const measure = canvas(4, 4).g;
    measure.font = font(px, 900);
    const ws = [...SIGN].map((ch) => measure.measureText(ch).width + size * 0.08);
    const total = ws.reduce((a, b) => a + b, 0);
    const cols = [C.magenta, C.cyan, C.yellow, C.lime];
    const make = (ch: string, col: string | null, i: number): HTMLCanvasElement => {
      const cw = ws[i]! + pad * 2;
      const ch2 = size * 1.4 + pad * 2;
      const { c, g } = canvas(cw * dpr, ch2 * dpr);
      g.scale(dpr, dpr);
      g.font = font(px, 900);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const x = cw / 2;
      const y = ch2 / 2;
      if (col) {
        g.shadowColor = col;
        g.shadowBlur = size * 0.5;
        g.lineWidth = size * 0.12;
        g.strokeStyle = col;
        g.strokeText(ch, x, y);
        g.shadowBlur = size * 0.2;
        g.strokeText(ch, x, y);
        g.shadowBlur = 0;
        g.lineWidth = size * 0.05;
        g.strokeStyle = mix(col, '#ffffff', 0.7);
        g.strokeText(ch, x, y);
      } else {
        g.lineWidth = size * 0.11;
        g.strokeStyle = 'rgba(40,20,60,0.95)';
        g.strokeText(ch, x, y);
        g.lineWidth = size * 0.045;
        g.strokeStyle = 'rgba(170,130,200,0.55)';
        g.strokeText(ch, x, y);
      }
      return c;
    };
    const on: HTMLCanvasElement[] = [];
    [...SIGN].forEach((ch, i) => cols.forEach((col) => on.push(make(ch, col, i))));
    const off = [...SIGN].map((ch, i) => make(ch, null, i));
    return { on, off, w: ws, total };
  }

  // ---------------------------------------------------------------- every frame

  /** Everything behind the highway. */
  drawBack(g: G, m: Music, mood: Mood): void {
    const L = this.L;
    const { w, h } = L;
    const t = mood.time;
    if (this.bg) g.drawImage(this.bg, 0, 0, w, h);
    const kick = decay(m.kick, 7);
    const snare = decay(m.snare, 6);
    const fever = mood.fever;
    const energy = m.energy * (1 - mood.dim * 0.5);
    g.globalCompositeOperation = 'lighter';
    // twinkling stars
    for (const s of this.stars) {
      const a = 0.25 + 0.25 * Math.sin(t * 2 + s.p);
      glow(g, C.white, s.x, s.y, s.r * 3 * Math.max(0.6, L.s * 2), a);
    }
    // coloured washes on the back wall behind each band member
    L.band.forEach((b, i) => {
      const col = LANE_COLOR[i]!;
      const a = 0.18 + energy * 0.2 + kick * 0.12 + mood.lit[i]! * 0.7 + fever * 0.15;
      glow(g, col, b.x, b.y - 110 * b.s, 190 * b.s * (1 + mood.lit[i]! * 0.3), a);
    });
    // light beams from the roof, swaying with the beat
    if (!this.low || fever > 0.5) this.beams(g, m, mood, kick, energy);
    g.globalCompositeOperation = 'source-over';
    // the band
    this.band(g, m, mood, kick);
    // neon outline of the stage
    this.neonStage(g, m, mood, kick, snare);
    // the sign
    this.drawSign(g, mood);
    // string lights
    g.globalCompositeOperation = 'lighter';
    const chase = Math.max(0, Math.floor(m.beat * 2));
    this.bulbs.forEach((b, i) => {
      const on = (i + chase) % 3 === 0 ? 1 : 0.35;
      const col = fever > 0.5 ? rainbow(i * 0.07 + t * 0.4) : b.c;
      glow(g, col, b.x, b.y, Math.max(5, 15 * L.s) * (on > 0.5 ? 1 + kick * 0.3 : 0.8), (0.5 + on * 0.5) * (1 - mood.dim * 0.4));
    });
    g.globalCompositeOperation = 'source-over';
    for (const b of this.bulbs) {
      ellipse(g, b.x, b.y, Math.max(1.5, 3.2 * L.s), Math.max(1.5, 3.2 * L.s));
      g.fillStyle = mix(b.c, '#ffffff', 0.6);
      g.fill();
    }
    // the disco floor
    this.floor(g, m, mood, kick);
    // mirror ball light spots sweeping everything
    this.spotsDraw(g, mood, kick);
    this.drawLasers(g, mood);
    // the crowd
    this.crowdDraw(g, m, mood, kick);
  }

  private beams(g: G, m: Music, mood: Mood, kick: number, energy: number): void {
    const L = this.L;
    const { w, h } = L;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const sx = L.stageX0 + ((L.stageX1 - L.stageX0) * (i + 0.5)) / n;
      const sw = Math.sin(m.beat * Math.PI * 0.25 + i * 1.7) * w * 0.18;
      const tx = sx + sw + (i < 2 ? -1 : 1) * w * 0.05;
      const spread = w * 0.07;
      const col = mood.fever > 0.5 ? rainbow(i * 0.25 + mood.time * 0.3) : LANE_COLOR[(((i + Math.floor(m.beat / 4)) % 4) + 4) % 4]!;
      const a = (0.05 + energy * 0.08 + kick * 0.05 + mood.fever * 0.06) * (1 - mood.dim * 0.6);
      const gr = g.createLinearGradient(sx, L.roofY, tx, h);
      gr.addColorStop(0, rgba(col, a * 2.2));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(sx - 4, L.roofY);
      g.lineTo(sx + 4, L.roofY);
      g.lineTo(tx + spread, h);
      g.lineTo(tx - spread, h);
      g.closePath();
      g.fill();
    }
  }

  private band(g: G, m: Music, mood: Mood, kick: number): void {
    const L = this.L;
    const t = mood.time;
    const beatPhase = m.beat - Math.floor(m.beat);
    const bob = Math.pow(1 - beatPhase, 3) * (0.5 + m.energy * 0.5);
    const sway = Math.sin(m.beat * Math.PI) * (0.4 + m.energy * 0.6);
    const cheer = mood.pose;
    const base: Pose = { t, bob, sway, act: 0, act2: 0, big: 0, cheer, fever: mood.fever };
    const [bc, bp, bh, bs] = L.band;
    // the stab lights up a few keys
    if (m.stab < 0.05 && this.lastStab !== Math.round(m.t * 20)) {
      this.lastStab = Math.round(m.t * 20);
      const root = m.chord.root;
      for (const tt of m.chord.tones) this.keyLit[(root + tt) % 14] = 1;
      this.keyLit[(root + 7 + Math.floor(m.t)) % 14] = 1;
    }
    for (let i = 0; i < this.keyLit.length; i++) this.keyLit[i] = Math.max(0, this.keyLit[i]! - 0.06);
    if (bc) cow(g, bc.x, bc.y, bc.s, { ...base, act: decay(m.bass, 14) }, C.magenta);
    if (bp) pig(g, bp.x, bp.y, bp.s, { ...base, act: decay(m.snare, 12), act2: decay(m.hat, 18), big: decay(m.crash, 3), sway: sway * 0.3 }, C.cyan, kick);
    if (bh) hen(g, bh.x, bh.y, bh.s, { ...base, act: m.leadOn ? 0.55 + 0.45 * Math.abs(Math.sin(m.leadSince * 14)) : 0, act2: decay(m.snare, 5) * m.energy }, this.player);
    if (bs) sheep(g, bs.x, bs.y, bs.s, { ...base, act: decay(m.stab, 10), sway: -sway }, this.keyLit, mood.fever > 0.5 ? rainbow(t * 0.5) : C.yellow);
    // a spotlight on whoever matches the lane just hit
    g.globalCompositeOperation = 'lighter';
    L.band.forEach((b, i) => {
      const l = mood.lit[i]!;
      if (l < 0.02) return;
      glow(g, mix(LANE_COLOR[i]!, '#ffffff', 0.4), b.x, b.y - 100 * b.s, 150 * b.s, l * 0.55);
    });
    g.globalCompositeOperation = 'source-over';
  }

  private neonStage(g: G, m: Music, mood: Mood, kick: number, snare: number): void {
    const L = this.L;
    const w = L.w;
    const lw = Math.max(1.5, 4 * L.s);
    const over = w * 0.025;
    const fever = mood.fever;
    const dim = 1 - mood.dim * 0.5;
    // roof edge: magenta, flashing with the kick
    g.beginPath();
    g.moveTo(L.stageX0 - over, L.roofY + lw * 2);
    g.lineTo(w / 2, L.peakY + lw * 2);
    g.lineTo(L.stageX1 + over, L.roofY + lw * 2);
    neonStroke(g, fever > 0.5 ? rainbow(mood.time * 0.3) : C.magenta, lw, (0.55 + kick * 0.45) * dim);
    // stage front: cyan, on the snare
    g.beginPath();
    g.moveTo(L.stageX0 - over, L.stageY + lw);
    g.lineTo(L.stageX1 + over, L.stageY + lw);
    neonStroke(g, fever > 0.5 ? rainbow(mood.time * 0.3 + 0.5) : C.cyan, lw, (0.5 + snare * 0.5) * dim);
    // the posts: yellow
    for (const px of [L.stageX0 + lw * 4, L.stageX1 - lw * 4]) {
      g.beginPath();
      g.moveTo(px, L.roofY + lw * 6);
      g.lineTo(px, L.stageY - lw * 2);
      neonStroke(g, C.yellow, lw * 0.8, (0.35 + m.energy * 0.4) * dim);
    }
  }

  private drawSign(g: G, mood: Mood): void {
    const L = this.L;
    const lt = this.letters;
    if (!lt) return;
    const size = L.sign.size;
    const pad = size * 0.5;
    let x = L.sign.x - lt.total / 2;
    const fever = mood.fever > 0.5;
    [...SIGN].forEach((_, i) => {
      const cw = lt.w[i]!;
      const lit = i < mood.sign;
      const flick = fever ? Math.floor(mood.time * 6 + i) % 4 : i % 4;
      const img = lit ? lt.on[i * 4 + flick]! : lt.off[i]!;
      const dw = cw + pad * 2;
      const dh = size * 1.4 + pad * 2;
      if (lit) g.globalCompositeOperation = 'lighter';
      g.drawImage(img, x - pad, L.sign.y - dh / 2, dw, dh);
      g.globalCompositeOperation = 'source-over';
      x += cw;
    });
  }

  private floor(g: G, m: Music, mood: Mood, kick: number): void {
    const L = this.L;
    const { w, h } = L;
    const rows = this.low ? 4 : 6;
    const cols = this.low ? 8 : 12;
    const vx = w / 2;
    const vy = L.floorY - h * 0.9;
    const xAt = (bx: number, y: number): number => vx + (bx - vx) * ((y - vy) / (h - vy));
    const beat = Math.max(0, Math.floor(m.beat));
    const fever = mood.fever;
    g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < rows; r++) {
      const y0 = L.floorY + (h - L.floorY) * Math.pow(r / rows, 1.35);
      const y1 = L.floorY + (h - L.floorY) * Math.pow((r + 1) / rows, 1.35);
      for (let c = 0; c < cols; c++) {
        const b0 = -w * 0.25 + (w * 1.5 * c) / cols;
        const b1 = -w * 0.25 + (w * 1.5 * (c + 1)) / cols;
        let on: number;
        const sec = m.section;
        if (fever > 0.5) on = 0.55 + 0.45 * Math.sin(mood.time * 6 + c * 0.9 + r * 1.3);
        else if (sec === 'chorus' || sec === 'outro') on = (r + c + beat) % 2 === 0 ? 0.9 : 0.15;
        else if (sec === 'pre') on = (c + beat * 2) % 4 === 0 || (c + beat * 2) % 4 === 3 ? 0.8 : 0.1;
        else on = Math.abs(c - ((beat * 3) % (cols + 2))) < 1.5 ? 0.85 : 0.12;
        // a hit lights the tiles on its side
        const lane = Math.min(3, Math.floor((c / cols) * 4));
        on = Math.min(1.2, on + mood.lit[lane]! * 0.7);
        const col = fever > 0.5 ? rainbow((c + r) * 0.08 + mood.time * 0.2) : LANE_COLOR[(c + r) % 4]!;
        const a = on * (0.1 + kick * 0.06 + m.energy * 0.06) * (1 - mood.dim * 0.5);
        if (a < 0.01) continue;
        const gap = 0.06;
        const ya = y0 + (y1 - y0) * gap;
        const yb = y1 - (y1 - y0) * gap;
        const ba = b0 + (b1 - b0) * gap;
        const bb = b1 - (b1 - b0) * gap;
        g.beginPath();
        g.moveTo(xAt(ba, ya), ya);
        g.lineTo(xAt(bb, ya), ya);
        g.lineTo(xAt(bb, yb), yb);
        g.lineTo(xAt(ba, yb), yb);
        g.closePath();
        g.fillStyle = rgba(col, a);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  private spotsDraw(g: G, mood: Mood, kick: number): void {
    const L = this.L;
    const { w, h } = L;
    const rot = mood.time * 0.45;
    const bright = (0.35 + kick * 0.4 + mood.fever * 0.3) * (1 - mood.dim * 0.4);
    g.globalCompositeOperation = 'lighter';
    for (const s of this.spots) {
      const a = s.a + rot;
      const z = Math.cos(a);
      if (z < 0.05) continue;
      const x = L.ball.x + Math.sin(a) * w * 0.62 * s.r;
      const y = L.ball.y + (s.e + 0.25) * h * 0.75 + Math.cos(a * 2) * h * 0.04;
      if (y < 0 || y > h) continue;
      const r = Math.max(3, 9 * L.s) * (0.6 + z * 0.6);
      glow(g, s.c, x, y, r * 2.2, bright * z);
    }
    g.globalCompositeOperation = 'source-over';
  }

  private crowdDraw(g: G, m: Music, mood: Mood, kick: number): void {
    const L = this.L;
    const t = mood.time;
    const beatPhase = m.beat - Math.floor(m.beat);
    L.crowd.forEach((f, i) => {
      const ph = (beatPhase + f.phase * 0.3) % 1;
      const bounce = Math.pow(Math.sin(ph * Math.PI), 2) * (0.4 + m.energy * 0.6) * (1 - mood.dim * 0.6) + mood.lit[i % 4]! * 0.6;
      const arms = Math.max(mood.cheer, mood.fever * 0.9, mood.pose, m.section === 'chorus' ? 0.35 + 0.3 * Math.sin(t * 2 + i) : 0) * (1 - mood.dim);
      const rim = mood.fever > 0.5 ? rainbow(f.phase + t * 0.3) : f.rim;
      fan(g, f.x, f.y, f.s, f.kind, bounce, Math.max(0, arms), rgba(rim, 0.55 + kick * 0.3), mood.fever > 0.5 ? rainbow(f.phase * 3 + t) : null, t + f.phase * 5);
    });
  }

  /** The mirror ball, drawn over the top of the highway. */
  drawBall(g: G, m: Music, mood: Mood): void {
    const L = this.L;
    const { x, y, r } = L.ball;
    const kick = decay(m.kick, 7);
    // the string
    g.beginPath();
    g.moveTo(x, L.peakY + (L.roofY - L.peakY) * 0.9);
    g.lineTo(x, y - r);
    g.lineWidth = Math.max(1, 2 * L.s);
    g.strokeStyle = '#8a7aa8';
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    glow(g, C.white, x, y, r * 3.2, 0.25 + kick * 0.35 + mood.fever * 0.25);
    g.globalCompositeOperation = 'source-over';
    ellipse(g, x, y, r, r);
    const base = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    base.addColorStop(0, '#e8e4f4');
    base.addColorStop(0.6, '#8f87b0');
    base.addColorStop(1, '#3a3158');
    g.fillStyle = base;
    g.fill();
    // facets: rows of tiles, turning
    g.save();
    ellipse(g, x, y, r, r);
    g.clip();
    const rows = 7;
    const rot = mood.time * 0.9;
    for (let i = 0; i < rows; i++) {
      const lat0 = -Math.PI / 2 + (Math.PI * i) / rows;
      const lat1 = lat0 + Math.PI / rows;
      const y0 = y + Math.sin(lat0) * r;
      const y1 = y + Math.sin(lat1) * r;
      const rr = Math.cos((lat0 + lat1) / 2) * r;
      const cols = Math.max(4, Math.round(12 * Math.cos((lat0 + lat1) / 2)));
      for (let j = 0; j < cols; j++) {
        const a0 = (j / cols) * Math.PI * 2 + rot;
        const a1 = a0 + (Math.PI * 2) / cols;
        const z = Math.cos((a0 + a1) / 2);
        if (z <= 0) continue;
        const xa = x + Math.sin(a0) * rr;
        const xb = x + Math.sin(a1) * rr;
        const sparkle = (i * 7 + j * 3 + Math.floor(mood.time * 8)) % 11 === 0;
        g.fillStyle = sparkle ? 'rgba(255,255,255,0.95)' : `rgba(255,255,255,${0.05 + z * 0.22})`;
        g.fillRect(Math.min(xa, xb) + 0.5, y0 + 0.5, Math.abs(xb - xa) - 1, y1 - y0 - 1);
      }
    }
    g.restore();
    ellipse(g, x, y, r, r);
    g.lineWidth = Math.max(1, 2 * L.s);
    g.strokeStyle = C.ink;
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    glow(g, C.white, x - r * 0.35, y - r * 0.35, r * 0.5, 0.6 + kick * 0.4);
    g.globalCompositeOperation = 'source-over';
  }

  /** Lasers in Discofeber: from the roof corners, sweeping. */
  drawLasers(g: G, mood: Mood): void {
    if (mood.fever < 0.05) return;
    const L = this.L;
    const { w, h } = L;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const srcs: [number, number][] = [
      [L.stageX0 + w * 0.02, L.roofY + h * 0.01],
      [L.stageX1 - w * 0.02, L.roofY + h * 0.01],
    ];
    srcs.forEach(([sx, sy], si) => {
      for (let i = 0; i < (this.low ? 3 : 5); i++) {
        const a = Math.PI / 2 + (si ? 1 : -1) * (0.2 + i * 0.16 + Math.sin(mood.time * 1.3 + i * 0.7) * 0.18);
        const ex = sx + Math.cos(a) * h * 1.6;
        const ey = sy + Math.sin(a) * h * 1.6;
        const col = rainbow(i * 0.18 + si * 0.5 + mood.time * 0.25);
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(ex, ey);
        g.lineWidth = Math.max(2, 7 * L.s);
        g.strokeStyle = rgba(col, 0.1 * mood.fever);
        g.stroke();
        g.lineWidth = Math.max(1, 1.8 * L.s);
        g.strokeStyle = rgba(mix(col, '#ffffff', 0.4), 0.55 * mood.fever);
        g.stroke();
      }
    });
    g.globalCompositeOperation = 'source-over';
  }
}
