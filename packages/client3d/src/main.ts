// Lilla Gården 3D: the same server, menus and HUD as the 2D game, with a block world instead of Phaser.
import { T } from '@lilla-garden/shared';
import '@v1/style.css';
import './style.css';
import { net } from '@v1/net.ts';
import { bus, client, helpSeen, markHelpSeen, myPlayer, rememberPlayer } from '@v1/state.ts';
import { h, onTap } from '@v1/ui/dom.ts';
import { Hud } from '@v1/ui/hud.ts';
import { Menus } from '@v1/ui/menus.ts';
import { Picker } from '@v1/ui/picker.ts';
import { initRide } from '@v1/ui/ride.ts';
import { initSound, isMuted, setMuted } from '@v1/sound.ts';
import { World3D } from './game.ts';

const ui = document.getElementById('ui')!;
const gameEl = document.getElementById('game')!;
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

// The HUD and menus are laid out on the 2D game's 320×180 grid, scaled to fit the screen
const VIEW_W = 320;
const VIEW_H = 180;
function applyZoom(): void {
  const z = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  document.documentElement.style.setProperty('--z', String(Math.max(1, Math.floor(z * 4) / 4)));
}
applyZoom();
window.addEventListener('resize', applyZoom);

const labels = h('div', { id: 'labels' });
ui.append(labels);
initSound();
initRide(ui);

let view: World3D | null = null;
const menus = new Menus(ui);
const hud = new Hud(
  ui,
  () => view,
  (kind) => menus.toggle(kind),
);
hud.root.style.display = 'none';
menus.onChange = (open) => view?.setUiOpen(open);

// camera switch (F5 on a keyboard)
const camBtn = h('div', { class: 'round small', title: 'Byt kameravy (F5)' }, '🎥');
onTap(camBtn, () => view?.cycleCamera());
hud.root.querySelector('.hud-right')?.append(camBtn);
// jump button for touch screens
const jumpBtn = h('div', { class: 'jump-btn' }, '⤒');
jumpBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  view?.jump();
});
hud.root.append(jumpBtn);

const status = h('div', { class: 'status', style: { display: 'none' } }, T.disconnected);
ui.append(status);
bus.on('connection', (s) => {
  status.style.display = s === 'open' ? 'none' : '';
  status.textContent = s === 'closed' ? T.disconnected : T.connecting;
});

// Minecraft-ish keys: E (or Q, I, Tab) inventory, F emotes, 1–8 hotbar, wheel scrolls the hotbar
window.addEventListener('keydown', (e) => {
  if (!view) return;
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') menus.close();
  else if (k === 'e' || k === 'q' || k === 'i' || e.key === 'Tab') {
    e.preventDefault();
    menus.toggle('inventory');
  } else if (k === 'f') menus.toggle('emotes');
  else if (k === 'h' || e.key === '?') menus.toggle('help');
  else if (k === 'b') menus.toggle('book');
  else if (k === 'm') hud.minimap.toggle();
  else if (/^[1-8]$/.test(e.key)) hud.select(Number(e.key) - 1);
});

function start(): void {
  if (!view) {
    view = new World3D(gameEl, ui);
    view.touch = isTouch;
    view.onWheel = (dir) => {
      const me = myPlayer();
      if (me) hud.select((me.selected + dir + 8) % 8);
    };
  }
  view.load();
  hud.root.style.display = '';
  hud.render();
}

bus.on('welcome', () => {
  start();
  if (!helpSeen()) {
    markHelpSeen();
    setTimeout(() => {
      menus.open('help');
      hud.toast(T.helpHint);
    }, 600);
  }
});

bus.on('area', () => {
  if (!view) return;
  view.load();
  hud.render();
});

const picker = new Picker(ui, (id) => {
  rememberPlayer(id);
  picker.hide();
  net.connect(id);
});
void picker.show();

(window as unknown as { lillaGarden: unknown }).lillaGarden = {
  client,
  net,
  view: () => view,
  mute: (m = true) => setMuted(m),
  muted: () => isMuted(),
  switchPlayer: () => {
    net.disconnect();
    rememberPlayer(null);
    location.reload();
  },
};

document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as HTMLElement).closest('.body')) e.preventDefault();
  },
  { passive: false },
);
