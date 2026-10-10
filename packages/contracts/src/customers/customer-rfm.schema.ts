import { z } from 'zod';
import { CUSTOMER_RFM_SEGMENTS } from './config/customer-rfm.constants';

const score = z.number().int().min(1).max(5);
export const customerRfmSchema = z
  .object({
    policyVersion: z.literal('RFM_V1'),
    recencyDays: z.number().int().nonnegative().nullable(),
    frequency: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    monetary: z
      .string()
      .regex(/^(0|[1-9]\d*)\.\d{2}$/)
      .max(80),
    scores: z.object({ recency: score, frequency: score, monetary: score }).strict().nullable(),
    segments: z.array(z.enum(CUSTOMER_RFM_SEGMENTS)).max(7),
  })
  .strict();
