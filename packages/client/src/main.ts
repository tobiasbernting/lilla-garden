import Phaser from 'phaser';
import { T } from '@lilla-garden/shared';
import './style.css';
import { getArt } from './art/textures.js';
import { net } from './net.js';
import { GameScene, VIEW_H, VIEW_W } from './scenes/GameScene.js';
import { bus, client, helpSeen, markHelpSeen, rememberPlayer } from './state.js';
import { h } from './ui/dom.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { Picker } from './ui/picker.js';
import { initSound, isMuted, setMuted } from './sound.ts';

const ui = document.getElementById('ui')!;
const stage = document.getElementById('stage')!;
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

// ---- integer zoom so pixels stay crisp ----
function computeZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
}
let zoom = computeZoom();
document.documentElement.style.setProperty('--z', String(zoom));

let game: Phaser.Game | null = null;
let scene: GameScene | null = null;

function applyZoom(): void {
  zoom = computeZoom();
  document.documentElement.style.setProperty('--z', String(zoom));
  game?.scale.setZoom(zoom);
}
window.addEventListener('resize', applyZoom);

// ---- UI ----
const labels = h('div', { id: 'labels' });
ui.append(labels);
initSound();
const menus = new Menus(ui);
const hud = new Hud(
  ui,
  () => scene,
  (kind) => menus.toggle(kind),
);
hud.root.style.display = 'none';
menus.onChange = (open) => {
  if (scene) scene.uiOpen = open;
};

const status = h('div', { class: 'status', style: { display: 'none' } }, T.disconnected);
ui.append(status);
bus.on('connection', (s) => {
  status.style.display = s === 'open' ? 'none' : '';
  status.textContent = s === 'closed' ? T.disconnected : T.connecting;
});

// ---- keyboard shortcuts for menus ----
window.addEventListener('keydown', (e) => {
  if (!scene) return;
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'Escape') menus.close();
  else if (e.key === 'q' || e.key === 'Q' || e.key === 'i' || e.key === 'I' || e.key === 'Tab') {
    e.preventDefault();
    menus.toggle('inventory');
  } else if (e.key === 'f' || e.key === 'F') menus.toggle('emotes');
  else if (e.key === 'h' || e.key === 'H' || e.key === '?') menus.toggle('help');
  else if (e.key === 'b' || e.key === 'B') menus.toggle('book');
  else if (/^[1-8]$/.test(e.key)) hud.select(Number(e.key) - 1);
});

// ---- boot ----
function startGame(): void {
  getArt();
  if (!game) {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: VIEW_W,
      height: VIEW_H,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#2a3d1f',
      scale: { mode: Phaser.Scale.NONE, zoom },
      scene: [GameScene],
      input: { activePointers: 3 },
      audio: { noAudio: true },
      banner: false,
    });
    game.events.once('ready', () => {
      scene = game!.scene.getScene('game') as GameScene;
      scene.touch = isTouch;
    });
  } else {
    scene?.scene.restart();
  }
  hud.root.style.display = '';
}

bus.on('welcome', () => {
  if (!game) startGame();
  else {
    scene = game.scene.getScene('game') as GameScene;
    scene.touch = isTouch;
    scene.scene.restart();
    hud.render();
  }
  // First visit on this device: show the help screen once
  if (!helpSeen()) {
    markHelpSeen();
    setTimeout(() => {
      menus.open('help');
      hud.toast(T.helpHint);
    }, 600);
  }
});

const picker = new Picker(ui, (id) => {
  rememberPlayer(id);
  picker.hide();
  net.connect(id);
});
void picker.show();

// Switch character: long press on the name chip is overkill; expose a tiny hook in the console and via the admin page link.
(window as unknown as { lillaGarden: unknown }).lillaGarden = {
  client,
  net,
  mute: (m = true) => setMuted(m),
  muted: () => isMuted(),
  switchPlayer: () => {
    net.disconnect();
    rememberPlayer(null);
    location.reload();
  },
};

// Prevent the browser from zooming or scrolling on double tap
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as HTMLElement).closest('.body')) e.preventDefault();
  },
  { passive: false },
);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
