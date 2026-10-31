// The five courses of Rallyvärlden: the farm (Rallyt as it always was), the forest, the frozen lake, the
// beach and the city at night. Each is a closed circuit (control points for track.ts), a layout of the
// land round it (layout.ts) and a theme: sky per time of day, ground colours, the scenery set, fences and
// the road's look.
import type { RallyCourse, RallyTime } from '@lilla-garden/shared';
import { FARM, type Layout } from './layout.ts';
import { FARM_CTRL, Fence, FenceX, type Ctrl, type SurfaceName, type TrackDef } from './track.ts';
import { fbm, smooth } from './util.ts';

/** A sky: the sun (or moon) and the colours of the dome, the lights and the haze. */
export interface SkyPreset {
  /** Sun elevation (degrees) and azimuth (radians, as atan2(x, z)). */
  elev: number;
  az: number;
  zenith: string;
  horizon: string;
  haze: string;
  sunCol: string;
  cloud: string;
  /** Cloud cover: 0.5 a few, 0.3 overcast. */
  cover: number;
  sunLight: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  fog: number;
  /** Stars and a moon instead of the sun disc (0..1). */
  night: number;
  exposure: number;
}

/** Ground colours (see terrain.ts). */
export interface GroundColors {
  grassA: string;
  grassB: string;
  grassDark: string;
  dry: string;
  floor: string;
  sand: string;
  mud: string;
  verge: string;
  mowA: string;
  mowB: string;
  farTint: string;
}

export type ScenerySet = 'farm' | 'forest' | 'ice' | 'beach' | 'city';

export interface Theme {
  sky: Record<RallyTime, SkyPreset>;
  ground: GroundColors;
  scenery: ScenerySet;
  /** Snow always falls here. */
  snow: boolean;
  /** Street lights and signs lit whatever the time (the city). */
  lit: boolean;
  /** The time of day that is always night-like (headlights on). */
  alwaysNight: boolean;
  /** The verge next to the road: dirt, snow, sand or kerbstone. */
  verge: string;
  vergeGrass: string;
}

export interface CourseDef extends TrackDef {
  id: RallyCourse;
  /** Shown on the start banner. */
  name: string;
  theme: Theme;
  layout: Layout;
}

// ---------------------------------------------------------------------------
// Skies
// ---------------------------------------------------------------------------

const GOLDEN: SkyPreset = {
  elev: 13,
  az: Math.atan2(-0.62, 0.78),
  zenith: '#4382d6',
  horizon: '#f4c99c',
  haze: '#ffa05a',
  sunCol: '#ffc274',
  cloud: '#f3dccb',
  cover: 0.5,
  sunLight: '#ffd09a',
  sunI: 2.7,
  hemiSky: '#b3cdf5',
  hemiGround: '#7a6b48',
  hemiI: 1.35,
  fog: 0.00062,
  night: 0,
  exposure: 1.02,
};

const DUSK: SkyPreset = {
  elev: 4,
  az: Math.atan2(-0.62, 0.78),
  zenith: '#3b4f9a',
  horizon: '#f59a6a',
  haze: '#ff7a45',
  sunCol: '#ff9a5a',
  cloud: '#d99aa0',
  cover: 0.48,
  sunLight: '#ff9d6a',
  sunI: 1.8,
  hemiSky: '#8f8fd0',
  hemiGround: '#5a4a3a',
  hemiI: 1.15,
  fog: 0.0009,
  night: 0.15,
  exposure: 1.0,
};

const NIGHT: SkyPreset = {
  elev: 32,
  az: Math.atan2(0.5, -0.8),
  zenith: '#0b1330',
  horizon: '#24325a',
  haze: '#3a4a7a',
  sunCol: '#c8d6ff',
  cloud: '#2a3352',
  cover: 0.55,
  sunLight: '#8ea6e6',
  sunI: 0.55,
  hemiSky: '#46588c',
  hemiGround: '#1c1a24',
  hemiI: 0.75,
  fog: 0.0011,
  night: 1,
  exposure: 1.05,
};

const DAY: SkyPreset = {
  elev: 48,
  az: Math.atan2(-0.4, 0.9),
  zenith: '#2f7fe0',
  horizon: '#bfe0f5',
  haze: '#fff2d6',
  sunCol: '#fff1cc',
  cloud: '#ffffff',
  cover: 0.55,
  sunLight: '#fff3dc',
  sunI: 2.9,
  hemiSky: '#cfe4ff',
  hemiGround: '#a89a6a',
  hemiI: 1.25,
  fog: 0.00045,
  night: 0,
  exposure: 1.0,
};

const sky = (p: SkyPreset, o: Partial<SkyPreset>): SkyPreset => ({ ...p, ...o });

// ---------------------------------------------------------------------------
// The farm
// ---------------------------------------------------------------------------

const FARM_THEME: Theme = {
  sky: { day: GOLDEN, sunset: DUSK, night: NIGHT },
  ground: {
    grassA: '#5b9a3b',
    grassB: '#7cb04b',
    grassDark: '#457a30',
    dry: '#a6ab58',
    floor: '#3c6a2b',
    sand: '#c9b98a',
    mud: '#6c6445',
    verge: '#9c8b60',
    mowA: '#83b952',
    mowB: '#6da545',
    farTint: '#5f8a58',
  },
  scenery: 'farm',
  snow: false,
  lit: false,
  alwaysNight: false,
  verge: '#857a55',
  vergeGrass: '#6b9a45',
};

export const FARM_COURSE: CourseDef = {
  id: 'farm',
  name: 'Gården',
  ctrl: FARM_CTRL,
  surface: 'asphalt',
  fence: Fence.Pole,
  hw: 7.5,
  run: 12,
  theme: FARM_THEME,
  layout: FARM,
};

// ---------------------------------------------------------------------------
// Shared bits for the new courses
// ---------------------------------------------------------------------------

/** A plain land of swells, one or two big hills, and mountains round the edge. */
function land(base: number, swell: number, hills: [number, number, number, number, number][], rim: number, far: number): Layout['natural'] {
  return (x, z, cx, cz, ex, ez) => {
    let h = base + swell * fbm(x / 170 + 1.3, z / 170 - 2.1, 4) + swell * 0.35 * fbm(x / 50, z / 50, 2);
    for (const [hx, hz, hh, rx, rz] of hills) h += hh * Math.exp(-(((x - hx) / rx) ** 2) - ((z - hz) / rz) ** 2);
    const r = Math.hypot((x - cx) / (ex + 150), (z - cz) / (ez + 150));
    h += smooth(1.0, 3.4, r) * rim * (fbm(x / 520 + 9, z / 520 - 4, 3) + 0.7);
    h += smooth(2.6, 7, r) * far * (fbm(x / 1100 - 3, z / 1100 + 6, 3) + 0.6);
    return h;
  };
}

const layout = (o: Partial<Layout> & Pick<Layout, 'natural'>): Layout => ({
  waterY: 0.55,
  lake: null,
  lakeKind: 'water',
  stream: null,
  fields: [],
  forests: [],
  farForest: 1,
  farBirch: 0.3,
  farCx: 0,
  farCz: 0,
  shoreTrees: false,
  ...o,
});

// ---------------------------------------------------------------------------
// Skogen: gravel through the pines at dusk, with a long jump over a crest
// ---------------------------------------------------------------------------

const P = (x: number, z: number, y: number, o: Partial<Ctrl> = {}): Ctrl => ({ x, z, y, ...o });
/** The courses are drawn small and scaled up to size (bends keep their shape, roads their width). */
const grow = (ctrl: Ctrl[], k: number): Ctrl[] => ctrl.map((c) => ({ ...c, x: c.x * k, z: c.z * k }));
const KF = 1.15;
const KI = 1.2;
const KB = 1.5;
const KC = 1.5;

const FOREST_CTRL: Ctrl[] = [
  P(0, 120, 4, { hw: 8, surface: 'asphalt', runL: 6, runR: 6, fenceL: FenceX.Logs, fenceR: FenceX.Logs }),
  P(70, 122, 4.2, { hw: 7.5 }),
  P(125, 108, 5),
  P(160, 70, 6.5, { hw: 6.5 }),
  P(168, 20, 9, { hw: 6.5 }),
  // Hoppet: the long jump over the crest
  P(170, -40, 13, { hw: 7, bump: 3.2, bw: 18, runL: 8, runR: 8, fenceL: FenceX.Logs, fenceR: FenceX.Logs }),
  P(165, -95, 9.5, { hw: 7 }),
  P(140, -135, 8, { hw: 6.5 }),
  // the tight esses through the pines
  P(95, -150, 8, { hw: 6 }),
  P(62, -125, 8.5, { hw: 6 }),
  P(25, -150, 8, { hw: 6 }),
  P(-15, -125, 7.5, { hw: 6 }),
  P(-60, -140, 7, { hw: 6.5 }),
  P(-110, -125, 6.5, { hw: 6.5, bump: -1.2, bw: 25 }),
  // the hairpin round the old charcoal stack
  P(-150, -95, 6, { hw: 7, runR: 6, fenceR: FenceX.Logs }),
  P(-165, -60, 6, { hw: 7.5, runR: 6, fenceR: FenceX.Logs }),
  P(-150, -30, 6.2, { hw: 7.5, runR: 6, fenceR: FenceX.Logs }),
  P(-120, -35, 6.5, { hw: 7 }),
  P(-95, -10, 6, { hw: 6.5 }),
  P(-110, 30, 5, { hw: 6.5, bump: 1.4, bw: 20 }),
  P(-150, 60, 4.5, { hw: 7 }),
  P(-145, 100, 4.2, { hw: 7.5 }),
  P(-105, 120, 4, { hw: 8, surface: 'asphalt' }),
  P(-55, 120, 4, { hw: 8, surface: 'asphalt', runL: 6, runR: 6, fenceL: FenceX.Logs, fenceR: FenceX.Logs }),
];

const FOREST_COURSE: CourseDef = {
  id: 'forest',
  name: 'Skogen',
  ctrl: grow(FOREST_CTRL, KF),
  surface: 'gravel',
  fence: Fence.Pole,
  hw: 6.5,
  run: 9,
  theme: {
    sky: {
      day: sky(DUSK, { elev: 9, zenith: '#4566b0', horizon: '#f2b07a', haze: '#ff8a50', sunI: 2.2, hemiI: 1.25, fog: 0.0011 }),
      sunset: sky(DUSK, { elev: 2, horizon: '#e7806a', zenith: '#33407e', sunI: 1.4, hemiI: 1.0, fog: 0.0013, night: 0.3 }),
      night: sky(NIGHT, { fog: 0.0016 }),
    },
    ground: {
      grassA: '#4d7a33',
      grassB: '#5f8a3a',
      grassDark: '#3a5f2a',
      dry: '#7f7a46',
      floor: '#3a4a26',
      sand: '#a89a70',
      mud: '#5a4c36',
      verge: '#8a7a58',
      mowA: '#5e8a3c',
      mowB: '#527c34',
      farTint: '#3f5f45',
    },
    scenery: 'forest',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#7d6e4f',
    vergeGrass: '#557d3a',
  },
  layout: layout({
    forests: [
      { x: 0, z: -20 * KF, rx: 480, rz: 400, birch: 0.15 },
      { x: 30 * KF, z: -10 * KF, rx: 140, rz: 100, birch: 0.35 },
    ],
    farBirch: 0.1,
    lake: { cx: 30 * KF, cz: 15 * KF, rx: 52, rz: 32, rot: -0.2 },
    shoreTrees: true,
    natural: land(4, 3, [[60 * KF, -40 * KF, 7, 100, 80], [-70 * KF, -60 * KF, 4, 70, 70]], 34, 80),
  }),
};

// ---------------------------------------------------------------------------
// Isbanan: snow and a frozen lake, snowy pines, very little grip
// ---------------------------------------------------------------------------

const ICE_CTRL: Ctrl[] = [
  P(0, 140, 2, { hw: 9, runL: 7, runR: 7 }),
  P(80, 140, 2, { hw: 9 }),
  P(150, 125, 2.2, { hw: 9 }),
  P(195, 85, 3, { hw: 9 }),
  P(205, 30, 4.5, { hw: 9 }),
  P(185, -25, 5, { hw: 9 }),
  // out onto the frozen lake: a long sweeping bend on glare ice
  P(140, -55, 1.1, { hw: 10, surface: 'ice', fenceL: Fence.None, fenceR: Fence.None, runL: 14, runR: 14 }),
  P(80, -70, 0.9, { hw: 10, surface: 'ice', fenceL: Fence.None, fenceR: Fence.None, runL: 14, runR: 14 }),
  P(20, -60, 0.9, { hw: 10, surface: 'ice', fenceL: Fence.None, fenceR: Fence.None, runL: 14, runR: 14 }),
  P(-35, -75, 1.1, { hw: 9.5 }),
  P(-85, -105, 3, { hw: 9 }),
  P(-140, -100, 4, { hw: 9, bump: 1.5, bw: 22 }),
  P(-185, -60, 4.5, { hw: 9, runR: 6, fenceR: FenceX.Snow }),
  P(-190, -5, 4.2, { hw: 9, runR: 6, fenceR: FenceX.Snow }),
  P(-165, 35, 3.5, { hw: 9 }),
  P(-130, 62, 3, { hw: 9 }),
  P(-140, 100, 2.5, { hw: 9, runL: 6, fenceL: FenceX.Snow }),
  P(-110, 136, 2.2, { hw: 9 }),
  P(-60, 142, 2, { hw: 9, runL: 7, runR: 7 }),
];

const ICE_COURSE: CourseDef = {
  id: 'ice',
  name: 'Isbanan',
  ctrl: grow(ICE_CTRL, KI),
  surface: 'snow',
  fence: FenceX.Snow,
  hw: 9,
  run: 10,
  theme: {
    sky: {
      day: sky(DAY, { elev: 8, zenith: '#6f8fc0', horizon: '#dfe6f2', haze: '#f6e7da', sunCol: '#ffe1c8', cloud: '#e8edf5', cover: 0.33, sunLight: '#ffe6d0', sunI: 1.6, hemiSky: '#d0dcf5', hemiGround: '#b8c0d0', hemiI: 1.6, fog: 0.0012, exposure: 0.95 }),
      sunset: sky(DUSK, { elev: 3, zenith: '#3d4d8a', horizon: '#c6a2c0', haze: '#ffb08a', cloud: '#9a8fb5', cover: 0.38, hemiSky: '#9aa8e0', hemiGround: '#a0a8c0', hemiI: 1.35, fog: 0.0014, exposure: 0.95 }),
      night: sky(NIGHT, { zenith: '#101a3a', horizon: '#3a4a78', hemiGround: '#5a6080', hemiI: 0.95, fog: 0.0014 }),
    },
    ground: {
      grassA: '#eef3f8',
      grassB: '#dde7f2',
      grassDark: '#c8d6e6',
      dry: '#f6f8fb',
      floor: '#d8e2ee',
      sand: '#cfdbe8',
      mud: '#b8c8da',
      verge: '#e6edf5',
      mowA: '#f2f6fa',
      mowB: '#e4ecf4',
      farTint: '#c9d4e4',
    },
    scenery: 'ice',
    snow: true,
    lit: false,
    alwaysNight: false,
    verge: '#e9eff6',
    vergeGrass: '#dfe8f2',
  },
  layout: layout({
    lake: { cx: 70 * KI, cz: -62 * KI, rx: 130, rz: 56, rot: 0.05 },
    lakeKind: 'ice',
    waterY: 0.6,
    forests: [
      { x: 0, z: 40 * KI, rx: 170, rz: 80, birch: 0 },
      { x: -40 * KI, z: -230 * KI, rx: 380, rz: 120, birch: 0.05 },
      { x: 300 * KI, z: 0, rx: 100, rz: 260, birch: 0.05 },
      { x: -300 * KI, z: 60 * KI, rx: 100, rz: 240, birch: 0.05 },
    ],
    farBirch: 0,
    natural: land(3, 2.4, [[0, 40 * KI, 3, 90, 45]], 50, 120),
  }),
};

// ---------------------------------------------------------------------------
// Stranden: sand, a boardwalk, palms, beach huts and a lighthouse by the sea, in the sun
// ---------------------------------------------------------------------------

const BEACH_CTRL: Ctrl[] = [
  P(0, 0, 2.6, { hw: 8.5, surface: 'asphalt', runL: 6, runR: 6, fenceL: FenceX.Rope, fenceR: FenceX.Rope }),
  P(70, 0, 2.6, { hw: 8.5, surface: 'asphalt' }),
  P(112, -8, 3, { hw: 8 }),
  P(138, -38, 4, { hw: 8 }),
  P(148, -78, 5.5, { hw: 7.5, bump: 1.6, bw: 20 }),
  // round the palm island: a sandy hairpin
  P(136, -106, 5, { hw: 8, runR: 5, fenceR: FenceX.Rope }),
  P(112, -110, 4.6, { hw: 8.5, runR: 5, fenceR: FenceX.Rope }),
  P(98, -90, 4.2, { hw: 8 }),
  P(74, -80, 4, { hw: 8 }),
  P(48, -100, 3.2, { hw: 8 }),
  P(30, -140, 2.2, { hw: 7.5 }),
  // the boardwalk along the water's edge
  P(0, -158, 1.8, { hw: 7.5, surface: 'asphalt', deck: true, fenceL: FenceX.Rope, fenceR: FenceX.Rope, runL: 3, runR: 3 }),
  P(-60, -163, 1.6, { hw: 7.5, surface: 'asphalt', deck: true, fenceL: FenceX.Rope, fenceR: FenceX.Rope, runL: 3, runR: 3 }),
  P(-120, -158, 1.8, { hw: 7.5, surface: 'asphalt', fenceL: FenceX.Rope, fenceR: FenceX.Rope, runL: 3, runR: 3 }),
  // back up through the dunes: esses
  P(-162, -130, 3, { hw: 8 }),
  P(-180, -94, 4.5, { hw: 8, bump: 1.8, bw: 18 }),
  P(-160, -66, 4.2, { hw: 8 }),
  P(-170, -38, 4, { hw: 8, runL: 6, fenceL: FenceX.Rope }),
  P(-140, -12, 3.6, { hw: 8, runL: 6, fenceL: FenceX.Rope }),
  P(-100, 0, 3.0, { hw: 8.5, surface: 'asphalt' }),
  P(-50, 0, 2.7, { hw: 8.5, surface: 'asphalt' }),
];

const BEACH_COURSE: CourseDef = {
  id: 'beach',
  name: 'Stranden',
  ctrl: grow(BEACH_CTRL, KB),
  surface: 'sand',
  fence: FenceX.Rope,
  hw: 8,
  run: 10,
  theme: {
    sky: {
      day: sky(DAY, { elev: 55, zenith: '#1f78e8', horizon: '#c6ecff', haze: '#fffbe8', cover: 0.6, sunI: 3.1, hemiI: 1.35, fog: 0.00035 }),
      sunset: sky(DUSK, { elev: 5, az: Math.atan2(0.1, -1), zenith: '#3a5aa8', horizon: '#ffb070', haze: '#ff7a3a', sunCol: '#ffa060', cover: 0.55, fog: 0.0007 }),
      night: sky(NIGHT, { az: Math.atan2(0.1, -1), horizon: '#2a3a68', fog: 0.0009 }),
    },
    ground: {
      grassA: '#e8d6a2',
      grassB: '#f0e0b0',
      grassDark: '#8fae5a',
      dry: '#f4e6bc',
      floor: '#86a656',
      sand: '#f2e2b2',
      mud: '#cdb684',
      verge: '#e6d29a',
      mowA: '#ecd9a6',
      mowB: '#e2cd96',
      farTint: '#9ab878',
    },
    scenery: 'beach',
    snow: false,
    lit: false,
    alwaysNight: false,
    verge: '#e2cc94',
    vergeGrass: '#ead9a6',
  },
  layout: layout({
    // the open sea to the south
    lake: { cx: 0, cz: -170 * KB - 604, rx: 2200, rz: 600, rot: 0 },
    lakeKind: 'sea',
    waterY: 0.5,
    forests: [
      { x: 20 * KB, z: -70 * KB, rx: 170, rz: 70, birch: 0 },
      { x: -40 * KB, z: 80 * KB, rx: 420, rz: 120, birch: 0.6 },
      { x: 260 * KB, z: -40 * KB, rx: 110, rz: 180, birch: 0.4 },
    ],
    farForest: 0.6,
    farBirch: 0.6,
    farCz: 300,
    natural: land(3.5, 2.2, [[0, 120 * KB, 8, 220, 90], [200 * KB, 60 * KB, 6, 110, 110]], 30, 60),
  }),
};

// ---------------------------------------------------------------------------
// Staden: the city at night, street lamps, neon on the blocks, and a tunnel
// ---------------------------------------------------------------------------

const CITY_CTRL: Ctrl[] = [
  P(0, 0, 2, { hw: 9 }),
  P(70, 0, 2, { hw: 9 }),
  P(112, -1, 2, { hw: 9 }),
  P(123, -15, 2, { hw: 8.5, runL: 4, fenceL: FenceX.Tyres }),
  P(124, -62, 2.2, { hw: 8.5 }),
  P(134, -86, 2.5, { hw: 8.5 }),
  P(175, -90, 2.8, { hw: 8.5 }),
  P(195, -108, 3, { hw: 8.5, runL: 4, runR: 4, fenceL: FenceX.Tyres, fenceR: FenceX.Tyres }),
  P(186, -136, 3, { hw: 8.5, runL: 4, runR: 4, fenceL: FenceX.Tyres, fenceR: FenceX.Tyres }),
  P(150, -146, 3, { hw: 8.5 }),
  P(108, -146, 3, { hw: 8.5 }),
  // the chicane round the fountain square
  P(80, -130, 3, { hw: 8.5, runL: 4, runR: 4, fenceL: FenceX.Tyres, fenceR: FenceX.Tyres }),
  P(50, -142, 3, { hw: 8.5, runL: 4, runR: 4, fenceL: FenceX.Tyres, fenceR: FenceX.Tyres }),
  P(10, -148, 2.5, { hw: 8.5 }),
  // through the tunnel under the hill
  P(-35, -150, 1.5, { hw: 8.5, tunnel: true, runL: 1.2, runR: 1.2 }),
  P(-85, -150, 1.5, { hw: 8.5, tunnel: true, runL: 1.2, runR: 1.2 }),
  P(-125, -142, 2, { hw: 8.5 }),
  P(-148, -114, 2.5, { hw: 8.5 }),
  P(-150, -74, 2.5, { hw: 8.5, runR: 4, fenceR: FenceX.Tyres }),
  P(-128, -52, 2.2, { hw: 8.5, runR: 4, fenceR: FenceX.Tyres }),
  P(-98, -48, 2.2, { hw: 8.5 }),
  P(-80, -28, 2.1, { hw: 8.5 }),
  P(-70, -2, 2, { hw: 9 }),
  P(-35, 0, 2, { hw: 9 }),
];

const CITY_COURSE: CourseDef = {
  id: 'city',
  name: 'Staden',
  ctrl: grow(CITY_CTRL, KC),
  surface: 'asphalt',
  fence: FenceX.Barrier,
  hw: 8.5,
  run: 5,
  theme: {
    sky: {
      day: sky(NIGHT, { zenith: '#1a2350', horizon: '#6a5a8a', haze: '#c86a8a', sunCol: '#ffd0c0', elev: 2, az: Math.atan2(-0.6, 0.8), cloud: '#4a4a72', sunLight: '#c0a8e8', sunI: 0.9, hemiSky: '#6a70b0', hemiI: 0.95, night: 0.55, fog: 0.0012 }),
      sunset: sky(NIGHT, { zenith: '#141c44', horizon: '#4a3c6a', haze: '#8a4a7a', sunI: 0.7, hemiI: 0.85, night: 0.8, fog: 0.0013 }),
      night: sky(NIGHT, { zenith: '#070b1f', horizon: '#26244a', haze: '#5a3a6a', sunI: 0.45, hemiI: 0.7, fog: 0.0014 }),
    },
    ground: {
      grassA: '#4a6a3a',
      grassB: '#567644',
      grassDark: '#3a5630',
      dry: '#5a6a46',
      floor: '#33482a',
      sand: '#8a8478',
      mud: '#4a4a46',
      verge: '#7a7a80',
      mowA: '#7d7d84',
      mowB: '#74747b',
      farTint: '#3a4a52',
    },
    scenery: 'city',
    snow: false,
    lit: true,
    alwaysNight: true,
    verge: '#8a8a90',
    vergeGrass: '#76767c',
  },
  layout: layout({
    forests: [],
    farForest: 0.4,
    natural: land(2, 0.5, [[-60 * KC, -158 * KC, 9, 90, 34]], 18, 60),
  }),
};

export const COURSES: Record<RallyCourse, CourseDef> = {
  farm: FARM_COURSE,
  forest: FOREST_COURSE,
  ice: ICE_COURSE,
  beach: BEACH_COURSE,
  city: CITY_COURSE,
};

export type { SurfaceName };
