// A simple autopilot for testing whole runs (only used in development, from the lab's URL).
import type { Controls, Game } from './game.ts';
import { FH, clamp } from './util.ts';

/** skill 0..1: lower dodges later and wanders more. */
export function botControls(g: Game, skill = 1): Controls {
  const p = g.player;
  let tx = p.x;
  let ty = FH - 140;
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const e of g.enemies) {
    if (e.dead || e.y < 0 || e.y > p.y - 50 || e.shielded()) continue;
    const d = Math.abs(e.x - p.x) + (p.y - e.y) * 0.25;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (best) tx = best.x;
  for (const k of g.pickups) {
    if (k.kind === 'power' && k.y > 150) {
      tx = k.x;
      ty = clamp(k.y + 40, 300, FH - 60);
    }
  }
  let fx = 0;
  let fy = 0;
  const look = 0.12 + skill * 0.18;
  const R = 50 + skill * 50;
  let danger = 0;
  for (const b of g.bullets) {
    const bx = b.x + b.vx * look;
    const by = b.y + b.vy * look;
    const dx = p.x - bx;
    const dy = p.y - by;
    const d = Math.hypot(dx, dy) || 1;
    if (d < R) {
      const w = (R - d) / R;
      fx += (dx / d) * w * 3.2;
      fy += (dy / d) * w * 2.2;
      if (d < 22) danger++;
    }
  }
  for (const e of g.enemies) {
    if (e.dead || !e.solid || e.y < -20) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const RR = e.r + 70;
    if (d < RR) {
      fx += (dx / d) * ((RR - d) / RR) * 4;
      fy += (dy / d) * ((RR - d) / RR) * 4;
    }
  }
  const mx = clamp((tx - p.x) / 50, -1, 1) * 0.8 + fx;
  const my = clamp((ty - p.y) / 60, -1, 1) * 0.6 + fy;
  return {
    mx: clamp(mx + (Math.random() - 0.5) * (1 - skill), -1, 1),
    my: clamp(my, -1, 1),
    fire: true,
    bomb: danger > 1 && Math.random() < 0.3 * skill,
    dx: 0,
    dy: 0,
    drag: false,
  };
}
