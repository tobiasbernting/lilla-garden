// Minigames: played on the TV at home and on the machines in Spelhallen. The games themselves live in
// packages/arcade; the sim only knows their names, how a score turns into tickets, and who has which game.

export const ARCADE_GAMES = ['rally', 'snow', 'golf', 'hen', 'dance', 'star'] as const;
export type ArcadeGame = (typeof ARCADE_GAMES)[number];
export const isArcadeGame = (s: unknown): s is ArcadeGame => typeof s === 'string' && (ARCADE_GAMES as readonly string[]).includes(s);

export interface ArcadeGameDef {
  id: ArcadeGame;
  name: string;
  emoji: string;
  /** The machine's and the card's colour. */
  color: string;
  /** One line under the name. */
  tagline: string;
}

export const ARCADE: Record<ArcadeGame, ArcadeGameDef> = {
  rally: { id: 'rally', name: 'Rallyt', emoji: '🏎️', color: '#e8412c', tagline: 'Kör ikapp på vägarna runt gården' },
  snow: { id: 'snow', name: 'Snöbollskriget', emoji: '❄️', color: '#5fb7ff', tagline: 'Träffa snögubbarna innan de träffar dig' },
  golf: { id: 'golf', name: 'Minigolfen', emoji: '⛳', color: '#3fbf5f', tagline: 'Nio galna banor på bondgården' },
  hen: { id: 'hen', name: 'Hönan Hilda', emoji: '🐔', color: '#8bac0f', tagline: 'Hoppa, flaxa och samla ägg' },
  dance: { id: 'dance', name: 'Dansbanan', emoji: '🪩', color: '#ff4fd8', tagline: 'Dansa i takt till musiken' },
  star: { id: 'star', name: 'Stjärnstorm', emoji: '🚀', color: '#ffd23f', tagline: 'Försvara rymdbasen mot stjärnstormen' },
};

/** Scores are whole points from 0 up to this; a good run is around 10 000. */
export const ARCADE_MAX_SCORE = 99_999;
/** In Spelhallen every this many points gives a ticket, at least one for playing and at most MAX_TICKETS_PER_GAME. */
export const POINTS_PER_TICKET = 500;
export const MAX_TICKETS_PER_GAME = 40;
/** The most tickets one player can win in a day, so the prizes stay special. */
export const MAX_TICKETS_PER_DAY = 300;

/** Tickets a score gives in Spelhallen (before the daily limit). */
export const ticketsFor = (score: number): number =>
  score <= 0 ? 0 : Math.max(1, Math.min(MAX_TICKETS_PER_GAME, Math.floor(score / POINTS_PER_TICKET)));
