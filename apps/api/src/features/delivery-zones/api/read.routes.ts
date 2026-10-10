import type { Router } from 'express';
import { deliveryZoneListSchema, deliveryZoneListResponseSchema, idSchema } from '@pos/contracts';
import { z } from 'zod';
import { endpoint } from '../../../entities/tenant-access';
import { deliveryZoneResponse } from '../../../entities/delivery-zone';
import { assert, HttpError } from '../../../shared/lib/http';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { requireDeliveryZoneAccess } from '../model/delivery-zone-access';
import { DELIVERY_ZONE_CURSOR_DOMAIN } from '../config/delivery-zones.constants';
const detailQuery = z.object({ locationId: idSchema }).strict();
export function addDeliveryZoneReadRoutes(router: Router) {
  router.get(
    '/delivery-zones',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = deliveryZoneListSchema.parse(req.query);
        requireDeliveryZoneAccess(access, auth.user.id, query.locationId);
        const context = [access.org.id, auth.user.id, query.locationId, query.status];
        let after: string | undefined;
        if (query.cursor) {
          try {
            after = idSchema.parse(openJson(DELIVERY_ZONE_CURSOR_DOMAIN, context, query.cursor));
          } catch {
            throw new HttpError(400, 'Cursorul zonelor nu este valid pentru acest context.');
          }
        }
        const rows = await tx.deliveryZone.findMany({
          where: {
            organizationId: access.org.id,
            locationId: query.locationId,
            ...(query.status === 'ALL' ? {} : { status: query.status }),
            ...(after ? { id: { gt: after } } : {}),
          },
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        });
        const page = rows.slice(0, query.limit);
        return deliveryZoneListResponseSchema.parse({
          zones: page.map(deliveryZoneResponse),
          nextCursor:
            rows.length > query.limit
              ? sealJson(DELIVERY_ZONE_CURSOR_DOMAIN, context, page.at(-1)!.id)
              : null,
        });
      },
      { readOnly: true },
    ),
  );
  router.get(
    '/delivery-zones/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = idSchema.parse(req.params.id),
          query = detailQuery.parse(req.query);
        requireDeliveryZoneAccess(access, auth.user.id, query.locationId);
        const zone = await tx.deliveryZone.findFirst({
          where: { id, organizationId: access.org.id, locationId: query.locationId },
        });
        assert(zone, 404, 'Zona nu există.');
        return { zone: deliveryZoneResponse(zone) };
      },
      { readOnly: true },
    ),
  );
}
