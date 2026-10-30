// Animals: side view facing right (flip for left), 2 walk frames, adult + baby, optional tomteluva.
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';

export const ANIMAL_SIZE: Record<string, { w: number; h: number }> = {
  hen: { w: 16, h: 16 },
  rabbit: { w: 16, h: 14 },
  sheep: { w: 18, h: 16 },
  cow: { w: 24, h: 18 },
  pig: { w: 18, h: 14 },
  horse: { w: 26, h: 24 },
  car: { w: 24, h: 14 },
  motorcycle: { w: 16, h: 12 },
  dog: { w: 16, h: 14 },
  cat: { w: 14, h: 12 },
  fox: { w: 18, h: 12 },
  deer: { w: 18, h: 18 },
  penguin: { w: 12, h: 14 },
  crab: { w: 14, h: 10 },
  goat: { w: 16, h: 14 },
  lizard: { w: 16, h: 8 },
  hare: { w: 14, h: 14 },
  boar: { w: 18, h: 12 },
  moose: { w: 28, h: 26 },
  bear: { w: 24, h: 20 },
  wolf: { w: 20, h: 14 },
  lynx: { w: 18, h: 13 },
  bus: { w: 40, h: 16 },
  train: { w: 48, h: 16 },
  slime: { w: 14, h: 12 },
  bat: { w: 16, h: 10 },
  troll: { w: 18, h: 22 },
  boss: { w: 28, h: 32 },
  // the wider world
  frog: { w: 14, h: 12 },
  parrot: { w: 16, h: 15 },
  monkey: { w: 16, h: 16 },
  salamander: { w: 18, h: 8 },
  hedgehog: { w: 14, h: 10 },
  dino: { w: 20, h: 18 },
  gummy: { w: 12, h: 12 },
  alien: { w: 14, h: 17 },
  dragon: { w: 22, h: 18 },
};

function hen(p: Px, f: number): void {
  p.ellipse(3, 5, 10, 8, '#f4ead8').rect(10, 3, 4, 5, '#f4ead8').rect(11, 2, 2, 1, '#d8363a').px(14, 5, '#f5a623').px(13, 4, OUTLINE);
  p.rect(4, 6, 5, 3, shade('#f4ead8', 0.85));
  p.rect(1, 6, 3, 2, '#d8a070').rect(2, 5, 1, 1, '#d8a070');
  p.rect(6 + f, 13, 1, 2, '#f5a623').rect(9 - f, 13, 1, 2, '#f5a623').rect(5 + f, 15, 2, 1, '#f5a623').rect(8 - f, 15, 2, 1, '#f5a623');
  p.px(11, 8, '#d8363a');
}
function rabbit(p: Px, f: number): void {
  const c = '#e9e2d9';
  p.ellipse(2, 6, 11, 7, c).circle(12, 7, 3, c).rect(10, 0, 2, 5, c).rect(13, 1, 2, 4, c).px(11, 1, '#ffb0c8').px(14, 2, '#ffb0c8');
  p.px(13, 6, OUTLINE).px(15, 8, '#ffb0c8');
  p.rect(3 + f, 12, 3, 2, c).rect(9 - f, 12, 3, 2, c).circle(2, 8, 1.5, '#ffffff');
}
function sheep(p: Px, f: number): void {
  const w = '#f7f3ee';
  p.ellipse(1, 3, 14, 10, w).ellipse(3, 1, 10, 7, w).ellipse(0, 6, 6, 6, w);
  p.rect(12, 6, 5, 5, '#3a3129').rect(13, 5, 3, 1, '#3a3129').px(15, 7, '#ffffff').px(14, 10, shade('#3a3129', 1.3));
  p.rect(3 + f, 13, 2, 3, '#3a3129').rect(7, 13, 2, 3, '#3a3129').rect(11 - f, 13, 2, 3, '#3a3129');
}
function cow(p: Px, f: number): void {
  const c = '#f4f0ea';
  p.rect(2, 4, 16, 9, c).ellipse(1, 3, 18, 10, c);
  p.rect(16, 3, 7, 8, c).rect(18, 10, 5, 3, '#f0b8a8').rect(15, 1, 2, 2, '#e0c8a0').rect(21, 1, 2, 2, '#e0c8a0');
  p.px(19, 5, OUTLINE).px(22, 5, OUTLINE).px(19, 11, shade('#f0b8a8', 0.7)).px(21, 11, shade('#f0b8a8', 0.7));
  p.ellipse(4, 5, 6, 5, '#3a3129').ellipse(10, 8, 5, 4, '#3a3129');
  p.rect(3 + f, 13, 3, 5, c).rect(8, 13, 3, 5, c).rect(13 - f, 13, 3, 5, c).rect(3 + f, 17, 3, 1, '#3a3129').rect(8, 17, 3, 1, '#3a3129').rect(13 - f, 17, 3, 1, '#3a3129');
  p.rect(0, 5, 2, 6, c).px(0, 11, '#3a3129');
  p.rect(2, 10, 3, 2, '#f0b8a8');
}

function pig(p: Px, f: number): void {
  // side view facing right: round pink body, snout, floppy ear and a curly tail
  const c = '#f2b8c6';
  const d = shade(c, 0.8);
  p.ellipse(1, 3, 14, 9, c).rect(3, 5, 11, 6, c);
  p.ellipse(10, 2, 8, 8, c); // head
  p.rect(16, 5, 2, 3, '#e8899e').px(16, 6, d).px(17, 6, d); // snout with nostrils
  p.rect(11, 1, 2, 3, d).px(12, 0, d); // ear
  p.px(14, 4, OUTLINE); // eye
  p.px(0, 4, d).px(1, 3, d).px(0, 2, d); // curly tail
  p.rect(3 + f, 11, 2, 3, d).rect(7, 11, 2, 3, d).rect(12 - f, 11, 2, 3, d); // trotters
  p.rect(5, 8, 4, 2, shade(c, 0.9)); // belly shadow
}

function horse(p: Px, f: number): void {
  // side view facing right: chestnut body, dark mane and tail, white blaze
  const c = '#9a5a2c';
  const d = shade(c, 0.75);
  const mane = '#3a2414';
  p.ellipse(3, 8, 17, 10, c).rect(4, 9, 15, 8, c);
  // neck + head
  p.rect(16, 3, 5, 9, c).rect(19, 1, 6, 6, c).rect(22, 6, 4, 3, c).rect(23, 7, 2, 1, shade(c, 0.9));
  p.rect(20, 0, 2, 2, d).rect(23, 0, 1, 2, d); // ears
  p.rect(15, 2, 2, 8, mane).rect(17, 1, 3, 2, mane).rect(18, 3, 1, 2, mane); // mane
  p.rect(21, 2, 1, 4, '#f4ead8'); // blaze
  p.px(22, 3, OUTLINE).px(25, 8, shade(c, 0.6));
  // tail
  p.rect(1, 7, 2, 9, mane).rect(0, 10, 2, 6, mane).px(2, 6, mane);
  // belly shade
  p.rect(6, 14, 11, 3, d);
  // legs (alternate with frame)
  p.rect(5 + f, 17, 3, 6, c).rect(9, 17, 3, 6, d).rect(13, 17, 3, 6, c).rect(17 - f, 17, 3, 6, d);
  p.rect(5 + f, 22, 3, 2, mane).rect(9, 22, 3, 2, mane).rect(13, 22, 3, 2, mane).rect(17 - f, 22, 3, 2, mane);
}

function dog(p: Px, f: number): void {
  const c = '#c8924a';
  const d = shade(c, 0.75);
  p.ellipse(1, 4, 11, 7, c).rect(10, 2, 5, 6, c).rect(12, 1, 3, 2, d).rect(9, 1, 2, 4, d).px(13, 4, OUTLINE).px(15, 6, OUTLINE);
  p.rect(0, 2, 2, 4, d).px(1, 1, d); // tail
  p.rect(2 + f, 10, 2, 4, c).rect(5, 10, 2, 4, d).rect(8, 10, 2, 4, c).rect(10 - f, 10, 2, 4, d);
  p.rect(4, 7, 4, 3, '#f0e0c0');
}
function cat(p: Px, f: number): void {
  const c = '#7a7a7a';
  const d = shade(c, 0.7);
  p.ellipse(1, 4, 10, 6, c).rect(9, 2, 5, 5, c).rect(9, 0, 2, 2, c).rect(12, 0, 2, 2, c).px(11, 3, '#9ad04a').px(13, 3, '#9ad04a').px(12, 5, '#ffb0c8');
  p.rect(0, 1, 2, 2, c).rect(0, 2, 1, 4, c); // tail up
  p.rect(2 + f, 9, 2, 3, d).rect(5, 9, 2, 3, c).rect(8 - f, 9, 2, 3, d).rect(10, 9, 2, 3, c);
  for (let x = 3; x < 9; x += 2) p.rect(x, 5, 1, 2, d);
}

function slime(p: Px, f: number): void {
  const c = '#6ad04a';
  p.ellipse(1, 2 + f, 12, 10 - f, c).ellipse(3, 3 + f, 8, 4, '#9af07a');
  p.rect(4, 6 + f, 2, 2, OUTLINE).rect(8, 6 + f, 2, 2, OUTLINE).rect(6, 9 + f, 2, 1, shade(c, 0.6));
}
function bat(p: Px, f: number): void {
  const c = '#5a4a7a';
  p.ellipse(5, 2, 6, 7, c).rect(5, 0, 2, 2, c).rect(9, 0, 2, 2, c);
  if (f === 0) p.rect(0, 3, 5, 3, c).rect(11, 3, 5, 3, c).px(0, 2, c).px(15, 2, c);
  else p.rect(1, 5, 4, 3, c).rect(11, 5, 4, 3, c).px(1, 8, c).px(14, 8, c);
  p.px(6, 4, '#ffe14a').px(9, 4, '#ffe14a');
}
function troll(p: Px, f: number): void {
  const c = '#7a9a4a';
  const d = shade(c, 0.75);
  p.ellipse(3, 0, 12, 10, c).rect(4, 9, 10, 8, c).rect(4, 9, 10, 1, d);
  p.rect(5, 3, 2, 2, OUTLINE).rect(10, 3, 2, 2, OUTLINE).rect(7, 7, 4, 1, d).px(7, 6, '#ffffff').px(10, 6, '#ffffff');
  p.rect(2, 10, 2, 6, c).rect(14, 10, 2, 6, c);
  p.rect(5, 17, 3, 5 - f, d).rect(10, 17 + f, 3, 5 - f, d);
  p.rect(15, 4, 3, 9, '#8a5a2a').rect(14, 2, 4, 3, '#6f4a26'); // club
  p.rect(6, 0, 6, 2, '#3a2a1a');
}
function boss(p: Px, f: number): void {
  const c = '#6a8a3a';
  const d = shade(c, 0.75);
  p.ellipse(5, 0, 18, 14, c).rect(5, 13, 18, 12, c).rect(5, 13, 18, 1, d);
  p.rect(9, 4, 3, 3, OUTLINE).rect(16, 4, 3, 3, OUTLINE).px(10, 5, '#ff4a4a').px(17, 5, '#ff4a4a');
  p.rect(10, 9, 8, 2, d).rect(11, 9, 2, 2, '#ffffff').rect(15, 9, 2, 2, '#ffffff');
  p.rect(1, 14, 4, 9, c).rect(23, 14, 4, 9, c);
  p.rect(7, 25, 5, 7 - f, d).rect(16, 25 + f, 5, 7 - f, d);
  p.rect(24, 2, 4, 14, '#8a5a2a').rect(22, 0, 6, 4, '#6f4a26');
  p.rect(8, 0, 12, 2, '#3a2a1a').rect(10, 2, 2, 1, '#f2d35a').rect(16, 2, 2, 1, '#f2d35a'); // crown bits
}

function fox(p: Px, f: number): void {
  const c = '#e07a2a';
  p.ellipse(3, 3, 11, 7, c).rect(12, 2, 5, 5, c).rect(12, 0, 2, 2, c).rect(15, 0, 2, 2, c).px(16, 5, OUTLINE).rect(13, 7, 4, 1, '#f7f0e0');
  p.rect(0, 2, 4, 4, c).rect(0, 2, 2, 2, '#f7f0e0'); // tail tip
  p.rect(4 + f, 9, 2, 3, '#3a2a1a').rect(10 - f, 9, 2, 3, '#3a2a1a').rect(7, 9, 2, 3, c);
}
function deer(p: Px, f: number): void {
  const c = '#b07a44';
  p.ellipse(2, 6, 12, 7, c).rect(11, 2, 5, 6, c).rect(12, 0, 1, 3, '#6f4a26').rect(14, 0, 1, 3, '#6f4a26').px(15, 4, OUTLINE).px(16, 7, '#3a2a1a');
  p.rect(5, 8, 2, 1, '#f7f0e0').rect(8, 7, 2, 1, '#f7f0e0');
  p.rect(3 + f, 13, 2, 5, c).rect(7, 13, 2, 5, c).rect(11 - f, 13, 2, 5, c);
}
function penguin(p: Px, f: number): void {
  p.ellipse(1, 2, 10, 11, '#1b1a2a').ellipse(3, 5, 6, 7, '#f7f7f7').rect(4, 3, 2, 2, '#ffffff').rect(7, 4, 2, 1, '#f5a623');
  p.rect(0, 5, 2, 5, '#1b1a2a').rect(10, 5, 2, 5, '#1b1a2a');
  p.rect(3 + f, 13, 3, 1, '#f5a623').rect(7 - f, 13, 3, 1, '#f5a623');
}
function crab(p: Px, f: number): void {
  const c = '#e04a3a';
  p.ellipse(2, 3, 10, 6, c).px(4, 4, OUTLINE).px(8, 4, OUTLINE).rect(0, 2, 3, 3, c).rect(11, 2, 3, 3, c).px(0, 1, c).px(13, 1, c);
  p.rect(1 + f, 8, 2, 2, c).rect(5, 8, 2, 2, c).rect(9 - f, 8, 2, 2, c);
}
function goat(p: Px, f: number): void {
  const c = '#d9d4c8';
  p.ellipse(2, 4, 11, 7, c).rect(11, 1, 5, 6, c).rect(11, 0, 1, 2, '#8a5a2a').rect(14, 0, 1, 2, '#8a5a2a').px(15, 3, OUTLINE).rect(13, 7, 2, 2, '#bbb');
  p.rect(3 + f, 10, 2, 4, '#6f6c66').rect(9 - f, 10, 2, 4, '#6f6c66');
}
function lizard(p: Px, f: number): void {
  const c = '#8fbf4a';
  p.rect(0, 4, 6, 2, shade(c, 0.8)).ellipse(5, 2, 8, 6, c).rect(12, 3, 4, 3, c).px(14, 4, OUTLINE);
  p.rect(5 + f, 7, 2, 1, c).rect(10 - f, 7, 2, 1, c).rect(7, 1, 1, 1, shade(c, 0.7));
}

function hare(p: Px, f: number): void {
  // brown hare with long ears, mid-hop on frame 1
  const c = '#b58a55';
  const d = shade(c, 0.75);
  p.ellipse(1, 6 - f, 10, 6, c).circle(10, 6 - f, 3, c).rect(9, 0, 2, 5, c).rect(12, 0, 2, 5, c).px(10, 1, '#ffb0c8').px(13, 1, '#ffb0c8');
  p.px(11, 5 - f, OUTLINE).px(13, 7 - f, '#3a2a1a').rect(2, 9 - f, 3, 2, '#f7f0e0');
  p.rect(2, 11, 4, 2, d).rect(8 - f, 11, 3, 2, d).px(0, 7 - f, '#ffffff');
}
function boar(p: Px, f: number): void {
  // dark grey wild boar with a bristly back and small tusks
  const c = '#5a4a3e';
  const d = shade(c, 0.7);
  p.ellipse(1, 3, 13, 7, c).rect(2, 1, 9, 2, d).rect(12, 3, 5, 5, c).rect(13, 2, 2, 2, d).px(15, 5, OUTLINE).rect(16, 7, 1, 1, '#f4ead8').px(17, 6, '#f4ead8');
  p.rect(0, 3, 2, 2, d);
  p.rect(3 + f, 9, 2, 3, d).rect(7, 9, 2, 3, d).rect(11 - f, 9, 2, 3, d);
}
function moose(p: Px, f: number): void {
  // tall dark moose with broad antlers and a dewlap
  const c = '#5e4030';
  const d = shade(c, 0.75);
  const antler = '#c9b58a';
  p.rect(4, 10, 16, 9, c).ellipse(3, 8, 18, 10, c).rect(16, 6, 7, 8, c).rect(19, 11, 6, 5, d).rect(22, 13, 3, 2, shade(c, 0.6));
  p.rect(17, 14, 2, 3, d); // dewlap
  p.px(21, 8, OUTLINE).px(24, 14, '#2a1a10');
  // antlers
  p.rect(16, 2, 1, 5, antler).rect(13, 1, 4, 2, antler).rect(12, 0, 1, 2, antler).rect(14, 0, 1, 1, antler).rect(16, 0, 1, 1, antler);
  p.rect(21, 2, 1, 5, antler).rect(21, 1, 4, 2, antler).rect(25, 0, 1, 2, antler).rect(23, 0, 1, 1, antler);
  p.rect(5 + f, 19, 3, 7, d).rect(10, 19, 3, 7, c).rect(14 - f, 19, 3, 7, c);
  p.rect(2, 8, 3, 4, d); // tail stub
}
function bear(p: Px, f: number): void {
  // big round brown bear with a lighter muzzle
  const c = '#6b4a2e';
  const d = shade(c, 0.75);
  const l = '#a07a52';
  p.ellipse(1, 3, 17, 13, c).circle(18, 7, 5, c).circle(15, 3, 2, d).circle(21, 3, 2, d).rect(19, 7, 5, 4, l).px(23, 8, OUTLINE).px(19, 5, OUTLINE).px(21, 5, OUTLINE);
  p.rect(2, 7, 4, 5, d);
  p.rect(3 + f, 15, 4, 5, d).rect(8, 15, 4, 5, c).rect(13 - f, 15, 4, 5, d);
}
function wolf(p: Px, f: number): void {
  // grey wolf with a pale belly and pointed ears
  const c = '#8a8f96';
  const d = shade(c, 0.72);
  p.ellipse(2, 3, 13, 7, c).rect(13, 2, 6, 5, c).rect(13, 0, 2, 3, d).rect(16, 0, 2, 3, d).rect(17, 5, 3, 2, d).px(17, 3, OUTLINE).px(19, 6, '#2a2a2a');
  p.rect(0, 1, 3, 3, d).px(0, 0, d); // bushy tail up
  p.rect(5, 8, 6, 2, '#d9dde2');
  p.rect(3 + f, 10, 2, 4, d).rect(7, 10, 2, 4, c).rect(11 - f, 10, 2, 4, d);
}
function lynx(p: Px, f: number): void {
  // sandy spotted lynx with ear tufts and a short tail
  const c = '#c9a46a';
  const d = shade(c, 0.72);
  p.ellipse(1, 3, 12, 7, c).rect(11, 1, 6, 6, c).rect(12, 0, 1, 2, '#2a2a2a').rect(16, 0, 1, 2, '#2a2a2a').px(15, 3, OUTLINE).rect(13, 5, 4, 2, '#f4ead8');
  p.px(3, 5, d).px(6, 4, d).px(8, 6, d).px(5, 7, d).rect(0, 4, 2, 2, '#2a2a2a');
  p.rect(2 + f, 9, 2, 4, d).rect(6, 9, 2, 4, c).rect(10 - f, 9, 2, 4, d);
}

// ---- the wider world ----

function frog(p: Px, f: number): void {
  // bright green frog seen from the front (it reads best that way): two big eyes on top and a wide smile.
  // Frame 0 squats, frame 1 is mid-hop with the legs stretched out.
  const c = '#78c841';
  const pal = { G: c, H: shade(c, 1.25), D: shade(c, 0.74), L: '#eef5b0', W: '#ffffff', K: OUTLINE, M: shade(c, 0.45) };
  const sit = [
    '..............',
    '..............',
    '..GGG....GGG..',
    '.GWWKG..GWWKG.',
    '.GWWKGGGGWWKG.',
    '.GHGGGGGGGGGG.',
    '.GGMGGGGGGMGG.',
    '.DGGMMMMMMGGD.',
    'DDDGLLLLLLGDDD',
    'DDDGGLLLLGGDDD',
    'DDDDGGGGGGDDDD',
    'DDD..GG.GG.DDD',
  ];
  const hop = [
    '..............',
    '..GGG....GGG..',
    '.GWWKG..GWWKG.',
    '.GWWKGGGGWWKG.',
    '.GHGGGGGGGGGG.',
    '.GGMGGGGGGMGG.',
    '..GGMMMMMMGG..',
    '..DGLLLLLLGD..',
    '..DDGLLLLGDD..',
    '..DD.G..G.DD..',
    '..DD......DD..',
    '.DDD......DDD.',
  ];
  p.tpl(0, 0, f ? hop : sit, pal);
}

/** Macaws: scarlet (red with a yellow and blue wing), blue-and-yellow, and great green. */
const PARROT_COLORS = [
  { body: '#e0362a', belly: '#e0362a', wing: '#f5c23a', flight: '#3b6fd9', tail: '#d8303a', crown: '#e0362a', beak: '#ecdcb4' },
  { body: '#3b8fe0', belly: '#f5c23a', wing: '#2f72c4', flight: '#22509a', tail: '#3b8fe0', crown: '#5ac85a', beak: '#4a4542' },
  { body: '#4fae3a', belly: '#4fae3a', wing: '#3d9230', flight: '#3b6fd9', tail: '#e0662a', crown: '#e0362a', beak: '#5a5450' },
];
function parrot(p: Px, f: number, v = 0): void {
  // macaw walking on the ground: long tail, big hooked beak, white face; the head bobs with each step
  const k = PARROT_COLORS[v % PARROT_COLORS.length]!;
  p.line(0, 14, 6, 9, k.tail).line(1, 14, 7, 9, k.tail).line(0, 13, 5, 9, shade(k.tail, 0.8)).px(0, 14, k.flight).px(1, 14, k.flight); // tail
  p.ellipse(4, 5, 9, 9, k.body); // body
  p.ellipse(8, 7, 5, 6, k.belly);
  p.ellipse(4, 6, 7, 6, k.wing).rect(3, 9, 4, 3, k.flight).px(7, 7, shade(k.wing, 1.25)); // folded wing
  const head = [
    '..CCC...',
    '.GGGGG..',
    'GGGWWBB.',
    'GGWKWBBB',
    'GGGWWbBb',
    '.GGGWbb.',
    '..GG..b.',
  ];
  p.tpl(8, 1 + f, head, { C: k.crown, G: k.body, W: '#f7f3ee', K: OUTLINE, B: k.beak, b: '#2a2624' });
  p.rect(8 + f, 13, 1, 2, '#8a8a90').rect(10 - f, 13, 1, 2, '#8a8a90').px(9 + f, 14, '#8a8a90').px(11 - f, 14, '#8a8a90'); // feet
}

function monkey(p: Px, f: number): void {
  // brown monkey walking upright: a big round head with a pale face and ear, long arms, and a tail curling up behind
  const c = '#8a5a2e';
  const d = shade(c, 0.75);
  const face = '#f0c896';
  p.tpl(0, 1, ['.TTT.', 'T...T', 'T.TT.', 'T.T..', 'T....', 'T....', 'T....', '.T...', '.T...', '.T...', '..T..', '..TTT'], { T: c }); // tail
  p.rect(5 + f, 12, 2, 4, d).rect(9 - f, 12, 2, 4, d).rect(5 + f, 15, 3, 1, d).rect(9 - f, 15, 3, 1, d); // legs
  p.ellipse(4, 8, 8, 6, c).ellipse(7, 9, 4, 4, face); // body, belly
  p.line(10, 9, 11 - f, 12, d).line(9, 9, 10 - f, 12, d).rect(10 - f, 12, 2, 1, face); // arm and hand
  p.ellipse(5, 1, 9, 8, c); // head
  p.ellipse(3, 3, 4, 4, c).rect(4, 4, 1, 2, face); // ear
  p.ellipse(9, 3, 6, 5, face).ellipse(10, 5, 5, 3, face).rect(9, 3, 2, 1, c); // face and muzzle
  p.rect(11, 4, 1, 2, OUTLINE); // eye
  p.px(14, 6, shade(face, 0.6)).line(12, 7, 13, 7, shade(face, 0.5)); // nostril, smile
}

function salamander(p: Px, f: number): void {
  // glossy black fire salamander: yellow and orange blotches, a broad head with a shiny eye and a little smile
  const c = '#3a3344';
  const sh = '#625a76';
  const Y = '#f5c82a';
  const O = '#f0862a';
  p.rect(0, 5, 2, 1, c).rect(1, 4, 3, 2, c).rect(2, 3, 3, 3, c); // tail tapering to the left
  p.ellipse(3, 2, 11, 5, c); // body
  p.ellipse(11, 1, 6, 6, c).rect(14, 4, 3, 2, c); // broad head
  for (const [x, o] of [[5, f], [11, 1 - f]] as const) p.rect(x + o, 6, 1, 2, c).px(x + o - 1, 7, c).px(x + o + 1, 7, c); // splayed legs
  p.rect(5, 2, 5, 1, sh).rect(12, 1, 2, 1, sh); // shine
  p.rect(12, 2, 2, 1, Y).px(13, 3, Y); // yellow patch behind the eye
  p.rect(4, 4, 2, 1, O).rect(6, 3, 2, 1, Y).px(7, 2, Y).rect(8, 5, 2, 1, O).rect(10, 3, 2, 1, Y).px(11, 5, O).px(2, 4, Y); // blotches
  p.rect(14, 2, 2, 2, '#0c0a0e').px(14, 2, '#ffffff'); // eye
  p.px(15, 5, '#8a829a').px(16, 4, '#8a829a'); // smile
}

function hedgehog(p: Px, f: number): void {
  // round hedgehog: a dome of brown spines with light tips, a pointy cream face and a black button nose
  const s = '#6a4a30';
  const m = '#8a6442';
  const tip = '#dcc29a';
  const face = '#e6c89a';
  p.ellipse(0, 2, 11, 8, s); // spines
  for (const [x, y] of [[1, 2], [3, 1], [4, 0], [6, 1], [7, 0], [9, 1], [0, 4], [0, 7]] as const) p.px(x, y, s); // spikes poking out
  for (const [x, y] of [[2, 3], [5, 2], [8, 3], [1, 6], [4, 5], [7, 5], [3, 8], [6, 7]] as const) p.px(x, y, tip).px(x + 1, y + 1, m);
  p.ellipse(8, 4, 5, 5, face).rect(10, 6, 3, 2, face).px(13, 6, OUTLINE); // face, snout, nose
  p.px(10, 5, OUTLINE).px(9, 4, '#e8a8a0'); // eye, ear
  p.rect(4, 9, 5, 1, face); // belly
  p.rect(3 + f, 9, 2, 1, '#5a3a24').rect(8 - f, 9, 2, 1, '#5a3a24'); // feet
}

/** Dinos: green with orange spikes, orange with yellow, purple with pink. */
const DINO_COLORS = [
  { body: '#5fb84a', belly: '#e2f0a0', spike: '#f08a2a' },
  { body: '#f08a2a', belly: '#fde2a8', spike: '#f5d03a' },
  { body: '#9a6ad8', belly: '#f0dcf8', spike: '#f07ab0' },
];
function dino(p: Px, f: number, v = 0): void {
  // small friendly dinosaur on two chunky legs: big head, smile, round belly and spikes down the back
  const k = DINO_COLORS[v % DINO_COLORS.length]!;
  const c = k.body;
  const d = shade(c, 0.75);
  p.line(0, 12, 6, 9, c).line(0, 11, 6, 8, c).rect(3, 9, 5, 4, c); // tail
  p.ellipse(4, 6, 11, 10, c); // body
  p.ellipse(7, 9, 7, 6, k.belly);
  p.ellipse(10, 1, 9, 8, c).rect(14, 4, 5, 4, c); // head and snout
  for (const [x, y] of [[2, 10], [5, 8], [7, 6], [10, 3], [12, 1]] as const) p.px(x, y, k.spike).px(x + 1, y, k.spike).px(x, y - 1, k.spike); // spikes
  p.rect(14, 3, 2, 2, OUTLINE).px(14, 3, '#ffffff'); // eye
  p.line(15, 6, 17, 6, d).px(18, 5, d); // smile
  p.px(17, 3, d); // nostril
  p.px(13, 6, shade(c, 1.35)).px(14, 6, shade(c, 1.35)); // cheek
  p.rect(13, 10, 2, 1, d).px(14, 11, d); // little arm
  p.rect(7 + f, 14, 3, 4, d).rect(11 - f, 14, 3, 4, c); // legs
}

/** Gummy bears: red, yellow, green, orange. */
const GUMMY_COLORS = ['#e8343a', '#f5c62a', '#58c83a', '#f5822a'];
const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function gummy(p: Px, f: number, v = 0): void {
  // translucent gummy bear seen from the front: a glowing core, a shine, and it squishes down on frame 1
  const c = GUMMY_COLORS[v % GUMMY_COLORS.length]!;
  const pal = { B: rgba(c, 0.8), R: rgba(shade(c, 0.8), 0.9), C: rgba(shade(c, 1.4), 0.9), H: 'rgba(255,255,255,0.85)', E: shade(c, 0.45), M: shade(c, 0.55) };
  const stand = [
    '............',
    '..BB....BB..',
    '.BBBBBBBBBB.',
    '.BHBBBBBBBB.',
    '.BBBBEBBEBB.',
    '.BBBBBBMBBB.',
    '..BBBBBBBB..',
    '.BBBCCCCBBB.',
    '.BBCCHCCCBB.',
    '..BBCCCCBB..',
    '..RBB..BBR..',
    '..RRR..RRR..',
  ];
  const squish = [
    '............',
    '............',
    '..BB....BB..',
    '.BBBBBBBBBB.',
    '.BHBBEBBEBB.',
    '.BBBBBBMBBB.',
    'BBBBBBBBBBBB',
    'BBBCCCCCCBBB',
    '.BBCHCCCCBB.',
    '.BBBCCCCBBB.',
    '.RBBB..BBBR.',
    '.RRRR..RRRR.',
  ];
  p.tpl(0, 0, f ? squish : stand, pal);
}

function alien(p: Px, f: number): void {
  // cute little green alien from the front: a big bulb head, huge shiny black eyes, antennae with glowing tips
  const c = '#8ee06a';
  const pal = { G: c, D: shade(c, 0.72), L: shade(c, 1.3), S: shade(c, 0.6), Y: '#f5e04a', K: '#14121a', W: '#ffffff', M: shade(c, 0.5) };
  const top = [
    '..............',
    '.YY.......YY..',
    '.YY.......YY..',
    '...S......S...',
    '...GGGGGGGG...',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    '.GKKWGGGGKKWG.',
    '.GKKKKGGKKKKG.',
    '.GGKKKGGKKKGG.',
    '..GGGGGGGGGG..',
    '...GGGMMGGG...',
    '....GGGGGG....',
    '..DGGLLLLGGD..',
    '..D.GLLLLG.D..',
  ];
  p.tpl(0, 0, top, pal);
  p.tpl(0, 15, f ? ['...DD....DD...', '...DD....DD...'] : ['....DD..DD....', '....DD..DD....'], pal); // legs
}

function dragon(p: Px, f: number): void {
  // small purple pet dragon: curved horns, cream belly, spade tail; the little bat wings flap between the frames
  const c = '#9a5ad8';
  const d = shade(c, 0.72);
  const belly = '#f5d890';
  const wingPal = { B: d, P: '#e89ad8' };
  if (f === 0)
    p.tpl(4, 0, ['......BB..', '.....BPB..', '....BPPB..', '...BPPPB..', '..BPPPPB..', '.BPPPPPB..', 'BPPPPPPB..', '.P.PP.PBB.', '.......BB.'], wingPal); // wing raised
  else p.tpl(0, 5, ['..........BB', '.......BBBPB', '....BBBPPPPB', '.BBBPPPPPPB.', '..PPPPPPPB..', '...P.PP.P...'], wingPal); // wing swept back
  p.line(1, 9, 5, 12, c).line(1, 10, 5, 13, c).tpl(0, 5, ['.S.', 'SSS', 'SSS', '.S.'], { S: c }); // tail with a spade tip
  p.ellipse(5, 8, 11, 7, c).rect(13, 8, 3, 3, c); // body, neck
  p.ellipse(8, 11, 7, 4, belly).rect(9, 12, 5, 1, shade(belly, 0.85)); // striped belly
  p.ellipse(13, 3, 7, 7, c).rect(18, 6, 3, 3, c); // head and snout
  p.rect(13, 2, 2, 1, '#f4ead8').px(13, 1, '#f4ead8').rect(16, 2, 2, 1, '#f4ead8').px(16, 1, '#f4ead8'); // little horns
  p.rect(16, 4, 2, 2, OUTLINE).px(16, 4, '#ffffff'); // eye
  p.px(20, 7, d).line(17, 8, 19, 8, d).px(15, 7, '#e89ad8'); // nostril, smile, cheek
  p.rect(6 + f, 14, 2, 4, d).rect(8, 14, 2, 4, c).rect(11, 14, 2, 4, d).rect(13 - f, 14, 2, 4, c); // legs
}

/** City traffic: drawn with a colour variant and never with a tomteluva. */
export const VEHICLE_SPECIES = new Set(['car', 'motorcycle', 'bus', 'train']);
export const VEHICLE_VARIANTS = 3;
/** Colour variants per species (vehicles and some wild animals); variant 0 is the default. */
export const ANIMAL_VARIANTS: Record<string, number> = {
  ...Object.fromEntries([...VEHICLE_SPECIES].map((s) => [s, VEHICLE_VARIANTS])),
  parrot: PARROT_COLORS.length,
  dino: DINO_COLORS.length,
  gummy: GUMMY_COLORS.length,
};
const CAR_COLORS = ['#d9453b', '#3b6fd9', '#f0c030'];
const MOTO_COLORS = ['#d9453b', '#f08a2a', '#2f7a3a'];
const wheel = (p: Px, cx: number, cy: number, r: number, f: number) => {
  p.circle(cx, cy, r, '#2a2a2a').circle(cx, cy, Math.max(1, r - 1.5), '#8a8a90');
  p.px(cx + (f ? 1 : 0), cy - (f ? 0 : 1), '#2a2a2a');
};
function car(p: Px, f: number, v = 0): void {
  const c = CAR_COLORS[v % CAR_COLORS.length]!;
  p.rect(1, 6, 22, 6, c).rect(5, 2, 13, 5, c).rect(1, 6, 22, 1, shade(c, 1.25)).rect(1, 11, 22, 1, shade(c, 0.75));
  p.rect(7, 3, 4, 3, '#bfeaff').rect(12, 3, 5, 3, '#bfeaff');
  p.rect(22, 7, 1, 2, '#fff1a0').rect(1, 7, 1, 2, '#e0362a'); // headlight, taillight
  wheel(p, 6, 11, 2.5, f);
  wheel(p, 18, 11, 2.5, f);
}
function motorcycle(p: Px, f: number, v = 0): void {
  // small moped facing right (the driver is the player sprite on top): two wheels, a seat, handlebar and a headlamp
  const c = MOTO_COLORS[v % MOTO_COLORS.length]!;
  const d = shade(c, 0.7);
  p.rect(3, 5, 10, 3, c).rect(4, 4, 6, 1, d); // frame + seat
  p.rect(11, 2, 1, 4, '#3a3a3a').rect(10, 2, 3, 1, '#3a3a3a'); // handlebar
  p.rect(13, 4, 2, 2, '#fff1a0'); // headlamp
  p.rect(1, 8, 2, 1, d).rect(13, 7, 1, 1, d);
  wheel(p, 3, 9, 2.5, f);
  wheel(p, 13, 9, 2.5, f);
}
function bus(p: Px, f: number): void {
  const c = '#f2c230';
  p.rect(1, 1, 38, 12, c).rect(1, 1, 38, 1, shade(c, 1.2)).rect(1, 8, 38, 2, '#3b6fd9').rect(1, 12, 38, 1, shade(c, 0.75));
  for (let i = 0; i < 6; i++) p.rect(3 + i * 6, 3, 4, 4, '#bfeaff');
  p.rect(33, 8, 4, 5, '#2a2a2a').rect(34, 9, 2, 4, '#bfeaff'); // door
  p.rect(38, 9, 1, 2, '#fff1a0').rect(1, 9, 1, 2, '#e0362a');
  wheel(p, 8, 13, 2.5, f);
  wheel(p, 30, 13, 2.5, f);
}
function train(p: Px, f: number): void {
  const c = '#2f5fb8';
  // engine (right) and one wagon (left)
  p.rect(0, 3, 22, 10, c).rect(23, 2, 25, 11, c).rect(0, 3, 22, 1, shade(c, 1.25)).rect(23, 2, 25, 1, shade(c, 1.25));
  p.rect(0, 12, 48, 1, shade(c, 0.7));
  for (let i = 0; i < 4; i++) p.rect(2 + i * 5, 5, 3, 4, '#bfeaff');
  for (let i = 0; i < 3; i++) p.rect(25 + i * 5, 4, 3, 4, '#bfeaff');
  p.rect(43, 4, 4, 6, '#f2c230').rect(46, 6, 2, 2, '#fff1a0'); // yellow nose + headlight
  p.rect(0, 7, 1, 2, '#e0362a');
  p.rect(22, 5, 1, 7, '#2a2a2a'); // coupling
  wheel(p, 5, 13, 2.5, f);
  wheel(p, 17, 13, 2.5, f);
  wheel(p, 28, 13, 2.5, f);
  wheel(p, 42, 13, 2.5, f);
}

const DRAW: Record<string, (p: Px, f: number, v?: number) => void> = {
  car,
  motorcycle,
  bus,
  train, hen, rabbit, sheep, cow, pig, horse, dog, cat, fox, deer, penguin, crab, goat, lizard, hare, boar, moose, bear, wolf, lynx, slime, bat, troll, boss,
  frog, parrot, monkey, salamander, hedgehog, dino, gummy, alien, dragon };

/** Head position (x of head centre, top y) for the tomteluva per species. */
const HAT_POS: Record<string, [number, number]> = { hen: [12, 1], rabbit: [12, -1], sheep: [14, 4], cow: [19, 0], pig: [14, -1], horse: [22, -1], dog: [12, 1], cat: [11, 0], fox: [14, 0], deer: [13, 0], penguin: [6, 0], goat: [13, 0], hare: [11, -1], boar: [14, 1], moose: [19, 0], bear: [18, 1], wolf: [16, 0], lynx: [14, 0],
  frog: [7, 1], parrot: [12, 1], monkey: [10, 1], salamander: [14, 0], hedgehog: [6, 0], dino: [14, 1], gummy: [6, 0], alien: [7, 3], dragon: [16, 2] };

export function drawAnimal(species: string, frame: number, baby: boolean, jul: boolean, variant = 0): Px {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const full = new Px(size.w, size.h);
  DRAW[species]?.(full, frame, variant);
  if (jul && !VEHICLE_SPECIES.has(species)) {
    const [hx, hy] = HAT_POS[species] ?? [8, 0];
    full.rect(hx - 3, hy + 1, 6, 1, '#ffffff').rect(hx - 2, hy - 1, 4, 2, '#d8363a').rect(hx - 1, hy - 3, 2, 2, '#d8363a').px(hx + 1, hy - 3, '#ffffff');
  }
  full.outline(OUTLINE);
  if (!baby) return full;
  // baby: 2/3 scale, drawn bottom-aligned in a same-sized canvas
  const bw = Math.round(size.w * 0.66);
  const bh = Math.round(size.h * 0.66);
  const p = new Px(size.w, size.h);
  p.blitScaled(full, Math.round((size.w - bw) / 2), size.h - bh, bw, bh);
  return p;
}

export function animalSheet(species: string, baby: boolean, jul: boolean, variant = 0): HTMLCanvasElement {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const sheet = new Px(size.w * 2, size.h);
  sheet.blit(drawAnimal(species, 0, baby, jul, variant), 0, 0).blit(drawAnimal(species, 1, baby, jul, variant), size.w, 0);
  return sheet.canvas;
}

export const animalKey = (species: string, baby: boolean, jul: boolean, variant = 0): string =>
  `animal-${species}-${baby ? 'baby' : 'adult'}${jul ? '-jul' : ''}${variant ? `-v${variant}` : ''}`;
