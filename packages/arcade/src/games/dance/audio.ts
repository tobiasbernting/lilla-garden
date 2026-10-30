// Dansbanan's synthesiser: drums, bass, pads, stabs, arpeggio and two lead voices built from
// oscillators and noise, plus the sound effects (hits, cheers, fireworks). Everything goes through one
// compressor into the arcade's `out`. A "session" is one playing song with its own delay and reverb, so
// the song picker can cut a preview cleanly.
import { near, type Chord, type Ev, type Song, type Voice } from './songs.ts';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface Session {
  song: Song;
  out: GainNode;
  dry: GainNode;
  dly: GainNode;
  vrb: GainNode;
}

type Shape = OscillatorType;

export class Synth {
  readonly a: AudioContext;
  private top: GainNode;
  private comp: DynamicsCompressorNode;
  private music: GainNode;
  private fx: GainNode;
  private noise: AudioBuffer;
  private ir: AudioBuffer;
  private live: { node: AudioScheduledSourceNode; end: number }[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;

  constructor(a: AudioContext, out: AudioNode) {
    this.a = a;
    this.top = a.createGain();
    this.top.gain.value = 0.9;
    this.comp = a.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.music = a.createGain();
    this.music.gain.value = 0.85;
    this.fx = a.createGain();
    this.fx.gain.value = 0.8;
    this.music.connect(this.comp);
    this.fx.connect(this.comp);
    this.comp.connect(this.top);
    this.top.connect(out);
    // one second of white noise for every drum
    const sr = a.sampleRate;
    this.noise = a.createBuffer(1, sr, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // a small hall: decaying stereo noise
    const len = Math.floor(sr * 1.7);
    this.ir = a.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = this.ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4) * (i < sr * 0.01 ? i / (sr * 0.01) : 1);
    }
  }

  get now(): number {
    return this.a.currentTime;
  }

  // ---------------------------------------------------------------- sessions

  /** A new song session; `fadeIn` seconds to come up to full volume. */
  session(song: Song, vol = 1, fadeIn = 0): Session {
    const a = this.a;
    const out = a.createGain();
    out.gain.value = vol;
    if (fadeIn > 0) {
      out.gain.setValueAtTime(0.0001, a.currentTime);
      out.gain.linearRampToValueAtTime(vol, a.currentTime + fadeIn);
    }
    out.connect(this.music);
    const dry = a.createGain();
    dry.connect(out);
    // a dotted-eighth echo
    const dly = a.createGain();
    const delay = a.createDelay(1.5);
    delay.delayTime.value = song.sps * 3;
    const fb = a.createGain();
    fb.gain.value = 0.34;
    const damp = a.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    const wet = a.createGain();
    wet.gain.value = 0.42;
    dly.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(wet);
    wet.connect(out);
    const vrb = a.createGain();
    const conv = a.createConvolver();
    conv.buffer = this.ir;
    const vwet = a.createGain();
    vwet.gain.value = 0.3;
    vrb.connect(conv);
    conv.connect(vwet);
    vwet.connect(out);
    return { song, out, dry, dly, vrb };
  }

  /** Fade a session out and let it go. */
  cut(s: Session, fade = 0.08): void {
    const t = this.a.currentTime;
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setValueAtTime(s.out.gain.value, t);
    s.out.gain.linearRampToValueAtTime(0, t + fade);
    this.later(() => s.out.disconnect(), (fade + 0.3) * 1000);
  }

  /** Quieten (or bring back) the whole game, e.g. while the result card shows. */
  fade(to: number, time = 0.25): void {
    const t = this.a.currentTime;
    this.top.gain.cancelScheduledValues(t);
    this.top.gain.setValueAtTime(this.top.gain.value, t);
    this.top.gain.linearRampToValueAtTime(to * 0.9, t + time);
  }

  dispose(): void {
    this.dead = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    const now = this.a.currentTime;
    for (const l of this.live) {
      if (l.end <= now) continue;
      try {
        l.node.stop();
      } catch {
        // already stopped
      }
    }
    this.live = [];
    try {
      this.top.disconnect();
    } catch {
      // already gone
    }
  }

  private later(fn: () => void, ms: number): void {
    if (this.dead) return;
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  private track(node: AudioScheduledSourceNode, at: number, end: number): void {
    node.start(at);
    node.stop(end);
    this.live.push({ node, end });
    if (this.live.length > 400) {
      const now = this.a.currentTime;
      this.live = this.live.filter((l) => l.end > now);
    }
  }

  // ---------------------------------------------------------------- building blocks

  private osc(shape: Shape, f: number, detune = 0): OscillatorNode {
    const o = this.a.createOscillator();
    o.type = shape;
    o.frequency.value = f;
    if (detune) o.detune.value = detune;
    return o;
  }

  private gain(v = 1): GainNode {
    const g = this.a.createGain();
    g.gain.value = v;
    return g;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.a.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  /** A burst of filtered noise with a quick attack and an exponential fall. */
  private hiss(dest: AudioNode, at: number, dur: number, vol: number, type: BiquadFilterType, f: number, q = 0.7, attack = 0.0015): GainNode {
    const src = this.a.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const fl = this.filter(type, f, q);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(dest);
    this.track(src, at, at + dur + 0.03);
    return g;
  }

  // ---------------------------------------------------------------- the band

  play(s: Session, e: Ev, at: number): void {
    const v = e.v;
    switch (e.inst) {
      case 'kick':
        return this.kick(s.dry, at, v);
      case 'clap':
        return this.clap(s, at, v);
      case 'snare':
        return this.snare(s, at, v);
      case 'hat':
        this.hiss(s.dry, at, 0.045, 0.21 * v, 'highpass', 8200);
        return;
      case 'ohat':
        this.hiss(s.dry, at, 0.24, 0.15 * v, 'highpass', 7600);
        return;
      case 'crash':
        this.hiss(s.dry, at, 1.7, 0.2 * v, 'highpass', 5200);
        this.hiss(s.vrb, at, 1.1, 0.12 * v, 'bandpass', 9000, 0.8);
        return;
      case 'tamb':
        this.hiss(s.dry, at, 0.075, 0.16 * v, 'bandpass', 10500, 1.4, 0.004);
        return;
      case 'tomH':
      case 'tomL':
        return this.tom(s, at, v, e.inst === 'tomH' ? 210 : 140);
      case 'stick':
        return this.stick(s, at, v);
      case 'boom':
        return this.boom(s.dry, at, v);
      case 'riser':
        return this.riser(s, at, e.d, v);
      case 'bass':
        return this.bass(s, at, e.p, e.d, v, s.song.voice);
      case 'pad':
        return this.pad(s, at, e.p, e.d, v);
      case 'stab':
        return this.stab(s, at, e.p, v);
      case 'arp':
        return this.arp(s, at, e.p, e.d, v);
      case 'lead':
        return this.lead(s, at, e.p, e.d, v, s.song.voice);
      case 'lead2':
        return this.lead2(s, at, e.p, e.d, v);
    }
  }

  kick(dest: AudioNode, at: number, v: number): void {
    const o = this.osc('sine', 160);
    o.frequency.setValueAtTime(165, at);
    o.frequency.exponentialRampToValueAtTime(55, at + 0.07);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.3);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.82 * v, at + 0.004);
    g.gain.setTargetAtTime(0.0001, at + 0.05, 0.085);
    o.connect(g);
    g.connect(dest);
    this.track(o, at, at + 0.55);
    this.hiss(dest, at, 0.014, 0.25 * v, 'highpass', 2600);
  }

  private clap(s: Session, at: number, v: number): void {
    const src = this.a.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.filter('bandpass', 1250, 1.1);
    const g = this.gain(0);
    const peak = 0.55 * v;
    g.gain.setValueAtTime(0.0001, at);
    for (const d of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(peak, at + d);
      g.gain.exponentialRampToValueAtTime(peak * 0.25, at + d + 0.009);
    }
    g.gain.setValueAtTime(peak * 0.8, at + 0.031);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.21);
    src.connect(f);
    f.connect(g);
    g.connect(s.dry);
    const send = this.gain(0.45);
    g.connect(send);
    send.connect(s.vrb);
    this.track(src, at, at + 0.24);
  }

  private snare(s: Session, at: number, v: number): void {
    this.hiss(s.dry, at, 0.17, 0.32 * v, 'highpass', 1700);
    const o = this.osc('triangle', 230);
    o.frequency.setValueAtTime(230, at);
    o.frequency.exponentialRampToValueAtTime(165, at + 0.08);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.32 * v, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    o.connect(g);
    g.connect(s.dry);
    this.track(o, at, at + 0.13);
  }

  private tom(s: Session, at: number, v: number, f0: number): void {
    const o = this.osc('sine', f0);
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, at + 0.24);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.55 * v, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    o.connect(g);
    g.connect(s.dry);
    const send = this.gain(0.3);
    g.connect(send);
    send.connect(s.vrb);
    this.track(o, at, at + 0.36);
    this.hiss(s.dry, at, 0.03, 0.12 * v, 'bandpass', 2400);
  }

  private stick(s: Session, at: number, v: number): void {
    for (const [f, vol] of [
      [2500, 0.16],
      [3700, 0.07],
    ] as const) {
      const o = this.osc('triangle', f);
      const g = this.gain(0);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * v, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      o.connect(g);
      g.connect(s.dry);
      this.track(o, at, at + 0.06);
    }
    this.hiss(s.dry, at, 0.025, 0.2 * v, 'bandpass', 3200, 2);
  }

  private boom(dest: AudioNode, at: number, v: number): void {
    const o = this.osc('sine', 90);
    o.frequency.setValueAtTime(95, at);
    o.frequency.exponentialRampToValueAtTime(34, at + 0.8);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5 * v, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    o.connect(g);
    g.connect(dest);
    this.track(o, at, at + 1.15);
  }

  private riser(s: Session, at: number, d: number, v: number): void {
    const src = this.a.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.filter('bandpass', 400, 2.2);
    f.frequency.setValueAtTime(350, at);
    f.frequency.exponentialRampToValueAtTime(7000, at + d);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16 * v, at + d * 0.97);
    g.gain.linearRampToValueAtTime(0.0001, at + d + 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(s.dry);
    const send = this.gain(0.5);
    g.connect(send);
    send.connect(s.vrb);
    this.track(src, at, at + d + 0.06);
  }

  private bass(s: Session, at: number, p: number, d: number, v: number, voice: Voice): void {
    const f = mtof(p);
    const o = this.osc(voice.bass === 'saw' ? 'sawtooth' : 'square', f);
    const body = this.osc('sine', f);
    const lp = this.filter('lowpass', 200, voice.bass === 'saw' ? 6 : 3);
    lp.frequency.setValueAtTime(190, at);
    lp.frequency.exponentialRampToValueAtTime(420 + 1500 * v, at + 0.012);
    lp.frequency.exponentialRampToValueAtTime(300, at + 0.2);
    const g = this.gain(0);
    const peak = (voice.bass === 'saw' ? 0.26 : 0.19) * v;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    g.gain.setTargetAtTime(peak * 0.65, at + 0.01, 0.09);
    g.gain.setTargetAtTime(0.0001, at + d, 0.025);
    const bg = this.gain(0.35);
    o.connect(lp);
    lp.connect(g);
    body.connect(bg);
    bg.connect(g);
    g.connect(s.dry);
    this.track(o, at, at + d + 0.15);
    this.track(body, at, at + d + 0.15);
  }

  private pad(s: Session, at: number, p: number, d: number, v: number): void {
    const f = mtof(p);
    const lp = this.filter('lowpass', 900, 0.6);
    lp.frequency.setValueAtTime(800, at);
    lp.frequency.linearRampToValueAtTime(1700, at + Math.min(1.2, d));
    const g = this.gain(0);
    const peak = 0.042 * v;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.18);
    g.gain.setTargetAtTime(0.0001, at + d, 0.14);
    for (const det of [-9, 9]) {
      const o = this.osc('sawtooth', f, det);
      o.connect(lp);
      this.track(o, at, at + d + 0.8);
    }
    lp.connect(g);
    g.connect(s.dry);
    const send = this.gain(0.55);
    g.connect(send);
    send.connect(s.vrb);
  }

  private stab(s: Session, at: number, p: number, v: number): void {
    const f = mtof(p);
    const lp = this.filter('lowpass', 2400, 1.2);
    lp.frequency.setValueAtTime(3200, at);
    lp.frequency.exponentialRampToValueAtTime(900, at + 0.16);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.055 * v, at + 0.004);
    g.gain.setTargetAtTime(0.0001, at + 0.03, 0.055);
    const o1 = this.osc('sawtooth', f, -6);
    const o2 = this.osc('square', f, 6);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(s.dry);
    const send = this.gain(0.25);
    g.connect(send);
    send.connect(s.vrb);
    this.track(o1, at, at + 0.35);
    this.track(o2, at, at + 0.35);
  }

  private arp(s: Session, at: number, p: number, d: number, v: number): void {
    const o = this.osc('square', mtof(p));
    const lp = this.filter('lowpass', 3000, 2);
    lp.frequency.setValueAtTime(3600, at);
    lp.frequency.exponentialRampToValueAtTime(1100, at + 0.12);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.065 * v, at + 0.003);
    g.gain.setTargetAtTime(0.0001, at + Math.min(d, 0.06), 0.04);
    o.connect(lp);
    lp.connect(g);
    g.connect(s.dry);
    const send = this.gain(0.5);
    g.connect(send);
    send.connect(s.dly);
    this.track(o, at, at + d + 0.25);
  }

  private lead(s: Session, at: number, p: number, d: number, v: number, voice: Voice): void {
    const f = mtof(p);
    const square = voice.lead === 'square';
    const lp = this.filter('lowpass', square ? 2800 : 3000, 1.4);
    if (!square) {
      lp.frequency.setValueAtTime(1400, at);
      lp.frequency.exponentialRampToValueAtTime(3600, at + 0.03);
      lp.frequency.setTargetAtTime(3000, at + 0.05, 0.15);
    }
    const g = this.gain(0);
    const peak = (square ? 0.1 : 0.13) * v;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    g.gain.setTargetAtTime(peak * 0.75, at + 0.02, 0.12);
    g.gain.setTargetAtTime(0.0001, at + d, 0.04);
    // a gentle vibrato that sets in on longer notes
    const lfo = this.osc('sine', 5.6);
    const depth = this.gain(0);
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(d > 0.3 ? 9 : 2, at + Math.min(0.35, d));
    lfo.connect(depth);
    const end = at + d + 0.3;
    const shapes: [Shape, number, number][] = square
      ? [
          ['square', -5, 1],
          ['square', 5, 1],
          ['triangle', 1200, 0.5],
        ]
      : [
          ['sawtooth', -8, 1],
          ['sawtooth', 8, 1],
          ['square', -1200, 0.35],
        ];
    for (const [shape, det, lvl] of shapes) {
      const o = this.osc(shape, f, det);
      depth.connect(o.detune);
      const og = this.gain(lvl);
      o.connect(og);
      og.connect(lp);
      this.track(o, at, end);
    }
    this.track(lfo, at, end);
    lp.connect(g);
    g.connect(s.dry);
    const ds = this.gain(0.28);
    g.connect(ds);
    ds.connect(s.dly);
    const vs = this.gain(0.35);
    g.connect(vs);
    vs.connect(s.vrb);
  }

  private lead2(s: Session, at: number, p: number, d: number, v: number): void {
    const o = this.osc('triangle', mtof(p));
    const g = this.gain(0);
    const peak = 0.07 * v;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    g.gain.setTargetAtTime(peak * 0.6, at + 0.02, 0.1);
    g.gain.setTargetAtTime(0.0001, at + d, 0.04);
    o.connect(g);
    g.connect(s.dry);
    const ds = this.gain(0.5);
    g.connect(ds);
    ds.connect(s.dly);
    this.track(o, at, at + d + 0.25);
  }

  // ---------------------------------------------------------------- sound effects (into the fx bus, now)

  private blip(f: number, dur: number, vol: number, shape: Shape = 'triangle', at = 0, to?: number): void {
    const t = this.a.currentTime + at;
    const o = this.osc(shape, f);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.fx);
    this.track(o, t, t + dur + 0.02);
  }

  /** A sparkle on a hit, on a note of the chord that is playing (so it always fits). */
  hit(lane: number, j: number, chord: Chord): void {
    const tones = [chord.tones[0]!, chord.tones[1]!, chord.tones[2]!, 12];
    const p = near(chord.root + tones[lane]!, 79) + (lane === 3 ? 12 : 0);
    const f = mtof(p);
    const vol = j === 1 ? 0.1 : j === 2 ? 0.08 : 0.06;
    this.blip(f, 0.16, vol, 'triangle');
    if (j === 1) this.blip(f * 2, 0.12, 0.025, 'sine', 0.015);
  }

  miss(): void {
    this.blip(200, 0.16, 0.06, 'sine', 0, 95);
  }

  ui(kind: 'move' | 'pick' | 'back' | 'go'): void {
    if (kind === 'move') this.blip(880, 0.07, 0.06, 'triangle');
    else if (kind === 'back') this.blip(520, 0.12, 0.06, 'triangle', 0, 330);
    else if (kind === 'pick') {
      this.blip(660, 0.09, 0.07, 'square');
      this.blip(990, 0.14, 0.06, 'square', 0.07);
    } else {
      [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.16, 0.06, 'square', i * 0.06));
    }
  }

  /** The crowd: a cheering swell of filtered noise and a whistle or two. */
  cheer(size = 1, at = 0): void {
    const t = this.a.currentTime + at;
    const dur = 1.2 + size * 1.2;
    for (const [f, q, vol] of [
      [700, 1.2, 0.06],
      [1300, 1.6, 0.05],
      [2600, 2, 0.03],
    ] as const) {
      const src = this.a.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.loopStart = Math.random() * 0.5;
      const fl = this.filter('bandpass', f, q);
      const g = this.gain(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * size, t + 0.25);
      g.gain.setTargetAtTime(0.0001, t + 0.5, dur / 4);
      // a wobble, like many voices (it fades with the cheer)
      const lfo = this.osc('sine', 5 + Math.random() * 4);
      const lg = this.gain(0);
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(vol * size * 0.4, t + 0.25);
      lg.gain.setTargetAtTime(0, t + 0.5, dur / 4);
      lfo.connect(lg);
      lg.connect(g.gain);
      src.connect(fl);
      fl.connect(g);
      g.connect(this.fx);
      this.track(src, t, t + dur + 0.5);
      this.track(lfo, t, t + dur + 0.5);
    }
    if (size >= 1) {
      const w = this.osc('sine', 2100);
      w.frequency.setValueAtTime(1900, t + 0.1);
      w.frequency.linearRampToValueAtTime(2700, t + 0.35);
      w.frequency.linearRampToValueAtTime(2300, t + 0.6);
      const g = this.gain(0);
      g.gain.setValueAtTime(0.0001, t + 0.1);
      g.gain.linearRampToValueAtTime(0.03, t + 0.15);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.65);
      w.connect(g);
      g.connect(this.fx);
      this.track(w, t + 0.1, t + 0.7);
    }
  }

  feverOn(): void {
    const t = this.a.currentTime;
    const o = this.osc('sawtooth', 300);
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(2200, t + 0.45);
    const lp = this.filter('lowpass', 3000, 4);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.fx);
    this.track(o, t, t + 0.6);
    this.cheer(1.2, 0.1);
  }

  feverOff(): void {
    const t = this.a.currentTime;
    const o = this.osc('sawtooth', 700);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    const lp = this.filter('lowpass', 1600, 6);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.fx);
    this.track(o, t, t + 0.6);
  }

  /** A rocket going up; it bursts `fly` seconds later. */
  firework(fly: number, big: boolean): void {
    const t = this.a.currentTime;
    const o = this.osc('sine', 500);
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + fly);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + fly);
    o.connect(g);
    g.connect(this.fx);
    this.track(o, t, t + fly + 0.02);
    const b = t + fly;
    this.hiss(this.fx, b, big ? 0.9 : 0.6, big ? 0.32 : 0.22, 'lowpass', 900, 0.8, 0.004);
    this.kick(this.fx, b, big ? 0.55 : 0.35);
    for (let i = 0; i < 8; i++) this.hiss(this.fx, b + 0.12 + Math.random() * 0.7, 0.03, 0.05 + Math.random() * 0.05, 'highpass', 5000);
  }
}
