// "HD" art: the same world drawn with smooth shapes, gradients and soft shadows at R× resolution.
// Every function draws in *virtual* pixels (16 per tile) on a canvas that is R times larger.
import { Px, hash2, shade } from './px.js';
import { R } from './style.ts';
import { PAINT_COLORS, type ObjectArt, type TerrainTiles } from './world.js';
import type { Terrain } from '@lilla-garden/shared';

type Ctx = CanvasRenderingContext2D;

/** A Px whose context is scaled by R so drawing code can use virtual coordinates. */
export function hd(w: number, h: number): Px {
  const p = new Px(w * R, h * R);
  p.ctx.imageSmoothingEnabled = true;
  p.ctx.imageSmoothingQuality = 'high';
  p.ctx.scale(R, R);
  return p;
}

/** Nearest-neighbour upscale of a pixel-art canvas (fallback for things without HD art). */
export function upscale(src: Px | HTMLCanvasElement): Px {
  const c = src instanceof Px ? src.canvas : src;
  const p = new Px(c.width * R, c.height * R);
  p.ctx.imageSmoothingEnabled = false;
  p.ctx.drawImage(c, 0, 0, c.width * R, c.height * R);
  return p;
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------
const rr = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
};
const lin = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
};
const rad = (ctx: Ctx, cx: number, cy: number, r: number, stops: [number, string][], fx = cx, fy = cy) => {
  const g = ctx.createRadialGradient(fx, fy, 0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
};
const fillRR = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number, style: string | CanvasGradient) => {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = style;
  ctx.fill();
};
const ellipse = (ctx: Ctx, cx: number, cy: number, rx: number, ry: number, style: string | CanvasGradient) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = style;
  ctx.fill();
};
/** Shaded blob: a sphere-like ellipse lit from the top left. */
const blob = (ctx: Ctx, cx: number, cy: number, rx: number, ry: number, light: string, mid: string, dark: string) => {
  ellipse(ctx, cx, cy, rx, ry, rad(ctx, cx, cy, Math.max(rx, ry) * 1.1, [[0, light], [0.55, mid], [1, dark]], cx - rx * 0.35, cy - ry * 0.4));
};
const softShadow = (ctx: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.35) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ellipse(ctx, 0, 0, rx, rx, rad(ctx, 0, 0, rx, [[0, `rgba(0,0,0,${a})`], [0.6, `rgba(0,0,0,${a * 0.6})`], [1, 'rgba(0,0,0,0)']]));
  ctx.restore();
};
const stroke = (ctx: Ctx, pts: [number, number][], c: string, w = 1, cap: CanvasLineCap = 'round') => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = cap;
  ctx.stroke();
};
/** Hash in [0,1). */
const rnd = (seed: number, i: number) => (hash2(seed * 7 + i * 13, seed * 3 + i * 31) % 1000) / 1000;

// ---------------------------------------------------------------------------
// terrain (16×16 virtual; seamless by wrapping scattered details)
// ---------------------------------------------------------------------------
const wrapped = (ctx: Ctx, draw: (dx: number, dy: number) => void) => {
  for (const dx of [-16, 0, 16]) for (const dy of [-16, 0, 16]) draw(dx, dy);
};
const scatter = (ctx: Ctx, seed: number, n: number, draw: (x: number, y: number, i: number) => void) => {
  for (let i = 0; i < n; i++) {
    const x = rnd(seed, i * 2) * 16;
    const y = rnd(seed, i * 2 + 1) * 16;
    wrapped(ctx, (dx, dy) => draw(x + dx, y + dy, i));
  }
};

const GRASS_A = '#5f9f3e';
const GRASS_B = '#6aae48';

function paintGrass(ctx: Ctx, seed: number): void {
  // flat base (no per-tile gradient, so tiles never show a seam) with soft wrapped patches and sparse blades
  ctx.fillStyle = '#62a844';
  ctx.fillRect(0, 0, 16, 16);
  scatter(ctx, seed, 6, (x, y, i) => {
    const r = 3 + rnd(seed, 90 + i) * 3;
    ellipse(ctx, x, y, r, r * 0.7, rad(ctx, x, y, r, [[0, i % 2 ? 'rgba(40,110,30,0.16)' : 'rgba(170,230,120,0.14)'], [1, 'rgba(0,0,0,0)']]));
  });
  scatter(ctx, seed + 50, 4, (x, y, i) => {
    const h = 1.2 + rnd(seed, 60 + i) * 1.3;
    stroke(ctx, [[x, y + h], [x + 0.5, y]], i % 3 ? 'rgba(45,110,35,0.4)' : 'rgba(190,240,140,0.45)', 0.7);
    stroke(ctx, [[x + 1, y + h], [x + 0.8, y + 0.3]], 'rgba(45,110,35,0.3)', 0.6);
  });
}

function paintSoil(ctx: Ctx, seed: number, wet: boolean): void {
  const a = wet ? '#5f3d20' : '#8a5a32';
  const b = wet ? '#4b2f17' : '#75492a';
  ctx.fillStyle = lin(ctx, 0, 0, 0, 16, [[0, a], [1, b]]);
  ctx.fillRect(0, 0, 16, 16);
  for (let y = 2; y < 16; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, 16, 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y + 1.2, 16, 0.6);
  }
  scatter(ctx, seed, 8, (x, y, i) => ellipse(ctx, x, y, 1 + rnd(seed, 20 + i), 0.8, i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,220,170,0.14)'));
}

/** Rounded inner region for soil / water tiles: open sides (mask bits) are inset with a round corner. */
const insetPath = (ctx: Ctx, mask: number, inset: number, corner: number) => {
  const l = mask & 8 ? inset : -8;
  const t = mask & 1 ? inset : -8;
  const r = mask & 2 ? 16 - inset : 24;
  const b = mask & 4 ? 16 - inset : 24;
  const c = (bits: number) => ((mask & bits) === bits ? corner : 0.01);
  ctx.beginPath();
  ctx.moveTo(l + c(9), t);
  ctx.lineTo(r - c(3), t);
  ctx.arcTo(r, t, r, t + c(3), c(3));
  ctx.lineTo(r, b - c(6));
  ctx.arcTo(r, b, r - c(6), b, c(6));
  ctx.lineTo(l + c(12), b);
  ctx.arcTo(l, b, l, b - c(12), c(12));
  ctx.lineTo(l, t + c(9));
  ctx.arcTo(l, t, l + c(9), t, c(9));
  ctx.closePath();
};

export function drawTerrainTilesHD(): TerrainTiles {
  const tiles: Px[] = [];
  const add = (p: Px) => tiles.push(p) - 1;
  const tile = (draw: (ctx: Ctx) => void) => {
    const p = hd(16, 16);
    draw(p.ctx);
    return add(p);
  };

  const grass = [0, 1, 2, 3, 4, 5].map((v) => tile((ctx) => paintGrass(ctx, v + 1)));
  const snow = [0, 1].map((v) =>
    tile((ctx) => {
      ctx.fillStyle = lin(ctx, 0, 0, 16, 16, [[0, '#f6f8fc'], [1, '#e4ebf4']]);
      ctx.fillRect(0, 0, 16, 16);
      scatter(ctx, 30 + v, 4, (x, y) => ellipse(ctx, x, y, 3, 2, 'rgba(190,205,225,0.35)'));
      scatter(ctx, 40 + v, 3, (x, y) => ellipse(ctx, x, y, 0.6, 0.6, 'rgba(255,255,255,0.9)'));
    }),
  );
  const soilSet = (wet: boolean) =>
    Array.from({ length: 16 }, (_, mask) =>
      tile((ctx) => {
        paintGrass(ctx, 7 + mask);
        ctx.save();
        insetPath(ctx, mask, 2.5, 5);
        ctx.clip();
        paintSoil(ctx, mask + (wet ? 100 : 0), wet);
        // inner shadow along the grass edge
        insetPath(ctx, mask, 2.5, 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }),
    );
  const soil = soilSet(false);
  const soilWet = soilSet(true);

  const water: number[][] = Array.from({ length: 16 }, (_, mask) =>
    [0, 1].map((frame) =>
      tile((ctx) => {
        // shore (sand) underneath
        ctx.fillStyle = lin(ctx, 0, 0, 16, 16, [[0, '#e6d4a0'], [1, '#d9c48c']]);
        ctx.fillRect(0, 0, 16, 16);
        ctx.save();
        insetPath(ctx, mask, 1.5, 6);
        ctx.clip();
        ctx.fillStyle = lin(ctx, 0, 0, 0, 16, [[0, '#4a9ae0'], [1, '#2f78c8']]);
        ctx.fillRect(-8, -8, 32, 32);
        // ripples
        const sh = frame ? 3 : 0;
        scatter(ctx, 60 + mask, 4, (x, y, i) => {
          const w = 2.5 + rnd(mask, 70 + i) * 3;
          stroke(ctx, [[x + sh - w, y], [x + sh - w / 2, y - 0.6], [x + sh, y], [x + sh + w / 2, y - 0.6], [x + sh + w, y]], 'rgba(220,240,255,0.55)', 0.8);
        });
        // shallow lighter rim + foam
        if (mask) {
          insetPath(ctx, mask, 1.5, 6);
          ctx.strokeStyle = 'rgba(160,220,240,0.7)';
          ctx.lineWidth = 3;
          ctx.stroke();
          insetPath(ctx, mask, 1.5, 6);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      }),
    ),
  );

  const sand = tile((ctx) => {
    ctx.fillStyle = lin(ctx, 0, 0, 16, 16, [[0, '#e8d6a4'], [1, '#d8c48c']]);
    ctx.fillRect(0, 0, 16, 16);
    scatter(ctx, 80, 6, (x, y, i) => ellipse(ctx, x, y, 0.7, 0.5, i % 2 ? 'rgba(120,90,40,0.25)' : 'rgba(255,255,255,0.5)'));
  });
  const pathStone = tile((ctx) => {
    ctx.fillStyle = '#7d7a72';
    ctx.fillRect(0, 0, 16, 16);
    const stones: [number, number, number, number][] = [
      [0.5, 0.5, 7, 7],
      [8.5, 0.5, 7, 7],
      [0.5, 8.5, 7, 7],
      [8.5, 8.5, 7, 7],
    ];
    stones.forEach(([x, y, w, h], i) => {
      fillRR(ctx, x, y, w, h, 2.2, lin(ctx, x, y, x + w, y + h, [[0, i % 2 ? '#c2bfb5' : '#b4b1a7'], [1, '#8f8c84']]));
      fillRR(ctx, x + 1, y + 1, w - 2, 2, 1.5, 'rgba(255,255,255,0.22)');
    });
  });
  const pathDirt = tile((ctx) => {
    ctx.fillStyle = lin(ctx, 0, 0, 16, 16, [[0, '#b89262'], [1, '#a6804f']]);
    ctx.fillRect(0, 0, 16, 16);
    scatter(ctx, 90, 5, (x, y, i) => ellipse(ctx, x, y, 2.5, 1.6, i % 2 ? 'rgba(90,60,30,0.18)' : 'rgba(255,230,190,0.18)'));
  });
  const floorWood = tile((ctx) => {
    for (let i = 0; i < 4; i++) {
      const y = i * 4;
      ctx.fillStyle = lin(ctx, 0, y, 0, y + 4, [[0, i % 2 ? '#c89a62' : '#bf905a'], [1, '#a9784a']]);
      ctx.fillRect(0, y, 16, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + 3.4, 16, 0.6);
      const seam = (i * 7 + 3) % 16;
      ctx.fillRect(seam, y, 0.6, 4);
      stroke(ctx, [[1, y + 1.5], [6, y + 1.2], [12, y + 1.8]], 'rgba(90,55,25,0.25)', 0.5);
    }
  });
  const floorStone = tile((ctx) => {
    ctx.fillStyle = '#8c8a86';
    ctx.fillRect(0, 0, 16, 16);
    for (const [x, y] of [
      [0.4, 0.4],
      [8.4, 0.4],
      [0.4, 8.4],
      [8.4, 8.4],
    ] as const)
      fillRR(ctx, x, y, 7.2, 7.2, 1, lin(ctx, x, y, x + 7, y + 7, [[0, '#c4c1bb'], [1, '#a19e98']]));
  });
  const gravel = tile((ctx) => {
    ctx.fillStyle = '#a19c92';
    ctx.fillRect(0, 0, 16, 16);
    scatter(ctx, 110, 9, (x, y, i) => ellipse(ctx, x, y, 1.2, 0.9, ['#c9c4ba', '#8a857b', '#b5b0a6'][i % 3]!));
  });
  const ice = tile((ctx) => {
    ctx.fillStyle = lin(ctx, 0, 0, 16, 16, [[0, '#d8f0ff'], [1, '#aedcf7']]);
    ctx.fillRect(0, 0, 16, 16);
    stroke(ctx, [[2, 3], [7, 7], [6, 12]], 'rgba(255,255,255,0.8)', 0.6);
    stroke(ctx, [[10, 2], [12, 8], [15, 10]], 'rgba(120,180,220,0.6)', 0.6);
  });
  const rock = tile((ctx) => {
    ctx.fillStyle = '#1d1c22';
    ctx.fillRect(0, 0, 16, 16);
    scatter(ctx, 120, 4, (x, y) => ellipse(ctx, x, y, 3, 2, 'rgba(255,255,255,0.03)'));
  });

  const sheet = new Px(tiles.length * 16 * R, 16 * R);
  tiles.forEach((t, i) => sheet.blit(t, i * 16 * R, 0));
  return {
    canvas: sheet.canvas,
    count: tiles.length,
    rock,
    edges: true,
    waterFrames: [water[0]![0]!, water[0]![1]!],
    index: (t: Terrain, x: number, y: number, snowy: boolean, mask = 0, frame = 0) => {
      const h = hash2(x, y);
      switch (t) {
        case 'grass':
          return snowy ? snow[h % 2]! : grass[h % grass.length]!;
        case 'soil':
          return soil[mask & 15]!;
        case 'soil_wet':
          return soilWet[mask & 15]!;
        case 'water':
          return water[mask & 15]![frame]!;
        case 'sand':
          return snowy ? snow[h % 2]! : sand;
        case 'path_stone':
          return pathStone;
        case 'path_dirt':
          return pathDirt;
        case 'floor_wood':
          return floorWood;
        case 'floor_stone':
          return floorStone;
        case 'snow':
          return snow[h % 2]!;
        case 'gravel':
          return gravel;
        case 'ice':
          return ice;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------
const trunk = (ctx: Ctx, x: number, y: number, w: number, h: number) => {
  fillRR(ctx, x, y, w, h, 1.5, lin(ctx, x, 0, x + w, 0, [[0, '#6b4524'], [0.45, '#9a6a3a'], [1, '#5a3a1e']]));
  ellipse(ctx, x + w / 2, y + h - 0.5, w / 2 + 1.5, 1.5, 'rgba(60,35,15,0.6)');
};

function treeRound(v: number, apple: boolean): Px {
  const p = hd(24, 36);
  const ctx = p.ctx;
  trunk(ctx, 10, 22, 4, 13);
  blob(ctx, 12, 14, 11, 10.5, '#5aa845', '#3f8a37', '#255f27');
  blob(ctx, 8.5 + (v % 2) * 2, 10, 6.5, 5.5, '#8fd36a', '#5fb24a', '#3f8a37');
  blob(ctx, 15.5 - (v % 2) * 2, 15, 5.5, 4.5, '#7cc55c', '#4f9e42', '#3f8a37');
  ellipse(ctx, 7, 8 + (v % 2), 2.2, 1.4, 'rgba(255,255,255,0.35)');
  if (apple)
    for (const [x, y] of [
      [6, 12],
      [14, 8],
      [17, 16],
      [9, 19],
    ] as const) {
      blob(ctx, x, y, 1.6, 1.6, '#ff8a8a', '#d8363a', '#8a1c20');
    }
  return p;
}

function treePine(): Px {
  const p = hd(24, 36);
  const ctx = p.ctx;
  trunk(ctx, 10, 27, 4, 9);
  const layer = (yTop: number, yBot: number, half: number) => {
    ctx.beginPath();
    ctx.moveTo(12, yTop);
    ctx.quadraticCurveTo(12 + half * 0.6, yBot - 2, 12 + half, yBot);
    ctx.quadraticCurveTo(12, yBot + 1.5, 12 - half, yBot);
    ctx.quadraticCurveTo(12 - half * 0.6, yBot - 2, 12, yTop);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 12 - half, yTop, 12 + half, yBot, [[0, '#56a84c'], [0.5, '#2f7a3a'], [1, '#1d5527']]);
    ctx.fill();
  };
  layer(19, 31, 10.5);
  layer(11, 23, 8.5);
  layer(4, 15, 6.5);
  layer(0, 8, 4);
  ellipse(ctx, 9.5, 6, 1.5, 0.9, 'rgba(255,255,255,0.25)');
  return p;
}

function bushHD(): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  blob(ctx, 8, 9.5, 7.5, 6, '#6fbf52', '#4a9a3c', '#2d6a2a');
  blob(ctx, 5.5, 7, 3.5, 3, '#9ad874', '#6fbf52', '#4a9a3c');
  return p;
}

function rockHD(big: boolean): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  if (big) {
    softShadow(ctx, 8, 13.5, 7.5, 2.4, 0.4);
    blob(ctx, 8, 8.5, 7.2, 5.8, '#d2cfc6', '#9d9a92', '#5c5953');
    stroke(ctx, [[5, 6], [8, 9], [7, 12]], 'rgba(40,38,34,0.35)', 0.7);
    ellipse(ctx, 5.5, 5.5, 1.8, 1.1, 'rgba(255,255,255,0.35)');
  } else {
    softShadow(ctx, 8, 13, 5, 1.8, 0.35);
    blob(ctx, 8, 10, 4.6, 3.6, '#d2cfc6', '#9d9a92', '#5c5953');
    ellipse(ctx, 6.5, 8.5, 1.2, 0.8, 'rgba(255,255,255,0.35)');
  }
  return p;
}

function stumpHD(): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  softShadow(ctx, 8, 13.5, 7, 2.2, 0.35);
  fillRR(ctx, 3, 7, 10, 6, 2, lin(ctx, 3, 0, 13, 0, [[0, '#6f4a26'], [0.5, '#9a6a3a'], [1, '#5a3a1e']]));
  ellipse(ctx, 8, 7, 5.2, 3, '#c58f55');
  ellipse(ctx, 8, 7, 3.4, 1.9, '#a9784a');
  ellipse(ctx, 8, 7, 1.6, 0.9, '#c58f55');
  return p;
}

function fenceHD(mask: number): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  const up = mask & 1;
  const right = mask & 2;
  const down = mask & 4;
  const left = mask & 8;
  const lonely = mask === 0;
  const rail = (x: number, y: number, w: number, h: number) => fillRR(ctx, x, y, w, h, 0.8, lin(ctx, 0, y, 0, y + h, [[0, '#b8844a'], [1, '#7a5230']]));
  if (left || lonely) {
    rail(0, 6, 9, 2);
    rail(0, 11, 9, 2);
  }
  if (right || lonely) {
    rail(7, 6, 9, 2);
    rail(7, 11, 9, 2);
  }
  if (up) {
    rail(5, 0, 2, 9);
    rail(9, 0, 2, 9);
  }
  if (down) {
    rail(5, 8, 2, 8);
    rail(9, 8, 2, 8);
  }
  fillRR(ctx, 6, 2, 4, 13, 1.2, lin(ctx, 6, 0, 10, 0, [[0, '#d8a56a'], [0.6, '#b8844a'], [1, '#7a5230']]));
  fillRR(ctx, 6, 2, 4, 1.2, 0.6, '#e8c08a');
  return p;
}

function gateHD(vertical: boolean): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  const wood = (x: number, y: number, w: number, h: number, light = false) =>
    fillRR(ctx, x, y, w, h, 0.8, lin(ctx, x, y, x + w, y + h, light ? [[0, '#e0b47a'], [1, '#b8844a']] : [[0, '#b8844a'], [1, '#7a5230']]));
  if (vertical) {
    wood(5, 0, 2, 16);
    wood(9, 0, 2, 16);
    wood(4, 1, 8, 3, true);
    wood(4, 12, 8, 3, true);
    stroke(ctx, [[5, 4], [10.5, 11.5]], '#6f4a26', 1);
  } else {
    wood(0, 6, 16, 2);
    wood(0, 11, 16, 2);
    wood(1, 3, 3, 12, true);
    wood(12, 3, 3, 12, true);
    stroke(ctx, [[4, 12.5], [11.5, 6.5]], '#6f4a26', 1.2);
  }
  return p;
}

function houseHD(wall = '', trimC = '#7a5230'): Px {
  const p = hd(80, 84);
  const ctx = p.ctx;
  // ground shadow
  softShadow(ctx, 40, 82, 42, 4, 0.35);
  // walls
  ctx.fillStyle = wall ? lin(ctx, 0, 34, 0, 84, [[0, shade(wall, 1.1)], [1, shade(wall, 0.85)]]) : lin(ctx, 0, 34, 0, 84, [[0, '#f3e8cf'], [1, '#d8c8a2']]);
  ctx.fillRect(2, 34, 76, 49);
  for (let x = 8; x < 78; x += 6) {
    ctx.fillStyle = 'rgba(120,90,50,0.12)';
    ctx.fillRect(x, 34, 0.8, 49);
  }
  // side shading
  ctx.fillStyle = lin(ctx, 60, 0, 78, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.18)']]);
  ctx.fillRect(60, 34, 18, 49);
  // roof
  ctx.beginPath();
  ctx.moveTo(0, 36);
  ctx.lineTo(28, 1);
  ctx.quadraticCurveTo(40, -1, 52, 1);
  ctx.lineTo(80, 36);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 0, 0, 36, [[0, '#cf5a4e'], [1, '#8f2f2a']]);
  ctx.fill();
  for (let y = 7; y < 36; y += 5) {
    const inset = Math.max(0, ((35 - y) / 35) * 28);
    ctx.fillStyle = 'rgba(80,20,15,0.3)';
    ctx.fillRect(inset, y, 80 - inset * 2, 1);
  }
  fillRR(ctx, 0, 33, 80, 4, 1.5, lin(ctx, 0, 33, 0, 37, [[0, '#7a2622'], [1, '#55191a']]));
  // chimney
  fillRR(ctx, 58, 4, 8, 14, 1, lin(ctx, 58, 0, 66, 0, [[0, '#9d9a92'], [1, '#6f6c66']]));
  fillRR(ctx, 57, 2, 10, 3, 1, '#b5b2aa');
  // door
  fillRR(ctx, 35, 59, 12, 24, 5, '#5a3a1e');
  fillRR(ctx, 36, 60, 10, 23, 4.5, lin(ctx, 36, 60, 46, 83, [[0, '#a9784a'], [1, '#7a5230']]));
  stroke(ctx, [[41, 61], [41, 82]], 'rgba(0,0,0,0.25)', 0.8);
  ellipse(ctx, 44, 73, 1.2, 1.2, '#f2d35a');
  // windows
  for (const wx of [10, 60]) {
    fillRR(ctx, wx - 1.5, 42.5, 15, 14, 1.5, trimC);
    ctx.fillStyle = lin(ctx, wx, 44, wx + 12, 55, [[0, '#bfeaff'], [0.5, '#8fd0f0'], [1, '#5fa8d8']]);
    ctx.fillRect(wx, 44, 12, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(wx, 44);
    ctx.lineTo(wx + 6, 44);
    ctx.lineTo(wx, 50);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trimC;
    ctx.fillRect(wx + 5.4, 44, 1.2, 11);
    ctx.fillRect(wx, 49, 12, 1);
    fillRR(ctx, wx - 2.5, 56, 17, 2.5, 1, trimC === '#7a5230' ? '#8f6a3a' : trimC);
    // flower box
    fillRR(ctx, wx - 1, 57.5, 14, 3.5, 1, lin(ctx, 0, 57, 0, 61, [[0, '#b8844a'], [1, '#7a5230']]));
    for (let i = 0; i < 4; i++) ellipse(ctx, wx + 1 + i * 3.5, 57, 1.3, 1.3, ['#e8502a', '#f5d94a', '#e87ab8', '#ffffff'][i]!);
  }
  return p;
}

function chestHD(): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  softShadow(ctx, 8, 14.5, 7, 1.8, 0.35);
  fillRR(ctx, 1.5, 4, 13, 10, 2, lin(ctx, 0, 4, 0, 14, [[0, '#b8844a'], [1, '#6f4a26']]));
  fillRR(ctx, 1.5, 4, 13, 4.5, 2, lin(ctx, 0, 4, 0, 8.5, [[0, '#d8a56a'], [1, '#a9784a']]));
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(1.5, 8.2, 13, 0.8);
  fillRR(ctx, 6.5, 6.5, 3, 4, 0.8, '#f2d35a');
  ellipse(ctx, 8, 8.8, 0.6, 0.8, '#5a3a1e');
  return p;
}

function flowerHD(v: number, mid = false): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  const petal = ['#f5e04a', '#e87ab8', '#ffffff', '#5aa0e8'][v % 4]!;
  const plant = (cx: number, cy: number, s: number) => {
    stroke(ctx, [[cx, cy + 5 * s], [cx + 0.3, cy]], '#3f8a37', 1.2 * s);
    ellipse(ctx, cx - 1.5 * s, cy + 3 * s, 1.6 * s, 0.9 * s, '#4f9a3a');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ellipse(ctx, cx + Math.cos(a) * 1.8 * s, cy + Math.sin(a) * 1.8 * s, 1.3 * s, 1.3 * s, petal);
    }
    ellipse(ctx, cx, cy, 1 * s, 1 * s, '#f7b733');
  };
  if (mid) {
    plant(5, 6, 0.8);
    plant(11, 8, 0.8);
  } else plant(8, 6, 1);
  return p;
}

function tuftHD(v: number): Px {
  const p = hd(16, 16);
  const ctx = p.ctx;
  for (let i = 0; i < 6; i++) {
    const x = 4 + i * 1.6 + rnd(v, i) * 1.2;
    const h = 4 + rnd(v, 10 + i) * 4;
    stroke(ctx, [[x, 14], [x + (i % 2 ? 1.5 : -1.5), 14 - h]], i % 2 ? '#4f9a3a' : '#7fc35a', 1);
  }
  return p;
}

/** HD versions of the most visible objects; everything else is upscaled pixel art. */
export function hdObjects(base: Record<string, ObjectArt>): Record<string, ObjectArt> {
  const out: Record<string, ObjectArt> = {};
  for (const [kind, o] of Object.entries(base)) out[kind] = { ...o, frames: o.frames.map(upscale) };
  const set = (kind: string, frames: Px[], ox = 0, oy = 0) => (out[kind] = { ...out[kind]!, frames, ox, oy });
  set('tree', [treeRound(0, false), treeRound(1, false)], -4, -20);
  set('tree_apple', [treeRound(0, true)], -4, -20);
  set('tree_pine', [treePine()], -4, -20);
  set('bush', [bushHD()]);
  set('rock', [rockHD(true)]);
  set('rock_small', [rockHD(false)]);
  set('cave_rock', [rockHD(true)]);
  set('stump', [stumpHD()]);
  set('fence', Array.from({ length: 16 }, (_, m) => fenceHD(m)));
  set('gate', [gateHD(false), gateHD(true)]);
  set(
    'house',
    PAINT_COLORS.map((c) => houseHD(c, c ? '#f4f2ec' : '#7a5230')),
    0,
    -20,
  );
  set('chest', [chestHD()]);
  set('start_chest', [chestHD()]);
  set('flower', [0, 1, 2, 3].map((v) => flowerHD(v)));
  set('wild_flower_mid', [0, 1, 2].map((v) => flowerHD(v, true)));
  set('grass_tuft', [tuftHD(0), tuftHD(1), tuftHD(2)]);
  return out;
}

export function hdFx(base: Record<string, Px[]>): Record<string, Px[]> {
  const out: Record<string, Px[]> = {};
  for (const [k, frames] of Object.entries(base)) out[k] = frames.map(upscale);
  const shadow = hd(12, 6);
  softShadow(shadow.ctx, 6, 3, 6, 3, 0.5);
  out.shadow = [shadow];
  const shadowBig = hd(24, 10);
  softShadow(shadowBig.ctx, 12, 5, 12, 5, 0.55);
  out.shadowBig = [shadowBig];
  const cursor = hd(16, 16);
  rr(cursor.ctx, 0.75, 0.75, 14.5, 14.5, 2.5);
  cursor.ctx.strokeStyle = 'rgba(43,36,25,0.8)';
  cursor.ctx.lineWidth = 2.2;
  cursor.ctx.stroke();
  cursor.ctx.strokeStyle = '#ffffff';
  cursor.ctx.lineWidth = 1;
  cursor.ctx.stroke();
  out.cursor = [cursor];
  const poof = (f: number) => {
    const p = hd(12, 12);
    ellipse(p.ctx, 6, 6, 4 + f, 4 + f, rad(p.ctx, 6, 6, 4 + f, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));
    return p;
  };
  out.poof = [poof(0), poof(1)];
  const hit = hd(10, 10);
  ellipse(hit.ctx, 5, 5, 5, 5, rad(hit.ctx, 5, 5, 5, [[0, '#fff2a0'], [0.4, '#ff8a3a'], [1, 'rgba(255,60,30,0)']]));
  out.hit = [hit];
  return out;
}

// ---------------------------------------------------------------------------
// characters (16×24 virtual): rounded "chibi" figures with the same frame layout as the pixel sheet
// ---------------------------------------------------------------------------
export interface HdLook {
  skin: string;
  hair: string;
  hairStyle: string;
  shirt: { style: string; color: string };
  pants: { style: string; color: string };
  shoes: { style: string; color: string };
  hat?: { style: string; color: string };
}

export function drawCharacterHD(l: HdLook, dir: 'down' | 'up' | 'right', frame: number): Px {
  const p = hd(16, 24);
  const ctx = p.ctx;
  const ghost = l.shirt.style === 'ghost';
  const walk = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const pantsC = l.pants.color;
  const shoeC = l.shoes.color;
  const skin = l.skin;
  const shirtC = ghost ? '#f4f4f4' : l.shirt.color;
  const shirtD = shade(shirtC, 0.7);
  const shirtL = shade(shirtC, 1.25);

  // legs
  if (!ghost) {
    if (dir === 'right') {
      const f = 6.5 + walk * 1.5;
      const b = 6.5 - walk * 1.5;
      fillRR(ctx, b, 16, 3.2, 6, 1.2, shade(pantsC, 0.7));
      fillRR(ctx, b - 0.2, 21, 3.6, 2.4, 1, shade(shoeC, 0.8));
      fillRR(ctx, f, 16, 3.2, 6, 1.2, pantsC);
      fillRR(ctx, f - 0.2, 21, 4.2, 2.4, 1, shoeC);
    } else {
      const lh = 6 + walk;
      const rh = 6 - walk;
      fillRR(ctx, 3.8, 16, 3.4, lh, 1.2, lin(ctx, 3.8, 0, 7.2, 0, [[0, pantsC], [1, shade(pantsC, 0.75)]]));
      fillRR(ctx, 8.8, 16, 3.4, rh, 1.2, lin(ctx, 8.8, 0, 12.2, 0, [[0, pantsC], [1, shade(pantsC, 0.75)]]));
      fillRR(ctx, 3.6, 16 + lh - 1, 3.8, 2.4, 1, shoeC);
      fillRR(ctx, 8.6, 16 + rh - 1, 3.8, 2.4, 1, shoeC);
    }
    if (l.pants.style === 'skirt') {
      ctx.beginPath();
      ctx.moveTo(3.5, 15);
      ctx.lineTo(12.5, 15);
      ctx.lineTo(14, 20);
      ctx.lineTo(2, 20);
      ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, 15, 0, 20, [[0, pantsC], [1, shade(pantsC, 0.75)]]);
      ctx.fill();
    }
  }

  // body
  const by = 9.5;
  if (ghost) {
    ctx.beginPath();
    ctx.moveTo(2.5, 23);
    ctx.lineTo(2.5, 12);
    ctx.quadraticCurveTo(2.5, 6, 8, 6);
    ctx.quadraticCurveTo(13.5, 6, 13.5, 12);
    ctx.lineTo(13.5, 23);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(12.1 - i * 2.75, 21 + (i % 2) * 1.5, 10.75 - i * 2.75, 23);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 2, 6, 14, 23, [[0, '#ffffff'], [1, '#d6d6de']]);
    ctx.fill();
    ellipse(ctx, 6, 12, 1, 1.4, '#2b2419');
    ellipse(ctx, 10, 12, 1, 1.4, '#2b2419');
    ellipse(ctx, 8, 15.5, 1.2, 0.8, '#2b2419');
    return p;
  }
  fillRR(ctx, 3, by, 10, 7.5, 2.5, lin(ctx, 3, by, 13, by + 7, [[0, shirtL], [0.5, shirtC], [1, shirtD]]));
  if (l.shirt.style === 'stripes') for (let y = by + 1.5; y < by + 7; y += 2) fillRR(ctx, 3.3, y, 9.4, 0.9, 0.4, 'rgba(255,255,255,0.85)');
  if (l.shirt.style === 'overalls') {
    fillRR(ctx, 4.5, by + 3, 7, 4.5, 1, pantsC);
    fillRR(ctx, 5, by, 1.3, 4, 0.5, pantsC);
    fillRR(ctx, 9.7, by, 1.3, 4, 0.5, pantsC);
  }
  if (l.shirt.style === 'star') {
    ctx.fillStyle = '#f5e04a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 1 : 2.3;
      ctx.lineTo(8 + Math.cos(a) * r, by + 3.5 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  if (l.shirt.style === 'xmas') {
    fillRR(ctx, 3.3, by + 3, 9.4, 1.2, 0.5, '#ffffff');
    ellipse(ctx, 8, by + 1.5, 1, 1, '#ffffff');
  }
  // arms
  const sleeve = shade(shirtC, 0.9);
  if (dir === 'right') fillRR(ctx, 7, by + 1, 2.6, 5.5, 1.2, sleeve);
  else {
    fillRR(ctx, 1.6, by + 1, 2.4, 5.5, 1.2, sleeve);
    fillRR(ctx, 12, by + 1, 2.4, 5.5, 1.2, sleeve);
    ellipse(ctx, 2.8, by + 6.6, 1.1, 1.1, skin);
    ellipse(ctx, 13.2, by + 6.6, 1.1, 1.1, skin);
  }

  // head
  const hx = 8;
  const hy = 5.5;
  ellipse(ctx, hx, hy, 5.2, 5, rad(ctx, hx, hy, 5.5, [[0, shade(skin, 1.08)], [0.7, skin], [1, shade(skin, 0.8)]], hx - 1.5, hy - 1.8));
  if (dir === 'right') ellipse(ctx, hx + 5, hy + 0.5, 0.9, 1.3, skin); // ear
  // face
  if (dir === 'down') {
    for (const ex of [hx - 2, hx + 2]) {
      ellipse(ctx, ex, hy + 1, 0.9, 1.2, '#2b2419');
      ellipse(ctx, ex - 0.3, hy + 0.5, 0.3, 0.35, '#ffffff');
    }
    ellipse(ctx, hx - 3.2, hy + 2.6, 1, 0.6, 'rgba(255,120,120,0.35)');
    ellipse(ctx, hx + 3.2, hy + 2.6, 1, 0.6, 'rgba(255,120,120,0.35)');
    stroke(ctx, [[hx - 1, hy + 3.2], [hx, hy + 3.7], [hx + 1, hy + 3.2]], '#8a4a3a', 0.6);
  } else if (dir === 'right') {
    ellipse(ctx, hx + 2.5, hy + 1, 0.9, 1.2, '#2b2419');
    ellipse(ctx, hx + 2.2, hy + 0.5, 0.3, 0.35, '#ffffff');
    ellipse(ctx, hx + 1.5, hy + 2.6, 1, 0.6, 'rgba(255,120,120,0.35)');
  }
  // hair
  const hairC = l.hair;
  const hairD = shade(hairC, 0.75);
  const hairL = shade(hairC, 1.25);
  const style = l.hairStyle;
  const hairGrad = lin(ctx, hx - 5, hy - 5, hx + 5, hy + 2, [[0, hairL], [0.5, hairC], [1, hairD]]);
  if (style !== 'bald') {
    ctx.beginPath();
    if (dir === 'up') {
      ctx.ellipse(hx, hy - 0.3, 5.3, 5.1, 0, 0, Math.PI * 2);
    } else {
      // cap of hair covering the top of the head, fringe lower on the facing side
      ctx.ellipse(hx, hy - 1.2, 5.4, 4.4, 0, Math.PI, Math.PI * 2);
      if (dir === 'right') {
        ctx.lineTo(hx + 5.4, hy + 0.5);
        ctx.quadraticCurveTo(hx + 3, hy - 0.5, hx + 1, hy + 0.2);
        ctx.quadraticCurveTo(hx - 3, hy + 0.5, hx - 5.4, hy + 1.5);
      } else {
        ctx.lineTo(hx + 5.4, hy + 1);
        ctx.quadraticCurveTo(hx + 4, hy - 0.2, hx + 2, hy - 0.8);
        ctx.quadraticCurveTo(hx, hy + 0.2, hx - 2, hy - 0.8);
        ctx.quadraticCurveTo(hx - 4, hy - 0.2, hx - 5.4, hy + 1);
      }
      ctx.closePath();
    }
    ctx.fillStyle = hairGrad;
    ctx.fill();
    if (style === 'long') {
      fillRR(ctx, hx - 6, hy - 1, 2.4, 9, 1.2, hairGrad);
      fillRR(ctx, hx + 3.6, hy - 1, 2.4, 9, 1.2, hairGrad);
      if (dir === 'up') fillRR(ctx, hx - 4, hy, 8, 8, 2, hairGrad);
    }
    if (style === 'curly') {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ellipse(ctx, hx + Math.cos(a) * 5, hy - 0.5 + Math.sin(a) * 4.5, 1.7, 1.7, i % 2 ? hairC : hairL);
      }
    }
    if (style === 'ponytail' && dir !== 'down') {
      const tx = dir === 'right' ? hx - 5.5 : hx;
      fillRR(ctx, tx - 1.3, hy + 1, 2.6, 8, 1.3, hairGrad);
    }
    ellipse(ctx, hx - 2, hy - 3.5, 1.8, 0.9, 'rgba(255,255,255,0.3)');
  }
  // hat
  if (l.hat) {
    const C = l.hat.color;
    const Cd = shade(C, 0.75);
    const Cl = shade(C, 1.2);
    const dome = (h: number) => {
      ctx.beginPath();
      ctx.ellipse(hx, hy - 1.5, 5.6, h, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = lin(ctx, hx - 5, hy - 6, hx + 5, hy, [[0, Cl], [1, Cd]]);
      ctx.fill();
    };
    switch (l.hat.style) {
      case 'cap':
        dome(4);
        fillRR(ctx, dir === 'right' ? hx + 2 : hx - 6.5, hy - 1.8, dir === 'up' ? 0 : 7, 1.6, 0.8, Cd);
        break;
      case 'beanie':
        dome(5);
        fillRR(ctx, hx - 5.6, hy - 2.2, 11.2, 1.6, 0.8, Cd);
        ellipse(ctx, hx, hy - 6.5, 1.3, 1.3, '#ffffff');
        break;
      case 'straw':
        dome(4.5);
        ellipse(ctx, hx, hy - 1.3, 8.5, 1.8, lin(ctx, hx - 8, 0, hx + 8, 0, [[0, Cl], [1, Cd]]));
        fillRR(ctx, hx - 5.6, hy - 3.2, 11.2, 1.2, 0.6, '#d8363a');
        break;
      case 'cowboy':
        dome(5);
        ellipse(ctx, hx, hy - 1.2, 8.5, 1.9, Cd);
        break;
      case 'wreath':
        for (let i = 0; i < 8; i++) ellipse(ctx, hx - 5 + i * 1.45, hy - 2.5, 1.1, 1.1, ['#4f9a3a', '#f5e04a', '#4f9a3a', '#e87ab8', '#4f9a3a', '#5aa0e8', '#4f9a3a', '#ffffff'][i]!);
        break;
      case 'witch':
        ellipse(ctx, hx, hy - 1.5, 8, 1.8, Cd);
        ctx.beginPath();
        ctx.moveTo(hx - 4.5, hy - 1.5);
        ctx.quadraticCurveTo(hx - 1, hy - 7, hx + 2, hy - 12);
        ctx.quadraticCurveTo(hx + 2.5, hy - 6, hx + 4.5, hy - 1.5);
        ctx.closePath();
        ctx.fillStyle = lin(ctx, hx - 4, hy - 12, hx + 4, hy, [[0, Cl], [1, Cd]]);
        ctx.fill();
        fillRR(ctx, hx - 4, hy - 3.5, 8, 1.3, 0.6, '#8a4fd1');
        break;
      case 'santa':
        ctx.beginPath();
        ctx.moveTo(hx - 5, hy - 2);
        ctx.quadraticCurveTo(hx - 2, hy - 9, hx + 5, hy - 9);
        ctx.lineTo(hx + 5, hy - 2);
        ctx.closePath();
        ctx.fillStyle = lin(ctx, hx - 5, hy - 9, hx + 5, hy, [[0, Cl], [1, Cd]]);
        ctx.fill();
        fillRR(ctx, hx - 5.6, hy - 2.8, 11.2, 2, 1, '#ffffff');
        ellipse(ctx, hx + 5, hy - 9, 1.4, 1.4, '#ffffff');
        break;
      case 'viking':
        dome(4.5);
        fillRR(ctx, hx - 0.8, hy - 6, 1.6, 5, 0.6, '#f2d35a');
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(hx + s * 5, hy - 1);
          ctx.quadraticCurveTo(hx + s * 8, hy - 3, hx + s * 7, hy - 7);
          ctx.quadraticCurveTo(hx + s * 7, hy - 3, hx + s * 4, hy - 3);
          ctx.closePath();
          ctx.fillStyle = '#f4ead8';
          ctx.fill();
        }
        break;
      default:
        dome(4.5);
    }
  }
  return p;
}
