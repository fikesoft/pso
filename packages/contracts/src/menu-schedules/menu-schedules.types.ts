export interface MenuScheduleWindow {
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  startsOn: string | null;
  endsOn: string | null;
}

export interface MenuSchedule extends MenuScheduleWindow {
  id: string;
  locationId: string;
  name: string;
  eventName: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  productIds: string[];
  products: { id: string; name: string }[];
}

export interface MenuSchedulesResponse {
  schedules: MenuSchedule[];
  nextCursor: string | null;
  timezone: string;
}

export interface MenuScheduleResponse {
  schedule: MenuSchedule;
}

export interface ProductScheduleAvailability {
  available: boolean;
  scheduled: boolean;
  checkedAt: string;
}

export interface MenuAvailabilityResponse {
  products: { productId: string; scheduleAvailability: ProductScheduleAvailability }[];
}
import type { z } from 'zod';
import type { createMenuScheduleSchema, updateMenuScheduleSchema } from './menu-schedules.schema';

export type CreateMenuSchedule = z.input<typeof createMenuScheduleSchema>;
export type UpdateMenuSchedule = z.input<typeof updateMenuScheduleSchema>;
