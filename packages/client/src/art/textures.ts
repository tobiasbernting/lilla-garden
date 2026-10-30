// Draws every picture once (terrain, objects, crops, effects, icons). Also exposes icon data URLs for the HTML UI.
import type { Appearance, Outfit } from '@lilla-garden/shared';
import { lookOf, portrait } from './characters.js';
import { drawIcons } from './icons.js';
import type { Px } from './px.js';
import { drawCrops, drawFx, drawObjects, drawTerrainTiles, type ObjectArt, type TerrainTiles } from './world.js';

export interface Art {
  terrain: TerrainTiles;
  objects: Record<string, ObjectArt>;
  crops: Record<string, Px[]>;
  fx: Record<string, Px[]>;
  icons: Record<string, Px>;
  iconUrl: Record<string, string>;
}

let art: Art | null = null;

export function getArt(): Art {
  if (art) return art;
  const objects = drawObjects();
  const icons = drawIcons(objects);
  const iconUrl: Record<string, string> = {};
  for (const [k, p] of Object.entries(icons)) iconUrl[k] = p.dataUrl();
  art = { terrain: drawTerrainTiles(), objects, crops: drawCrops(), fx: drawFx(), icons, iconUrl };
  return art;
}

export const portraitUrl = (appearance: Appearance, outfit: Outfit, scale = 4): string => portrait(lookOf(appearance, outfit), scale);
