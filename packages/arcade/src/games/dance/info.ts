import type { GameMeta } from '../../types.ts';

const info: GameMeta = {
  id: 'dance',
  dims: '2D',
  howTo: {
    keys: [
      'Välj låt och nivå med pilarna och A',
      'Tryck ← ↓ ↑ → (eller W A S D, D F J K) precis när pilarna når linjen',
      'Långa pilar: håll kvar knappen',
      'Många i rad tänder skylten och startar Discofeber!',
    ],
    touch: [
      'Tryck på en låt och sedan på en nivå',
      'Tryck på rätt fält precis när pilarna når linjen',
      'Långa pilar: håll kvar fingret',
      'Många i rad tänder skylten och startar Discofeber!',
    ],
  },
  touch: { pad: 'none', buttons: [] },
};
export default info;
