import { describe, expect, it } from 'vitest';
import { Access, withinHours } from './access.ts';
import { MemoryAccessStore } from './db/accessStore.ts';
import { newTotpSecret, totpCode, verifyTotp } from './totp.ts';

const PW = 'correct horse battery';

const make = (now = { t: Date.UTC(2026, 9, 29, 12, 0) }) => {
  const access = new Access(new MemoryAccessStore(), { parentPassword: PW, now: () => now.t });
  return { access, now };
};

describe('Access', () => {
  it('refuses short parent passwords', () => {
    expect(() => new Access(new MemoryAccessStore(), { parentPassword: 'short' })).toThrow();
  });

  it('lets nobody in without an invite, and invited devices only after approval', async () => {
    const { access } = make();
    await access.setMode('open', 'ip');
    expect(access.gate(null)).toBe('unknown');
    expect(access.deviceFor('made-up')).toBeNull();

    const { token } = await access.createInvite({ label: 'Kusin Anna', kind: 'guest', hours: 24, newPlayers: 1 }, 'ip');
    const r = await access.redeem(token, 'Annas iPad', '1.2.3.4', 'ua');
    if ('error' in r) throw new Error(r.error);
    expect(access.gate(r.device)).toBe('pending');
    expect(access.deviceFor(r.token)).toBe(r.device);
    expect(r.device.code).toMatch(/^\d{6}$/);

    // the invite works once
    const again = await access.redeem(token, 'Någon annan', '5.6.7.8', 'ua');
    expect(again).toEqual({ error: 'invalid' });

    await access.approve(r.device.id, 'ip');
    expect(access.gate(r.device)).toBe('ok');
  });

  it('expires invites', async () => {
    const { access, now } = make();
    const { token } = await access.createInvite({ label: 'x', kind: 'guest', hours: 1, newPlayers: 1 }, 'ip');
    now.t += 2 * 3_600_000;
    expect(await access.redeem(token, 'y', 'ip', 'ua')).toEqual({ error: 'invalid' });
  });

  it('limits guessing invite links', async () => {
    const { access } = make();
    for (let i = 0; i < 10; i++) expect(await access.redeem(`guess${i}`, 'x', '9.9.9.9', 'ua')).toEqual({ error: 'invalid' });
    const { token } = await access.createInvite({ label: 'x', kind: 'guest', hours: 1, newPlayers: 1 }, 'ip');
    expect(await access.redeem(token, 'x', '9.9.9.9', 'ua')).toEqual({ error: 'limit' });
  });

  it('keeps guests to their own characters and to what the parent allows', async () => {
    const { access } = make();
    const { token } = await access.createInvite({ label: 'Gäst', kind: 'guest', hours: 24, newPlayers: 1 }, 'ip');
    const r = await access.redeem(token, 'Gästens platta', 'ip', 'ua');
    if ('error' in r) throw new Error(r.error);
    const d = r.device;
    expect(access.mayCreate(d)).toBe(false); // not approved yet
    await access.approve(d.id, 'ip');
    expect(access.gate(d)).toBe('guests-closed'); // the default mode is family only
    await access.setMode('open', 'ip');
    expect(access.mayCreate(d)).toBe(true);
    await access.created(d, 'p9', 'Gästen', 'ip');
    expect(access.mayCreate(d)).toBe(false);
    expect(access.mayPlay(d, 'p9')).toBe(true);
    expect(access.mayPlay(d, 'p1')).toBe(false);
    expect(access.visible(d, [{ id: 'p1' }, { id: 'p9' }])).toEqual([{ id: 'p9' }]);

    const fam = await access.addFamilyDevice('Barnens platta', 'ip', 'ua');
    expect(access.mayPlay(fam.device, 'p1')).toBe(true);

    await access.setPaused(d.id, true, 'ip');
    expect(access.gate(d)).toBe('paused');
    await access.setPaused(d.id, false, 'ip');
    await access.setMode('family', 'ip');
    expect(access.gate(d)).toBe('guests-closed');
    expect(access.gate(fam.device)).toBe('ok');
    await access.setMode('closed', 'ip');
    expect(access.gate(fam.device)).toBe('closed');
    await access.setMode('open', 'ip');

    await access.remove(d.id, 'ip');
    expect(access.deviceFor(r.token)).toBeNull();
    expect(access.gate(access.deviceFor(r.token))).toBe('unknown');
  });

  it('closes outside play hours (Swedish time)', async () => {
    // 12:00 UTC on 29 Oct 2026 is 13:00 in Stockholm (winter time)
    const { access, now } = make();
    const fam = await access.addFamilyDevice('x', 'ip', 'ua');
    expect(await access.setHours('08:00', null, 'ip')).toBe(false);
    expect(await access.setHours('08:00', '13:00', 'ip')).toBe(true);
    expect(access.gate(fam.device)).toBe('hours');
    now.t -= 60_000;
    expect(access.gate(fam.device)).toBe('ok');
    expect(withinHours('20:00', '02:00', Date.UTC(2026, 9, 29, 0, 30))).toBe(true); // 01:30
    expect(withinHours('20:00', '02:00', Date.UTC(2026, 9, 29, 12, 0))).toBe(false);
  });

  it('logs parents in with the password, limits attempts and asks for a code once two-step is on', async () => {
    const { access, now } = make();
    expect((await access.login('wrong password', '', 'a')).ok).toBe(false);
    const ok = await access.login(PW, '', 'a');
    if (!ok.ok) throw new Error('login');
    expect(access.session(ok.session)).not.toBeNull();
    now.t += 9 * 3_600_000;
    expect(access.session(ok.session)).toBeNull();

    for (let i = 0; i < 5; i++) await access.login('nope', '', 'b');
    expect(await access.login(PW, '', 'b')).toEqual({ ok: false, reason: 'limit' });

    const secret = newTotpSecret();
    await access.setTotp(secret, 'a');
    expect((await access.login(PW, '', 'c')).ok).toBe(false);
    const code = totpCode(secret, Math.floor(now.t / 30_000));
    expect((await access.login(PW, code, 'c')).ok).toBe(true);
    // the same code does not work twice
    expect((await access.login(PW, code, 'c')).ok).toBe(false);
    expect(access.log.some((e) => e.event === 'login-failed')).toBe(true);
  });
});

describe('totp', () => {
  it('matches the RFC 6238 test vector', () => {
    // secret "12345678901234567890" in base32, T = 59 s → 94287082 (8 digits) → 287082
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpCode(secret, 1)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000)).toBe(1);
    expect(verifyTotp(secret, '000000', 59_000)).toBeNull();
  });
});
