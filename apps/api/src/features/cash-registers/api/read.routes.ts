import type { Router } from 'express';
import { cashRegisterQuerySchema, cashRegisterDetailSchema, idSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { registerResponse } from '../../../entities/cash-register';
import { assert } from '../../../shared/lib/http';
import { requireRegisterAccess } from '../model/register-access';
import { registerCursor, readRegisterCursor } from '../model/register-query';
export function addRegisterReadRoutes(router: Router) {
  router.get(
    '/cash-registers',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = cashRegisterQuerySchema.parse(req.query);
      requireRegisterAccess(access, auth.user.id, query.locationId, query.status !== 'ACTIVE');
      const context = {
        organizationId: access.org.id,
        actor: auth.user.id,
        locationId: query.locationId,
        status: query.status,
      };
      const after = query.cursor ? readRegisterCursor(context, query.cursor) : undefined;
      const rows = await tx.cashRegister.findMany({
        where: {
          locationId: query.locationId,
          ...(query.status === 'ALL' ? {} : { status: query.status }),
          ...(after
            ? { OR: [{ code: { gt: after.code } }, { code: after.code, id: { gt: after.id } }] }
            : {}),
        },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      return {
        registers: page.map(registerResponse),
        nextCursor: rows.length > query.limit ? registerCursor(context, page.at(-1)!) : null,
      };
    }),
  );
  router.get(
    '/cash-registers/:id',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = cashRegisterDetailSchema.parse(req.query);
      requireRegisterAccess(access, auth.user.id, query.locationId);
      const row = await tx.cashRegister.findFirst({
        where: { id: idSchema.parse(req.params.id), locationId: query.locationId },
      });
      assert(row, 404, 'Casa nu există');
      if (row.status === 'ARCHIVED')
        requireRegisterAccess(access, auth.user.id, query.locationId, true);
      return { register: registerResponse(row) };
    }),
  );
}
