// Tiny synthesiser helpers for the minigames (no audio files). Everything plays into the arcade's
// `out` node, which the shell mutes. All helpers do nothing when there is no audio.

export interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** Glide to this frequency over the note. */
  to?: number;
  /** Start this many seconds from now. */
  at?: number;
  attack?: number;
}

/** One note with a quick fade-out. */
export function tone(a: AudioContext | null, out: AudioNode | null, freq: number, dur: number, o: ToneOpts = {}): void {
  if (!a || !out) return;
  const t = a.currentTime + (o.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  const vol = o.vol ?? 0.1;
  const attack = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(a: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf;
  const b = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

export interface NoiseOpts {
  vol?: number;
  /** Band-pass centre frequency (Hz); low numbers rumble, high ones hiss. */
  freq?: number;
  q?: number;
  at?: number;
}

/** A burst of filtered noise: hits, splats, explosions, hi-hats. */
export function noise(a: AudioContext | null, out: AudioNode | null, dur: number, o: NoiseOpts = {}): void {
  if (!a || !out) return;
  const t = a.currentTime + (o.at ?? 0);
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = o.freq ?? 1200;
  f.Q.value = o.q ?? 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.15, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** A soft drum kick. */
export function kick(a: AudioContext | null, out: AudioNode | null, at = 0, vol = 0.5): void {
  tone(a, out, 150, 0.25, { type: 'sine', to: 40, vol, at });
}
