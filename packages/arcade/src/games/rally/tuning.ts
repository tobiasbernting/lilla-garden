// What a GarageCar does to the handling (body stats and tuning parts), the computer cars' cars, the
// damage rules, and the player's smoke colour.
import * as THREE from 'three';
import { CAR_BODIES, CAR_BODY_DEFS, PART_EFFECTS, defaultStyle, emptyParts, newCar, type CarBody, type CarDriver, type CarSmoke, type GarageCar } from '@lilla-garden/shared';
import { clamp } from './util.ts';

export interface Tune {
  /** Multipliers on the base car (car.ts). */
  power: number;
  grip: number;
  /** Added to the car's assist. */
  assist: number;
  brakeMul: number;
  /** Damage taken is multiplied by this (body toughness and armour). */
  dmgMul: number;
  size: number;
  /** Nitro charges for the race. */
  charges: number;
}

/** The handling a car gets: its body always counts; `sameCars` levels the parts (and gives everyone one nitro). */
export function tuneFor(car: GarageCar, sameCars: boolean, nitro: boolean): Tune {
  const b = CAR_BODY_DEFS[car.body] ?? CAR_BODY_DEFS.hatch;
  const parts = sameCars ? emptyParts() : car.parts;
  const lvl = (k: keyof typeof parts): number => clamp(Math.round(parts[k] ?? 0), 0, 3);
  return {
    power: b.power * (1 + lvl('engine') * PART_EFFECTS.enginePower),
    grip: b.grip * (1 + lvl('tyres') * PART_EFFECTS.tyresGrip),
    assist: lvl('suspension') * PART_EFFECTS.suspensionAssist,
    brakeMul: 1 + lvl('brakes') * PART_EFFECTS.brakesForce,
    dmgMul: Math.max(0.2, 1 - lvl('armour') * PART_EFFECTS.armourShield) / b.tough,
    size: 1 + (b.size - 1) * 0.6,
    charges: nitro ? (sameCars ? 1 : lvl('turbo') * PART_EFFECTS.turboCharges) : 0,
  };
}

/** Damage 0..100 slows the car (never to a stop) and makes it slide a little more. */
export const damagePower = (d: number): number => 1 - 0.35 * clamp(d, 0, 100) / 100;
export const damageGrip = (d: number): number => 1 - 0.1 * clamp(d, 0, 100) / 100;

/** Bodies for the computer cars online (the same on every screen). */
const AI_BODIES: CarBody[] = ['hatch', 'buggy', 'pickup', 'coupe', 'hatch'];

/** A computer car for the online grid and the remote screens: body, colour and number from its slot. */
export function aiCar(k: number, color: string, driver: CarDriver): GarageCar {
  const c = newCar(-1 - k, AI_BODIES[k % AI_BODIES.length] ?? 'hatch', '', color);
  c.style = { ...defaultStyle(color), number: k + 2, driver };
  return c;
}

/** The arcade's own car: the red (or the player's colour) hatchback with number 1. */
export function arcadeCar(color: string): GarageCar {
  const c = newCar(0, 'hatch', '', color);
  c.style.number = 1;
  return c;
}

export const isBody = (s: unknown): s is CarBody => typeof s === 'string' && (CAR_BODIES as readonly string[]).includes(s);

const SMOKE: Record<CarSmoke, string> = {
  white: '#d9d6d0',
  rainbow: '#ffffff',
  hearts: '#ff8ac0',
  hay: '#e8c862',
  pink: '#ff9ad5',
  blue: '#7ab8ff',
  gold: '#ffd23f',
};

/** Tyre smoke in the player's colour (rainbow cycles through the hues). */
export function smokeColor(kind: CarSmoke | undefined, time: number, out: THREE.Color): THREE.Color {
  if (kind === 'rainbow') return out.setHSL((time * 0.35) % 1, 0.85, 0.7);
  return out.set(SMOKE[kind ?? 'white'] ?? SMOKE.white);
}
