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
  honk: () => {
    tone(440, 0.14, 'square', 0.07);
    setTimeout(() => tone(554, 0.18, 'square', 0.07), 120);
  },
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
  newDay: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.06), i * 110));
  },
};

export function setMuted(m: boolean): void {
  muted = m;
}
export const isMuted = (): boolean => muted;

export function initSound(): void {
  const unlock = () => ensure();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  bus.on('fx', (c) => (SFX as Record<string, () => void>)[c.kind]?.());
  bus.on('day', () => SFX.newDay());
  bus.on('open', () => SFX.open());
}
