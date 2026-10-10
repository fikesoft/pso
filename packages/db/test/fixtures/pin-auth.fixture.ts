import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createSecurityFixture } from './security.fixture';
import type { PinLookupResult } from './pin-auth.types';

export async function createPinAuthFixture() {
  const state = await createSecurityFixture();
  const pinLookup = createHmac('sha256', randomBytes(32)).update(randomUUID()).digest('hex');
  const data = {
    loginNormalized: `worker-pin-${state.suffix}`,
    displayName: 'Lucrător PIN sintetic',
    passwordHash: '$argon2id$synthetic-unusable-password-hash',
    authenticationMethod: 'PIN',
    pinLookup,
    pinHash: '$argon2id$synthetic-pin-database-fixture',
    mustChangePassword: false,
  };
  const workerA = await state.txA((tx) =>
    tx.companyUser.create({
      data: { ...data, organizationId: state.a.organization.id, createdByUserId: state.a.user.id },
    }),
  );
  const workerB = await state.txB((tx) =>
    tx.companyUser.create({
      data: { ...data, organizationId: state.b.organization.id, createdByUserId: state.b.user.id },
    }),
  );
  const lookup = (slug: string, digest: string = pinLookup) => state.auth.$queryRaw<
    PinLookupResult[]
  >`
    SELECT pos_auth.lookup_tenant_pin(${slug},${digest}) AS result`;
  const lookupSession = (tokenHash: string) => state.auth.$queryRaw<PinLookupResult[]>`
    SELECT pos_auth.lookup_tenant_session(${tokenHash}) AS result`;
  return { ...state, data, pinLookup, workerA, workerB, lookup, lookupSession };
}
