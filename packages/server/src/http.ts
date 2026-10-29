import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { isSeason, type ClientMsg, type ServerMsg } from '../../shared/src/index.ts';
import type { Game, Link } from './game.ts';
import { adminPage } from './admin.ts';
import { DEVICE_COOKIE, PARENT_COOKIE, type Access, type AccessMode, type Device } from './access.ts';
import { COPY_SCRIPT, accessPage, accessSections, joinPage, loginPage } from './pages.ts';
import { newTotpSecret } from './totp.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Fetched by the browser without cookies (app manifest and its icons); nothing private in them. */
const PUBLIC_FILES = new Set(['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']);

/** WebSocket close code that tells the client to go to the gate page instead of reconnecting. */
export const CLOSE_NO_ACCESS = 4003;

export function findClientDist(): string | null {
  const env = process.env.CLIENT_DIST;
  const candidates = [env, path.resolve(here, '../../client/dist'), path.resolve(here, '../../../../client/dist')].filter(
    (c): c is string => !!c,
  );
  return candidates.find((c) => fs.existsSync(path.join(c, 'index.html'))) ?? null;
}

const readBody = (req: http.IncomingMessage, limit = 64 * 1024): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > limit) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const json = (res: http.ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

const html = (res: http.ServerResponse, status: number, body: string): void => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
};

const redirect = (res: http.ServerResponse, to: string): void => {
  res.writeHead(303, { location: to, 'cache-control': 'no-store' });
  res.end();
};

const GAME_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
  "connect-src 'self'; worker-src 'self' blob:; media-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; " +
  "frame-ancestors 'none'; form-action 'self'";
const pageCsp = (nonce: string): string =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export interface ServerOptions {
  clientDist: string | null;
  seasonEnv: string | undefined;
  /** null: no access control at all (ACCESS=open, home network only) */
  access?: Access | null;
  /** Trust X-Forwarded-For / CF-Connecting-IP / X-Forwarded-Proto (only behind a tunnel or proxy) */
  trustProxy?: boolean;
  /** The public address, e.g. https://gard.example.se (used for invite links, cookies and origin checks) */
  publicUrl?: string | undefined;
}

interface Conn {
  ws: WebSocket;
  deviceId: string | null;
  playerId: string | null;
}

export function createServer(game: Game, opts: ServerOptions): http.Server {
  const access = opts.access ?? null;
  const publicUrl = opts.publicUrl ? new URL(opts.publicUrl) : null;
  const conns = new Set<Conn>();

  const clientIp = (req: http.IncomingMessage): string => {
    if (opts.trustProxy) {
      const cf = req.headers['cf-connecting-ip'];
      if (typeof cf === 'string' && cf) return cf;
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff) return xff.split(',')[0]!.trim();
    }
    return req.socket.remoteAddress ?? '?';
  };
  const secure = (req: http.IncomingMessage): boolean =>
    publicUrl?.protocol === 'https:' || (!!opts.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const origin = (req: http.IncomingMessage): string => publicUrl?.origin ?? `${secure(req) ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`;
  /** Requests that change something must come from our own pages (no cross-site forms or sockets). */
  const sameOrigin = (req: http.IncomingMessage): boolean => {
    const o = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    // browsers send "null" in some privacy modes; then only the fetch metadata can vouch for it
    if (o === 'null') return site === 'same-origin';
    if (o) {
      try {
        const host = new URL(o).host;
        return host === req.headers.host || host === publicUrl?.host;
      } catch {
        return false;
      }
    }
    return !site || site === 'same-origin' || site === 'none';
  };
  const cookie = (req: http.IncomingMessage, res: http.ServerResponse, name: string, value: string, maxAgeS: number, cookiePath = '/'): void => {
    const c = `${name}=${encodeURIComponent(value)}; Path=${cookiePath}; Max-Age=${maxAgeS}; HttpOnly; SameSite=Strict${secure(req) ? '; Secure' : ''}`;
    const prev = res.getHeader('set-cookie');
    res.setHeader('set-cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), c]);
  };
  const deviceOf = (req: http.IncomingMessage): Device | null => access?.deviceFor(parseCookies(req.headers.cookie)[DEVICE_COOKIE]) ?? null;

  /** Closes connections that are no longer allowed (device removed or paused, world closed, outside play hours). */
  const enforce = (): void => {
    if (!access) return;
    for (const c of conns) {
      const d = c.deviceId ? access.device(c.deviceId) : null;
      if (!d || access.gate(d) !== 'ok' || (c.playerId && !access.mayPlay(d, c.playerId))) c.ws.close(CLOSE_NO_ACCESS, 'access');
    }
  };
  if (access) {
    access.onChange = enforce;
    const t1 = setInterval(enforce, 15_000);
    const t2 = setInterval(() => void access.cleanup(), 3_600_000);
    t1.unref();
    t2.unref();
  }

  const onlineByDevice = (): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const c of conns) {
      if (!c.deviceId || !c.playerId) continue;
      const name = game.world.players[c.playerId]?.name ?? '?';
      m.set(c.deviceId, [...(m.get(c.deviceId) ?? []), name]);
    }
    return m;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = url.pathname;
      const ip = clientIp(req);
      const nonce = crypto.randomBytes(16).toString('base64');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'same-origin');
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('cross-origin-opener-policy', 'same-origin');
      res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
      res.setHeader('x-robots-tag', 'noindex, nofollow');
      res.setHeader('content-security-policy', pageCsp(nonce));
      if (secure(req)) res.setHeader('strict-transport-security', 'max-age=31536000');

      if (p === '/health') return json(res, 200, access ? { ok: true } : { ok: true, day: game.world.day, online: game.onlinePlayers().length });
      if (p === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('User-agent: *\nDisallow: /\n');
      }
      if (access && req.method === 'POST' && !sameOrigin(req)) {
        await access.record('refused', `fel ursprung ${String(req.headers.origin ?? '')} → ${p}`, ip);
        return json(res, 403, { error: 'origin' });
      }

      // ---- the gate (only with access control on) ----
      let device: Device | null = null;
      if (access) {
        const cookies = parseCookies(req.headers.cookie);
        device = access.deviceFor(cookies[DEVICE_COOKIE]);
        if (device) access.seen(device, ip);

        if (p === '/access') return html(res, 200, accessPage(access.gate(device), device, access, nonce));
        if (p === '/api/me') {
          const gate = access.gate(device);
          return json(res, gate === 'ok' ? 200 : 403, { gate, ...(device ? { name: device.name, kind: device.kind, canCreate: access.mayCreate(device) } : {}) });
        }
        if (p === '/join' && req.method === 'GET') {
          if (device && device.status === 'approved') return redirect(res, '/');
          return html(res, 200, joinPage(nonce));
        }
        if (p === '/join' && req.method === 'POST') {
          if (device && device.status === 'approved') return redirect(res, '/');
          const form = new URLSearchParams(await readBody(req, 4096));
          const r = await access.redeem(form.get('token') ?? '', form.get('name') ?? '', ip, String(req.headers['user-agent'] ?? ''));
          if ('error' in r) {
            const msg =
              r.error === 'limit'
                ? 'För många försök. Vänta en stund.'
                : r.error === 'full'
                  ? 'Många väntar redan på att bli godkända. Försök igen senare.'
                  : 'Länken fungerar inte. Den kan redan vara använd eller för gammal – be om en ny.';
            return html(res, r.error === 'limit' ? 429 : 403, joinPage(nonce, msg));
          }
          cookie(req, res, DEVICE_COOKIE, r.token, 400 * 24 * 3600);
          return redirect(res, '/access');
        }

        // ---- parent ----
        if (p === '/admin/login' && req.method === 'GET') return html(res, 200, loginPage(nonce, access.totpEnabled()));
        if (p === '/admin/login' && req.method === 'POST') {
          const form = new URLSearchParams(await readBody(req, 4096));
          const r = await access.login(form.get('password') ?? '', form.get('code') ?? '', ip);
          if (!r.ok) return html(res, r.reason === 'limit' ? 429 : 401, loginPage(nonce, access.totpEnabled(), r.reason === 'limit' ? 'För många försök. Vänta en stund.' : 'Fel lösenord eller kod.'));
          cookie(req, res, PARENT_COOKIE, r.session, 8 * 3600, '/admin');
          return redirect(res, '/admin');
        }
        if (p === '/admin' || p.startsWith('/admin/')) {
          const sessionToken = cookies[PARENT_COOKIE];
          const session = access.session(sessionToken);
          if (!session) return req.method === 'GET' ? redirect(res, '/admin/login') : json(res, 401, { error: 'login' });
          if (p === '/admin' && req.method === 'GET') {
            const accessHtml = accessSections({
              access,
              session,
              players: Object.values(game.world.players).map((pl) => ({ id: pl.id, name: pl.name })),
              online: onlineByDevice(),
              thisDevice: device?.id ?? null,
            });
            delete session.newLink; // shown once
            return html(res, 200, adminPage(game, opts.seasonEnv, url.searchParams.get('m') ?? '', nonce, accessHtml, COPY_SCRIPT));
          }
          if (p.startsWith('/admin/access/') && req.method === 'POST') {
            const form = new URLSearchParams(await readBody(req));
            const id = form.get('id') ?? '';
            let m = '';
            switch (p.slice('/admin/access/'.length)) {
              case 'mode': {
                const mode = form.get('mode');
                if (mode === 'closed' || mode === 'family' || mode === 'open') {
                  await access.setMode(mode as AccessMode, ip);
                  m = 'Sparat';
                }
                break;
              }
              case 'hours':
                m = (await access.setHours(form.get('from') || null, form.get('to') || null, ip)) ? 'Speltiden sparad' : 'Fyll i både från och till (eller inget av dem)';
                break;
              case 'approve':
                await access.approve(id, ip);
                m = 'Godkänd';
                break;
              case 'remove':
                await access.remove(id, ip);
                m = 'Borttagen';
                break;
              case 'pause':
                await access.setPaused(id, form.get('paused') === '1', ip);
                m = form.get('paused') === '1' ? 'Pausad' : 'Släppt på';
                break;
              case 'players': {
                const known = form.getAll('player').filter((pid) => game.world.players[pid]);
                await access.setPlayers(id, known, Number(form.get('newPlayers') ?? 0), ip);
                m = 'Sparat';
                break;
              }
              case 'invite': {
                const r = await access.createInvite(
                  { label: form.get('label') ?? '', kind: form.get('kind') === 'family' ? 'family' : 'guest', hours: Number(form.get('hours') ?? 24), newPlayers: Number(form.get('newPlayers') ?? 1) },
                  ip,
                );
                session.newLink = `${origin(req)}/join#${r.token}`;
                break;
              }
              case 'uninvite':
                await access.deleteInvite(id, ip);
                m = 'Inbjudan borttagen';
                break;
              case 'this-device': {
                if (device) break;
                const r = await access.addFamilyDevice(form.get('name') ?? '', ip, String(req.headers['user-agent'] ?? ''));
                cookie(req, res, DEVICE_COOKIE, r.token, 400 * 24 * 3600);
                m = 'Den här webbläsaren är nu en familjeenhet';
                break;
              }
              case 'totp-start':
                session.totpPending = newTotpSecret();
                break;
              case 'totp-cancel':
                delete session.totpPending;
                break;
              case 'totp-confirm':
                if (session.totpPending && access.verifyTotpCode(session.totpPending, form.get('code') ?? '')) {
                  await access.setTotp(session.totpPending, ip);
                  delete session.totpPending;
                  m = 'Tvåstegsinloggning är på';
                } else m = 'Fel kod, försök igen';
                break;
              case 'totp-off':
                if (access.settings.totpSecret && access.verifyTotpCode(access.settings.totpSecret, form.get('code') ?? '')) {
                  await access.setTotp(null, ip);
                  m = 'Tvåstegsinloggning är av';
                } else m = 'Fel kod';
                break;
            }
            return redirect(res, `/admin${m ? `?m=${encodeURIComponent(m)}` : ''}`);
          }
          if (p === '/admin/logout' && req.method === 'POST') {
            access.logout(sessionToken);
            cookie(req, res, PARENT_COOKIE, '', 0, '/admin');
            return redirect(res, '/access');
          }
        } else if (access.gate(device) !== 'ok' && !PUBLIC_FILES.has(p)) {
          // Everything else is the game: only for approved devices, right now
          if (p.startsWith('/api/')) return json(res, 403, { gate: access.gate(device) });
          if (req.method === 'GET') return redirect(res, '/access');
          return json(res, 403, { error: 'access' });
        }
      }

      if (p === '/api/me') return json(res, 200, { gate: 'ok', canCreate: true }); // no access control
      if (p === '/api/players' && req.method === 'GET') {
        const all = game.playerSummaries();
        return json(res, 200, device && access ? access.visible(device, all) : all);
      }
      if (p === '/api/players' && req.method === 'POST') {
        if (device && access && !access.mayCreate(device)) return json(res, 403, { error: 'create' });
        const body = JSON.parse((await readBody(req)) || '{}') as { name?: string; appearance?: { skin?: string; hair?: string; hairStyle?: string }; shirt?: string };
        const name = String(body.name ?? '').trim().slice(0, 16);
        if (!name) return json(res, 400, { error: 'name' });
        const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
        const style = typeof body.appearance?.hairStyle === 'string' ? body.appearance.hairStyle.slice(0, 16) : 'short';
        const created = game.createPlayer(
          name,
          { skin: color(body.appearance?.skin, '#f1c9a5'), hair: color(body.appearance?.hair, '#5a3a1e'), hairStyle: style },
          typeof body.shirt === 'string' ? body.shirt : undefined,
        );
        if (!created) return json(res, 409, { error: 'full' });
        if (device && access) await access.created(device, created.id, created.name, ip);
        return json(res, 201, created);
      }
      if (p === '/api/season') return json(res, 200, { season: game.season() });
      if (p === '/admin' && req.method === 'GET') return html(res, 200, adminPage(game, opts.seasonEnv, url.searchParams.get('m') ?? '', nonce));
      if (p.startsWith('/admin/') && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
        let m = '';
        if (p === '/admin/season') {
          const s = form.season ?? 'auto';
          game.setSeasonOverride(s !== 'auto' && isSeason(s) ? s : null);
          m = 'Säsong uppdaterad';
        } else if (p === '/admin/save') {
          await game.flush();
          m = 'Sparat';
        } else if (p === '/admin/skipday') {
          game.skipDay();
          m = `Ny dag: ${game.world.day}`;
        } else if (p === '/admin/evening') {
          game.setTimeOfDay(0.72);
          m = 'Kvällen kommer';
        } else if (p === '/admin/morning') {
          game.setTimeOfDay(0.05);
          m = 'God morgon';
        } else if (p === '/admin/time') {
          const f = Number(form.fraction);
          if (Number.isFinite(f)) game.setTimeOfDay(f);
          m = 'Tiden ändrad';
        }
        return redirect(res, `/admin?m=${encodeURIComponent(m)}`);
      }
      if (opts.clientDist && req.method === 'GET') {
        res.setHeader('content-security-policy', GAME_CSP);
        return serveStatic(opts.clientDist, p, res);
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end('error');
    }
  });

  // The game socket: only for approved devices, from our own pages
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const refuse = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    const p = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (p !== '/ws') return refuse('404 Not Found');
    let device: Device | null = null;
    if (access) {
      if (!sameOrigin(req)) return refuse('403 Forbidden');
      device = deviceOf(req);
      if (access.gate(device) !== 'ok') return refuse('403 Forbidden');
      access.seen(device!, clientIp(req));
    }
    wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws, device));
  });

  const onSocket = (ws: WebSocket, device: Device | null): void => {
    const conn: Conn = { ws, deviceId: device?.id ?? null, playerId: null };
    conns.add(conn);
    const link: Link = {
      send: (msg: ServerMsg) => {
        if (ws.readyState !== ws.OPEN) return;
        try {
          ws.send(JSON.stringify(msg));
        } catch (e) {
          console.error('could not send', msg.t, e);
        }
      },
      close: () => ws.close(),
    };
    const handle = game.connect(link);
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString()) as ClientMsg;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
      if (msg.t === 'hello' && access) {
        // A device only plays the characters it was given
        const d = conn.deviceId ? access.device(conn.deviceId) : null;
        if (!d || !access.mayPlay(d, String(msg.playerId))) {
          ws.close(CLOSE_NO_ACCESS, 'access');
          return;
        }
        conn.playerId = String(msg.playerId);
      }
      handle(msg);
    });
    const gone = () => {
      conns.delete(conn);
      game.disconnect(link);
    };
    ws.on('close', gone);
    ws.on('error', gone);
  };

  return server;
}

function serveStatic(root: string, urlPath: string, res: http.ServerResponse): void {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // SPA fallback
  const ext = path.extname(file);
  const immutable = rel.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\./.test(rel);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'private, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}
