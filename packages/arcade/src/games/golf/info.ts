import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'golf',
  dims: '3D',
  howTo: {
    keys: ['Dra bakåt från bollen med musen och släpp för att slå', 'Eller: ← → siktar, håll mellanslag för kraft', 'Rulla för att zooma'],
    touch: ['Dra bakåt från bollen och släpp för att slå', 'Två fingrar vrider kameran'],
  },
  touch: { pad: 'none', buttons: [] },
};
export default info;
