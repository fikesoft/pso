import type { Prisma } from '../../src';
import type { createAttendanceFixture } from './attendance.fixture';

export type AttendanceFixture = Awaited<ReturnType<typeof createAttendanceFixture>>;
export type AttendanceInput = Prisma.AttendanceEventUncheckedCreateInput;
export type AttendanceOverrides = Partial<AttendanceInput>;
