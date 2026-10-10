import type { Router } from 'express';
import { operationsQuerySchema } from '@pos/contracts';
import type { KitchenStationOption } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireKitchenPermission } from '../model/kitchen-authorization';
export function addKitchenStationOptionsRoute(router: Router) {
  router.get(
    '/kitchen/station-options',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = operationsQuerySchema.strict().parse(req.query);
      requireKitchenPermission(access, auth.user.id, query.locationId, 'kitchen.read');
      const cursor = query.cursor
        ? await tx.kitchenStation.findFirst({
            where: { id: query.cursor, locationId: query.locationId },
            select: { id: true, code: true },
          })
        : null;
      assert(
        !query.cursor || cursor,
        400,
        'Cursorul stațiilor nu este valid pentru această locație.',
      );
      const rows = await tx.$queryRaw<KitchenStationOption[]>`
      SELECT s.id,s.code,s.name,s.status FROM "KitchenStation" s
      WHERE s."organizationId"=${access.org.id}::uuid AND s."locationId"=${query.locationId}::uuid
        AND (${cursor?.id ?? null}::uuid IS NULL OR (s.code,s.id)>(${cursor?.code ?? null}::text,${cursor?.id ?? null}::uuid))
        AND (s.status='ACTIVE' OR EXISTS (
          SELECT 1 FROM "KitchenTicketBatch" b JOIN "KitchenTicket" t ON t.id=b."ticketId"
            AND t."organizationId"=b."organizationId" AND t."locationId"=b."locationId"
          JOIN "Order" o ON o.id=t."orderId" AND o."organizationId"=t."organizationId" AND o."locationId"=t."locationId"
          WHERE b."stationId"=s.id AND b."organizationId"=s."organizationId" AND b."locationId"=s."locationId"
            AND o.status IN ('OPEN','CONFIRMED','IN_PROGRESS','READY')
        )) ORDER BY s.code,s.id LIMIT ${query.limit + 1}`;
      return {
        stations: rows.slice(0, query.limit),
        nextCursor: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
      };
    }),
  );
}
