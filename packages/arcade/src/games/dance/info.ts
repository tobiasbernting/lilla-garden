import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'dance',
  dims: '2D',
  howTo: {
    keys: ['Tryck ← ↓ ↑ → precis när pilarna når linjen', 'Träffa många i rad för extra poäng'],
    touch: ['Tryck på rätt fält precis när pilarna når linjen', 'Träffa många i rad för extra poäng'],
  },
  touch: { pad: 'none', buttons: [] },
};
export default info;
