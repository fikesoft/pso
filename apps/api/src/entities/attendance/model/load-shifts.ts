import type { TenantTransaction } from '@pos/db';
import type { ShiftWithBreaks, WorkShiftRow } from './attendance.types';

export async function loadWorkShiftEntries(
  tx: TenantTransaction,
  shifts: readonly WorkShiftRow[],
): Promise<ShiftWithBreaks[]> {
  if (shifts.length === 0) return [];
  const breaks = await tx.workBreak.findMany({
    where: { shiftId: { in: shifts.map((shift) => shift.id) } },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  });
  return shifts.map((shift) => ({
    shift,
    breaks: breaks.filter((entry) => entry.shiftId === shift.id),
  }));
}
