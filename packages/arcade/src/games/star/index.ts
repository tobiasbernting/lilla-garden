// Stjärnstorm: a vertical space shooter in glowing vector lines. The moon base Rymdbasen is hit by
// a star storm of geometric aliens; fly through three sectors and beat Stormkristallen.
import { Loop } from '../../kit.ts';
import type { GameFactory } from '../../types.ts';
import { Sound, silentSound, type SoundApi } from './audio.ts';
import { botControls } from './bot.ts';
import { Renderer } from './draw.ts';
import { Game, type Controls } from './game.ts';
import { Screen } from './render.ts';
import { brightColor } from './util.ts';

const factory: GameFactory = (ctx) => {
  const low = ctx.quality === 'low';
  const screen = new Screen(ctx.root, ctx.dpr, ctx.quality);
  let sound: SoundApi = silentSound;
  const noSound = import.meta.env.DEV && new URLSearchParams(location.search).has('star_nosound');
  if (ctx.audio && ctx.out && !noSound) {
    try {
      sound = new Sound(ctx.audio, ctx.out, low);
    } catch (err) {
      console.warn('Stjärnstorm: no sound', err);
      sound = silentSound;
    }
  }
  const color = brightColor(ctx.player.color);

  // lab-only switches: ?play=star&star_at=3 (the boss), &star_god, &star_bot, &star_speed=4
  const debug = { startAt: 0, god: false, bot: false, speed: 1 };
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    debug.startAt = Number(q.get('star_at') ?? 0) || 0;
    debug.god = q.has('star_god');
    debug.bot = q.has('star_bot');
    debug.speed = Math.max(1, Math.min(8, Number(q.get('star_speed') ?? 1) || 1));
  }

  let ended = false;
  const game = new Game({
    sound,
    low,
    startAt: debug.startAt,
    god: debug.god,
    onEnd: (score, detail) => {
      if (ended) return;
      ended = true;
      ctx.end(score, detail);
    },
  });
  game.playerColor = color;
  const renderer = new Renderer(screen, ctx.touch, low, color);

  // Drag anywhere (a finger or the mouse) to fly: the rocket moves as much as the finger, so the
  // finger never covers it, and the guns fire by themselves while you drag.
  const el = screen.wrap;
  let dragId: number | null = null;
  let lx = 0;
  let ly = 0;
  let ax = 0;
  let ay = 0;
  const onDown = (e: PointerEvent): void => {
    // the shell shows its touch buttons from the first touch on: keep the field clear of them
    if (e.pointerType === 'touch') renderer.setTouch(true);
    if (dragId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragId = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: the moves still arrive while over the canvas */
    }
    e.preventDefault();
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== dragId) return;
    ax += e.clientX - lx;
    ay += e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== dragId) return;
    dragId = null;
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);

  // lab-only: timings and the game itself for test scripts
  const perf = { update: 0, render: 0, frames: 0, updates: 0 };
  if (import.meta.env.DEV) (window as unknown as { __star?: unknown }).__star = { game, perf, sound };

  let lastRender = performance.now();
  const loop = new Loop(
    (dt) => {
      const t0 = import.meta.env.DEV ? performance.now() : 0;
      const st = ctx.input.stick(0);
      const k = 1.2 / renderer.scale();
      let c: Controls = {
        mx: st.x,
        my: st.y,
        fire: ctx.input.down('a'),
        bomb: ctx.input.pressed('b'),
        dx: ax * k,
        dy: ay * k,
        drag: dragId !== null,
      };
      ax = 0;
      ay = 0;
      if (import.meta.env.DEV && debug.bot) c = botControls(game);
      game.update(dt, c);
      if (import.meta.env.DEV) for (let i = 1; i < debug.speed; i++) game.update(dt, debug.bot ? botControls(game) : { ...c, bomb: false });
      sound.update();
      ctx.input.frame();
      if (import.meta.env.DEV) {
        perf.update += performance.now() - t0;
        perf.updates++;
      }
    },
    () => {
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - lastRender) / 1000));
      lastRender = now;
      renderer.render(game, dt);
      if (import.meta.env.DEV) {
        perf.render += performance.now() - now;
        perf.frames++;
      }
    },
  );

  return {
    pause: () => {
      loop.pause();
      sound.pause();
      dragId = null;
    },
    resume: () => {
      lastRender = performance.now();
      sound.resume();
      loop.resume();
    },
    destroy: () => {
      loop.stop();
      sound.destroy();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      screen.dispose();
      if (import.meta.env.DEV) delete (window as unknown as { __star?: unknown }).__star;
    },
  };
};

export default factory;
