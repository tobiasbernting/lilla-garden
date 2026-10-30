import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'golf',
  dims: '3D',
  howTo: {
    keys: [
      'Dra bakåt från bollen med musen och släpp för att slå',
      '← → siktar · håll mellanslag (A) för kraft och släpp',
      'Q E, högerdrag eller C vrider kameran · hjulet zoomar',
      'Håll X (B) för att se hela banan',
    ],
    touch: ['Dra bakåt från bollen och släpp för att slå', 'Dra tillbaka till bollen för att ångra', '🔄 vrider kameran · håll 👀 för hela banan', 'Två fingrar vrider och zoomar'],
  },
  touch: {
    pad: 'none',
    buttons: [
      { button: 'c', label: '🔄' },
      { button: 'b', label: '👀' },
    ],
  },
};
export default info;
