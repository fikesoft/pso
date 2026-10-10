export type WorkShiftRow = {
  id: string;
  userId: string;
  locationId: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  version: number;
  roleSnapshot: unknown;
};
export type WorkBreakRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
};
export type ShiftWithBreaks = { shift: WorkShiftRow; breaks: WorkBreakRow[] };
export type AttendanceRange = {
  from: Date;
  to: Date;
  dayBoundaries: Date[];
  now: Date;
};
export type DurationMillis = { gross: number; breaks: number; worked: number };
