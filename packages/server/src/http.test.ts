import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { WebSocket } from 'ws';
import { Access } from './access.ts';
import { MemoryAccessStore } from './db/accessStore.ts';
import { MemoryStore } from './db/store.ts';
import { Game } from './game.ts';
import { createServer } from './http.ts';

const PW = 'correct horse battery';
let server: http.Server;
let base = '';
let host = '';
let game: Game;
let access: Access;

beforeAll(async () => {
  game = new Game(new MemoryStore(), { autoStart: false });
  await game.start();
  access = new Access(new MemoryAccessStore(), { parentPassword: PW });
  await access.load();
  server = createServer(game, { clientDist: null, seasonEnv: undefined, access });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = `http://${host}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const cookieFrom = (res: Response): string =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
const post = (path: string, form: Record<string, string>, cookie = '', origin = base) =>
  fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
const get = (path: string, cookie = '') => fetch(base + path, { redirect: 'manual', headers: { cookie } });

const openSocket = (cookie: string, origin = base): Promise<{ ws: WebSocket; closed: Promise<number> } | { refused: number }> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}/ws`, { headers: { cookie, origin } });
    ws.on('unexpected-response', (_req, res) => resolve({ refused: res.statusCode ?? 0 }));
    ws.on('open', () => resolve({ ws, closed: new Promise((r) => ws.on('close', (code) => r(code))) }));
    ws.on('error', () => {});
  });

describe('the gate', () => {
  it('lets strangers see nothing but the gate page', async () => {
    expect((await get('/')).headers.get('location')).toBe('/access');
    expect((await get('/api/players')).status).toBe(403);
    expect((await get('/api/me')).status).toBe(403);
    expect((await get('/admin')).headers.get('location')).toBe('/admin/login');
    expect((await post('/admin/skipday', {})).status).toBe(401);
    expect(await (await get('/health')).json()).toEqual({ ok: true });
    expect(await openSocket('')).toEqual({ refused: 403 });
    const page = await get('/access');
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await page.text()).toContain('privat gård');
  });

  it('runs the whole invite → approval → play flow, and kicks the device when access is taken away', async () => {
    // parent logs in
    expect((await post('/admin/login', { password: 'wrong' })).status).toBe(401);
    const login = await post('/admin/login', { password: PW });
    expect(login.status).toBe(303);
    const parent = cookieFrom(login);
    expect(parent).toMatch(/^lg_parent=/);
    expect((await get('/admin', parent)).status).toBe(200);

    // forms from other sites are refused
    expect((await post('/admin/access/mode', { mode: 'open' }, parent, 'https://evil.example')).status).toBe(403);
    expect((await post('/admin/access/mode', { mode: 'open' }, parent)).status).toBe(303);
    expect(access.settings.mode).toBe('open');

    const fam = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;

    // an invite link, shown once on the parent page
    await post('/admin/access/invite', { label: 'Kusin Anna', kind: 'guest', hours: '24', newPlayers: '1' }, parent);
    const pageWithLink = await (await get('/admin', parent)).text();
    const link = /value="(http[^"]+\/join#[^"]+)"/.exec(pageWithLink)?.[1];
    expect(link).toBeTruthy();
    expect(await (await get('/admin', parent)).text()).not.toContain(link!);
    const token = link!.split('#')[1]!;

    // the guest redeems it and waits for approval
    const joined = await post('/join', { token, name: 'Annas iPad' });
    expect(joined.headers.get('location')).toBe('/access');
    const guest = cookieFrom(joined);
    expect(guest).toMatch(/^lg_device=/);
    expect(await (await get('/access', guest)).text()).toContain('måste godkänna');
    expect((await get('/api/players', guest)).status).toBe(403);
    expect(await openSocket(guest)).toEqual({ refused: 403 });
    // the link does not work twice
    expect((await post('/join', { token, name: 'Någon annan' })).status).toBe(403);

    const pending = access.pending()[0]!;
    expect(await (await get('/admin', parent)).text()).toContain(pending.code.slice(0, 3));
    await post('/admin/access/approve', { id: pending.id }, parent);

    // approved: the guest sees only their own characters and may create one
    expect(await (await get('/api/players', guest)).json()).toEqual([]);
    expect(await (await get('/api/me', guest)).json()).toMatchObject({ gate: 'ok', canCreate: true });
    const created = await fetch(`${base}/api/players`, { method: 'POST', headers: { cookie: guest, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Anna' }) });
    expect(created.status).toBe(201);
    const anna = (await created.json()) as { id: string };
    expect(((await (await get('/api/players', guest)).json()) as { id: string }[]).map((p) => p.id)).toEqual([anna.id]);
    const second = await fetch(`${base}/api/players`, { method: 'POST', headers: { cookie: guest, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Anna 2' }) });
    expect(second.status).toBe(403);

    // sockets: wrong origin refused; someone else's character closes the socket
    expect(await openSocket(guest, 'https://evil.example')).toEqual({ refused: 403 });
    const s1 = await openSocket(guest);
    if (!('ws' in s1)) throw new Error('refused');
    s1.ws.send(JSON.stringify({ t: 'hello', playerId: fam.id }));
    expect(await s1.closed).toBe(4003);

    // playing as their own character works until the parent removes the device
    const s2 = await openSocket(guest);
    if (!('ws' in s2)) throw new Error('refused');
    const welcomed = new Promise<void>((r) => s2.ws.on('message', (d) => String(d).includes('"welcome"') && r()));
    s2.ws.send(JSON.stringify({ t: 'hello', playerId: anna.id }));
    await welcomed;
    expect(game.onlinePlayers()).toEqual(['Anna']);
    await post('/admin/access/remove', { id: pending.id }, parent);
    expect(await s2.closed).toBe(4003);
    expect((await get('/api/players', guest)).status).toBe(403);
  });

  it('makes the parent’s own browser a family device', async () => {
    const parent = cookieFrom(await post('/admin/login', { password: PW }));
    const res = await post('/admin/access/this-device', { name: 'Barnens platta' }, parent);
    const device = cookieFrom(res);
    expect(device).toMatch(/^lg_device=/);
    expect((await get('/api/players', device)).status).toBe(200);
    await post('/admin/logout', {}, parent);
    expect((await get('/admin', parent)).headers.get('location')).toBe('/admin/login');
  });
});
