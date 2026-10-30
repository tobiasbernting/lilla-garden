import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'star',
  dims: '2D',
  howTo: {
    keys: [
      'Piltangenterna / W A S D flyger raketen',
      'Mellanslag skjuter (håll inne) · X: stjärnbomb',
      'Skjut kapslarna: de har uppgraderingar',
      'Bara den lilla pricken i raketen kan träffas',
    ],
    touch: [
      'Dra med fingret: raketen flyger och skjuter',
      'Eller spaken, ✦ skjuter och 💥 är stjärnbomb',
      'Skjut kapslarna: de har uppgraderingar',
      'Bara den lilla pricken i raketen kan träffas',
    ],
  },
  touch: { pad: 'stick', buttons: [{ button: 'a', label: '✦' }, { button: 'b', label: '💥' }] },
};
export default info;
