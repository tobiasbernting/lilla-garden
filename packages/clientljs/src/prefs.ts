// Imported before anything else: this client starts in "Ny grafik", the pixel style the lights look best on.
// The art button in the HUD still cycles the styles, and a choice made there is kept.
const KEY = 'lilla-garden.art';
try {
  if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, 'ny');
} catch {
  /* no storage: the 2D game's default */
}
