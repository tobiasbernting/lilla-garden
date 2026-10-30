// The TV and Spelhallen's machines: opens the minigames (packages/arcade) over the game and sends the scores.
// Shared by all three clients; each one pauses its own world view while a game is open.
import { openArcade, type ArcadeHandle } from '@lilla-garden/arcade';
import { ARCADE_GAMES, ITEMS, MAX_TICKETS_PER_DAY, familyGames, ticketsFor, type PlayerState } from '@lilla-garden/shared';
import { net } from '../net.ts';
import { hushAmbience, isMuted } from '../sound.ts';
import { activeWorld, bus, client, myPlayer } from '../state.ts';

let current: ArcadeHandle | null = null;
/** A score that finished while the connection was down, sent when it is back. */
let pending: { game: string; score: number } | null = null;

/** The player's colour (their shirt's), for their car, hen or rocket. */
const colorOf = (p: PlayerState): string => (p.outfit.shirt ? ITEMS[p.outfit.shirt]?.clothing?.color : undefined) ?? '#e8412c';

/** Everyone in the family who has played a game, best first. */
export function familyScores(game: string): { id: string; name: string; score: number; me: boolean }[] {
  return Object.values(client.world?.players ?? {})
    .map((p) => ({ id: p.id, name: p.name, score: p.arcade?.best[game] ?? 0, me: p.id === client.me }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Tickets this player can still win today (the server keeps the same count). */
export function ticketsLeftToday(): number {
  const a = myPlayer()?.arcade;
  return Math.max(0, MAX_TICKETS_PER_DAY - (a && a.day === client.day ? a.won : 0));
}

export const isArcadeOpen = (): boolean => current !== null;

/** Opens the arcade when the server says the TV or a machine was turned on. `onOpen` pauses the world view. */
export function initArcade(onOpen: (open: boolean) => void): void {
  bus.on('open', (c) => {
    if (c.ui !== 'arcade' || current) return;
    const me = myPlayer();
    const world = activeWorld();
    const farm = client.world;
    const obj = c.id !== undefined ? world?.objects[c.id] : undefined;
    if (!me || !farm || !obj) return;
    const game = obj.kind === 'arcade_machine' ? (ARCADE_GAMES[obj.variant ?? 0] ?? ARCADE_GAMES[0]) : undefined;
    const games = game ? [game] : familyGames(farm);
    current = openArcade({
      where: game ? 'hall' : 'tv',
      games,
      locked: game ? [] : ARCADE_GAMES.filter((g) => !games.includes(g)),
      start: game,
      player: { name: me.name, color: colorOf(me) },
      scores: (g) => familyScores(g),
      best: (g) => myPlayer()?.arcade?.best[g] ?? 0,
      tickets: (score) => Math.min(ticketsFor(score), ticketsLeftToday()),
      muted: isMuted,
      onResult: (g, score) => {
        if (net.connected()) net.send({ t: 'arcade', game: g, score });
        else pending = { game: g, score };
      },
      onClose: () => {
        current = null;
        hushAmbience(false);
        onOpen(false);
      },
    });
    hushAmbience(true);
    onOpen(true);
  });
  // a game keeps going through a short break in the connection; its score goes when it is back
  bus.on('connection', (s) => {
    if (s !== 'open' || !pending) return;
    net.send({ t: 'arcade', ...pending });
    pending = null;
  });
}
