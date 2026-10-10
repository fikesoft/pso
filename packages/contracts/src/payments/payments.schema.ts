import { z } from 'zod';
import { idSchema, moneySchema, positiveMoneySchema, versionSchema } from '../shared/validation';

const allocationSchema = z.discriminatedUnion('method', [
  z
    .object({ method: z.literal('CASH'), amount: positiveMoneySchema, receivedAmount: moneySchema })
    .strict(),
  z.object({ method: z.literal('CARD'), amount: positiveMoneySchema }).strict(),
]);
export const collectPaymentSchema = z
  .object({
    version: versionSchema,
    requestKey: idSchema,
    cashShiftId: idSchema.optional(),
    confirmed: z.literal(true),
    payments: z.array(allocationSchema).min(1).max(2),
  })
  .strict()
  .refine(
    (value) => new Set(value.payments.map((line) => line.method)).size === value.payments.length,
    'Folosiți o singură linie pentru fiecare metodă.',
  );
export const refundPaymentSchema = z
  .object({
    version: versionSchema,
    requestKey: idSchema,
    cashShiftId: idSchema.optional(),
    confirmed: z.literal(true),
    reason: z.string().trim().min(3).max(500),
    refunds: z
      .array(z.object({ paymentId: idSchema, amount: positiveMoneySchema }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) => new Set(value.refunds.map((line) => line.paymentId)).size === value.refunds.length,
    'Selectați fiecare plată originală o singură dată.',
  );
export const paymentQuerySchema = z.object({ cursor: idSchema.optional() }).strict();
