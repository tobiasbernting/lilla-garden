// Every sound in the rally, synthesised: the player's engine (pitch follows the revs, dips on gear
// changes), the opponents' engines, tyres, gravel, grass, wind, kerbs, bumps, beeps, cheers, a fanfare
// and a cheerful little music loop.
import { noise as noiseShot, tone } from '../../sfx.ts';
import { clamp } from './util.ts';

interface Voice {
  osc: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
}

const NOTE = (n: string): number => {
  const m = /^([A-G])(#?)(\d)$/.exec(n)!;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = 12 * (Number(m[3]) + 1) + base[m[1]!]! + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
};

// a bouncy tune in G: eight bars, each eight eighth-notes ('' = hold / rest)
const MELODY: string[][] = [
  ['D5', '', 'B4', '', 'G4', 'A4', 'B4', ''],
  ['A4', '', 'F#4', '', 'D4', 'E4', 'F#4', 'A4'],
  ['G4', '', 'E4', '', 'B4', '', 'G4', ''],
  ['E5', '', 'D5', 'C5', 'B4', '', 'A4', ''],
  ['D5', '', 'B4', 'D5', 'G5', '', 'D5', ''],
  ['F#5', '', 'E5', 'D5', 'A4', '', 'F#4', ''],
  ['E5', 'D5', 'B4', 'G4', 'E4', '', 'G4', 'B4'],
  ['C5', '', 'A4', '', 'D5', '', '', ''],
];
const CHORDS: string[][] = [
  ['G3', 'B3', 'D4'],
  ['D3', 'F#3', 'A3'],
  ['E3', 'G3', 'B3'],
  ['C3', 'E3', 'G3'],
  ['G3', 'B3', 'D4'],
  ['D3', 'F#3', 'A3'],
  ['E3', 'G3', 'B3'],
  ['C3', 'E3', 'G3'],
];
const BASS = ['G2', 'D2', 'E2', 'C2', 'G2', 'D2', 'E2', 'C2'];
const FIFTH = ['D3', 'A2', 'B2', 'G2', 'D3', 'A2', 'B2', 'D3'];

export class RallyAudio {
  private readonly a: AudioContext | null;
  private readonly bus: GainNode | null = null;
  private readonly musicBus: GainNode | null = null;
  private engine: Voice | null = null;
  private intake: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private screech: { gain: GainNode; filter: BiquadFilterNode; osc: OscillatorNode; og: GainNode } | null = null;
  private gravel: { gain: GainNode } | null = null;
  private grass: { gain: GainNode } | null = null;
  private wind: { gain: GainNode } | null = null;
  private kerb: { gain: GainNode; osc: OscillatorNode } | null = null;
  private others: Voice[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private musicAt = 0;
  private musicLevel = 0.5;
  private paused = false;
  private dip = 1;

  constructor(ctx: AudioContext | null, out: AudioNode | null) {
    this.a = ctx && out ? ctx : null;
    if (!this.a || !out) return;
    const a = this.a;
    this.bus = a.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(out);
    this.musicBus = a.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.bus);
    // a looping noise buffer shared by the noisy sounds
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noiseSrc = (): AudioBufferSourceNode => {
      const s = a.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(0, Math.random() * 1.5);
      this.sources.push(s);
      return s;
    };
    const chain = (src: AudioNode, type: BiquadFilterType, f: number, q: number): { gain: GainNode; filter: BiquadFilterNode } => {
      const filter = a.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      const gain = a.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.bus!);
      return { gain, filter };
    };
    this.engine = this.voice(0.0);
    this.intake = chain(noiseSrc(), 'bandpass', 300, 1.4);
    const sc = chain(noiseSrc(), 'bandpass', 1500, 7);
    const sOsc = a.createOscillator();
    sOsc.type = 'triangle';
    sOsc.frequency.value = 1150;
    const og = a.createGain();
    og.gain.value = 0;
    sOsc.connect(og).connect(this.bus);
    sOsc.start();
    this.sources.push(sOsc);
    this.screech = { ...sc, osc: sOsc, og };
    this.gravel = chain(noiseSrc(), 'lowpass', 1400, 0.7);
    this.grass = chain(noiseSrc(), 'lowpass', 420, 0.8);
    this.wind = chain(noiseSrc(), 'bandpass', 650, 0.5);
    const kOsc = a.createOscillator();
    kOsc.type = 'square';
    kOsc.frequency.value = 30;
    const kf = a.createBiquadFilter();
    kf.type = 'lowpass';
    kf.frequency.value = 220;
    const kg = a.createGain();
    kg.gain.value = 0;
    kOsc.connect(kf).connect(kg).connect(this.bus);
    kOsc.start();
    this.sources.push(kOsc);
    this.kerb = { gain: kg, osc: kOsc };
    this.others = [this.voice(0), this.voice(0)];
  }

  /** An engine: two saws and a square through a soft clipper and a low-pass. */
  private voice(gain: number): Voice {
    const a = this.a!;
    const g = a.createGain();
    g.gain.value = gain;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    f.Q.value = 2.2;
    const shaper = a.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const mix = a.createGain();
    mix.gain.value = 0.45;
    const oscs: OscillatorNode[] = [];
    for (const [type, mul, lvl] of [
      ['sawtooth', 1, 0.6],
      ['square', 0.5, 0.45],
      ['sawtooth', 2.01, 0.25],
    ] as const) {
      const o = a.createOscillator();
      o.type = type;
      o.frequency.value = 40 * mul;
      const og = a.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(mix);
      o.start();
      (o as OscillatorNode & { mul?: number }).mul = mul;
      oscs.push(o);
      this.sources.push(o);
    }
    mix.connect(shaper).connect(f).connect(g).connect(this.bus!);
    return { osc: oscs, gain: g, filter: f };
  }

  private setVoice(v: Voice, rpm: number, load: number, level: number): void {
    const a = this.a!;
    const t = a.currentTime;
    const f0 = (rpm / 60) * 1.5;
    for (const o of v.osc) o.frequency.setTargetAtTime(f0 * ((o as OscillatorNode & { mul?: number }).mul ?? 1), t, 0.03);
    v.filter.frequency.setTargetAtTime(300 + rpm * 0.28 * (0.45 + 0.55 * load), t, 0.05);
    v.gain.gain.setTargetAtTime(level, t, 0.05);
  }

  /** The player's engine, every frame. `shift` is +1/−1 on a gear change. */
  playerEngine(rpm: number, throttle: number, shift: number): void {
    if (!this.a || !this.engine || this.paused) return;
    if (shift > 0) this.dip = 0.35;
    this.dip = Math.min(1, this.dip + 0.06);
    const lvl = (0.05 + throttle * 0.06 + (rpm / 7000) * 0.03) * this.dip;
    this.setVoice(this.engine, rpm, throttle, lvl);
    const t = this.a.currentTime;
    this.intake!.filter.frequency.setTargetAtTime((rpm / 60) * 4, t, 0.05);
    this.intake!.gain.gain.setTargetAtTime(throttle * (rpm / 7000) * 0.05 * this.dip, t, 0.05);
  }

  /** Two nearest opponents: their revs and how loud (0..1 by distance). */
  otherEngine(k: number, rpm: number, level: number): void {
    const v = this.others[k];
    if (!this.a || !v || this.paused) return;
    this.setVoice(v, rpm, 0.7, level * 0.07);
  }

  /** Tyres and road, every frame (all 0..1, speed in m/s). */
  surface(screech: number, gravel: number, grass: number, kerb: number, speed: number): void {
    if (!this.a || this.paused) return;
    const t = this.a.currentTime;
    const s = this.screech!;
    s.gain.gain.setTargetAtTime(screech * 0.09, t, 0.04);
    s.og.gain.setTargetAtTime(screech * 0.018, t, 0.04);
    s.osc.frequency.setTargetAtTime(1000 + Math.random() * 300 + screech * 200, t, 0.02);
    s.filter.frequency.setTargetAtTime(1300 + Math.random() * 500, t, 0.02);
    // crunch: jitter the gravel level
    this.gravel!.gain.gain.setTargetAtTime(gravel * (0.07 + Math.random() * 0.08), t, 0.015);
    this.grass!.gain.gain.setTargetAtTime(grass * 0.16, t, 0.04);
    const w = clamp(speed / 50, 0, 1);
    this.wind!.gain.gain.setTargetAtTime(w * w * 0.07, t, 0.1);
    this.kerb!.gain.gain.setTargetAtTime(kerb * 0.12, t, 0.02);
    this.kerb!.osc.frequency.setTargetAtTime(Math.max(12, speed * 1.1), t, 0.03);
  }

  silenceCars(): void {
    if (!this.a) return;
    const t = this.a.currentTime;
    for (const g of [this.engine?.gain, this.intake?.gain, this.screech?.gain, this.screech?.og, this.gravel?.gain, this.grass?.gain, this.wind?.gain, this.kerb?.gain, ...this.others.map((o) => o.gain)])
      g?.gain.setTargetAtTime(0, t, 0.03);
  }

  // ---- one-shots ----

  private get out(): AudioNode | null {
    return this.paused ? null : this.bus;
  }

  beep(go: boolean): void {
    tone(this.a, this.out, go ? 880 : 440, go ? 0.6 : 0.25, { type: 'square', vol: 0.09 });
    if (go) tone(this.a, this.out, 1320, 0.5, { type: 'sine', vol: 0.06, at: 0.02 });
  }

  bump(strength: number): void {
    const v = clamp(strength / 8, 0.15, 1);
    tone(this.a, this.out, 110, 0.18, { type: 'sine', to: 50, vol: 0.25 * v });
    noiseShot(this.a, this.out, 0.12, { freq: 900, q: 0.6, vol: 0.18 * v });
  }

  thud(strength: number): void {
    const v = clamp(strength / 6, 0.2, 1);
    tone(this.a, this.out, 80, 0.25, { type: 'sine', to: 35, vol: 0.32 * v });
    noiseShot(this.a, this.out, 0.2, { freq: 300, q: 0.5, vol: 0.14 * v });
  }

  /** Straw bales and fences: a soft whump with a rustle. */
  hay(strength: number): void {
    const v = clamp(strength / 8, 0.2, 1);
    tone(this.a, this.out, 140, 0.15, { type: 'sine', to: 70, vol: 0.2 * v });
    noiseShot(this.a, this.out, 0.35, { freq: 2500, q: 0.4, vol: 0.12 * v });
  }

  pop(): void {
    noiseShot(this.a, this.out, 0.07, { freq: 500, q: 0.5, vol: 0.22 });
    tone(this.a, this.out, 70, 0.08, { type: 'square', to: 40, vol: 0.08 });
  }

  chime(): void {
    tone(this.a, this.out, 784, 0.18, { type: 'triangle', vol: 0.09 });
    tone(this.a, this.out, 1175, 0.3, { type: 'triangle', vol: 0.09, at: 0.09 });
  }

  lap(last: boolean): void {
    const notes = last ? [659, 784, 988, 1319] : [523, 659, 784];
    notes.forEach((f, i) => tone(this.a, this.out, f, 0.22, { type: 'square', vol: 0.06, at: i * 0.11 }));
    if (last) {
      // a little bell
      for (let k = 0; k < 3; k++) tone(this.a, this.out, 1568, 0.5, { type: 'sine', vol: 0.06, at: 0.5 + k * 0.18 });
    }
  }

  boost(): void {
    tone(this.a, this.out, 300, 0.5, { type: 'sawtooth', to: 900, vol: 0.06 });
    noiseShot(this.a, this.out, 0.5, { freq: 1800, q: 0.7, vol: 0.08 });
  }

  poof(): void {
    noiseShot(this.a, this.out, 0.4, { freq: 2200, q: 0.8, vol: 0.12 });
    tone(this.a, this.out, 600, 0.3, { type: 'sine', to: 1400, vol: 0.06 });
  }

  wrongWay(): void {
    tone(this.a, this.out, 330, 0.18, { type: 'square', vol: 0.06 });
    tone(this.a, this.out, 262, 0.25, { type: 'square', vol: 0.06, at: 0.2 });
  }

  /** The crowd: a swell of noisy cheering with a few whistles. */
  cheer(level = 1): void {
    if (!this.a || !this.out) return;
    for (let k = 0; k < 6; k++) noiseShot(this.a, this.out, 0.5 + Math.random() * 0.6, { freq: 900 + Math.random() * 1400, q: 1.5, vol: 0.05 * level, at: k * 0.12 });
    for (let k = 0; k < 2; k++) {
      const f = 1800 + Math.random() * 600;
      tone(this.a, this.out, f, 0.35, { type: 'sine', to: f * 1.3, vol: 0.03 * level, at: 0.2 + k * 0.4 });
    }
  }

  fanfare(win: boolean): void {
    const seq: [number, number, number][] = win
      ? [
          [523, 0, 0.16],
          [659, 0.16, 0.16],
          [784, 0.32, 0.16],
          [1047, 0.48, 0.5],
          [784, 1.0, 0.16],
          [1047, 1.16, 0.8],
        ]
      : [
          [523, 0, 0.16],
          [659, 0.16, 0.16],
          [784, 0.32, 0.5],
          [659, 0.82, 0.16],
          [784, 0.98, 0.7],
        ];
    for (const [f, at, d] of seq) {
      tone(this.a, this.out, f, d, { type: 'square', vol: 0.07, at });
      tone(this.a, this.out, f / 2, d, { type: 'triangle', vol: 0.07, at });
    }
  }

  // ---- music ----

  /** Music level 0..1 (0 stops it). */
  music(level: number): void {
    this.musicLevel = level;
    if (!this.a || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(this.paused ? 0 : level * 0.55, this.a.currentTime, 0.4);
    if (level > 0 && !this.musicTimer && !this.paused) this.startMusic();
  }

  private startMusic(): void {
    if (!this.a) return;
    this.musicAt = this.a.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 90);
    this.schedule();
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    const a = this.a;
    const out = this.musicBus;
    if (!a || !out) return;
    const step = 60 / 132 / 2;
    while (this.musicAt < a.currentTime + 0.35) {
      const k = this.musicStep;
      const bar = Math.floor(k / 8) % 8;
      const e = k % 8;
      const t0 = this.musicAt - a.currentTime;
      if (t0 > -0.05) {
        const at = Math.max(0, t0);
        // oom-pah bass
        if (e === 0 || e === 4) tone(a, out, NOTE(e === 0 ? BASS[bar]! : FIFTH[bar]!), 0.22, { type: 'triangle', vol: 0.16, at });
        // chord stabs on the off-beats
        if (e % 2 === 1) for (const n of CHORDS[bar]!) tone(a, out, NOTE(n), 0.09, { type: 'square', vol: 0.018, at });
        // melody, with a held note when the next step is empty
        const m = MELODY[bar]![e]!;
        if (m) {
          let len = 1;
          while (e + len < 8 && !MELODY[bar]![e + len]) len++;
          const f = NOTE(m);
          tone(a, out, f, step * len * 0.95, { type: 'triangle', vol: 0.07, at, attack: 0.01 });
          tone(a, out, f * 2.005, step * len * 0.6, { type: 'sine', vol: 0.015, at });
        }
        // drums
        if (e === 0 || e === 4) tone(a, out, 150, 0.16, { type: 'sine', to: 45, vol: 0.2, at });
        if (e === 2 || e === 6) noiseShot(a, out, 0.1, { freq: 1800, q: 0.7, vol: 0.06, at });
        noiseShot(a, out, 0.03, { freq: 8000, q: 1, vol: 0.02, at });
      }
      this.musicStep++;
      this.musicAt += step;
    }
  }

  pause(): void {
    this.paused = true;
    this.stopMusic();
    if (this.bus && this.a) this.bus.gain.setTargetAtTime(0, this.a.currentTime, 0.02);
  }

  resume(): void {
    this.paused = false;
    if (this.bus && this.a) this.bus.gain.setTargetAtTime(0.9, this.a.currentTime, 0.05);
    if (this.musicLevel > 0) {
      this.music(this.musicLevel);
    }
  }

  destroy(): void {
    this.stopMusic();
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
    this.sources = [];
    this.bus?.disconnect();
    this.musicBus?.disconnect();
  }
}
