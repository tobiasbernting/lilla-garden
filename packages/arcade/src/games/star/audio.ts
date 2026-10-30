// Stjärnstorm's sound: a synthwave loop (pumping bass, arpeggios with an echo, a pad, drums and a
// lead for the boss) and the effects. Everything goes through one bus so pause and destroy can
// silence it at once.

export type Sfx =
  | 'twin'
  | 'spread'
  | 'homing'
  | 'hit'
  | 'tink'
  | 'pop'
  | 'boom'
  | 'huge'
  | 'star'
  | 'power'
  | 'shieldUp'
  | 'shieldBreak'
  | 'bomb'
  | 'hurt'
  | 'warn'
  | 'stab'
  | 'chain'
  | 'life'
  | 'enemyShot'
  | 'bonus'
  | 'whoosh'
  | 'firework'
  | 'charge'
  | 'beam'
  | 'crack';

export type Section = 'intro' | 's1' | 's1b' | 's2' | 's2b' | 's3' | 's3b' | 'boss' | 'win' | 'over';

/** What the game needs from the sound (a silent stand-in is used when there is no audio). */
export interface SoundApi {
  play(name: Sfx, arg?: number): void;
  laser(on: boolean): void;
  section(s: Section): void;
  /** 0..1: how hard the last kick drum still glows (for pulsing visuals). */
  pulse(): number;
  update(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export const silentSound: SoundApi = {
  play: () => {},
  laser: () => {},
  section: () => {},
  pulse: () => 0,
  update: () => {},
  pause: () => {},
  resume: () => {},
  destroy: () => {},
};

const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  bass: number;
  tones: number[];
}
const CH: Record<string, Chord> = {
  Am: { bass: 45, tones: [57, 60, 64, 69] },
  F: { bass: 41, tones: [57, 60, 65, 69] },
  C: { bass: 48, tones: [55, 60, 64, 67] },
  G: { bass: 43, tones: [55, 59, 62, 67] },
  Dm: { bass: 38, tones: [57, 62, 65, 69] },
  Bb: { bass: 46, tones: [58, 62, 65, 70] },
  E: { bass: 40, tones: [56, 59, 64, 68] },
  Em: { bass: 40, tones: [55, 59, 64, 67] },
  D: { bass: 38, tones: [57, 62, 66, 69] },
  Cmaj: { bass: 36, tones: [60, 64, 67, 72] },
  Gmaj: { bass: 43, tones: [59, 62, 67, 71] },
  Am2: { bass: 45, tones: [60, 64, 69, 72] },
  Fmaj: { bass: 41, tones: [60, 65, 69, 72] },
};

interface Sec {
  bpm: number;
  chords: Chord[];
  /** 0 none, 1 kick + hats, 2 + snare, 3 + sixteenth hats and open hats. */
  drums: number;
  /** 0 none, 1 eighth-note pump, 2 driving octaves. */
  bass: number;
  arp: number[] | null;
  pad: boolean;
  /** One note per eighth over the four bars (0 = rest). */
  lead: number[] | null;
  bright: number;
  vol: number;
}

const ARP_UP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
const ARP_ROLL = [0, 2, 1, 3, 0, 2, 1, 3, 1, 3, 2, 0, 1, 3, 2, 3];
const ARP_DRIVE = [0, 1, 2, 3, 1, 2, 3, 2, 0, 1, 2, 3, 1, 3, 2, 3];
const ARP_SOFT = [0, -1, 2, -1, 1, -1, 3, -1, 0, -1, 2, -1, 1, -1, 3, 2];

// the boss: A minor going down to E (a dramatic run home)
const LEAD_BOSS = [69, 0, 72, 76, 74, 72, 71, 72, 71, 0, 74, 79, 77, 76, 74, 71, 69, 0, 72, 77, 76, 74, 72, 69, 68, 0, 71, 76, 74, 0, 71, 68];
const LEAD_S3 = [76, 0, 0, 79, 0, 0, 83, 0, 79, 0, 0, 76, 0, 0, 74, 0, 74, 0, 0, 78, 0, 0, 81, 0, 78, 0, 74, 0, 76, 0, 0, 0];
const LEAD_WIN = [72, 76, 79, 84, 83, 79, 76, 79, 74, 79, 83, 86, 84, 83, 79, 83, 76, 81, 84, 88, 86, 84, 81, 84, 77, 81, 84, 89, 88, 84, 81, 0];

const SECTIONS: Record<Section, Sec> = {
  intro: { bpm: 112, chords: [CH.Am!, CH.F!, CH.C!, CH.G!], drums: 0, bass: 0, arp: ARP_SOFT, pad: true, lead: null, bright: 900, vol: 0.9 },
  s1: { bpm: 116, chords: [CH.Am!, CH.F!, CH.C!, CH.G!], drums: 1, bass: 1, arp: ARP_UP, pad: true, lead: null, bright: 1700, vol: 1 },
  s1b: { bpm: 116, chords: [CH.Am!, CH.F!, CH.C!, CH.G!], drums: 2, bass: 2, arp: ARP_DRIVE, pad: true, lead: null, bright: 2600, vol: 1 },
  s2: { bpm: 120, chords: [CH.Dm!, CH.Bb!, CH.F!, CH.C!], drums: 2, bass: 1, arp: ARP_ROLL, pad: true, lead: null, bright: 2000, vol: 1 },
  s2b: { bpm: 120, chords: [CH.Dm!, CH.Bb!, CH.F!, CH.C!], drums: 3, bass: 2, arp: ARP_DRIVE, pad: true, lead: null, bright: 3000, vol: 1 },
  s3: { bpm: 124, chords: [CH.Em!, CH.C!, CH.G!, CH.D!], drums: 2, bass: 2, arp: ARP_ROLL, pad: true, lead: LEAD_S3, bright: 2600, vol: 1 },
  s3b: { bpm: 124, chords: [CH.Em!, CH.C!, CH.G!, CH.D!], drums: 3, bass: 2, arp: ARP_DRIVE, pad: true, lead: LEAD_S3, bright: 3400, vol: 1 },
  boss: { bpm: 132, chords: [CH.Am!, CH.G!, CH.F!, CH.E!], drums: 3, bass: 2, arp: ARP_DRIVE, pad: true, lead: LEAD_BOSS, bright: 4200, vol: 1.05 },
  win: { bpm: 120, chords: [CH.Cmaj!, CH.Gmaj!, CH.Am2!, CH.Fmaj!], drums: 2, bass: 1, arp: ARP_UP, pad: true, lead: LEAD_WIN, bright: 3200, vol: 1 },
  over: { bpm: 90, chords: [CH.Am!, CH.F!, CH.Am!, CH.E!], drums: 0, bass: 0, arp: ARP_SOFT, pad: true, lead: null, bright: 700, vol: 0.7 },
};

const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
/** The game's overall loudness after the compressor. */
const LEVEL = 1.25;

const MIN_GAP: Partial<Record<Sfx, number>> = {
  twin: 0.07,
  spread: 0.07,
  homing: 0.09,
  hit: 0.035,
  tink: 0.07,
  pop: 0.03,
  star: 0.035,
  enemyShot: 0.08,
  boom: 0.08,
  chain: 0.1,
  firework: 0.12,
};

export class Sound implements SoundApi {
  private bus: GainNode;
  private musicBus: GainNode;
  private sfxBus: GainNode;
  private echo: GainNode;
  private noiseBuf: AudioBuffer;
  private last = new Map<Sfx, number>();
  private kicks: number[] = [];
  private laserNodes: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private dead = false;
  // sequencer
  private sec: Sec = SECTIONS.intro;
  private pending: Sec | null = null;
  private step = 0;
  private next = 0;
  private playing = true;

  constructor(
    private a: AudioContext,
    out: AudioNode,
    private low: boolean,
  ) {
    this.bus = a.createGain();
    this.bus.gain.value = LEVEL;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.bus);
    this.bus.connect(out);
    this.musicBus = a.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(comp);
    this.sfxBus = a.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(comp);
    // a dotted-eighth echo for the arpeggio and the lead
    this.echo = a.createGain();
    const delay = a.createDelay(1.5);
    delay.delayTime.value = (60 / 116) * 0.75;
    const fb = a.createGain();
    fb.gain.value = 0.34;
    const damp = a.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    const wet = a.createGain();
    wet.gain.value = 0.36;
    this.echo.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(wet);
    wet.connect(this.musicBus);
    this.echoDelay = delay;

    const len = Math.floor(a.sampleRate * 1.5);
    this.noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.next = a.currentTime + 0.08;
  }

  private echoDelay: DelayNode;

  // ---- building blocks ----

  private osc(
    type: OscillatorType,
    f: number,
    t: number,
    dur: number,
    vol: number,
    dest: AudioNode,
    o: { to?: number; attack?: number; detune?: number; lp?: number; lpTo?: number; q?: number; hold?: number } = {},
  ): void {
    const a = this.a;
    const osc = a.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = a.createGain();
    const att = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + att);
    if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, vol), t + att + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f2 = a.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f2.frequency.exponentialRampToValueAtTime(Math.max(40, o.lpTo), t + dur);
      f2.Q.value = o.q ?? 0.8;
      osc.connect(f2);
      node = f2;
    }
    node.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(
    t: number,
    dur: number,
    vol: number,
    dest: AudioNode,
    o: { type?: BiquadFilterType; f?: number; to?: number; q?: number; attack?: number } = {},
  ): void {
    const a = this.a;
    const src = a.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f ?? 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + dur);
    f.Q.value = o.q ?? 0.9;
    const g = a.createGain();
    const att = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.03);
  }

  // ---- effects ----

  play(name: Sfx, arg = 0): void {
    if (this.dead) return;
    const a = this.a;
    const t = a.currentTime + 0.005;
    const gap = MIN_GAP[name];
    if (gap) {
      const l = this.last.get(name) ?? -1;
      if (t - l < gap) return;
      this.last.set(name, t);
    }
    const o = this.sfxBus;
    const r = (x: number): number => x * (0.94 + Math.random() * 0.12);
    switch (name) {
      case 'twin':
        this.osc('square', r(1500), t, 0.05, 0.02, o, { to: 640 });
        break;
      case 'spread':
        this.osc('triangle', r(1150), t, 0.06, 0.035, o, { to: 480 });
        break;
      case 'homing':
        this.osc('sine', r(700), t, 0.09, 0.035, o, { to: 1600 });
        break;
      case 'hit':
        this.noise(t, 0.035, 0.05, o, { f: r(3600), q: 1.6 });
        break;
      case 'tink':
        this.osc('triangle', r(2600), t, 0.05, 0.03, o, { to: 2100 });
        break;
      case 'pop': {
        const s = Math.min(1, arg);
        this.noise(t, 0.12 + s * 0.22, 0.14 + s * 0.12, o, { f: r(1700 - s * 900), q: 0.8 });
        this.osc('sine', r(520 - s * 220), t, 0.13 + s * 0.2, 0.16, o, { to: 70 });
        break;
      }
      case 'boom':
        this.noise(t, 0.75, 0.38, o, { type: 'lowpass', f: 1100, to: 160 });
        this.osc('sine', 120, t, 0.6, 0.42, o, { to: 30 });
        this.noise(t, 0.22, 0.14, o, { f: 2600, q: 1 });
        break;
      case 'huge':
        this.noise(t, 2.4, 0.5, o, { type: 'lowpass', f: 900, to: 90 });
        this.osc('sine', 90, t, 1.6, 0.55, o, { to: 24 });
        this.noise(t, 0.4, 0.25, o, { f: 3000, q: 0.7 });
        for (let i = 0; i < 10; i++) this.osc('triangle', hz(PENTA[i % PENTA.length]!), t + 0.25 + i * 0.11, 0.35, 0.035, o);
        break;
      case 'star': {
        const n = PENTA[Math.min(PENTA.length - 1, Math.max(0, Math.floor(arg)))]!;
        this.osc('triangle', hz(n), t, 0.09, 0.04, o);
        this.osc('sine', hz(n + 12), t, 0.07, 0.016, o);
        break;
      }
      case 'power':
        [72, 76, 79, 84, 88].forEach((n, i) => this.osc('square', hz(n), t + i * 0.055, 0.11, 0.035, o, { lp: 3000 }));
        break;
      case 'shieldUp':
        this.osc('sine', 300, t, 0.3, 0.08, o, { to: 900 });
        this.osc('triangle', 600, t + 0.04, 0.3, 0.035, o, { to: 1800 });
        break;
      case 'shieldBreak':
        this.noise(t, 0.28, 0.16, o, { type: 'highpass', f: 2500 });
        this.osc('triangle', 1200, t, 0.32, 0.08, o, { to: 260 });
        break;
      case 'bomb':
        this.noise(t, 0.8, 0.42, o, { f: 180, to: 3600, q: 0.7, attack: 0.02 });
        this.osc('sine', 150, t, 1.0, 0.55, o, { to: 26 });
        this.noise(t + 0.05, 1.3, 0.22, o, { type: 'lowpass', f: 600, to: 80 });
        for (let i = 0; i < 6; i++) this.osc('triangle', hz(PENTA[3 + (i % 6)]!), t + 0.15 + i * 0.07, 0.25, 0.03, o);
        break;
      case 'hurt':
        this.osc('square', 720, t, 0.55, 0.1, o, { to: 80, lp: 2400 });
        this.noise(t, 0.5, 0.28, o, { type: 'lowpass', f: 1400, to: 200 });
        break;
      case 'warn':
        for (let i = 0; i < 6; i++) this.osc('square', i % 2 ? 660 : 880, t + i * 0.17, 0.15, 0.045, o, { lp: 2400, hold: 0.1 });
        break;
      case 'stab':
        for (const n of [57, 60, 64, 69]) this.osc('sawtooth', hz(n + 12), t, 0.6, 0.03, o, { lp: 2600, lpTo: 500, detune: Math.random() * 14 - 7 });
        break;
      case 'chain': {
        const n = PENTA[Math.min(PENTA.length - 1, Math.floor(arg))]!;
        this.osc('square', hz(n - 12), t, 0.07, 0.03, o, { lp: 3000 });
        this.osc('square', hz(n), t + 0.06, 0.1, 0.03, o, { lp: 3000 });
        break;
      }
      case 'life':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.osc('square', hz(n), t + i * 0.08, 0.14, 0.04, o, { lp: 3200 }));
        break;
      case 'enemyShot':
        this.osc('sine', r(560), t, 0.08, 0.03, o, { to: 260 });
        break;
      case 'bonus':
        this.osc('sine', hz(88), t, 0.5, 0.05, o);
        this.osc('sine', hz(95), t + 0.07, 0.5, 0.04, o);
        this.osc('triangle', hz(100), t + 0.14, 0.4, 0.025, o);
        break;
      case 'whoosh':
        this.noise(t, 1.3, 0.2, o, { f: 260, to: 5200, q: 0.8, attack: 0.25 });
        this.osc('sine', 70, t, 1.2, 0.12, o, { to: 220, attack: 0.3 });
        break;
      case 'firework':
        this.noise(t, 0.35, 0.16, o, { type: 'highpass', f: 1800 });
        this.osc('triangle', hz(PENTA[Math.floor(Math.random() * PENTA.length)]!), t + 0.02, 0.3, 0.03, o);
        break;
      case 'charge':
        this.osc('sawtooth', 120, t, 0.8, 0.05, o, { to: 900, lp: 1500, attack: 0.3 });
        break;
      case 'beam':
        this.noise(t, 0.6, 0.18, o, { f: 600, q: 1.2 });
        this.osc('sawtooth', 70, t, 0.6, 0.08, o, { lp: 700 });
        break;
      case 'crack':
        this.noise(t, 0.5, 0.35, o, { type: 'highpass', f: 1500 });
        this.osc('square', 300, t, 0.5, 0.08, o, { to: 60, lp: 1500 });
        this.noise(t, 1.2, 0.3, o, { type: 'lowpass', f: 500, to: 80 });
        break;
    }
  }

  laser(on: boolean): void {
    if (this.dead) return;
    const a = this.a;
    if (!this.laserNodes) {
      if (!on) return;
      const gain = a.createGain();
      gain.gain.value = 0;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.Q.value = 3;
      const o1 = a.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 110;
      const o2 = a.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 220.7;
      const lfo = a.createOscillator();
      lfo.frequency.value = 13;
      const lfoGain = a.createGain();
      lfoGain.gain.value = 420;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(gain);
      gain.connect(this.sfxBus);
      o1.start();
      o2.start();
      lfo.start();
      this.laserNodes = { oscs: [o1, o2, lfo], gain };
    }
    this.laserNodes.gain.gain.setTargetAtTime(on ? 0.035 : 0, a.currentTime, 0.03);
  }

  // ---- music ----

  section(s: Section): void {
    const next = SECTIONS[s];
    if (next === this.sec && !this.pending) return;
    this.pending = next;
  }

  pulse(): number {
    if (this.dead) return 0;
    const now = this.a.currentTime;
    let best = -1;
    for (const k of this.kicks) if (k <= now && k > best) best = k;
    if (best < 0) return 0;
    return Math.exp(-(now - best) * 7);
  }

  update(): void {
    if (this.dead || !this.playing) return;
    const now = this.a.currentTime;
    // a suspended context or a long stall: skip ahead instead of playing a pile of notes at once
    if (this.next < now - 0.08) this.next = now + 0.05;
    while (this.next < now + 0.13) {
      if (this.step % 16 === 0 && this.pending) {
        this.sec = this.pending;
        this.pending = null;
        this.step = 0;
        this.echoDelay.delayTime.setValueAtTime((60 / this.sec.bpm) * 0.75, this.next);
      }
      this.schedule(this.step, this.next);
      this.next += 60 / this.sec.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private schedule(step: number, t: number): void {
    const s = this.sec;
    const m = this.musicBus;
    const bar = Math.floor(step / 16) % s.chords.length;
    const chord = s.chords[bar]!;
    const i16 = step % 16;
    const beat = 60 / s.bpm;
    const v = s.vol;
    // drums
    if (s.drums >= 1) {
      if (i16 % 4 === 0) {
        this.osc('sine', 150, t, 0.32, 0.75 * v, m, { to: 42 });
        this.noise(t, 0.02, 0.12 * v, m, { type: 'highpass', f: 3000 });
        this.kicks.push(t);
        if (this.kicks.length > 8) this.kicks.shift();
      }
      const hat16 = s.drums >= 3;
      if (i16 % 2 === 0 || hat16) {
        const accent = i16 % 2 === 0 ? 1 : 0.55;
        this.noise(t, 0.035, 0.05 * accent * v, m, { type: 'highpass', f: 7500 });
      }
      if (s.drums >= 3 && i16 % 4 === 2) this.noise(t, 0.2, 0.045 * v, m, { type: 'highpass', f: 6000 });
      if (s.drums >= 2 && (i16 === 4 || i16 === 12)) {
        this.noise(t, 0.2, 0.26 * v, m, { f: 1900, q: 0.6 });
        this.osc('triangle', 210, t, 0.11, 0.18 * v, m, { to: 140 });
      }
      // a little fill at the end of every fourth bar
      if (s.drums >= 2 && step >= 60) this.noise(t, 0.09, 0.14 * v, m, { f: 2200 + (step - 60) * 400, q: 0.8 });
    } else if (s === SECTIONS.intro && step >= 56 && i16 % 2 === 0) {
      // the intro builds up into the first sector
      this.osc('sine', 150, t, 0.25, 0.3 + (step - 56) * 0.04, m, { to: 45 });
    }
    // bass
    if (s.bass >= 1 && i16 % 2 === 0) {
      const eighth = i16 / 2;
      const oct = s.bass >= 2 ? eighth % 2 === 1 : eighth === 3 || eighth === 7;
      const n = chord.bass + (oct ? 12 : 0);
      this.osc('sawtooth', hz(n), t, beat * 0.45, 0.13 * v, m, { lp: s.bright * 0.5, lpTo: 180, q: 4 });
      this.osc('square', hz(n - 12), t, beat * 0.42, 0.06 * v, m, { lp: 400 });
    }
    // arpeggio
    if (s.arp) {
      const idx = s.arp[i16]!;
      if (idx >= 0) {
        const n = chord.tones[idx % chord.tones.length]! + 12;
        const vol = (i16 % 4 === 0 ? 0.06 : 0.045) * v;
        this.osc(this.low ? 'square' : 'sawtooth', hz(n), t, beat * 0.22, vol, m, { lp: s.bright, lpTo: s.bright * 0.35, q: 2 });
        this.osc('square', hz(n), t, beat * 0.2, vol * 0.5, this.echo, { lp: s.bright });
      }
    }
    // pad: one long chord per bar
    if (s.pad && i16 === 0) {
      const dur = beat * 4;
      for (const n of chord.tones.slice(0, 3)) {
        for (const det of this.low ? [0] : [-9, 9]) this.osc('sawtooth', hz(n), t, dur, 0.022 * v, m, { attack: beat * 0.8, detune: det, lp: 1100, hold: dur * 0.5 });
      }
    }
    // lead
    if (s.lead && i16 % 2 === 0) {
      const n = s.lead[Math.floor(step / 2) % s.lead.length]!;
      if (n > 0) {
        this.osc('sawtooth', hz(n), t, beat * 0.48, 0.05 * v, m, { lp: 3200, lpTo: 1400, attack: 0.01, detune: 4 });
        this.osc('square', hz(n), t, beat * 0.44, 0.03 * v, this.echo, { lp: 2600, detune: -6 });
      }
    }
  }

  pause(): void {
    if (this.dead) return;
    this.playing = false;
    this.bus.gain.setTargetAtTime(0, this.a.currentTime, 0.015);
  }

  resume(): void {
    if (this.dead) return;
    this.playing = true;
    this.next = this.a.currentTime + 0.06;
    this.bus.gain.cancelScheduledValues(this.a.currentTime);
    this.bus.gain.setTargetAtTime(LEVEL, this.a.currentTime + 0.02, 0.03);
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    if (this.laserNodes) {
      for (const o of this.laserNodes.oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    try {
      this.bus.gain.setValueAtTime(0, this.a.currentTime);
      this.bus.disconnect();
    } catch {
      /* the context may already be closed */
    }
  }
}
