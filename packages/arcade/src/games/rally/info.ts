import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'rally',
  dims: '3D',
  howTo: {
    keys: [
      '↑ / W gasar, ↓ / S bromsar och backar',
      '← → / A D styr · Mellanslag: handbroms – sladda länge för turbo!',
      'L: nitro (har bilen turbo) · C / Enter: byter kamera · R: tillbaka på vägen',
      'Handkontroll: RT gas, LT broms, A handbroms, X nitro, B tillbaka på vägen',
      'Kom först i mål! På fri körning tar Enter dig hem till garaget.',
    ],
    touch: [
      'Bilen gasar själv – du styr med ◀ ▶',
      '▼ bromsar (håll kvar för att backa)',
      '🌀 handbroms – sladda länge för turbo · 🔥 nitro',
      '🎥 uppe till höger byter kamera',
      'Kom först i mål!',
    ],
  },
  touch: {
    pad: 'leftright',
    buttons: [
      { button: 'down', label: '▼' },
      { button: 'a', label: '🌀' },
      { button: 'c', label: '🔥' },
    ],
  },
};
export default info;
