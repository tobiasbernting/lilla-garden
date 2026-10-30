// Snöbollskriget: a first-person snowball fight against living snowmen (see game.ts).
import type { GameFactory } from '../../types.ts';
import { SnowGame } from './game.ts';

const factory: GameFactory = (ctx) => new SnowGame(ctx);
export default factory;
