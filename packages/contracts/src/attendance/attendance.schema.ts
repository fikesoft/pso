import { z } from 'zod';
import { businessDateSchema, businessTimestampSchema, idSchema } from '../shared';

const dateRangeSchema = z
  .object({ from: businessDateSchema, to: businessDateSchema })
  .refine(({ from, to }) => {
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    return days >= 0 && days <= 30;
  }, 'Selectați cel mult 31 de zile consecutive.');

export const attendanceCurrentQuerySchema = z.object({ locationId: idSchema }).strict();
export const attendanceStartSchema = z
  .object({ locationId: idSchema, requestKey: idSchema })
  .strict();
export const attendanceActionSchema = z
  .object({
    action: z.enum(['START_BREAK', 'END_BREAK', 'END_SHIFT']),
    version: z.number().int().positive(),
    requestKey: idSchema,
  })
  .strict();
export const attendanceShiftsQuerySchema = z
  .object({
    locationId: idSchema,
    userId: idSchema.optional(),
    from: businessTimestampSchema.optional(),
    to: businessTimestampSchema.optional(),
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || Date.parse(from) < Date.parse(to));
export const attendanceReportQuerySchema = dateRangeSchema
  .safeExtend({
    locationId: idSchema,
    userId: idSchema.optional(),
  })
  .strict();
export const attendanceRoleSnapshotSchema = z
  .object({
    isPrimaryAdmin: z.boolean(),
    assignments: z.array(
      z
        .object({
          assignmentId: idSchema,
          roleId: idSchema,
          roleVersionId: idSchema,
          roleName: z.string(),
          roleVersion: z.number().int().positive(),
          scopeType: z.enum(['ORGANIZATION', 'LOCATION']),
          locationId: idSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict();
