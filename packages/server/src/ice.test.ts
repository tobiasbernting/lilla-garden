import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { DEFAULT_STUN, TURN_TTL_S, iceProvider, parseCloudflareIce, turnRestCredential } from './ice.ts';

describe('ice servers', () => {
  it('is STUN only without any relay settings', async () => {
    const ice = iceProvider({});
    expect(await ice.servers()).toEqual([{ urls: DEFAULT_STUN }]);
    expect(ice.describe()).toContain('only');
    expect(await iceProvider({ STUN_URLS: 'stun:a:1, stun:b:2' }).servers()).toEqual([{ urls: ['stun:a:1', 'stun:b:2'] }]);
  });

  it('adds a relay with a fixed login', async () => {
    const got = await iceProvider({ TURN_URLS: 'turn:relay.example:3478?transport=udp,turns:relay.example:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }).servers();
    expect(got).toEqual([{ urls: DEFAULT_STUN }, { urls: ['turn:relay.example:3478?transport=udp', 'turns:relay.example:5349'], username: 'u', credential: 'p' }]);
  });

  it('makes coturn’s short-lived logins from a shared secret', async () => {
    const now = 1_700_000_000_000;
    const c = turnRestCredential('s3cret', now);
    expect(c.username).toBe(`${1_700_000_000 + TURN_TTL_S}:lilla`);
    expect(c.credential).toBe(crypto.createHmac('sha1', 's3cret').update(c.username).digest('base64'));
    const got = await iceProvider({ TURN_URLS: 'turn:r:3478', TURN_SECRET: 's3cret' }, { now: () => now }).servers();
    expect(got[1]).toEqual({ urls: ['turn:r:3478'], ...c });
  });

  it('fetches Cloudflare’s TURN logins, caches them and keeps the old ones when the API fails', async () => {
    let now = 1_700_000_000_000;
    const fetchMock = vi.fn(async (): Promise<Response> => new Response(JSON.stringify({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'], username: 'cfu', credential: 'cfp' }] }), { status: 200 }));
    const ice = iceProvider({ CLOUDFLARE_TURN_KEY_ID: 'key1', CLOUDFLARE_TURN_API_TOKEN: 'tok' }, { now: () => now, fetch: fetchMock as unknown as typeof fetch });
    const first = await ice.servers();
    expect(first).toEqual([{ urls: DEFAULT_STUN }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'], username: 'cfu', credential: 'cfp' }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key1/credentials/generate-ice-servers');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ ttl: TURN_TTL_S });
    await ice.servers();
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
    now += (TURN_TTL_S * 1000) / 2 + 1;
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await ice.servers()).toEqual(first); // the old logins, better than none
    err.mockRestore();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads both shapes of Cloudflare’s answer', () => {
    expect(parseCloudflareIce({ iceServers: { urls: ['turn:a'], username: 'u', credential: 'c' } })).toEqual([{ urls: ['turn:a'], username: 'u', credential: 'c' }]);
    expect(parseCloudflareIce({ iceServers: [{ urls: 'stun:a' }, { urls: [] }] })).toEqual([{ urls: ['stun:a'] }]);
    expect(parseCloudflareIce({})).toEqual([]);
  });
});
