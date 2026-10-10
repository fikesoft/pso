import { z } from 'zod';
import { idSchema, moneySchema, versionSchema } from '../shared/validation';

export const checkoutMoneySchema = moneySchema;
export const demoCheckoutSchema = z
  .object({ version: versionSchema, requestKey: idSchema })
  .strict();
export const manualCheckoutSchema = z.discriminatedUnion('method', [
  z
    .object({
      version: versionSchema,
      requestKey: idSchema,
      cashShiftId: idSchema.optional(),
      method: z.literal('CASH'),
      receivedAmount: checkoutMoneySchema,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      version: versionSchema,
      requestKey: idSchema,
      cashShiftId: idSchema.optional(),
      method: z.literal('CARD'),
      confirmed: z.literal(true),
    })
    .strict(),
]);
