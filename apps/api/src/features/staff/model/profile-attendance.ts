import type { TenantTransaction } from '@pos/db';
import { summarizeWorkShifts, workShiftDto } from '../../../entities/attendance';
import { assert } from '../../../shared/lib/http';
import type { ProfileScope } from './profile.types';

export async function profileAttendance(
  tx: TenantTransaction,
  organizationId: string,
  userId: string,
  scope: ProfileScope,
) {
  const now = new Date();
  const shifts = scope.locationIds.length
    ? await tx.workShift.findMany({
        where: {
          organizationId,
          userId,
          locationId: { in: scope.locationIds },
          startedAt: { lt: scope.end },
          OR: [{ endedAt: null }, { endedAt: { gt: scope.start } }],
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 5001,
      })
    : [];
  assert(
    shifts.length <= 5000,
    413,
    'Perioada produce prea multe ture. Alegeți un interval mai scurt.',
  );
  const breaks = shifts.length
    ? await tx.workBreak.findMany({ where: { shiftId: { in: shifts.map((shift) => shift.id) } } })
    : [];
  const entries = shifts.map((shift) => ({
    shift,
    breaks: breaks.filter((entry) => entry.shiftId === shift.id),
  }));
  const summary = summarizeWorkShifts(entries, {
    from: scope.start,
    to: scope.end,
    dayBoundaries: scope.dayBoundaries,
    now,
  });
  return {
    ...summary,
    recentShifts: entries
      .slice(0, 10)
      .map(({ shift, breaks: rows }) => workShiftDto(shift, rows, now)),
  };
}
