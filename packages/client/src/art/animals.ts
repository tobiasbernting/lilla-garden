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
  slime: { w: 14, h: 12 },
  bat: { w: 16, h: 10 },
  troll: { w: 18, h: 22 },
  boss: { w: 28, h: 32 },
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

/** Colour variants per species (vehicles only); variant 0 is the default. */
export const ANIMAL_VARIANTS: Record<string, number> = { car: 3 };
const CAR_COLORS = ['#d9453b', '#3b6fd9', '#f0c030'];

function car(p: Px, f: number, variant = 0): void {
  // side view facing right: rounded body, cabin with windows, two wheels that turn with the frame
  const c = CAR_COLORS[variant % CAR_COLORS.length]!;
  const d = shade(c, 0.7);
  const l = shade(c, 1.25);
  p.rect(1, 6, 22, 5, c).rect(2, 5, 20, 1, c).rect(1, 10, 22, 1, d);
  p.rect(6, 2, 11, 4, c).rect(7, 1, 9, 1, c); // cabin
  p.rect(8, 2, 3, 3, '#bfeaff').rect(12, 2, 4, 3, '#bfeaff').rect(8, 2, 3, 1, '#ffffff'); // windows
  p.rect(2, 6, 20, 1, l); // highlight line
  p.rect(22, 7, 1, 2, '#fff1a0').rect(1, 7, 1, 2, '#ff5a3a'); // head/tail lights
  p.rect(16, 7, 2, 1, d); // door handle
  // wheels
  for (const wx of [4, 16]) {
    p.rect(wx, 9, 5, 5, '#2a2a2a').rect(wx + 1, 10, 3, 3, '#7a7a7a');
    p.px(wx + 2 + (f ? 1 : 0), 11 - (f ? 1 : 0), '#2a2a2a').px(wx + 2 - (f ? 1 : 0), 11 + (f ? 1 : 0), '#2a2a2a');
  }
}

function motorcycle(p: Px, f: number): void {
  // small red moped facing right: two wheels, a seat, handlebar and a headlamp
  const c = '#d9453b';
  const d = shade(c, 0.7);
  p.rect(3, 5, 10, 3, c).rect(4, 4, 6, 1, d); // frame + seat
  p.rect(11, 2, 1, 4, '#3a3a3a').rect(10, 2, 3, 1, '#3a3a3a'); // handlebar
  p.rect(13, 4, 2, 2, '#fff1a0'); // headlamp
  p.rect(1, 8, 2, 1, d).rect(13, 7, 1, 1, d);
  for (const wx of [1, 10]) {
    p.rect(wx, 7, 5, 5, '#2a2a2a').rect(wx + 1, 8, 3, 3, '#8a8a8a');
    p.px(wx + 2 + (f ? 1 : 0), 9 - (f ? 1 : 0), '#2a2a2a').px(wx + 2 - (f ? 1 : 0), 9 + (f ? 1 : 0), '#2a2a2a');
  }
}

const DRAW: Record<string, (p: Px, f: number, variant?: number) => void> = {
  car,
  motorcycle, hen, rabbit, sheep, cow, pig, horse, dog, cat, fox, deer, penguin, crab, goat, lizard, hare, boar, moose, bear, wolf, lynx, slime, bat, troll, boss };

/** Head position (x of head centre, top y) for the tomteluva per species. */
const HAT_POS: Record<string, [number, number]> = { hen: [12, 1], rabbit: [12, -1], sheep: [14, 4], cow: [19, 0], pig: [14, -1], horse: [22, -1], dog: [12, 1], cat: [11, 0], fox: [14, 0], deer: [13, 0], penguin: [6, 0], goat: [13, 0], hare: [11, -1], boar: [14, 1], moose: [19, 0], bear: [18, 1], wolf: [16, 0], lynx: [14, 0] };

export function drawAnimal(species: string, frame: number, baby: boolean, jul: boolean, variant = 0): Px {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const full = new Px(size.w, size.h);
  DRAW[species]?.(full, frame, variant);
  if (jul) {
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

export const animalKey = (species: string, baby: boolean, jul: boolean, variant = 0): string => `animal-${species}-${baby ? 'baby' : 'adult'}${jul ? '-jul' : ''}${variant ? `-v${variant}` : ''}`;
