// Draws every picture once (terrain, objects, crops, effects, icons). Also exposes icon data URLs for the HTML UI.
import type { Appearance, Outfit } from '@lilla-garden/shared';
import { lookOf, portrait } from './characters.js';
import { drawTerrainTilesHD, hdFx, hdObjects, upscale } from './hd.ts';
import { drawIcons } from './icons.js';
import type { Px } from './px.js';
import { HD } from './style.ts';
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
  if (HD) {
    // HD: smooth art at R× resolution; things without HD art are upscaled pixel art
    const crops: Record<string, Px[]> = {};
    for (const [k, frames] of Object.entries(drawCrops())) crops[k] = frames.map(upscale);
    const iconsHd: Record<string, Px> = {};
    for (const [k, px] of Object.entries(icons)) iconsHd[k] = upscale(px);
    art = { terrain: drawTerrainTilesHD(), objects: hdObjects(objects), crops, fx: hdFx(drawFx()), icons: iconsHd, iconUrl };
    return art;
  }
  art = { terrain: drawTerrainTiles(), objects, crops: drawCrops(), fx: drawFx(), icons, iconUrl };
  return art;
}

export const portraitUrl = (appearance: Appearance, outfit: Outfit, scale = 4): string => portrait(lookOf(appearance, outfit), scale);
