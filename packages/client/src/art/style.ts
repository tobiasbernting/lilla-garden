// Art style switch. Textures are generated once at boot, so changing style reloads the page.
export type ArtStyle = 'klassisk' | 'ny' | 'hd';

const KEY = 'lilla-garden.art';

export const ART_STYLE: ArtStyle = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'ny' || v === 'hd' ? v : 'klassisk';
  } catch {
    return 'klassisk';
  }
})();

/** "Ny grafik": richer pixel art (autotiled water/soil, shaded trees, warm light). */
export const NEW_ART: boolean = ART_STYLE === 'ny';
/** "HD": smooth, painted look rendered at R× the pixel resolution. */
export const HD: boolean = ART_STYLE === 'hd';
/** Texture resolution multiplier: world units stay 16 px per tile, textures are drawn R× larger. */
export const R: number = HD ? 4 : 1;

export function setArtStyle(style: ArtStyle): void {
  try {
    // remember the style we came from until the game has started in the new one (see clientljs/prefs.ts)
    localStorage.setItem(KEY + '.prev', ART_STYLE);
    localStorage.setItem(KEY, style);
  } catch {
    /* ignore */
  }
  location.reload();
}

export const nextArtStyle = (s: ArtStyle): ArtStyle => (s === 'klassisk' ? 'ny' : s === 'ny' ? 'hd' : 'klassisk');
