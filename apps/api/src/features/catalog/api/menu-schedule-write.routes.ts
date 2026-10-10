import { createMenuScheduleSchema, idSchema, updateMenuScheduleSchema } from '@pos/contracts';
import type { Router } from 'express';
import { menuScheduleResponses } from '../../../entities/menu-schedule';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import {
  requireMenuScheduleAccess,
  saveScheduleProducts,
  validateScheduleProducts,
} from '../model/menu-schedule-policy';

export function addMenuScheduleWriteRoutes(router: Router) {
  router.post(
    '/catalog/menu-schedules',
    endpoint(async (tx, access, auth, req) => {
      const input = createMenuScheduleSchema.parse(req.body);
      const body = {
        ...input,
        weekdays: [...input.weekdays].sort(),
        productIds: [...input.productIds].sort(),
      };
      requireMenuScheduleAccess(access, auth.user.id, body.locationId, true);
      const hash = requestHash(body);
      const previous = await tx.menuSchedule.findFirst({
        where: { locationId: body.locationId, requestKey: body.requestKey },
      });
      if (previous) {
        assert(
          previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alt program.',
        );
        return { schedule: (await menuScheduleResponses(tx, [previous]))[0]! };
      }
      await validateScheduleProducts(tx, body.locationId, body.productIds, true);
      const { productIds, startsOn, endsOn, ...metadata } = body;
      const schedule = await tx.menuSchedule.create({
        data: {
          ...metadata,
          organizationId: access.org.id,
          requestHash: hash,
          createdByUserId: auth.user.id,
          startsOn: startsOn ? new Date(`${startsOn}T00:00:00.000Z`) : null,
          endsOn: endsOn ? new Date(`${endsOn}T00:00:00.000Z`) : null,
        },
      });
      await saveScheduleProducts(tx, access.org.id, body.locationId, schedule.id, productIds);
      await audit(
        tx,
        auth,
        req,
        'catalog.menu_schedule.created',
        'MENU_SCHEDULE',
        schedule.id,
        body.locationId,
      );
      const updated = await tx.menuSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      return { schedule: (await menuScheduleResponses(tx, [updated]))[0]! };
    }),
  );
  router.patch(
    '/catalog/menu-schedules/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = updateMenuScheduleSchema.parse(req.body);
      const current = await tx.menuSchedule.findUnique({ where: { id } });
      assert(current, 404, 'Programul nu există');
      requireMenuScheduleAccess(access, auth.user.id, current.locationId, true);
      assert(current.version === body.version, 409, 'Programul a fost modificat. Reîncărcați.');
      await validateScheduleProducts(
        tx,
        current.locationId,
        body.productIds,
        body.status === 'ACTIVE',
        id,
      );
      const { version: _version, productIds, startsOn, endsOn, ...metadata } = body;
      await tx.menuSchedule.update({
        where: { id },
        data: {
          ...metadata,
          weekdays: [...metadata.weekdays].sort(),
          version: { increment: 1 },
          startsOn: startsOn ? new Date(`${startsOn}T00:00:00.000Z`) : null,
          endsOn: endsOn ? new Date(`${endsOn}T00:00:00.000Z`) : null,
        },
      });
      await saveScheduleProducts(tx, access.org.id, current.locationId, id, productIds);
      await audit(
        tx,
        auth,
        req,
        'catalog.menu_schedule.updated',
        'MENU_SCHEDULE',
        id,
        current.locationId,
      );
      const updated = await tx.menuSchedule.findUniqueOrThrow({ where: { id } });
      return { schedule: (await menuScheduleResponses(tx, [updated]))[0]! };
    }),
  );
}
