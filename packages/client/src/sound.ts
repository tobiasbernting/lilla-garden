// Tiny synthesised sound effects (no audio files). Starts after the first tap/click.
import { bus } from './state.ts';

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('lilla-garden.muted') === '1';
  } catch {
    return false;
  }
})();

const ensure = (): AudioContext | null => {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, slide = 0): void {
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

const noise = (dur: number, vol = 0.06): void => {
  const c = ensure();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g).connect(c.destination);
  src.start();
};

export const SFX = {
  honk: () => {
    tone(440, 0.18, 'square', 0.07);
    tone(554, 0.18, 'square', 0.05);
    setTimeout(() => {
      tone(440, 0.22, 'square', 0.07);
      tone(554, 0.22, 'square', 0.05);
    }, 220);
  },
  coin: () => {
    tone(880, 0.08, 'square', 0.06);
    setTimeout(() => tone(1320, 0.12, 'square', 0.06), 70);
  },
  sparkle: () => {
    tone(1200, 0.1, 'triangle', 0.07, 600);
    setTimeout(() => tone(1800, 0.15, 'triangle', 0.05, 400), 60);
  },
  heart: () => {
    tone(660, 0.1, 'sine', 0.08);
    setTimeout(() => tone(880, 0.18, 'sine', 0.08), 90);
  },
  water: () => tone(500, 0.12, 'sine', 0.06, -250),
  splash: () => {
    noise(0.18, 0.07);
    tone(420, 0.14, 'sine', 0.06, -300);
  },
  chop: () => {
    noise(0.08, 0.08);
    tone(160, 0.08, 'square', 0.05, -60);
  },
  poof: () => noise(0.15, 0.04),
  toast: () => tone(520, 0.05, 'triangle', 0.03),
  hit: () => {
    noise(0.06, 0.1);
    tone(120, 0.12, 'square', 0.07, -60);
  },
  arrow: () => tone(900, 0.08, 'sine', 0.04, 500),
  rocket: () => {
    tone(300, 0.25, 'sawtooth', 0.05, 500);
    noise(0.25, 0.04);
  },
  boom: () => {
    noise(0.45, 0.16);
    tone(70, 0.4, 'square', 0.1, -40);
    setTimeout(() => tone(50, 0.3, 'triangle', 0.08, -20), 80);
  },
  open: () => tone(440, 0.06, 'triangle', 0.04, 120),
  bus: () => {
    // engine rumble and a friendly horn
    noise(0.6, 0.03);
    setTimeout(() => tone(330, 0.25, 'square', 0.05), 150);
    setTimeout(() => tone(392, 0.35, 'square', 0.05), 350);
  },
  train: () => {
    // chuff-chuff and a long whistle
    for (let i = 0; i < 6; i++) setTimeout(() => noise(0.08, 0.04), i * 160);
    setTimeout(() => tone(740, 0.5, 'sine', 0.06, 60), 500);
    setTimeout(() => tone(880, 0.6, 'sine', 0.05, -40), 700);
  },
  newDay: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.06), i * 110));
  },
  /** Fiu-fiiiu: calling the pets. */
  whistle: () => {
    tone(1400, 0.16, 'sine', 0.07, 500);
    setTimeout(() => tone(1100, 0.32, 'sine', 0.07, 900), 200);
  },
  /** A far-away rumble (never loud: the players are small). */
  thunder: () => {
    rumble(1.8, 0.11);
    tone(55, 1.2, 'triangle', 0.05, -15);
  },
  chat: () => {
    tone(740, 0.05, 'sine', 0.04);
    setTimeout(() => tone(990, 0.07, 'sine', 0.035), 55);
  },
  talk: () => tone(600 + Math.random() * 200, 0.05, 'triangle', 0.03),
};

/** Low-passed noise that swells and fades, for thunder. */
function rumble(dur: number, vol: number): void {
  const c = ensure();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 160;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

// ---- weather ambience: one looping noise, filtered per kind of weather ----

let amb: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
let ambKind: string | null = null;
const AMBIENCE: Record<string, { type: BiquadFilterType; freq: number; q: number; vol: number }> = {
  rain: { type: 'lowpass', freq: 1800, q: 0.4, vol: 0.035 },
  storm: { type: 'lowpass', freq: 1200, q: 0.4, vol: 0.06 },
  hail: { type: 'highpass', freq: 2500, q: 0.6, vol: 0.03 },
  wind: { type: 'bandpass', freq: 400, q: 0.8, vol: 0.05 },
};

/** Rain, hail or wind sound in the background (null: quiet). */
export function setAmbience(kind: string | null): void {
  ambKind = kind && AMBIENCE[kind] ? kind : null;
  applyAmbience();
}

/** A minigame is open: the rain and wind keep quiet until it closes. */
let hushed = false;
export function hushAmbience(on: boolean): void {
  hushed = on;
  applyAmbience();
}

function applyAmbience(): void {
  const want = muted || hushed ? null : ambKind;
  if (!want) {
    if (amb && ctx) amb.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    return;
  }
  const c = ensure();
  if (!c) return;
  if (!amb) {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    amb = { src, filter, gain };
  }
  const a = AMBIENCE[want]!;
  amb.filter.type = a.type;
  amb.filter.frequency.setTargetAtTime(a.freq, c.currentTime, 0.5);
  amb.filter.Q.value = a.q;
  amb.gain.gain.setTargetAtTime(a.vol, c.currentTime, 0.8);
}

export function setMuted(m: boolean): void {
  muted = m;
  applyAmbience();
}
export const isMuted = (): boolean => muted;

export function initSound(): void {
  const unlock = () => {
    ensure();
    if (ambKind && !amb) applyAmbience();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  bus.on('fx', (c) => (SFX as Record<string, () => void>)[c.kind]?.());
  bus.on('day', () => SFX.newDay());
  bus.on('open', () => SFX.open());
}
