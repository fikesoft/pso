import type { z } from 'zod';
import type { KitchenStatus } from '../orders';
import type {
  fireKitchenCourseSchema,
  kitchenCourseSchema,
  kitchenFireTargetSchema,
  resolveKitchenCourseSchema,
} from './course.schema';

export type KitchenCourse = z.infer<typeof kitchenCourseSchema>;
export type KitchenFireTarget = z.infer<typeof kitchenFireTargetSchema>;
export type FireKitchenCourseInput = z.infer<typeof fireKitchenCourseSchema>;
export type ResolveKitchenCourseInput = z.infer<typeof resolveKitchenCourseSchema>;

export interface KitchenCourseBatchState {
  id: string;
  courseNumber: KitchenCourse;
  firedAt: string | null;
  status: KitchenStatus;
}

export interface KitchenCourseResult {
  ticketId: string;
  requestKey: string;
  course: KitchenFireTarget;
  expectedVersion: number;
  version: number;
  firedAt: string;
  batchIds: string[];
}

export type KitchenCourseResolution =
  | { status: 'SUCCEEDED'; command: ResolveKitchenCourseInput; result: KitchenCourseResult }
  | { status: 'RETIRED'; command: ResolveKitchenCourseInput };
