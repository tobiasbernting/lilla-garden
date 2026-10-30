// Minigolfen's sounds, all synthesised: the putter's tick, wooden clacks, the cup's plop and a cheer,
// splashes, moos and quacks, a fanfare, and a cosy little waltz that loops in the background.
import { noise, tone } from '../../sfx.ts';
import type { Snd } from './physics.ts';

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

// a 16-bar waltz in C: [bar chord, melody notes as [midi, beats]]
const CHORDS: number[][] = [
  [60, 64, 67],
  [60, 64, 67],
  [60, 65, 69],
  [60, 64, 67],
  [59, 62, 67],
  [59, 62, 67],
  [60, 64, 67],
  [60, 64, 67],
  [60, 64, 69],
  [60, 64, 69],
  [60, 65, 69],
  [60, 64, 67],
  [60, 65, 69],
  [59, 62, 67],
  [60, 64, 67],
  [59, 62, 65],
];
const BASS = [36, 36, 41, 36, 43, 43, 36, 36, 45, 45, 41, 36, 41, 43, 36, 43];
const MELODY: [number, number][][] = [
  [
    [67, 1],
    [64, 1],
    [67, 1],
  ],
  [
    [72, 2],
    [71, 1],
  ],
  [
    [69, 1],
    [72, 1],
    [69, 1],
  ],
  [[67, 3]],
  [
    [67, 1],
    [65, 1],
    [67, 1],
  ],
  [
    [71, 2],
    [69, 1],
  ],
  [
    [67, 1],
    [64, 1],
    [62, 1],
  ],
  [[60, 3]],
  [
    [69, 1],
    [72, 1],
    [76, 1],
  ],
  [
    [74, 2],
    [72, 1],
  ],
  [
    [69, 1],
    [72, 1],
    [69, 1],
  ],
  [[67, 3]],
  [
    [65, 1],
    [69, 1],
    [72, 1],
  ],
  [
    [71, 2],
    [74, 1],
  ],
  [
    [72, 1],
    [67, 1],
    [64, 1],
  ],
  [
    [72, 2],
    [0, 1],
  ],
];
const BEAT = 0.58;

export class Sound {
  private bus: GainNode | null = null;
  private sfx: GainNode | null = null;
  private mus: GainNode | null = null;
  private next = 0;
  private beat = 0;
  private loop = 0;
  private playing = false;
  private last = new Map<string, number>();

  constructor(private a: AudioContext | null, out: AudioNode | null) {
    if (!a || !out) {
      this.a = null;
      return;
    }
    this.bus = a.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(out);
    this.sfx = a.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.bus);
    this.mus = a.createGain();
    this.mus.gain.value = 0.16;
    this.mus.connect(this.bus);
  }

  private get ok(): boolean {
    return !!this.a && !!this.sfx;
  }

  /** Not the same sound twice within `gap` seconds. */
  private gate(key: string, gap: number): boolean {
    if (!this.a) return false;
    const now = this.a.currentTime;
    const l = this.last.get(key) ?? -1;
    if (now - l < gap) return false;
    this.last.set(key, now);
    return true;
  }

  // ---- music

  startMusic(): void {
    if (!this.a) return;
    this.playing = true;
    this.next = this.a.currentTime + 0.3;
  }

  stopMusic(): void {
    this.playing = false;
  }

  /** Keep the music scheduled a little ahead (call every frame). */
  tick(): void {
    if (!this.playing || !this.a || !this.mus) return;
    const a = this.a;
    while (this.next < a.currentTime + 0.35) {
      this.playBeat(this.next);
      this.next += BEAT;
      this.beat++;
      if (this.beat >= 48) {
        this.beat = 0;
        this.loop++;
      }
    }
  }

  private playBeat(t: number): void {
    const a = this.a!;
    const out = this.mus!;
    const bar = Math.floor(this.beat / 3);
    const inBar = this.beat % 3;
    const at = Math.max(0, t - a.currentTime);
    const chord = CHORDS[bar]!;
    if (inBar === 0) {
      tone(a, out, midi(BASS[bar]!), 0.5, { type: 'triangle', vol: 0.55, at });
      noise(a, out, 0.05, { freq: 160, q: 0.8, vol: 0.12, at });
    } else {
      for (const n of chord) this.pluck(midi(n), at, 0.16);
      noise(a, out, 0.035, { freq: 7000, q: 1.2, vol: 0.05, at });
    }
    // the tune: notes that start on this beat
    let pos = 0;
    for (const [n, len] of MELODY[bar]!) {
      if (pos === inBar && n > 0) {
        const glock = this.loop % 2 === 1;
        const up = this.loop % 4 === 3 && bar >= 8 && bar < 12 ? 12 : 0;
        if (glock) this.glock(midi(n + 12 + up), at, len * BEAT);
        else this.flute(midi(n + up), at, len * BEAT);
      }
      pos += len;
    }
  }

  private pluck(f: number, at: number, vol: number): void {
    tone(this.a, this.mus, f, 0.32, { type: 'triangle', vol, at, attack: 0.004 });
  }

  private flute(f: number, at: number, dur: number): void {
    const a = this.a!;
    const t = a.currentTime + at;
    const o = a.createOscillator();
    const g = a.createGain();
    const lfo = a.createOscillator();
    const lg = a.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    lfo.frequency.value = 5.2;
    lg.gain.value = f * 0.004;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.05);
    g.gain.setValueAtTime(0.42, t + Math.max(0.06, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.98);
    o.connect(g).connect(this.mus!);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur);
    lfo.stop(t + dur);
  }

  private glock(f: number, at: number, dur: number): void {
    tone(this.a, this.mus, f, Math.min(1.2, dur + 0.4), { type: 'sine', vol: 0.32, at, attack: 0.002 });
    tone(this.a, this.mus, f * 2.76, 0.25, { type: 'sine', vol: 0.06, at, attack: 0.002 });
  }

  // ---- pause / end

  pause(): void {
    if (!this.a || !this.bus) return;
    this.bus.gain.cancelScheduledValues(this.a.currentTime);
    this.bus.gain.setTargetAtTime(0, this.a.currentTime, 0.02);
  }

  resume(): void {
    if (!this.a || !this.bus) return;
    this.bus.gain.cancelScheduledValues(this.a.currentTime);
    this.bus.gain.setTargetAtTime(1, this.a.currentTime, 0.05);
    this.next = this.a.currentTime + 0.15;
  }

  destroy(): void {
    this.playing = false;
    try {
      this.bus?.disconnect();
    } catch {
      /* already gone */
    }
    this.bus = this.sfx = this.mus = null;
    this.a = null;
  }

  // ---- effects

  putt(p: number): void {
    if (!this.ok) return;
    const a = this.a;
    const o = this.sfx;
    tone(a, o, 1300 + 900 * p, 0.045, { type: 'triangle', vol: 0.18 + 0.3 * p });
    noise(a, o, 0.035, { freq: 3800, q: 1.4, vol: 0.08 + 0.2 * p });
    tone(a, o, 280 + 80 * p, 0.09, { type: 'sine', vol: 0.12 + 0.25 * p });
  }

  hit(kind: Snd, v: number): void {
    if (!this.ok || !this.gate(kind, 0.045)) return;
    const a = this.a;
    const o = this.sfx;
    const k = Math.min(1, v / 11);
    const vol = 0.06 + 0.34 * k;
    switch (kind) {
      case 'wood':
      case 'fence':
        tone(a, o, (kind === 'fence' ? 760 : 560) + Math.random() * 120, 0.07, { type: 'triangle', vol });
        tone(a, o, (kind === 'fence' ? 1520 : 1150) + Math.random() * 80, 0.03, { type: 'square', vol: vol * 0.18 });
        noise(a, o, 0.045, { freq: 1900, q: 3, vol: vol * 0.6 });
        break;
      case 'hay':
        noise(a, o, 0.14, { freq: 650, q: 0.6, vol: vol * 1.1 });
        tone(a, o, 150, 0.09, { type: 'sine', vol: vol * 0.6, to: 90 });
        break;
      case 'stone':
        tone(a, o, 900 + Math.random() * 200, 0.05, { type: 'triangle', vol: vol * 0.9 });
        noise(a, o, 0.05, { freq: 2600, q: 2, vol: vol * 0.7 });
        break;
      case 'blade':
        tone(a, o, 380 + Math.random() * 60, 0.1, { type: 'triangle', vol });
        noise(a, o, 0.07, { freq: 1300, q: 1.5, vol: vol * 0.6 });
        break;
      case 'cow':
        tone(a, o, 190, 0.12, { type: 'sine', vol, to: 110 });
        noise(a, o, 0.08, { freq: 500, q: 0.8, vol: vol * 0.6 });
        this.moo(0.08);
        break;
      case 'rubber':
        tone(a, o, 210, 0.3, { type: 'sine', vol: vol * 1.2, to: 520 });
        tone(a, o, 330, 0.2, { type: 'triangle', vol: vol * 0.3, to: 700 });
        break;
      case 'metal':
        tone(a, o, 1750, 0.25, { type: 'sine', vol: vol * 0.6 });
        tone(a, o, 2630, 0.18, { type: 'sine', vol: vol * 0.35 });
        break;
    }
  }

  land(v: number): void {
    if (!this.ok || !this.gate('land', 0.06)) return;
    const k = Math.min(1, v / 8);
    tone(this.a, this.sfx, 150, 0.12, { type: 'sine', vol: 0.1 + 0.3 * k, to: 70 });
    noise(this.a, this.sfx, 0.06, { freq: 800, q: 0.8, vol: 0.05 + 0.15 * k });
  }

  lip(): void {
    if (!this.ok) return;
    tone(this.a, this.sfx, 2500, 0.07, { type: 'sine', vol: 0.22 });
    tone(this.a, this.sfx, 1900, 0.09, { type: 'sine', vol: 0.18, at: 0.06 });
    tone(this.a, this.sfx, 2200, 0.06, { type: 'sine', vol: 0.1, at: 0.12 });
  }

  plop(): void {
    if (!this.ok) return;
    const a = this.a;
    const o = this.sfx;
    tone(a, o, 720, 0.16, { type: 'sine', vol: 0.4, to: 170 });
    noise(a, o, 0.06, { freq: 420, q: 1, vol: 0.2 });
    for (let i = 0; i < 3; i++) tone(a, o, 1700 - i * 200, 0.03, { type: 'triangle', vol: 0.12 - i * 0.03, at: 0.07 + i * 0.06 });
  }

  /** A little "hurra": a rising arpeggio and a happy crowd. */
  cheer(big = false): void {
    if (!this.ok) return;
    const a = this.a!;
    const o = this.sfx!;
    const notes = big ? [72, 76, 79, 84, 88] : [72, 76, 79, 84];
    notes.forEach((n, i) => tone(a, o, midi(n), 0.22, { type: 'triangle', vol: 0.18, at: 0.12 + i * 0.09 }));
    // the crowd: a swelling band of noise that slides up, and a few claps
    const t = a.currentTime + 0.1;
    const src = a.createBufferSource();
    const len = 1.4;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(800, t);
    f.frequency.linearRampToValueAtTime(1500, t + 0.5);
    f.frequency.linearRampToValueAtTime(1100, t + len);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.22 : 0.13, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(o);
    src.start(t);
    src.stop(t + len);
    const claps = big ? 18 : 9;
    for (let i = 0; i < claps; i++) noise(a, o, 0.025, { freq: 1500 + Math.random() * 1500, q: 1.5, vol: 0.08 + Math.random() * 0.06, at: 0.15 + Math.random() * (big ? 1.4 : 0.8) });
  }

  fanfare(): void {
    if (!this.ok) return;
    const a = this.a!;
    const o = this.sfx!;
    const brass = (n: number, at: number, dur: number, vol = 0.12): void => {
      const t = a.currentTime + at;
      for (const det of [-6, 6]) {
        const osc = a.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(n);
        osc.detune.value = det;
        const f = a.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(600, t);
        f.frequency.linearRampToValueAtTime(2400, t + 0.06);
        f.frequency.linearRampToValueAtTime(1400, t + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
        g.gain.setValueAtTime(vol, t + dur * 0.75);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(f).connect(g).connect(o);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    };
    brass(67, 0, 0.14);
    brass(72, 0.15, 0.14);
    brass(76, 0.3, 0.14);
    brass(79, 0.45, 0.45);
    brass(76, 0.92, 0.14);
    for (const n of [72, 76, 79, 84]) brass(n, 1.08, 0.9, 0.09);
  }

  splash(): void {
    if (!this.ok) return;
    const a = this.a!;
    const o = this.sfx!;
    const t = a.currentTime;
    const src = a.createBufferSource();
    const len = 0.7;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + len);
    const g = a.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(o);
    src.start(t);
    src.stop(t + len);
    for (let i = 0; i < 6; i++) {
      const fr = 500 + Math.random() * 700;
      tone(a, o, fr, 0.06, { type: 'sine', vol: 0.12, to: fr * 1.6, at: 0.12 + Math.random() * 0.5 });
    }
  }

  quack(): void {
    if (!this.ok || !this.gate('quack', 0.5)) return;
    const a = this.a!;
    for (let i = 0; i < 2; i++) {
      const t = a.currentTime + 0.25 + i * 0.22;
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(560, t);
      o.frequency.exponentialRampToValueAtTime(390, t + 0.13);
      const f = a.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1150;
      f.Q.value = 3.5;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(f).connect(g).connect(this.sfx!);
      o.start(t);
      o.stop(t + 0.16);
    }
  }

  moo(at = 0): void {
    if (!this.ok || !this.gate('moo', 1.2)) return;
    const a = this.a!;
    const t = a.currentTime + at;
    const dur = 0.95;
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(128, t + 0.3);
    o.frequency.linearRampToValueAtTime(112, t + dur);
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(380, t);
    f.frequency.linearRampToValueAtTime(950, t + 0.35);
    f.frequency.linearRampToValueAtTime(480, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.12);
    g.gain.setValueAtTime(0.3, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.sfx!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  whoosh(): void {
    if (!this.ok || !this.gate('whoosh', 0.4)) return;
    const a = this.a!;
    const t = a.currentTime;
    const src = a.createBufferSource();
    const len = 0.5;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + len);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.sfx!);
    src.start(t);
    src.stop(t + len);
  }

  pop(): void {
    if (!this.ok) return;
    tone(this.a, this.sfx, 380, 0.12, { type: 'sine', vol: 0.25, to: 900 });
    noise(this.a, this.sfx, 0.04, { freq: 2500, q: 1, vol: 0.08 });
  }

  poof(): void {
    if (!this.ok) return;
    noise(this.a, this.sfx, 0.3, { freq: 900, q: 0.5, vol: 0.25 });
    tone(this.a, this.sfx, 500, 0.25, { type: 'sine', vol: 0.12, to: 180 });
  }

  rumble(): void {
    if (!this.ok) return;
    noise(this.a, this.sfx, 0.7, { freq: 170, q: 0.7, vol: 0.4 });
    tone(this.a, this.sfx, 95, 0.5, { type: 'triangle', vol: 0.18, to: 70 });
    for (let i = 0; i < 4; i++) tone(this.a, this.sfx, 420 + i * 30, 0.05, { type: 'triangle', vol: 0.08, at: 0.1 + i * 0.13 });
  }

  blip(p: number): void {
    if (!this.ok) return;
    tone(this.a, this.sfx, 420 + 900 * p, 0.04, { type: 'sine', vol: 0.06 });
  }

  ui(n = 0): void {
    if (!this.ok) return;
    tone(this.a, this.sfx, 880 + n * 110, 0.06, { type: 'triangle', vol: 0.12 });
  }

  boo(): void {
    if (!this.ok) return;
    tone(this.a, this.sfx, 330, 0.18, { type: 'triangle', vol: 0.12, to: 260 });
    tone(this.a, this.sfx, 262, 0.3, { type: 'triangle', vol: 0.12, to: 196, at: 0.16 });
  }
}
