// The arcade: the shell that plays the minigames over the farm game, and the games' card info.
export { openArcade, type ArcadeHandle, type ArcadeOptions, type ScoreLine } from './shell.ts';
export { GAMES } from './games.ts';
export type { GameContext, GameFactory, GameInstance, GameMeta } from './types.ts';
export type { RallyMode, RallyNet, RallyOptions, RemoteRacer } from './games/rally/options.ts';
/** Rallyvärlden's garage: the 3D car preview, loaded only when the garage opens (it brings Three.js). */
export const loadRallyPreview = (): Promise<typeof import('./games/rally/preview.ts')> => import('./games/rally/preview.ts');
