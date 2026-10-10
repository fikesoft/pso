import { activeOrdersSchema } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from '../model/order-authorization';
import { decodeActiveOrderCursor } from '../model/order-active-cursor';
import { activeOrderPage } from '../model/order-active-page';

export function addActiveOrdersRoute(router: Router) {
  router.get(
    '/orders/active',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = activeOrdersSchema.parse(req.query);
        requireOrderPermission(access, auth.user.id, query.locationId, 'orders.read');
        const location = await tx.location.findUnique({ where: { id: query.locationId } });
        assert(location, 404, 'Locația nu există');
        const context = {
          organizationId: access.org.id,
          locationId: query.locationId,
          userId: auth.user.id,
        };
        const page = await activeOrderPage(
          tx,
          access,
          context,
          query.limit,
          query.cursor ? decodeActiveOrderCursor(context, query.cursor) : undefined,
        );
        return { ...page, timezone: location.timezone };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
