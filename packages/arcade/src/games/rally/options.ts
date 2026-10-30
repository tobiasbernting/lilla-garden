// What Rallyvärlden's garage hands the rally game through `ctx.options` (see GameContext). Without
// options the game plays its arcade default: the farm course, three laps, five computer cars, the
// player's active car if `car` is given, nothing online.
import type { CarSnap, GarageCar, RaceResultLine, RaceRules, RoomInfo } from '@lilla-garden/shared';

/** One car on the grid besides the local player. */
export interface RemoteRacer {
  /** Player id (humans) or `ai:<n>` (the host's computer cars). */
  id: string;
  name: string;
  car: GarageCar;
}

/** The game's line to the server (the garage UI wires it to the WebSocket). */
export interface RallyNet {
  /** Send my car (and, as host, the computer cars) about 12 times a second. */
  sendSnaps(snaps: CarSnap[]): void;
  /** Snapshots from the others; returns an unsubscribe. */
  onSnaps(cb: (from: string, snaps: CarSnap[]) => void): () => void;
  /** Someone else crossed the line (race time ms). */
  onFinish(cb: (from: string, time: number) => void): () => void;
  /** I crossed the line: race time (ms) and my car's damage 0..100. */
  sendFinish(time: number, damage: number): void;
  /** The server's result for the room (places, prizes, medals). */
  onResult(cb: (results: RaceResultLine[]) => void): () => void;
  /** Someone left the room mid-race. */
  onLeft(cb: (id: string) => void): () => void;
  /** Free roam: a snapshot from another driver, and a new driver arriving (with their car for the model). */
  onRoamSnap(cb: (from: string, snap: CarSnap) => void): () => void;
  onRoamPeers(cb: (peers: RemoteRacer[]) => void): () => void;
  sendRoamSnap(snap: CarSnap): void;
  /** Server wall clock now (ms), so the countdown lines up on every screen. */
  serverNow(): number;
}

export type RallyMode = 'race' | 'roam' | 'timetrial';

export interface RallyOptions {
  mode: RallyMode;
  rules: RaceRules;
  /** The local player's car (its style and parts; `rules.sameCars` levels the parts). */
  car: GarageCar;
  /** Multiplayer: the room (members, host, startAt, seed). Undefined when racing alone against the computer. */
  room?: RoomInfo;
  /** My player id (matches room members and snapshot ids). */
  me: string;
  /** Multiplayer: I simulate the computer cars and send their snapshots (the host does). */
  host?: boolean;
  net?: RallyNet;
  /** The player's best time (ms) on this course over `rules.laps` laps, for the medal and the ghost line. */
  best?: number;
  /**
   * Called once when a solo race or a drive is over, before `ctx.end`, so the garage can tell the server
   * (solo prizes, free-roam coins, the car's damage). Multiplayer races report through `net` instead.
   */
  onDone?: (r: { place: number; n: number; time: number; damage: number; coins: number }) => void;
}

/** Reads `ctx.options` safely: anything but a RallyOptions means the arcade default. */
export const rallyOptions = (o: unknown): RallyOptions | null => (o && typeof o === 'object' && 'mode' in o && 'rules' in o && 'car' in o ? (o as RallyOptions) : null);
