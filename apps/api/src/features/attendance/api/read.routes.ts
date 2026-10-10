import type { Prisma } from '@pos/db';
import { attendanceCurrentQuerySchema, attendanceShiftsQuerySchema } from '@pos/contracts';
import { Router } from 'express';
import { loadWorkShiftEntries, workShiftDto } from '../../../entities/attendance';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { attendanceLocation, readableUser } from '../model/attendance-authorization';

export function attendanceReadRouter() {
  const router = Router();
  router.get(
    '/attendance/current',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const { locationId } = attendanceCurrentQuerySchema.parse(req.query);
      attendanceLocation(access, locationId, auth.user.id, 'attendance.clock');
      const now = new Date();
      const active = await tx.workShift.findFirst({
        where: { userId: auth.user.id, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      });
      if (
        !active ||
        !access.service.canUse(
          auth.user.id,
          'attendance.clock',
          scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: active.locationId }),
        )
      )
        return { shift: null, serverTime: now.toISOString() };
      const [entry] = await loadWorkShiftEntries(tx, [active]);
      return {
        shift: workShiftDto(entry!.shift, entry!.breaks, now),
        serverTime: now.toISOString(),
      };
    }),
  );
  router.get(
    '/attendance/shifts',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = attendanceShiftsQuerySchema.parse(req.query);
      const userId = query.userId ?? auth.user.id;
      readableUser(access, auth.user.id, userId, query.locationId);
      const where: Prisma.WorkShiftWhereInput = {
        organizationId: access.org.id,
        locationId: query.locationId,
        userId,
        ...(query.from
          ? { OR: [{ endedAt: null }, { endedAt: { gt: new Date(query.from) } }] }
          : {}),
        ...(query.to ? { startedAt: { lt: new Date(query.to) } } : {}),
      };
      if (query.cursor)
        assert(
          await tx.workShift.findFirst({ where: { ...where, id: query.cursor } }),
          400,
          'Cursorul nu aparține listei.',
        );
      const rows = await tx.workShift.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const entries = await loadWorkShiftEntries(tx, page);
      const now = new Date();
      return {
        shifts: entries.map((entry) => workShiftDto(entry.shift, entry.breaks, now)),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
        serverTime: now.toISOString(),
      };
    }),
  );
  return router;
}
