// The bus / train trip: a short cutscene while the server moves the player to the other stop.
import { T, fmt } from '@lilla-garden/shared';
import { Px } from '../art/px.js';
import { SFX, isMuted } from '../sound.ts';
import { bus } from '../state.js';
import { h } from './dom.js';

const RIDE_MS = 2600;

const OUT = '#2b2419';
function busPx(): Px {
  const p = new Px(48, 26);
  p.rect(2, 4, 44, 16, '#ffd84a').rect(2, 4, 44, 1, '#ffe88a').rect(2, 16, 44, 2, '#e0a82a');
  for (let x = 6; x < 40; x += 9) p.rect(x, 7, 7, 6, '#bfeaff').rect(x, 7, 7, 1, '#ffffff');
  p.rect(40, 6, 5, 8, '#bfeaff'); // windscreen
  p.rect(44, 15, 2, 2, '#ffd84a').rect(45, 14, 2, 2, '#fff1a0'); // headlight
  p.rect(1, 14, 2, 2, '#d9453b'); // tail light
  p.rect(3, 20, 44, 1, '#5a3a1e');
  for (const wx of [9, 35]) p.circle(wx, 21, 4, OUT).circle(wx, 21, 2, '#9a9aa0');
  p.rect(16, 1, 6, 3, '#ffd84a'); // roof sign
  return p.outline(OUT);
}
function trainPx(): Px {
  const p = new Px(80, 26);
  // locomotive (front at the right)
  p.rect(44, 6, 32, 13, '#2f6fd1').rect(44, 6, 32, 1, '#6a9ff0').rect(44, 15, 32, 2, '#1c4a9a');
  p.rect(60, 2, 14, 5, '#2f6fd1').rect(62, 7, 9, 6, '#bfeaff'); // cab
  p.rect(70, 0, 4, 7, '#3a3e48').rect(69, 0, 6, 1, '#5e6470'); // chimney
  p.rect(74, 9, 3, 7, '#d9453b').rect(76, 11, 2, 3, '#fff1a0'); // nose + lamp
  // wagon
  p.rect(2, 6, 38, 13, '#d9453b').rect(2, 6, 38, 1, '#f08a8a').rect(2, 15, 38, 2, '#a52a2a');
  for (let x = 5; x < 36; x += 9) p.rect(x, 8, 7, 6, '#bfeaff').rect(x, 8, 7, 1, '#ffffff');
  p.rect(40, 12, 4, 2, '#3a3e48'); // coupling
  p.rect(2, 19, 75, 1, '#3a3e48');
  for (const wx of [8, 20, 32, 50, 62, 72]) p.circle(wx, 21, 3.5, OUT).circle(wx, 21, 1.5, '#9a9aa0');
  return p.outline(OUT);
}

function rocketPx(): Px {
  const p = new Px(20, 44);
  p.rect(6, 8, 8, 26, '#f4f4f8').rect(6, 8, 2, 26, '#ffffff').rect(12, 8, 2, 26, '#c8ccd8'); // body
  p.rect(7, 4, 6, 4, '#d9453b').rect(8, 2, 4, 2, '#d9453b').rect(9, 0, 2, 2, '#d9453b'); // nose
  p.circle(10, 14, 2.5, '#3a6ad0').px(9, 13, '#bfeaff'); // window
  p.rect(6, 22, 8, 2, '#d9453b');
  p.rect(2, 28, 4, 6, '#d9453b').rect(14, 28, 4, 6, '#d9453b').rect(8, 34, 4, 2, '#3a3e48'); // fins and nozzle
  p.rect(8, 36, 4, 4, '#ffd45a').rect(9, 40, 2, 3, '#f5a623').px(10, 43, '#d9453b'); // flame
  return p.outline(OUT);
}

let busUrl: string | null = null;
let trainUrl: string | null = null;
let rocketUrl: string | null = null;

/** Mounts the cutscene listener. */
export function initRide(ui: HTMLElement): void {
  bus.on('change', (c) => {
    if (c.t !== 'ride') return;
    if (c.via === 'rocket') return launch(ui, c.place);
    if (c.via === 'train') trainUrl ??= trainPx().dataUrl();
    else busUrl ??= busPx().dataUrl();
    const img = h('img', { class: 'ride-vehicle', src: (c.via === 'train' ? trainUrl : busUrl)!, alt: '' });
    const overlay = h(
      'div',
      { class: `ride ${c.via}` },
      h('div', { class: 'ride-sky' }, h('div', { class: 'ride-cloud c1' }), h('div', { class: 'ride-cloud c2' }), h('div', { class: 'ride-cloud c3' })),
      h('div', { class: 'ride-ground' }),
      h('div', { class: 'ride-track' }, img),
      h('div', { class: 'ride-text' }, fmt(c.via === 'bus' ? T.busLeaving : T.trainLeaving, { place: c.place })),
    );
    ui.append(overlay);
    if (!isMuted()) SFX[c.via]();
    requestAnimationFrame(() => overlay.classList.add('show'));
    setTimeout(() => overlay.classList.remove('show'), RIDE_MS);
    setTimeout(() => overlay.remove(), RIDE_MS + 500);
  });
}

/** The rocket: a countdown on the pad, then up through the sky into the stars. */
function launch(ui: HTMLElement, place: string): void {
  rocketUrl ??= rocketPx().dataUrl();
  const overlay = h(
    'div',
    { class: 'ride rocket' },
    h('div', { class: 'ride-sky' }),
    h('div', { class: 'ride-ground' }),
    h('img', { class: 'ride-rocket', src: rocketUrl, alt: '' }),
    h('div', { class: 'ride-text' }, fmt(T.rocketTrip, { place })),
  );
  ui.append(overlay);
  if (!isMuted()) SFX.rocket();
  requestAnimationFrame(() => overlay.classList.add('show'));
  setTimeout(() => overlay.classList.remove('show'), RIDE_MS + 400);
  setTimeout(() => overlay.remove(), RIDE_MS + 900);
}
