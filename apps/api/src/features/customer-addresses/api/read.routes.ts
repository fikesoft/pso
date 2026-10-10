import type { Router } from 'express';
import { customerAddressQuerySchema, idSchema } from '@pos/contracts';
import { customerAddressResponse } from '../../../entities/customer-address';
import { endpoint } from '../../../entities/tenant-access';
import { requireAddressAccess } from '../model/address-access';
import { addressCursor, readAddressCursor } from '../model/address-cursor';
import { assert } from '../../../shared/lib/http';
export function addAddressReadRoute(router: Router) {
  router.get(
    '/customers/:customerId/addresses',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId);
      const query = customerAddressQuerySchema.parse(req.query);
      await requireAddressAccess(tx, access, auth.user.id, customerId, query.locationId);
      const context = {
        organizationId: access.org.id,
        userId: auth.user.id,
        locationId: query.locationId,
        customerId,
      };
      const after = query.cursor ? readAddressCursor(context, query.cursor) : undefined;
      if (after)
        assert(
          await tx.customerAddress.findFirst({ where: { id: after, customerId } }),
          400,
          'Cursorul adreselor nu este valid',
        );
      const rows = await tx.customerAddress.findMany({
        where: { customerId, status: 'ACTIVE', ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      return {
        addresses: page.map(customerAddressResponse),
        nextCursor: rows.length > query.limit ? addressCursor(context, page.at(-1)!.id) : null,
      };
    }),
  );
}
