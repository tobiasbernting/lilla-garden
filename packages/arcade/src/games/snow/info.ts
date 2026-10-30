import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'snow',
  dims: '3D',
  howTo: {
    keys: ['W A S D går', 'Musen siktar, klicka för att kasta', 'Mellanslag hoppar'],
    touch: ['Spaken går', 'Dra på skärmen för att sikta', '❄️ kastar'],
  },
  touch: { pad: 'stick', buttons: [{ button: 'a', label: '❄️' }, { button: 'b', label: '⤒' }] },
};
export default info;
