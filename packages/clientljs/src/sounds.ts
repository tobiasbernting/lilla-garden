// Cozy sounds, made in code like the game's other sounds and kept quiet: crickets on summer nights, an owl in the
// autumn and winter dark, birdsong at dawn (and now and then by day), a fire crackling when you stand near one, and
// rain on the roof when you are indoors while it rains outside. Out in the wider world each place has its own:
// frogs in the swamp, parrots and cicadas in the jungle, bubbling lava, waves on the beach, fairy chimes in the
// mushroom forest, a music box in Godislandet, dripping caves and the hum of space on the moon.
// Silent while the game is muted.
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
  private frogIn = rnd(1, 3);
  private parrotIn = rnd(1, 4);
  private blopIn = rnd(1, 3);
  private caveDripIn = rnd(0.5, 2);
  private chimeIn = rnd(3, 8);
  private tinkleIn = rnd(6, 12);
  private bleepIn = rnd(0.5, 2);
  /** A minigame is open: the farm keeps quiet. */
  private hushed = false;
  private rumble: Loop | null = null;
  private cicadas: Loop | null = null;
  private surf: Loop | null = null;
  private hum: GainNode | null = null;

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
    const quiet = isMuted() || !on('sounds') || this.hushed;
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
    this.places(sc, quiet);
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

  /** The sounds of the wider world's places. */
  private places(sc: Scene, quiet: boolean): void {
    const c = this.ctx!;
    const dt = sc.dt;
    const biome = sc.world.biome ?? '';
    const out = sc.where === 'out';
    const night = smooth((sc.outdoor.dark - 0.6) / 0.25);
    // loops: the volcano's rumble (louder by the lava), cicadas on jungle nights, the surf on the beach, the hum of space
    this.rumble ??= this.loop('lowpass', 90, 0.8);
    this.rumble.gain.gain.setTargetAtTime(quiet || !out ? 0 : biome === 'vulkan' ? 0.03 + 0.05 * sc.nearLava : 0.06 * sc.nearLava, c.currentTime, 1);
    this.cicadas ??= this.loop('bandpass', 5200, 9);
    this.cicadas.gain.gain.setTargetAtTime(quiet || !out || biome !== 'djungel' ? 0 : 0.012 * (0.3 + night), c.currentTime, 1.5);
    this.surf ??= this.loop('lowpass', 420, 0.6);
    const swell = 0.5 + 0.5 * Math.sin(sc.t * 0.9);
    this.surf.gain.gain.setTargetAtTime(quiet || !out || biome !== 'strand' ? 0 : 0.012 + 0.03 * swell, c.currentTime, 0.6);
    if (!this.hum) {
      this.hum = c.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.out!);
      for (const [f, v] of [
        [55, 1],
        [82.4, 0.6],
        [110.3, 0.35],
      ] as const) {
        const o = c.createOscillator();
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.value = v;
        o.connect(g).connect(this.hum);
        o.start();
      }
    }
    this.hum.gain.setTargetAtTime(quiet || sc.where !== 'space' ? 0 : 0.012 + 0.006 * Math.sin(sc.t * 0.4), c.currentTime, 1.2);
    if (quiet) return;
    // frogs in the swamp, most of all at dusk and night
    if (out && biome === 'trask') {
      this.frogIn -= dt * (0.5 + night);
      if (this.frogIn <= 0) {
        this.frogIn = rnd(1.2, 4);
        this.croak(rnd(260, 420), rnd(-0.8, 0.8));
      }
    }
    // parrots and odd birds in the jungle by day
    if (out && biome === 'djungel' && night < 0.5) {
      this.parrotIn -= dt;
      if (this.parrotIn <= 0) {
        this.parrotIn = rnd(1.5, 5);
        this.bird(rnd(1400, 2400), rnd(-0.9, 0.9), 0.022);
      }
    }
    // lava bubbling
    if (sc.nearLava > 0.05) {
      this.blopIn -= dt * sc.nearLava;
      if (this.blopIn <= 0) {
        this.blopIn = rnd(0.4, 1.6);
        this.blop(0.05 * sc.nearLava);
      }
    }
    // drips in every cave
    if (sc.where === 'cave') {
      this.caveDripIn -= dt;
      if (this.caveDripIn <= 0) {
        this.caveDripIn = rnd(0.8, 3.5);
        this.drip(rnd(-0.7, 0.7));
      }
    }
    // Spelhallen: the machines bleep and jingle all around
    if (sc.where === 'hall' && !quiet) {
      this.bleepIn -= dt;
      if (this.bleepIn <= 0) {
        this.bleepIn = rnd(0.6, 2.2);
        this.bleep(rnd(-0.8, 0.8));
      }
    }
    // fairy chimes in the mushroom forest
    if (out && biome === 'svamp') {
      this.chimeIn -= dt;
      if (this.chimeIn <= 0) {
        this.chimeIn = rnd(4, 11);
        this.chime(rnd(-0.6, 0.6), [2093, 2349, 2637, 3136, 3520]);
      }
    }
    // a music box somewhere in Godislandet
    if (out && biome === 'godis') {
      this.tinkleIn -= dt;
      if (this.tinkleIn <= 0) {
        this.tinkleIn = rnd(8, 16);
        this.chime(rnd(-0.4, 0.4), [1047, 1175, 1319, 1568, 1760, 2093]);
      }
    }
  }

  /** Ribbit: two quick buzzy notes, the second lower. */
  private croak(base: number, pan: number): void {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out!);
    for (const [at, f] of [
      [0, base],
      [0.14, base * 0.8],
    ] as const) {
      const t = c.currentTime + 0.02 + at;
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 0.85, t + 0.09);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.02, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + 0.1);
      osc.connect(lp).connect(g).connect(p);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /** Blop: a bubble of lava bursting. */
  private blop(vol: number): void {
    const c = this.ctx!;
    const t = c.currentTime + 0.01;
    const osc = c.createOscillator();
    const f = rnd(110, 180);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Plink … plink: a drop falling into a pool in the dark, with an echo. */
  private drip(pan: number): void {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out!);
    const f = rnd(1300, 2300);
    for (const [at, vol] of [
      [0, 0.03],
      [0.23, 0.012],
      [0.46, 0.005],
    ] as const) {
      const t = c.currentTime + 0.02 + at;
      const osc = c.createOscillator();
      osc.frequency.setValueAtTime(f * 0.7, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g).connect(p);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** While a minigame is open the farm's sounds fade out (update() is not called then). */
  hush(hushed: boolean): void {
    this.hushed = hushed;
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(hushed || isMuted() || !on('sounds') ? 0 : 1, this.ctx.currentTime, 0.15);
  }

  /** A machine across the hall: a short run of square-wave notes, now up, now down. */
  private bleep(pan: number): void {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out!);
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319];
    let i = Math.floor(Math.random() * 4);
    const up = Math.random() < 0.6;
    let t = c.currentTime + 0.02;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = scale[Math.max(0, Math.min(scale.length - 1, i))]!;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.006, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(g).connect(p);
      osc.start(t);
      osc.stop(t + 0.1);
      i += up ? 1 + Math.floor(Math.random() * 2) : -1;
      t += 0.075;
    }
  }

  /** A few soft bell notes picked from a scale. */
  private chime(pan: number, scale: number[]): void {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out!);
    let t = c.currentTime + 0.02;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const osc = c.createOscillator();
      osc.frequency.value = scale[Math.floor(Math.random() * scale.length)]!;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g).connect(p);
      osc.start(t);
      osc.stop(t + 1);
      t += rnd(0.12, 0.26);
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
