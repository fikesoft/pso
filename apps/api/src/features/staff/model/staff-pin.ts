import type { TenantTransaction } from '@pos/db';
import {
  generateStaffPin,
  hashPassword,
  staffPinLookup,
  temporaryPassword,
} from '../../../entities/session';
import { loadAuthorization } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

/** Called only within the tenant endpoint's organization lock and RLS transaction. */
export async function configureStaffPin(
  tx: TenantTransaction,
  organizationId: string,
  userId: string,
  requestedPin?: string,
) {
  const policy = await loadAuthorization(tx, organizationId);
  const target = policy.users.find((user) => user.id === userId);
  assert(target, 404, 'Utilizatorul nu există');
  assert(target.status === 'ACTIVE', 403, 'Activați utilizatorul înainte de emiterea unui PIN');
  assert(
    !target.isPrimaryAdmin && !target.mfaRequired && !policy.service.requiresMfa(userId),
    403,
    'Conturile administrative necesită parolă și MFA',
  );
  const pin = requestedPin ?? generateStaffPin();
  const pinLookup = staffPinLookup(policy.org.slug, pin);
  const duplicate = await tx.companyUser.findFirst({ where: { pinLookup, id: { not: userId } } });
  assert(!duplicate, 409, 'Codul PIN nu este disponibil. Alegeți alt cod.');
  const [pinHash, passwordHash] = await Promise.all([
    hashPassword(pin),
    hashPassword(temporaryPassword()),
  ]);
  const user = await tx.companyUser.update({
    where: { id: userId },
    data: {
      authenticationMethod: 'PIN',
      pinHash,
      pinLookup,
      passwordHash,
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      activatedAt: new Date(),
      authVersion: { increment: 1 },
      version: { increment: 1 },
    },
  });
  await tx.tenantSession.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
  return { pin, user };
}
