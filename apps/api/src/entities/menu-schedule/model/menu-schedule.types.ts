export interface LocalScheduleTime {
  date: string;
  previousDate: string;
  weekday: number;
  previousWeekday: number;
  minute: number;
}
import type { Prisma } from '@pos/db';

export type StoredMenuSchedule = Prisma.MenuScheduleGetPayload<Record<string, never>>;
