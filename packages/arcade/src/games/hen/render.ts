// Drawing a level on the LCD: the place behind, the tiles, the animals, Hilda, the bits flying about,
// the night's lantern light and the bar at the top.
import * as A from './art.ts';
import { text } from './font.ts';
import { H, MAP_DIM, Screen, W, type Sprite } from './gfx.ts';
import {
  BLOCK,
  CROW_ALERT,
  CROW_PERCH,
  CRUMBLE,
  FOX_DIZZY,
  FOX_RUN,
  FOX_SLEEP,
  FOX_WAKE,
  GROUND,
  HEN_H,
  HEN_W,
  HUD_H,
  ICE,
  LINE,
  PLANK,
  P_DROP,
  P_DUST,
  P_FEATHER,
  P_FLY,
  P_HAY,
  P_HEART,
  P_LEAF,
  P_NOTE,
  P_SMOKE,
  P_SNOW,
  P_SPARK,
  P_STAR,
  P_STREAK,
  P_TEXT,
  P_ZZZ,
  SPRING,
  THORN,
  TS,
  WATER,
  hash,
  type Ent,
  type World,
} from './world.ts';

const SMALL_HEART = A.HEART;

// ------------------------------------------------------------------ the place behind

function hills(s: Screen, camX: number, f: number, base: number, a1: number, k1: number, a2: number, k2: number, shade: number, half: boolean, phase = 0): void {
  for (let x = 0; x < W; x++) {
    const wx = x + camX * f + phase;
    const top = Math.round(base + Math.sin(wx * k1) * a1 + Math.sin(wx * k2 + 1.3) * a2);
    if (half) {
      s.px(x, top, shade);
      for (let y = top + 1; y < H; y++) if (((x + y) & 1) === 0) s.px(x, y, shade);
    } else s.rect(x, top, 1, H - top, shade);
  }
}

function clouds(s: Screen, camX: number, t: number, y0: number, speed: number, shadeMap: readonly number[] | null): void {
  for (let i = 0; i < 6; i++) {
    const big = i % 2 === 0;
    const spr = big ? A.CLOUD : A.CLOUD_SMALL;
    const span = 260;
    const x = ((((i * 97 + t * speed - camX * 0.15) % span) + span) % span) - 50;
    const y = y0 + ((i * 37) % 28);
    s.blit(spr, x, y, false, shadeMap);
  }
}

function background(s: Screen, w: World, t: number): void {
  const cx = w.camX;
  const place = w.def.place;
  if (place === 'meadow') {
    s.clear(0);
    clouds(s, cx, t, 16, 3, null);
    hills(s, cx, 0.2, 92, 9, 0.021, 5, 0.047, 1, true);
    // the near meadow: light, with a soft edge and tufts, so the animals stand out in front of it
    for (let x = 0; x < W; x++) {
      const wx = x + cx * 0.42 + 40;
      const top = Math.round(106 + Math.sin(wx * 0.035) * 6 + Math.sin(wx * 0.083 + 1.3) * 4);
      s.rect(x, top, 1, H - top, 0);
      s.px(x, top, 1);
      if (hash(Math.floor(wx) * 11) < 0.12) s.px(x, top - 1, 1);
      if (hash(Math.floor(wx) * 5 + 2) < 0.05) {
        s.px(x, top + 4, 1);
        s.px(x + 1, top + 3, 1);
      }
    }
    for (let i = -1; i < 9; i++) {
      const k = Math.floor((cx * 0.42) / 37) + i;
      const x = Math.round(k * 37 - cx * 0.42 + hash(k * 3) * 14);
      const wx = x + cx * 0.42 + 40;
      const top = Math.round(106 + Math.sin(wx * 0.035) * 6 + Math.sin(wx * 0.083 + 1.3) * 4);
      if (hash(k * 7 + 3) < 0.55) s.blit(A.BUSH, x, top - 3, false, [1, 1, 2, 2]);
    }
  } else if (place === 'forest') {
    s.clear(0);
    hills(s, cx, 0.15, 70, 6, 0.03, 3, 0.07, 1, true);
    // trunks far and near
    for (const [f, gap, wd, shade] of [
      [0.3, 29, 5, 1],
      [0.55, 47, 9, 1],
    ] as const) {
      const off = cx * f;
      for (let i = -1; i < W / gap + 2; i++) {
        const k = Math.floor(off / gap) + i;
        const x = Math.round(k * gap - off + hash(k * 13) * 12);
        const ww = wd + Math.floor(hash(k * 5) * 3);
        if (shade === 1 && f < 0.5) s.checker(x, 0, ww, H, 1);
        else {
          s.rect(x, 0, ww, H, 1);
          s.rect(x + 2, 0, 1, H, 2);
          for (let y = (k * 17) % 23; y < H; y += 23) s.px(x + ww - 3, y, 2);
        }
      }
    }
    // the leafy roof
    for (let x = 0; x < W; x++) {
      const wx = x + cx * 0.55;
      const d = Math.round(18 + Math.sin(wx * 0.11) * 4 + Math.sin(wx * 0.037) * 5);
      s.rect(x, 0, 1, d, 2);
      if (((x + d) & 1) === 0) s.px(x, d, 2);
      if (((x + d + 1) & 1) === 0) s.px(x, d + 1, 2);
      if (hash(Math.floor(wx) * 3) < 0.25) s.px(x, d - 3, 3);
    }
  } else if (place === 'barn') {
    s.clear(1);
    const off = cx * 0.5;
    // planks
    for (let i = -1; i < W / 12 + 2; i++) {
      const k = Math.floor(off / 12) + i;
      const x = Math.round(k * 12 - off);
      s.rect(x, 0, 1, H, 2);
      for (let y = 20 + ((k * 29) % 50); y < H; y += 61) s.rect(x + 4 + (k % 3), y, 2, 1, 2);
    }
    // windows with light falling in
    for (let i = -1; i < 3; i++) {
      const k = Math.floor(off / 96) + i;
      const x = Math.round(k * 96 - off + 30);
      s.rect(x, 26, 18, 16, 0);
      s.box(x - 1, 25, 20, 18, 3);
      s.rect(x + 8, 26, 2, 16, 2);
      s.rect(x, 33, 18, 1, 2);
      for (let y = 43; y < 140; y++) {
        const sx = x + Math.floor((y - 43) * 0.45);
        for (let xx = sx; xx < sx + 18; xx++) if (((xx + y) & 3) === 0 && s.get(xx, y) === 1) s.px(xx, y, 0);
      }
    }
    // a beam across
    s.rect(0, 52, W, 3, 2);
    s.rect(0, 55, W, 1, 3);
  } else if (place === 'roof') {
    s.clear(0);
    clouds(s, cx, t, 14, 22, null);
    hills(s, cx, 0.12, 100, 5, 0.025, 3, 0.06, 1, true);
    // the farm far below: a silo, barns and trees
    const off = cx * 0.25;
    for (let i = -1; i < 4; i++) {
      const k = Math.floor(off / 70) + i;
      const x = Math.round(k * 70 - off);
      const kind = Math.floor(hash(k * 9 + 1) * 3);
      if (kind === 0) {
        s.rect(x + 10, 84, 10, 30, 1);
        s.disc(x + 15, 84, 5, 1);
      } else if (kind === 1) {
        s.rect(x + 6, 96, 26, 20, 1);
        for (let j = 0; j < 14; j++) s.rect(x + 6 + j, 96 - j * 0.7, 26 - j * 2, 1, 1);
      } else {
        s.disc(x + 18, 100, 8, 1);
        s.rect(x + 17, 104, 2, 10, 1);
      }
    }
    // little birds far away
    for (let i = 0; i < 3; i++) {
      const x = Math.round(((i * 71 + t * 9 - cx * 0.1) % 220 + 220) % 220) - 30;
      const y = 30 + i * 11 + Math.round(Math.sin(t * 2 + i) * 2);
      const up = Math.floor(t * 4 + i) % 2 === 0;
      s.px(x, y, 2);
      s.px(x + 1, y + (up ? -1 : 1), 2);
      s.px(x - 1, y + (up ? -1 : 1), 2);
    }
  } else if (place === 'winter') {
    s.clear(1);
    clouds(s, cx, t, 12, 2, [1, 0, 0, 0]);
    hills(s, cx, 0.18, 84, 8, 0.02, 5, 0.05, 0, false);
    hills(s, cx, 0.18, 84, 8, 0.02, 5, 0.05, 2, true, 0);
    // put snow back on the far hills, leaving a dark edge
    for (let x = 0; x < W; x++) {
      const wx = x + cx * 0.18;
      const top = Math.round(84 + Math.sin(wx * 0.02) * 8 + Math.sin(wx * 0.05 + 1.3) * 5);
      s.rect(x, top + 1, 1, H - top - 1, 0);
      s.px(x, top, 2);
    }
    const off = cx * 0.4;
    for (let i = -1; i < 7; i++) {
      const k = Math.floor(off / 31) + i;
      const x = Math.round(k * 31 - off + hash(k) * 10);
      if (hash(k * 3 + 1) < 0.6) s.blit(A.PINE, x, 96 + Math.floor(hash(k * 7) * 8), false, [0, 1, 2, 2]);
    }
  } else {
    // night: the hills and the farm far away; the sky's lights come after the dark
    s.clear(3);
    hills(s, cx, 0.18, 96, 7, 0.022, 4, 0.05, 2, false);
    // the farmhouse far away, its windows lit
    const off = cx * 0.3;
    for (let i = -1; i < 3; i++) {
      const k = Math.floor(off / 120) + i;
      const x = Math.round(k * 120 - off + 20);
      s.rect(x, 86, 36, 26, 2);
      for (let j = 0; j < 16; j++) s.rect(x - 2 + j, 86 - j, 40 - j * 2, 1, 2);
      s.rect(x + 6, 94, 5, 5, 1);
      s.rect(x + 24, 94, 5, 5, 1);
      s.rect(x + 15, 100, 6, 12, 1);
      s.px(x + 7, 95, 0);
      s.px(x + 25, 95, 0);
    }
  }
}

// ------------------------------------------------------------------ tiles

function drawTiles(s: Screen, w: World, t: number): void {
  const set = A.TILES[w.def.place]!;
  const cx = Math.round(w.camX);
  const cy = Math.round(w.camY);
  const c0 = Math.floor(cx / TS);
  const r0 = Math.floor(cy / TS);
  const map = w.def.map;
  for (let r = Math.max(0, r0); r <= r0 + H / TS + 1 && r < w.h; r++) {
    for (let c = c0; c <= c0 + W / TS + 1 && c < w.w; c++) {
      const tt = w.tile(c, r);
      if (tt === 0 || tt === SPRING || tt === LINE) continue;
      const x = c * TS - cx;
      const y = r * TS - cy;
      const above = w.tile(c, r - 1);
      const ch = map[r]?.[c] ?? '.';
      switch (tt) {
        case GROUND: {
          const open = !(above === GROUND || above === BLOCK || above === ICE || above === THORN || above === CRUMBLE);
          s.blit(open ? set.top : set.fill, x, y);
          if (open && above === 0) decor(s, w, c, r, x, y, t);
          break;
        }
        case BLOCK: {
          if (ch === 'u') {
            // a chimney pot
            s.rect(x - 1, y + 1, TS + 2, 3, 3);
            s.rect(x, y + 2, TS, 1, 2);
            s.blit(set.block, x, y + 4);
          } else if (w.def.place === 'forest' && (w.tile(c, r - 1) === BLOCK || w.tile(c, r + 1) === BLOCK)) {
            // a tall trunk, with bark
            s.rect(x, y, TS, TS, 2);
            const l = w.tile(c - 1, r) !== BLOCK;
            const rr = w.tile(c + 1, r) !== BLOCK;
            if (l) s.rect(x, y, 1, TS, 3);
            if (rr) s.rect(x + TS - 1, y, 1, TS, 3);
            for (let j = 0; j < 3; j++) s.rect(x + 2 + ((r * 3 + c * 5 + j * 3) % 5), y + ((j * 3 + r) % 8), 1, 3, 3);
            if (w.tile(c, r - 1) !== BLOCK) {
              s.rect(x, y, TS, 1, 3);
              s.rect(x + 1, y + 1, TS - 2, 1, 1);
            }
          } else s.blit(set.block, x, y);
          break;
        }
        case PLANK:
          s.blit(set.plank, x, y);
          break;
        case WATER: {
          if (above === 0) {
            const shift = Math.floor(t * 4 + c) % 2;
            s.blit(set.waterTop, x + (shift ? 1 : 0), y);
            s.blit(set.waterTop, x - 7 + (shift ? 1 : 0), y);
          } else s.blit(set.water, x, y);
          break;
        }
        case THORN:
          s.blit(set.thorn, x, y);
          break;
        case CRUMBLE: {
          const cr = w.crumbs.get(r * w.w + c);
          const shake = cr && cr.st === 1 ? (Math.floor(cr.t * 30) % 2 ? 1 : -1) : 0;
          s.blit(set.crumble, x + shake, y + (cr && cr.st === 1 && cr.t > 0.3 ? 1 : 0));
          break;
        }
        case ICE:
          s.blit(set.ice, x, y);
          break;
      }
    }
  }
}

/** Flowers, mushrooms and tufts on the ground, and the windsocks on the roofs. */
function decor(s: Screen, w: World, c: number, r: number, x: number, y: number, t: number): void {
  const place = w.def.place;
  const k = hash(c * 7919 + r * 104729);
  const dx = Math.floor(hash(c * 31 + 7) * 4);
  if (place === 'roof') {
    if (c % 37 === 9) windsock(s, x + 3, y, w.wind, w.windWarn, t);
    return;
  }
  let spr: Sprite | null = null;
  let map: readonly number[] | null = null;
  if (place === 'meadow') spr = k < 0.13 ? A.FLOWER : k < 0.22 ? A.FLOWER_B : k < 0.34 ? A.TUFT : null;
  else if (place === 'forest') spr = k < 0.12 ? A.MUSHROOM_DECOR : k < 0.3 ? A.TUFT : null;
  else if (place === 'night') {
    spr = k < 0.1 ? A.FLOWER : k < 0.22 ? A.TUFT : null;
    map = A.NIGHT_MAP;
  }
  if (spr) s.blit(spr, x + dx, y - spr.h + 1, k * 100 % 2 < 1, map);
}

/** A striped windsock on a pole: it hangs in still air and streams out with the wind. */
function windsock(s: Screen, x: number, y: number, wind: number, warn: number, t: number): void {
  s.rect(x, y - 15, 1, 15, 3);
  s.rect(x - 1, y - 16, 3, 1, 3);
  const dir = Math.sign(wind || warn) || 1;
  const str = Math.min(1, Math.abs(wind) + Math.abs(warn) * 0.25);
  const ang = (1 - str) * 1.3 + Math.sin(t * 11) * 0.12 * str;
  for (let i = 0; i < 5; i++) {
    const d = 1.5 + i * 2.2;
    const px = Math.round(x + dir * Math.cos(ang) * d);
    const py = Math.round(y - 14 + Math.sin(ang) * d);
    const size = i < 2 ? 2 : 1;
    s.rect(px - (dir < 0 ? size : 0), py - 1, size + 1, size + 1, i % 2 ? 0 : 2);
    s.px(px, py - 1, 3);
  }
}

// ------------------------------------------------------------------ things in the level

const NIGHT = (w: World): readonly number[] | null => (w.def.place === 'night' ? A.NIGHT_MAP : null);

function drawLine(s: Screen, w: World, e: Ent, cx: number, cy: number): void {
  const x0 = e.x - cx;
  const x1 = e.x + e.w - cx;
  const y = e.y + 1 - cy;
  // posts down to the roof below
  for (const px of [x0, x1 - 1]) {
    let len = 0;
    while (len < 40 && !w.solidAt(px + cx + 0.5, e.y + len + 2)) len++;
    s.rect(px - 1, y - 3, 3, len + 4, 3);
    s.rect(px, y - 2, 1, len + 2, 2);
  }
  const wob = e.t > 0 && e.t < 10 ? Math.sin(e.t * 26) * (1 - e.t * 2) * 5 : 0;
  const mid = e.n || e.w / 2;
  let prev = -1;
  for (let i = 0; i <= e.w; i++) {
    const f = i / e.w;
    const sag = Math.sin(f * Math.PI) * 3 + wob * Math.max(0, 1 - Math.abs(i - mid) / 30);
    const yy = Math.round(y + sag);
    s.px(x0 + i, yy, 3);
    if (prev >= 0 && Math.abs(prev - yy) > 1) s.px(x0 + i, (prev + yy) >> 1, 3);
    prev = yy;
    // washing pegged on the line
    const k = Math.floor(i / 9);
    if (i % 9 === 4 && i > 4 && i < e.w - 4) {
      const kind = Math.floor(hash(k + e.x) * 3);
      if (kind === 0) {
        s.rect(x0 + i - 2, yy + 1, 5, 5, 0);
        s.box(x0 + i - 2, yy + 1, 5, 5, 2);
      } else if (kind === 1) {
        s.rect(x0 + i - 1, yy + 1, 2, 5, 1);
        s.rect(x0 + i - 1, yy + 5, 3, 2, 1);
        s.px(x0 + i - 1, yy + 1, 3);
      } else {
        s.rect(x0 + i - 3, yy + 1, 7, 3, 2);
        s.rect(x0 + i - 2, yy + 4, 5, 3, 2);
      }
    }
  }
}

function drawSpring(s: Screen, w: World, e: Ent, cx: number, cy: number): void {
  const set = A.TILES[w.def.place]!;
  const x = e.x - cx;
  const bottom = e.y + TS - cy;
  const k = e.t > 0 && e.t < 10 ? e.t : 1;
  if (k < 0.09) s.blit(set.springSquash, x, bottom - set.springSquash.h);
  else if (k < 0.5) {
    const sy = 1 + Math.sin((k - 0.09) * 24) * 0.25 * (1 - (k - 0.09) / 0.41);
    s.blitScaled(set.spring, x + 8, bottom, 1 / Math.sqrt(sy), sy);
  } else s.blit(set.spring, x, bottom - set.spring.h);
}

function drawEnts(s: Screen, w: World, t: number, front: boolean): void {
  const cx = Math.round(w.camX);
  const cy = Math.round(w.camY);
  const map = NIGHT(w);
  for (const e of w.ents) {
    if (e.dead) continue;
    if (e.x - cx > W + 40 || e.x + e.w - cx < -40) continue;
    const isFront = e.k === 'fox' || e.k === 'hog' || e.k === 'crow' || e.k === 'bird' || e.k === 'egg' || e.k === 'gold';
    if (isFront !== front) continue;
    const x = Math.round(e.x - cx);
    const y = Math.round(e.y - cy);
    switch (e.k) {
      case 'egg': {
        const bob = Math.round(Math.sin(t * 3 + e.x * 0.3) * 1);
        s.blit(A.EGG, x, y + bob, false, map);
        break;
      }
      case 'gold': {
        const bob = Math.round(Math.sin(t * 4 + e.x) * 1.5);
        s.blit(A.GOLD, x, y + bob);
        if (Math.floor(t * 3) % 3 === 0) s.blit(A.SPARK, x + 5, y + bob, false);
        break;
      }
      case 'fox': {
        const run = e.st === FOX_RUN;
        if (run && e.t > 1.1 && Math.floor(e.t * 16) % 2) break;
        let spr: Sprite = Math.floor(e.t * (run ? 14 : 6)) % 2 ? A.FOX.walkB : A.FOX.walkA;
        if (e.st === FOX_DIZZY) spr = A.FOX.dizzy;
        if (e.st === FOX_SLEEP) spr = A.FOX.sleep;
        if (e.st === FOX_WAKE) spr = A.FOX.walkA;
        const flip = e.dir < 0;
        if (e.st === FOX_WAKE) {
          s.blit(spr, x - 1, y + e.h - 12 - (e.t < 0.15 ? 3 : 0), flip, map);
          text(s, '!', x + 6, y - 11, 3, { outline: 0 });
          break;
        }
        if (e.st === FOX_DIZZY && e.t < 0.2) s.blitScaled(spr, x + 7, y + e.h, 1.3, 0.6, flip, map);
        else s.blit(spr, x - 1, y + e.h - 12, flip, map);
        if (e.st === FOX_DIZZY || e.st === FOX_RUN) {
          // stars going round its head
          for (let i = 0; i < 3; i++) {
            const a = t * 7 + (i * Math.PI * 2) / 3;
            const hx = x + (flip ? 3 : 11);
            s.blit(A.SPARK, hx + Math.cos(a) * 6 - 1, y - 6 + Math.sin(a) * 2, false, [0, 0, 3, 3]);
          }
        }
        break;
      }
      case 'hog': {
        const spr = Math.floor(e.t * 4) % 2 ? A.HOG.walkB : A.HOG.walkA;
        s.blit(spr, x - 1, y + e.h - spr.h, e.dir < 0, map);
        break;
      }
      case 'crow': {
        let spr: Sprite;
        if (e.st === CROW_PERCH) spr = A.CROW.sit;
        else if (e.st === CROW_ALERT) spr = Math.floor(e.t * 10) % 2 ? A.CROW.caw : A.CROW.sit;
        else spr = Math.floor(t * 10) % 2 ? A.CROW.flyA : A.CROW.flyB;
        const flip = e.dir < 0;
        if (spr === A.CROW.sit || spr === A.CROW.caw) s.blit(spr, x, y + e.h - spr.h, flip, map);
        else s.blit(spr, x - 2, y, flip, map);
        if (e.st === CROW_ALERT) text(s, '!', x + 4, y - 9, 3, { outline: 0 });
        break;
      }
      case 'bird': {
        const spr = Math.floor(t * 9 + e.ph) % 2 ? A.CROW.flyA : A.CROW.flyB;
        s.blit(spr, x - 1, y, e.dir < 0, map);
        break;
      }
      case 'mover': {
        s.blit(A.BALE, x, y, false, map);
        if (w.def.place === 'winter') {
          s.rect(x + 1, y - 1, 22, 2, 0);
          s.rect(x + 3, y - 2, 18, 1, 0);
        }
        break;
      }
      case 'scare': {
        const happy = e.st === 1;
        const spr = happy ? A.SCARECROW.happy : A.SCARECROW.idle;
        const wave = happy && Math.floor(e.t * 3) % 2 === 1;
        s.blit(spr, x, y, wave, map);
        break;
      }
      case 'house': {
        s.blit(A.HOUSE, x, y, false, map);
        if (w.houseClosed) {
          s.rect(x + 9, y + 20, 14, 11, w.def.place === 'night' ? 2 : 1);
          s.rect(x + 15, y + 20, 1, 11, 3);
          s.px(x + 13, y + 26, 3);
        }
        if (w.def.place === 'night' || w.houseClosed) {
          // a light in the round window
          s.rect(x + 13, y + 11, 6, 3, 0);
        }
        break;
      }
      case 'lantern': {
        const barn = w.def.place === 'barn';
        if (barn) {
          s.rect(x + 2, -cy, 1, y + cy, 3);
        } else {
          let len = 0;
          while (len < 60 && !w.solidAt(e.x + 3, e.y + 7 + len)) len++;
          s.rect(x + 2, y + 6, 2, len + 1, 3);
        }
        s.blit(A.LANTERN, x, y, false);
        if (Math.floor(t * 6) % 4 === 0) s.px(x + 2, y + 3, 1);
        break;
      }
      case 'sign':
        s.blit(A.SIGN, x, y, false, map);
        break;
      case 'spring':
        drawSpring(s, w, e, cx, cy);
        break;
      case 'line':
        drawLine(s, w, e, cx, cy);
        break;
    }
  }
  if (!front) {
    // snowmen are only for looking at
    const map2 = w.def.map;
    const c0 = Math.floor(cx / TS) - 2;
    for (let r = 0; r < w.h; r++)
      for (let c = Math.max(0, c0); c < c0 + 24 && c < w.w; c++) if (map2[r]![c] === 'n') s.blit(A.SNOWMAN, c * TS - cx - 1, (r + 1) * TS - cy - A.SNOWMAN.h);
  }
}

// ------------------------------------------------------------------ Hilda

export function henSprite(w: World, t: number): Sprite {
  const h = w.hen;
  if (h.stun > 0) return A.HEN.hurt;
  if (w.auto && h.ground && Math.abs(h.vx) < 1) return A.HEN.happy;
  if (h.ground) {
    if (Math.abs(h.vx) > 8) {
      const f = Math.floor(h.anim * (6 + (Math.abs(h.vx) / 82) * 8)) % 4;
      return f === 0 ? A.HEN.runA : f === 2 ? A.HEN.runB : A.HEN.stand;
    }
    if (h.still > 3 && Math.floor(t * 2.2) % 3 === 0) return A.HEN.sit;
    return h.blink < 0 ? A.HEN.blink : A.HEN.stand;
  }
  if (h.flapT > 0) return Math.floor(t * 14) % 2 ? A.HEN.flapUp : A.HEN.flapDown;
  return h.vy < 0 ? A.HEN.jump : A.HEN.fall;
}

function drawHen(s: Screen, w: World, t: number): void {
  const h = w.hen;
  if (h.hidden) return;
  if (h.inv > 0 && h.stun <= 0 && Math.floor(t * 16) % 2 === 0) return;
  const spr = henSprite(w, t);
  const cx = Math.round(h.x + HEN_W / 2 - w.camX);
  const by = Math.round(h.y + HEN_H - w.camY);
  s.blitScaled(spr, cx, by, h.sx, h.sy, h.face < 0);
}

// ------------------------------------------------------------------ bits flying about

function drawParts(s: Screen, w: World, t: number, front: boolean): void {
  const cx = Math.round(w.camX);
  const cy = Math.round(w.camY);
  const dark = w.def.place === 'night';
  for (const p of w.parts) {
    const isBack = p.k === P_SMOKE || p.k === P_FLY;
    if (isBack === front) continue;
    const x = Math.round(p.x - cx);
    const y = Math.round(p.y - cy);
    const f = p.t / p.life;
    switch (p.k) {
      case P_DUST: {
        const r = 1 + f * 3;
        if (f < 0.7) s.disc(x, y, r, p.c);
        else s.ring(x, y, r, p.c);
        break;
      }
      case P_SMOKE: {
        const r = 1.5 + f * 4;
        if (f < 0.85) {
          s.ring(x, y, r, dark ? 2 : 1);
          if (f < 0.5) s.disc(x, y, r - 1, 0);
        }
        break;
      }
      case P_FEATHER:
        s.blit(Math.sin(p.t * 6 + p.seed) > 0 ? A.FEATHER : A.FEATHER_B, x - 1, y - 1, Math.sin(p.t * 3 + p.seed) > 0, p.c ? [3, 2, 3, 3] : null);
        break;
      case P_SPARK:
        if (Math.floor(p.t * 20) % 3 !== 2) s.blit(f < 0.5 ? A.SPARK_BIG : A.SPARK, x - (f < 0.5 ? 2 : 1), y - (f < 0.5 ? 2 : 1), false, dark ? null : [0, 1, 3, 3]);
        break;
      case P_TEXT:
        text(s, p.s, x, y, 3, { outline: 0, align: 'center' });
        break;
      case P_LEAF:
        s.px(x, y, 2);
        s.px(x + (Math.sin(p.t * 4 + p.seed) > 0 ? 1 : -1), y, 2);
        s.px(x, y + 1, 3);
        break;
      case P_SNOW:
        s.px(x, y, 0);
        if (p.seed % 3 < 1.2) {
          s.px(x + 1, y, 0);
          s.px(x, y + 1, 0);
          s.px(x + 1, y + 1, 0);
        }
        break;
      case P_STREAK: {
        // a gust: a light line with a darker head
        const len = 6 + Math.floor(p.seed % 8);
        const ahead = p.vx > 0 ? x + len - 3 : x;
        s.rect(x, y, len, 1, dark ? 2 : 1);
        s.rect(ahead, y, 3, 1, 2);
        break;
      }
      case P_DROP:
        s.px(x, y, dark ? 1 : 0);
        s.px(x, y + 1, dark ? 2 : 1);
        break;
      case P_HAY:
        if (p.c === 1) s.px(x, y, Math.floor(p.t * 3 + p.seed) % 2 ? 0 : 2);
        else {
          s.px(x, y, 1);
          s.px(x + 1, y + 1, 2);
        }
        break;
      case P_HEART:
        s.blit(SMALL_HEART, x - 3, y - 3, false, [2, 2, 2, 3]);
        break;
      case P_STAR:
        s.blit(A.STAR, x - 2, y - 2);
        break;
      case P_ZZZ:
        s.blit(A.ZZZ, x, y, false, f > 0.7 ? [2, 2, 2, 2] : [1, 1, 1, 1]);
        break;
      case P_NOTE:
        s.blit(A.NOTE, x - 1, y - 2, false, dark ? [1, 1, 1, 1] : null);
        break;
      case P_FLY:
        if (Math.sin(p.t * 3 + p.seed) > -0.3) {
          s.px(x, y, 0);
          s.px(x + 1, y, 1);
        }
        break;
    }
  }
}

// ------------------------------------------------------------------ the night: light only near lanterns

function nightSky(s: Screen, w: World, t: number): void {
  const cx = w.camX;
  for (let i = 0; i < 46; i++) {
    const x = Math.round((((hash(i * 7 + 1) * 400 - cx * 0.05) % 200) + 200) % 200) - 20;
    const y = 12 + Math.floor(hash(i * 3 + 2) * 56);
    if (s.get(x, y) !== 3) continue;
    const tw = Math.sin(t * (1 + hash(i) * 2) + i) > 0.6;
    s.px(x, y, tw ? 0 : 1);
    if (tw && i % 5 === 0) {
      s.px(x - 1, y, 2);
      s.px(x + 1, y, 2);
      s.px(x, y - 1, 2);
      s.px(x, y + 1, 2);
    }
  }
  s.blit(A.MOON, 118 - Math.round(cx * 0.02), 18, false, [0, 1, 2, 3]);
}

function darkness(s: Screen, w: World, t: number): void {
  const cx = w.camX;
  const cy = w.camY;
  const lights: [number, number, number][] = [];
  const h = w.hen;
  if (!h.hidden) lights.push([h.x + HEN_W / 2 - cx, h.y + 4 - cy, 46 + Math.sin(t * 3) * 1.5]);
  for (const e of w.ents) {
    if (e.dead) continue;
    if (e.k === 'lantern') lights.push([e.x + 3 - cx, e.y + 4 - cy, 34 + Math.sin(t * 5 + e.x) * 1.2]);
    else if (e.k === 'gold') lights.push([e.x + 4 - cx, e.y + 5 - cy, 14]);
    else if (e.k === 'house') lights.push([e.x + 16 - cx, e.y + 14 - cy, 40]);
    else if (e.k === 'scare' && e.st === 1) lights.push([e.x + 8 - cx, e.y + 6 - cy, 22]);
  }
  for (const p of w.parts) if (p.k === P_FLY) lights.push([p.x - cx, p.y - cy, 9]);
  const near = lights.filter(([lx, ly, r]) => lx > -r && lx < W + r && ly > -r && ly < H + r);
  const b = s.b;
  for (let y = HUD_H; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let best = 9;
      for (const [lx, ly, r] of near) {
        const dx = x - lx;
        const dy = y - ly;
        const d = (dx * dx + dy * dy) / (r * r);
        if (d < best) best = d;
      }
      if (best < 0.72) continue;
      if (best < 1 && ((x + y) & 1) === 0) continue;
      const k = y * W + x;
      b[k] = MAP_DIM[b[k]!]!;
    }
  }
}

// ------------------------------------------------------------------ all of it

export function drawWorld(s: Screen, w: World, t: number): void {
  // a bump shakes the picture for a moment (the bar at the top stays put)
  const cx = w.camX;
  const cy = w.camY;
  if (w.shake > 0) {
    const k = Math.min(1, w.shake * 7);
    w.camX += Math.round((Math.random() - 0.5) * 4 * k);
    w.camY += Math.round((Math.random() - 0.5) * 4 * k);
  }
  drawScene(s, w, t);
  w.camX = cx;
  w.camY = cy;
}

function drawScene(s: Screen, w: World, t: number): void {
  background(s, w, t);
  if (w.def.dark) {
    darkness(s, w, t);
    nightSky(s, w, t);
  }
  drawParts(s, w, t, false);
  drawEnts(s, w, t, false);
  drawTiles(s, w, t);
  drawEnts(s, w, t, true);
  drawHen(s, w, t);
  drawParts(s, w, t, true);
}

export interface HudInfo {
  hearts: number;
  score: number;
}

export function drawHud(s: Screen, w: World, info: HudInfo): void {
  s.rect(0, 0, W, HUD_H, 3);
  s.rect(0, HUD_H - 1, W, 1, 2);
  const shown = Math.max(3, info.hearts);
  // the last heart blinks, so it is clear to be careful
  const lastBlink = info.hearts === 1 && Math.floor(w.time * 3) % 2 === 0;
  for (let i = 0; i < shown; i++) {
    if (i === 0 && lastBlink) s.blit(A.HEART_EMPTY, 2, 2);
    else s.blit(i < info.hearts ? A.HEART : A.HEART_EMPTY, 2 + i * 8, 2);
  }
  const ex = 2 + shown * 8 + 3;
  s.blit(A.EGG_ICON, ex, 2);
  const ew = text(s, `${w.eggsGot}/${w.eggs}`, ex + 6, 1, 0);
  text(s, String(info.score), 134, 1, 0, { align: 'right' });
  for (let i = 0; i < w.golds; i++) s.blit(i < w.goldsGot ? A.GOLD_ICON : A.GOLD_SLOT, W - 4 - (w.golds - i) * 6 + 1, 2);
  // the wind's way, on the windy roofs
  if (w.def.wind && (w.wind !== 0 || w.windWarn !== 0)) {
    const dir = Math.sign(w.wind || w.windWarn);
    const blink = w.windWarn !== 0 && Math.floor(w.time * 8) % 2 === 0;
    if (!blink) {
      const x = ex + 6 + ew + 5;
      const str = Math.abs(w.wind) > 0.5 ? 2 : 1;
      for (let i = 0; i < str + 1; i++) text(s, dir > 0 ? '>' : '<', x + i * 4, 1, i === 0 ? 1 : 0);
    }
  }
}
