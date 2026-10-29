import { SEASONS, SEASON_NAMES, T } from '../../shared/src/index.ts';
import type { Game } from './game.ts';
import { esc, layout } from './pages.ts';

/** The parent page. `accessHtml` holds the access control sections (empty when access control is off). */
export function adminPage(game: Game, envOverride: string | undefined, flash: string, nonce: string, accessHtml = '', script = ''): string {
  const w = game.world;
  const online = game.onlinePlayers();
  const minutes = Math.floor(w.timeMs / 60000);
  const seconds = Math.floor((w.timeMs % 60000) / 1000);
  const options = [`<option value="auto"${w.seasonOverride ? '' : ' selected'}>Automatiskt (kalender${envOverride ? `, env: ${esc(envOverride)}` : ''})</option>`]
    .concat(SEASONS.map((s) => `<option value="${s}"${w.seasonOverride === s ? ' selected' : ''}>${SEASON_NAMES[s]}</option>`))
    .join('');
  const body = `<h1>🌱 ${T.title} – ${T.admin}</h1>
${flash ? `<p class="flash">${esc(flash)}</p>` : ''}
${accessHtml ? '' : '<p class="warn">Åtkomstkontrollen är avstängd (ACCESS=open): alla som når servern kan spela och öppna den här sidan. Använd bara så på ett hemmanätverk.</p>'}
<div class="card">
  <p><strong>${T.day.replace('{day}', String(w.day))}</strong>, ${minutes} min ${seconds} s in på dagen · ${T.season}: <strong>${SEASON_NAMES[game.season()]}</strong></p>
  <p>${T.players} ${T.online.toLowerCase()}: ${online.length ? online.map(esc).join(', ') : `<em>${T.nobodyOnline}</em>`}</p>
  <p>Spelare totalt: ${Object.keys(w.players).length} · Djur: ${Object.keys(w.animals).length} · Grödor: ${Object.keys(w.crops).length} · Saker: ${Object.keys(w.objects).length}</p>
</div>
${accessHtml}
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
<p><a href="/">Till spelet</a></p>`;
  return layout(`${T.title} – ${T.admin}`, body, nonce, script);
}
