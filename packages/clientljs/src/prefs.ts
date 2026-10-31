// Imported before anything else. There is one art style now; forget the style choice older versions saved.
try {
  for (const k of ['lilla-garden.art', 'lilla-garden.art.prev', 'lilla-garden.art.tries']) localStorage.removeItem(k);
} catch {
  /* no storage */
}
