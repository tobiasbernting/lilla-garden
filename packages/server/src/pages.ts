// Server-rendered pages around the game: the gate (/access), invite links (/join), the parent login and the
// access sections of the parent page. Swedish, plain HTML, no external resources.
import { T } from '../../shared/src/index.ts';
import type { Access, Device, Gate, ParentSession } from './access.ts';
import { otpauthUri } from './totp.ts';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const STYLE = `
body{font-family:system-ui,sans-serif;background:#f3efe4;color:#2b2520;margin:0;padding:1.5rem;max-width:44rem}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.5rem}h3{font-size:1rem;margin:.8rem 0 .3rem}
.card{background:#fff;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 2px 8px #0001;margin-bottom:1rem}
button,select,input{font:inherit;padding:.5rem .9rem;border-radius:8px;border:1px solid #c9bda5;background:#fff}
input[type=checkbox]{padding:0}
button{background:#6b9a3a;color:#fff;border-color:#4e7a26;cursor:pointer}
button.alt{background:#fff;color:#2b2520}
button.bad{background:#b5452f;border-color:#8c2f1d}
.flash{background:#e6f2d6;border:1px solid #9bc46a;padding:.6rem .9rem;border-radius:8px}
.warn{background:#fbe3d9;border:1px solid #d9876a;padding:.6rem .9rem;border-radius:8px}
form{display:inline-block;margin:0 .5rem .4rem 0}
form.block{display:block}
label{display:inline-block;margin:.2rem .8rem .2rem 0}
ul{padding-left:1.2rem}
.muted{color:#7a6f63;font-size:.9rem}
.code{font:700 2rem ui-monospace,monospace;letter-spacing:.2em}
.codein{font:700 1.4rem ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase;width:12rem}
.dev{border-top:1px solid #eee3cf;padding:.6rem 0}
.link{width:100%;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:.85rem}
.num{width:4rem}
table{border-collapse:collapse;width:100%;font-size:.85rem}td{padding:.2rem .4rem;border-top:1px solid #eee3cf;vertical-align:top}
`;

export function layout(title: string, body: string, nonce: string, script = ''): string {
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style nonce="${nonce}">${STYLE}</style></head><body>
${body}
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body></html>`;
}

const fmt = (ms: number): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));

const spaced = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

// ---- the gate ----

const POLL = `
const go=()=>fetch('/api/me',{cache:'no-store'}).then(r=>{if(r.ok)location.replace('/');}).catch(()=>{});
setInterval(go,5000);`;

export function accessPage(gate: Gate, device: Device | null, access: Access, nonce: string, parentLink = true): string {
  const s = access.settings;
  let body: string;
  switch (gate) {
    case 'pending':
      body = `<h1>⏳ Nästan klart!</h1>
<div class="card"><p>En förälder på gården måste godkänna <strong>${esc(device!.name)}</strong> innan du kan spela.</p>
<p>Om föräldern frågar, visa den här koden:</p><p class="code">${spaced(device!.code)}</p>
<p class="muted">Sidan öppnar spelet av sig själv när du är godkänd.</p></div>`;
      break;
    case 'paused':
      body = `<h1>⏸️ Pausad</h1><div class="card"><p>En förälder har pausat den här enheten. Fråga en vuxen.</p></div>`;
      break;
    case 'closed':
      body = `<h1>🌙 Gården är stängd</h1><div class="card"><p>Djuren sover. Gården är stängd just nu.</p></div>`;
      break;
    case 'guests-closed':
      body = `<h1>🌙 Gården är stängd för gäster</h1><div class="card"><p>Just nu får bara familjen vara på gården. Välkommen tillbaka en annan gång!</p></div>`;
      break;
    case 'hours':
      body = `<h1>🌙 Gården är stängd</h1><div class="card"><p>Gården är öppen ${esc(s.from ?? '')}–${esc(s.to ?? '')}. Välkommen tillbaka då!</p></div>`;
      break;
    case 'unknown':
      body = `<h1>🔒 ${T.title}</h1><div class="card"><p>Det här är en privat gård. För att komma in behöver du en kod från en förälder på gården.</p>
${codeForm('')}</div>`;
      break;
    case 'ok':
      body = `<h1>🌱 ${T.title}</h1><div class="card"><p><a href="/">Till spelet</a></p></div>`;
      break;
  }
  if (parentLink) body += `<p class="muted"><a href="/admin">Förälder? Logga in</a></p>`;
  return layout(T.title, body, nonce, gate === 'unknown' ? '' : POLL);
}

/** The code field: typed on the start page, or filled in from a link (/join#CODE). */
const codeForm = (error: string): string => `${error ? `<p class="warn">${esc(error)}</p>` : ''}
<form method="post" action="/join" class="block">
<p><label>Kod<br><input name="code" id="code" required maxlength="20" placeholder="ABCD-1234" autocomplete="off" autocapitalize="characters" spellcheck="false" class="codein"></label></p>
<p><label>Vem är du?<br><input name="name" maxlength="40" placeholder="T.ex. Kalle, iPad" autocomplete="off"></label></p>
<p><button>Kom in</button></p>
</form>`;

export function joinPage(nonce: string, error = ''): string {
  const body = `<h1>🌱 Välkommen till ${T.title}!</h1>
<div class="card">
<p>Skriv koden du har fått och vem du är, så att föräldrarna på gården ser vem som kommit.</p>
${codeForm(error)}
</div>`;
  // A link carries the code in its #fragment, so it never reaches logs or proxies; take it out of the address bar too
  const script = `
const t=decodeURIComponent(location.hash.slice(1));
if(t){document.getElementById('code').value=t;history.replaceState(null,'','/join');}`;
  return layout(`${T.title} – kom in`, body, nonce, script);
}

export function loginPage(nonce: string, totp: boolean, error = ''): string {
  const body = `<h1>🌱 ${T.title} – ${T.admin}</h1>
${error ? `<p class="warn">${esc(error)}</p>` : ''}
<div class="card"><form method="post" action="/admin/login" class="block">
<p><label>Lösenord<br><input type="password" name="password" required autocomplete="current-password"></label></p>
${totp ? `<p><label>Kod från appen<br><input name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" required autocomplete="one-time-code"></label></p>` : ''}
<p><button>Logga in</button></p></form></div>
<p class="muted"><a href="/access">Tillbaka</a></p>`;
  return layout(`${T.title} – logga in`, body, nonce);
}

// ---- the parent page ----

const GATE_TEXT: Record<Gate, string> = {
  ok: 'kan spela',
  unknown: '',
  pending: 'väntar',
  paused: 'pausad',
  closed: 'stängt',
  'guests-closed': 'stängt för gäster',
  hours: 'utanför speltiden',
};

const EVENTS: Record<string, string> = {
  login: 'inloggning',
  'login-failed': 'misslyckad inloggning',
  'login-blocked': 'inloggning spärrad',
  invite: 'ny kod',
  'invite-deleted': 'kod borttagen',
  join: 'kom in',
  'join-waiting': 'väntar',
  'join-blocked': 'koder spärrade',
  reopened: 'öppnad igen',
  'join-refused': 'fel kod',
  approved: 'godkänd',
  denied: 'nekad',
  removed: 'borttagen',
  paused: 'pausad',
  unpaused: 'släppt på',
  'device-added': 'familjeenhet',
  players: 'karaktärer',
  character: 'ny karaktär',
  mode: 'vem får komma in',
  hours: 'speltid',
  voice: 'röstprat',
  'totp-on': 'tvåsteg på',
  'totp-off': 'tvåsteg av',
  refused: 'stoppad',
};

export interface AccessView {
  access: Access;
  session: ParentSession;
  players: { id: string; name: string }[];
  /** device id → characters online from it */
  online: Map<string, string[]>;
  /** device id of the browser looking at the page */
  thisDevice: string | null;
  /** Offer to make this browser a family device (not on a separate parent server) */
  canAddThisDevice: boolean;
}

export function accessSections(v: AccessView): string {
  const { access, session } = v;
  const st = access.settings;
  const playerName = new Map(v.players.map((p) => [p.id, p.name]));
  const mode = (m: string, label: string) => `<label><input type="radio" name="mode" value="${m}"${st.mode === m ? ' checked' : ''}> ${label}</label>`;
  const voice = (m: string, label: string) => `<label><input type="radio" name="voice" value="${m}"${access.voicePolicy() === m ? ' checked' : ''}> ${label}</label>`;

  const pending = access.pending();
  const pendingHtml = pending.length
    ? pending
        .map(
          (d) => `<div class="dev"><strong>${esc(d.name)}</strong> · ${d.kind === 'family' ? 'familj' : 'gäst'} · inbjudan: ${esc(d.inviteLabel)}<br>
<span class="code">${spaced(d.code)}</span><br><span class="muted">${fmt(d.createdAt)} · ${esc(d.lastIp)} · ${esc(d.userAgent.slice(0, 80))}</span><br>
<form method="post" action="/admin/access/approve"><input type="hidden" name="id" value="${d.id}"><button>Godkänn</button></form>
<form method="post" action="/admin/access/remove"><input type="hidden" name="id" value="${d.id}"><button class="bad">Neka</button></form></div>`,
        )
        .join('')
    : '<p class="muted">Ingen väntar.</p>';

  const devices = access.approved();
  const deviceHtml = devices.length
    ? devices
        .map((d) => {
          const online = v.online.get(d.id) ?? [];
          const chars =
            d.kind === 'family'
              ? '<span class="muted">Får spela alla karaktärer.</span>'
              : `<form method="post" action="/admin/access/players" class="block"><input type="hidden" name="id" value="${d.id}">
${v.players.map((p) => `<label><input type="checkbox" name="player" value="${p.id}"${d.players.includes(p.id) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}
<label>Får skapa <input type="number" name="newPlayers" min="0" max="3" value="${d.newPlayers}" class="num"> nya</label>
<button class="alt">Spara</button></form>`;
          const gate = access.gate(d);
          return `<div class="dev"><strong>${esc(d.name)}</strong>${d.id === v.thisDevice ? ' (den här webbläsaren)' : ''} · ${d.kind === 'family' ? 'familj' : 'gäst'} · ${GATE_TEXT[gate]}
${online.length ? ` · <strong>spelar nu: ${online.map(esc).join(', ')}</strong>` : ''}<br>
<span class="muted">Inbjudan: ${esc(d.inviteLabel)} · senast ${fmt(d.lastSeenAt)} från ${esc(d.lastIp)}${d.kind === 'guest' && d.players.length ? ` · spelar som ${d.players.map((p) => esc(playerName.get(p) ?? '?')).join(', ')}` : ''}</span><br>
${chars}
<form method="post" action="/admin/access/reopen"><input type="hidden" name="id" value="${d.id}"><button class="alt" title="Ny kod om enheten glömt bort gården (rensad webbläsare, ny webbläsare). Behåller karaktärerna.">Öppna igen</button></form>
<form method="post" action="/admin/access/pause"><input type="hidden" name="id" value="${d.id}"><input type="hidden" name="paused" value="${d.paused ? '0' : '1'}"><button class="alt">${d.paused ? 'Släpp på' : 'Pausa'}</button></form>
<form method="post" action="/admin/access/remove"><input type="hidden" name="id" value="${d.id}"><button class="bad">Ta bort</button></form></div>`;
        })
        .join('')
    : '<p class="muted">Inga enheter än.</p>';

  const invites = access.activeInvites();
  const inviteHtml = invites.length
    ? `<ul>${invites
        .map(
          (i) =>
            `<li><strong>${esc(i.label)}</strong> · ${i.deviceId ? 'öppna igen' : i.kind === 'family' ? 'familj' : 'gäst'} · ${i.used ?? 0}/${i.maxDevices ?? 1} enheter · ${
              i.approval === 'auto' ? 'släpps in direkt' : 'du godkänner'
            } · gäller till ${fmt(i.expiresAt)} <form method="post" action="/admin/access/uninvite"><input type="hidden" name="id" value="${i.id}"><button class="alt">Ta bort</button></form></li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Inga aktiva koder.</p>';

  const nc = session.newCode;
  const newCode = nc
    ? `<div class="flash"><p><strong>${nc.reopen ? `Ny kod för ${esc(nc.label)}` : `Kod för ${esc(nc.label)}`}</strong> – visas bara nu. Ge den bara till ${esc(nc.label)}.</p>
<p class="code">${esc(nc.code)}</p>
<p>De skriver koden på startsidan, eller öppnar länken:</p>
<p><input class="link" id="newlink" readonly value="${esc(nc.link)}"></p><p><button class="alt" id="copy" type="button">Kopiera länken</button></p></div>`
    : '';
  const guestsShut = st.mode !== 'open' ? `<p class="warn">Gäster kommer bara in när "Familjen och godkända gäster" är valt ovan.</p>` : '';

  const totp = session.totpPending
    ? `<p>Lägg till den här nyckeln i en app (t.ex. Google Authenticator, 1Password, Bitwarden):</p>
<p><code>${session.totpPending.replace(/(.{4})/g, '$1 ').trim()}</code></p>
<p><a href="${esc(otpauthUri(session.totpPending, 'förälder'))}">Öppna i appen</a> (på telefonen)</p>
<form method="post" action="/admin/access/totp-confirm"><input name="code" inputmode="numeric" placeholder="Koden i appen" required> <button>Slå på</button></form>
<form method="post" action="/admin/access/totp-cancel"><button class="alt">Avbryt</button></form>`
    : access.totpEnabled()
      ? `<p>✅ På. Inloggning kräver lösenord och en kod från appen.</p>
<form method="post" action="/admin/access/totp-off"><input name="code" inputmode="numeric" placeholder="Kod för att stänga av" required> <button class="bad">Stäng av</button></form>`
      : `<p class="warn">Av. Slå på det: då räcker det inte att någon får tag i lösenordet.</p>
<form method="post" action="/admin/access/totp-start"><button>Slå på tvåstegsinloggning</button></form>`;

  const log = access.log
    .slice(-40)
    .reverse()
    .map((e) => `<tr><td>${fmt(e.at)}</td><td>${esc(EVENTS[e.event] ?? e.event)}</td><td>${esc(e.detail)}</td><td>${esc(e.ip)}</td></tr>`)
    .join('');

  return `
<div class="card">
  <h2>🔒 Vem får komma in?</h2>
  <form method="post" action="/admin/access/mode" class="block">
    ${mode('closed', 'Stängt för alla')}<br>${mode('family', 'Bara familjen')}<br>${mode('open', 'Familjen och godkända gäster')}<br>
    <button>Spara</button>
  </form>
  <h3>Speltid</h3>
  <form method="post" action="/admin/access/hours" class="block">
    <label>Från <input type="time" name="from" value="${st.from ?? ''}"></label>
    <label>Till <input type="time" name="to" value="${st.to ?? ''}"></label>
    <button>Spara</button> <span class="muted">Tomt = när som helst. Svensk tid, gäller alla enheter.</span>
  </form>
  <h3>📞 Röstprat</h3>
  <form method="post" action="/admin/access/voice" class="block">
    ${voice('off', 'Av')}<br>${voice('family', 'Bara familjen')}<br>${voice('open', 'Familjen och gästerna')}<br>
    <button>Spara</button>
  </form>
  <p class="muted">Rösten går direkt mellan enheterna och sparas aldrig. De som är i samma rum (samma wifi) hör inte varandra genom spelet: en enhet per rum är högtalare och pratar med de andra rummen.</p>
</div>
${
  pending.length
    ? `<div class="card">
  <h2>⏳ Väntar på godkännande (${pending.length})</h2>
  <p class="muted">Godkänn bara om du vet vem det är. Fråga gärna efter siffrorna som syns på deras skärm.</p>
  ${pendingHtml}
</div>`
    : ''
}
<div class="card">
  <h2>✉️ Koder för att komma in</h2>
  ${newCode}
  <p class="muted">Gör en kod för en person eller en familj du känner. Koden släpper in så många enheter du väljer och slutar sedan fungera.</p>
  <form method="post" action="/admin/access/invite" class="block">
    <p><label>Vem? <input name="label" maxlength="40" required placeholder="T.ex. Kalle, Familjen Svensson"></label></p>
    <p><label><input type="radio" name="kind" value="guest" checked> Gäst (spelar bara sina egna karaktärer)</label><br>
    <label><input type="radio" name="kind" value="family"> Familj (alla karaktärer)</label></p>
    <p><label>Antal enheter <input type="number" name="maxDevices" min="1" max="5" value="1" class="num"></label>
    <label>Får skapa <input type="number" name="newPlayers" min="0" max="3" value="1" class="num"> karaktär(er) per enhet</label></p>
    <p><label>Koden gäller <select name="hours"><option value="1">1 timme</option><option value="24">1 dygn</option><option value="72">3 dygn</option><option value="168" selected>7 dagar</option><option value="720">30 dagar</option></select></label></p>
    <p><label><input type="radio" name="approval" value="auto" checked> Släpp in direkt (du får en notis)</label><br>
    <label><input type="radio" name="approval" value="parent"> Jag vill godkänna varje enhet</label></p>
    <p><button>Skapa kod</button></p>
  </form>
  ${guestsShut}
  <h3>Aktiva koder</h3>
  ${inviteHtml}
</div>
<div class="card">
  <h2>📱 Enheter som får spela (${devices.length})</h2>
  ${deviceHtml}
  ${
    v.thisDevice || !v.canAddThisDevice
      ? ''
      : `<h3>Den här webbläsaren</h3><form method="post" action="/admin/access/this-device" class="block">
<input name="name" maxlength="40" required placeholder="T.ex. Barnens surfplatta"> <button class="alt">Gör till familjeenhet</button></form>
<p class="muted">Logga in här på barnens surfplatta och tryck på knappen, så behövs ingen kod för den.</p>`
  }
</div>
<div class="card">
  <h2>🔑 Tvåstegsinloggning för föräldrar</h2>
  ${totp}
</div>
<div class="card">
  <h2>📜 Logg</h2>
  <table>${log || '<tr><td class="muted">Inget än.</td></tr>'}</table>
</div>
<form method="post" action="/admin/logout"><button class="alt">Logga ut</button></form>`;
}

export const COPY_SCRIPT = `
const b=document.getElementById('copy');
if(b)b.addEventListener('click',()=>{const i=document.getElementById('newlink');i.select();navigator.clipboard?.writeText(i.value).catch(()=>{});b.textContent='Kopierad!';});`;
