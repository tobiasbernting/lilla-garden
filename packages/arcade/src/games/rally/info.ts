import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'rally',
  dims: '3D',
  howTo: {
    keys: ['↑ / W gasar, ↓ / S bromsar och backar', '← → / A D styr', 'Mellanslag: handbromsen, för att sladda', 'C byter kamera'],
    touch: ['◀ ▶ styr', '▲ gasar, ▼ bromsar', '🌀 handbromsen, för att sladda'],
  },
  touch: { pad: 'leftright', buttons: [{ button: 'up', label: '▲' }, { button: 'down', label: '▼' }, { button: 'a', label: '🌀' }] },
};
export default info;
