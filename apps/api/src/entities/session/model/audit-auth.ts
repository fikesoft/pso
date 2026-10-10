import type { Request } from 'express';
import { platformDb, runtime, withTenantTransaction } from '../../../shared/db';
import type { AuthRequest, AuthState } from './session.types';
import { tenantContext } from './tenant-context';
export async function auditRejection(req: Request, status: number, code: string) {
  const auth = (req as AuthRequest).auth;
  if (!auth) return;
  const data = {
    action: 'access.denied',
    targetType: 'API',
    outcome: 'DENIED',
    requestId: (req as AuthRequest).requestId,
    metadata: {
      status,
      code,
      method: req.method,
      route: typeof req.route?.path === 'string' ? req.route.path : 'unknown',
    },
  };
  if (auth.kind === 'TENANT')
    await withTenantTransaction(runtime, tenantContext(auth.user), (tx) =>
      tx.auditEvent.create({
        data: { ...data, organizationId: auth.user.organizationId, actorUserId: auth.user.id },
      }),
    );
  else
    await platformDb.auditEvent.create({ data: { ...data, actorPlatformAdminId: auth.user.id } });
}
export async function auditAuth(auth: AuthState, action: string, requestId: string) {
  const data = {
    action,
    targetType: 'USER',
    targetId: auth.user.id,
    outcome: 'SUCCESS',
    requestId,
    metadata: {},
  };
  if (auth.kind === 'TENANT')
    await withTenantTransaction(runtime, tenantContext(auth.user), (tx) =>
      tx.auditEvent.create({
        data: { ...data, organizationId: auth.user.organizationId, actorUserId: auth.user.id },
      }),
    );
  else
    await platformDb.auditEvent.create({ data: { ...data, actorPlatformAdminId: auth.user.id } });
}
