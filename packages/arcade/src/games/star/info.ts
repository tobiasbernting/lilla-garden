import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'star',
  dims: '2D',
  howTo: {
    keys: ['Piltangenterna / W A S D flyger', 'Mellanslag skjuter (håll inne)', 'X: stjärnbomb'],
    touch: ['Spaken flyger', '✦ skjuter (håll inne)', '💥 stjärnbomb'],
  },
  touch: { pad: 'stick', buttons: [{ button: 'a', label: '✦' }, { button: 'b', label: '💥' }] },
};
export default info;
