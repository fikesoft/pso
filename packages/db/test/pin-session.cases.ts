import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { PinAuthFixture } from './fixtures/pin-auth.types';

export async function runPinSessionTests(t: TestContext, state: PinAuthFixture) {
  const { txA, a, workerA, lookupSession, lookup, data } = state;
  const expiresAt = new Date(Date.now() + 60_000);
  const sessionData = {
    organizationId: a.organization.id,
    userId: workerA.id,
    authVersion: workerA.authVersion,
    policyVersion: 1,
    expiresAt,
    idleExpiresAt: expiresAt,
  };
  const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
  await t.test(
    'sesiunea validează metoda PIN/PASSWORD și refuză o metodă diferită de identitate',
    async () => {
      await assert.rejects(
        txA((tx) =>
          tx.tenantSession.create({
            data: { ...sessionData, tokenHash, authenticationMethod: 'UNKNOWN' },
          }),
        ),
      );
      const passwordSession = await txA((tx) =>
        tx.tenantSession.create({
          data: { ...sessionData, tokenHash },
        }),
      );
      assert.equal(passwordSession.authenticationMethod, 'PASSWORD');
      assert.equal((await lookupSession(tokenHash))[0]?.result, null);
      const primaryToken = createHash('sha256').update(randomUUID()).digest('hex');
      await txA((tx) =>
        tx.tenantSession.create({
          data: {
            ...sessionData,
            tokenHash: primaryToken,
            userId: a.user.id,
          },
        }),
      );
      assert.equal(
        (await lookupSession(primaryToken))[0]?.result?.session?.authenticationMethod,
        'PASSWORD',
      );
    },
  );
  const pinToken = createHash('sha256').update(randomUUID()).digest('hex');
  await txA((tx) =>
    tx.tenantSession.create({
      data: { ...sessionData, tokenHash: pinToken, authenticationMethod: 'PIN' },
    }),
  );
  await t.test(
    'schimbarea metodei retrage sesiunea PIN chiar dacă authVersion nu s-a schimbat',
    async () => {
      assert.equal(
        (await lookupSession(pinToken))[0]?.result?.session?.authenticationMethod,
        'PIN',
      );
      await txA((tx) =>
        tx.companyUser.update({
          where: { id: workerA.id },
          data: {
            authenticationMethod: 'PASSWORD',
            pinLookup: null,
            pinHash: null,
            mustChangePassword: true,
            mfaRequired: true,
          },
        }),
      );
      assert.equal((await lookupSession(pinToken))[0]?.result, null);
      assert.equal((await lookup(a.organization.slug))[0]?.result, null);
    },
  );
  await t.test(
    'revocarea versiunii de autentificare rămâne obligatorie la rotația PIN',
    async () => {
      await txA((tx) =>
        tx.companyUser.update({
          where: { id: workerA.id },
          data: {
            authenticationMethod: 'PIN',
            pinLookup: data.pinLookup,
            pinHash: data.pinHash,
            mustChangePassword: false,
            mfaRequired: false,
            authVersion: { increment: 1 },
          },
        }),
      );
      assert.equal((await lookupSession(pinToken))[0]?.result, null);
      assert.equal((await lookup(a.organization.slug))[0]?.result?.user.id, workerA.id);
    },
  );
}
