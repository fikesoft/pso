import { kitchenArrivalQuerySchema } from '@pos/contracts';
import type { KitchenArrivalResponse } from '@pos/contracts';
import type { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireKitchenPermission } from '../model/kitchen-authorization';

export function addKitchenArrivalRoute(router: Router) {
  router.get(
    '/kitchen/arrivals',
    endpoint(async (tx, access, auth, req) => {
      const query = kitchenArrivalQuerySchema.parse(req.query);
      requireKitchenPermission(access, auth.user.id, query.locationId, 'kitchen.read');
      const stationId = query.stationId === 'UNASSIGNED' ? null : (query.stationId ?? null);
      if (stationId) {
        const station = await tx.kitchenStation.findFirst({
          where: { id: stationId, locationId: query.locationId },
          select: { id: true },
        });
        assert(station, 404, 'Stația nu există în această locație.');
      }
      // Count immutable history, not active cards or timestamp order: late commits must
      // advance the revision too, while cancellation, progress and paging must not.
      const [result] = await tx.$queryRaw<KitchenArrivalResponse[]>`
      SELECT count(*)::text AS revision FROM "KitchenTicket" t
      WHERE t."locationId"=${query.locationId}::uuid
        AND (${query.stationId === undefined}::boolean OR EXISTS (
          SELECT 1 FROM "KitchenTicketBatch" b
          WHERE b."organizationId"=t."organizationId" AND b."locationId"=t."locationId"
            AND b."ticketId"=t.id AND b."stationId" IS NOT DISTINCT FROM ${stationId}::uuid
        ))`;
      return { revision: result!.revision };
    }),
  );
}
