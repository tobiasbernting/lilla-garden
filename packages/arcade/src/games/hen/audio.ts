// A tiny pocket-console sound chip: two pulse channels with real duty cycles, an LFSR noise channel for
// the drums, a look-ahead sequencer for the tunes and a box of sound effects. Everything plays into the
// arcade's `out` node and stops on pause.
import { SONGS, JINGLES, type Song } from './music.ts';

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C5', 'F#4', 'Bb3' → Hz. */
export function freq(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const semi = NOTE[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Ev {
  step: number;
  hz: number;
  len: number;
}

interface Parsed {
  song: Song;
  len: number;
  lead: Ev[][];
  bass: Ev[][];
  drums: string[];
}

function parseVoice(src: string, len: number, transpose: number): Ev[][] {
  const tokens = src.split(/\s+/).filter((t) => t && t !== '|');
  const out: Ev[][] = Array.from({ length: len }, () => []);
  let cur: Ev | null = null;
  tokens.forEach((t, i) => {
    if (i >= len) return;
    if (t === '-') {
      if (cur) cur.len++;
      return;
    }
    if (t === '.') {
      cur = null;
      return;
    }
    const hz = freq(t) * Math.pow(2, transpose / 12);
    cur = { step: i, hz, len: 1 };
    out[i]!.push(cur);
  });
  return out;
}

function parse(song: Song): Parsed {
  const count = (s: string): number => s.split(/\s+/).filter((t) => t && t !== '|').length;
  const len = Math.max(count(song.lead), count(song.bass), count(song.drums ?? ''));
  const drums = (song.drums ?? '').split(/\s+/).filter((t) => t && t !== '|');
  return { song, len, lead: parseVoice(song.lead, len, song.transpose ?? 0), bass: parseVoice(song.bass, len, song.transpose ?? 0), drums };
}

export class Chip {
  private ac: AudioContext | null;
  private out: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private waves = new Map<number, PeriodicWave>();
  private noiseBufs: AudioBuffer[] = [];
  private live = new Set<AudioScheduledSourceNode>();
  private cur: Parsed | null = null;
  private loop = true;
  private step = 0;
  private nextTime = 0;
  private paused = false;
  /** When a one-off jingle ends (audio clock), or 0. */
  jingleEnd = 0;
  private parsed = new Map<Song, Parsed>();

  constructor(ac: AudioContext | null, dest: AudioNode | null) {
    this.ac = ac && dest ? ac : null;
    if (!this.ac || !dest) return;
    const a = this.ac;
    // a soft limiter keeps a pile of sounds from clipping
    this.limiter = a.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.limiter.connect(dest);
    this.out = a.createGain();
    this.out.gain.value = 1.0;
    this.out.connect(this.limiter);
    this.musicBus = a.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.out);
    this.sfxBus = a.createGain();
    this.sfxBus.gain.value = 1.5;
    this.sfxBus.connect(this.out);
    for (const d of [0.125, 0.25, 0.5]) this.waves.set(d, this.pulseWave(d));
    // long noise at three "pitches" and the short metallic kind
    this.noiseBufs = [this.lfsr(false, 1), this.lfsr(false, 4), this.lfsr(false, 14), this.lfsr(true, 3)];
  }

  private pulseWave(duty: number): PeriodicWave {
    const a = this.ac!;
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return a.createPeriodicWave(real, imag);
  }

  private lfsr(short: boolean, hold: number): AudioBuffer {
    const a = this.ac!;
    const len = a.sampleRate;
    const b = a.createBuffer(1, len, a.sampleRate);
    const d = b.getChannelData(0);
    let r = 0x7fff;
    let v = 1;
    for (let i = 0; i < len; i++) {
      if (i % hold === 0) {
        const bit = (r ^ (r >> 1)) & 1;
        r = (r >> 1) | (bit << 14);
        if (short) r = (r & ~0x40) | (bit << 6);
        v = r & 1 ? -0.7 : 0.7;
      }
      d[i] = v;
    }
    return b;
  }

  private track(n: AudioScheduledSourceNode): void {
    this.live.add(n);
    n.onended = () => this.live.delete(n);
  }

  /** One pulse note with a little envelope. */
  tone(hz: number, t: number, dur: number, o: { duty?: number; vol?: number; to?: number; bus?: 'music' | 'sfx'; vib?: number; decay?: boolean } = {}): void {
    const a = this.ac;
    if (!a || hz <= 0) return;
    const osc = a.createOscillator();
    osc.setPeriodicWave(this.waves.get(o.duty ?? 0.5) ?? this.waves.get(0.5)!);
    osc.frequency.setValueAtTime(hz, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
    if (o.vib) {
      const lfo = a.createOscillator();
      const depth = a.createGain();
      lfo.frequency.value = o.vib;
      depth.gain.value = hz * 0.03;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      this.track(lfo);
    }
    const g = a.createGain();
    // start silent: a fresh gain is 1, and the first sample could slip through before the envelope
    g.gain.value = 0;
    const vol = o.vol ?? 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    if (o.decay) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else {
      g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.035));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    osc.connect(g).connect(o.bus === 'music' ? this.musicBus! : this.sfxBus!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    this.track(osc);
  }

  /** A burst of chip noise. kind 0 hiss … 2 rumble, 3 metallic. */
  hiss(t: number, dur: number, o: { kind?: number; vol?: number; rate?: number; bus?: 'music' | 'sfx'; swell?: boolean } = {}): void {
    const a = this.ac;
    if (!a) return;
    const src = a.createBufferSource();
    src.buffer = this.noiseBufs[o.kind ?? 0]!;
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    const g = a.createGain();
    g.gain.value = 0;
    const vol = o.vol ?? 0.1;
    if (o.swell) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(g).connect(o.bus === 'music' ? this.musicBus! : this.sfxBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.track(src);
  }

  // ------------------------------------------------------------------ music

  private get(song: Song): Parsed {
    let p = this.parsed.get(song);
    if (!p) {
      p = parse(song);
      this.parsed.set(song, p);
    }
    return p;
  }

  /** Start a level tune (looping). */
  music(i: number): void {
    const song = SONGS[i % SONGS.length]!;
    this.startSong(song, true);
  }

  /** A one-off jingle; returns how long it lasts in seconds. */
  jingle(name: keyof typeof JINGLES): number {
    const song = JINGLES[name];
    this.startSong(song, false);
    const p = this.get(song);
    const dur = (p.len * 60) / song.bpm / song.spb;
    this.jingleEnd = this.ac ? this.ac.currentTime + dur : 0;
    return dur;
  }

  stopMusic(): void {
    this.cur = null;
    this.jingleEnd = 0;
  }

  private startSong(song: Song, loop: boolean): void {
    this.cur = this.get(song);
    this.loop = loop;
    this.step = 0;
    this.nextTime = (this.ac?.currentTime ?? 0) + 0.06;
    // cut what the last tune had queued
    this.silence(true);
  }

  /** Called every frame: queue the next bit of the tune. */
  update(): void {
    const a = this.ac;
    const p = this.cur;
    if (!a || !p || this.paused) return;
    const song = p.song;
    const stepDur = 60 / song.bpm / song.spb;
    const ahead = a.currentTime + 0.14;
    if (this.nextTime < a.currentTime - 0.25) this.nextTime = a.currentTime + 0.02;
    while (this.nextTime < ahead) {
      const t = this.nextTime;
      const s = this.step;
      const swing = song.swing && s % 2 === 1 ? stepDur * song.swing : 0;
      for (const ev of p.lead[s]!)
        this.tone(ev.hz, t + swing, ev.len * stepDur * 0.92, { duty: song.leadDuty, vol: song.leadVol ?? 0.07, bus: 'music', vib: ev.len >= 3 ? 5.5 : 0 });
      for (const ev of p.bass[s]!) this.tone(ev.hz, t + swing, ev.len * stepDur * 0.85, { duty: song.bassDuty, vol: song.bassVol ?? 0.065, bus: 'music' });
      const d = p.drums[s];
      if (d && d !== '.') this.drum(d, t + swing);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= p.len) {
        if (this.loop) this.step = 0;
        else {
          this.cur = null;
          break;
        }
      }
    }
  }

  private drum(d: string, t: number): void {
    for (const c of d) {
      if (c === 'k') {
        this.tone(130, t, 0.11, { duty: 0.5, vol: 0.11, to: 42, bus: 'music', decay: true });
        this.hiss(t, 0.03, { kind: 2, vol: 0.05, bus: 'music' });
      } else if (c === 's') {
        this.hiss(t, 0.13, { kind: 1, vol: 0.07, bus: 'music' });
        this.tone(190, t, 0.04, { duty: 0.5, vol: 0.04, to: 120, bus: 'music', decay: true });
      } else if (c === 'h') this.hiss(t, 0.03, { kind: 0, vol: 0.035, bus: 'music' });
      else if (c === 'o') this.hiss(t, 0.14, { kind: 0, vol: 0.03, bus: 'music' });
      else if (c === 'j') this.hiss(t, 0.06, { kind: 3, vol: 0.03, rate: 1.6, bus: 'music' });
    }
  }

  // ------------------------------------------------------------------ sound effects

  sfx(name: string, n = 0): void {
    const a = this.ac;
    if (!a || this.paused) return;
    const t = a.currentTime + 0.005;
    switch (name) {
      case 'jump':
        this.tone(250, t, 0.12, { duty: 0.125, vol: 0.075, to: 640 });
        break;
      case 'flap':
        this.hiss(t, 0.06, { kind: 1, vol: 0.05, rate: 0.8 });
        this.tone(560, t, 0.05, { duty: 0.25, vol: 0.025, to: 420, decay: true });
        break;
      case 'egg': {
        const up = Math.pow(2, n / 12);
        this.tone(988 * up, t, 0.05, { duty: 0.25, vol: 0.06 });
        this.tone(1319 * up, t + 0.05, 0.1, { duty: 0.25, vol: 0.06, decay: true });
        break;
      }
      case 'gold':
        ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'].forEach((nn, i) => this.tone(freq(nn), t + i * 0.055, 0.12, { duty: 0.25, vol: 0.055, decay: true }));
        this.hiss(t + 0.3, 0.3, { kind: 3, vol: 0.02, rate: 2 });
        break;
      case 'heart':
        ['G5', 'C6', 'E6'].forEach((nn, i) => this.tone(freq(nn), t + 0.36 + i * 0.07, 0.12, { duty: 0.5, vol: 0.05, decay: true }));
        break;
      case 'hurt':
        this.tone(520, t, 0.28, { duty: 0.5, vol: 0.085, to: 110 });
        this.hiss(t, 0.14, { kind: 1, vol: 0.07 });
        break;
      case 'bop': {
        const up = Math.pow(2, Math.min(7, n - 1) / 12 * 2);
        this.tone(200 * up, t, 0.09, { duty: 0.5, vol: 0.09, to: 560 * up });
        this.hiss(t, 0.05, { kind: 2, vol: 0.08 });
        this.tone(900 * up, t + 0.07, 0.08, { duty: 0.25, vol: 0.04, decay: true });
        break;
      }
      case 'checkpoint':
        ['G5', 'B5', 'D6', 'G6'].forEach((nn, i) => this.tone(freq(nn), t + i * 0.075, 0.14, { duty: 0.25, vol: 0.055, decay: true }));
        break;
      case 'spring':
        this.tone(150, t, 0.3, { duty: 0.125, vol: 0.08, to: 900, vib: 18 });
        break;
      case 'boing':
        this.tone(220, t, 0.16, { duty: 0.25, vol: 0.06, to: 620, vib: 14 });
        break;
      case 'land':
        this.hiss(t, 0.05, { kind: 2, vol: 0.06 });
        break;
      case 'bonk':
        this.tone(140, t, 0.07, { duty: 0.5, vol: 0.06, to: 90, decay: true });
        break;
      case 'crumble':
        this.hiss(t, 0.35, { kind: 2, vol: 0.05, rate: 0.7 });
        break;
      case 'caw':
        this.tone(760, t, 0.13, { duty: 0.125, vol: 0.045, to: 560, vib: 32 });
        this.tone(720, t + 0.17, 0.15, { duty: 0.125, vol: 0.04, to: 500, vib: 32 });
        break;
      case 'swoop':
        this.tone(1100, t, 0.35, { duty: 0.125, vol: 0.025, to: 320 });
        break;
      case 'splash':
        this.hiss(t, 0.45, { kind: 1, vol: 0.11, rate: 0.7 });
        this.hiss(t + 0.05, 0.25, { kind: 0, vol: 0.05 });
        break;
      case 'fall':
        this.tone(700, t, 0.55, { duty: 0.25, vol: 0.06, to: 120 });
        break;
      case 'door':
        this.tone(196, t, 0.08, { duty: 0.5, vol: 0.06, decay: true });
        this.tone(147, t + 0.1, 0.12, { duty: 0.5, vol: 0.06, decay: true });
        break;
      case 'wind':
        this.hiss(t, 2.6, { kind: 0, vol: 0.035, rate: 0.35, swell: true });
        break;
      case 'wake':
        this.tone(600, t, 0.06, { duty: 0.25, vol: 0.05 });
        this.tone(900, t + 0.07, 0.09, { duty: 0.25, vol: 0.05, decay: true });
        break;
      case 'tick':
        this.tone(1568, t, 0.025, { duty: 0.25, vol: 0.03, decay: true });
        break;
      case 'bigtick':
        this.tone(1046, t, 0.08, { duty: 0.25, vol: 0.05, decay: true });
        this.tone(1568, t + 0.06, 0.1, { duty: 0.25, vol: 0.05, decay: true });
        break;
      case 'blip':
        this.tone(880, t, 0.04, { duty: 0.5, vol: 0.04, decay: true });
        break;
    }
  }

  /** Stop every sound now. With `keepSong` the tune carries on from where it is (on resume). */
  private silence(keepSong: boolean): void {
    for (const n of this.live) {
      try {
        n.onended = null;
        n.stop();
      } catch {
        // already stopped
      }
    }
    this.live.clear();
    if (!keepSong) this.cur = null;
  }

  pause(): void {
    this.paused = true;
    this.silence(true);
  }

  resume(): void {
    this.paused = false;
    if (this.ac) this.nextTime = this.ac.currentTime + 0.06;
  }

  destroy(): void {
    this.paused = true;
    this.silence(false);
    this.out?.disconnect();
    this.limiter?.disconnect();
    this.musicBus?.disconnect();
    this.sfxBus?.disconnect();
  }
}
