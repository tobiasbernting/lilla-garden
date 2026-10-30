import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'hen',
  dims: '2D',
  howTo: {
    keys: ['← → springer', 'Mellanslag / Z hoppar, håll inne för att flaxa', 'Samla äggen och akta dig för räven'],
    touch: ['◀ ▶ springer', '⤒ hoppar, håll inne för att flaxa', 'Samla äggen och akta dig för räven'],
  },
  touch: { pad: 'leftright', buttons: [{ button: 'a', label: '⤒' }] },
};
export default info;
