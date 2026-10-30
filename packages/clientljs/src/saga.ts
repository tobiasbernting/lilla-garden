// Sagan om Världsträdet in the world: a boss's attacks marked on the ground (filling up until they land, burning
// pools that pulse), every spell and attack as light and motion (fireballs, ice lances, lightning, healing runes,
// shield walls, whirlwinds…), numbers floating up from hits, health bars over monsters and friends, a ring under
// your target, and friends lying down when fallen or standing in ice when frozen. Drawn in four layers: on the
// ground (lit with the scene), into the light map (so magic lights up a dark dungeon), in the y-sorted queue, and
// glowing on top.
import { cameraShake, drawEllipse, drawLine, drawLineList, drawPoly, rgb, setAdditiveBlendMode, vec2, type Color, type Vector2 } from 'littlejsengine';
import { SAGA_BOSSES, SAGA_MOBS, SPELLS, T, TILE, isSagaKey, type Change, type SagaZone } from '@lilla-garden/shared';
import { FLAG, flagsOf, isSagaMonster, liveTarget, sagaSnap, setTarget } from '@v1/saga.ts';
import { SAGA_SFX, bossWindup } from '@v1/sagasfx.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from '@v1/state.ts';
import { zoomPx } from '@v1/ui/hud.ts';
import type { Sprites } from './art.ts';
import type { Effects } from './fx.ts';
import { clamp01, DrawQueue, drawSprite, easeOutBack, easeOutCubic, lerp, rgba } from './gfx.ts';

/** Where an actor stands (feet, world pixels) and how big its picture is. */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Find = (id: string | number) => Spot | null;

type Layer = 'ground' | 'bright' | 'light';
interface Fx {
  /** Seconds since it started (below zero while it waits to start). */
  t: number;
  dur: number;
  /** Start and end (world pixels); `on` follows a target that moves. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  on?: string | number;
  draw: (layer: Layer, f: Fx, k: number) => void;
}

interface Floater {
  el: HTMLDivElement;
  on: string | number;
  x: number;
  y: number;
  /** Where it rises, beside and above the others that came with it. */
  dx: number;
  dy: number;
  born: number;
  /** Seconds it is shown (as long as its animation in saga.css). */
  life: number;
  /** Shown from this time (a fireball's number waits until it lands). */
  at: number;
}

const TAU = Math.PI * 2;
const W = (v: number): number => v / TILE;
const P = (x: number, y: number): Vector2 => vec2(x / TILE, -y / TILE);
const col = (r: number, g: number, b: number, a = 1): Color => rgb(r, g, b, Math.max(0, Math.min(1, a)));
/** Light painted into the light map: kept gentle, so a lit dungeon is not washed out by the night glow. */
const LIGHT = 0.5;
const light = (r: number, g: number, b: number, a: number): number => rgba(r, g, b, a * LIGHT);
/** Colours of a boss's moves while it gathers power. */
const MOVE_COLOUR: Record<string, [number, number, number]> = {
  cleave: [1, 0.55, 0.15],
  slam: [1, 0.75, 0.35],
  rain: [0.55, 0.85, 1],
  charge: [1, 1, 1],
  freeze: [0.5, 0.95, 1],
  pools: [1, 0.4, 0.1],
  nova: [0.85, 0.3, 1],
  summon: [0.5, 1, 0.5],
};
/** Some bosses' moves look like where they live: the frost giant's breath and snowstorm are icy, Surt's wrath is fire. */
const BOSS_MOVE_COLOUR: Record<string, Record<string, [number, number, number]>> = {
  rimturs: { cleave: [0.55, 0.88, 1], nova: [0.75, 0.92, 1] },
  surt: { nova: [1, 0.45, 0.12] },
};
const moveColour = (move: string, by: string | number | undefined): [number, number, number] => {
  const species = typeof by === 'number' ? activeWorld()?.animals[by]?.species : undefined;
  return (species ? BOSS_MOVE_COLOUR[species]?.[move] : undefined) ?? MOVE_COLOUR[move] ?? [1, 0.4, 0.2];
};
/** The bottom of the boss's bars at the top of the screen (screen px; 0 without them). */
function hudFloor(): number {
  let floor = 0;
  for (const el of document.querySelectorAll<HTMLElement>('.saga-boss, .saga-cast')) floor = Math.max(floor, el.getBoundingClientRect().bottom);
  return floor;
}
/** Spells that fly from the caster to the target (pixels a second) and their colour. */
const BOLTS: Record<string, { speed: number; c: [number, number, number]; size: number }> = {
  eldboll: { speed: 210, c: [1, 0.5, 0.12], size: 12 },
  isspjut: { speed: 300, c: [0.55, 0.9, 1], size: 9 },
  ljuspil: { speed: 320, c: [1, 0.92, 0.45], size: 8 },
  mob_isande: { speed: 170, c: [0.6, 0.9, 1], size: 8 },
};
/** Monsters' ranged attacks that have no look of their own: a ghostly green bolt. */
const MOB_BOLT = { speed: 190, c: [0.55, 1, 0.55] as [number, number, number], size: 7 };

export class SagaView {
  private on = false;
  private area = '';
  private t = 0;
  private list: Fx[] = [];
  private floaters: Floater[] = [];
  /** When each telegraph was first seen (server ms), for the fill. */
  private born = new Map<string, number>();
  /** A number about to come for a target hit by something still in the air. */
  private delay: { on: string | number; until: number } | null = null;
  private bars = new Map<string, HTMLDivElement>();
  /** A boss's gathering of power, so it can end when the attack is stopped. */
  private windups = new Map<number, Fx>();
  private lastHurtSound = 0;
  private lastCritSound = 0;

  constructor(
    private art: Sprites,
    private labels: HTMLElement,
    private fx: Effects,
    private find: Find,
  ) {
    bus.on('change', (c) => this.onChange(c));
  }

  /** A new map: only dungeons have any of this. */
  load(area: string): void {
    this.clear();
    this.area = area;
    this.on = isSagaKey(area);
    if (!this.on) return;
    const now = serverNow();
    for (const z of activeWorld()?.saga?.zones ?? []) this.born.set(z.id, Math.min(now, z.at - 1200));
  }

  clear(): void {
    this.list = [];
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    for (const b of this.bars.values()) b.remove();
    this.bars.clear();
    this.windups.clear();
    this.born.clear();
    this.delay = null;
    this.on = false;
  }

  /** Fallen (lying down) or frozen (in the ice), for drawing a player. */
  pose(id: string): 'down' | 'frozen' | null {
    if (!this.on) return null;
    const fl = flagsOf(id);
    return fl & FLAG.down ? 'down' : fl & FLAG.frozen ? 'frozen' : null;
  }

  /** Dungeon monsters show their own bars instead of the name labels. */
  ownsLabel(species: string): boolean {
    return this.on && (!!SAGA_MOBS[species] || !!SAGA_BOSSES[species]);
  }

  /** A click or tap on the world: a monster (or a friend) there becomes the target. True if something was picked. */
  pick(wx: number, wy: number): boolean {
    if (!this.on) return false;
    let best: string | number | null = null;
    let bestD = Infinity;
    const consider = (id: string | number): void => {
      const s = this.find(id);
      if (!s) return;
      const top = s.y + 4 - s.h;
      if (Math.abs(wx - s.x) > s.w / 2 + 4 || wy < top - 3 || wy > s.y + 7) return;
      const d = Math.hypot(wx - s.x, wy - (s.y + 4 - s.h / 2));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    };
    for (const a of Object.values(activeWorld()?.animals ?? {})) if (isSagaMonster(a)) consider(a.id);
    for (const id of Object.keys(sagaSnap()?.f ?? {})) if (id !== client.me) consider(id);
    if (best === null) return false;
    setTarget(best);
    return true;
  }

  // ------------------------------------------------------------------ from the server

  private onChange(c: Change): void {
    if (!this.on) return;
    if (c.t === 'zone') {
      if (c.zone && !this.born.has(c.id)) {
        this.born.set(c.id, serverNow());
        const me = myPlayer();
        // something is about to land near you
        if (me && serverNow() < c.zone.at && Math.hypot(me.x - c.zone.x, me.y - c.zone.y) / TILE < c.zone.r + 2.5) SAGA_SFX.warn();
      } else if (!c.zone) setTimeout(() => this.born.delete(c.id), 100);
    } else if (c.t === 'spell' && c.area === this.area) this.spell(c);
    else if (c.t === 'hit' && c.area === this.area) this.hit(c);
  }

  private add(dur: number, draw: Fx['draw'], at: { x: number; y: number }, to?: { x: number; y: number }, on?: string | number, delay = 0): Fx {
    const f: Fx = { t: -delay, dur, x: at.x, y: at.y, tx: to?.x ?? at.x, ty: to?.y ?? at.y, on, draw };
    this.list.push(f);
    return f;
  }

  /** The middle of someone's body (where things hit them). */
  private body(id: string | number | undefined, fallback: { x: number; y: number }): { x: number; y: number } {
    const s = id !== undefined ? this.find(id) : null;
    return s ? { x: s.x, y: s.y + 4 - s.h * 0.55 } : { x: fallback.x, y: fallback.y - 8 };
  }

  private spell(c: Extract<Change, { t: 'spell' }>): void {
    const me = myPlayer();
    const mine = c.by === client.me;
    const near = !me || Math.hypot(me.x - c.x, me.y - c.y) < 16 * TILE;
    if (mine || near) {
      if (c.spell.startsWith('cast_')) {
        const a = typeof c.by === 'number' ? activeWorld()?.animals[c.by] : undefined;
        const move = c.spell.slice(5);
        bossWindup(move, SAGA_BOSSES[a?.species ?? '']?.moves.find((m) => m.move === move)?.warn ?? 1500);
      } else SAGA_SFX.spell(c.spell);
    }
    const from = { x: c.x, y: c.y };
    const to = c.tx !== undefined && c.ty !== undefined ? { x: c.tx, y: c.ty } : null;
    const s = c.spell;
    const bolt = BOLTS[s] ?? (s.startsWith('mob_') && s !== 'mob_draugbage' ? MOB_BOLT : null);
    if (bolt && to) return this.bolt(s, bolt, from, to, c.on, c.by);
    if (s === 'mob_draugbage' && to) {
      // an arrow from the bow
      const end = this.body(c.on, to);
      this.fx.spawn(end.x, end.y + 6, 'arrow', { x: from.x, y: from.y - 2 });
      this.holdNumbers(c.on, Math.min(0.26, Math.hypot(end.x - from.x, end.y - from.y) * 0.0025));
      return;
    }
    if (s.startsWith('cast_')) return this.windup(s.slice(5), c.by, from);
    if (s.startsWith('land_')) return this.land(s.slice(5), from, c.by);
    switch (s) {
      case 'hugg':
        return this.slash(c.on, to ?? from, [0.9, 0.95, 1], 10, 1);
      case 'yxhugg':
        this.fx.spawn((to ?? from).x, (to ?? from).y, 'chop');
        return this.slash(c.on, to ?? from, [1, 0.55, 0.25], 12, 1.6);
      case 'claw':
        return this.claw(c.on, to ?? from);
      case 'utmana':
        return this.taunt(c.by, from);
      case 'skoldslag':
        return this.bash(c.on, to ?? from);
      case 'skoldmur':
        return this.burstRing(c.by, from, [1, 0.85, 0.45], 26, 0.45);
      case 'lakerunan':
        return this.healRune(c.on ?? c.by, to ?? from, 18, 0.9);
      case 'lakekrets':
        return this.healRing(c.by, from, (SPELLS.lakekrets?.radius ?? 4) * TILE);
      case 'vackupp':
        return this.sunrise(c.on, to ?? from);
      case 'stormsteg':
        return this.charge(from, to ?? from, c.on);
      case 'virvelvind':
        return this.whirl(c.by, from, (SPELLS.virvelvind?.radius ?? 2.2) * TILE);
      case 'raseri':
        return this.burstRing(c.by, from, [1, 0.3, 0.1], 30, 0.5);
      case 'askregn':
        return this.storm(to ?? from, (SPELLS.askregn?.radius ?? 2.4) * TILE);
      case 'blink':
        return this.blink(from, to ?? from);
      case 'potion':
        return this.potion(c.by, from);
      case 'charge_land':
        return this.bossCharge(from, to ?? from);
    }
  }

  /** A fireball, an ice lance, a light arrow or a monster's bolt: flies, then bursts on the target. */
  private bolt(id: string, b: { speed: number; c: [number, number, number]; size: number }, from: { x: number; y: number }, to: { x: number; y: number }, on: string | number | undefined, by: string | number): void {
    const start = this.body(by, from);
    const end0 = this.body(on, to);
    const dist = Math.hypot(end0.x - start.x, end0.y - start.y);
    const travel = Math.max(0.1, Math.min(0.6, dist / b.speed));
    this.holdNumbers(on, travel);
    const [r, g, bl] = b.c;
    const ice = id === 'isspjut' || id === 'mob_isande';
    const fire = id === 'eldboll';
    const trail: { x: number; y: number; t: number }[] = [];
    this.add(travel, (layer, f, k) => {
      const end = this.body(f.on, { x: f.tx, y: f.ty });
      const x = lerp(start.x, end.x, k);
      const y = lerp(start.y, end.y, k) - Math.sin(k * Math.PI) * (fire ? 6 : 2);
      const ang = Math.atan2(end.y - start.y, end.x - start.x);
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, 56, 56, 0, light(r, g, bl, 0.55));
        return;
      }
      if (layer !== 'bright') return;
      if (trail.length === 0 || this.t - trail[trail.length - 1]!.t > 0.016) trail.push({ x, y, t: this.t });
      for (const p of trail) {
        const age = (this.t - p.t) / 0.22;
        if (age >= 1) continue;
        const sz = b.size * (1 - age) * (fire ? 1.1 : 0.8);
        drawSprite(this.art.glow, p.x + (fire ? Math.sin(p.t * 40) * 1.2 : 0), p.y - (fire ? age * 4 : 0), sz, sz, 0, rgba(r, g * (fire ? 0.8 - age * 0.4 : 1), bl, 0.55 * (1 - age)));
      }
      if (ice) {
        // a long shard pointing where it flies
        drawSprite(this.art.glow, x, y, b.size * 2.2, b.size * 0.55, ang, rgba(r, g, bl, 0.9));
        drawSprite(this.art.glow, x + Math.cos(ang) * 3, y + Math.sin(ang) * 3, b.size * 1.1, b.size * 0.3, ang, rgba(1, 1, 1, 1));
      } else {
        drawSprite(this.art.glow, x, y, b.size * 1.8, b.size * 1.8, 0, rgba(r, g, bl, 0.75));
        drawSprite(this.art.glow, x, y, b.size * 0.75, b.size * 0.75, 0, rgba(1, 1, 0.9, 1));
      }
    }, from, to, on);
    // the burst where it lands
    if (fire) this.explode(end0, [1, 0.5, 0.12], 22, on, travel);
    else if (ice) this.shatter(end0, [0.6, 0.92, 1], on, travel);
    else this.explode(end0, b.c, 12, on, travel);
  }

  /** A burst of light and sparks (on someone: it follows them; after a delay: when a bolt lands). */
  private explode(spot: { x: number; y: number }, c: [number, number, number], size: number, on?: string | number, delay = 0): void {
    const [r, g, b] = c;
    const sparks = [...Array(7)].map((_, i) => ({ a: (i / 7) * TAU + Math.random() * 0.6, v: 18 + Math.random() * 16 }));
    this.add(0.4, (layer, f, k) => {
      const at = on !== undefined ? this.body(on, spot) : spot;
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, size * 5, size * 5, 0, light(r, g, b, 0.7 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      drawSprite(this.art.glow, at.x, at.y, size * (0.8 + e * 1.6), size * (0.8 + e * 1.6), 0, rgba(r, g, b, 0.85 * (1 - k)));
      drawSprite(this.art.glow, at.x, at.y, size * 0.7 * (1 - k), size * 0.7 * (1 - k), 0, rgba(1, 1, 0.85, 1 - k));
      for (const s of sparks) drawSprite(this.art.glow, at.x + Math.cos(s.a) * s.v * e, at.y + Math.sin(s.a) * s.v * e - 4 * e, 3.5, 3.5, 0, rgba(r, g, b, 1 - k));
    }, spot, undefined, on, delay);
  }

  private shatter(spot: { x: number; y: number }, c: [number, number, number], on?: string | number, delay = 0): void {
    const [r, g, b] = c;
    const bits = [...Array(8)].map((_, i) => ({ a: (i / 8) * TAU + Math.random() * 0.5, v: 12 + Math.random() * 14, spin: (Math.random() - 0.5) * 12 }));
    this.add(0.5, (layer, f, k) => {
      const at = on !== undefined ? this.body(on, spot) : spot;
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, 60, 60, 0, light(r, g, b, 0.5 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      drawSprite(this.art.glow, at.x, at.y, 20 * (1 - k * 0.5), 20 * (1 - k * 0.5), 0, rgba(r, g, b, 0.6 * (1 - k)));
      for (const s of bits) drawSprite(this.art.glow, at.x + Math.cos(s.a) * s.v * e, at.y + Math.sin(s.a) * s.v * e + 8 * k * k, 6, 2, s.a + s.spin * k, rgba(0.85, 0.97, 1, 1 - k));
    }, spot, undefined, on, delay);
  }

  /** A sword or axe swipe across the target. */
  private slash(on: string | number | undefined, at: { x: number; y: number }, c: [number, number, number], radius: number, width: number): void {
    const [r, g, b] = c;
    const a0 = -2.4 + Math.random() * 0.5;
    this.add(0.26, (layer, f, k) => {
      if (layer !== 'bright') return;
      const m = this.body(f.on, at);
      const reveal = easeOutCubic(Math.min(1, k * 1.8));
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        if (u > reveal) break;
        const a = a0 + u * 2.3;
        const x = m.x + Math.cos(a) * radius;
        const y = m.y + Math.sin(a) * radius * 0.75;
        const fade = (1 - k) * Math.sin(u * Math.PI);
        drawSprite(this.art.glow, x, y, 5 * width, 5 * width, 0, rgba(r, g, b, 0.9 * fade));
        drawSprite(this.art.glow, x, y, 2 * width, 2 * width, 0, rgba(1, 1, 1, fade));
      }
      if (k < 0.4) drawSprite(this.art.glow, m.x, m.y, 14, 14, 0, rgba(1, 1, 1, 0.5 * (1 - k / 0.4)));
    }, at, undefined, on);
  }

  /** A monster's claws: three red scratches. */
  private claw(on: string | number | undefined, at: { x: number; y: number }): void {
    this.add(0.3, (layer, f, k) => {
      if (layer !== 'bright') return;
      const m = this.body(f.on, at);
      const reveal = Math.min(1, k * 3);
      for (let i = -1; i <= 1; i++) {
        const x0 = m.x - 5 + i * 3;
        const y0 = m.y - 6;
        drawLine(P(x0, y0), P(x0 + 7 * reveal, y0 + 10 * reveal), W(1.2), col(1, 0.25, 0.2, 0.9 * (1 - k)));
      }
    }, at, undefined, on);
  }

  /** Utmana!: a shout ringing out, and every monster it reaches flashes. */
  private taunt(by: string | number, at: { x: number; y: number }): void {
    const reach = (SPELLS.utmana?.radius ?? 5) * TILE;
    const hit = Object.values(activeWorld()?.animals ?? {}).filter((a) => isSagaMonster(a) && Math.hypot(a.x - at.x, a.y - at.y) <= reach + 6);
    this.add(0.6, (layer, f, k) => {
      const m = this.body(by, at);
      if (layer === 'ground') {
        this.ring(m.x, m.y + 6, reach * easeOutCubic(k), 2.5 * (1 - k) + 0.5, col(1, 0.45, 0.2, 0.8 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      drawSprite(this.art.glow, m.x, m.y, 26, 26, 0, rgba(1, 0.4, 0.15, 0.6 * (1 - k)));
      for (const a of hit) {
        const s = this.find(a.id);
        if (s) drawSprite(this.art.glow, s.x, s.y + 4 - s.h - 4, 12, 12, 0, rgba(1, 0.25, 0.1, (1 - k) * 0.9));
      }
    }, at);
  }

  /** Sköldslag: a blue flash, and stars circling a dazed head. */
  private bash(on: string | number | undefined, at: { x: number; y: number }): void {
    const ms = (SPELLS.skoldslag?.ms ?? 1500) / 1000;
    this.burstRing(on, at, [0.5, 0.75, 1], 16, 0.35);
    this.stars(on, at, ms);
  }

  private stars(on: string | number | undefined, at: { x: number; y: number }, dur: number): void {
    this.add(dur, (layer, f, k) => {
      if (layer !== 'bright') return;
      const s = f.on !== undefined ? this.find(f.on) : null;
      const hx = s?.x ?? at.x;
      const hy = s ? s.y + 4 - s.h - 2 : at.y - 18;
      for (let i = 0; i < 3; i++) {
        const a = this.t * 7 + (i / 3) * TAU;
        drawSprite(this.art.glow, hx + Math.cos(a) * 6, hy + Math.sin(a) * 2, 4, 4, 0, rgba(1, 0.95, 0.4, Math.min(1, (1 - k) * 4)));
      }
    }, at, undefined, on);
  }

  /** A ring of light bursting out of someone (shield wall, rage, a stun). */
  private burstRing(on: string | number | undefined, at: { x: number; y: number }, c: [number, number, number], size: number, dur: number): void {
    const [r, g, b] = c;
    this.add(dur, (layer, f, k) => {
      const m = this.body(f.on, at);
      if (layer === 'light') {
        drawSprite(this.art.glow, m.x, m.y, size * 4, size * 4, 0, light(r, g, b, 0.6 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      this.ring(m.x, m.y, size * (0.3 + e), 2 * (1 - k) + 0.4, col(r, g, b, 1 - k));
      drawSprite(this.art.glow, m.x, m.y, size * 1.4, size * 1.4, 0, rgba(r, g, b, 0.55 * (1 - k)));
    }, at, undefined, on);
  }

  /** Läkerunan: a green rune circle under a friend and light rising from it. */
  private healRune(on: string | number | undefined, at: { x: number; y: number }, size: number, dur: number): void {
    const motes = [...Array(7)].map(() => ({ x: (Math.random() - 0.5) * 14, d: Math.random() * 0.4, v: 14 + Math.random() * 10 }));
    this.add(dur, (layer, f, k) => {
      const s = f.on !== undefined ? this.find(f.on) : null;
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) + 4;
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      if (layer === 'ground') {
        this.runeCircle(x, y, size * (0.7 + 0.3 * easeOutBack(Math.min(1, k * 3))), this.t * 1.5, col(0.45, 1, 0.55, 0.9 * fade));
        return;
      }
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y - 8, 70, 70, 0, light(0.4, 1, 0.5, 0.55 * fade));
        return;
      }
      drawSprite(this.art.glow, x, y - 12, 12, 40, 0, rgba(0.5, 1, 0.6, 0.35 * fade));
      for (const m of motes) {
        const u = clamp01((k - m.d) / (1 - m.d));
        if (u <= 0 || u >= 1) continue;
        drawSprite(this.art.glow, x + m.x, y - 4 - u * m.v * 1.4, 4, 4, 0, rgba(0.6, 1, 0.65, 1 - u));
      }
    }, at, undefined, on);
  }

  /** Läkekrets: a big ring of runes spreading round the healer. */
  private healRing(by: string | number, at: { x: number; y: number }, radius: number): void {
    this.add(1.3, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) + 4;
      const e = easeOutCubic(Math.min(1, k * 2));
      const fade = 1 - Math.max(0, k - 0.5) / 0.5;
      if (layer === 'ground') {
        this.runeCircle(x, y, radius * e, -this.t * 0.8, col(0.45, 1, 0.55, 0.85 * fade), 12);
        this.ring(x, y, radius * e * 0.6, 1, col(0.6, 1, 0.65, 0.5 * fade));
        return;
      }
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, radius * 3, radius * 3, 0, light(0.4, 1, 0.5, 0.45 * fade));
        return;
      }
      drawSprite(this.art.glow, x, y - 6, 30, 30, 0, rgba(0.5, 1, 0.6, 0.5 * fade));
    }, at);
  }

  /** Väck upp!: morning light pours down on a fallen friend. */
  private sunrise(on: string | number | undefined, at: { x: number; y: number }): void {
    this.add(1.4, (layer, f, k) => {
      const s = f.on !== undefined ? this.find(f.on) : null;
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) + 2;
      const fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y - 10, 90, 90, 0, light(1, 0.85, 0.45, 0.7 * fade));
        return;
      }
      if (layer === 'ground') {
        this.runeCircle(x, y + 2, 16, this.t, col(1, 0.85, 0.4, 0.9 * fade), 8);
        return;
      }
      drawSprite(this.art.glow, x, y - 40, 18, 90, 0, rgba(1, 0.9, 0.55, 0.55 * fade));
      drawSprite(this.art.glow, x, y - 40, 7, 90, 0, rgba(1, 1, 0.85, 0.7 * fade));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + this.t * 2;
        drawSprite(this.art.glow, x + Math.cos(a) * 12 * fade, y - 8 + Math.sin(a) * 4, 4, 4, 0, rgba(1, 0.95, 0.6, fade));
      }
    }, at, undefined, on);
  }

  /** Stormsteg: a rush of wind from where you were to the monster, and a thump. */
  private charge(from: { x: number; y: number }, to: { x: number; y: number }, on: string | number | undefined): void {
    for (let i = 0; i <= 4; i++) this.fx.dust(lerp(from.x, to.x, i / 4), lerp(from.y, to.y, i / 4) + 4, 2);
    this.add(0.45, (layer, f, k) => {
      if (layer !== 'bright') return;
      const fade = 1 - k;
      for (let i = -1; i <= 1; i++) {
        const ox = i * 3;
        drawLine(P(from.x + ox, from.y - 8 + ox), P(to.x + ox, to.y - 8 + ox), W(1.4 - Math.abs(i) * 0.5), col(0.85, 0.95, 1, 0.75 * fade));
      }
    }, from, to);
    this.burstRing(on, to, [1, 1, 1], 18, 0.35);
    this.stars(on, to, (SPELLS.stormsteg?.ms ?? 1000) / 1000);
    cameraShake(0.15);
  }

  /** Virvelvind: blades of wind spinning round the warrior. */
  private whirl(by: string | number, at: { x: number; y: number }, radius: number): void {
    this.add(0.55, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) - 4;
      const fade = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
      if (layer === 'ground') {
        this.ring(x, y + 8, radius, 1, col(0.85, 0.9, 1, 0.5 * fade));
        return;
      }
      if (layer !== 'bright') return;
      for (let blade = 0; blade < 3; blade++) {
        const base = this.t * 16 + (blade / 3) * TAU;
        for (let i = 0; i < 6; i++) {
          const a = base - i * 0.16;
          drawSprite(this.art.glow, x + Math.cos(a) * radius * 0.85, y + Math.sin(a) * radius * 0.5, 6 - i * 0.7, 6 - i * 0.7, 0, rgba(0.92, 0.96, 1, (0.85 - i * 0.12) * fade));
        }
      }
    }, at);
  }

  /** Åskregn: lightning strikes all over the spot. */
  private storm(at: { x: number; y: number }, radius: number): void {
    const strikes = [...Array(5)].map((_, i) => {
      const a = Math.random() * TAU;
      const d = i === 0 ? 0 : Math.random() * radius * 0.85;
      const x = at.x + Math.cos(a) * d;
      const y = at.y + Math.sin(a) * d;
      // a jagged bolt from high above
      const pts: [number, number][] = [];
      let px = x + (Math.random() - 0.5) * 20;
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        pts.push([lerp(px, x, u) + (j > 0 && j < 6 ? (Math.random() - 0.5) * 9 : 0), lerp(y - 70, y, u)]);
        if (j === 0) px = pts[0]![0];
      }
      return { x, y, at: i * 0.07, pts };
    });
    let shook = false;
    this.add(0.6, (layer, f, k) => {
      const t = k * 0.6;
      if (layer === 'ground') {
        this.ring(at.x, at.y, radius, 1.2, col(0.6, 0.8, 1, 0.7 * (1 - k)));
        return;
      }
      for (const s of strikes) {
        const age = (t - s.at) / 0.18;
        if (age < 0 || age > 1) continue;
        if (!shook) {
          shook = true;
          cameraShake(0.25);
        }
        if (layer === 'light') {
          drawSprite(this.art.glow, s.x, s.y, 110, 110, 0, light(0.7, 0.85, 1, 0.9 * (1 - age)));
          continue;
        }
        if (layer !== 'bright') continue;
        const pts = s.pts.map(([x, y]) => P(x, y));
        drawLineList(pts, W(4), col(0.45, 0.65, 1, 0.6 * (1 - age)));
        drawLineList(pts, W(1.3), col(1, 1, 1, 1 - age));
        drawSprite(this.art.glow, s.x, s.y, 26, 14, 0, rgba(0.7, 0.85, 1, 1 - age));
      }
    }, at);
  }

  /** Blink: a puff of purple sparkles where you were and where you land. */
  private blink(from: { x: number; y: number }, to: { x: number; y: number }): void {
    for (const at of [from, to]) {
      const motes = [...Array(8)].map((_, i) => ({ a: (i / 8) * TAU, v: 10 + Math.random() * 8 }));
      this.add(0.5, (layer, f, k) => {
        if (layer === 'light') {
          drawSprite(this.art.glow, at.x, at.y - 8, 60, 60, 0, light(0.75, 0.45, 1, 0.6 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        const e = easeOutCubic(k);
        drawSprite(this.art.glow, at.x, at.y - 8, 22 * (1 - k), 26 * (1 - k), 0, rgba(0.7, 0.45, 1, 0.8));
        for (const m of motes) drawSprite(this.art.glow, at.x + Math.cos(m.a + k * 3) * m.v * e, at.y - 8 + Math.sin(m.a + k * 3) * m.v * e, 3.5, 3.5, 0, rgba(0.9, 0.75, 1, 1 - k));
      }, at);
    }
  }

  /** A healing potion: bubbles, then a green glow. */
  private potion(by: string | number, at: { x: number; y: number }): void {
    const bubbles = [...Array(6)].map(() => ({ x: (Math.random() - 0.5) * 10, d: Math.random() * 0.5, s: 2 + Math.random() * 2.5 }));
    this.add(1, (layer, f, k) => {
      if (layer !== 'bright') return;
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) - 12;
      for (const b of bubbles) {
        const u = clamp01((k - b.d) / 0.5);
        if (u <= 0 || u >= 1) continue;
        drawSprite(this.art.glow, x + b.x + Math.sin(u * 9) * 1.5, y - u * 16, b.s, b.s, 0, rgba(1, 0.45, 0.6, 1 - u));
      }
      if (k > 0.4) drawSprite(this.art.glow, x, y + 4, 26, 30, 0, rgba(0.45, 1, 0.55, 0.5 * (1 - (k - 0.4) / 0.6)));
    }, at);
  }

  /** A boss gathering power: its colour swells around it and sparks rush in. */
  private windup(move: string, by: string | number, at: { x: number; y: number }): void {
    const a = typeof by === 'number' ? activeWorld()?.animals[by] : undefined;
    const warn = (SAGA_BOSSES[a?.species ?? '']?.moves.find((m) => m.move === move)?.warn ?? 1500) / 1000;
    const [r, g, b] = moveColour(move, by);
    const sparks = [...Array(10)].map((_, i) => ({ a: (i / 10) * TAU, d: Math.random() * 0.7 }));
    const fx = this.add(warn, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = s ? s.y + 4 - s.h * 0.5 : at.y - 12;
      const pulse = 0.75 + 0.25 * Math.sin(this.t * (8 + k * 16));
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, 60 + 60 * k, 60 + 60 * k, 0, light(r, g, b, 0.5 * k * pulse));
        return;
      }
      if (layer !== 'bright') return;
      const size = (s?.w ?? 24) * (1 + k * 0.8);
      drawSprite(this.art.glow, x, y, size * 1.6, size * 1.6, 0, rgba(r, g, b, (0.25 + 0.45 * k) * pulse));
      for (const sp of sparks) {
        const u = (k * 2.2 + sp.d) % 1;
        const dist = (1 - u) * 34;
        drawSprite(this.art.glow, x + Math.cos(sp.a + u) * dist, y + Math.sin(sp.a + u) * dist * 0.7, 4, 4, 0, rgba(r, g, b, u));
      }
    }, at, undefined, by);
    if (typeof by === 'number') this.windups.set(by, fx);
  }

  /** A boss's attack was stopped (Sköldslag, Stormsteg, Isspjut): its power bursts away in blue. */
  private stopped(id: number): void {
    const w = this.windups.get(id);
    if (w) w.t = w.dur;
    this.windups.delete(id);
    const s = this.find(id);
    if (!s) return;
    this.burstRing(id, s, [0.5, 0.85, 1], 26, 0.55);
    this.shatter({ x: s.x, y: s.y + 4 - s.h * 0.55 }, [0.55, 0.85, 1], id);
    cameraShake(0.3);
  }

  /** A boss's big attack lands where it was marked. */
  private land(move: string, at: { x: number; y: number }, by: string | number): void {
    const zone = (activeWorld()?.saga?.zones ?? []).find((z) => Math.abs(z.x - at.x) < 1 && Math.abs(z.y - at.y) < 1);
    const r = (zone?.r ?? 2) * TILE;
    const [cr, cg, cb] = moveColour(move, by);
    if (move === 'cleave' && zone?.shape === 'cone') {
      const dir = zone.dir ?? 0;
      const arc = ((zone.arc ?? 90) * Math.PI) / 180;
      this.add(0.45, (layer, f, k) => {
        if (layer === 'light') {
          drawSprite(this.art.glow, at.x + Math.cos(dir) * r * 0.5, at.y + Math.sin(dir) * r * 0.5, r * 2.6, r * 2.6, 0, light(cr, cg, cb, 0.7 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        // the blade sweeping through the cone, leaving a trail of fire or frost
        const sweep = easeOutCubic(Math.min(1, k * 1.6));
        for (let i = 0; i < 14; i++) {
          const u = i / 13;
          if (u > sweep) break;
          const a = dir - arc / 2 + arc * u;
          for (const d of [0.45, 0.7, 0.95]) drawSprite(this.art.glow, at.x + Math.cos(a) * r * d, at.y + Math.sin(a) * r * d, 10, 10, 0, rgba(cr, cg, cb, 0.75 * (1 - k)));
        }
      }, at);
      cameraShake(0.35);
      return;
    }
    if (move === 'rain' || move === 'freeze') {
      const shards = [...Array(move === 'freeze' ? 6 : 4)].map(() => ({ x: (Math.random() - 0.5) * r, y: (Math.random() - 0.5) * r, d: Math.random() * 0.15 }));
      this.add(0.6, (layer, f, k) => {
        if (layer === 'light') {
          drawSprite(this.art.glow, at.x, at.y, r * 3, r * 3, 0, light(0.6, 0.9, 1, 0.6 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        for (const s of shards) {
          const u = clamp01((k - s.d) / 0.25);
          if (u < 1) drawSprite(this.art.glow, at.x + s.x, at.y + s.y - 50 * (1 - u), 3, 12, 0, rgba(0.85, 0.97, 1, 0.9));
        }
        const e = easeOutCubic(clamp01((k - 0.25) / 0.75));
        if (k > 0.25) {
          this.ring(at.x, at.y, r * (0.4 + e * 0.8), 2 * (1 - e) + 0.4, col(0.7, 0.95, 1, 1 - e));
          drawSprite(this.art.glow, at.x, at.y, r * 1.6, r * 1.6, 0, rgba(0.6, 0.9, 1, 0.5 * (1 - e)));
        }
      }, at);
      this.shatter(at, [0.6, 0.92, 1]);
      return;
    }
    if (move === 'pools') {
      this.explode(at, [1, 0.45, 0.1], r * 0.8);
      this.fx.dust(at.x, at.y, 4);
      return;
    }
    // slam, nova, charge, summon: a shockwave out to the edge of the mark
    const big = move === 'nova';
    this.add(big ? 0.8 : 0.55, (layer, f, k) => {
      const e = easeOutCubic(k);
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, r * 2.8, r * 2.8, 0, light(cr, cg, cb, 0.8 * (1 - k)));
        return;
      }
      if (layer === 'ground') {
        drawEllipse(P(at.x, at.y), vec2(W(r * 2 * e), W(r * 2 * e)), col(cr, cg, cb, 0.25 * (1 - k)));
        return;
      }
      this.ring(at.x, at.y, r * e, 3 * (1 - k) + 0.5, col(cr, cg, cb, 1 - k));
      this.ring(at.x, at.y, r * e * 0.7, 1.5 * (1 - k) + 0.3, col(1, 1, 1, 0.8 * (1 - k)));
      drawSprite(this.art.glow, at.x, at.y, r * (0.6 + e), r * (0.6 + e), 0, rgba(cr, cg, cb, 0.5 * (1 - k)));
    }, at);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      this.fx.dust(at.x + Math.cos(a) * r * 0.8, at.y + Math.sin(a) * r * 0.8, 1);
    }
    cameraShake(big ? 0.7 : 0.45);
  }

  /** A boss rushing at someone: a trail of dust and a crash. */
  private bossCharge(from: { x: number; y: number }, to: { x: number; y: number }): void {
    for (let i = 0; i <= 6; i++) this.fx.dust(lerp(from.x, to.x, i / 6), lerp(from.y, to.y, i / 6) + 4, 2);
    this.add(0.5, (layer, f, k) => {
      if (layer !== 'bright') return;
      drawLine(P(from.x, from.y - 10), P(to.x, to.y - 10), W(6 * (1 - k)), col(1, 1, 1, 0.35 * (1 - k)));
    }, from, to);
    cameraShake(0.5);
  }

  // ------------------------------------------------------------------ floating numbers (HTML)

  /** Numbers for a target that something in flight is about to hit wait until it lands. */
  private holdNumbers(on: string | number | undefined, sec: number): void {
    if (on !== undefined) this.delay = { on, until: this.t + sec };
  }

  private hit(c: Extract<Change, { t: 'hit' }>): void {
    const s = this.find(c.on);
    if (!s) return;
    const monster = typeof c.on === 'number';
    let text = '';
    let cls: string = c.kind;
    if (c.kind === 'dmg') text = `-${c.n}`;
    else if (c.kind === 'crit') text = monster ? `${c.n}!` : `+${c.n}!`;
    else if (c.kind === 'heal') text = `+${c.n}`;
    else if (c.kind === 'block') text = `${T.sagaHitBlock} -${c.n}`;
    else if (c.kind === 'stun') text = `⭐ ${T.sagaHitStun}`;
    else if (c.kind === 'kick') text = `🛡️ ${T.sagaHitKick}`;
    else if (c.kind === 'miss') text = T.sagaHitMiss;
    if (c.kind === 'crit' && !monster) cls = 'crit heal';
    if (c.on === client.me && (c.kind === 'dmg' || c.kind === 'block')) cls += ' me';
    // healing someone already well (a lucky heal on full health) shows nothing
    if ((c.kind === 'heal' || (c.kind === 'crit' && !monster)) && c.n <= 0) return;
    const el = document.createElement('div');
    el.className = `label saga-fct ${cls}`;
    el.textContent = text;
    const now = this.t;
    const at = this.delay && this.delay.on === c.on && this.delay.until > now ? this.delay.until : now;
    el.style.visibility = at > now ? 'hidden' : '';
    if (at === now) this.labels.appendChild(el);
    // numbers that come together on the same body rise beside and above each other; healing rises to the right
    const n = this.floaters.filter((f) => f.on === c.on && Math.abs(f.born - at) < 0.4).length % 3;
    const side = cls.includes('heal') ? 10 : 0;
    const life = c.kind === 'kick' ? 1.5 : c.kind === 'crit' ? 1.25 : 1.1;
    this.floaters.push({ el, on: c.on, x: s.x, y: s.y + 4 - s.h, dx: side + [0, 9, -9][n]! + (Math.random() - 0.5) * 3, dy: -6 * n, born: at, life, at });
    // sounds for what matters to you
    const t = performance.now();
    if (c.on === client.me && c.kind === 'dmg' && t - this.lastHurtSound > 180) {
      this.lastHurtSound = t;
      SAGA_SFX.hurt();
    } else if (monster && c.kind === 'crit' && t - this.lastCritSound > 150) {
      this.lastCritSound = t;
      SAGA_SFX.crit();
    } else if (c.kind === 'stun') SAGA_SFX.stun();
    else if (c.kind === 'kick') {
      SAGA_SFX.kick();
      if (typeof c.on === 'number') this.stopped(c.on);
    }
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number): void {
    if (!this.on) return;
    this.t += dt;
    for (const f of this.list) f.t += dt;
    if (this.list.some((f) => f.t >= f.dur)) this.list = this.list.filter((f) => f.t < f.dur);
    if (this.delay && this.t > this.delay.until + 0.05) this.delay = null;
    for (const f of this.floaters) {
      if (f.at > this.t || f.el.isConnected) continue;
      this.labels.appendChild(f.el);
      f.el.style.visibility = '';
    }
    const old = this.floaters.filter((f) => this.t - f.born > f.life + 0.05);
    if (old.length) {
      for (const f of old) f.el.remove();
      this.floaters = this.floaters.filter((f) => this.t - f.born <= f.life + 0.05);
    }
    for (const [id, w] of this.windups) if (w.t >= w.dur) this.windups.delete(id);
  }

  /** Telegraphs and runes on the ground, under everyone (lit with the scene). */
  drawGround(): void {
    if (!this.on) return;
    const now = serverNow();
    for (const z of activeWorld()?.saga?.zones ?? []) this.drawZone(z, now);
    this.drawTargetRing();
    for (const f of this.list) if (f.t >= 0) f.draw('ground', f, clamp01(f.t / f.dur));
  }

  /** Into the light map: telegraphs glow red, magic lights up the dark. */
  paintLight(): void {
    if (!this.on) return;
    const now = serverNow();
    for (const z of activeWorld()?.saga?.zones ?? []) {
      const burning = z.until !== undefined && now >= z.at;
      const k = burning ? 1 : this.fill(z, now);
      const r = z.r * TILE;
      const cx = z.shape === 'cone' ? z.x + Math.cos(z.dir ?? 0) * r * 0.5 : z.x;
      const cy = z.shape === 'cone' ? z.y + Math.sin(z.dir ?? 0) * r * 0.5 : z.y;
      const fl = burning ? 0.8 + 0.2 * Math.sin(this.t * 5 + z.x) : 0.5 + 0.5 * k;
      drawSprite(this.art.glow, cx, cy, r * 2.6, r * 2.6, 0, burning ? light(1, 0.45, 0.12, 0.8 * fl) : light(1, 0.12, 0.08, 0.7 * fl));
    }
    for (const f of this.list) if (f.t >= 0) f.draw('light', f, clamp01(f.t / f.dur));
    // fallen friends lie in a little light so they can be found
    for (const id of Object.keys(sagaSnap()?.f ?? {})) {
      const fl = flagsOf(id);
      const s = fl & (FLAG.down | FLAG.frozen) ? this.find(id) : null;
      if (s) drawSprite(this.art.glow, s.x, s.y - 4, 50, 50, 0, fl & FLAG.frozen ? light(0.5, 0.85, 1, 0.8) : light(0.85, 0.85, 1, 0.6));
    }
  }

  /** In the y-sorted queue: the ice around a frozen friend. */
  queue(q: DrawQueue): void {
    if (!this.on) return;
    const white = this.art.white;
    for (const id of Object.keys(sagaSnap()?.f ?? {})) {
      if (!(flagsOf(id) & FLAG.frozen)) continue;
      const s = this.find(id);
      if (!s) continue;
      const shine = 0.5 + 0.5 * Math.sin(this.t * 2.5);
      q.push(s.y + 4.6, white, s.x, s.y - 8, 22, 28, 0, rgba(0.65, 0.88, 1, 0.42));
      q.push(s.y + 4.61, white, s.x - 6, s.y - 12, 2.5, 18, 0.25, rgba(1, 1, 1, 0.35 + 0.3 * shine));
      q.push(s.y + 4.61, white, s.x + 7, s.y - 2, 1.5, 9, 0.25, rgba(1, 1, 1, 0.3));
    }
  }

  /** On top of the lit scene: everything that glows by itself. */
  drawBright(): void {
    if (!this.on) return;
    setAdditiveBlendMode(true);
    const now = serverNow();
    for (const z of activeWorld()?.saga?.zones ?? []) this.drawZoneEdge(z, now);
    for (const f of this.list) if (f.t >= 0) f.draw('bright', f, clamp01(f.t / f.dur));
    this.drawAuras();
    setAdditiveBlendMode(false);
  }

  // ------------------------------------------------------------------ telegraphs

  /** 0 → 1 as an attack marked on the ground gets ready to land. */
  private fill(z: SagaZone, now: number): number {
    const born = this.born.get(z.id) ?? z.at - 1200;
    return clamp01((now - born) / Math.max(1, z.at - born));
  }

  private drawZone(z: SagaZone, now: number): void {
    const r = z.r * TILE;
    if (z.until !== undefined && now >= z.at) {
      // burning ground: lava that pulses and bubbles until it cools
      const left = clamp01((z.until - now) / 2000);
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 4 + z.x * 0.1);
      this.zoneShape(z, r, col(0.95, 0.32, 0.05, 0.55 * left * pulse));
      this.zoneShape(z, r * 0.7, col(1, 0.6, 0.15, 0.45 * left * pulse));
      this.ring(z.x, z.y, r, 1.2, col(1, 0.75, 0.3, 0.8 * left));
      return;
    }
    const k = this.fill(z, now);
    const blink = 0.5 + 0.5 * Math.sin(this.t * (6 + k * 18));
    this.zoneShape(z, r, col(0.85, 0.08, 0.06, 0.22 + 0.1 * blink));
    // it fills up from the middle (from the boss for a cone) until it lands
    this.zoneShape(z, r * k, col(0.95, 0.12, 0.05, 0.3 + 0.1 * k));
  }

  private drawZoneEdge(z: SagaZone, now: number): void {
    const r = z.r * TILE;
    if (z.until !== undefined && now >= z.at) {
      // embers rising from the pool
      for (let i = 0; i < 4; i++) {
        const u = (this.t * 0.6 + i * 0.25 + z.x * 0.013) % 1;
        const a = (i * 2.4 + z.y) % TAU;
        drawSprite(this.art.glow, z.x + Math.cos(a) * r * 0.6, z.y + Math.sin(a) * r * 0.5 - u * 14, 4, 4, 0, rgba(1, 0.6, 0.2, 1 - u));
      }
      return;
    }
    const k = this.fill(z, now);
    const blink = 0.55 + 0.45 * Math.sin(this.t * (6 + k * 18));
    const c = col(1, 0.18, 0.1, 0.55 + 0.4 * blink);
    if (z.shape === 'cone') this.coneOutline(z, r, W(1.2), c);
    else this.ring(z.x, z.y, r, 1.2, c);
    if (z.shape === 'circle') this.ring(z.x, z.y, r * k, 0.8, col(1, 0.35, 0.15, 0.85));
  }

  private zoneShape(z: SagaZone, r: number, c: Color): void {
    if (r <= 0.5) return;
    if (z.shape === 'cone') {
      const dir = z.dir ?? 0;
      const arc = ((z.arc ?? 90) * Math.PI) / 180;
      const pts: Vector2[] = [P(z.x, z.y)];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = dir - arc / 2 + (arc * i) / n;
        pts.push(P(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r));
      }
      drawPoly(pts, c);
    } else drawEllipse(P(z.x, z.y), vec2(W(r * 2), W(r * 2)), c);
  }

  private coneOutline(z: SagaZone, r: number, width: number, c: Color): void {
    const dir = z.dir ?? 0;
    const arc = ((z.arc ?? 90) * Math.PI) / 180;
    const pts: Vector2[] = [P(z.x, z.y)];
    for (let i = 0; i <= 14; i++) {
      const a = dir - arc / 2 + (arc * i) / 14;
      pts.push(P(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r));
    }
    drawLineList(pts, width, c, true);
  }

  private ring(x: number, y: number, r: number, width: number, c: Color, n = 40): void {
    if (r <= 0.5) return;
    const pts: Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      pts.push(P(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    drawLineList(pts, W(width), c, true);
  }

  /** A circle with little rune marks round it, turning slowly. */
  private runeCircle(x: number, y: number, r: number, turn: number, c: Color, marks = 6): void {
    if (r <= 1) return;
    this.ring(x, y, r, 1, c);
    this.ring(x, y, r * 0.78, 0.6, c, 32);
    for (let i = 0; i < marks; i++) {
      const a = turn + (i / marks) * TAU;
      const mx = x + Math.cos(a) * r * 0.89;
      const my = y + Math.sin(a) * r * 0.89;
      drawLine(P(mx - 1.6, my - 1.6), P(mx + 1.6, my + 1.6), W(0.8), c);
      drawLine(P(mx - 1.6, my + 1.6), P(mx + 1.6, my - 1.6), W(0.8), c);
    }
  }

  /** A turning ring under your target: red under a monster, green under a friend. */
  private drawTargetRing(): void {
    const t = liveTarget();
    if (t === null) return;
    const s = this.find(t);
    if (!s) return;
    const friend = typeof t === 'string';
    const rx = Math.max(9, s.w * 0.55);
    const ry = rx * 0.5;
    const c = friend ? col(0.45, 1, 0.5, 0.95) : col(1, 0.82, 0.25, 0.95);
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const a0 = this.t * 1.6 + (i / segs) * TAU;
      const a1 = a0 + (TAU / segs) * 0.6;
      const pts: Vector2[] = [];
      for (let j = 0; j <= 4; j++) {
        const a = lerp(a0, a1, j / 4);
        pts.push(P(s.x + Math.cos(a) * rx, s.y + 4 + Math.sin(a) * ry));
      }
      drawLineList(pts, W(1.3), c);
    }
  }

  /** Lasting looks: a shield wall's bubble, rage's flames, the healing ring's leaves, a fallen friend's glow. */
  private drawAuras(): void {
    const snap = sagaSnap();
    if (!snap) return;
    for (const [id, f] of Object.entries(snap.f)) {
      const fl = f[2];
      if (!fl) continue;
      const s = this.find(id);
      if (!s) continue;
      const cx = s.x;
      const cy = s.y - 8;
      if (fl & FLAG.wall) {
        const pulse = 0.8 + 0.2 * Math.sin(this.t * 4);
        drawSprite(this.art.glow, cx, cy, 30, 34, 0, rgba(0.55, 0.75, 1, 0.22 * pulse));
        const pts: Vector2[] = [];
        for (let i = 0; i < 6; i++) {
          const a = this.t * 0.8 + (i / 6) * TAU;
          pts.push(P(cx + Math.cos(a) * 14, cy + Math.sin(a) * 15));
        }
        drawLineList(pts, W(0.9), col(1, 0.88, 0.5, 0.75 * pulse), true);
      }
      if (fl & FLAG.rage) {
        for (let i = 0; i < 5; i++) {
          const u = (this.t * 1.8 + i * 0.2) % 1;
          const ox = Math.sin(i * 2.1 + this.t * 3) * 6;
          drawSprite(this.art.glow, cx + ox, s.y + 2 - u * 22, 7 * (1 - u) + 2, 9 * (1 - u) + 2, 0, rgba(1, 0.35 + 0.3 * u, 0.08, 0.75 * (1 - u)));
        }
      }
      if (fl & FLAG.hot) {
        for (let i = 0; i < 3; i++) {
          const u = (this.t * 0.7 + i / 3) % 1;
          const a = i * 2.1 + this.t;
          drawSprite(this.art.glow, cx + Math.cos(a) * 8, cy + 6 - u * 18, 3.5, 3.5, 0, rgba(0.5, 1, 0.55, 1 - u));
        }
      }
      if (fl & FLAG.slow) drawSprite(this.art.glow, cx, s.y + 2, 20, 8, 0, rgba(0.5, 0.75, 1, 0.35));
      if (fl & FLAG.down) {
        // a little halo over a fallen friend
        const bob = Math.sin(this.t * 2) * 1.5;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + this.t;
          drawSprite(this.art.glow, cx + Math.cos(a) * 6, s.y - 6 + bob + Math.sin(a) * 2, 2.5, 2.5, 0, rgba(1, 0.95, 0.7, 0.8));
        }
      }
      if (fl & FLAG.frozen) {
        const tw = Math.max(0, Math.sin(this.t * 3 + cx));
        drawSprite(this.art.glow, cx - 5, cy - 9, 6 * tw, 6 * tw, 0, rgba(1, 1, 1, tw));
      }
    }
    // the boss winding up something that can be stopped: a blue shield over its head
    const b = snap.b;
    if (b?.cast?.kick) {
      const s = this.find(b.id);
      if (s) {
        const pulse = 0.6 + 0.4 * Math.sin(this.t * 10);
        drawSprite(this.art.glow, s.x, s.y + 4 - s.h - 10, 22, 22, 0, rgba(0.5, 0.85, 1, 0.6 * pulse));
      }
    }
  }

  // ------------------------------------------------------------------ labels

  /** Floating numbers and health bars follow whoever they belong to. */
  /** `screenY`: where a world y is on the screen (px), to keep the numbers out from under the boss's bars. */
  placeLabels(place: (el: HTMLElement, x: number, y: number) => void, screenY: (y: number) => number): void {
    if (!this.on) return;
    // the lowest world y a number may end at: its text just below the boss's bars
    const floor = this.floaters.length && sagaSnap()?.b ? hudFloor() : 0;
    const zoom = screenY(1) - screenY(0);
    const minY = floor && zoom > 0 ? (floor + 8 * zoomPx() - screenY(0)) / zoom : -Infinity;
    for (const f of this.floaters) {
      if (!f.el.isConnected) continue;
      const k = clamp01((this.t - f.born) / f.life);
      const s = this.find(f.on);
      if (s) {
        f.x = s.x;
        f.y = s.y + 4 - s.h;
      }
      place(f.el, f.x + f.dx * (0.6 + 0.4 * k), Math.max(minY, f.y + f.dy - 4 - 16 * easeOutCubic(k)));
    }
    this.placeBars(place);
  }

  private placeBars(place: (el: HTMLElement, x: number, y: number) => void): void {
    const snap = sagaSnap();
    const seen = new Set<string>();
    const t = liveTarget();
    const bar = (key: string, s: Spot, k: number, cls: string, name: string | null): void => {
      seen.add(key);
      let el = this.bars.get(key);
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<span></span><b><i></i></b>';
        this.labels.appendChild(el);
        this.bars.set(key, el);
      }
      const want = `label saga-bar-${cls}`;
      if (el.className !== want) el.className = want;
      const nm = el.firstElementChild as HTMLElement;
      if (nm.textContent !== (name ?? '')) nm.textContent = name ?? '';
      const fill = el.querySelector('i')!;
      const w = `${Math.max(0, Math.min(1, k)) * 100}%`;
      if (fill.style.width !== w) fill.style.width = w;
      fill.style.background = cls === 'friend' ? (k > 0.5 ? '#4fcf5a' : k > 0.25 ? '#f2c33a' : '#e8473a') : '';
      place(el, s.x, s.y + 4 - s.h - (cls === 'friend' ? 1 : 2));
    };
    if (snap) {
      for (const [ids, m] of Object.entries(snap.m)) {
        const id = Number(ids);
        const a = activeWorld()?.animals[id];
        const s = a ? this.find(id) : null;
        if (!a || !s || id === snap.b?.id) continue;
        const boss = SAGA_BOSSES[a.species];
        bar(`m${id}`, s, m[0] / Math.max(1, m[1]), boss ? 'boss' : a.species === 'isblock' ? 'ice' : t === id ? 'target' : 'mob', boss || t === id || a.species === 'isblock' ? a.name : null);
      }
      for (const [id, f] of Object.entries(snap.f)) {
        const s = this.find(id);
        if (s && !(f[2] & FLAG.down)) bar(`p${id}`, s, f[0] / Math.max(1, f[1]), 'friend', null);
      }
    }
    // a waiting monster you aim at shows its name too
    if (typeof t === 'number' && t !== snap?.b?.id && !seen.has(`m${t}`)) {
      const a = activeWorld()?.animals[t];
      const s = a ? this.find(t) : null;
      if (a && s) bar(`m${t}`, s, 1, 'target', a.name);
    }
    for (const [key, el] of this.bars)
      if (!seen.has(key)) {
        el.remove();
        this.bars.delete(key);
      }
  }
}
