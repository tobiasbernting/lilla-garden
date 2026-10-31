// The STUN/TURN servers handed to a device that becomes its room's speaker, from the environment:
//   STUN_URLS                     comma-separated, default Cloudflare's public STUN server
//   TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL   a relay with a fixed login
//   TURN_URLS + TURN_SECRET       a coturn with `use-auth-secret`: short-lived logins made here (HMAC-SHA1)
//   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN   Cloudflare's TURN service: short-lived logins fetched from
//                                 its API (fits the public farm, which has no open ports for a relay of its own)
// Most home networks manage with STUN alone; a relay is for the ones that don't (mobile data, strict NATs).
import crypto from 'node:crypto';
import type { IceServer } from '../../shared/src/index.ts';

export const DEFAULT_STUN = ['stun:stun.cloudflare.com:3478'];
/** How long a short-lived TURN login is good for (s). */
export const TURN_TTL_S = 12 * 3600;
/** Cloudflare's credential endpoint; `{key}` is the TURN key id. */
export const CLOUDFLARE_TURN_API = 'https://rtc.live.cloudflare.com/v1/turn/keys/{key}/credentials/generate-ice-servers';

export type IceEnv = Partial<Record<'STUN_URLS' | 'TURN_URLS' | 'TURN_USERNAME' | 'TURN_CREDENTIAL' | 'TURN_SECRET' | 'CLOUDFLARE_TURN_KEY_ID' | 'CLOUDFLARE_TURN_API_TOKEN', string>>;

const list = (s: string | undefined): string[] =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** coturn's REST API logins: `expiry:name` signed with the shared secret. */
export function turnRestCredential(secret: string, now: number, ttlS = TURN_TTL_S, name = 'lilla'): { username: string; credential: string } {
  const username = `${Math.floor(now / 1000) + ttlS}:${name}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

/** Picks the ICE servers out of Cloudflare's answer (one object in the older API, a list in the newer one). */
export function parseCloudflareIce(body: unknown): IceServer[] {
  const raw = (body as { iceServers?: unknown })?.iceServers;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: IceServer[] = [];
  for (const it of items as { urls?: unknown; username?: unknown; credential?: unknown }[]) {
    const urls = (Array.isArray(it.urls) ? it.urls : [it.urls]).filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (!urls.length) continue;
    const s: IceServer = { urls };
    if (typeof it.username === 'string') s.username = it.username;
    if (typeof it.credential === 'string') s.credential = it.credential;
    out.push(s);
  }
  return out;
}

export interface IceOptions {
  now?: () => number;
  fetch?: typeof fetch;
}

/** Builds the function that gives a speaker its ICE servers. Logs what it found once. */
export function iceProvider(env: IceEnv, opts: IceOptions = {}): { describe(): string; servers(): Promise<IceServer[]> } {
  const now = opts.now ?? Date.now;
  const doFetch = opts.fetch ?? fetch;
  const stun = list(env.STUN_URLS);
  const base: IceServer[] = [{ urls: stun.length ? stun : DEFAULT_STUN }];
  const turnUrls = list(env.TURN_URLS);
  const cfKey = env.CLOUDFLARE_TURN_KEY_ID;
  const cfToken = env.CLOUDFLARE_TURN_API_TOKEN;

  if (cfKey && cfToken) {
    let cached: { until: number; servers: IceServer[] } | null = null;
    const servers = async (): Promise<IceServer[]> => {
      const t = now();
      if (cached && cached.until > t) return [...base, ...cached.servers];
      try {
        const res = await doFetch(CLOUDFLARE_TURN_API.replace('{key}', encodeURIComponent(cfKey)), {
          method: 'POST',
          headers: { authorization: `Bearer ${cfToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ttl: TURN_TTL_S }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const got = parseCloudflareIce(await res.json());
        if (!got.length) throw new Error('no servers in the answer');
        // keep them a good while shorter than they last, so a call that starts late still has a valid login
        cached = { until: t + (TURN_TTL_S * 1000) / 2, servers: got };
        return [...base, ...got];
      } catch (e) {
        console.error('could not get TURN logins from Cloudflare:', e instanceof Error ? e.message : e);
        return cached ? [...base, ...cached.servers] : base;
      }
    };
    return { describe: () => `STUN ${base[0]!.urls.join(', ')} + Cloudflare TURN`, servers };
  }
  if (turnUrls.length && env.TURN_SECRET) {
    const secret = env.TURN_SECRET;
    return {
      describe: () => `STUN ${base[0]!.urls.join(', ')} + TURN ${turnUrls.join(', ')} (short-lived logins)`,
      servers: async () => [...base, { urls: turnUrls, ...turnRestCredential(secret, now()) }],
    };
  }
  if (turnUrls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    const fixed: IceServer = { urls: turnUrls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL };
    return { describe: () => `STUN ${base[0]!.urls.join(', ')} + TURN ${turnUrls.join(', ')}`, servers: async () => [...base, fixed] };
  }
  if (turnUrls.length) console.warn('TURN_URLS without TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL: ignored');
  return { describe: () => `STUN ${base[0]!.urls.join(', ')} only`, servers: async () => base };
}
