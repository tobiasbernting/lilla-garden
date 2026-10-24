// Graphics style switch: 'klassisk' (original) or 'ny' (prototype with blended edges, richer trees and light).
const KEY = 'lilla-garden.art';

export const NEW_ART: boolean = (() => {
  try {
    return localStorage.getItem(KEY) === 'ny';
  } catch {
    return false;
  }
})();

/** Switches style and reloads (textures are generated once at boot). */
export function setArtStyle(newArt: boolean): void {
  try {
    localStorage.setItem(KEY, newArt ? 'ny' : 'klassisk');
  } catch {
    /* ignore */
  }
  location.reload();
}
