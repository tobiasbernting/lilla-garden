// What a hole is made of, as plain data: the physics (physics.ts) and the pictures (art.ts) are both
// built from the same spec, so what you see is what the ball feels.
//
// Coordinates: x to the right, z towards the tee (holes mostly run towards -z), y up. One unit is
// five ball radii; a lane is about 4 units wide.

export type Pt = [number, number];

/** What the ball rolls on: felt (the greens), wood (the bridge), mud (slow), out (the island's grass). */
export type Surf = 'felt' | 'wood' | 'mud' | 'out';

export type GreenSpec =
  /** A flat (or evenly tilted) polygon. */
  | { kind: 'poly'; pts: Pt[]; h?: number; slope?: Pt; surf?: Surf }
  /** A straight strip from a to b, half width hw, rising from h0 to h1 (ramp/smooth) or arching up to h1 (arch). */
  | { kind: 'lane'; a: Pt; b: Pt; hw: number; h0: number; h1: number; prof: 'ramp' | 'smooth' | 'arch'; surf?: Surf }
  /**
   * A round piece: flat, a bowl (dips by `depth` in the middle), a crater (rises to a rim at `rim`
   * by `height`, then dips by `depth` to the middle), or a flat turntable that spins at `spin` rad/s.
   */
  | {
      kind: 'disc';
      c: Pt;
      r: number;
      rin?: number;
      h: number;
      prof?: 'flat' | 'bowl' | 'crater';
      rim?: number;
      height?: number;
      depth?: number;
      spin?: number;
      surf?: Surf;
      look?: 'carousel';
    };

export interface RailSpec {
  pts: Pt[];
  closed?: boolean;
  /** Height above the ground (default 0.34); a low lip is about 0.1. */
  h?: number;
  look?: 'wood' | 'fence' | 'stone' | 'lip';
}

export interface WaterSpec {
  pts: Pt[];
  level: number;
  /** A stream: the water flows this way (units/s). */
  flow?: Pt;
  ducks?: number;
}

/** Things that stand still and that the ball bounces off. */
export type ObstacleSpec =
  | { type: 'bale'; x: number; z: number; yaw?: number } // a square hay bale
  | { type: 'roundbale'; x: number; z: number; yaw?: number; stand?: boolean } // lying on its side or standing up
  | { type: 'post'; x: number; z: number; r?: number; look?: 'stone' | 'tree' | 'bumper' | 'hub' | 'flowerbed' }
  | { type: 'trough'; x: number; z: number; yaw?: number }
  | { type: 'wall'; x0: number; z0: number; x1: number; z1: number; h?: number; t?: number; look?: 'barn' | 'stone' | 'mill' };

/** Things that move: the ball bounces off them and they push it. */
export type MoverSpec =
  | { type: 'windmill'; x: number; z: number; hubY: number; len: number; w: number; speed: number }
  | { type: 'cow'; a: Pt; b: Pt; speed: number; phase: number; calf?: boolean }
  | { type: 'spinner'; x: number; z: number; len: number; speed: number }
  | { type: 'carousel'; x: number; z: number; r: number; speed: number; poles: number; ring: number; h: number };

/** A door in the barn: the ball goes in, and a moment later comes out somewhere else. */
export interface PortalSpec {
  /** The doorway's inside, a rectangle x0..x1, z0..z1. */
  rect: [number, number, number, number];
  exit: Pt;
  dir: Pt;
  delay: number;
}

/** Decoration around the green (no physics). */
export interface DecoSpec {
  type:
    | 'tree'
    | 'birch'
    | 'apple'
    | 'hen'
    | 'sheep'
    | 'pig'
    | 'flowers'
    | 'sunflower'
    | 'bale'
    | 'roundbale'
    | 'fence'
    | 'rock'
    | 'mushroom'
    | 'scarecrow'
    | 'sign'
    | 'reeds'
    | 'lily'
    | 'bush'
    | 'balloons'
    | 'bunting'
    | 'cart'
    | 'well'
    | 'trough';
  x: number;
  z: number;
  yaw?: number;
  s?: number;
  /** fence/bunting: the other end. */
  x1?: number;
  z1?: number;
}

export interface HoleSpec {
  name: string;
  /** A short line under the name in the hole's intro. */
  sub: string;
  par: number;
  tee: Pt;
  cup: Pt;
  /** The way from the tee to the cup: the camera looks along it. */
  path: Pt[];
  greens: GreenSpec[];
  rails: RailSpec[];
  waters?: WaterSpec[];
  obstacles?: ObstacleSpec[];
  movers?: MoverSpec[];
  portals?: PortalSpec[];
  mud?: [number, number, number][];
  decos?: DecoSpec[];
  /**
   * The island under the hole: by default a rounded box around the greens. `split` cuts its grass top
   * into parts (a stream runs between them): each part keeps the side where nx·x + nz·z ≥ d.
   */
  island?: { outline?: Pt[]; margin?: number; split?: [number, number, number][] };
  /** Big set pieces drawn by art.ts (the windmill's house, the barn, the bridge). */
  builds?: { type: 'mill' | 'barn' | 'bridge' | 'tunnel'; x: number; z: number; w?: number; d?: number; yaw?: number }[];
  /** The cup rides the turntable (index into movers). */
  cupOn?: number;
}
