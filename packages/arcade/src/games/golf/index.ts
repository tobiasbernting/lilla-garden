// Minigolfen: nine holes of crazy golf on little floating farm islands (see game.ts).
import type { GameFactory } from '../../types.ts';
import { startGolf } from './game.ts';

const factory: GameFactory = (ctx) => startGolf(ctx);
export default factory;
