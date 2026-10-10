import { idSchema, menuSchedulesQuerySchema, menuAvailabilityQuerySchema } from '@pos/contracts';
import type { Router } from 'express';
import { menuScheduleResponses, loadScheduleAvailability } from '../../../entities/menu-schedule';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireMenuScheduleAccess } from '../model/menu-schedule-policy';

export function addMenuScheduleReadRoutes(router: Router) {
  router.get(
    '/catalog/menu-availability',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = menuAvailabilityQuerySchema.parse(req.query);
      const scope = scopeFor(access.org.id, {
        scopeType: 'LOCATION',
        locationId: query.locationId,
      });
      assert(
        ['catalog.read', 'catalog.manage', 'orders.create'].some((permission) =>
          access.service.canUse(auth.user.id, permission, scope),
        ),
      );
      const local = await tx.locationProduct.findMany({
        where: { locationId: query.locationId, productId: { in: query.productIds } },
      });
      const availability = await loadScheduleAvailability(
        tx,
        query.locationId,
        local.map((product) => product.productId),
      );
      return {
        products: [...availability].map(([productId, scheduleAvailability]) => ({
          productId,
          scheduleAvailability,
        })),
      };
    }),
  );
  router.get(
    '/catalog/menu-schedules',
    endpoint(async (tx, access, auth, req) => {
      const query = menuSchedulesQuerySchema.parse(req.query);
      requireMenuScheduleAccess(access, auth.user.id, query.locationId, query.includeArchived);
      const location = await tx.location.findUniqueOrThrow({ where: { id: query.locationId } });
      const schedules = await tx.menuSchedule.findMany({
        where: {
          locationId: query.locationId,
          ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return {
        schedules: await menuScheduleResponses(tx, schedules.slice(0, query.limit)),
        nextCursor: schedules.length > query.limit ? schedules[query.limit - 1]!.id : null,
        timezone: location.timezone,
      };
    }),
  );
  router.get(
    '/catalog/menu-schedules/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const schedule = await tx.menuSchedule.findUnique({ where: { id } });
      assert(schedule, 404, 'Programul nu există');
      requireMenuScheduleAccess(
        access,
        auth.user.id,
        schedule.locationId,
        schedule.status === 'ARCHIVED',
      );
      return { schedule: (await menuScheduleResponses(tx, [schedule]))[0]! };
    }),
  );
}
