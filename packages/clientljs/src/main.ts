// Lilla Gården (LittleJS): the same server, HUD, menus, sounds and pixel art as the 2D game, with the world drawn by
// LittleJS: light and shadow through the day, lamps at night, and things that sway, squash and pop.
import './prefs.ts';
import { T } from '@lilla-garden/shared';
import {
  averageFPS,
  engineInit,
  glEnable,
  inputClear,
  PostProcessPlugin,
  postProcess,
  postProcessEffects,
  postProcessGlow,
  postProcessTiltShift,
  postProcessVignette,
  rgb,
  setCameraShakeAngle,
  setCameraShakeDecay,
  setCameraShakeDistance,
  setCanvasClearColor,
  setCanvasPixelated,
  setCanvasPixelRatio,
  setInputPreventDefault,
  setShowSplashScreen,
  setSoundEnable,
  setTilesPixelated,
  setTouchInputEnable,
  timeDelta,
  timeReal,
} from 'littlejsengine';
import '@v1/style.css';
import './style.css';
import { net } from '@v1/net.ts';
import { bus, client, helpSeen, markHelpSeen, rememberPlayer } from '@v1/state.ts';
import { h } from '@v1/ui/dom.ts';
import { initGamepad } from '@v1/ui/gamepad.ts';
import { Hud } from '@v1/ui/hud.ts';
import { Menus } from '@v1/ui/menus.ts';
import { Picker } from '@v1/ui/picker.ts';
import { initRide } from '@v1/ui/ride.ts';
import { initArcade } from '@v1/ui/arcade.ts';
import { initRally } from '@v1/ui/rally.ts';
import { SagaUi } from '@v1/ui/saga.ts';
import { initSound, isMuted, setMuted } from '@v1/sound.ts';
import { Chat, SocialButtons, petCommand, weatherChip } from '@v1/ui/social.ts';
import { forceQuality, on } from './features.ts';
import { initLighting } from './lighting.ts';
import { View, VIEW_H, VIEW_W } from './view.ts';

const ui = document.getElementById('ui')!;
const gameEl = document.getElementById('game')!;
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

// whole-number zoom so the pixel art stays crisp; the HUD uses the same scale. A small screen (a phone, under 3×)
// would lose too much to rounding down, so it zooms in quarter steps instead and draws at the screen's own pixel
// density, where an art pixel 1.75 wide still looks even.
function computeZoom(): number {
  const z = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  return z < 3 ? Math.max(1, Math.floor(z * 4) / 4) : Math.floor(z);
}
const labels = h('div', { id: 'labels' });
ui.append(labels);
const view = new View(labels, gameEl);
view.touch = isTouch;
function applyZoom(): void {
  const zoom = computeZoom();
  setCanvasPixelRatio(Number.isInteger(zoom) ? 1 : Math.min(2, devicePixelRatio || 1));
  document.documentElement.style.setProperty('--z', String(zoom));
  view.setZoom(zoom);
}
applyZoom();
window.addEventListener('resize', applyZoom);

// ---- UI (the 2D game's) ----
initSound();
initRide(ui);
const menus = new Menus(ui);
const hud = new Hud(
  ui,
  () => view,
  (kind) => menus.toggle(kind),
);
hud.root.style.display = 'none';
// ---- minigames: while one is open, the farm waits behind it unseen and unheard ----
let arcadeOpen = false;
let glowWas = true;
function pauseWorld(open: boolean): void {
  arcadeOpen = open;
  syncUiOpen();
  view.hush(open);
  // keys held when the TV went on would otherwise stay held in the game
  inputClear();
  gameEl.style.visibility = open ? 'hidden' : '';
  labels.style.visibility = open ? 'hidden' : '';
  if (postProcess) {
    if (open) {
      glowWas = postProcess.enabled;
      postProcess.enabled = false;
    } else postProcess.enabled = glowWas;
  }
}
initArcade(pauseWorld);
// Rallyvärlden: the garage's window, and its races and drives in the arcade overlay (which pause the farm too)
const rally = initRally(ui, pauseWorld);
// chat, pets that stay or come when you whistle, weather
hud.topExtras.push(weatherChip);
bus.on('weather', () => hud.renderTop());
const chat = new Chat(hud.root);
chat.onToggle = (open) => {
  // keys pressed when the box opened would otherwise stay held in the game
  if (open) inputClear();
};
const social = new SocialButtons(hud.root, chat);
// Sagan om Världsträdet: the dungeon HUD, Kämpastenen, Völvan, the journal, loot and the family list
const saga = new SagaUi(ui, hud.root, menus, social.el);
/** Any window (or a minigame) open: the world stops reading taps and keys. */
function syncUiOpen(): void {
  view.uiOpen = arcadeOpen || menus.isOpen() || saga.isOpen() || rally.isOpen();
}
menus.onChange = syncUiOpen;
saga.onChange = syncUiOpen;
rally.onChange = syncUiOpen;
initGamepad({ ui, target: () => (started ? view : null), menus, windows: [menus, saga, rally], hud, paused: () => arcadeOpen });

const status = h('div', { class: 'status', style: { display: 'none' } }, T.disconnected);
ui.append(status);
bus.on('connection', (s) => {
  status.style.display = s === 'open' ? 'none' : '';
  status.textContent = s === 'closed' ? T.disconnected : T.connecting;
});

// ---- keyboard shortcuts for menus (moving and E/space are read by the view) ----
window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.target instanceof HTMLInputElement) return;
  // in a dungeon 1–5 are spells and a potion and Tab picks a monster; the saga's windows take their keys
  if (saga.key(e) || rally.key(e)) return;
  if ((e.key === 'Enter' || e.key === 't' || e.key === 'T') && !menus.isOpen()) {
    e.preventDefault();
    chat.open();
    return;
  }
  if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
  if (e.key === 'Escape') menus.close();
  else if ((e.key === 'x' || e.key === 'X') && !menus.isOpen()) petCommand('stay');
  else if ((e.key === 'v' || e.key === 'V') && !menus.isOpen()) petCommand('come');
  else if (e.key === 'q' || e.key === 'Q' || e.key === 'i' || e.key === 'I' || e.key === 'Tab') {
    e.preventDefault();
    menus.toggle('inventory');
  } else if (e.key === 'f' || e.key === 'F') menus.toggle('emotes');
  else if (e.key === 'h' || e.key === 'H' || e.key === '?') menus.toggle('help');
  else if (e.key === 'b' || e.key === 'B') menus.toggle('book');
  else if (e.key === 'm' || e.key === 'M') hud.minimap.toggle();
  else if (/^[1-8]$/.test(e.key)) hud.select(Number(e.key) - 1);
});

// ---- LittleJS ----
let ready = false;
let started = false;
let startedAt = 0;
let speedChecked = false;
setShowSplashScreen(false);
setSoundEnable(false); // the game's own synthesised sounds play through sound.ts
setTilesPixelated(true);
setCanvasPixelated(true);
setCanvasClearColor(rgb(0.165, 0.239, 0.122));
// the HUD and menus are HTML: leave their clicks, wheel scrolling and touches alone, the view reads its own taps
setInputPreventDefault(false);
setTouchInputEnable(false);
setCameraShakeDistance(0.35);
setCameraShakeAngle(0.004);
setCameraShakeDecay(2.5);

function start(): void {
  if (!started) startedAt = timeReal;
  started = true;
  view.load();
  hud.root.style.display = '';
  hud.render();
}

void engineInit(
  () => {
    view.init();
    initLighting(() => view.renderBright());
    // over the finished picture: lamps and windows glow softly into the dark, the corners darken a little, and
    // everything gets a touch warmer; or the farm as a tiny model, sharp in the middle (tilt-shift)
    const post: string[] = [];
    if (on('tiltshift')) post.push(postProcessTiltShift(0.5, 0.3, 6));
    if (on('glow')) post.push(postProcessGlow('glowAt', 'glowBy', 5), postProcessVignette('vignette', 2.4), 'c.rgb = c.rgb * vec3(1.03, 1.0, 0.95) + vec3(0.012, 0.007, 0.0);');
    if (post.length) {
      new PostProcessPlugin(postProcessEffects(...post));
      postProcess.values = on('glow') ? { glowAt: 0.9, glowBy: 0.3, vignette: 0.4 } : {};
    }
    // without WebGL 2 LittleJS falls back to a plain canvas, which the world isn't drawn on: say so
    if (!glEnable) ui.append(h('div', { class: 'status' }, T.noWebgl));
    ready = true;
    if (client.world) start();
  },
  () => {
    if (!arcadeOpen) view.update(timeDelta);
  },
  () => {
    if (arcadeOpen) return;
    view.placeLabels();
    // on a slow screen the glow and tilt-shift pass (the one costly extra) goes first
    if (postProcess?.enabled && !speedChecked && started && timeReal - startedAt > 8) {
      speedChecked = true;
      if (averageFPS < 45 && !forceQuality) {
        postProcess.enabled = false;
        console.info(`Lilla Gården: ${Math.round(averageFPS)} fps, glow and tilt-shift turned off`);
      }
    }
    if (on('glow') && postProcess?.enabled) {
      // the glow is for the night: by day only the brightest things bloom, faintly
      const night = view.darkness();
      postProcess.values.glowAt = 0.92 - 0.37 * night;
      postProcess.values.glowBy = 0.25 + 0.6 * night;
      postProcess.values.vignette = 0.3 + 0.22 * night;
    }
  },
  () => {
    if (!arcadeOpen) view.render();
  },
  () => {
    if (!arcadeOpen) view.renderPost();
  },
  [],
  gameEl,
);

bus.on('welcome', () => {
  if (ready) start();
  // first visit on this device: show the help screen once
  if (!helpSeen()) {
    markHelpSeen();
    setTimeout(() => {
      menus.open('help');
      hud.toast(T.helpHint);
    }, 600);
  }
});

bus.on('area', () => {
  if (!started) return;
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

// Prevent the browser from zooming or scrolling on double tap
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as HTMLElement).closest('.body')) e.preventDefault();
  },
  { passive: false },
);
