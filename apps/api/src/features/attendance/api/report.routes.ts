import { attendanceReportQuerySchema } from '@pos/contracts';
import { Router } from 'express';
import {
  loadWorkShiftEntries,
  localDayBoundaries,
  summarizeWorkShifts,
} from '../../../entities/attendance';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { attendanceLocation } from '../model/attendance-authorization';

export function attendanceReportRouter() {
  const router = Router();
  router.get(
    '/attendance/report',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = attendanceReportQuerySchema.parse(req.query);
      const location = attendanceLocation(
        access,
        query.locationId,
        auth.user.id,
        'attendance.read',
      );
      const eligible = access.users.filter(
        (user) =>
          user.id === auth.user.id || access.service.canManageUser(auth.user.id, user.id, 'read'),
      );
      if (query.userId)
        assert(
          eligible.some((user) => user.id === query.userId),
          404,
          'Utilizatorul nu există în aria administrată.',
        );
      const allowedIds = query.userId ? [query.userId] : eligible.map((user) => user.id);
      const now = new Date();
      const boundaries = await localDayBoundaries(tx, query.from, query.to, location.timezone);
      const range = {
        from: boundaries[0]!,
        to: boundaries.at(-1)!,
        dayBoundaries: boundaries,
        now,
      };
      const shifts =
        allowedIds.length === 0
          ? []
          : await tx.workShift.findMany({
              where: {
                organizationId: access.org.id,
                locationId: location.id,
                userId: { in: allowedIds },
                startedAt: { lt: range.to },
                OR: [{ endedAt: null }, { endedAt: { gt: range.from } }],
              },
              orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
              take: 5001,
            });
      assert(shifts.length <= 5000, 413, 'Perioada produce prea multe ture.');
      const entries = await loadWorkShiftEntries(tx, shifts);
      const usersWithShifts = query.userId
        ? [query.userId]
        : [...new Set(shifts.map((shift) => shift.userId))];
      const rows = usersWithShifts.map((userId) => ({
        userId,
        displayName: eligible.find((user) => user.id === userId)!.displayName,
        ...summarizeWorkShifts(
          entries.filter((entry) => entry.shift.userId === userId),
          range,
        ),
      }));
      return {
        timezone: location.timezone,
        from: query.from,
        to: query.to,
        rows,
        serverTime: now.toISOString(),
      };
    }),
  );
  return router;
}
