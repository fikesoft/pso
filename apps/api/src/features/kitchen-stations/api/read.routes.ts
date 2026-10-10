import type { Router } from 'express';
import { kitchenStationListSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { stationResponse } from '../../../entities/kitchen-station';
import { requireStationAccess } from '../model/station-access';
import { stationCursor, readStationCursor } from '../model/station-query';
export function addStationReadRoutes(router: Router) {
  router.get(
    '/kitchen-stations',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = kitchenStationListSchema.parse(req.query);
      requireStationAccess(access, auth.user.id, query.locationId, query.status !== 'ACTIVE');
      const context = {
        organizationId: access.org.id,
        actor: auth.user.id,
        locationId: query.locationId,
        status: query.status,
      };
      const after = query.cursor ? readStationCursor(context, query.cursor) : undefined;
      const rows = await tx.kitchenStation.findMany({
        where: {
          locationId: query.locationId,
          status: query.status,
          ...(after
            ? {
                OR: [
                  { sortOrder: { gt: after.sortOrder } },
                  { sortOrder: after.sortOrder, code: { gt: after.code } },
                  { sortOrder: after.sortOrder, code: after.code, id: { gt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      return {
        stations: page.map(stationResponse),
        timezone:
          access.locations.find((location) => location.id === query.locationId)?.timezone ??
          access.org.timezone,
        nextCursor: rows.length > query.limit ? stationCursor(context, page.at(-1)!) : null,
      };
    }),
  );
}
