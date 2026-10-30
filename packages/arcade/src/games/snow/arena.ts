// What the snowmen, the Snow King and the snowballs need from the game, as one small interface.
import type * as THREE from 'three';
import type { Sound } from './audio.ts';
import type { Chunks, DebrisSet, Particles, Splats } from './fx.ts';
import type { Kind } from './snowman.ts';
import type { World } from './world.ts';

export interface Difficulty {
  /** Seconds a normal snowman holds its wind-up before it throws. */
  windup: number;
  /** Least time between two snowmen starting to throw. */
  minGap: number;
  /** How many may wind up at the same time. */
  maxThrowers: number;
  /** Aim error (metres, standard deviation). */
  sigma: number;
  /** Flight time factor of their snowballs (lower = faster). */
  flight: number;
  /** Seconds they stay hidden behind cover. */
  hide: [number, number];
  /** How much they lead a moving player (0..1). */
  lead: number;
}

export interface Arena {
  world: World;
  scene: THREE.Scene;
  sound: Sound;
  puffs: Particles;
  sparks: Particles;
  chunks: Chunks;
  splats: Splats;
  debris: DebrisSet;
  glowTex: THREE.Texture;
  shadows: boolean;
  low: boolean;
  diff: Difficulty;
  /** Game clock (seconds). */
  time: number;
  /** The player's feet and velocity. */
  playerPos: THREE.Vector3;
  playerVel: THREE.Vector3;
  /** Stereo position of a world point (-1 left .. 1 right). */
  pan(p: THREE.Vector3): number;
  /** Ask to start a wind-up (keeps the throws fair); give it back when thrown or interrupted. */
  requestThrow(): boolean;
  releaseThrow(): void;
  /** Throw a snowball at the player from `from`, landing near `to` after `flight` seconds. */
  enemyThrow(from: THREE.Vector3, to: THREE.Vector3, flight: number, big: boolean): void;
  /** A new snowman pops out of the snow (the Snow King summons helpers). */
  spawnEnemy(kind: Kind, at?: THREE.Vector2): void;
  shake(amount: number): void;
}

export interface WaveDef {
  title: string;
  sub: string;
  /** Snowmen in the order they come. */
  foes: Kind[];
  /** At most this many at once. */
  alive: number;
  diff: Difficulty;
  /** Treats dropped during the wave. */
  items: ('cookie' | 'cocoa' | 'giant' | 'rapid')[];
}

const D = (windup: number, minGap: number, maxThrowers: number, sigma: number, flight: number, hide: [number, number], lead: number): Difficulty => ({ windup, minGap, maxThrowers, sigma, flight, hide, lead });

export const WAVES: WaveDef[] = [
  {
    title: 'Våg 1',
    sub: 'Snögubbarna kommer!',
    foes: ['normal', 'normal', 'normal', 'normal', 'normal'],
    alive: 2,
    diff: D(1.1, 1.8, 1, 1.45, 1.08, [2.2, 3.8], 0.2),
    items: ['cookie', 'cookie'],
  },
  {
    title: 'Våg 2',
    sub: 'Akta de små hopparna!',
    foes: ['normal', 'small', 'normal', 'small', 'normal', 'small', 'normal'],
    alive: 3,
    diff: D(0.98, 1.4, 2, 1.25, 1.02, [1.9, 3.3], 0.3),
    items: ['cookie', 'rapid', 'cookie'],
  },
  {
    title: 'Våg 3',
    sub: 'Här kommer en stor en!',
    foes: ['normal', 'small', 'normal', 'big', 'small', 'normal', 'small', 'normal'],
    alive: 4,
    diff: D(0.9, 1.15, 2, 1.05, 0.97, [1.7, 3.0], 0.4),
    items: ['cookie', 'giant', 'cocoa', 'cookie'],
  },
  {
    title: 'Våg 4',
    sub: 'Nu blir det fart!',
    foes: ['small', 'normal', 'small', 'normal', 'big', 'small', 'normal', 'normal', 'small', 'big'],
    alive: 4,
    diff: D(0.84, 1.0, 3, 0.9, 0.93, [1.5, 2.7], 0.46),
    items: ['cookie', 'rapid', 'cookie', 'cocoa'],
  },
  {
    title: 'Våg 5',
    sub: 'Sista vågen före kungen!',
    foes: ['normal', 'small', 'big', 'normal', 'small', 'normal', 'small', 'big', 'normal', 'small', 'normal', 'small'],
    alive: 5,
    diff: D(0.78, 0.88, 3, 0.8, 0.89, [1.3, 2.4], 0.5),
    items: ['cookie', 'giant', 'cocoa', 'cookie', 'rapid'],
  },
  {
    title: 'Snökungen!',
    sub: 'Träffa hans blå ishjärta!',
    foes: [],
    alive: 4,
    diff: D(0.85, 1.1, 2, 0.85, 0.92, [1.6, 2.8], 0.4),
    items: ['cookie', 'rapid', 'cocoa', 'giant', 'cookie'],
  },
];
