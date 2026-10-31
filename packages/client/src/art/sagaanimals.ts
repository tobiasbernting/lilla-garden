// Sagan om Världsträdet's creatures, drawn like the other animals (side view facing right, flipped for left, two walk
// frames; drawAnimal outlines them): the dungeons' monsters, their bosses (about twice as big), the ice block a frozen
// friend stands in, Hugin and Munin, the Fenris pup, Sleipner and Gullinbursti. Spooky-cute: skulls grin, eyes are
// big and round, nothing bleeds.
import { Px, shade } from './px.js';
import { flame, halo, lump, pal, paint, shard, twinkle, type Pal } from './saga.ts';

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
// Lokes list: shared shapes (eyes, dogs and wolves, horses, spiders, a serpent's tube, saddles)
// ---------------------------------------------------------------------------

/** A big round eye at (x, y), s×s: dark with a white glint, or lit all over in one colour (glow). */
function eye(p: Px, x: number, y: number, s: number, glow?: string): void {
  if (glow) {
    p.rect(x, y, s, s, glow).px(x + s - 1, y, shade(glow, 1.6));
    if (s >= 3) p.px(x, y + s - 1, shade(glow, 0.7));
    return;
  }
  p.rect(x, y, s, s, K).px(x, y, '#ffffff');
  if (s >= 3) p.px(x + 1, y, '#ffffff').px(x + s - 1, y + s - 1, '#4a4a66');
}

/** A thick round tube along a path of [x, y, radius] (a serpent, a tail): a ball every half pixel, lit from the top-left. */
function tube(p: Px, pts: [number, number, number][], c: Pal, salt: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, r0] = pts[i]!;
    const [x1, y1, r1] = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const r = r0 + (r1 - r0) * t;
      lump(p, x0 + (x1 - x0) * t - r, y0 + (y1 - y0) * t - r, r * 2, r * 2, c, 0.05, salt, 0.35);
    }
  }
}

/** A saddle on a back: a cloth with an edge, the seat on top. */
function saddle(p: Px, x: number, y: number, w: number, cloth: string, trim: string, seat = '#5a3a20'): void {
  p.rect(x, y + 1, w, 4, cloth).rect(x, y + 4, w, 1, trim).rect(x, y + 1, w, 1, shade(cloth, 1.3));
  p.rect(x + 2, y, w - 4, 2, seat).rect(x + 2, y, w - 4, 1, shade(seat, 1.4)).px(x + w - 3, y - 1, seat);
}

interface DogLook {
  fur: Pal;
  /** Glowing eye colour (monsters); without it the eyes are dark and friendly. */
  glow?: string;
  /** A second head behind the first (the hounds of Hel). */
  twoHeads?: boolean;
  /** Fur on the neck and chest (a ruff or a mane). */
  ruff?: Pal;
  belly?: string;
  fangs?: boolean;
  /** Pixels to move it down (room above for a second head). */
  oy?: number;
}

/**
 * A dog or a wolf, side view facing right, at scale s (1 = 24×17): a bushy tail, a long body, a deep chest, pricked
 * ears and a long snout. Hounds, wolves, Garm, Sköll, Fenrisulven and the wolf you can ride all start here.
 */
function canine(p: Px, f: number, s: number, o: DogLook): void {
  const oy = o.oy ?? 0;
  const S = (v: number) => Math.round(v * s);
  const Y = (v: number) => Math.round(v * s) + oy;
  const fur = o.fur;
  const R = (x: number, y: number, w: number, h: number, c: string) => p.rect(S(x), Y(y), Math.max(1, S(w)), Math.max(1, S(h)), c);
  // legs: the far pair darker, behind; each paw a little lighter
  const [b, fr] = stride(f, 4, 17, 2);
  R(b + 3.5, 11, 2, 5.6, fur.d2);
  R(fr - 3.5, 11, 2, 5.6, fur.d2);
  R(b, 11, 2, 5.6, fur.d);
  R(fr, 11, 2, 5.6, fur.b);
  R(b - 0.5, 15.6, 2.6, 1.2, fur.b);
  R(fr, 15.6, 2.6, 1.2, fur.l);
  // the tail, the body, the chest
  const T = (x: number, y: number, r: number): [number, number, number] => [x * s, y * s + oy, r * s];
  const tip = f ? -0.4 : 0.2;
  tube(p, [T(5.5, 7, 1.7), T(3, 5.6, 1.9), T(1.8, 3.4, 1.7), T(1.7 + tip, 1.5, 1.1)], fur, 201);
  p.px(Math.round((1.4 + tip) * s), Math.round(1 * s) + oy, fur.l2);
  lump(p, S(3), Y(5), S(15), S(8), fur, 0.25, 202, 0.3);
  if (o.belly) R(7, 11.8, 8, 0.8, o.belly);
  lump(p, S(13), Y(4), S(6.5), S(8.5), o.ruff ?? fur, 0.3, 203, 0.3);
  const head = (dx: number, dy: number, far: boolean) => {
    const F = far ? pal(fur.d2, fur.d2, fur.d, fur.b, fur.b) : fur;
    R(15 + dx, dy, 2, 3, F.d);
    lump(p, S(15 + dx), Y(2 + dy), S(7), S(7), F, 0.2, 204, 0.35);
    R(18 + dx, dy, 2, 3, F.b);
    if (!far) p.px(S(18.5 + dx), Y(1 + dy), '#c890a0');
    // the snout, the nose and a mouth line
    R(20 + dx, 5 + dy, 4, 2.4, F.l);
    R(20 + dx, 7.2 + dy, 3.6, 1, F.b);
    p.rect(S(23 + dx) - (s > 1.4 ? 1 : 0), Y(5 + dy), Math.max(1, S(1)), Math.max(1, S(1)), K);
    p.rect(S(20 + dx), Y(7.2 + dy), Math.max(1, S(3)), 1, fur.d2);
    if (o.fangs) p.px(S(21 + dx), Y(7.2 + dy) + 1, '#fffaf0').px(S(22.5 + dx), Y(7.2 + dy) + 1, '#fffaf0');
    const es = s >= 1.6 ? 3 : 2;
    eye(p, S(18.2 + dx), Y(3.8 + dy), es, o.glow);
  };
  if (o.twoHeads) head(-5, -4, true);
  head(0, 0, false);
}

interface HorseLook {
  c: Pal;
  mane: Pal;
  legs8?: boolean;
  hoof?: string;
  /** 'hair' (a horse), 'short' (a deer's white scut), 'fin' (a fish tail). */
  tail?: 'hair' | 'short' | 'fin';
  glow?: string;
  oy?: number;
  /** Slimmer legs and no mane (a stag). */
  deer?: boolean;
}

/** A horse at scale s (1 = 31×28): a round body, an arched neck with a mane, a long head, four (or eight) legs. */
function horse(p: Px, f: number, s: number, o: HorseLook): void {
  const oy = o.oy ?? 0;
  const S = (v: number) => Math.round(v * s);
  const Y = (v: number) => Math.round(v * s) + oy;
  const c = o.c;
  const R = (x: number, y: number, w: number, h: number, col: string) => p.rect(S(x), Y(y), Math.max(1, S(w)), Math.max(1, S(h)), col);
  const hoof = o.hoof ?? '#2e2a2a';
  const lw = o.deer ? 1.5 : 2;
  const leg = (x: number, col: string, hi: string) => {
    R(x, 18, lw, 8, col);
    R(x + lw - 0.8, 18, 0.8, 7, hi);
    R(x - 0.2, 25.6, lw + 0.4, 1.6, hoof);
  };
  // the legs: far ones dark and behind, then the near ones (Sleipner's kin have two of each)
  const [b, fr] = stride(f, 5, 22, 2);
  if (o.legs8) {
    const [b2, f2] = stride(1 - f, 7, 20, 1);
    leg(b2 + 3, c.d2, c.d);
    leg(f2 - 3, c.d2, c.d);
  }
  leg(b + 3, c.d2, c.d);
  leg(fr - 3, c.d2, c.d);
  if (o.legs8) {
    const [b2, f2] = stride(1 - f, 7, 20, 1);
    leg(b2, c.d, c.b);
    leg(f2, c.d, c.b);
  }
  leg(b, c.d, c.b);
  leg(fr, c.b, c.l);
  // the tail
  const tail = o.tail ?? 'hair';
  if (tail === 'hair') {
    const T = (x: number, y: number, r: number): [number, number, number] => [x * s, y * s + oy, r * s];
    const sw = f ? 0.5 : -0.3;
    tube(p, [T(4.5, 10.5, 1.5), T(2.6, 12.5, 1.5), T(1.6 + sw, 16, 1.3), T(1.8 + sw * 2, 20, 1)], o.mane, 216);
  }
  if (tail === 'short') lump(p, S(2), Y(9), S(3), S(3), pal(c.b, c.l, '#f4f0e8', '#ffffff', '#ffffff'), 0.1, 211);
  // the body, the neck and the head
  lump(p, S(3), Y(9), S(22), S(11), c, 0.15, 212, 0.3);
  lump(p, S(18), Y(4), S(7), S(12), c, 0.15, 213, 0.35);
  lump(p, S(21), Y(2), S(7), S(7), c, 0.15, 214, 0.35);
  lump(p, S(24.5), Y(4.5), S(6), S(5), c, 0.1, 215, 0.4);
  R(26, 8, 4, 1, c.d);
  p.px(S(29.5), Y(6), c.d2);
  // ears
  R(21.5, 0, 1.6, 3, c.d);
  R(23, 0, 1.6, 3, c.b);
  eye(p, S(24), Y(3.6), s >= 1.4 ? 3 : 2, o.glow);
  // the mane along the neck
  if (!o.deer)
    for (let i = 0; i <= 10; i++) {
      const y = 1 + i;
      const x = 20.5 - i * 0.35 + (i % 2 && f ? -0.4 : 0);
      R(x - 1.2, y, 2.6, 1.3, i % 3 === 0 ? o.mane.l : o.mane.b);
      R(x - 1.6, y + 0.6, 0.9, 0.9, o.mane.d);
    }
}

interface SpiderLook {
  body: Pal;
  legs: Pal;
  bone?: boolean;
  glow?: string;
  crown?: boolean;
  /** A pattern on the abdomen (the queen's heart). */
  mark?: string;
  oy?: number;
}

/** A spider at scale s (1 = 28×16): eight bent legs arching out front and back, a round abdomen, a head with eyes. */
function spider(p: Px, f: number, s: number, o: SpiderLook): void {
  const oy = o.oy ?? 0;
  const S = (v: number) => Math.round(v * s);
  const Y = (v: number) => Math.round(v * s) + oy;
  const thick = s >= 1.4 ? 2 : 1;
  const legLine = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let i = 0; i < thick; i++) p.line(S(x0) + i, Y(y0), S(x1) + i, Y(y1), c);
  };
  // [hip x, knee x, foot x]: two legs reach back, two reach forward
  const L: [number, number, number][] = [
    [9, 4, 0.5],
    [11, 6.5, 3],
    [17, 21.5, 24.5],
    [19, 24, 27],
  ];
  const leg = (i: number, far: boolean) => {
    const [hx, kx, fx] = L[i]!;
    const step = (i + (far ? 1 : 0)) % 2 === f ? 0.8 : -0.8;
    const dx = far ? (i < 2 ? 1.5 : -1.5) : 0;
    const ky = far ? 1 : i % 2 ? 1.5 : 2.5;
    const hy = i < 2 ? 9 : 11;
    const up = o.bone ? (far ? BONE.d : BONE.l2) : far ? o.legs.d2 : o.legs.l;
    const down = o.bone ? (far ? BONE.d2 : BONE.b) : far ? o.legs.d2 : o.legs.b;
    legLine(hx + dx, hy, kx + dx, ky, up);
    legLine(kx + dx, ky, fx + dx + step, far ? 14.6 : 15.2, down);
    if (o.bone) p.px(S(kx + dx), Y(ky), far ? BONE.b : '#ffffff');
  };
  for (let i = 0; i < 4; i++) leg(i, true);
  // the abdomen (for the bone spider a ribcage with gaps between the ribs)
  if (o.bone)
    paint(p, S(5), Y(3.5), S(11) + 1, S(9.5) + 1, (x, y) => {
      const dx = (x + 0.5 - S(10.5)) / (S(11) / 2);
      const dy = (y + 0.5 - Y(8.25)) / (S(9.5) / 2);
      if (dx * dx + dy * dy > 1) return null;
      const spine = y - Y(3.5) <= 1;
      if (!spine && (y - Y(3.5)) % 2 === 0) return null;
      return spine ? BONE.l : dx < -0.3 ? BONE.l : dx > 0.5 ? BONE.d : BONE.b;
    });
  else lump(p, S(5), Y(3.5), S(11), S(9.5), o.body, 0.25, 221, 0.3);
  if (o.mark) {
    const mx = S(10.5);
    const my = Y(6.5);
    const r = Math.max(1, S(1.6));
    p.rect(mx - r, my, r * 2, r, o.mark).rect(mx - r + 1, my - 1, r - 1, 1, o.mark).rect(mx + 1, my - 1, r - 1, 1, o.mark);
    p.rect(mx - r + 1, my + r, r * 2 - 2, 1, o.mark).px(mx - 1, my + r + 1, o.mark).px(mx, my + r + 1, o.mark);
  }
  leg(0, false);
  leg(1, false);
  // the head
  if (o.bone) skull(p, S(14), Y(4.5), S(9), S(8), o.glow ?? GHOST);
  else {
    lump(p, S(14), Y(5.5), S(9), S(7.5), o.body, 0.2, 222, 0.35);
    // two big round eyes (white, with dark pupils looking ahead) and two little ones
    const es = s >= 1.4 ? 3 : 2;
    for (const [x, y] of [[16.4, 6.6], [20, 7]] as const) {
      p.rect(S(x), Y(y), es + 1, es + 1, '#fffaf0');
      p.rect(S(x) + 1, Y(y) + 1, es, es, o.glow ?? K).px(S(x) + 1, Y(y) + 1, '#ffffff');
    }
    p.px(S(16.4), Y(6.2), o.glow ?? '#e8e0f0').px(S(22.2), Y(7.4), o.glow ?? '#e8e0f0');
    p.px(S(21.5), Y(12.2), '#fffaf0').px(S(22.6), Y(11.8), '#fffaf0');
  }
  if (o.crown)
    paint(p, S(15.5), Y(3), S(6), S(3), (x, y) => {
      const top = y < Y(4.3);
      if (top && (x - S(15.5)) % 3 !== 1) return null;
      return y === Y(3) ? GOLD.l2 : top ? GOLD.l : GOLD.b;
    });
  leg(2, false);
  leg(3, false);
}

/** Lighter, bluer and see-through: the shape an illusion takes (drawn after the outline, so the edge fades too). */
function ghostify(p: Px, tint: string, alpha = 0.78): void {
  const n = parseInt(tint.slice(1), 16);
  const tr = (n >> 16) & 255;
  const tg = (n >> 8) & 255;
  const tb = n & 255;
  const img = p.ctx.getImageData(0, 0, p.w, p.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lum = (0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!) / 255;
    const k = 0.58 + 0.42 * lum;
    d[i] = Math.round(tr * k * 0.75 + (d[i]! + (255 - d[i]!) * 0.5) * 0.25);
    d[i + 1] = Math.round(tg * k * 0.75 + (d[i + 1]! + (255 - d[i + 1]!) * 0.5) * 0.25);
    d[i + 2] = Math.round(tb * k * 0.75 + (d[i + 2]! + (255 - d[i + 2]!) * 0.5) * 0.25);
    d[i + 3] = Math.round(d[i + 3]! * alpha);
  }
  p.ctx.putImageData(img, 0, 0);
  halo(p, p.w / 2, p.h / 2, Math.max(p.w, p.h) * 0.6, tint, 0.12);
}

/** Loke's shadow: every colour turned to dusk and made see-through, darkest where Loke is darkest. */
function shadowify(p: Px): void {
  const S = [hexRgb('#140c22'), hexRgb('#24163a'), hexRgb('#3a2858'), hexRgb('#5a4280'), hexRgb('#8068aa')];
  const img = p.ctx.getImageData(0, 0, p.w, p.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lum = (0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!) / 255;
    const c = S[Math.min(4, Math.floor(lum * 5.2))]!;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = Math.round(d[i + 3]! * 0.86);
  }
  p.ctx.putImageData(img, 0, 0);
}
const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ---------------------------------------------------------------------------
// Helheim: ghosts with lanterns, two-headed hounds, bone spiders; Garm and Hel
// ---------------------------------------------------------------------------

const SHEET = pal('#7e7e98', '#aaaac0', '#d6d6e6', '#eeeef8', '#ffffff');
const HELGREEN = '#7aff6a';

function gengangare(p: Px, f: number): void {
  // a sheet ghost bobbing along with a lantern: a round top, a wavy hem that sways, big dark eyes, a little "o" mouth
  const bob = f ? 1 : 0;
  const cx = 8.5;
  paint(p, 0, 0, 17, 23, (x, y) => {
    const yy = y - bob;
    if (yy < 1) return null;
    const half = yy < 8 ? Math.sqrt(Math.max(0, 49 - (yy - 8) * (yy - 8))) : 7 + (yy - 8) * 0.14;
    const u = (x + 0.5 - cx) / Math.max(0.5, half);
    if (Math.abs(u) > 1) return null;
    const hem = 19 + Math.round(Math.sin((x + f * 2) * 1.2) * 1.3);
    if (yy > hem) return null;
    if (yy >= hem - 1) return SHEET.d;
    if (yy < 4 && u < 0.1) return SHEET.l2;
    if (u < -0.55) return SHEET.l;
    if (u > 0.62) return SHEET.d;
    // a fold or two down the sheet
    return (x === 5 || x === 11) && yy > 11 ? SHEET.b : yy > 13 && u > 0.3 ? SHEET.b : SHEET.l;
  });
  // the face
  p.rect(10, 6 + bob, 2, 3, K).px(10, 6 + bob, '#ffffff');
  p.rect(13, 6 + bob, 2, 3, K).px(13, 6 + bob, '#ffffff');
  p.rect(12, 11 + bob, 2, 2, '#4a4458').px(11, 10 + bob, '#f0c0d0').px(15, 10 + bob, '#f0c0d0');
  // an arm of sheet holding the lantern out in front
  p.rect(13, 13 + bob, 3, 2, SHEET.l).px(16, 13 + bob, SHEET.b);
  p.line(16, 14 + bob, 16, 15 + bob, IRON.l);
  p.rect(14, 16 + bob, 4, 1, IRON.b).rect(14, 21 + bob, 4, 1, IRON.d).rect(14, 17 + bob, 1, 4, IRON.b).rect(17, 17 + bob, 1, 4, IRON.d);
  p.rect(15, 17 + bob, 2, 4, '#c8ffb0');
}

function helhund(p: Px, f: number): void {
  // a hound of Hel: sooty fur, two heads (one peeks over the other) with green eyes, a bony collar
  canine(p, f, 1, { fur: pal('#120e18', '#221a2a', '#342a40', '#4e4260', '#6a5c80'), glow: HELGREEN, twoHeads: true, oy: 4, fangs: true });
}

function benspindel(p: Px, f: number): void {
  // a bone spider: a skull for a head, a ribbed body, legs of thin bones; it spits sticky webs
  spider(p, f, 1, { body: BONE, legs: BONE, bone: true, glow: HELGREEN });
}

function garm(p: Px, f: number): void {
  // Garm, Hel's hound: huge and sooty with a shaggy ruff, green eyes, fangs, a collar of iron spikes
  canine(p, f, 1.8, {
    fur: pal('#0c0910', '#18121e', '#281f30', '#3e3248', '#5a4a66'),
    ruff: pal('#08060c', '#120e18', '#1e1826', '#2e2638', '#463a52'),
    glow: HELGREEN,
    fangs: true,
  });
  // the spiked collar
  p.rect(26, 10, 2, 11, IRON.b).rect(26, 10, 1, 11, IRON.l);
  for (const y of [11, 15, 19]) p.px(28, y, IRON.l2).px(29, y, IRON.l);
  // little bony spikes down the back
  for (const x of [11, 16, 21]) p.tpl(x, 6, ['.#.', '###'], { '#': BONE.l }).px(x + 1, 6, BONE.l2);
}

function hel(p: Px, f: number): void {
  // Hel, queen of the dead: half of her pale as moonlight, half of her shadow, a long dress to match, a crown of little
  // bones with a smiling skull in front, and a sceptre with a green flame
  const pale = pal('#a49ab0', '#c8c0d4', '#e6e0ee', '#f6f2fa', '#ffffff');
  const dark = pal('#0e0a18', '#1a1428', '#2a2240', '#3c3258', '#544a74');
  const hair = pal('#0a0610', '#140c1e', '#22183a', '#342a52', '#4a3e6e');
  const split = 18;
  // long dark hair down her back
  paint(p, 5, 9, 12, 24, (x, y) => (x < 12 - (y - 9) * 0.25 - (y > 28 && x % 2 ? 1 : 0) ? null : x < 9 ? hair.b : hair.d));
  // the dress: a bell that floats above the ground, the hem waving
  paint(p, 2, 16, 32, 30, (x, y) => {
    const t = (y - 16) / 28;
    const half = 5 + t * 10;
    const u = (x + 0.5 - split) / half;
    if (Math.abs(u) > 1) return null;
    const hem = 43 + Math.round(Math.sin(x * 0.9 + f * 2) * 1.2);
    if (y > hem) return null;
    const P = x < split ? dark : pale;
    if (y >= hem) return P.d;
    if (u < -0.75 || (u > 0 && u < 0.2)) return P.l;
    if (u > 0.75) return P.d;
    return (x + 1) % 4 === 0 && y > 26 ? P.d : P.b;
  });
  // the waist with a silver cord
  p.rect(13, 25, 11, 1, '#c8d0e0').px(split, 26, '#c8d0e0').px(split, 27, '#a8b0c0');
  // the far arm in shadow, the near arm pale with the sceptre
  lump(p, 9, 17, 5, 10, dark, 0.1, 231, 0.3);
  lump(p, 21, 17, 6, 9, pale, 0.1, 232, 0.3);
  lump(p, 25, 23, 4, 4, pale, 0.05, 233, 0.4);
  p.rect(27, 10, 2, 33, BONE.b).rect(27, 10, 1, 33, BONE.l);
  skull(p, 25, 4, 7, 7, HELGREEN);
  // the head: the back of it in shadow, the face pale; one eye glows green, the other is dark and round
  paint(p, 11, 4, 15, 14, (x, y) => {
    const dx = (x + 0.5 - 18.5) / 7;
    const dy = (y + 0.5 - 11) / 6.6;
    if (dx * dx + dy * dy > 1) return null;
    const P = x < split ? pal('#2a2440', '#3a3456', '#4e4870', '#625c86', '#7a74a0') : pal('#b8a8b8', '#d8c8d4', '#f0e4ec', '#fcf6fa', '#ffffff');
    return dx < -0.5 || dy < -0.6 ? P.l : dx > 0.7 || dy > 0.7 ? P.d : P.b;
  });
  eye(p, 15, 9, 3, HELGREEN);
  eye(p, 20, 9, 3);
  p.px(23, 12, '#c8a0b0').rect(19, 14, 3, 1, '#7a5a6a').px(22, 13, '#7a5a6a');
  p.px(24, 13, '#f0b8c8');
  // the crown of little bones and its skull
  for (const [x, h] of [[12, 3], [14, 4], [16, 5], [21, 5], [23, 4], [25, 3]] as const) p.rect(x, 5 - h, 1, h, BONE.l).px(x, 5 - h, BONE.l2).px(x + 1, 5 - h, BONE.b);
  p.rect(11, 4, 16, 2, BONE.b).rect(11, 4, 16, 1, BONE.l);
  skull(p, 17, 0, 5, 5, HELGREEN);
}

// ---------------------------------------------------------------------------
// Svartalfheims gruvor: mine trolls, golden beetles, stone golems; the iron guardian and Fafner on his gold
// ---------------------------------------------------------------------------

function gruvtroll(p: Px, f: number): void {
  // a mossy grey-green troll in a miner's helmet with a lamp, a pick over its shoulder, a big round nose
  const skin = pal('#26301c', '#3e4e2c', '#5a6e40', '#7a905a', '#a0b47e');
  const cloth = pal('#2e1e12', '#4a3020', '#6a4a30', '#8a6644', '#aa845c');
  const [b, fr] = stride(f, 5, 12, 2);
  p.rect(b, 19, 4, 5, skin.d).rect(fr, 19, 4, 5, skin.b).rect(b - 1, 23, 6, 3, cloth.d).rect(fr, 23, 6, 3, cloth.b);
  lump(p, 1, 11, 6, 9, skin, 0.1, 241, 0.3);
  lump(p, 3, 8, 15, 13, skin, 0.15, 242, 0.3);
  // dungarees with a patch and a strap
  paint(p, 4, 14, 14, 7, (x, y) => (y === 14 ? cloth.l : (x + y) % 5 === 0 ? cloth.d : cloth.b));
  p.rect(8, 16, 3, 3, '#7a6a3a').rect(13, 9, 2, 6, cloth.b);
  // the pick over the shoulder
  p.line(12, 15, 19, 4, WOOD.b).line(13, 15, 20, 4, WOOD.d);
  p.line(15, 3, 18, 2, IRON.l).line(18, 2, 21, 4, IRON.b).line(21, 4, 22, 7, IRON.b).line(15, 4, 14, 6, IRON.d).px(18, 3, IRON.b);
  lump(p, 12, 12, 5, 5, skin, 0.1, 243, 0.35);
  // the head, the nose, a toothy underbite
  lump(p, 7, 2, 11, 9, skin, 0.15, 244, 0.35);
  lump(p, 15, 5, 5, 5, skin, 0.1, 245, 0.5);
  p.px(17, 6, skin.l2);
  eye(p, 13, 5, 2);
  p.rect(12, 9, 5, 1, skin.d2).px(13, 10, '#fffaf0').px(16, 10, '#fffaf0');
  // the helmet with a brim and the lamp on its front
  paint(p, 6, 0, 12, 5, (x, y) => {
    const dx = (x + 0.5 - 12) / 6;
    const dy = (y + 0.5 - 5) / 5;
    if (dx * dx + dy * dy > 1) return null;
    return dx < -0.3 && dy < -0.3 ? '#f0c040' : y > 3 ? '#9a6a10' : '#d8a020';
  });
  p.rect(5, 4, 14, 1, '#7a5208').rect(15, 1, 3, 3, IRON.b).rect(16, 2, 2, 1, '#fff6c8');
}

function beetle(p: Px, f: number, bow: boolean): void {
  // a golden beetle: a shiny round shell, a dark head with feelers, six busy legs
  const head = pal('#1e1408', '#3a2810', '#5a4018', '#7a5a26', '#9a7838');
  const legs = [3, 6, 9];
  legs.forEach((x, i) => p.line(x + 1, 8, x + (i % 2 === f ? 0 : 2), 11, head.d2));
  lump(p, 1, 2, 11, 8, GOLD, 0.15, 251, 0.35);
  p.line(2, 4, 6, 2, GOLD.l2).rect(2, 8, 10, 1, GOLD.d).px(4, 6, '#fff6c8');
  legs.forEach((x, i) => p.line(x, 9, x + (i % 2 === f ? 2 : 0), 11, head.b));
  lump(p, 10, 4, 5, 5, head, 0.1, 252, 0.4);
  eye(p, 12, 5, 2);
  p.line(12, 4, 14, 1, head.b).line(13, 4, 15, 2, head.d).px(14, 1, GOLD.l).px(15, 2, GOLD.l);
  p.px(15, 8, head.l);
  if (bow) p.tpl(4, 0, ['#.#', '###', '#.#'], { '#': '#e8405a' }).px(5, 1, '#ff8aa0');
}
const guldbagge = (p: Px, f: number) => beetle(p, f, false);
const guldbaggeTam = (p: Px, f: number) => beetle(p, f, true);

function stengolem(p: Px, f: number): void {
  // a golem of grey blocks with moss on its shoulders and blue runes that glow
  const rock = pal('#24262a', '#3a3e44', '#565c64', '#767e88', '#9aa2ac');
  const moss = pal('#1e3418', '#2e5024', '#457434', '#629848', '#8abc62');
  const rune = '#6ad8ff';
  const [b, fr] = stride(f, 5, 15, 2);
  lump(p, b, 20, 6, 7, rock, 0.3, 261);
  lump(p, fr, 20, 6, 7, rock, 0.3, 262);
  lump(p, 3, 7, 18, 15, rock, 0.3, 263, 0.3);
  lump(p, 0, 11, 7, 10, rock, 0.3, 264);
  lump(p, 17, 11, 7, 10, rock, 0.3, 265);
  lump(p, 7, 1, 11, 9, rock, 0.3, 266, 0.35);
  // the cracks between the blocks
  p.line(5, 14, 19, 14, rock.d2).line(12, 8, 11, 21, rock.d2);
  // moss on the head and the shoulders
  paint(p, 0, 0, 24, 14, (x, y) => {
    const tops: [number, number, number][] = [[12.5, 1, 5.5], [3.5, 11, 3.5], [20.5, 11, 3.5]];
    for (const [cx, ty, hw] of tops) if (Math.abs(x + 0.5 - cx) < hw && y >= ty && y < ty + 2 + ((x * 7) % 3 === 0 ? 1 : 0)) return y === ty ? moss.l : moss.b;
    return null;
  });
  // glowing runes and eyes
  p.line(8, 16, 9, 18, rune).px(10, 16, rune).line(14, 17, 16, 17, rune).px(15, 18, rune);
  p.rect(13, 4, 2, 2, rune).px(14, 4, '#e8faff').rect(16, 4, 2, 2, rune);
}

function jarnvakten(p: Px, f: number): void {
  // the iron guardian the dwarves built: a round iron body full of rivets, a furnace in its chest, a helmet with a
  // glowing visor, a braided copper beard and a great hammer
  const copper = pal('#4a2410', '#7a3e1c', '#b0622e', '#d88a4a', '#f4b67a');
  const [b, fr] = stride(f, 9, 21, 2);
  p.rect(b, 32, 6, 7, IRON.d).rect(fr, 32, 6, 7, IRON.b).rect(fr, 32, 2, 7, IRON.l);
  p.rect(b - 1, 38, 8, 4, IRON.d2).rect(fr, 38, 8, 4, IRON.d).rect(fr, 38, 8, 1, IRON.b);
  // the far arm, the body, the near shoulder
  lump(p, 0, 15, 8, 16, IRON, 0.15, 271, 0.3);
  lump(p, 4, 12, 27, 23, IRON, 0.15, 272, 0.3);
  for (let x = 7; x < 29; x += 3) p.px(x, 31, IRON.l2);
  // the furnace: a grate with embers behind it
  p.rect(12, 20, 11, 9, '#1a1010').rect(13, 21, 9, 7, EMBER.m).rect(15, 22, 5, 4, EMBER.h).rect(16, 23, 3, 2, EMBER.hot);
  for (let x = 14; x < 22; x += 2) p.rect(x, 21, 1, 7, IRON.d2);
  p.box(12, 20, 11, 9, GOLD.b);
  // the near arm and the hammer
  lump(p, 25, 13, 9, 9, IRON, 0.15, 273, 0.35);
  lump(p, 27, 20, 7, 11, IRON, 0.15, 274, 0.3);
  p.rect(31, 6, 2, 30, WOOD.b).rect(31, 6, 1, 30, WOOD.l);
  p.rect(26, 1, 11, 8, IRON.b).rect(26, 1, 11, 1, IRON.l2).rect(26, 2, 1, 7, IRON.l).rect(26, 8, 11, 1, IRON.d2).rect(26, 4, 11, 2, GOLD.b);
  lump(p, 28, 27, 6, 6, IRON, 0.1, 275, 0.35);
  // the head: a round helmet, the visor slit, a beard of copper braids
  lump(p, 10, 0, 17, 15, IRON, 0.15, 276, 0.35);
  p.rect(10, 6, 17, 1, GOLD.b);
  p.rect(17, 8, 9, 3, '#120c0c').rect(19, 9, 2, 1, '#ffd060').rect(23, 9, 2, 1, '#ffd060');
  for (const x of [13, 16, 19, 22]) paint(p, x, 13, 3, 9, (xx, y) => (y > 19 && xx !== x + 1 ? null : (xx + y) % 2 ? copper.b : copper.l));
  p.rect(13, 21, 3, 1, GOLD.l).rect(19, 21, 3, 1, GOLD.l);
}

function fafner(p: Px, f: number): void {
  // Fafner the dragon sits on his heap of gold: green scales, a cream belly, folded wings, curling horns, a big
  // pleased eye and one claw holding his favourite coin
  const sc = pal('#0c2616', '#164226', '#26683a', '#3e9250', '#7cc878');
  const belly = pal('#7a5a2a', '#b08a4e', '#e0c080', '#f4dcaa', '#fff4d8');
  const wing = pal('#1a1424', '#2e2038', '#4a3058', '#6a4a7a', '#8e6aa0');
  const lift = f ? 1 : 0;
  // the folded wing behind: a bony arm and the membrane between the fingers
  const W: [number, number] = [13, 1 - lift];
  const tips: [number, number][] = [[2, 12 - lift], [5, 19], [11, 21], [17, 19], [23, 13]];
  const inTri = (x: number, y: number, a: [number, number], b: [number, number], c: [number, number]) => {
    const d = (p1: [number, number], p2: [number, number]) => (x - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (y - p2[1]);
    const d1 = d(a, b);
    const d2 = d(b, c);
    const d3 = d(c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  paint(p, 0, 0, 26, 24, (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    for (let i = 0; i < tips.length - 1; i++) {
      const a = tips[i]!;
      const b = tips[i + 1]!;
      if (!inTri(px, py, W, a, b)) continue;
      // a scallop bitten out of the edge between two finger tips
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      if (i < 3 && Math.hypot(px - mx, py - my) < 2.6) return null;
      return py < W[1] + 4 ? wing.l : i % 2 ? wing.b : wing.d;
    }
    return null;
  });
  for (const t of tips.slice(0, 4)) p.line(W[0], W[1], t[0], t[1], wing.l2);
  p.line(23, 13, W[0], W[1], wing.l2).px(W[0], W[1], '#e8d8b0');
  // the heap of gold
  paint(p, 0, 26, 50, 14, (x, y) => {
    const dx = (x + 0.5 - 25) / 25;
    const dy = (y + 0.5 - 40) / 13;
    if (dx * dx + dy * dy > 1) return null;
    const ring = (x * 3 + y * 5) % 7;
    return ring === 0 ? GOLD.l2 : ring === 3 ? GOLD.d : dx < -0.3 && dy < -0.5 ? GOLD.l : (x + y) % 4 === 0 ? GOLD.l : GOLD.b;
  });
  // the tail curling round the front of the heap
  tube(p, [[14, 30, 3.5], [6, 34, 3], [7, 38, 2.5], [18, 38.5, 2], [27, 37.5, 1.5], [30, 35.5 + lift, 1]], sc, 281);
  p.tpl(29, 32 + lift, ['.#.', '###', '.#.'], { '#': sc.d });
  // the haunch, the body, the belly plates
  lump(p, 10, 19, 15, 13, sc, 0.15, 282, 0.3);
  lump(p, 14, 10, 20, 22, sc, 0.15, 283, 0.3);
  lump(p, 24, 13, 10, 18, belly, 0.1, 284, 0.4);
  for (let y = 16; y < 30; y += 3) p.rect(25, y, 8, 1, belly.d);
  p.rect(19, 30, 6, 2, sc.d).px(19, 32, '#fffaf0').px(21, 32, '#fffaf0').px(23, 32, '#fffaf0');
  // the near arm holding a coin up to admire
  lump(p, 29, 20, 6, 8, sc, 0.1, 285, 0.35);
  p.circle(36, 24, 2.5, GOLD.b).px(35, 23, GOLD.l2).px(36, 24, GOLD.d);
  p.px(34, 25, '#fffaf0').px(34, 23, '#fffaf0');
  // the neck and the head
  tube(p, [[28, 17, 4.5], [32, 12, 4], [34, 9 + lift, 3.5]], sc, 286);
  for (const [x, y] of [[23, 11], [27, 8], [30, 5]] as const) p.tpl(x, y - 2, ['.#', '##'], { '#': GOLD.l });
  lump(p, 31, 3 + lift, 11, 10, sc, 0.15, 287, 0.35);
  lump(p, 38, 6 + lift, 11, 7, sc, 0.1, 288, 0.4);
  p.rect(40, 11 + lift, 8, 1, sc.d2).px(47, 8 + lift, sc.d2).px(46, 8 + lift, sc.d);
  p.px(42, 12 + lift, '#fffaf0').px(45, 12 + lift, '#fffaf0');
  // curling horns and a frill
  p.line(33, 4 + lift, 29, 0, belly.l).line(34, 4 + lift, 30, 0, belly.b).px(28, 1, belly.l);
  p.line(36, 3 + lift, 35, 0, belly.l).px(34, 0, belly.l2);
  // a big pleased eye, half closed with gold in it
  p.rect(38, 6 + lift, 3, 3, K).rect(39, 7 + lift, 2, 1, '#ffd040').px(38, 6 + lift, '#ffffff').rect(37, 5 + lift, 5, 1, sc.d2);
}

// ---------------------------------------------------------------------------
// Havsormens tempel: sea draugs, giant crabs, glowing jellyfish; Bläckis and the Midgård serpent
// ---------------------------------------------------------------------------

const KELP = pal('#14301a', '#1e4a26', '#2e6a34', '#46904a', '#6ab464');
const SEAEYE = '#5af0e0';
const MOSSPAL = pal('#1e3418', '#2e5024', '#457434', '#629848', '#8abc62');

function sjodraug(p: Px, f: number): void {
  // a skeleton from the sea: seaweed hanging off its shoulders and skull, a bronze trident, a starfish for a hat
  const [b, fr] = stride(f, 8, 12);
  bone(p, 10, 17, b, 21);
  bone(p, 11, 17, fr, 21);
  p.rect(b - 1, 22, 3, 1, BONE.b).rect(fr, 22, 3, 1, BONE.l);
  p.rect(9, 15, 5, 2, BONE.b).rect(9, 15, 5, 1, BONE.l);
  p.rect(11, 10, 1, 5, BONE.d);
  for (const y of [10, 12, 14]) p.rect(8, y, 6, 1, BONE.l).px(8, y, BONE.b);
  // seaweed over the shoulders, hanging down and swaying
  for (const [x, len] of [[7, 8], [9, 6], [13, 7]] as const)
    for (let i = 0; i < len; i++) p.px(x + ((i + f) % 3 === 0 ? 1 : 0), 9 + i, i % 2 ? KELP.b : KELP.l);
  // the trident held out in front
  bone(p, 12, 11, 14, 13);
  bone(p, 14, 13, 16, 12);
  p.rect(17, 3, 1, 20, '#8a5a2a').px(17, 3, '#c08a4a');
  p.rect(15, 3, 5, 1, '#c08a4a').rect(15, 0, 1, 3, '#d8a860').rect(17, 0, 1, 3, '#e8c080').rect(19, 0, 1, 3, '#d8a860');
  p.px(15, 0, '#fff0c0').px(17, 0, '#fff6d8').px(19, 0, '#fff0c0').rect(15, 12, 3, 1, '#8a5a2a');
  // the skull with a starfish on top and kelp for hair
  skull(p, 7, 2, 9, 8, SEAEYE);
  for (let i = 0; i < 6; i++) p.px(7 - (i % 2), 3 + i, i % 2 ? KELP.d : KELP.b);
  p.tpl(9, 0, ['.#.', '###', '#.#'], { '#': '#f08a5a' }).px(10, 1, '#ffc0a0');
}

function jattekrabba(p: Px, f: number): void {
  // a giant crab: a round red shell, eyes up on stalks, one big claw held high and snapping, little pointy legs
  const shell = pal('#5a1408', '#9a2a14', '#d8482a', '#f07a4a', '#ffb08a');
  for (let i = 0; i < 4; i++) {
    const x = 5 + i * 3;
    const up = (i + f) % 2;
    p.line(x, 11, x - 2, 14 - up, shell.d).line(x - 2, 14 - up, x - 2, 16, shell.d);
  }
  lump(p, 2, 4, 18, 10, shell, 0.15, 291, 0.3);
  p.rect(5, 12, 12, 1, shell.d);
  for (const x of [6, 10, 14]) p.px(x, 6, shell.l2);
  // eyes on stalks
  p.rect(13, 1, 1, 4, shell.d).rect(16, 1, 1, 4, shell.b);
  p.rect(12, 0, 3, 2, '#fffaf0').px(13, 0, K).px(12, 1, K);
  p.rect(15, 0, 3, 2, '#fffaf0').px(16, 0, K).px(15, 1, K);
  p.rect(13, 9, 4, 1, shell.d2).px(12, 8, shell.d2).px(17, 8, shell.d2);
  // the near legs and the claws: a small one low, a big one up and snapping
  for (let i = 0; i < 3; i++) {
    const x = 7 + i * 4;
    const up = (i + f + 1) % 2;
    p.line(x, 12, x + 2, 14 - up, shell.b).line(x + 2, 14 - up, x + 2, 16, shell.b);
  }
  lump(p, 19, 9, 5, 4, shell, 0.1, 292, 0.4);
  p.line(17, 7, 21, 4, shell.b).line(18, 8, 22, 5, shell.d);
  lump(p, 19, 0, 8, 6, shell, 0.1, 293, 0.4);
  if (f) p.clear(24, 2, 3, 2);
  else p.clear(24, 3, 3, 1);
  p.px(26, 1, shell.l2);
}

function jelly(p: Px, f: number, x0: number, w: number, h: number, a: number): void {
  // a see-through bell with a lighter rim, a sleepy smile, and tentacles that wave
  const bob = f ? 0 : 1;
  const bell = Math.round(h * 0.45);
  const cx = x0 + w / 2;
  for (let y = 0; y < bell; y++)
    for (let x = x0; x < x0 + w; x++) {
      const dx = (x + 0.5 - cx) / (w / 2);
      const dy = (y + 0.5 - bell) / bell;
      if (dx * dx + dy * dy > 1) continue;
      const c = y === bell - 1 ? '#ffd0ff' : dx < -0.4 && dy < -0.3 ? '#ffe8ff' : dx > 0.5 ? '#b064d8' : '#e098f4';
      p.px(x, y + bob, glass(c, a));
    }
  const n = Math.max(3, Math.round(w / 3));
  for (let i = 0; i < n; i++) {
    const tx = x0 + 1.5 + (i * (w - 3)) / (n - 1);
    for (let y = bell; y < h - 1; y++) {
      const sway = Math.round(Math.sin((y - bell) * 0.8 + i + f * 2) * 0.9);
      p.px(tx + sway, y + bob, glass(i % 2 ? '#f0a8ff' : '#c880f0', a * 0.9));
    }
  }
  const es = w >= 14 ? 2 : 1;
  const ey = Math.round(bell * 0.55) + bob;
  p.rect(Math.round(cx) + 1, ey, es, es + (es > 1 ? 0 : 1), '#3a1a4a').rect(Math.round(cx) + 3 + es, ey, es, es + (es > 1 ? 0 : 1), '#3a1a4a');
  p.px(Math.round(cx) + 2, ey + es + 1, '#7a3a8a').px(Math.round(cx) + 3, ey + es + 2, '#7a3a8a').px(Math.round(cx) + 4, ey + es + 1, '#7a3a8a');
}
const manet = (p: Px, f: number) => jelly(p, f, 0, 16, 20, 0.85);
const manetTam = (p: Px, f: number) => jelly(p, f, 0, 12, 15, 0.85);

function blackis(p: Px, f: number): void {
  // Bläckis, the temple octopus: a big round purple head, huge kind eyes, a gold circlet with a pearl, and tentacles
  // that curl (one of them waving)
  const c = pal('#3a0e3a', '#5e1a5a', '#8a2a7e', '#b44aa4', '#e08ad0');
  const sucker = '#f4b8e4';
  // the tentacles, the back ones first
  const arms: [number, number][] = [[6, -1], [12, -1], [18, 1], [24, 1], [29, 1]];
  arms.forEach(([x, dir], i) => {
    const w = (f + i) % 2 ? 1 : -1;
    const pts: [number, number, number][] = [
      [x, 22, 3],
      [x + dir * 1 + w, 27, 2.5],
      [x + dir * 3, 31, 2],
      [x + dir * 6 - w, 33, 1.5],
      [x + dir * 8, 31, 1],
    ];
    tube(p, pts, i % 2 ? pal(c.d2, c.d, c.b, c.l, c.l2) : pal(c.d2, c.d2, c.d, c.b, c.l), 301 + i);
    p.px(x + dir * 3, 33, sucker).px(x + dir * 5, 34, sucker);
  });
  // the head
  lump(p, 2, 2, 30, 24, c, 0.12, 306, 0.3);
  for (const [x, y] of [[8, 7], [12, 5], [6, 13]] as const) p.rect(x, y, 2, 2, c.l).px(x, y, c.l2);
  // the waving arm in front, curling up
  tube(p, [[28, 20, 3], [33, 18, 2.5], [36, 13 - f, 2], [35, 9 - f, 1.6], [32, 9 - f, 1]], c, 307);
  p.px(36, 16, sucker).px(37, 12 - f, sucker);
  // the eyes
  for (const [x, y] of [[17, 11], [24, 12]] as const) {
    p.circle(x + 2.5, y + 2.5, 3, '#fffaf0');
    p.rect(x + 2, y + 1, 3, 3, K).px(x + 2, y + 1, '#ffffff');
  }
  p.rect(21, 20, 4, 1, c.d2).px(20, 19, c.d2).px(25, 19, c.d2);
  p.px(15, 18, '#f4a0d8').px(30, 18, '#f4a0d8');
  // a gold circlet with a pearl
  p.rect(9, 3, 16, 2, GOLD.b).rect(9, 3, 16, 1, GOLD.l).circle(17, 3, 1.6, '#f4f0ff').px(16, 2, '#ffffff');
}

function jormungand(p: Px, f: number): void {
  // Jörmungandr, the Midgård serpent: a long sea-green body lying in two coils, the head reared up high with a golden
  // frill, a big slit eye and a flicking tongue
  const c = pal('#0c3434', '#165652', '#24827a', '#46ae9c', '#8ce0c4');
  const fin = pal('#7a4a08', '#b07a18', '#e8b830', '#ffd860', '#fff2b0');
  const pts: [number, number, number][] = [
    [1, 38, 1],
    [5, 37, 2.2],
  ];
  // the bottom coil: round the back (higher), then the front (lower)
  for (let a = 0; a <= 360; a += 15) {
    const t = (a * Math.PI) / 180;
    pts.push([24 - Math.cos(t) * 17, 34.5 - Math.sin(t) * 4.5, 4.2]);
  }
  // the second coil, smaller, ending at its front-right where the neck rises
  for (let a = 0; a <= 225; a += 15) {
    const t = (a * Math.PI) / 180;
    pts.push([25 - Math.cos(t) * 12, 27.5 - Math.sin(t) * 3.5, 3.9]);
  }
  const sway = f ? 1 : 0;
  pts.push([38, 24, 3.7], [39 + sway, 18, 3.5], [37 + sway, 13, 3.3], [38 + sway, 9, 3.2]);
  // fins along the back of the neck (behind the body)
  for (const [x, y] of [[33, 20], [32, 15], [33, 10]] as const) p.tpl(x + sway, y, ['.##', '###', '.##'], { '#': fin.b });
  tube(p, pts, c, 311);
  // a pale belly along the front of the neck and a few spots on the coils
  for (let y = 11; y < 26; y++) p.px(41 + sway - (y > 20 ? 0 : y < 15 ? 0 : 1), y, y % 2 ? '#c8f0d8' : '#a8e4c4');
  for (const [x, y] of [[12, 33], [20, 37], [30, 37], [36, 33], [18, 26], [28, 29]] as const) p.px(x, y, c.d).px(x + 1, y, c.d);
  // the head, the frill and the face
  paint(p, 32 + sway, 0, 6, 9, (x, y) => (x - 32 - sway + y * 0.6 > 3 && y < 8 ? (y + x) % 2 ? fin.l : fin.b : null));
  lump(p, 34 + sway, 2, 12, 9, c, 0.12, 312, 0.35);
  lump(p, 41 + sway, 4, 9, 6, c, 0.1, 313, 0.4);
  p.rect(43 + sway, 9, 7, 1, c.d2).px(48 + sway, 6, c.d2);
  p.rect(39 + sway, 4, 3, 3, '#ffd040').rect(40 + sway, 4, 1, 3, K).px(39 + sway, 4, '#fff6c8');
  p.rect(38 + sway, 3, 5, 1, c.d2);
  if (f) p.line(50, 9, 51, 9, '#e85a7a').px(51, 8, '#e85a7a').px(51, 10, '#e85a7a');
}

// ---------------------------------------------------------------------------
// Alvernas lund: shadow elves, giant spiders, mushroom guards; the spider queen and the night mare
// ---------------------------------------------------------------------------

const ELFEYE = '#e08aff';

function skuggalv(p: Px, f: number): void {
  // a shadow elf archer: violet-grey skin, long white hair, a pointed ear, a dark cloak, a silver bow, glowing eyes
  const skin = pal('#3e3456', '#5a4e78', '#7a6e9a', '#9a90ba', '#bcb4d8');
  const cloth = pal('#120c1e', '#1e1630', '#2e2248', '#443464', '#5c4a82');
  const [b, fr] = stride(f, 7, 11);
  p.rect(b, 16, 2, 6, cloth.d).rect(fr, 16, 2, 6, cloth.b).rect(b - 1, 22, 3, 1, cloth.d2).rect(fr, 22, 4, 1, cloth.d2);
  // the cloak behind
  paint(p, 3, 8, 8, 13, (x, y) => (x < 4 + (y - 8) * 0.2 || (y === 20 && x % 2 === 0) ? null : x < 6 ? cloth.l : cloth.b));
  // the tunic with a silver belt
  lump(p, 7, 9, 7, 9, cloth, 0.1, 321, 0.3);
  p.rect(7, 14, 7, 1, '#b8c0d8');
  // the bow held out in front, an arrow on the string
  p.line(15, 3, 17, 7, '#d0d8e8').line(17, 7, 17, 14, '#a8b0c8').line(17, 14, 15, 18, '#d0d8e8');
  p.line(15, 3, 13, 11, '#e8e0f0').line(13, 11, 15, 18, '#e8e0f0');
  p.line(11, 11, 18, 11, '#c8b8a0').px(18, 11, '#e8f0ff').px(11, 11, ELFEYE);
  p.rect(11, 11, 3, 2, skin.b);
  // the head: white hair to the shoulders, the ear sticking back, glowing eyes, a sly little smile
  lump(p, 7, 2, 9, 9, skin, 0.1, 322, 0.35);
  paint(p, 4, 1, 13, 13, (x, y) => {
    const dx = (x + 0.5 - 11.5) / 4.8;
    const dy = (y + 0.5 - 6.5) / 4.8;
    const onHead = dx * dx + dy * dy <= 1 && (y <= 2 || x <= 7 || (y === 3 && x <= 13));
    const down = x >= 5 && x <= 9 && y >= 5 && y <= 12 - ((x + 1) % 2) && x >= 6 - (y < 9 ? 1 : 0);
    if (!onHead && !down) return null;
    return y <= 1 && x < 11 ? '#ffffff' : x % 3 === 0 && y > 3 ? '#c4c0d8' : '#e8e6f2';
  });
  p.line(9, 6, 6, 3, skin.b).px(6, 3, skin.l).px(7, 5, skin.l);
  eye(p, 12, 5, 2, ELFEYE);
  p.px(14, 9, skin.d2).px(15, 8, skin.d2);
}

function jattespindel(p: Px, f: number): void {
  // a big furry spider, plum-dark with big round eyes (and a few small ones), a tuft of fur on top
  spider(p, f, 1, { body: pal('#1a0e1e', '#2c1832', '#44264c', '#603868', '#7e528a'), legs: pal('#140a18', '#22142a', '#36203e', '#4a2e54', '#604070') });
  for (const x of [7, 10, 13]) p.px(x, 3, '#7e528a');
}

function svampvakt(p: Px, f: number): void {
  // a walking mushroom on guard: a red cap with white spots, a face on its stem, a twig spear and a wooden shield
  const cap = pal('#5a0e0e', '#981c1c', '#d0342a', '#f0604a', '#ff9a80');
  const stem = pal('#8a7a60', '#b8a888', '#e0d4b8', '#f4ecd8', '#fffaf0');
  const [b, fr] = stride(f, 6, 12, 1);
  p.rect(b, 22, 3, 3, stem.d).rect(fr, 22, 3, 3, stem.b).rect(b - 1, 24, 4, 2, stem.d2).rect(fr, 24, 4, 2, stem.d);
  // the shield on the far side
  p.circle(4, 17, 3.5, WOOD.b).circle(4, 17, 2, WOOD.l).px(4, 17, IRON.l);
  // the stem body with a face
  lump(p, 5, 10, 11, 14, stem, 0.1, 331, 0.3);
  eye(p, 11, 14, 2);
  eye(p, 14, 14, 2);
  p.px(12, 18, stem.d2).px(13, 19, stem.d2).px(14, 18, stem.d2).px(10, 17, '#f0a8a0');
  // the cap
  paint(p, 0, 0, 21, 12, (x, y) => {
    const dx = (x + 0.5 - 10.5) / 10.5;
    const dy = (y + 0.5 - 11) / 10;
    if (dx * dx + dy * dy > 1) return null;
    if (y >= 10) return y === 11 ? '#c8b088' : '#a89068';
    const spot = [[5, 4], [11, 2], [15, 6], [8, 8], [2, 8]].some(([sx, sy]) => Math.hypot(x - sx!, y - sy!) < 1.3);
    if (spot) return '#fff6ec';
    return dx < -0.4 && dy < -0.5 ? cap.l : dx > 0.6 || y > 8 ? cap.d : cap.b;
  });
  // the arm and the spear of a twig with a leaf for a blade
  p.rect(15, 16, 3, 2, stem.l);
  p.rect(18, 6, 1, 19, WOOD.b).rect(18, 6, 1, 1, WOOD.l);
  p.tpl(17, 1, ['.#.', '###', '###', '.#.', '.#.'], { '#': '#5aa040' }).px(17, 2, '#8ad064');
}

function spindeldrottning(p: Px, f: number): void {
  // the spider queen: big and velvet-dark with a glowing heart on her back, eight long legs and a little gold crown
  spider(p, f, 1.75, {
    body: pal('#140a1e', '#22123a', '#361e58', '#4e2e7a', '#6e48a0'),
    legs: pal('#0e0614', '#1a0e26', '#2a183e', '#3c2654', '#56386e'),
    crown: true,
    mark: '#ff7ad8',
  });
}

function nattmara(p: Px, f: number): void {
  // Nattmaran: a mare made of the night sky, deep blue-violet with a mane and tail full of stars and pale glowing eyes
  horse(p, f, 1.45, {
    c: pal('#0a0818', '#141030', '#221c4a', '#342c66', '#4c4488'),
    mane: pal('#1a1a5a', '#2a2a86', '#3e3eb0', '#6a6ad8', '#a8a8ff'),
    hoof: '#08060e',
    glow: '#d8c8ff',
  });
}

// ---------------------------------------------------------------------------
// Fenrisklyftan: grey wolves, rime trolls, mountain giants; Sköll and Fenrisulven
// ---------------------------------------------------------------------------

const WOLF = pal('#2a2c34', '#464a56', '#6a707e', '#9298a6', '#c0c6d2');

function ulv(p: Px, f: number): void {
  // a big grey wolf with a pale belly and amber eyes
  canine(p, f, 1.1, { fur: WOLF, glow: '#ffc040', belly: '#c0c6d2' });
}

function rimtroll(p: Px, f: number): void {
  // a rime troll: lilac-grey skin crusted with frost, ice spikes on its hunched back, an icicle beard, a snowball
  const skin = pal('#323652', '#4c5276', '#6c7498', '#929ab8', '#bcc2da');
  const [b, fr] = stride(f, 6, 14, 2);
  p.rect(b, 21, 4, 5, skin.d).rect(fr, 21, 4, 5, skin.b).rect(b - 1, 25, 6, 3, skin.d2).rect(fr, 25, 6, 3, skin.d);
  lump(p, 1, 12, 7, 11, skin, 0.1, 341, 0.3);
  lump(p, 3, 8, 17, 16, skin, 0.15, 342, 0.3);
  // frost on the back and the shoulders, ice spikes sticking up
  paint(p, 3, 7, 12, 8, (x, y) => (y < 10 + Math.abs(x - 9) * 0.3 && (x * 5 + y) % 4 !== 0 ? (y < 9 ? '#ffffff' : '#dcecf8') : null));
  shard(p, 6, 8, 2, 5, -1, FROST);
  shard(p, 10, 7, 2, 6, 0, FROST);
  shard(p, 14, 8, 2, 4, 1, FROST);
  // the near arm holding a snowball
  lump(p, 15, 13, 6, 9, skin, 0.1, 343, 0.3);
  lump(p, 17, 17, 7, 7, SNOWFUR, 0.15, 344, 0.35);
  // the head, low between the shoulders: a frosty brow, small glowing eyes, a big nose, icicles for a beard
  const face = pal('#3e4466', '#5e668e', '#828cb2', '#a8b0cc', '#d0d6ea');
  lump(p, 11, 5, 11, 10, face, 0.12, 345, 0.35);
  lump(p, 19, 8, 5, 5, face, 0.1, 346, 0.5);
  p.px(21, 9, face.l2);
  p.rect(14, 6, 6, 2, '#e8f4ff').px(14, 6, '#ffffff');
  eye(p, 17, 8, 2);
  p.rect(15, 13, 6, 1, face.d2).px(16, 12, '#fffaf0').px(19, 12, '#fffaf0');
  for (const [x, h] of [[15, 2], [17, 3], [19, 2]] as const) p.rect(x, 14, 1, h, '#e4f6ff').px(x, 14 + h - 1, '#a8d4f0');
}

function bergsjatte(p: Px, f: number): void {
  // a mountain giant (a small one, as giants go): skin like brown stone, a beard of moss, a fur kilt, and a boulder
  // carried on its shoulder
  const skin = pal('#3a3026', '#5a4a3a', '#7e6a54', '#a08a70', '#c4ae92');
  const fur = pal('#2a2018', '#40322a', '#5a4838', '#76604c', '#927a62');
  const stone = pal('#2a2a2e', '#44444a', '#62626a', '#84848c', '#a8a8b0');
  const [b, fr] = stride(f, 8, 17, 2);
  p.rect(b, 27, 5, 6, skin.d).rect(fr, 27, 5, 6, skin.b).rect(b - 1, 32, 7, 4, fur.d).rect(fr, 32, 7, 4, fur.b);
  lump(p, 1, 13, 7, 13, skin, 0.15, 351, 0.3);
  lump(p, 4, 10, 21, 19, skin, 0.15, 352, 0.3);
  paint(p, 5, 23, 19, 6, (x, y) => (y === 28 && x % 2 === 0 ? null : y === 23 ? fur.l : (x + y) % 3 === 0 ? fur.d : fur.b));
  // the boulder on the near shoulder, held up by the near arm
  lump(p, 20, 13, 7, 11, skin, 0.1, 353, 0.3);
  lump(p, 15, 0, 15, 12, stone, 0.3, 354, 0.3);
  p.rect(18, 5, 2, 2, '#4a7a3a').px(25, 3, '#4a7a3a');
  lump(p, 22, 9, 6, 5, skin, 0.1, 355, 0.4);
  // the head: a heavy brow, small eyes, a big nose, a beard of moss
  const face = pal('#4a3e30', '#6e5c48', '#94806a', '#b6a088', '#d6c2a8');
  lump(p, 9, 2, 13, 12, face, 0.15, 356, 0.35);
  lump(p, 19, 7, 5, 5, face, 0.1, 357, 0.5);
  p.rect(13, 5, 7, 2, face.d).px(21, 8, face.l2);
  eye(p, 16, 7, 2);
  for (let i = 0; i < 6; i++) {
    const x = 12 + i * 2;
    const len = 7 - Math.abs(i - 2.5) * 1.6;
    for (let y = 0; y < len; y++) p.px(x + ((y + i + f) % 3 === 0 ? 1 : 0), 12 + y, y === 0 ? MOSSPAL.d : y % 2 ? MOSSPAL.b : MOSSPAL.l);
  }
  p.rect(15, 11, 5, 1, face.d2);
}

function skoll(p: Px, f: number): void {
  // Sköll, who chases the sun: a big golden-orange wolf with a mane like sunbeams (the flames come after the outline)
  canine(p, f, 1.75, {
    fur: pal('#6a3008', '#a85414', '#e08a2a', '#f8b850', '#fff0a8'),
    ruff: pal('#8a3a08', '#c8641a', '#f0a030', '#ffd060', '#fff6c8'),
    glow: '#fff6a0',
    belly: '#ffe6a0',
    fangs: true,
  });
}

function fenrisulven(p: Px, f: number): void {
  // Fenrisulven: the biggest wolf of all, dark grey with a silver ruff, a collar with a broken chain dangling from it
  canine(p, f, 2.2, {
    fur: pal('#14161e', '#22252e', '#363a46', '#50566a', '#72788e'),
    ruff: pal('#2e3240', '#4a5064', '#6e7488', '#9aa0b4', '#c8ccdc'),
    glow: '#ffd040',
    fangs: true,
  });
  // the collar, and the broken chain hanging off it
  p.rect(32, 14, 4, 11, IRON.b).rect(32, 14, 1, 11, IRON.l).px(34, 20, IRON.l2);
  const links: [number, number][] = [[33, 25], [32, 28], [33, 31], [32, 34]];
  links.forEach(([x, y], i) => {
    const sw = f && i > 1 ? 1 : 0;
    if (i % 2) p.rect(x + sw, y, 2, 3, IRON.l).px(x + sw, y + 1, IRON.d2);
    else p.rect(x + sw, y, 3, 2, IRON.b).px(x + 1 + sw, y, IRON.l2).px(x + 1 + sw, y + 1, IRON.d2);
  });
  p.px(31 + (f ? 1 : 0), 36, IRON.l).px(34 + (f ? 1 : 0), 36, IRON.l);
}

// ---------------------------------------------------------------------------
// Bifrost: Loke and his shadow
// ---------------------------------------------------------------------------

function loke(p: Px, f: number): void {
  // Loke the trickster: a green tunic and cloak with gold trim, a gold helmet with two long swept-back horns, red
  // hair, a huge grin and a staff with a green flame (the flame comes after the outline)
  const green = pal('#0c2a14', '#16461e', '#22682c', '#38903e', '#68be62');
  const cape = pal('#081a0e', '#0e2a16', '#163e20', '#22562e', '#347440');
  const skin = pal('#8a5a44', '#c08a6a', '#ecc0a0', '#f8dcc4', '#fff2e4');
  const hair = '#c8461e';
  // the cloak behind him, flapping
  paint(p, 4, 17, 13, 26, (x, y) => {
    const t = (y - 17) / 25;
    const left = 10 - t * 6 - (f ? Math.round(t * 2) : 0);
    if (x < left) return null;
    if (y > 40 && (x + Math.floor(y / 2) + f) % 3 === 0) return null;
    return x < left + 2 ? cape.l : (x + y) % 5 === 0 ? cape.d : cape.b;
  });
  // the legs and the curly-toed boots
  const [b, fr] = stride(f, 13, 19, 2);
  p.rect(b, 33, 4, 9, green.d).rect(fr, 33, 4, 9, green.b).rect(fr, 33, 1, 9, green.l);
  p.rect(b - 1, 42, 6, 3, GOLD.d).rect(fr, 42, 6, 3, GOLD.b).rect(fr, 42, 6, 1, GOLD.l).px(b + 5, 41, GOLD.d).px(fr + 6, 41, GOLD.l);
  // the tunic, a gold-trimmed hem, a belt with a snake buckle
  lump(p, 10, 18, 15, 17, green, 0.1, 361, 0.3);
  p.rect(10, 33, 15, 1, GOLD.l).rect(11, 34, 13, 1, GOLD.b);
  p.rect(10, 27, 15, 2, '#2a1a10').rect(16, 26, 4, 4, GOLD.l).px(17, 27, green.l2).px(18, 28, GOLD.d);
  p.line(13, 19, 21, 26, GOLD.b);
  // the far arm, the near arm and the staff
  lump(p, 7, 19, 5, 11, green, 0.1, 362, 0.3);
  p.rect(28, 9, 2, 36, WOOD.b).rect(28, 9, 1, 36, WOOD.l);
  p.rect(27, 8, 4, 2, GOLD.b).px(27, 8, GOLD.l2);
  lump(p, 22, 19, 6, 10, green, 0.1, 363, 0.3);
  lump(p, 25, 25, 5, 5, skin, 0.05, 364, 0.4);
  // red hair sticking out at the back
  paint(p, 9, 8, 7, 11, (x, y) => (x < 15 - (y - 8) * 0.3 && (x + y) % 4 !== 0 ? (x + y) % 3 ? hair : '#e8682e' : null));
  // the head: a pointy chin with a goatee, a sly eye under an arched brow, the grin
  lump(p, 12, 6, 14, 13, skin, 0.1, 365, 0.35);
  p.rect(22, 17, 3, 2, skin.b).px(24, 19, hair).px(23, 19, hair).px(24, 20, hair);
  p.rect(25, 11, 2, 2, skin.b).px(26, 12, skin.d);
  eye(p, 20, 10, 3);
  p.px(21, 11, '#4ac04a');
  p.line(19, 8, 23, 9, '#7a2a10');
  p.rect(18, 15, 8, 1, K).px(17, 14, K).px(26, 14, K);
  p.rect(19, 16, 6, 1, K);
  for (let x = 19; x < 25; x++) p.px(x, 15, x % 2 ? '#ffffff' : '#e8e4dc');
  p.px(16, 13, '#f0a090');
  // the helmet: a gold cap with a green band, and two long horns sweeping up and back
  paint(p, 11, 2, 16, 8, (x, y) => {
    const dx = (x + 0.5 - 19) / 8;
    const dy = (y + 0.5 - 10) / 7.5;
    if (dx * dx + dy * dy > 1 || y > 8) return null;
    if (y === 8) return GOLD.d;
    if (y === 7) return green.b;
    return dx < -0.3 && dy < -0.5 ? GOLD.l2 : dx > 0.5 ? GOLD.b : GOLD.l;
  });
  tube(p, [[16, 4, 1.3], [13, 2, 1.1], [10, 0.5, 0.8], [7, 0.5, 0.5]], GOLD, 366);
  tube(p, [[21, 3, 1.4], [19, 0.5, 1.1], [16, -0.5, 0.8], [13, -0.5, 0.5]], pal(GOLD.d2, GOLD.d, GOLD.l, GOLD.l2, '#ffffff'), 367);
}

function lokesskugga(p: Px, f: number): void {
  // Loke's shadow: Loke himself, drawn the same way (the colours turn to dusk after the outline)
  loke(p, f);
}

// ---------------------------------------------------------------------------
// Out in the world: wandering draugs, will-o'-wisps, and two world bosses
// ---------------------------------------------------------------------------

function vandrardraug(p: Px, f: number): void {
  // a wandering skeleton in a tattered brown hooded cloak, leaning on a crooked staff, eyes glowing green
  const cloth = pal('#2a1e14', '#40301e', '#5a4430', '#765c44', '#94785c');
  const [b, fr] = stride(f, 8, 12);
  bone(p, 10, 17, b, 22);
  bone(p, 11, 17, fr, 22);
  p.rect(b - 1, 23, 3, 1, BONE.b).rect(fr, 23, 3, 1, BONE.l);
  // the cloak: hood, shoulders and a ragged hem
  paint(p, 3, 1, 13, 19, (x, y) => {
    if (y < 9) return null;
    const left = 6 - (y - 9) * 0.3;
    const right = 14 + (y - 9) * 0.1;
    if (x < left || x > right) return null;
    if (y > 16 && (x + y) % 3 === 0) return null;
    return x < left + 2 ? cloth.l : (x + y) % 6 === 0 ? cloth.d : x > right - 2 ? cloth.d : cloth.b;
  });
  p.rect(10, 13, 4, 1, cloth.d2).px(11, 14, '#c8a040');
  // the staff with a crook, held in a bony hand
  p.rect(16, 3, 1, 21, WOOD.b).px(16, 3, WOOD.l);
  p.line(16, 3, 17, 1, WOOD.b).line(17, 1, 19, 1, WOOD.l).line(19, 1, 19, 3, WOOD.b).px(18, 4, WOOD.d);
  bone(p, 13, 12, 15, 13);
  p.rect(15, 12, 2, 2, BONE.l);
  // the skull in the hood
  skull(p, 8, 3, 8, 7, GHOST);
  paint(p, 5, 0, 11, 11, (x, y) => {
    const dx = (x + 0.5 - 10.5) / 5.5;
    const dy = (y + 0.5 - 5.5) / 5.5;
    if (dx * dx + dy * dy > 1) return null;
    return x > 8 && y > 2 && y < 10 ? null : y < 2 ? cloth.l : x < 8 ? cloth.b : cloth.d;
  });
  p.px(15, 2, cloth.l).px(15, 3, cloth.b);
}

function mosspoke(p: Px, f: number): void {
  // a will-o'-wisp: a round teal ghost with a wisp of a tail, moss and a tiny leaf on its head, big dark eyes
  const bob = f ? 1 : 0;
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 14; x++) {
      const yy = y - bob;
      const head = Math.hypot((x + 0.5 - 7) / 5.5, (yy + 0.5 - 7.5) / 5.5) <= 1;
      const t = (yy - 9) / 8;
      const cx = 6 - (f ? 1 : -1) * t * t * 2.5;
      const tail = yy >= 9 && yy < 17 && Math.abs(x + 0.5 - cx) <= 4.5 - t * 4;
      if (!head && !tail) continue;
      const c = x < 4 && yy < 9 ? '#c8fff0' : yy > 12 ? '#3ab8a0' : x > 9 ? '#4ad0b4' : '#7af0d4';
      p.px(x, y, glass(c, yy > 13 ? 0.6 : 0.88));
    }
  p.rect(3, 2 + bob, 8, 1, MOSSPAL.b).rect(4, 1 + bob, 6, 1, MOSSPAL.l).px(5, 3 + bob, MOSSPAL.d).px(8, 3 + bob, MOSSPAL.d);
  p.px(7, 0 + bob, '#8ad064').px(8, -1 + bob, '#5aa040');
  p.rect(7, 6 + bob, 2, 3, '#0e3a34').px(7, 6 + bob, '#ffffff');
  p.rect(10, 6 + bob, 2, 3, '#0e3a34').px(10, 6 + bob, '#ffffff');
  p.rect(9, 10 + bob, 2, 1, '#2a8070');
}

function bergatroll(p: Px, f: number): void {
  // Bergatrollet: a troll like a mossy boulder on two stumpy legs, little arms, a huge nose, tiny eyes under a
  // rocky brow, moss, a flower and a mushroom growing on top
  const rock = pal('#2a2a2a', '#444442', '#646460', '#86867e', '#aaa8a0');
  const [b, fr] = stride(f, 8, 19, 2);
  lump(p, b, 28, 7, 8, rock, 0.3, 371);
  lump(p, fr, 28, 7, 8, rock, 0.3, 372);
  lump(p, 0, 15, 7, 11, rock, 0.3, 373, 0.3);
  lump(p, 1, 4, 29, 27, rock, 0.3, 374, 0.3);
  // moss on the top and a bit down the back
  paint(p, 1, 3, 29, 14, (x, y) => {
    const dx = (x + 0.5 - 15.5) / 14.5;
    const dy = (y + 0.5 - 17.5) / 13.5;
    if (dx * dx + dy * dy > 1) return null;
    const edge = 9 + Math.round(Math.sin(x * 1.3) * 1.5) + (x < 8 ? 4 : 0);
    if (y > edge) return null;
    return y < 6 || (x + y) % 5 === 0 ? MOSSPAL.l : (x * 3 + y) % 4 === 0 ? MOSSPAL.d : MOSSPAL.b;
  });
  // a flower and a mushroom
  p.rect(9, 1, 1, 3, MOSSPAL.d).tpl(8, 0, ['.#.', '#o#', '.#.'], { '#': '#f080b0', o: '#ffe060' });
  p.rect(18, 2, 1, 2, '#f0e8d8').rect(17, 1, 3, 1, '#d8402a').px(17, 1, '#ff8a70');
  // the near arm
  lump(p, 23, 17, 8, 10, rock, 0.25, 375, 0.3);
  // the face: a rocky brow, tiny eyes, a big round nose, a mouth with two little tusks
  lump(p, 18, 11, 11, 4, rock, 0.2, 376, 0.4);
  eye(p, 22, 14, 2);
  eye(p, 26, 14, 2);
  lump(p, 25, 15, 9, 7, rock, 0.15, 377, 0.5);
  p.px(28, 17, rock.l2);
  p.rect(21, 23, 8, 1, rock.d2).px(22, 22, '#fffaf0').px(27, 22, '#fffaf0');
}

function kustjatte(p: Px, f: number): void {
  // Kustjätten: a sea-green giant with a long beard of seaweed, a belt of rope with a shell, a little crab sitting
  // on his head and a club of driftwood
  const skin = pal('#1a3640', '#2a5662', '#427e86', '#66a6a8', '#98ccc8');
  const sail = pal('#4a4232', '#6a604a', '#8e8466', '#b0a686', '#d0c8aa');
  const drift = pal('#4a443c', '#6e665a', '#948a7a', '#b6ae9c', '#d6d0c0');
  const [b, fr] = stride(f, 12, 22, 2);
  p.rect(b, 36, 6, 8, skin.d).rect(fr, 36, 6, 8, skin.b).rect(fr, 36, 2, 8, skin.l);
  p.rect(b - 1, 44, 8, 4, skin.d2).rect(fr, 44, 8, 4, skin.d);
  // the far arm, the body, a kilt of old sailcloth, a rope belt with a shell
  lump(p, 3, 18, 8, 17, skin, 0.15, 381, 0.3);
  lump(p, 6, 15, 26, 23, skin, 0.15, 382, 0.3);
  paint(p, 8, 31, 23, 7, (x, y) => (y === 37 && x % 3 === 0 ? null : y === 31 ? sail.l : (x + y) % 4 === 0 ? sail.d : sail.b));
  p.rect(8, 30, 23, 2, '#a88a5a').px(10, 30, '#d8b880').px(16, 31, '#d8b880').px(22, 30, '#d8b880');
  p.tpl(18, 29, ['.##.', '####', '.##.'], { '#': '#f4d8c8' }).px(19, 30, '#e8a890');
  // the driftwood club over the near shoulder
  lump(p, 26, 16, 9, 15, skin, 0.15, 383, 0.3);
  tube(p, [[30, 28, 1.6], [33, 18, 2.2], [35, 9, 3], [36, 3, 3.4]], drift, 384);
  p.px(34, 12, drift.d2).px(36, 6, drift.d2).px(33, 4, drift.l2);
  lump(p, 28, 25, 7, 7, skin, 0.1, 385, 0.35);
  // the head, the beard of seaweed swaying, a nose, kind eyes, a crab on top
  lump(p, 12, 4, 17, 15, skin, 0.15, 386, 0.35);
  lump(p, 25, 9, 6, 6, skin, 0.1, 387, 0.5);
  for (let i = 0; i < 7; i++) {
    const x = 15 + i * 2;
    const len = 12 - Math.abs(i - 3) * 2;
    for (let y = 0; y < len; y++) p.px(x + ((y + f + i) % 4 === 0 ? 1 : 0), 14 + y, y % 3 === 0 ? KELP.l : i % 2 ? KELP.b : KELP.d);
  }
  for (let y = 4; y < 14; y++) p.px(11 + (y % 2), y, KELP.b).px(12, y, KELP.d);
  eye(p, 21, 8, 3);
  p.rect(20, 6, 5, 1, skin.d);
  p.tpl(15, 0, ['#.....#', '.#####.', '#######', '.#.#.#.'], { '#': '#e05a2a' }).px(17, 1, K).px(20, 1, K).px(16, 2, '#ff8a5a');
}

// ---------------------------------------------------------------------------
// Pets and mounts from Lokes list
// ---------------------------------------------------------------------------

function pup(p: Px, f: number, fur: Pal, glow: string | undefined, collar: string): void {
  // a puppy with huge paws and a big head (Garm's whelp and the wolf cub)
  p.line(0, 4, 2, 7, fur.b).line(0, 3, 2, 6, fur.l);
  const [b, fr] = stride(f, 3, 9, 1);
  p.rect(b, 10, 3, 3, fur.d).rect(fr, 10, 3, 3, fur.b);
  p.rect(b - 1, 12, 4, 3, fur.b).rect(fr, 12, 4, 3, fur.l).px(fr + 1, 14, fur.d).px(fr + 2, 14, fur.d);
  lump(p, 2, 5, 9, 7, fur, 0.2, 391, 0.3);
  lump(p, 7, 1, 9, 9, fur, 0.15, 392, 0.35);
  p.rect(8, 0, 2, 3, fur.b).px(9, 1, '#e8a8b0').rect(12, 0, 2, 2, fur.d);
  p.rect(13, 5, 3, 3, fur.l2).px(15, 5, K);
  eye(p, 11, 3, 2, glow);
  p.rect(7, 9, 5, 1, collar);
}

function garmvalp(p: Px, f: number): void {
  // Garm's whelp: a sooty pup with green eyes and a tiny collar of bone beads
  pup(p, f, pal('#120e16', '#221c28', '#362e3e', '#504658', '#706478'), HELGREEN, BONE.b);
  p.px(8, 9, BONE.l2).px(10, 9, BONE.l2);
}

function ulvvalp(p: Px, f: number): void {
  // a silver-grey wolf cub with a white chest and a blue scarf
  pup(p, f, pal('#4a505e', '#6e7686', '#98a0ae', '#c0c6d0', '#e6eaf0'), undefined, '#3a7ad8');
  p.px(8, 10, '#3a7ad8').px(8, 11, '#2a5aa8').px(13, 8, '#ffffff');
}

function alvljusFe(p: Px, f: number): void {
  // a fairy light: a little glowing ball with a face and two see-through wings that flutter
  const up = f ? 0 : 1;
  p.px(2, 2 + up, glass('#e8f4ff', 0.75)).rect(1, 3 + up, 3, 2, glass('#d8ecff', 0.7)).rect(2, 5 + up, 2, 1, glass('#c8e0ff', 0.6));
  p.px(f ? 1 : 0, 4 + up, glass('#ffffff', 0.6));
  p.circle(5.5, 6.5 + up, 3.3, '#fff2a8').circle(5, 6 + up, 2, '#fffbe0').px(4, 5 + up, '#ffffff');
  p.px(6, 6 + up, '#7a5a1a').px(8, 6 + up, '#7a5a1a').px(7, 8 + up, '#d88a4a');
}

function havshast(p: Px, f: number): void {
  // a water horse: sea-blue scales, a fin for a mane, little fins at its fetlocks, a fish tail, and a coral saddle
  const c = pal('#0e2a46', '#18486a', '#287094', '#4a9cbc', '#8ad0e4');
  const fin = pal('#1a6a6a', '#2a9a94', '#4acab8', '#8aecd4', '#d0fff0');
  horse(p, f, 1.05, { c, mane: fin, tail: 'fin', hoof: '#0a2034', oy: 1 });
  // the fish tail
  tube(p, [[5, 13, 2.5], [2, 17, 1.8], [2, 20, 1.2]], c, 401);
  p.tpl(0, 20 + (f ? 1 : 0), ['#..#', '####', '.##.'], { '#': fin.b }).px(0, 20 + (f ? 1 : 0), fin.l);
  // fins on the legs
  for (const x of [5, 24]) p.px(x - 1, 23, fin.l).px(x - 2, 24, fin.b).px(x - 1, 24, fin.b);
  // the fin crest along the neck
  for (let i = 0; i < 9; i++) p.rect(20 - Math.round(i * 0.4), 2 + i, 1, 1, fin.l2);
  // a few scales catching the light
  for (const [x, y] of [[9, 12], [13, 14], [18, 12], [11, 17]] as const) p.px(x, y, c.l2);
  saddle(p, 11, 9, 10, '#e86a6a', '#f4e0c8', '#c84a5a');
  p.px(14, 13, '#f8f0ff');
}

function jattehjort(p: Px, f: number): void {
  // a great stag with antlers that glow pale blue, a white throat and a mossy saddle cloth
  const c = pal('#3a2414', '#5e3c22', '#86603a', '#a88458', '#cab084');
  horse(p, f, 1.08, { c, mane: c, tail: 'short', deer: true, hoof: '#2a1a10', oy: 8 });
  // the antlers: two branching sets, the far one darker
  const ant = (dx: number, col: string, tip: string) => {
    p.line(24 + dx, 9, 22 + dx, 4, col).line(22 + dx, 4, 20 + dx, 0, col).line(22 + dx, 4, 25 + dx, 1, col).line(21 + dx, 6, 17 + dx, 3, col);
    p.line(23 + dx, 2, 22 + dx, 0, col);
    p.px(20 + dx, 0, tip).px(25 + dx, 1, tip).px(17 + dx, 3, tip).px(22 + dx, 0, tip);
  };
  ant(-2, '#7aa8c8', '#c8ecff');
  ant(1, '#b8e8ff', '#ffffff');
  saddle(p, 12, 17, 11, '#3e6a2e', '#c8a040', '#5a3a20');
}

function fenrisulvRidbar(p: Px, f: number): void {
  // a tame grey wolf big enough to ride: soft eyes, a blue saddle cloth, a ribbon round its neck
  canine(p, f, 1.4, { fur: pal('#3a3e48', '#5a606e', '#808898', '#a8b0be', '#d4d8e2'), belly: '#d4d8e2' });
  saddle(p, 12, 6, 11, '#2e4a9a', GOLD.b);
  p.rect(20, 10, 2, 6, '#e8c040').px(21, 16, '#e8c040');
}

function lokeshast(p: Px, f: number): void {
  // Loke's foal, Sleipner's cousin: dark as smoke, eight legs, a bright green mane and tail, a green-and-gold saddle
  horse(p, f, 1, {
    c: pal('#0e0c14', '#1c1826', '#2e2a3c', '#443e56', '#5e5874'),
    mane: pal('#0e4a1a', '#1a7a2a', '#2eaa3e', '#5ad860', '#a8ff9a'),
    legs8: true,
    hoof: '#c8a040',
  });
  saddle(p, 9, 8, 10, '#1e6a2a', GOLD.l);
  p.px(24, 4, '#7aff6a');
}

function spindelnat(p: Px, f: number): void {
  // a web that holds a friend (the player stands behind it, like the ice block): a silk cocoon in their shape, bound
  // with sticky bands, and a wheel of threads anchored to the corners, with a dewdrop that glints
  const silk = (c: string, a: number) => glass(c, a);
  // the cocoon: a head and a body, soft and see-through so the friend shows through
  for (let y = 3; y < 27; y++)
    for (let x = 3; x < 19; x++) {
      const head = Math.hypot((x + 0.5 - 11) / 4.2, (y + 0.5 - 8) / 4.2) <= 1;
      const body = Math.hypot((x + 0.5 - 11) / 6.2, (y + 0.5 - 19) / 8) <= 1;
      if (!head && !body) continue;
      const edge = x < 6 || (head && y < 6);
      p.px(x, y, silk(edge ? '#ffffff' : x > 15 ? '#c8c4d8' : '#eeeaf6', edge ? 0.55 : 0.32));
    }
  // the bands wrapped round it
  for (const y0 of [6, 11, 15, 19, 23]) p.line(4, y0 + 2, 18, y0, silk('#ffffff', 0.85));
  for (const y0 of [9, 17]) p.line(5, y0, 17, y0 + 3, silk('#e8e4f4', 0.7));
  // the wheel of threads round it, out to the corners and the ground
  const cx = 11;
  const cy = 14;
  for (const [x, y] of [[0, 0], [11, 0], [21, 0], [0, 14], [21, 14], [0, 27], [7, 27], [15, 27], [21, 27]] as const) p.line(cx, cy, x, y, silk('#f4f2ff', 0.5));
  for (const r of [5, 9, 13]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push([Math.round(cx + Math.cos(a) * r * 0.8), Math.round(cy + Math.sin(a) * r)]);
    }
    for (let i = 0; i < 8; i++) p.line(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], silk('#f4f2ff', 0.42));
  }
  twinkle(p, f ? 5 : 16, f ? 9 : 5, '#e8f8ff');
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
  // Lokes list
  gengangare: (p, f) => {
    const bob = f ? 1 : 0;
    p.rect(15, 18 + bob, 2, 2, '#7aff6a').px(16, 17 + bob, '#e8ffd8');
    halo(p, 16, 18 + bob, 6, '#9cff8a', 0.22);
  },
  helhund: (p) => halo(p, 18, 6, 5, '#7aff6a', 0.12),
  gruvtroll: (p, f) => {
    halo(p, 18, 2, 6, '#fff0a0', f ? 0.3 : 0.24);
    p.px(18, 2, '#ffffff');
  },
  guldbagge: (p, f) => twinkle(p, f ? 4 : 8, f ? 4 : 3, '#fff6c0'),
  guldbagge_tam: (p, f) => twinkle(p, f ? 3 : 9, f ? 5 : 4, '#fff6c0'),
  stengolem: (p, f) => halo(p, 14, 10, 9, '#6ad8ff', f ? 0.14 : 0.1),
  jarnvakten: (p, f) => {
    halo(p, 17, 24, 10, '#ff8a3a', f ? 0.2 : 0.15);
    // puffs of steam from the shoulders
    for (const [x, y] of [[3, 9 - f * 2], [5 + f, 6 - f * 2], [33, 10 - f]] as const) p.circle(x, y, f ? 1.6 : 1.2, glass('#ffffff', 0.5));
  },
  fafner: (p, f) => {
    twinkle(p, f ? 8 : 40, f ? 31 : 33, '#fff6c0');
    twinkle(p, f ? 44 : 14, f ? 36 : 35, '#fff6c0');
    // a lazy puff of smoke from the nostril
    p.circle(50 - (f ? 1 : 2), 5 - f * 2, 1.5, glass('#d8d0c8', 0.6)).px(48, 7, glass('#e8e0d8', 0.6));
  },
  manet: (p, f) => halo(p, 8, 6 + (f ? 0 : 1), 9, '#f0a0ff', 0.22),
  manet_tam: (p, f) => halo(p, 6, 4 + (f ? 0 : 1), 7, '#f0a0ff', 0.22),
  blackis: (p, f) => twinkle(p, 17, f ? 2 : 3, '#ffffff', '#ffffff'),
  spindeldrottning: (p, f) => {
    halo(p, 18, 12, 7, '#ff7ad8', f ? 0.2 : 0.14);
    twinkle(p, f ? 28 : 36, 5, '#fff6c0');
  },
  nattmara: (p, f) => {
    // stars in the mane and the tail
    const stars: [number, number][] = [[29, 4], [28, 9], [27, 13], [26, 7], [4, 18], [3, 24], [5, 29], [2, 21]];
    stars.forEach(([x, y], i) => (i % 2 === f ? twinkle(p, x, y, '#c8c8ff') : p.px(x, y, '#ffffff')));
    halo(p, 35, 6, 7, '#b8a8ff', 0.14);
  },
  skoll: (p, f) => {
    for (const [x, y, h] of [[24, 9, 5], [28, 7, 6], [20, 10, 4], [3, 3, 4]] as const) flame(p, x, y, 3, h + (f ? 1 : 0), f ? -1 : 0.5, '#e8801a', '#ffc040', '#fff6c8');
    halo(p, 26, 12, 12, '#ffd060', 0.14);
  },
  hel: (p, f) => halo(p, 28, 7, 6, '#9cff8a', f ? 0.22 : 0.16),
  loke: (p, f) => {
    flame(p, 29, 8, 4, f ? 7 : 6, f ? 1 : -1, '#1aa83a', '#5ae05a', '#d8ffb0');
    halo(p, 29, 5, 7, '#7aff6a', 0.2);
    // a trickster's sparkle in every colour of Bifrost
    const RAINBOW = ['#ff6a6a', '#ffb84a', '#fff06a', '#6aff8a', '#6ac8ff', '#c88aff'];
    for (let i = 0; i < 3; i++) twinkle(p, [4, 31, 2][i]!, [10, 30, 30][i]! + (f ? -1 : 0), RAINBOW[(i * 2 + f) % 6]!);
  },
  lokesskugga: (p, f) => {
    shadowify(p);
    p.rect(20, 10, 3, 3, '#7aff6a').px(22, 10, '#e8ffd8');
    flame(p, 29, 8, 4, f ? 7 : 6, f ? 1 : -1, '#3a1a6a', '#7a4ad8', '#c8a8ff');
    halo(p, 17, 24, 18, '#5a3a9a', 0.12);
  },
  mosspoke: (p, f) => {
    halo(p, 7, 8 + (f ? 1 : 0), 9, '#5af0d0', 0.24);
    twinkle(p, f ? 12 : 2, f ? 3 : 12, '#c8fff0');
  },
  alvljus_fe: (p, f) => {
    halo(p, 5.5, 6.5 + (f ? 0 : 1), 6, '#fff2a8', f ? 0.4 : 0.32);
    p.px(f ? 9 : 1, f ? 2 : 10, '#fff6c8');
  },
  jattehjort: (p, f) => {
    halo(p, 21, 4, 9, '#a8e8ff', f ? 0.22 : 0.16);
    twinkle(p, f ? 21 : 26, f ? 0 : 1, '#e8faff');
  },
  lokeshast: (p, f) => p.px(f ? 19 : 20, f ? 3 : 6, '#c8ffb0'),
  spindelnat,
};

// The illusions on Bifrost: Loke conjures beaten foes again, pale and see-through (variant 1).
const ILLUSION_TINT = '#bfe0ff';
for (const s of ['skelett', 'isvarg', 'eldhund', 'gengangare']) {
  const own = AFTER[s];
  AFTER[s] = (p, f, v) => {
    own?.(p, f, v);
    if (v === 1) ghostify(p, ILLUSION_TINT);
  };
}

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
  // Lokes list: the dungeons' monsters
  gengangare: { w: 18, h: 23 },
  helhund: { w: 25, h: 20 },
  benspindel: { w: 28, h: 16 },
  gruvtroll: { w: 23, h: 26 },
  guldbagge: { w: 16, h: 12 },
  stengolem: { w: 24, h: 28 },
  sjodraug: { w: 20, h: 23 },
  jattekrabba: { w: 27, h: 17 },
  manet: { w: 16, h: 21 },
  skuggalv: { w: 19, h: 24 },
  jattespindel: { w: 28, h: 16 },
  svampvakt: { w: 21, h: 26 },
  ulv: { w: 27, h: 18 },
  rimtroll: { w: 25, h: 28 },
  bergsjatte: { w: 30, h: 36 },
  spindelnat: { w: 22, h: 28 },
  // their bosses
  garm: { w: 44, h: 30 },
  hel: { w: 34, h: 46 },
  jarnvakten: { w: 37, h: 42 },
  fafner: { w: 52, h: 40 },
  blackis: { w: 40, h: 36 },
  jormungand: { w: 52, h: 42 },
  spindeldrottning: { w: 50, h: 29 },
  nattmara: { w: 46, h: 40 },
  skoll: { w: 43, h: 29 },
  fenrisulven: { w: 54, h: 37 },
  lokesskugga: { w: 33, h: 46 },
  loke: { w: 33, h: 46 },
  // out in the world
  vandrardraug: { w: 20, h: 24 },
  mosspoke: { w: 14, h: 18 },
  bergatroll: { w: 34, h: 36 },
  kustjatte: { w: 38, h: 48 },
  // pets and mounts
  garmvalp: { w: 16, h: 15 },
  ulvvalp: { w: 16, h: 15 },
  guldbagge_tam: { w: 16, h: 12 },
  manet_tam: { w: 12, h: 15 },
  alvljus_fe: { w: 10, h: 12 },
  havshast: { w: 33, h: 30 },
  jattehjort: { w: 34, h: 38 },
  fenrisulv_ridbar: { w: 35, h: 24 },
  lokeshast: { w: 31, h: 28 },
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
  gengangare,
  helhund,
  benspindel,
  gruvtroll,
  guldbagge,
  stengolem,
  sjodraug,
  jattekrabba,
  manet,
  skuggalv,
  jattespindel,
  svampvakt,
  ulv,
  rimtroll,
  bergsjatte,
  // the web is all see-through threads, drawn after the outline
  spindelnat: () => {},
  garm,
  hel,
  jarnvakten,
  fafner,
  blackis,
  jormungand,
  spindeldrottning,
  nattmara,
  skoll,
  fenrisulven,
  lokesskugga,
  loke,
  vandrardraug,
  mosspoke,
  bergatroll,
  kustjatte,
  garmvalp,
  ulvvalp,
  guldbagge_tam: guldbaggeTam,
  manet_tam: manetTam,
  alvljus_fe: alvljusFe,
  havshast,
  jattehjort,
  fenrisulv_ridbar: fenrisulvRidbar,
  lokeshast,
};
export const SAGA_AFTER = AFTER;

/**
 * Colour variants the saga's creatures have (variant 0 is the default). The illusions on Bifrost are variant 1 of
 * the monsters Loke copies: pale and see-through.
 */
export const SAGA_VARIANTS: Record<string, number> = { skelett: 2, isvarg: 2, eldhund: 2, gengangare: 2 };

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
  gengangare: [8, 2],
  helhund: [18, 3],
  benspindel: [18, 4],
  gruvtroll: [12, 0],
  guldbagge: [12, 4],
  stengolem: [12, 0],
  sjodraug: [11, 1],
  jattekrabba: [10, 4],
  manet: [8, 1],
  skuggalv: [11, 1],
  jattespindel: [18, 5],
  svampvakt: [10, 0],
  ulv: [20, 1],
  rimtroll: [16, 6],
  bergsjatte: [15, 3],
  garm: [33, 1],
  hel: [19, 1],
  jarnvakten: [18, 0],
  fafner: [36, 3],
  blackis: [17, 3],
  jormungand: [40, 2],
  spindeldrottning: [32, 5],
  nattmara: [33, 2],
  skoll: [32, 1],
  fenrisulven: [40, 1],
  lokesskugga: [19, 3],
  loke: [19, 3],
  vandrardraug: [10, 0],
  mosspoke: [7, 1],
  bergatroll: [16, 3],
  kustjatte: [20, 4],
  garmvalp: [11, 0],
  ulvvalp: [11, 0],
  guldbagge_tam: [12, 4],
  manet_tam: [6, 1],
  alvljus_fe: [5, 3],
  havshast: [26, 2],
  jattehjort: [25, 10],
  fenrisulv_ridbar: [26, 1],
  lokeshast: [24, 0],
};

/** Outlines for the creatures of ice, mist and silk, which a dark brown edge would make heavy. */
export const SAGA_OUTLINE: Record<string, string> = {
  isande: '#3a6a96',
  isblock: '#3a6a96',
  gengangare: '#4a4a66',
  manet: '#6a3a8a',
  manet_tam: '#6a3a8a',
  mosspoke: '#1e6a5a',
  alvljus_fe: '#9a7a2a',
  lokesskugga: '#0a0614',
};

/** How high a rider sits on the dungeons' mounts (the horse: 7). */
export const SAGA_RIDE_LIFT: Record<string, number> = { sleipner: 8, gullinbursti: 5, havshast: 10, jattehjort: 10, fenrisulv_ridbar: 7, lokeshast: 9 };
