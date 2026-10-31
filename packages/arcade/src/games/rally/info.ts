import type { GameMeta, TouchLayout } from '../../types.ts';
import { rallyOptions } from './options.ts';

/** The third round button: 🔥 nitro when the car has some in this race (as tuneFor counts it), else 🎥 the camera. */
function touch(options: unknown): TouchLayout {
  const o = rallyOptions(options);
  const nitro = !!o && o.mode !== 'roam' && o.rules.nitro && (o.rules.sameCars || (o.car.parts.turbo ?? 0) > 0);
  return {
    pad: 'leftright',
    buttons: [
      { button: 'down', label: '▼' },
      { button: 'a', label: '🌀' },
      { button: 'c', label: nitro ? '🔥' : '🎥' },
    ],
  };
}

const info: GameMeta = {
  id: 'rally',
  dims: '3D',
  howTo: {
    keys: [
      '↑ / W gasar, ↓ / S bromsar och backar',
      '← → / A D styr · Mellanslag: handbroms – sladda länge för turbo!',
      'L: nitro (har bilen turbo) · C / Enter: byter kamera · R: tillbaka på vägen',
      'Handkontroll: RT gas, LT broms, A handbroms, X nitro, B tillbaka på vägen',
      'Kom först i mål! På fri körning tar Enter dig hem till garaget.',
    ],
    touch: [
      'Bilen gasar själv – du styr med ◀ ▶',
      '▼ bromsar (håll kvar för att backa)',
      '🌀 handbroms – sladda länge för turbo',
      '🔥 nitro när bilen har turbo · 🎥 byter kamera',
      'Kom först i mål!',
    ],
  },
  touch,
};
export default info;
