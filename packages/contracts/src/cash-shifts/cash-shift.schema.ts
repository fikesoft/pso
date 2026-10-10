import { z } from 'zod';
import { idSchema, moneySchema, versionSchema } from '../shared/validation';
import { CASH_SHIFT_FILTERS, CASH_SHIFT_VIEWS } from './config/cash-shift.constants';
export const cashShiftListSchema = z
  .object({
    locationId: idSchema,
    view: z.enum(CASH_SHIFT_VIEWS).default('MINE'),
    status: z.enum(CASH_SHIFT_FILTERS).default('OPEN'),
    registerId: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const cashShiftDetailSchema = z.object({ locationId: idSchema }).strict();
export const cashShiftOpenSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    openingAmount: moneySchema,
  })
  .strict();
export const cashShiftCloseSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    version: versionSchema,
    countedCash: moneySchema,
    discrepancyReason: z.string().trim().min(3).max(500).optional(),
    managerReason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export const cashShiftResolutionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      locationId: idSchema,
      requestKey: idSchema,
      kind: z.literal('OPEN'),
      registerId: idSchema,
    })
    .strict(),
  z
    .object({
      locationId: idSchema,
      requestKey: idSchema,
      kind: z.literal('CLOSE'),
      shiftId: idSchema,
    })
    .strict(),
]);
export const paymentCommandResolutionSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    kind: z.enum(['COLLECT', 'REFUND']),
  })
  .strict();
export const manualCheckoutResolutionSchema = z
  .object({ locationId: idSchema, requestKey: idSchema })
  .strict();
