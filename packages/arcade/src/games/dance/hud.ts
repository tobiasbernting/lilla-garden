// What sits on top of the pavilion: the note highway with its arrows, the judgements and the combo,
// the score panel, the song and level picker, the count-in and the final card.
import { C, LANE_COLOR, LANE_ROT, QUALITY, arrowPath, clamp, drawArrow, ease, font, glow, glowText, mix, rainbow, rgba, roundRect, star, type ArrowSprites, type G } from './art.ts';
import { JUDGE_NAME, type Judgement, type Note } from './chart.ts';
import { laneX, widthAt, type Layout } from './scene.ts';
import type { Song } from './songs.ts';

export interface Lane {
  /** Held right now. */
  down: boolean;
  /** 0..1 flash after a hit. */
  flash: number;
  /** 0..1 shake after a miss. */
  shake: number;
  /** A hold being kept. */
  holding: boolean;
}

export interface HighwayView {
  t: number;
  scroll: number;
  notes: Note[];
  first: number;
  lanes: Lane[];
  /** 0..1 the highway sliding in. */
  show: number;
  fever: number;
  kick: number;
  time: number;
  song: Song;
  /** Light up the lane whose arrow comes next (Lätt). */
  guide: boolean;
}

/** Screen y of a note time. */
export const noteY = (L: Layout, scroll: number, now: number, t: number): number => L.hit - ((t - now) / scroll) * (L.hit - L.top);

export function drawHighway(g: G, L: Layout, sp: ArrowSprites, v: HighwayView): void {
  if (v.show <= 0.01) return;
  const { top, bot, hit, cx } = L;
  const a = v.show;
  const drop = (1 - ease(v.show)) * L.h * 0.25;
  g.save();
  g.translate(0, drop);
  g.globalAlpha = a;
  // dark glass
  const wt = widthAt(L, top);
  const wb = widthAt(L, bot);
  g.beginPath();
  g.moveTo(cx - wt / 2, top);
  g.lineTo(cx + wt / 2, top);
  g.lineTo(cx + wb / 2, bot);
  g.lineTo(cx - wb / 2, bot);
  g.closePath();
  const glass = g.createLinearGradient(0, top, 0, bot);
  glass.addColorStop(0, 'rgba(10,4,26,0)');
  glass.addColorStop(0.18, 'rgba(10,4,26,0.42)');
  glass.addColorStop(1, 'rgba(10,4,26,0.8)');
  g.fillStyle = glass;
  g.fill();
  // lanes light up when pressed or hit
  g.globalCompositeOperation = 'lighter';
  for (let l = 0; l < 4; l++) {
    const ln = v.lanes[l]!;
    const amt = Math.max(ln.flash * 0.9, ln.down ? 0.35 : 0, ln.holding ? 0.6 : 0);
    if (amt < 0.02) continue;
    const yA = top + (hit - top) * 0.25;
    const x0a = laneX(L, l - 0.5, yA);
    const x1a = laneX(L, l + 0.5, yA);
    const x0b = laneX(L, l - 0.5, bot);
    const x1b = laneX(L, l + 0.5, bot);
    const gr = g.createLinearGradient(0, yA, 0, hit);
    gr.addColorStop(0, rgba(LANE_COLOR[l]!, 0));
    gr.addColorStop(1, rgba(LANE_COLOR[l]!, 0.42 * amt));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0a, yA);
    g.lineTo(x1a, yA);
    g.lineTo(x1b, bot);
    g.lineTo(x0b, bot);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // lane lines
  g.lineWidth = Math.max(1, 1.5 * L.s);
  for (let l = 1; l < 4; l++) {
    g.beginPath();
    g.moveTo(laneX(L, l - 0.5, top), top);
    g.lineTo(laneX(L, l - 0.5, bot), bot);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.stroke();
  }
  // beat lines coming down with the notes
  const spb = v.song.spb;
  const b0 = Math.ceil(v.t / spb);
  const b1 = Math.floor((v.t + v.scroll * 1.02) / spb);
  for (let b = b0; b <= b1; b++) {
    const y = noteY(L, v.scroll, v.t, b * spb);
    if (y < top || y > hit) continue;
    const bar = b % 4 === 0;
    const fade = clamp((y - top) / ((hit - top) * 0.15), 0, 1);
    const ww = widthAt(L, y);
    g.beginPath();
    g.moveTo(cx - ww / 2, y);
    g.lineTo(cx + ww / 2, y);
    g.lineWidth = bar ? Math.max(1.5, 3 * L.s) : Math.max(1, 1.5 * L.s);
    g.strokeStyle = `rgba(255,255,255,${(bar ? 0.16 : 0.07) * fade})`;
    g.stroke();
  }
  // neon rails
  const rail = Math.max(1.5, 3.5 * L.s);
  const fev = v.fever > 0.5;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + (side * wt) / 2, top + (hit - top) * 0.06);
    g.lineTo(cx + (side * wb) / 2, bot);
    const col = fev ? rainbow(v.time * 0.4 + (side > 0 ? 0.5 : 0)) : side < 0 ? C.magenta : C.cyan;
    railStroke(g, col, rail, 0.55 + v.kick * 0.45);
  }
  // the hit line
  const wh = widthAt(L, hit);
  g.beginPath();
  g.moveTo(cx - wh / 2, hit);
  g.lineTo(cx + wh / 2, hit);
  railStroke(g, fev ? rainbow(v.time * 0.5) : C.white, Math.max(1.5, 3 * L.s), 0.45 + v.kick * 0.4);

  // Lätt: the lane of the next arrow glows a little before it arrives
  const ready = [0, 0, 0, 0];
  if (v.guide)
    for (let i = v.first; i < v.notes.length; i++) {
      const n = v.notes[i]!;
      if (n.t > v.t + 0.7) break;
      if (n.judged !== 0 || n.t < v.t - 0.1) continue;
      ready[n.lane] = Math.max(ready[n.lane]!, 1 - Math.max(0, n.t - v.t) / 0.7);
    }

  // touch pads under the line
  if (L.touch) {
    const py0 = hit + L.note * 0.62;
    for (let l = 0; l < 4; l++) {
      const ln = v.lanes[l]!;
      const xa = laneX(L, l - 0.5, py0) + 4;
      const xb = laneX(L, l + 0.5, py0) - 4;
      const xc = laneX(L, l - 0.5, bot) + 4;
      const xd = laneX(L, l + 0.5, bot) - 4;
      g.beginPath();
      g.moveTo(xa, py0);
      g.lineTo(xb, py0);
      g.lineTo(xd, bot + 2);
      g.lineTo(xc, bot + 2);
      g.closePath();
      const col = LANE_COLOR[l]!;
      g.fillStyle = rgba(col, ln.down ? 0.42 : 0.16 + ready[l]! * 0.22);
      g.fill();
      g.lineWidth = Math.max(1.5, 2.5 * L.s);
      g.strokeStyle = rgba(col, ln.down ? 0.95 : 0.5);
      g.stroke();
      const mx = laneX(L, l, (py0 + bot) / 2);
      const my = (py0 + bot) / 2;
      arrowPath(g, mx, my, Math.min(L.note * 0.32, (bot - py0) * 0.32), LANE_ROT[l]!);
      g.fillStyle = rgba(mix(col, '#ffffff', 0.5), ln.down ? 0.95 : 0.55);
      g.fill();
    }
  }

  // receptors
  for (let l = 0; l < 4; l++) {
    const ln = v.lanes[l]!;
    const x = laneX(L, l, hit) + Math.sin(v.time * 60) * ln.shake * 6 * L.s;
    const k = (ln.down ? 0.9 : 1) + ln.flash * 0.18;
    drawArrow(g, sp, sp.ring[l]!, x, hit, k);
    if (ready[l]! > 0.02) {
      g.globalCompositeOperation = 'lighter';
      glow(g, LANE_COLOR[l]!, x, hit, L.note * (0.9 + 0.15 * Math.sin(v.time * 12)), 0.45 * ready[l]!);
      g.globalCompositeOperation = 'source-over';
    }
    if (ln.flash > 0.02 || ln.holding) {
      g.globalCompositeOperation = 'lighter';
      drawArrow(g, sp, sp.note[l]!, x, hit, k, Math.max(ln.flash, ln.holding ? 0.55 : 0));
      glow(g, LANE_COLOR[l]!, x, hit, L.note * (1 + ln.flash * 0.6), 0.5 * Math.max(ln.flash, ln.holding ? 0.6 : 0));
      g.globalCompositeOperation = 'source-over';
    }
  }

  // notes, latest first so the next one is on top
  const end = v.t + v.scroll * 1.05;
  const startT = v.t - 0.5;
  let last = v.first;
  while (last < v.notes.length && v.notes[last]!.t <= end) last++;
  for (let i = last - 1; i >= v.first; i--) {
    const n = v.notes[i]!;
    if (n.end < startT && n.t < startT) continue;
    drawNote(g, L, sp, v, n);
  }
  g.restore();
}

function railStroke(g: G, col: string, w: number, on: number): void {
  g.lineCap = 'round';
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(col, 0.12 * on);
  g.lineWidth = w * 6;
  g.stroke();
  g.strokeStyle = rgba(col, 0.35 * on);
  g.lineWidth = w * 2.4;
  g.stroke();
  g.strokeStyle = rgba(mix(col, '#ffffff', 0.6), on);
  g.lineWidth = w;
  g.stroke();
  g.globalCompositeOperation = 'source-over';
}

function drawNote(g: G, L: Layout, sp: ArrowSprites, v: HighwayView, n: Note): void {
  const hit = n.judged > 0 && n.judged < 4;
  if (hit && !n.hold) return;
  const holding = n.hs === 1;
  let y = noteY(L, v.scroll, v.t, n.t);
  if (hit && n.hold && holding) y = L.hit;
  const fadeIn = clamp((y - L.top) / ((L.hit - L.top) * 0.1), 0, 1);
  if (fadeIn <= 0) return;
  const k = widthAt(L, y) / widthAt(L, L.hit);
  const x = laneX(L, n.lane, y);
  const missed = n.judged === 4;
  const out = missed ? clamp(1 - (v.t - n.t) / 0.45, 0, 1) : 1;
  // the hold tail
  if (n.hold && !(hit && n.hs !== 1 && n.hs !== 0)) {
    const y2 = Math.max(L.top, noteY(L, v.scroll, v.t, n.end));
    if (y2 < y) {
      const k2 = widthAt(L, y2) / widthAt(L, L.hit);
      const x2 = laneX(L, n.lane, y2);
      const w1 = L.note * 0.36 * k;
      const w2 = L.note * 0.36 * k2;
      const col = missed ? '#5b5470' : LANE_COLOR[n.lane]!;
      g.beginPath();
      g.moveTo(x - w1 / 2, y);
      g.lineTo(x2 - w2 / 2, y2);
      g.arc(x2, y2, w2 / 2, Math.PI, 0);
      g.lineTo(x + w1 / 2, y);
      g.closePath();
      g.fillStyle = rgba(col, (holding ? 0.85 : 0.5) * out * fadeIn);
      g.fill();
      g.lineWidth = Math.max(1, 2 * L.s);
      g.strokeStyle = rgba(missed ? '#26203a' : mix(col, '#ffffff', 0.5), 0.8 * out * fadeIn);
      g.stroke();
      if (holding) {
        g.globalCompositeOperation = 'lighter';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x2, y2);
        g.lineWidth = w1 * 0.35;
        g.strokeStyle = rgba(mix(col, '#ffffff', 0.6), 0.5 + 0.3 * Math.sin(v.time * 30));
        g.stroke();
        g.globalCompositeOperation = 'source-over';
      }
    }
  }
  if (hit && n.hold) return;
  const img = missed ? sp.grey[n.lane]! : sp.note[n.lane]!;
  // notes bounce a little on the beat
  const beatK = 1 + 0.06 * v.kick;
  drawArrow(g, sp, img, x, y, k * beatK, fadeIn * out);
}

// ---------------------------------------------------------------- judgement, combo, score

export interface JudgeView {
  j: Judgement;
  age: number;
  off: number;
}

export function drawJudge(g: G, L: Layout, jv: JudgeView | null, time: number): void {
  if (!jv || jv.age > 0.6) return;
  const y = L.hit - (L.hit - L.top) * 0.24;
  const pop = jv.age < 0.08 ? 0.7 + (jv.age / 0.08) * 0.5 : 1.2 - Math.min(0.2, (jv.age - 0.08) * 1.5);
  const a = jv.age < 0.4 ? 1 : 1 - (jv.age - 0.4) / 0.2;
  const px = clamp(L.h * 0.055, 18, 54) * pop;
  const col = jv.j === 1 ? rainbow(time * 1.5) : jv.j === 2 ? C.cyan : jv.j === 3 ? C.yellow : '#9a8fc0';
  glowText(g, JUDGE_NAME[jv.j], L.cx, y - (jv.j === 4 ? -jv.age * 20 : jv.age * 14), px, col, { alpha: a, glow: jv.j === 4 ? 0 : 1 });
}

export function drawCombo(g: G, L: Layout, combo: number, mult: number, pulse: number, fever: number, time: number): void {
  if (combo < 4) return;
  const y = L.top + (L.hit - L.top) * 0.4;
  const px = clamp(L.h * 0.085, 26, 84) * (1 + pulse * 0.18);
  const col = fever > 0.5 ? rainbow(time * 0.6) : mult >= 3 ? C.yellow : mult >= 2 ? C.cyan : C.white;
  glowText(g, String(combo), L.cx, y, px, col, { alpha: 0.85, glow: 0.8 });
  glowText(g, 'KOMBO', L.cx, y + px * 0.62, px * 0.3, C.white, { alpha: 0.75, glow: 0 });
}

export interface HudView {
  score: number;
  mult: number;
  fever: number;
  song: string;
  level: string;
  progress: number;
  player: string;
  time: number;
  bump: number;
}

export function drawHud(g: G, L: Layout, v: HudView): void {
  const base = Math.min(L.h, L.w * 0.75);
  const pad = clamp(base * 0.018, 8, 18);
  const sx = Math.max(pad, 10);
  const sy = pad;
  const big = clamp(base * 0.052, 18, 64);
  const small = clamp(base * 0.021, 10, 24);
  const w = clamp(L.w * (L.portrait ? 0.36 : 0.18), 130, 380);
  const h = small * 1.5 + big * 1.15 + small * 1.6;
  roundRect(g, sx, sy, w, h, small * 0.8);
  g.fillStyle = 'rgba(12,5,28,0.62)';
  g.fill();
  g.lineWidth = Math.max(1.5, 2.5 * L.s);
  g.strokeStyle = rgba(v.fever > 0.5 ? rainbow(v.time * 0.4) : v.player, 0.85);
  g.stroke();
  g.font = font(small, 800);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(`${v.song} · ${v.level}`, sx + small * 0.8, sy + small * 1.0, w - small * 1.6);
  const scoreText = Math.round(v.score).toLocaleString('sv-SE');
  g.save();
  g.translate(sx + small * 0.8, sy + small * 1.6 + big * 0.55);
  g.scale(1 + v.bump * 0.08, 1 + v.bump * 0.08);
  g.font = font(big, 900);
  g.lineJoin = 'round';
  g.lineWidth = big * 0.12;
  g.strokeStyle = C.ink;
  g.strokeText(scoreText, 0, 0);
  g.fillStyle = '#ffffff';
  if (!QUALITY.cheap) {
    g.shadowColor = v.player;
    g.shadowBlur = big * 0.3;
  }
  g.fillText(scoreText, 0, 0);
  g.restore();
  // multiplier
  if (v.mult > 1) {
    const mtxt = `×${v.mult}`;
    g.font = font(big * 0.62, 900);
    const mw = g.measureText(mtxt).width + small;
    const mx = sx + w - mw - small * 0.5;
    const my = sy + small * 1.6 + big * 0.2;
    roundRect(g, mx, my, mw, big * 0.75, big * 0.3);
    const col = v.fever > 0.5 ? rainbow(v.time * 0.6) : v.mult >= 3 ? C.yellow : C.cyan;
    g.fillStyle = rgba(col, 0.9);
    g.fill();
    g.fillStyle = C.ink;
    g.textAlign = 'center';
    g.fillText(mtxt, mx + mw / 2, my + big * 0.4);
  }
  // song progress
  const by = sy + h - small * 0.75;
  roundRect(g, sx + small * 0.8, by - 3, w - small * 1.6, 6, 3);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fill();
  roundRect(g, sx + small * 0.8, by - 3, Math.max(6, (w - small * 1.6) * clamp(v.progress, 0, 1)), 6, 3);
  g.fillStyle = v.player;
  g.fill();
}

export function drawFeverBanner(g: G, L: Layout, age: number, time: number): void {
  if (age < 0 || age > 1.8) return;
  const y = L.top + (L.hit - L.top) * 0.2;
  const inn = ease(age / 0.25);
  const a = age < 1.4 ? 1 : 1 - (age - 1.4) / 0.4;
  const px = clamp(L.h * 0.075, 22, 72) * (0.6 + inn * 0.4);
  const text = 'DISCOFEBER!';
  g.save();
  g.font = font(px, 900);
  const total = g.measureText(text).width;
  let x = L.cx - total / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const cw = g.measureText(ch).width;
    const wob = Math.sin(time * 10 + i * 0.7) * px * 0.08;
    glowText(g, ch, x + cw / 2, y + wob, px, rainbow(i * 0.09 + time * 0.8), { alpha: a });
    x += cw;
  }
  glowText(g, '×4 poäng!', L.cx, y + px * 0.85, px * 0.36, C.white, { alpha: a * 0.9, glow: 0.5 });
  g.restore();
}

export function drawCountdown(g: G, L: Layout, t: number, spb: number, intro: string, hint: string): void {
  // how to play, until the first arrows arrive
  const ha = clamp(Math.min(1 + t * 0.8, (spb * 4 - t) / spb), 0, 1);
  if (ha > 0) {
    g.save();
    g.globalAlpha = ha * 0.95;
    g.font = font(clamp(L.h * 0.03, 12, 30), 800);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 5;
    g.strokeStyle = C.ink;
    const y = L.top + (L.hit - L.top) * 0.62;
    g.strokeText(hint, L.cx, y);
    g.fillStyle = '#ffffff';
    g.fillText(hint, L.cx, y);
    g.restore();
  }
  if (t < 0) {
    const a = clamp(1 + t * 0.4, 0, 1);
    glowText(g, intro, L.cx, L.top + (L.hit - L.top) * 0.42, clamp(L.h * 0.05, 18, 46), C.white, { alpha: a, glow: 0.6 });
    return;
  }
  const beat = Math.floor(t / spb);
  if (beat > 4) return;
  const age = t - beat * spb;
  const labels = ['3', '2', '1', 'Kör!', ''];
  const label = labels[beat]!;
  if (!label) return;
  const px = clamp(L.h * (beat === 3 ? 0.11 : 0.15), 30, 150) * (1.25 - Math.min(0.25, age * 1.2));
  const a = clamp(1 - age / spb, 0, 1);
  const col = [C.magenta, C.cyan, C.lime, C.yellow][beat]!;
  glowText(g, label, L.cx, L.top + (L.hit - L.top) * 0.42, px, col, { alpha: a });
}

// ---------------------------------------------------------------- the song and level picker

export interface Card {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pickCards(L: Layout, n: number): Card[] {
  const portrait = L.portrait;
  const cw = n === 2 ? Math.min(L.w * (portrait ? 0.42 : 0.3), 520) : Math.min(L.w * (portrait ? 0.29 : 0.21), 380);
  const ch = Math.min(L.h * (portrait ? 0.2 : 0.34), n === 2 ? 320 : 290, cw * 0.95);
  const gap = Math.min(L.w * 0.035, 44);
  const total = n * cw + (n - 1) * gap;
  const y = L.h * (portrait ? 0.5 : 0.56) - ch / 2;
  return Array.from({ length: n }, (_, i) => ({ x: L.cx - total / 2 + i * (cw + gap), y, w: cw, h: ch }));
}

export function backButton(L: Layout): Card {
  const h = clamp(L.h * 0.07, 36, 56);
  return { x: 12, y: L.h - h - 12, w: h * 3.1, h };
}

export interface PickView {
  step: 0 | 1;
  song: number;
  level: number;
  songs: { id: string; name: string; blurb: string }[];
  levels: { name: string; blurb: string }[];
  /** 0..1 how far the step's cards have come in. */
  enter: number;
  beat: number;
  time: number;
  touch: boolean;
}

export function drawPick(g: G, L: Layout, v: PickView): void {
  g.fillStyle = 'rgba(8,3,20,0.5)';
  g.fillRect(0, 0, L.w, L.h);
  const title = v.step === 0 ? 'Välj låt' : 'Välj nivå';
  const ty = L.h * (L.portrait ? 0.34 : 0.3);
  glowText(g, title, L.cx, ty, clamp(L.h * 0.07, 24, 66), v.step === 0 ? C.magenta : C.cyan);
  if (v.step === 1) {
    glowText(g, `♪ ${v.songs[v.song]!.name}`, L.cx, ty + clamp(L.h * 0.055, 18, 48), clamp(L.h * 0.03, 12, 26), C.white, { glow: 0.3 });
  }
  const n = v.step === 0 ? v.songs.length : v.levels.length;
  const cards = pickCards(L, n);
  const sel = v.step === 0 ? v.song : v.level;
  const bounce = Math.pow(1 - (v.beat - Math.floor(v.beat)), 3);
  cards.forEach((c, i) => {
    const on = i === sel;
    const intro = ease(clamp(v.enter * 1.6 - i * 0.2, 0, 1));
    const k = (on ? 1.06 + bounce * 0.025 : 0.96) * (0.7 + intro * 0.3);
    const col = v.step === 0 ? songColor(v.songs[i]!.id) : [C.lime, C.yellow, C.magenta][i]!;
    g.save();
    g.globalAlpha = intro;
    g.translate(c.x + c.w / 2, c.y + c.h / 2 + (1 - intro) * 40);
    g.scale(k, k);
    roundRect(g, -c.w / 2, -c.h / 2, c.w, c.h, Math.min(c.w, c.h) * 0.12);
    g.fillStyle = on ? 'rgba(30,10,52,0.92)' : 'rgba(18,8,34,0.82)';
    g.fill();
    if (on && !QUALITY.cheap) {
      g.shadowColor = col;
      g.shadowBlur = 24;
    }
    g.lineWidth = on ? Math.max(3, 5 * L.s) : Math.max(1.5, 2.5 * L.s);
    g.strokeStyle = rgba(col, on ? 1 : 0.5);
    g.stroke();
    g.shadowBlur = 0;
    const big = Math.min(c.h * 0.17, c.w * 0.12);
    if (v.step === 0) {
      const s = v.songs[i]!;
      icon(g, s.id, 0, -c.h * 0.18, c.h * 0.17, col, v.time);
      glowText(g, s.name, 0, c.h * 0.12, Math.min(big, (c.w * 0.9) / (s.name.length * 0.58)), col, { glow: on ? 0.8 : 0.2 });
      g.font = font(big * 0.5, 700);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText(s.blurb, 0, c.h * 0.32);
    } else {
      const lv = v.levels[i]!;
      for (let k2 = 0; k2 <= i; k2++) {
        const sx = (k2 - i / 2) * big * 1.25;
        star(g, sx, -c.h * 0.2, big * 0.55);
        g.fillStyle = C.yellow;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = C.ink;
        g.stroke();
      }
      glowText(g, lv.name, 0, c.h * 0.08, big * 1.15, col, { glow: on ? 0.8 : 0.2 });
      g.font = font(big * 0.48, 700);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText(lv.blurb, 0, c.h * 0.32);
    }
    g.restore();
  });
  // how to choose
  const hy = cards[0]!.y + cards[0]!.h + clamp(L.h * 0.07, 22, 60);
  const hint = v.touch
    ? v.step === 0
      ? 'Tryck på en låt'
      : 'Tryck på en nivå'
    : v.step === 0
      ? '← → välj låt   ·   A eller Enter: välj'
      : '← → välj nivå   ·   A eller Enter: dansa!   ·   B: byt låt';
  g.font = font(clamp(L.h * 0.026, 11, 30), 700);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(hint, L.cx, Math.min(L.h - 20, hy));
  if (v.step === 1 && v.touch) {
    const b = backButton(L);
    roundRect(g, b.x, b.y, b.w, b.h, b.h / 2);
    g.fillStyle = 'rgba(18,8,34,0.85)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = rgba(C.magenta, 0.8);
    g.stroke();
    g.font = font(b.h * 0.42, 800);
    g.fillStyle = '#ffffff';
    g.fillText('‹ Låtar', b.x + b.w / 2, b.y + b.h / 2);
  }
}

/** Each song's colour on its card. */
export const songColor = (id: string): string => (id === 'kyckling' ? C.yellow : id === 'ladugard' ? C.magenta : C.cyan);

function icon(g: G, id: string, x: number, y: number, r: number, col: string, time: number): void {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  if (id === 'ladugard') {
    // a little red barn with a mirror ball
    g.beginPath();
    g.moveTo(-r, r * 0.8);
    g.lineTo(-r, -r * 0.1);
    g.lineTo(0, -r * 0.8);
    g.lineTo(r, -r * 0.1);
    g.lineTo(r, r * 0.8);
    g.closePath();
    g.fillStyle = '#c0283a';
    g.fill();
    g.lineWidth = Math.max(2, r * 0.1);
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.beginPath();
    g.rect(-r * 0.35, r * 0.15, r * 0.7, r * 0.65);
    g.moveTo(-r * 0.35, r * 0.15);
    g.lineTo(r * 0.35, r * 0.8);
    g.moveTo(r * 0.35, r * 0.15);
    g.lineTo(-r * 0.35, r * 0.8);
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    glow(g, col, 0, -r * 0.15, r * 0.6, 0.6 + 0.3 * Math.sin(time * 6));
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.arc(0, -r * 0.15, r * 0.2, 0, Math.PI * 2);
    g.fillStyle = '#e8e4f4';
    g.fill();
  } else if (id === 'midnatt') {
    // a moon and a star
    g.beginPath();
    g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    g.fillStyle = '#fff3c9';
    g.fill();
    g.beginPath();
    g.arc(r * 0.35, -r * 0.2, r * 0.68, 0, Math.PI * 2);
    g.fillStyle = 'rgba(18,8,34,1)';
    g.fill();
    star(g, r * 0.6, -r * 0.55, r * 0.28);
    g.fillStyle = C.yellow;
    g.fill();
    g.globalCompositeOperation = 'lighter';
    glow(g, col, 0, 0, r * 1.2, 0.35 + 0.2 * Math.sin(time * 5));
    g.globalCompositeOperation = 'source-over';
  } else {
    // a little chick, bobbing
    const bob = Math.abs(Math.sin(time * 4)) * r * 0.08;
    g.translate(0, -bob);
    g.globalCompositeOperation = 'lighter';
    glow(g, col, 0, 0, r * 1.2, 0.3 + 0.2 * Math.sin(time * 5));
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.ellipse(0, r * 0.25, r * 0.72, r * 0.58, 0, 0, Math.PI * 2);
    g.fillStyle = '#ffd94a';
    g.fill();
    g.beginPath();
    g.arc(0, -r * 0.35, r * 0.45, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(2, r * 0.08);
    g.strokeStyle = C.ink;
    g.beginPath();
    g.ellipse(0, r * 0.25, r * 0.72, r * 0.58, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, -r * 0.35, r * 0.45, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(r * 0.3, -r * 0.4);
    g.lineTo(r * 0.68, -r * 0.3);
    g.lineTo(r * 0.3, -r * 0.18);
    g.closePath();
    g.fillStyle = '#ff9a2e';
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(r * 0.1, -r * 0.45, r * 0.08, 0, Math.PI * 2);
    g.fillStyle = C.ink;
    g.fill();
    g.beginPath();
    g.ellipse(-r * 0.2, r * 0.2, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2);
    g.fillStyle = '#f2b830';
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------- the end

export interface FinalView {
  age: number;
  title: string;
  stars: number;
  counts: number[];
  best: number;
  score: number;
  acc: number;
  time: number;
}

export function drawFinal(g: G, L: Layout, v: FinalView): void {
  const a = ease(clamp(v.age / 0.5, 0, 1));
  if (a <= 0) return;
  const w = Math.min(L.w * 0.86, 560, L.h * 1.5);
  const h = Math.min(L.h * 0.52, 330);
  const x = L.cx - w / 2;
  // low enough that the band's final pose shows above it
  const y = Math.max(L.h * 0.62 - h / 2, L.stageY - h * 0.45) + (1 - a) * 60;
  g.save();
  g.globalAlpha = a;
  roundRect(g, x, y, w, h, 22);
  g.fillStyle = 'rgba(14,6,30,0.86)';
  g.fill();
  if (!QUALITY.cheap) {
    g.shadowColor = rainbow(v.time * 0.3);
    g.shadowBlur = 26;
  }
  g.lineWidth = 4;
  g.strokeStyle = rainbow(v.time * 0.3);
  g.stroke();
  g.shadowBlur = 0;
  const big = Math.min(h * 0.15, w * 0.1);
  glowText(g, v.title, L.cx, y + h * 0.17, big, rainbow(v.time * 0.5));
  for (let i = 0; i < 3; i++) {
    const on = i < v.stars;
    const pop = on ? ease(clamp((v.age - 0.4 - i * 0.25) / 0.3, 0, 1)) : 1;
    const sx = L.cx + (i - 1) * big * 1.5;
    const sy = y + h * 0.4;
    star(g, sx, sy, big * 0.6 * (on ? 0.6 + pop * 0.4 : 0.8));
    g.fillStyle = on ? C.yellow : 'rgba(255,255,255,0.12)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = C.ink;
    g.stroke();
    if (on && pop > 0.5) {
      g.globalCompositeOperation = 'lighter';
      glow(g, C.yellow, sx, sy, big * 1.1, 0.5 * pop);
      g.globalCompositeOperation = 'source-over';
    }
  }
  const small = Math.max(12, big * 0.36);
  g.font = font(small, 800);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [, p, b, o, m] = v.counts;
  const parts: [string, string][] = [
    [`Perfekt ${p}`, C.magenta],
    [`Bra ${b}`, C.cyan],
    [`Okej ${o}`, C.yellow],
    [`Miss ${m}`, '#a89cd0'],
  ];
  const widths = parts.map(([s]) => g.measureText(s).width);
  const gap = small * 1.2;
  let px = L.cx - (widths.reduce((s, x2) => s + x2, 0) + gap * 3) / 2;
  parts.forEach(([s, col], i) => {
    g.fillStyle = col;
    g.textAlign = 'left';
    g.fillText(s, px, y + h * 0.6);
    px += widths[i]! + gap;
  });
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.fillText(`${v.acc} % rätt · bästa kombo ${v.best}`, L.cx, y + h * 0.72);
  glowText(g, `${Math.round(v.score).toLocaleString('sv-SE')} poäng`, L.cx, y + h * 0.87, big * 0.72, C.white, { glow: 0.6 });
  g.restore();
}
