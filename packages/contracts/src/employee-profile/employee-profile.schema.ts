import { z } from 'zod';
import { businessDateSchema, idSchema } from '../shared';

export const employeeDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Folosiți data AAAA-LL-ZZ.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data nu este validă.');

export const employeeProfileQuerySchema = z
  .object({
    locationId: idSchema.optional(),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .strict();
