import type { WorkShiftDto } from '@pos/contracts';

export interface AttendanceHistoryProps {
  shifts: WorkShiftDto[];
  timezone?: string;
}
