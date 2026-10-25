// Generates every texture once and registers it with Phaser. Also exposes icon data URLs for the HTML UI.
import Phaser from 'phaser';
import type { Appearance, Outfit } from '@lilla-garden/shared';
import { animalKey, animalSheet, ANIMAL_SIZE, VEHICLE_SPECIES, VEHICLE_VARIANTS } from './animals.js';
import { CHAR_H, CHAR_W, drawCharacterSheet, lookKey, lookOf, portrait } from './characters.js';
import { drawTerrainTilesHD, hdFx, hdObjects, upscale } from './hd.ts';
import { drawIcons } from './icons.js';
import type { Px } from './px.js';
import { HD, R } from './style.ts';
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

// Textures are added once per game; animations keep references to their frames, so never remove/re-add them.
const addCanvas = (tm: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement) => {
  if (tm.exists(key)) return;
  tm.addCanvas(key, canvas);
};

/** Registers all static textures with a Phaser texture manager. */
export function registerTextures(tm: Phaser.Textures.TextureManager): void {
  const a = getArt();
  // terrain tileset: single row image
  addCanvas(tm, 'terrain', a.terrain.canvas);
  // objects: one texture per kind, frames by index
  for (const [kind, o] of Object.entries(a.objects)) {
    o.frames.forEach((f, i) => addCanvas(tm, `obj-${kind}-${i}`, f.canvas));
  }
  for (const [crop, frames] of Object.entries(a.crops)) frames.forEach((f, i) => addCanvas(tm, `crop-${crop}-${i}`, f.canvas));
  for (const [name, frames] of Object.entries(a.fx)) frames.forEach((f, i) => addCanvas(tm, `fx-${name}-${i}`, f.canvas));
  for (const [id, p] of Object.entries(a.icons)) addCanvas(tm, `icon-${id}`, p.canvas);
  for (const species of Object.keys(ANIMAL_SIZE)) {
    const variants = VEHICLE_SPECIES.has(species) ? VEHICLE_VARIANTS : 1;
    for (const baby of [false, true])
      for (const jul of [false, true])
        for (let v = 0; v < variants; v++) {
          const key = animalKey(species, baby, jul, v);
          const size = ANIMAL_SIZE[species]!;
          if (tm.exists(key)) continue;
          const sheet = HD ? upscale(animalSheet(species, baby, jul, v)).canvas : animalSheet(species, baby, jul, v);
          tm.addSpriteSheet(key, sheet as unknown as HTMLImageElement, { frameWidth: size.w * R, frameHeight: size.h * R });
        }
  }
}

/** Ensures a character sprite sheet exists for this look; returns the texture key. */
export function characterTexture(tm: Phaser.Textures.TextureManager, appearance: Appearance, outfit: Outfit): string {
  const look = lookOf(appearance, outfit);
  const key = `char-${lookKey(look)}`;
  if (!tm.exists(key)) {
    const sheet = drawCharacterSheet(look);
    tm.addSpriteSheet(key, sheet as unknown as HTMLImageElement, { frameWidth: CHAR_W * R, frameHeight: CHAR_H * R });
  }
  return key;
}

export const portraitUrl = (appearance: Appearance, outfit: Outfit, scale = 4): string => portrait(lookOf(appearance, outfit), scale);
