// Sagan om Världsträdet's creatures, drawn like the other animals (side view facing right, flipped for left, two walk
// frames; drawAnimal outlines them): the dungeons' monsters, their bosses (about twice as big), the ice block a frozen
// friend stands in, Hugin and Munin, the Fenris pup, Sleipner and Gullinbursti. Spooky-cute: skulls grin, eyes are
// big and round, nothing bleeds.
import { Px, shade } from './px.js';
import { flame, halo, lump, pal, paint, twinkle } from './saga.ts';

type Draw = (p: Px, f: number, v?: number) => void;

const BONE = pal('#8a7c60', '#b8aa88', '#e2d6b8', '#f4ecd8', '#fffaf0');
const IRON = pal('#24262c', '#3e4048', '#5e626c', '#8a8e9a', '#bcc0ca');
const WOOD = pal('#3e2614', '#5e3c20', '#86582f', '#b07c48', '#d4a46c');
const GOLD = pal('#8a5a10', '#b8861a', '#e8b830', '#ffe27a', '#fff6c8');
const ICE = pal('#2c5a86', '#4c82b2', '#84bae0', '#bfe1f5', '#eef9ff');
const FROST = pal('#2a6aa0', '#4a9ad0', '#8ad8f8', '#ccf2ff', '#ffffff');
const SNOWFUR = pal('#8ea4bc', '#b8cadc', '#dde8f2', '#f2f7fb', '#ffffff');
const BASALT = pal('#121014', '#1f1d23', '#302d35', '#45414c', '#5c5866');
const EMBER = { d: '#7a2210', m: '#d8481a', h: '#ffa040', hot: '#fff0a0' };
const FIREPAL = pal('#8e1a0a', '#d8401a', '#ff8a2a', '#ffd060', '#fff6c8');
const GHOST = '#9cff8a';
const K = '#1e1a22';

/** A round skull facing right at (x, y), w×h: a big dark eye with a light in it, a nose hole, a toothy grin. */
function skull(p: Px, x: number, y: number, w: number, h: number, eye: string): void {
  lump(p, x, y, w, h, BONE, 0.1, 3, 0.35);
  const ex = x + Math.round(w * 0.58);
  const ey = y + Math.round(h * 0.38);
  const es = w >= 12 ? 3 : 2;
  p.rect(ex, ey, es, es, K).px(ex + es - 1, ey, eye).px(ex + es - 1, ey + 1, shade(eye, 1.3));
  if (es === 3) p.px(ex + 1, ey + 1, eye);
  p.px(x + w - 2, ey + es + 1, K);
  // the grin: a row of teeth under a dark line, the jaw below
  const ty = y + h - Math.max(2, Math.round(h * 0.25));
  p.rect(x + Math.round(w * 0.45), ty, Math.round(w * 0.55), 1, K);
  for (let tx = x + Math.round(w * 0.45) + 1; tx < x + w - 1; tx += 2) p.px(tx, ty, BONE.l2);
  p.rect(x + Math.round(w * 0.4), ty + 1, Math.round(w * 0.55), 1, BONE.d);
}

/** A bone from (x0, y0) to (x1, y1), lit on its upper side, with knobby ends. */
function bone(p: Px, x0: number, y0: number, x1: number, y1: number, thick = 1): void {
  for (let i = 0; i < thick; i++) p.line(x0 + i, y0, x1 + i, y1, i === 0 ? BONE.l : BONE.b);
  p.px(x0, y0, BONE.l2).px(x1, y1, BONE.d);
}

/** Legs that take turns: x of the back and the front leg on frame f. */
const stride = (f: number, back: number, front: number, reach = 1): [number, number] => (f ? [back + reach, front - reach] : [back, front]);

// ---------------------------------------------------------------------------
// Draugkryptan: skeleton warriors and archers, grave rats; the grave guard and the draug king
// ---------------------------------------------------------------------------

function skelett(p: Px, f: number): void {
  // a round shield on the far arm, behind
  paint(p, 0, 8, 8, 8, (x, y) => {
    const r = Math.hypot(x + 0.5 - 4, y + 0.5 - 12);
    return r > 3.9 ? null : r > 3 ? IRON.b : r < 1.1 ? IRON.l : Math.floor(Math.atan2(y + 0.5 - 12, x + 0.5 - 4) / (Math.PI / 2) + 4) % 2 ? '#b8402e' : '#e8dcc0';
  });
  // legs, pelvis, spine and ribs
  const [b, fr] = stride(f, 7, 11);
  bone(p, 9, 16, b, 20);
  bone(p, 10, 16, fr, 20);
  p.rect(b - 1, 21, 3, 1, BONE.b).rect(fr, 21, 3, 1, BONE.l);
  p.rect(8, 14, 5, 2, BONE.b).rect(8, 14, 5, 1, BONE.l);
  p.rect(10, 9, 1, 5, BONE.d);
  for (const y of [9, 11, 13]) p.rect(7, y, 6, 1, BONE.l).px(7, y, BONE.b);
  // the near arm holding the sword out in front
  bone(p, 11, 10, 13, 12);
  bone(p, 13, 12, 15, 11);
  p.line(15, 11, 17, 3, '#c4ccd8').line(16, 11, 17, 6, '#8a94a4').rect(14, 11, 3, 1, GOLD.b).px(15, 12, WOOD.d);
  // the skull under a dented iron cap
  skull(p, 7, 1, 9, 8, GHOST);
  p.rect(7, 1, 9, 2, IRON.b).rect(8, 0, 7, 1, IRON.l).rect(7, 3, 9, 1, IRON.d).px(9, 0, IRON.l2);
}

function draugbage(p: Px, f: number): void {
  // a quiver of arrows on the back, a tattered green-grey hood and cape
  p.rect(3, 6, 3, 8, WOOD.b).rect(3, 6, 1, 8, WOOD.l).px(3, 4, '#e8e0d0').px(4, 3, '#e8e0d0').px(5, 4, '#d84a3a').px(4, 5, '#e8e0d0');
  const cloth = pal('#1e2a22', '#2e4034', '#46604c', '#5e7e64', '#7a9a7e');
  const [b, fr] = stride(f, 7, 11);
  bone(p, 9, 16, b, 20);
  bone(p, 10, 16, fr, 20);
  p.rect(b - 1, 21, 3, 1, BONE.b).rect(fr, 21, 3, 1, BONE.l);
  // the cape hanging from the shoulders, ragged at the hem
  paint(p, 4, 8, 8, 9, (x, y) => (x < 5 + (y - 8) * 0.2 || (y === 16 && x % 2 === 0) ? null : y < 10 ? cloth.l : x < 7 ? cloth.b : cloth.d));
  p.rect(8, 14, 5, 2, BONE.b).rect(8, 14, 5, 1, BONE.l);
  for (const y of [10, 12]) p.rect(8, y, 4, 1, BONE.l);
  // the bow held out in front, its string drawn
  p.line(15, 3, 17, 7, WOOD.l).line(17, 7, 17, 13, WOOD.b).line(17, 13, 15, 17, WOOD.l);
  p.line(15, 3, 13, 10, '#e8e0d0').line(13, 10, 15, 17, '#e8e0d0');
  p.line(11, 10, 17, 10, WOOD.l).px(17, 10, IRON.l).px(11, 10, '#d84a3a');
  bone(p, 11, 10, 13, 10);
  // the skull in its hood
  skull(p, 7, 2, 8, 7, GHOST);
  paint(p, 5, 0, 10, 9, (x, y) => {
    const dx = (x + 0.5 - 10) / 5;
    const dy = (y + 0.5 - 5) / 5;
    if (dx * dx + dy * dy > 1) return null;
    return x > 10 && y > 2 ? null : y < 2 ? cloth.l : x < 8 ? cloth.b : cloth.d;
  });
}

function gravrotta(p: Px, f: number): void {
  // a big, round grave rat: grey-brown fur, a long pink tail, round ears, a pink nose and two big front teeth
  const fur = pal('#3a3230', '#54484a', '#73666a', '#93878a', '#b0a6a8');
  p.line(0, 5, 3, 8, '#d8909a').line(3, 8, 5, 9, '#d8909a').px(0, 4, '#d8909a');
  const [b, fr] = stride(f, 6, 13);
  p.rect(b, 10, 2, 3, fur.d).rect(fr, 10, 2, 3, fur.b).px(b + 1, 12, '#d8909a').px(fr + 1, 12, '#e8a8b0');
  lump(p, 3, 3, 13, 9, fur, 0.25, 41, 0.3);
  lump(p, 11, 2, 8, 7, fur, 0.2, 42, 0.35);
  p.rect(12, 0, 3, 3, fur.b).px(13, 1, '#d8909a').px(12, 0, fur.l);
  p.rect(16, 4, 2, 2, K).px(17, 4, '#ffffff');
  p.px(19, 6, '#e8a0b0').px(18, 7, '#ffffff').px(18, 8, '#ffffff');
  p.px(15, 7, fur.l2).px(16, 8, fur.l2);
}

function gravvaktare(p: Px, f: number): void {
  // the grave guard: a giant skeleton in a horned iron helmet, a great shield behind and a stone maul in front
  paint(p, 0, 14, 15, 15, (x, y) => {
    const r = Math.hypot(x + 0.5 - 7.5, y + 0.5 - 21.5);
    return r > 7.3 ? null : r > 6 ? IRON.b : r < 2 ? IRON.l : (x + y) % 6 < 3 ? '#4a6a4a' : '#5e805a';
  });
  // legs
  const [b, fr] = stride(f, 13, 19, 2);
  bone(p, 16, 29, b, 37, 2);
  bone(p, 17, 29, fr, 37, 2);
  p.rect(b - 2, 38, 5, 2, BONE.b).rect(fr, 38, 5, 2, BONE.l);
  // a ragged loincloth, the pelvis, the spine and a big ribcage
  p.rect(13, 25, 9, 4, BONE.b).rect(13, 25, 9, 1, BONE.l);
  paint(p, 12, 27, 11, 5, (x, y) => ((x + y) % 3 === 0 && y > 29 ? null : y < 29 ? '#5a3a2a' : '#4a2e20'));
  p.rect(17, 16, 2, 9, BONE.d);
  for (const y of [16, 19, 22]) p.rect(12, y, 10, 2, BONE.l).rect(12, y + 1, 10, 1, BONE.b).px(12, y, BONE.b);
  // shoulders and the near arm holding the maul
  lump(p, 18, 13, 7, 5, BONE, 0.1, 51);
  bone(p, 21, 17, 24, 23, 2);
  bone(p, 24, 23, 28, 21, 2);
  p.rect(26, 2, 3, 22, WOOD.b).rect(26, 2, 1, 22, WOOD.l);
  lump(p, 23, 0, 9, 8, pal('#2e3230', '#4a4e4a', '#6a6e68', '#8a8e86', '#aaaea4'), 0.35, 52);
  p.rect(27, 21, 3, 3, BONE.l);
  // the skull under a horned helmet
  skull(p, 12, 3, 13, 11, GHOST);
  p.rect(12, 3, 13, 3, IRON.b).rect(13, 2, 11, 1, IRON.l).rect(12, 6, 13, 1, IRON.d).rect(22, 6, 1, 4, IRON.b);
  p.line(13, 3, 10, 0, BONE.l).line(14, 3, 11, 0, BONE.b).line(23, 2, 25, 0, BONE.l);
}

function draugkung(p: Px, f: number): void {
  // Draugkungen Hrolf: a tattered royal cloak, a crown, a long beard, green eyes and a great old sword
  const cloak = pal('#2a1030', '#401a46', '#5a2a60', '#76407a', '#945a96');
  const skin = pal('#4a5a4a', '#6a7e68', '#8ea48a', '#b0c4aa', '#d0e0c8');
  // the cloak behind him, ragged at the hem
  paint(p, 2, 14, 22, 26, (x, y) => {
    if (x < 6 - (y - 14) * 0.15) return null;
    if (y > 36 && (x + Math.floor(y / 2)) % 4 === 0) return null;
    return x < 6 ? cloak.l : x < 12 ? cloak.b : cloak.d;
  });
  // legs in iron greaves
  const [b, fr] = stride(f, 15, 21, 2);
  p.rect(b, 32, 4, 9, IRON.d).rect(fr, 32, 4, 9, IRON.b).rect(fr, 32, 1, 9, IRON.l);
  p.rect(b - 1, 41, 6, 3, IRON.d2).rect(fr, 41, 6, 3, IRON.d);
  // a mail shirt and a belt with a gold buckle, fur on the shoulders
  paint(p, 12, 18, 14, 15, (x, y) => ((x + y) % 2 === 0 ? IRON.l : IRON.b));
  p.rect(12, 28, 14, 2, '#3a2418').rect(18, 28, 3, 2, GOLD.l);
  lump(p, 10, 15, 17, 6, pal('#4a3a2a', '#6a5440', '#8e7458', '#b09474', '#d0b494'), 0.4, 61, 0.4);
  // the arm and the great sword, its blade glowing a ghostly green
  p.rect(24, 20, 4, 7, IRON.b).rect(25, 26, 5, 3, skin.b);
  p.rect(27, 23, 2, 9, GOLD.d).rect(23, 25, 10, 2, GOLD.b).rect(23, 25, 10, 1, GOLD.l);
  paint(p, 28, 0, 5, 25, (x, y) => (x === 28 ? '#d8f0c8' : x === 29 || x === 30 ? '#a8c4a0' : x === 31 && y > 1 ? '#6a8a68' : null));
  p.px(29, 0, '#ffffff').px(29, 6, GHOST).px(30, 12, GHOST).px(29, 18, GHOST);
  // the head: a gaunt grey-green face, a long white beard, glowing eyes, a crown
  lump(p, 14, 4, 13, 12, skin, 0.15, 62, 0.35);
  paint(p, 15, 12, 14, 12, (x, y) => {
    const t = (y - 12) / 11;
    const half = 6 - t * 4;
    if (Math.abs(x + 0.5 - 22) > half) return null;
    return (x + y) % 3 === 0 ? '#c8c4bc' : '#e8e4dc';
  });
  p.rect(21, 8, 4, 3, K).px(23, 8, GHOST).px(24, 8, '#e8ffd8').px(23, 9, GHOST);
  p.px(26, 11, skin.d).rect(20, 12, 7, 1, '#f4f0e8');
  paint(p, 13, 0, 15, 6, (x, y) => {
    if (y >= 3) return y === 5 ? GOLD.d : GOLD.b;
    return (x - 13) % 4 === 1 ? (y === 0 ? GOLD.l2 : GOLD.l) : null;
  });
  p.px(16, 3, '#5ae05a').px(20, 3, '#e83a3a').px(24, 3, '#5ae05a');
}

// ---------------------------------------------------------------------------
// Frostjättens borg: frost trolls, ice wolves, ice spirits and the ice block; the polar bear and the frost giant
// ---------------------------------------------------------------------------

function frosttroll(p: Px, f: number): void {
  // a chunky troll with pale blue skin, shaggy white hair, a fur kilt, a big round nose, two little tusks and a
  // club of ice over its shoulder
  const skin = pal('#2e4e6e', '#4e7292', '#7098b8', '#98bcd6', '#c0dcee');
  const [b, fr] = stride(f, 5, 12, 2);
  p.rect(b, 19, 4, 5, skin.d).rect(fr, 19, 4, 5, skin.b).rect(b - 1, 23, 6, 3, SNOWFUR.b).rect(fr, 23, 6, 3, SNOWFUR.l);
  // the far arm, the body, a shaggy kilt
  lump(p, 1, 11, 6, 9, skin, 0.1, 76, 0.3);
  lump(p, 3, 8, 15, 13, skin, 0.15, 71, 0.3);
  paint(p, 3, 16, 15, 5, (x, y) => (y === 20 && x % 2 === 0 ? null : y === 16 ? SNOWFUR.l : (x + y) % 3 === 0 ? SNOWFUR.b : SNOWFUR.l));
  p.px(9, 12, skin.l2).px(7, 13, skin.l);
  // the club of ice resting on the shoulder, held in the near hand
  p.line(13, 14, 19, 4, WOOD.b).line(14, 14, 20, 4, WOOD.d);
  paint(p, 16, 0, 6, 7, (x, y) => (Math.hypot(x + 0.5 - 19, y + 0.5 - 3.5) < 3.1 ? (x + y < 21 ? FROST.l2 : x > 19 ? FROST.b : FROST.l) : null));
  p.px(17, 1, '#ffffff').px(21, 1, FROST.l2).px(16, 5, FROST.l);
  lump(p, 12, 12, 5, 5, skin, 0.1, 73, 0.35);
  // the head: shaggy white hair, little eyes, a bulb of a nose, an underbite with two tusks
  lump(p, 7, 1, 11, 10, skin, 0.15, 74, 0.35);
  lump(p, 15, 4, 5, 5, skin, 0.1, 75, 0.5);
  p.px(17, 5, skin.l2);
  p.rect(13, 4, 2, 2, K).px(14, 4, '#ffffff');
  p.rect(6, 0, 9, 2, SNOWFUR.l).rect(5, 2, 3, 4, SNOWFUR.b).px(9, 0, '#ffffff').px(12, 2, SNOWFUR.b).rect(11, 3, 4, 1, SNOWFUR.l2);
  p.rect(12, 9, 5, 1, skin.d2).px(13, 8, '#ffffff').px(16, 8, '#ffffff');
}

function isvarg(p: Px, f: number): void {
  // an ice wolf: frosty white-blue fur, a few shards of ice down its back, glowing blue eyes, a bushy tail
  const fur = pal('#4e6c8a', '#7e9cba', '#b8cee2', '#dce8f2', '#ffffff');
  const [b, fr] = stride(f, 4, 14, 2);
  p.rect(b, 11, 2, 5, fur.d).rect(b + 4, 11, 2, 5, fur.b).rect(fr, 11, 2, 5, fur.b).rect(fr - 4, 11, 2, 5, fur.d);
  // the tail, then the body
  lump(p, 0, 3, 6, 5, fur, 0.2, 83, 0.4);
  lump(p, 3, 5, 14, 8, fur, 0.25, 81, 0.3);
  p.rect(7, 11, 7, 1, fur.l2);
  for (const [x, h] of [[7, 2], [10, 3], [13, 2]] as const) p.rect(x, 5 - h, 1, h, FROST.l).px(x + 1, 5 - h + 1, FROST.b).px(x, 5 - h, '#ffffff');
  // the head with pricked ears and a long snout
  lump(p, 14, 3, 6, 7, fur, 0.2, 82, 0.35);
  p.rect(14, 0, 2, 4, fur.b).px(15, 1, '#c8a0b0').rect(17, 1, 2, 3, fur.d);
  p.rect(19, 6, 3, 3, fur.l).rect(19, 8, 3, 1, fur.b).px(21, 6, K);
  p.rect(17, 5, 2, 1, '#3ab8ff').px(18, 4, '#3ab8ff');
}

/** A soft see-through colour (the ice spirit and the ice block). */
const glass = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function isande(p: Px, f: number): void {
  // a floating spirit of frost: a round see-through head, big dark eyes, a crown of little shards, a wispy tail
  const body = (x: number, y: number) => {
    const t = (y - 7) / 12; // the tail tapers and sways
    const cx = 8 + (f ? 1 : -1) * t * t * 3;
    const half = 5.2 - t * 4.2;
    return y >= 7 && y < 19 && Math.abs(x + 0.5 - cx) <= half;
  };
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 16; x++) {
      const head = Math.hypot((x + 0.5 - 8) / 5.6, (y + 0.5 - 8) / 5.2) <= 1;
      if (!head && !body(x, y)) continue;
      const edge = x < 5 || y < 5;
      p.px(x, y, glass(edge ? '#e8faff' : y > 13 ? '#7ac8f0' : '#b4e4fa', y > 15 ? 0.55 : 0.8));
    }
  // little arms
  p.px(2, 11, glass('#b4e4fa', 0.8)).px(1, f ? 10 : 12, glass('#e8faff', 0.8)).px(13, 11, glass('#b4e4fa', 0.8)).px(14, f ? 12 : 10, glass('#e8faff', 0.8));
  // the face, and the crown of shards
  p.rect(8, 7, 2, 3, '#1e3a5a').rect(11, 7, 2, 3, '#1e3a5a').px(8, 7, '#ffffff').px(11, 7, '#ffffff');
  p.rect(9, 11, 3, 1, '#4a8ac0');
  for (const [x, h] of [[4, 2], [6, 3], [8, 4], [10, 3], [12, 2]] as const) p.rect(x, 3 - h, 1, h, '#e8faff').px(x, 3 - h, '#ffffff');
}

function isblock(p: Px, f: number): void {
  // a block of see-through ice with a friend frozen inside (the player stands behind it): lit edges, a frosted
  // top, cracks, a glint
  for (let y = 2; y < 28; y++)
    for (let x = 1; x < 21; x++) {
      const top = y < 6;
      const left = x < 3;
      const right = x > 18;
      const c = top ? (y === 2 ? '#ffffff' : '#dff4ff') : left ? '#c8ecff' : right ? '#5a9ac8' : y > 25 ? '#6aaad8' : '#a8dcf8';
      p.px(x, y, glass(c, top ? 0.85 : left || right || y > 25 ? 0.7 : 0.32));
    }
  // streaks of light across the front, and a few cracks
  for (let i = 0; i < 4; i++) p.line(4 + i * 4, 26, 9 + i * 4, 7, glass('#ffffff', 0.35));
  p.line(15, 10, 17, 14, glass('#e8faff', 0.9)).line(17, 14, 15, 17, glass('#e8faff', 0.9)).line(5, 19, 7, 22, glass('#e8faff', 0.9));
  p.px(f ? 4 : 17, f ? 8 : 5, '#ffffff');
}

function isbjorn(p: Px, f: number): void {
  // Isbjörnen Kall: a polar bear as big as a barn, fur of hoar frost, ice crystals on his back
  const fur = pal('#8aa0b4', '#b8c8d8', '#e2eaf2', '#f4f8fb', '#ffffff');
  const [b1, f1] = stride(f, 6, 28, 3);
  for (const [x, c] of [[b1, fur.d], [b1 + 8, fur.b], [f1 - 7, fur.d], [f1, fur.b]] as const) p.rect(x, 22, 7, 8, c).rect(x - 1, 29, 9, 3, shade(c, 0.85));
  lump(p, 2, 6, 34, 20, fur, 0.3, 91, 0.3);
  lump(p, 0, 10, 8, 8, fur, 0.2, 92);
  // a ridge of ice on his back
  for (const [x, h] of [[9, 4], [13, 6], [17, 7], [21, 5], [25, 3]] as const) p.rect(x, 7 - h, 3, h + 1, FROST.l).rect(x + 2, 8 - h, 1, h, FROST.b).px(x, 7 - h, '#ffffff');
  // the head: small round ears, a black nose, little eyes, a gentle frown
  lump(p, 30, 6, 13, 12, fur, 0.2, 93, 0.35);
  lump(p, 37, 11, 7, 6, fur, 0.1, 94, 0.5);
  p.rect(31, 5, 4, 3, fur.b).px(32, 5, fur.l).px(33, 6, '#c8a0b0');
  p.rect(42, 11, 2, 2, K).px(42, 11, '#5a5a6a');
  p.rect(37, 9, 2, 2, K).px(37, 9, '#ffffff');
  p.rect(39, 15, 4, 1, fur.d);
}

function rimturs(p: Px, f: number): void {
  // Rimtursen, the frost giant: ice-blue skin, a white beard full of icicles, a horned helmet of ice, a fur kilt,
  // a great club of ice
  const skin = pal('#2e5276', '#4a7aa4', '#74a4cc', '#a4cce6', '#d4ecf8');
  const fur = pal('#4a3a2e', '#6a5444', '#8e7460', '#b0967e', '#d0b89e');
  const [b, fr] = stride(f, 13, 26, 3);
  p.rect(b, 42, 7, 12, skin.d).rect(fr, 42, 7, 12, skin.b).rect(fr, 42, 2, 12, skin.l);
  p.rect(b - 2, 53, 10, 5, fur.d).rect(fr - 1, 53, 10, 5, fur.b).rect(fr - 1, 53, 10, 1, fur.l);
  // the body: a broad chest, a fur kilt, a belt with a frost-blue stone
  lump(p, 8, 16, 28, 26, skin, 0.15, 101, 0.3);
  paint(p, 9, 36, 27, 9, (x, y) => ((x + (y % 2)) % 4 === 0 && y > 42 ? null : y < 38 ? fur.l : (x + y) % 3 === 0 ? fur.d : fur.b));
  p.rect(9, 35, 27, 2, '#3a2a20').rect(20, 34, 4, 4, FROST.b).px(20, 34, '#ffffff');
  // the far arm hanging, the near arm holding the ice club
  lump(p, 4, 20, 8, 18, skin, 0.1, 102, 0.3);
  lump(p, 30, 18, 9, 16, skin, 0.1, 103, 0.3);
  p.rect(36, 6, 5, 28, WOOD.b).rect(36, 6, 2, 28, WOOD.l);
  lump(p, 33, 0, 13, 13, FROST, 0.15, 104, 0.4);
  for (const [x, y] of [[35, 3], [41, 2], [38, 9]] as const) p.px(x, y, '#ffffff');
  lump(p, 33, 28, 8, 7, skin, 0.1, 105, 0.35);
  // the head: bushy white brows, little glowing eyes, a big round nose, the beard with icicles
  lump(p, 16, 4, 18, 16, skin, 0.15, 106, 0.35);
  lump(p, 28, 10, 7, 6, skin, 0.1, 107, 0.5);
  paint(p, 15, 13, 20, 16, (x, y) => {
    const half = 9 - (y - 13) * 0.45;
    if (Math.abs(x + 0.5 - 25) > half) return null;
    return (x * 3 + y) % 5 === 0 ? SNOWFUR.b : SNOWFUR.l;
  });
  for (const x of [19, 23, 27, 31]) p.rect(x, 26 + (x % 3), 1, 3, '#e4f6ff').px(x, 28 + (x % 3), '#a8d4f0');
  p.rect(24, 9, 4, 3, '#14304a').rect(25, 10, 2, 1, '#8ae0ff').px(26, 9, '#ffffff');
  p.rect(22, 7, 8, 2, SNOWFUR.l).px(22, 8, SNOWFUR.b);
  // a helmet of ice with two horns
  paint(p, 15, 1, 20, 7, (x, y) => {
    const dx = (x + 0.5 - 25) / 10;
    const dy = (y + 0.5 - 8) / 7;
    return dx * dx + dy * dy > 1 ? null : y > 5 ? ICE.d : dx < -0.3 ? ICE.l2 : ICE.l;
  });
  p.line(16, 4, 12, 0, FROST.l).line(17, 4, 13, 0, FROST.b).line(34, 4, 37, 0, FROST.l).line(33, 4, 36, 0, FROST.b);
}

// ---------------------------------------------------------------------------
// Surts smedja: fire imps, lava golems, fire hounds; the smith and Surt himself
// ---------------------------------------------------------------------------

function eldimp(p: Px, f: number): void {
  // a small fire imp: round and red, two little horns, a big grin, bat wings, a pointy tail, a flame on top
  const red = pal('#6a140c', '#a8241a', '#e04a2a', '#ff8a5a', '#ffc0a0');
  p.line(0, 12, 3, 11, red.d).tpl(0, 10, ['#.', '##'], { '#': red.b });
  p.tpl(1, 4, ['..##', '.###', '####', '..##'], { '#': f ? red.d : red.b });
  const [b, fr] = stride(f, 4, 8);
  p.rect(b, 13, 2, 3, red.d).rect(fr, 13, 2, 3, red.b);
  lump(p, 2, 5, 11, 9, red, 0.15, 111, 0.35);
  p.rect(5, 3, 1, 3, '#f4e0c0').px(4, 2, '#f4e0c0').rect(10, 3, 1, 3, '#f4e0c0').px(11, 2, '#f4e0c0');
  p.rect(8, 7, 2, 2, K).px(9, 7, '#ffe14a').rect(11, 7, 2, 2, K).px(12, 7, '#ffe14a');
  p.rect(8, 10, 5, 1, K).px(9, 10, '#ffffff').px(11, 10, '#ffffff');
}

function lavagolem(p: Px, f: number): void {
  // a golem of black basalt boulders with lava glowing between them, big fists, small hot eyes
  const rock = pal('#100e12', '#1e1b22', '#2e2a33', '#433e4a', '#5a5462');
  const [b, fr] = stride(f, 5, 15, 2);
  lump(p, b, 19, 6, 7, rock, 0.3, 121);
  lump(p, fr, 19, 6, 7, rock, 0.3, 122);
  lump(p, 3, 6, 18, 15, rock, 0.35, 123, 0.3);
  lump(p, 0, 11, 7, 9, rock, 0.3, 124);
  lump(p, 17, 12, 7, 9, rock, 0.3, 125);
  lump(p, 7, 0, 11, 9, rock, 0.3, 126, 0.35);
  // the lava in the cracks, and the eyes
  for (const [x0, y0, x1, y1] of [[6, 9, 11, 15], [11, 15, 9, 19], [14, 8, 17, 13], [2, 14, 5, 16], [19, 15, 21, 18]] as const) p.line(x0, y0, x1, y1, EMBER.m);
  p.px(11, 15, EMBER.h).px(17, 13, EMBER.h).px(8, 21, EMBER.m).px(17, 22, EMBER.m);
  p.rect(13, 3, 2, 2, EMBER.h).px(14, 3, EMBER.hot).rect(16, 3, 1, 2, EMBER.h);
}

function eldhund(p: Px, f: number): void {
  // a fire hound: sooty fur with glowing cracks, a mane of flames on its neck, a burning tail tip, hot eyes
  const fur = pal('#16111a', '#261e28', '#3a2e38', '#54444e', '#6e5a64');
  const [b, fr] = stride(f, 4, 14, 2);
  p.rect(b, 11, 2, 5, fur.d).rect(b + 4, 11, 2, 5, fur.b).rect(fr, 11, 2, 5, fur.b).rect(fr - 4, 11, 2, 5, fur.d);
  p.line(0, 5, 3, 8, fur.b).line(1, 5, 4, 8, fur.l);
  lump(p, 3, 6, 14, 7, fur, 0.25, 131, 0.3);
  lump(p, 14, 3, 6, 7, fur, 0.2, 132, 0.35);
  p.rect(14, 1, 2, 3, fur.b).rect(17, 1, 2, 3, fur.d).px(15, 2, EMBER.m);
  p.rect(19, 6, 3, 3, fur.l).rect(19, 8, 3, 1, fur.b).px(21, 6, '#0a0808').px(20, 9, EMBER.m);
  p.rect(17, 5, 2, 1, '#ffd040').px(18, 4, '#fff6c8');
  p.px(6, 9, EMBER.m).px(7, 10, EMBER.d).px(11, 8, EMBER.m).px(10, 11, EMBER.d).px(13, 10, EMBER.m);
}

function smeden(p: Px, f: number): void {
  // Smeden Glöd, Surt's smith: broad and short, ember-red skin, a leather apron, a beard of glowing embers and a big
  // hammer
  const skin = pal('#4a1a12', '#7a2a1a', '#a8442a', '#d0663e', '#f08a5a');
  const leather = pal('#2a1a10', '#40281a', '#5a3a26', '#7a5236', '#9a6e4a');
  const [b, fr] = stride(f, 9, 18, 2);
  p.rect(b, 30, 6, 7, leather.d).rect(fr, 30, 6, 7, leather.b).rect(b - 1, 36, 8, 4, BASALT.b).rect(fr, 36, 8, 4, BASALT.l);
  lump(p, 5, 12, 22, 20, skin, 0.15, 141, 0.3);
  // the apron with a bright stitch and a pocket of tongs
  paint(p, 10, 16, 15, 17, (x, y) => (y === 16 ? leather.l : x === 10 ? leather.l : x === 24 ? leather.d : leather.b));
  p.rect(10, 25, 15, 1, leather.d).rect(14, 21, 5, 4, leather.d).line(15, 19, 16, 23, IRON.l);
  // the arms: the far one with a pair of tongs, the near one lifting the hammer
  lump(p, 2, 16, 7, 12, skin, 0.1, 142, 0.3);
  lump(p, 23, 14, 8, 11, skin, 0.1, 143, 0.3);
  p.rect(28, 4, 3, 22, WOOD.b).rect(28, 4, 1, 22, WOOD.l);
  p.rect(24, 0, 10, 7, IRON.b).rect(24, 0, 10, 1, IRON.l2).rect(24, 1, 1, 6, IRON.l).rect(33, 1, 1, 6, IRON.d).rect(24, 6, 10, 1, IRON.d2);
  lump(p, 26, 19, 6, 6, skin, 0.1, 144, 0.35);
  // the head: a bald top, a bulb of a nose, eyes glowing like coals, a beard of embers
  lump(p, 11, 1, 14, 13, skin, 0.15, 145, 0.35);
  lump(p, 22, 7, 5, 5, skin, 0.1, 146, 0.5);
  p.rect(19, 5, 3, 2, K).px(20, 5, EMBER.h).px(21, 5, EMBER.hot);
  p.rect(16, 4, 7, 1, skin.d);
  paint(p, 12, 10, 14, 10, (x, y) => {
    const half = 6.5 - (y - 10) * 0.55;
    if (Math.abs(x + 0.5 - 19) > half) return null;
    return (x + y) % 4 === 0 ? EMBER.hot : (x + y) % 3 === 0 ? EMBER.h : EMBER.m;
  });
}

function surt(p: Px, f: number): void {
  // Surt, the fire giant: skin of black stone cracked with lava, armour of dark iron, a crown of flames, burning eyes
  // and the flaming sword
  const rock = pal('#100c10', '#1e171c', '#2e2228', '#46343a', '#5e4850');
  const [b, fr] = stride(f, 12, 26, 3);
  p.rect(b, 42, 7, 10, rock.d).rect(fr, 42, 7, 10, rock.b).rect(b - 2, 51, 10, 5, IRON.d2).rect(fr - 1, 51, 10, 5, IRON.d);
  lump(p, 8, 16, 28, 28, rock, 0.25, 151, 0.3);
  // dark iron armour on the chest and a belt with a glowing buckle
  paint(p, 12, 20, 20, 14, (x, y) => (y === 20 ? IRON.l : x === 12 ? IRON.b : (x + y) % 7 === 0 ? IRON.l : IRON.d));
  p.rect(12, 34, 20, 3, IRON.d2).rect(19, 33, 5, 5, EMBER.h).px(20, 34, EMBER.hot);
  // lava cracks in the skin
  for (const [x0, y0, x1, y1] of [[9, 24, 11, 30], [33, 22, 31, 28], [14, 40, 16, 44], [27, 38, 25, 43]] as const) p.line(x0, y0, x1, y1, EMBER.m);
  // the far arm, the near arm and the sword of fire held high
  lump(p, 4, 20, 8, 18, rock, 0.2, 152, 0.3);
  lump(p, 31, 16, 9, 15, rock, 0.2, 153, 0.3);
  p.rect(36, 24, 4, 8, IRON.b).rect(32, 30, 12, 2, GOLD.b).rect(32, 30, 12, 1, GOLD.l);
  paint(p, 37, 0, 6, 31, (x, y) => (x === 37 ? FIREPAL.l2 : x === 38 || x === 39 ? (y % 5 === 0 ? FIREPAL.l2 : FIREPAL.l) : x === 40 ? FIREPAL.b : y > 2 && y % 3 !== 0 ? FIREPAL.d : null));
  lump(p, 33, 28, 8, 7, rock, 0.15, 154, 0.35);
  // the head: glowing eyes, a jaw like a cliff, a crown of flames drawn on top after the outline
  lump(p, 14, 5, 18, 15, rock, 0.2, 155, 0.35);
  p.rect(23, 10, 4, 2, EMBER.h).px(25, 10, EMBER.hot).rect(28, 10, 3, 2, EMBER.h);
  p.rect(22, 15, 9, 2, EMBER.d).px(24, 15, EMBER.m).px(28, 15, EMBER.m);
  p.line(17, 9, 19, 14, EMBER.m);
}

// ---------------------------------------------------------------------------
// Pets and mounts only the dungeons give
// ---------------------------------------------------------------------------

/** One raven facing right at (x, y): glossy black, a grey beak, wings up (f 0) or down (f 1). */
function raven(p: Px, x: number, y: number, f: number, flying: boolean): void {
  const B = pal('#0c0a12', '#16141e', '#24222e', '#3a3a52', '#5a5a7a');
  if (flying) {
    // wings spread, beating
    if (f === 0) p.tpl(x + 1, y - 3, ['.##....', '####...', '.#####.'], { '#': B.b });
    else p.tpl(x + 1, y + 3, ['.#####.', '####...', '.##....'], { '#': B.b });
  } else p.line(x + 2, y + 6, x + 1, y + 8, B.b).line(x + 4, y + 6, x + 5, y + 8, B.b);
  lump(p, x, y, 8, 6, B, 0.1, x + y, 0.35);
  p.rect(x - 2, y + 3, 3, 2, B.d);
  lump(p, x + 5, y - 2, 5, 5, B, 0.1, x + y + 1, 0.4);
  p.rect(x + 10, y, 2, 1, '#6a6a76').px(x + 10, y + 1, '#4a4a56');
  p.px(x + 8, y - 1, '#ffffff').px(x + 7, y - 1, '#2a2a3a');
  p.px(x + 2, y + 1, B.l2).px(x + 6, y - 1, B.l);
  if (!flying) p.rect(x + 1, y + 2, 4, 2, B.l);
}

function korp(p: Px, f: number): void {
  // Hugin and Munin: one flies above and behind, the other hops along the ground
  raven(p, 1, 3 + f, f, true);
  raven(p, 8, 7 - f, f, false);
}

function fenrisvalp(p: Px, f: number): void {
  // a wolf pup with huge paws and a big head, a ribbon tied round its neck (the gentlest of bonds)
  const fur = pal('#3a4250', '#5a6474', '#7e8a9c', '#a4b0c0', '#c8d2de');
  p.line(0, 4, 2, 7, fur.b).line(0, 3, 2, 6, fur.l);
  const [b, fr] = stride(f, 3, 9, 1);
  p.rect(b, 10, 3, 3, fur.d).rect(fr, 10, 3, 3, fur.b);
  p.rect(b - 1, 12, 4, 3, fur.b).rect(fr, 12, 4, 3, fur.l).px(fr + 1, 14, fur.d).px(fr + 2, 14, fur.d);
  lump(p, 2, 5, 9, 7, fur, 0.2, 161, 0.3);
  lump(p, 7, 1, 9, 9, fur, 0.15, 162, 0.35);
  p.rect(8, 0, 2, 3, fur.b).px(9, 1, '#e8a8b0').rect(12, 0, 2, 2, fur.d);
  p.rect(13, 5, 3, 3, fur.l2).px(15, 5, K);
  p.rect(11, 3, 2, 2, K).px(11, 3, '#ffffff');
  p.rect(7, 9, 5, 1, '#e8c040').px(9, 10, '#e8c040');
}

function sleipner(p: Px, f: number): void {
  // Odin's horse: dapple grey with a white mane and tail, a blue saddle cloth, and eight legs that take turns
  const c = pal('#4a525c', '#6e7884', '#98a2ae', '#c0c8d0', '#e0e6ec');
  const mane = '#f0f2f6';
  // legs: four pairs, front and back, each pair stepping in turn
  const legs = f ? [5, 8, 20, 23] : [6, 9, 19, 22];
  legs.forEach((x, i) => {
    p.rect(x, 17, 2, 7, i % 2 ? c.b : c.d).rect(x + 1, 17, 1, 7, i % 2 ? c.l : c.b);
    p.rect(x, 24, 2, 2, '#3a3a40');
  });
  const legs2 = f ? [7, 10, 21, 24] : [4, 11, 17, 25];
  legs2.forEach((x) => p.rect(x, 18, 2, 6, c.d).rect(x, 24, 2, 2, '#2a2a30'));
  // body, neck and head
  lump(p, 3, 8, 22, 11, c, 0.15, 171, 0.3);
  for (const [x, y] of [[8, 11], [13, 13], [18, 10], [10, 15], [20, 14]] as const) p.px(x, y, c.l2).px(x + 1, y, c.l);
  p.rect(20, 3, 5, 9, c.b).rect(23, 1, 6, 6, c.b).rect(26, 6, 4, 3, c.b).rect(27, 7, 2, 1, c.d);
  p.rect(23, 0, 2, 2, c.d).rect(26, 0, 1, 2, c.d);
  p.px(26, 3, K).px(29, 8, c.d2);
  p.rect(19, 1, 2, 9, mane).rect(21, 0, 3, 2, mane).rect(20, 2, 1, 7, '#c8ccd4');
  p.rect(0, 9, 3, 9, mane).rect(1, 8, 2, 1, mane).px(0, 17, '#c8ccd4');
  // the saddle cloth with a gold edge
  p.rect(10, 7, 9, 4, '#2e4a9a').rect(10, 10, 9, 1, GOLD.b).rect(10, 7, 9, 1, '#4a6ac8');
}

function gullinbursti(p: Px, f: number): void {
  // Frey's golden boar: golden hide, a crest of bristles that shine, small tusks, a gold ring in each ear
  const gold = pal('#7a4a08', '#a8701a', '#d8a030', '#f8d060', '#fff0a8');
  const [b, fr] = stride(f, 4, 16, 2);
  for (const [x, c] of [[b, gold.d], [b + 4, gold.b], [fr - 4, gold.d], [fr, gold.b]] as const) p.rect(x, 13, 3, 4, c).rect(x, 16, 3, 2, '#5a3a10');
  lump(p, 1, 5, 19, 10, gold, 0.2, 181, 0.3);
  p.line(0, 7, 2, 9, gold.d).px(0, 6, gold.d);
  lump(p, 15, 4, 8, 8, gold, 0.15, 182, 0.35);
  p.rect(21, 8, 3, 3, '#e8a0a0').px(23, 9, '#7a3a3a');
  p.px(20, 11, '#fffaf0').px(21, 10, '#fffaf0');
  p.rect(18, 6, 2, 2, K).px(18, 6, '#ffffff');
  p.rect(16, 2, 2, 3, gold.b).px(16, 4, GOLD.l2);
  // the crest of bristles along its back (drawn bright; their shine is added after the outline)
  for (let x = 3; x < 19; x += 2) p.rect(x, 2 + (x % 4 === 1 ? 0 : 1), 1, 4 - (x % 4 === 1 ? 0 : 1), '#fff6c0');
}

// ---------------------------------------------------------------------------
// After the outline: flames and glows that should not get a dark edge
// ---------------------------------------------------------------------------

const AFTER: Record<string, Draw> = {
  eldimp: (p, f) => {
    flame(p, 8, 5, 4, f ? 5 : 4, f ? 1 : -1, '#e04a14', '#ff9a2a', '#fff0a0');
    halo(p, 8, 8, 8, '#ff8a3a', 0.2);
  },
  eldhund: (p, f) => {
    for (const [x, y, h] of [[13, 5, 4], [10, 6, 3], [1, 5, 3]] as const) flame(p, x, y, 3, h + (f ? 1 : 0), f ? -1 : 0.5, '#e04a14', '#ff9a2a', '#fff0a0');
  },
  lavagolem: (p) => halo(p, 12, 13, 13, '#ff6a2a', 0.15),
  isande: (p, f) => {
    halo(p, 8, 9, 8, '#a8e8ff', 0.25);
    twinkle(p, f ? 3 : 13, f ? 4 : 2, '#e8faff');
  },
  isvarg: (p) => p.px(18, 3, '#e8faff'),
  draugkung: (p) => halo(p, 30, 12, 7, '#9cff8a', 0.18),
  surt: (p, f) => {
    // the crown of flames and the sword's fire
    for (const [x, h] of [[16, 6], [20, 9], [24, 11], [28, 8], [31, 5]] as const) flame(p, x, 6, 4, h + (f ? 2 : 0), f ? 1 : -1, '#e04a14', '#ff9a2a', '#fff0a0');
    for (const y of [4, 12, 20]) flame(p, 41, y + (f ? 2 : 0), 3, 5, 1, '#e04a14', '#ff9a2a', '#ffd060');
    halo(p, 39, 14, 9, '#ff9a3a', 0.2);
  },
  smeden: (p, f) => halo(p, 19, 15, 9, '#ff8a3a', f ? 0.16 : 0.12),
  gullinbursti: (p, f) => {
    halo(p, 11, 3, 11, '#ffe27a', f ? 0.3 : 0.22);
    twinkle(p, f ? 6 : 14, f ? 1 : 0, '#fff6c0');
  },
  isblock: (p, f) => twinkle(p, f ? 4 : 17, f ? 8 : 5, '#ffffff'),
};

// ---------------------------------------------------------------------------

export const SAGA_ANIMAL_SIZE: Record<string, { w: number; h: number }> = {
  skelett: { w: 18, h: 22 },
  draugbage: { w: 18, h: 22 },
  gravrotta: { w: 20, h: 13 },
  frosttroll: { w: 22, h: 26 },
  isvarg: { w: 22, h: 16 },
  isande: { w: 16, h: 20 },
  eldimp: { w: 14, h: 16 },
  lavagolem: { w: 24, h: 26 },
  eldhund: { w: 22, h: 16 },
  isblock: { w: 22, h: 28 },
  // the bosses: about twice as big, the frost giant the biggest
  gravvaktare: { w: 32, h: 40 },
  draugkung: { w: 34, h: 44 },
  isbjorn: { w: 44, h: 32 },
  rimturs: { w: 46, h: 58 },
  smeden: { w: 34, h: 40 },
  surt: { w: 46, h: 56 },
  korp: { w: 20, h: 16 },
  fenrisvalp: { w: 16, h: 15 },
  sleipner: { w: 30, h: 26 },
  gullinbursti: { w: 24, h: 18 },
};

export const SAGA_DRAW: Record<string, Draw> = {
  skelett,
  draugbage,
  gravrotta,
  frosttroll,
  isvarg,
  isande,
  eldimp,
  lavagolem,
  eldhund,
  isblock,
  gravvaktare,
  draugkung,
  isbjorn,
  rimturs,
  smeden,
  surt,
  korp,
  fenrisvalp,
  sleipner,
  gullinbursti,
};
export const SAGA_AFTER = AFTER;

/** Where a tomteluva sits at Christmas (head centre x, top y). */
export const SAGA_HAT_POS: Record<string, [number, number]> = {
  skelett: [11, 0],
  draugbage: [10, 0],
  gravrotta: [15, 1],
  frosttroll: [12, 1],
  isvarg: [17, 1],
  isande: [8, 2],
  eldimp: [8, 3],
  lavagolem: [12, 0],
  eldhund: [17, 1],
  gravvaktare: [18, 2],
  draugkung: [20, 0],
  isbjorn: [36, 5],
  rimturs: [25, 1],
  smeden: [18, 1],
  surt: [23, 5],
  korp: [15, 5],
  fenrisvalp: [11, 0],
  sleipner: [25, 0],
  gullinbursti: [19, 3],
};

/** Outlines for the creatures of ice, which a dark brown edge would make heavy. */
export const SAGA_OUTLINE: Record<string, string> = { isande: '#3a6a96', isblock: '#3a6a96' };

/** How high a rider sits on the dungeons' mounts (the horse: 7). */
export const SAGA_RIDE_LIFT: Record<string, number> = { sleipner: 8, gullinbursti: 5 };
