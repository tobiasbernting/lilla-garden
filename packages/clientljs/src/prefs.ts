// Imported before anything else: this client starts in "Ny grafik", the pixel style the lights look best on.
// The art button in the HUD still cycles the styles, and a choice made there is kept.
const KEY = 'lilla-garden.art';
const PREV = KEY + '.prev';
const TRIES = KEY + '.tries';
try {
  // `?art=ny` (or klassisk/hd) picks a style from the address bar, a way out when a style won't start
  const asked = new URLSearchParams(location.search).get('art');
  if (asked === 'klassisk' || asked === 'ny' || asked === 'hd') {
    localStorage.setItem(KEY, asked);
    localStorage.removeItem(PREV);
    localStorage.removeItem(TRIES);
  }
  // A style switch that never reached the game (the phone ran out of memory and reloaded the page, say) goes
  // back to the style it came from, so a phone can't get stuck in a style it can't draw.
  const prev = localStorage.getItem(PREV);
  if (prev !== null) {
    const tries = Number(localStorage.getItem(TRIES) ?? 0) + 1;
    if (tries < 2) localStorage.setItem(TRIES, String(tries));
    else {
      localStorage.setItem(KEY, prev);
      localStorage.removeItem(PREV);
      localStorage.removeItem(TRIES);
    }
  }
  if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, 'ny');
} catch {
  /* no storage: the 2D game's default */
}

/** The game started in the chosen style: keep it. */
export function artStyleWorks(): void {
  try {
    localStorage.removeItem(PREV);
    localStorage.removeItem(TRIES);
  } catch {
    /* ignore */
  }
}
