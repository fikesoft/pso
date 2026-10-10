import type { Router } from 'express';
import { addressManagementQuerySchema, idSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { sealJson, openJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { ADDRESS_BOOK_CURSOR_DOMAIN } from '../config/address-management.constants';
import { requireAddressAccess } from '../model/address-access';
import { managedAddressResponse } from '../model/address-management';
export function addAddressManagementReadRoute(router: Router) {
  router.get(
    '/customers/:customerId/address-book',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const customerId = idSchema.parse(req.params.customerId);
        const query = addressManagementQuerySchema.parse(req.query);
        await requireAddressAccess(tx, access, auth.user.id, customerId, query.locationId);
        const associated = [
          access.org.id,
          auth.user.id,
          query.locationId,
          customerId,
          query.status,
        ];
        let after: string | undefined;
        if (query.cursor) {
          try {
            const value = openJson(ADDRESS_BOOK_CURSOR_DOMAIN, associated, query.cursor) as {
              id?: unknown;
            };
            after = idSchema.parse(value.id);
          } catch {
            throw new HttpError(400, 'Cursorul adreselor nu este valid pentru acest context.');
          }
        }
        const rows = await tx.customerAddress.findMany({
          where: {
            customerId,
            ...(query.status === 'ALL' ? {} : { status: query.status }),
            ...(after ? { id: { gt: after } } : {}),
          },
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        });
        const page = rows.slice(0, query.limit);
        const preference = await tx.customerAddressPreference.findUniqueOrThrow({
          where: { customerId },
        });
        return {
          addresses: page.map(managedAddressResponse),
          preference: {
            customerId,
            version: preference.version,
            defaultAddressId: preference.defaultAddressId,
          },
          nextCursor:
            rows.length > query.limit
              ? sealJson(ADDRESS_BOOK_CURSOR_DOMAIN, associated, { id: page.at(-1)!.id })
              : null,
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
