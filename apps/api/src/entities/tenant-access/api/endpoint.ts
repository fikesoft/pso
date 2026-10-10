import type { Request, Response } from 'express';
import { runtime, withTenantTransaction } from '../../../shared/db';
import type { AuthRequest, TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import type { EndpointOptions, TenantHandler } from '../model/access.types';
import { loadAccess } from '../model/load-access';
export function endpoint(handler: TenantHandler, options: EndpointOptions = {}) {
  if (options.readOnlySnapshot && !options.readOnly)
    throw new Error('readOnlySnapshot requires readOnly');
  return async (req: Request, res: Response) => {
    const state = (req as AuthRequest).auth;
    assert(
      state?.kind === 'TENANT' && state.user.organizationId,
      401,
      'Identitatea companiei lipsește',
    );
    const auth = state as TenantAuthState;
    const result = await withTenantTransaction(
      runtime,
      { organizationId: auth.user.organizationId, userId: auth.user.id },
      async (tx) => {
        if (req.method !== 'GET' && !options.readOnly)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${auth.user.organizationId},0))`;
        const access = await loadAccess(tx, auth);
        return handler(tx, access, { ...auth, user: access.currentUser }, req, res);
      },
      { readOnlySnapshot: options.readOnlySnapshot },
    );
    if (!res.headersSent) res.json(result);
  };
}
