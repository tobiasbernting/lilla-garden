import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'rally',
  dims: '3D',
  howTo: {
    keys: [
      '↑ / W gasar, ↓ / S bromsar och backar',
      '← → / A D styr · Mellanslag: handbroms, för att sladda',
      'C byter kamera · R: tillbaka på vägen',
      'Handkontroll: RT gas, LT broms, A handbroms',
      'Tre varv – kom först i mål!',
    ],
    touch: [
      'Bilen gasar själv – du styr med ◀ ▶',
      '▼ bromsar (håll kvar för att backa)',
      '🌀 handbroms för att sladda · 🎥 byter kamera',
      'Tre varv – kom först i mål!',
    ],
  },
  touch: {
    pad: 'leftright',
    buttons: [
      { button: 'down', label: '▼' },
      { button: 'a', label: '🌀' },
      { button: 'c', label: '🎥' },
    ],
  },
};
export default info;
