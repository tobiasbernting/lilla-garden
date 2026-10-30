// One clock for the music and the picture. With sound it follows the AudioContext (what is heard now,
// latency taken off), without sound (or while the browser keeps the audio asleep) it runs on
// performance.now(); it switches between the two without a jump. The scheduler plays the song's
// events a little ahead of time on the audio clock, so the notes on screen and the music never drift.
import type { Ev, Song } from './songs.ts';

const perf = (): number => performance.now() / 1000;

export class SongClock {
  private audio: AudioContext | null;
  private mode: 'audio' | 'perf' = 'perf';
  /** song time = songAt + (source time − srcAt) */
  private songAt = 0;
  private srcAt = 0;
  private paused = false;
  private frozen = 0;
  private started = false;
  private smooth = 0;
  private smoothAt = 0;
  private hasSmooth = false;
  private quietSince = -1;

  constructor(audio: AudioContext | null) {
    this.audio = audio;
  }

  get usingAudio(): boolean {
    return this.mode === 'audio';
  }

  get running(): boolean {
    return this.started && !this.paused;
  }

  private latency(): number {
    const a = this.audio;
    if (!a) return 0;
    const l = (a.outputLatency || 0) + (a.baseLatency || 0);
    return Math.max(0, Math.min(0.25, Number.isFinite(l) ? l : 0));
  }

  private audioOk(): boolean {
    return !!this.audio && this.audio.state === 'running';
  }

  /** Start at song time `t`, `lead` seconds from now (time for the first events to be scheduled). */
  start(t: number, lead = 0.12): void {
    this.started = true;
    this.paused = false;
    this.hasSmooth = false;
    if (this.audioOk()) {
      this.mode = 'audio';
      this.srcAt = this.audio!.currentTime + lead;
      this.songAt = t;
    } else {
      this.mode = 'perf';
      this.srcAt = perf() + lead;
      this.songAt = t;
    }
  }

  /** The song time being played into the speakers' buffer now (for scheduling). */
  raw(): number {
    if (!this.started) return this.songAt;
    if (this.paused) return this.frozen;
    if (this.mode === 'audio') return this.songAt + (this.audio!.currentTime - this.srcAt);
    return this.songAt + (perf() - this.srcAt);
  }

  /** The song time that is being heard now, unsmoothed. */
  private heard(): number {
    return this.mode === 'audio' ? this.raw() - this.latency() : this.raw();
  }

  /** The audio clock time at which a song time sounds (audio mode only). */
  audioTime(t: number): number {
    return this.srcAt + (t - this.songAt);
  }

  /** The smoothed song time for drawing and judging (call tick() once per frame first). */
  now(): number {
    return this.hasSmooth ? this.smooth : this.heard();
  }

  /** Once per frame: follow the audio clock smoothly, and switch source when the audio wakes or sleeps. */
  tick(): void {
    if (!this.started || this.paused) return;
    const p = perf();
    if (this.mode === 'perf' && this.audioOk()) {
      // the audio woke up: carry on from the same moment on its clock
      const t = this.now();
      this.mode = 'audio';
      this.srcAt = this.audio!.currentTime;
      this.songAt = t + this.latency();
      this.hasSmooth = false;
    } else if (this.mode === 'audio' && !this.audioOk()) {
      if (this.quietSince < 0) this.quietSince = p;
      else if (p - this.quietSince > 0.35) {
        // the audio went to sleep: run on without it
        const t = this.now();
        this.mode = 'perf';
        this.srcAt = p;
        this.songAt = t;
        this.hasSmooth = false;
        this.quietSince = -1;
      }
    } else this.quietSince = -1;
    const target = this.heard();
    if (!this.hasSmooth || this.mode === 'perf') {
      this.smooth = target;
      this.hasSmooth = true;
    } else {
      const pred = this.smooth + Math.max(0, p - this.smoothAt);
      const err = target - pred;
      const next = Math.abs(err) > 0.06 ? target : pred + err * 0.15;
      this.smooth = Math.max(this.smooth, next);
    }
    this.smoothAt = p;
  }

  pause(): void {
    if (this.paused) return;
    this.frozen = this.raw();
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.mode === 'perf') {
      this.srcAt = perf();
      this.songAt = this.frozen;
    } else if (this.raw() - this.frozen > 0.06) {
      // the audio kept running through the pause: pick up where the picture stopped
      this.srcAt = this.audio!.currentTime + 0.05;
      this.songAt = this.frozen;
    }
    this.hasSmooth = false;
    this.quietSince = -1;
  }
}

/** Plays a song's events slightly ahead on the audio clock; optionally loops a window (the song picker). */
export class Scheduler {
  /** Song time (counting loops) scheduled up to. */
  private upTo: number;

  constructor(
    private song: Song,
    private clock: SongClock,
    private play: (e: Ev, at: number) => void,
    private fever: () => boolean,
    private loop: [number, number] | null = null,
    from = 0,
  ) {
    this.upTo = from;
  }

  /** Map a (looping) clock time into the song. */
  songTime(t: number): number {
    if (!this.loop) return t;
    const [a, b] = this.loop;
    if (t < a) return t;
    return a + ((t - a) % (b - a));
  }

  pump(ahead = 0.3): void {
    if (!this.clock.usingAudio || !this.clock.running) return;
    const raw = this.clock.raw();
    // never schedule into the past (after a stall or when the audio just woke up)
    if (this.upTo < raw) this.upTo = raw;
    const horizon = raw + ahead;
    const ev = this.song.events;
    let guard = 0;
    while (this.upTo < horizon && guard++ < 8) {
      let base = 0;
      let segEnd = horizon;
      if (this.loop) {
        const [a, b] = this.loop;
        const len = b - a;
        const k = this.upTo < a ? 0 : Math.floor((this.upTo - a) / len);
        base = k * len;
        segEnd = Math.min(horizon, a + (k + 1) * len);
      }
      const lo = this.upTo - base;
      const hi = segEnd - base;
      let i = lowerBound(ev, lo);
      for (; i < ev.length && ev[i]!.t < hi; i++) {
        const e = ev[i]!;
        if (e.fever && !this.fever()) continue;
        this.play(e, this.clock.audioTime(e.t + base));
      }
      this.upTo = segEnd;
    }
  }
}

function lowerBound(ev: Ev[], t: number): number {
  let lo = 0;
  let hi = ev.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ev[m]!.t < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Sorted times, and how long ago the last one at or before `t` was. */
export class Pulse {
  constructor(readonly times: number[]) {}

  since(t: number): number {
    const a = this.times;
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (a[m]! <= t) lo = m + 1;
      else hi = m;
    }
    return lo === 0 ? 99 : t - a[lo - 1]!;
  }

  /** Index of the last time at or before t (−1 if none). */
  index(t: number): number {
    const a = this.times;
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (a[m]! <= t) lo = m + 1;
      else hi = m;
    }
    return lo - 1;
  }
}
