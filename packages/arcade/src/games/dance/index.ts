// Dansbanan: a rhythm game on a Swedish summer dance pavilion turned disco. Pick a song and a level,
// then press ← ↓ ↑ → as the arrows reach the line; the arrows come from the song's own melody and
// drums. Long combos light up the neon sign and start Discofeber. The band takes a bow with fireworks.
import { fullCanvas } from '../../kit.ts';
import type { Button, GameContext, GameFactory, GameInstance } from '../../types.ts';
import { LANE_COLOR, QUALITY, arrowSprites, clamp, decay, type ArrowSprites, type G } from './art.ts';
import { Synth, type Session } from './audio.ts';
import { ACC, LEVELS, buildChart, feverOn, holdPoints, judge, multFor, points, type Chart, type Judgement, type Level, type Note } from './chart.ts';
import { Pulse, Scheduler, SongClock } from './clock.ts';
import { Fx } from './fx.ts';
import { backButton, drawCombo, drawCountdown, drawFeverBanner, drawFinal, drawHighway, drawHud, drawJudge, drawPick, pickCards, type JudgeView, type Lane } from './hud.ts';
import { Scene, laneX, widthAt, type Mood, type Music } from './scene.ts';
import { chordAt, sectionAt, songs, type Inst, type Kind, type Song } from './songs.ts';

const ENERGY: Record<Kind, number> = { count: 0.25, intro: 0.5, verse: 0.62, pre: 0.78, chorus: 1, break: 0.72, outro: 1 };
const LEVEL_BLURB = ['För små dansare', 'Lagom svårt', 'För proffs'];
/** Seconds of quiet before the count-in. */
const LEAD_IN = 1.2;

/**
 * Lab only (never in a build): `?dancebot=0.9` plays by itself, hitting about 90 % of the notes;
 * `&dancesong=1&dancelevel=2` picks the song and the level.
 */
const BOT: { hit: number; song: number; level: Level; from: number } | null = (() => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  if (!q.has('dancebot')) return null;
  return { hit: Number(q.get('dancebot') || 1), song: Number(q.get('dancesong') || 0), level: clamp(Number(q.get('dancelevel') || 1), 0, 2) as Level, from: Number(q.get('dancefrom') || 0) };
})();

interface Pulses {
  kick: Pulse;
  snare: Pulse;
  hat: Pulse;
  crash: Pulse;
  bass: Pulse;
  stab: Pulse;
}

function pulses(song: Song): Pulses {
  const of = (...insts: Inst[]): Pulse => {
    const ts: number[] = [];
    for (const e of song.events) if (!e.fever && insts.includes(e.inst) && ts[ts.length - 1] !== e.t) ts.push(e.t);
    return new Pulse(ts);
  };
  return { kick: of('kick', 'stick'), snare: of('clap', 'snare', 'tomH', 'tomL'), hat: of('hat', 'ohat'), crash: of('crash'), bass: of('bass'), stab: of('stab', 'pad') };
}

/** Keyboard keys for each direction in the shell's controller (so a key press is not counted twice). */
const DIR_KEYS: [Button, number, string[]][] = [
  ['left', 0, ['ArrowLeft', 'KeyA']],
  ['down', 1, ['ArrowDown', 'KeyS']],
  ['up', 2, ['ArrowUp', 'KeyW']],
  ['right', 3, ['ArrowRight', 'KeyD']],
];

class Dance implements GameInstance {
  private ctx: GameContext;
  private cv: ReturnType<typeof fullCanvas>;
  private g: G;
  private raf = 0;
  private pumpTimer: ReturnType<typeof setInterval>;
  private paused = false;
  private dead = false;
  private ended = false;
  private suspendedByUs = false;
  private lastMs = performance.now();
  private time = 0;
  private synth: Synth | null = null;
  private scene: Scene;
  private fx: Fx;
  private sprites: ArrowSprites | null = null;
  private w = 0;
  private h = 0;
  private low: boolean;
  private list: Song[] = songs();
  private pul: Pulses[];

  private mode: 'pick' | 'play' | 'final' = 'pick';
  private step: 0 | 1 = 0;
  private songI = 0;
  private level: Level = 0;
  private enter = 0;
  private pickClock: SongClock | null = null;
  private pickSched: Scheduler | null = null;
  private pickSess: Session | null = null;

  private song: Song;
  private chart: Chart | null = null;
  private notes: Note[] = [];
  private first = 0;
  private drawFrom = 0;
  private clock: SongClock | null = null;
  private sched: Scheduler | null = null;
  private score = 0;
  private shown = 0;
  private combo = 0;
  private best = 0;
  private counts = [0, 0, 0, 0, 0];
  private fever = false;
  private feverAmt = 0;
  private feverAge = -1;
  private lanes: Lane[] = [0, 1, 2, 3].map(() => ({ down: false, flash: 0, shake: 0, holding: false }));
  private lit = [0, 0, 0, 0];
  private holds: (Note | null)[] = [null, null, null, null];
  private jv: JudgeView | null = null;
  private comboPulse = 0;
  private bump = 0;
  private cheer = 0;
  private show = 0;
  private finalAge = 0;
  private fireIn = 0;
  private skip = false;
  private milestone: { n: number; age: number } | null = null;

  private pointers = new Map<number, number>();
  private queued: { lane: number; at: number; d?: boolean }[] = [];
  private taps: { x: number; y: number }[] = [];
  /** D is ← in D F J K and → in W A S D: which set is in use, once we know. */
  private dfjk = false;
  private modeKnown = false;
  private dLane = 3;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.low = ctx.quality === 'low';
    QUALITY.cheap = this.low;
    this.cv = fullCanvas(ctx.root, ctx.dpr);
    this.g = this.cv.g;
    ctx.root.style.background = '#0a0524';
    if (ctx.audio && ctx.out) {
      try {
        this.synth = new Synth(ctx.audio, ctx.out);
      } catch {
        this.synth = null;
      }
    }
    this.scene = new Scene(this.low, ctx.touch, ctx.player.color);
    this.fx = new Fx(this.low);
    this.pul = this.list.map(pulses);
    this.song = this.list[0]!;
    const c = this.cv.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('lostpointercapture', this.onUp);
    this.fit();
    this.startPreview();
    // keep the music scheduled even if a frame is late
    this.pumpTimer = setInterval(() => {
      if (this.paused || this.dead) return;
      this.pickSched?.pump();
      this.sched?.pump();
    }, 50);
    this.raf = requestAnimationFrame(this.frame);
    // lab only: let a test script look inside
    if (import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('dancedebug')) (window as unknown as { __dance?: unknown }).__dance = this;
  }

  // ---------------------------------------------------------------- the shell's calls

  pause(): void {
    if (this.paused || this.dead) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.clock?.pause();
    this.pickClock?.pause();
    this.pointers.clear();
    this.queued = [];
    this.taps = [];
    const a = this.ctx.audio;
    if (this.ended) this.synth?.fade(0, 0.3);
    else if (a && a.state === 'running') {
      this.suspendedByUs = true;
      void a.suspend().catch(() => {});
    }
  }

  resume(): void {
    if (!this.paused || this.dead) return;
    this.paused = false;
    const a = this.ctx.audio;
    if (a && this.suspendedByUs) {
      this.suspendedByUs = false;
      void a.resume().catch(() => {});
    }
    this.clock?.resume();
    this.pickClock?.resume();
    this.lastMs = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.pumpTimer);
    const c = this.cv.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('lostpointercapture', this.onUp);
    this.synth?.dispose();
    this.synth = null;
    // hand the audio back the way we found it
    if (this.suspendedByUs && this.ctx.audio) void this.ctx.audio.resume().catch(() => {});
    this.cv.dispose();
  }

  // ---------------------------------------------------------------- input

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.paused || this.dead) return;
    this.wakeAudio();
    const r = this.cv.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    try {
      this.cv.canvas.setPointerCapture(e.pointerId);
    } catch {
      // not capturable (synthetic event)
    }
    if (this.mode === 'play') {
      const lane = this.laneAt(x, y);
      this.pointers.set(e.pointerId, lane);
      const now = performance.now();
      const at = Math.abs(e.timeStamp - now) < 500 ? e.timeStamp : now;
      this.queued.push({ lane, at });
    } else this.taps.push({ x, y });
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private laneAt(x: number, y: number): number {
    const L = this.scene.L;
    const yy = clamp(y, L.top, L.h);
    const wy = widthAt(L, yy);
    return clamp(Math.floor(((x - (L.cx - wy / 2)) / wy) * 4), 0, 3);
  }

  /** D is ← in D F J K but → in W A S D: follow whichever set was used last. */
  private trackKeySet(): void {
    const I = this.ctx.input;
    if (I.keyPressed('KeyF') || I.keyPressed('KeyJ') || I.keyPressed('KeyK')) {
      this.dfjk = true;
      this.modeKnown = true;
    }
    if (I.keyPressed('KeyA') || I.keyPressed('KeyS') || I.keyPressed('KeyW')) {
      this.dfjk = false;
      this.modeKnown = true;
    }
  }

  /** Before we know the key set, a D press goes to ← or →, whichever has a note now. */
  private guessD(tp: number): number {
    const W = LEVELS[this.level]!.win[2];
    let best = 3;
    let bestD = Infinity;
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.t - tp > W) break;
      if (n.judged !== 0 || (n.lane !== 0 && n.lane !== 3)) continue;
      const d = Math.abs(n.t - tp);
      if (d <= W && d < bestD) {
        bestD = d;
        best = n.lane;
      }
    }
    return best;
  }

  /** Presses this frame: keys (arrows, WASD, DFJK), the gamepad's d-pad and taps on the lanes. */
  private presses(nowMs: number): { lane: number; at: number; d?: boolean }[] {
    const I = this.ctx.input;
    const out: { lane: number; at: number; d?: boolean }[] = [];
    this.trackKeySet();
    // keys are only seen once a frame: count them half a frame early
    const kat = nowMs - 8;
    const key = (code: string, lane: number): void => {
      if (I.keyPressed(code)) out.push({ lane, at: kat });
    };
    key('ArrowLeft', 0);
    key('ArrowDown', 1);
    key('ArrowUp', 2);
    key('ArrowRight', 3);
    key('KeyA', 0);
    key('KeyS', 1);
    key('KeyW', 2);
    if (I.keyPressed('KeyD')) out.push({ lane: this.dfjk ? 0 : 3, at: kat, d: !this.modeKnown });
    key('KeyF', 1);
    key('KeyJ', 2);
    key('KeyK', 3);
    for (const [b, lane, codes] of DIR_KEYS) if (I.pressed(b) && !codes.some((c) => I.keyPressed(c))) out.push({ lane, at: nowMs });
    out.push(...this.queued);
    this.queued = [];
    return out;
  }

  private held(lane: number): boolean {
    const I = this.ctx.input;
    const keys = [
      ['ArrowLeft', 'KeyA'],
      ['ArrowDown', 'KeyS', 'KeyF'],
      ['ArrowUp', 'KeyW', 'KeyJ'],
      ['ArrowRight', 'KeyK'],
    ][lane]!;
    if (keys.some((c) => I.key(c))) return true;
    if (I.key('KeyD') && lane === (this.modeKnown ? (this.dfjk ? 0 : 3) : this.dLane)) return true;
    for (const l of this.pointers.values()) if (l === lane) return true;
    const [b, , codes] = DIR_KEYS[lane]!;
    return I.down(b) && !codes.some((c) => I.key(c));
  }

  private wakeAudio(): void {
    const a = this.ctx.audio;
    if (a && a.state === 'suspended' && !this.paused && !this.suspendedByUs) void a.resume().catch(() => {});
  }

  // ---------------------------------------------------------------- the loop

  private frame = (ms: number): void => {
    if (this.dead || this.paused) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((ms - this.lastMs) / 1000, 0, 0.05);
    this.lastMs = ms;
    this.time += dt;
    try {
      this.fit();
      if (this.ctx.input.anyPressed()) this.wakeAudio();
      if (this.mode === 'pick') this.updatePick(dt);
      else this.updatePlay(dt);
      this.fx.update(dt, this.scene.L.s);
      this.render();
    } catch (err) {
      // one bad frame must not stop the dance: report it once and carry on
      if (!this.failed) console.error(err);
      this.failed = true;
    }
    this.ctx.input.frame();
  };

  private failed = false;

  private fit(): void {
    const { w, h } = this.cv.size();
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.scene.resize(w, h, this.ctx.dpr);
    this.sprites = arrowSprites(this.scene.L.note, this.ctx.dpr);
  }

  // ---------------------------------------------------------------- picking a song and a level

  private startPreview(): void {
    this.stopPreview();
    const song = this.list[this.songI]!;
    this.pickClock = new SongClock(this.ctx.audio);
    this.pickClock.start(song.preview[0], 0.08);
    const synth = this.synth;
    if (synth) {
      const sess = synth.session(song, 0.5, 0.6);
      this.pickSess = sess;
      this.pickSched = new Scheduler(song, this.pickClock, (e, at) => synth.play(sess, e, at), () => false, song.preview, song.preview[0]);
    } else this.pickSched = new Scheduler(song, this.pickClock, () => {}, () => false, song.preview, song.preview[0]);
  }

  private stopPreview(): void {
    if (this.pickSess && this.synth) this.synth.cut(this.pickSess, 0.15);
    this.pickSess = null;
    this.pickSched = null;
    this.pickClock = null;
  }

  private updatePick(dt: number): void {
    this.enter = Math.min(1, this.enter + dt * 2.2);
    if (BOT && this.time > 0.6) {
      this.songI = BOT.song % this.list.length;
      this.level = BOT.level;
      this.startSong();
      return;
    }
    this.pickClock?.tick();
    this.pickSched?.pump();
    const I = this.ctx.input;
    this.trackKeySet();
    const n = this.list.length;
    const ok = I.pressed('a') || I.pressed('start');
    if (this.step === 0) {
      if (I.pressed('left') || I.pressed('right')) {
        this.songI = (this.songI + (I.pressed('right') ? 1 : -1) + n) % n;
        this.synth?.ui('move');
        this.startPreview();
      } else if (ok || I.pressed('down')) this.toLevels();
    } else {
      if (I.pressed('left') || I.pressed('right')) {
        const next = clamp(this.level + (I.pressed('right') ? 1 : -1), 0, 2) as Level;
        if (next !== this.level) this.synth?.ui('move');
        this.level = next;
      } else if (ok) {
        this.startSong();
        return;
      } else if (I.pressed('b') || I.pressed('up')) {
        this.step = 0;
        this.enter = 0;
        this.synth?.ui('back');
      }
    }
    const L = this.scene.L;
    for (const tap of this.taps) {
      if (this.step === 1 && this.ctx.touch) {
        const b = backButton(L);
        if (tap.x >= b.x && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h) {
          this.step = 0;
          this.enter = 0;
          this.synth?.ui('back');
          break;
        }
      }
      const cards = pickCards(L, this.step === 0 ? n : 3);
      const i = cards.findIndex((c) => tap.x >= c.x - 10 && tap.x <= c.x + c.w + 10 && tap.y >= c.y - 10 && tap.y <= c.y + c.h + 10);
      if (i < 0) continue;
      if (this.step === 0) {
        if (i !== this.songI) {
          this.songI = i;
          this.startPreview();
        }
        this.toLevels();
      } else {
        this.level = i as Level;
        this.startSong();
        break;
      }
    }
    this.taps = [];
  }

  private toLevels(): void {
    this.step = 1;
    this.enter = 0;
    this.synth?.ui('pick');
  }

  // ---------------------------------------------------------------- playing

  private startSong(): void {
    this.stopPreview();
    this.synth?.ui('go');
    this.song = this.list[this.songI]!;
    this.chart = buildChart(this.song, this.level);
    this.notes = this.chart.notes;
    this.first = 0;
    this.drawFrom = 0;
    this.clock = new SongClock(this.ctx.audio);
    const from = BOT ? BOT.from : 0;
    if (from > 0) for (const n of this.notes) if (n.t < from) this.hit(n, 1, 0);
    this.clock.start(from - LEAD_IN, 0.1);
    const synth = this.synth;
    if (synth) {
      const sess = synth.session(this.song, 1);
      this.sched = new Scheduler(this.song, this.clock, (e, at) => synth.play(sess, e, at), () => this.fever, null, from - LEAD_IN);
    }
    this.mode = 'play';
    this.show = 0;
    this.taps = [];
  }

  private updatePlay(dt: number): void {
    const clock = this.clock!;
    clock.tick();
    this.sched?.pump();
    const t = clock.now();
    const L = this.scene.L;
    const lv = LEVELS[this.level]!;
    this.show = Math.min(1, this.show + dt * 1.4);
    const nowMs = performance.now();
    if (this.mode === 'play') {
      for (const p of this.presses(nowMs)) {
        const tp = t - (nowMs - p.at) / 1000;
        let lane = p.lane;
        if (p.d) lane = this.dLane = this.guessD(tp);
        this.lanes[lane]!.flash = Math.max(this.lanes[lane]!.flash, 0.2);
        this.press(lane, tp);
      }
    } else this.queued = [];
    if (BOT && this.mode === 'play')
      for (let i = this.first; i < this.notes.length; i++) {
        const n = this.notes[i]!;
        if (n.t > t) break;
        if (n.judged !== 0 || n.bot) continue;
        n.bot = true;
        if (Math.random() < BOT.hit) this.hit(n, Math.random() < 0.8 ? 1 : 2, 0);
      }
    for (let l = 0; l < 4; l++) this.lanes[l]!.down = this.mode === 'play' && (this.held(l) || (!!BOT && !!this.holds[l]));
    // hold notes
    for (let l = 0; l < 4; l++) {
      const n = this.holds[l];
      const lane = this.lanes[l]!;
      if (!n) {
        lane.holding = false;
        continue;
      }
      lane.holding = true;
      const x = laneX(L, l, L.hit);
      if (t >= n.end) {
        n.hs = 2;
        this.holds[l] = null;
        lane.holding = false;
        this.score += holdPoints(this.level, n, this.song, this.combo, this.chart!.scale);
        this.bump = 1;
        this.lit[l] = 1;
        this.fx.ring(x, L.hit, L.note * 0.3, L.note * 1.2, LANE_COLOR[l]!, 0.4, 5 * L.s);
        this.fx.burst(x, L.hit, LANE_COLOR[l]!, this.low ? 6 : 12, 520 * L.s, true, L.s);
      } else if (!lane.down && t < n.end - 0.12) {
        n.hs = 3;
        this.holds[l] = null;
        lane.holding = false;
      } else {
        if (Math.random() < dt * (this.low ? 12 : 30)) this.fx.burst(x, L.hit, LANE_COLOR[l]!, 1, 320 * L.s, false, L.s);
        this.lit[l] = Math.max(this.lit[l]!, 0.45);
      }
    }
    // notes that went past
    const late = lv.win[2];
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.t > t - late) break;
      if (n.judged === 0) this.miss(n);
    }
    while (this.first < this.notes.length && this.notes[this.first]!.judged !== 0) this.first++;
    while (this.drawFrom < this.notes.length && Math.max(this.notes[this.drawFrom]!.t, this.notes[this.drawFrom]!.end) < t - 0.6) this.drawFrom++;
    // fades
    for (const ln of this.lanes) {
      ln.flash = Math.max(0, ln.flash - dt * 4);
      ln.shake = Math.max(0, ln.shake - dt * 4);
    }
    for (let l = 0; l < 4; l++) this.lit[l] = Math.max(0, this.lit[l]! - dt * 2.2);
    this.comboPulse = Math.max(0, this.comboPulse - dt * 6);
    this.bump = Math.max(0, this.bump - dt * 5);
    this.cheer = Math.max(0, this.cheer - dt * 0.5);
    this.feverAmt += ((this.fever ? 1 : 0) - this.feverAmt) * Math.min(1, dt * 4);
    if (this.feverAge >= 0) this.feverAge += dt;
    if (this.jv) this.jv.age += dt;
    if (this.milestone) {
      this.milestone.age += dt;
      if (this.milestone.age > 1.4) this.milestone = null;
    }
    this.shown += (this.score - this.shown) * Math.min(1, dt * 9);
    if (Math.abs(this.score - this.shown) < 1) this.shown = this.score;
    // the end of the song
    if (this.mode === 'play' && t >= this.song.end + late + 0.05 && this.first >= this.notes.length && this.holds.every((h) => !h)) this.toFinal();
    if (this.mode === 'final') this.updateFinal(dt);
  }

  private press(lane: number, tp: number): void {
    const W = LEVELS[this.level]!.win[2];
    let target: Note | null = null;
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.t - tp > W) break;
      if (n.judged !== 0 || n.lane !== lane) continue;
      if (tp - n.t > W) continue;
      target = n;
      break;
    }
    if (!target) return;
    const off = tp - target.t;
    this.hit(target, (judge(this.level, off) || 3) as Judgement, off);
  }

  private hit(n: Note, j: Judgement, off: number): void {
    const L = this.scene.L;
    n.judged = j;
    n.off = off;
    this.score += points(this.level, j, this.combo, this.chart!.scale);
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    this.counts[j]!++;
    this.comboPulse = 1;
    this.bump = 1;
    const x = laneX(L, n.lane, L.hit);
    const col = LANE_COLOR[n.lane]!;
    const lane = this.lanes[n.lane]!;
    lane.flash = 1;
    this.lit[n.lane] = 1;
    const perfect = j === 1;
    this.fx.burst(x, L.hit, col, (perfect ? 14 : j === 2 ? 9 : 5) * (this.low ? 0.5 : 1), (perfect ? 640 : 480) * L.s, perfect, L.s);
    this.fx.ring(x, L.hit, L.note * 0.35, L.note * (perfect ? 1.25 : 0.95), col, 0.32, 5 * L.s);
    this.jv = { j, age: 0, off };
    this.synth?.hit(n.lane, j, chordAt(this.song, n.t));
    if (n.hold) {
      n.hs = 1;
      this.holds[n.lane] = n;
    }
    if (!this.fever && feverOn(this.level, this.combo)) this.startFever();
    if (this.combo % 25 === 0) {
      this.milestone = { n: this.combo, age: 0 };
      this.cheer = 1;
      this.synth?.cheer(0.7);
    }
  }

  private miss(n: Note): void {
    const L = this.scene.L;
    n.judged = 4;
    this.counts[4]!++;
    this.combo = 0;
    if (this.fever) this.endFever();
    this.lanes[n.lane]!.shake = 1;
    this.fx.puff(laneX(L, n.lane, L.hit), L.hit, L.s);
    this.jv = { j: 4, age: 0, off: 0 };
    this.synth?.miss();
  }

  private startFever(): void {
    this.fever = true;
    this.feverAge = 0;
    this.cheer = 1;
    this.synth?.feverOn();
    this.fx.confetti(this.w, this.low ? 30 : 80, this.scene.L.s);
  }

  private endFever(): void {
    this.fever = false;
    this.feverAge = -1;
    this.synth?.feverOff();
  }

  private accuracy(): number {
    const total = this.notes.length || 1;
    let a = 0;
    for (let j = 1; j <= 4; j++) a += this.counts[j]! * ACC[j]!;
    return Math.round((a / total) * 100);
  }

  // ---------------------------------------------------------------- the end

  private toFinal(): void {
    this.mode = 'final';
    this.finalAge = 0;
    this.fireIn = 0.1;
    this.cheer = 1;
    this.synth?.cheer(1.6);
    this.fx.confetti(this.w, this.low ? 40 : 110, this.scene.L.s);
  }

  private updateFinal(dt: number): void {
    this.finalAge += dt;
    this.cheer = 1;
    const L = this.scene.L;
    this.fireIn -= dt;
    if (this.finalAge < 4.6 && this.fireIn <= 0) {
      this.fireIn = 0.32 + Math.random() * 0.3;
      // up from the crowd on either side, bursting over the sides of the stage and in the sky
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = L.cx + side * L.w * (0.2 + Math.random() * 0.25);
      const tx = L.cx + side * L.w * (0.16 + Math.random() * 0.28);
      const ty = L.h * (0.06 + Math.random() * 0.2);
      const fly = 0.7 + Math.random() * 0.3;
      const big = Math.random() < 0.35;
      this.fx.rocket(x, L.h, tx, ty, fly, LANE_COLOR[Math.floor(Math.random() * 4)]!, big);
      this.synth?.firework(fly, big);
    }
    const I = this.ctx.input;
    if (this.finalAge > 1.6 && (I.pressed('a') || I.pressed('start') || this.taps.length)) this.skip = true;
    this.taps = [];
    if (this.skip && this.finalAge < 5.2) this.finalAge = 5.2;
    if (this.finalAge >= 5.8) this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const detail = `${LEVELS[this.level]!.name} · ${this.accuracy()} % · bästa kombo ${this.best}`;
    this.ctx.end(Math.round(this.score), detail);
  }

  // ---------------------------------------------------------------- drawing

  private music(i: number, t: number, playing: boolean): Music {
    const song = this.list[i]!;
    const P = this.pul[i]!;
    const lead = song.lead;
    let lo = 0;
    let hi = lead.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (lead[m]!.t <= t) lo = m + 1;
      else hi = m;
    }
    const ln = lead[lo - 1];
    const leadOn = !!ln && t < ln.t + ln.d * 0.95;
    const sec = sectionAt(song, t);
    return {
      t,
      beat: t / song.spb,
      kick: P.kick.since(t),
      snare: P.snare.since(t),
      hat: P.hat.since(t),
      crash: P.crash.since(t),
      bass: P.bass.since(t),
      stab: P.stab.since(t),
      leadOn,
      leadSince: ln ? t - ln.t : 99,
      chord: chordAt(song, Math.max(0, t)),
      section: sec.k,
      energy: t < 0 ? 0.2 : t > song.end + 0.2 ? 0.3 : playing ? ENERGY[sec.k] : 0.55,
    };
  }

  private render(): void {
    const g = this.g;
    const dpr = this.ctx.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const L = this.scene.L;
    const sp = this.sprites!;
    if (this.mode === 'pick') {
      const t = this.pickSched && this.pickClock ? this.pickSched.songTime(this.pickClock.now()) : 0;
      const m = this.music(this.songI, t, false);
      const mood: Mood = { time: this.time, fever: 0, lit: [0, 0, 0, 0], cheer: 0, pose: 0, sign: Math.floor(this.time * 5) % 13, dim: 0.6 };
      this.scene.drawBack(g, m, mood);
      this.scene.drawBall(g, m, mood);
      this.fx.draw(g);
      drawPick(g, L, {
        step: this.step,
        song: this.songI,
        level: this.level,
        songs: this.list.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb })),
        levels: LEVELS.map((l, i) => ({ name: l.name, blurb: LEVEL_BLURB[i]! })),
        enter: this.enter,
        beat: m.beat,
        time: this.time,
        touch: this.ctx.touch,
      });
      return;
    }
    const t = this.clock!.now();
    const m = this.music(this.songI, t, true);
    const lv = LEVELS[this.level]!;
    const pose = clamp((t - this.song.end) / 0.35, 0, 1);
    const tiers = lv.tiers;
    // the finale is a party whatever happened
    const party = this.mode === 'final' ? Math.max(this.feverAmt, clamp(this.finalAge / 0.6, 0, 1)) : this.feverAmt;
    const mood: Mood = {
      time: this.time,
      fever: party,
      lit: this.lit,
      cheer: this.cheer,
      pose,
      sign: this.fever || pose > 0 ? 9 : Math.floor((9 * this.combo) / tiers[2]),
      dim: 0,
    };
    this.scene.drawBack(g, m, mood);
    const fade = this.mode === 'final' ? clamp(1 - this.finalAge / 0.8, 0, 1) : 1;
    drawHighway(g, L, sp, {
      t,
      scroll: lv.scroll,
      notes: this.notes,
      first: this.drawFrom,
      lanes: this.lanes,
      show: this.show * fade,
      fever: this.feverAmt,
      kick: decay(m.kick, 8),
      time: this.time,
      song: this.song,
      guide: this.level === 0,
    });
    this.scene.drawBall(g, m, mood);
    this.fx.draw(g);
    if (this.mode === 'play') {
      drawJudge(g, L, this.jv, this.time);
      if (this.feverAge < 0 || this.feverAge > 1.7) drawCombo(g, L, this.combo, multFor(this.level, this.combo), this.comboPulse, this.feverAmt, this.time);
      if (this.milestone) drawMilestone(g, L, this.milestone.n, this.milestone.age);
      drawFeverBanner(g, L, this.feverAge, this.time);
      drawCountdown(g, L, t, this.song.spb, 'Gör dig redo!', this.ctx.touch ? 'Tryck på fälten när pilarna når linjen' : 'Tryck ← ↓ ↑ → när pilarna når linjen');
    }
    drawHud(g, L, {
      score: this.shown,
      mult: multFor(this.level, this.combo),
      fever: this.feverAmt,
      song: this.song.name,
      level: lv.name,
      progress: t / this.song.end,
      player: this.ctx.player.color,
      time: this.time,
      bump: this.bump,
    });
    if (this.mode === 'final') {
      const acc = this.accuracy();
      const out = clamp((this.finalAge - 5.2) / 0.45, 0, 1);
      g.save();
      g.globalAlpha = 1 - out;
      drawFinal(g, L, {
        age: this.finalAge - 0.7,
        title: acc >= 95 ? 'Fantastiskt!' : acc >= 85 ? 'Superbra!' : acc >= 65 ? 'Snyggt dansat!' : 'Bra kämpat!',
        stars: acc >= 90 ? 3 : acc >= 70 ? 2 : 1,
        counts: this.counts,
        best: this.best,
        score: this.score,
        acc,
        time: this.time,
      });
      g.restore();
    }
  }
}

function drawMilestone(g: G, L: { cx: number; top: number; hit: number; h: number }, n: number, age: number): void {
  const a = age < 1 ? 1 : 1 - (age - 1) / 0.4;
  const y = L.top + (L.hit - L.top) * 0.27 - age * 20;
  const px = clamp(L.h * 0.04, 14, 38);
  g.save();
  g.globalAlpha = clamp(a, 0, 1);
  g.font = `900 ${Math.round(px)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = px * 0.16;
  g.strokeStyle = '#1a0b2e';
  g.strokeText(`${n} i rad!`, L.cx, y);
  g.fillStyle = '#ffe04a';
  g.fillText(`${n} i rad!`, L.cx, y);
  g.restore();
}

const factory: GameFactory = (ctx) => new Dance(ctx);
export default factory;
