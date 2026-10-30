import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'hen',
  dims: '2D',
  howTo: {
    keys: ['← → springer', 'Mellanslag / Z hoppar, håll inne för att flaxa', 'Hoppa på rävarna, akta dig för igelkottar och kråkor', 'Samla ägg och spring hem till hönshuset'],
    touch: ['◀ ▶ springer', '⤒ hoppar, håll inne för att flaxa', 'Hoppa på rävarna, akta dig för igelkottar och kråkor', 'Samla ägg och spring hem till hönshuset'],
  },
  touch: { pad: 'leftright', buttons: [{ button: 'a', label: '⤒' }] },
};
export default info;
