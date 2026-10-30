// Every sound in Snöbollskriget, synthesised: whooshes, poofs, plopps, sleigh bells, and a cosy
// oom-pah winter tune that changes with the battle. All of it goes through one gain node so pausing
// silences it at once.

type Mode = 'off' | 'calm' | 'fight' | 'boss';

const NOTE: Record<string, number> = {};
{
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 7; o++) names.forEach((n, i) => (NOTE[`${n}${o}`] = 440 * Math.pow(2, (o * 12 + i - 57) / 12)));
}
const f = (n: string): number => NOTE[n] ?? 440;

// melody in quarter notes ('-' holds), 8 bars of 4
const MELODY = ['B4', 'D5', 'G5', 'D5', 'E5', 'D5', 'B4', 'G4', 'C5', 'E5', 'G5', 'E5', 'F#5', 'E5', 'D5', 'A4', 'G5', 'F#5', 'G5', 'D5', 'E5', 'G5', 'F#5', 'E5', 'C5', 'E5', 'D5', 'F#5', 'G5', '-', 'D5', 'B4'];
const MELODY_B = ['D5', '-', 'B4', 'G4', 'B4', '-', 'G4', 'E4', 'E5', '-', 'C5', 'G4', 'A4', 'B4', 'C5', 'D5', 'B4', '-', 'D5', 'G5', 'G5', 'F#5', 'E5', 'B4', 'C5', '-', 'A4', 'C5', 'B4', 'A4', 'G4', '-'];
const CHORDS: [string, string[]][] = [
  ['G2', ['G3', 'B3', 'D4']],
  ['E2', ['E3', 'G3', 'B3']],
  ['C3', ['C4', 'E4', 'G4']],
  ['D3', ['D4', 'F#4', 'A4']],
  ['G2', ['G3', 'B3', 'D4']],
  ['E2', ['E3', 'G3', 'B3']],
  ['A2', ['A3', 'C4', 'E4']],
  ['D3', ['D4', 'F#4', 'A4']],
];
const BOSS_CHORDS: [string, string[]][] = [
  ['E2', ['E3', 'G3', 'B3']],
  ['C3', ['C4', 'E4', 'G4']],
  ['D3', ['D4', 'F#4', 'A4']],
  ['B2', ['B3', 'D#4', 'F#4']],
];
const BOSS_MELODY = ['E5', 'G5', 'B5', 'G5', 'C6', 'B5', 'G5', 'E5', 'D5', 'F#5', 'A5', 'F#5', 'B5', 'A5', 'F#5', 'D#5', 'E5', '-', 'B4', 'E5', 'G5', 'E5', 'C5', 'G4', 'A4', 'D5', 'F#5', 'A5', 'B5', '-', 'D#5', 'F#5'];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sound {
  readonly a: AudioContext | null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private mode: Mode = 'off';
  private beat = 0;
  private nextTime = 0;
  private held = new Set<AudioScheduledSourceNode>();

  constructor(a: AudioContext | null, out: AudioNode | null) {
    this.a = a && out ? a : null;
    if (!this.a || !out) return;
    const c = this.a;
    this.master = c.createGain();
    this.master.gain.value = 1;
    this.master.connect(out);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.master);
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
  }

  // ---------------------------------------------------------------- plumbing

  setPaused(p: boolean): void {
    if (!this.a || !this.master) return;
    const t = this.a.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(p ? 0 : 1, t);
    if (!p) this.nextTime = Math.max(this.nextTime, t + 0.06);
  }

  dispose(): void {
    for (const s of this.held) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.held.clear();
    this.master?.disconnect();
    this.master = null;
    this.sfx = null;
    this.musicBus = null;
  }

  private bus(pan = 0, music = false): AudioNode | null {
    const target = music ? this.musicBus : this.sfx;
    if (!this.a || !target) return null;
    if (Math.abs(pan) < 0.05) return target;
    const p = this.a.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(target);
    return p;
  }

  private osc(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; at?: number; attack?: number; pan?: number; music?: boolean; vib?: number; vibRate?: number } = {}): void {
    const c = this.a;
    const out = this.bus(o.pan, o.music);
    if (!c || !out) return;
    const t = (o.music ? 0 : c.currentTime) + (o.at ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.vib) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = o.vibRate ?? 6;
      lg.gain.value = o.vib;
      l.connect(lg).connect(osc.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const vol = o.vol ?? 0.1;
    const att = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private hiss(dur: number, o: { vol?: number; freq?: number; to?: number; q?: number; type?: BiquadFilterType; at?: number; pan?: number; music?: boolean; attack?: number } = {}): AudioBufferSourceNode | null {
    const c = this.a;
    const out = this.bus(o.pan, o.music);
    if (!c || !out || !this.noiseBuf) return null;
    const t = (o.music ? 0 : c.currentTime) + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = o.type ?? 'bandpass';
    fl.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    fl.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    const vol = o.vol ?? 0.15;
    if (o.attack) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + o.attack);
    } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  // ---------------------------------------------------------------- effects

  throwBall(big = false): void {
    this.hiss(0.16, { freq: big ? 700 : 1400, to: big ? 1600 : 3400, q: 1.4, vol: big ? 0.2 : 0.13, attack: 0.02 });
    this.osc(big ? 160 : 330, 0.08, { to: big ? 90 : 200, vol: 0.05 });
  }

  /** A snowball landing in snow or on a wall. */
  splat(pan: number, soft = false): void {
    this.hiss(soft ? 0.12 : 0.16, { freq: 650, to: 260, q: 0.6, vol: soft ? 0.07 : 0.14, pan });
    this.osc(150, 0.09, { to: 70, vol: soft ? 0.04 : 0.08, pan });
  }

  /** A snowball cracking on the ice. */
  clink(pan: number): void {
    this.osc(1800, 0.12, { type: 'triangle', to: 1500, vol: 0.05, pan });
    this.hiss(0.1, { freq: 3500, q: 2, vol: 0.05, pan });
  }

  /** Snow sliding off a hit pine. */
  treeFlump(pan: number): void {
    this.hiss(0.45, { freq: 900, to: 300, q: 0.5, vol: 0.1, pan, attack: 0.03 });
  }

  /** A snowman bursting: poof, the carrot popping off, a little boing. */
  poof(pan: number, size = 1): void {
    const p = 0.9 + Math.random() * 0.25;
    this.hiss(0.35 * size, { freq: 2600, to: 320, q: 0.5, vol: 0.26, type: 'lowpass', pan });
    this.osc(520 * p, 0.07, { to: 1150 * p, vol: 0.14, pan });
    this.osc(270 * p, 0.32, { type: 'triangle', to: 560 * p, vol: 0.07, at: 0.06, vib: 35, vibRate: 22, pan });
  }

  /** A little rising chime for every hit in a row. */
  streakNote(n: number): void {
    const semis = PENTA[Math.min(PENTA.length - 1, n)]!;
    const fr = 660 * Math.pow(2, semis / 12);
    this.osc(fr, 0.32, { vol: 0.07 });
    this.osc(fr * 2, 0.18, { type: 'triangle', vol: 0.025 });
  }

  bigHit(pan: number): void {
    this.hiss(0.2, { freq: 900, to: 300, q: 0.7, vol: 0.2, pan });
    this.osc(200, 0.15, { type: 'triangle', to: 120, vol: 0.12, pan });
  }

  playerHit(): void {
    this.hiss(0.3, { freq: 900, to: 220, q: 0.6, vol: 0.32 });
    this.osc(520, 0.24, { type: 'square', to: 170, vol: 0.05 });
    this.osc(120, 0.2, { to: 60, vol: 0.18 });
  }

  windup(pan: number, dur: number, big = false): void {
    this.osc(big ? 300 : 520, dur, { to: big ? 600 : 980, vol: 0.03, attack: dur * 0.6, pan, type: big ? 'triangle' : 'sine' });
  }

  enemyThrow(pan: number, big = false): void {
    this.hiss(0.18, { freq: big ? 600 : 1000, to: big ? 1400 : 2400, q: 1.2, vol: 0.09, pan, attack: 0.02 });
  }

  /** Two snowballs hitting each other in the air. */
  crack(pan: number): void {
    this.osc(900, 0.1, { type: 'triangle', to: 1400, vol: 0.08, pan });
    this.hiss(0.15, { freq: 2200, q: 1, vol: 0.12, pan });
  }

  pickup(): void {
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => this.osc(f(n), 0.18, { type: 'triangle', vol: 0.07, at: i * 0.06 }));
  }

  cocoa(): void {
    this.osc(220, 0.12, { to: 140, vol: 0.12 });
    this.osc(240, 0.12, { to: 150, vol: 0.12, at: 0.13 });
    ['G5', 'B5', 'D6', 'G6'].forEach((n, i) => this.osc(f(n), 0.25, { type: 'triangle', vol: 0.06, at: 0.25 + i * 0.07 }));
  }

  cookie(): void {
    this.osc(f('E6'), 0.1, { type: 'triangle', vol: 0.06 });
    this.osc(f('A6'), 0.16, { type: 'triangle', vol: 0.06, at: 0.07 });
    this.hiss(0.08, { freq: 3000, q: 1.5, vol: 0.05, at: 0.02 });
  }

  power(): void {
    ['C5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => this.osc(f(n), 0.22, { type: 'square', vol: 0.035, at: i * 0.05 }));
    this.bells(0.5, 0.05);
  }

  empty(): void {
    this.osc(240, 0.05, { type: 'square', vol: 0.03 });
  }

  reload(): void {
    this.hiss(0.05, { freq: 2600, q: 2, vol: 0.025 });
  }

  jump(): void {
    this.osc(280, 0.12, { to: 440, vol: 0.05 });
  }

  land(hard: boolean): void {
    this.hiss(hard ? 0.12 : 0.07, { freq: 500, q: 0.6, vol: hard ? 0.12 : 0.06 });
  }

  step(): void {
    this.hiss(0.06, { freq: 1900 + Math.random() * 1400, q: 1.8, vol: 0.022 });
  }

  spawn(pan: number): void {
    this.osc(180, 0.25, { type: 'triangle', to: 420, vol: 0.05, pan });
    this.hiss(0.25, { freq: 500, to: 1500, q: 0.7, vol: 0.06, pan });
  }

  bells(dur = 0.6, vol = 0.04): void {
    const n = Math.round(dur / 0.07);
    for (let i = 0; i < n; i++) this.hiss(0.06, { freq: 7500 + Math.random() * 2500, q: 3, vol: vol * (1 - i / n), at: i * 0.07 + Math.random() * 0.02, type: 'bandpass' });
  }

  waveStart(): void {
    ['G4', 'C5', 'E5', 'G5'].forEach((n, i) => this.osc(f(n), 0.3, { type: 'triangle', vol: 0.08, at: i * 0.11 }));
    this.osc(f('C6'), 0.6, { type: 'triangle', vol: 0.08, at: 0.44 });
    this.bells(0.9, 0.05);
  }

  waveClear(): void {
    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => this.osc(f(n), 0.25, { type: 'triangle', vol: 0.07, at: i * 0.07 }));
    this.bells(1.0, 0.05);
  }

  bossRoar(): void {
    this.osc(95, 1.0, { type: 'sawtooth', to: 62, vol: 0.07, attack: 0.1, vib: 8, vibRate: 7 });
    this.osc(142, 1.0, { type: 'triangle', to: 90, vol: 0.06, attack: 0.1 });
    this.hiss(1.1, { freq: 160, q: 0.6, vol: 0.3, type: 'lowpass', attack: 0.1 });
  }

  stomp(): void {
    this.osc(150, 0.35, { to: 38, vol: 0.5 });
    this.hiss(0.7, { freq: 220, to: 90, q: 0.5, vol: 0.32, type: 'lowpass' });
  }

  bossHurt(pan: number): void {
    this.osc(1320, 0.3, { type: 'triangle', vol: 0.09, pan });
    this.osc(1980, 0.22, { type: 'sine', vol: 0.05, pan });
    this.hiss(0.3, { freq: 2200, to: 400, q: 0.6, vol: 0.22, type: 'lowpass', pan });
    this.osc(220, 0.4, { type: 'triangle', to: 120, vol: 0.08, vib: 25, vibRate: 14, at: 0.05, pan });
  }

  bossBlock(pan: number): void {
    this.osc(240, 0.12, { type: 'square', to: 200, vol: 0.04, pan });
    this.hiss(0.12, { freq: 800, q: 0.8, vol: 0.1, pan });
  }

  firework(pan: number): void {
    this.hiss(0.08, { freq: 1500, q: 1, vol: 0.1, pan });
    for (let i = 0; i < 8; i++) this.hiss(0.04, { freq: 4000 + Math.random() * 3000, q: 2, vol: 0.04, at: 0.1 + Math.random() * 0.5, pan });
  }

  victory(): void {
    const seq: [string, number, number][] = [
      ['G4', 0, 0.2],
      ['C5', 0.18, 0.2],
      ['E5', 0.36, 0.2],
      ['G5', 0.54, 0.35],
      ['E5', 0.9, 0.18],
      ['G5', 1.08, 0.9],
    ];
    for (const [n, at, d] of seq) {
      this.osc(f(n), d + 0.1, { type: 'triangle', vol: 0.09, at });
      this.osc(f(n) * 2, d, { type: 'sine', vol: 0.03, at });
    }
    ['C3', 'G3', 'C4'].forEach((n) => this.osc(f(n), 1.9, { type: 'triangle', vol: 0.05, at: 1.08 }));
    this.bells(2.2, 0.05);
  }

  lose(): void {
    (['G4', 'E4', 'C4', 'D4', 'G3'] as const).forEach((n, i) => this.osc(f(n), 0.35, { type: 'triangle', vol: 0.08, at: i * 0.22 }));
  }

  /** A rumbling roll for the giant snowball; returns a stop function. */
  roll(): () => void {
    const c = this.a;
    const out = this.bus(0);
    if (!c || !out || !this.noiseBuf) return () => {};
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 260;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.32, c.currentTime + 0.15);
    src.connect(fl).connect(g).connect(out);
    src.start();
    this.held.add(src);
    return () => {
      if (!this.held.has(src)) return;
      this.held.delete(src);
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.stop(t + 0.35);
    };
  }

  // ---------------------------------------------------------------- music

  setMusic(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.beat = 0;
    if (this.a) this.nextTime = Math.max(this.nextTime, this.a.currentTime + 0.05);
  }

  /** Schedule the next notes a little ahead; called every frame while playing. */
  updateMusic(): void {
    const c = this.a;
    if (!c || this.mode === 'off') return;
    const bpm = this.mode === 'boss' ? 136 : this.mode === 'fight' ? 120 : 100;
    const eighth = 30 / bpm;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.18) {
      this.playStep(this.beat, this.nextTime, eighth);
      this.nextTime += eighth;
      this.beat++;
    }
  }

  private mOsc(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    const c = this.a;
    if (!c || !this.musicBus) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private mNoise(t: number, dur: number, vol: number, freq: number, q = 2, type: BiquadFilterType = 'bandpass'): void {
    const c = this.a;
    if (!c || !this.musicBus || !this.noiseBuf) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = freq;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(this.musicBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private playStep(step: number, t: number, eighth: number): void {
    const boss = this.mode === 'boss';
    const fight = this.mode === 'fight' || boss;
    const chords = boss ? BOSS_CHORDS : CHORDS;
    const barLen = 8;
    const bar = Math.floor(step / barLen) % chords.length;
    const inBar = step % barLen;
    const [bass, chord] = chords[bar]!;
    // oom on the beats 1 and 3, pah on 2 and 4
    if (inBar === 0 || inBar === 4) {
      const bf = f(bass) * (inBar === 4 && !boss ? 1.5 : 1);
      this.mOsc(bf, t, eighth * 1.8, 0.16, 'triangle');
    }
    if (boss && (inBar === 2 || inBar === 6)) this.mOsc(f(bass) * 2, t, eighth * 0.9, 0.09, 'triangle');
    if (inBar === 2 || inBar === 6) for (const n of chord) this.mOsc(f(n), t, eighth * 0.9, 0.035, 'triangle');
    // melody: one note per beat
    if (inBar % 2 === 0) {
      const section = Math.floor(step / (barLen * chords.length)) % 2;
      const mel = boss ? BOSS_MELODY : section === 0 ? MELODY : MELODY_B;
      const idx = (Math.floor(step / 2) % mel.length) | 0;
      const n = mel[idx]!;
      if (n !== '-' && (this.mode !== 'calm' || section === 0)) {
        const hold = mel[(idx + 1) % mel.length] === '-' ? 2 : 1;
        const vol = this.mode === 'calm' ? 0.05 : 0.065;
        this.mOsc(f(n), t, eighth * 2 * hold * 1.4, vol, 'sine');
        this.mOsc(f(n) * 2, t, eighth * 1.2, vol * 0.3, 'sine');
      }
    }
    // sleigh bells
    if (fight || inBar % 2 === 0) this.mNoise(t, 0.05, inBar % 2 === 0 ? 0.03 : 0.018, 8200, 3);
    // soft drums in battle
    if (fight) {
      if (inBar === 0 || inBar === 4 || (boss && inBar === 7)) {
        this.mOsc(140, t, 0.2, 0.22, 'sine');
      }
      if (inBar === 2 || inBar === 6) this.mNoise(t, 0.12, 0.05, 1800, 0.8);
    }
  }
}
