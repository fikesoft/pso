import type { TenantTransaction } from '@pos/db';
import type { AuthState } from '../../../entities/session';
import { assert } from '../../../shared/lib/http';

/** Serialize with credential resets and keep logout behind the authenticated mutation. */
export async function requireFreshPasswordAuth(tx: TenantTransaction, auth: AuthState) {
  if (auth.kind === 'TENANT') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${auth.user.organizationId},0))`;
    await tx.$queryRaw`SELECT id FROM "CompanyUser" WHERE id=${auth.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "TenantSession" WHERE id=${auth.session.id}::uuid FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM "PlatformAdmin" WHERE id=${auth.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PlatformSession" WHERE id=${auth.session.id}::uuid FOR UPDATE`;
  }
  const user =
    auth.kind === 'TENANT'
      ? await tx.companyUser.findUnique({ where: { id: auth.user.id } })
      : await tx.platformAdmin.findUnique({ where: { id: auth.user.id } });
  const session =
    auth.kind === 'TENANT'
      ? await tx.tenantSession.findFirst({ where: { id: auth.session.id, userId: auth.user.id } })
      : await tx.platformSession.findFirst({
          where: { id: auth.session.id, platformAdminId: auth.user.id },
        });
  const organization =
    auth.kind === 'TENANT'
      ? await tx.organization.findUnique({ where: { id: auth.user.organizationId } })
      : null;
  const now = new Date();
  assert(
    user &&
      user.status === 'ACTIVE' &&
      user.authVersion === auth.user.authVersion &&
      user.passwordHash === auth.user.passwordHash &&
      session &&
      !session.revokedAt &&
      session.authVersion === user.authVersion &&
      session.expiresAt > now &&
      session.idleExpiresAt > now &&
      (auth.kind !== 'TENANT' ||
        (organization?.status === 'ACTIVE' &&
          'authenticationMethod' in user &&
          user.authenticationMethod === 'PASSWORD' &&
          'authenticationMethod' in session &&
          session.authenticationMethod === 'PASSWORD')),
    401,
    'Sesiunea a fost revocată',
  );
  return user;
}

export async function requireFreshMfaAuth(tx: TenantTransaction, auth: AuthState) {
  const user = await requireFreshPasswordAuth(tx, auth);
  assert(!user.mustChangePassword, 403, 'Finalizați schimbarea parolei înainte de MFA');
}
