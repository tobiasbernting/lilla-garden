// Every minigame: its card info (from the game's own info.ts) and how to load it. The game code is
// loaded only when someone plays it, so Three.js and the games stay out of the farm game's bundle.
import type { ArcadeGame } from '@lilla-garden/shared';
import dance from './games/dance/info.ts';
import golf from './games/golf/info.ts';
import hen from './games/hen/info.ts';
import rally from './games/rally/info.ts';
import snow from './games/snow/info.ts';
import star from './games/star/info.ts';
import type { GameInfo } from './types.ts';

export const GAMES: Record<ArcadeGame, GameInfo> = {
  rally: { ...rally, load: () => import('./games/rally/index.ts') },
  snow: { ...snow, load: () => import('./games/snow/index.ts') },
  golf: { ...golf, load: () => import('./games/golf/index.ts') },
  hen: { ...hen, load: () => import('./games/hen/index.ts') },
  dance: { ...dance, load: () => import('./games/dance/index.ts') },
  star: { ...star, load: () => import('./games/star/index.ts') },
};
