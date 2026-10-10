import { attendanceRoleSnapshotSchema } from '@pos/contracts';
import type { WorkShiftDto } from '@pos/contracts';
import type {
  AttendanceRange,
  DurationMillis,
  ShiftWithBreaks,
  WorkBreakRow,
  WorkShiftRow,
} from './attendance.types';

function overlap(start: number, end: number, from: number, to: number) {
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

export function durationMillis(
  shift: WorkShiftRow,
  breaks: readonly WorkBreakRow[],
  from: Date,
  to: Date,
  now: Date,
): DurationMillis {
  const effectiveEnd = shift.endedAt?.getTime() ?? now.getTime();
  const gross = overlap(shift.startedAt.getTime(), effectiveEnd, from.getTime(), to.getTime());
  const breakMillis = breaks.reduce(
    (total, entry) =>
      total +
      overlap(
        entry.startedAt.getTime(),
        entry.endedAt?.getTime() ?? now.getTime(),
        Math.max(from.getTime(), shift.startedAt.getTime()),
        Math.min(to.getTime(), effectiveEnd),
      ),
    0,
  );
  return { gross, breaks: Math.min(breakMillis, gross), worked: Math.max(0, gross - breakMillis) };
}

export function workShiftDto(
  shift: WorkShiftRow,
  breaks: readonly WorkBreakRow[],
  now: Date,
): WorkShiftDto {
  const duration = durationMillis(shift, breaks, shift.startedAt, shift.endedAt ?? now, now);
  return {
    id: shift.id,
    userId: shift.userId,
    locationId: shift.locationId,
    status: shift.status as WorkShiftDto['status'],
    startedAt: shift.startedAt.toISOString(),
    endedAt: shift.endedAt?.toISOString() ?? null,
    version: shift.version,
    breaks: breaks.map((entry) => ({
      id: entry.id,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
    })),
    workedSeconds: Math.floor(duration.worked / 1000),
    breakSeconds: Math.floor(duration.breaks / 1000),
    roleSnapshot:
      shift.roleSnapshot == null ? null : attendanceRoleSnapshotSchema.parse(shift.roleSnapshot),
  };
}

export function summarizeWorkShifts(entries: readonly ShiftWithBreaks[], range: AttendanceRange) {
  let worked = 0;
  let breaks = 0;
  let shiftCount = 0;
  const workedDays = new Set<number>();
  for (const entry of entries) {
    const total = durationMillis(entry.shift, entry.breaks, range.from, range.to, range.now);
    if (total.gross <= 0) continue;
    shiftCount += 1;
    worked += total.worked;
    breaks += total.breaks;
    for (let day = 0; day + 1 < range.dayBoundaries.length; day += 1) {
      const daily = durationMillis(
        entry.shift,
        entry.breaks,
        range.dayBoundaries[day]!,
        range.dayBoundaries[day + 1]!,
        range.now,
      );
      if (daily.worked > 0) workedDays.add(day);
    }
  }
  return {
    daysWorked: workedDays.size,
    workedSeconds: Math.floor(worked / 1000),
    breakSeconds: Math.floor(breaks / 1000),
    shiftCount,
  };
}
