// A stand-in game: the game's emoji bounces around; A ends the run. Shows the shape of a minigame.
import { ARCADE, type ArcadeGame } from '@lilla-garden/shared';
import { Loop, fullCanvas } from '../kit.ts';
import { tone } from '../sfx.ts';
import type { GameFactory } from '../types.ts';

export function placeholder(id: ArcadeGame): GameFactory {
  return (ctx) => {
    const def = ARCADE[id];
    const { g, size, dispose } = fullCanvas(ctx.root, ctx.dpr);
    let x = 100;
    let y = 100;
    let vx = 180;
    let vy = 140;
    let score = 0;
    const loop = new Loop(
      (dt) => {
        const { w, h } = size();
        x += vx * dt;
        y += vy * dt;
        if (x < 40 || x > w - 40) {
          vx = -vx;
          score += 250;
          tone(ctx.audio, ctx.out, 440, 0.1);
        }
        if (y < 40 || y > h - 40) {
          vy = -vy;
          score += 250;
          tone(ctx.audio, ctx.out, 660, 0.1);
        }
        x = Math.max(40, Math.min(w - 40, x));
        y = Math.max(40, Math.min(h - 40, y));
        if (ctx.input.pressed('a') || ctx.input.pressed('start')) ctx.end(score, 'Det riktiga spelet kommer snart');
        ctx.input.frame();
      },
      () => {
        const { w, h } = size();
        g.fillStyle = '#10101c';
        g.fillRect(0, 0, w, h);
        g.font = '64px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(def.emoji, x, y);
        g.fillStyle = def.color;
        g.font = 'bold 28px system-ui';
        g.fillText(`${def.name} kommer snart`, w / 2, h / 2);
        g.font = '18px system-ui';
        g.fillStyle = '#fff';
        g.fillText(`${score} poäng · tryck A / mellanslag för att sluta`, w / 2, h / 2 + 40);
      },
    );
    return {
      pause: () => loop.pause(),
      resume: () => loop.resume(),
      destroy: () => {
        loop.stop();
        dispose();
      },
    };
  };
}
