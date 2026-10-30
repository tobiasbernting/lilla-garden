// Hönan Hilda: a little platformer on an old green pocket console. Hilda the hen runs, jumps and flaps
// through six short levels, collecting eggs on the way to the hen house.
import { Loop, pixelCanvas } from '../../kit.ts';
import type { GameFactory } from '../../types.ts';
import { Chip } from './audio.ts';
import { bezel } from './bezel.ts';
import { Game } from './game.ts';
import { H, Lcd, Screen, W } from './gfx.ts';

const factory: GameFactory = (ctx) => {
  const high = ctx.quality === 'high';
  const frame = bezel(ctx.root, { accent: ctx.player.color, grid: high, dpr: ctx.dpr, controls: !ctx.touch });
  const { canvas, g, dispose } = pixelCanvas(ctx.root, W, H, '#0e110f');
  canvas.style.boxShadow = '0 0 0 2px #0b0d0c';
  frame.attach(canvas);
  const lcd = new Lcd(g, high);
  const screen = new Screen();
  const chip = new Chip(ctx.audio, ctx.out);
  // the lab can start further on: ?play=hen&bana=3&ruta=120 (level 3, column 120)
  let start = 0;
  let col = 0;
  try {
    const q = new URLSearchParams(location.search);
    start = Math.max(0, Number(q.get('bana') ?? 1) - 1) || 0;
    col = Number(q.get('ruta') ?? 0) || 0;
  } catch {
    start = 0;
  }
  const game = new Game({ chip, quality: ctx.quality, end: (score, detail) => ctx.end(score, detail), startLevel: start, startCol: col });

  const loop = new Loop(
    (dt) => {
      const i = ctx.input;
      game.update(dt, i);
      chip.update();
      const x = i.stick(0).x;
      frame.press({ left: x < -0.3, right: x > 0.3, up: i.down('up'), down: i.down('down'), a: i.down('a'), b: i.down('b') });
      i.frame();
    },
    () => lcd.show(screen, game.draw(screen)),
  );

  return {
    pause: () => {
      loop.pause();
      chip.pause();
    },
    resume: () => {
      chip.resume();
      loop.resume();
    },
    destroy: () => {
      loop.stop();
      chip.destroy();
      dispose();
      frame.dispose();
    },
  };
};

export default factory;
