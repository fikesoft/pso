import type { PermissionEntry } from '@pos/authz';
import { getPermission } from '@pos/authz';
import type { Prisma, TenantTransaction } from '@pos/db';
import type { Request } from 'express';
import type { AuthRequest, TenantAuthState } from '../../../shared/lib/http';
export const moneyData = (p: PermissionEntry) => ({
  maxAmount: p.limits?.maxAmount ?? null,
  maxPercent: p.limits?.maxPercent ?? null,
});
const administrative = (key: string) => getPermission(key)?.privileged === true;
export async function audit(
  tx: TenantTransaction,
  auth: TenantAuthState,
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  locationId?: string | null,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.auditEvent.create({
    data: {
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      locationId,
      action,
      targetType,
      targetId,
      outcome: 'SUCCESS',
      requestId: (req as AuthRequest).requestId,
      metadata,
    },
  });
}
export async function policyChanged(tx: TenantTransaction, org: string, sessionId: string) {
  await tx.organization.update({ where: { id: org }, data: { policyVersion: { increment: 1 } } });
  await tx.tenantSession.updateMany({
    where: { id: { not: sessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
export async function requireMfa(
  tx: TenantTransaction,
  userId: string,
  permissions: readonly PermissionEntry[],
) {
  if (!permissions.some((p) => administrative(p.permission))) return;
  await requireAdministrativeAuthentication(tx, userId);
}

export async function requireAdministrativeAuthentication(tx: TenantTransaction, userId: string) {
  const user = await tx.companyUser.findUniqueOrThrow({ where: { id: userId } });
  await tx.companyUser.update({
    where: { id: userId },
    data: {
      mfaRequired: true,
      ...(user.authenticationMethod === 'PIN'
        ? {
            authenticationMethod: 'PASSWORD',
            pinHash: null,
            pinLookup: null,
            mustChangePassword: true,
            temporaryPasswordExpiresAt: null,
            authVersion: { increment: 1 },
            version: { increment: 1 },
          }
        : {}),
    },
  });
  if (user.authenticationMethod === 'PIN')
    await tx.tenantSession.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
}
