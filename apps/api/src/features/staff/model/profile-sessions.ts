import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import type { TenantAuthState } from '../../../shared/lib/http';

export async function profileSessions(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  userId: string,
) {
  if (
    userId !== auth.user.id &&
    !access.service.canManageUser(auth.user.id, userId, 'resetPassword')
  )
    return null;
  const now = new Date();
  const where = {
    organizationId: access.org.id,
    userId,
    revokedAt: null,
    expiresAt: { gt: now },
    idleExpiresAt: { gt: now },
  };
  const [count, latest, rows] = await Promise.all([
    tx.tenantSession.count({ where }),
    tx.tenantSession.findFirst({
      where: { organizationId: access.org.id, userId },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    tx.tenantSession.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        idleExpiresAt: true,
        authenticationMethod: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
  ]);
  return {
    count,
    lastLoginAt: latest?.createdAt.toISOString() ?? null,
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      idleExpiresAt: row.idleExpiresAt.toISOString(),
      authenticationMethod:
        row.authenticationMethod === 'PIN' ? ('PIN' as const) : ('PASSWORD' as const),
      current: row.id === auth.session.id,
    })),
  };
}
