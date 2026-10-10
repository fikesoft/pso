import { z } from 'zod';
import { modifierSelectionsSchema, quantitySchema } from '../shared';

/** Base delivery body shared with local validation tools. Ingestion also requires expectedTotal. */
export const websiteDeliveryOrderSchema = z
  .object({
    schemaVersion: z.literal(1),
    externalOrderId: z.string().trim().min(1).max(100),
    externalLocationCode: z.string().trim().min(1).max(40),
    customer: z
      .object({
        name: z.string().trim().min(1).max(120),
        phone: z.string().trim().min(5).max(32),
      })
      .strict(),
    delivery: z
      .object({
        address: z.string().trim().min(1).max(500),
        instructions: z.string().trim().max(500).optional(),
      })
      .strict(),
    paymentMethod: z.literal('CASH_ON_DELIVERY'),
    items: z
      .array(
        z
          .object({
            externalProductId: z.string().trim().min(1).max(100),
            quantity: quantitySchema,
            note: z.string().trim().max(500).optional(),
            modifiers: modifierSelectionsSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
