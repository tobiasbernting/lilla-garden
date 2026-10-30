// One run of Hönan Hilda: the level cards, playing, falling, the hen house and its tally, and the ending.
import * as A from './art.ts';
import type { Chip } from './audio.ts';
import { text } from './font.ts';
import { H, Screen, W } from './gfx.ts';
import { LEVELS } from './levels.ts';
import { drawHud, drawWorld } from './render.ts';
import { P_HEART, P_TEXT, World, type Ctl, type Hooks } from './world.ts';
import type { Input } from '../../input.ts';

const MAX_HEARTS = 5;
const START_HEARTS = 3;
export const PTS = { egg: 10, gold: 500, bop: 100, check: 50, clear: 500, timePerSec: 10, allEggs: 300, heart: 300 };

type State = 'intro' | 'play' | 'fell' | 'home' | 'tally' | 'out' | 'over' | 'final';

interface TallyLine {
  label: string;
  value: string;
  pts: number;
}

export interface GameDeps {
  chip: Chip;
  quality: 'high' | 'low';
  end: (score: number, detail: string) => void;
  /** Start at this level (0-based) and column; the lab's level select. */
  startLevel?: number;
  startCol?: number;
}

export class Game {
  score = 0;
  hearts = START_HEARTS;
  eggs = 0;
  golds = 0;
  bops = 0;
  level = 0;
  world!: World;
  state: State = 'intro';
  /** Time in the state. */
  t = 0;
  time = 0;
  private deps: GameDeps;
  private tally: TallyLine[] = [];
  private tallyShown = 0;
  private tallyScore = 0;
  private tallyNext = 0;
  private ended = false;
  private fellWater = false;
  private eggRun = 0;
  private lastEgg = -9;
  private finalBonus = 0;

  constructor(deps: GameDeps) {
    this.deps = deps;
    this.level = Math.max(0, Math.min(LEVELS.length - 1, deps.startLevel ?? 0));
    this.startLevel();
    if (deps.startCol) this.world.placeAt(deps.startCol);
  }

  private hooks: Hooks = {
    sfx: (n) => this.deps.chip.sfx(n),
    egg: () => {
      this.score += PTS.egg;
      this.eggs++;
      // eggs picked up one after another climb up the scale
      this.eggRun = this.time - this.lastEgg < 0.7 ? Math.min(12, this.eggRun + 1) : 0;
      this.lastEgg = this.time;
      this.deps.chip.sfx('egg', this.eggRun);
    },
    gold: (e) => {
      this.score += PTS.gold;
      this.golds++;
      this.deps.chip.sfx('gold');
      this.world.part(P_TEXT, e.x + 4, e.y - 4, 0, -22, 1.1, 0, 0, `+${PTS.gold}`);
      if (this.hearts < MAX_HEARTS) {
        this.hearts++;
        this.deps.chip.sfx('heart');
        for (let i = 0; i < 3; i++) this.world.part(P_HEART, e.x + 4 + (i - 1) * 6, e.y + 2, (i - 1) * 16, -50, 1.2, 40);
      }
    },
    bop: (e, chain) => {
      const pts = PTS.bop * chain + (e.n ? PTS.bop : 0);
      this.score += pts;
      this.bops++;
      this.deps.chip.sfx('bop', chain);
      this.world.part(P_TEXT, e.x + e.w / 2, e.y - 6, 0, -26, 0.9, 0, 0, `+${pts}`);
    },
    checkpoint: () => {
      this.score += PTS.check;
      this.deps.chip.sfx('checkpoint');
    },
    hurt: () => {
      if (this.state !== 'play') return true;
      this.hearts = Math.max(0, this.hearts - 1);
      this.deps.chip.sfx('hurt');
      if (this.hearts <= 0) {
        this.gameOver();
        return false;
      }
      return true;
    },
    fell: (water) => {
      if (this.state !== 'play') return;
      this.hearts = Math.max(0, this.hearts - 1);
      this.fellWater = water;
      this.deps.chip.sfx(water ? 'splash' : 'fall');
      this.world.hen.hidden = true;
      this.set('fell');
    },
    home: () => {
      if (this.state !== 'play') return;
      this.deps.chip.stopMusic();
      this.deps.chip.jingle('clear');
      this.set('home');
    },
  };

  private set(s: State): void {
    this.state = s;
    this.t = 0;
  }

  private startLevel(): void {
    // a rest in the hen house: every level starts with at least three hearts (extra ones are kept)
    this.hearts = Math.max(this.hearts, START_HEARTS);
    this.world = new World(LEVELS[this.level]!, this.hooks, this.deps.quality);
    this.set('intro');
    this.deps.chip.stopMusic();
    this.deps.chip.jingle('start');
  }

  private gameOver(): void {
    this.set('over');
    this.deps.chip.stopMusic();
    this.deps.chip.jingle('over');
  }

  // ------------------------------------------------------------------ update

  update(dt: number, input: Input): void {
    this.time += dt;
    this.t += dt;
    const jump = input.pressed('a') || input.pressed('b') || input.pressed('up');
    const hold = input.down('a') || input.down('b') || input.down('up');
    const sx = input.stick(0).x;
    const ctl: Ctl = { x: Math.abs(sx) > 0.3 ? Math.sign(sx) : 0, jump, hold };
    const skip = jump || input.pressed('start');
    const w = this.world;
    switch (this.state) {
      case 'intro':
        w.tick(dt);
        if (skip && this.t > 0.5 && this.t < 1.9) this.t = 1.9;
        if (this.t >= 2.25) {
          this.set('play');
          this.deps.chip.music(LEVELS[this.level]!.tune);
        }
        break;
      case 'play':
        w.update(dt, ctl);
        break;
      case 'fell':
        w.tick(dt);
        if (this.t >= 1.1) {
          if (this.hearts <= 0) {
            this.gameOver();
            break;
          }
          w.respawn();
          this.set('play');
        }
        break;
      case 'home':
        w.update(dt, { x: 0, jump: false, hold: false });
        if (w.hen.hidden && this.t > 1.2) this.beginTally();
        break;
      case 'tally':
        w.tick(dt);
        this.updateTally(dt, skip);
        break;
      case 'out':
        w.tick(dt);
        if (this.t >= 0.45) {
          if (this.level + 1 < LEVELS.length) {
            this.level++;
            this.startLevel();
          } else this.beginFinal();
        }
        break;
      case 'over':
        if (this.t < 0.9) w.update(dt, { x: 0, jump: false, hold: false });
        else w.tick(dt);
        if (this.t > 3.4 || (skip && this.t > 1.6)) this.finish(`Bana ${this.level + 1} av ${LEVELS.length} · ${this.eggs} ägg`);
        break;
      case 'final':
        this.updateFinal(dt, skip);
        break;
    }
  }

  private beginTally(): void {
    const w = this.world;
    const def = LEVELS[this.level]!;
    const secs = Math.floor(w.clock);
    const timeBonus = Math.max(0, Math.round((def.par - w.clock) * PTS.timePerSec / 10) * 10);
    this.tally = [
      { label: 'ÄGG', value: `${w.eggsGot}/${w.eggs}`, pts: 0 },
      { label: 'GULDÄGG', value: `${w.goldsGot}/${w.golds}`, pts: 0 },
      { label: 'BANAN KLAR', value: '', pts: PTS.clear },
      { label: `TID ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, value: '', pts: timeBonus },
    ];
    if (w.eggsGot === w.eggs && w.eggs > 0) this.tally.push({ label: 'ALLA ÄGG!', value: '', pts: PTS.allEggs });
    this.tallyShown = 0;
    this.tallyScore = this.score;
    this.tallyNext = 0.5;
    this.set('tally');
  }

  private updateTally(dt: number, skip: boolean): void {
    const chip = this.deps.chip;
    // show the lines one at a time, counting the points into the score
    if (this.tallyShown < this.tally.length) {
      this.tallyNext -= dt;
      if (skip) this.tallyNext = Math.min(this.tallyNext, 0);
      if (this.tallyNext <= 0) {
        const line = this.tally[this.tallyShown]!;
        this.score += line.pts;
        this.tallyShown++;
        this.tallyNext = 0.42;
        chip.sfx(line.pts > 0 ? 'bigtick' : 'blip');
        if (this.tallyShown === this.tally.length) this.t = 0;
      }
    } else if (this.t > 1.6 || (skip && this.t > 0.3)) this.set('out');
    if (this.tallyScore < this.score) {
      const before = this.tallyScore;
      this.tallyScore = Math.min(this.score, this.tallyScore + Math.max(10, (this.score - this.tallyScore) * dt * 6));
      if (Math.floor(before / 50) !== Math.floor(this.tallyScore / 50)) chip.sfx('tick');
    }
  }

  private beginFinal(): void {
    this.finalBonus = this.hearts * PTS.heart;
    this.tallyScore = this.score;
    this.score += this.finalBonus;
    this.set('final');
    this.deps.chip.stopMusic();
    this.deps.chip.jingle('final');
  }

  private updateFinal(dt: number, skip: boolean): void {
    if (this.t > 2.2 && this.tallyScore < this.score) {
      const before = this.tallyScore;
      this.tallyScore = Math.min(this.score, this.tallyScore + Math.max(10, (this.score - this.tallyScore) * dt * 5));
      if (Math.floor(before / 50) !== Math.floor(this.tallyScore / 50)) this.deps.chip.sfx('tick');
    }
    if (this.t > 7 || (skip && this.t > 3.5)) {
      this.tallyScore = this.score;
      this.finish(`Alla ${LEVELS.length} banor · ${this.eggs} ägg`);
    }
  }

  private finish(detail: string): void {
    if (this.ended) return;
    this.ended = true;
    this.deps.chip.stopMusic();
    this.deps.end(Math.round(this.score), detail);
  }

  // ------------------------------------------------------------------ drawing

  /** Draw the frame; returns the fade for the LCD (−3 white … 3 black). */
  draw(s: Screen): number {
    const w = this.world;
    const t = this.time;
    switch (this.state) {
      case 'intro': {
        if (this.t < 1.9) {
          this.drawIntro(s);
          return this.t < 0.2 ? -Math.round((0.2 - this.t) * 15) : 0;
        }
        drawWorld(s, w, t);
        drawHud(s, w, this);
        const k = this.t - 1.9;
        return k < 0.15 ? -3 : -Math.max(0, Math.round((0.35 - k) * 15));
      }
      case 'final':
        this.drawFinal(s);
        return this.t < 0.3 ? -Math.round((0.3 - this.t) * 10) : 0;
      default:
        break;
    }
    drawWorld(s, w, t);
    drawHud(s, w, this);
    if (this.state === 'fell') {
      const k = this.t;
      return k > 0.75 ? -Math.min(3, Math.round((k - 0.75) * 14)) : 0;
    }
    if (this.state === 'tally') this.drawTally(s);
    if (this.state === 'out') {
      this.drawTally(s);
      return -Math.min(3, Math.round(this.t * 8));
    }
    if (this.state === 'over' && this.t > 0.9) this.drawOver(s);
    return 0;
  }

  private drawIntro(s: Screen): void {
    const def = LEVELS[this.level]!;
    s.clear(3);
    s.box(6, 6, W - 12, H - 12, 1);
    s.box(8, 8, W - 16, H - 16, 2);
    text(s, `BANA ${this.level + 1}`, W / 2, 26, 0, { scale: 2, align: 'center' });
    text(s, def.name, W / 2, 52, 1, { scale: 2, align: 'center' });
    // hearts and eggs so far
    const n = Math.max(3, this.hearts);
    const hx = W / 2 - (n * 8) / 2;
    for (let i = 0; i < n; i++) s.blit(i < this.hearts ? A.HEART : A.HEART_EMPTY, hx + i * 8, 78);
    // Hilda trots in along a strip of grass
    s.rect(14, 118, W - 28, 1, 1);
    for (let x = 16; x < W - 16; x += 4) s.px(x + ((x >> 2) & 1), 117, 2);
    const hxp = Math.min(W / 2 - 8, -16 + this.t * 70);
    const walking = hxp < W / 2 - 8;
    const spr = walking ? (Math.floor(this.t * 10) % 2 ? A.HEN.runA : A.HEN.runB) : Math.floor(this.t * 3) % 2 ? A.HEN.happy : A.HEN.stand;
    s.blit(spr, Math.round(hxp), 102 - (walking ? 0 : Math.floor(this.t * 3) % 2), false, [0, 1, 2, 3]);
    if (this.eggs > 0) {
      s.blit(A.EGG_ICON, W / 2 - 16, 92);
      text(s, `× ${this.eggs}`, W / 2 - 10, 91, 1);
    }
  }

  private drawTally(s: Screen): void {
    const x0 = 18;
    const y0 = 22;
    const ww = W - 36;
    const hh = 92;
    s.rect(x0, y0, ww, hh, 0);
    s.box(x0, y0, ww, hh, 3);
    s.box(x0 + 2, y0 + 2, ww - 4, hh - 4, 1);
    text(s, `BANA ${this.level + 1} KLAR!`, W / 2, y0 + 8, 3, { align: 'center' });
    for (let i = 0; i < this.tallyShown; i++) {
      const l = this.tally[i]!;
      const y = y0 + 22 + i * 10;
      text(s, l.label, x0 + 8, y, 3);
      text(s, l.pts > 0 ? `+${l.pts}` : l.value, x0 + ww - 8, y, l.pts > 0 ? 2 : 3, { align: 'right' });
    }
    s.rect(x0 + 6, y0 + hh - 16, ww - 12, 1, 2);
    text(s, 'POÄNG', x0 + 8, y0 + hh - 11, 3);
    text(s, String(Math.floor(this.tallyScore)), x0 + ww - 8, y0 + hh - 11, 3, { align: 'right' });
  }

  private drawOver(s: Screen): void {
    const k = Math.min(1, (this.t - 0.9) / 0.3);
    const ww = Math.round(124 * k);
    const x0 = (W - ww) / 2;
    s.rect(x0, 34, ww, 76, 3);
    s.box(x0 + 2, 36, ww - 4, 72, 1);
    if (k < 1) return;
    text(s, 'HILDA ÄR TRÖTT', W / 2, 44, 0, { align: 'center' });
    s.blit(A.HEN.sit, W / 2 - 8, 62, false);
    const z = Math.floor(this.t * 2) % 3;
    s.blit(A.ZZZ, W / 2 + 8 + z * 2, 58 - z * 3, false, [1, 1, 1, 1]);
    text(s, 'BRA KÄMPAT!', W / 2, 86, 1, { align: 'center' });
    text(s, `${this.score} POÄNG`, W / 2, 97, 0, { align: 'center' });
  }

  private drawFinal(s: Screen): void {
    const t = this.t;
    s.clear(0);
    // sun rays
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.2;
      for (let r = 14; r < 120; r += 2) s.px(W / 2 + Math.cos(a) * r, 92 + Math.sin(a) * r * 0.8, 1);
    }
    for (let x = 0; x < W; x += 8) s.blit(A.TILES.meadow!.top, x, 120);
    s.rect(0, 128, W, 16, 2);
    s.blit(A.HOUSE, 118, 88);
    s.rect(131, 99, 6, 3, 0);
    // Hilda hops for joy among her chicks
    const hop = Math.abs(Math.sin(t * 5)) * 10;
    s.blit(hop > 4 ? A.HEN.happy : A.HEN.stand, W / 2 - 8, 104 - hop);
    for (let i = 0; i < 6; i++) {
      const born = 0.6 + i * 0.35;
      const x = 22 + i * 15 + (i >= 3 ? 34 : 0);
      if (t < born) s.blit(A.EGG, x + 1, 112);
      else {
        const j = Math.abs(Math.sin(t * 6 + i)) * (t - born < 0.3 ? 6 : 3);
        s.blit(A.CHICK, x, 112 - j, (i + Math.floor(t * 1.5)) % 2 === 0);
        if (t - born < 0.25) {
          s.px(x - 1, 110, 3);
          s.px(x + 8, 110, 3);
        }
      }
    }
    text(s, 'HURRA!', W / 2, 10, 3, { scale: 2, align: 'center', shadow: 1 });
    text(s, 'ALLA BANOR KLARA!', W / 2, 32, 3, { align: 'center' });
    if (t > 1.4) {
      text(s, `HJÄRTAN ${this.hearts} × ${PTS.heart}`, W / 2, 46, 2, { align: 'center' });
      text(s, `POÄNG ${Math.floor(this.tallyScore)}`, W / 2, 58, 3, { align: 'center' });
    }
  }
}
