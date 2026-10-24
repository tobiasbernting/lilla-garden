import { SEASONS, SEASON_NAMES, T } from '../../shared/src/index.ts';
import type { Game } from './game.ts';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function adminPage(game: Game, envOverride: string | undefined, flash = ''): string {
  const w = game.world;
  const online = game.onlinePlayers();
  const minutes = Math.floor(w.timeMs / 60000);
  const seconds = Math.floor((w.timeMs % 60000) / 1000);
  const options = [`<option value="auto"${w.seasonOverride ? '' : ' selected'}>Automatiskt (kalender${envOverride ? `, env: ${esc(envOverride)}` : ''})</option>`]
    .concat(SEASONS.map((s) => `<option value="${s}"${w.seasonOverride === s ? ' selected' : ''}>${SEASON_NAMES[s]}</option>`))
    .join('');
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${T.title} – ${T.admin}</title>
<style>
body{font-family:system-ui,sans-serif;background:#f3efe4;color:#2b2520;margin:0;padding:1.5rem;max-width:40rem}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.5rem}
.card{background:#fff;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 2px 8px #0001;margin-bottom:1rem}
button,select{font:inherit;padding:.5rem .9rem;border-radius:8px;border:1px solid #c9bda5;background:#fff}
button{background:#6b9a3a;color:#fff;border-color:#4e7a26;cursor:pointer}
button.alt{background:#fff;color:#2b2520}
.flash{background:#e6f2d6;border:1px solid #9bc46a;padding:.6rem .9rem;border-radius:8px}
form{display:inline-block;margin-right:.5rem}
ul{padding-left:1.2rem}
</style></head><body>
<h1>🌱 ${T.title} – ${T.admin}</h1>
${flash ? `<p class="flash">${esc(flash)}</p>` : ''}
<div class="card">
  <p><strong>${T.day.replace('{day}', String(w.day))}</strong>, ${minutes} min ${seconds} s in på dagen · ${T.season}: <strong>${SEASON_NAMES[game.season()]}</strong></p>
  <p>${T.players} ${T.online.toLowerCase()}: ${online.length ? online.map(esc).join(', ') : `<em>${T.nobodyOnline}</em>`}</p>
  <p>Spelare totalt: ${Object.keys(w.players).length} · Djur: ${Object.keys(w.animals).length} · Grödor: ${Object.keys(w.crops).length} · Saker: ${Object.keys(w.objects).length}</p>
</div>
<div class="card">
  <h2>${T.seasonOverride}</h2>
  <form method="post" action="/admin/season"><select name="season">${options}</select> <button>Spara</button></form>
</div>
<div class="card">
  <h2>Världen</h2>
  <form method="post" action="/admin/save"><button class="alt">${T.saveNow}</button></form>
  <form method="post" action="/admin/skipday"><button class="alt">${T.skipDay}</button></form>
  <form method="post" action="/admin/evening"><button class="alt">Gör kväll</button></form>
  <form method="post" action="/admin/morning"><button class="alt">Gör morgon</button></form>
</div>
<div class="card">
  <h2>${T.players}</h2>
  <ul>${Object.values(w.players)
    .map((p) => `<li>${esc(p.name)} – ${p.coins} ${T.coins}${p.online ? ' · <strong>online</strong>' : ''}</li>`)
    .join('')}</ul>
</div>
<p><a href="/">Till spelet</a></p>
</body></html>`;
}
