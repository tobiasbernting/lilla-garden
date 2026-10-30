import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'snow',
  dims: '3D',
  howTo: {
    keys: ['W A S D går · mellanslag hoppar', 'Musen siktar · klicka för att kasta', 'Handkontroll: spakarna, A eller RT kastar', 'Träffa Snökungens hjärta när det lyser!'],
    touch: ['Spaken går', 'Dra på skärmen för att sikta', '❄️ kastar · ⤒ hoppar', 'Träffa Snökungens hjärta när det lyser!'],
  },
  touch: { pad: 'stick', buttons: [{ button: 'a', label: '❄️' }, { button: 'b', label: '⤒' }] },
};
export default info;
