import { z } from 'zod';
import { idSchema, moneySchema, positiveMoneySchema, versionSchema } from '../shared/validation';
export const billCollectionIdentitySchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
  })
  .strict();
export const billCollectionSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    cashShiftId: idSchema,
    confirmed: z.literal(true),
    amount: positiveMoneySchema,
    payment: z.discriminatedUnion('method', [
      z.object({ method: z.literal('CASH'), receivedAmount: moneySchema }).strict(),
      z.object({ method: z.literal('CARD') }).strict(),
    ]),
    sources: z
      .array(z.object({ orderId: idSchema, version: versionSchema }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) => new Set(value.sources.map((source) => source.orderId)).size === value.sources.length,
    'Comenzile trebuie să fie distincte.',
  );

export const billPartCommandIdentitySchema = billCollectionIdentitySchema.extend({
  partId: idSchema,
});
