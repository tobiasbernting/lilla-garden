import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { isSeason, type ClientMsg, type ServerMsg } from '../../shared/src/index.ts';
import type { Game, Link } from './game.ts';
import { adminPage } from './admin.ts';

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

const parseForm = (body: string): Record<string, string> => Object.fromEntries(new URLSearchParams(body));

const json = (res: http.ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

export function createServer(game: Game, opts: { clientDist: string | null; seasonEnv: string | undefined }): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = url.pathname;
      if (p === '/health') return json(res, 200, { ok: true, day: game.world.day, online: game.onlinePlayers().length });
      if (p === '/api/players' && req.method === 'GET') return json(res, 200, game.playerSummaries());
      if (p === '/api/players' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { name?: string; appearance?: { skin?: string; hair?: string; hairStyle?: string }; shirt?: string };
        const name = String(body.name ?? '').trim();
        if (!name) return json(res, 400, { error: 'name' });
        const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
        const style = typeof body.appearance?.hairStyle === 'string' ? body.appearance.hairStyle.slice(0, 16) : 'short';
        const created = game.createPlayer(
          name,
          { skin: color(body.appearance?.skin, '#f1c9a5'), hair: color(body.appearance?.hair, '#5a3a1e'), hairStyle: style },
          typeof body.shirt === 'string' ? body.shirt : undefined,
        );
        if (!created) return json(res, 409, { error: 'full' });
        return json(res, 201, created);
      }
      if (p === '/api/season') return json(res, 200, { season: game.season() });
      if (p === '/admin' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(adminPage(game, opts.seasonEnv, url.searchParams.get('m') ?? ''));
      }
      if (p.startsWith('/admin/') && req.method === 'POST') {
        const form = parseForm(await readBody(req));
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
        }
        res.writeHead(303, { location: `/admin?m=${encodeURIComponent(m)}` });
        return res.end();
      }
      if (opts.clientDist && req.method === 'GET') return serveStatic(opts.clientDist, p, res);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end('error');
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws: WebSocket) => {
    const link: Link = {
      send: (msg: ServerMsg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
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
      if (msg && typeof msg === 'object' && typeof msg.t === 'string') handle(msg);
    });
    ws.on('close', () => game.disconnect(link));
    ws.on('error', () => game.disconnect(link));
  });

  return server;
}

function serveStatic(root: string, urlPath: string, res: http.ServerResponse): void {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // SPA fallback
  const ext = path.extname(file);
  const immutable = rel.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\./.test(rel);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}
