import type { Router } from 'express';
import { deliveryFeePreviewSchema, deliveryFeePreviewResponseSchema } from '@pos/contracts';
import { endpoint, scopeFor, visibleLocations } from '../../../entities/tenant-access';
import { calculateDeliveryFee, deliveryZoneResponse } from '../../../entities/delivery-zone';
import { assert } from '../../../shared/lib/http';
export function addDeliveryFeePreviewRoute(router: Router) {
  router.post(
    '/delivery-zones/fee-preview',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const body = deliveryFeePreviewSchema.parse(req.body);
        const location = visibleLocations(access, auth.user.id).find(
          (candidate) => candidate.id === body.locationId,
        );
        assert(location);
        const scope = scopeFor(access.org.id, {
          scopeType: 'LOCATION',
          locationId: body.locationId,
        });
        assert(
          access.service.canUse(auth.user.id, 'orders.create', { ...scope, amount: body.subtotal }),
        );
        const [clock] = await tx.$queryRaw<{ asOf: Date }[]>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
        const zones = await tx.deliveryZone.findMany({
          where: { organizationId: access.org.id, locationId: body.locationId },
        });
        const result = zones.length
          ? calculateDeliveryFee({
              zones: zones.map(deliveryZoneResponse),
              destination: body.destination,
              subtotal: body.subtotal,
              timezone: location.timezone,
              asOf: clock!.asOf,
            })
          : { status: 'NOT_CONFIGURED' as const };
        if (result.status === 'AVAILABLE')
          assert(
            access.service.canUse(auth.user.id, 'orders.create', {
              ...scope,
              amount: result.total,
            }),
          );
        return deliveryFeePreviewResponseSchema.parse({
          locationId: location.id,
          asOf: clock!.asOf.toISOString(),
          timezone: location.timezone,
          result,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
