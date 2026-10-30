// The arcade lab: open any minigame without the game server. Scores live only on this page.
import { ARCADE, ARCADE_GAMES, ticketsFor, type ArcadeGame } from '@lilla-garden/shared';
import { openArcade } from './shell.ts';

const q = new URLSearchParams(location.search);
const log = document.getElementById('log')!;
const touchBox = document.getElementById('touch') as HTMLInputElement;
const mutedBox = document.getElementById('muted') as HTMLInputElement;
touchBox.checked = q.get('touch') === '1';
mutedBox.checked = q.has('muted');

const family: Record<string, { name: string; score: number }[]> = {
  rally: [{ name: 'Mormor', score: 9200 }],
  hen: [{ name: 'Elsa', score: 7400 }],
};
const mine: Partial<Record<ArcadeGame, number>> = {};

function open(where: 'tv' | 'hall', start?: ArcadeGame, autostart = false): void {
  openArcade({
    where,
    games: where === 'tv' ? ARCADE_GAMES.filter((g) => g !== 'star') : [...ARCADE_GAMES],
    locked: where === 'tv' ? ['star'] : [],
    start,
    autostart,
    touch: touchBox.checked || undefined,
    player: { name: 'Labbet', color: '#e8412c' },
    scores: (g) =>
      [...(family[g] ?? []), ...(mine[g] ? [{ name: 'Labbet', score: mine[g]!, me: true }] : [])].sort((a, b) => b.score - a.score),
    best: (g) => mine[g] ?? 0,
    tickets: ticketsFor,
    muted: () => mutedBox.checked,
    onResult: (g, score) => {
      mine[g] = Math.max(mine[g] ?? 0, score);
      log.textContent = `${new Date().toLocaleTimeString('sv-SE')} ${ARCADE[g].name}: ${score} poäng\n${log.textContent}`;
    },
  });
}

const games = document.getElementById('games')!;
const tv = document.createElement('button');
tv.textContent = '📺 TV:n';
tv.onclick = () => open('tv');
games.append(tv);
for (const g of ARCADE_GAMES) {
  const b = document.createElement('button');
  b.textContent = `${ARCADE[g].emoji} ${ARCADE[g].name}`;
  b.style.background = ARCADE[g].color;
  b.onclick = () => open('hall', g);
  games.append(b);
}

const play = q.get('play');
const game = q.get('game');
if (play && play in ARCADE) open('hall', play as ArcadeGame, true);
else if (game && game in ARCADE) open('hall', game as ArcadeGame);
else if (q.has('tv')) open('tv');
