// Cozy sounds, made in code like the game's other sounds and kept quiet: crickets on summer nights, an owl in the
// autumn and winter dark, birdsong at dawn (and now and then by day), a fire crackling when you stand near one, and
// rain on the roof when you are indoors while it rains outside. Silent while the game is muted.
import { isMuted } from '@v1/sound.ts';
import { on } from './features.ts';
import { smooth } from './gfx.ts';
import type { Scene } from './scene.ts';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

interface Loop {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class CozySounds {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private roof: Loop | null = null;
  private fire: Loop | null = null;
  /** Three crickets, each with its own pitch, place and seconds to its next chirp. */
  private crickets = [0, 1, 2].map((i) => ({ pitch: 4300 + i * 380, pan: [-0.6, 0.15, 0.7][i]!, next: rnd(0.2, 1.2) }));
  private owlIn = rnd(8, 20);
  private birdIn = rnd(0.5, 2);
  private crackIn = 0;
  private dripIn = 0;

  constructor() {
    // browsers only start sound after a tap or a key
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new Ctx();
      this.ctx = c;
      this.out = c.createGain();
      this.out.connect(c.destination);
      // two seconds of white noise, shared by everything noisy
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch {
      this.ctx = null;
    }
  }

  /** A looping noise through a filter, silent until its gain is raised. */
  private loop(type: BiquadFilterType, freq: number, q: number): Loop {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.out!);
    src.start();
    return { gain, filter };
  }

  /**
   * Called every frame. `nearFire` is 0..1, how close the player stands to a burning torch or stove; `sc.weather` is
   * the weather outside even when indoors.
   */
  update(sc: Scene, nearFire: number): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.out) return;
    const quiet = isMuted() || !on('sounds');
    this.out.gain.setTargetAtTime(quiet ? 0 : 1, c.currentTime, 0.3);
    const dt = sc.dt;
    const outdoors = sc.where === 'out';
    const wet = sc.weather === 'rain' || sc.weather === 'storm';
    const fair = !wet && sc.weather !== 'snow' && sc.weather !== 'hail';
    const night = smooth((sc.outdoor.dark - 0.6) / 0.25);

    // rain drumming on the roof, only indoors
    this.roof ??= this.loop('lowpass', 700, 0.5);
    const roofVol = sc.where === 'inside' && wet ? (sc.weather === 'storm' ? 0.07 : 0.045) : 0;
    this.roof.gain.gain.setTargetAtTime(quiet ? 0 : roofVol, c.currentTime, 0.8);
    if (roofVol > 0 && !quiet) {
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        this.dripIn = rnd(0.08, 0.35);
        this.snap(rnd(900, 2200), 0.018, rnd(0.004, 0.01));
      }
    }

    // a fire close by: a soft roar and the odd crack of a twig
    this.fire ??= this.loop('lowpass', 520, 0.7);
    this.fire.gain.gain.setTargetAtTime(quiet ? 0 : 0.016 * nearFire, c.currentTime, 0.4);
    if (nearFire > 0.05 && !quiet) {
      this.crackIn -= dt;
      if (this.crackIn <= 0) {
        this.crackIn = rnd(0.03, 0.22) / Math.max(0.3, nearFire);
        this.snap(rnd(1500, 4500), 0.05 * nearFire, rnd(0.004, 0.022));
      }
    }
    if (quiet) return;

    // crickets on warm nights
    const warm = sc.year === 'summer' || (sc.year === 'spring' && sc.day > 0.7);
    if (outdoors && fair && warm && night > 0.3)
      for (const k of this.crickets) {
        k.next -= dt;
        if (k.next <= 0) {
          k.next = rnd(0.55, 1.4);
          this.chirp(k.pitch, k.pan, 0.011 * night);
        }
      }

    // an owl now and then in the autumn and winter dark
    if (outdoors && fair && (sc.year === 'autumn' || sc.year === 'winter') && night > 0.5) {
      this.owlIn -= dt;
      if (this.owlIn <= 0) {
        this.owlIn = rnd(25, 55);
        this.owl(rnd(-0.7, 0.7));
      }
    }

    // birdsong: a chorus at dawn, the odd bird by day (fewer in winter)
    const f = sc.day;
    const dawn = f > 0.94 ? smooth((f - 0.94) / 0.05) : 1 - smooth((f - 0.08) / 0.1);
    const day = f > 0.15 && f < 0.6 ? 0.25 : 0;
    const birds = Math.max(dawn, day) * (sc.year === 'winter' ? 0.3 : 1);
    if (outdoors && fair && birds > 0.05 && sc.outdoor.dark < 0.7) {
      this.birdIn -= dt * birds;
      if (this.birdIn <= 0) {
        this.birdIn = rnd(0.9, 3);
        this.bird(rnd(2400, 3600), rnd(-0.8, 0.8), 0.02);
      }
    }
  }

  /** A tiny burst of filtered noise: a crackle, a drip. */
  private snap(freq: number, vol: number, len: number): void {
    const c = this.ctx!;
    const t = c.currentTime + 0.005;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random() * 1.5, len + 0.02);
  }

  /** One cricket chirp: three or four quick pulses of a high note. */
  private chirp(pitch: number, pan: number, vol: number): void {
    const c = this.ctx!;
    const t0 = c.currentTime + 0.01;
    const n = Math.random() < 0.5 ? 3 : 4;
    const osc = c.createOscillator();
    osc.frequency.value = pitch;
    const g = c.createGain();
    g.gain.value = 0;
    for (let i = 0; i < n; i++) {
      const s = t0 + i * 0.045;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.006);
      g.gain.linearRampToValueAtTime(0, s + 0.03);
    }
    const p = c.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(this.out!);
    osc.start(t0);
    osc.stop(t0 + n * 0.045 + 0.05);
  }

  /** Hoo … hoo-hoo, low and soft. */
  private owl(pan: number): void {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out!);
    for (const [at, len] of [[0, 0.42], [0.72, 0.16], [0.96, 0.42]] as const) {
      const t = c.currentTime + 0.02 + at;
      const osc = c.createOscillator();
      osc.frequency.setValueAtTime(415, t);
      osc.frequency.linearRampToValueAtTime(372, t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.034, t + 0.06);
      g.gain.setValueAtTime(0.034, t + len * 0.6);
      g.gain.linearRampToValueAtTime(0, t + len);
      osc.connect(g).connect(p);
      osc.start(t);
      osc.stop(t + len + 0.05);
    }
  }

  /** A little phrase of quick whistled notes. */
  private bird(base: number, pan: number, vol: number): void {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out!);
    let t = c.currentTime + 0.02;
    const notes = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < notes; i++) {
      const len = rnd(0.05, 0.12);
      const f0 = base * rnd(0.88, 1.2);
      const osc = c.createOscillator();
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.3 : 0.78), t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.linearRampToValueAtTime(0, t + len);
      osc.connect(g).connect(p);
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += len + rnd(0.02, 0.07);
    }
  }
}
