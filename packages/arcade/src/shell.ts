// The arcade: a full-screen overlay over the farm game. The TV lists the family's games; a machine in
// Spelhallen goes straight to its game. Each game gets a title card, is played, can be paused, and ends
// on a result card with the score, records and (in Spelhallen) tickets. Rallyvärlden's garage ('rally') goes
// straight into a race or a drive and comes back to the garage: no restart in an online race, no tickets.
import { ARCADE, ARCADE_MAX_SCORE, POINTS_PER_TICKET, type ArcadeGame } from '@lilla-garden/shared';
import { GAMES } from './games.ts';
import { rallyOptions } from './games/rally/options.ts';
import { Input } from './input.ts';
import type { Button, GameContext, GameInstance, TouchLayout } from './types.ts';
import './shell.css';

export interface ScoreLine {
  name: string;
  score: number;
  /** This player's own line. */
  me?: boolean;
}

export interface ArcadeOptions {
  /** 'tv' lists the games at home; 'hall' is a machine in Spelhallen (one game, wins tickets); 'rally' is Rallyvärlden's garage starting a race or a drive (one game, straight in, no tickets). */
  where: 'tv' | 'hall' | 'rally';
  /** Games that can be played. */
  games: ArcadeGame[];
  /** TV: games the family has not found yet (shown locked). */
  locked?: ArcadeGame[];
  /** Go straight to this game's card (a machine). */
  start?: ArcadeGame;
  player: { name: string; color: string };
  /** The family's best score in a game, best first (one line per player). */
  scores?: (game: ArcadeGame) => ScoreLine[];
  /** This player's own best score in a game. */
  best?: (game: ArcadeGame) => number;
  /** Spelhallen: the tickets a score wins (after today's limit). */
  tickets?: (score: number) => number;
  /** The farm game's sound is off. */
  muted?: () => boolean;
  /** A run ended with a score (send it to the server). */
  onResult?: (game: ArcadeGame, score: number) => void;
  onClose?: () => void;
  /** Where to put the overlay (default document.body). */
  parent?: HTMLElement;
  /** Lab: skip the title card and start playing. */
  autostart?: boolean;
  /** Force the touch controls on (or off). */
  touch?: boolean;
  /** Passed to the game as `ctx.options` (Rallyvärlden's RallyOptions). */
  options?: unknown;
}

export interface ArcadeHandle {
  close(): void;
}

export function openArcade(opts: ArcadeOptions): ArcadeHandle {
  const a = new Arcade(opts);
  return { close: () => a.close() };
}

type State = 'menu' | 'title' | 'loading' | 'playing' | 'paused' | 'result' | 'error';

const fmtScore = (n: number): string => Math.round(n).toLocaleString('sv-SE');
const MEDALS = ['🥇', '🥈', '🥉'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}

class Arcade {
  private root = el('div', 'arcade');
  private stage = el('div', 'arc-stage');
  private touchEl = el('div', 'arc-touch');
  private bar = el('div', 'arc-bar');
  private card = el('div', 'arc-card');
  private input = new Input();
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private state: State = 'menu';
  private game: ArcadeGame | null = null;
  private inst: GameInstance | null = null;
  /** Guards against a game that finished loading after the player left. */
  private run = 0;
  private focusables: HTMLElement[] = [];
  private focusAt = 0;
  private raf = 0;
  private closed = false;
  private touch: boolean;
  private quality: 'high' | 'low';

  constructor(private opts: ArcadeOptions) {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.touch = opts.touch ?? coarse;
    const small = Math.min(screen.width, screen.height) < 700;
    this.quality = coarse || small ? 'low' : 'high';
    this.root.append(this.stage, this.touchEl, this.bar, this.card);
    // the farm game behind must not get our taps, wheel turns or keys
    for (const t of ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'contextmenu', 'touchstart'] as const)
      this.root.addEventListener(t, (e) => {
        e.stopPropagation();
        if (t === 'contextmenu') e.preventDefault();
      });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onHidden);
    // a touch on a screen that also has a mouse: show the touch buttons from now on
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'touch' || this.touch || opts.touch === false) return;
        this.touch = true;
        if (this.state === 'playing' && this.game) this.buildTouch(GAMES[this.game].touch);
      },
      true,
    );
    // nothing in the farm game (like the chat box) keeps the keyboard
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    (opts.parent ?? document.body).append(this.root);

    const pause = el('button', 'arc-btn-round', '⏸');
    pause.title = 'Paus';
    pause.addEventListener('click', () => this.pause());
    this.bar.append(pause);

    if (opts.start) this.title(opts.start, opts.autostart);
    else this.menu();
    this.raf = requestAnimationFrame(this.tick);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.run++;
    this.stopGame();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.root.remove();
    void this.audio?.close().catch(() => {});
    this.opts.onClose?.();
  }

  // ---- input ----

  private onKey = (e: KeyboardEvent): void => {
    if (this.closed) return;
    // every key belongs to the arcade while it is open
    e.stopPropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) this.back();
      return;
    }
    if (this.input.keyEvent(e)) e.preventDefault();
  };

  /** Keys let go while the window is away would stay held, so let go of everything and pause. */
  private onBlur = (): void => {
    this.input.clear();
    if (this.state === 'playing') this.pause();
  };

  private onHidden = (): void => {
    if (document.visibilityState === 'hidden') this.onBlur();
  };

  /** The cards are driven by the same controller: arrows move, A / Start picks, B goes back. */
  private tick = (): void => {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.state === 'playing' || this.state === 'loading') return;
    const i = this.input;
    if (this.focusables.length) {
      if (i.pressed('left') || i.pressed('up')) this.moveFocus(-1);
      if (i.pressed('right') || i.pressed('down')) this.moveFocus(1);
      if (i.pressed('a') || i.pressed('start')) this.focusables[this.focusAt]?.click();
    }
    if (i.pressed('b')) this.back();
    i.frame();
  };

  private moveFocus(d: number): void {
    const n = this.focusables.length;
    this.focusAt = (this.focusAt + d + n) % n;
    this.focusables[this.focusAt]?.focus();
  }

  /** Escape / B: one step back. */
  private back(): void {
    switch (this.state) {
      case 'playing':
        this.pause();
        break;
      case 'paused':
        this.resume();
        break;
      case 'title':
      case 'result':
      case 'error':
        this.stopGame();
        if (this.opts.where === 'tv' && !this.opts.start) this.menu();
        else this.close();
        break;
      default:
        this.close();
    }
  }

  // ---- cards ----

  private set(state: State): void {
    this.state = state;
    this.root.dataset.state = state;
  }

  private show(card: HTMLElement, focus: HTMLElement[], color?: string): void {
    this.card.replaceChildren(card);
    this.card.style.display = '';
    this.card.style.setProperty('--c', color ?? '#ffd23f');
    this.focusables = focus;
    this.focusAt = 0;
    requestAnimationFrame(() => focus[0]?.focus({ preventScroll: true }));
  }

  private button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = el('button', primary ? 'arc-btn primary' : 'arc-btn', label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /** The TV: the family's games, and the ones still out there to find. */
  private menu(): void {
    this.set('menu');
    this.game = null;
    const tiles: HTMLElement[] = [];
    const grid = el('div', 'arc-grid');
    for (const id of this.opts.games) {
      const d = ARCADE[id];
      const t = el('button', 'arc-tile', el('span', 'arc-tile-emoji', d.emoji), el('b', null, d.name), el('small', null, d.tagline), el('i', 'arc-dims', GAMES[id].dims));
      t.style.setProperty('--c', d.color);
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        this.title(id);
      });
      tiles.push(t);
      grid.append(t);
    }
    for (const id of this.opts.locked ?? []) {
      const d = ARCADE[id];
      grid.append(el('div', 'arc-tile locked', el('span', 'arc-tile-emoji', '🔒'), el('b', null, d.name), el('small', null, 'Hittas ute i världen, eller i Spelhallens prisdisk')));
    }
    const close = this.button('✕ Stäng', () => this.close());
    this.show(el('div', 'arc-panel arc-menu', el('h1', null, '📺 TV-spel'), grid, el('div', 'arc-buttons', close)), [...tiles, close]);
  }

  /** Rallyvärlden's garage opened this: it has its own top list and money. */
  private get garage(): boolean {
    return this.opts.where === 'rally';
  }

  private topList(game: ArcadeGame, highlight?: number): HTMLElement | null {
    const lines = this.opts.scores?.(game) ?? [];
    if (!lines.length) return this.garage ? null : el('p', 'arc-empty', 'Ingen har spelat än. Bli först på topplistan!');
    const ol = el('ol', 'arc-top');
    lines.slice(0, 5).forEach((l, i) => {
      const li = el('li', l.me ? 'me' : null, el('span', null, MEDALS[i] ?? `${i + 1}.`), el('span', 'arc-top-name', l.name), el('span', 'arc-top-score', fmtScore(l.score)));
      if (l.me && highlight !== undefined && l.score === highlight) li.classList.add('new');
      ol.append(li);
    });
    return el('div', null, el('h3', null, 'Familjens topplista'), ol);
  }

  private title(game: ArcadeGame, autostart = false): void {
    this.stopGame();
    this.set('title');
    this.game = game;
    const d = ARCADE[game];
    const info = GAMES[game];
    if (autostart) {
      void this.play(game);
      return;
    }
    const how = el('ul', 'arc-how', ...(this.touch ? info.howTo.touch : info.howTo.keys).map((l) => el('li', null, l)));
    const play = this.button('▶ Spela', () => void this.play(game), true);
    const back = this.button(this.opts.where === 'tv' && !this.opts.start ? '← Tillbaka' : '✕ Stäng', () => this.back());
    const tix = this.opts.where === 'hall' ? el('p', 'arc-tix', `🎟️ En biljett per ${fmtScore(POINTS_PER_TICKET)} poäng`) : null;
    const card = el(
      'div',
      'arc-panel arc-title',
      el('i', 'arc-dims', info.dims),
      el('h1', null, el('span', 'arc-emoji', d.emoji), d.name),
      el('p', 'arc-tag', d.tagline),
      how,
      this.topList(game),
      tix,
      el('div', 'arc-buttons', play, back),
    );
    this.show(card, [play, back], d.color);
  }

  private loading(game: ArcadeGame): void {
    const d = ARCADE[game];
    this.card.replaceChildren(el('div', 'arc-panel arc-loading', el('span', 'arc-emoji spin', d.emoji), el('p', null, `Startar ${d.name}…`)));
    this.card.style.display = '';
    this.focusables = [];
  }

  private error(text: string): void {
    this.set('error');
    const back = this.button('← Tillbaka', () => this.back(), true);
    this.show(el('div', 'arc-panel', el('h1', null, '😵 Hoppsan!'), el('p', null, text), el('div', 'arc-buttons', back)), [back]);
  }

  // ---- playing ----

  private ensureAudio(): void {
    if (this.audio) {
      void this.audio.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audio = new AC();
      this.master = this.audio.createGain();
      this.master.gain.value = this.opts.muted?.() ? 0 : 0.8;
      this.master.connect(this.audio.destination);
      void this.audio.resume().catch(() => {});
    } catch {
      this.audio = null;
      this.master = null;
    }
  }

  private async play(game: ArcadeGame): Promise<void> {
    this.stopGame();
    const run = ++this.run;
    this.set('loading');
    this.game = game;
    this.ensureAudio();
    this.loading(game);
    let factory;
    try {
      factory = (await GAMES[game].load()).default;
    } catch (err) {
      console.error(err);
      if (run === this.run && !this.closed) this.error('Spelet gick inte att ladda. Kolla nätet och försök igen.');
      return;
    }
    if (run !== this.run || this.closed) return;
    this.input.clear();
    this.card.style.display = 'none';
    this.focusables = [];
    this.set('playing');
    this.buildTouch(GAMES[game].touch);
    let ended = false;
    const dprCap = this.quality === 'low' ? 1.5 : 2;
    const ctx: GameContext = {
      root: this.stage,
      input: this.input,
      audio: this.audio,
      out: this.master,
      player: this.opts.player,
      touch: this.touch,
      quality: this.quality,
      dpr: Math.min(window.devicePixelRatio || 1, dprCap),
      options: this.opts.options,
      end: (score, detail) => {
        if (ended || run !== this.run) return;
        ended = true;
        // let the game's last frame show behind the card
        queueMicrotask(() => this.finish(game, score, detail));
      },
      requestPause: () => {
        if (run === this.run && this.state === 'playing') this.pause();
      },
    };
    try {
      this.inst = factory(ctx);
    } catch (err) {
      console.error(err);
      this.stopGame();
      this.error('Spelet krånglade när det startade.');
    }
  }

  private pause(): void {
    if (this.state !== 'playing' || !this.inst) return;
    this.set('paused');
    this.input.clear();
    try {
      this.inst.pause();
    } catch (err) {
      console.error(err);
    }
    const go = this.button('▶ Fortsätt', () => this.resume(), true);
    // an online race (or a drive with the others) can't start over for one player: only leaving it
    const ro = this.garage ? rallyOptions(this.opts.options) : null;
    const again = ro?.room || ro?.mode === 'roam' ? null : this.button('↻ Börja om', () => this.game && void this.play(this.game));
    const quit = this.button('✕ Avsluta', () => {
      this.stopGame();
      // the garage: quitting ends the race or the drive and goes back there
      if (this.garage) this.close();
      else if (this.game) this.title(this.game);
    });
    const buttons = again ? [go, again, quit] : [go, quit];
    this.show(el('div', 'arc-panel arc-pause', el('h1', null, '⏸ Paus'), el('div', 'arc-buttons', ...buttons)), buttons, this.game ? ARCADE[this.game].color : undefined);
  }

  private resume(): void {
    if (this.state !== 'paused' || !this.inst) return;
    this.card.style.display = 'none';
    this.focusables = [];
    this.set('playing');
    this.input.clear();
    void this.audio?.resume().catch(() => {});
    try {
      // called straight from the click, so a game may grab the mouse again here
      this.inst.resume();
    } catch (err) {
      console.error(err);
    }
  }

  private finish(game: ArcadeGame, raw: number, detail?: string): void {
    if (this.closed) return;
    const score = Math.max(0, Math.min(ARCADE_MAX_SCORE, Math.round(Number.isFinite(raw) ? raw : 0)));
    try {
      this.inst?.pause();
    } catch (err) {
      console.error(err);
    }
    this.clearTouch();
    if (this.garage) return this.garageResult(game, detail);
    const best = this.opts.best?.(game) ?? 0;
    const family = this.opts.scores?.(game)[0]?.score ?? 0;
    const tickets = this.opts.where === 'hall' ? (this.opts.tickets?.(score) ?? 0) : 0;
    this.opts.onResult?.(game, score);
    this.set('result');
    const d = ARCADE[game];
    const records: (HTMLElement | null)[] = [];
    if (score > 0 && score > family) records.push(el('p', 'arc-record family', '👑 Nytt familjerekord!'));
    else if (score > 0 && score > best) records.push(el('p', 'arc-record', '🏆 Nytt personligt rekord!'));
    const again = this.button('↻ Spela igen', () => void this.play(game), true);
    const back = this.button(this.opts.where === 'tv' && !this.opts.start ? '← Fler spel' : '✕ Stäng', () => this.back());
    const card = el(
      'div',
      'arc-panel arc-result',
      el('h2', null, `${d.emoji} ${d.name}`),
      el('div', 'arc-score', fmtScore(score), el('small', null, ' poäng')),
      detail ? el('p', 'arc-detail', detail) : null,
      ...records,
      this.opts.where === 'hall' ? el('p', 'arc-won', tickets > 0 ? `🎟️ +${tickets} ${tickets === 1 ? 'biljett' : 'biljetter'}` : '🎟️ Inga fler biljetter i dag') : null,
      el('div', 'arc-buttons', again, back),
    );
    this.show(card, [again, back], d.color);
  }

  /** Rallyvärlden: the game's own line (place, time, medal, kr) big, and the way back to the garage. */
  private garageResult(game: ArcadeGame, detail?: string): void {
    this.set('result');
    const d = ARCADE[game];
    const back = this.button('🏁 Tillbaka till garaget', () => this.close(), true);
    const card = el('div', 'arc-panel arc-result arc-garage', el('h2', null, `${d.emoji} ${d.name}`), detail ? el('p', 'arc-detail big', detail) : null, this.topList(game), el('div', 'arc-buttons', back));
    this.show(card, [back], d.color);
  }

  private stopGame(): void {
    this.clearTouch();
    if (this.inst) {
      const inst = this.inst;
      this.inst = null;
      try {
        inst.destroy();
      } catch (err) {
        console.error(err);
      }
    }
    this.stage.replaceChildren();
    this.stage.removeAttribute('style');
  }

  // ---- touch controls ----

  private clearTouch(): void {
    this.touchEl.replaceChildren();
    this.input.touchStickMove(0, 0);
  }

  private hold(node: HTMLElement, b: Button): void {
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      node.setPointerCapture(e.pointerId);
      node.classList.add('down');
      this.input.touchButton(b, true);
    };
    const up = (e: PointerEvent): void => {
      e.stopPropagation();
      if (!node.classList.contains('down')) return;
      node.classList.remove('down');
      this.input.touchButton(b, false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
  }

  private buildTouch(layout: TouchLayout): void {
    this.clearTouch();
    if (!this.touch) return;
    const left = el('div', `arc-pad ${layout.pad}`);
    if (layout.pad === 'dpad' || layout.pad === 'leftright') {
      const dirs: [Button, string][] = layout.pad === 'dpad' ? [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']] : [['left', '◀'], ['right', '▶']];
      for (const [b, label] of dirs) {
        const k = el('div', `arc-key ${b}`, label);
        this.hold(k, b);
        left.append(k);
      }
    } else if (layout.pad === 'stick') {
      const knob = el('div', 'arc-knob');
      const base = el('div', 'arc-stick', knob);
      let id = -1;
      const move = (e: PointerEvent): void => {
        const r = base.getBoundingClientRect();
        const rad = r.width / 2;
        let x = (e.clientX - (r.left + rad)) / rad;
        let y = (e.clientY - (r.top + rad)) / rad;
        const len = Math.hypot(x, y);
        if (len > 1) {
          x /= len;
          y /= len;
        }
        knob.style.transform = `translate(${x * rad * 0.6}px, ${y * rad * 0.6}px)`;
        this.input.touchStickMove(x, y);
      };
      base.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        id = e.pointerId;
        base.setPointerCapture(e.pointerId);
        move(e);
      });
      base.addEventListener('pointermove', (e) => {
        if (e.pointerId === id) move(e);
      });
      const end = (e: PointerEvent): void => {
        if (e.pointerId !== id) return;
        id = -1;
        knob.style.transform = '';
        this.input.touchStickMove(0, 0);
      };
      base.addEventListener('pointerup', end);
      base.addEventListener('pointercancel', end);
      left.append(base);
    }
    const right = el('div', 'arc-buttons-pad');
    layout.buttons.forEach((bt, i) => {
      const k = el('div', `arc-fire n${i}`, bt.label);
      this.hold(k, bt.button);
      right.append(k);
    });
    this.touchEl.append(left, right);
  }
}
