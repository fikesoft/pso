import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { versionSchema } from '../shared/model/operations.schema';
import { FIREABLE_KITCHEN_COURSES, KITCHEN_COURSES } from './config/course.constants';

export const kitchenCourseSchema = z.union(KITCHEN_COURSES.map((course) => z.literal(course)));
export const kitchenFireTargetSchema = z.union([
  ...FIREABLE_KITCHEN_COURSES.map((course) => z.literal(course)),
  z.literal('ALL'),
]);
export const fireKitchenCourseSchema = z
  .object({
    version: versionSchema,
    requestKey: idSchema,
    course: kitchenFireTargetSchema,
  })
  .strict();
export const resolveKitchenCourseSchema = z
  .object({ ticketId: idSchema, requestKey: idSchema })
  .strict();
