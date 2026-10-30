// The contract between the arcade shell and a minigame.
//
// A game is a module under src/games/<id>/ whose default export is a GameFactory. The shell shows the
// title card, then calls the factory when the player presses Spela. The game plays ONE run (all its
// levels, laps or holes) and calls ctx.end(score) when it is over; the shell then shows the result and
// destroys the game. The shell pauses and resumes it (pause button, Escape, the tab hidden) and destroys
// it when the player quits.
import type { ArcadeGame } from '@lilla-garden/shared';
import type { Input } from './input.ts';

export type { ArcadeGame };

export interface GameContext {
  /**
   * Fills the screen (it may be resized at any time: watch it with a ResizeObserver). Put your canvas
   * in here, and listen for pointer events on your own elements, never on window or document.
   */
  root: HTMLElement;
  /** Keyboard, gamepad and the on-screen touch buttons as one controller. Keys only reach the game through this. */
  input: Input;
  /** The arcade's sound: connect everything to `out` (the shell mutes it). Null when the browser has no audio. */
  audio: AudioContext | null;
  out: AudioNode | null;
  /** The player, to dress the car or the hen in their colours. */
  player: { name: string; color: string };
  /** A touch screen: the shell shows the game's touch buttons; prefer big, forgiving controls. */
  touch: boolean;
  /** 'low' on phones and small tablets: fewer particles, no shadows, a lower pixel ratio. */
  quality: 'high' | 'low';
  /** The pixel ratio to render at (already capped for the quality). */
  dpr: number;
  /**
   * The run is over: whole points 0..99 999, higher is better (a first try around 1 000–5 000, a good
   * run around 10 000, a great one 20 000+). `detail` is one short Swedish line for the result card,
   * like "1:a plats · 2:31,4" or "Bana 7 av 9".
   */
  end(score: number, detail?: string): void;
  /** Ask the shell to pause (shows the pause card), e.g. when the mouse lock was lost. */
  requestPause(): void;
}

export interface GameInstance {
  /** Stop the clock, the music and the sound effects (keep the picture). */
  pause(): void;
  /** Carry on from where it paused (do not count the paused time). */
  resume(): void;
  /** Stop everything for good: cancel animation frames and timers, stop sounds, dispose WebGL and remove your elements. */
  destroy(): void;
}

export type GameFactory = (ctx: GameContext) => GameInstance;

/** A controller button. Keyboard: arrows/WASD, A = Space/Z/J, B = X/K/Shift, C = C/L, Start = Enter. */
export type Button = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'c' | 'start';

/** The touch controls the shell draws over the game on touch screens. */
export interface TouchLayout {
  /**
   * Left thumb: 'dpad' four arrows, 'leftright' two big arrows, 'stick' an analog stick
   * (also sets the direction buttons), 'none' nothing.
   */
  pad: 'dpad' | 'leftright' | 'stick' | 'none';
  /** Right thumb: up to three round buttons. */
  buttons: { button: Button; label: string }[];
}

/**
 * What the shell knows about a game besides its name, colour and tagline (ARCADE in the shared
 * package). Each game exports one from its own src/games/<id>/info.ts.
 */
export interface GameMeta {
  id: ArcadeGame;
  /** 2D or 3D, shown on the card. */
  dims: '2D' | '3D';
  /** How to play: a few short Swedish lines for keyboard (and gamepad) players and for touch screens. */
  howTo: { keys: string[]; touch: string[] };
  touch: TouchLayout;
}

export interface GameInfo extends GameMeta {
  load: () => Promise<{ default: GameFactory }>;
}
