import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { MfaRaceFixture } from './api/mfa-race.types';
import {
  prepareMfaTarget,
  readMfaCredential,
  waitForBlockedMfa,
  withCredentialLock,
} from './api/mfa-race-support';
import { fixturePasswords, totp } from './api/support/harness';
import { verifyPlatformPasswordRace } from './api/password-race.cases';

let fixture: MfaRaceFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

for (const kind of ['TENANT', 'PLATFORM'] as const) {
  it(`${kind}: un cod vechi nu activează secretul înlocuit în timpul verificării`, async () => {
    const target = await prepareMfaTarget(fixture, kind);
    const crypto = await import('../apps/api/src/crypto');
    const replacement = crypto.newTotp('replacement').secret.base32;
    fixturePasswords.add(replacement);
    let response: ReturnType<typeof target.session.call> | undefined;
    await withCredentialLock(target, async (tx, pid) => {
      response = target.session.call('/auth/mfa/verify', 'POST', { code: totp(target.secret, -1) });
      await waitForBlockedMfa(target, pid);
      await tx.mfaCredential.update({
        where: { id: target.credentialId },
        data: { encryptedSecret: crypto.encrypt(replacement), status: 'PENDING' },
      });
    });
    expect((await response!).status).toBe(401);
    expect((await readMfaCredential(target)).status).toBe('PENDING');
    expect((await target.session.expect('/auth/session')).stage).toBe('enroll');
    expect(
      (await target.session.expect('/auth/mfa/verify', 'POST', { code: totp(replacement) })).stage,
    ).toBe('ready');
  });
  it(`${kind}: înrolarea întârziată nu resetează un MFA activat concurent`, async () => {
    const target = await prepareMfaTarget(fixture, kind);
    const initial = await readMfaCredential(target);
    let response: ReturnType<typeof target.session.call> | undefined;
    await withCredentialLock(target, async (tx, pid) => {
      response = target.session.call('/auth/mfa/enroll', 'POST', {});
      await waitForBlockedMfa(target, pid);
      await tx.mfaCredential.update({
        where: { id: target.credentialId },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      });
    });
    expect((await response!).status).toBe(409);
    const credential = await readMfaCredential(target);
    expect(credential.status).toBe('ACTIVE');
    expect(credential.encryptedSecret).toBe(initial.encryptedSecret);
  });
}
it('PLATFORM: schimbarea întârziată nu suprascrie o parolă deja schimbată', async () => {
  await verifyPlatformPasswordRace(fixture, 'password');
});
it('PLATFORM: sesiunea revocată în timpul verificării nu mai poate schimba parola', async () => {
  await verifyPlatformPasswordRace(fixture, 'session');
});
